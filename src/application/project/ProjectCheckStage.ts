import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import type { AnalysisError } from "../../domain/analysisErrorBase.js";
import { AnalysisCancelledError } from "../../domain/analysisErrorCore.js";
import { digestCanonicalValue } from "../../domain/canonicalDigest.js";
import {
  EvidenceFileError,
  EvidenceIntegrityError,
} from "../../domain/evidenceErrors.js";
import type { ProjectCheckBinding } from "../../domain/projectCheckBinding.js";
import type { ProjectRunRecord } from "../../domain/projectRun.js";
import { projectRunCleanupIsSettled } from "../../domain/projectRunTransitions.js";
import { err, ok } from "../../domain/result.js";
import {
  ProjectCheckPublicationError,
  type ProjectCheckService,
  type StoredProjectCheck,
} from "./ProjectCheckService.js";
import {
  ProjectRunState,
  projectRunRemaining,
  projectRunTime,
  type ProjectRunContext,
  type ProjectRunResult,
} from "./ProjectRunState.js";

/** Run only a persisted pending check, independently of builder availability. */
export class ProjectCheckStage {
  constructor(
    private readonly checks: ProjectCheckService,
    private readonly state: ProjectRunState,
  ) {}

  /** Match the saved inputs before acquiring a child effect, then authenticate its report. */
  async run(
    context: ProjectRunContext,
    checkerPath: string,
    signal: AbortSignal,
  ): Promise<ProjectRunResult> {
    const started = performance.now();
    const guard = await this.state.guard(context);
    if (!guard.ok) return guard;
    const pending = context.execution.run.pending_check;
    if (pending === null)
      return err(new EvidenceIntegrityError("This run has no pending check"));
    const prepared = await this.checks.prepare(
      {
        project: context.project.revision.project,
        run_id: context.execution.run.run_id,
        checker_path: checkerPath,
      },
      signal,
    );
    if (!prepared.ok) return prepared;
    if (digestCanonicalValue(prepared.value) !== digestCanonicalValue(pending))
      return err(
        new EvidenceIntegrityError(
          "Saved check inputs changed; the candidate, scope or verifier must be requalified",
        ),
      );
    const begun = await this.state.append(context, {
      kind: "check_started",
      binding: pending,
      ...projectRunTime(context.execution.run, elapsedSince(started)),
    });
    if (!begun.ok) return begun;
    if (context.execution.run.execution_status !== "running")
      return ok(this.state.snapshot(context));
    const marked = await context.workspace.mark();
    if (!marked.ok)
      return this.state.fail(context, marked.error, "not_required");
    return this.#execute(context, { checkerPath, pending }, signal);
  }

  async #execute(
    context: ProjectRunContext,
    request: { checkerPath: string; pending: ProjectCheckBinding },
    signal: AbortSignal,
  ): Promise<ProjectRunResult> {
    const started = performance.now();
    const reports = join(context.project.directory, "checks");
    try {
      await mkdir(reports, { recursive: true });
    } catch (cause: unknown) {
      return this.state.fail(
        context,
        new EvidenceFileError("write", "io", { path: reports, cause }),
        "not_required",
        elapsedSince(started),
      );
    }
    const checked = await this.checks.run(
      {
        project: context.project.revision.project,
        run_id: context.execution.run.run_id,
        checker_path: request.checkerPath,
        report_path: join(reports, `${randomUUID()}.json`),
        timeout_ms: projectRunRemaining(context.execution.run),
        diagnostic_bytes: 4 * 1024 * 1024,
        expected_binding: request.pending,
      },
      signal,
    );
    if (!checked.ok && checked.error instanceof ProjectCheckPublicationError)
      context.unpublished_check = checked.error.report;
    if (!checked.ok)
      return this.#failure(context, checked.error, elapsedSince(started));
    const check = checked.value;
    context.check = check;
    if (signal.aborted || check.report.execution_failure_reason === "cancelled")
      return this.state.cancel(
        context,
        check.report.cleanup_status,
        elapsedSince(started),
        check,
      );
    if (!projectRunCleanupIsSettled(check.report.cleanup_status))
      return this.state.fail(
        context,
        new EvidenceIntegrityError(
          "Independent checker cleanup remains incomplete",
        ),
        "incomplete",
        elapsedSince(started),
      );
    if (check.report.execution_failure_reason !== null)
      return this.#stopped(context, check, elapsedSince(started));
    return this.#complete(context, { ...request, check, started }, signal);
  }

  async #complete(
    context: ProjectRunContext,
    completion: {
      checkerPath: string;
      pending: ProjectCheckBinding;
      check: StoredProjectCheck;
      started: number;
    },
    signal: AbortSignal,
  ): Promise<ProjectRunResult> {
    const { check, pending } = completion;
    const unchanged = await context.workspace.assertCurrent();
    if (!unchanged.ok)
      return this.state.fail(
        context,
        unchanged.error,
        "complete",
        elapsedSince(completion.started),
      );
    const authenticated = await this.checks.read(
      check,
      {
        project: context.project.revision.project,
        checker_path: completion.checkerPath,
      },
      signal,
    );
    if (!authenticated.ok)
      return this.#failure(
        context,
        authenticated.error,
        elapsedSince(completion.started),
        "complete",
      );
    if (signal.aborted)
      return this.state.cancel(
        context,
        check.report.cleanup_status,
        elapsedSince(completion.started),
        check,
      );
    if (authenticated.value.applicability !== "matched")
      return this.state.fail(
        context,
        new EvidenceIntegrityError(
          "Checker report became inapplicable before its run commit",
        ),
        "complete",
        elapsedSince(completion.started),
      );
    const completed = await this.state.append(
      context,
      {
        kind: "check_completed",
        binding: pending,
        check_id: check.check_id,
        outcome: check.outcome,
        cleanup_status:
          check.report.cleanup_status === "not_required"
            ? "not_required"
            : "complete",
        ...projectRunTime(
          context.execution.run,
          elapsedSince(completion.started),
        ),
      },
      {
        check_id: check.check_id,
        run_id: context.execution.run.run_id,
        scope_sha256: pending.scope_sha256,
        candidate_sha256: pending.candidate_sha256,
        checker_sha256: pending.checker_sha256,
        scenario_sha256: pending.scenario_sha256,
        environment_sha256: pending.environment_sha256,
        report_path: check.report_path,
        report_sha256: check.report_sha256,
        evidence_ids: [...check.evidence_ids],
      },
    );
    return completed.ok
      ? ok({ ...this.state.snapshot(context), check })
      : completed;
  }

  async #failure(
    context: ProjectRunContext,
    error: AnalysisError,
    elapsed: number,
    observedCleanup?: ProjectRunRecord["cleanup_status"],
  ): Promise<ProjectRunResult> {
    // run() only returns preflight errors or a publication error containing the
    // completed process report. Unexpected throws retain unknown ownership above.
    const cleanup = error.cleanupIncomplete
      ? "incomplete"
      : (observedCleanup ??
        (error instanceof ProjectCheckPublicationError
          ? error.report.cleanup_status
          : "not_required"));
    if (
      error instanceof AnalysisCancelledError ||
      (error instanceof ProjectCheckPublicationError &&
        error.report.execution_failure_reason === "cancelled")
    ) {
      const cancelled = await this.state.cancel(context, cleanup, elapsed);
      if (!cancelled.ok) error.retainSecondaryFailure(cancelled.error);
      return err(error);
    }
    return this.state.fail(context, error, cleanup, elapsed);
  }

  async #stopped(
    context: ProjectRunContext,
    check: StoredProjectCheck,
    elapsed: number,
  ): Promise<ProjectRunResult> {
    const timedOut = check.report.execution_failure_reason === "timeout";
    const stopped = await this.state.append(context, {
      kind: timedOut ? "pause" : "fail",
      reason: timedOut
        ? "budget_exhausted"
        : (check.report.execution_failure ??
          "Independent checker execution failed"),
      cleanup_status:
        check.report.cleanup_status === "not_required"
          ? "not_required"
          : "complete",
      ...projectRunTime(context.execution.run, elapsed),
    });
    return stopped.ok
      ? ok({ ...this.state.snapshot(context), check })
      : stopped;
  }
}

const elapsedSince = (started: number): number =>
  Math.ceil(performance.now() - started);

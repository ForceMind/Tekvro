import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { z } from "zod";

import type { ArtifactResourceScope } from "../../artifacts/ArtifactResourceScope.js";
import type { AnalysisError } from "../../domain/analysisErrorBase.js";
import {
  AnalysisCancelledError,
  AnalysisTimeoutError,
} from "../../domain/analysisErrorCore.js";
import { projectAnalysisError } from "../../domain/analysisErrorProjection.js";
import { projectBuilderResultSchema } from "../../domain/projectBuilder.js";
import { EvidenceIntegrityError } from "../../domain/evidenceErrors.js";
import type { ProjectCheckBinding } from "../../domain/projectCheckBinding.js";
import type { ProjectRunRecord } from "../../domain/projectRun.js";
import { projectRunCleanupIsSettled } from "../../domain/projectRunTransitions.js";
import { err, ok, type Result } from "../../domain/result.js";
import { writeTextParts } from "../JsonFiles.js";
import type { ProjectCheckService } from "./ProjectCheckService.js";
import {
  ProjectRunState,
  projectRunRemaining,
  projectRunTime,
  type ProjectRunContext,
  type ProjectRunResult,
} from "./ProjectRunState.js";
import type {
  ProjectBuilderPort,
  ProjectBuilderResult,
} from "./ProjectWorkflowPorts.js";

/** Execute a selected builder attempt and publish a durable pending-check boundary. */
export class ProjectBuildStage {
  constructor(
    private readonly resources: ArtifactResourceScope,
    private readonly builder: ProjectBuilderPort,
    private readonly checks: ProjectCheckService,
    private readonly state: ProjectRunState,
  ) {}

  /** Resume starts a new bounded attempt; it never silently resumes a provider session. */
  async run(
    context: ProjectRunContext,
    request: {
      instruction: string;
      checkerPath: string;
      kind: "start" | "resume" | "refine";
    },
    signal: AbortSignal,
  ): Promise<ProjectRunResult> {
    const started = performance.now();
    const guard = await this.state.guard(context);
    if (!guard.ok) return guard;
    const selected =
      context.prepared === undefined
        ? await this.checks.prepare(
            {
              project: context.project.revision.project,
              run_id: context.execution.run.run_id,
              checker_path: request.checkerPath,
            },
            signal,
          )
        : ok(context.prepared);
    if (!selected.ok) return selected;
    if (
      selected.value.candidate_sha256 !== context.execution.run.candidate_sha256
    )
      return err(
        new EvidenceIntegrityError(
          "Candidate changed since the saved run boundary; inspect and rebind a new run before building",
        ),
      );
    const begun = await this.state.append(context, {
      kind: request.kind,
      ...projectRunTime(context.execution.run, elapsedSince(started)),
    });
    if (!begun.ok) return begun;
    if (context.execution.run.execution_status !== "running")
      return ok(this.state.snapshot(context));
    const marked = await context.workspace.mark();
    if (!marked.ok)
      return this.state.fail(context, marked.error, "not_required");
    return this.#execute(context, request, selected.value, signal);
  }

  async #execute(
    context: ProjectRunContext,
    request: { instruction: string; checkerPath: string },
    selected: ProjectCheckBinding,
    signal: AbortSignal,
  ): Promise<ProjectRunResult> {
    const started = performance.now();
    let events = 0;
    if (signal.aborted)
      return this.state.cancel(context, "not_required", elapsedSince(started));
    const built = await this.builder.run(
      {
        run: context.execution.run,
        workspace: context.workspace.root,
        instruction: request.instruction,
        timeout_ms: projectRunRemaining(context.execution.run),
      },
      signal,
      async (event) => {
        const written = await writeTextParts(
          [`${JSON.stringify(event)}\n`],
          join(
            context.execution.directory,
            `attempt-${context.execution.run.attempt}-event-${++events}.json`,
          ),
          false,
          this.resources,
        );
        if (!written.ok) throw written.error;
      },
    );
    if (built.ok) context.builder_observation = built.value;
    const receipt = await writeTextParts(
      [
        `${JSON.stringify(built.ok ? { result: built.value } : { error: projectAnalysisError(built.error) })}\n`,
      ],
      join(
        context.execution.directory,
        `attempt-${context.execution.run.attempt}-builder.json`,
      ),
      false,
      this.resources,
    );
    if (receipt.ok) delete context.builder_observation;
    if (!built.ok) {
      if (!receipt.ok) built.error.retainSecondaryFailure(receipt.error);
      const cleanup = built.error.cleanupIncomplete
        ? "incomplete"
        : failureCleanup(built.error);
      if (
        built.error instanceof AnalysisTimeoutError &&
        projectRunCleanupIsSettled(cleanup)
      )
        return this.#pauseTimedOut(
          context,
          {
            error: built.error,
            checkerPath: request.checkerPath,
            selected,
            started,
            cleanup: cleanup === "not_required" ? "not_required" : "complete",
          },
          signal,
        );
      return this.#failure(context, built.error, elapsedSince(started));
    }
    if (!receipt.ok) {
      const stopped =
        built.value.status === "cancelled"
          ? await this.state.cancel(
              context,
              built.value.cleanup_status,
              elapsedSince(started),
            )
          : await this.state.fail(
              context,
              receipt.error,
              built.value.cleanup_status,
              elapsedSince(started),
            );
      if (!stopped.ok && stopped.error !== receipt.error)
        receipt.error.retainSecondaryFailure(stopped.error);
      return err(receipt.error);
    }
    if (
      built.value.status !== "completed" ||
      !projectRunCleanupIsSettled(built.value.cleanup_status)
    )
      return this.#stopped(context, built.value, elapsedSince(started));
    return this.#complete(
      context,
      {
        checkerPath: request.checkerPath,
        selected,
        result: built.value,
        started,
      },
      signal,
    );
  }

  async #complete(
    context: ProjectRunContext,
    completion: {
      checkerPath: string;
      selected: ProjectCheckBinding;
      result: ProjectBuilderResult;
      started: number;
    },
    signal: AbortSignal,
  ): Promise<ProjectRunResult> {
    if (signal.aborted)
      return this.state.cancel(
        context,
        "complete",
        elapsedSince(completion.started),
      );
    const prepared = await this.#observeBoundary(context, completion, signal);
    if (!prepared.ok)
      return this.#failure(
        context,
        prepared.error,
        elapsedSince(completion.started),
        "complete",
      );
    if (signal.aborted)
      return this.state.cancel(
        context,
        "complete",
        elapsedSince(completion.started),
      );
    const completed = await this.state.append(context, {
      kind: "build_completed",
      binding: prepared.value,
      observed_tokens: completion.result.observed_tokens,
      cleanup_status: "complete",
      ...projectRunTime(
        context.execution.run,
        elapsedSince(completion.started),
      ),
    });
    return completed.ok ? ok(this.state.snapshot(context)) : completed;
  }

  async #failure(
    context: ProjectRunContext,
    error: AnalysisError,
    elapsed: number,
    observedCleanup?: ProjectRunRecord["cleanup_status"],
  ): Promise<ProjectRunResult> {
    const cleanup = error.cleanupIncomplete
      ? "incomplete"
      : (observedCleanup ?? failureCleanup(error));
    if (error instanceof AnalysisCancelledError) {
      const cancelled = await this.state.cancel(context, cleanup, elapsed);
      if (!cancelled.ok) error.retainSecondaryFailure(cancelled.error);
      return err(error);
    }
    return this.state.fail(context, error, cleanup, elapsed);
  }

  async #observeBoundary(
    context: ProjectRunContext,
    reference: { checkerPath: string; selected: ProjectCheckBinding },
    signal: AbortSignal,
  ): Promise<Result<ProjectCheckBinding, AnalysisError>> {
    const workspace = await context.workspace.assertCurrent();
    if (!workspace.ok) return workspace;
    const prepared = await this.checks.prepare(
      {
        project: context.project.revision.project,
        run_id: context.execution.run.run_id,
        checker_path: reference.checkerPath,
      },
      signal,
    );
    if (!prepared.ok) return prepared;
    if (
      prepared.value.checker_sha256 !== reference.selected.checker_sha256 ||
      prepared.value.scenario_sha256 !== reference.selected.scenario_sha256 ||
      prepared.value.environment_sha256 !==
        reference.selected.environment_sha256
    )
      return err(
        new EvidenceIntegrityError(
          "Verifier inputs changed during the Builder attempt",
        ),
      );
    return prepared;
  }

  async #pauseTimedOut(
    context: ProjectRunContext,
    timeout: {
      error: AnalysisTimeoutError;
      checkerPath: string;
      selected: ProjectCheckBinding;
      started: number;
      cleanup: "complete" | "not_required";
    },
    signal: AbortSignal,
  ): Promise<ProjectRunResult> {
    const prepared = await this.#observeBoundary(context, timeout, signal);
    if (!prepared.ok) timeout.error.retainSecondaryFailure(prepared.error);
    if (signal.aborted) {
      const cancelled = await this.state.cancel(
        context,
        !prepared.ok && prepared.error.cleanupIncomplete
          ? "incomplete"
          : timeout.cleanup,
        elapsedSince(timeout.started),
      );
      if (!cancelled.ok) timeout.error.retainSecondaryFailure(cancelled.error);
      return err(timeout.error);
    }
    if (!prepared.ok)
      return this.state.fail(
        context,
        timeout.error,
        prepared.error.cleanupIncomplete ? "incomplete" : timeout.cleanup,
        elapsedSince(timeout.started),
      );
    const observation = projectBuilderResultSchema.safeParse(
      timeout.error.diagnostics?.builder_result,
    );
    const paused = await this.state.append(context, {
      kind: "build_paused",
      reason: "budget_exhausted",
      binding: prepared.value,
      observed_tokens: observation.success
        ? observation.data.observed_tokens
        : null,
      cleanup_status: timeout.cleanup,
      ...projectRunTime(context.execution.run, elapsedSince(timeout.started)),
    });
    if (!paused.ok) timeout.error.retainSecondaryFailure(paused.error);
    return err(timeout.error);
  }

  async #stopped(
    context: ProjectRunContext,
    result: ProjectBuilderResult,
    elapsed: number,
  ): Promise<ProjectRunResult> {
    if (result.status === "cancelled")
      return this.state.cancel(context, result.cleanup_status, elapsed);
    const stopped = await this.state.append(context, {
      kind: result.status === "interrupted" ? "interrupt" : "fail",
      reason: result.limitations.join("; ") || `Builder ${result.status}`,
      cleanup_status: result.cleanup_status,
      ...projectRunTime(context.execution.run, elapsed),
    });
    return stopped.ok ? ok(this.state.snapshot(context)) : stopped;
  }
}

const elapsedSince = (started: number): number =>
  Math.ceil(performance.now() - started);
const failureCleanup = (
  error: AnalysisError,
): ProjectRunRecord["cleanup_status"] => {
  const result = z
    .object({ cleanup_status: z.enum(["complete", "incomplete", "unknown"]) })
    .safeParse(error.diagnostics?.builder_result);
  return result.success ? result.data.cleanup_status : "unknown";
};

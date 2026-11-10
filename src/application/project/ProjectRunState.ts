import type { ArtifactResourceScope } from "../../artifacts/ArtifactResourceScope.js";
import type { AnalysisError } from "../../domain/analysisErrorBase.js";
import { digestCanonicalValue } from "../../domain/canonicalDigest.js";
import { EvidenceIntegrityError } from "../../domain/evidenceErrors.js";
import type { ProjectCheckBinding } from "../../domain/projectCheckBinding.js";
import type { ProjectCheckReport } from "../../domain/projectCheckReport.js";
import type { ProjectBuilderResult } from "../../domain/projectBuilder.js";
import type { ProjectExecutionSnapshot } from "../../domain/projectExecution.js";
import {
  projectRevisionToken,
  type ProjectCheckRef,
} from "../../domain/projectManifest.js";
import type {
  ProjectRunEvent,
  ProjectRunRecord,
} from "../../domain/projectRun.js";
import { projectRunCleanupIsSettled } from "../../domain/projectRunTransitions.js";
import { err, ok, type Result } from "../../domain/result.js";
import type { StoredProjectCheck } from "./ProjectCheckService.js";
import { ProjectRunStore, type StoredProjectRun } from "./ProjectRunStore.js";
import { ProjectStore, type StoredProject } from "./ProjectStore.js";
import type { ProjectWorkspace } from "./ProjectWorkspace.js";

/** Shared result for runtime operations and their persisted boundaries. */
export type ProjectRunResult = Result<ProjectExecutionSnapshot, AnalysisError>;

/** One acquired workspace and its last observed durable project/run revisions. */
export interface ProjectRunContext {
  project: StoredProject;
  execution: StoredProjectRun;
  check?: StoredProjectCheck;
  unpublished_check?: ProjectCheckReport;
  builder_observation?: ProjectBuilderResult;
  readonly workspace: ProjectWorkspace;
  readonly prepared?: ProjectCheckBinding;
}

/** Cumulative charged execution time never moves backwards with the wall clock. */
export const projectRunTime = (
  run: ProjectRunRecord,
  elapsed = 0,
): { at: string; elapsed_ms: number } => ({
  at: new Date(Math.max(Date.now(), Date.parse(run.updated_at))).toISOString(),
  elapsed_ms: run.elapsed_ms + elapsed,
});

/** The child deadline is the remainder of the persisted finite run budget. */
export const projectRunRemaining = (run: ProjectRunRecord): number =>
  Math.max(1, run.budget.wall_time_ms - run.elapsed_ms);

/** Run history is authoritative; project metadata is a recoverable projection. */
export class ProjectRunState {
  readonly projects: ProjectStore;
  readonly runs: ProjectRunStore;

  constructor(resources: ArtifactResourceScope) {
    this.projects = new ProjectStore(resources);
    this.runs = new ProjectRunStore(resources);
  }

  /** Repair a stale active summary from authenticated, cleaned run history before a new run. */
  async prepareProject(
    project: StoredProject,
    signal?: AbortSignal,
  ): Promise<Result<StoredProject, AnalysisError>> {
    const summary = project.revision.project;
    if (!["running", "cancelling"].includes(summary.execution_status))
      return ok(project);
    const runId = summary.run_ids.at(-1);
    if (runId === undefined)
      return err(
        new EvidenceIntegrityError(
          "Active project summary has no authoritative run identity",
        ),
      );
    const latest = await this.runs.read(project.directory, runId, signal);
    if (!latest.ok) return latest;
    const run = latest.value.run;
    if (
      ["running", "cancelling"].includes(run.execution_status) ||
      !projectRunCleanupIsSettled(run.cleanup_status)
    )
      return err(
        new EvidenceIntegrityError(
          "The previous project run is active or its cleanup is unknown; inspect that run before starting new work",
        ),
      );
    // Only lifecycle/candidate metadata is restored. Missing report references
    // are never invented, and this projection cannot grant global acceptance.
    return this.projects.recordRun(
      project.directory,
      projectRevisionToken(project.revision),
      run,
      signal === undefined ? {} : { signal },
    );
  }

  /** Read without adopting another project or executing an interrupted stage. */
  async read(
    directory: string,
    runId: string,
    signal?: AbortSignal,
  ): Promise<ProjectRunResult> {
    const project = await this.projects.read(directory, signal);
    if (!project.ok) return project;
    const run = await this.runs.read(project.value.directory, runId, signal);
    if (!run.ok) return run;
    if (
      run.value.run.project_token.project_id !==
      project.value.revision.project.project_id
    )
      return err(new EvidenceIntegrityError("Run belongs to another project"));
    return ok({
      project: project.value,
      execution: run.value,
      projection_status: projectionStatus(project.value, run.value),
    });
  }

  /** Expose a projection gap instead of treating metadata publication as a run rollback. */
  snapshot(
    context: Pick<
      ProjectRunContext,
      | "project"
      | "execution"
      | "check"
      | "unpublished_check"
      | "builder_observation"
    >,
  ): ProjectExecutionSnapshot {
    return {
      project: context.project,
      execution: context.execution,
      projection_status: projectionStatus(context.project, context.execution),
      ...(context.check === undefined ? {} : { check: context.check }),
      ...(context.unpublished_check === undefined
        ? {}
        : { unpublished_check: context.unpublished_check }),
      ...(context.builder_observation === undefined
        ? {}
        : { builder_observation: context.builder_observation }),
    };
  }

  /** Persist the event first, then update the project summary with its current CAS token. */
  async append(
    context: ProjectRunContext,
    event: ProjectRunEvent,
    check?: ProjectCheckRef,
  ): Promise<Result<void, AnalysisError>> {
    const written = await this.runs.append(
      context.project.directory,
      context.execution.token,
      event,
    );
    if (!written.ok) return written;
    context.execution = written.value;
    const current = await this.projects.read(context.project.directory);
    if (!current.ok)
      return this.#projectionFailed(context, event, current.error);
    const projected = await this.projects.recordRun(
      context.project.directory,
      projectRevisionToken(current.value.revision),
      written.value.run,
      { check },
    );
    if (!projected.ok)
      return this.#projectionFailed(context, event, projected.error);
    context.project = projected.value;
    return ok(undefined);
  }

  /** Stop a failed stage while preserving the original failure and any publication error. */
  async fail(
    context: ProjectRunContext,
    error: AnalysisError,
    cleanup: ProjectRunRecord["cleanup_status"],
    elapsed = 0,
  ): Promise<ProjectRunResult> {
    const failed = await this.append(context, {
      kind: "fail",
      reason: error.message,
      cleanup_status: error.cleanupIncomplete ? "incomplete" : cleanup,
      ...projectRunTime(context.execution.run, elapsed),
    });
    if (!failed.ok) error.retainSecondaryFailure(failed.error);
    return err(error);
  }

  /** Finish an observed cancellation even when the intermediate project projection failed. */
  async cancel(
    context: ProjectRunContext,
    cleanup: ProjectRunRecord["cleanup_status"],
    elapsed = 0,
    check?: StoredProjectCheck,
  ): Promise<ProjectRunResult> {
    const requested = await this.append(context, {
      kind: "cancel_requested",
      ...projectRunTime(context.execution.run, elapsed),
    });
    // A failed projection may follow a successful authoritative event. Only the
    // actual recorded state determines whether its cancellation can be finalized.
    if (context.execution.run.execution_status !== "cancelling")
      return requested.ok ? ok(this.snapshot(context)) : requested;
    const cancelled = await this.append(context, {
      kind: "cancelled",
      cleanup_status: cleanup,
      ...projectRunTime(context.execution.run),
    });
    if (!requested.ok) {
      if (!cancelled.ok)
        requested.error.retainSecondaryFailure(cancelled.error);
      return requested;
    }
    return cancelled.ok
      ? ok({
          ...this.snapshot(context),
          ...(check === undefined ? {} : { check }),
        })
      : cancelled;
  }

  /** Check scope and active-run identity before any lifecycle write or child effect. */
  async guard(
    context: ProjectRunContext,
  ): Promise<Result<void, AnalysisError>> {
    const project = context.project.revision.project;
    const run = context.execution.run;
    if (
      project.scope_revision !== run.scope_revision ||
      project.scope_sha256 !== run.scope_sha256 ||
      project.scope.target.sha256 !== run.source_sha256 ||
      digestCanonicalValue(project.scope.requirements) !==
        run.requirements_sha256
    )
      return err(
        new EvidenceIntegrityError(
          "The saved run belongs to an earlier project scope; create a run for the current scope",
        ),
      );
    if (
      ["running", "cancelling"].includes(project.execution_status) &&
      project.run_ids.at(-1) !== run.run_id
    )
      return err(
        new EvidenceIntegrityError("Another run is active for this project"),
      );
    return context.workspace.assertCurrent();
  }

  async #projectionFailed(
    context: ProjectRunContext,
    event: ProjectRunEvent,
    error: AnalysisError,
  ): Promise<Result<void, AnalysisError>> {
    if (
      ["start", "resume", "refine", "check_started"].includes(event.kind) &&
      context.execution.run.execution_status === "running"
    ) {
      // No process is launched until append returns successfully. Persist that
      // known fact even if reading or writing the project projection failed.
      const paused = await this.runs.append(
        context.project.directory,
        context.execution.token,
        {
          kind: "pause",
          reason: "project_projection_failed_before_execution",
          cleanup_status: "not_required",
          ...projectRunTime(context.execution.run),
        },
      );
      if (paused.ok) context.execution = paused.value;
      else error.retainSecondaryFailure(paused.error);
    }
    return err(error);
  }
}

const projectionStatus = (
  project: StoredProject,
  execution: StoredProjectRun,
): "current" | "outdated" => {
  const summary = project.revision.project;
  const run = execution.run;
  return summary.run_ids.at(-1) === run.run_id &&
    summary.phase === run.phase &&
    summary.execution_status === run.execution_status &&
    summary.candidate_sha256 === run.candidate_sha256 &&
    summary.acceptance_status === run.acceptance_status &&
    summary.scope_revision === run.scope_revision &&
    summary.scope_sha256 === run.scope_sha256
    ? "current"
    : "outdated";
};

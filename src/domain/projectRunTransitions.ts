import { AnalysisInputError } from "./analysisErrorCore.js";
import { digestCanonicalValue } from "./canonicalDigest.js";
import type { ProjectCheckBinding } from "./projectCheckBinding.js";
import type { ProjectRunEvent, ProjectRunRecord } from "./projectRun.js";
import { err, ok, type Result } from "./result.js";

type RunResult = Result<ProjectRunRecord, AnalysisInputError>;
type Event<Kind extends ProjectRunEvent["kind"]> = Extract<
  ProjectRunEvent,
  { kind: Kind }
>;
type RunIdentity = Pick<
  ProjectCheckBinding,
  | "run_id"
  | "source_sha256"
  | "scope_revision"
  | "scope_sha256"
  | "requirements_sha256"
> & { project_token: { project_id: string } };

/** Exact observed cleanup is required before any next executable stage. */
export const projectRunCleanupIsSettled = (status: unknown): boolean =>
  status === "complete" || status === "not_required";

/** Fixed input identity survives later naming edits and scope changes. */
export const projectCheckBindsRun = (
  binding: ProjectCheckBinding,
  run: RunIdentity,
): boolean =>
  binding.project_id === run.project_token.project_id &&
  binding.run_id === run.run_id &&
  binding.source_sha256 === run.source_sha256 &&
  binding.scope_revision === run.scope_revision &&
  binding.scope_sha256 === run.scope_sha256 &&
  binding.requirements_sha256 === run.requirements_sha256;

/** A rejected event is an input failure, not a fabricated runtime result. */
export const projectRunTransitionFailure = (
  message: string,
): Result<never, AnalysisInputError> =>
  err(
    new AnalysisInputError("transition_project_run", { userMessage: message }, [
      { path: ["event"], reason: "invalid_value", message },
    ]),
  );

/** Apply an already validated event; the public boundary revalidates the resulting record. */
export const applyProjectRunEvent = (
  run: ProjectRunRecord,
  event: ProjectRunEvent,
): RunResult => {
  switch (event.kind) {
    case "start":
    case "resume":
    case "refine":
      return startBuilder(run, event);
    case "build_completed":
      return finishBuilder(run, event);
    case "check_started":
      return startCheck(run, event);
    case "check_completed":
      return finishCheck(run, event);
    default:
      return controlRun(run, event);
  }
};

const startBuilder = (
  run: ProjectRunRecord,
  event: Event<"start" | "resume" | "refine">,
): RunResult => {
  if (
    (event.kind === "start" && run.execution_status !== "idle") ||
    (event.kind === "resume" && run.execution_status !== "paused") ||
    (event.kind === "refine" &&
      (run.execution_status !== "succeeded" || run.last_check_status === null))
  )
    return projectRunTransitionFailure(
      "This operation cannot restart the recorded execution state",
    );
  if (!projectRunCleanupIsSettled(run.cleanup_status))
    return projectRunTransitionFailure(
      "Prior resource cleanup must be verified before execution",
    );
  if (run.pending_check !== null)
    return projectRunTransitionFailure(
      "A pending check must use check_started, without rerunning the builder",
    );
  const next =
    event.kind === "refine" ? { ...run, phase: "refine" as const } : run;
  if (!isBuilderPhase(next.phase) || next.adapter === null)
    return projectRunTransitionFailure(
      "This executor requires a selected builder in build or refine phase",
    );
  const reason = executionBlockReason(next, true);
  return ok(
    reason !== null
      ? paused(next, reason)
      : {
          ...next,
          execution_status: "running",
          attempt: next.attempt + 1,
          stop_reason: null,
          cleanup_status: "unknown",
        },
  );
};

const finishBuilder = (
  run: ProjectRunRecord,
  event: Event<"build_completed">,
): RunResult => {
  if (run.execution_status !== "running" || !isBuilderPhase(run.phase))
    return projectRunTransitionFailure(
      "A build result requires a running builder stage",
    );
  const binding = event.binding;
  if (!projectCheckBindsRun(binding, run))
    return projectRunTransitionFailure(
      "Build check binding belongs to a different run or requirement revision",
    );
  const next: ProjectRunRecord = {
    ...run,
    phase: "check",
    execution_status: "paused",
    acceptance_status: "not_evaluated",
    candidate_sha256: binding.candidate_sha256,
    pending_check: binding,
    no_progress_attempts:
      binding.candidate_sha256 === run.candidate_sha256
        ? run.no_progress_attempts + 1
        : 0,
    observed_tokens:
      event.observed_tokens === null ||
      (run.attempt > 1 && run.observed_tokens === null)
        ? null
        : (run.observed_tokens ?? 0) + event.observed_tokens,
    stop_reason: "pending_check",
    cleanup_status: event.cleanup_status,
  };
  if (next.elapsed_ms >= next.budget.wall_time_ms)
    next.stop_reason = "budget_exhausted";
  else if (next.no_progress_attempts >= next.budget.max_no_progress_attempts)
    next.stop_reason = "no_progress";
  return ok(next);
};

const startCheck = (
  run: ProjectRunRecord,
  event: Event<"check_started">,
): RunResult => {
  if (
    run.execution_status !== "paused" ||
    run.phase !== "check" ||
    run.pending_check === null ||
    !projectRunCleanupIsSettled(run.cleanup_status)
  )
    return projectRunTransitionFailure(
      "A check must start from its saved, cleaned pending-check boundary",
    );
  if (!sameBinding(event.binding, run.pending_check))
    return projectRunTransitionFailure(
      "Check start does not match the saved candidate and checker binding",
    );
  const reason = executionBlockReason(run, false);
  return ok(
    reason !== null
      ? paused(run, reason)
      : {
          ...run,
          execution_status: "running",
          cleanup_status: "unknown",
          stop_reason: null,
        },
  );
};

const finishCheck = (
  run: ProjectRunRecord,
  event: Event<"check_completed">,
): RunResult => {
  if (
    run.execution_status !== "running" ||
    run.phase !== "check" ||
    run.pending_check === null
  )
    return projectRunTransitionFailure(
      "A check result requires the matching running check",
    );
  if (!sameBinding(event.binding, run.pending_check))
    return projectRunTransitionFailure(
      "Check result does not match the saved candidate and checker binding",
    );
  if (run.check_ids.includes(event.check_id))
    return projectRunTransitionFailure(
      "This check result has already been committed",
    );
  return ok({
    ...run,
    execution_status: "succeeded",
    acceptance_status: "unknown",
    pending_check: null,
    check_ids: [...run.check_ids, event.check_id],
    last_check_status: event.outcome,
    stop_reason: null,
    cleanup_status: event.cleanup_status,
  });
};

const controlRun = (
  run: ProjectRunRecord,
  event: Event<
    | "pause"
    | "cancel_requested"
    | "cancelled"
    | "interrupt"
    | "fail"
    | "set_budget"
  >,
): RunResult => {
  switch (event.kind) {
    case "pause":
      if (!["idle", "running", "paused"].includes(run.execution_status))
        return projectRunTransitionFailure(
          "This execution state cannot be paused",
        );
      return ok({
        ...paused(run, event.reason),
        observed_tokens:
          run.execution_status === "running" && isBuilderPhase(run.phase)
            ? null
            : run.observed_tokens,
        cleanup_status: event.cleanup_status,
      });
    case "cancel_requested":
      if (!["idle", "running", "paused"].includes(run.execution_status))
        return projectRunTransitionFailure(
          "This execution state cannot begin cancellation",
        );
      return ok({
        ...run,
        execution_status: "cancelling",
        stop_reason: "cancel_requested",
      });
    case "cancelled":
      if (run.execution_status !== "cancelling")
        return projectRunTransitionFailure(
          "A cancellation result requires a recorded cancellation request",
        );
      return ok({
        ...run,
        execution_status: "cancelled",
        stop_reason: "cancelled",
        observed_tokens: isBuilderPhase(run.phase) ? null : run.observed_tokens,
        cleanup_status: event.cleanup_status,
      });
    case "interrupt":
    case "fail":
      return stopFailedRun(run, event);
    case "set_budget":
      if (!["idle", "paused"].includes(run.execution_status))
        return projectRunTransitionFailure(
          "Change the budget only at an idle or paused boundary",
        );
      return ok({
        ...run,
        budget: event.budget,
        budget_revision: run.budget_revision + 1,
        budget_change_reason: event.reason,
      });
  }
};

const stopFailedRun = (
  run: ProjectRunRecord,
  event: Event<"interrupt" | "fail">,
): RunResult => {
  if (!["idle", "running", "cancelling"].includes(run.execution_status))
    return projectRunTransitionFailure(
      "A terminal or paused execution cannot be replaced by this event",
    );
  return ok({
    ...run,
    execution_status: event.kind === "interrupt" ? "interrupted" : "failed",
    acceptance_status: "unknown",
    observed_tokens: isBuilderPhase(run.phase) ? null : run.observed_tokens,
    stop_reason: event.reason,
    cleanup_status: event.cleanup_status,
  });
};

const isBuilderPhase = (phase: ProjectRunRecord["phase"]): boolean =>
  phase === "build" || phase === "refine";

const paused = (run: ProjectRunRecord, reason: string): ProjectRunRecord => ({
  ...run,
  execution_status: "paused",
  stop_reason: reason,
});

const executionBlockReason = (
  run: ProjectRunRecord,
  builder: boolean,
): string | null => {
  if (run.elapsed_ms >= run.budget.wall_time_ms) return "budget_exhausted";
  if (builder && run.attempt >= run.budget.max_attempts)
    return "budget_exhausted";
  if (
    builder &&
    run.no_progress_attempts >= run.budget.max_no_progress_attempts
  )
    return "no_progress";
  return null;
};

const sameBinding = (
  left: ProjectCheckBinding,
  right: ProjectCheckBinding,
): boolean => digestCanonicalValue(left) === digestCanonicalValue(right);

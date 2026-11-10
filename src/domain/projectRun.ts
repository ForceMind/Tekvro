import { z } from "zod";

import type { AnalysisInputError } from "./analysisErrorCore.js";
import { digestCanonicalValue } from "./canonicalDigest.js";
import { digestSchema } from "./digests.js";
import { analysisInputErrorFromIssues } from "./inputIssueProjection.js";
import { nulFreeStringSchema } from "./localPath.js";
import { offsetDateTimeSchema } from "./offsetDateTime.js";
import { projectCheckBindingSchema } from "./projectCheckBinding.js";
import {
  projectAcceptanceStatusSchema,
  projectExecutionStatusSchema,
  projectManifestSchema,
  projectRevisionSchema,
  projectRevisionToken,
  projectTokenSchema,
} from "./projectManifest.js";
import {
  applyProjectRunEvent,
  projectCheckBindsRun,
  projectRunCleanupIsSettled,
  projectRunTransitionFailure,
} from "./projectRunTransitions.js";
import { err, ok, type Result } from "./result.js";

const count = z.number().int().safe().nonnegative();
const positiveCount = z.number().int().safe().positive();
const text = nulFreeStringSchema.min(1);
const id = z.string().uuid();

/** Stages reuse the project's existing vocabulary. */
export const projectRunPhaseSchema = projectManifestSchema.shape.phase;

/** Finite defaults permit one requested build, without an implicit refinement loop. */
export const DEFAULT_PROJECT_RUN_BUDGET = Object.freeze({
  wall_time_ms: 600_000,
  max_attempts: 1,
  max_no_progress_attempts: 2,
});

/** Effective execution limits, retained with the run instead of inferred from a client. */
export const projectRunBudgetSchema = z.strictObject({
  wall_time_ms: positiveCount.default(DEFAULT_PROJECT_RUN_BUDGET.wall_time_ms),
  max_attempts: positiveCount.default(DEFAULT_PROJECT_RUN_BUDGET.max_attempts),
  max_no_progress_attempts: positiveCount.default(
    DEFAULT_PROJECT_RUN_BUDGET.max_no_progress_attempts,
  ),
});
export type ProjectRunBudget = z.infer<typeof projectRunBudgetSchema>;

/** Adapter identity records only execution configuration, never authentication values. */
export const projectBuilderIdentitySchema = z.strictObject({
  id: text,
  version: text.nullable(),
  model: text.nullable(),
});
/** Cleanup is an observation separate from command exit and project acceptance. */
export const projectRunCleanupStatusSchema = z.enum([
  "not_required",
  "pending",
  "complete",
  "incomplete",
  "unknown",
]);

const settledCleanupSchema = projectRunCleanupStatusSchema.extract([
  "not_required",
  "complete",
]);
const checkOutcomeSchema = z.enum(["pass", "fail", "unknown"]);

/** A durable stage boundary; reference matching does not establish project acceptance. */
export const projectRunRecordSchema = z
  .strictObject({
    schema: z.literal("tekvro.project-run"),
    schema_version: z.literal(1),
    run_id: id,
    project_token: projectTokenSchema,
    source_sha256: digestSchema,
    scope_revision: positiveCount,
    scope_sha256: digestSchema,
    requirements_sha256: digestSchema,
    phase: projectRunPhaseSchema,
    execution_status: projectExecutionStatusSchema,
    // The current executor records independent checks, not complete ledger closure.
    acceptance_status: projectAcceptanceStatusSchema.exclude(["pass", "fail"]),
    created_at: offsetDateTimeSchema,
    updated_at: offsetDateTimeSchema,
    adapter: projectBuilderIdentitySchema.nullable(),
    budget: projectRunBudgetSchema,
    budget_revision: positiveCount,
    budget_change_reason: text.nullable(),
    attempt: count,
    no_progress_attempts: count,
    elapsed_ms: count,
    observed_tokens: count.nullable(),
    candidate_sha256: digestSchema.nullable(),
    pending_check: projectCheckBindingSchema.nullable(),
    check_ids: z.array(id),
    last_check_status: checkOutcomeSchema.nullable(),
    stop_reason: text.nullable(),
    cleanup_status: projectRunCleanupStatusSchema,
  })
  .superRefine((run, context) => {
    if (
      Date.parse(run.updated_at) < Date.parse(run.created_at) ||
      run.scope_revision > run.project_token.revision
    )
      context.addIssue({
        code: "custom",
        message: "Run time or scope revision precedes its project binding",
      });
    if (run.no_progress_attempts > run.attempt)
      context.addIssue({
        code: "custom",
        path: ["no_progress_attempts"],
        message: "No-progress attempts exceed all recorded builder attempts",
      });
    if (
      (run.budget_revision === 1 && run.budget_change_reason !== null) ||
      (run.budget_revision > 1 && run.budget_change_reason === null)
    )
      context.addIssue({
        code: "custom",
        path: ["budget_change_reason"],
        message: "A revised budget must retain its explicit change reason",
      });
    if (new Set(run.check_ids).size !== run.check_ids.length)
      context.addIssue({
        code: "custom",
        path: ["check_ids"],
        message: "Duplicate check identity",
      });
    if (run.last_check_status !== null && run.check_ids.length === 0)
      context.addIssue({
        code: "custom",
        path: ["last_check_status"],
        message: "A check outcome requires a recorded check identity",
      });
    const pending = run.pending_check;
    if (
      pending !== null &&
      (run.phase !== "check" ||
        !projectCheckBindsRun(pending, run) ||
        pending.candidate_sha256 !== run.candidate_sha256)
    )
      context.addIssue({
        code: "custom",
        path: ["pending_check"],
        message: "Pending check does not bind the current run and candidate",
      });
    if (
      run.execution_status === "succeeded" &&
      (run.phase !== "check" ||
        run.last_check_status === null ||
        pending !== null ||
        !projectRunCleanupIsSettled(run.cleanup_status))
    )
      context.addIssue({
        code: "custom",
        path: ["execution_status"],
        message:
          "A completed execution requires a committed check and settled cleanup",
      });
  });

export type ProjectRunRecord = z.infer<typeof projectRunRecordSchema>;

const createRunInputSchema = z.strictObject({
  project: projectRevisionSchema,
  run_id: id,
  phase: projectRunPhaseSchema.extract(["build", "refine"]),
  created_at: offsetDateTimeSchema,
  adapter: projectBuilderIdentitySchema,
  budget: projectRunBudgetSchema.default(DEFAULT_PROJECT_RUN_BUDGET),
});

/** Create an idle run bound to the exact project revision, with no execution claim. */
export const createProjectRunRecord = (
  input: unknown,
): Result<ProjectRunRecord, AnalysisInputError> => {
  const parsed = createRunInputSchema.safeParse(input);
  if (!parsed.success)
    return err(
      analysisInputErrorFromIssues(
        "create_project_run",
        parsed.error.issues,
        input,
        { cause: parsed.error },
      ),
    );
  const { project, run_id, phase, created_at, adapter, budget } = parsed.data;
  return validateRun({
    schema: "tekvro.project-run",
    schema_version: 1,
    run_id,
    project_token: projectRevisionToken(project),
    source_sha256: project.project.scope.target.sha256,
    scope_revision: project.project.scope_revision,
    scope_sha256: project.project.scope_sha256,
    requirements_sha256: digestCanonicalValue(
      project.project.scope.requirements,
    ),
    phase,
    execution_status: "idle",
    acceptance_status: "not_evaluated",
    created_at,
    updated_at: created_at,
    adapter,
    budget,
    budget_revision: 1,
    budget_change_reason: null,
    attempt: 0,
    no_progress_attempts: 0,
    elapsed_ms: 0,
    observed_tokens: null,
    candidate_sha256: project.project.candidate_sha256,
    pending_check: null,
    check_ids: [],
    last_check_status: null,
    stop_reason: null,
    cleanup_status: "not_required",
  });
};

const eventBase = z.strictObject({
  at: offsetDateTimeSchema,
  elapsed_ms: count,
});

/** Events report observed boundaries; no event supplies an arbitrary state patch. */
export const projectRunEventSchema = z.discriminatedUnion("kind", [
  eventBase.extend({ kind: z.literal("start") }),
  eventBase.extend({ kind: z.literal("resume") }),
  eventBase.extend({ kind: z.literal("refine") }),
  eventBase.extend({
    kind: z.literal("build_completed"),
    binding: projectCheckBindingSchema,
    observed_tokens: count.nullable(),
    cleanup_status: settledCleanupSchema,
  }),
  eventBase.extend({
    kind: z.literal("build_paused"),
    binding: projectCheckBindingSchema,
    reason: z.literal("budget_exhausted"),
    observed_tokens: count.nullable(),
    cleanup_status: settledCleanupSchema,
  }),
  eventBase.extend({
    kind: z.literal("check_started"),
    binding: projectCheckBindingSchema,
  }),
  eventBase.extend({
    kind: z.literal("check_completed"),
    binding: projectCheckBindingSchema,
    check_id: id,
    outcome: checkOutcomeSchema,
    cleanup_status: settledCleanupSchema,
  }),
  eventBase.extend({
    kind: z.literal("pause"),
    reason: text,
    cleanup_status: settledCleanupSchema,
  }),
  eventBase.extend({ kind: z.literal("cancel_requested") }),
  eventBase.extend({
    kind: z.literal("cancelled"),
    cleanup_status: projectRunCleanupStatusSchema,
  }),
  eventBase.extend({
    kind: z.literal("interrupt"),
    reason: text,
    cleanup_status: projectRunCleanupStatusSchema,
  }),
  eventBase.extend({
    kind: z.literal("fail"),
    reason: text,
    cleanup_status: projectRunCleanupStatusSchema,
  }),
  eventBase.extend({
    kind: z.literal("set_budget"),
    budget: projectRunBudgetSchema,
    reason: text,
  }),
]);

export type ProjectRunEvent = z.infer<typeof projectRunEventSchema>;

const transitionInputSchema = z.strictObject({
  run: projectRunRecordSchema,
  event: projectRunEventSchema,
});

/** Apply one checked lifecycle event, retaining pending checks and consumed budgets. */
export const transitionProjectRun = (
  runInput: unknown,
  eventInput: unknown,
): Result<ProjectRunRecord, AnalysisInputError> => {
  const input = { run: runInput, event: eventInput };
  const parsed = transitionInputSchema.safeParse(input);
  if (!parsed.success)
    return err(
      analysisInputErrorFromIssues(
        "transition_project_run",
        parsed.error.issues,
        input,
        { cause: parsed.error },
      ),
    );
  const { run, event } = parsed.data;
  if (
    Date.parse(event.at) < Date.parse(run.updated_at) ||
    event.elapsed_ms < run.elapsed_ms
  )
    return projectRunTransitionFailure(
      "Event time and cumulative elapsed time must not move backwards",
    );
  const transitioned = applyProjectRunEvent(
    {
      ...run,
      updated_at: event.at,
      elapsed_ms: event.elapsed_ms,
    },
    event,
  );
  return transitioned.ok ? validateRun(transitioned.value) : transitioned;
};

const validateRun = (
  input: unknown,
): Result<ProjectRunRecord, AnalysisInputError> => {
  const parsed = projectRunRecordSchema.safeParse(input);
  return parsed.success
    ? ok(parsed.data)
    : err(
        analysisInputErrorFromIssues(
          "transition_project_run",
          parsed.error.issues,
          input,
          { cause: parsed.error },
        ),
      );
};

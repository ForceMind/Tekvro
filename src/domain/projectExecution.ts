import { z } from "zod";
import { digestSchema } from "./digests.js";
import {
  absoluteLocalPathStringSchema,
  nulFreeStringSchema,
} from "./localPath.js";
import {
  checkReportSchema,
  storedProjectCheckSchema,
  type ProjectCheckReport,
  type StoredProjectCheck,
} from "./projectCheckReport.js";
import {
  projectBuilderResultSchema,
  type ProjectBuilderResult,
} from "./projectBuilder.js";
import {
  projectRevisionSchema,
  projectTokenSchema,
} from "./projectManifest.js";
import {
  projectRunBudgetSchema,
  projectRunRecordSchema,
} from "./projectRun.js";

const directorySchema = absoluteLocalPathStringSchema.describe(
  "Absolute directory containing the project's immutable metadata and run histories.",
);
const instructionSchema = nulFreeStringSchema
  .min(1)
  .describe(
    "Instruction for one explicitly requested Builder attempt; never an acceptance verdict.",
  );
const checkerPathSchema = absoluteLocalPathStringSchema.describe(
  "Absolute path to the independently selected checker manifest outside the Builder output tree.",
);

/** Exact publication identity required before appending a run event. */
export const projectRunTokenSchema = z.strictObject({
  run_id: z.string().uuid(),
  sequence: z.number().int().safe().positive(),
  digest: digestSchema,
});
export type ProjectRunToken = z.infer<typeof projectRunTokenSchema>;

/** Explicitly start a new run against the previously inspected project revision. */
export const buildProjectRequestSchema = z.strictObject({
  directory: directorySchema,
  expected: projectTokenSchema,
  instruction: instructionSchema,
  checker_path: checkerPathSchema,
  model: nulFreeStringSchema.min(1).optional(),
  budget: projectRunBudgetSchema.optional(),
});

export const inspectProjectRunRequestSchema = z.strictObject({
  directory: directorySchema,
  run_id: z.string().uuid(),
});

/** Select exactly the persisted pending check without replaying its Builder. */
export const checkProjectRequestSchema = inspectProjectRunRequestSchema.extend({
  expected: projectRunTokenSchema,
  checker_path: checkerPathSchema,
});

export const refineProjectRequestSchema = checkProjectRequestSchema.extend({
  instruction: instructionSchema,
});

/** A fresh bounded attempt from a safe paused boundary, never a Codex session resume. */
export const resumeProjectBuildRequestSchema =
  refineProjectRequestSchema.describe(
    "Start a new finite Builder attempt from a safe paused boundary; this does not resume a Codex session.",
  );

/** Change finite limits explicitly; this request does not start another process. */
export const adjustProjectRunBudgetRequestSchema =
  inspectProjectRunRequestSchema.extend({
    expected: projectRunTokenSchema,
    budget: projectRunBudgetSchema,
    reason: nulFreeStringSchema.min(1),
  });

export const projectRunSnapshotSchema = z.strictObject({
  directory: absoluteLocalPathStringSchema,
  run: projectRunRecordSchema,
  token: projectRunTokenSchema,
});
export type ProjectRunSnapshot = Readonly<
  z.infer<typeof projectRunSnapshotSchema>
>;

/** Run truth stays distinct from the current project's possibly outdated projection. */
export const projectExecutionSnapshotSchema = z.strictObject({
  project: z.strictObject({
    directory: directorySchema,
    revision: projectRevisionSchema,
  }),
  execution: projectRunSnapshotSchema,
  projection_status: z.enum(["current", "outdated"]),
  check: storedProjectCheckSchema.optional(),
  // Retain the structured observation without inventing a committed report reference.
  unpublished_check: checkReportSchema.optional(),
  // Receipt publication may fail after a Builder has already returned these facts.
  builder_observation: projectBuilderResultSchema.optional(),
});
export type ProjectExecutionSnapshot = Readonly<
  Omit<
    z.infer<typeof projectExecutionSnapshotSchema>,
    "check" | "unpublished_check" | "builder_observation"
  >
> & {
  readonly check?: StoredProjectCheck;
  readonly unpublished_check?: ProjectCheckReport;
  readonly builder_observation?: ProjectBuilderResult;
};

/** Failure retains the exact durable boundary a client can inspect before deciding to continue. */
export type ProjectExecutionPartialObservation = ProjectExecutionSnapshot & {
  readonly kind: "project_execution";
};

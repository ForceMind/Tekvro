import { z } from "zod";
import { digestSchema } from "./digests.js";
import { absoluteLocalPathStringSchema } from "./localPath.js";
import { projectCheckBindingSchema } from "./projectCheckBinding.js";

const checkClaimSchema = z.strictObject({
  requirement_id: z.string().min(1),
  status: z.enum(["pass", "fail", "unknown"]),
  detail: z.string(),
});

/** stdout protocol for one fresh independent checker invocation. */
export const projectCheckerResultSchema = z.strictObject({
  schema: z.literal("tekvro.project-check-result"),
  schema_version: z.literal(1),
  check_id: z.string().uuid(),
  binding: projectCheckBindingSchema,
  checks: z.array(checkClaimSchema).min(1),
});

const capturedStreamSchema = z.strictObject({
  text: z.string(),
  bytes: z.number().int().safe().nonnegative(),
  observed_bytes: z.number().int().safe().nonnegative(),
  invalid_utf8: z.boolean(),
});
const capturedProcessSchema = z.strictObject({
  stdout: capturedStreamSchema,
  stderr: capturedStreamSchema,
  exit_code: z.number().int().nullable(),
  signal: z.string().nullable(),
  truncated: z.boolean(),
  output_incomplete: z.boolean(),
  memory_limit_reached: z.boolean(),
});
const environmentObservationSchema = z.strictObject({
  platform: z.string(),
  architecture: z.string(),
  kernel_release: z.string(),
  variables: z.array(z.string()),
  values_sha256: digestSchema,
});

/** Persisted observation schema; digest and current applicability are checked separately. */
export const checkReportSchema = z.strictObject({
  schema: z.literal("tekvro.project-check"),
  schema_version: z.literal(1),
  check_id: z.string().uuid(),
  binding: projectCheckBindingSchema,
  checker_path: absoluteLocalPathStringSchema,
  started_at: z.string().datetime(),
  finished_at: z.string().datetime(),
  outcome: z.enum(["pass", "fail", "unknown"]),
  checks: z.array(checkClaimSchema),
  evidence_ids: z.array(z.string()),
  limitations: z.array(z.string()),
  environment: environmentObservationSchema,
  process: capturedProcessSchema.nullable(),
  execution_failure: z.string().nullable(),
  execution_failure_reason: z
    .enum(["cancelled", "timeout", "output-limit", "process"])
    .nullable(),
  cleanup_status: z.enum(["complete", "incomplete", "not_required"]),
  cleanup_resources: z.array(z.string()),
});

/** Historical observation; its outcome never changes a project's acceptance. */
export type ProjectCheckReport = z.infer<typeof checkReportSchema>;

/** Publication reference plus the exact report; stale rereads expose unknown at the top level. */
export const storedProjectCheckSchema = z.strictObject({
  check_id: z.string().uuid(),
  binding: projectCheckBindingSchema,
  outcome: z.enum(["pass", "fail", "unknown"]),
  report_path: absoluteLocalPathStringSchema,
  report_sha256: digestSchema,
  evidence_ids: z.array(z.string()).readonly(),
  limitations: z.array(z.string()).readonly(),
  report: checkReportSchema,
  applicability: z.enum(["matched", "stale", "unknown"]),
});

export type StoredProjectCheck = Readonly<
  z.infer<typeof storedProjectCheckSchema>
>;

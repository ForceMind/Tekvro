import type { ProviderProcessSnapshot } from "../../process/ProviderProcess.js";
import { z } from "zod";
import type { AnalysisError } from "../../domain/analysisErrorBase.js";
import { digestCanonicalValue } from "../../domain/canonicalDigest.js";
import { digestSchema } from "../../domain/digests.js";
import { EvidenceFileError } from "../../domain/evidenceErrors.js";
import {
  absoluteLocalPathStringSchema,
  nulFreeStringSchema,
} from "../../domain/localPath.js";
import {
  projectCheckBindingSchema,
  type ProjectCheckBinding,
} from "../../domain/projectCheckBinding.js";
import {
  projectManifestSchema,
  type ProjectManifest,
} from "../../domain/projectManifest.js";

import {
  projectCheckerResultSchema,
  type ProjectCheckReport,
  type StoredProjectCheck,
} from "../../domain/projectCheckReport.js";
export {
  checkReportSchema,
  type ProjectCheckReport,
  type StoredProjectCheck,
} from "../../domain/projectCheckReport.js";

const fixedFileSchema = z.strictObject({
  path: absoluteLocalPathStringSchema,
  sha256: digestSchema,
});
const environmentNameSchema = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/u)
  .refine(
    (name) =>
      ![
        "REA_PROCESS_RUN_ID",
        "TEKVRO_PROJECT_CHECK_BINDING",
        "TEKVRO_PROJECT_CHECK_ID",
      ].includes(name.toUpperCase()),
    "Process ownership and check identity variables are service-owned",
  );

/**
 * Caller-owned verifier configuration. All checker/scenario/expected inputs
 * must be declared and kept outside the Builder tree. This is a fixed command
 * contract, not a sandbox or a dependency-discovery language.
 */
export const projectCheckerManifestSchema = z
  .strictObject({
    schema: z.literal("tekvro.project-checker"),
    schema_version: z.literal(1),
    executable: fixedFileSchema,
    argv: z.array(nulFreeStringSchema),
    cwd: absoluteLocalPathStringSchema,
    inputs: z
      .array(
        fixedFileSchema.extend({
          role: z.enum(["checker", "scenario", "expected"]),
        }),
      )
      .min(2),
    environment: z.record(environmentNameSchema, nulFreeStringSchema),
    success_exit_code: z.number().int().min(0).max(255),
    failure_exit_code: z.number().int().min(0).max(255),
  })
  .superRefine((manifest, context) => {
    if (manifest.success_exit_code === manifest.failure_exit_code)
      context.addIssue({
        code: "custom",
        message: "Success and detected-failure exit codes must differ",
      });
    if (
      !manifest.inputs.some((input) => input.role === "checker") ||
      !manifest.inputs.some((input) => input.role === "scenario")
    )
      context.addIssue({
        code: "custom",
        message: "Declare the independent checker and its scenario inputs",
      });
    if (
      new Set(manifest.inputs.map((input) => input.path)).size !==
      manifest.inputs.length
    )
      context.addIssue({
        code: "custom",
        message: "Checker inputs contain duplicate paths",
      });
    if (
      new Set(Object.keys(manifest.environment).map((key) => key.toUpperCase()))
        .size !== Object.keys(manifest.environment).length
    )
      context.addIssue({
        code: "custom",
        message: "Environment names must not have case aliases",
      });
  });

export type ProjectCheckerManifest = z.infer<
  typeof projectCheckerManifestSchema
>;

/** Internal preparation boundary shared by prepare and execution. */
export const prepareSchema = z.strictObject({
  project: projectManifestSchema,
  run_id: z.string().uuid(),
  checker_path: absoluteLocalPathStringSchema,
});

/** Exact inputs needed to observe a check commitment without executing it. */
export type ProjectCheckPreparation = z.infer<typeof prepareSchema>;

/** Internal command execution boundary. */
export const runSchema = prepareSchema.extend({
  report_path: absoluteLocalPathStringSchema,
  timeout_ms: z.number().int().safe().positive(),
  diagnostic_bytes: z.number().int().safe().positive(),
  expected_binding: projectCheckBindingSchema.optional(),
});

/** Resource admissions and a report destination are selected by the owning workflow. */
export type ProjectCheckRequest = z.infer<typeof runSchema>;

/** Keep the completed observation even if its immutable report could not be published. */
export class ProjectCheckPublicationError extends EvidenceFileError {
  constructor(
    readonly report: ProjectCheckReport,
    readonly publicationFailure: AnalysisError,
  ) {
    super(
      "write",
      publicationFailure instanceof EvidenceFileError
        ? publicationFailure.reason
        : "io",
      {
        cause: publicationFailure,
        cleanupPrimary: publicationFailure,
        ...(publicationFailure instanceof EvidenceFileError &&
        publicationFailure.path !== undefined
          ? { path: publicationFailure.path }
          : {}),
        ...(publicationFailure instanceof EvidenceFileError &&
        publicationFailure.published !== undefined
          ? { published: publicationFailure.published }
          : {}),
        ...(report.process === null
          ? {}
          : {
              capturedOutput: {
                stdout: report.process.stdout.text,
                stderr: report.process.stderr.text,
                stdout_bytes: report.process.stdout.bytes,
                stderr_bytes: report.process.stderr.bytes,
                truncated: report.process.truncated,
                exit_code: report.process.exit_code,
                signal: report.process.signal,
              },
            }),
      },
    );
    this.bindCleanupDependencies([publicationFailure]);
  }
}

/** Exact equality includes run ownership and scope revision, not just output content. */
export const sameProjectCheckBinding = (
  left: ProjectCheckBinding,
  right: ProjectCheckBinding,
): boolean => digestCanonicalValue(left) === digestCanonicalValue(right);

const hasIncompleteProcessOutput = (
  process: NonNullable<ProjectCheckReport["process"]>,
): boolean =>
  process.truncated ||
  process.output_incomplete ||
  process.stdout.invalid_utf8 ||
  process.stderr.invalid_utf8 ||
  process.memory_limit_reached ||
  process.signal !== null;

/** Interpret complete stdout claims without asserting execution or current applicability. */
export const evaluateProjectCheckerResult = (input: {
  readonly process: ProjectCheckReport["process"];
  readonly binding: ProjectCheckBinding;
  readonly checkId: string;
  readonly project: ProjectManifest;
  readonly manifest: ProjectCheckerManifest;
}): {
  readonly checks: ProjectCheckReport["checks"];
  readonly outcome: ProjectCheckReport["outcome"];
  readonly limitations: readonly string[];
} => {
  const process = input.process;
  const limitations: string[] = [];
  if (process === null)
    return {
      checks: [],
      outcome: "unknown",
      limitations: ["No complete checker process output was observed"],
    };
  if (hasIncompleteProcessOutput(process))
    limitations.push("Checker output or lifecycle is incomplete");
  let protocol: unknown;
  try {
    protocol = JSON.parse(process.stdout.text);
  } catch (cause: unknown) {
    limitations.push(
      `Checker stdout is not one complete JSON report: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  const result = projectCheckerResultSchema.safeParse(protocol);
  if (!result.success)
    return {
      checks: [],
      outcome: "unknown",
      limitations: [
        ...limitations,
        "Checker report does not satisfy the result protocol",
      ],
    };
  const checks = result.data.checks;
  if (
    result.data.check_id !== input.checkId ||
    !sameProjectCheckBinding(result.data.binding, input.binding)
  )
    limitations.push(
      "Checker report has a different invocation or input binding",
    );
  const required = input.project.scope.requirements
    .filter((item) => item.required)
    .map((item) => item.requirement_id);
  const allowed = new Set(
    input.project.scope.requirements.map((item) => item.requirement_id),
  );
  const claimed = new Set(checks.map((item) => item.requirement_id));
  if (
    claimed.size !== checks.length ||
    checks.some((item) => !allowed.has(item.requirement_id)) ||
    required.some((id) => !claimed.has(id))
  )
    limitations.push(
      "Checker report omits required obligations or contains duplicate/unknown obligations",
    );
  if (checks.some((item) => item.status === "unknown"))
    limitations.push("Checker could not evaluate every reported obligation");
  const detectedFailure = checks.some((item) => item.status === "fail");
  const expectedExit = detectedFailure
    ? input.manifest.failure_exit_code
    : input.manifest.success_exit_code;
  if (process.exit_code !== expectedExit)
    limitations.push(
      "Checker exit status disagrees with the declared report semantics",
    );
  return {
    checks,
    outcome:
      limitations.length > 0 ? "unknown" : detectedFailure ? "fail" : "pass",
    limitations,
  };
};

/** Preserve the shared process owner's exact output and completeness facts. */
export const snapshotReport = (
  snapshot: ProviderProcessSnapshot,
): NonNullable<ProjectCheckReport["process"]> => ({
  stdout: {
    text: snapshot.stdout.text,
    bytes: snapshot.stdout.bytes,
    observed_bytes: snapshot.stdout.observedBytes,
    invalid_utf8: snapshot.stdout.invalidUtf8 === true,
  },
  stderr: {
    text: snapshot.stderr.text,
    bytes: snapshot.stderr.bytes,
    observed_bytes: snapshot.stderr.observedBytes,
    invalid_utf8: snapshot.stderr.invalidUtf8 === true,
  },
  exit_code: snapshot.exitCode ?? null,
  signal: snapshot.signal ?? null,
  truncated: snapshot.diagnosticTruncated === true,
  output_incomplete: snapshot.outputIncomplete === true,
  memory_limit_reached: snapshot.memoryLimitReached === true,
});

/** Preserve historical facts while withholding a stale or unverified current outcome. */
export const storedProjectCheck = (input: {
  readonly report: ProjectCheckReport;
  readonly path: string;
  readonly digest: string;
  readonly applicability: StoredProjectCheck["applicability"];
  readonly limitations: readonly string[];
}): StoredProjectCheck => ({
  check_id: input.report.check_id,
  binding: input.report.binding,
  outcome: input.applicability === "matched" ? input.report.outcome : "unknown",
  report_path: input.path,
  report_sha256: input.digest,
  evidence_ids: input.report.evidence_ids,
  limitations: input.limitations,
  report: input.report,
  applicability: input.applicability,
});

/** A stored result may be supplied structurally; only its committed path and digest are authority. */
export const projectCheckReferenceSchema = z.object({
  report_path: absoluteLocalPathStringSchema,
  report_sha256: digestSchema,
});
/** Validate the present project and independently selected checker for historical report reuse. */
export const projectCheckCurrentSchema = z.strictObject({
  project: projectManifestSchema,
  checker_path: absoluteLocalPathStringSchema,
});

import { z } from "zod";
import { digestCanonicalValue } from "./canonicalDigest.js";
import { digestSchema, prefixedDigestSchema } from "./digests.js";
import { localPathStringSchema, nulFreeStringSchema } from "./localPath.js";
import { offsetDateTimeSchema } from "./offsetDateTime.js";

const id = z.string().uuid();
const text = nulFreeStringSchema.min(1);
const counter = z.number().int().safe().positive();

/** Historical paths retain either host's spelling. Validate the active host at I/O, not on reopen. */
const persistedAbsolutePath = localPathStringSchema.regex(
  /^(?:[\\/]|[A-Za-z]:[\\/])/u,
  "must record an absolute POSIX or Windows filesystem path",
);

/** Run lifecycle and acceptance are independent project facts. */
export const projectExecutionStatusSchema = z.enum([
  "idle",
  "running",
  "waiting_input",
  "cancelling",
  "cancelled",
  "paused",
  "interrupted",
  "succeeded",
  "failed",
]);
/** Full vocabulary reserved for the checker-backed project workflow. */
export const projectAcceptanceStatusSchema = z.enum([
  "not_evaluated",
  "pass",
  "fail",
  "unknown",
]);
/** A fixed requirement scope; changing it invalidates the old check binding. */
export const projectScopeSchema = z.strictObject({
  goal: z.enum(["investigation", "reconstruction"]),
  question: text,
  target: z.strictObject({
    original_input: text,
    path: persistedAbsolutePath,
    sha256: digestSchema,
  }),
  output_root: persistedAbsolutePath,
  requirements: z
    .array(
      z.strictObject({
        requirement_id: text,
        description: text,
        required: z.boolean(),
      }),
    )
    .min(1),
});

/** Reference metadata does not assert that the referenced bundle was opened. */
export const projectEvidenceRefSchema = z.strictObject({
  evidence_id: prefixedDigestSchema("ev"),
  bundle_path: persistedAbsolutePath,
  bundle_sha256: digestSchema,
});

/** Exact identities a future independent checker must bind before evaluation. */
export const projectCheckRefSchema = z.strictObject({
  check_id: id,
  run_id: id,
  scope_sha256: digestSchema,
  candidate_sha256: digestSchema,
  checker_sha256: digestSchema,
  scenario_sha256: digestSchema,
  environment_sha256: digestSchema,
  report_path: persistedAbsolutePath,
  report_sha256: digestSchema,
  evidence_ids: z.array(prefixedDigestSchema("ev")),
});

/** Version-one project snapshot. M0 persists references, without inventing verdicts. */
export const projectManifestSchema = z
  .strictObject({
    schema: z.literal("tekvro.project"),
    schema_version: z.literal(1),
    project_id: id,
    revision: counter,
    created_at: offsetDateTimeSchema,
    updated_at: offsetDateTimeSchema,
    name: text,
    scope: projectScopeSchema,
    scope_sha256: digestSchema,
    scope_revision: counter,
    scope_change_reason: text.nullable(),
    candidate_sha256: digestSchema.nullable(),
    phase: z.enum(["study", "build", "check", "refine", "deliver"]),
    execution_status: projectExecutionStatusSchema,
    acceptance_status: projectAcceptanceStatusSchema,
    run_ids: z.array(id),
    evidence_refs: z.array(projectEvidenceRefSchema),
    check_refs: z.array(projectCheckRefSchema),
    unresolved: z.array(text),
  })
  .superRefine((project, context) => {
    if (project.scope_sha256 !== digestCanonicalValue(project.scope))
      context.addIssue({
        code: "custom",
        path: ["scope_sha256"],
        message: "Project scope digest mismatch",
      });
    if (
      project.scope_revision > project.revision ||
      (project.scope_revision === 1 && project.scope_change_reason !== null) ||
      (project.scope_revision > 1 && project.scope_change_reason === null)
    )
      context.addIssue({
        code: "custom",
        path: ["scope_revision"],
        message: "Project scope history is inconsistent with its revision",
      });
    const requirements = project.scope.requirements.map(
      (item) => item.requirement_id,
    );
    if (new Set(requirements).size !== requirements.length)
      context.addIssue({
        code: "custom",
        path: ["scope", "requirements"],
        message: "Duplicate requirement identity",
      });
    const checks = project.check_refs.map((item) => item.check_id);
    if (new Set(checks).size !== checks.length)
      context.addIssue({
        code: "custom",
        path: ["check_refs"],
        message: "Duplicate check identity",
      });
    if (new Set(project.run_ids).size !== project.run_ids.length)
      context.addIssue({
        code: "custom",
        path: ["run_ids"],
        message: "Duplicate run identity",
      });
    const evidenceIds = new Set(
      project.evidence_refs.map((ref) => ref.evidence_id),
    );
    for (const check of project.check_refs) {
      if (
        !project.run_ids.includes(check.run_id) ||
        check.evidence_ids.some((value) => !evidenceIds.has(value))
      )
        context.addIssue({
          code: "custom",
          path: ["check_refs"],
          message: "Check refers to an unrecorded run or Evidence",
        });
    }
    // PW-04 will authenticate and evaluate actual checker proofs. M0 cannot
    // turn stored reference metadata into a pass/fail verdict.
    if (
      project.acceptance_status === "pass" ||
      project.acceptance_status === "fail"
    )
      context.addIssue({
        code: "custom",
        path: ["acceptance_status"],
        message: "Evaluated project acceptance requires the checker workflow",
      });
  });

export type ProjectManifest = z.infer<typeof projectManifestSchema>;
export type ProjectScope = z.infer<typeof projectScopeSchema>;
export type ProjectCheckRef = z.infer<typeof projectCheckRefSchema>;

/** Check applicability is separate from reading the historical report. */
export const projectCheckIsCurrent = (
  project: ProjectManifest,
  check: ProjectCheckRef,
): boolean =>
  project.scope_sha256 === check.scope_sha256 &&
  project.candidate_sha256 !== null &&
  project.candidate_sha256 === check.candidate_sha256;

/** Initial caller-owned project intent, before the store assigns identity and time. */
export const createProjectInputSchema = z.strictObject({
  name: text,
  scope: projectScopeSchema,
});

/** Editable scope and references. Execution and evaluated verdicts belong to later services. */
export const projectEditSchema = z.strictObject({
  name: text.optional(),
  scope: projectScopeSchema.optional(),
  change_reason: text.optional(),
  candidate_sha256: digestSchema.nullable().optional(),
  run_ids: z.array(id).optional(),
  evidence_refs: z.array(projectEvidenceRefSchema).optional(),
  check_refs: z.array(projectCheckRefSchema).optional(),
  unresolved: z.array(text).optional(),
});

/** A commit token guards both project identity and the exact revision content. */
export const projectTokenSchema = z.strictObject({
  project_id: id,
  revision: counter,
  digest: digestSchema,
});
export type ProjectToken = z.infer<typeof projectTokenSchema>;

/** An immutable publication envelope, chained to the preceding revision. */
export const projectRevisionSchema = z
  .strictObject({
    schema: z.literal("tekvro.project-revision"),
    schema_version: z.literal(1),
    previous_digest: digestSchema.nullable(),
    project: projectManifestSchema,
    digest: digestSchema,
  })
  .superRefine((revision, context) => {
    const { digest, ...body } = revision;
    if (digest !== digestCanonicalValue(body))
      context.addIssue({
        code: "custom",
        path: ["digest"],
        message: "Project revision digest mismatch",
      });
    if (
      (revision.project.revision === 1) !==
      (revision.previous_digest === null)
    )
      context.addIssue({
        code: "custom",
        path: ["previous_digest"],
        message: "Project revision chain is incomplete",
      });
  });
export type ProjectRevision = z.infer<typeof projectRevisionSchema>;

/** Seal a validated project with the previous immutable commit identity. */
export const sealProjectRevision = (
  project: ProjectManifest,
  previous_digest: string | null,
): ProjectRevision => {
  const body = {
    schema: "tekvro.project-revision" as const,
    schema_version: 1 as const,
    previous_digest,
    project,
  };
  return projectRevisionSchema.parse({
    ...body,
    digest: digestCanonicalValue(body),
  });
};

/** Identity needed to submit the next update without losing another writer's work. */
export const projectRevisionToken = (
  revision: ProjectRevision,
): ProjectToken => ({
  project_id: revision.project.project_id,
  revision: revision.project.revision,
  digest: revision.digest,
});

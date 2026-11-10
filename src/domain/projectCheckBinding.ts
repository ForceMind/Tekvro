import { z } from "zod";

import type { AnalysisInputError } from "./analysisErrorCore.js";
import { digestCanonicalValue } from "./canonicalDigest.js";
import { digestSchema } from "./digests.js";
import { analysisInputErrorFromIssues } from "./inputIssueProjection.js";
import { nulFreeStringSchema } from "./localPath.js";
import { projectManifestSchema } from "./projectManifest.js";
import { err, ok, type Result } from "./result.js";
import { compareUnicodeCodePoints } from "./unicodeCodePointOrder.js";

const candidateRelativePathSchema = nulFreeStringSchema
  .min(1)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.includes("\\") &&
      !/^[A-Za-z]:/u.test(path) &&
      path
        .split("/")
        .every((part) => part !== "" && part !== "." && part !== ".."),
    "Candidate inventory paths must be normalized relative paths",
  );

/** Complete observations supplied by the filesystem owner, excluding an implicit root. */
export const projectCandidateInventorySchema = z
  .strictObject({
    directories: z.array(candidateRelativePathSchema),
    files: z.array(
      z.strictObject({
        path: candidateRelativePathSchema,
        sha256: digestSchema,
        bytes: z.number().int().safe().nonnegative(),
        executable: z.boolean(),
      }),
    ),
  })
  .superRefine((inventory, context) => {
    const paths = [
      ...inventory.directories,
      ...inventory.files.map((file) => file.path),
    ];
    const directories = new Set(inventory.directories);
    if (new Set(paths).size !== paths.length)
      context.addIssue({
        code: "custom",
        message: "Candidate inventory contains a duplicate file or directory",
      });
    for (const path of paths) {
      const separator = path.lastIndexOf("/");
      if (separator !== -1 && !directories.has(path.slice(0, separator)))
        context.addIssue({
          code: "custom",
          message: "Candidate inventory omits a parent directory",
        });
    }
  });

export type ProjectCandidateInventory = z.infer<
  typeof projectCandidateInventorySchema
>;

/** Hash one validated observation without interpreting filesystem paths or asserting coverage. */
export const projectCandidateDigest = (
  input: unknown,
): Result<string, AnalysisInputError> => {
  const parsed = projectCandidateInventorySchema.safeParse(input);
  if (!parsed.success)
    return err(
      analysisInputErrorFromIssues(
        "fingerprint_project_candidate",
        parsed.error.issues,
        input,
        { cause: parsed.error },
      ),
    );
  return ok(
    digestCanonicalValue({
      schema: "tekvro.project-candidate",
      schema_version: 1,
      directories: [...parsed.data.directories].sort(compareUnicodeCodePoints),
      files: [...parsed.data.files].sort((left, right) =>
        compareUnicodeCodePoints(left.path, right.path),
      ),
    }),
  );
};

/** Independently selected candidate and checker inputs, before execution. */
export const projectCheckSelectionSchema = z.strictObject({
  candidate_sha256: digestSchema,
  checker_sha256: digestSchema,
  scenario_sha256: digestSchema,
  environment_sha256: digestSchema,
});

export type ProjectCheckSelection = z.infer<typeof projectCheckSelectionSchema>;

/** Exact project, source, owner, requirement, checker and environment commitments. */
export const projectCheckBindingSchema = projectCheckSelectionSchema.extend({
  project_id: z.string().uuid(),
  run_id: z.string().uuid(),
  source_sha256: digestSchema,
  scope_revision: z.number().int().safe().positive(),
  scope_sha256: digestSchema,
  requirements_sha256: digestSchema,
});

export type ProjectCheckBinding = z.infer<typeof projectCheckBindingSchema>;

const createBindingInputSchema = z.strictObject({
  project: projectManifestSchema,
  run_id: z.string().uuid(),
  selection: projectCheckSelectionSchema,
});

/** Bind a planned check to a validated project; this does not execute or authenticate proof. */
export const createProjectCheckBinding = (
  project: unknown,
  runId: unknown,
  selection: unknown,
): Result<ProjectCheckBinding, AnalysisInputError> => {
  const input = { project, run_id: runId, selection };
  const parsed = createBindingInputSchema.safeParse(input);
  if (!parsed.success)
    return err(
      analysisInputErrorFromIssues(
        "bind_project_check",
        parsed.error.issues,
        input,
        { cause: parsed.error },
      ),
    );
  const checked = parsed.data;
  return ok({
    ...checked.selection,
    project_id: checked.project.project_id,
    run_id: checked.run_id,
    source_sha256: checked.project.scope.target.sha256,
    scope_revision: checked.project.scope_revision,
    scope_sha256: checked.project.scope_sha256,
    requirements_sha256: digestCanonicalValue(
      checked.project.scope.requirements,
    ),
  });
};

const applicabilityInputSchema = z.strictObject({
  binding: projectCheckBindingSchema,
  project: projectManifestSchema,
  selection: projectCheckSelectionSchema,
});

/** A mismatch prevents reuse even when the historical report remains readable. */
export type ProjectCheckMismatch =
  | "project_mismatch"
  | "source_changed"
  | "scope_revision_changed"
  | "scope_changed"
  | "requirements_changed"
  | "candidate_changed"
  | "checker_changed"
  | "scenario_changed"
  | "environment_changed";

/** Matching inputs establish applicability only, never report authenticity or acceptance. */
export interface ProjectCheckApplicability {
  readonly status: "matched" | "stale";
  readonly reasons: readonly ProjectCheckMismatch[];
}

/** Compare every current selection with the historical check's fixed commitments. */
export const projectCheckApplicability = (
  binding: unknown,
  project: unknown,
  selection: unknown,
): Result<ProjectCheckApplicability, AnalysisInputError> => {
  const input = { binding, project, selection };
  const parsed = applicabilityInputSchema.safeParse(input);
  if (!parsed.success)
    return err(
      analysisInputErrorFromIssues(
        "inspect_project_check_binding",
        parsed.error.issues,
        input,
        { cause: parsed.error },
      ),
    );
  const checked = parsed.data;
  const previous = checked.binding;
  const current = checked.project;
  const selected = checked.selection;
  const reasons: ProjectCheckMismatch[] = [];
  if (previous.project_id !== current.project_id)
    reasons.push("project_mismatch");
  if (previous.source_sha256 !== current.scope.target.sha256)
    reasons.push("source_changed");
  if (previous.scope_revision !== current.scope_revision)
    reasons.push("scope_revision_changed");
  if (previous.scope_sha256 !== current.scope_sha256)
    reasons.push("scope_changed");
  if (
    previous.requirements_sha256 !==
    digestCanonicalValue(current.scope.requirements)
  )
    reasons.push("requirements_changed");
  if (previous.candidate_sha256 !== selected.candidate_sha256)
    reasons.push("candidate_changed");
  if (previous.checker_sha256 !== selected.checker_sha256)
    reasons.push("checker_changed");
  if (previous.scenario_sha256 !== selected.scenario_sha256)
    reasons.push("scenario_changed");
  if (previous.environment_sha256 !== selected.environment_sha256)
    reasons.push("environment_changed");
  return ok({ status: reasons.length === 0 ? "matched" : "stale", reasons });
};

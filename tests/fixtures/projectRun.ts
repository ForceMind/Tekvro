import { digestCanonicalValue } from "../../src/domain/canonicalDigest.js";
import {
  projectManifestSchema,
  type ProjectManifest,
} from "../../src/domain/projectManifest.js";
import type { Result } from "../../src/domain/result.js";

export const PROJECT_RUN_TEST_ID = "22222222-2222-4222-8222-222222222222";
export const PROJECT_RUN_TEST_TIME = "2026-11-10T00:00:00.000Z";

/** A fixed in-memory project; it does not claim to open these fixture paths. */
export const projectRunTestManifest = (): ProjectManifest => {
  const scope = {
    goal: "reconstruction" as const,
    question: "Reproduce the reference's documented behavior",
    target: {
      original_input: "reference.html",
      path: "/test/reference.html",
      sha256: "a".repeat(64),
    },
    output_root: "/test/candidate",
    requirements: [
      {
        requirement_id: "counter",
        description: "Increment the displayed value once per click",
        required: true,
      },
    ],
  };
  return projectManifestSchema.parse({
    schema: "tekvro.project",
    schema_version: 1,
    project_id: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    created_at: PROJECT_RUN_TEST_TIME,
    updated_at: PROJECT_RUN_TEST_TIME,
    name: "Counter reconstruction",
    scope,
    scope_sha256: digestCanonicalValue(scope),
    scope_revision: 1,
    scope_change_reason: null,
    candidate_sha256: null,
    phase: "study",
    execution_status: "idle",
    acceptance_status: "not_evaluated",
    run_ids: [],
    evidence_refs: [],
    check_refs: [],
    unresolved: [],
  });
};

/** Require a valid fixture boundary while preserving an actual typed failure. */
export const takeProjectResult = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw result.error;
  return result.value;
};

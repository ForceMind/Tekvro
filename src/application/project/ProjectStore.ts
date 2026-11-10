import { randomUUID } from "node:crypto";
import type { AnalysisError } from "../../domain/analysisErrorBase.js";
import { mkdir, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ArtifactResourceScope } from "../../artifacts/ArtifactResourceScope.js";
import { digestCanonicalValue } from "../../domain/canonicalDigest.js";
import {
  EvidenceFileError,
  EvidenceIntegrityError,
} from "../../domain/evidenceErrors.js";
import {
  AnalysisCancelledError,
  type AnalysisResourceConstraintError,
} from "../../domain/analysisErrorCore.js";
import {
  createProjectInputSchema,
  projectEditSchema,
  projectManifestSchema,
  projectRevisionSchema,
  projectRevisionToken,
  projectTokenSchema,
  sealProjectRevision,
  projectCheckRefSchema,
  type ProjectCheckRef,
  type ProjectManifest,
  type ProjectRevision,
} from "../../domain/projectManifest.js";
import {
  projectRunRecordSchema,
  type ProjectRunRecord,
} from "../../domain/projectRun.js";
import { err, ok, type Result } from "../../domain/result.js";
import { absoluteCallerPath } from "../../filesystem/callerPath.js";
import { readJsonFile, writeTextParts } from "../JsonFiles.js";
import { ProjectRevisionConflict } from "../../domain/projectErrors.js";
import { ProjectRunStore } from "./ProjectRunStore.js";
export { ProjectRevisionConflict } from "../../domain/projectErrors.js";

type Failure =
  | EvidenceFileError
  | EvidenceIntegrityError
  | AnalysisCancelledError
  | AnalysisResourceConstraintError;
/** The canonical metadata location can move independently of target/output paths. */
export interface StoredProject {
  readonly directory: string;
  readonly revision: ProjectRevision;
}
const filename = (revision: number): string =>
  `${String(revision).padStart(16, "0")}.json`;
const invalid = (message: string, cause?: unknown): EvidenceIntegrityError =>
  new EvidenceIntegrityError(message, { cause });
const runMatchesScope = (
  run: ProjectRunRecord,
  project: ProjectManifest,
): boolean =>
  run.project_token.project_id === project.project_id &&
  run.scope_revision === project.scope_revision &&
  run.scope_sha256 === project.scope_sha256 &&
  run.source_sha256 === project.scope.target.sha256 &&
  run.requirements_sha256 === digestCanonicalValue(project.scope.requirements);
const runProjectionSchema = z.strictObject({
  expected: projectTokenSchema,
  run: projectRunRecordSchema,
  check: projectCheckRefSchema.optional(),
});
const checkMatchesRun = (
  check: ProjectCheckRef | undefined,
  run: ProjectRunRecord,
): boolean =>
  check === undefined ||
  (check.run_id === run.run_id &&
    run.check_ids.includes(check.check_id) &&
    check.scope_sha256 === run.scope_sha256 &&
    check.candidate_sha256 === run.candidate_sha256);
const withCheckReference = (
  references: ProjectCheckRef[],
  check: ProjectCheckRef | undefined,
): ProjectCheckRef[] =>
  check === undefined
    ? references
    : [...references.filter((item) => item.check_id !== check.check_id), check];
const canProjectRun = (
  run: ProjectRunRecord,
  project: ProjectManifest,
): boolean => {
  const lastRunId = project.run_ids.at(-1);
  return (
    lastRunId === undefined ||
    lastRunId === run.run_id ||
    (!["running", "cancelling"].includes(project.execution_status) &&
      (!project.run_ids.includes(run.run_id) ||
        run.execution_status === "running"))
  );
};

/**
 * Immutable revision slots provide cross-process compare-and-swap. The shared
 * atomic writer publishes a complete file exclusively, so two writers cannot
 * commit the same successor. There is no PID lock to reclaim after a crash.
 */
export class ProjectStore {
  constructor(private readonly resources: ArtifactResourceScope) {}

  /** Create metadata in a new caller-selected directory; retain incomplete state on I/O failure. */
  async create(
    directory: string,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<Result<StoredProject, Failure>> {
    if (signal?.aborted)
      return err(
        new AnalysisCancelledError("create_project", { cause: signal.reason }),
      );
    const parsed = createProjectInputSchema.safeParse(input);
    if (!parsed.success)
      return err(invalid("Invalid project intent", parsed.error));
    const selected = absoluteCallerPath(directory);
    const now = new Date().toISOString();
    const checked = projectManifestSchema.safeParse({
      schema: "tekvro.project",
      schema_version: 1,
      project_id: randomUUID(),
      revision: 1,
      created_at: now,
      updated_at: now,
      ...parsed.data,
      scope_sha256: digestCanonicalValue(parsed.data.scope),
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
    if (!checked.success)
      return err(invalid("Invalid project intent", checked.error));
    let canonical: string;
    try {
      await mkdir(selected, { recursive: false });
      canonical = await realpath(selected);
    } catch (cause: unknown) {
      const code: unknown =
        cause instanceof Error ? Reflect.get(cause, "code") : undefined;
      return err(
        new EvidenceFileError("write", code === "EEXIST" ? "exists" : "io", {
          path: selected,
          cause,
        }),
      );
    }
    return this.#publish(
      canonical,
      sealProjectRevision(checked.data, null),
      signal,
    );
  }

  /** Read a complete, contiguous chain. Unknown versions and broken commits remain errors. */
  async read(
    directory: string,
    signal?: AbortSignal,
  ): Promise<Result<StoredProject, Failure>> {
    if (signal?.aborted)
      return err(
        new AnalysisCancelledError("read_project", { cause: signal.reason }),
      );
    const selected = absoluteCallerPath(directory);
    let canonical: string;
    let names: string[];
    try {
      canonical = await realpath(selected);
      names = (await readdir(canonical))
        .filter((name) => /^[0-9]{16}\.json$/u.test(name))
        .sort();
    } catch (cause: unknown) {
      return err(
        new EvidenceFileError("read", "io", { path: selected, cause }),
      );
    }
    if (names.length === 0)
      return err(
        invalid(
          `Project has no committed revision: ${selected}. Preserve incomplete files and inspect the failed creation.`,
        ),
      );
    let previous: ProjectRevision | undefined;
    for (const [index, name] of names.entries()) {
      if (name !== filename(index + 1))
        return err(
          invalid(`Project revision gap at ${index + 1}: ${selected}`),
        );
      const loaded = await readJsonFile(
        join(canonical, name),
        signal,
        this.resources,
        "read_project",
      );
      if (!loaded.ok) return loaded;
      if (
        loaded.value !== null &&
        typeof loaded.value === "object" &&
        "schema_version" in loaded.value &&
        loaded.value.schema_version !== 1
      )
        return err(
          invalid(
            `Unsupported project schema version ${String(loaded.value.schema_version)}. Open with a compatible Tekvro version; the source remains untouched.`,
          ),
        );
      const parsed = projectRevisionSchema.safeParse(loaded.value);
      if (!parsed.success)
        return err(
          invalid(
            `Unsupported or damaged project revision ${name}; preserve the original file`,
            parsed.error,
          ),
        );
      const current = parsed.data;
      if (
        current.project.revision !== index + 1 ||
        current.previous_digest !== (previous?.digest ?? null)
      )
        return err(invalid(`Project revision chain mismatch: ${name}`));
      if (
        previous !== undefined &&
        (current.project.project_id !== previous.project.project_id ||
          current.project.created_at !== previous.project.created_at ||
          Date.parse(current.project.updated_at) <
            Date.parse(previous.project.updated_at))
      )
        return err(
          invalid(`Project identity or time changed across revisions: ${name}`),
        );
      if (previous !== undefined) {
        const changedScope =
          previous.project.scope_sha256 !== current.project.scope_sha256;
        if (
          current.project.scope_revision !==
            previous.project.scope_revision + (changedScope ? 1 : 0) ||
          (changedScope && current.project.scope_change_reason === null)
        )
          return err(invalid("Project scope revision mismatch: " + name));
      }
      previous = current;
    }
    if (previous === undefined)
      return err(invalid("Project revision is missing"));
    return ok({ directory: canonical, revision: previous });
  }

  /** Commit a scope/reference edit against the exact previously read token. */
  async edit(
    directory: string,
    expectedInput: unknown,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<Result<StoredProject, Failure>> {
    if (signal?.aborted)
      return err(
        new AnalysisCancelledError("edit_project", { cause: signal.reason }),
      );
    const expected = projectTokenSchema.safeParse(expectedInput);
    const edit = projectEditSchema.safeParse(input);
    if (!expected.success || !edit.success)
      return err(
        invalid(
          "Invalid project edit or expected revision",
          !expected.success ? expected.error : undefined,
        ),
      );
    const loaded = await this.read(directory, signal);
    if (!loaded.ok) return loaded;
    const current = loaded.value.revision;
    const token = projectRevisionToken(current);
    if (digestCanonicalValue(expected.data) !== digestCanonicalValue(token))
      return err(new ProjectRevisionConflict(expected.data, token));
    const scope = edit.data.scope ?? current.project.scope;
    const scopeDigest = digestCanonicalValue(scope);
    const candidate =
      edit.data.candidate_sha256 === undefined
        ? current.project.candidate_sha256
        : edit.data.candidate_sha256;
    const scopeChanged = scopeDigest !== current.project.scope_sha256;
    if (
      ["running", "cancelling"].includes(current.project.execution_status) &&
      (scopeChanged || candidate !== current.project.candidate_sha256)
    )
      return err(
        invalid(
          "Project scope and candidate cannot change while its execution is active; cancel or finish that run first",
        ),
      );
    if (scopeChanged && edit.data.change_reason === undefined)
      return err(
        invalid("Changing project scope requires a recorded change_reason"),
      );
    const changed =
      scopeChanged || candidate !== current.project.candidate_sha256;
    const { change_reason, ...fields } = edit.data;
    const next = projectManifestSchema.safeParse({
      ...current.project,
      ...fields,
      scope,
      scope_sha256: scopeDigest,
      scope_revision: current.project.scope_revision + (scopeChanged ? 1 : 0),
      scope_change_reason: scopeChanged
        ? change_reason
        : current.project.scope_change_reason,
      revision: current.project.revision + 1,
      updated_at: new Date(
        Math.max(Date.now(), Date.parse(current.project.updated_at)),
      ).toISOString(),
      acceptance_status: changed
        ? "not_evaluated"
        : current.project.acceptance_status,
    });
    if (!next.success)
      return err(invalid("Invalid project revision", next.error));
    const written = await this.#publish(
      loaded.value.directory,
      sealProjectRevision(next.data, current.digest),
      signal,
    );
    if (
      !written.ok &&
      written.error instanceof EvidenceFileError &&
      written.error.reason === "exists"
    ) {
      const latest = await this.read(loaded.value.directory, signal);
      if (!latest.ok) return latest;
      return err(
        new ProjectRevisionConflict(
          expected.data,
          projectRevisionToken(latest.value.revision),
        ),
      );
    }
    return written;
  }

  /**
   * Project a committed, authenticated run boundary into metadata. Callers cannot
   * patch lifecycle fields through edit, and a check never grants global pass.
   */
  async recordRun(
    directory: string,
    expectedInput: unknown,
    runInput: unknown,
    options: { readonly check?: unknown; readonly signal?: AbortSignal } = {},
  ): Promise<Result<StoredProject, AnalysisError>> {
    const { check: checkInput, signal } = options;
    const request = runProjectionSchema.safeParse({
      expected: expectedInput,
      run: runInput,
      check: checkInput,
    });
    if (!request.success)
      return err(invalid("Invalid committed project run projection"));
    const { expected, run: observed, check } = request.data;
    const savedRun = await new ProjectRunStore(this.resources).read(
      directory,
      observed.run_id,
      signal,
    );
    if (!savedRun.ok) return savedRun;
    if (
      digestCanonicalValue(savedRun.value.run) !==
      digestCanonicalValue(observed)
    )
      return err(
        invalid("Run projection is not the latest committed run boundary"),
      );
    const loaded = await this.read(directory, signal);
    if (!loaded.ok) return loaded;
    const current = loaded.value.revision;
    const token = projectRevisionToken(current);
    if (digestCanonicalValue(expected) !== digestCanonicalValue(token))
      return err(new ProjectRevisionConflict(expected, token));
    if (!canProjectRun(observed, current.project))
      return err(
        invalid(
          "A different run is the current project execution; inspect it before selecting an older run",
        ),
      );
    if (!runMatchesScope(observed, current.project))
      return err(invalid("Run belongs to another project scope revision"));
    const origin = await this.#validateRunOrigin(
      loaded.value.directory,
      observed,
      signal,
    );
    if (!origin.ok) return origin;
    if (!checkMatchesRun(check, observed))
      return err(
        invalid("Check reference does not belong to the committed run"),
      );
    const next = projectManifestSchema.safeParse({
      ...current.project,
      revision: current.project.revision + 1,
      updated_at: new Date(
        Math.max(Date.now(), Date.parse(current.project.updated_at)),
      ).toISOString(),
      phase: observed.phase,
      execution_status: observed.execution_status,
      acceptance_status: observed.acceptance_status,
      candidate_sha256: observed.candidate_sha256,
      run_ids: [
        ...current.project.run_ids.filter((id) => id !== observed.run_id),
        observed.run_id,
      ],
      check_refs: withCheckReference(current.project.check_refs, check),
    });
    if (!next.success)
      return err(invalid("Invalid project run projection", next.error));
    const written = await this.#publish(
      loaded.value.directory,
      sealProjectRevision(next.data, current.digest),
      signal,
    );
    if (
      !written.ok &&
      written.error instanceof EvidenceFileError &&
      written.error.reason === "exists"
    ) {
      const latest = await this.read(loaded.value.directory, signal);
      return latest.ok
        ? err(
            new ProjectRevisionConflict(
              expected,
              projectRevisionToken(latest.value.revision),
            ),
          )
        : latest;
    }
    return written;
  }

  async #validateRunOrigin(
    directory: string,
    run: ProjectRunRecord,
    signal?: AbortSignal,
  ): Promise<Result<void, Failure>> {
    const origin = await readJsonFile(
      join(directory, filename(run.project_token.revision)),
      signal,
      this.resources,
      "project_run_origin",
    );
    if (!origin.ok) return origin;
    const original = projectRevisionSchema.safeParse(origin.value);
    if (
      !original.success ||
      digestCanonicalValue(projectRevisionToken(original.data)) !==
        digestCanonicalValue(run.project_token) ||
      !runMatchesScope(run, original.data.project)
    )
      return err(
        invalid("Run's original project revision cannot be authenticated"),
      );
    return ok(undefined);
  }

  async #publish(
    directory: string,
    revision: ProjectRevision,
    signal?: AbortSignal,
  ): Promise<Result<StoredProject, Failure>> {
    const serialized = `${JSON.stringify(revision)}\n`;
    // Validate exactly the serialized representation before exclusive publication.
    const checked = projectRevisionSchema.safeParse(JSON.parse(serialized));
    if (!checked.success)
      return err(invalid("Project serialization failed", checked.error));
    const written = await writeTextParts(
      [serialized],
      join(directory, filename(revision.project.revision)),
      false,
      this.resources,
      signal === undefined ? undefined : { signal, operation: "write_project" },
    );
    if (!written.ok) return written;
    return ok({ directory, revision: checked.data });
  }
}

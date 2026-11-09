import { randomUUID } from "node:crypto";
import { mkdir, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
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
  type ProjectRevision,
  type ProjectToken,
} from "../../domain/projectManifest.js";
import { err, ok, type Result } from "../../domain/result.js";
import { absoluteCallerPath } from "../../filesystem/callerPath.js";
import { readJsonFile, writeTextParts } from "../JsonFiles.js";

/** A stale writer must reopen the project and reapply its intended edit. */
export class ProjectRevisionConflict extends EvidenceIntegrityError {
  constructor(
    readonly expected: ProjectToken,
    readonly current: ProjectToken,
  ) {
    super(
      `Project revision conflict: expected ${expected.revision}, current ${current.revision}. Reopen the project before editing.`,
    );
  }
}

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

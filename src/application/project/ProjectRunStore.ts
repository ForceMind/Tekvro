import { mkdir, readdir, realpath, lstat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { ArtifactResourceScope } from "../../artifacts/ArtifactResourceScope.js";
import { AnalysisError } from "../../domain/analysisErrorBase.js";
import { AnalysisCancelledError } from "../../domain/analysisErrorCore.js";
import { digestCanonicalValue } from "../../domain/canonicalDigest.js";
import { digestSchema } from "../../domain/digests.js";
import {
  EvidenceFileError,
  EvidenceIntegrityError,
} from "../../domain/evidenceErrors.js";
import {
  projectRevisionSchema,
  projectRevisionToken,
} from "../../domain/projectManifest.js";
import {
  projectRunTokenSchema as tokenSchema,
  type ProjectRunSnapshot,
  type ProjectRunToken,
} from "../../domain/projectExecution.js";
import {
  createProjectRunRecord,
  projectRunRecordSchema,
  projectRunEventSchema,
  transitionProjectRun,
  type ProjectRunRecord,
  type ProjectRunEvent,
} from "../../domain/projectRun.js";
import { err, ok, type Result } from "../../domain/result.js";
import { absoluteCallerPath } from "../../filesystem/callerPath.js";
import { readJsonFile, writeTextParts } from "../JsonFiles.js";

const envelopeSchema = z
  .strictObject({
    schema: z.literal("tekvro.project-run-revision"),
    schema_version: z.literal(1),
    sequence: z.number().int().safe().positive(),
    previous_digest: digestSchema.nullable(),
    event: projectRunEventSchema.nullable(),
    run: projectRunRecordSchema,
    digest: digestSchema,
  })
  .superRefine((value, context) => {
    const { digest, ...body } = value;
    if (digest !== digestCanonicalValue(body))
      context.addIssue({
        code: "custom",
        path: ["digest"],
        message: "Run revision digest mismatch",
      });
    if (
      (value.sequence === 1) !==
      (value.event === null && value.previous_digest === null)
    )
      context.addIssue({
        code: "custom",
        path: ["event"],
        message: "Run event chain is incomplete",
      });
  });

type Envelope = z.infer<typeof envelopeSchema>;

/** Persisted run state; its token protects event publication across processes. */
export type StoredProjectRun = ProjectRunSnapshot;

const name = (sequence: number): string =>
  `${String(sequence).padStart(16, "0")}.json`;
const snapshot = (directory: string, value: Envelope): StoredProjectRun => ({
  directory,
  run: value.run,
  token: {
    run_id: value.run.run_id,
    sequence: value.sequence,
    digest: value.digest,
  },
});
const chainMatches = (
  current: Envelope,
  previous: Envelope | undefined,
  runId: string,
  sequence: number,
): boolean =>
  current.run.run_id === runId &&
  current.sequence === sequence &&
  current.previous_digest === (previous?.digest ?? null);
const conflict = (
  expected: ProjectRunToken,
  current: ProjectRunToken,
): EvidenceIntegrityError =>
  new EvidenceIntegrityError(
    "Project run revision conflict; inspect the current run before continuing",
    {
      diagnostics: { reason: "run_revision_conflict", expected, current },
    },
  );

/** Immutable run events live outside the candidate and survive coordinator exit. */
export class ProjectRunStore {
  constructor(private readonly resources: ArtifactResourceScope) {}

  /** Publish an idle initial record, without creating or launching a process. */
  async create(
    projectDirectory: string,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<Result<StoredProjectRun, AnalysisError>> {
    if (signal?.aborted)
      return err(
        new AnalysisCancelledError("create_project_run", {
          cause: signal.reason,
        }),
      );
    const checked = projectRunRecordSchema.safeParse(input);
    if (
      !checked.success ||
      checked.data.execution_status !== "idle" ||
      checked.data.attempt !== 0
    )
      return err(
        new EvidenceIntegrityError(
          "A new run must be a validated idle record",
          { cause: checked.success ? undefined : checked.error },
        ),
      );
    let directory: string;
    try {
      const root = await realpath(absoluteCallerPath(projectDirectory));
      const initial = await this.#validateInitial(root, checked.data, signal);
      if (!initial.ok) return initial;
      const runs = join(root, "runs");
      await mkdir(runs, { recursive: true });
      if (
        (await lstat(runs)).isSymbolicLink() ||
        (await realpath(runs)) !== runs
      )
        return err(
          new EvidenceIntegrityError(
            "Project runs directory must remain inside its metadata root",
          ),
        );
      directory = join(runs, checked.data.run_id);
      await mkdir(directory, { recursive: false });
    } catch (cause: unknown) {
      return err(
        new EvidenceFileError("write", "io", { path: projectDirectory, cause }),
      );
    }
    return this.#publish(
      directory,
      {
        schema: "tekvro.project-run-revision",
        schema_version: 1,
        sequence: 1,
        previous_digest: null,
        event: null,
        run: checked.data,
      },
      signal,
    );
  }

  /** Reopen and verify every event, including the actual domain transition it records. */
  async read(
    projectDirectory: string,
    runId: unknown,
    signal?: AbortSignal,
  ): Promise<Result<StoredProjectRun, AnalysisError>> {
    if (signal?.aborted)
      return err(
        new AnalysisCancelledError("inspect_project_run", {
          cause: signal.reason,
        }),
      );
    const id = z.string().uuid().safeParse(runId);
    if (!id.success)
      return err(
        new EvidenceIntegrityError("Invalid project run identity", {
          cause: id.error,
        }),
      );
    let directory: string;
    let root: string;
    let names: string[];
    try {
      root = await realpath(absoluteCallerPath(projectDirectory));
      const selected = join(root, "runs", id.data);
      directory = await realpath(selected);
      if (directory !== selected)
        return err(
          new EvidenceIntegrityError(
            "Project run history cannot be redirected through a symbolic link",
          ),
        );
      names = (await readdir(directory))
        .filter((entry) => /^[0-9]{16}\.json$/u.test(entry))
        .sort();
    } catch (cause: unknown) {
      return err(
        new EvidenceFileError("read", "io", { path: projectDirectory, cause }),
      );
    }
    let previous: Envelope | undefined;
    for (const [index, filename] of names.entries()) {
      if (filename !== name(index + 1))
        return err(
          new EvidenceIntegrityError(`Project run revision gap: ${filename}`),
        );
      const read = await readJsonFile(
        join(directory, filename),
        signal,
        this.resources,
        "inspect_project_run",
      );
      if (!read.ok) return read;
      const parsed = envelopeSchema.safeParse(read.value);
      if (!parsed.success)
        return err(
          new EvidenceIntegrityError(
            `Damaged or unsupported run revision: ${filename}`,
            { cause: parsed.error },
          ),
        );
      const current = parsed.data;
      if (!chainMatches(current, previous, id.data, index + 1))
        return err(
          new EvidenceIntegrityError(`Project run chain mismatch: ${filename}`),
        );
      if (previous === undefined) {
        const initial = await this.#validateInitial(root, current.run, signal);
        if (!initial.ok) return initial;
      } else {
        const transitioned = transitionProjectRun(previous.run, current.event);
        if (
          !transitioned.ok ||
          digestCanonicalValue(transitioned.value) !==
            digestCanonicalValue(current.run)
        )
          return err(
            new EvidenceIntegrityError(
              `Project run history contains an invalid transition: ${filename}`,
              { cause: transitioned.ok ? undefined : transitioned.error },
            ),
          );
      }
      previous = current;
    }
    return previous === undefined
      ? err(new EvidenceIntegrityError("Project run has no committed event"))
      : ok(snapshot(directory, previous));
  }

  /** Submit one allowed state transition against an exact run token. */
  async append(
    projectDirectory: string,
    expectedInput: unknown,
    event: ProjectRunEvent,
    signal?: AbortSignal,
  ): Promise<Result<StoredProjectRun, AnalysisError>> {
    const expected = tokenSchema.safeParse(expectedInput);
    if (!expected.success)
      return err(
        new EvidenceIntegrityError("Invalid expected run revision", {
          cause: expected.error,
        }),
      );
    const read = await this.read(
      projectDirectory,
      expected.data.run_id,
      signal,
    );
    if (!read.ok) return read;
    if (
      digestCanonicalValue(expected.data) !==
      digestCanonicalValue(read.value.token)
    )
      return err(conflict(expected.data, read.value.token));
    const transitioned = transitionProjectRun(read.value.run, event);
    if (!transitioned.ok) return transitioned;
    const written = await this.#publish(
      read.value.directory,
      {
        schema: "tekvro.project-run-revision",
        schema_version: 1,
        sequence: expected.data.sequence + 1,
        previous_digest: expected.data.digest,
        event,
        run: transitioned.value,
      },
      signal,
    );
    if (
      !written.ok &&
      written.error instanceof EvidenceFileError &&
      written.error.reason === "exists"
    ) {
      const latest = await this.read(
        projectDirectory,
        expected.data.run_id,
        signal,
      );
      return latest.ok
        ? err(conflict(expected.data, latest.value.token))
        : latest;
    }
    return written;
  }

  async #publish(
    directory: string,
    body: Omit<Envelope, "digest">,
    signal?: AbortSignal,
  ): Promise<Result<StoredProjectRun, AnalysisError>> {
    const checked = envelopeSchema.safeParse({
      ...body,
      digest: digestCanonicalValue(body),
    });
    if (!checked.success)
      return err(
        new EvidenceIntegrityError("Invalid run publication", {
          cause: checked.error,
        }),
      );
    const written = await writeTextParts(
      [`${JSON.stringify(checked.data)}\n`],
      join(directory, name(body.sequence)),
      false,
      this.resources,
      signal === undefined
        ? undefined
        : { signal, operation: "write_project_run" },
    );
    return written.ok ? ok(snapshot(directory, checked.data)) : written;
  }

  async #validateInitial(
    projectDirectory: string,
    run: ProjectRunRecord,
    signal?: AbortSignal,
  ): Promise<Result<void, AnalysisError>> {
    const read = await readJsonFile(
      join(projectDirectory, name(run.project_token.revision)),
      signal,
      this.resources,
      "inspect_project_run_origin",
    );
    if (!read.ok) return read;
    const origin = projectRevisionSchema.safeParse(read.value);
    if (
      !origin.success ||
      digestCanonicalValue(projectRevisionToken(origin.data)) !==
        digestCanonicalValue(run.project_token)
    )
      return err(
        new EvidenceIntegrityError(
          "Initial run project revision cannot be authenticated",
          {
            cause: origin.success ? undefined : origin.error,
          },
        ),
      );
    const rebuilt = createProjectRunRecord({
      project: origin.data,
      run_id: run.run_id,
      phase: run.phase,
      created_at: run.created_at,
      adapter: run.adapter,
      budget: run.budget,
    });
    if (
      !rebuilt.ok ||
      digestCanonicalValue(rebuilt.value) !== digestCanonicalValue(run)
    )
      return err(
        new EvidenceIntegrityError(
          "Initial run does not match its project origin and unused budgets",
          {
            cause: rebuilt.ok ? undefined : rebuilt.error,
          },
        ),
      );
    return ok(undefined);
  }
}

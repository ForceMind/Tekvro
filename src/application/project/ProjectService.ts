import { ArtifactResourceScope } from "../../artifacts/ArtifactResourceScope.js";
import {
  createProjectRequestSchema,
  editProjectRequestSchema,
  inspectProjectRequestSchema,
} from "../../contracts/projectToolContracts.js";
import { AnalysisError } from "../../domain/analysisErrorBase.js";
import { AnalysisCancelledError } from "../../domain/analysisErrorCore.js";
import { analysisInputErrorFromIssues } from "../../domain/inputIssueProjection.js";
import { projectRevisionToken } from "../../domain/projectManifest.js";
import type { ProjectSnapshot } from "../../domain/projectSnapshot.js";
import { ProviderAdapterError } from "../../domain/providerAdapterError.js";
import { err, ok, type Result } from "../../domain/result.js";
import type { ExecutionOptions } from "../AnalysisProvider.js";
import { ProjectStore, type StoredProject } from "./ProjectStore.js";

type ProjectResult = Result<ProjectSnapshot, AnalysisError>;

/** Shared CLI/MCP project metadata operations with one resource owner. */
export class ProjectService {
  readonly #store: ProjectStore;
  readonly #active = new Set<Promise<ProjectResult>>();
  #closed = false;
  #closing: Promise<void> | undefined;

  constructor(private readonly resources: ArtifactResourceScope) {
    this.#store = new ProjectStore(resources);
  }

  /** Stop new operations, finish admitted work and retry retained cleanup. */
  close(): Promise<void> {
    this.#closed = true;
    if (this.#closing !== undefined) return this.#closing;
    const attempt = (async () => {
      await Promise.allSettled(this.#active);
      await this.resources.close();
    })();
    this.#closing = attempt;
    void attempt.catch(() => {
      if (this.#closing === attempt) this.#closing = undefined;
    });
    return attempt;
  }

  /** Create a new immutable history from a validated caller-selected scope. */
  create(input: unknown, options?: ExecutionOptions): Promise<ProjectResult> {
    return this.#execute("create_project", options, async () => {
      const parsed = createProjectRequestSchema.safeParse(input);
      if (!parsed.success)
        return err(
          analysisInputErrorFromIssues(
            "create_project",
            parsed.error.issues,
            input,
            { cause: parsed.error },
          ),
        );
      return this.#store.create(
        parsed.data.directory,
        parsed.data.project,
        options?.signal,
      );
    });
  }

  /** Verify and return the latest committed revision without changing it. */
  inspect(input: unknown, options?: ExecutionOptions): Promise<ProjectResult> {
    return this.#execute("inspect_project", options, async () => {
      const parsed = inspectProjectRequestSchema.safeParse(input);
      if (!parsed.success)
        return err(
          analysisInputErrorFromIssues(
            "inspect_project",
            parsed.error.issues,
            input,
            { cause: parsed.error },
          ),
        );
      return this.#store.read(parsed.data.directory, options?.signal);
    });
  }

  /** Append only the permitted edit fields using the exact previous token. */
  edit(input: unknown, options?: ExecutionOptions): Promise<ProjectResult> {
    return this.#execute("edit_project", options, async () => {
      const parsed = editProjectRequestSchema.safeParse(input);
      if (!parsed.success)
        return err(
          analysisInputErrorFromIssues(
            "edit_project",
            parsed.error.issues,
            input,
            { cause: parsed.error },
          ),
        );
      return this.#store.edit(
        parsed.data.directory,
        parsed.data.expected,
        parsed.data.edit,
        options?.signal,
      );
    });
  }

  #execute(
    operation: string,
    options: ExecutionOptions | undefined,
    execute: () => Promise<Result<StoredProject, AnalysisError>>,
  ): Promise<ProjectResult> {
    if (options?.signal?.aborted)
      return Promise.resolve(
        err(
          new AnalysisCancelledError(operation, {
            cause: options.signal.reason,
          }),
        ),
      );
    if (this.#closed)
      return Promise.resolve(
        err(
          new ProviderAdapterError("project", operation, {
            userMessage:
              "The project service is closed. Open a new CLI or MCP session.",
          }),
        ),
      );
    // Track the whole store operation separately: nesting ResourceScope.run
    // around the store's own I/O admission can deadlock a cleanup retry.
    const running: Promise<ProjectResult> = Promise.resolve()
      .then(execute)
      .then((result): ProjectResult => {
        if (!result.ok) return result;
        const snapshot: ProjectSnapshot = {
          ...result.value,
          token: projectRevisionToken(result.value.revision),
        };
        if (options?.signal?.aborted)
          return err(
            new AnalysisCancelledError(operation, {
              cause: options.signal.reason,
              partialObservation: snapshot,
            }),
          );
        return ok(snapshot);
      })
      .catch((cause: unknown): ProjectResult =>
        err(
          cause instanceof AnalysisError
            ? cause
            : new ProviderAdapterError("project", operation, { cause }),
        ),
      );
    this.#active.add(running);
    void running.then(() => this.#active.delete(running));
    return running;
  }
}

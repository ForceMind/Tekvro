import { randomUUID } from "node:crypto";
import type { z } from "zod";

import { ArtifactResourceScope } from "../../artifacts/ArtifactResourceScope.js";
import { AnalysisError } from "../../domain/analysisErrorBase.js";
import { AnalysisCancelledError } from "../../domain/analysisErrorCore.js";
import { digestCanonicalValue } from "../../domain/canonicalDigest.js";
import { EvidenceIntegrityError } from "../../domain/evidenceErrors.js";
import { analysisInputErrorFromIssues } from "../../domain/inputIssueProjection.js";
import { ProjectRevisionConflict } from "../../domain/projectErrors.js";
import {
  adjustProjectRunBudgetRequestSchema,
  buildProjectRequestSchema,
  checkProjectRequestSchema,
  inspectProjectRunRequestSchema,
  refineProjectRequestSchema,
  type ProjectRunToken,
} from "../../domain/projectExecution.js";
import { projectRevisionToken } from "../../domain/projectManifest.js";
import { createProjectRunRecord } from "../../domain/projectRun.js";
import { projectRunCleanupIsSettled } from "../../domain/projectRunTransitions.js";
import { ProviderAdapterError } from "../../domain/providerAdapterError.js";
import { err, ok, type Result } from "../../domain/result.js";
import { ProjectBuildStage } from "./ProjectBuildStage.js";
import { ProjectCheckService } from "./ProjectCheckService.js";
import { ProjectCheckStage } from "./ProjectCheckStage.js";
import {
  ProjectRunState,
  projectRunTime,
  type ProjectRunContext,
  type ProjectRunResult,
} from "./ProjectRunState.js";
import type { StoredProject } from "./ProjectStore.js";
import {
  acquireProjectWorkspace,
  type ProjectWorkspace,
} from "./ProjectWorkspace.js";
import type { ProjectBuilderPort } from "./ProjectWorkflowPorts.js";

export type { ProjectExecutionSnapshot } from "../../domain/projectExecution.js";

/**
 * Bounded shared project execution. A completed build durably saves its pending
 * check; checking never replays the Builder or silently adopts a provider session.
 */
export class ProjectRunService {
  readonly #state: ProjectRunState;
  readonly #checks: ProjectCheckService;
  readonly #build: ProjectBuildStage;
  readonly #check: ProjectCheckStage;
  readonly #active = new Map<Promise<ProjectRunResult>, AbortController>();
  #closed = false;
  #closing: Promise<void> | undefined;

  constructor(
    private readonly resources: ArtifactResourceScope,
    private readonly builder: ProjectBuilderPort,
    checks?: ProjectCheckService,
    private readonly leaseDirectory?: string,
  ) {
    this.#state = new ProjectRunState(resources);
    this.#checks = checks ?? new ProjectCheckService(resources);
    this.#build = new ProjectBuildStage(
      resources,
      builder,
      this.#checks,
      this.#state,
    );
    this.#check = new ProjectCheckStage(this.#checks, this.#state);
  }

  /** Cancel owned live work, persist its outcome, and retry exact retained owners. */
  close(): Promise<void> {
    this.#closed = true;
    for (const controller of this.#active.values())
      controller.abort("project_service_closed");
    if (this.#closing !== undefined) return this.#closing;
    const closing = (async () => {
      await Promise.allSettled(this.#active.keys());
      const outcomes = await Promise.allSettled([
        this.builder.close?.() ?? Promise.resolve(),
        this.resources.close(),
      ]);
      const failures = outcomes.filter(
        (entry): entry is PromiseRejectedResult => entry.status === "rejected",
      );
      if (failures.length > 0)
        throw new AggregateError(
          failures.map((entry) => entry.reason),
          "Project runtime cleanup incomplete",
        );
    })();
    this.#closing = closing;
    void closing.catch(() => {
      if (this.#closing === closing) this.#closing = undefined;
    });
    return closing;
  }

  /** Create and execute one bounded builder attempt, ending at a durable check boundary. */
  build(input: unknown, signal?: AbortSignal): Promise<ProjectRunResult> {
    return this.#execute(signal, async (control) => {
      const parsed = buildProjectRequestSchema.safeParse(input);
      if (!parsed.success)
        return err(
          analysisInputErrorFromIssues(
            "build_project",
            parsed.error.issues,
            input,
            { cause: parsed.error },
          ),
        );
      const request = parsed.data;
      const project = await this.#state.projects.read(
        request.directory,
        control,
      );
      if (!project.ok) return project;
      const token = projectRevisionToken(project.value.revision);
      if (
        digestCanonicalValue(token) !== digestCanonicalValue(request.expected)
      )
        return err(new ProjectRevisionConflict(request.expected, token));
      const runId = randomUUID();
      const acquired = await this.#acquire(project.value, runId);
      if (!acquired.ok) return acquired;
      let prepared: Result<ProjectRunContext, AnalysisError>;
      try {
        prepared = await this.#prepare(
          project.value,
          acquired.value,
          { ...request, runId },
          control,
        );
      } catch (cause: unknown) {
        prepared = err(asProjectFailure("prepare_project_run", cause));
      }
      if (!prepared.ok)
        return this.#releasePreparation(acquired.value, prepared.error);
      const context = prepared.value;
      return this.#withWorkspace(context, () =>
        this.#build.run(
          context,
          {
            instruction: request.instruction,
            checkerPath: request.checker_path,
            kind: "start",
          },
          control,
        ),
      );
    });
  }

  /** Read immutable run events and the current project without starting any process. */
  inspect(input: unknown, signal?: AbortSignal): Promise<ProjectRunResult> {
    return this.#execute(signal, async (control) => {
      const parsed = inspectProjectRunRequestSchema.safeParse(input);
      if (!parsed.success)
        return err(
          analysisInputErrorFromIssues(
            "inspect_project_run",
            parsed.error.issues,
            input,
            { cause: parsed.error },
          ),
        );
      return this.#state.read(
        parsed.data.directory,
        parsed.data.run_id,
        control,
      );
    });
  }

  /** Execute exactly the saved pending check; an interrupted command cannot be replayed. */
  checkPending(
    input: unknown,
    signal?: AbortSignal,
  ): Promise<ProjectRunResult> {
    return this.#execute(signal, async (control) => {
      const parsed = checkProjectRequestSchema.safeParse(input);
      if (!parsed.success)
        return err(
          analysisInputErrorFromIssues(
            "check_project",
            parsed.error.issues,
            input,
            { cause: parsed.error },
          ),
        );
      const loaded = await this.#readExpected(parsed.data, control);
      if (!loaded.ok) return loaded;
      const acquired = await this.#acquire(
        loaded.value.project,
        parsed.data.run_id,
      );
      if (!acquired.ok) return acquired;
      const context = { ...loaded.value, workspace: acquired.value };
      return this.#withWorkspace(context, () =>
        this.#check.run(context, parsed.data.checker_path, control),
      );
    });
  }

  /** Refine a previously checked run only when its saved budgets permit another attempt. */
  refine(input: unknown, signal?: AbortSignal): Promise<ProjectRunResult> {
    return this.#continueBuilder(input, "refine", signal);
  }

  /** Start a fresh attempt from a safe paused build boundary, retaining all consumed budget. */
  resumeBuild(input: unknown, signal?: AbortSignal): Promise<ProjectRunResult> {
    return this.#continueBuilder(input, "resume", signal);
  }

  /** Explicitly revise finite limits at an idle/paused boundary without launching work. */
  adjustBudget(
    input: unknown,
    signal?: AbortSignal,
  ): Promise<ProjectRunResult> {
    return this.#execute(signal, async (control) => {
      const parsed = adjustProjectRunBudgetRequestSchema.safeParse(input);
      if (!parsed.success)
        return err(
          analysisInputErrorFromIssues(
            "adjust_project_run_budget",
            parsed.error.issues,
            input,
            { cause: parsed.error },
          ),
        );
      const loaded = await this.#readExpected(parsed.data, control);
      if (!loaded.ok) return loaded;
      const acquired = await this.#acquire(
        loaded.value.project,
        parsed.data.run_id,
      );
      if (!acquired.ok) return acquired;
      const context = { ...loaded.value, workspace: acquired.value };
      return this.#withWorkspace(context, async () => {
        const guard = await this.#state.guard(context);
        if (!guard.ok) return guard;
        const changed = await this.#state.append(context, {
          kind: "set_budget",
          budget: parsed.data.budget,
          reason: parsed.data.reason,
          ...projectRunTime(context.execution.run),
        });
        return changed.ok ? ok(this.#state.snapshot(context)) : changed;
      });
    });
  }

  #continueBuilder(
    input: unknown,
    kind: "refine" | "resume",
    signal?: AbortSignal,
  ): Promise<ProjectRunResult> {
    return this.#execute(signal, async (control) => {
      const parsed = refineProjectRequestSchema.safeParse(input);
      if (!parsed.success)
        return err(
          analysisInputErrorFromIssues(
            kind === "refine" ? "refine_project" : "resume_project_build",
            parsed.error.issues,
            input,
            { cause: parsed.error },
          ),
        );
      const loaded = await this.#readExpected(parsed.data, control);
      if (!loaded.ok) return loaded;
      if (loaded.value.execution.run.adapter?.id !== this.builder.id)
        return err(
          new EvidenceIntegrityError(
            "The selected Builder differs from this run; implicit fallback is not allowed",
          ),
        );
      const acquired = await this.#acquire(
        loaded.value.project,
        parsed.data.run_id,
      );
      if (!acquired.ok) return acquired;
      const context = { ...loaded.value, workspace: acquired.value };
      return this.#withWorkspace(context, () =>
        this.#build.run(
          context,
          {
            instruction: parsed.data.instruction,
            checkerPath: parsed.data.checker_path,
            kind,
          },
          control,
        ),
      );
    });
  }

  async #prepare(
    project: StoredProject,
    workspace: ProjectWorkspace,
    request: z.infer<typeof buildProjectRequestSchema> & { runId: string },
    signal: AbortSignal,
  ): Promise<Result<ProjectRunContext, AnalysisError>> {
    const recovered = await this.#state.prepareProject(project, signal);
    if (!recovered.ok) return recovered;
    let current = recovered.value;
    const prepared = await this.#checks.prepare(
      {
        project: current.revision.project,
        run_id: request.runId,
        checker_path: request.checker_path,
      },
      signal,
    );
    if (!prepared.ok) return prepared;
    if (
      current.revision.project.candidate_sha256 !==
      prepared.value.candidate_sha256
    ) {
      const bound = await this.#state.projects.edit(
        current.directory,
        projectRevisionToken(current.revision),
        { candidate_sha256: prepared.value.candidate_sha256 },
        signal,
      );
      if (!bound.ok) return bound;
      current = bound.value;
    }
    const record = createProjectRunRecord({
      project: current.revision,
      run_id: request.runId,
      phase: "build",
      created_at: new Date().toISOString(),
      adapter: {
        id: this.builder.id,
        version: null,
        model: request.model ?? null,
      },
      ...(request.budget === undefined ? {} : { budget: request.budget }),
    });
    if (!record.ok) return record;
    const created = await this.#state.runs.create(
      current.directory,
      record.value,
      signal,
    );
    if (!created.ok) return created;
    return ok({
      project: current,
      execution: created.value,
      workspace,
      prepared: prepared.value,
    });
  }

  async #readExpected(
    request: { directory: string; run_id: string; expected: ProjectRunToken },
    signal: AbortSignal,
  ): Promise<ProjectRunResult> {
    const loaded = await this.#state.read(
      request.directory,
      request.run_id,
      signal,
    );
    if (!loaded.ok) return loaded;
    if (
      digestCanonicalValue(request.expected) !==
      digestCanonicalValue(loaded.value.execution.token)
    )
      return err(
        new EvidenceIntegrityError(
          "The selected run revision changed before this operation",
        ),
      );
    return loaded;
  }

  #acquire(
    project: StoredProject,
    runId: string,
  ): Promise<Result<ProjectWorkspace, AnalysisError>> {
    return acquireProjectWorkspace(
      project.directory,
      project.revision.project,
      runId,
      this.resources,
      this.leaseDirectory,
    );
  }

  async #withWorkspace(
    context: ProjectRunContext,
    execute: () => Promise<ProjectRunResult>,
  ): Promise<ProjectRunResult> {
    let result: ProjectRunResult;
    try {
      result = await execute();
    } catch (cause: unknown) {
      result = await this.#state.fail(
        context,
        asProjectFailure("execute_project_run", cause),
        "unknown",
      );
    }
    const released = await context.workspace.release(
      projectRunCleanupIsSettled(context.execution.run.cleanup_status),
    );
    if (!released.ok) {
      if (!result.ok) result.error.retainSecondaryFailure(released.error);
      else result = released;
    }
    if (!result.ok)
      result.error.retainPartialObservation({
        kind: "project_execution",
        ...this.#state.snapshot(context),
      });
    return result;
  }

  async #releasePreparation(
    workspace: ProjectWorkspace,
    error: AnalysisError,
  ): Promise<ProjectRunResult> {
    const released = await workspace.release(true);
    if (!released.ok) error.retainSecondaryFailure(released.error);
    return err(error);
  }

  #execute(
    signal: AbortSignal | undefined,
    execute: (signal: AbortSignal) => Promise<ProjectRunResult>,
  ): Promise<ProjectRunResult> {
    if (signal?.aborted)
      return Promise.resolve(
        err(
          new AnalysisCancelledError("execute_project_run", {
            cause: signal.reason,
          }),
        ),
      );
    if (this.#closed)
      return Promise.resolve(
        err(
          new ProviderAdapterError("project", "execute_project_run", {
            userMessage: "Project runtime is closed",
          }),
        ),
      );
    const controller = new AbortController();
    const control =
      signal === undefined
        ? controller.signal
        : AbortSignal.any([signal, controller.signal]);
    const pending = Promise.resolve()
      .then(() => execute(control))
      .catch((cause: unknown): ProjectRunResult =>
        err(asProjectFailure("execute_project_run", cause)),
      );
    this.#active.set(pending, controller);
    void pending.then(() => this.#active.delete(pending));
    return pending;
  }
}

const asProjectFailure = (operation: string, cause: unknown): AnalysisError =>
  cause instanceof AnalysisError
    ? cause
    : new ProviderAdapterError("project", operation, { cause });

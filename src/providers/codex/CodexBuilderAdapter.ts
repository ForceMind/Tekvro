import { z } from "zod";
import type {
  ProjectBuilderEvent,
  ProjectBuilderPort,
  ProjectBuilderRequest,
  ProjectBuilderResult,
} from "../../application/project/ProjectWorkflowPorts.js";
import {
  AnalysisError,
  type AnalysisErrorOptions,
} from "../../domain/analysisErrorBase.js";
import {
  AnalysisCancelledError,
  AnalysisCapabilityUnavailableError,
  AnalysisProtocolError,
} from "../../domain/analysisErrorCore.js";
import { analysisInputErrorFromIssues } from "../../domain/inputIssueProjection.js";
import {
  absoluteLocalPathStringSchema,
  localPathStringSchema,
  nulFreeStringSchema,
} from "../../domain/localPath.js";
import { projectRunRecordSchema } from "../../domain/projectRun.js";
import { ProviderAdapterError } from "../../domain/providerAdapterError.js";
import { ProviderCleanupError } from "../../domain/providerCleanupError.js";
import { err, ok, type Result } from "../../domain/result.js";
import { absoluteCallerPath } from "../../filesystem/callerPath.js";
import { OwnedCommandFailure } from "../../process/OwnedCommand.js";
import type { ProviderProcessSupervisor } from "../../process/ProviderProcess.js";
import { snapshotEnvironment } from "../../process/snapshotEnvironment.js";
import {
  executeCodexCommand,
  type CodexCommandOutcome,
  type CodexProcessLauncher,
} from "./CodexCommand.js";
import { CodexJsonlStream } from "./CodexJsonlStream.js";
import {
  CODEX_BUILD_OPERATION as OPERATION,
  CODEX_BUILD_LIMITATIONS as LIMITATIONS,
  commandDetails,
  isOrdinaryNonzero,
  builderObservation,
  physicalError,
  outputLimit,
  withCleanup,
} from "./CodexOutcome.js";

const DEFAULT_OUTPUT_BYTES = 8 * 1024 * 1024;
const requestSchema = z.strictObject({
  run: projectRunRecordSchema,
  workspace: absoluteLocalPathStringSchema,
  instruction: nulFreeStringSchema.min(1),
  timeout_ms: z.number().int().safe().positive(),
});
const configurationSchema = z.strictObject({
  command: localPathStringSchema,
  maxOutputBytes: z.number().int().safe().positive(),
});

/** Only installation observations; no account, model or real-build qualification is implied. */
export interface CodexBuilderProbe {
  readonly id: "codex";
  readonly command: string;
  readonly installed: true;
  readonly version: string | null;
  readonly version_output: string;
  readonly declared_flags: {
    readonly json: boolean;
    readonly sandbox: boolean;
    readonly cd: boolean;
    readonly model: boolean;
  };
  readonly qualification: "unverified";
  readonly limitations: readonly string[];
}

interface RetainedCodexProcess {
  readonly resources: readonly string[];
  readonly errors: Set<AnalysisError>;
  reason: string;
}

/** One explicitly selected local Codex CLI, with no account or adapter fallback. */
export class CodexBuilderAdapter implements ProjectBuilderPort {
  readonly id = "codex";
  readonly #command: string;
  readonly #maxOutputBytes: number;
  readonly #environment: Readonly<NodeJS.ProcessEnv>;
  readonly #launcher: CodexProcessLauncher;
  readonly #active = new Set<Promise<unknown>>();
  readonly #retained = new Map<
    ProviderProcessSupervisor,
    RetainedCodexProcess
  >();
  readonly #shutdown = new AbortController();
  #closing: Promise<void> | undefined;

  constructor(
    options: {
      readonly command?: string;
      readonly environment?: Readonly<NodeJS.ProcessEnv>;
      readonly maxOutputBytes?: number;
      readonly launcher?: CodexProcessLauncher;
    } = {},
  ) {
    const command = options.command ?? "codex";
    this.#command = /[\\/]/u.test(command)
      ? absoluteCallerPath(command)
      : command;
    this.#maxOutputBytes = options.maxOutputBytes ?? DEFAULT_OUTPUT_BYTES;
    this.#environment = snapshotEnvironment(options.environment ?? process.env);
    this.#launcher = options.launcher;
  }

  /** Run one new bounded turn inside the selected output directory. */
  run(
    request: ProjectBuilderRequest,
    signal?: AbortSignal,
    onEvent?: (event: ProjectBuilderEvent) => void | Promise<void>,
  ): Promise<Result<ProjectBuilderResult, AnalysisError>> {
    return this.#operation(OPERATION, signal, async (selectedSignal) => {
      const input = requestSchema.safeParse(request);
      if (!input.success)
        return err(
          analysisInputErrorFromIssues(OPERATION, input.error.issues, request, {
            cause: input.error,
          }),
        );
      if (input.data.run.adapter?.id !== this.id)
        return err(
          new AnalysisCapabilityUnavailableError(
            this.id,
            OPERATION,
            "The run does not select the Codex builder adapter",
          ),
        );
      const stream = new CodexJsonlStream(this.#maxOutputBytes, onEvent);
      const outcome = await executeCodexCommand({
        command: this.#command,
        arguments: [
          "exec",
          "--sandbox",
          "workspace-write",
          "--json",
          "--cd",
          input.data.workspace,
          "--skip-git-repo-check",
          ...(input.data.run.adapter.model === null
            ? []
            : ["--model", input.data.run.adapter.model]),
          "-",
        ],
        environment: this.#environment,
        timeoutMs: input.data.timeout_ms,
        maxOutputBytes: this.#maxOutputBytes,
        signal: AbortSignal.any([selectedSignal, stream.exceeded]),
        workspace: input.data.workspace,
        instruction: input.data.instruction,
        stdout: stream,
        ...(this.#launcher === undefined ? {} : { launcher: this.#launcher }),
      });
      return this.#buildResult(
        outcome,
        stream,
        input.data.timeout_ms,
        selectedSignal,
      );
    });
  }

  /** Refuse unqualified session reuse; never silently substitute a fresh turn. */
  resume(
    _request: ProjectBuilderRequest,
    sessionId: string,
  ): Promise<Result<ProjectBuilderResult, AnalysisError>> {
    return Promise.resolve(
      err(
        new AnalysisCapabilityUnavailableError(
          this.id,
          OPERATION,
          "Codex session resumption has not passed a real workflow qualification",
          {
            diagnostics: { session_id: sessionId, qualification: "unverified" },
            remediationAction:
              "Keep the recorded session ID. Resume support requires a separately qualified Codex workflow; no new session was started.",
          },
        ),
      ),
    );
  }

  /** Inspect --version and --help without opening an authenticated agent turn. */
  probe(
    signal?: AbortSignal,
  ): Promise<Result<CodexBuilderProbe, AnalysisError>> {
    return this.#operation(
      "probe_codex_builder",
      signal,
      async (selectedSignal) => {
        const outputs: string[] = [];
        for (const args of [["--version"], ["exec", "--help"]]) {
          const outcome = await executeCodexCommand({
            command: this.#command,
            arguments: args,
            environment: this.#environment,
            timeoutMs: 5_000,
            maxOutputBytes: this.#maxOutputBytes,
            signal: selectedSignal,
            ...(this.#launcher === undefined
              ? {}
              : { launcher: this.#launcher }),
          });
          const details = commandDetails(outcome, "probe_codex_builder");
          const physical = physicalError({
            outcome,
            operation: "probe_codex_builder",
            timeoutMs: 5_000,
            signal: selectedSignal,
            details,
          });
          const cleanup = this.#cleanupError(
            outcome,
            "probe_codex_builder",
            details,
          );
          if (cleanup !== undefined)
            return err(withCleanup(physical, cleanup, "probe_codex_builder"));
          if (physical !== undefined) return err(physical);
          if (
            outcome.snapshot === null ||
            outcome.snapshot.stdout.invalidUtf8 === true
          )
            return err(
              new AnalysisProtocolError(
                "Codex probe returned unreadable output",
                details,
              ),
            );
          outputs.push(outcome.snapshot.stdout.text);
        }
        const versionOutput = outputs[0] ?? "";
        const help = outputs[1] ?? "";
        const version = /^codex(?:-cli)?\s+(\S+)/u.exec(
          versionOutput.trim(),
        )?.[1];
        if (version === undefined)
          return err(
            new AnalysisProtocolError(
              "The selected command did not identify itself as Codex",
              {
                diagnostics: {
                  operation: "probe_codex_builder",
                  version_output: versionOutput,
                },
              },
            ),
          );
        return ok({
          id: this.id,
          command: this.#command,
          installed: true,
          version,
          version_output: versionOutput,
          declared_flags: {
            json: help.includes("--json"),
            sandbox: help.includes("--sandbox"),
            cd: help.includes("--cd"),
            model: help.includes("--model"),
          },
          qualification: "unverified",
          limitations: [
            "Version and help observations do not establish authentication, model access, sandbox readiness or successful builds.",
            ...LIMITATIONS,
          ],
        });
      },
    );
  }

  /** Cancel admitted work and retry only cleanup owned by this adapter. */
  close(): Promise<void> {
    this.#shutdown.abort(new Error("Codex builder adapter closed"));
    if (this.#closing !== undefined) return this.#closing;
    const closing = (async () => {
      await Promise.allSettled(this.#active);
      for (const [owner, retained] of this.#retained) {
        try {
          const stopped = await owner.stop();
          if (stopped.status === "incomplete") {
            retained.reason = stopped.reason;
            continue;
          }
          this.#retained.delete(owner);
          for (const error of retained.errors) error.resolveCleanup();
        } catch (cause: unknown) {
          retained.reason =
            cause instanceof Error ? cause.message : String(cause);
        }
      }
      if (this.#retained.size > 0)
        throw new ProviderCleanupError(
          this.id,
          [...this.#retained.values()].flatMap((item) => item.resources),
          { reasons: [...this.#retained.values()].map((item) => item.reason) },
          { operation: "close_codex_builder" },
        );
    })();
    this.#closing = closing;
    void closing.catch(() => {
      if (this.#closing === closing) this.#closing = undefined;
    });
    return closing;
  }

  #operation<T>(
    operation: string,
    signal: AbortSignal | undefined,
    run: (signal: AbortSignal) => Promise<Result<T, AnalysisError>>,
  ): Promise<Result<T, AnalysisError>> {
    if (signal?.aborted)
      return Promise.resolve(
        err(new AnalysisCancelledError(operation, { cause: signal.reason })),
      );
    if (this.#shutdown.signal.aborted || this.#retained.size > 0)
      return Promise.resolve(
        err(
          new AnalysisCapabilityUnavailableError(
            this.id,
            operation,
            "Codex adapter is closed or still owns unresolved process cleanup",
          ),
        ),
      );
    const configuration = {
      command: this.#command,
      maxOutputBytes: this.#maxOutputBytes,
    };
    const checked = configurationSchema.safeParse(configuration);
    if (!checked.success)
      return Promise.resolve(
        err(
          analysisInputErrorFromIssues(
            operation,
            checked.error.issues,
            configuration,
            { cause: checked.error },
          ),
        ),
      );
    const selected =
      signal === undefined
        ? this.#shutdown.signal
        : AbortSignal.any([signal, this.#shutdown.signal]);
    const active = Promise.resolve()
      .then(() => run(selected))
      .catch((cause: unknown) =>
        err(
          cause instanceof AnalysisError
            ? cause
            : new ProviderAdapterError(this.id, operation, { cause }),
        ),
      );
    this.#active.add(active);
    void active.then(() => this.#active.delete(active));
    return active;
  }

  #buildResult(
    outcome: CodexCommandOutcome,
    stream: CodexJsonlStream,
    timeoutMs: number,
    signal: AbortSignal,
  ): Result<ProjectBuilderResult, AnalysisError> {
    const observed = stream.observation();
    const issue = stream.completionIssue();
    const ordinaryNonzero = isOrdinaryNonzero(outcome);
    const result = builderObservation({
      outcome,
      stream: observed,
      signal,
      nonzero: ordinaryNonzero,
      issue: issue?.reason,
    });
    const details: AnalysisErrorOptions = {
      ...commandDetails(outcome, OPERATION, observed),
      diagnostics: {
        operation: OPERATION,
        builder_result: { ...result, limitations: [...result.limitations] },
      },
    };
    let primary: AnalysisError | undefined;
    if (
      outcome.failure instanceof OwnedCommandFailure &&
      outcome.failure.reason === "cancelled" &&
      outcome.failure.cancellation?.reason === stream.exceeded.reason &&
      stream.exceeded.aborted
    )
      primary = outputLimit(this.#maxOutputBytes, details);
    else if (!ordinaryNonzero)
      primary = physicalError({
        outcome,
        operation: OPERATION,
        timeoutMs,
        signal,
        details,
      });
    if (primary === undefined && !ordinaryNonzero && issue !== undefined)
      primary =
        issue.kind === "output-limit"
          ? outputLimit(this.#maxOutputBytes, details)
          : new AnalysisProtocolError(issue.reason, details);
    if (
      primary === undefined &&
      !ordinaryNonzero &&
      outcome.inputFailure !== undefined
    )
      primary = new AnalysisProtocolError("Codex prompt delivery failed", {
        ...details,
        cause: outcome.inputFailure,
      });
    const cleanup = this.#cleanupError(outcome, OPERATION, details);
    if (cleanup !== undefined)
      return err(
        withCleanup(primary, cleanup, OPERATION).retainDiagnostics(
          details.diagnostics ?? {},
        ),
      );
    if (primary !== undefined) return err(primary);
    return ok(result);
  }

  #cleanupError(
    outcome: CodexCommandOutcome,
    operation: string,
    details: AnalysisErrorOptions,
  ): ProviderCleanupError | undefined {
    const failure = outcome.failure;
    if (
      !(failure instanceof OwnedCommandFailure) ||
      failure.cleanupOwner === undefined
    )
      return undefined;
    const retained = this.#retained.get(failure.cleanupOwner) ?? {
      resources: failure.resources,
      errors: new Set<AnalysisError>(),
      reason: failure.cleanupFailure ?? failure.message,
    };
    this.#retained.set(failure.cleanupOwner, retained);
    const error = new ProviderCleanupError(
      this.id,
      retained.resources,
      { reason: retained.reason },
      { ...details, cause: failure, operation },
    );
    retained.errors.add(error);
    return error;
  }
}

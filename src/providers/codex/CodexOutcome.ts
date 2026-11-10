import type { ProjectBuilderResult } from "../../application/project/ProjectWorkflowPorts.js";
import type {
  AnalysisError,
  AnalysisErrorOptions,
} from "../../domain/analysisErrorBase.js";
import { analysisErrorWithCleanupFailure } from "../../domain/analysisErrorCleanup.js";
import {
  AnalysisCancelledError,
  AnalysisCapabilityUnavailableError,
  AnalysisProtocolError,
  AnalysisResourceConstraintError,
  AnalysisTimeoutError,
} from "../../domain/analysisErrorCore.js";
import { ProviderAdapterError } from "../../domain/providerAdapterError.js";
import { OwnedCommandFailure } from "../../process/OwnedCommand.js";
import type { ProviderProcessSnapshot } from "../../process/ProviderProcess.js";
import type { CodexCommandOutcome } from "./CodexCommand.js";
import type { CodexStreamObservation } from "./CodexJsonlStream.js";

export const CODEX_BUILD_OPERATION = "run_project_builder";
export const CODEX_BUILD_LIMITATIONS = [
  "Codex output records agent activity; project acceptance requires an independent validator.",
  "Session resumption has not been qualified; resume requests are refused instead of starting a new session.",
] as const;

const EMPTY_SNAPSHOT: ProviderProcessSnapshot = {
  stdout: { text: "", bytes: 0, observedBytes: 0 },
  stderr: { text: "", bytes: 0, observedBytes: 0 },
  exitCode: null,
  signal: null,
};

/** Retain exact bounded command output independently of its error classification. */
export const commandDetails = (
  outcome: CodexCommandOutcome,
  operation: string,
  stream?: CodexStreamObservation,
): AnalysisErrorOptions => {
  const snapshot = outcome.snapshot ?? EMPTY_SNAPSHOT;
  return {
    cause: outcome.failure,
    diagnostics: { operation },
    capturedOutput: {
      stdout: stream?.stdout ?? snapshot.stdout.text,
      stderr: snapshot.stderr.text,
      truncated:
        stream?.truncated === true ||
        snapshot.diagnosticTruncated === true ||
        snapshot.outputIncomplete === true,
      stdout_bytes: stream?.observedBytes ?? snapshot.stdout.observedBytes,
      stderr_bytes: snapshot.stderr.observedBytes,
      exit_code: snapshot.exitCode ?? null,
      signal: snapshot.signal ?? null,
    },
  };
};

/** Distinguish an observed nonzero exit from collection or lifecycle failure. */
export const isOrdinaryNonzero = (outcome: CodexCommandOutcome): boolean =>
  outcome.failure instanceof OwnedCommandFailure &&
  outcome.failure.reason === "process" &&
  !outcome.failure.collectionFailure &&
  typeof outcome.snapshot?.exitCode === "number" &&
  outcome.snapshot.exitCode !== 0 &&
  outcome.snapshot.signal === null;

/** Project physical and protocol facts without assigning an acceptance verdict. */
export const builderObservation = ({
  outcome,
  stream,
  signal,
  nonzero,
  issue,
}: {
  readonly outcome: CodexCommandOutcome;
  readonly stream: CodexStreamObservation;
  readonly signal: AbortSignal;
  readonly nonzero: boolean;
  readonly issue: string | undefined;
}): ProjectBuilderResult => {
  const failure = outcome.failure;
  const cleanup =
    failure instanceof OwnedCommandFailure &&
    failure.cleanupOwner !== undefined;
  return {
    status: builderStatus(
      outcome,
      signal,
      nonzero,
      stream.failed || issue !== undefined,
    ),
    exit_code: outcome.snapshot?.exitCode ?? null,
    session_id: stream.sessionId,
    stdout: stream.stdout,
    stderr: outcome.snapshot?.stderr.text ?? "",
    observed_tokens: stream.observedTokens,
    cleanup_status: cleanup
      ? "incomplete"
      : outcome.snapshot === null
        ? "unknown"
        : "complete",
    limitations: [
      ...CODEX_BUILD_LIMITATIONS,
      ...(nonzero
        ? [
            `Codex exited with status ${outcome.snapshot?.exitCode}; no successful build is established.`,
          ]
        : []),
      ...(issue === undefined ? [] : [issue]),
      ...(outcome.inputFailure === undefined
        ? []
        : ["The complete prompt could not be delivered to Codex."]),
      ...(stream.unknownEvents.length === 0
        ? []
        : [
            `Unrecognized event types were retained without interpretation: ${stream.unknownEvents.join(", ")}`,
          ]),
    ],
  };
};

const builderStatus = (
  outcome: CodexCommandOutcome,
  signal: AbortSignal,
  nonzero: boolean,
  protocolFailed: boolean,
): ProjectBuilderResult["status"] => {
  const failure = outcome.failure;
  if (
    failure instanceof OwnedCommandFailure &&
    failure.reason === "cancelled" &&
    signal.aborted
  )
    return "cancelled";
  if (
    (failure instanceof OwnedCommandFailure &&
      failure.cleanupOwner !== undefined) ||
    (failure !== undefined && !nonzero)
  )
    return "interrupted";
  if (nonzero || protocolFailed || outcome.inputFailure !== undefined)
    return "failed";
  return "completed";
};

/** Classify owned lifecycle failures before interpreting agent protocol output. */
export const physicalError = ({
  outcome,
  operation,
  timeoutMs,
  signal,
  details,
}: {
  readonly outcome: CodexCommandOutcome;
  readonly operation: string;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
  readonly details: AnalysisErrorOptions;
}): AnalysisError | undefined => {
  const failure = outcome.failure;
  if (failure instanceof OwnedCommandFailure) {
    if (failure.reason === "cancelled")
      return new AnalysisCancelledError(operation, {
        ...details,
        cause: failure.cancellation?.reason,
      });
    if (failure.reason === "timeout")
      return new AnalysisTimeoutError(operation, timeoutMs, details);
    if (failure.reason === "output-limit")
      return new AnalysisResourceConstraintError(
        operation,
        "memory",
        "Codex diagnostics exceeded the complete-output allowance",
        null,
        details,
      );
    const systemCode =
      failure.processError === undefined
        ? undefined
        : Reflect.get(failure.processError, "code");
    if (isExecutableStartupCode(systemCode))
      return new AnalysisCapabilityUnavailableError(
        "codex",
        operation,
        `Codex executable startup failed (${systemCode})`,
        {
          ...details,
          remediationAction:
            "Select an installed, executable Codex CLI using the existing local configuration.",
        },
      );
    if (
      failure.cleanupOwner !== undefined &&
      failure.cleanupFailure !== null &&
      !failure.collectionFailure &&
      outcome.snapshot?.exitCode === 0 &&
      outcome.snapshot.signal === null
    )
      return undefined;
    return new ProviderAdapterError("codex", operation, {
      ...details,
      userMessage: failure.message,
    });
  }
  if (signal.aborted)
    return new AnalysisCancelledError(operation, {
      ...details,
      cause: signal.reason,
    });
  if (failure !== undefined || outcome.snapshot === null)
    return new AnalysisCapabilityUnavailableError(
      "codex",
      operation,
      "The selected Codex executable could not complete startup",
      details,
    );
  if (
    outcome.snapshot.outputIncomplete === true ||
    outcome.snapshot.diagnosticTruncated === true
  )
    return new AnalysisProtocolError(
      "Codex output collection was incomplete",
      details,
    );
  return undefined;
};

const isExecutableStartupCode = (
  value: unknown,
): value is "ENOENT" | "EACCES" | "EPERM" =>
  value === "ENOENT" || value === "EACCES" || value === "EPERM";

/** Report bounded stdout exhaustion without promoting retained fragments to a result. */
export const outputLimit = (
  maxBytes: number,
  details: AnalysisErrorOptions,
): AnalysisResourceConstraintError =>
  new AnalysisResourceConstraintError(
    CODEX_BUILD_OPERATION,
    "memory",
    "Codex stdout exceeded its complete-output allowance",
    { max_output_bytes: maxBytes },
    details,
  );

/** Preserve the command failure while unresolved owned cleanup remains visible. */
export const withCleanup = (
  primary: AnalysisError | undefined,
  cleanup: AnalysisError,
  operation: string,
): AnalysisError =>
  primary === undefined
    ? cleanup
    : analysisErrorWithCleanupFailure(
        primary,
        cleanup,
        operation,
      ).bindCleanupDependencies([primary, cleanup]);

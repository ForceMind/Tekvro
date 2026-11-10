import { randomUUID } from "node:crypto";
import { finished, type Writable } from "node:stream";
import { ABORTED, waitForAbortable } from "../../process/AbortablePromise.js";
import {
  OwnedCommandFailure,
  runOwnedCommand,
} from "../../process/OwnedCommand.js";
import {
  spawnOwnedProviderProcess,
  type ProviderProcessSnapshot,
} from "../../process/ProviderProcess.js";
import {
  isWindowsBatchFile,
  windowsBatchCommand,
} from "../../process/WindowsBatchCommand.js";

/** Production defaults to the shared owned launcher; tests may supply a real fixture process. */
export type CodexProcessLauncher = NonNullable<
  Parameters<typeof runOwnedCommand>[2]
>["launcher"];

export interface CodexCommandRequest {
  readonly command: string;
  readonly arguments: readonly string[];
  readonly environment: Readonly<NodeJS.ProcessEnv>;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly signal: AbortSignal;
  readonly workspace?: string;
  readonly instruction?: string;
  readonly stdout?: Writable;
  readonly launcher?: CodexProcessLauncher;
}

/** Preserve owned-command failure independently of prompt-stream delivery. */
export interface CodexCommandOutcome {
  readonly snapshot: ProviderProcessSnapshot | null;
  readonly failure: unknown;
  readonly inputFailure: unknown;
}

/** Run the exact selected Codex command without invoking a shell on POSIX. */
export const executeCodexCommand = async (
  request: CodexCommandRequest,
): Promise<CodexCommandOutcome> => {
  const started = performance.now();
  let inputFailure: unknown;
  let inputCompleted: Promise<void> = Promise.resolve();
  const launch = request.launcher ?? spawnOwnedProviderProcess;
  let snapshot: ProviderProcessSnapshot | null = null;
  let failure: unknown;
  try {
    const batch =
      process.platform === "win32" && isWindowsBatchFile(request.command);
    const invocation = batch
      ? windowsBatchCommand({
          environment: request.environment,
          batchPath: request.command,
          arguments: request.arguments,
        })
      : { command: request.command, arguments: request.arguments };
    snapshot = await runOwnedCommand(
      {
        ...invocation,
        runId: `tekvro-codex-${randomUUID()}`,
        // Codex may be an interpreter-based launcher. The shared owner still
        // requires its run token and native process identity for cleanup.
        expectedCommand: null,
        hostEnvironment: { ...request.environment },
        sweepTokenOwnedProcesses: true,
        ...(batch ? { windowsVerbatimArguments: true } : {}),
        ...(request.workspace === undefined ? {} : { cwd: request.workspace }),
      },
      {
        timeoutMs: request.timeoutMs,
        diagnosticBytes: request.maxOutputBytes,
        stdin: request.instruction === undefined ? "closed-pipe" : "pipe",
        ...(request.stdout === undefined ? {} : { stdout: request.stdout }),
      },
      {
        signal: request.signal,
        launcher: async (options) => {
          const launched = await launch(options);
          if (request.instruction === undefined) return launched;
          const input = launched.process.stdin;
          if (input == null) {
            inputFailure = new Error("Codex prompt stdin is unavailable");
            return launched;
          }
          // Never throw after acquiring a process: OwnedCommand must first
          // receive its handle and retain authority over its full lifecycle.
          input.on("error", (cause: unknown) => {
            inputFailure ??= cause;
          });
          inputCompleted = new Promise<void>((resolve) => {
            finished(input, { readable: false }, (cause) => {
              if (cause !== undefined && cause !== null) inputFailure ??= cause;
              else if (!input.writableFinished)
                inputFailure ??= new Error(
                  "Codex prompt stream did not finish",
                );
              resolve();
            });
          });
          // Supervision is installed in the current microtask before stdin
          // can trigger synchronous output or an early process exit.
          setImmediate(() => {
            try {
              input.end(request.instruction);
            } catch (cause: unknown) {
              inputFailure ??= cause;
              input.destroy();
            }
          });
          return launched;
        },
      },
    );
  } catch (cause: unknown) {
    failure = cause;
    if (cause instanceof OwnedCommandFailure) snapshot = cause.snapshot;
  }
  const remaining = Math.max(
    1,
    Math.ceil(request.timeoutMs - (performance.now() - started)),
  );
  const inputState = await waitForAbortable(
    inputCompleted,
    AbortSignal.any([request.signal, AbortSignal.timeout(remaining)]),
  );
  if (inputState === ABORTED && failure === undefined)
    inputFailure ??= new Error(
      "Codex prompt delivery did not finish within its command deadline",
    );
  return { snapshot, failure, inputFailure };
};

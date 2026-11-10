import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { vi } from "vitest";

import { ArtifactResourceScope } from "../../src/artifacts/ArtifactResourceScope.js";
import type {
  ProjectBuilderEvent,
  ProjectBuilderPort,
  ProjectBuilderRequest,
  ProjectBuilderResult,
} from "../../src/application/project/ProjectWorkflowPorts.js";
import type { AnalysisError } from "../../src/domain/analysisErrorBase.js";
import { ProviderAdapterError } from "../../src/domain/providerAdapterError.js";
import { err, ok, type Result } from "../../src/domain/result.js";
import {
  OwnedCommandFailure,
  runOwnedCommand,
} from "../../src/process/OwnedCommand.js";

const source = `
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
const input = JSON.parse(process.argv[1]);
const instruction = JSON.parse(input.instruction);
await appendFile(input.counter, input.run_id + "\\n");
process.stdout.write("fixture-builder-started\\n");
await writeFile(input.ready, "ready");
if (instruction.mode === "hang") {
  setInterval(() => {}, 1000);
} else {
  if (instruction.mode === "wait") {
    while (true) {
      try { await readFile(input.gate); break; }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      await setTimeout(20);
    }
  }
  if (instruction.delay_ms) await setTimeout(instruction.delay_ms);
  await writeFile(join(input.workspace, "answer.txt"), instruction.text);
  process.stdout.write("fixture-builder-completed\\n");
}
`;

/** Explicit fixture instructions, not a real Agent protocol or inference result. */
export const projectFixtureInstruction = (
  text: string,
  mode: "write" | "wait" | "hang" = "write",
  delayMs = 0,
): string => JSON.stringify({ text, mode, delay_ms: delayMs });

/** Real Node subprocess writer used only to test coordinator/process boundaries. */
export class ProjectFixtureBuilder implements ProjectBuilderPort {
  readonly id = "fixture-node-writer";
  readonly counterPath: string;
  calls = 0;
  readonly #resources = new ArtifactResourceScope();
  #ready: string | undefined;
  #gate: string | undefined;

  constructor(
    private readonly directory: string,
    private readonly reportUncertainCleanup = false,
  ) {
    this.counterPath = join(directory, `fixture-builds-${randomUUID()}.txt`);
  }

  async run(
    request: ProjectBuilderRequest,
    signal?: AbortSignal,
    onEvent?: (event: ProjectBuilderEvent) => void | Promise<void>,
  ): Promise<Result<ProjectBuilderResult, AnalysisError>> {
    this.calls += 1;
    const identity = randomUUID();
    this.#ready = join(this.directory, `ready-${identity}.txt`);
    this.#gate = join(this.directory, `gate-${identity}.txt`);
    await onEvent?.({
      kind: "progress",
      observed_at: new Date().toISOString(),
      text: "Launching the real Node fixture writer; this is not an Agent run",
    });
    try {
      const snapshot = await runOwnedCommand(
        {
          command: process.execPath,
          arguments: [
            "--input-type=module",
            "-e",
            source,
            JSON.stringify({
              workspace: request.workspace,
              instruction: request.instruction,
              counter: this.counterPath,
              ready: this.#ready,
              gate: this.#gate,
              run_id: request.run.run_id,
            }),
          ],
          cwd: request.workspace,
          runId: identity,
          expectedCommand: null,
          hostEnvironment: {},
        },
        { timeoutMs: request.timeout_ms, diagnosticBytes: 64 * 1024 },
        signal === undefined ? {} : { signal },
      );
      return ok({
        status: this.reportUncertainCleanup ? "interrupted" : "completed",
        exit_code: snapshot.exitCode ?? null,
        session_id: null,
        stdout: snapshot.stdout.text,
        stderr: snapshot.stderr.text,
        observed_tokens: null,
        cleanup_status: this.reportUncertainCleanup ? "unknown" : "complete",
        limitations: this.reportUncertainCleanup
          ? [
              "Fixture withholds its cleanup acknowledgement after a real child exit",
            ]
          : [],
      });
    } catch (cause: unknown) {
      if (!(cause instanceof OwnedCommandFailure))
        return err(
          new ProviderAdapterError(this.id, "run_fixture_builder", { cause }),
        );
      const owner = cause.cleanupOwner;
      if (owner !== undefined && cause.cleanupFailure !== null)
        this.#resources.retain({
          kind: "lease",
          resource: identity,
          lease: {
            release: async () => {
              const result = await owner.stop();
              if (result.status === "incomplete")
                throw new Error(result.reason);
              owner.dispose();
            },
          },
        });
      return ok({
        status: cause.reason === "cancelled" ? "cancelled" : "failed",
        exit_code: cause.snapshot?.exitCode ?? null,
        session_id: null,
        stdout: cause.snapshot?.stdout.text ?? "",
        stderr: cause.snapshot?.stderr.text ?? "",
        observed_tokens: null,
        cleanup_status:
          cause.cleanupFailure === null ? "complete" : "incomplete",
        limitations: [cause.message],
      });
    }
  }

  /** Wait on bytes written by the actual child, not on the adapter call count. */
  async waitForStarted(): Promise<void> {
    await vi.waitFor(
      async () => {
        if (
          this.#ready === undefined ||
          (await readFile(this.#ready, "utf8")) !== "ready"
        )
          throw new Error("Fixture child has not signalled readiness");
      },
      { timeout: 5000 },
    );
  }

  /** Permit a waiting fixture child to finish without cancelling it. */
  async release(): Promise<void> {
    if (this.#gate === undefined)
      throw new Error("Fixture writer has not started");
    await writeFile(this.#gate, "continue");
  }

  /** Retry only owners retained by this fixture adapter. */
  async close(): Promise<void> {
    await this.#resources.close();
  }
}

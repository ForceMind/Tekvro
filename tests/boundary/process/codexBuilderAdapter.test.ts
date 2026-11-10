import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, it, onTestFinished } from "vitest";
import type {
  ProjectBuilderEvent,
  ProjectBuilderRequest,
} from "../../../src/application/project/ProjectWorkflowPorts.js";
import { createProjectService } from "../../../src/composition/project.js";
import { projectAnalysisError } from "../../../src/domain/analysisErrorProjection.js";
import {
  createProjectRunRecord,
  transitionProjectRun,
} from "../../../src/domain/projectRun.js";
import type { Result } from "../../../src/domain/result.js";
import { cleanupOwnedProcessGroup } from "../../../src/process/ProcessOwnership.js";
import {
  spawnOwnedProviderProcess,
  type OwnedProviderProcessSpawnOptions,
} from "../../../src/process/ProviderProcess.js";
import { CodexBuilderAdapter } from "../../../src/providers/codex/CodexBuilderAdapter.js";
import { projectMetadataRequest } from "../../fixtures/projectMetadata.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

const fixturePath = fileURLToPath(
  new URL("../../fixtures/project/codexProtocolFixture.mjs", import.meta.url),
);
const take = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw result.error;
  return result.value;
};

const fixture = async (
  mode: string,
  options: {
    readonly maxOutputBytes?: number;
    readonly denyCleanup?: () => boolean;
  } = {},
) => {
  const root = await createTestTempDirectory("tekvro-codex-protocol-fixture-");
  const project = createProjectService();
  const input = projectMetadataRequest(root);
  const snapshot = take(await project.create(input));
  await project.close();
  await mkdir(input.project.scope.output_root);
  const now = new Date().toISOString();
  const idle = take(
    createProjectRunRecord({
      project: snapshot.revision,
      run_id: randomUUID(),
      phase: "build",
      created_at: now,
      adapter: { id: "codex", version: null, model: "protocol-fixture-model" },
    }),
  );
  const run = take(
    transitionProjectRun(idle, { kind: "start", at: now, elapsed_ms: 0 }),
  );
  const request: ProjectBuilderRequest = {
    run,
    workspace: input.project.scope.output_root,
    instruction:
      'Preserve this exact prompt\n包含中文、引号 " and $() as ordinary text.',
    timeout_ms: 10_000,
  };
  const launches: OwnedProviderProcessSpawnOptions[] = [];
  const adapter = new CodexBuilderAdapter({
    environment: {
      ...process.env,
      CODEX_PROTOCOL_FIXTURE_SENTINEL: "selected-existing-environment",
    },
    ...(options.maxOutputBytes === undefined
      ? {}
      : { maxOutputBytes: options.maxOutputBytes }),
    launcher: async (spawn) => {
      launches.push(spawn);
      const launched = await spawnOwnedProviderProcess({
        ...spawn,
        command: process.execPath,
        arguments: [fixturePath, mode, ...spawn.arguments],
        expectedCommand: process.execPath,
      });
      return options.denyCleanup === undefined
        ? launched
        : {
            ...launched,
            cleanup: async () =>
              options.denyCleanup?.() === true
                ? {
                    cleaned: false,
                    reason: "Protocol fixture retains its cleanup owner",
                  }
                : cleanupOwnedProcessGroup(launched.ownership),
          };
    },
  });
  onTestFinished(() => adapter.close());
  return { adapter, request, launches };
};

it("parses a real process's protocol fixture without interpreting agent prose as acceptance", async () => {
  const f = await fixture("complete");
  const events: ProjectBuilderEvent[] = [];
  const result = take(
    await f.adapter.run(f.request, undefined, (event) => {
      events.push(event);
    }),
  );
  expect(result).toMatchObject({
    status: "completed",
    exit_code: 0,
    session_id: "protocol-fixture-session",
    observed_tokens: 15,
    cleanup_status: "complete",
  });
  expect(result.stdout).toContain("all checks passed");
  expect(result.stdout).toContain(JSON.stringify(f.request.instruction));
  expect(result.stdout).toContain("selected-existing-environment");
  expect(result.limitations.join(" ")).toContain("independent validator");
  expect(result.limitations.join(" ")).toContain("fixture.extension");
  expect(events.map(({ kind }) => kind)).toEqual([
    "session",
    "progress",
    "tool",
    "tool",
    "message",
    "progress",
    "progress",
  ]);
  const launch = f.launches[0];
  expect(launch?.cwd).toBe(f.request.workspace);
  expect(launch?.arguments).toEqual([
    "exec",
    "--sandbox",
    "workspace-write",
    "--json",
    "--cd",
    f.request.workspace,
    "--skip-git-repo-check",
    "--model",
    "protocol-fixture-model",
    "-",
  ]);
  expect(launch?.env).toBeUndefined();
  expect(
    launch?.arguments.some((arg) =>
      /bypass|ignore-rules|ignore-user-config|danger-full/u.test(arg),
    ),
  ).toBe(false);
});

it.each([
  "no-output",
  "malformed",
  "truncated",
  "invalid-utf8",
  "duplicate-terminal",
])(
  "rejects %s from a protocol fixture even when the process exits zero",
  async (mode) => {
    const f = await fixture(mode);
    const result = await f.adapter.run(f.request);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Incomplete protocol passed");
    expect(projectAnalysisError(result.error)).toMatchObject({
      code: "unreadable_output",
      details: {
        diagnostics: {
          builder_result: {
            status: "failed",
            exit_code: 0,
            cleanup_status: "complete",
          },
        },
      },
    });
  },
);

it.each(["nonzero", "failed-turn"])(
  "retains the %s fixture's observed failure",
  async (mode) => {
    const f = await fixture(mode);
    const result = take(await f.adapter.run(f.request));
    expect(result).toMatchObject({
      status: "failed",
      exit_code: mode === "nonzero" ? 7 : 0,
      session_id: "protocol-fixture-session",
      cleanup_status: "complete",
      observed_tokens: null,
    });
    expect(result.stdout).toContain("thread.started");
    if (mode === "nonzero")
      expect(result.stderr).toContain("initialization failed");
  },
);

it("keeps a nonzero command outcome when the progress sink also rejects", async () => {
  const f = await fixture("sink-nonzero");
  const result = take(
    await f.adapter.run(f.request, undefined, async () => {
      throw new Error("Protocol fixture event sink failed");
    }),
  );
  expect(result).toMatchObject({
    status: "failed",
    exit_code: 9,
    observed_tokens: 15,
    cleanup_status: "complete",
  });
  expect(result.stdout).toContain("turn.completed");
  expect(result.stderr).toContain("final event");
  expect(result.limitations.join(" ")).toContain("progress delivery failed");
});

it("rejects successful physical output when its requested event sink failed", async () => {
  const f = await fixture("complete");
  const result = await f.adapter.run(f.request, undefined, () => {
    throw new Error("Protocol fixture delivery failure");
  });
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Missing event delivery failure");
  expect(projectAnalysisError(result.error)).toMatchObject({
    code: "unreadable_output",
    details: {
      diagnostics: {
        builder_result: { status: "failed", exit_code: 0, observed_tokens: 15 },
      },
    },
  });
});

it.each(["oversized", "coalesced-oversized"])(
  "bounds %s protocol retention and preserves the partial session",
  async (mode) => {
    const f = await fixture(mode, { maxOutputBytes: 2_048 });
    const result = await f.adapter.run(f.request);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Truncated protocol passed");
    expect(projectAnalysisError(result.error)).toMatchObject({
      code: "resource_constraint",
      details: {
        captured_output: { truncated: true },
        diagnostics: {
          builder_result: { session_id: "protocol-fixture-session" },
        },
      },
    });
  },
);

it("cancels the actual fixture process through owned cleanup after streaming a session event", async () => {
  const f = await fixture("held");
  const controller = new AbortController();
  const result = await f.adapter.run(f.request, controller.signal, (event) => {
    if (event.kind === "session") controller.abort("fixture caller cancelled");
  });
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Cancelled process passed");
  expect(projectAnalysisError(result.error)).toMatchObject({
    code: "cancelled",
    details: {
      diagnostics: {
        builder_result: {
          status: "cancelled",
          session_id: "protocol-fixture-session",
          cleanup_status: "complete",
        },
      },
    },
  });
});

it("classifies a command deadline separately from caller cancellation", async () => {
  const f = await fixture("held");
  const result = await f.adapter.run({ ...f.request, timeout_ms: 500 });
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Timed out process passed");
  expect(projectAnalysisError(result.error)).toMatchObject({
    code: "provider_timeout",
    details: {
      timeout_ms: 500,
      diagnostics: { builder_result: { status: "interrupted" } },
    },
  });
});

it("retains incomplete cleanup after a complete turn and retries the exact owner", async () => {
  let denied = true;
  const f = await fixture("complete", { denyCleanup: () => denied });
  const result = await f.adapter.run(f.request);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Incomplete cleanup passed");
  expect(projectAnalysisError(result.error)).toMatchObject({
    code: "cleanup_incomplete",
    details: {
      diagnostics: {
        builder_result: {
          status: "interrupted",
          exit_code: 0,
          session_id: "protocol-fixture-session",
          observed_tokens: 15,
          cleanup_status: "incomplete",
        },
      },
    },
  });
  expect((await f.adapter.run(f.request)).ok).toBe(false);
  expect(f.launches).toHaveLength(1);
  denied = false;
  await f.adapter.close();
  expect(result.error.cleanupIncomplete).toBe(false);
});

it("reports only probe observations and refuses unqualified resume without a new process", async () => {
  const f = await fixture("complete");
  const probe = take(await f.adapter.probe());
  expect(probe).toMatchObject({
    installed: true,
    version: "0.0.0-protocol-fixture",
    qualification: "unverified",
    declared_flags: { json: true, sandbox: true, cd: true, model: true },
  });
  expect(f.launches.map((entry) => entry.arguments)).toEqual([
    ["--version"],
    ["exec", "--help"],
  ]);
  const resumed = await f.adapter.resume(f.request, "retained-session-id");
  expect(resumed.ok).toBe(false);
  if (resumed.ok) throw new Error("Unqualified resume passed");
  expect(projectAnalysisError(resumed.error)).toMatchObject({
    code: "capability_unavailable",
    details: { diagnostics: { session_id: "retained-session-id" } },
  });
  expect(f.launches).toHaveLength(2);
});

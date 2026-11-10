import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { expect, type TestContext } from "vitest";
import { z } from "zod";
import { ProjectRunStore } from "../../../src/application/project/ProjectRunStore.js";
import { projectLeaseDirectory } from "../../../src/application/project/ProjectWorkspace.js";
import { PROJECT_RUN_TOOL_CONTRACTS } from "../../../src/contracts/projectRunToolContracts.js";
import {
  projectExecutionSnapshotSchema,
  type ProjectExecutionSnapshot,
} from "../../../src/domain/projectExecution.js";
import { projectRevisionToken } from "../../../src/domain/projectManifest.js";
import { createProjectRunRecord } from "../../../src/domain/projectRun.js";
import { connectLocalToolsMcp } from "../../fixtures/localToolsMcp.js";
import { parseMcpToolError } from "../../fixtures/mcpToolError.js";
import {
  createProjectWorkflowFixture,
  requireProjectWorkflowLease,
  takeProjectResult,
  type ProjectWorkflowFixture,
} from "../../fixtures/projectWorkflow.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";
import {
  cliTest,
  type SharedMcpCall,
  type TestCli,
} from "../../support/cli/cliFixture.js";

const prepareProtocolWorkflow = async (context: Pick<TestContext, "skip">) => {
  const fixture = await createProjectWorkflowFixture();
  await requireProjectWorkflowLease(context, fixture, projectLeaseDirectory());
  const bin = join(fixture.root, "protocol-fixture-bin");
  const counter = join(bin, "invocations.jsonl");
  await mkdir(bin);
  const source = new URL(
    "../../fixtures/project/codexWorkflowFixture.mjs",
    import.meta.url,
  ).href;
  await writeFile(
    join(bin, "codex"),
    `#!/usr/bin/env node\nvoid import(${JSON.stringify(source)});\n`,
    { mode: 0o755 },
  );
  await writeFile(counter, "");
  return {
    ...fixture,
    counter,
    environment: {
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      CODEX_PROTOCOL_FIXTURE_COUNTER: counter,
    },
  };
};

const runIdentity = (
  fixture: ProjectWorkflowFixture,
  snapshot: Pick<ProjectExecutionSnapshot, "execution">,
) => ({
  directory: fixture.initial.directory,
  run_id: snapshot.execution.run.run_id,
  expected: snapshot.execution.token,
});
const continuation = (
  fixture: ProjectWorkflowFixture,
  snapshot: Pick<ProjectExecutionSnapshot, "execution">,
) => ({
  ...runIdentity(fixture, snapshot),
  checker_path: fixture.manifestPath,
});

const cliSnapshot = async (input: {
  cli: TestCli;
  command: string;
  request: object;
  environment: NodeJS.ProcessEnv;
  cwd?: string;
}) => {
  const result = await input.cli.run({
    arguments: [input.command, "-", "--json"],
    input: JSON.stringify(input.request),
    environment: input.environment,
    ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
  });
  expect(result.exitCode, `${result.stderr}\n${result.stdout}`).toBe(0);
  return projectExecutionSnapshotSchema.parse(result.json);
};
const mcpSnapshot = async (
  call: SharedMcpCall,
  name: string,
  input: Record<string, unknown>,
) => {
  const result = await call(name, input);
  expect(result.isError, JSON.stringify(result)).not.toBe(true);
  return projectExecutionSnapshotSchema.parse(result.structuredContent);
};
const invocationSchema = z.object({
  session_id: z.string(),
  argv: z.array(z.string()),
  fixture: z.literal("codex-jsonl-workflow"),
});
const observedInvocations = async (counter: string) => {
  const lines = (await readFile(counter, "utf8")).trim();
  return lines === ""
    ? []
    : lines.split("\n").map((line) => invocationSchema.parse(JSON.parse(line)));
};

const expectThreeFreshFixtureTurns = async (counter: string): Promise<void> => {
  const invocations = await observedInvocations(counter);
  expect(invocations).toHaveLength(3);
  expect(
    new Set(invocations.map((invocation) => invocation.session_id)).size,
  ).toBe(3);
  for (const invocation of invocations) {
    expect(invocation.argv).toContain("protocol-fixture-model");
    expect(invocation.argv).not.toContain("resume");
  }
};

cliTest(
  "reads one real persisted run consistently without acquiring an execution lease",
  async ({ cli }) => {
    const fixture = await createProjectWorkflowFixture();
    const run = takeProjectResult(
      createProjectRunRecord({
        project: fixture.initial.revision,
        run_id: randomUUID(),
        phase: "build",
        created_at: new Date().toISOString(),
        adapter: { id: "codex", version: null, model: null },
      }),
    );
    const stored = takeProjectResult(
      await new ProjectRunStore(fixture.resources).create(
        fixture.initial.directory,
        run,
      ),
    );
    const files = await readdir(stored.directory);
    const request = {
      directory: fixture.initial.directory,
      run_id: run.run_id,
    };
    const fromCli = await cliSnapshot({
      cli,
      environment: {},
      command: "inspect-project-run",
      request,
    });
    const call = await cli.sharedMcpCall?.();
    if (call === undefined) throw new Error("Missing file MCP session");
    const fromMcp = await mcpSnapshot(call, "inspect_project_run", request);
    expect(fromCli).toEqual(fromMcp);
    expect(fromCli.execution).toEqual(stored);
    expect(fromCli.execution.run).toMatchObject({
      execution_status: "idle",
      acceptance_status: "not_evaluated",
      attempt: 0,
      elapsed_ms: 0,
      pending_check: null,
    });
    expect(fromCli.projection_status).toBe("outdated");
    expect(await readdir(stored.directory)).toEqual(files);
    expect(await readdir(fixture.initial.directory)).toEqual([
      "0000000000000001.json",
      "runs",
    ]);
  },
);

cliTest.skipIf(process.platform === "win32")(
  "shares bounded protocol-fixture builds, independent checks and budget decisions across CLI and MCP",
  async ({ cli, skip }) => {
    const fixture = await prepareProtocolWorkflow({ skip });
    const { environment, counter } = fixture;
    const { call } = await connectLocalToolsMcp(environment);
    const built = await cliSnapshot({
      cli,
      environment,
      command: "build-project",
      cwd: fixture.root,
      request: {
        directory: "project",
        expected: projectRevisionToken(fixture.initial.revision),
        checker_path: "verifier/manifest.json",
        instruction: JSON.stringify({ text: "known defect\n" }),
        model: "protocol-fixture-model",
        budget: {
          wall_time_ms: 60000,
          max_attempts: 2,
          max_no_progress_attempts: 2,
        },
      },
    });
    expect(built.execution.run).toMatchObject({
      phase: "check",
      execution_status: "paused",
      stop_reason: "pending_check",
      attempt: 1,
      acceptance_status: "not_evaluated",
    });
    const selected = {
      directory: fixture.initial.directory,
      run_id: built.execution.run.run_id,
    };
    const inspected = await mcpSnapshot(call, "inspect_project_run", selected);
    expect(inspected).toEqual(built);
    const refused = await call("resume_project_build", {
      ...continuation(fixture, built),
      instruction: JSON.stringify({ text: "not allowed yet" }),
    });
    expect(refused.isError).toBe(true);
    expect((await observedInvocations(counter)).length).toBe(1);

    const failed = await mcpSnapshot(
      call,
      "check_project",
      continuation(fixture, built),
    );
    expect(failed.check?.outcome).toBe("fail");
    expect(failed.execution.run.acceptance_status).toBe("unknown");
    const refined = await cliSnapshot({
      cli,
      environment,
      command: "refine-project",
      request: {
        ...continuation(fixture, failed),
        instruction: JSON.stringify({ text: "another defect\n" }),
      },
    });
    expect(refined.execution.run.attempt).toBe(2);
    const checkedAgain = await mcpSnapshot(
      call,
      "check_project",
      continuation(fixture, refined),
    );
    expect(checkedAgain.check?.outcome).toBe("fail");
    const paused = await cliSnapshot({
      cli,
      environment,
      command: "refine-project",
      request: {
        ...continuation(fixture, checkedAgain),
        instruction: JSON.stringify({ text: "ready\n" }),
      },
    });
    expect(paused.execution.run).toMatchObject({
      phase: "refine",
      execution_status: "paused",
      stop_reason: "budget_exhausted",
      attempt: 2,
    });
    expect((await observedInvocations(counter)).length).toBe(2);

    const adjustment = {
      ...runIdentity(fixture, paused),
      budget: {
        wall_time_ms: 120000,
        max_attempts: 3,
        max_no_progress_attempts: 2,
      },
      reason: "Permit one explicit protocol-fixture correction",
    };
    const adjusted = await mcpSnapshot(
      call,
      "adjust_project_run_budget",
      adjustment,
    );
    expect(adjusted.execution.run).toMatchObject({
      attempt: 2,
      elapsed_ms: paused.execution.run.elapsed_ms,
      budget_revision: 2,
      budget_change_reason: adjustment.reason,
    });
    expect((await observedInvocations(counter)).length).toBe(2);
    const staleCli = await cli.run({
      arguments: ["adjust-project-run-budget", "-", "--json"],
      input: JSON.stringify(adjustment),
      environment,
    });
    const staleMcp = parseMcpToolError(
      await call("adjust_project_run_budget", adjustment),
    );
    expect(staleCli.exitCode).toBe(1);
    expect(staleCli.json).toEqual(staleMcp.error);

    const resumed = await cliSnapshot({
      cli,
      environment,
      command: "resume-project-build",
      request: {
        ...continuation(fixture, adjusted),
        instruction: JSON.stringify({ text: "ready\n" }),
      },
    });
    expect(resumed.execution.run).toMatchObject({
      attempt: 3,
      phase: "check",
      stop_reason: "pending_check",
    });
    const checked = await mcpSnapshot(
      call,
      "check_project",
      continuation(fixture, resumed),
    );
    expect(checked.check?.outcome).toBe("pass");
    expect(checked.execution.run).toMatchObject({
      acceptance_status: "unknown",
      pending_check: null,
      observed_tokens: 21,
    });
    expect(checked.project.revision.project.acceptance_status).toBe("unknown");
    const reopened = await cliSnapshot({
      cli,
      environment,
      command: "inspect-project-run",
      request: selected,
    });
    expect(reopened.execution).toEqual(checked.execution);
    await expectThreeFreshFixtureTurns(counter);
  },
);

cliTest.for(PROJECT_RUN_TOOL_CONTRACTS)(
  "rejects a lifecycle patch consistently before running $name",
  async (contract, { cli }) => {
    const root = await createTestTempDirectory("tekvro-project-run-invalid-");
    const directory = join(root, "absent-project");
    const input = {
      ...contract.examples[0].input,
      directory,
      execution_status: "succeeded",
    };
    const command = contract.name.replaceAll("_", "-");
    const fromCli = await cli.run({
      arguments: [command, JSON.stringify(input), "--json"],
    });
    const call = await cli.sharedMcpCall?.();
    if (call === undefined) throw new Error("Missing file MCP session");
    const fromMcp = parseMcpToolError(await call(contract.name, input));
    expect(fromCli.exitCode).toBe(1);
    expect(fromCli.json).toEqual(fromMcp.error);
    expect(fromCli.json).toMatchObject({
      code: "invalid_request",
      details: {
        operation: contract.name,
        issues: [{ path: ["execution_status"] }],
      },
    });
    await expect(readdir(directory)).rejects.toMatchObject({ code: "ENOENT" });
  },
);

cliTest("keeps all bounded run command help in Chinese", async ({ cli }) => {
  for (const contract of PROJECT_RUN_TOOL_CONTRACTS) {
    const result = await cli.run({
      arguments: [contract.name.replaceAll("_", "-"), "--help"],
      environment: { TEKVRO_LANG: "zh-CN" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("标准输入");
    expect(result.stdout).toContain("相对调用目录");
  }
});

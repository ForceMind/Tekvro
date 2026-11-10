import { randomUUID } from "node:crypto";
import { chmod, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  beforeAll,
  expect,
  it,
  onTestFinished,
  vi,
  type TestContext,
} from "vitest";

import { ArtifactResourceScope } from "../../../src/artifacts/ArtifactResourceScope.js";
import { observeProjectCandidate } from "../../../src/application/project/ProjectCandidate.js";
import {
  ProjectRunService,
  type ProjectExecutionSnapshot,
} from "../../../src/application/project/ProjectRunService.js";
import { ProjectRunStore } from "../../../src/application/project/ProjectRunStore.js";
import { AnalysisTimeoutError } from "../../../src/domain/analysisErrorCore.js";
import { projectRevisionToken } from "../../../src/domain/projectManifest.js";
import {
  createProjectRunRecord,
  transitionProjectRun,
} from "../../../src/domain/projectRun.js";
import { OwnedCommandFailure } from "../../../src/process/OwnedCommand.js";
import { prepareProcessOwnershipInspection } from "../../../src/process/ProcessOwnershipObservation.js";
import { requirePermissionDenial } from "../../fixtures/permissionDenial.js";
import {
  ProjectFixtureBuilder,
  projectFixtureInstruction,
} from "../../fixtures/projectFixtureBuilder.js";
import {
  createProjectWorkflowFixture,
  requireProjectWorkflowLease,
  takeProjectResult as take,
  type ProjectWorkflowFixture,
} from "../../fixtures/projectWorkflow.js";

beforeAll(async () => {
  await prepareProcessOwnershipInspection();
});

const fixture = async (context: Pick<TestContext, "skip">, mode = "normal") => {
  const f = await createProjectWorkflowFixture(mode);
  const leaseDirectory = await requireProjectWorkflowLease(context, f);
  return { ...f, leaseDirectory };
};

const runtime = (
  f: ProjectWorkflowFixture,
  options: {
    readonly leaseDirectory?: string;
    readonly uncertainCleanup?: boolean;
  } = {},
) => {
  const resources = new ArtifactResourceScope();
  const builder = new ProjectFixtureBuilder(
    f.verifier,
    options.uncertainCleanup,
  );
  const service = new ProjectRunService(
    resources,
    builder,
    undefined,
    options.leaseDirectory ?? join(f.root, "leases"),
  );
  onTestFinished(async () => {
    await service.close();
  });
  return { service, builder, resources };
};

const buildRequest = (
  f: ProjectWorkflowFixture,
  instruction = projectFixtureInstruction("ready\n"),
) => ({
  directory: f.initial.directory,
  expected: projectRevisionToken(f.initial.revision),
  checker_path: f.manifestPath,
  instruction,
});
const continuation = (
  f: ProjectWorkflowFixture,
  snapshot: ProjectExecutionSnapshot,
) => ({
  directory: f.initial.directory,
  run_id: snapshot.execution.run.run_id,
  expected: snapshot.execution.token,
  checker_path: f.manifestPath,
});
const realInvocations = async (
  builder: ProjectFixtureBuilder,
): Promise<number> =>
  (await readFile(builder.counterPath, "utf8")).trim().split("\n").length;

it("retains the real process timeout after the fixture has written candidate bytes", async () => {
  const f = await createProjectWorkflowFixture();
  const builder = new ProjectFixtureBuilder(f.verifier);
  onTestFinished(() => builder.close());
  const record = take(
    createProjectRunRecord({
      project: f.initial.revision,
      run_id: randomUUID(),
      phase: "build",
      created_at: new Date().toISOString(),
      adapter: { id: builder.id, version: null, model: null },
    }),
  );
  const run = take(
    transitionProjectRun(record, {
      kind: "start",
      at: record.created_at,
      elapsed_ms: 0,
    }),
  );
  const candidate =
    "Partial output retained after the actual fixture deadline\n";
  const result = await builder.run({
    run,
    workspace: f.output,
    instruction: projectFixtureInstruction(candidate, "write-then-hang"),
    timeout_ms: 2000,
  });
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("The hanging fixture unexpectedly completed");
  expect(result.error).toBeInstanceOf(AnalysisTimeoutError);
  expect(result.error.cause).toBeInstanceOf(OwnedCommandFailure);
  expect(result.error.cleanupIncomplete).toBe(false);
  expect(result.error.diagnostics?.builder_result).toMatchObject({
    status: "interrupted",
    cleanup_status: "complete",
    stdout: "fixture-builder-started\nfixture-builder-candidate-written\n",
  });
  expect(await readFile(f.candidatePath, "utf8")).toBe(candidate);
  expect(await realInvocations(builder)).toBe(1);
});

it("resumes the same run from the candidate committed after a cleaned Builder timeout", async (context) => {
  const f = await fixture(context);
  const original = runtime(f);
  const before = take(
    await observeProjectCandidate(f.project, undefined, f.resources),
  );
  const candidate = "Partial candidate written before the Builder timed out\n";
  const budget = {
    wall_time_ms: 5000,
    max_attempts: 1,
    max_no_progress_attempts: 2,
  };
  const timedOut = await original.service.build({
    ...buildRequest(f, projectFixtureInstruction(candidate, "write-then-hang")),
    budget,
  });
  expect(timedOut.ok).toBe(false);
  if (timedOut.ok)
    throw new Error("Builder timeout was reported as successful execution");
  expect(timedOut.error).toBeInstanceOf(AnalysisTimeoutError);
  expect(timedOut.error.diagnostics?.builder_result).toMatchObject({
    cleanup_status: "complete",
  });
  expect(await readFile(f.candidatePath, "utf8")).toBe(candidate);
  const current = take(await f.store.read(f.initial.directory));
  const runId = current.revision.project.run_ids.at(-1);
  if (runId === undefined)
    throw new Error("Timed-out project lost its run identity");
  const selected = { directory: f.initial.directory, run_id: runId };
  const paused = take(await original.service.inspect(selected));
  const actual = take(
    await observeProjectCandidate(
      current.revision.project,
      undefined,
      f.resources,
    ),
  );
  expect(actual.sha256).not.toBe(before.sha256);
  expect(paused.execution.run).toMatchObject({
    run_id: runId,
    phase: "build",
    execution_status: "paused",
    acceptance_status: "not_evaluated",
    stop_reason: "budget_exhausted",
    cleanup_status: "complete",
    candidate_sha256: actual.sha256,
    pending_check: null,
    attempt: 1,
    budget,
    budget_revision: 1,
  });
  expect(current.revision.project.candidate_sha256).toBe(actual.sha256);
  const spent = paused.execution.run.elapsed_ms;
  expect(spent).toBeGreaterThanOrEqual(budget.wall_time_ms);
  expect(timedOut.error.partialObservation).toMatchObject({
    kind: "project_execution",
    execution: {
      token: paused.execution.token,
      run: { candidate_sha256: actual.sha256, execution_status: "paused" },
    },
  });
  await original.service.close();

  const next = runtime(f);
  const reopened = take(await next.service.inspect(selected));
  expect(reopened.execution).toEqual(paused.execution);
  const adjusted = take(
    await next.service.adjustBudget({
      ...selected,
      expected: reopened.execution.token,
      budget: { ...budget, wall_time_ms: spent + 30000, max_attempts: 2 },
      reason: "Permit one explicit attempt from the observed timeout candidate",
    }),
  );
  expect(adjusted.execution.run).toMatchObject({
    run_id: runId,
    candidate_sha256: actual.sha256,
    attempt: 1,
    elapsed_ms: spent,
    budget_revision: 2,
  });
  expect(next.builder.calls).toBe(0);
  const resumed = take(
    await next.service.resumeBuild({
      ...continuation(f, adjusted),
      instruction: projectFixtureInstruction("ready\n"),
    }),
  );
  expect(resumed.execution.run).toMatchObject({
    run_id: runId,
    attempt: 2,
    budget_revision: 2,
    phase: "check",
    execution_status: "paused",
    stop_reason: "pending_check",
  });
  expect(resumed.execution.run.elapsed_ms).toBeGreaterThan(spent);
  expect(resumed.execution.run.pending_check).not.toBeNull();
  expect(await readdir(join(f.initial.directory, "runs"))).toEqual([runId]);
  expect(await realInvocations(original.builder)).toBe(1);
  expect(await realInvocations(next.builder)).toBe(1);
  expect((await readFile(next.builder.counterPath, "utf8")).trim()).toBe(runId);
  const checked = take(
    await next.service.checkPending(continuation(f, resumed)),
  );
  expect(checked.check?.outcome).toBe("pass");
  expect(checked.execution.run).toMatchObject({
    run_id: runId,
    attempt: 2,
    acceptance_status: "unknown",
  });
});

it("reopens a durable pending check and checks without invoking another Builder", async (context) => {
  const f = await fixture(context);
  const first = runtime(f);
  const built = take(await first.service.build(buildRequest(f)));
  expect(built.execution.run).toMatchObject({
    execution_status: "paused",
    phase: "check",
    stop_reason: "pending_check",
    attempt: 1,
    cleanup_status: "complete",
  });
  expect(built.execution.run.pending_check).not.toBeNull();
  await first.service.close();
  const second = runtime(f);
  const reopened = take(
    await second.service.inspect({
      directory: f.initial.directory,
      run_id: built.execution.run.run_id,
    }),
  );
  expect(reopened.execution.token).toEqual(built.execution.token);
  const checked = take(
    await second.service.checkPending(continuation(f, reopened)),
  );
  expect(checked.execution.run).toMatchObject({
    execution_status: "succeeded",
    last_check_status: "pass",
    acceptance_status: "unknown",
    pending_check: null,
    attempt: 1,
  });
  expect(checked.project.revision.project.acceptance_status).toBe("unknown");
  expect(checked.check?.outcome).toBe("pass");
  expect(second.builder.calls).toBe(0);
  expect(await realInvocations(first.builder)).toBe(1);
});

it("uses an external failing oracle before refining a real fixture output to passing", async (context) => {
  const f = await fixture(context);
  const r = runtime(f);
  const built = take(
    await r.service.build({
      ...buildRequest(f, projectFixtureInstruction("known defect\n")),
      budget: {
        wall_time_ms: 30000,
        max_attempts: 2,
        max_no_progress_attempts: 2,
      },
    }),
  );
  const failed = take(await r.service.checkPending(continuation(f, built)));
  expect(failed.check?.outcome).toBe("fail");
  const refined = take(
    await r.service.refine({
      ...continuation(f, failed),
      instruction: projectFixtureInstruction("ready\n"),
    }),
  );
  expect(refined.execution.run.attempt).toBe(2);
  const repaired = take(await r.service.checkPending(continuation(f, refined)));
  expect(repaired.check?.outcome).toBe("pass");
  expect(repaired.execution.run.acceptance_status).toBe("unknown");
  expect(repaired.project.revision.project.acceptance_status).toBe("unknown");
  expect(await realInvocations(r.builder)).toBe(2);
});

it("persists same-output no-progress and stops a further refinement", async (context) => {
  const f = await fixture(context);
  const r = runtime(f);
  const instruction = projectFixtureInstruction("the same defect\n");
  const built = take(
    await r.service.build({
      ...buildRequest(f, instruction),
      budget: {
        wall_time_ms: 30000,
        max_attempts: 3,
        max_no_progress_attempts: 1,
      },
    }),
  );
  const first = take(await r.service.checkPending(continuation(f, built)));
  const unchanged = take(
    await r.service.refine({ ...continuation(f, first), instruction }),
  );
  expect(unchanged.execution.run).toMatchObject({
    no_progress_attempts: 1,
    stop_reason: "no_progress",
  });
  const second = take(await r.service.checkPending(continuation(f, unchanged)));
  const stopped = take(
    await r.service.refine({ ...continuation(f, second), instruction }),
  );
  expect(stopped.execution.run).toMatchObject({
    execution_status: "paused",
    stop_reason: "no_progress",
    attempt: 2,
  });
  expect(await realInvocations(r.builder)).toBe(2);
});

it.for(["caller", "close"] as const)(
  "persists a cancelled Builder terminal state after %s cancellation",
  async (cancellation, context) => {
    const f = await fixture(context);
    const r = runtime(f);
    const controller = new AbortController();
    const running = r.service.build(
      buildRequest(f, projectFixtureInstruction("unused", "hang")),
      controller.signal,
    );
    await r.builder.waitForStarted();
    if (cancellation === "caller") controller.abort("fixture cancellation");
    else await r.service.close();
    const cancelled = take(await running);
    expect(cancelled.execution.run).toMatchObject({
      execution_status: "cancelled",
      cleanup_status: "complete",
    });
    const receipt = await readFile(
      join(cancelled.execution.directory, "attempt-1-builder.json"),
      "utf8",
    );
    expect(receipt).toContain("fixture-builder-started");
    expect(receipt).toContain("cancelled");
    const reopened = runtime(f);
    const inspected = take(
      await reopened.service.inspect({
        directory: f.initial.directory,
        run_id: cancelled.execution.run.run_id,
      }),
    );
    expect(inspected.execution.run.execution_status).toBe("cancelled");
    expect(inspected.project.revision.project.execution_status).toBe(
      "cancelled",
    );
    expect(reopened.builder.calls).toBe(0);
  },
);

it("records checker cancellation as cancelled while retaining its unknown report", async (context) => {
  const f = await fixture(context, "hang");
  const r = runtime(f);
  const built = take(await r.service.build(buildRequest(f)));
  const controller = new AbortController();
  const running = r.service.checkPending(
    continuation(f, built),
    controller.signal,
  );
  await vi.waitFor(
    async () => {
      expect(await readFile(f.readyPath, "utf8")).toBe("ready");
    },
    { timeout: 5000 },
  );
  controller.abort("cancel the running checker");
  const result = await running;
  const inspected = take(
    await r.service.inspect({
      directory: f.initial.directory,
      run_id: built.execution.run.run_id,
    }),
  );
  expect(inspected.execution.run).toMatchObject({
    execution_status: "cancelled",
    cleanup_status: "complete",
  });
  expect(inspected.project.revision.project.execution_status).toBe("cancelled");
  const reportNames = await readdir(join(f.initial.directory, "checks"));
  expect(reportNames).toHaveLength(1);
  const reportName = reportNames[0];
  if (reportName === undefined)
    throw new Error("Cancelled checker report was lost");
  expect(
    await readFile(join(f.initial.directory, "checks", reportName), "utf8"),
  ).toContain("checker-ready");
  if (result.ok && result.value.check !== undefined) {
    expect(result.value.check.outcome).toBe("unknown");
    expect(await readFile(result.value.check.report_path, "utf8")).toContain(
      "checker-ready",
    );
  }
  expect(await realInvocations(r.builder)).toBe(1);
});

it("retains the pending check and spent budget after a real checker timeout", async (context) => {
  const f = await fixture(context, "hang");
  const r = runtime(f);
  const built = take(await r.service.build(buildRequest(f)));
  const saved = take(
    await new ProjectRunStore(f.resources).append(
      f.initial.directory,
      built.execution.token,
      {
        kind: "set_budget",
        budget: {
          ...built.execution.run.budget,
          wall_time_ms: built.execution.run.elapsed_ms + 5000,
        },
        reason:
          "Bound the real hanging checker while preserving the spent Builder budget",
        at: new Date(
          Math.max(Date.now(), Date.parse(built.execution.run.updated_at)),
        ).toISOString(),
        elapsed_ms: built.execution.run.elapsed_ms,
      },
    ),
  );
  await r.service.checkPending({
    directory: f.initial.directory,
    run_id: saved.run.run_id,
    expected: saved.token,
    checker_path: f.manifestPath,
  });
  const inspected = take(
    await r.service.inspect({
      directory: f.initial.directory,
      run_id: saved.run.run_id,
    }),
  );
  expect(inspected.execution.run).toMatchObject({
    phase: "check",
    execution_status: "paused",
    stop_reason: "budget_exhausted",
    cleanup_status: "complete",
    attempt: 1,
    budget_revision: 2,
  });
  expect(inspected.execution.run.pending_check).toEqual(
    saved.run.pending_check,
  );
  expect(inspected.execution.run.elapsed_ms).toBeGreaterThanOrEqual(
    saved.run.budget.wall_time_ms,
  );
  expect(inspected.execution.run.elapsed_ms).toBeGreaterThan(
    saved.run.elapsed_ms,
  );
  expect(await readFile(f.readyPath, "utf8")).toBe("ready");
  const reports = await readdir(join(f.initial.directory, "checks"));
  expect(reports).toHaveLength(1);
  const name = reports[0];
  if (name === undefined) throw new Error("Timed-out checker report was lost");
  const report: unknown = JSON.parse(
    await readFile(join(f.initial.directory, "checks", name), "utf8"),
  );
  expect(report).toMatchObject({
    outcome: "unknown",
    execution_failure_reason: "timeout",
    process: { stdout: { text: "checker-ready\n" } },
  });
  expect(await realInvocations(r.builder)).toBe(1);
});

it.for(["same-project", "different-project", "symlink-output"] as const)(
  "excludes a second writer to the same output through %s",
  async (selection, context) => {
    const f = await fixture(context);
    const first = runtime(f);
    const running = first.service.build(
      buildRequest(f, projectFixtureInstruction("ready\n", "wait")),
    );
    await first.builder.waitForStarted();
    let selected = take(await f.store.read(f.initial.directory));
    if (selection !== "same-project") {
      let output = f.output;
      if (selection === "symlink-output") {
        output = join(f.root, "output-alias");
        await symlink(
          f.output,
          output,
          process.platform === "win32" ? "junction" : "dir",
        );
      }
      selected = take(
        await f.store.create(join(f.root, `project-${selection}`), {
          name: selection,
          scope: { ...f.project.scope, output_root: output },
        }),
      );
    }
    const second = runtime(f);
    const rejected = await second.service.build({
      ...buildRequest(f),
      directory: selected.directory,
      expected: projectRevisionToken(selected.revision),
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok)
      expect(rejected.error.diagnostics?.reason).toBe("workspace_busy");
    expect(second.builder.calls).toBe(0);
    await first.builder.release();
    expect(take(await running).execution.run.stop_reason).toBe("pending_check");
  },
);

it("permits independent real output roots to execute concurrently", async (context) => {
  const firstFixture = await fixture(context);
  const secondFixture = await createProjectWorkflowFixture();
  const first = runtime(firstFixture);
  const second = runtime(secondFixture, {
    leaseDirectory: firstFixture.leaseDirectory,
  });
  const one = first.service.build(
    buildRequest(firstFixture, projectFixtureInstruction("ready\n", "wait")),
  );
  const two = second.service.build(
    buildRequest(secondFixture, projectFixtureInstruction("ready\n", "wait")),
  );
  await Promise.all([
    first.builder.waitForStarted(),
    second.builder.waitForStarted(),
  ]);
  await Promise.all([first.builder.release(), second.builder.release()]);
  expect(take(await one).execution.run.execution_status).toBe("paused");
  expect(take(await two).execution.run.execution_status).toBe("paused");
  expect(await realInvocations(first.builder)).toBe(1);
  expect(await realInvocations(second.builder)).toBe(1);
});

it("does not replay a writer whose durable cleanup acknowledgement is unknown", async (context) => {
  const f = await fixture(context);
  const uncertain = runtime(f, { uncertainCleanup: true });
  const interrupted = take(await uncertain.service.build(buildRequest(f)));
  expect(interrupted.execution.run).toMatchObject({
    execution_status: "interrupted",
    cleanup_status: "unknown",
  });
  await uncertain.service.close();
  const next = runtime(f);
  const fresh = take(await f.store.read(f.initial.directory));
  const rejected = await next.service.build({
    ...buildRequest(f),
    expected: projectRevisionToken(fresh.revision),
  });
  expect(rejected.ok).toBe(false);
  if (!rejected.ok)
    expect(rejected.error.diagnostics?.reason).toBe(
      "workspace_recovery_unknown",
    );
  expect(next.builder.calls).toBe(0);
  expect(await realInvocations(uncertain.builder)).toBe(1);
});

it("keeps consumed budget and attempt limits across close and reopen", async (context) => {
  const f = await fixture(context);
  const original = runtime(f);
  const budget = {
    wall_time_ms: 30000,
    max_attempts: 1,
    max_no_progress_attempts: 2,
  };
  const built = take(
    await original.service.build({
      ...buildRequest(f, projectFixtureInstruction("ready\n", "write", 80)),
      budget,
    }),
  );
  expect(built.execution.run.elapsed_ms).toBeGreaterThanOrEqual(70);
  await original.service.close();
  const next = runtime(f);
  const checked = take(await next.service.checkPending(continuation(f, built)));
  const stopped = take(
    await next.service.refine({
      ...continuation(f, checked),
      instruction: projectFixtureInstruction("another candidate"),
    }),
  );
  expect(stopped.execution.run).toMatchObject({
    execution_status: "paused",
    stop_reason: "budget_exhausted",
    attempt: 1,
    budget,
  });
  expect(stopped.execution.run.elapsed_ms).toBeGreaterThanOrEqual(
    built.execution.run.elapsed_ms,
  );
  expect(next.builder.calls).toBe(0);
});

it("refuses a changed original target before launching a Builder", async (context) => {
  const f = await fixture(context);
  const r = runtime(f);
  await writeFile(f.sourcePath, "Changed original input");
  const result = await r.service.build(buildRequest(f));
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.message).toContain("source");
  expect(r.builder.calls).toBe(0);
});

it("fails a completed Builder observation if the original target changed during execution", async (context) => {
  const f = await fixture(context);
  const r = runtime(f);
  const running = r.service.build(
    buildRequest(f, projectFixtureInstruction("ready\n", "wait")),
  );
  await r.builder.waitForStarted();
  const project = take(await f.store.read(f.initial.directory));
  const runId = project.revision.project.run_ids.at(-1);
  if (runId === undefined)
    throw new Error("Running project omitted its run identity");
  await writeFile(f.sourcePath, "Replaced source during the Builder attempt");
  await r.builder.release();
  expect((await running).ok).toBe(false);
  const inspected = take(
    await r.service.inspect({ directory: f.initial.directory, run_id: runId }),
  );
  expect(inspected.execution.run).toMatchObject({
    execution_status: "failed",
    cleanup_status: "complete",
    acceptance_status: "unknown",
  });
});

it("retains a completed Builder observation when exclusive receipt publication conflicts", async (context) => {
  const f = await fixture(context);
  const r = runtime(f);
  const candidate = "Completed before the receipt conflict\n";
  const running = r.service.build(
    buildRequest(f, projectFixtureInstruction(candidate, "wait")),
  );
  await r.builder.waitForStarted();
  const project = take(await f.store.read(f.initial.directory));
  const runId = project.revision.project.run_ids.at(-1);
  if (runId === undefined)
    throw new Error("Running project omitted its run identity");
  const store = new ProjectRunStore(f.resources);
  const started = take(await store.read(f.initial.directory, runId));
  const receiptPath = join(started.directory, "attempt-1-builder.json");
  const originalReceipt = '{"preserved":"pre-existing receipt bytes"}\n';
  await writeFile(receiptPath, originalReceipt, {
    encoding: "utf8",
    flag: "wx",
  });
  await r.builder.release();
  const result = await running;
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Receipt publication conflict was accepted");
  expect(result.error.partialObservation).toMatchObject({
    kind: "project_execution",
    builder_observation: {
      status: "completed",
      exit_code: 0,
      session_id: null,
      stdout: "fixture-builder-started\nfixture-builder-completed\n",
      stderr: "",
      observed_tokens: null,
      cleanup_status: "complete",
      limitations: [],
    },
  });
  const failed = take(await store.read(f.initial.directory, runId));
  expect(failed.run).toMatchObject({
    execution_status: "failed",
    cleanup_status: "complete",
    acceptance_status: "unknown",
    pending_check: null,
  });
  expect(await readFile(receiptPath, "utf8")).toBe(originalReceipt);
  expect(await readFile(f.candidatePath, "utf8")).toBe(candidate);
  expect(await realInvocations(r.builder)).toBe(1);
});

it("recovers the saved pending check after a real project-projection write failure", async (context) => {
  await requirePermissionDenial(context, "directory-write");
  const f = await fixture(context);
  const original = runtime(f);
  const running = original.service.build(
    buildRequest(f, projectFixtureInstruction("ready\n", "wait")),
  );
  await original.builder.waitForStarted();
  const project = take(await f.store.read(f.initial.directory));
  const runId = project.revision.project.run_ids.at(-1);
  if (runId === undefined)
    throw new Error("Running project omitted its run identity");
  await chmod(f.initial.directory, 0o500);
  try {
    await original.builder.release();
    expect((await running).ok).toBe(false);
  } finally {
    await chmod(f.initial.directory, 0o700);
  }
  const saved = take(
    await new ProjectRunStore(f.resources).read(f.initial.directory, runId),
  );
  expect(saved.run).toMatchObject({
    execution_status: "paused",
    phase: "check",
    stop_reason: "pending_check",
  });
  await original.service.close();
  const reopened = runtime(f);
  const checked = take(
    await reopened.service.checkPending({
      directory: f.initial.directory,
      run_id: runId,
      expected: saved.token,
      checker_path: f.manifestPath,
    }),
  );
  expect(checked.check?.outcome).toBe("pass");
  expect(checked.project.revision.project.execution_status).toBe("succeeded");
  expect(reopened.builder.calls).toBe(0);
  expect(await realInvocations(original.builder)).toBe(1);
});

it("commits cancellation cleanup even while project metadata publication is denied", async (context) => {
  await requirePermissionDenial(context, "directory-write");
  const f = await fixture(context);
  const r = runtime(f);
  const controller = new AbortController();
  const running = r.service.build(
    buildRequest(f, projectFixtureInstruction("unused", "hang")),
    controller.signal,
  );
  await r.builder.waitForStarted();
  const project = take(await f.store.read(f.initial.directory));
  const runId = project.revision.project.run_ids.at(-1);
  if (runId === undefined)
    throw new Error("Running project omitted its run identity");
  await chmod(f.initial.directory, 0o500);
  try {
    controller.abort("cancel with blocked metadata projection");
    await running;
  } finally {
    await chmod(f.initial.directory, 0o700);
  }
  const saved = take(
    await new ProjectRunStore(f.resources).read(f.initial.directory, runId),
  );
  expect(saved.run).toMatchObject({
    execution_status: "cancelled",
    cleanup_status: "complete",
  });
  expect(saved.run.acceptance_status).not.toBe("pass");
  expect(await realInvocations(r.builder)).toBe(1);
  const staleProject = take(await f.store.read(f.initial.directory));
  const fresh = take(
    await r.service.build({
      ...buildRequest(f),
      expected: projectRevisionToken(staleProject.revision),
    }),
  );
  expect(fresh.execution.run.run_id).not.toBe(runId);
  expect(fresh.execution.run).toMatchObject({
    execution_status: "paused",
    stop_reason: "pending_check",
    attempt: 1,
  });
  expect(
    take(
      await new ProjectRunStore(f.resources).read(f.initial.directory, runId),
    ).run.execution_status,
  ).toBe("cancelled");
  expect(await realInvocations(r.builder)).toBe(2);
});

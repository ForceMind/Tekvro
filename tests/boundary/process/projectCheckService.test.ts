import { readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, expect, it, vi } from "vitest";
import { ProjectCheckPublicationError } from "../../../src/application/project/ProjectCheckService.js";
import { projectRevisionToken } from "../../../src/domain/projectManifest.js";
import {
  createProjectRunRecord,
  transitionProjectRun,
} from "../../../src/domain/projectRun.js";
import { randomUUID } from "node:crypto";
import { prepareProcessOwnershipInspection } from "../../../src/process/ProcessOwnershipObservation.js";
import {
  ProjectFixtureBuilder,
  projectFixtureInstruction,
} from "../../fixtures/projectFixtureBuilder.js";
import {
  createProjectWorkflowFixture as fixture,
  takeProjectResult as take,
} from "../../fixtures/projectWorkflow.js";

beforeAll(async () => {
  await prepareProcessOwnershipInspection();
});

it("qualifies the real Node fixture writer and oracle without claiming a project lease workflow", async () => {
  const f = await fixture();
  const builder = new ProjectFixtureBuilder(f.verifier);
  try {
    const initial = take(
      createProjectRunRecord({
        project: f.initial.revision,
        run_id: randomUUID(),
        phase: "build",
        created_at: new Date().toISOString(),
        adapter: { id: builder.id, version: null, model: null },
      }),
    );
    const run = take(
      transitionProjectRun(initial, {
        kind: "start",
        at: initial.created_at,
        elapsed_ms: 0,
      }),
    );
    const request = {
      run,
      workspace: f.output,
      instruction: projectFixtureInstruction("fixture-produced defect\n"),
      timeout_ms: 5000,
    };
    expect(take(await builder.run(request)).status).toBe("completed");
    expect(await readFile(f.candidatePath, "utf8")).toBe(
      "fixture-produced defect\n",
    );
    expect(take(await f.service.run(f.request())).outcome).toBe("fail");
    const controller = new AbortController();
    const waiting = builder.run(
      { ...request, instruction: projectFixtureInstruction("unused", "hang") },
      controller.signal,
    );
    await builder.waitForStarted();
    controller.abort("stop the fixture process");
    expect(take(await waiting)).toMatchObject({
      status: "cancelled",
      cleanup_status: "complete",
      stdout: "fixture-builder-started\n",
    });
  } finally {
    await builder.close();
  }
});

it("runs an external oracle, detects a deliberate defect, and verifies a repaired candidate", async () => {
  const f = await fixture("diagnostic");
  const first = take(await f.service.run(f.request()));
  expect(first).toMatchObject({
    outcome: "pass",
    applicability: "matched",
    evidence_ids: [],
    report: {
      cleanup_status: "complete",
      process: {
        exit_code: 0,
        stderr: { text: "Checked external expected data\n" },
      },
    },
  });
  expect(f.project.acceptance_status).toBe("not_evaluated");
  expect(
    take(
      await f.service.read(first, {
        project: f.project,
        checker_path: f.manifestPath,
      }),
    ).outcome,
  ).toBe("pass");
  await writeFile(f.candidatePath, "a known defect\n");
  const stale = take(
    await f.service.read(first, {
      project: f.project,
      checker_path: f.manifestPath,
    }),
  );
  expect(stale).toMatchObject({
    outcome: "unknown",
    applicability: "stale",
    report: { outcome: "pass" },
  });
  expect(stale.limitations).toContain("candidate_changed");
  const defect = take(await f.service.run(f.request()));
  expect(defect).toMatchObject({
    outcome: "fail",
    report: { process: { exit_code: 1 } },
  });
  expect(defect.binding.candidate_sha256).not.toBe(
    first.binding.candidate_sha256,
  );
  await writeFile(f.candidatePath, "ready\n");
  expect(take(await f.service.run(f.request())).outcome).toBe("pass");
});

it("refuses a changed pending binding before starting its command", async () => {
  const f = await fixture("hang");
  const request = f.request();
  const expected = take(
    await f.service.prepare({
      project: request.project,
      run_id: request.run_id,
      checker_path: request.checker_path,
    }),
  );
  await writeFile(f.candidatePath, "modified after preparation");
  const result = await f.service.run({
    ...request,
    expected_binding: expected,
  });
  expect(result.ok).toBe(false);
  if (!result.ok)
    expect(result.error.message).toContain("inputs changed before execution");
  await expect(readFile(f.readyPath)).rejects.toMatchObject({ code: "ENOENT" });
});

it("refuses verifier inputs and report paths inside the Builder tree, including directory aliases", async () => {
  const f = await fixture();
  const alias = join(f.root, "candidate-alias");
  await symlink(
    f.output,
    alias,
    process.platform === "win32" ? "junction" : "dir",
  );
  const embedded = join(f.output, "manifest.json");
  await writeFile(embedded, JSON.stringify(f.manifest));
  const request = f.request();
  expect(
    (
      await f.service.run({
        ...request,
        checker_path: join(alias, "manifest.json"),
      })
    ).ok,
  ).toBe(false);
  expect(
    (
      await f.service.run({
        ...request,
        report_path: join(alias, "report.json"),
      })
    ).ok,
  ).toBe(false);
  const expectedInside = join(f.output, "expected.txt");
  await writeFile(expectedInside, "ready\n");
  await writeFile(
    f.manifestPath,
    JSON.stringify({
      ...f.manifest,
      inputs: f.manifest.inputs.map((input) =>
        input.role === "expected"
          ? { ...input, path: join(alias, "expected.txt") }
          : input,
      ),
    }),
  );
  expect((await f.service.run(request)).ok).toBe(false);
});

it.each([
  "duplicate",
  "unknown",
  "missing",
  "wrong-binding",
  "wrong-invocation",
  "wrong-exit",
  "invalid-json",
  "invalid-utf8",
])(
  "preserves %s checker output without promoting it to acceptance",
  async (mode) => {
    const f = await fixture(mode);
    const result = take(await f.service.run(f.request()));
    expect(result.outcome).toBe("unknown");
    expect(result.report.process?.stdout.text.length).toBeGreaterThan(0);
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(await readFile(result.report_path, "utf8")).toContain(
      "tekvro.project-check",
    );
  },
);

it("retains truncated process output and a changed candidate as unknown", async () => {
  const oversized = await fixture("oversized");
  const truncated = take(
    await oversized.service.run({
      ...oversized.request(),
      diagnostic_bytes: 1024,
    }),
  );
  expect(truncated).toMatchObject({
    outcome: "unknown",
    report: { process: { truncated: true } },
  });
  expect(truncated.report.process?.stdout.text.length).toBeGreaterThan(0);
  const mutated = await fixture("mutate-candidate");
  const result = take(await mutated.service.run(mutated.request()));
  expect(result).toMatchObject({ outcome: "unknown", applicability: "stale" });
  expect(result.report.checks).toMatchObject([{ status: "pass" }]);
});

it("cancels a real running checker, retains partial output, and saves an unknown report", async () => {
  const f = await fixture("hang");
  const controller = new AbortController();
  const running = f.service.run(f.request(), controller.signal);
  await vi.waitFor(
    async () => {
      expect(await readFile(f.readyPath, "utf8")).toBe("ready");
    },
    { timeout: 4000 },
  );
  controller.abort("cancel the check");
  const result = take(await running);
  expect(result).toMatchObject({
    outcome: "unknown",
    applicability: "unknown",
    report: {
      cleanup_status: "complete",
      process: { stdout: { text: "checker-ready\n" } },
    },
  });
  expect(result.report.execution_failure).toContain("cancelled");
  expect(await readFile(result.report_path, "utf8")).toContain("checker-ready");
});

it("records timeout as unknown and refuses pre-cancelled work before launch", async () => {
  const f = await fixture("hang");
  const timed = take(await f.service.run({ ...f.request(), timeout_ms: 200 }));
  expect(timed).toMatchObject({
    outcome: "unknown",
    report: { cleanup_status: "complete" },
  });
  expect(timed.report.execution_failure).toContain("timeout");
  const cancelled = await f.service.run(
    f.request(),
    AbortSignal.abort("already cancelled"),
  );
  expect(cancelled.ok).toBe(false);
  if (!cancelled.ok)
    expect(cancelled.error._tag).toBe("AnalysisCancelledError");
});

it("rejects tampered report bytes, changed fixed inputs, and A-to-B-to-A scope reuse", async () => {
  const f = await fixture();
  const result = take(await f.service.run(f.request()));
  const changed = take(
    await f.store.edit(
      f.initial.directory,
      projectRevisionToken(f.initial.revision),
      {
        scope: { ...f.project.scope, question: "A different obligation scope" },
        change_reason: "Exercise a changed obligation scope",
      },
    ),
  );
  const restored = take(
    await f.store.edit(
      f.initial.directory,
      projectRevisionToken(changed.revision),
      {
        scope: f.project.scope,
        change_reason: "Restore the original scope and retain its new revision",
      },
    ),
  );
  const stale = take(
    await f.service.read(result, {
      project: restored.revision.project,
      checker_path: f.manifestPath,
    }),
  );
  expect(stale).toMatchObject({ outcome: "unknown", applicability: "stale" });
  expect(stale.limitations).toContain("scope_revision_changed");
  await writeFile(f.expectedPath, "changed expected data");
  expect(
    take(
      await f.service.read(result, {
        project: f.project,
        checker_path: f.manifestPath,
      }),
    ).outcome,
  ).toBe("unknown");
  expect((await f.service.run(f.request())).ok).toBe(false);
  await writeFile(result.report_path, '{"forged":true}\n');
  const tampered = await f.service.read(result, {
    project: f.project,
    checker_path: f.manifestPath,
  });
  expect(tampered.ok).toBe(false);
  if (!tampered.ok) expect(tampered.error.message).toContain("digest");
});

it("retains a completed observation when exclusive report publication fails", async () => {
  const f = await fixture();
  const request = f.request();
  await writeFile(request.report_path, "existing evidence\n");
  const result = await f.service.run(request);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected exclusive publication refusal");
  expect(result.error).toBeInstanceOf(ProjectCheckPublicationError);
  if (!(result.error instanceof ProjectCheckPublicationError))
    throw result.error;
  expect(result.error.report.outcome).toBe("pass");
  expect(result.error.capturedOutput?.stdout).toContain(
    "tekvro.project-check-result",
  );
  expect(await readFile(request.report_path, "utf8")).toBe(
    "existing evidence\n",
  );
});

import { createHash, randomUUID } from "node:crypto";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { onTestFinished, type TestContext } from "vitest";
import { ArtifactResourceScope } from "../../src/artifacts/ArtifactResourceScope.js";
import {
  ProjectCheckService,
  type ProjectCheckerManifest,
} from "../../src/application/project/ProjectCheckService.js";
import { acquireProjectWorkspace } from "../../src/application/project/ProjectWorkspace.js";
import { ProjectStore } from "../../src/application/project/ProjectStore.js";
import type { Result } from "../../src/domain/result.js";
import { hashStableFile } from "../../src/filesystem/StableFileHash.js";
import { projectLeaseListenDenial } from "./projectLeaseCapability.js";
import { createTestTempDirectory } from "./temporaryDirectory.js";

/** Unwrap a fixture result while preserving its actual typed failure. */
export const takeProjectResult = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw result.error;
  return result.value;
};
const hash = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

const detachedCheckerHelperSource = `
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
const [ready, stop] = process.argv.slice(1);
const deadline = setTimeout(() => process.exit(64), 30000);
await writeFile(ready, JSON.stringify({
  pid: process.pid, parent_pid: process.ppid, run_id: process.env.REA_PROCESS_RUN_ID,
}));
while (true) {
  try { await readFile(stop); break; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  await delay(20);
}
clearTimeout(deadline);
`;

// The oracle reads expected content from a verifier-owned file. It deliberately
// does not consume a candidate-authored test, assertion or success marker.
const checkerSource = `
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
const scenario = JSON.parse(await readFile(process.argv[2], "utf8"));
const expected = await readFile(process.argv[3], "utf8");
const actual = await readFile(scenario.candidate_file, "utf8");
const mode = process.env.CHECKER_MODE ?? "normal";
const binding = JSON.parse(process.env.TEKVRO_PROJECT_CHECK_BINDING);
const status = actual === expected ? "pass" : "fail";
const check = { requirement_id: "content", status, detail: "Compared candidate bytes with external expected content" };
const report = { schema: "tekvro.project-check-result", schema_version: 1,
  check_id: process.env.TEKVRO_PROJECT_CHECK_ID, binding, checks: [check] };
if (mode === "hang") {
  process.stdout.write("checker-ready\\n");
  await writeFile(process.argv[4], "ready");
  setInterval(() => {}, 1000);
} else {
  if (mode === "detached-helper") {
    const helper = spawn(process.execPath,
      ["--input-type=module", "-e", ${JSON.stringify(detachedCheckerHelperSource)}, process.argv[4], process.argv[5]],
      { detached: true, stdio: "ignore" });
    await once(helper, "spawn");
    helper.unref();
    while (true) {
      try { await readFile(process.argv[6]); break; }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      await delay(20);
    }
  }
  if (mode === "duplicate") report.checks.push(check);
  if (mode === "unknown") check.status = "unknown";
  if (mode === "missing") report.checks = [{ ...check, requirement_id: "optional" }];
  if (mode === "wrong-binding") report.binding.scope_revision += 1;
  if (mode === "wrong-invocation") report.check_id = "00000000-0000-4000-8000-000000000000";
  if (mode === "mutate-candidate") await writeFile(scenario.candidate_file, "changed while checking");
  if (mode === "diagnostic") process.stderr.write("Checked external expected data\\n");
  if (mode === "invalid-utf8") process.stderr.write(Buffer.from([255]));
  if (mode === "invalid-json") process.stdout.write("not-json");
  else if (mode === "oversized") process.stdout.write("x".repeat(32768));
  else process.stdout.write(JSON.stringify(report));
  process.exitCode = mode === "wrong-exit" ? 7 : status === "fail" ? 1 : 0;
}
`;

/** A real external checker with immutable expected data and a separate output tree. */
export const createProjectWorkflowFixture = async (mode = "normal") => {
  const root = await createTestTempDirectory("tekvro-pw-");
  const resources = new ArtifactResourceScope();
  onTestFinished(async () => {
    await resources.close();
  });
  const output = join(root, "candidate");
  const verifier = join(root, "verifier");
  const reports = join(root, "reports");
  await Promise.all([mkdir(output), mkdir(verifier), mkdir(reports)]);
  const candidatePath = join(output, "answer.txt");
  const sourcePath = join(root, "reference.txt");
  const checkerPath = join(verifier, "checker.mjs");
  const scenarioPath = join(verifier, "scenario.json");
  const expectedPath = join(verifier, "expected.txt");
  const readyPath = join(verifier, "ready.txt");
  const helperStopPath = join(verifier, "helper-stop");
  const checkerReleasePath = join(verifier, "checker-release");
  const scenario = JSON.stringify({ candidate_file: candidatePath });
  await Promise.all([
    writeFile(candidatePath, "ready\n"),
    writeFile(sourcePath, "Reference target"),
    writeFile(checkerPath, checkerSource),
    writeFile(scenarioPath, scenario),
    writeFile(expectedPath, "ready\n"),
  ]);
  const store = new ProjectStore(resources);
  const initial = takeProjectResult(
    await store.create(join(root, "project"), {
      name: "Independent checker fixture",
      scope: {
        goal: "reconstruction",
        question: "Reproduce the required text",
        target: {
          original_input: sourcePath,
          path: sourcePath,
          sha256: hash("Reference target"),
        },
        output_root: output,
        requirements: [
          {
            requirement_id: "content",
            description: "Matches the external expected content",
            required: true,
          },
          {
            requirement_id: "optional",
            description: "Optional observation",
            required: false,
          },
        ],
      },
    }),
  );
  const executable = await realpath(process.execPath);
  const executableHash = await hashStableFile(executable, {
    retainFailedClose: (handle) => {
      resources.retain({ kind: "file-handle", resource: executable, handle });
    },
  });
  const manifest: ProjectCheckerManifest = {
    schema: "tekvro.project-checker",
    schema_version: 1,
    executable: { path: executable, sha256: executableHash.sha256 },
    argv: [
      checkerPath,
      scenarioPath,
      expectedPath,
      readyPath,
      helperStopPath,
      checkerReleasePath,
    ],
    cwd: verifier,
    inputs: [
      { path: checkerPath, sha256: hash(checkerSource), role: "checker" },
      { path: scenarioPath, sha256: hash(scenario), role: "scenario" },
      { path: expectedPath, sha256: hash("ready\n"), role: "expected" },
    ],
    environment: { CHECKER_MODE: mode },
    success_exit_code: 0,
    failure_exit_code: 1,
  };
  const manifestPath = join(verifier, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest));
  const service = new ProjectCheckService(resources);
  const project = initial.revision.project;
  const request = () => ({
    project,
    run_id: randomUUID(),
    checker_path: manifestPath,
    report_path: join(reports, `${randomUUID()}.json`),
    timeout_ms: 5000,
    diagnostic_bytes: 64 * 1024,
  });
  return {
    root,
    resources,
    output,
    verifier,
    reports,
    candidatePath,
    sourcePath,
    checkerPath,
    scenarioPath,
    expectedPath,
    readyPath,
    helperStopPath,
    checkerReleasePath,
    manifest,
    manifestPath,
    project,
    initial,
    store,
    service,
    request,
  };
};

/** Shared local oracle fixture; it makes no claim about an Agent or browser. */
export type ProjectWorkflowFixture = Awaited<
  ReturnType<typeof createProjectWorkflowFixture>
>;

/** Probe the actual owner and skip only a real host-level socket listen denial. */
export const requireProjectWorkflowLease = async (
  context: Pick<TestContext, "skip">,
  fixture: ProjectWorkflowFixture,
  leaseDirectory = join(fixture.root, "leases"),
): Promise<string> => {
  const acquired = await acquireProjectWorkspace(
    fixture.initial.directory,
    fixture.project,
    randomUUID(),
    fixture.resources,
    leaseDirectory,
  );
  if (!acquired.ok) {
    const denial = projectLeaseListenDenial(acquired.error);
    if (denial !== undefined)
      context.skip(
        `Host rejects the real project lease socket listen with ${denial}; project runtime/concurrency coverage remains unverified on this host`,
      );
    throw acquired.error;
  }
  takeProjectResult(await acquired.value.release(true));
  return leaseDirectory;
};

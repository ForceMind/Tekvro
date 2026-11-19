import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ProjectCheckService } from "../../dist/application/project/ProjectCheckService.js";
import { ProjectStore } from "../../dist/application/project/ProjectStore.js";
import { ArtifactResourceScope } from "../../dist/artifacts/ArtifactResourceScope.js";
import { hashStableFile } from "../../dist/filesystem/StableFileHash.js";
import { fixturePage } from "./browser-reconstruction-e2e.mjs";
import { withVerifierCleanup } from "./verifier-cleanup.mjs";

const checker = fileURLToPath(
  new URL("./browser-project-checker.mjs", import.meta.url),
);
const fixture = fileURLToPath(
  new URL("./browser-reconstruction-e2e.mjs", import.meta.url),
);

function take(result) {
  if (!result.ok) throw result.error;
  return result.value;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function fixedFile(path, resources) {
  const canonical = await realpath(path);
  const { sha256 } = await hashStableFile(canonical, {
    retainFailedClose: (handle) => {
      resources.retain({ kind: "file-handle", resource: canonical, handle });
    },
  });
  return { path: canonical, sha256 };
}

/** Qualify the existing checker's report binding using a real browser oracle. */
export async function verifyBrowserProjectCheck(executable) {
  const root = await mkdtemp(join(tmpdir(), "tekvro-project-browser-"));
  const resources = new ArtifactResourceScope();
  return withVerifierCleanup(async () => {
    const candidateRoot = join(root, "candidate");
    const candidate = join(candidateRoot, "index.html");
    const reference = join(root, "reference.html");
    const scenario = join(root, "scenario.json");
    const checkerPath = join(root, "checker.json");
    const correctPage = fixturePage(1);
    await mkdir(candidateRoot);
    await Promise.all([
      writeFile(candidate, correctPage),
      writeFile(reference, correctPage),
      writeFile(
        scenario,
        JSON.stringify({ width: 390, expected_counter: "1" }),
      ),
    ]);
    const browser = await fixedFile(executable, resources);
    const environment = Object.fromEntries(
      [
        "PATH",
        "HOME",
        "TMPDIR",
        "XDG_RUNTIME_DIR",
        "DBUS_SESSION_BUS_ADDRESS",
        "REA_BROWSER_NO_SANDBOX",
      ].flatMap((key) =>
        process.env[key] === undefined ? [] : [[key, process.env[key]]],
      ),
    );
    const manifest = {
      schema: "tekvro.project-checker",
      schema_version: 1,
      executable: await fixedFile(process.execPath, resources),
      argv: [checker, scenario, reference, candidate, browser.path],
      cwd: root,
      inputs: [
        { ...(await fixedFile(checker, resources)), role: "checker" },
        { ...(await fixedFile(fixture, resources)), role: "checker" },
        { ...(await fixedFile(scenario, resources)), role: "scenario" },
        { ...(await fixedFile(reference, resources)), role: "expected" },
        { ...browser, role: "checker" },
      ],
      environment,
      success_exit_code: 0,
      failure_exit_code: 1,
    };
    await writeFile(checkerPath, JSON.stringify(manifest));
    const {
      revision: { project },
    } = take(
      await new ProjectStore(resources).create(join(root, "project"), {
        name: "Browser counter verification",
        scope: {
          goal: "reconstruction",
          question: "Does the candidate preserve the counter after reopening?",
          target: {
            original_input: reference,
            path: reference,
            sha256: sha256(correctPage),
          },
          output_root: candidateRoot,
          requirements: [
            {
              requirement_id: "reopened_counter",
              description: "Match the reference rendering and persisted count",
              required: true,
            },
          ],
        },
      }),
    );
    const service = new ProjectCheckService(resources);
    const run = async (label, expected) => {
      const input = {
        project,
        checker_path: checkerPath,
        run_id: randomUUID(),
      };
      const expectedBinding = take(await service.prepare(input));
      const result = take(
        await service.run({
          ...input,
          expected_binding: expectedBinding,
          report_path: join(root, `${label}.json`),
          timeout_ms: 75_000,
          diagnostic_bytes: 64 * 1024,
        }),
      );
      assert.equal(result.outcome, expected, JSON.stringify(result.report));
      assert.equal(result.applicability, "matched");
      assert.equal(result.report.cleanup_status, "complete");
      assert.deepEqual(result.binding, expectedBinding);
      assert.equal(
        sha256(await readFile(result.report_path)),
        result.report_sha256,
      );
      return result;
    };
    const original = await run("original", "pass");
    await writeFile(candidate, fixturePage(2));
    const stale = take(
      await service.read(
        {
          report_path: original.report_path,
          report_sha256: original.report_sha256,
        },
        { project, checker_path: checkerPath },
      ),
    );
    assert.equal(stale.applicability, "stale");
    assert.equal(stale.outcome, "unknown");
    assert.equal(stale.report.outcome, "pass");
    const broken = await run("broken", "fail");
    const brokenDetails = JSON.parse(broken.report.checks[0].detail);
    for (const artifact of ["screenshot", "storage"]) {
      assert.ok(
        brokenDetails.changed_artifacts.some(
          (item) => item.step_id === "reopen" && item.artifact === artifact,
        ),
      );
    }
    await writeFile(candidate, correctPage);
    const repaired = await run("repaired", "pass");
    return {
      mocked: false,
      prior_pass_after_candidate_change: stale.outcome,
      checks: [original, broken, repaired].map(
        ({ outcome, binding, report_sha256, report }) => ({
          outcome,
          binding,
          report_sha256,
          observation: JSON.parse(report.checks[0].detail),
        }),
      ),
    };
  }, [
    () => resources.close(),
    () => rm(root, { recursive: true, force: true }),
  ]);
}

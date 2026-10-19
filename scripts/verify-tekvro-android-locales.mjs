import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { parseEvidence } from "../dist/domain/evidence.js";
import { apktoolResultSchemas } from "../dist/domain/apktool/apktoolResourceAnalysis.js";
import { mcpTextValue } from "./lib/mcp-verifier-results.mjs";
import {
  assertVerifierCleanupComplete,
  completeVerifierRun,
  createVerifierRun,
} from "./lib/verifier-run.mjs";

if (process.argv.length !== 3)
  throw new Error("Supply one compiled, source-owned APK path.");
const apk = resolve(process.argv[2]);
const original = await readFile(apk);
const sha256 = createHash("sha256").update(original).digest("hex");
const entrypoint = resolve("scripts/rea.mjs");
const run = createVerifierRun();
const environment = { ...process.env, REA_PROCESS_RUN_ID: run.run_id };
const execute = promisify(execFile);
const check = (value) => {
  const evidence = parseEvidence(value);
  const result = apktoolResultSchemas.decode_android_resources.parse(
    evidence.normalized_result,
  );
  assert.equal(result.target.sha256, sha256);
  assert.equal(result.target.bytes, original.length);
  assert.equal(result.target.path, apk);
  assert.equal(
    result.metadata.package_name,
    "io.github.forcemind.tekvro.fixture.locales",
  );
  assert.equal(result.metadata.version_code, "1");
  for (const [locale, greeting] of [
    [null, "Hello from Tekvro"],
    ["de", "Tekvro Ressourcen"],
    ["zh-CN", "探核资源验证"],
  ]) {
    const table = result.string_tables?.find((item) => item.locale === locale);
    assert.ok(table, "Missing explicitly requested table: " + locale);
    assert.equal(table.status, "present");
    assert.equal(table.coverage, "complete");
    assert.equal(table.unparsed_count, 0);
    assert.ok(
      table.strings.some(
        (item) => item.name === "greeting" && item.value === greeting,
      ),
    );
  }
  return evidence.evidence_id;
};
const cli = await execute(
  process.execPath,
  [
    entrypoint,
    "decode-android-resources",
    apk,
    "--locales",
    "de",
    "--locales",
    "zh-CN",
    "--format",
    "json",
  ],
  { env: environment, timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
);
const cliEvidence = check(JSON.parse(cli.stdout));
const client = new Client({
  name: "tekvro-android-locales-verifier",
  version: "1",
});
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entrypoint, "mcp"],
  env: environment,
  stderr: "pipe",
});
let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr = (stderr + chunk.toString()).slice(-16_384);
});
const failures = [];
let mcpEvidence;
try {
  await client.connect(transport);
  const result = await client.callTool(
    {
      name: "decode_android_resources",
      arguments: { path: apk, include_strings: true, locales: ["de", "zh-CN"] },
    },
    { timeout: 120_000 },
  );
  assert.notEqual(result.isError, true, mcpTextValue(result));
  mcpEvidence = check(JSON.parse(mcpTextValue(result)));
} catch (cause) {
  failures.push(
    new Error("Android resource MCP verification failed: " + stderr, { cause }),
  );
}
for (const close of [() => client.close(), () => transport.close()]) {
  try {
    await close();
  } catch (cause) {
    failures.push(cause);
  }
}
assert.deepEqual(await readFile(apk), original);
const lifecycle = await completeVerifierRun(run);
try {
  assertVerifierCleanupComplete(lifecycle.process_lineage);
} catch (cause) {
  failures.push(cause);
}
if (failures.length)
  throw new AggregateError(
    failures,
    "Android resource verification or cleanup failed.",
  );
console.log(
  JSON.stringify({
    status: "passed",
    platform: process.platform + "/" + process.arch,
    apk_sha256: sha256,
    cli_evidence: cliEvidence,
    mcp_evidence: mcpEvidence,
    tables: [null, "de", "zh-CN"],
    verifier_run: lifecycle,
  }),
);

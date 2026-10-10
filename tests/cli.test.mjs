import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

const run = promisify(execFile);
const bin = fileURLToPath(new URL("../bin/tekvro.mjs", import.meta.url));

test("CLI doctor and inspect support deterministic JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "tekvro-cli-"));
  try {
    await writeFile(join(root, "sample.txt"), "HELLO ORIGINAL TEKVRO");
    const doctor = await run(process.execPath, [bin, "doctor", "--json", "--root", root]);
    assert.equal(JSON.parse(doctor.stdout).status, "ready");
    const scan = await run(process.execPath, [bin, "scan", "--json", "--root", root]);
    assert.equal(JSON.parse(scan.stdout).files_count, 1);
    const inspect = await run(process.execPath, [bin, "inspect", "sample.txt", "--json", "--root", root]);
    assert.equal(JSON.parse(inspect.stdout).size_bytes, 21);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("CLI refuses outside-root paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "tekvro-cli-"));
  try {
    await assert.rejects(
      run(process.execPath, [bin, "inspect", "..", "--json", "--root", root]),
      error => error.code === 1 && error.stderr.includes("path_out_of_scope")
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("CLI help has a Chinese-first experience", async () => {
  const result = await run(process.execPath, [bin, "help"], { env: { ...process.env, TEKVRO_LANG: "zh-CN" } });
  assert.match(result.stdout, /探核/);
  assert.match(result.stdout, /只读/);
});

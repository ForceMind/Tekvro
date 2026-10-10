import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { detectFormat, extractStrings, inspectFile, scanDirectory } from "../src/inspect.mjs";
import { openScope, resolveTarget } from "../src/scope.mjs";

let root;
before(async () => {
  root = await mkdtemp(join(tmpdir(), "tekvro-scope-"));
  await mkdir(join(root, "app"));
  await mkdir(join(root, ".git"));
  await writeFile(join(root, "app", "main.js"), "const hello = 'HELLO_TEKVRO';\n");
  await writeFile(join(root, ".git", "config"), "private repository");
  await writeFile(join(root, "artifact.wasm"), Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
  if (process.platform !== "win32") {
    await symlink(tmpdir(), join(root, "outside-link"));
  }
});
after(async () => { if (root) await rm(root, { recursive: true, force: true }); });

test("recognizes known executable and archive signatures", () => {
  assert.equal(detectFormat(Buffer.from([0x7f, 69, 76, 70])), "ELF");
  assert.equal(detectFormat(Buffer.from([0, 97, 115, 109])), "WebAssembly");
  assert.equal(detectFormat(Buffer.from([80, 75, 3, 4])), "ZIP container");
  assert.equal(detectFormat(Buffer.from("test"), "index.js"), "JavaScript");
});

test("rejects scope escapes even through symlinks", async () => {
  const scope = await openScope(root);
  await assert.rejects(resolveTarget(scope, "../"), { code: "path_out_of_scope" });
  await assert.rejects(resolveTarget(scope, tmpdir()), { code: "path_out_of_scope" });
  if (process.platform !== "win32") {
    await assert.rejects(resolveTarget(scope, "outside-link"), { code: "path_out_of_scope" });
  }
});

test("inspects a file without executing it and hashes deterministically", async () => {
  const scope = await openScope(root);
  const file = await inspectFile(scope, "artifact.wasm");
  assert.equal(file.format, "WebAssembly");
  assert.equal(file.size_bytes, 8);
  assert.match(file.sha256, /^[0-9a-f]{64}$/);
  assert.equal(file.path, "artifact.wasm");
});

test("extracts printable strings only when requested", async () => {
  const scope = await openScope(root);
  const found = await extractStrings(scope, "app/main.js", { min_length: 5 });
  assert.equal(found.path, "app/main.js");
  assert.ok(found.strings.some(item => item.value.includes("HELLO_TEKVRO")));
});

test("directory scanning skips VCS trees and symlinks", async () => {
  const scope = await openScope(root);
  const scan = await scanDirectory(scope);
  assert.ok(scan.files.some(item => item.path === "app/main.js"));
  assert.ok(scan.files.some(item => item.path === "artifact.wasm"));
  assert.ok(scan.files.every(item => !item.path.startsWith(".git")));
  if (process.platform !== "win32") assert.equal(scan.skipped.links, 1);
});

test("scan argument bounds are enforced", async () => {
  await assert.rejects(scanDirectory(await openScope(root), ".", { max_files: 0 }), {
    code: "invalid_argument",
  });
});

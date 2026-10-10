import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { test } from "node:test";

const bin = fileURLToPath(new URL("../bin/tekvro.mjs", import.meta.url));
test("MCP stdio supports negotiation, listing and root-scoped tools", async () => {
  const root = await mkdtemp(join(tmpdir(), "tekvro-mcp-"));
  await writeFile(join(root, "probe.js"), "const original = true;");
  const child = spawn(process.execPath, [bin, "mcp"], {
    env: { ...process.env, TEKVRO_ROOT: root },
    stdio: ["pipe", "pipe", "pipe"],
  });
  try {
    const expectedIds = new Set([1, 2, 3, 4, 5]);
    const messages = new Map();
    const received = new Promise((resolve, reject) => {
      const clock = setTimeout(() => reject(new Error("MCP test timeout")), 8000);
      const lines = createInterface({ input: child.stdout });
      lines.on("line", line => {
        const msg = JSON.parse(line);
        messages.set(msg.id, msg);
        if ([...expectedIds].every(id => messages.has(id))) {
          clearTimeout(clock);
          resolve();
        }
      });
      child.on("exit", code => { if (messages.size < expectedIds.size) reject(new Error("MCP exited " + code)); });
    });
    const requests = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "inspect_file", arguments: { path: "probe.js" } } },
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "inspect_file", arguments: { path: "../" } } },
      { jsonrpc: "2.0", id: 5, method: "server/discover" },
    ];
    child.stdin.write(requests.map(JSON.stringify).join("\n") + "\n");
    await received;
    assert.equal(messages.get(1).result.serverInfo.name, "tekvro");
    assert.ok(messages.get(2).result.tools.some(tool => tool.name === "inspect_file"));
    assert.equal(messages.get(3).result.isError, false);
    assert.equal(messages.get(3).result.structuredContent.format, "JavaScript");
    assert.equal(messages.get(4).result.isError, true);
    assert.equal(messages.get(4).result.structuredContent.error.code, "path_out_of_scope");
    assert.ok(messages.get(5).result.supportedVersions.includes("2026-07-28"));
  } finally {
    child.kill();
    await rm(root, { recursive: true, force: true });
  }
});

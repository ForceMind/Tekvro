import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { z } from "zod";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

const execute = promisify(execFile);

it("registers the exact local Node and source path through Incur with spaces and quotes", async () => {
  const home = await createTestTempDirectory("tekvro-local-mcp-");
  const folder = join(
    home,
    process.platform === "win32"
      ? "Tekvro 'source' folder"
      : `Tekvro 'source' "folder"`,
  );
  await mkdir(folder);
  const wrapper = join(folder, "launcher.mjs");
  await writeFile(
    wrapper,
    `await import(${JSON.stringify(pathToFileURL(resolve("scripts/rea.mjs")).href)});\n`,
  );
  await execute(process.execPath, [wrapper, "mcp", "add", "--agent", "amp"], {
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      npm_command: "exec",
      npm_config_user_agent: "bun/1.4.2",
      CI: "1",
    },
    timeout: 20_000,
  });
  const config = z
    .object({
      "amp.mcpServers": z.object({
        rea: z.object({ command: z.string(), args: z.array(z.string()) }),
      }),
    })
    .parse(
      JSON.parse(
        await readFile(join(home, ".config", "amp", "settings.json"), "utf8"),
      ),
    );
  expect(config["amp.mcpServers"].rea).toEqual({
    command: process.execPath,
    args: [wrapper, "mcp"],
  });
}, 25_000);

it.each([
  ["--help"],
  ["setup", "--help"],
  ["doctor", "--help"],
  ["inspect-wasm-artifact", "--help"],
  ["compare-wasm-interfaces", "--help"],
  ["inspect-analysis-view", "--help"],
])(
  "keeps human Chinese help and stable command options for %j",
  async (...args) => {
    const common = { ...process.env, CI: "1", NO_COLOR: "1" };
    const chinese = await execute(
      process.execPath,
      ["scripts/rea.mjs", ...args],
      { env: { ...common, TEKVRO_LANG: "zh-CN" } },
    );
    const english = await execute(
      process.execPath,
      ["scripts/rea.mjs", ...args],
      { env: { ...common, TEKVRO_LANG: "en" } },
    );
    expect(chinese.stdout).toMatch(/[\u4e00-\u9fff]/u);
    const flags = (output: string) =>
      [...new Set(output.match(/--[a-z][a-z0-9-]*/gu))].sort();
    expect(flags(chinese.stdout)).toEqual(flags(english.stdout));
  },
);

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execute = promisify(execFile);
const helpFor = async (language: "en" | "zh-CN", command: string) => {
  const { stdout } = await execute(
    process.execPath,
    ["scripts/rea.mjs", command, "--help"],
    {
      env: {
        ...process.env,
        TEKVRO_LANG: language,
        LANG: "en_US.UTF-8",
        NO_COLOR: "1",
      },
      timeout: 20_000,
    },
  );
  return stdout;
};
const flagsIn = (help: string) =>
  [
    ...new Set([...help.matchAll(/--[a-z][a-z-]*/gu)].map(([flag]) => flag)),
  ].sort();

const cases = [
  {
    command: "environment-build",
    english: "Build an agent environment bundle",
    chinese: "从录制捕获离线构建 Agent 环境包",
    options: ["--dry-run", "--package-tarball", "--template-rule"],
  },
  {
    command: "environment-export",
    english: "Export an environment manifest",
    chinese: "将环境清单及其捕获 Evidence 导出",
    options: ["--evidence", "--package-tarball"],
  },
  {
    command: "environment-compare",
    english: "Compare an environment with probe captures",
    chinese: "比较环境与原应用的探测捕获",
    options: ["--evidence", "--probe"],
  },
  {
    command: "environment-serve",
    english: "Serve an environment manifest",
    chinese: "通过 streamable HTTP 提供 Agent 环境",
    options: ["--evidence", "--replay-only", "--host", "--port"],
  },
] as const;

describe("Tekvro agent environment command help", () => {
  it.each(cases)(
    "preserves $command parameters and effect boundaries in both locales",
    async ({ command, english, chinese, options }) => {
      const [en, zh] = await Promise.all([
        helpFor("en", command),
        helpFor("zh-CN", command),
      ]);
      expect(en).toContain(english);
      expect(zh).toContain(chinese);
      expect(flagsIn(zh)).toEqual(flagsIn(en));
      for (const flag of options) {
        expect(en).toContain(flag);
        expect(zh).toContain(flag);
      }
      if (command === "environment-build" || command === "environment-export") {
        expect(en).toContain("Packed Tekvro tarball");
        expect(en).not.toContain("Packed rea-agents tarball");
        expect(zh).toContain("不覆盖已有内容");
        expect(zh).toContain("应使用本地包");
      }
      if (command === "environment-build") expect(zh).toContain("不写入文件");
      if (command === "environment-serve") {
        expect(zh).toContain("捕获已证实效果的写入工具");
        expect(zh).toContain("不推导状态");
        expect(zh).toContain("127.0.0.1");
      }
    },
    40_000,
  );
});

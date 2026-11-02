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
    ...new Set([...help.matchAll(/--[a-z][a-z_-]*/gu)].map(([flag]) => flag)),
  ].sort();

const cases = [
  [
    "inspect-evidence-bundle",
    "Inspect complete or selected discovery metadata",
    "检查本地 Evidence 证据包",
    "完整内容，或按条件返回发现元数据",
  ],
  [
    "inspect-analysis-view",
    "Project a selected view",
    "查询支持的分析操作",
    "不重新打开分析目标",
  ],
] as const;

describe("Tekvro Evidence query command help", () => {
  it.each(cases)(
    "preserves %s flags and source semantics in both locales",
    async (command, english, chinese, boundary) => {
      const [en, zh] = await Promise.all([
        helpFor("en", command),
        helpFor("zh-CN", command),
      ]);
      expect(en).toContain(english);
      expect(zh).toContain(chinese);
      expect(zh).toContain(boundary);
      expect(zh).toContain("JSON 文件路径");
      expect(flagsIn(zh)).toEqual(flagsIn(en));
    },
    40_000,
  );
});

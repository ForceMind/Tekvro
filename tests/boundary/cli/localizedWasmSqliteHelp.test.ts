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
  {
    command: "capabilities",
    english: "List provider capabilities and side effects",
    chinese: "列出分析能力、可用条件及作用范围",
    boundaries: [],
  },
  {
    command: "providers",
    english: "List configured analysis providers",
    chinese: "列出已配置的分析提供方及当前会话状态",
    boundaries: [],
  },
  {
    command: "inspect-firmware-regions",
    english: "Inspect firmware signature candidates",
    chinese: "检查固件签名候选及其范围",
    boundaries: ["不执行固件", "不含排队及提取后的发布"],
  },
  {
    command: "extract-firmware",
    english: "Extract selected firmware bytes",
    chinese: "提取选定的固件字节",
    boundaries: [
      "须同时提供 length",
      "须同时提供 offset",
      "父目录须已存在",
      "包含目录与链接",
      "最终清理",
    ],
  },
  {
    command: "inspect-wasm-artifact",
    english: "Inspect an explicit local WASM artifact with WABT",
    chinese: "使用 WABT 检查指定的本地 WASM 文件",
    boundaries: ["不是整次检查的总时限", "固定输入/输出安全限制不变"],
  },
  {
    command: "compare-wasm-interfaces",
    english: "Compare core WASM interfaces",
    chinese: "比较两份精确检查证据中的 WASM 核心接口",
    boundaries: ["left/right 完整 Evidence", "必填 scope"],
  },
  {
    command: "inspect-sqlite-database",
    english: "Inspect SQLite schema",
    chinese: "检查本地 SQLite 快照的结构",
    boundaries: [
      "不执行视图、虚拟表或影子表",
      "不是整次调用的总时限",
      "selected_table 须提供 table",
      "按指定顺序返回",
    ],
  },
] as const;

describe("Tekvro WASM and SQLite command help", () => {
  it.each(cases)(
    "preserves $command flags and analysis boundaries in both locales",
    async ({ command, english, chinese, boundaries }) => {
      const [en, zh] = await Promise.all([
        helpFor("en", command),
        helpFor("zh-CN", command),
      ]);
      expect(en).toContain(english);
      expect(zh).toContain(chinese);
      for (const boundary of boundaries) expect(zh).toContain(boundary);
      expect(flagsIn(zh)).toEqual(flagsIn(en));
    },
    40_000,
  );
});

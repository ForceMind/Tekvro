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
    ...new Set(
      [...help.matchAll(/--[a-z][a-z0-9_-]*/gu)].map(([flag]) => flag),
    ),
  ].sort();

const cases = [
  {
    command: "inspect-il2cpp-metadata",
    english: "Inventory IL2CPP global-metadata.dat",
    chinese: "列出 IL2CPP global-metadata.dat",
    boundaries: [
      "只读",
      "需要 --binary",
      "REA_GHIDRA_SEED_FILE",
      "seed-base + RVA",
    ],
  },
  {
    command: "inspect-gpu-code-objects",
    english: "Inspect embedded CUDA/HIP targets",
    chinese: "检查内嵌 CUDA/HIP 目标",
    boundaries: [
      "静态元数据",
      "精确对象 ID",
      "清单记录的 SHA-256",
      "需要 --detail summary",
    ],
  },
  {
    command: "inspect-model-artifact",
    english: "Inspect GGUF or safetensors headers",
    chinese: "检查 GGUF 或 safetensors 文件头",
    boundaries: ["不加载模型权重", "流式读取全部字节", "需要 --detail summary"],
  },
  {
    command: "inspect-python-pyc",
    english: "Inspect a supported CPython 3.7–3.13",
    chinese: "检查受支持的 CPython 3.7–3.13",
    boundaries: [
      "不执行字节码",
      "超出预算则失败",
      "marshal 最大嵌套深度",
      "不作为部分成功返回",
    ],
  },
  {
    command: "inspect-erlang-beam",
    english: "Inspect Erlang BEAM atoms",
    chinese: "检查 Erlang BEAM 原子表",
    boundaries: [
      "不执行字节码",
      "默认 64 MiB",
      "最多检查的 IFF 区块数",
      "不作为部分成功返回",
    ],
  },
] as const;

describe("Tekvro static format command help", () => {
  it.each(cases)(
    "preserves $command parameters and evidence boundaries in both locales",
    async ({ command, english, chinese, boundaries }) => {
      const [en, zh] = await Promise.all([
        helpFor("en", command),
        helpFor("zh-CN", command),
      ]);
      expect(en).toContain(english);
      expect(zh).toContain(chinese);
      expect(flagsIn(zh)).toEqual(flagsIn(en));
      expect(en).toContain("Never overwrites");
      expect(zh).toContain("摘要输出时必填");
      expect(zh).toContain("不覆盖已有文件");
      for (const boundary of boundaries) expect(zh).toContain(boundary);
    },
    40_000,
  );
});

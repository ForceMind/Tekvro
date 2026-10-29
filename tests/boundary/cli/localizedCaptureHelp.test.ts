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
    "inspect-pcap-client",
    "Inspect the caller-selected tshark",
    "检查调用方指定的 tshark",
  ],
  [
    "inspect-pcap-capture",
    "Inspect one pcap/pcapng capture",
    "检查一个 pcap/pcapng 捕获文件",
  ],
  [
    "inspect-signal-decoders",
    "Search installed sigrok decoders",
    "搜索已安装的 sigrok 解码器",
  ],
  [
    "decode-signal-recording",
    "Decode an existing signal recording",
    "解码已有信号录制文件",
  ],
] as const;

describe("Tekvro offline capture command help", () => {
  it.each(cases)(
    "preserves %s parameters in both locales",
    async (command, english, chinese) => {
      const [en, zh] = await Promise.all([
        helpFor("en", command),
        helpFor("zh-CN", command),
      ]);
      expect(en).toContain(english);
      expect(zh).toContain(chinese);
      expect(flagsIn(zh)).toEqual(flagsIn(en));
      if (command === "inspect-pcap-client")
        expect(zh).toContain("不读取捕获文件");
      if (command === "inspect-pcap-capture")
        expect(zh).toContain("本地 pcap 或 pcapng 捕获文件");
      if (command === "inspect-signal-decoders") {
        expect(zh).toContain("返回全部剩余匹配项");
        expect(zh).toContain("默认 50");
        expect(zh).toContain("准确 ID");
        expect(zh).toContain("字面子串");
        expect(zh).toContain("跳过的匹配解码器");
        expect(en).toContain("Case-insensitive literal substring");
      }
      if (command === "decode-signal-recording") {
        expect(zh).toContain("每页返回的输出行数");
        expect(zh).toContain("不按页限制");
        expect(zh).toContain("解码器栈");
        expect(zh).toContain("省略则自动识别");
        expect(zh).toContain("注解筛选");
        expect(zh).toContain("行数不是注解数量");
        expect(en).toContain("sigrok decoder stack");
      }
    },
    40_000,
  );
});

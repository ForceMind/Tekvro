import { execFile } from "node:child_process";
import { describe, expect, it } from "vitest";

const run = (language: "en" | "zh-CN", args: string[]) =>
  new Promise<{ code: number; stdout: string }>((resolve, reject) => {
    execFile(
      process.execPath,
      ["scripts/rea.mjs", ...args],
      {
        env: {
          ...process.env,
          TEKVRO_LANG: language,
          LANG: "en_US.UTF-8",
          NO_COLOR: "1",
        },
        timeout: 20_000,
      },
      (error, stdout) => {
        if (error === null) resolve({ code: 0, stdout });
        else if (typeof error.code === "number")
          resolve({ code: error.code, stdout });
        else reject(error);
      },
    );
  });
const flagsIn = (help: string) =>
  [
    ...new Set([...help.matchAll(/--[a-z][a-z-]*/gu)].map(([flag]) => flag)),
  ].sort();

const cases = [
  {
    command: "list-frida-devices",
    english: "List local Frida devices",
    chinese: "列出本地 Frida 设备",
    boundaries: ["发现设备不代表已取得插桩权限"],
  },
  {
    command: "list-frida-processes",
    english: "List processes visible through a Frida device",
    chinese: "列出指定 Frida 设备可见的进程",
    boundaries: ["省略设备与远程地址时选择 local", "默认 local"],
  },
  {
    command: "instrument-with-frida",
    english: "Run one Frida script against a selected process and detach",
    chinese: "在指定进程中运行一次 Frida 脚本并清理会话",
    boundaries: [
      "必须且只能提供一个",
      "仅 spawn 模式",
      "重复使用 --argument",
      "不带前导零的正整数 PID",
      "单位毫秒",
      "范围 0–60000",
      "不改变宿主权限",
      "已收集观察",
      "远程和设备通道须分别验证",
    ],
  },
];

describe("Frida human help and machine diagnostics", () => {
  it.each(cases)(
    "preserves $command options and explains its boundaries in Chinese",
    async ({ command, english, chinese, boundaries }) => {
      const [en, zh] = await Promise.all([
        run("en", [command, "--help"]),
        run("zh-CN", [command, "--help"]),
      ]);
      expect(en.code).toBe(0);
      expect(zh.code).toBe(0);
      expect(en.stdout).toContain(english);
      expect(zh.stdout).toContain(chinese);
      expect(flagsIn(zh.stdout)).toEqual(flagsIn(en.stdout));
      expect(zh.stdout).toContain("远程保活间隔，单位秒");
      expect(zh.stdout).toContain("需要 --remote-address");
      for (const boundary of boundaries) expect(zh.stdout).toContain(boundary);
    },
    40_000,
  );

  it.each([
    {
      tail: ["--script=send(1)", "--script-file=not-opened.js"],
      mode: "attach",
      target: "1",
      code: "invalid_request",
    },
    { tail: [], mode: "attach", target: "1", code: "invalid_request" },
    {
      tail: ["--script=send(1)", "--argument=-e"],
      mode: "attach",
      target: "1",
      code: "invalid_request",
    },
    {
      tail: ["--script=send(1)"],
      mode: "attach",
      target: "001",
      code: "invalid_request",
    },
    {
      tail: ["--script=send(1)", "--keepalive-interval=1"],
      mode: "attach",
      target: "1",
      code: "VALIDATION_ERROR",
    },
    {
      tail: [
        "--script=send(1)",
        "--device-id=local",
        "--remote-address=127.0.0.1:27042",
      ],
      mode: "attach",
      target: "1",
      code: "VALIDATION_ERROR",
    },
  ])(
    "keeps JSON $code independent of locale for $tail and target $target",
    async ({ tail, mode, target, code }) => {
      const args = ["instrument-with-frida", mode, target, ...tail, "--json"];
      const [en, zh] = await Promise.all([run("en", args), run("zh-CN", args)]);
      expect(en.code).toBe(1);
      expect(zh.code).toBe(1);
      const result: unknown = JSON.parse(en.stdout);
      expect(result).toMatchObject({ code });
      expect(JSON.parse(zh.stdout)).toEqual(result);
    },
    40_000,
  );
});

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

const commandCases = [
  {
    command: "analyze-javascript-application",
    english: "Statically reconstruct a local JavaScript/Electron application",
    chinese: "静态分析本地 JavaScript/Electron 应用及其结构证据",
    option: "--artifact-format",
  },
  {
    command: "recover-javascript-sources",
    english: "Recover readable JavaScript modules with source provenance",
    chinese: "恢复可读 JavaScript 模块并保留来源及文件校验证据",
    option: "--extraction-mode",
  },
  {
    command: "list-browser-targets",
    english: "List page targets from a selected loopback CDP browser",
    chinese: "列出本机 CDP 浏览器页面，可按来源过滤",
  },
  {
    command: "inspect-web-page",
    english: "Passively inspect one page through CDP",
    chinese: "通过 CDP 被动检查指定页面，默认限定当前来源",
    option: "--observation-ms",
  },
  {
    command: "analyze-web-bundle",
    english: "Capture and statically analyze a page bundle",
    chinese: "收集并静态分析页面打包资源，默认限定目标来源",
    option: "--fetch-source-maps",
  },
  {
    command: "observe-web-session",
    english: "Observe user-driven page navigation during a chosen window",
    chinese: "在指定时间窗口观察用户操作引起的页面变化",
    option: "--observation-ms",
  },
  {
    command: "export-web-scripts",
    english: "Export retained website scripts into an absent directory",
    chinese: "将已保留的网页脚本导出到新目录，供 JavaScript 静态分析",
  },
  {
    command: "list-electron-targets",
    english:
      "List local file pages exposed by the selected Electron CDP endpoint",
    chinese: "列出 Electron CDP 端点中的本地文件页面",
  },
  {
    command: "inspect-electron-page",
    english: "Passively inspect one Electron file page",
    chinese: "被动检查指定的 Electron 本地文件页面",
    option: "--include-script-sources",
  },
  {
    command: "capture-electron-scenario",
    english: "Run one owned Electron scenario with cancellable actions",
    chinese: "对已授权的 Electron 应用执行可取消的场景操作",
  },
  {
    command: "reconcile-javascript-runtime",
    english: "Reconcile static application and passive runtime Evidence JSON",
    chinese: "关联静态应用证据与被动运行态 Evidence JSON",
  },
] as const;

const flagsIn = (help: string) =>
  [
    ...new Set([...help.matchAll(/--[a-z][a-z-]*/gu)].map(([flag]) => flag)),
  ].sort();

describe("Tekvro H5 JavaScript and Electron command help", () => {
  it.each(commandCases)(
    "keeps $command flags stable while translating human help",
    async ({ command, english, chinese, ...details }) => {
      const [en, zh] = await Promise.all([
        helpFor("en", command),
        helpFor("zh-CN", command),
      ]);
      expect(en).toContain(english);
      expect(zh).toContain(chinese);
      expect(en).toContain(command);
      expect(zh).toContain(command);
      expect(flagsIn(zh)).toEqual(flagsIn(en));
      if ("option" in details) {
        expect(en).toContain(details.option);
        expect(zh).toContain(details.option);
      }
    },
    40_000,
  );
});

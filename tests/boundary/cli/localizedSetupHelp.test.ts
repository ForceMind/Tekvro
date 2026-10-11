import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  isChineseLocale,
  selectHumanText,
} from "../../../src/cli/localization.js";

const execFileAsync = promisify(execFile);

const helpFor = async (language: string, args: readonly string[]) => {
  const result = await execFileAsync(
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
  );
  return result.stdout;
};

describe("Tekvro CLI human help localization", () => {
  it("honors explicit language overrides and the LANG fallback", () => {
    expect(isChineseLocale({ TEKVRO_LANG: "zh-CN", LANG: "en_US.UTF-8" })).toBe(
      true,
    );
    expect(isChineseLocale({ TEKVRO_LANG: "en", LANG: "zh_CN.UTF-8" })).toBe(
      false,
    );
    expect(isChineseLocale({ LANG: "zh_Hans.UTF-8" })).toBe(true);
    expect(selectHumanText("hello", "你好", { TEKVRO_LANG: "zh-CN" })).toBe(
      "你好",
    );
    expect(selectHumanText("hello", "你好", { TEKVRO_LANG: "en" })).toBe(
      "hello",
    );
  });

  it("renders Chinese product and setup/doctor help", async () => {
    const root = await helpFor("zh-CN", ["--help"]);
    expect(root).toContain(
      "Tekvro 探核：从终端或 AI 智能体出发，用证据调查软件。",
    );
    const setup = await helpFor("zh-CN", ["setup", "--help"]);
    expect(setup).toContain("配置 AI 智能体接入及可选分析引擎");
    expect(setup).toContain("只显示操作计划，不修改配置");
    const doctor = await helpFor("zh-CN", ["doctor", "--help"]);
    expect(doctor).toContain("检查 Tekvro 环境和分析能力是否就绪");
  }, 60_000);

  it("preserves the existing English help", async () => {
    const root = await helpFor("en", ["--help"]);
    expect(root).toContain(
      "Tekvro: investigate software with evidence from your terminal or agent.",
    );
    const setup = await helpFor("en", ["setup", "--help"]);
    expect(setup).toContain(
      "Configure agent integrations and optional analysis providers",
    );
    const doctor = await helpFor("en", ["doctor", "--help"]);
    expect(doctor).toContain("Check whether Tekvro is ready");
  }, 60_000);
});

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(path, "utf8");

describe("Tekvro independent onboarding", () => {
  it("uses a Chinese-first landing page and independent project URL", async () => {
    const [cn, en] = await Promise.all([
      read("README.md"),
      read("README.en.md"),
    ]);
    expect(cn).toContain("# Tekvro · 探核");
    expect(cn).toContain("TEKVRO_LANG=zh-CN");
    expect(en).toContain("# Tekvro");
    for (const content of [cn, en]) {
      expect(content).toContain("https://github.com/ForceMind/Tekvro");
      expect(content).toContain("https://github.com/morluto/rea");
      expect(content).toContain("LICENSE");
      expect(content).not.toContain("https://rea.tools/");
      expect(content).not.toContain("discord.gg");
      expect(content).not.toMatch(/\bnpx\s+(?:-y\s+)?rea-agents@latest/u);
    }
  });

  it("retains attribution and fences public publishing until migration", async () => {
    const [pkg, license, notice] = await Promise.all([
      read("package.json"),
      read("LICENSE"),
      read("THIRD_PARTY_NOTICES.md"),
    ]);
    const config = JSON.parse(pkg) as {
      name: string;
      private: boolean;
      repository: { url: string };
      bin: Record<string, string>;
    };
    expect(config.private).toBe(true);
    expect(config.name).toBe("tekvro");
    expect(config.repository.url).toBe(
      "git+https://github.com/ForceMind/Tekvro.git",
    );
    expect(config.bin.tekvro).toBe("scripts/rea.mjs");
    expect(config.bin["rea-agents"]).toBe("scripts/rea.mjs");
    expect(config.bin.rea).toBe("scripts/rea.mjs");
    expect(license).toContain("Copyright (c) 2026 morluto");
    expect(notice).toContain("f6fe575094658e99ced78d45f385633fbfaaae32");
  });

  it("makes the documentation portal Chinese-first without falsifying translated coverage", async () => {
    const [config, home, guide] = await Promise.all([
      read("docs/.vitepress/config.ts"),
      read("docs/index.md"),
      read("docs/zh-CN/quick-start.md"),
    ]);
    expect(config).toContain('lang: "zh-CN"');
    expect(config).toContain("https://github.com/ForceMind/Tekvro");
    expect(config).not.toContain("https://github.com/morluto/rea");
    expect(home).toContain("用证据看懂软件");
    expect(guide).toContain("npm ci");
    expect(guide).toContain("npm run build:cached");
    expect(guide).toContain("TEKVRO_LANG=zh-CN");
  });

  it("marks upstream npm examples as legacy and not Tekvro commands", async () => {
    const guide = await read("docs/installation.md");
    expect(guide).toContain("属于**原上游**");
    expect(guide).toContain("zh-CN/quick-start.md");
    expect(guide).toContain("Node.js 22");
  });
});

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { PRODUCT_IDENTITY } from "../../src/identity.js";

const file = (path: string): Promise<string> => readFile(resolve(path), "utf8");

describe("Tekvro source-build documentation and distribution boundaries", () => {
  it("documents the actual CLI entrypoint in both primary readmes", async () => {
    const [chinese, english] = await Promise.all([
      file("README.md"),
      file("README.en.md"),
    ]);
    for (const text of [chinese, english]) {
      expect(text).toContain(
        "git clone https://github.com/ForceMind/Tekvro.git",
      );
      expect(text).toContain("npm run build:cached");
      expect(text).toContain("node scripts/rea.mjs doctor --json");
      expect(text).toContain("docs/zh-CN/quick-start.md");
      expect(text).toContain("THIRD_PARTY_NOTICES.md");
      expect(text).not.toMatch(/ForceMind 维护|maintained by ForceMind/iu);
    }
  });

  it("does not present an unpublished Tekvro npm package as installable", async () => {
    const [readme, guide, manifest] = await Promise.all([
      file("README.md"),
      file("docs/zh-CN/quick-start.md"),
      file("package.json"),
    ]);
    const pkg = JSON.parse(manifest) as {
      name: string;
      private: boolean;
      mcpName: string;
    };
    expect(pkg).toMatchObject({
      name: "tekvro",
      private: true,
      mcpName: "io.github.forcemind/tekvro",
    });
    expect(readme).toContain("尚未发布");
    expect(guide).toContain("private");
    expect(guide).toContain("scripts/rea.mjs");
  });

  it("keeps product metadata and source distribution instructions aligned", async () => {
    const metadata = JSON.parse(await file("server.json")) as {
      name: string;
      packages: Array<{ identifier: string }>;
    };
    expect(metadata.name).toBe("io.github.forcemind/tekvro");
    expect(metadata.packages[0]?.identifier).toBe(PRODUCT_IDENTITY.packageName);
    expect(PRODUCT_IDENTITY.displayName).toBe("Tekvro");
    expect(PRODUCT_IDENTITY.privateSourceBuild).toBe(true);
    expect(PRODUCT_IDENTITY.legacyPackageName).toBe("rea-agents");
  });

  it("links to the standalone usage and safety documentation", async () => {
    const readme = await file("README.md");
    const links = [
      "docs/zh-CN/quick-start.md",
      "docs/zh-CN/architecture.md",
      "docs/zh-CN/security.md",
      "docs/zh-CN/javascript-h5-electron.md",
    ];
    for (const path of links) {
      expect(readme).toContain("](" + path + ")");
      expect((await file(path)).length).toBeGreaterThan(100);
    }
  });

  it("preserves actual source licenses rather than rewriting authorship", async () => {
    const [license, notices, readme] = await Promise.all([
      file("LICENSE"),
      file("THIRD_PARTY_NOTICES.md"),
      file("README.md"),
    ]);
    expect(license).toContain("MIT License");
    expect(notices).toContain("REA");
    expect(readme).toContain("[LICENSE](LICENSE)");
    expect(readme).toContain(
      "[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)",
    );
  });
});

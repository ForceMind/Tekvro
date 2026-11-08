import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { PRODUCT_IDENTITY } from "../../src/identity.js";

const file = (path: string): Promise<string> => readFile(resolve(path), "utf8");

describe("Tekvro documentation and distribution boundaries", () => {
  it("documents versioned release installation and the CLI in both primary readmes", async () => {
    const [chinese, english, manifest] = await Promise.all([
      file("README.md"),
      file("README.en.md"),
      file("package.json"),
    ]);
    const { version } = JSON.parse(manifest) as { version: string };
    for (const text of [chinese, english]) {
      expect(text).toContain(
        `https://raw.githubusercontent.com/ForceMind/Tekvro/v${version}/install.sh`,
      );
      expect(text).toContain(`bash install-tekvro.sh --version ${version}`);
      expect(text).toContain(`npm install --global ./tekvro-${version}.tgz`);
      expect(text).toContain("tekvro doctor --json");
      expect(text).toContain("tekvro setup --dry-run");
      expect(text).toContain("docs/zh-CN/quick-start.md");
      expect(text).toContain("THIRD_PARTY_NOTICES.md");
      expect(text).not.toMatch(/ForceMind 维护|maintained by ForceMind/iu);
    }
  });

  it("distinguishes local GitHub package installation from registry publication", async () => {
    const [readme, guide, distribution, manifest] = await Promise.all([
      file("README.md"),
      file("docs/zh-CN/quick-start.md"),
      file("docs/zh-CN/distribution.md"),
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
    for (const text of [readme, guide, distribution]) {
      expect(text).toContain("GitHub Release");
      expect(text).not.toMatch(
        /npm\s+(?:install|i)\s+(?:--global|-g)\s+tekvro(?:@|\s|$)/mu,
      );
    }
    expect(distribution).toContain("private: true");
    expect(distribution).toContain("SHA256SUMS");
    expect(distribution).toContain("scripts/rea.mjs");
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
    const [readme, index] = await Promise.all([
      file("README.md"),
      file("docs/index.md"),
    ]);
    expect(readme).toContain("](docs/index.md)");
    expect(readme).toContain("](SECURITY.md)");
    const links = [
      "docs/zh-CN/quick-start.md",
      "docs/zh-CN/architecture.md",
      "docs/zh-CN/security.md",
      "docs/zh-CN/javascript-h5-electron.md",
    ];
    for (const path of links) {
      expect(index).toContain("](" + path.replace(/^docs\//u, "") + ")");
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
    expect(readme).toMatch(/\[[^\]]+\]\(LICENSE\)/u);
    expect(readme).toContain(
      "[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)",
    );
  });
});

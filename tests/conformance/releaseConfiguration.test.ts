import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { SUPPORTED_NODE_VERSION_RANGE } from "../../src/domain/runtimeVersion.js";

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, "utf8")) as unknown;

const versionedDocumentation = ["docs/installation.md"] as const;

describe("release configuration", () => {
  it("keeps doctor and setup runtime support aligned with package engines", async () => {
    expect(await readJson("package.json")).toMatchObject({
      engines: { node: SUPPORTED_NODE_VERSION_RANGE },
    });
  });

  it("updates every package-version artifact in release PRs", async () => {
    const configuration = await readJson("release-please-config.json");

    expect(configuration).toMatchObject({
      versioning: "always-bump-minor",
      packages: {
        ".": {
          "extra-files": [
            {
              type: "generic",
              path: "src/generatedPackageMetadata.ts",
            },
            {
              type: "json",
              path: "server.json",
              jsonpath: "$.version",
            },
            {
              type: "json",
              path: "server.json",
              jsonpath: "$.packages[0].version",
            },
          ],
        },
      },
    });
  });

  it.each(versionedDocumentation)(
    "documents installed and source MCP entrypoints without a registry launcher in %s",
    async (path) => {
      const content = await readFile(path, "utf8");
      expect(content).toContain('"command": "/absolute/path/to/tekvro"');
      expect(content).toContain('"args": ["mcp"]');
      expect(content).toContain('"command": "/absolute/path/to/node"');
      expect(content).toContain(
        '"/absolute/path/to/Tekvro/scripts/rea.mjs", "mcp"',
      );
      expect(content).not.toMatch(/npx\s+(?:-\S+\s+)*rea-agents/u);
      expect(content).toContain("io.github.forcemind/tekvro");
    },
  );

  it("uses an explicit GitHub-only request and documents the complete release set", async () => {
    const packageJson = (await readJson("package.json")) as {
      version: string;
    };
    const notes = `docs/releases/v${packageJson.version}.md`;
    const release = (await readJson("release.json")) as { publish: boolean };
    expect(release).toMatchObject({
      schemaVersion: 1,
      product: "tekvro",
      version: packageJson.version,
      tag: `v${packageJson.version}`,
      channel: "github",
      notes,
    });
    expect(typeof release.publish).toBe("boolean");
    const documents = await Promise.all([
      readFile("docs/zh-CN/distribution.md", "utf8"),
      readFile("docs/releasing.md", "utf8"),
      readFile(notes, "utf8"),
    ]);
    for (const content of documents) {
      for (const name of [
        `tekvro-${packageJson.version}.tgz`,
        `tekvro-${packageJson.version}-source.tar.gz`,
        "SHA256SUMS",
        "release-manifest.json",
      ]) {
        expect(content).toContain(name);
      }
      expect(content).toContain("private: true");
    }
  });

  it("keeps the release baseline, lockfile, and changelog aligned with the package version", async () => {
    const packageJson = (await readJson("package.json")) as {
      version: string;
    };
    expect(await readJson(".release-please-manifest.json")).toEqual({
      ".": packageJson.version,
    });
    expect(await readJson("package-lock.json")).toMatchObject({
      version: packageJson.version,
      packages: { "": { version: packageJson.version } },
    });
    const changelog = await readFile("CHANGELOG.md", "utf8");
    expect(/^## \[([^\]]+)\]/mu.exec(changelog)?.[1]).toBe(packageJson.version);
  });

  it("keeps inactive registry metadata aligned while the package stays private", async () => {
    const packageJson = (await readJson("package.json")) as {
      name: string;
      version: string;
      mcpName: string;
    };
    const serverJson = (await readJson("server.json")) as {
      name: string;
      version: string;
      packages: Array<{
        registryType: string;
        registryBaseUrl: string;
        identifier: string;
        version: string;
        runtimeHint: string;
        transport: { type: string };
        packageArguments: Array<{ type: string; value: string }>;
      }>;
    };

    expect(packageJson).toMatchObject({
      name: "tekvro",
      mcpName: "io.github.forcemind/tekvro",
      private: true,
    });
    expect(serverJson).toMatchObject({
      name: packageJson.mcpName,
      version: packageJson.version,
      packages: [
        {
          registryType: "npm",
          registryBaseUrl: "https://registry.npmjs.org",
          identifier: packageJson.name,
          version: packageJson.version,
          runtimeHint: "npx",
          transport: { type: "stdio" },
          packageArguments: [{ type: "positional", value: "mcp" }],
        },
      ],
    });
  });
});

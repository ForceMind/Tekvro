import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";
import { documentationFactIssues } from "../../../scripts/lib/docs-facts.mjs";
import type { ProductCatalog } from "../../../scripts/lib/product-catalog.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const temporaryRoots: string[] = [];

const seedReadmeFactFixture = async () => {
  const directory = await createTestTempDirectory("tekvro-readme-facts-");
  temporaryRoots.push(directory);
  await cp(join(root, "docs"), join(directory, "docs"), { recursive: true });
  for (const path of [
    "README.md",
    "README.en.md",
    "README_zh.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "AGENTS.md",
    ".github/pull_request_template.md",
  ]) {
    const destination = join(directory, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(root, path), destination);
  }
  await mkdir(join(directory, "skills/reverse-engineer-anything"), {
    recursive: true,
  });
  const catalog: ProductCatalog = JSON.parse(
    await readFile(join(root, "docs/public/product-catalog.json"), "utf8"),
  );
  return { directory, catalog };
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Tekvro bilingual documentation facts", () => {
  it("checks the actual Chinese and English entry points without upstream website locales", async () => {
    const { directory, catalog } = await seedReadmeFactFixture();
    await expect(documentationFactIssues(directory, catalog)).resolves.toEqual(
      [],
    );
  });

  it.each(["README.md", "README.en.md"])(
    "detects lost MCP references in %s",
    async (path) => {
      const { directory, catalog } = await seedReadmeFactFixture();
      const destination = join(directory, path);
      const content = await readFile(destination, "utf8");
      await writeFile(
        destination,
        content.replaceAll(
          "](docs/mcp-contracts.md#generated-catalog)",
          "](docs/mcp-contracts.md#wrong)",
        ),
      );
      await expect(
        documentationFactIssues(directory, catalog),
      ).resolves.toContain(
        `${path}: missing ](docs/mcp-contracts.md#generated-catalog)`,
      );
    },
  );

  it("detects broken local references and repository escapes", async () => {
    const { directory, catalog } = await seedReadmeFactFixture();
    await writeFile(
      join(directory, "README.en.md"),
      `${await readFile(join(directory, "README.en.md"), "utf8")}\n[broken](docs/missing.md)\n[outside](../outside.md)\n`,
    );
    await expect(documentationFactIssues(directory, catalog)).resolves.toEqual([
      "README.en.md: missing documentation reference: docs/missing.md",
      "README.en.md: reference escapes repository: ../outside.md",
    ]);
  });
});

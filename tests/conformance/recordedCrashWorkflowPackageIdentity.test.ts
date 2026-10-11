import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("recorded-crash workflow package identity", () => {
  it("runs the installed package declared by our own source manifest", async () => {
    const [workflow, manifestJson] = await Promise.all([
      readFile(".github/workflows/real-recorded-crash.yml", "utf8"),
      readFile("package.json", "utf8"),
    ]);
    const manifest = JSON.parse(manifestJson) as { name: string };
    expect(manifest.name).toBe("tekvro");
    expect(workflow).toContain("installed_package_name=$(node -p");
    expect(workflow).toContain("package.json");
    expect(workflow).toContain(
      "node_modules/${installed_package_name}/scripts/rea.mjs",
    );
    expect(workflow).not.toContain("node_modules/rea-agents/");
  });
});

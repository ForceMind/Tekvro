import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("Tekvro private-source update safety", () => {
  it("refuses public package updates without invoking an installer", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      name: string;
      version: string;
      private: boolean;
    };
    expect(pkg.name).toBe("tekvro");
    expect(pkg.private).toBe(true);

    const execution = spawnSync(
      process.execPath,
      ["scripts/rea.mjs", "update", "--json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 20_000,
        env: { ...process.env, CI: "1", NO_COLOR: "1" },
      },
    );
    expect(execution.error).toBeUndefined();
    expect(execution.status).toBe(1);
    const output = JSON.parse(execution.stdout) as Record<string, unknown>;
    expect(output).toMatchObject({
      status: "failed",
      currentVersion: pkg.version,
      latestVersion: null,
      reason: "unknown-install-method",
    });
    expect(output.remediation).toEqual(
      expect.stringContaining("Tekvro is a source checkout"),
    );
    expect(execution.stderr).not.toContain("npm install");
  });
});

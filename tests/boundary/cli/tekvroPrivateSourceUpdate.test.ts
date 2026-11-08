import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("Tekvro registry update safety", () => {
  it("refuses automatic registry updates and describes verified release reinstallation", () => {
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
      expect.stringContaining("Automatic registry updates are disabled"),
    );
    expect(output.remediation).toEqual(
      expect.stringContaining("https://github.com/ForceMind/Tekvro/releases"),
    );
    expect(output.remediation).toEqual(expect.stringContaining("SHA256SUMS"));
    expect(output.remediation).toEqual(
      expect.stringContaining("npm install --global ./tekvro-VERSION.tgz"),
    );
    expect(output.remediation).toEqual(
      expect.stringContaining("verify the archive checksum"),
    );
    expect(output.remediation).toEqual(
      expect.stringContaining("npm ci and npm run build:cached"),
    );
    expect(execution.stderr).not.toContain("npm install");
  });
});

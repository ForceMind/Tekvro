import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

describe("Tekvro Windows Ghidra workflow trust boundary", () => {
  it("runs default-branch code only on the configured Windows host", async () => {
    const workflow = parse(
      await readFile(
        new URL(
          "../../../../.github/workflows/real-ghidra-windows.yml",
          import.meta.url,
        ),
        "utf8",
      ),
    );

    expect(workflow.on).toEqual({
      repository_dispatch: { types: ["real-ghidra-windows"] },
    });
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.jobs["native-artifact"]).toMatchObject({
      if: "github.ref == 'refs/heads/main'",
      "runs-on": "ubuntu-latest",
    });
    expect(workflow.jobs.verify).toMatchObject({
      if: "github.ref == 'refs/heads/main'",
      needs: "native-artifact",
      environment: "real-ghidra-windows",
      "runs-on": expect.arrayContaining([
        "self-hosted",
        "Windows",
        "x64",
      ]),
      steps: expect.arrayContaining([
        expect.objectContaining({
          uses: expect.stringMatching(/^actions\/setup-node@/u),
        }),
        expect.objectContaining({ run: "npm ci" }),
        expect.objectContaining({
          uses: expect.stringMatching(/^actions\/download-artifact@/u),
          with: expect.objectContaining({
            name: "real-ghidra-windows-native",
          }),
        }),
        expect.objectContaining({
          env: { REA_ANALYSIS_PROVIDER: "ghidra" },
          run: "npm run verify:ghidra:windows | Tee-Object -FilePath windows-ghidra-proof.log",
        }),
        expect.objectContaining({
          uses: expect.stringMatching(/^actions\/upload-artifact@/u),
          with: expect.objectContaining({
            path: expect.stringContaining("windows-ghidra-proof.log"),
          }),
        }),
      ]),
    });
  });
});

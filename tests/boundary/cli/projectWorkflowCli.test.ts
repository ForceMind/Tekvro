import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { projectSnapshotSchema } from "../../../src/contracts/projectToolContracts.js";
import { toolContract } from "../../../src/contracts/toolContracts.js";
import { parseMcpToolError } from "../../fixtures/mcpToolError.js";
import { projectMetadataRequest } from "../../fixtures/projectMetadata.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";
import { cliTest } from "../../support/cli/cliFixture.js";

cliTest(
  "reopens one history across transports and preserves stale edit identities",
  async ({ cli }) => {
    const root = await createTestTempDirectory("tekvro-project-cli-");
    const request = projectMetadataRequest(root);
    const input = join(root, "create.json");
    await writeFile(
      input,
      JSON.stringify({ ...request, directory: "project" }),
    );
    const created = await cli.run({
      arguments: ["create-project", input, "--json"],
      cwd: root,
    });
    expect(created.exitCode).toBe(0);
    const first = projectSnapshotSchema.parse(created.json);
    expect(first.directory).toBe(request.directory);
    expect(first.revision.project).toMatchObject({
      ...request.project,
      execution_status: "idle",
      acceptance_status: "not_evaluated",
    });
    expect(first.token).toEqual({
      project_id: first.revision.project.project_id,
      revision: 1,
      digest: first.revision.digest,
    });

    const call = await cli.sharedMcpCall?.();
    if (call === undefined) throw new Error("Missing file MCP session");
    const inspected = await call("inspect_project", {
      directory: request.directory,
    });
    expect(inspected.isError).not.toBe(true);
    expect(projectSnapshotSchema.parse(inspected.structuredContent)).toEqual(
      first,
    );

    const edit = toolContract("edit_project").examples[0].input.edit;
    const edited = await call("edit_project", {
      directory: request.directory,
      expected: first.token,
      edit,
    });
    expect(edited.isError).not.toBe(true);
    const second = projectSnapshotSchema.parse(edited.structuredContent);
    expect(second.token.revision).toBe(2);
    expect(second.revision.previous_digest).toBe(first.revision.digest);
    expect(second.revision.project.name).toBe(edit.name);
    const reopened = await cli.run({
      arguments: ["inspect-project", "project", "--json"],
      cwd: root,
    });
    expect(reopened.exitCode).toBe(0);
    expect(reopened.json).toEqual(second);

    const stale = {
      directory: request.directory,
      expected: first.token,
      edit: { name: "Stale writer" },
    };
    const rejected = await cli.run({
      arguments: ["edit-project", "-", "--json"],
      input: JSON.stringify(stale),
    });
    const staleMcp = parseMcpToolError(await call("edit_project", stale));
    expect(rejected.exitCode).toBe(1);
    expect(rejected.json).toEqual(staleMcp.error);
    expect(rejected.json).toMatchObject({
      code: "evidence_integrity_mismatch",
      details: {
        reason: "revision_conflict",
        expected: first.token,
        current: second.token,
      },
    });
    expect(await readdir(request.directory)).toEqual([
      "0000000000000001.json",
      "0000000000000002.json",
    ]);
    expect(
      projectSnapshotSchema.parse(
        (await call("inspect_project", { directory: request.directory }))
          .structuredContent,
      ),
    ).toEqual(second);
  },
);

cliTest(
  "rejects invalid creation and status patches before metadata writes",
  async ({ cli }) => {
    const root = await createTestTempDirectory("tekvro-project-invalid-");
    const request = projectMetadataRequest(root);
    const call = await cli.sharedMcpCall?.();
    if (call === undefined) throw new Error("Missing file MCP session");
    const invalid = { ...request, project: { ...request.project, name: 17 } };
    const invalidCli = await cli.run({
      arguments: ["create-project", JSON.stringify(invalid), "--json"],
    });
    const invalidMcp = parseMcpToolError(await call("create_project", invalid));
    expect(invalidCli.exitCode).toBe(1);
    expect(invalidCli.json).toEqual(invalidMcp.error);
    expect(invalidCli.json).toMatchObject({
      code: "invalid_request",
      details: {
        operation: "create_project",
        issues: [{ path: ["project", "name"] }],
      },
    });
    await expect(readdir(request.directory)).rejects.toMatchObject({
      code: "ENOENT",
    });

    const created = await call("create_project", request);
    expect(created.isError).not.toBe(true);
    const snapshot = projectSnapshotSchema.parse(created.structuredContent);
    const patch = {
      directory: request.directory,
      expected: snapshot.token,
      edit: { execution_status: "succeeded", acceptance_status: "pass" },
    };
    const patchedCli = await cli.run({
      arguments: ["edit-project", JSON.stringify(patch), "--json"],
    });
    const patchedMcp = parseMcpToolError(await call("edit_project", patch));
    expect(patchedCli.exitCode).toBe(1);
    expect(patchedCli.json).toEqual(patchedMcp.error);
    expect(patchedCli.json).toMatchObject({
      code: "invalid_request",
      details: {
        operation: "edit_project",
        issues: [
          { path: ["edit", "execution_status"], reason: "unknown_argument" },
          { path: ["edit", "acceptance_status"], reason: "unknown_argument" },
        ],
      },
    });
    expect(await readdir(request.directory)).toEqual(["0000000000000001.json"]);
  },
);

cliTest(
  "preserves an unsupported history while both transports report the same failure",
  async ({ cli }) => {
    const root = await createTestTempDirectory("tekvro-project-version-");
    const request = projectMetadataRequest(root);
    const created = await cli.run({
      arguments: ["create-project", JSON.stringify(request), "--json"],
    });
    expect(created.exitCode).toBe(0);
    const snapshot = projectSnapshotSchema.parse(created.json);
    const path = join(request.directory, "0000000000000001.json");
    const bytes = JSON.stringify({ ...snapshot.revision, schema_version: 2 });
    await writeFile(path, bytes);
    const inspected = await cli.run({
      arguments: ["inspect-project", request.directory, "--json"],
    });
    const call = await cli.sharedMcpCall?.();
    if (call === undefined) throw new Error("Missing file MCP session");
    const mcp = parseMcpToolError(
      await call("inspect_project", { directory: request.directory }),
    );
    expect(inspected.exitCode).toBe(1);
    expect(inspected.json).toEqual(mcp.error);
    expect(mcp.error).toMatchObject({ code: "evidence_integrity_mismatch" });
    expect(mcp.error.details?.reason).toContain(
      "Unsupported project schema version 2",
    );
    expect(await readFile(path, "utf8")).toBe(bytes);
  },
);

cliTest(
  "keeps project help in the selected human language",
  async ({ cli }) => {
    for (const command of [
      "create-project",
      "inspect-project",
      "edit-project",
    ]) {
      const help = await cli.run({
        arguments: [command, "--help"],
        environment: { TEKVRO_LANG: "zh-CN" },
      });
      expect(help.exitCode).toBe(0);
      expect(help.stdout).toContain("项目");
      expect(help.stdout).toContain(command);
    }
  },
);

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";

import { ProjectBuildStage } from "../../../src/application/project/ProjectBuildStage.js";
import { ProjectRunState } from "../../../src/application/project/ProjectRunState.js";
import { projectRevisionToken } from "../../../src/domain/projectManifest.js";
import { createProjectRunRecord } from "../../../src/domain/projectRun.js";
import { ok } from "../../../src/domain/result.js";
import { CodexBuilderAdapter } from "../../../src/providers/codex/CodexBuilderAdapter.js";
import {
  createProjectWorkflowFixture,
  takeProjectResult as take,
} from "../../fixtures/projectWorkflow.js";

it("persists known no-child cancellation when cancellation arrives at the completed-marker boundary", async () => {
  const f = await createProjectWorkflowFixture();
  const state = new ProjectRunState(f.resources);
  const builder = new CodexBuilderAdapter();
  onTestFinished(async () => {
    await builder.close();
  });
  const runId = randomUUID();
  const prepared = take(
    await f.service.prepare({
      project: f.project,
      run_id: runId,
      checker_path: f.manifestPath,
    }),
  );
  const project = take(
    await state.projects.edit(
      f.initial.directory,
      projectRevisionToken(f.initial.revision),
      { candidate_sha256: prepared.candidate_sha256 },
    ),
  );
  const record = take(
    createProjectRunRecord({
      project: project.revision,
      run_id: runId,
      phase: "build",
      created_at: new Date().toISOString(),
      adapter: { id: builder.id, version: null, model: null },
    }),
  );
  const execution = take(await state.runs.create(project.directory, record));
  const controller = new AbortController();
  // This stage seam injects cancellation immediately after mark() completes.
  // Stores, input observation and Codex adapter are real; no real lease or
  // Agent execution qualification is asserted by this cancellation regression.
  const workspace = {
    root: f.output,
    marker_paths: [],
    assertCurrent: async () => ok(undefined),
    mark: async () => {
      controller.abort("cancel_at_marker_boundary");
      return ok(undefined);
    },
    release: async () => ok(undefined),
  };
  const stage = new ProjectBuildStage(f.resources, builder, f.service, state);
  const result = take(
    await stage.run(
      { project, execution, prepared, workspace },
      {
        kind: "start",
        instruction: "No Agent invocation should occur",
        checkerPath: f.manifestPath,
      },
      controller.signal,
    ),
  );
  expect(result.execution.run).toMatchObject({
    execution_status: "cancelled",
    cleanup_status: "not_required",
    stop_reason: "cancelled",
    pending_check: null,
  });
  const reopened = take(await state.runs.read(project.directory, runId));
  expect(reopened).toEqual(result.execution);
  expect(result.project.revision.project.execution_status).toBe("cancelled");
  await expect(
    readFile(join(execution.directory, "attempt-1-builder.json")),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

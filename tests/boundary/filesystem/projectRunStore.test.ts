import { randomUUID } from "node:crypto";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";

import { ArtifactResourceScope } from "../../../src/artifacts/ArtifactResourceScope.js";
import {
  ProjectRunStore,
  type StoredProjectRun,
} from "../../../src/application/project/ProjectRunStore.js";
import { ProjectStore } from "../../../src/application/project/ProjectStore.js";
import { digestCanonicalValue } from "../../../src/domain/canonicalDigest.js";
import { createProjectCheckBinding } from "../../../src/domain/projectCheckBinding.js";
import {
  projectRevisionToken,
  type ProjectRevision,
} from "../../../src/domain/projectManifest.js";
import {
  createProjectRunRecord,
  type ProjectRunRecord,
} from "../../../src/domain/projectRun.js";
import {
  projectRunTestManifest,
  takeProjectResult as take,
} from "../../fixtures/projectRun.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

const record = (project: ProjectRevision): ProjectRunRecord =>
  take(
    createProjectRunRecord({
      project,
      run_id: randomUUID(),
      phase: "build",
      created_at: new Date().toISOString(),
      adapter: { id: "fixture-builder", version: "1", model: null },
    }),
  );
const time = (run: ProjectRunRecord) => ({
  at: new Date(Date.parse(run.updated_at) + 1).toISOString(),
  elapsed_ms: run.elapsed_ms + 1,
});
const fixture = async () => {
  const root = await createTestTempDirectory("tekvro-project-run-store-");
  const resources = new ArtifactResourceScope();
  const projects = new ProjectStore(resources);
  const runs = new ProjectRunStore(resources);
  const project = take(
    await projects.create(join(root, "project"), {
      name: "Durable run",
      scope: projectRunTestManifest().scope,
    }),
  );
  return { root, resources, projects, runs, project };
};
const replaceInitial = async (
  stored: StoredProjectRun,
  run: ProjectRunRecord,
): Promise<void> => {
  const body = {
    schema: "tekvro.project-run-revision",
    schema_version: 1,
    sequence: 1,
    previous_digest: null,
    event: null,
    run,
  };
  await writeFile(
    join(stored.directory, "0000000000000001.json"),
    JSON.stringify({
      ...body,
      digest: digestCanonicalValue(body),
    }),
  );
};

it("reopens a pending check by replaying the committed domain events", async () => {
  const f = await fixture();
  try {
    const initial = take(
      await f.runs.create(f.project.directory, record(f.project.revision)),
    );
    const started = take(
      await f.runs.append(f.project.directory, initial.token, {
        kind: "start",
        ...time(initial.run),
      }),
    );
    const binding = take(
      createProjectCheckBinding(
        f.project.revision.project,
        initial.run.run_id,
        {
          candidate_sha256: "b".repeat(64),
          checker_sha256: "c".repeat(64),
          scenario_sha256: "d".repeat(64),
          environment_sha256: "e".repeat(64),
        },
      ),
    );
    const pending = take(
      await f.runs.append(f.project.directory, started.token, {
        kind: "build_completed",
        binding,
        observed_tokens: null,
        cleanup_status: "complete",
        ...time(started.run),
      }),
    );
    expect(
      take(
        await new ProjectRunStore(f.resources).read(
          f.project.directory,
          initial.run.run_id,
        ),
      ),
    ).toEqual(pending);
    expect(pending.run).toMatchObject({
      execution_status: "paused",
      phase: "check",
      pending_check: binding,
      attempt: 1,
    });
    expect(
      (
        await f.runs.append(f.project.directory, pending.token, {
          kind: "resume",
          ...time(pending.run),
        })
      ).ok,
    ).toBe(false);
  } finally {
    await f.resources.close();
  }
});

it("authenticates the original scope on both creation and later history reads", async () => {
  const f = await fixture();
  try {
    const renamed = take(
      await f.projects.edit(
        f.project.directory,
        projectRevisionToken(f.project.revision),
        { name: "Scope A, revision two" },
      ),
    );
    const changed = take(
      await f.projects.edit(
        f.project.directory,
        projectRevisionToken(renamed.revision),
        {
          scope: { ...renamed.revision.project.scope, question: "Scope B" },
          change_reason: "Select different behavior",
        },
      ),
    );
    const current = record(changed.revision);
    const forged = {
      ...current,
      project_token: projectRevisionToken(renamed.revision),
    };
    const rejected = await f.runs.create(f.project.directory, forged);
    expect(rejected.ok).toBe(false);
    await expect(
      readdir(join(f.project.directory, "runs", current.run_id)),
    ).rejects.toMatchObject({ code: "ENOENT" });
    const stored = take(await f.runs.create(f.project.directory, current));
    await replaceInitial(stored, forged);
    const reread = await f.runs.read(f.project.directory, current.run_id);
    expect(reread.ok).toBe(false);
    if (!reread.ok) expect(reread.error.message).toContain("project origin");
  } finally {
    await f.resources.close();
  }
});

it.each([
  {
    name: "candidate",
    change: (run: ProjectRunRecord) => ({
      ...run,
      candidate_sha256: "f".repeat(64),
    }),
  },
  {
    name: "consumed time and tokens",
    change: (run: ProjectRunRecord) => ({
      ...run,
      elapsed_ms: 1,
      observed_tokens: 1,
    }),
  },
  {
    name: "budget history",
    change: (run: ProjectRunRecord) => ({
      ...run,
      budget_revision: 2,
      budget_change_reason: "Invented prior allowance",
    }),
  },
  {
    name: "prior check",
    change: (run: ProjectRunRecord): ProjectRunRecord => ({
      ...run,
      check_ids: [randomUUID()],
      last_check_status: "pass",
    }),
  },
])(
  "rejects invented initial $name even with a recomputed envelope digest",
  async ({ change }) => {
    const f = await fixture();
    try {
      const current = record(f.project.revision);
      const forged = change(current);
      expect((await f.runs.create(f.project.directory, forged)).ok).toBe(false);
      const stored = take(await f.runs.create(f.project.directory, current));
      await replaceInitial(stored, forged);
      expect((await f.runs.read(f.project.directory, current.run_id)).ok).toBe(
        false,
      );
    } finally {
      await f.resources.close();
    }
  },
);

it("publishes only one concurrent successor and keeps the losing CAS explicit", async () => {
  const f = await fixture();
  try {
    const current = take(
      await f.runs.create(f.project.directory, record(f.project.revision)),
    );
    const event = { kind: "start" as const, ...time(current.run) };
    const results = await Promise.all([
      f.runs.append(f.project.directory, current.token, event),
      new ProjectRunStore(f.resources).append(
        f.project.directory,
        current.token,
        event,
      ),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const rejected = results.find((result) => !result.ok);
    expect(rejected).toBeDefined();
    if (rejected !== undefined && !rejected.ok)
      expect(rejected.error.diagnostics?.reason).toBe("run_revision_conflict");
    const latest = take(
      await f.runs.read(f.project.directory, current.run.run_id),
    );
    expect(latest).toMatchObject({
      token: { sequence: 2 },
      run: { execution_status: "running", attempt: 1 },
    });
  } finally {
    await f.resources.close();
  }
});

it("projects only check references matching the committed run's scope and candidate", async () => {
  const f = await fixture();
  try {
    let current = take(
      await f.runs.create(f.project.directory, record(f.project.revision)),
    );
    const binding = take(
      createProjectCheckBinding(
        f.project.revision.project,
        current.run.run_id,
        {
          candidate_sha256: "b".repeat(64),
          checker_sha256: "c".repeat(64),
          scenario_sha256: "d".repeat(64),
          environment_sha256: "e".repeat(64),
        },
      ),
    );
    const checkId = randomUUID();
    current = take(
      await f.runs.append(f.project.directory, current.token, {
        kind: "start",
        ...time(current.run),
      }),
    );
    current = take(
      await f.runs.append(f.project.directory, current.token, {
        kind: "build_completed",
        binding,
        observed_tokens: null,
        cleanup_status: "complete",
        ...time(current.run),
      }),
    );
    current = take(
      await f.runs.append(f.project.directory, current.token, {
        kind: "check_started",
        binding,
        ...time(current.run),
      }),
    );
    current = take(
      await f.runs.append(f.project.directory, current.token, {
        kind: "check_completed",
        binding,
        check_id: checkId,
        outcome: "pass",
        cleanup_status: "complete",
        ...time(current.run),
      }),
    );
    const reference = {
      check_id: checkId,
      run_id: current.run.run_id,
      scope_sha256: binding.scope_sha256,
      candidate_sha256: binding.candidate_sha256,
      checker_sha256: binding.checker_sha256,
      scenario_sha256: binding.scenario_sha256,
      environment_sha256: binding.environment_sha256,
      report_path: join(f.root, "independent-report.json"),
      report_sha256: "f".repeat(64),
      evidence_ids: [],
    };
    for (const change of [
      { scope_sha256: "0".repeat(64) },
      { candidate_sha256: "0".repeat(64) },
      { check_id: randomUUID() },
      { run_id: randomUUID() },
    ])
      expect(
        (
          await f.projects.recordRun(
            f.project.directory,
            projectRevisionToken(f.project.revision),
            current.run,
            { check: { ...reference, ...change } },
          )
        ).ok,
      ).toBe(false);
    const projected = take(
      await f.projects.recordRun(
        f.project.directory,
        projectRevisionToken(f.project.revision),
        current.run,
        { check: reference },
      ),
    );
    expect(projected.revision.project).toMatchObject({
      execution_status: "succeeded",
      acceptance_status: "unknown",
      check_refs: [reference],
    });
  } finally {
    await f.resources.close();
  }
});

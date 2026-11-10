import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished, type TestContext } from "vitest";
import { z } from "zod";

import { ArtifactResourceScope } from "../../../src/artifacts/ArtifactResourceScope.js";
import { ProjectRunStore } from "../../../src/application/project/ProjectRunStore.js";
import { ProjectStore } from "../../../src/application/project/ProjectStore.js";
import { acquireProjectWorkspace } from "../../../src/application/project/ProjectWorkspace.js";
import { digestCanonicalValue } from "../../../src/domain/canonicalDigest.js";
import type { ProjectManifest } from "../../../src/domain/projectManifest.js";
import { createProjectRunRecord } from "../../../src/domain/projectRun.js";
import {
  projectRunTestManifest,
  takeProjectResult as take,
} from "../../fixtures/projectRun.js";
import { projectLeaseListenDenial } from "../../fixtures/projectLeaseCapability.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

const fixture = async () => {
  const root = await createTestTempDirectory("tekvro-pw-lock-");
  const output = join(root, "candidate");
  const source = join(root, "source.txt");
  await Promise.all([mkdir(output), writeFile(source, "reference")]);
  const resources = new ArtifactResourceScope();
  onTestFinished(async () => {
    await resources.close();
  });
  const scope = projectRunTestManifest().scope;
  const project = take(
    await new ProjectStore(resources).create(join(root, "project"), {
      name: "Workspace ownership",
      scope: {
        ...scope,
        output_root: output,
        target: { ...scope.target, path: source },
      },
    }),
  );
  return {
    root,
    output,
    source,
    resources,
    project,
    leases: join(root, "leases"),
  };
};
type Fixture = Awaited<ReturnType<typeof fixture>>;

const acquire = (
  f: Fixture,
  runId: string,
  project = f.project.revision.project,
) =>
  acquireProjectWorkspace(
    f.project.directory,
    project,
    runId,
    f.resources,
    f.leases,
  );

// Only a real OS listen refusal skips. An unexpected lock error fails the test;
// the production lease is never replaced by an in-memory owner.
const requireLease = async (
  context: Pick<TestContext, "skip">,
  f: Fixture,
  runId: string = randomUUID(),
) => {
  const result = await acquire(f, runId);
  if (!result.ok) {
    const denial = projectLeaseListenDenial(result.error);
    if (denial !== undefined)
      context.skip(
        `Host rejects real project lease listen with ${denial}; workspace locking and recovery remain unverified on this host`,
      );
    throw result.error;
  }
  onTestFinished(async () => {
    take(await result.value.release(false));
  });
  return result.value;
};

const selectOutput = (
  project: ProjectManifest,
  output: string,
): ProjectManifest => {
  const scope = { ...project.scope, output_root: output };
  return { ...project, scope, scope_sha256: digestCanonicalValue(scope) };
};
const markerOwner = (bytes: string): string =>
  z.object({ owner_id: z.string().uuid() }).parse(JSON.parse(bytes)).owner_id;

const runningRecord = async (f: Fixture) => {
  const store = new ProjectRunStore(f.resources);
  const idle = take(
    await store.create(
      f.project.directory,
      take(
        createProjectRunRecord({
          project: f.project.revision,
          run_id: randomUUID(),
          phase: "build",
          created_at: new Date().toISOString(),
          adapter: { id: "ownership-fixture", version: "1", model: null },
        }),
      ),
    ),
  );
  const running = take(
    await store.append(f.project.directory, idle.token, {
      kind: "start",
      at: idle.run.created_at,
      elapsed_ms: 0,
    }),
  );
  return { store, running };
};

it("rejects source and metadata inside the candidate before acquiring a socket", async () => {
  const f = await fixture();
  const sourceInside = join(f.output, "original.txt");
  const metadataInside = join(f.output, "metadata");
  await Promise.all([
    writeFile(sourceInside, "original"),
    mkdir(metadataInside),
  ]);
  const project = f.project.revision.project;
  const scope = {
    ...project.scope,
    target: { ...project.scope.target, path: sourceInside },
  };
  const selected = {
    ...project,
    scope,
    scope_sha256: digestCanonicalValue(scope),
  };
  for (const result of [
    await acquire(f, randomUUID(), selected),
    await acquireProjectWorkspace(
      metadataInside,
      project,
      randomUUID(),
      f.resources,
      f.leases,
    ),
  ]) {
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("outside");
  }
});

it("blocks aliases, a replacement at the same path, and the moved original inode", async (context) => {
  const f = await fixture();
  const first = await requireLease(context, f);
  const alias = join(f.root, "alias");
  await symlink(
    f.output,
    alias,
    process.platform === "win32" ? "junction" : "dir",
  );
  const aliased = await acquire(
    f,
    randomUUID(),
    selectOutput(f.project.revision.project, alias),
  );
  expect(aliased.ok).toBe(false);
  if (!aliased.ok)
    expect(aliased.error.diagnostics?.reason).toBe("workspace_busy");
  const moved = join(f.root, "moved");
  await rename(f.output, moved);
  await mkdir(f.output);
  expect((await first.assertCurrent()).ok).toBe(false);
  for (const project of [
    f.project.revision.project,
    selectOutput(f.project.revision.project, moved),
  ]) {
    const blocked = await acquire(f, randomUUID(), project);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok)
      expect(blocked.error.diagnostics?.reason).toBe("workspace_busy");
  }
  take(await first.release(true));
  const replacement = take(await acquire(f, randomUUID()));
  take(await replacement.release(true));
});

it("keeps unknown process markers through repeated socket-only release", async (context) => {
  const f = await fixture();
  const { running } = await runningRecord(f);
  const workspace = await requireLease(context, f, running.run.run_id);
  take(await workspace.mark());
  const before = await Promise.all(
    workspace.marker_paths.map((path) => readFile(path, "utf8")),
  );
  take(await workspace.release(false));
  take(await workspace.release(false));
  expect((await workspace.mark()).ok).toBe(false);
  const reopened = await acquire(f, randomUUID());
  expect(reopened.ok).toBe(false);
  if (!reopened.ok)
    expect(reopened.error.diagnostics?.reason).toBe(
      "workspace_recovery_unknown",
    );
  expect(
    await Promise.all(
      workspace.marker_paths.map((path) => readFile(path, "utf8")),
    ),
  ).toEqual(before);
});

it("recovers confirmed markers without giving an old acquisition authority over the same run's new stage", async (context) => {
  const f = await fixture();
  const { running, store } = await runningRecord(f);
  const first = await requireLease(context, f, running.run.run_id);
  take(await first.mark());
  const previous = await Promise.all(
    first.marker_paths.map((path) => readFile(path, "utf8")),
  );
  take(
    await store.append(f.project.directory, running.token, {
      kind: "fail",
      reason: "No child is retained by this ownership fixture",
      cleanup_status: "complete",
      at: running.run.updated_at,
      elapsed_ms: 0,
    }),
  );
  take(await first.release(false));
  const next = take(await acquire(f, running.run.run_id));
  try {
    for (const path of next.marker_paths)
      await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
    take(await next.mark());
    const current = await Promise.all(
      next.marker_paths.map((path) => readFile(path, "utf8")),
    );
    expect(current.map(markerOwner)).not.toEqual(previous.map(markerOwner));
    expect((await first.release(true)).ok).toBe(false);
    expect(
      await Promise.all(
        next.marker_paths.map((path) => readFile(path, "utf8")),
      ),
    ).toEqual(current);
    take(await next.release(true));
    take(await next.release(true));
    expect((await next.mark()).ok).toBe(false);
    expect((await next.assertCurrent()).ok).toBe(false);
  } finally {
    take(await next.release(false));
  }
});

it.for(["invalid_json", "foreign_owner"] as const)(
  "retains marker and lease owners on %s until cleanup can retry the original acquisition",
  async (damage, context) => {
    const f = await fixture();
    const workspace = await requireLease(context, f);
    take(await workspace.mark());
    const path = workspace.marker_paths[0];
    if (path === undefined) throw new Error("Expected the path marker");
    const original = await readFile(path, "utf8");
    const replacement =
      damage === "invalid_json"
        ? "{truncated"
        : original.replace(markerOwner(original), randomUUID());
    await writeFile(path, replacement);
    const released = await workspace.release(true);
    expect(released.ok).toBe(false);
    if (released.ok)
      throw new Error("Damaged marker cleanup must remain incomplete");
    expect(released.error.cleanupIncomplete).toBe(true);
    expect(await readFile(path, "utf8")).toBe(replacement);
    const blocked = await acquire(f, randomUUID());
    expect(blocked.ok).toBe(false);
    if (!blocked.ok)
      expect(blocked.error.diagnostics?.reason).toBe("workspace_busy");
    await writeFile(path, original);
    await f.resources.retryCleanup();
    expect(released.error.cleanupIncomplete).toBe(false);
    expect(f.resources.cleanupResources).toEqual([]);
    for (const marker of workspace.marker_paths)
      await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
    const next = take(await acquire(f, randomUUID()));
    take(await next.release(true));
  },
);

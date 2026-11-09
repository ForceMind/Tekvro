import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { digestCanonicalValue } from "../../../src/domain/canonicalDigest.js";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { ArtifactResourceScope } from "../../../src/artifacts/ArtifactResourceScope.js";
import {
  ProjectRevisionConflict,
  ProjectStore,
} from "../../../src/application/project/ProjectStore.js";
import {
  projectCheckIsCurrent,
  projectManifestSchema,
  projectRevisionToken,
  type ProjectScope,
} from "../../../src/domain/projectManifest.js";
import type { Result } from "../../../src/domain/result.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

const execute = promisify(execFile);
const take = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw result.error;
  return result.value;
};
const scopeFor = (root: string): ProjectScope => ({
  goal: "investigation",
  question: "Explain the selected artifact",
  target: {
    original_input: "./input.bin",
    path: join(root, "input.bin"),
    sha256: "a".repeat(64),
  },
  output_root: join(root, "output"),
  requirements: [
    {
      requirement_id: "origin",
      description: "Keep observations attributable",
      required: true,
    },
  ],
});
const fixture = async () => {
  const root = await createTestTempDirectory("tekvro-project-store-");
  const directory = join(root, "project");
  const resources = new ArtifactResourceScope();
  const store = new ProjectStore(resources);
  const initial = take(
    await store.create(directory, {
      name: "Investigation",
      scope: scopeFor(root),
    }),
  );
  return { root, directory, resources, store, initial };
};

it("reopens a persisted project and keeps its identity through a rename", async () => {
  const f = await fixture();
  try {
    expect(take(await f.store.read(f.directory))).toEqual(f.initial);
    expect(f.initial.revision.project).toMatchObject({
      revision: 1,
      scope_revision: 1,
      execution_status: "idle",
      acceptance_status: "not_evaluated",
      phase: "study",
    });
    const next = take(
      await f.store.edit(
        f.directory,
        projectRevisionToken(f.initial.revision),
        { name: "Renamed" },
      ),
    );
    expect(next.revision.project.project_id).toBe(
      f.initial.revision.project.project_id,
    );
    expect(next.revision.project.scope_sha256).toBe(
      f.initial.revision.project.scope_sha256,
    );
    expect(next.revision.previous_digest).toBe(f.initial.revision.digest);
    expect(take(await f.store.read(f.directory))).toEqual(next);
  } finally {
    await f.resources.close();
  }
});

it("rejects malformed intent before creating metadata and preserves an existing root", async () => {
  const f = await fixture();
  try {
    const scope = scopeFor(f.root);
    const unused = join(f.root, "unused");
    const bad = await f.store.create(unused, {
      name: "bad",
      scope: {
        ...scope,
        requirements: [...scope.requirements, ...scope.requirements],
      },
    });
    expect(bad.ok).toBe(false);
    await expect(readdir(unused)).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      (await f.store.create(f.directory, { name: "replace", scope })).ok,
    ).toBe(false);
    expect(take(await f.store.read(f.directory))).toEqual(f.initial);
  } finally {
    await f.resources.close();
  }
});

it.each([0, 2])(
  "refuses schema version %i without replacing its bytes",
  async (version) => {
    const f = await fixture();
    try {
      const path = join(f.directory, "0000000000000001.json");
      const bytes = JSON.stringify({
        ...f.initial.revision,
        schema_version: version,
      });
      await writeFile(path, bytes);
      const result = await f.store.read(f.directory);
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.error.message).toContain(
          "Unsupported project schema version",
        );
      expect(await readFile(path, "utf8")).toBe(bytes);
    } finally {
      await f.resources.close();
    }
  },
);

it("rejects damaged committed records and gaps instead of falling back", async () => {
  const f = await fixture();
  try {
    const path = join(f.directory, "0000000000000002.json");
    await writeFile(path, '{"truncated":');
    expect((await f.store.read(f.directory)).ok).toBe(false);
    await rename(path, join(f.directory, "0000000000000003.json"));
    const gap = await f.store.read(f.directory);
    expect(gap.ok).toBe(false);
    if (!gap.ok) expect(gap.error.message).toContain("revision gap");
  } finally {
    await f.resources.close();
  }
});

it("reads the previous commit beside interrupted staging and diagnoses an incomplete creation", async () => {
  const f = await fixture();
  try {
    const staged = join(f.directory, ".rea-write-interrupted");
    await mkdir(staged);
    await writeFile(join(staged, "content"), '{"partial":');
    expect(take(await f.store.read(f.directory))).toEqual(f.initial);
    expect(await readFile(join(staged, "content"), "utf8")).toBe('{"partial":');
    const incomplete = join(f.root, "incomplete");
    await mkdir(incomplete);
    const result = await f.store.read(incomplete);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.message).toContain("no committed revision");
  } finally {
    await f.resources.close();
  }
});

it("rejects stale edits and project replacement tokens with current revision details", async () => {
  const f = await fixture();
  try {
    const token = projectRevisionToken(f.initial.revision);
    const next = take(
      await f.store.edit(f.directory, token, { name: "Winner" }),
    );
    const result = await f.store.edit(f.directory, token, { name: "Stale" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ProjectRevisionConflict);
      expect(result.error).toMatchObject({
        current: projectRevisionToken(next.revision),
        expected: token,
      });
    }
    expect(
      (
        await f.store.edit(
          f.directory,
          { ...projectRevisionToken(next.revision), project_id: randomUUID() },
          { name: "Wrong" },
        )
      ).ok,
    ).toBe(false);
    expect(take(await f.store.read(f.directory))).toEqual(next);
  } finally {
    await f.resources.close();
  }
});

it("invalidates old checks after scope or candidate changes while retaining their history", async () => {
  const f = await fixture();
  try {
    const run = randomUUID();
    const evidenceId = "ev_" + "b".repeat(64);
    const check = {
      check_id: randomUUID(),
      run_id: run,
      scope_sha256: f.initial.revision.project.scope_sha256,
      candidate_sha256: "c".repeat(64),
      checker_sha256: "d".repeat(64),
      scenario_sha256: "e".repeat(64),
      environment_sha256: "f".repeat(64),
      report_path: join(f.root, "check.json"),
      report_sha256: "1".repeat(64),
      evidence_ids: [evidenceId],
    };
    const bound = take(
      await f.store.edit(
        f.directory,
        projectRevisionToken(f.initial.revision),
        {
          candidate_sha256: check.candidate_sha256,
          run_ids: [run],
          check_refs: [check],
          evidence_refs: [
            {
              evidence_id: evidenceId,
              bundle_path: join(f.root, "evidence.json"),
              bundle_sha256: "2".repeat(64),
            },
          ],
        },
      ),
    );
    expect(projectCheckIsCurrent(bound.revision.project, check)).toBe(true);
    const nextScope = {
      ...bound.revision.project.scope,
      question: "A changed investigation",
    };
    expect(
      (
        await f.store.edit(f.directory, projectRevisionToken(bound.revision), {
          scope: nextScope,
        })
      ).ok,
    ).toBe(false);
    const changed = take(
      await f.store.edit(f.directory, projectRevisionToken(bound.revision), {
        scope: nextScope,
        change_reason: "User changed the question",
      }),
    );
    expect(projectCheckIsCurrent(changed.revision.project, check)).toBe(false);
    expect(changed.revision.project.check_refs).toEqual([check]);
    expect(changed.revision.project.scope_revision).toBe(2);
    const candidate = take(
      await f.store.edit(f.directory, projectRevisionToken(changed.revision), {
        scope: bound.revision.project.scope,
        change_reason: "Restore the earlier question",
        candidate_sha256: "3".repeat(64),
      }),
    );
    expect(projectCheckIsCurrent(candidate.revision.project, check)).toBe(
      false,
    );
    expect(candidate.revision.project.check_refs).toEqual([check]);
  } finally {
    await f.resources.close();
  }
});

it("rejects fabricated acceptance and leaves cancelled edits uncommitted", async () => {
  const f = await fixture();
  try {
    expect(
      projectManifestSchema.safeParse({
        ...f.initial.revision.project,
        execution_status: "succeeded",
        acceptance_status: "pass",
      }).success,
    ).toBe(false);
    expect(
      (
        await f.store.edit(
          f.directory,
          projectRevisionToken(f.initial.revision),
          { acceptance_status: "pass" },
        )
      ).ok,
    ).toBe(false);
    const result = await f.store.edit(
      f.directory,
      projectRevisionToken(f.initial.revision),
      {
        name: "Cancelled",
      },
      AbortSignal.abort("requested stop"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toMatchObject({ _tag: "AnalysisCancelledError" });
    expect(take(await f.store.read(f.directory))).toEqual(f.initial);
  } finally {
    await f.resources.close();
  }
});

it("retains explicit target and output paths when the metadata directory moves", async () => {
  const f = await fixture();
  try {
    const moved = join(f.root, "moved");
    await rename(f.directory, moved);
    const loaded = take(await f.store.read(moved));
    expect(loaded.revision).toEqual(f.initial.revision);
    expect(loaded.directory).toBe(moved);
    const updated = take(
      await f.store.edit(moved, projectRevisionToken(loaded.revision), {
        name: "Moved",
      }),
    );
    expect(updated.revision.project.scope).toEqual(scopeFor(f.root));
  } finally {
    await f.resources.close();
  }
});

it.each([
  {
    name: "Windows drive",
    target: "C:\\工作\\input.bin",
    output: "D:\\output",
    bundle: "C:\\证据\\bundle.json",
    report: "D:\\checks\\report.json",
  },
  {
    name: "Windows UNC",
    target: "\\\\host\\share\\input.bin",
    output: "\\\\host\\share\\output",
    bundle: "\\\\host\\share\\bundle.json",
    report: "\\\\host\\share\\report.json",
  },
  {
    name: "POSIX",
    target: "/工作/input.bin",
    output: "/output",
    bundle: "/证据/bundle.json",
    report: "/checks/report.json",
  },
])(
  "reopens and rebinds $name history without using its recorded paths",
  async (paths) => {
    const f = await fixture();
    try {
      const scope = {
        ...scopeFor(f.root),
        target: { ...scopeFor(f.root).target, path: paths.target },
        output_root: paths.output,
      };
      const run = randomUUID();
      const evidenceId = "ev_" + "b".repeat(64);
      const historical = take(
        await f.store.edit(
          f.directory,
          projectRevisionToken(f.initial.revision),
          {
            scope,
            change_reason: "Imported historical platform scope",
            run_ids: [run],
            evidence_refs: [
              {
                evidence_id: evidenceId,
                bundle_path: paths.bundle,
                bundle_sha256: "c".repeat(64),
              },
            ],
            check_refs: [
              {
                check_id: randomUUID(),
                run_id: run,
                scope_sha256: digestCanonicalValue(scope),
                candidate_sha256: "d".repeat(64),
                checker_sha256: "e".repeat(64),
                scenario_sha256: "f".repeat(64),
                environment_sha256: "1".repeat(64),
                report_path: paths.report,
                report_sha256: "2".repeat(64),
                evidence_ids: [evidenceId],
              },
            ],
          },
        ),
      );
      const historicalBytes = await readFile(
        join(f.directory, "0000000000000002.json"),
      );
      const moved = join(f.root, "imported");
      await rename(f.directory, moved);
      expect(take(await f.store.read(moved)).revision).toEqual(
        historical.revision,
      );
      const rebound = take(
        await f.store.edit(moved, projectRevisionToken(historical.revision), {
          scope: scopeFor(f.root),
          change_reason: "Bind to this host",
          name: "Rebound",
        }),
      );
      expect(take(await f.store.read(moved)).revision).toEqual(
        rebound.revision,
      );
      expect(rebound.revision.project.scope).toEqual(scopeFor(f.root));
      expect(rebound.revision.project.evidence_refs[0]?.bundle_path).toBe(
        paths.bundle,
      );
      expect(rebound.revision.project.check_refs[0]?.report_path).toBe(
        paths.report,
      );
      expect(
        (await readFile(join(moved, "0000000000000002.json"))).equals(
          historicalBytes,
        ),
      ).toBe(true);
    } finally {
      await f.resources.close();
    }
  },
);

it.skipIf(process.platform === "win32")(
  "coordinates real processes through canonical and symlink paths",
  async () => {
    const f = await fixture();
    try {
      const alias = join(f.root, "alias");
      await symlink(f.directory, alias, "dir");
      const storeUrl = pathToFileURL(
        resolve("dist/application/project/ProjectStore.js"),
      ).href;
      const resourcesUrl = pathToFileURL(
        resolve("dist/artifacts/ArtifactResourceScope.js"),
      ).href;
      const script = [
        "import {ProjectStore} from " + JSON.stringify(storeUrl) + ";",
        "import {ArtifactResourceScope} from " +
          JSON.stringify(resourcesUrl) +
          ";",
        "const resources = new ArtifactResourceScope();",
        "try { const result = await new ProjectStore(resources).edit(process.argv[1], JSON.parse(process.argv[2]), {name:process.argv[3]});",
        "process.stdout.write(JSON.stringify(result.ok ? {ok:true} : {ok:false, conflict:result.error.constructor.name}));",
        "} finally { await resources.close(); }",
      ].join("\n");
      const token = JSON.stringify(projectRevisionToken(f.initial.revision));
      const results = await Promise.all(
        [f.directory, alias].map((directory, index) =>
          execute(
            process.execPath,
            [
              "--input-type=module",
              "-e",
              script,
              directory,
              token,
              "writer-" + index,
            ],
            { timeout: 20_000 },
          ),
        ),
      );
      const outcomes: unknown[] = results.map((result) =>
        JSON.parse(result.stdout),
      );
      expect(outcomes).toContainEqual({ ok: true });
      expect(outcomes).toContainEqual({
        ok: false,
        conflict: "ProjectRevisionConflict",
      });
      const current = take(await f.store.read(alias));
      expect(current.revision.project.revision).toBe(2);
      expect(current.revision.project.name).toMatch(/^writer-[01]$/u);
      expect(current.revision.previous_digest).toBe(f.initial.revision.digest);
      expect((await readdir(f.directory)).sort()).toEqual([
        "0000000000000001.json",
        "0000000000000002.json",
      ]);
    } finally {
      await f.resources.close();
    }
  },
);

it("rejects a recomputed commit that invents an earlier scope change", async () => {
  const f = await fixture();
  try {
    const { digest: _digest, ...body } = f.initial.revision;
    const changed = {
      ...body,
      project: {
        ...body.project,
        scope_revision: 2,
        scope_change_reason: "Unrecorded change",
      },
    };
    const content = JSON.stringify({
      ...changed,
      digest: digestCanonicalValue(changed),
    });
    const path = join(f.directory, "0000000000000001.json");
    await writeFile(path, content);
    const result = await f.store.read(f.directory);
    expect(result.ok).toBe(false);
    expect(await readFile(path, "utf8")).toBe(content);
  } finally {
    await f.resources.close();
  }
});

import { describe, expect, it } from "vitest";

import {
  PROJECT_RUN_TEST_ID,
  projectRunTestManifest,
  takeProjectResult as take,
} from "../../tests/fixtures/projectRun.js";
import { digestCanonicalValue } from "./canonicalDigest.js";
import {
  createProjectCheckBinding,
  projectCandidateDigest,
  projectCheckApplicability,
  type ProjectCandidateInventory,
  type ProjectCheckSelection,
} from "./projectCheckBinding.js";

const selection: ProjectCheckSelection = {
  candidate_sha256: "b".repeat(64),
  checker_sha256: "c".repeat(64),
  scenario_sha256: "d".repeat(64),
  environment_sha256: "e".repeat(64),
};
const inventory = (): ProjectCandidateInventory => ({
  directories: ["assets", "empty"],
  files: [
    {
      path: "index.html",
      sha256: "a".repeat(64),
      bytes: 100,
      executable: false,
    },
    {
      path: "assets/counter.js",
      sha256: "b".repeat(64),
      bytes: 50,
      executable: false,
    },
  ],
});

describe("candidate content commitments", () => {
  it("ignores enumeration order but commits names, contents, size, modes and empty directories", () => {
    const original = inventory();
    const digest = take(projectCandidateDigest(original));
    expect(
      take(
        projectCandidateDigest({
          directories: [...original.directories].reverse(),
          files: [...original.files].reverse(),
        }),
      ),
    ).toBe(digest);
    const changed = [
      { ...original, directories: ["assets"] },
      ...[
        { path: "renamed.html" },
        { sha256: "f".repeat(64) },
        { bytes: 101 },
        { executable: true },
      ].map((change) => ({
        ...original,
        files: original.files.map((file, index) =>
          index === 0 ? { ...file, ...change } : file,
        ),
      })),
    ];
    for (const candidate of changed)
      expect(take(projectCandidateDigest(candidate))).not.toBe(digest);
  });

  it("rejects ambiguous paths, duplicate names and missing parent observations", () => {
    for (const path of [
      "../outside",
      "/absolute",
      "a//b",
      "a/./b",
      "a\\b",
      "C:/a",
      ".",
    ])
      expect(
        projectCandidateDigest({ directories: [path], files: [] }).ok,
      ).toBe(false);
    const firstFile = inventory().files[0];
    expect(firstFile).toBeDefined();
    expect(
      projectCandidateDigest({
        directories: ["index.html"],
        files: [firstFile],
      }).ok,
    ).toBe(false);
    expect(
      projectCandidateDigest({ directories: [], files: inventory().files }).ok,
    ).toBe(false);
    expect(
      projectCandidateDigest({ directories: ["assets", "assets"], files: [] })
        .ok,
    ).toBe(false);
  });
});

describe("check applicability", () => {
  it("keeps a name-only revision applicable but rejects scope A → B → A reuse", () => {
    const original = projectRunTestManifest();
    const binding = take(
      createProjectCheckBinding(original, PROJECT_RUN_TEST_ID, selection),
    );
    const renamed = { ...original, revision: 2, name: "Renamed" };
    expect(
      take(projectCheckApplicability(binding, renamed, selection)),
    ).toEqual({
      status: "matched",
      reasons: [],
    });
    const restoredScope = {
      ...original,
      revision: 3,
      scope_revision: 3,
      scope_change_reason: "Restore scope after testing another requirement",
    };
    expect(
      take(projectCheckApplicability(binding, restoredScope, selection)),
    ).toEqual({
      status: "stale",
      reasons: ["scope_revision_changed"],
    });
  });

  it("compares the actual candidate, checker, scenario and environment selections independently", () => {
    const project = projectRunTestManifest();
    const binding = take(
      createProjectCheckBinding(project, PROJECT_RUN_TEST_ID, selection),
    );
    for (const [field, reason] of [
      ["candidate_sha256", "candidate_changed"],
      ["checker_sha256", "checker_changed"],
      ["scenario_sha256", "scenario_changed"],
      ["environment_sha256", "environment_changed"],
    ] as const)
      expect(
        take(
          projectCheckApplicability(binding, project, {
            ...selection,
            [field]: "f".repeat(64),
          }),
        ),
      ).toEqual({ status: "stale", reasons: [reason] });
  });

  it("invalidates source and requirement changes even if the original candidate remains", () => {
    const project = projectRunTestManifest();
    const binding = take(
      createProjectCheckBinding(project, PROJECT_RUN_TEST_ID, selection),
    );
    const scope = {
      ...project.scope,
      target: { ...project.scope.target, sha256: "f".repeat(64) },
      requirements: [
        {
          requirement_id: "counter",
          description: "Increment by two",
          required: true,
        },
      ],
    };
    const changed = {
      ...project,
      revision: 2,
      scope_revision: 2,
      scope_change_reason: "Different reference behavior",
      scope,
      scope_sha256: digestCanonicalValue(scope),
    };
    expect(
      take(projectCheckApplicability(binding, changed, selection)),
    ).toEqual({
      status: "stale",
      reasons: [
        "source_changed",
        "scope_revision_changed",
        "scope_changed",
        "requirements_changed",
      ],
    });
    expect(
      createProjectCheckBinding(
        { ...changed, scope_sha256: "0".repeat(64) },
        PROJECT_RUN_TEST_ID,
        selection,
      ).ok,
    ).toBe(false);
  });
});

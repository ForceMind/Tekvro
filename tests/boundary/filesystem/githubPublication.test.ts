import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, delimiter, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { z } from "zod";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";
import {
  executeWorkflowFixture as execute,
  workflowGit as git,
} from "../../support/workflowGit.js";

const publisher = fileURLToPath(
  new URL("../../../scripts/release/github-publication.mjs", import.meta.url),
);
const repository = "ForceMind/Tekvro";
const runId = "271";
const releaseTag = "v1.0.0";
const assetNames = [
  "SHA256SUMS",
  "release-manifest.json",
  "tekvro-1.0.0-source.tar.gz",
  "tekvro-1.0.0.tgz",
];
const jobNames = [
  "CI required",
  "Portable tests",
  "Build package",
  "Static checks",
  "Build bundled Windows x64 native controls",
  "Native package baseline (linux x64)",
  "Native package baseline (linux arm64)",
  "Native package baseline (darwin arm64)",
  "Windows capability and package lane",
];

const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

const fakeGhSource = `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(process.env.TEKVRO_GH_STATE, "utf8"));
fs.appendFileSync(process.env.TEKVRO_GH_CALLS, JSON.stringify(args) + "\\n");
const save = () => fs.writeFileSync(process.env.TEKVRO_GH_STATE, JSON.stringify(state));
const respond = (body) => process.stdout.write(JSON.stringify(body));
const missing = () => { process.stderr.write("gh: Not Found (HTTP 404)\\n"); process.exit(1); };
const value = (flag) => args[args.indexOf(flag) + 1];
if (args[0] === "api") {
  const endpoint = args[1].replace(/^repos\\/ForceMind\\/Tekvro\\//, "");
  if (endpoint === "actions/runs/${runId}") respond(state.run);
  else if (endpoint.startsWith("actions/runs/${runId}/jobs?")) {
    const page = Number(new URL("https://fixture.invalid/" + endpoint).searchParams.get("page"));
    respond({ total_count: state.jobs.length, jobs: state.jobs.slice((page - 1) * 100, page * 100) });
  } else if (endpoint === "git/ref/heads/main") respond({ object: { type: "commit", sha: state.main } });
  else if (endpoint === "git/ref/tags/${releaseTag}") {
    if (state.tag === null) missing();
    respond({ object: { type: "commit", sha: state.tag } });
  } else if (endpoint.startsWith("releases?")) {
    const page = Number(new URL("https://fixture.invalid/" + endpoint).searchParams.get("page"));
    const releases = [...state.otherReleases, ...(state.release === null ? [] : [state.release])];
    respond(releases.slice((page - 1) * 100, page * 100));
  } else throw new Error("Unmodeled API endpoint: " + endpoint);
} else if (args[0] === "release" && args[1] === "create") {
  if (state.release !== null) throw new Error("Release already exists");
  state.release = { draft: true, prerelease: false, target_commitish: value("--target"), tag_name: args[2], name: value("--title"), body: fs.readFileSync(value("--notes-file"), "utf8"), assets: [], html_url: "https://github.com/ForceMind/Tekvro/releases/tag/${releaseTag}" };
  if (state.mutateLocalOnCreate) fs.appendFileSync(path.join(process.env.TEKVRO_GH_LOCAL, "tekvro-1.0.0.tgz"), "changed after validation");
  save();
} else if (args[0] === "release" && args[1] === "upload") {
  const name = path.basename(args[3]);
  fs.copyFileSync(args[3], path.join(process.env.TEKVRO_GH_REMOTE, name));
  state.release.assets.push({ name, size: fs.statSync(args[3]).size });
  save();
} else if (args[0] === "release" && args[1] === "download") {
  for (const asset of state.release.assets) fs.copyFileSync(path.join(process.env.TEKVRO_GH_REMOTE, asset.name), path.join(value("--dir"), asset.name));
  if (state.corruptDownload) fs.appendFileSync(path.join(value("--dir"), "tekvro-1.0.0.tgz"), "altered remote bytes");
  if (state.moveMainOnDownload) state.main = "f".repeat(40);
  save();
} else if (args[0] === "release" && args[1] === "edit") {
  state.release.draft = false;
  if (state.tag === null) state.tag = state.source;
  save();
} else throw new Error("Unmodeled gh invocation: " + JSON.stringify(args));
`;

async function write(root: string, path: string, contents: string) {
  const destination = join(root, path);
  await mkdir(join(destination, ".."), { recursive: true });
  await writeFile(destination, contents);
}

async function writeAssets(assets: string, source: string, tree: string) {
  const archives = [];
  for (const name of assetNames.filter((name) => name.startsWith("tekvro-"))) {
    const bytes = Buffer.from(`Fixture archive bytes for ${name}\n`);
    await writeFile(join(assets, name), bytes);
    archives.push({ name, sha256: sha256(bytes), bytes: bytes.length });
  }
  const manifest = Buffer.from(
    `${JSON.stringify({
      schemaVersion: 1,
      product: "tekvro",
      version: "1.0.0",
      tag: releaseTag,
      source: { repository, commit: source, tree },
      assets: archives,
      build: { node: process.version, npm: "11.16.0" },
    })}\n`,
  );
  await writeFile(join(assets, "release-manifest.json"), manifest);
  await writeFile(
    join(assets, "SHA256SUMS"),
    [
      ...archives.map((asset) => `${asset.sha256}  ${asset.name}`),
      `${sha256(manifest)}  release-manifest.json`,
      "",
    ].join("\n"),
  );
}

async function fixture() {
  const root = await createTestTempDirectory("tekvro-github-publication-");
  const checkout = join(root, "source");
  const assets = join(root, "assets");
  const bin = join(root, "bin");
  const remote = join(root, "remote");
  const temporary = join(root, "temporary");
  await Promise.all(
    [checkout, assets, bin, remote, temporary].map((path) => mkdir(path)),
  );
  await git(checkout, ["init", "--initial-branch=main"]);
  await write(
    checkout,
    "package.json",
    JSON.stringify({ name: "tekvro", version: "1.0.0", private: true }),
  );
  await write(
    checkout,
    "release.json",
    JSON.stringify({
      schemaVersion: 1,
      product: "tekvro",
      version: "1.0.0",
      tag: releaseTag,
      channel: "github",
      publish: true,
      notes: "docs/releases/v1.0.0.md",
    }),
  );
  await write(checkout, "docs/releases/v1.0.0.md", "# Tekvro 1.0.0\n");
  await git(checkout, ["add", "."]);
  await git(checkout, ["commit", "-m", "chore: publication fixture"]);
  const source = await git(checkout, ["rev-parse", "HEAD"]);
  const tree = await git(checkout, ["rev-parse", "HEAD^{tree}"]);
  await writeAssets(assets, source, tree);
  const statePath = join(root, "github.json");
  const callsPath = join(root, "calls.jsonl");
  const state = {
    source,
    main: source,
    tag: null as string | null,
    run: {
      id: Number(runId),
      name: "CI",
      path: ".github/workflows/ci.yml",
      event: "push",
      head_branch: "main",
      head_sha: source,
      repository: { full_name: repository },
      head_repository: { full_name: repository },
      status: "completed",
      conclusion: "success",
    },
    jobs: jobNames.map((name) => ({
      name,
      status: "completed",
      conclusion: "success",
    })),
    otherReleases: [] as Array<{ tag_name: string }>,
    release: null as {
      draft: boolean;
      prerelease: boolean;
      target_commitish: string;
      tag_name: string;
      name: string;
      body: string;
      assets: Array<{ name: string; size: number }>;
      html_url: string;
    } | null,
    mutateLocalOnCreate: false,
    corruptDownload: false,
    moveMainOnDownload: false,
  };
  await writeFile(callsPath, "");
  await writeFile(join(bin, "gh"), fakeGhSource);
  await chmod(join(bin, "gh"), 0o755);
  const save = () => writeFile(statePath, JSON.stringify(state));
  await save();
  return {
    checkout,
    assets,
    source,
    state,
    save,
    calls: async () =>
      z.array(z.array(z.string())).parse(
        (await readFile(callsPath, "utf8"))
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line)),
      ),
    remote,
    remoteState: async () =>
      z
        .object({
          tag: z.string().nullable(),
          release: z
            .object({
              draft: z.boolean(),
              prerelease: z.boolean(),
              target_commitish: z.string(),
              assets: z.array(z.object({ name: z.string() })),
            })
            .nullable(),
        })
        .parse(JSON.parse(await readFile(statePath, "utf8"))),
    invoke: (operation: "preflight" | "publish", directory = assets) =>
      execute(
        process.execPath,
        [
          publisher,
          operation,
          "--source-sha",
          source,
          "--ci-run-id",
          runId,
          ...(operation === "publish" ? ["--directory", directory] : []),
        ],
        {
          cwd: checkout,
          env: {
            ...process.env,
            PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
            GITHUB_REPOSITORY: repository,
            GITHUB_OUTPUT: join(root, "github-output"),
            TEKVRO_GH_STATE: statePath,
            TEKVRO_GH_CALLS: callsPath,
            TEKVRO_GH_REMOTE: remote,
            TEKVRO_GH_LOCAL: assets,
            TMPDIR: temporary,
            TMP: temporary,
            TEMP: temporary,
          },
          timeout: 20_000,
          maxBuffer: 1024 * 1024,
        },
      ),
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
const releaseWrites = (calls: string[][]) =>
  calls.filter(
    (args) =>
      args[0] === "release" &&
      ["create", "upload", "edit", "delete"].includes(args[1] ?? ""),
  );

async function refused(f: Fixture, message: string) {
  await expect(f.invoke("publish")).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining(message),
  });
  expect(releaseWrites(await f.calls())).toEqual([]);
}

it("qualifies the exact main push using all pages of successful CI jobs without release writes", async () => {
  const f = await fixture();
  f.state.jobs.unshift(
    ...Array.from({ length: 100 }, (_, index) => ({
      name: `Independent fixture job ${index}`,
      status: "completed",
      conclusion: "success",
    })),
  );
  await f.save();
  const result = await f.invoke("preflight");
  expect(JSON.parse(result.stdout)).toMatchObject({
    publish: "true",
    source: f.source,
    run_id: runId,
    tag: releaseTag,
  });
  const calls = await f.calls();
  expect(calls.some((args) => args[1]?.includes("page=2"))).toBe(true);
  expect(releaseWrites(calls)).toEqual([]);
});

it.each([
  ["different source", "CI is not the exact main push revision"],
  ["fork run", "CI repository mismatch"],
  ["failed CI", "CI qualification has not succeeded"],
  ["missing platform job", "Required CI job did not succeed"],
] as const)(
  "refuses a %s before any release write",
  async (variant, message) => {
    const f = await fixture();
    if (variant === "different source") f.state.run.head_sha = "b".repeat(40);
    if (variant === "fork run")
      f.state.run.head_repository.full_name = "untrusted/Tekvro";
    if (variant === "failed CI") f.state.run.conclusion = "failure";
    if (variant === "missing platform job")
      f.state.jobs = f.state.jobs.filter(
        (job) => job.name !== "Native package baseline (darwin arm64)",
      );
    await f.save();
    await refused(f, message);
  },
);

it("leaves an already public release immutable in both operations", async () => {
  const f = await fixture();
  f.state.release = {
    draft: false,
    prerelease: false,
    target_commitish: f.source,
    tag_name: releaseTag,
    name: "Tekvro 1.0.0",
    body: "# Tekvro 1.0.0\n",
    assets: [],
    html_url: `https://github.com/${repository}/releases/tag/${releaseTag}`,
  };
  f.state.otherReleases = Array.from({ length: 100 }, (_, index) => ({
    tag_name: `v0.0.${index}`,
  }));
  await f.save();
  for (const operation of ["preflight", "publish"] as const) {
    const result = await f.invoke(operation);
    expect(JSON.parse(result.stdout)).toMatchObject({ publish: "false" });
  }
  const calls = await f.calls();
  expect(
    calls.some(
      (args) =>
        args[1] === "repos/ForceMind/Tekvro/releases?per_page=100&page=2",
    ),
  ).toBe(true);
  expect(releaseWrites(calls)).toEqual([]);
});

it("refuses a version tag owned by another commit before creating or uploading", async () => {
  const f = await fixture();
  f.state.tag = "c".repeat(40);
  await f.save();
  await refused(f, "Version tag already belongs to a different source");
});

it.each(["prerelease", "title", "notes"] as const)(
  "refuses an existing draft with unapproved %s before release writes",
  async (variant) => {
    const f = await fixture();
    f.state.release = {
      draft: true,
      prerelease: variant === "prerelease",
      target_commitish: f.source,
      tag_name: releaseTag,
      name: variant === "title" ? "Unapproved title" : "Tekvro 1.0.0",
      body: variant === "notes" ? "Unapproved notes" : "# Tekvro 1.0.0\n",
      assets: [],
      html_url: `https://github.com/${repository}/releases/tag/${releaseTag}`,
    };
    await f.save();
    await refused(f, "Draft release identity, notes or source mismatch");
    expect((await f.remoteState()).release?.draft).toBe(true);
  },
);

it("uploads exactly the checked assets and publishes only after reading their bytes back", async () => {
  const f = await fixture();
  const result = await f.invoke("publish");
  expect(JSON.parse(result.stdout)).toMatchObject({
    published: "true",
    tag: releaseTag,
    source: f.source,
  });
  const calls = await f.calls();
  const create = calls.find((args) => args[1] === "create");
  expect(create).toContain("--draft");
  expect(create?.[create.indexOf("--target") + 1]).toBe(f.source);
  expect(
    calls
      .filter((args) => args[1] === "upload")
      .map((args) => basename(args[3] ?? ""))
      .sort(),
  ).toEqual(assetNames);
  expect(calls.findIndex((args) => args[1] === "download")).toBeLessThan(
    calls.findIndex((args) => args[1] === "edit"),
  );
  for (const name of assetNames) {
    const remote = await readFile(join(f.remote, name));
    expect(remote.equals(await readFile(join(f.assets, name)))).toBe(true);
  }
  const state = await f.remoteState();
  expect(state).toMatchObject({
    tag: f.source,
    release: { draft: false, prerelease: false, target_commitish: f.source },
  });
  expect(state.release?.assets.map((asset) => asset.name).sort()).toEqual(
    assetNames,
  );
});

it.each([
  ["archive bytes", "Archive digest/size mismatch"],
  ["manifest source", "Release manifest source mismatch"],
  ["checksum inventory", "Checksum inventory mismatch"],
] as const)(
  "refuses altered %s before release writes",
  async (variant, message) => {
    const f = await fixture();
    if (variant === "archive bytes")
      await writeFile(
        join(f.assets, "tekvro-1.0.0.tgz"),
        "altered local archive",
      );
    if (variant === "manifest source") {
      const path = join(f.assets, "release-manifest.json");
      await writeFile(
        path,
        (await readFile(path, "utf8")).replace(f.source, "d".repeat(40)),
      );
    }
    if (variant === "checksum inventory")
      await writeFile(join(f.assets, "SHA256SUMS"), "0".repeat(64));
    await refused(f, message);
  },
);

it.each([
  ["corruptDownload", "Remote release digest mismatch"],
  ["moveMainOnDownload", "Selected source is no longer the main head"],
] as const)(
  "retains a draft when %s is observed before the public transition",
  async (setting, message) => {
    const f = await fixture();
    f.state[setting] = true;
    await f.save();
    await expect(f.invoke("publish")).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(message),
    });
    const calls = await f.calls();
    expect(calls.some((args) => args[1] === "download")).toBe(true);
    expect(calls.some((args) => args[1] === "edit")).toBe(false);
    expect((await f.remoteState()).release?.draft).toBe(true);
  },
);

it("requires an absolute asset directory before any release write", async () => {
  const f = await fixture();
  await expect(
    f.invoke("publish", relative(f.checkout, f.assets)),
  ).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining("absolute"),
  });
  expect(releaseWrites(await f.calls())).toEqual([]);
});

it("keeps the draft private when a local archive changes after validation and before upload", async () => {
  const f = await fixture();
  f.state.mutateLocalOnCreate = true;
  await f.save();
  await expect(f.invoke("publish")).rejects.toMatchObject({ code: 1 });
  expect((await f.calls()).some((args) => args[1] === "edit")).toBe(false);
  expect((await f.remoteState()).release?.draft).toBe(true);
});

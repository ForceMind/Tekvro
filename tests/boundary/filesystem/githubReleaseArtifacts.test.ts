import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";
import { expect, it } from "vitest";
import { z } from "zod";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";
import {
  executeWorkflowFixture as execute,
  workflowGit as git,
} from "../../support/workflowGit.js";

const builder = fileURLToPath(
  new URL("../../../scripts/release/github-artifacts.mjs", import.meta.url),
);
const runtimeFiles = [
  "scripts/rea.mjs",
  "scripts/lib/cli-process-environment.mjs",
  "dist/main.js",
  "dist/mcp/main.js",
  "dist/cli-runtime/cli.js",
  "dist/cli-runtime/cliOutput.js",
  "dist/cli-runtime/cliBuiltinArguments.js",
  "dist/cli-runtime/cliResultOutput.js",
  "dist/cli-runtime/mcpDoctor.js",
  "dist/mcpDoctor.js",
  "dist/cli.js",
  "dist/cliOutput.js",
  "dist/generatedPackageMetadata.js",
  "skills/reverse-engineer-anything/SKILL.md",
  "README.md",
  "README.en.md",
  "LICENSE",
  "DISCLAIMER.md",
  "THIRD_PARTY_NOTICES.md",
  "licenses/npm-runtime-notices.txt",
];
const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  product: z.literal("tekvro"),
  version: z.literal("1.0.0"),
  tag: z.literal("v1.0.0"),
  source: z.strictObject({
    repository: z.literal("ForceMind/Tekvro"),
    commit: z.string().regex(/^[a-f0-9]{40}$/u),
    tree: z.string().regex(/^[a-f0-9]{40}$/u),
  }),
  assets: z.array(
    z.strictObject({
      name: z.string(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/u),
      bytes: z.number().int().positive(),
    }),
  ),
  build: z.strictObject({ node: z.string(), npm: z.string() }),
});

async function write(root: string, name: string, contents: string) {
  const path = join(root, name);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, contents);
}

async function fixture() {
  const root = await createTestTempDirectory("tekvro-release-artifacts-");
  const directory = join(root, "source");
  const temporary = join(root, "temporary");
  const output = join(root, "assets");
  await Promise.all([mkdir(directory), mkdir(temporary)]);
  await git(directory, ["init", "--initial-branch=main"]);
  const identity = {
    name: "tekvro",
    version: "1.0.0",
    private: true,
    type: "module",
    repository: {
      type: "git",
      url: "git+https://github.com/ForceMind/Tekvro.git",
    },
    bin: {
      tekvro: "scripts/rea.mjs",
      rea: "scripts/rea.mjs",
      "rea-agents": "scripts/rea.mjs",
    },
    files: [
      "scripts",
      "dist",
      "skills",
      "README.md",
      "README.en.md",
      "LICENSE",
      "DISCLAIMER.md",
      "THIRD_PARTY_NOTICES.md",
      "licenses",
    ],
  };
  const lock = {
    name: identity.name,
    version: identity.version,
    lockfileVersion: 3,
    packages: {
      "": {
        ...identity,
        bin: { rea: "scripts/rea.mjs", "rea-agents": "scripts/rea.mjs" },
      },
    },
  };
  await write(directory, "package.json", JSON.stringify(identity));
  await write(directory, "package-lock.json", JSON.stringify(lock));
  await write(directory, ".gitignore", "dist/\nskills/\nnode_modules/\n");
  await write(directory, "src/main.ts", "export const fixture = true;\n");
  for (const path of runtimeFiles)
    await write(directory, path, `Fixture ${path}\n`);
  await write(
    directory,
    "scripts/rea.mjs",
    '#!/usr/bin/env node\nconsole.log("Tekvro 1.0.0");\n',
  );
  await write(
    directory,
    "dist/generatedPackageMetadata.js",
    'export const PACKAGE_METADATA = { name: "tekvro", version: "1.0.0" };\n',
  );
  await git(directory, ["add", "."]);
  await git(directory, ["commit", "-m", "chore: release fixture"]);
  return {
    root,
    directory,
    temporary,
    output,
    lock,
    identity,
    sourceSha: await git(directory, ["rev-parse", "HEAD"]),
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

it(
  "rebuilds every asset byte for byte from the same immutable source",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    const lfs = await addLfsPointers(f);
    await build(f, undefined, lfs.environment);
    // Cross a filesystem timestamp boundary so export-time mtimes cannot make
    // an otherwise nondeterministic source archive accidentally pass.
    await setTimeout(1_100);
    const retryOutput = join(f.root, "retry-assets");
    await build(
      f,
      ["--output", retryOutput, "--source-sha", f.sourceSha],
      lfs.environment,
    );
    for (const name of await readdir(f.output)) {
      expect(
        Buffer.compare(
          await readFile(join(retryOutput, name)),
          await readFile(join(f.output, name)),
        ),
        name,
      ).toBe(0);
    }
    const archive = join(f.output, "tekvro-1.0.0-source.tar.gz");
    for (const path of [
      "fixtures/large.lfs",
      "engines/fixture/nested/leaf/fixtures/large.lfs",
    ]) {
      expect(
        (await execute("tar", ["-xOf", archive, `tekvro-1.0.0/${path}`]))
          .stdout,
      ).toBe(lfs.pointer);
    }
    const observations = (await readFile(lfs.observations, "utf8"))
      .trim()
      .split("\n");
    expect(observations).toContain(`${f.directory}\t1`);
    expect(observations).toContain(`${lfs.leaf}\t1`);
    expect(observations.every((line) => line.endsWith("\t1"))).toBe(true);
    await expect(access(lfs.download)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readdir(f.temporary)).toEqual([]);
  },
);

function build(
  f: Fixture,
  args = ["--output", f.output, "--source-sha", f.sourceSha],
  environment: NodeJS.ProcessEnv = {},
) {
  return execute(process.execPath, [builder, ...args], {
    cwd: f.directory,
    env: {
      ...process.env,
      TMPDIR: f.temporary,
      TMP: f.temporary,
      TEMP: f.temporary,
      ...environment,
    },
    maxBuffer: 4 * 1024 * 1024,
  });
}

async function addNestedSubmodules(f: Fixture) {
  const leaf = join(f.root, "leaf-origin");
  const engine = join(f.root, "engine-origin");
  for (const path of [leaf, engine]) {
    await mkdir(path);
    await git(path, ["init", "--initial-branch=main"]);
    await write(
      path,
      "source.txt",
      `${path === leaf ? "leaf" : "engine"} source\n`,
    );
    await git(path, ["add", "."]);
    await git(path, ["commit", "-m", "chore: fixture source"]);
  }
  await git(engine, [
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "add",
    leaf,
    "nested/leaf",
  ]);
  await git(engine, ["commit", "-am", "chore: nested submodule"]);
  await git(f.directory, [
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "add",
    engine,
    "engines/fixture",
  ]);
  await git(f.directory, [
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "update",
    "--init",
    "--recursive",
  ]);
  await git(f.directory, ["commit", "-am", "chore: engine fixture"]);
  f.sourceSha = await git(f.directory, ["rev-parse", "HEAD"]);
  return join(f.directory, "engines/fixture");
}

async function addLfsPointers(f: Fixture) {
  const engine = await addNestedSubmodules(f);
  const leaf = join(engine, "nested/leaf");
  const pointer =
    "version https://git-lfs.github.com/spec/v1\noid sha256:b1d13c5021fad1bbc1fd95d8597efd5822fa179b00df8dd3fa4d5eb9f73c78b2\nsize 6252215\n";
  const download = join(f.root, "unexpected-lfs-download");
  const observations = join(f.root, "lfs-smudge-observations");
  const filter = join(f.root, "smudge.mjs");
  await writeFile(
    filter,
    `
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
if (process.env.GIT_LFS_SKIP_SMUDGE !== "1") {
  writeFileSync(${JSON.stringify(download)}, "download attempted");
  process.stderr.write("LFS download was not disabled");
  process.exit(87);
}
appendFileSync(${JSON.stringify(observations)}, process.cwd() + "\\t1\\n");
process.stdout.write(readFileSync(0));
`,
  );
  const globalConfig = join(f.root, "global-git-config");
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  await git(f.directory, [
    "config",
    "--file",
    globalConfig,
    "filter.lfs.smudge",
    `${quote(process.execPath)} ${quote(filter)}`,
  ]);
  await git(f.directory, [
    "config",
    "--file",
    globalConfig,
    "filter.lfs.required",
    "true",
  ]);
  for (const root of [f.directory, leaf]) {
    // Do not let a host's long-running LFS filter contact its real endpoint.
    await git(root, ["config", "filter.lfs.process", ""]);
    await git(root, ["config", "filter.lfs.clean", "cat"]);
    await git(root, ["config", "filter.lfs.required", "false"]);
    await write(root, ".gitattributes", "*.lfs filter=lfs -text\n");
    await write(root, "fixtures/large.lfs", pointer);
    await git(root, ["add", ".gitattributes", "fixtures/large.lfs"]);
    await git(root, ["commit", "-m", "chore: tracked LFS pointer"]);
    // The private global configuration supplies only the controlled smudge
    // filter during the build, with no host process-filter command to inherit.
    await git(root, ["config", "--unset", "filter.lfs.process"]);
    await git(root, ["config", "filter.lfs.required", "true"]);
  }
  await git(engine, ["add", "nested/leaf"]);
  await git(engine, ["commit", "-m", "chore: pin LFS fixture"]);
  await git(f.directory, ["add", "engines/fixture"]);
  await git(f.directory, ["commit", "-m", "chore: pin nested LFS fixture"]);
  f.sourceSha = await git(f.directory, ["rev-parse", "HEAD"]);
  for (const root of [f.directory, engine, leaf]) {
    const status = await execute("git", ["status", "--porcelain"], {
      cwd: root,
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: globalConfig,
        GIT_LFS_SKIP_SMUDGE: "0",
      },
    });
    expect(status.stdout, root).toBe("");
  }
  return {
    pointer,
    leaf,
    download,
    observations,
    environment: { GIT_CONFIG_GLOBAL: globalConfig, GIT_LFS_SKIP_SMUDGE: "0" },
  };
}

it(
  "builds installable locked runtime and complete recursive source assets, with verifiable hashes",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    await addNestedSubmodules(f);
    await write(f.directory, "caller-private.txt", "untracked private file\n");
    await write(f.directory, "node_modules/private/sentinel", "not source\n");
    await mkdir(f.output);
    const before = await git(f.directory, ["status", "--porcelain"]);
    await build(f);
    expect((await readdir(f.output)).sort()).toEqual([
      "SHA256SUMS",
      "release-manifest.json",
      "tekvro-1.0.0-source.tar.gz",
      "tekvro-1.0.0.tgz",
    ]);
    const manifest = manifestSchema.parse(
      JSON.parse(
        await readFile(join(f.output, "release-manifest.json"), "utf8"),
      ),
    );
    expect(manifest.source).toEqual({
      repository: "ForceMind/Tekvro",
      commit: f.sourceSha,
      tree: await git(f.directory, ["rev-parse", "HEAD^{tree}"]),
    });
    expect(manifest.assets.map(({ name }) => name)).toEqual([
      "tekvro-1.0.0.tgz",
      "tekvro-1.0.0-source.tar.gz",
    ]);
    for (const entry of manifest.assets) {
      const bytes = await readFile(join(f.output, entry.name));
      expect(entry.bytes).toBe(bytes.length);
      expect(entry.sha256).toBe(
        createHash("sha256").update(bytes).digest("hex"),
      );
    }
    const checksums = (await readFile(join(f.output, "SHA256SUMS"), "utf8"))
      .trim()
      .split("\n");
    expect(checksums).toHaveLength(3);
    for (const line of checksums) {
      const [digest, name] = line.split("  ");
      expect(typeof name).toBe("string");
      if (name === undefined) throw new Error("Missing checksum filename");
      expect(digest).toBe(
        createHash("sha256")
          .update(await readFile(join(f.output, name)))
          .digest("hex"),
      );
    }
    const runtime = join(f.output, "tekvro-1.0.0.tgz");
    const shrinkwrap = await execute("tar", [
      "-xOf",
      runtime,
      "package/npm-shrinkwrap.json",
    ]);
    expect(JSON.parse(shrinkwrap.stdout)).toEqual({
      ...f.lock,
      packages: { "": { ...f.lock.packages[""], bin: f.identity.bin } },
    });
    const listing = (
      await execute("tar", [
        "-tzf",
        join(f.output, "tekvro-1.0.0-source.tar.gz"),
      ])
    ).stdout;
    expect(listing).toContain("tekvro-1.0.0/src/main.ts");
    expect(listing).toContain("tekvro-1.0.0/engines/fixture/source.txt");
    expect(listing).toContain(
      "tekvro-1.0.0/engines/fixture/nested/leaf/source.txt",
    );
    expect(listing).not.toMatch(
      /caller-private|node_modules|\/\.git(?:\/|$)|\/dist\//mu,
    );
    const installed = join(f.root, "installed");
    await execute(
      "npm",
      [
        "install",
        "--offline",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--prefix",
        installed,
        runtime,
      ],
      {
        env: {
          ...process.env,
          npm_config_cache: join(f.root, "install-cache"),
        },
      },
    );
    expect(
      (
        await execute(process.execPath, [
          join(installed, "node_modules/tekvro/scripts/rea.mjs"),
        ])
      ).stdout,
    ).toBe("Tekvro 1.0.0\n");
    expect(await git(f.directory, ["status", "--porcelain"])).toBe(before);
    expect(await readdir(f.temporary)).toEqual([]);
  },
);

it("rejects a source SHA that does not identify HEAD before creating output", async () => {
  const f = await fixture();
  await expect(
    build(f, ["--output", f.output, "--source-sha", "0".repeat(40)]),
  ).rejects.toMatchObject({
    stderr: expect.stringContaining("match the current HEAD"),
  });
  await expect(readdir(f.output)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readdir(f.temporary)).toEqual([]);
});

it.each(["missing", "mismatched", "dirty"] as const)(
  "refuses a %s recursive submodule checkout",
  async (state) => {
    const f = await fixture();
    const engine = await addNestedSubmodules(f);
    const leaf = join(engine, "nested/leaf");
    if (state === "missing") await rm(leaf, { recursive: true });
    else {
      await write(leaf, "source.txt", "modified source\n");
      if (state === "mismatched") {
        await git(leaf, ["add", "."]);
        await git(leaf, ["commit", "-m", "chore: different source"]);
      }
    }
    await expect(build(f)).rejects.toMatchObject({
      stderr: expect.stringContaining("Submodule"),
    });
    await expect(readdir(f.output)).rejects.toMatchObject({ code: "ENOENT" });
  },
);

it.each(["nonempty", "relative", "symlink"] as const)(
  "protects caller output when its path is %s",
  async (state) => {
    const f = await fixture();
    const protectedDirectory = join(f.root, "protected");
    await mkdir(protectedDirectory);
    await write(protectedDirectory, "sentinel", "caller content\n");
    let output = f.output;
    if (state === "nonempty") output = protectedDirectory;
    if (state === "relative") output = "relative-assets";
    if (state === "symlink") await symlink(protectedDirectory, output, "dir");
    await expect(build(f, ["--output", output])).rejects.toMatchObject({
      stderr: expect.stringMatching(/Output|--output/u),
    });
    expect(await readFile(join(protectedDirectory, "sentinel"), "utf8")).toBe(
      "caller content\n",
    );
    expect(await readdir(f.temporary)).toEqual([]);
  },
);

it("rejects stale compiled metadata and tracked edits instead of mislabelling a release", async () => {
  const f = await fixture();
  await write(
    f.directory,
    "dist/generatedPackageMetadata.js",
    'export const PACKAGE_METADATA = { name: "tekvro", version: "0.9.0" };\n',
  );
  await expect(build(f)).rejects.toMatchObject({
    stderr: expect.stringContaining("Compiled package metadata differs"),
  });
  await write(f.directory, "src/main.ts", "export const changed = true;\n");
  await expect(build(f)).rejects.toMatchObject({
    stderr: expect.stringContaining("not clean"),
  });
  await expect(readdir(f.output)).rejects.toMatchObject({ code: "ENOENT" });
});

it("cleans private temporary resources when packing fails after input validation", async () => {
  const f = await fixture();
  await write(
    f.directory,
    "package.json",
    JSON.stringify({
      ...f.identity,
      files: [
        "scripts",
        "skills",
        "README.md",
        "README.en.md",
        "LICENSE",
        "DISCLAIMER.md",
        "THIRD_PARTY_NOTICES.md",
        "licenses",
      ],
    }),
  );
  await git(f.directory, ["add", "package.json"]);
  await git(f.directory, ["commit", "-m", "chore: incomplete runtime package"]);
  f.sourceSha = await git(f.directory, ["rev-parse", "HEAD"]);
  await expect(build(f)).rejects.toMatchObject({
    stderr: expect.stringContaining("Runtime archive omitted dist/"),
  });
  expect(await readdir(f.temporary)).toEqual([]);
  await expect(readdir(f.output)).rejects.toMatchObject({ code: "ENOENT" });
});

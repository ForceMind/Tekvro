import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { valid } from "semver";

const execute = promisify(execFile);
const REPOSITORY = "ForceMind/Tekvro";
const SHA = /^[a-f0-9]{40}$/u;
const RUNTIME_PATHS = [
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

async function run(command, args, cwd, environment = {}) {
  const result = await execute(command, args, {
    cwd,
    env: { ...process.env, ...environment },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return result.stdout;
}

const git = (root, args, environment) => run("git", args, root, environment);

function options(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (
      (option !== "--output" && option !== "--source-sha") ||
      value === undefined ||
      value.startsWith("--") ||
      parsed[option] !== undefined
    )
      throw new Error(
        "Usage: node scripts/release/github-artifacts.mjs --output ABS_DIR [--source-sha FULL_SHA]",
      );
    parsed[option] = value;
  }
  if (!isAbsolute(parsed["--output"] ?? ""))
    throw new Error("--output must be an absolute directory path");
  if (parsed["--source-sha"] !== undefined && !SHA.test(parsed["--source-sha"]))
    throw new Error("--source-sha must be a full lowercase commit SHA");
  return {
    output: resolve(parsed["--output"]),
    sourceSha: parsed["--source-sha"],
  };
}

async function requireEmptyOutput(output) {
  let information;
  try {
    information = await lstat(output);
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
      return;
    throw cause;
  }
  if (!information.isDirectory() || information.isSymbolicLink())
    throw new Error("Output must be a directory, never a symlink or file");
  if ((await readdir(output)).length !== 0)
    throw new Error(
      "Output directory must be empty; refusing to overwrite assets",
    );
}

function safeTrackedPath(path) {
  const components = path.split("/");
  if (
    path === "" ||
    isAbsolute(path) ||
    components.some((part) =>
      ["", ".", "..", ".git", "node_modules"].includes(part),
    )
  )
    throw new Error(`Unsafe tracked release path: ${JSON.stringify(path)}`);
}

async function sourceRepositories(root, sourceSha, prefix = "") {
  const currentRoot = (
    await git(root, ["rev-parse", "--show-toplevel"])
  ).trim();
  if ((await realpath(currentRoot)) !== (await realpath(root)))
    throw new Error(`Submodule checkout is missing: ${prefix || "."}`);
  const head = (await git(root, ["rev-parse", "HEAD^{commit}"])).trim();
  if (head !== sourceSha)
    throw new Error(`Source SHA mismatch in ${prefix || "."}`);
  const tree = (await git(root, ["rev-parse", `${sourceSha}^{tree}`])).trim();
  const records = (await git(root, ["ls-tree", "-rz", sourceSha])).split("\0");
  const repositories = [{ root, sourceSha, tree, prefix }];
  for (const record of records) {
    if (record === "") continue;
    const match = /^(\d{6}) (blob|commit) ([a-f0-9]{40})\t([\s\S]+)$/u.exec(
      record,
    );
    if (match === null) throw new Error("Malformed tracked Git tree entry");
    const [, mode, type, sha, path] = match;
    safeTrackedPath(path);
    if (mode === "160000" && type === "commit") {
      const child = join(root, path);
      try {
        repositories.push(
          ...(await sourceRepositories(
            child,
            sha,
            prefix === "" ? path : `${prefix}/${path}`,
          )),
        );
      } catch (cause) {
        throw new Error(
          `Submodule ${prefix}${prefix === "" ? "" : "/"}${path} is missing, mismatched, or dirty`,
          {
            cause,
          },
        );
      }
    } else if (type !== "blob") {
      throw new Error(`Unsupported tracked release entry: ${path}`);
    }
  }
  // Nested checkouts are checked separately, against their recorded gitlinks.
  const status = await git(root, [
    "status",
    "--porcelain",
    "-z",
    prefix === "" ? "--untracked-files=no" : "--untracked-files=normal",
    "--ignore-submodules=all",
  ]);
  const staged = await git(root, [
    "diff",
    "--cached",
    "--name-only",
    "-z",
    sourceSha,
  ]);
  if (status !== "" || staged !== "")
    throw new Error(`Release source is not clean: ${prefix || "."}`);
  return repositories;
}

async function requireRuntime(root, packageJson) {
  for (const path of RUNTIME_PATHS) {
    let information;
    try {
      information = await lstat(join(root, path));
    } catch (cause) {
      throw new Error(`Missing compiled release input: ${path}; build first`, {
        cause,
      });
    }
    if (!information.isFile() || information.size === 0)
      throw new Error(`Missing or invalid compiled release input: ${path}`);
  }
  const compiled = await readFile(
    join(root, "dist/generatedPackageMetadata.js"),
    "utf8",
  );
  if (
    !compiled.includes(`name: ${JSON.stringify(packageJson.name)}`) ||
    !compiled.includes(`version: ${JSON.stringify(packageJson.version)}`)
  )
    throw new Error(
      "Compiled package metadata differs from the release identity; build first",
    );
}

async function npmPack({
  root,
  destination,
  environment,
  identity,
  requireLock = false,
}) {
  const records = JSON.parse(
    await run(
      "npm",
      [
        "pack",
        "--offline",
        "--ignore-scripts",
        "--json",
        "--pack-destination",
        destination,
      ],
      root,
      environment,
    ),
  );
  const record =
    Array.isArray(records) && records.length === 1 ? records[0] : undefined;
  if (
    record?.name !== identity.name ||
    record.version !== identity.version ||
    typeof record.filename !== "string" ||
    basename(record.filename) !== record.filename ||
    !record.filename.endsWith(".tgz") ||
    !Array.isArray(record.files)
  )
    throw new Error("npm pack returned unexpected release metadata");
  const files = new Set(record.files.map(({ path }) => path));
  for (const path of files) safeTrackedPath(path);
  for (const path of RUNTIME_PATHS)
    if (!files.has(path)) throw new Error(`Runtime archive omitted ${path}`);
  if (requireLock && !files.has("npm-shrinkwrap.json"))
    throw new Error("Runtime archive omitted the locked dependency manifest");
  return join(destination, record.filename);
}

async function asset(path) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return {
    name: basename(path),
    sha256: hash.digest("hex"),
    bytes,
  };
}

async function releaseIdentity(root) {
  const packageJson = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );
  if (
    packageJson.name !== "tekvro" ||
    packageJson.private !== true ||
    packageJson.repository?.url !==
      `git+https://github.com/${REPOSITORY}.git` ||
    valid(packageJson.version) !== packageJson.version ||
    packageJson.version.includes("+") ||
    !Array.isArray(packageJson.files)
  )
    throw new Error(
      "Release requires the private tekvro package, exact SemVer, and canonical repository",
    );
  const lockPath = join(root, "package-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  if (
    lock.name !== packageJson.name ||
    lock.version !== packageJson.version ||
    lock.packages?.[""]?.name !== packageJson.name ||
    lock.packages[""].version !== packageJson.version ||
    lock.lockfileVersion !== 3
  )
    throw new Error(
      "The release package lock does not match its package identity",
    );
  return { packageJson, lockPath };
}

async function archiveSources({ root, workspace, sourceName, repositories }) {
  const source = join(workspace, "source");
  const sourceRoot = join(source, sourceName);
  await mkdir(sourceRoot, { recursive: true });
  for (const [index, repository] of repositories.entries()) {
    const destination = join(sourceRoot, repository.prefix);
    await mkdir(destination, { recursive: true });
    const environment = {
      GIT_INDEX_FILE: join(workspace, `source-index-${index}`),
    };
    await git(
      repository.root,
      ["read-tree", repository.sourceSha],
      environment,
    );
    await git(
      repository.root,
      [
        "checkout-index",
        "--all",
        "--force",
        "--ignore-skip-worktree-bits",
        `--prefix=${destination}${sep}`,
      ],
      environment,
    );
  }
  const archive = join(workspace, `${sourceName}-source.tar.gz`);
  const timestamp = (
    await git(root, ["show", "-s", "--format=%ct", repositories[0].sourceSha])
  ).trim();
  if (!/^(?:0|[1-9]\d*)$/u.test(timestamp))
    throw new Error("Source commit has an invalid archive timestamp");
  await run(
    "tar",
    [
      "--sort=name",
      "--format=posix",
      `--mtime=@${timestamp}`,
      "--owner=0",
      "--group=0",
      "--numeric-owner",
      "--mode=go+u,go-w",
      "--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime",
      "-czf",
      archive,
      "-C",
      source,
      sourceName,
    ],
    root,
    { LC_ALL: "C", TZ: "UTC" },
  );
  return archive;
}

async function packArchives({
  root,
  workspace,
  packageJson,
  lockPath,
  repositories,
}) {
  const environment = {
    npm_config_cache: join(workspace, "npm-cache"),
    npm_config_offline: "true",
    npm_config_ignore_scripts: "true",
    NODE_COMPILE_CACHE: join(workspace, "node-compile-cache"),
    TMPDIR: workspace,
    TMP: workspace,
    TEMP: workspace,
  };
  const npmVersion = (
    await run("npm", ["--version"], root, environment)
  ).trim();
  const initial = join(workspace, "initial");
  const runtime = join(workspace, "runtime");
  const packed = join(workspace, "packed");
  await Promise.all([initial, runtime, packed].map((path) => mkdir(path)));
  const initialTarball = await npmPack({
    root,
    destination: initial,
    environment,
    identity: packageJson,
  });
  await run("tar", ["-xzf", initialTarball, "-C", runtime], root);
  const runtimeRoot = join(runtime, "package");
  const shrinkwrap = JSON.parse(await readFile(lockPath, "utf8"));
  // The dependency graph stays locked; root executable metadata follows the
  // installed package, including aliases absent from older lockfiles.
  shrinkwrap.packages[""].bin = packageJson.bin;
  await writeFile(
    join(runtimeRoot, "npm-shrinkwrap.json"),
    `${JSON.stringify(shrinkwrap, null, 2)}\n`,
  );
  await writeFile(
    join(runtimeRoot, "package.json"),
    `${JSON.stringify({ ...packageJson, files: [...packageJson.files, "npm-shrinkwrap.json"] }, null, 2)}\n`,
  );
  const runtimeTarball = await npmPack({
    root: runtimeRoot,
    destination: packed,
    environment,
    identity: packageJson,
    requireLock: true,
  });
  const sourceName = `tekvro-${packageJson.version}`;
  const sourceArchive = await archiveSources({
    root,
    workspace,
    sourceName,
    repositories,
  });
  return { runtimeTarball, sourceArchive, sourceName, npmVersion };
}

async function publishLocalAssets({ output, archives, packageJson, source }) {
  await mkdir(dirname(output), { recursive: true });
  let finalStage = await mkdtemp(join(dirname(output), ".tekvro-release-"));
  try {
    const runtimeName = `${archives.sourceName}.tgz`;
    const sourceArchiveName = basename(archives.sourceArchive);
    await copyFile(archives.runtimeTarball, join(finalStage, runtimeName));
    await copyFile(archives.sourceArchive, join(finalStage, sourceArchiveName));
    const assets = await Promise.all([
      asset(join(finalStage, runtimeName)),
      asset(join(finalStage, sourceArchiveName)),
    ]);
    const manifest = {
      schemaVersion: 1,
      product: "tekvro",
      version: packageJson.version,
      tag: `v${packageJson.version}`,
      source: {
        repository: REPOSITORY,
        commit: source.sourceSha,
        tree: source.tree,
      },
      assets,
      build: { node: process.version, npm: archives.npmVersion },
    };
    await writeFile(
      join(finalStage, "release-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    const manifestAsset = await asset(
      join(finalStage, "release-manifest.json"),
    );
    await writeFile(
      join(finalStage, "SHA256SUMS"),
      [...assets, manifestAsset]
        .map(({ name, sha256 }) => `${sha256}  ${name}\n`)
        .join(""),
    );
    await requireEmptyOutput(output);
    await rename(finalStage, output);
    finalStage = undefined;
    return manifest;
  } finally {
    if (finalStage !== undefined)
      await rm(finalStage, { recursive: true, force: true });
  }
}

/** Build local, commit-bound GitHub assets without contacting a package registry. */
export async function createGithubArtifacts({ output, sourceSha }) {
  if (!isAbsolute(output))
    throw new Error("--output must be an absolute directory path");
  const root = await realpath(process.cwd());
  await requireEmptyOutput(output);
  const head = (await git(root, ["rev-parse", "HEAD^{commit}"])).trim();
  if (!SHA.test(head) || (sourceSha !== undefined && sourceSha !== head))
    throw new Error("--source-sha must match the current HEAD commit");
  const repositories = await sourceRepositories(root, head);
  const { packageJson, lockPath } = await releaseIdentity(root);
  await requireRuntime(root, packageJson);
  if (
    process.platform !== "linux" ||
    !(await run("tar", ["--version"], root)).startsWith("tar (GNU tar) ")
  )
    throw new Error("GitHub release asset builds require Linux and GNU tar");
  const workspace = await mkdtemp(join(tmpdir(), "tekvro-release-"));
  try {
    const archives = await packArchives({
      root,
      workspace,
      packageJson,
      lockPath,
      repositories,
    });
    // Recheck the complete source closure before publishing any local output.
    await sourceRepositories(root, head);
    await requireRuntime(root, packageJson);
    return await publishLocalAssets({
      output,
      archives,
      packageJson,
      source: repositories[0],
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const parsed = options(process.argv.slice(2));
    const manifest = await createGithubArtifacts(parsed);
    process.stdout.write(
      `${JSON.stringify({ output: parsed.output, ...manifest })}\n`,
    );
  } catch (cause) {
    process.stderr.write(
      `${cause instanceof Error ? cause.message : String(cause)}\n`,
    );
    process.exitCode = 1;
  }
}

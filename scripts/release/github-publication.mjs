import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const repository = "ForceMind/Tekvro";
const requiredJobs = [
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

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, allowMissing = false) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 45_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GH_HOST: "github.com", GH_PROMPT_DISABLED: "1" },
  });
  if (
    allowMissing &&
    result.status !== 0 &&
    /HTTP 404/.test(result.stderr ?? "")
  )
    return null;
  requireCondition(
    !result.error && result.status === 0,
    `${command} failed: ${result.error?.message ?? result.stderr}`,
  );
  return result.stdout.trim();
}

function api(endpoint, allowMissing = false) {
  const output = run(
    "gh",
    ["api", `repos/${repository}/${endpoint}`],
    allowMissing,
  );
  return output === null ? null : JSON.parse(output);
}

function fromCommit(source, path) {
  return run("git", ["show", `${source}:${path}`]);
}

function findRelease(tag) {
  // The tag lookup endpoint omits drafts. Authenticated listing includes them.
  for (let page = 1; ; page += 1) {
    const releases = api(`releases?per_page=100&page=${page}`);
    requireCondition(Array.isArray(releases), "Malformed releases response");
    const matching = releases.filter((release) => release.tag_name === tag);
    requireCondition(matching.length <= 1, "Duplicate release tag");
    if (matching.length === 1) return matching[0];
    if (releases.length < 100) return null;
  }
}

function options() {
  const [operation, ...args] = process.argv.slice(2);
  requireCondition(
    operation === "preflight" || operation === "publish",
    "Expected preflight or publish",
  );
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    requireCondition(
      ["--source-sha", "--ci-run-id", "--directory"].includes(key) &&
        args[index + 1] &&
        !values[key],
      "Invalid or duplicate argument",
    );
    values[key] = args[index + 1];
  }
  const source = values["--source-sha"];
  const runId = values["--ci-run-id"];
  requireCondition(
    /^[a-f0-9]{40}$/.test(source ?? ""),
    "Source must be a full commit SHA",
  );
  requireCondition(
    /^[1-9][0-9]*$/.test(runId ?? "") && Number.isSafeInteger(Number(runId)),
    "CI run ID must be a positive integer",
  );
  requireCondition(
    !process.env.GITHUB_REPOSITORY ||
      process.env.GITHUB_REPOSITORY === repository,
    "Publication repository mismatch",
  );
  requireCondition(
    operation !== "publish" || isAbsolute(values["--directory"] ?? ""),
    "Publication directory must be absolute",
  );
  return { operation, source, runId, directory: values["--directory"] };
}

function releaseIntent(source) {
  const intent = JSON.parse(fromCommit(source, "release.json"));
  const pkg = JSON.parse(fromCommit(source, "package.json"));
  requireCondition(
    intent.schemaVersion === 1 &&
      intent.product === "tekvro" &&
      intent.channel === "github" &&
      intent.publish === true,
    "GitHub publication is not enabled by release.json",
  );
  requireCondition(
    /^[0-9]+\.[0-9]+\.[0-9]+$/.test(intent.version) &&
      intent.tag === `v${intent.version}`,
    "Invalid release version or tag",
  );
  requireCondition(
    pkg.name === "tekvro" &&
      pkg.version === intent.version &&
      pkg.private === true,
    "Package identity or registry guard mismatch",
  );
  requireCondition(
    intent.notes === `docs/releases/v${intent.version}.md`,
    "Release notes must use the versioned documentation path",
  );
  requireCondition(
    fromCommit(source, intent.notes).includes(`Tekvro ${intent.version}`),
    "Versioned release notes are missing",
  );
  return intent;
}

function qualify(source, runId) {
  const runInfo = api(`actions/runs/${runId}`);
  requireCondition(
    runInfo.id === Number(runId) &&
      runInfo.name === "CI" &&
      runInfo.path === ".github/workflows/ci.yml",
    "Unexpected qualification workflow",
  );
  requireCondition(
    runInfo.event === "push" &&
      runInfo.head_branch === "main" &&
      runInfo.head_sha === source,
    "CI is not the exact main push revision",
  );
  requireCondition(
    runInfo.repository?.full_name === repository &&
      runInfo.head_repository?.full_name === repository,
    "CI repository mismatch",
  );
  requireCondition(
    runInfo.status === "completed" && runInfo.conclusion === "success",
    "CI qualification has not succeeded",
  );
  const jobs = [];
  for (let page = 1; ; page += 1) {
    const response = api(
      `actions/runs/${runId}/jobs?filter=latest&per_page=100&page=${page}`,
    );
    requireCondition(
      Array.isArray(response.jobs),
      "Malformed CI jobs response",
    );
    jobs.push(...response.jobs);
    if (jobs.length >= response.total_count) break;
    requireCondition(response.jobs.length > 0, "Incomplete CI job inventory");
  }
  for (const name of requiredJobs) {
    const matches = jobs.filter((job) => job.name === name);
    requireCondition(
      matches.length === 1 &&
        matches[0].status === "completed" &&
        matches[0].conclusion === "success",
      `Required CI job did not succeed: ${name}`,
    );
  }
  requireCondition(
    jobs.every((job) => ["success", "skipped"].includes(job.conclusion)),
    "CI contains unsuccessful jobs",
  );
  const main = api("git/ref/heads/main");
  requireCondition(
    main.object?.sha === source,
    "Selected source is no longer the main head; qualify the current revision",
  );
}

function tagCommit(tag) {
  let object = api(`git/ref/tags/${tag}`, true)?.object;
  if (!object) return null;
  for (let depth = 0; object.type === "tag" && depth < 8; depth += 1)
    object = api(`git/tags/${object.sha}`).object;
  requireCondition(
    object.type === "commit",
    "Release tag does not resolve to a commit",
  );
  return object.sha;
}

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function digestBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function verifyAssets(directory, intent, source) {
  requireCondition(
    run("git", ["rev-parse", "HEAD"]) === source,
    "Checkout differs from release source",
  );
  requireCondition(
    run("git", ["status", "--porcelain", "--untracked-files=no"]) === "",
    "Release checkout has tracked modifications",
  );
  const manifestPath = join(directory, "release-manifest.json");
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const hashes = new Map([
    ["release-manifest.json", digestBytes(manifestBytes)],
  ]);
  requireCondition(
    manifest.schemaVersion === 1 &&
      manifest.product === "tekvro" &&
      manifest.version === intent.version &&
      manifest.tag === intent.tag,
    "Release manifest identity mismatch",
  );
  requireCondition(
    manifest.source?.repository === repository &&
      manifest.source.commit === source &&
      manifest.source.tree === run("git", ["rev-parse", `${source}^{tree}`]),
    "Release manifest source mismatch",
  );
  const archiveNames = [
    `tekvro-${intent.version}.tgz`,
    `tekvro-${intent.version}-source.tar.gz`,
  ].sort();
  requireCondition(
    Array.isArray(manifest.assets) &&
      manifest.assets.length === 2 &&
      JSON.stringify(manifest.assets.map((asset) => asset.name).sort()) ===
        JSON.stringify(archiveNames),
    "Manifest archive inventory mismatch",
  );
  const expectedChecksums = [];
  for (const asset of manifest.assets) {
    const path = join(directory, asset.name);
    const stat = lstatSync(path);
    const bytes = readFileSync(path);
    requireCondition(
      stat.isFile() &&
        stat.size > 0 &&
        stat.size === asset.bytes &&
        bytes.length === asset.bytes &&
        /^[a-f0-9]{64}$/.test(asset.sha256) &&
        digestBytes(bytes) === asset.sha256,
      `Archive digest/size mismatch: ${asset.name}`,
    );
    hashes.set(asset.name, asset.sha256);
    expectedChecksums.push(`${asset.sha256}  ${asset.name}`);
  }
  // Include the source identity receipt in the integrity inventory too.
  expectedChecksums.push(
    `${hashes.get("release-manifest.json")}  release-manifest.json`,
  );
  const checksumBytes = readFileSync(join(directory, "SHA256SUMS"));
  hashes.set("SHA256SUMS", digestBytes(checksumBytes));
  const checksums = checksumBytes.toString("utf8").trim().split(/\r?\n/).sort();
  requireCondition(
    JSON.stringify(checksums) === JSON.stringify(expectedChecksums.sort()),
    "Checksum inventory mismatch",
  );
  const names = [...archiveNames, "SHA256SUMS", "release-manifest.json"].sort();
  requireCondition(
    JSON.stringify(readdirSync(directory).sort()) === JSON.stringify(names),
    "Release directory must contain exactly four assets",
  );
  for (const name of names)
    requireCondition(
      lstatSync(join(directory, name)).isFile(),
      `Asset is not a regular file: ${name}`,
    );
  return { names, hashes };
}

function output(values) {
  for (const [key, value] of Object.entries(values)) {
    requireCondition(!String(value).includes("\n"), "Invalid workflow output");
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
  console.log(JSON.stringify(values));
}

function verifyDraft(draft, intent, source) {
  requireCondition(
    draft.draft === true &&
      draft.prerelease === false &&
      draft.target_commitish === source &&
      draft.tag_name === intent.tag &&
      draft.name === `Tekvro ${intent.version}` &&
      draft.body?.trim() === fromCommit(source, intent.notes).trim(),
    "Draft release identity, notes or source mismatch",
  );
}

function uploadDraft(options, intent, existing, artifacts) {
  const { directory, names, hashes, temporary } = artifacts;
  if (!existing) {
    run("gh", [
      "release",
      "create",
      intent.tag,
      "--repo",
      repository,
      "--target",
      options.source,
      "--title",
      `Tekvro ${intent.version}`,
      "--notes-file",
      intent.notes,
      "--draft",
    ]);
  }
  const draft = findRelease(intent.tag);
  verifyDraft(draft, intent, options.source);
  requireCondition(
    draft.assets.every((asset) => names.includes(asset.name)),
    "Draft contains unexpected assets",
  );
  for (const name of names) {
    const matches = draft.assets.filter((asset) => asset.name === name);
    requireCondition(matches.length <= 1, "Duplicate draft asset");
    if (matches.length === 0)
      run("gh", [
        "release",
        "upload",
        intent.tag,
        join(directory, name),
        "--repo",
        repository,
      ]);
  }
  // Read bytes back from the remote draft. Failed/retried uploads cannot silently replace assets.
  run("gh", [
    "release",
    "download",
    intent.tag,
    "--repo",
    repository,
    "--dir",
    temporary,
  ]);
  requireCondition(
    JSON.stringify(readdirSync(temporary).sort()) === JSON.stringify(names),
    "Remote release inventory mismatch",
  );
  for (const name of names)
    requireCondition(
      digest(join(temporary, name)) === hashes.get(name),
      `Remote release digest mismatch: ${name}`,
    );
}

function publish(options, intent, existing) {
  const directory = resolve(options.directory);
  const { names, hashes } = verifyAssets(directory, intent, options.source);
  const temporary = mkdtempSync(join(tmpdir(), "tekvro-publication-"));
  try {
    uploadDraft(options, intent, existing, {
      directory,
      names,
      hashes,
      temporary,
    });
    // Recheck the exact CI and main head immediately before the public transition.
    qualify(options.source, options.runId);
    verifyDraft(findRelease(intent.tag), intent, options.source);
    const resolvedTag = tagCommit(intent.tag);
    requireCondition(
      resolvedTag === null || resolvedTag === options.source,
      "Version tag changed during publication",
    );
    run("gh", [
      "release",
      "edit",
      intent.tag,
      "--repo",
      repository,
      "--draft=false",
      "--latest",
    ]);
    const released = findRelease(intent.tag);
    requireCondition(
      released.draft === false &&
        released.prerelease === false &&
        released.assets.length === names.length &&
        tagCommit(intent.tag) === options.source,
      "Published release verification failed",
    );
    output({
      published: "true",
      tag: intent.tag,
      source: options.source,
      url: released.html_url,
    });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

try {
  const selected = options();
  const intent = releaseIntent(selected.source);
  const existing = findRelease(intent.tag);
  if (existing && !existing.draft) {
    output({
      publish: "false",
      tag: intent.tag,
      reason:
        "Public releases are immutable; this version is already published",
    });
  } else {
    qualify(selected.source, selected.runId);
    const currentTag = tagCommit(intent.tag);
    requireCondition(
      currentTag === null || currentTag === selected.source,
      "Version tag already belongs to a different source",
    );
    if (existing) verifyDraft(existing, intent, selected.source);
    if (selected.operation === "preflight")
      output({
        publish: "true",
        source: selected.source,
        run_id: selected.runId,
        version: intent.version,
        tag: intent.tag,
      });
    else publish(selected, intent, existing);
  }
} catch (error) {
  console.error(
    `Tekvro release refused: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}

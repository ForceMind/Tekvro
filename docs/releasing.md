# Releasing Tekvro

Tekvro's public distribution channel is [GitHub Releases](https://github.com/ForceMind/Tekvro/releases). The release configuration deliberately keeps `package.json` private. A release uploads a compiled CLI/MCP package and complete source; it does not publish an npm registry package or MCP Registry entry.

## Prepare a version

Release archives are built on Ubuntu with Git, GNU tar, Node.js and npm. The source archive normalizes entry order, timestamps and ownership so retries for the same source and build runtime retain identical bytes. This build-host requirement does not apply to installing the runtime archive.

Use a reviewed pull request to align the product version in `package.json`, `package-lock.json`, `.release-please-manifest.json`, `src/generatedPackageMetadata.ts` and `server.json`. Keep source provenance metadata distinct from the product version. Update `release.json`, the first `CHANGELOG.md` entry, the default version in `install.sh`, versioned installation examples and `docs/releases/vVERSION.md` for every new public version.

The release request is `release.json`. For 1.0.0 it declares:

```json
{
  "schemaVersion": 1,
  "product": "tekvro",
  "version": "1.0.0",
  "tag": "v1.0.0",
  "channel": "github",
  "publish": true,
  "notes": "docs/releases/v1.0.0.md"
}
```

Review the release notes, runtime requirements, supported operations and known limits. Do not convert historical checks into claims about the release revision. Do not change legal notices, compatibility identifiers or optional-tool support solely to simplify product copy.

`publish` is the explicit publication switch. Set it to `false` in a reviewed commit to block automatic publication. To release a later version, update the version, tag and notes together with the aligned metadata above; do not reuse 1.0.0 for different bytes.

## Qualify the exact revision

The normal `CI` workflow validates the merge on `main`. Full qualification can also be requested with the `ci:full` pull-request label or a manual CI run; see [CI verification](ci-analysis.md). A branch name, a green run for another commit or a manually created tag is not release qualification.

The GitHub publication entrypoint is `.github/workflows/tekvro-release.yml`. It listens for a completed `CI` run through `workflow_run` and admits only a successful **push** run for the canonical repository's current `main` revision. A manual retry supplies that same source SHA and CI run ID; it does not bypass those checks. `scripts/release/github-publication.mjs` validates the release request and its exact source identity before any public write.

The workflow checks out the admitted commit and its recursive submodules, installs locked dependencies, and downloads runtime and Windows native build artifacts from that exact CI run. It verifies the native artifact identity before packaging. Release source and runtime archives must agree with the commit and tree recorded in the manifest. Dirty source, mismatched metadata, missing submodule contents and unexpected assets must fail instead of producing a partial local release set.

## Build and verify the assets

`scripts/release/github-artifacts.mjs` creates the local release set without uploading it. From a clean, fully built checkout, choose an empty absolute output directory:

```bash
node scripts/release/github-artifacts.mjs --output /absolute/path/to/tekvro-release --source-sha FULL_COMMIT_SHA
```

For version 1.0.0, the only public assets are:

| Asset                        | Contents                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `tekvro-1.0.0.tgz`           | npm-installable CLI/MCP package containing `dist/` and required runtime files         |
| `tekvro-1.0.0-source.tar.gz` | Tracked source at the release revision, including pinned submodule contents           |
| `SHA256SUMS`                 | SHA-256 records for both archives and `release-manifest.json`                         |
| `release-manifest.json`      | Version, tag, source commit/tree, archive hashes/sizes and build Node.js/npm versions |

`npm pack` and `npm install` of a local `.tgz` are packaging operations. They do not require making the package public in a registry. Keep `private: true`, the registry publication guards and the disabled registry workflow boundaries.

The release gate installs the actual generated `.tgz` into an isolated prefix and exercises its Tekvro CLI/MCP runtime. A source-tree test or an unpacked directory is not a substitute for that canary. Verify the archive contents, command identity, version, protocol startup and required runtime files; compare local SHA-256 and sizes with the manifest before upload.

A canary establishes only the operations and host/runtime it actually exercised. The release canary runs on Linux x64 with Node.js `24.22.1`; it checks package identity, CLI startup, the canonical MCP catalog and a session operation. Supported Node.js `22`, `24` and `26` majors are not a promise that every release runs the complete suite on all of them. Native analysis and optional tools need their own recorded verification.

## Publish and inspect

After the CI identity, release request, package canary and local checksum checks pass, the publication workflow creates or resumes a draft bound to the admitted commit and reviewed notes. It uploads the four assets, downloads the draft assets again and compares their bytes by SHA-256. It rechecks CI, current main and tag identity immediately before making the release public. The workflow uses only the permissions needed to inspect CI and write the GitHub release. It does not receive or use npm/MCP Registry publication credentials.

SHA-256 checks establish agreement between the recorded and downloaded bytes. They are not a digital signature or proof that an analyzed artifact is safe.

After publication, inspect the versioned release page and download the assets again. Verify all four filenames, compare `SHA256SUMS`, inspect the manifest's commit/tree and confirm that the public tag resolves to the admitted commit. Install the downloaded runtime package to check the public download path. Only then report the release as available.

For 1.0.0 the review targets are:

- [Versioned release](https://github.com/ForceMind/Tekvro/releases/tag/v1.0.0)
- [Release workflow](https://github.com/ForceMind/Tekvro/actions/workflows/tekvro-release.yml)
- [Release notes](releases/v1.0.0.md)
- [User installation and updates](zh-CN/distribution.md)

The public installer downloads a versioned release and verifies its checksum. It does not change client configuration. Users review `tekvro setup --dry-run` and apply their selected setup separately.

## Failures and retries

A failed gate must not publish. Retain diagnostics and the admitted source revision, correct the issue in a new reviewed commit when needed, and qualify that revision before a new release attempt.

Never overwrite a public release, replace an existing asset or retarget an existing version tag. A run for an already public version skips publication. If a public version has incorrect bytes, publish a corrected version with its own review and qualification. A draft retry must preserve the same commit, notes and exact asset bytes; existing matching assets are retained. Inspect any partially created draft or tag before retrying; the publishing script's collision checks remain authoritative. Keep the original failed run for diagnosis.

The older registry-oriented workflows and scripts remain guarded for compatibility and regression checks. They are not the publication path for Tekvro's GitHub channel. Do not enable them or remove their private-package refusal to complete this release.

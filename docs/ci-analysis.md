# Tekvro CI verification

Tekvro's [`CI` workflow](https://github.com/ForceMind/Tekvro/actions/workflows/ci.yml) checks pull requests and pushes to `main`, and can run manually. Its source is `.github/workflows/ci.yml`; lane ownership is declared in `scripts/ci/scopes.mjs`, with selection in `scripts/ci/plan.mjs`. No scheduled run is required for this release process.

## Toolchain and runtime scope

The principal CI jobs select Node.js `24.22.1` from `.nvmrc` and run `npm ci` with the committed lockfile. Development declares npm `11.16.0` in `package.json`; the workflows use the npm supplied by the selected runtime rather than installing that npm version explicitly. The release manifest records the actual build Node.js/npm versions. Package runtime support is `^22.23.4 || ^24.22.1 || >=26.12.1`.

The Windows capability lane also runs selected native-path boundary tests on Node.js `22.23.4`. The complete portable suite is not run on a Node.js 22/24/26 matrix. Runtime compatibility declarations, deterministic suite results and real host/tool verification answer different questions.

## Feedback and full qualification

| Mode                              | Trigger and work                                                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fast feedback                     | Ordinary pull requests and pushes classify changed paths, run relevant static checks and select host/tool lanes. Code changes run the complete portable inventory as source tests plus sharded compiled-dependent tests. |
| Full qualification                | A manual CI run, an explicit exact-revision workflow call, or a `ci:full` pull-request label requests deep static checks, complete portable coverage and the full hosted lane set.                                       |
| Documentation or workflow changes | Run the matching formatting, documentation, workflow validation and policy checks; they do not claim fresh runtime/provider observations when those lanes were not selected.                                             |

Test-selection ownership reports are observational. They compare candidate ownership with the full executed inventory; they do not silently drop unrelated tests from the portable suite. Deleted, duplicate, missing or undiscovered test files must not produce a passing inventory report.

The `Portable tests` job merges shard results, emits JUnit/JSON and timing reports, and verifies discovery against the complete inventory. `CI required` checks the outcomes of every selected lane. A skipped optional lane does not establish a successful verification of that capability.

## Checks and artifacts

| Area                      | Evidence produced                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Static and build          | Typecheck, lint, formatting, package metadata and module/architecture checks; full qualification adds deeper dependency, duplication and typed checks. |
| Portable tests            | Source and compiled boundary results, file-inventory validation, timing reports and full-mode coverage.                                                |
| Host runtime and packages | Selected Linux, macOS and Windows native package checks, real runtime observation, source-built fixtures and host-specific artifact checks.            |
| Real-tool lanes           | Explicit hosted or separately dispatched checks for their named target formats, host and installed tool versions.                                      |
| Documentation             | Generated documentation consistency and the documentation-site build.                                                                                  |

The package matrix is a native-host baseline, not an emulation claim. Tests that require a device, an interactive application, a separately installed analysis engine or another unavailable dependency remain separate. See [testing](testing.md) and the relevant operation's installation requirements before running a real-tool lane.

Read the run's retained artifacts and job logs for exact counts, skipped cases, host identities and failures. Counts from a prior commit are historical evidence. A test double or portable fixture does not establish that an optional external tool worked on the release host.

## Local checks

Use the pinned runtime and install dependencies once:

```bash
npm ci
npm run build:cached
```

For a focused documentation-policy change:

```bash
npm run test:local -- tests/conformance/readmeConsistency.test.ts tests/conformance/releaseConfiguration.test.ts
```

For changed source, use `npm run check:changed`. Use `npm run test:focused -- PATH...` when the selected test requires compiled boundaries. `npm run check:pr` is the complete local deterministic gate; optional real-tool verification remains explicit. See [CONTRIBUTING.md](https://github.com/ForceMind/Tekvro/blob/main/CONTRIBUTING.md) for required checks and [testing](testing.md) for test groups.

Local success gives feedback on the checkout. CI still validates the merged revision and retains the reviewable records used by publication.

## Connection to publication

A successful completed `CI` run can trigger `.github/workflows/tekvro-release.yml` through `workflow_run`. The release script admits only the reviewed GitHub release request and matching canonical `main` revision, builds the four release assets, runs an installation canary on the actual `.tgz`, and checks source identity and checksums before publishing.

`package.json` remains `private: true`; npm and MCP Registry publication stay disabled. The GitHub release record, manifest, tag and workflow run identify the public version. See [releasing](releasing.md) for exact assets, gates and failure handling.

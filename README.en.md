# Tekvro

**Investigate software with evidence.** Tekvro is a locally operated AI-assisted software analysis toolkit with a CLI, MCP server and adapters for JavaScript/Electron, native binaries, web runtime evidence and additional artifact types.

[简体中文](README.md) · [Documentation](docs/index.md) · [Getting started (中文)](docs/zh-CN/quick-start.md) · [Maintenance](PROJECT_MAINTENANCE.md)

> **Development status:** independent private work-in-progress by ForceMind, based on an exact REA 6.1.0 snapshot. The GitHub repository is currently `ForceMind/REA`. Tekvro is **not published** as an npm or MCP Registry package.

## Build from source

Node.js `^22.19.0 || ^24.11.0 || >=26.0.0` and npm are required.

```bash
git clone https://github.com/ForceMind/REA.git
cd REA
git submodule update --init --recursive
npm ci
npm run build:cached
node scripts/rea.mjs --help
node scripts/rea.mjs doctor --json
node scripts/rea.mjs analyze-javascript-application /absolute/path/to/app --json
```

The existing `rea` CLI, internal `rea-agents` npm identity and MCP registration are temporarily retained for compatibility while the new standalone distribution is designed. Do **not** confuse publicly hosted `rea-agents` releases with this private fork.

Configure an agent only after inspecting the plan:

```bash
node scripts/rea.mjs setup --client codex --dry-run --json
TEKVRO_LANG=zh-CN node scripts/rea.mjs setup --client codex
```

## Scope and evidence

The tool helps investigate actual program artifacts, call graphs, formats and selected runtime behavior. It records observations, inferences, limitations and unknowns. Results do not guarantee recovery of original source code or access to server-side implementation. Use it only on targets you are authorized to inspect.

## Attribution

Based on upstream [morluto/rea](https://github.com/morluto/rea), source commit `f6fe575094658e99ced78d45f385633fbfaaae32`. Its MIT license and copyright notice remain in [LICENSE](LICENSE); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Tekvro is not affiliated with the original author.

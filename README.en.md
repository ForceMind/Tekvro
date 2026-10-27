# Tekvro

Tekvro is a locally operated toolkit for investigating software structure and runtime behavior. It brings static analysis, runtime observations, and specialized reverse-engineering tools together through a command-line interface (CLI) and Model Context Protocol (MCP), with traceable evidence at each step.

[简体中文](README.md) · [Documentation](docs/index.md) · [Quick start (Chinese)](docs/zh-CN/quick-start.md) · [Architecture](docs/zh-CN/architecture.md) · [Security](docs/zh-CN/security.md)

## Capabilities

- **JavaScript and Electron:** inspect packaged applications, module relationships, call paths, source maps, and observable application behavior.
- **Browsers and networking:** use local Chrome DevTools Protocol (CDP) endpoints to inspect page scripts, network activity, and selected runtime state.
- **Native binaries:** connect optional analysis engines such as Hopper, Ghidra, and IDA to inspect symbols, instructions, program structure, and decompiler output.
- **Additional artifact types:** analyze supported Android, .NET, firmware, and archive formats, subject to target coverage and configured tools.
- **Evidence and comparisons:** retain observations, inferences, unknowns, and limitations to support reproducible investigations and version comparisons.

The CLI and MCP server expose the same underlying analysis workflows, for direct use or integration with MCP-compatible AI tools such as Codex and Claude Code.

## Quick start

Requirements: Node.js `^22.23.4 || ^24.22.1 || >=26.12.1`, npm, and Git. Optional native analysis engines are configured separately as needed.

```bash
git clone https://github.com/ForceMind/Tekvro.git
cd Tekvro
git submodule update --init --recursive
npm ci
npm run build:cached

# Discover commands and capabilities
node scripts/rea.mjs --help
node scripts/rea.mjs capabilities --json

# Check local readiness
node scripts/rea.mjs doctor --json

# Analyze a local JavaScript / Electron build directory
node scripts/rea.mjs analyze-javascript-application /absolute/path/to/app --json
```

Replace the example path with a local target you are authorized to inspect. Static JavaScript analysis does not require Ghidra, Hopper, or IDA.

See the [quick-start guide](docs/zh-CN/quick-start.md) and [JavaScript / H5 / Electron guide](docs/zh-CN/javascript-h5-electron.md) for additional workflows.

## MCP integration

Inspect the current client configuration and review changes before applying them:

```bash
node scripts/rea.mjs doctor --client codex --json
node scripts/rea.mjs setup --client codex --dry-run --json

# Apply the reviewed setup
node scripts/rea.mjs setup --client codex
```

Setup may update local AI client configuration. Review the proposed changes and backups before proceeding. See the [configuration guide](docs/zh-CN/quick-start.md) for platform and client details.

## Evidence and limitations

Results distinguish **observations**, **inferences**, and **unknowns**, together with their provenance and coverage limitations. Static code evidence does not by itself establish runtime behavior; analyzing a client does not reveal unobserved server-side implementation.

Use the toolkit only with software and environments you are authorized to inspect. Runtime access, file operations, and external provider actions remain subject to their respective tool boundaries.

## Repository layout

- `src/`: domain models, analysis workflows, CLI/MCP interfaces, and providers.
- `bridge/`: integration code for external analysis engines and system tools.
- `tests/`: unit, integration, contract, and boundary tests.
- `scripts/`: build, validation, and development tooling.
- `docs/`: guides, architecture, protocols, and technical references.
- `skill-src/`: AI agent workflow instructions.
- `third_party/`: external dependencies and submodules.

For development and testing, see [CONTRIBUTING.md](CONTRIBUTING.md) and the [testing guide](docs/testing.md).

## Distribution status

Tekvro currently runs **from source**. An independent npm package and MCP Registry entry have not yet been published.

- The source package is named `tekvro`. Existing `rea` and `rea-agents` CLI aliases, as well as selected MCP registration keys, remain for compatibility.
- `scripts/rea.mjs` is the current source entrypoint. The public `rea-agents` npm package is not a Tekvro build; `npx tekvro` is not a supported installation method until an independent release is available.
- The package retains the `6.1.0` compatibility version while main integrates qualified REA `6.8.0` through [PR #28](https://github.com/ForceMind/Tekvro/pull/28). Full qualification and post-merge main CI passed. See `engine-metadata.json` and the [integration record](docs/upstream/rea-6.8.0-integration.md) for source provenance and validation. Neither version denotes an independent published release. See the [roadmap](docs/roadmap.md) and [distribution notes](docs/zh-CN/distribution.md).
- `install.sh` does not perform an automatic download or installation before the independent release.

## License

The project includes code from [REA](https://github.com/morluto/rea) under the MIT License alongside other third-party components. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for applicable licenses and copyright notices.

## Technical references

- [Installation and supported clients](docs/installation.md#supported-agents)
- [MCP Registry](docs/installation.md#mcp-registry)
- [MCP tool catalog](docs/mcp-contracts.md#generated-catalog)

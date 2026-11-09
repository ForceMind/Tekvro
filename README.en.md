# Tekvro

**Investigate software with evidence.**

Tekvro is a local software analysis toolkit for static inspection, runtime observation, and evidence queries through a CLI and MCP server. Inspect application structure, trace code relationships, compare artifacts, and bring reproducible findings into your workflow.

[简体中文](README.md) · [Documentation](docs/index.md) · [Quick start](docs/zh-CN/quick-start.md) · [Download 1.0.0](https://github.com/ForceMind/Tekvro/releases/tag/v1.0.0) · [Report an issue](https://github.com/ForceMind/Tekvro/issues/new/choose)

## Capabilities

- **Application structure:** inspect JavaScript build directories and desktop application packages, including modules, dependencies, call paths, and source maps.
- **Runtime observation:** use local debugging interfaces to inspect scripts, network activity, and selected runtime behavior.
- **Programs and files:** inspect supported native programs, mobile applications, managed programs, databases, and other offline artifacts.
- **Evidence and comparison:** retain provenance, locations, coverage, and limitations; distinguish observations, inferences, and unknowns for later queries and version comparisons.
- **CLI and MCP:** use the same analysis workflows directly or through an MCP-compatible client.

Availability depends on the target format, host system, and configured optional analysis tools. See the [guides](docs/index.md) and run `tekvro capabilities --json` for the relevant scope.

## Installation

Requires Node.js `^22.23.4 || ^24.22.1 || >=26.12.1` and npm. Node.js `24.22.1` is recommended.

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/ForceMind/Tekvro/v1.0.0/install.sh -o install-tekvro.sh
bash install-tekvro.sh --version 1.0.0
```

On Linux, the installer defaults to `$HOME/.local/bin`. If the current shell cannot find the command, run `export PATH="$HOME/.local/bin:$PATH"`. With `--prefix DIR`, add `DIR/bin` instead. The installer prints the actual path without changing shell configuration.

Alternatively, download `tekvro-1.0.0.tgz` from the [release page](https://github.com/ForceMind/Tekvro/releases/tag/v1.0.0), verify it using the [distribution guide](docs/zh-CN/distribution.md), and install the archive:

```bash
npm install --global ./tekvro-1.0.0.tgz
tekvro --version
```

Use the downloaded-archive method on Windows. Version 1.0.0 is distributed through GitHub Release; publishing to the npm registry or an MCP directory is outside this release.

## First analysis

```bash
# Check the local environment and available capabilities
tekvro doctor --json
tekvro capabilities --json

# Analyze a local application build and save structured evidence
tekvro analyze-javascript-application /absolute/path/to/app --json > evidence.json
```

Replace the path with a local directory you are authorized to inspect. Continue with the [quick start](docs/zh-CN/quick-start.md) and [application analysis guide](docs/zh-CN/javascript-h5-electron.md).

## MCP configuration

Review the configuration plan, then apply the selected client settings:

```bash
tekvro setup --dry-run
tekvro setup
```

The separate `setup` step manages client configuration. Review its proposed changes and backup information, then reconnect the client. Set `TEKVRO_LANG=zh-CN` for Chinese help; command names, JSON fields, and the MCP protocol remain unchanged.

[Configuration adapters](docs/installation.md#supported-agents) · [Distribution channel status](docs/installation.md#mcp-registry) · [Generated MCP catalog](docs/mcp-contracts.md#generated-catalog)

## Support and contribution

CLI and MCP entrypoints are available for Windows, macOS, and Linux. Individual capabilities have their own system dependencies and verification scope; see the [documentation](docs/index.md). Results report unsupported or unobserved facets. Inspecting a client artifact does not establish unobserved server-side behavior.

- Usage and defects: [issue templates](https://github.com/ForceMind/Tekvro/issues/new/choose)
- Development: [contributing](CONTRIBUTING.md) · [testing](docs/testing.md)
- Security: [vulnerability reporting](SECURITY.md)
- Versions: [releases](https://github.com/ForceMind/Tekvro/releases) · [updates](docs/zh-CN/distribution.md)
- Product direction: [roadmap](docs/roadmap.md) · [project workflow implementation plan](docs/project-workflow-plan.md) (planned capabilities, not yet implemented)

## License

Tekvro is licensed under [MIT](LICENSE). Component copyright and license notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

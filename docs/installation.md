# Installation and setup

Tekvro 1.0.0 is distributed through this repository's [GitHub Releases](https://github.com/ForceMind/Tekvro/releases). Install the versioned CLI package, then configure only the integrations you want to use.

## Requirements

The CLI requires Node.js `^22.23.4 || ^24.22.1 || >=26.12.1` and npm. Development uses Node.js `24.22.1` and npm `11.16.0`, as recorded in `.nvmrc` and `package.json`.

Some workflows have additional host prerequisites:

| Workflow                      | Prerequisite                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| Supervised processes on Linux | A procps-compatible `ps` on `PATH`; see the [process prerequisite](#linux-owned-process-prerequisite) |
| Supervised processes on macOS | Apple Swift compilation tools, normally supplied by Xcode Command Line Tools                          |
| Native analysis               | A configured analysis engine and its host-specific dependencies                                       |
| Browser observation           | An explicitly selected local debugging endpoint and permitted origin scope                            |
| Device operations             | A supported, authorized device and the corresponding toolchain                                        |

Installation does not install or upgrade the runtime, system package managers, Java, external engines, or device tools. Use `tekvro doctor --json` to inspect the current machine and follow the relevant diagnostics.

## Install the release

For macOS and Linux, download the versioned installer and inspect it before running:

```bash
curl -fsSL https://raw.githubusercontent.com/ForceMind/Tekvro/v1.0.0/install.sh -o install-tekvro.sh
bash install-tekvro.sh --version 1.0.0
tekvro --help
tekvro doctor --json
```

The installer selects the release asset and validates its checksum before installing the CLI. It leaves client configuration to a separate setup step.

On Linux, the default command directory is `$HOME/.local/bin`. If it is absent from the current shell's `PATH`, run `export PATH="$HOME/.local/bin:$PATH"` before invoking Tekvro. A custom `--prefix DIR` uses `DIR/bin`; on macOS, follow the installer output for the selected npm prefix. The installer does not edit shell configuration.

### Install a downloaded package

Download `tekvro-1.0.0.tgz` and `SHA256SUMS` from the same [versioned release](https://github.com/ForceMind/Tekvro/releases/tag/v1.0.0). Compute the package's SHA-256 and compare it with the line for that exact filename in `SHA256SUMS`:

| Platform           | Checksum command                                    |
| ------------------ | --------------------------------------------------- |
| Linux              | `sha256sum tekvro-1.0.0.tgz`                        |
| macOS              | `shasum -a 256 tekvro-1.0.0.tgz`                    |
| Windows PowerShell | `Get-FileHash .\tekvro-1.0.0.tgz -Algorithm SHA256` |

After the digest matches, install the local file:

```bash
npm install --global ./tekvro-1.0.0.tgz
tekvro --version --json
tekvro capabilities --json
```

On Windows, `npm.cmd` and `tekvro.cmd` can be used when PowerShell does not permit the generated script shim. Keep the downloaded package and its release record when you need to reproduce an installation.

Checksums establish agreement with the release manifest. The release tag, source revision and workflow record identify the build that produced those assets.

## Build and start

Contributors can build a versioned source checkout:

```bash
git clone --branch v1.0.0 https://github.com/ForceMind/Tekvro.git
cd Tekvro
git submodule update --init --recursive
npm ci
npm run build:cached
node scripts/rea.mjs --help
node scripts/rea.mjs doctor --json
```

The release also includes `tekvro-1.0.0-source.tar.gz` with the source and required submodule contents. A source archive is for building and development; the CLI `.tgz` includes the compiled runtime for installation.

Use `node /absolute/path/to/Tekvro/scripts/rea.mjs` to select a particular checkout. After a source build, `npm link` can expose its `tekvro` command locally. Prefer a release package for a stable installation and a checkout for development.

## Start setup

Static CLI analysis works without an MCP client registration. To configure an integration, inspect the current state and proposed changes first:

```bash
tekvro doctor --client codex --json
tekvro setup --client codex --dry-run --json
tekvro setup --client codex
```

Substitute the client ID from the [supported list](#supported-agents). Setup shows the selected configuration paths, workflow files and optional engine actions before applying changes. Review the plan and approve the intended scope. Use repeatable `--client` flags for several selected clients, or explicitly choose `--all-detected` when every detected integration is intended.

Setup writes a local executable registration, preserves unrelated configuration, and creates recovery backups for changed files. Reconnect the client after changing its registration. A successful doctor report checks files and prerequisites; inspect the live client's tool list to confirm that the current session connected.

### Manual MCP configuration

A client that accepts a JSON MCP server map can launch the installed CLI directly. Replace the executable path with the absolute path on that client's machine:

```json
{
  "mcpServers": {
    "tekvro": {
      "command": "/absolute/path/to/tekvro",
      "args": ["mcp"]
    }
  }
}
```

For a source checkout, use an explicit Node.js executable and script path:

```json
{
  "mcpServers": {
    "tekvro": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/Tekvro/scripts/rea.mjs", "mcp"]
    }
  }
}
```

Manual server names and settings belong to the client. Automatic setup and doctor inspect their managed registration format; they do not claim arbitrary manually named entries. Use [client configuration](client-configuration.md) for the exact file format, paths, startup timeout and policy options of each integration.

## Supported agents

The following names identify client-specific configuration adapters. Configuration-file support does not by itself establish a live connection in every client version.

| Client             | `--client` value |
| ------------------ | ---------------- |
| Claude Code        | `claude_code`    |
| Claude Desktop     | `claude_desktop` |
| Codex              | `codex`          |
| Cursor             | `cursor`         |
| Gemini CLI         | `gemini_cli`     |
| Windsurf           | `windsurf`       |
| Devin              | `devin`          |
| OpenCode           | `opencode`       |
| Antigravity        | `antigravity`    |
| GitHub Copilot CLI | `copilot_cli`    |
| Command Code       | `commandcode`    |
| Qwen Code          | `qwen_code`      |
| Kimi Code          | `kimi`           |
| VS Code            | `vscode`         |
| Trae               | `trae`           |
| WorkBuddy          | `workbuddy`      |
| Grok Build         | `grok_build`     |
| OMP                | `omp`            |
| Pi                 | `pi`             |
| Hermes             | `hermes`         |
| Qoder              | `qoder`          |
| Factory Droid      | `droid`          |
| ZCode              | `zcode`          |
| DeepSeek Harness   | `dsh`            |
| FreeBuff           | `freebuff`       |

Grok Bot (`grok_bot`) is detected for guidance but uses a manual hosted connector. It does not load a local stdio registration from this machine. See [client-specific settings](client-configuration.md#other-client-settings).

## Review setup changes

Client selection, engine setup and bundled workflow installation are separate choices. Optional engine installation requires its own approval. `--skill=false` omits the bundled workflow; `--dry-run` reports the plan without applying it.

Configuration writes preserve unrelated entries and comments where the client format supports them, stage changes, retain backups and verify the result. Malformed configuration or an unsafe destination blocks the affected transaction before publication. Setup reports recovery paths when verification or cleanup cannot complete.

Quit clients before changing their configuration. Identity checks can detect many replacements and concurrent edits, but do not lock arbitrary external writers out of the same files. Retain the reported backups until the updated integration has been tested.

### Skill destinations

The bundled workflow is installed in each selected client's supported personal skill directory. A skill-only selection can use `~/.agents/skills`; existing unrelated copies are retained. See [client configuration](client-configuration.md) for profiles and destination overrides.

```bash
tekvro setup --skill=true
tekvro doctor --skill --json
```

Skill installation provides instructions and references. It does not grant filesystem, runtime or network authority, start a server, or install optional engines. Use the actual connected server's tool list and input schemas when composing an investigation.

## Limit Tekvro to one project or agent profile

Client registration controls which sessions discover the MCP server. Use a client-supported project configuration or separate profile when tools should be available only in that context; see [client configuration](client-configuration.md).

This is an integration scope, not an operating-system isolation boundary. A process under the same account may still invoke a CLI on `PATH` or read files allowed by that account. Use a suitable isolated environment when handling untrusted software or separating investigations.

## Check readiness for your task

`tekvro doctor --json` is read-only. Its default audit covers detected integrations and optional engines, so the overall result can be unhealthy while a particular static workflow remains usable.

| Task                                       | Focused check                                       |
| ------------------------------------------ | --------------------------------------------------- |
| Static JavaScript or application directory | `tekvro analyze-javascript-application PATH --json` |
| One engine                                 | `tekvro doctor --provider ghidra --json`            |
| One client registration                    | `tekvro doctor --client codex --json`               |
| Bundled workflow instructions              | `tekvro doctor --skill --json`                      |

An explicit scope controls the report's `healthy` value and exit status. Other checks remain informational. Follow the diagnostic for the selected operation; a missing optional provider does not establish failure of an unrelated file-analysis capability.

### Linux owned-process prerequisite

The shared process supervisor requires a procps-compatible `ps` on `PATH` before launching a supervised child. Static JavaScript analysis and optional engines use these ownership checks. A minimal or BusyBox-only `ps` may not provide the required fields.

Install the appropriate `procps` or `procps-ng` package through your system's normal administration workflow when needed. A missing or incompatible prerequisite is reported before the supervised child starts. Depending on the caller, the public failure can be `capability_unavailable`, `provider_unavailable` or `execution_failure`.

## Released package and main

A release contains one versioned, checked source revision and its build assets. `main` is the development branch and may contain changes outside that release. Use the release tag and accompanying validation record when evaluating the capabilities of an installed package.

The 1.0.0 distribution consists of the CLI `.tgz`, complete source archive, `SHA256SUMS` and `release-manifest.json`. This release does not publish an npm registry package or MCP Registry listing. npm installs the downloaded local package and its dependencies; it is not being used to resolve a product package from a registry.

Capabilities depend on target format, host, configured tools and the actual workflow. Package startup, protocol tests and real engine execution establish different scopes. Consult [testing](testing.md) and the selected provider guide for the applicable boundary.

## Diagnose, update, and remove

Start diagnosis with the installed version, command and a scoped doctor report:

```bash
tekvro --version --json
tekvro doctor --json
```

For an upgrade, download and validate the desired version's release package, then install that local `.tgz` with npm. The current `tekvro update` command refuses automatic registry updates for this distribution. Source checkouts are updated through Git and rebuilt with `npm ci` and `npm run build:cached`.

To remove managed client configuration and workflow files, preview the intended scope in the command help, then run the appropriate uninstall command:

```bash
tekvro uninstall --help
tekvro uninstall
```

Uninstall preserves target programs, external engines, Evidence, captures and unrelated configuration. `--purge-data` additionally selects owned cache and state paths; it retains paths whose ownership cannot be established. Review reported recovery paths and retained files.

Remove the globally installed CLI separately when that is also intended:

```bash
npm uninstall --global tekvro
```

If a package is incomplete, retain its version, checksum result and the exact missing-file diagnostic. Reinstall from the checked release asset. Do not rename runtime files or disable security software to hide a missing dependency.

## Hopper

Hopper is an optional analysis engine with its own license. Configure an existing installation or explicitly choose its separately approved setup action. Tekvro's CLI installation does not install it, and removing Tekvro does not remove it.

```bash
tekvro doctor --provider hopper --json
```

When a launcher is not detected, select the actual executable path through `HOPPER_LAUNCHER_PATH`. Real-provider checks and runtime diagnostics are described in [client verification](client-verification.md). Host availability and vendor limitations apply independently of CLI package availability.

## Ghidra

Ghidra is a bring-your-own optional engine. The adapter accepts a suitable 12.1.x installation and its declared full JDK requirement; the recorded Linux x64 verification uses Ghidra 12.1.4 and JDK 21. The installation must contain a native decompiler matching the host architecture.

The implementation has Linux and macOS host paths and an experimental Windows x64 P0 boundary. That Windows boundary is read-only and limited to its admitted native x86/x86-64 PE targets; it does not grant mutation authority or establish all Windows target formats. A build or package check is not a substitute for a real provider run on the chosen host.

```bash
export GHIDRA_INSTALL_DIR=/absolute/path/to/ghidra
export JAVA_HOME=/absolute/path/to/jdk
tekvro doctor --provider ghidra --json
tekvro analyze /absolute/path/to/program --provider ghidra --json
```

Tekvro checks the configured installation and does not install Java, compile native decompilers or change operating-system quarantine settings. See [the provider guide](ghidra-provider.md) and [Windows P0 scope](windows-ghidra-p0.md) for capability-specific requirements.

### Missing macOS native decompiler

The configured engine must include its host's native decompiler in the expected installation directory. Follow that engine's build instructions when the component is absent, then repeat the scoped doctor check. The analysis CLI does not construct or download the missing component.

### macOS arm64 native decompiler

Use a native arm64 installation and its matching JDK and decompiler. Do not treat an x64 package check or another host's successful analysis as arm64 provider qualification. Inspect the selected executable and diagnostic before changing a tool path.

### Ghidra import language and analysis seeds

The default language is selected from the target header. Explicit overrides use the existing configuration names:

```bash
export REA_GHIDRA_LANGUAGE_ID="x86:LE:32:default"
export REA_GHIDRA_COMPILER_SPEC_ID="borlandcpp"
```

A compiler specification requires its language identifier. The selected pair is checked against the installation's language definitions and recorded in the analysis profile. DOS import workflows reject unsupported overrides.

An explicit seed file can provide entries for code that analysis cannot reach:

```bash
export REA_GHIDRA_SEED_FILE=/absolute/path/to/seeds.tsv
```

Each line is `address<TAB>kind[<TAB>name]`, where `kind` is `function`, `code` or `label`; a label needs a name. Addresses use the accepted hexadecimal address form. Seed identity is recorded in the analysis profile; invalid or conflicting seeds remain failures rather than invented analysis results.

These environment-variable spellings are stable configuration keys. See [provider selection and profile semantics](ghidra-provider.md) for the exact target and seed boundaries.

### Ghidra heap and CPU controls

Set resource controls in the environment that launches the CLI or MCP server. Heap selection uses the first nonempty value of `GHIDRA_HEADLESS_MAXMEM`, then `GHIDRA_MAXMEM`, then `2G`. Use JVM heap-size text such as `512M` or `2G`; an invalid value fails Java startup. The heap limit does not bound total process-family memory. Changing an unrelated terminal's environment does not reconfigure a running server.

The launcher constrains selected JVM GC and compiler thread pools; it does not expose a general Ghidra CPU limit. When a target requires a CPU budget, apply the host's affinity or scheduling controls and inspect the owned JVM's effective arguments and observed resource use. Resource settings bound a run; they do not guarantee completion for every target.

Separate startup, command, memory and result-transport constraints can fail at different stages. Preserve the original error and its observations when diagnosing a timeout or resource refusal.

### Ghidra diagnostics and verification

```bash
tekvro doctor --provider ghidra --json
tekvro analyze /absolute/path/to/program --provider ghidra --json
```

A healthy prerequisite check establishes readiness checks, not successful analysis of every target. Analysis limitations, partial facts, diagnostics and cleanup outcomes remain part of the result. Reproduction commands and real-tool lanes are listed in [testing](testing.md).

## MCP Registry

This release provides a local stdio MCP server under the product identity `io.github.forcemind/tekvro`. It does not publish a Registry entry. Configure the installed local executable or a selected source checkout using [setup](#start-setup) or [manual configuration](#manual-mcp-configuration).

A refreshed installation does not replace a server already running in a client. Reconnect after configuration changes and inspect that session's actual advertised tools.

## Package runners and global installation

Use the checked GitHub release `.tgz` for a global installation. Registry package-runner commands are not an installation method for this release. The installed `tekvro` executable and the explicit Node.js source entrypoint are supported launch paths.

### Global installation wrapper

The versioned `install.sh` is the macOS/Linux convenience path for obtaining and verifying the release package. Windows uses the downloaded `.tgz` and npm. Client setup is a separate, reviewed operation on every platform.

## Further help

- [CLI reference](cli.md)
- [Client configuration and troubleshooting](client-configuration.md)
- [Feature and platform verification](testing.md)
- [Support](https://github.com/ForceMind/Tekvro/blob/main/SUPPORT.md)
- [Security reporting](https://github.com/ForceMind/Tekvro/blob/main/SECURITY.md)

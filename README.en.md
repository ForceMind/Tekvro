# Tekvro

**Understand software through evidence.** A Chinese-first, local-only software inspection toolkit created independently for ForceMind.

> **v0.1.0 foundation:** newly written code, not a renamed third-party reverse-engineering product. It currently provides metadata inspection and a read-only MCP interface. Decompilation, source restoration and a visual desktop workbench are future goals, not existing features.

## Requirements

Node.js 22+; no runtime dependencies.

```bash
npm test
node bin/tekvro.mjs doctor --json
node bin/tekvro.mjs scan . --json
node bin/tekvro.mjs inspect package.json --json
node bin/tekvro.mjs strings package.json --limit 10 --json
```

The default authorization root for CLI commands is the current directory. Override with `--root /absolute/path` or `TEKVRO_ROOT`. For the MCP stdio server, `TEKVRO_ROOT` or an explicit `--root` is required. Neither the CLI nor the server executes target files or makes outgoing network requests.

Supported analysis: directory metadata, binary magic signatures, SHA-256 hashes, explicit printable-ASCII extraction (up to 1 MiB) and basic MCP read-only tools. Every target is limited to the authorized root; external symlinks are blocked.

See [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md) and [security](docs/SECURITY.md).

**Ownership:** ForceMind original implementation. Private and unpublished; `UNLICENSED`, all rights reserved. The current repository path is temporarily `ForceMind/REA`; a brand-new repository is preferable for a history-free release.

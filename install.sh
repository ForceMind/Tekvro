#!/bin/bash
{
# Keep the complete installer inside one brace group. A truncated download must
# fail parsing before it can inspect the environment, download, or install.
set -euo pipefail

PACKAGE="tekvro"
REPOSITORY="ForceMind/Tekvro"
version="${TEKVRO_VERSION-1.0.0}"
prefix=""
prefix_requested=false
dry_run=false
start_setup=false
verbose=false
numeric_identifier='(0|[1-9][0-9]*)'
prerelease_identifier="(${numeric_identifier}|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)"
version_pattern="${numeric_identifier}\\.${numeric_identifier}\\.${numeric_identifier}(-${prerelease_identifier}(\\.${prerelease_identifier})*)?"

fail() {
  printf 'Tekvro installation failed: %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'HELP'
Usage: install.sh [--version VERSION] [--prefix DIRECTORY] [--dry-run] [--setup] [--verbose]

Install a checksum-verified Tekvro GitHub Release archive using the existing
Node.js and npm. The default version is 1.0.0; TEKVRO_VERSION can select another
exact release. This installer does not install or upgrade runtime or analysis tools.

  --version VERSION   Exact release version, without a leading v or build metadata.
  --prefix DIRECTORY  npm global installation prefix; Linux defaults to ~/.local.
  --dry-run           Show the plan without network requests or file changes.
  --setup             Start interactive configuration after a successful install.
  --no-setup          Keep configuration unchanged (the default).
  --no-prompt         Alias for --no-setup.
  --verbose           Show commands while downloading and installing.
  --help              Show this help without requiring Node.js or npm.
HELP
}

matches() {
  # This constant expression keeps an incomplete [[ condition from becoming a
  # successful truncated script. Both operands are expanded as data.
  eval '[[ "$1" =~ $2 ]]'
}

main() {
  while (($# > 0)); do
    case "$1" in
      --version|--prefix)
        (($# >= 2)) || fail "$1 requires a value."
        if [ "$1" = "--version" ]; then version="$2"; else prefix="$2"; prefix_requested=true; fi
        shift 2
        ;;
      --version=*) version="${1#--version=}"; shift ;;
      --prefix=*) prefix="${1#--prefix=}"; prefix_requested=true; shift ;;
      --dry-run) dry_run=true; shift ;;
      --setup) start_setup=true; shift ;;
      --no-setup|--no-prompt) start_setup=false; shift ;;
      --verbose) verbose=true; shift ;;
      --help|-h) usage; exit 0 ;;
      *) fail "unknown option: $1" ;;
    esac
  done
  matches "$version" "^${version_pattern}$" || fail "version must be an exact semantic version without build metadata."
  if [ "$prefix_requested" = true ]; then
    case "$prefix" in /*) ;; *) fail "--prefix must be a nonempty absolute directory path." ;; esac
  fi

  platform="$(uname -s)"
  architecture="$(uname -m)"
  case "$platform/$architecture" in
    Linux/x86_64|Linux/aarch64|Linux/arm64|Darwin/x86_64|Darwin/arm64) ;;
    *) fail "this installer supports Linux and macOS on x64 or arm64; use the release archive instructions for other platforms." ;;
  esac
  command -v node >/dev/null 2>&1 || fail "Node.js ^22.23.4, ^24.22.1 or >=26.12.1 is required. Install a supported runtime, then retry."
  node_version="$(node -p 'process.versions.node' 2>/dev/null)" || fail "the active Node.js version could not be read. Check that node works and is on PATH, then retry."
  matches "$node_version" "^${numeric_identifier}\\.${numeric_identifier}\\.${numeric_identifier}$" || fail "the active Node.js version is not a stable semantic version."
  node_major="${BASH_REMATCH[1]}"; node_minor="${BASH_REMATCH[2]}"; node_patch="${BASH_REMATCH[3]}"
  if ! ((node_major == 22 && (node_minor > 23 || node_minor == 23 && node_patch >= 4) || node_major == 24 && (node_minor > 22 || node_minor == 22 && node_patch >= 1) || node_major == 26 && (node_minor > 12 || node_minor == 12 && node_patch >= 1) || node_major > 26)); then
    fail "Node.js $node_version is unsupported. Tekvro requires ^22.23.4, ^24.22.1 or >=26.12.1; install a supported runtime, then retry."
  fi
  command -v npm >/dev/null 2>&1 || fail "npm is required; install it with Node.js and retry."
  if [ "$prefix_requested" = false ] && [ "$platform" = "Linux" ]; then prefix="$HOME/.local"; fi

  archive_name="$PACKAGE-$version.tgz"
  release_url="https://github.com/$REPOSITORY/releases/download/v$version"
  printf 'Tekvro install plan\n'
  printf '  Version: %s\n  Runtime: Node.js %s\n' "$version" "$node_version"
  printf '  Archive: %s/%s\n  Checksums: %s/SHA256SUMS\n' "$release_url" "$archive_name" "$release_url"
  printf '  Prefix: %s\n' "${prefix:-npm global prefix}"
  printf '  Setup: %s\n' "$([ "$start_setup" = true ] && printf 'explicitly requested; interactive terminal required' || printf 'not requested')"
  if [ "$dry_run" = true ]; then
    printf 'Dry run complete; no network requests or file changes made.\n'
    exit 0
  fi

  command -v curl >/dev/null 2>&1 || fail "curl is required. Install curl, then rerun this installer."
  command -v tar >/dev/null 2>&1 || fail "tar is required to inspect the verified release archive."
  if [ "$verbose" = true ]; then set -x; fi
  umask 077
  temporary="$(mktemp -d "${TMPDIR:-/tmp}/tekvro-install.XXXXXXXX")" || fail "a private temporary directory could not be created."
  trap 'rm -rf -- "$temporary"' EXIT
  archive="$temporary/$archive_name"
  checksums="$temporary/SHA256SUMS"
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 --retry 3 "$release_url/SHA256SUMS" --output "$checksums" || fail "release checksums could not be downloaded. Check the selected GitHub Release and retry."
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 --retry 3 "$release_url/$archive_name" --output "$archive" || fail "the release archive could not be downloaded. Check the selected GitHub Release and retry."
  if ! node --input-type=module - "$checksums" "$archive" "$archive_name" <<'VERIFY_CHECKSUM'
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
try {
  const [checksums, archive, filename] = process.argv.slice(2);
  const matches = [];
  for (const line of readFileSync(checksums, "utf8").split(/\r?\n/u)) {
    if (line === "") continue;
    const parsed = /^([a-fA-F0-9]{64}) [ *](.+)$/u.exec(line);
    if (parsed === null) throw new Error("SHA256SUMS contains a malformed entry");
    if (parsed[2] === filename) matches.push(parsed[1].toLowerCase());
  }
  if (matches.length !== 1) throw new Error("SHA256SUMS must contain exactly one entry for the selected archive");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  if (hash.digest("hex") !== matches[0]) throw new Error("release archive checksum mismatch");
} catch (error) {
  console.error(error instanceof Error ? error.message : "release checksum verification failed");
  process.exitCode = 1;
}
VERIFY_CHECKSUM
  then
    fail "release checksum verification failed; npm was not run."
  fi
  tar -tzf "$archive" > "$temporary/entries" || fail "the verified archive could not be inspected; npm was not run."
  tar -xOzf "$archive" package/package.json > "$temporary/package.json" || fail "the verified archive has no package metadata; npm was not run."
  if ! node --input-type=module - "$temporary/package.json" "$temporary/entries" "$version" <<'VERIFY_PACKAGE'
import { readFileSync } from "node:fs";
try {
  const [metadata, listing, version] = process.argv.slice(2);
  const pkg = JSON.parse(readFileSync(metadata, "utf8"));
  if (pkg.name !== "tekvro" || pkg.version !== version || pkg.bin?.tekvro !== "scripts/rea.mjs")
    throw new Error("release package identity or CLI entry does not match the selected Tekvro version");
  const entries = readFileSync(listing, "utf8").split(/\r?\n/u);
  for (const path of ["scripts/rea.mjs", "scripts/lib/cli-process-environment.mjs", "dist/main.js", "dist/mcp/main.js", "dist/cli.js", "dist/cliOutput.js", "dist/cli-runtime/cli.js", "dist/cli-runtime/cliOutput.js", "dist/cli-runtime/cliBuiltinArguments.js", "dist/cli-runtime/cliResultOutput.js", "dist/cli-runtime/mcpDoctor.js", "dist/mcpDoctor.js", "LICENSE", "THIRD_PARTY_NOTICES.md"])
    if (entries.filter((entry) => entry === `package/${path}`).length !== 1)
      throw new Error(`release archive must contain exactly one built entry: ${path}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "release package verification failed");
  process.exitCode = 1;
}
VERIFY_PACKAGE
  then
    fail "release package verification failed; npm was not run."
  fi

  install_args=(install --global)
  if [ -n "$prefix" ]; then install_args+=(--prefix "$prefix"); else prefix="$(npm prefix --global)" || fail "the npm global prefix could not be read. Set --prefix explicitly or repair npm configuration, then retry."; fi
  case "$prefix" in /*) ;; *) fail "npm returned an invalid global prefix. Set --prefix to an absolute directory, then retry." ;; esac
  install_bin="$prefix/bin/tekvro"
  install_args+=("$archive")
  printf '  Command:'; printf ' %q' npm "${install_args[@]}"; printf '\n'
  npm "${install_args[@]}" || fail "npm could not install the verified local archive. Check the installation prefix permissions, then retry; sudo was not used."
  [ -x "$install_bin" ] || fail "npm completed without installing the tekvro command. Check the npm global bin directory and PATH, then retry."
  installed_version="$("$install_bin" --version 2>/dev/null)" || fail "the installed Tekvro version could not be read. Reinstall the requested version, then retry."
  [ -n "$installed_version" ] || fail "the installed Tekvro version could not be read. Reinstall the requested version, then retry."
  [ "$installed_version" = "$version" ] || fail "installed version $installed_version does not match $version. Reinstall the requested version, then retry."
  printf 'Tekvro %s is installed.\n' "$version"
  if [ "$start_setup" = true ] && [ -t 0 ] && [ -t 1 ] && [ -t 2 ]; then
    "$install_bin" setup
  else
    printf 'Run %q setup to configure Tekvro when ready.\n' "$install_bin"
  fi
}

main "$@"
exit $?
}

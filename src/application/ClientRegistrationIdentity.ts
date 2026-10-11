import { basename, isAbsolute, resolve } from "node:path";
import { valid } from "semver";

import { PRODUCT_IDENTITY } from "../identity.js";

/**
 * Resolve the actual local Tekvro command in this source distribution.
 * The launcher must not resolve to a similarly named public npm package.
 */
export const localRegistrationCommand = (
  entrypoint: string = process.argv[1] ?? PRODUCT_IDENTITY.cliBinary,
): readonly string[] => [process.execPath, resolve(entrypoint), "mcp"];

/** Serialize the current local MCP command for a shell-aware CLI registerer. */
export const localRegistrationCommandText = (entrypoint?: string): string =>
  localRegistrationCommand(entrypoint)
    .map((part) => (/\s|"/u.test(part) ? JSON.stringify(part) : part))
    .join(" ");

/** Resolve a pinned npx launcher only for explicitly requested compatibility. */
export const npxRegistrationCommand = (
  platform: NodeJS.Platform = process.platform,
): readonly string[] => {
  const command = [
    "npx",
    "-y",
    PRODUCT_IDENTITY.registrationPackageSpecifier,
    "mcp",
  ];
  return platform === "win32" ? ["cmd.exe", "/d", "/c", ...command] : command;
};

const unwrapNpxCommand = (command: readonly string[]): readonly string[] => {
  const executable = command[0]?.toLowerCase();
  if (executable !== "cmd" && executable !== "cmd.exe") return command;
  if (command[1]?.toLowerCase() === "/c") return command.slice(2);
  if (command[1]?.toLowerCase() === "/d" && command[2]?.toLowerCase() === "/c")
    return command.slice(3);
  return [];
};

/** Identify the current Tekvro launcher and supported pre-rename registrations. */
export const isOwnedClientRegistrationCommand = (
  command: readonly string[],
  currentCommandPath: string = resolve(process.argv[1] ?? "unknown"),
): boolean => {
  if (
    command.length === 3 &&
    command[2] === "mcp" &&
    resolve(command[0] ?? "") === resolve(process.execPath) &&
    resolve(command[1] ?? "") === currentCommandPath
  )
    return true;

  if (command.length === 2 && command[1] === "mcp") {
    const executable = command[0] ?? "";
    if (
      executable === PRODUCT_IDENTITY.cliBinary ||
      executable === "tekvro" ||
      (isAbsolute(executable) &&
        ["tekvro", PRODUCT_IDENTITY.cliBinary].includes(basename(executable))) ||
      resolve(executable) === currentCommandPath
    )
      return true;
  }

  const npxCommand = unwrapNpxCommand(command);
  if (
    npxCommand.length !== 4 ||
    npxCommand[0] !== "npx" ||
    npxCommand[1] !== "-y" ||
    npxCommand[3] !== "mcp"
  )
    return false;

  const packageReference = npxCommand[2] ?? "";
  if (
    packageReference === PRODUCT_IDENTITY.packageName ||
    packageReference === PRODUCT_IDENTITY.packageSpecifier ||
    packageReference === PRODUCT_IDENTITY.registrationPackageSpecifier
  )
    return true;
  // Previously configured clients may still point to the published
  // rea-agents package. Recognize this exact legacy identity for migration
  // and uninstall, but never create a new upstream registration by default.
  const versions = [PRODUCT_IDENTITY.packageName, "rea-agents"];
  return versions.some((name) => {
    if (packageReference === name || packageReference === `${name}@latest`)
      return true;
    const prefix = `${name}@`;
    return (
      packageReference.startsWith(prefix) &&
      valid(packageReference.slice(prefix.length)) !== null
    );
  });
};

import { resolve } from "node:path";

import { expect, it } from "vitest";
import { PRODUCT_IDENTITY } from "../identity.js";
import {
  isOwnedClientRegistrationCommand,
  localRegistrationCommand,
  localRegistrationCommandText,
  npxRegistrationCommand,
} from "./ClientRegistrationIdentity.js";
import { setupRegistrationCommand } from "./SetupHost.js";

it("uses the local Node executable for MCP registration, never npx", () => {
  const target = "/tmp/Tekvro Source/scripts/rea.mjs";
  const expected = [process.execPath, resolve(target), "mcp"];
  expect(localRegistrationCommand(target)).toEqual(expected);
  expect(localRegistrationCommandText(target)).toContain(
    JSON.stringify(resolve(target)),
  );
  expect(localRegistrationCommandText(target)).not.toContain("npx");
  expect(localRegistrationCommandText(target)).not.toContain("rea-agents@");
});

it("keeps Tekvro's private source distribution distinct from upstream npm", () => {
  expect(PRODUCT_IDENTITY.privateSourceBuild).toBe(true);
});

it.each(["win32", "linux", "darwin"] as const)(
  "defaults to the local Node CLI on %s rather than fetching a public package",
  (platform) => {
    const expected = [
      process.execPath,
      resolve(process.argv[1] ?? PRODUCT_IDENTITY.cliBinary),
      "mcp",
    ];
    expect(setupRegistrationCommand(platform)).toEqual(expected);
    expect(setupRegistrationCommand(platform, false)).toEqual(expected);
    expect(expected.join(" ")).not.toContain("npx");
  },
);

it("uses a Windows executable for npm-run setup and preserves POSIX launchers", () => {
  expect(setupRegistrationCommand("win32", true)).toEqual([
    "cmd.exe",
    "/d",
    "/c",
    "npx",
    "-y",
    PRODUCT_IDENTITY.registrationPackageSpecifier,
    "mcp",
  ]);
  for (const platform of ["linux", "darwin"] as const)
    expect(setupRegistrationCommand(platform, true)).toEqual([
      "npx",
      "-y",
      PRODUCT_IDENTITY.registrationPackageSpecifier,
      "mcp",
    ]);
});

it.each(
  [
    npxRegistrationCommand("win32"),
    ["cmd", "/c", "npx", "-y", "rea-agents@5.0.0", "mcp"],
    ["npx", "-y", "rea-agents@5.0.0", "mcp"],
  ].map((command) => ({ command })),
)("recognizes owned current and legacy launchers: $command", ({ command }) => {
  expect(isOwnedClientRegistrationCommand(command)).toBe(true);
});

it.each(
  [
    ["cmd.exe", "/d", "/c", "node", "custom.js", "mcp"],
    ["cmd.exe", "/k", "npx", "-y", "rea-agents@5.0.0", "mcp"],
    ["cmd.exe", "/c", "npx -y rea-agents@5.0.0 mcp"],
    ["cmd.exe", "/c", "npx", "-y", "another-package", "mcp"],
    ["cmd.exe", "/c", "npx", "-y", "rea-agents@5.0.0", "mcp", "&", "other"],
    ["cmd.exe", "/c", "npx", "-y", "rea-agents@5.0.0 & other", "mcp"],
  ].map((command) => ({ command })),
)(
  "does not claim custom shell commands as REA-owned: $command",
  ({ command }) => {
    expect(isOwnedClientRegistrationCommand(command)).toBe(false);
  },
);

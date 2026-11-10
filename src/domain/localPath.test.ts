import { isAbsolute, posix, win32 } from "node:path";

import { expect, it } from "vitest";

import {
  CROSS_PLATFORM_ABSOLUTE_PATH_PATTERN,
  absoluteLocalPathStringSchema,
} from "./localPath.js";

const pathSpellings = [
  "/absolute/path",
  "/",
  "/工作/input.bin",
  "relative/path",
  "C:\\absolute\\path",
  "D:\\工作\\input.bin",
  "c:/absolute/path",
  "C:relative/path",
  "C:",
  "\\\\server\\share\\path",
  "\\rooted\\path",
  "//server/share/path",
  "file:///absolute/path",
  "",
];

it("matches the host path module for absolute local paths", () => {
  for (const path of pathSpellings) {
    expect(absoluteLocalPathStringSchema.safeParse(path).success).toBe(
      isAbsolute(path),
    );
  }
  expect(absoluteLocalPathStringSchema.safeParse("").success).toBe(false);
  expect(
    absoluteLocalPathStringSchema.safeParse("/absolute/with\0nul").success,
  ).toBe(false);
});

it.each([
  { name: "unflagged", flags: "" },
  { name: "Unicode", flags: "u" },
  { name: "Unicode sets", flags: "v" },
])("preserves cross-host absolute spellings in $name mode", ({ flags }) => {
  const pattern = new RegExp(
    CROSS_PLATFORM_ABSOLUTE_PATH_PATTERN.source,
    flags,
  );
  for (const path of pathSpellings)
    expect(pattern.test(path), JSON.stringify(path)).toBe(
      posix.isAbsolute(path) || win32.isAbsolute(path),
    );
});

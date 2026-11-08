import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { spawn as spawnPty } from "@lydell/node-pty";
import { describe, expect, it } from "vitest";

import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

const execFileAsync = promisify(execFile);
const INSTALLER = join(process.cwd(), "install.sh");
const VERSION = "1.0.0";
const ARCHIVE = `tekvro-${VERSION}.tgz`;
const REQUIRED_PACKAGE_FILES = [
  "scripts/rea.mjs",
  "scripts/lib/cli-process-environment.mjs",
  "dist/main.js",
  "dist/mcp/main.js",
  "dist/cli.js",
  "dist/cliOutput.js",
  "dist/cli-runtime/cli.js",
  "dist/cli-runtime/cliOutput.js",
  "dist/cli-runtime/cliBuiltinArguments.js",
  "dist/cli-runtime/cliResultOutput.js",
  "dist/cli-runtime/mcpDoctor.js",
  "dist/mcpDoctor.js",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
];

interface InstallerFixture {
  readonly root: string;
  readonly home: string;
  readonly bin: string;
  readonly temporary: string;
  readonly assets: string;
  readonly npmLog: string;
  readonly npmArgv: string;
  readonly curlLog: string;
  readonly cliLog: string;
  readonly installedArchive: string;
}

const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", `'"'"'`)}'`;
const executable = async (path: string, source: string): Promise<void> => {
  await writeFile(path, source);
  await chmod(path, 0o755);
};

const writeReleaseArchive = async (
  fixture: InstallerFixture,
  options: {
    readonly name?: string;
    readonly version?: string;
    readonly entry?: string;
    readonly missing?: string;
  } = {},
): Promise<void> => {
  const packageRoot = join(fixture.root, "package");
  await rm(packageRoot, { recursive: true, force: true });
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({
      name: options.name ?? "tekvro",
      version: options.version ?? VERSION,
      private: true,
      bin: { tekvro: options.entry ?? "scripts/rea.mjs" },
    }),
  );
  for (const path of REQUIRED_PACKAGE_FILES) {
    if (path === options.missing) continue;
    const absolute = join(packageRoot, path);
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(
      absolute,
      path.endsWith(".js") || path.endsWith(".mjs")
        ? "export {};\n"
        : "License fixture\n",
    );
  }
  await execFileAsync("tar", [
    "-czf",
    join(fixture.assets, ARCHIVE),
    "-C",
    fixture.root,
    "package",
  ]);
  const digest = createHash("sha256")
    .update(await readFile(join(fixture.assets, ARCHIVE)))
    .digest("hex");
  await writeFile(
    join(fixture.assets, "SHA256SUMS"),
    `${digest}  ${ARCHIVE}\n`,
  );
};

const createFixture = async (): Promise<InstallerFixture> => {
  const root = await createTestTempDirectory("tekvro-install-test-");
  const fixture: InstallerFixture = {
    root,
    home: join(root, "home"),
    bin: join(root, "bin"),
    temporary: join(root, "tmp"),
    assets: join(root, "assets"),
    npmLog: join(root, "npm.log"),
    npmArgv: join(root, "npm-argv.log"),
    curlLog: join(root, "curl.log"),
    cliLog: join(root, "tekvro.log"),
    installedArchive: join(root, "installed.tgz"),
  };
  await Promise.all(
    [fixture.home, fixture.bin, fixture.temporary, fixture.assets].map((path) =>
      mkdir(path),
    ),
  );
  for (const command of [
    "cat",
    "mktemp",
    "rm",
    "tar",
    "gzip",
    "cp",
    "mkdir",
    "chmod",
  ]) {
    const resolved = await execFileAsync("/bin/sh", [
      "-c",
      'command -v "$1"',
      "installer-fixture",
      command,
    ]);
    await symlink(resolved.stdout.trim(), join(fixture.bin, command));
  }
  await executable(
    join(fixture.bin, "uname"),
    '#!/bin/sh\n[ "$1" = "-m" ] && printf \'%s\\n\' "${FAKE_ARCH:-x86_64}" || printf \'%s\\n\' "${FAKE_PLATFORM:-Linux}"\n',
  );
  await executable(
    join(fixture.bin, "node"),
    `#!/bin/sh
if [ "$1" = "-p" ]; then printf '%s\\n' "\${FAKE_NODE_VERSION:-24.22.1}"; else exec ${shellQuote(process.execPath)} "$@"; fi
`,
  );
  await executable(
    join(fixture.bin, "curl"),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_CURL_LOG"
[ "\${FAKE_CURL_FAIL:-}" = "1" ] && exit 1
url=""; output=""
while [ "$#" -gt 0 ]; do
  case "$1" in --output|-o) shift; output="$1" ;; https://*) url="$1" ;; esac
  shift
done
case "$url" in
  https://github.com/ForceMind/Tekvro/releases/download/v1.0.0/SHA256SUMS) cp "$FAKE_ASSETS/SHA256SUMS" "$output" ;;
  https://github.com/ForceMind/Tekvro/releases/download/v1.0.0/tekvro-1.0.0.tgz) cp "$FAKE_ASSETS/tekvro-1.0.0.tgz" "$output" ;;
  *) exit 22 ;;
esac
`,
  );
  await executable(
    join(fixture.bin, "npm"),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_NPM_LOG"
if [ "$1" = "prefix" ]; then
  [ "\${FAKE_NPM_PREFIX_FAIL:-}" = "1" ] && exit 1
  printf '%s\\n' "$FAKE_NPM_PREFIX"; exit 0
fi
printf '%s\\0' "$@" > "$FAKE_NPM_ARGV"
[ "\${FAKE_NPM_FAIL:-}" = "1" ] && exit 1
prefix="$FAKE_NPM_PREFIX"; archive=""
for argument in "$@"; do archive="$argument"; done
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--prefix" ]; then shift; prefix="$1"; fi
  shift
done
cp "$archive" "$FAKE_INSTALLED_ARCHIVE"
[ "\${FAKE_NPM_SKIP_BINARY:-}" = "1" ] && exit 0
mkdir -p "$prefix/bin"
cp "$FAKE_CLI_SOURCE" "$prefix/bin/tekvro"
chmod +x "$prefix/bin/tekvro"
`,
  );
  await executable(
    join(fixture.bin, "tekvro-source"),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_CLI_LOG"
[ "\${FAKE_CLI_FAIL:-}" = "1" ] && exit 1
[ "$1" = "--version" ] && printf '%s\\n' "\${FAKE_CLI_VERSION-1.0.0}"
exit 0
`,
  );
  await writeReleaseArchive(fixture);
  return fixture;
};

const installerEnvironment = (
  fixture: InstallerFixture,
): Record<string, string> => ({
  HOME: fixture.home,
  TMPDIR: fixture.temporary,
  PATH: fixture.bin,
  FAKE_ASSETS: fixture.assets,
  FAKE_CURL_LOG: fixture.curlLog,
  FAKE_NPM_LOG: fixture.npmLog,
  FAKE_NPM_ARGV: fixture.npmArgv,
  FAKE_NPM_PREFIX: join(fixture.home, "npm global prefix"),
  FAKE_INSTALLED_ARCHIVE: fixture.installedArchive,
  FAKE_CLI_LOG: fixture.cliLog,
  FAKE_CLI_SOURCE: join(fixture.bin, "tekvro-source"),
});

const runInstaller = (
  fixture: InstallerFixture,
  args: readonly string[] = [],
  overrides: Readonly<Record<string, string>> = {},
) =>
  execFileAsync("/bin/bash", [INSTALLER, ...args], {
    env: { ...installerEnvironment(fixture), ...overrides },
  });

const assertNoInstall = async (fixture: InstallerFixture): Promise<void> => {
  await expect(readFile(fixture.npmLog)).rejects.toMatchObject({
    code: "ENOENT",
  });
  await expect(readFile(fixture.cliLog)).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(await readdir(fixture.temporary)).toEqual([]);
};

const processOutput = (
  failure: unknown,
  stream: "stdout" | "stderr",
): string => {
  if (!(failure instanceof Error) || !(stream in failure)) return "";
  const value: unknown = Reflect.get(failure, stream);
  return typeof value === "string" ? value : "";
};

const failedInstaller = async (
  fixture: InstallerFixture,
  args: readonly string[] = [],
  overrides: Readonly<Record<string, string>> = {},
): Promise<string> => {
  const result: unknown = await runInstaller(fixture, args, overrides).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(result).toBeInstanceOf(Error);
  return processOutput(result, "stderr");
};

describe.skipIf(process.platform === "win32")(
  "verified GitHub release installer",
  { timeout: 20_000 },
  () => {
    it("installs the exact verified archive with closed stdin and leaves configuration unchanged", async () => {
      const fixture = await createFixture();
      const response = await runInstaller(fixture);
      expect(response.stdout).toContain("Tekvro 1.0.0 is installed");
      expect(
        (await readFile(fixture.installedArchive)).equals(
          await readFile(join(fixture.assets, ARCHIVE)),
        ),
      ).toBe(true);
      const argv = (await readFile(fixture.npmArgv, "utf8")).split("\0");
      expect(argv.slice(0, 4)).toEqual([
        "install",
        "--global",
        "--prefix",
        join(fixture.home, ".local"),
      ]);
      expect(argv[4]).toMatch(/\/tekvro-install\.[^/]+\/tekvro-1\.0\.0\.tgz$/u);
      expect(await readFile(fixture.cliLog, "utf8")).toBe("--version\n");
      const downloads = await readFile(fixture.curlLog, "utf8");
      expect(downloads).toContain(
        "--proto =https --proto-redir =https --tlsv1.2",
      );
      expect(downloads).not.toContain("registry.npmjs.org");
      expect(await readdir(fixture.temporary)).toEqual([]);
    });

    it("keeps help available without a runtime or npm", async () => {
      const fixture = await createFixture();
      await rm(join(fixture.bin, "node"));
      await rm(join(fixture.bin, "npm"));
      const response = await runInstaller(fixture, ["--help"]);
      expect(response.stdout).toContain(
        "checksum-verified Tekvro GitHub Release",
      );
      await assertNoInstall(fixture);
    });

    it("dry-runs without downloads, npm invocations or filesystem changes", async () => {
      const fixture = await createFixture();
      await rm(join(fixture.bin, "curl"));
      const response = await runInstaller(fixture, [
        "--version",
        VERSION,
        "--dry-run",
      ]);
      expect(response.stdout).toContain(
        "no network requests or file changes made",
      );
      await expect(readFile(fixture.curlLog)).rejects.toMatchObject({
        code: "ENOENT",
      });
      await assertNoInstall(fixture);
    });

    it.each([
      "22.23.4",
      "22.24.0",
      "24.22.1",
      "24.23.0",
      "26.12.1",
      "26.13.0",
      "27.0.0",
    ])("accepts the supported Node boundary %s", async (version) => {
      const fixture = await createFixture();
      const response = await runInstaller(fixture, ["--dry-run"], {
        FAKE_NODE_VERSION: version,
      });
      expect(response.stdout).toContain(`Runtime: Node.js ${version}`);
      await assertNoInstall(fixture);
    });

    it.each([
      "20.0.0",
      "22.23.3",
      "24.22.0",
      "23.0.0",
      "25.0.0",
      "26.12.0",
      "26.12.1-rc.1",
      "024.22.1",
      "invalid",
    ])(
      "rejects unsupported Node %s before writing or downloading",
      async (version) => {
        const fixture = await createFixture();
        expect(
          await failedInstaller(fixture, [], { FAKE_NODE_VERSION: version }),
        ).toMatch(/Node\.js|active Node\.js/u);
        await expect(readFile(fixture.curlLog)).rejects.toMatchObject({
          code: "ENOENT",
        });
        await assertNoInstall(fixture);
      },
    );

    it.each([
      "",
      "v1.0.0",
      "1.2.3-01",
      "1.2.3+build.01",
      "1.2.3-$(printf unexpected)",
      '1.2.3-"; printf unexpected; #',
    ])(
      "rejects invalid version/tag spelling %j before side effects",
      async (version) => {
        const fixture = await createFixture();
        expect(
          await failedInstaller(fixture, ["--version", version, "--dry-run"]),
        ).toContain("exact semantic version without build metadata");
        await assertNoInstall(fixture);
      },
    );

    it("accepts an exact prerelease and environment-selected version without network access in a dry run", async () => {
      const fixture = await createFixture();
      const response = await runInstaller(fixture, ["--dry-run"], {
        TEKVRO_VERSION: "1.2.3-alpha.0",
      });
      expect(response.stdout).toContain("Version: 1.2.3-alpha.0");
      await assertNoInstall(fixture);
    });

    it.each([
      { args: ["--version"] },
      { args: ["--prefix"] },
      { args: ["--prefix", ""] },
      { args: ["--prefix", "relative"] },
      { args: ["--unknown"] },
    ])("rejects malformed arguments $args", async ({ args }) => {
      const fixture = await createFixture();
      expect(await failedInstaller(fixture, args)).toMatch(
        /requires a value|absolute directory|unknown option/u,
      );
      await assertNoInstall(fixture);
    });
  },
);

describe.skipIf(process.platform === "win32")(
  "release evidence and installation outcomes",
  { timeout: 20_000 },
  () => {
    it.each(["mismatch", "duplicate", "missing", "malformed"] as const)(
      "rejects %s checksum evidence before npm",
      async (scenario) => {
        const fixture = await createFixture();
        const original = await readFile(
          join(fixture.assets, "SHA256SUMS"),
          "utf8",
        );
        const checksums =
          scenario === "mismatch"
            ? `${"0".repeat(64)}  ${ARCHIVE}\n`
            : scenario === "duplicate"
              ? original + original
              : scenario === "missing"
                ? original.replace(ARCHIVE, "different.tgz")
                : "not-a-checksum\n";
        await writeFile(join(fixture.assets, "SHA256SUMS"), checksums);
        expect(await failedInstaller(fixture)).toContain(
          "release checksum verification failed; npm was not run",
        );
        await assertNoInstall(fixture);
      },
    );

    it.each([
      { name: "different-package" },
      { version: "9.9.9" },
      { entry: "other-entry.mjs" },
      { missing: "dist/main.js" },
      { missing: "LICENSE" },
    ])(
      "rejects a checksum-matching archive with wrong identity or incomplete build %j",
      async (options) => {
        const fixture = await createFixture();
        await writeReleaseArchive(fixture, options);
        expect(await failedInstaller(fixture)).toContain(
          "release package verification failed; npm was not run",
        );
        await assertNoInstall(fixture);
      },
    );

    it("preserves an explicit prefix containing shell metacharacters as one argument", async () => {
      const fixture = await createFixture();
      const prefix = join(fixture.home, "with 'quotes' $cash; [glob]");
      await runInstaller(fixture, ["--prefix", prefix]);
      const argv = (await readFile(fixture.npmArgv, "utf8")).split("\0");
      expect(argv.slice(0, 4)).toEqual([
        "install",
        "--global",
        "--prefix",
        prefix,
      ]);
      expect(await readFile(fixture.cliLog, "utf8")).toBe("--version\n");
      expect(await readdir(fixture.temporary)).toEqual([]);
    });

    it("uses the existing macOS npm prefix and supports explicit prefixes", async () => {
      const fixture = await createFixture();
      await runInstaller(fixture, [], {
        FAKE_PLATFORM: "Darwin",
        FAKE_ARCH: "arm64",
      });
      expect(await readFile(fixture.npmLog, "utf8")).toContain(
        "prefix --global\ninstall --global ",
      );
      const argv = (await readFile(fixture.npmArgv, "utf8")).split("\0");
      expect(argv.slice(0, 2)).toEqual(["install", "--global"]);
      expect(argv).not.toContain("--prefix");
      expect(await readFile(fixture.cliLog, "utf8")).toBe("--version\n");
    });

    it("rejects an invalid existing npm prefix before installation", async () => {
      const fixture = await createFixture();
      expect(
        await failedInstaller(fixture, [], {
          FAKE_PLATFORM: "Darwin",
          FAKE_NPM_PREFIX: "relative",
        }),
      ).toContain("npm returned an invalid global prefix");
      await expect(readFile(fixture.npmArgv)).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(readFile(fixture.cliLog)).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(await readdir(fixture.temporary)).toEqual([]);
    });

    it.each([
      [
        "download",
        { FAKE_CURL_FAIL: "1" },
        "release checksums could not be downloaded",
      ],
      [
        "npm",
        { FAKE_NPM_FAIL: "1" },
        "npm could not install the verified local archive",
      ],
      [
        "missing command",
        { FAKE_NPM_SKIP_BINARY: "1" },
        "npm completed without installing",
      ],
      [
        "unreadable installed version",
        { FAKE_CLI_FAIL: "1" },
        "installed Tekvro version could not be read",
      ],
      [
        "empty installed version",
        { FAKE_CLI_VERSION: "" },
        "installed Tekvro version could not be read",
      ],
      [
        "installed version mismatch",
        { FAKE_CLI_VERSION: "9.9.9" },
        "does not match 1.0.0",
      ],
      [
        "macOS prefix",
        {
          FAKE_PLATFORM: "Darwin",
          FAKE_ARCH: "arm64",
          FAKE_NPM_PREFIX_FAIL: "1",
        },
        "npm global prefix could not be read",
      ],
    ] as const)(
      "retains actionable failure and cleans temporary files for %s",
      async (_name, overrides, message) => {
        const fixture = await createFixture();
        expect(await failedInstaller(fixture, [], overrides)).toContain(
          message,
        );
        expect(await readdir(fixture.temporary)).toEqual([]);
      },
    );
  },
);

const terminalInstaller = async (
  fixture: InstallerFixture,
  args: readonly string[],
  redirectStderr: boolean,
): Promise<string> => {
  const wrapper = `const {spawnSync} = require('node:child_process'); const {openSync,closeSync}=require('node:fs'); const fd=openSync(process.argv[2],'w'); const p=spawnSync('/bin/bash',[process.argv[1],...process.argv.slice(3)],{env:process.env,stdio:['inherit','inherit',${redirectStderr ? "fd" : "'inherit'"}]});closeSync(fd);process.exit(p.status??1);`;
  const terminal = spawnPty(
    process.execPath,
    ["-e", wrapper, INSTALLER, join(fixture.root, "stderr.log"), ...args],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...installerEnvironment(fixture),
        TERM: "xterm-256color",
      },
      name: "xterm-256color",
      cols: 120,
      rows: 40,
    },
  );
  let output = "";
  terminal.onData((text) => {
    output += text;
  });
  const code = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      terminal.kill();
      reject(new Error(`Installer PTY timeout: ${output}`));
    }, 10_000);
    terminal.onExit(({ exitCode }) => {
      clearTimeout(timeout);
      resolve(exitCode);
    });
  });
  expect(code, output).toBe(0);
  return output;
};

describe.skipIf(process.platform === "win32")(
  "explicit installer setup",
  { timeout: 20_000 },
  () => {
    it("does not configure clients even when a terminal is available by default", async () => {
      const fixture = await createFixture();
      await terminalInstaller(fixture, [], false);
      expect(await readFile(fixture.cliLog, "utf8")).toBe("--version\n");
    });
    it("starts setup only for an explicit interactive request", async () => {
      const fixture = await createFixture();
      await terminalInstaller(fixture, ["--setup"], false);
      expect(await readFile(fixture.cliLog, "utf8")).toBe("--version\nsetup\n");
    });
    it("defers setup with closed stdin or redirected stderr, and honors legacy opt-out flags", async () => {
      for (const args of [
        ["--setup"],
        ["--setup", "--no-setup"],
        ["--setup", "--no-prompt"],
      ]) {
        const fixture = await createFixture();
        await runInstaller(fixture, args);
        expect(await readFile(fixture.cliLog, "utf8")).toBe("--version\n");
      }
      const fixture = await createFixture();
      await terminalInstaller(fixture, ["--setup"], true);
      expect(await readFile(fixture.cliLog, "utf8")).toBe("--version\n");
    });
  },
);

const runPipedInstaller = (
  fixture: InstallerFixture,
  source: Uint8Array,
): Promise<{
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}> =>
  new Promise((resolve, reject) => {
    const child = spawn("/bin/bash", ["-s", "--", "--dry-run"], {
      env: {
        ...installerEnvironment(fixture),
        SECRET_TOKEN: "inherited-secret",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(source);
  });

describe.skipIf(process.platform === "win32")(
  "truncated installer download",
  { timeout: 180_000 },
  () => {
    it("runs nothing at every byte until the entire outer brace group arrives", async () => {
      const fixture = await createFixture();
      const source = await readFile(INSTALLER);
      expect(source.subarray(0, 14).toString()).toBe("#!/bin/bash\n{\n");
      const groupOpen = source.indexOf("\n{\n") + 2;
      const groupEnd = source.lastIndexOf("\n}\n") + 2;
      expect(groupEnd).toBe(source.length - 1);
      const failures: string[] = [];
      const check = async (offset: number): Promise<void> => {
        const result = await runPipedInstaller(
          fixture,
          source.subarray(0, offset),
        );
        if ((result.stdout + result.stderr).includes("inherited-secret"))
          failures.push(`environment leaked at ${offset}`);
        if (offset >= groupEnd) {
          if (
            result.code !== 0 ||
            !result.stdout.includes("no network requests or file changes made")
          )
            failures.push(`complete installer failed at ${offset}`);
        } else if (result.stdout !== "")
          failures.push(`stdout before complete download at ${offset}`);
        else if (
          offset >= groupOpen &&
          (result.code === 0 ||
            !/syntax error|unexpected EOF/u.test(result.stderr))
        )
          failures.push(`partial brace group ran at ${offset}`);
        else if (
          offset < groupOpen &&
          (result.code !== 0 || result.stderr !== "")
        )
          failures.push(`preamble failed at ${offset}`);
      };
      for (let offset = 0; offset <= source.length; offset += 16)
        await Promise.all(
          Array.from(
            { length: Math.min(16, source.length + 1 - offset) },
            (_, index) => check(offset + index),
          ),
        );
      expect(failures).toEqual([]);
      await expect(readFile(fixture.curlLog)).rejects.toMatchObject({
        code: "ENOENT",
      });
      await assertNoInstall(fixture);
    });
  },
);

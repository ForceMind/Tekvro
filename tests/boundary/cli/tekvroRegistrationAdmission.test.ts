import {
  mkdir,
  readFile,
  readdir,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect } from "vitest";
import { z } from "zod";

import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";
import { cliTest, type TestCli } from "../../support/cli/cliFixture.js";

const ORIGINAL =
  '{"amp.mcpServers":{"rea":{"command":"old","args":["serve"]},"unrelated":{"command":"keep","args":["safe"]}},"amp.theme":"dark"}\n';

const settingsSchema = z.object({
  "amp.mcpServers": z.object({
    rea: z.object({ command: z.string(), args: z.array(z.string()) }),
    unrelated: z.object({ command: z.string(), args: z.array(z.string()) }),
  }),
  "amp.theme": z.string(),
});

const registrationFixture = async (cli: TestCli) => {
  const root = await createTestTempDirectory("tekvro-registration-admission-");
  const home = join(root, "home");
  const bin = join(root, "bin");
  const log = join(root, "runner.log");
  await mkdir(home);
  await mkdir(bin);
  await writeFile(log, "");
  const runner = join(bin, "npx");
  await writeFile(
    runner,
    `#!${process.execPath}\nrequire("node:fs").appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + "\\n");\nprocess.exit(92);\n`,
    { mode: 0o700 },
  );
  await writeFile(
    join(bin, "npx.cmd"),
    `@"${process.execPath}" "${runner}" %*\r\n`,
  );
  const directory = join(home, ".config", "amp");
  const settings = join(directory, "settings.json");
  const invoke = (
    arguments_: readonly string[],
    environment: NodeJS.ProcessEnv = {},
  ) =>
    cli.run({
      arguments: arguments_,
      cwd: home,
      environment: {
        HOME: home,
        USERPROFILE: home,
        XDG_CONFIG_HOME: join(home, ".config"),
        XDG_CACHE_HOME: join(home, ".cache"),
        APPDATA: join(home, "AppData", "Roaming"),
        LOCALAPPDATA: join(home, "AppData", "Local"),
        // A rejected invocation must never escape to a real package runner.
        PATH: bin,
        npm_config_user_agent: "npm/11.16.0",
        CI: "1",
        NO_COLOR: "1",
        TEKVRO_LANG: "en",
        ...environment,
        TURBO_TELEMETRY_DISABLED: "1",
        DO_NOT_TRACK: "1",
      },
      timeoutMs: 20_000,
    });
  return {
    home,
    directory,
    settings,
    log,
    run: (arguments_: readonly string[]) =>
      invoke(["mcp", "add", ...arguments_, "--json"]),
    complete: () =>
      invoke(["--", "rea", "mcp", "add", "--c"], {
        COMPLETE: "bash",
        _COMPLETE_INDEX: "3",
      }),
  };
};

type RegistrationFixture = Awaited<ReturnType<typeof registrationFixture>>;

const seedSettings = async (fixture: RegistrationFixture): Promise<number> => {
  await mkdir(fixture.directory, { recursive: true });
  await writeFile(fixture.settings, ORIGINAL);
  // A rewrite cannot hide behind coarse filesystem timestamp precision.
  const previous = new Date("2000-01-01T00:00:00Z");
  await utimes(fixture.settings, previous, previous);
  return (await stat(fixture.settings)).mtimeMs;
};

const expectNoRegistrationWrite = async (
  fixture: RegistrationFixture,
  originalMtime: number | undefined,
): Promise<void> => {
  expect(await readFile(fixture.log, "utf8")).toBe("");
  if (originalMtime === undefined) {
    expect(await readdir(fixture.home)).toEqual([]);
  } else {
    expect(await readFile(fixture.settings, "utf8")).toBe(ORIGINAL);
    expect((await stat(fixture.settings)).mtimeMs).toBe(originalMtime);
    expect(await readdir(fixture.home)).toEqual([".config"]);
    expect(await readdir(join(fixture.home, ".config"))).toEqual(["amp"]);
    expect(await readdir(fixture.directory)).toEqual(["settings.json"]);
  }
};

cliTest(
  "rejects stray and unknown MCP registration arguments before writes or package runners",
  async ({ cli }) => {
    const declared = "DECLARED_REGISTRATION_LITERAL_83A4";
    const ordinary = "API_SECRET_ordinary-evidence";
    const cases = [
      { arguments: ["extra"], rejected: "extra" },
      { arguments: ["extra", "--agent", "amp"], rejected: "extra" },
      { arguments: ["--agent", "amp", "extra"], rejected: "extra" },
      { arguments: ["--agent=amp", "extra"], rejected: "extra" },
      { arguments: ["--bogus"], rejected: "--bogus" },
      { arguments: ["--agents", "amp"], rejected: "--agents" },
      {
        arguments: ["--commandd=node --version", "--agent=amp"],
        rejected: "--commandd=node --version",
      },
      {
        arguments: [`--unknown=${declared}`, "--sensitive-value", declared],
        rejected: "--unknown=[REDACTED]",
      },
      {
        arguments: [`--unknown=${ordinary}`],
        rejected: `--unknown=${ordinary}`,
      },
    ];

    for (const existing of [false, true]) {
      const fixture = await registrationFixture(cli);
      const originalMtime = existing ? await seedSettings(fixture) : undefined;
      for (const item of cases) {
        const result = await fixture.run(item.arguments);
        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
          code: "VALIDATION_ERROR",
          message: `Unexpected argument: ${item.rejected}`,
          fieldErrors: [{ path: "arguments" }],
        });
        expect(result.stdout).not.toContain(declared);
        expect(result.stderr).not.toContain(declared);
        await expectNoRegistrationWrite(fixture, originalMtime);
      }
      for (const arguments_ of [
        ["--agent", "amp", "--agent", "amp"],
        ["--agent=amp", "--agent", "amp"],
      ]) {
        const result = await fixture.run(arguments_);
        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
          code: "VALIDATION_ERROR",
          message: "Duplicate --agent value: amp. List each agent once.",
          fieldErrors: [{ path: "agent" }],
        });
        await expectNoRegistrationWrite(fixture, originalMtime);
      }
    }
  },
  60_000,
);

cliTest(
  "prioritizes empty or missing MCP registration values over stray arguments",
  async ({ cli }) => {
    const fixture = await registrationFixture(cli);
    for (const flag of ["--agent", "--command", "-c"]) {
      for (const arguments_ of [[flag], [flag, ""], [`${flag}=`]]) {
        const result = await fixture.run(["extra", ...arguments_]);
        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
          code: "VALIDATION_ERROR",
          message: `Missing value for flag: ${flag}`,
          fieldErrors: [{ path: flag === "--agent" ? "agent" : "command" }],
        });
        await expectNoRegistrationWrite(fixture, undefined);
      }
    }
    const flagInsteadOfValue = await fixture.run([
      "extra",
      "--command",
      "--agent",
      "amp",
    ]);
    expect(flagInsteadOfValue.exitCode).toBe(1);
    expect(flagInsteadOfValue.json).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Missing value for flag: --command",
      fieldErrors: [{ path: "command" }],
    });
    await expectNoRegistrationWrite(fixture, undefined);
  },
  40_000,
);

cliTest(
  "rejects unsafe discovery and flag-shaped registration values without reinterpreting output data",
  async ({ cli }) => {
    const fixture = await registrationFixture(cli);
    const originalMtime = await seedSettings(fixture);
    for (const arguments_ of [
      ["--schema"],
      ["--version"],
      ["--agent=amp", "--schema"],
      ["--agent", "amp", "--version"],
    ]) {
      const result = await fixture.run(arguments_);
      expect(result.exitCode).toBe(1);
      expect(result.json).toMatchObject({
        code: "VALIDATION_ERROR",
        message: expect.stringContaining(
          "does not support --schema or --version",
        ),
        fieldErrors: [{ path: "arguments" }],
      });
      await expectNoRegistrationWrite(fixture, originalMtime);
    }
    for (const { arguments: arguments_, flag, field } of [
      {
        arguments: ["--command=--schema"],
        flag: "--command",
        field: "command",
      },
      { arguments: ["--agent=--help"], flag: "--agent", field: "agent" },
      { arguments: ["-c=--version"], flag: "-c", field: "command" },
    ]) {
      const result = await fixture.run(arguments_);
      expect(result.exitCode).toBe(1);
      expect(result.json).toMatchObject({
        code: "VALIDATION_ERROR",
        message: expect.stringContaining(`Invalid value for flag: ${flag}`),
        fieldErrors: [{ path: field }],
      });
      await expectNoRegistrationWrite(fixture, originalMtime);
    }
    for (const filter of [
      ["--filter-output", "--command=foo"],
      ["--filter-output=--command=foo"],
    ]) {
      const result = await fixture.run([...filter, "--agent=amp", "extra"]);
      expect(result.exitCode).toBe(1);
      expect(result.json).toMatchObject({
        code: "VALIDATION_ERROR",
        message: "Unexpected argument: extra",
        fieldErrors: [{ path: "arguments" }],
      });
      await expectNoRegistrationWrite(fixture, originalMtime);
    }
    const help = await fixture.run(["--help"]);
    const malformedHelp = await fixture.run(["extra", "--help"]);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("--agent");
    expect(malformedHelp.exitCode).toBe(0);
    expect(malformedHelp.stdout).toBe(help.stdout);
    const completion = await fixture.complete();
    expect(completion.exitCode).toBe(0);
    expect(completion.stdout).toContain("--command");
    await expectNoRegistrationWrite(fixture, originalMtime);
  },
  40_000,
);

cliTest(
  "stores spaced and equals registration commands while retaining the local source default",
  async ({ cli }) => {
    const fixture = await registrationFixture(cli);
    await seedSettings(fixture);
    const localSource = {
      command: process.execPath,
      args: [resolve("scripts/rea.mjs"), "mcp"],
    };
    const override = { command: "node", args: ["--version"] };
    for (const { arguments: arguments_, expected } of [
      {
        arguments: ["--agent", "amp", "--command", "node --version"],
        expected: override,
      },
      {
        arguments: ["--agent=amp", "--command=node --version"],
        expected: override,
      },
      {
        arguments: ["--agent", "amp", "-c", "node --version"],
        expected: override,
      },
      {
        arguments: ["--agent=amp", "-c=node --version", "--no-global"],
        expected: override,
      },
      { arguments: ["--agent=amp"], expected: localSource },
      {
        arguments: ["--filter-output", "--command=foo", "--agent=amp"],
        expected: localSource,
      },
      {
        arguments: ["--filter-output=--command=foo", "--agent=amp"],
        expected: localSource,
      },
    ]) {
      const result = await fixture.run(arguments_);
      expect(result.exitCode).toBe(0);
      const settings = settingsSchema.parse(
        JSON.parse(await readFile(fixture.settings, "utf8")),
      );
      expect(settings["amp.mcpServers"].rea).toEqual(expected);
      expect(settings["amp.mcpServers"].unrelated).toEqual({
        command: "keep",
        args: ["safe"],
      });
      expect(settings["amp.theme"]).toBe("dark");
      // The existing direct Amp writer does not create registration backups.
      expect(await readdir(fixture.directory)).toEqual(["settings.json"]);
      expect(await readFile(fixture.log, "utf8")).toBe("");
    }
  },
  30_000,
);

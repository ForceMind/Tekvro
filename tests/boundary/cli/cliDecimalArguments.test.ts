import { Ajv2020 } from "ajv/dist/2020.js";
import { Cli, Parser, z } from "incur";
import { describe, expect, it } from "vitest";

import { createCli } from "../../../src/cli.js";
import { cliTest } from "../../support/cli/cliFixture.js";

const CASES = [
  [
    "inspect-sqlite-database",
    "workerTimeoutMs",
    "worker-timeout-ms",
    2_147_483_647,
    ["/nonexistent/selected-artifact"],
    1,
    undefined,
  ],
  [
    "inspect-sqlite-database",
    "rowLimit",
    "row-limit",
    Number.MAX_SAFE_INTEGER,
    ["/nonexistent/selected-artifact"],
    1,
    undefined,
  ],
  [
    "inspect-wasm-artifact",
    "commandTimeoutMs",
    "command-timeout-ms",
    2_147_483_647,
    ["/nonexistent/selected-artifact"],
    1,
    undefined,
  ],
  [
    "inspect-evm-interface",
    "timeoutMs",
    "timeout-ms",
    2_147_483_647,
    ["/nonexistent/bytecode.hex", "hex"],
    1,
    undefined,
  ],
  [
    "trace-web-source-location",
    "decodeTimeoutMs",
    "decode-timeout-ms",
    2_147_483_647,
    [
      "/nonexistent/manifest.json",
      "0",
      "/nonexistent/app.js.map",
      "https://example.test/app.js.map",
      "1",
      "0",
    ],
    1,
    undefined,
  ],
  [
    "compare-web-screenshots",
    "channelThreshold",
    "channel-threshold",
    255,
    ["/nonexistent/before.json", "/nonexistent/after.json"],
    0,
    0,
  ],
] as const;

const NON_DECIMAL = [
  "0x10",
  "0b10",
  "0o10",
  "1e3",
  "+16",
  "16.0",
  " 16",
  "16 ",
  "16\n",
  "",
  " ",
];

const advertisedSchema = z.object({
  options: z.object({ properties: z.record(z.string(), z.unknown()) }).loose(),
});

type CommandMap = NonNullable<ReturnType<typeof Cli.toCommands.get>>;
const registeredCommands: WeakMap<object, CommandMap> = Cli.toCommands;

const commandOptions = (
  cli: ReturnType<typeof createCli>,
  name: string,
): z.ZodObject => {
  const command = registeredCommands.get(cli)?.get(name);
  if (
    command === undefined ||
    !("options" in command) ||
    !(command.options instanceof z.ZodObject)
  )
    throw new Error(`Missing option schema for ${name}`);
  return command.options;
};

describe("offline decimal CLI inputs", () => {
  it.each(CASES)(
    "validates %s %s before numeric coercion",
    (name, field, flag, maximum, _positionals, minimum, defaultValue) => {
      const options = commandOptions(createCli({}), name);
      for (const value of [
        ...NON_DECIMAL,
        "-1",
        "-0",
        ...(minimum === 0 ? [] : ["0"]),
        String(maximum + 1),
      ])
        expect(
          () => Parser.parse([`--${flag}`, value], { options }),
          value,
        ).toThrow();
      for (const value of [String(minimum), "00016", String(maximum)])
        expect(
          Parser.parse([`--${flag}=${value}`], { options }).options[field],
        ).toBe(Number(value));
      if (defaultValue === undefined)
        expect(options.parse({})).not.toHaveProperty(field);
      else expect(options.parse({})).toMatchObject({ [field]: defaultValue });
      expect(options.parse({ [field]: 16 })).toMatchObject({ [field]: 16 });
    },
  );

  it.each(["en", "zh-CN"])(
    "advertises decimal spellings and numeric bounds with %s help",
    async (language) => {
      const cli = createCli({ TEKVRO_LANG: language });
      const ajv = new Ajv2020({ strict: false });
      for (const [name, field, , maximum] of CASES) {
        let stdout = "";
        await cli.serve([name, "--schema", "--json"], {
          env: {},
          exit: (code) => expect(code).toBe(0),
          stdout: (text) => {
            stdout += text;
          },
        });
        const options = advertisedSchema.parse(JSON.parse(stdout)).options;
        const validate = ajv.compile(options);
        for (const value of NON_DECIMAL)
          expect(
            validate({ [field]: value }),
            `${name} ${field} ${JSON.stringify(value)}`,
          ).toBe(false);
        for (const value of [16, "00016"])
          expect(validate({ [field]: value })).toBe(true);
        expect(validate({ [field]: maximum + 1 })).toBe(false);
        expect(validate({})).toBe(true);
        const property = z
          .object({ description: z.string() })
          .parse(options.properties[field]);
        expect(property.description).toBe(
          commandOptions(cli, name).shape[field]?.description,
        );
        if (["workerTimeoutMs", "rowLimit", "commandTimeoutMs"].includes(field))
          expect(property.description).toMatch(
            language === "zh-CN" ? /毫秒|行样本/ : /milliseconds|row count/,
          );
      }
    },
  );

  cliTest.for(CASES)(
    "rejects malformed numeric tokens before dispatch for %s %s",
    { timeout: 60_000 },
    async ([name, field, flag, _maximum, positionals], { cli }) => {
      for (const value of ["0x10", "1e3", "16 "]) {
        for (const selection of [
          [`--${flag}`, value],
          [`--${flag}=${value}`],
        ]) {
          const result = await cli.run({
            arguments: [name, ...positionals, ...selection, "--json"],
          });
          expect(result.exitCode).toBe(1);
          expect(result.json).toMatchObject({
            code: "VALIDATION_ERROR",
            fieldErrors: expect.arrayContaining([
              expect.objectContaining({
                path: expect.stringContaining(field),
              }),
            ]),
          });
        }
      }
    },
  );
});

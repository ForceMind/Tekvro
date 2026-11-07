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
  ],
  ["inspect-sqlite-database", "rowLimit", "row-limit", Number.MAX_SAFE_INTEGER],
  [
    "inspect-wasm-artifact",
    "commandTimeoutMs",
    "command-timeout-ms",
    2_147_483_647,
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

describe("SQLite and WASM decimal CLI inputs", () => {
  it.each(CASES)(
    "validates %s %s before numeric coercion",
    (name, field, flag, maximum) => {
      const options = commandOptions(createCli({}), name);
      for (const value of [
        ...NON_DECIMAL,
        "-1",
        "-0",
        "0",
        String(maximum + 1),
      ])
        expect(
          () => Parser.parse([`--${flag}`, value], { options }),
          value,
        ).toThrow();
      for (const value of ["1", "00016", String(maximum)])
        expect(
          Parser.parse([`--${flag}=${value}`], { options }).options[field],
        ).toBe(Number(value));
      expect(options.parse({})).not.toHaveProperty(field);
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
        expect(property.description).toMatch(
          language === "zh-CN" ? /毫秒|行样本/ : /milliseconds|row count/,
        );
      }
    },
  );

  cliTest(
    "rejects malformed numeric tokens before opening SQLite or WABT targets",
    async ({ cli }) => {
      for (const [name, field, flag] of CASES) {
        for (const value of ["0x10", "1e3", "16 "]) {
          for (const selection of [
            [`--${flag}`, value],
            [`--${flag}=${value}`],
          ]) {
            const result = await cli.run({
              arguments: [
                name,
                "/nonexistent/selected-artifact",
                ...selection,
                "--json",
              ],
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
      }
    },
    60_000,
  );
});

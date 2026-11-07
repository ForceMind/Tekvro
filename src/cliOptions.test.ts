import { Ajv2020 } from "ajv/dist/2020.js";
import { Cli, Parser, Schema, z } from "incur";
import { describe, expect, it } from "vitest";

import {
  cliDecimalField,
  cliDecimalShape,
  cliIntegerArgument,
} from "./cli/options.js";
import { presentOmittableDefaults } from "./cli/omittableDefaults.js";
import { visitRegisteredCommands } from "./cli/visitRegisteredCommands.js";

const INVALID_DECIMAL_TEXT = [
  "0x10",
  "1e3",
  "1.0",
  "-1",
  "+1",
  "",
  " 1",
  "1 ",
  "9007199254740993",
];

describe("decimal CLI fields", () => {
  it("rejects lossy numeric spellings before Incur coercion and admits decimal or JSON values", () => {
    const field = cliDecimalField(z.number().int().min(1).max(20));
    const options = z.object({ count: field });
    for (const value of INVALID_DECIMAL_TEXT)
      expect(() => Parser.parse([`--count=${value}`], { options })).toThrow();
    expect(Parser.parse(["--count", "00012"], { options }).options).toEqual({
      count: 12,
    });
    expect(options.parse({ count: 12 })).toEqual({ count: 12 });
    expect(options.safeParse({ count: 21 }).success).toBe(false);
    expect(options.safeParse({ count: 1.5 }).success).toBe(false);
    expect(options.safeParse({ count: Number.POSITIVE_INFINITY }).success).toBe(
      false,
    );
  });

  it("publishes decimal input through the actual Incur Schema conversion", () => {
    const options = z.object({
      count: cliDecimalField(
        z.number().int().min(1).max(20).default(5).describe("数量"),
      ),
    });
    const cli = Cli.create("decimal-test");
    cli.command("inspect", { options, run: () => ({ ok: true }) });
    presentOmittableDefaults(cli);
    let advertised: z.ZodObject | undefined;
    visitRegisteredCommands(cli, (command) => {
      if (command.options instanceof z.ZodObject) advertised = command.options;
    });
    if (advertised === undefined) throw new Error("Missing inspect options");
    const schema = Schema.toJsonSchema(advertised);
    const validate = new Ajv2020({ strict: false }).compile(schema);
    expect(validate({})).toBe(true);
    expect(validate({ count: 12 })).toBe(true);
    expect(validate({ count: "00012" })).toBe(true);
    for (const value of INVALID_DECIMAL_TEXT.slice(0, 8))
      expect(validate({ count: value })).toBe(false);
    expect(schema).toMatchObject({
      properties: { count: { description: "数量", default: 5 } },
    });
    expect(Parser.parse([], { options: advertised }).options).toEqual({
      count: 5,
    });
  });

  it("retains nested wrappers and their omission semantics", () => {
    const fields = {
      optional: z.number().int().min(1).optional(),
      exact: z.number().int().min(1).exactOptional(),
      nullable: z.number().int().min(1).nullable(),
      readonly: z.number().int().min(1).readonly(),
      fallback: z.number().int().min(1).default(4),
      prefault: z.number().int().min(1).prefault(6),
      nested: z
        .number()
        .int()
        .min(1)
        .describe("Inner range")
        .nullable()
        .readonly()
        .optional()
        .default(null)
        .describe("Outer range"),
    };
    for (const field of Object.values(fields)) {
      const adapted = cliDecimalField(field);
      expect(adapted.parse("0003")).toBe(3);
      expect(adapted.parse(3)).toBe(3);
      expect(adapted.safeParse("0").success).toBe(false);
      expect(adapted.safeParse(0).success).toBe(false);
    }
    expect(cliDecimalField(fields.optional).parse(undefined)).toBeUndefined();
    expect(cliDecimalField(fields.nullable).parse(null)).toBeNull();
    expect(cliDecimalField(fields.fallback).parse(undefined)).toBe(4);
    expect(cliDecimalField(fields.prefault).parse(undefined)).toBe(6);
    const nested = cliDecimalField(fields.nested);
    expect(nested.parse(undefined)).toBeNull();
    expect(nested.parse(null)).toBeNull();
    expect(nested.description).toBe("Outer range");

    const exact = z.object({ value: cliDecimalField(fields.exact) });
    expect(exact.parse({})).toEqual({});
    expect(exact.safeParse({ value: undefined }).success).toBe(false);
    expect(Parser.parse([], { options: exact }).options).toEqual({});
    expect(Parser.parse(["--value=3"], { options: exact }).options).toEqual({
      value: 3,
    });
  });

  it("keeps default short circuiting distinct from validated prefault input", () => {
    const core = z.number().int().min(5);
    const fallback = cliDecimalField(core.default(1));
    expect(fallback.parse(undefined)).toBe(1);
    const prefault = cliDecimalField(core.prefault(1));
    expect(prefault.safeParse(undefined).success).toBe(false);
    expect(prefault.parse("5")).toBe(5);
  });

  it("retains changing default factories and branded numeric outputs", () => {
    let fallback = 6;
    const core = z.number().int().min(5).brand<"RowLimit">();
    const defaulted = cliDecimalField(core.default(() => core.parse(fallback)));
    const prefaulted = cliDecimalField(core.prefault(() => fallback));
    fallback = 8;
    const value: z.output<typeof core> = defaulted.parse(undefined);
    expect(value).toBe(8);
    expect(prefaulted.parse(undefined)).toBe(8);
    fallback = 3;
    expect(prefaulted.safeParse(undefined).success).toBe(false);
    fallback = 9;
    expect(defaulted.parse(undefined)).toBe(9);
  });

  it("adapts only direct numeric properties and retains nonnumeric schemas", () => {
    const label = z.string().min(1).describe("Local label");
    const enabled = z.boolean().optional();
    const list = z.array(z.number().int());
    const shape = cliDecimalShape({
      count: z.number().int().min(1).default(2),
      label,
      enabled,
      list,
    });
    expect(shape.label).toBe(label);
    expect(shape.enabled).toBe(enabled);
    expect(shape.list).toBe(list);
    expect(shape.count.parse("0003")).toBe(3);
    expect(shape.count.parse(undefined)).toBe(2);
    expect(() => cliDecimalField(label)).toThrow("numeric domain field");
  });

  it("retains the original positional decimal helper's minimum and safe integer contract", () => {
    const args = z.object({ line: cliIntegerArgument(1) });
    expect(Parser.parse(["0002"], { args }).args).toEqual({ line: 2 });
    for (const value of [...INVALID_DECIMAL_TEXT, "0"])
      expect(() => Parser.parse([value], { args })).toThrow();
  });
});

describe("coercing decimal CLI fields", () => {
  it("gates coercing numeric domains before their own coercion and retains advertised bounds", () => {
    const field = cliDecimalField(z.coerce.number().int().min(1).max(20));
    const options = z.object({ count: field });
    const validate = new Ajv2020({ strict: false }).compile(
      Schema.toJsonSchema(options),
    );
    for (const value of [...INVALID_DECIMAL_TEXT, "1e1"])
      expect(() => Parser.parse([`--count=${value}`], { options })).toThrow();
    for (const value of [true, false, null, [], {}]) {
      expect(options.safeParse({ count: value }).success).toBe(false);
      expect(validate({ count: value })).toBe(false);
    }
    expect(Parser.parse(["--count=00012"], { options }).options).toEqual({
      count: 12,
    });
    expect(options.parse({ count: 12 })).toEqual({ count: 12 });
    expect(validate({ count: 12 })).toBe(true);
    expect(validate({ count: "00012" })).toBe(true);
    expect(validate({ count: "0x10" })).toBe(false);
    expect(validate({ count: "1e1" })).toBe(false);
    for (const value of [0, 21, 1.5]) {
      expect(options.safeParse({ count: value }).success).toBe(false);
      expect(validate({ count: value })).toBe(false);
    }
  });
});

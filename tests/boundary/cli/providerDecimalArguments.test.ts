import { Ajv2020 } from "ajv/dist/2020.js";
import { Cli, Parser, z } from "incur";
import { expect, it } from "vitest";
import { createCli } from "../../../src/cli.js";
import { cliTest } from "../../support/cli/cliFixture.js";

const commands = [
  "import-reference-source",
  "inspect-desktop-application",
  "inspect-python-pyc",
  "inspect-erlang-beam",
  "decode-interface-builder",
  "inspect-asset-catalog",
  "inspect-keyed-archive",
  "inspect-android-method",
  "trace-android-references",
  "environment-build",
  "inspect-web-network-capture",
  "read-adb-logcat",
  "decode-android-resources",
  "inspect-elf-notes",
  "inspect-apple-ips",
  "inspect-kernel-module",
  "inspect-pe-load-config",
  "inspect-byte-entropy",
  "inspect-pe-certificates",
  "inspect-pe-imports",
  "inspect-pe-resources",
  "inspect-devicetree",
  "inspect-native-exports",
  "inspect-binary-layout",
  "inspect-recorded-crash",
  "inspect-packet-fields",
  "inspect-packet-capture",
  "search-bytes",
  "read-bytes",
  "trace-native-values",
  "inspect-native-dispatch-metadata",
  "trace-native-ui-action",
  "decompile-all",
  "list-frida-devices",
  "list-frida-processes",
  "instrument-with-frida",
  "list-jeb-units",
  "inspect-with-objdump",
  "list-objdump-architectures",
  "execute-rizin-command",
  "inspect-signal-decoders",
  "decode-signal-recording",
  "observe-native-ui",
  "capture-native-ui-scenario",
  "inspect-plist",
  "demangle-swift",
] as const;

const cli = createCli({});
type CommandMap = NonNullable<ReturnType<typeof Cli.toCommands.get>>;
const registeredCommands: WeakMap<object, CommandMap> = Cli.toCommands;
const flagFor = (field: string): string =>
  "--" + field.replace(/[A-Z]/gu, (value) => "-" + value.toLowerCase());
const invalid = [
  "0x10",
  "0b10",
  "0o10",
  "1e3",
  "+16",
  "16.0",
  "16 ",
  " 16",
  "",
  " ",
];
const requiredOptions: Readonly<
  Record<string, Record<string, string | string[]>>
> = {
  "inspect-packet-capture": { fields: ["frame.number"] },
  "decompile-all": { output: "/nonexistent/output" },
  "list-frida-devices": { remoteAddress: "127.0.0.1:27042" },
  "list-frida-processes": { remoteAddress: "127.0.0.1:27042" },
  "instrument-with-frida": { remoteAddress: "127.0.0.1:27042" },
  "decode-signal-recording": { decoders: "uart" },
  "capture-native-ui-scenario": { steps: "[]" },
};
const advertised = z.object({ options: z.record(z.string(), z.unknown()) });

it.each(commands)(
  "guards numeric options and advertised inputs for %s before coercion",
  async (name) => {
    const command = registeredCommands.get(cli)?.get(name);
    if (
      command === undefined ||
      !("options" in command) ||
      !(command.options instanceof z.ZodObject)
    )
      throw new Error("Missing options for " + name);
    const options = command.options;
    const samples: Record<string, number> = {};
    for (const [field, schema] of Object.entries(options.shape)) {
      const sample = [1, 0, 3, 16, 128, 512, 1000, 4096].find(
        (value) => schema.safeParse(value).success,
      );
      if (sample !== undefined) samples[field] = sample;
    }
    expect(Object.keys(samples).length).toBeGreaterThan(0);
    const inputs = { ...samples, ...requiredOptions[name] };
    for (const [field, sample] of Object.entries(samples)) {
      const base = Object.entries(inputs)
        .filter(([key]) => key !== field)
        .flatMap(([key, value]) =>
          (Array.isArray(value) ? value : [value]).flatMap((item) => [
            flagFor(key),
            String(item),
          ]),
        );
      expect(
        Parser.parse([...base, flagFor(field) + "=000" + sample], { options })
          .options[field],
      ).toBe(sample);
      for (const value of invalid)
        expect(
          () =>
            Parser.parse([...base, flagFor(field) + "=" + value], { options }),
          name + " " + field + " " + JSON.stringify(value),
        ).toThrow();
    }
    let output = "";
    await cli.serve([name, "--schema", "--json"], {
      env: {},
      exit: (code) => expect(code).toBe(0),
      stdout: (text) => {
        output += text;
      },
    });
    const validate = new Ajv2020({ strict: false }).compile(
      advertised.parse(JSON.parse(output)).options,
    );
    for (const [field, sample] of Object.entries(samples)) {
      expect(validate({ ...inputs, [field]: "000" + sample })).toBe(true);
      for (const value of invalid)
        expect(
          validate({ ...inputs, [field]: value }),
          name + " " + field,
        ).toBe(false);
    }
  },
);

const dispatch = [
  ["read-adb-logcat", ["emulator-5554"], "count", "count"],
  [
    "decode-android-resources",
    ["/nonexistent/input.apk"],
    "decode-timeout-ms",
    "decodeTimeoutMs",
  ],
  [
    "inspect-elf-notes",
    ["/nonexistent/input.elf"],
    "max-entries",
    "maxEntries",
  ],
  [
    "inspect-packet-capture",
    ["/nonexistent/input.pcap"],
    "match_limit",
    "match_limit",
  ],
  ["inspect-signal-decoders", [], "limit", "limit"],
  ["search-bytes", ["/nonexistent/input.elf", "00"], "limit", "limit"],
  ["list-jeb-units", [], "index", "index"],
  [
    "observe-native-ui",
    ["/nonexistent/input", "--pid", "1", "--window-id", "1"],
    "max-nodes",
    "maxNodes",
  ],
] as const;

cliTest.for(dispatch)(
  "refuses malformed %s numerics at the compiled boundary",
  async ([name, args, flag, field], { cli }) => {
    const result = await cli.run({
      arguments: [name, ...args, "--" + flag, "0x10", "--json"],
    });
    expect(result.exitCode, result.stderr).toBe(1);
    expect(result.json).toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: expect.arrayContaining([
        expect.objectContaining({ path: expect.stringContaining(field) }),
      ]),
    });
  },
);

it("keeps decimal token admission at every registered scalar numeric CLI option", () => {
  const catalog = registeredCommands.get(cli);
  if (catalog === undefined) throw new Error("Missing CLI catalog");
  for (const [name, command] of catalog) {
    if (!("options" in command) || !(command.options instanceof z.ZodObject))
      continue;
    for (const [field, schema] of Object.entries(command.options.shape)) {
      const sample = [1, 0, 3, 16, 128, 512, 1000, 4096].find(
        (value) => schema.safeParse(value).success,
      );
      if (sample === undefined) continue;
      const selected = z.object({ value: schema });
      expect(
        Parser.parse(["--value", "000" + sample], { options: selected }).options
          .value,
        name + " " + field,
      ).toBe(sample);
      for (const value of invalid)
        expect(
          () => Parser.parse(["--value", value], { options: selected }),
          name + " " + field,
        ).toThrow();
    }
  }
});

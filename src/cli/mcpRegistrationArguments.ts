import {
  declaredSensitiveValues,
  splitIncurBuiltinArguments,
} from "../cliBuiltinArguments.js";
import {
  CLI_OUTPUT_FORMATS,
  parseCliOutputArguments,
  renderCliDocument,
  renderCliOutputArgumentError,
} from "../cliOutput.js";
import { redactExplicitText } from "../domain/explicitSensitiveValues.js";
import { PRODUCT_IDENTITY } from "../identity.js";
import type { CliInstance } from "./types.js";

type ServeOptions = NonNullable<Parameters<CliInstance["serve"]>[1]>;
type Rejection = { readonly field: string; readonly message: string };

/** Admit Incur's registration builtin before it can start a runner or write settings. */
export const admitMcpRegistrationArguments = (
  normalized: readonly string[],
  options: ServeOptions,
): string[] | undefined => {
  const { command, outputValues } = splitIncurBuiltinArguments(normalized);
  const builtin = command[0] === PRODUCT_IDENTITY.cliBinary ? 1 : 0;
  if (command[builtin] !== "mcp" || command[builtin + 1] !== "add")
    return [...normalized];

  const ownedOutputValues = new Set(outputValues.map(({ index }) => index));
  const flags = new Set(
    normalized.filter((_, index) => !ownedOutputValues.has(index)),
  );
  // These Incur controls really return before its registration branch. Keep
  // their priority, including help for an otherwise malformed invocation.
  if (
    [
      "--help",
      "-h",
      "--llms",
      "--llms-full",
      "--mcp",
      "--update",
      "--incur-update-check",
    ].some((flag) => flags.has(flag))
  )
    return [...normalized];

  const output = parseCliOutputArguments(normalized);
  const write =
    options.stdout ?? ((text: string) => process.stdout.write(text));
  const exit =
    options.exit ??
    ((code: number) => {
      process.exitCode = code;
    });
  if (!output.validation.ok) {
    write(renderCliOutputArgumentError(output.validation));
    exit(1);
    return undefined;
  }

  let missing: Rejection | undefined;
  let unexpected: Rejection | undefined;
  const agents = new Set<string>();
  const expanded = new Map<number, readonly string[]>();
  // Preserve global output values verbatim during equals-form expansion. They
  // may themselves look like command options and belong to another parser.
  for (let index = 0; index < normalized.length; index += 1) {
    if (ownedOutputValues.has(index)) continue;
    const token = normalized[index]!;
    const separator = token.indexOf("=");
    if (separator < 0) continue;
    const flag = token.slice(0, separator);
    if (flag === "--agent" || flag === "--command" || flag === "-c")
      expanded.set(index, [flag, token.slice(separator + 1)]);
  }
  for (let index = builtin + 2; index < command.length; index += 1) {
    const token = command[index]!;
    const separator = token.indexOf("=");
    const flag = separator < 0 ? token : token.slice(0, separator);
    if (flag === "--agent" || flag === "--command" || flag === "-c") {
      const value =
        separator < 0 ? command[++index] : token.slice(separator + 1);
      const field = flag === "--agent" ? "agent" : "command";
      if (value === undefined || value.trim() === "" || value.startsWith("-"))
        missing ??= {
          field,
          message:
            value === undefined || value === "" || separator < 0
              ? `Missing value for flag: ${flag}`
              : `Invalid value for flag: ${flag}. Supply a nonempty agent name or a complete executable command; a standalone flag cannot be registered.`,
        };
      else if (flag === "--agent") {
        if (agents.has(value))
          unexpected ??= {
            field: "agent",
            message: `Duplicate --agent value: ${value}. List each agent once.`,
          };
        agents.add(value);
      }
    } else if (token !== "--no-global")
      unexpected ??= {
        field: "arguments",
        message: `Unexpected argument: ${token}`,
      };
  }
  // Incur handles these after its registration builtin, so forwarding them
  // would turn a discovery request into an actual settings write.
  const unsupportedDiscovery =
    flags.has("--schema") ||
    (flags.has("--version") && !command.includes("--version"));
  const failure =
    missing ??
    unexpected ??
    (unsupportedDiscovery
      ? {
          field: "arguments",
          message:
            "MCP registration does not support --schema or --version. Use 'rea mcp add --help' without changing settings.",
        }
      : undefined);
  if (failure !== undefined) {
    const message = redactExplicitText(
      failure.message,
      declaredSensitiveValues(command),
    );
    write(
      renderCliDocument(
        {
          code: "VALIDATION_ERROR",
          message,
          fieldErrors: [
            {
              code: "invalid_value",
              missing: false,
              path: failure.field,
              message,
            },
          ],
        },
        CLI_OUTPUT_FORMATS.find((format) => format === output.format) ?? "toon",
        process.stdout.isTTY === true,
      ),
    );
    exit(1);
    return undefined;
  }
  return normalized.flatMap((token, index) => expanded.get(index) ?? [token]);
};

import { z } from "incur";

import {
  executableFormatHintSchema,
  type ExecutableFormatHint,
} from "../domain/dosCom.js";
import type { BinaryArchitecture } from "../domain/binaryTargetTypes.js";
import {
  binaryArchitectureSchema,
  rawBinaryEntryPointSchema,
} from "../domain/rawBinary.js";
import { analysisProviderSelectorSchema } from "../contracts/providerSelection.js";
import type { AnalysisProviderSelector } from "../contracts/providerSelection.js";
import type { Logger } from "pino";

/** Decimal argv text; leading zeros retain decimal meaning. */
const DECIMAL_INTEGER_TOKEN = /^[0-9]+$/u;

type DecimalWrapper =
  | { readonly kind: "default" | "prefault"; readonly value: () => unknown }
  | {
      readonly kind: "optional" | "exactOptional" | "nullable" | "readonly";
    };

/** Parse decimal integer tokens before Number coercion can erase their syntax. */
export const cliIntegerArgument = (min: number) =>
  z
    .string()
    .regex(DECIMAL_INTEGER_TOKEN, "Expected a decimal integer")
    .pipe(z.coerce.number<string>().safe().min(min));

const decimalToken = (domain: z.ZodNumber) =>
  z
    .string()
    .regex(DECIMAL_INTEGER_TOKEN, "Expected a decimal integer")
    .pipe(z.coerce.number<string>())
    .pipe(domain);

const unwrapSchema = (field: { unwrap: () => unknown }): z.ZodType => {
  const unwrapped = field.unwrap();
  if (!(unwrapped instanceof z.ZodType))
    throw new Error("Expected a classic Zod schema inside a numeric field");
  return unwrapped;
};

/** Incur advertises output schemas; retain the decimal input guard as metadata. */
const publishDecimalInput = (field: z.ZodType): z.ZodType => {
  const { $schema: _dialect, ...inputSchema } = z.toJSONSchema(field, {
    io: "input",
  });
  return field.meta(inputSchema);
};

const numericStack = (
  field: z.ZodType,
):
  | {
      readonly core: z.ZodNumber;
      readonly wrappers: readonly DecimalWrapper[];
      readonly description: string | undefined;
    }
  | undefined => {
  const wrappers: DecimalWrapper[] = [];
  let description: string | undefined;
  let current = field;
  for (;;) {
    if (description === undefined && current.description !== undefined)
      description = current.description;
    if (current instanceof z.ZodDefault) {
      const original = current;
      wrappers.push({
        kind: "default",
        value: () => original.def.defaultValue,
      });
      current = unwrapSchema(current);
      continue;
    }
    if (current instanceof z.ZodPrefault) {
      const original = current;
      wrappers.push({
        kind: "prefault",
        value: () => original.def.defaultValue,
      });
      current = unwrapSchema(current);
      continue;
    }
    if (current instanceof z.ZodOptional) {
      wrappers.push({ kind: "optional" });
      current = unwrapSchema(current);
      continue;
    }
    if (current instanceof z.ZodExactOptional) {
      wrappers.push({ kind: "exactOptional" });
      current = unwrapSchema(current);
      continue;
    }
    if (current instanceof z.ZodNullable) {
      wrappers.push({ kind: "nullable" });
      current = unwrapSchema(current);
      continue;
    }
    if (current instanceof z.ZodReadonly) {
      wrappers.push({ kind: "readonly" });
      current = unwrapSchema(current);
      continue;
    }
    break;
  }
  return current instanceof z.ZodNumber
    ? { core: current, wrappers, description }
    : undefined;
};

const applyDecimalWrappers = (
  field: z.ZodType,
  wrappers: readonly DecimalWrapper[],
): z.ZodType => {
  let admitted = field;
  for (const wrapper of wrappers.toReversed()) {
    if (wrapper.kind === "nullable") admitted = admitted.nullable();
    else if (wrapper.kind === "optional") admitted = admitted.optional();
    else if (wrapper.kind === "exactOptional")
      admitted = admitted.exactOptional();
    else if (wrapper.kind === "readonly") admitted = admitted.readonly();
    else if (wrapper.kind === "prefault")
      admitted = admitted.prefault(wrapper.value);
    else if (wrapper.kind === "default")
      admitted = admitted.default(wrapper.value);
  }
  return admitted;
};

/**
 * Admit decimal CLI text and JSON numbers through the domain field's bounds,
 * defaults, nullability and description.
 */
export const cliDecimalField = <Field extends z.ZodType>(
  field: Field,
): z.ZodType<z.output<Field>> => {
  const numeric = numericStack(field);
  if (numeric === undefined)
    throw new Error(
      `cliDecimalField expected a numeric domain field, received ${field.constructor.name}`,
    );
  // Only JSON numbers may use this branch; a coercing domain must not consume
  // argv text or booleans before the decimal token guard sees them.
  const numericValue = numeric.core.clone({
    ...numeric.core.def,
    coerce: false,
  });
  const admitted = applyDecimalWrappers(
    z.union([numericValue, decimalToken(numeric.core)]),
    numeric.wrappers,
  );
  const described =
    numeric.description === undefined
      ? admitted
      : admitted.describe(numeric.description);
  // Replacing the numeric input branch preserves the domain field's output.
  return publishDecimalInput(described) as z.ZodType<z.output<Field>>;
};

/** Adapt numeric properties of a shared shape; retain other schemas unchanged. */
export const cliDecimalShape = <Shape extends Record<string, z.ZodType>>(
  shape: Shape,
): { [Key in keyof Shape]: z.ZodType<z.output<Shape[Key]>> } =>
  Object.fromEntries(
    Object.entries(shape).map(([key, field]) => [
      key,
      numericStack(field) === undefined ? field : cliDecimalField(field),
    ]),
  ) as { [Key in keyof Shape]: z.ZodType<z.output<Shape[Key]>> };

export const providerSelectionOption = analysisProviderSelectorSchema
  .optional()
  .describe(
    "Bind deep analysis to a provider ID or use deterministic auto selection",
  );

/** Optional path to the local analysis snapshot loaded or updated by a command. */
export const snapshotSelectionOption = z
  .string()
  .min(1)
  .optional()
  .describe("Load and update a local analysis snapshot");

/** Explicit interpretation for headerless native executable formats. */
export const formatSelectionOption = executableFormatHintSchema
  .optional()
  .describe(
    "Explicit interpretation: dos-com or raw-binary (headerless), or gamecube-dol (GameCube/Wii DOL, never auto-detected); omission preserves header-based detection",
  );

export const architectureSelectionOption = binaryArchitectureSchema
  .optional()
  .describe(
    "Caller-supplied CPU family; required with --target-format raw-binary, must be omitted with gamecube-dol",
  );

export const entryPointSelectionOption = rawBinaryEntryPointSchema
  .optional()
  .describe(
    "Caller-supplied load and entry address (0xhex); required with --target-format raw-binary, optional with gamecube-dol (must equal the DOL header entry)",
  );

/** Shared CLI flags that bind a native target interpretation. */
export const nativeOpenOptionFields = {
  "target-format": formatSelectionOption,
  architecture: architectureSelectionOption,
  "entry-point": entryPointSelectionOption,
  provider: providerSelectionOption,
};

/** Native CLI flags consumed when opening a target for one-shot analysis. */
export interface NativeOpenCliFlags {
  readonly snapshot?: string | undefined;
  readonly provider?: AnalysisProviderSelector | undefined;
  readonly "target-format"?: ExecutableFormatHint | undefined;
  readonly architecture?: BinaryArchitecture | undefined;
  readonly "entry-point"?: string | undefined;
}

/** Map native CLI flags onto the shared one-shot analysis options. */
export const directAnalysisOptionsFromCli = (
  logger: Logger,
  options: NativeOpenCliFlags,
) => ({
  logger,
  snapshotPath: options.snapshot,
  ...(options["target-format"] === undefined
    ? {}
    : { formatHint: options["target-format"] }),
  ...(options.architecture === undefined
    ? {}
    : { architecture: options.architecture }),
  ...(options["entry-point"] === undefined
    ? {}
    : { entryPoint: options["entry-point"] }),
  ...(options.provider === undefined ? {} : { providerId: options.provider }),
});

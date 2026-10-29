import { localPathStringSchema } from "../domain/localPath.js";
import { selectHumanText } from "./localization.js";
import { absoluteCallerPath } from "../filesystem/callerPath.js";
import { z } from "incur";
import { AnalysisInputError } from "../domain/analysisErrorCore.js";
import { err } from "../domain/result.js";
import { createIl2cppMetadataService } from "../composition/il2cpp.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { logCliCommand } from "../cliLogging.js";
import type { Logger } from "pino";
import type { CliInstance } from "./types.js";
import { withCommandCancellation } from "./commandCancellation.js";
import {
  analysisEvidenceDeliveryOptions,
  deliverCliAnalysisEvidence,
} from "./analysisEvidenceDelivery.js";

/** CLI and MCP share inspection; one-shot summaries preserve a complete Evidence file. */
export const registerIl2cppCommands = (
  cli: CliInstance,
  logger: Logger,
): void => {
  cli.command(CLI_COMMANDS.inspectIl2cppMetadata, {
    description: selectHumanText(
      "Inventory IL2CPP global-metadata.dat names, owners and string literals, optionally linking method addresses from the native binary",
      "列出 IL2CPP global-metadata.dat 的名称、归属和字符串字面量，可关联原生二进制中的方法地址",
    ),
    args: z.object({
      path: localPathStringSchema.describe(
        selectHumanText(
          "Local global-metadata.dat (version 24, 27, 29, 31 or 39)",
          "本地 global-metadata.dat（版本 24、27、29、31 或 39）",
        ),
      ),
    }),
    options: z.object({
      ...analysisEvidenceDeliveryOptions,
      binary: localPathStringSchema
        .optional()
        .describe(
          selectHumanText(
            "Matching native binary (Mach-O GameAssembly.dylib, PE GameAssembly.dll or ELF libil2cpp.so) to link method addresses; read only",
            "用于关联方法地址的匹配原生二进制（Mach-O GameAssembly.dylib、PE GameAssembly.dll 或 ELF libil2cpp.so）；只读",
          ),
        ),
      architecture: z
        .enum(["arm64", "amd64"])
        .optional()
        .describe(
          selectHumanText(
            "Slice of a universal Mach-O binary",
            "通用 Mach-O 二进制的架构切片",
          ),
        ),
      genericInstances: z
        .boolean()
        .optional()
        .describe(
          selectHumanText(
            "Also link generic method instances (Type<Args>$$Method<Args>) and include them in --ghidra-seeds; needs --binary",
            "同时关联泛型方法实例（Type<Args>$$Method<Args>）并纳入 --ghidra-seeds；需要 --binary",
          ),
        ),
      ghidraSeeds: localPathStringSchema
        .optional()
        .describe(
          selectHumanText(
            "Also write REA_GHIDRA_SEED_FILE function seeds named Type$$Method for every linked method; needs --binary",
            "另行写入供 REA_GHIDRA_SEED_FILE 使用的函数种子，以 Type$$Method 命名各个已关联方法；需要 --binary",
          ),
        ),
      seedBase: z
        .string()
        .regex(/^0x[0-9a-fA-F]{1,16}$/u)
        .optional()
        .describe(
          selectHumanText(
            "Address Ghidra loads the binary at; seeds are seed-base + RVA (default: Ghidra's loader default, 0x100000 for an ELF linked at 0, else the link base)",
            "Ghidra 加载二进制的基址；种子地址为 seed-base + RVA（默认遵循 Ghidra 加载器：链接于 0 的 ELF 使用 0x100000，其余使用链接基址）",
          ),
        ),
    }),
    run: ({ args, options }) =>
      withCommandCancellation((signal) =>
        logCliCommand(logger, CLI_COMMANDS.inspectIl2cppMetadata, async () => {
          const service = createIl2cppMetadataService();
          return deliverCliAnalysisEvidence({
            run: () => {
              const input = {
                path: absoluteCallerPath(args.path),
                detail: "complete" as const,
                ...(options.binary === undefined
                  ? {}
                  : { binary_path: absoluteCallerPath(options.binary) }),
                ...(options.architecture === undefined
                  ? {}
                  : { binary_architecture: options.architecture }),
                ...(options.genericInstances === true
                  ? { generic_instances: true }
                  : {}),
              };
              if (options.ghidraSeeds !== undefined)
                return service.inspectWithGhidraSeeds(
                  input,
                  {
                    path: absoluteCallerPath(options.ghidraSeeds),
                    ...(options.seedBase === undefined
                      ? {}
                      : { base: options.seedBase }),
                  },
                  { signal },
                );
              if (options.seedBase !== undefined)
                return Promise.resolve(
                  err(
                    new AnalysisInputError(
                      "inspect_il2cpp_metadata",
                      undefined,
                      [
                        {
                          path: ["seed_base"],
                          reason: "invalid_value",
                          message: "--seed-base requires --ghidra-seeds.",
                        },
                      ],
                    ),
                  ),
                );
              return service.inspect(input, { signal });
            },
            service,
            providerId: "il2cpp-metadata",
            operation: "inspect_il2cpp_metadata",
            signal,
            detail: options.detail,
            evidenceOutput: options.evidence_output,
          });
        }),
      ),
  });
};

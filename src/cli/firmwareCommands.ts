import { z } from "incur";
import { cliDecimalField } from "./options.js";
import { selectHumanText } from "./localization.js";
import { FirmwareAnalysisService } from "../application/firmware/FirmwareAnalysisService.js";
import { createFirmwareAnalysisProvider } from "../composition/firmware.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { logCliCommand } from "../cliLogging.js";
import { firmwareInputSchemas } from "../domain/firmware/firmwareAnalysis.js";
import { localPathStringSchema } from "../domain/localPath.js";
import type { FirmwareOperation } from "../domain/firmware/firmwareAnalysis.js";
import type { Logger } from "pino";
import type { CliInstance } from "./types.js";
import { withCommandCancellation } from "./commandCancellation.js";
import { absoluteCallerPath } from "../filesystem/callerPath.js";
import { finishAnalysisCommand } from "./finishAnalysisCommand.js";

/** One-shot firmware CLI commands backed by the same workflows as MCP. */
export const registerFirmwareCommands = (
  cli: CliInstance,
  logger: Logger,
  environment: Readonly<Record<string, string | undefined>>,
): void => {
  const service = new FirmwareAnalysisService(
    createFirmwareAnalysisProvider(environment),
  );
  const extractInput = firmwareInputSchemas.extract_firmware.shape;
  const range = extractInput.range.unwrap().shape;
  const execute = (
    name: string,
    operation: FirmwareOperation,
    input: unknown,
  ) =>
    withCommandCancellation((signal) =>
      logCliCommand(logger, name, () =>
        finishAnalysisCommand(
          () => service.execute(operation, input, { signal }),
          service,
          operation === "inspect_firmware_regions" ? "binwalk" : "unblob",
          operation,
          signal,
        ),
      ),
    );
  const path = localPathStringSchema.describe(
    selectHumanText(
      "Local firmware path; never executed",
      "本地固件文件路径，分析时不执行固件",
      environment,
    ),
  );
  const analysisTimeoutMs = cliDecimalField(
    extractInput.analysis_timeout_ms,
  ).describe(
    selectHumanText(
      extractInput.analysis_timeout_ms.description ?? "",
      "分析阶段的毫秒预算（默认 120000），不含排队及提取后的发布；固定 CPU、内存和字节限制仍适用",
      environment,
    ),
  );
  cli.command(CLI_COMMANDS.inspectFirmwareRegions, {
    description: selectHumanText(
      "Inspect firmware signature candidates without extracting them",
      "检查固件签名候选及其范围",
      environment,
    ),
    args: z.object({ path }),
    options: z.object({ analysisTimeoutMs }),
    run: ({ args, options }) =>
      execute(
        CLI_COMMANDS.inspectFirmwareRegions,
        "inspect_firmware_regions",
        // CLI paths are operator-relative; resolve before shared validation.
        {
          path: absoluteCallerPath(args.path),
          ...(options.analysisTimeoutMs === undefined
            ? {}
            : { analysis_timeout_ms: options.analysisTimeoutMs }),
        },
      ),
  });
  cli.command(CLI_COMMANDS.extractFirmware, {
    description: selectHumanText(
      "Extract selected firmware bytes and return verified files and provenance",
      "提取选定的固件字节，返回校验后的文件及来源",
      environment,
    ),
    args: z.object({
      path,
      outputDirectory: localPathStringSchema.describe(
        selectHumanText(
          "Absent output directory; parent must exist",
          "尚不存在的输出目录，父目录须已存在；已有目录会被拒绝",
          environment,
        ),
      ),
    }),
    options: z.object({
      offset: cliDecimalField(range.offset.optional()).describe(
        selectHumanText(
          "Selected byte offset; requires length",
          "起始字节偏移，须同时提供 length",
          environment,
        ),
      ),
      length: cliDecimalField(range.length.optional()).describe(
        selectHumanText(
          "Selected byte length; requires offset",
          "选定字节数，须同时提供 offset",
          environment,
        ),
      ),
      maxDepth: cliDecimalField(extractInput.max_depth).describe(
        selectHumanText(
          extractInput.max_depth.description ?? "",
          "提取深度（默认 3），达到上限时结果可能为部分覆盖",
          environment,
        ),
      ),
      maxOutputBytes: cliDecimalField(extractInput.max_output_bytes).describe(
        selectHumanText(
          extractInput.max_output_bytes.description ?? "",
          "提取暂存文件的字节预算（默认 268435456），检查间隔内可能短暂超出",
          environment,
        ),
      ),
      maxOutputFiles: cliDecimalField(extractInput.max_output_files).describe(
        selectHumanText(
          extractInput.max_output_files.description ?? "",
          "暂存条目预算（默认 10000），包含目录与链接",
          environment,
        ),
      ),
      publicationTimeoutMs: cliDecimalField(
        extractInput.publication_timeout_ms,
      ).describe(
        selectHumanText(
          extractInput.publication_timeout_ms.description ?? "",
          "提取与清单完成后的发布及最终清理毫秒预算（默认 120000）",
          environment,
        ),
      ),
      analysisTimeoutMs,
    }),
    run: ({ args, options }) =>
      execute(CLI_COMMANDS.extractFirmware, "extract_firmware", {
        path: absoluteCallerPath(args.path),
        output_directory: absoluteCallerPath(args.outputDirectory),
        ...(options.offset === undefined && options.length === undefined
          ? {}
          : { range: { offset: options.offset, length: options.length } }),
        max_depth: options.maxDepth,
        max_output_bytes: options.maxOutputBytes,
        max_output_files: options.maxOutputFiles,
        publication_timeout_ms: options.publicationTimeoutMs,
        ...(options.analysisTimeoutMs === undefined
          ? {}
          : { analysis_timeout_ms: options.analysisTimeoutMs }),
      }),
  });
};

import { selectHumanText } from "./localization.js";
import { localPathStringSchema } from "../domain/localPath.js";
import { compareWasmInterfaces } from "../application/wasm/WasmInterfaceComparisonService.js";
import { parseCliJsonInput } from "../cliJsonInput.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { z } from "incur";
import { wasmArtifactModule } from "../composition/wasm.js";
import { logCliCommand } from "../cliLogging.js";
import { projectAnalysisError } from "../domain/analysisErrorProjection.js";
import type { Logger } from "pino";
import type { CliInstance } from "./types.js";
import { withCommandCancellation } from "./commandCancellation.js";
import { absoluteCallerPath } from "../filesystem/callerPath.js";
import { finishAnalysisCommand } from "./finishAnalysisCommand.js";
import {
  inspectWasmArtifactInputSchema,
  wasmArtifactPathsSchema,
} from "../domain/wasm/wasmArtifact.js";

/** Resolve all caller-selected artifact paths through the shared workflow. */
export const registerWasmCommands = (
  cli: CliInstance,
  logger: Logger,
  environment: Readonly<NodeJS.ProcessEnv>,
): void => {
  cli.command(CLI_COMMANDS.compareWasmInterfaces, {
    description: selectHumanText(
      "Compare core WASM interfaces from two exact inspection Evidence records",
      "比较两份精确检查证据中的 WASM 核心接口",
      environment,
    ),
    args: z.object({
      input: z
        .string()
        .describe(
          selectHumanText(
            "Inline JSON or input file containing left/right complete Evidence and required scope",
            "内联 JSON 或 JSON 文件路径，包含 left/right 完整 Evidence 及必填 scope",
            environment,
          ),
        ),
    }),
    run: ({ args }) =>
      withCommandCancellation(async (signal) =>
        logCliCommand(logger, CLI_COMMANDS.compareWasmInterfaces, async () => {
          const input = await parseCliJsonInput(
            args.input,
            "compare_wasm_interfaces",
            signal,
          );
          if (!input.ok) return input.error;
          const result = await compareWasmInterfaces(input.value, { signal });
          return result.ok ? result.value : projectAnalysisError(result.error);
        }),
      ),
  });
  const service = wasmArtifactModule.create(environment);
  cli.command(wasmArtifactModule.cliCommand, {
    description: selectHumanText(
      "Inspect an explicit local WASM artifact with WABT",
      "使用 WABT 检查指定的本地 WASM 文件",
      environment,
    ),
    args: z.object({
      path: localPathStringSchema.describe(
        selectHumanText("Local WASM artifact", "本地 WASM 文件", environment),
      ),
    }),
    options: z.object({
      commandTimeoutMs:
        inspectWasmArtifactInputSchema.shape.command_timeout_ms.describe(
          selectHumanText(
            inspectWasmArtifactInputSchema.shape.command_timeout_ms
              .description ?? "WABT command deadline in milliseconds",
            "每条 WABT 版本探测或分析命令的超时毫秒数（默认 30000），不是整次检查的总时限；客户端须为所有命令、文件检查和清理预留时间。固定输入/输出安全限制不变。",
            environment,
          ),
        ),
      glue_paths: wasmArtifactPathsSchema(localPathStringSchema)
        .optional()
        .describe(
          selectHumanText(
            "Selected local JavaScript glue paths",
            "指定本地 JavaScript 胶水代码路径",
            environment,
          ),
        ),
      candidate_paths: wasmArtifactPathsSchema(localPathStringSchema)
        .optional()
        .describe(
          selectHumanText(
            "Explicit local WASM candidates",
            "指定本地 WASM 候选文件",
            environment,
          ),
        ),
    }),
    run: ({ args, options }) =>
      withCommandCancellation((signal) =>
        logCliCommand(logger, wasmArtifactModule.cliCommand, () =>
          finishAnalysisCommand(
            () =>
              service.inspect(
                {
                  path: absoluteCallerPath(args.path),
                  ...(options.commandTimeoutMs === undefined
                    ? {}
                    : { command_timeout_ms: options.commandTimeoutMs }),
                  glue_paths: options.glue_paths?.map((path) =>
                    absoluteCallerPath(path),
                  ),
                  candidate_paths: options.candidate_paths?.map((path) =>
                    absoluteCallerPath(path),
                  ),
                },
                { signal },
              ),
            service,
            "wabt-artifact",
            "inspect_wasm_artifact",
            signal,
          ),
        ),
      ),
  });
};

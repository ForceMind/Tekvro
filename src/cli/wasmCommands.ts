import { selectHumanText } from "./localization.js";
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
          "Inline JSON or input file containing left/right complete Evidence and required scope",
        ),
    }),
    run: ({ args }) =>
      withCommandCancellation(async (signal) =>
        logCliCommand(logger, CLI_COMMANDS.compareWasmInterfaces, async () => {
          const input = await parseCliJsonInput(
            args.input,
            "compare_wasm_interfaces",
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
      path: z
        .string()
        .describe(
          selectHumanText("Local WASM artifact", "本地 WASM 文件", environment),
        ),
    }),
    options: z.object({
      glue_paths: z
        .array(z.string())
        .optional()
        .describe(
          selectHumanText(
            "Selected local JavaScript glue paths",
            "指定本地 JavaScript 胶水代码路径",
            environment,
          ),
        ),
      candidate_paths: z
        .array(z.string())
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

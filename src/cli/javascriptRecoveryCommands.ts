import { z } from "incur";
import { JavaScriptRecoveryService } from "../application/javascript/JavaScriptRecoveryService.js";
import { createJavaScriptRecoveryProvider } from "../composition/javascriptRecovery.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { logCliCommand } from "../cliLogging.js";
import { projectAnalysisError } from "../domain/analysisErrorProjection.js";
import type { Logger } from "../logger.js";
import type { CliInstance } from "./types.js";
import { withCommandCancellation } from "./commandCancellation.js";
import { selectHumanText } from "./localization.js";

/** Share source recovery with MCP while keeping CLI spelling at this boundary. */
export const registerJavaScriptRecoveryCommands = (
  cli: CliInstance,
  logger: Logger,
  environment: Readonly<Record<string, string | undefined>>,
): void => {
  const service = new JavaScriptRecoveryService(
    createJavaScriptRecoveryProvider(environment),
  );
  cli.command(CLI_COMMANDS.recoverJavaScriptSources, {
    description: selectHumanText(
      "Recover readable JavaScript modules with source provenance and verified files",
      "恢复可读 JavaScript 模块并保留来源及文件校验证据",
      environment,
    ),
    args: z.object({
      path: z
        .string()
        .describe(
          selectHumanText(
            "Absolute UTF-8 JavaScript input; never executed",
            "UTF-8 JavaScript 输入文件绝对路径（不会执行目标文件）",
            environment,
          ),
        ),
      outputDirectory: z
        .string()
        .describe(
          selectHumanText(
            "Absolute absent output directory",
            "尚不存在的输出目录绝对路径",
            environment,
          ),
        ),
    }),
    options: z.object({
      extractionMode: z
        .enum(["structural", "heuristic", "inspection"])
        .optional()
        .describe(
          selectHumanText(
            "Structural boundaries, heuristic fallback, or inspection-only regions",
            "选择结构化边界、启发式回退或仅检查区域",
            environment,
          ),
        ),
      rewriteLevel: z
        .enum(["minimal", "standard", "aggressive"])
        .optional()
        .describe(
          selectHumanText(
            "Upstream syntax recovery level; runtime equivalence remains unknown",
            "语法恢复程度（不保证恢复后与原运行行为等价）",
            environment,
          ),
        ),
    }),
    run: ({ args, options }) =>
      withCommandCancellation((signal) =>
        logCliCommand(
          logger,
          CLI_COMMANDS.recoverJavaScriptSources,
          async () => {
            const result = await service.recover(
              {
                path: args.path,
                output_directory: args.outputDirectory,
                ...(options.extractionMode === undefined
                  ? {}
                  : { extraction_mode: options.extractionMode }),
                ...(options.rewriteLevel === undefined
                  ? {}
                  : { rewrite_level: options.rewriteLevel }),
              },
              { signal },
            );
            return result.ok
              ? result.value
              : projectAnalysisError(result.error);
          },
        ),
      ),
  });
};

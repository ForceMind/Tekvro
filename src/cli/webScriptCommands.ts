import { Cli, z } from "incur";
import { selectHumanText } from "./localization.js";

import { exportWebScripts } from "../application/WebScriptExportService.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { logCliCommand } from "../cliLogging.js";
import { projectAnalysisError } from "../domain/analysisErrorProjection.js";
import type { Logger } from "../logger.js";

/** Register the local captured-script export CLI workflow. */
export const registerWebScriptCommands = (
  cli: ReturnType<typeof Cli.create>,
  logger: Logger,
): void => {
  cli.command(CLI_COMMANDS.exportWebScripts, {
    description: selectHumanText(
      "Export retained website scripts into an absent directory for static JavaScript analysis",
      "将已保留的网页脚本导出到新目录，供 JavaScript 静态分析",
    ),
    args: z.object({
      capturePath: z
        .string()
        .describe(
          selectHumanText(
            "Absolute path to saved page or scenario capture JSON",
            "已保存的页面或场景捕获 JSON 的绝对路径",
          ),
        ),
      outputDirectory: z
        .string()
        .describe(
          selectHumanText(
            "Absolute absent directory for verified scripts and manifest",
            "用于保存经校验脚本及清单的全新目录绝对路径",
          ),
        ),
    }),
    run: ({ args }) =>
      logCliCommand(logger, CLI_COMMANDS.exportWebScripts, async () => {
        const result = await exportWebScripts({
          capture_path: args.capturePath,
          output_directory: args.outputDirectory,
        });
        return result.ok
          ? result.value
          : {
              error: "Script export failed",
              ...projectAnalysisError(result.error),
            };
      }),
  });
};

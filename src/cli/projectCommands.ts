import { z } from "incur";
import type { Logger } from "pino";
import { createProjectService } from "../composition/project.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { parseCliJsonInput, resolveCliJsonPaths } from "../cliJsonInput.js";
import { logCliCommand } from "../cliLogging.js";
import { localPathStringSchema } from "../domain/localPath.js";
import { withCommandCancellation } from "./commandCancellation.js";
import { finishAnalysisCommand } from "./finishAnalysisCommand.js";
import { selectHumanText } from "./localization.js";
import type { CliInstance } from "./types.js";

/** Register local project metadata commands using the shared MCP workflows. */
export const registerProjectCommands = (
  cli: CliInstance,
  logger: Logger,
  environment: Readonly<NodeJS.ProcessEnv>,
): void => {
  for (const definition of [
    {
      command: CLI_COMMANDS.createProject,
      operation: "create_project",
      method: "create",
      en: "Create a durable local project in a new metadata directory",
      zh: "在新的元数据目录中创建持久化本地项目",
      inputEn:
        "JSON, JSON file, or '-' for stdin: {directory, project: {name, scope}}; scope paths must be absolute",
      inputZh:
        "JSON、JSON 文件或标准输入 '-'：{directory, project: {name, scope}}；scope 内路径须为绝对路径",
    },
    {
      command: CLI_COMMANDS.editProject,
      operation: "edit_project",
      method: "edit",
      en: "Append a project metadata edit using its exact previous revision token",
      zh: "使用此前读取的精确修订令牌追加项目元数据编辑",
      inputEn:
        "JSON, JSON file, or '-' for stdin: {directory, expected: {project_id, revision, digest}, edit}; scope changes require change_reason",
      inputZh:
        "JSON、JSON 文件或标准输入 '-'：{directory, expected: {project_id, revision, digest}, edit}；范围变更须提供 change_reason",
    },
  ] as const) {
    cli.command(definition.command, {
      description: selectHumanText(definition.en, definition.zh, environment),
      args: z.object({
        input: z
          .string()
          .describe(
            selectHumanText(
              definition.inputEn,
              definition.inputZh,
              environment,
            ),
          ),
      }),
      run: ({ args }) =>
        withCommandCancellation((signal) =>
          logCliCommand(logger, definition.command, async () => {
            const parsed = await parseCliJsonInput(
              args.input,
              definition.operation,
              signal,
            );
            if (!parsed.ok) return parsed.error;
            const input = resolveCliJsonPaths(parsed.value, [["directory"]]);
            const service = createProjectService();
            return finishAnalysisCommand(
              () => service[definition.method](input, { signal }),
              service,
              "project",
              definition.operation,
              signal,
            );
          }),
        ),
    });
  }

  cli.command(CLI_COMMANDS.inspectProject, {
    description: selectHumanText(
      "Validate a local project's revision history and read its current edit token",
      "校验本地项目的修订历史并读取当前编辑令牌",
      environment,
    ),
    args: z.object({
      directory: localPathStringSchema.describe(
        selectHumanText(
          "Local project metadata directory",
          "本地项目元数据目录",
          environment,
        ),
      ),
    }),
    run: ({ args }) =>
      withCommandCancellation((signal) =>
        logCliCommand(logger, CLI_COMMANDS.inspectProject, () => {
          const service = createProjectService();
          const input = resolveCliJsonPaths({ directory: args.directory }, [
            ["directory"],
          ]);
          return finishAnalysisCommand(
            () => service.inspect(input, { signal }),
            service,
            "project",
            "inspect_project",
            signal,
          );
        }),
      ),
  });
};

import type { Logger } from "pino";
import { z } from "zod";
import { createProjectRunService } from "../composition/project.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { parseCliJsonInput, resolveCliJsonPaths } from "../cliJsonInput.js";
import { logCliCommand } from "../cliLogging.js";
import { withCommandCancellation } from "./commandCancellation.js";
import { finishAnalysisCommand } from "./finishAnalysisCommand.js";
import { selectHumanText } from "./localization.js";
import type { CliInstance } from "./types.js";

const definitions = [
  {
    command: CLI_COMMANDS.buildProject,
    operation: "build_project",
    method: "build",
    en: "Run one bounded Builder attempt and save its pending independent check",
    zh: "执行一次有限预算的构建并保存待独立检查边界",
    fields:
      "{directory, expected: project token, instruction, checker_path, model?, budget?}",
  },
  {
    command: CLI_COMMANDS.checkProject,
    operation: "check_project",
    method: "checkPending",
    en: "Execute the saved pending independent check without replaying the Builder",
    zh: "执行已保存的待独立检查，不重复构建",
    fields: "{directory, run_id, expected: run token, checker_path}",
  },
  {
    command: CLI_COMMANDS.refineProject,
    operation: "refine_project",
    method: "refine",
    en: "Request one further Builder attempt after a recorded check, within finite limits",
    zh: "在记录检查后请求一次修正，遵守有限预算",
    fields:
      "{directory, run_id, expected: run token, checker_path, instruction}",
  },
  {
    command: CLI_COMMANDS.resumeProjectBuild,
    operation: "resume_project_build",
    method: "resumeBuild",
    en: "Continue a safe paused workflow with one new Builder attempt, not a Codex session resume",
    zh: "从安全暂停边界发起一次新构建；不恢复 Codex 会话",
    fields:
      "{directory, run_id, expected: run token, checker_path, instruction}",
  },
  {
    command: CLI_COMMANDS.inspectProjectRun,
    operation: "inspect_project_run",
    method: "inspect",
    en: "Validate and read one persisted run without launching a process",
    zh: "校验并读取持久化运行记录，不启动进程",
    fields: "{directory, run_id}",
  },
  {
    command: CLI_COMMANDS.adjustProjectRunBudget,
    operation: "adjust_project_run_budget",
    method: "adjustBudget",
    en: "Record finite budget limits and a reason without automatically continuing work",
    zh: "记录有限预算与调整原因，不自动继续执行",
    fields: "{directory, run_id, expected: run token, budget, reason}",
  },
] as const;

/** Keep path normalization and delivery at the transport edge; lifecycle stays in the shared service. */
export const registerProjectRunCommands = (
  cli: CliInstance,
  logger: Logger,
  environment: Readonly<NodeJS.ProcessEnv>,
): void => {
  for (const definition of definitions)
    cli.command(definition.command, {
      description: selectHumanText(definition.en, definition.zh, environment),
      args: z.object({
        input: z
          .string()
          .describe(
            selectHumanText(
              `JSON, JSON file, or '-' for stdin: ${definition.fields}; local directory/checker_path resolve from the caller's working directory`,
              `JSON、JSON 文件或标准输入 '-'：${definition.fields}；directory/checker_path 相对调用目录解析`,
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
            const input = resolveCliJsonPaths(parsed.value, [
              ["directory"],
              ["checker_path"],
            ]);
            const service = createProjectRunService(environment);
            return finishAnalysisCommand(
              () => service[definition.method](input, signal),
              service,
              "project",
              definition.operation,
              signal,
            );
          }),
        ),
    });
};

import { z } from "incur";
import { createSqliteDatabaseService } from "../composition/sqlite.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { logCliCommand } from "../cliLogging.js";
import type { Logger } from "pino";
import type { CliInstance } from "./types.js";
import { withCommandCancellation } from "./commandCancellation.js";
import { localPathStringSchema } from "../domain/localPath.js";
import { absoluteCallerPath } from "../filesystem/callerPath.js";
import { finishAnalysisCommand } from "./finishAnalysisCommand.js";
import { inspectSqliteDatabaseInputSchema } from "../domain/sqlite/sqliteDatabase.js";
import { selectHumanText } from "./localization.js";
import { cliDecimalField } from "./options.js";

/** Resolve an operator-selected SQLite snapshot through the shared inspection workflow. */
export const registerSqliteCommands = (
  cli: CliInstance,
  logger: Logger,
  environment: Readonly<NodeJS.ProcessEnv>,
): void => {
  const service = createSqliteDatabaseService(environment);
  cli.command(CLI_COMMANDS.inspectSqliteDatabase, {
    description: selectHumanText(
      "Inspect SQLite schema and optional ordinary-table rows from a local snapshot",
      "检查本地 SQLite 快照的结构，并可选读取普通表行样本",
      environment,
    ),
    args: z.object({
      path: localPathStringSchema.describe(
        selectHumanText(
          "Local SQLite database snapshot",
          "本地离线 SQLite 数据库快照路径",
          environment,
        ),
      ),
    }),
    options: z.object({
      workerTimeoutMs: cliDecimalField(
        inspectSqliteDatabaseInputSchema.shape.worker_timeout_ms,
      ).describe(
        selectHumanText(
          inspectSqliteDatabaseInputSchema.shape.worker_timeout_ms
            .description ?? "SQLite worker deadline in milliseconds",
          "工作进程启动、查询和写出回复的超时毫秒数（默认 30000），不含快照获取，也不是整次调用的总时限；客户端须为获取、读取回复、清理和交付预留时间。固定字节/堆限制不变。",
          environment,
        ),
      ),
      table: z
        .string()
        .optional()
        .describe(
          selectHumanText(
            "Exact ordinary table name to read",
            "要读取的普通表精确名称；不执行视图、虚拟表或影子表",
            environment,
          ),
        ),
      column: z
        .array(z.string())
        .optional()
        .describe(
          selectHumanText(
            "Repeat to select exact row columns in the requested order; requires table",
            "重复指定精确列名，按指定顺序返回；须同时提供 table",
            environment,
          ),
        ),
      schemaScope: z
        .enum(["inventory", "selected_table", "database"])
        .optional()
        .describe(
          selectHumanText(
            "Compact inventory by default, or selected-table details when table is supplied; database requests full schema",
            "默认返回精简清单；提供 table 时默认返回所选表结构。selected_table 须提供 table；database 请求完整数据库结构",
            environment,
          ),
        ),
      rowLimit: cliDecimalField(
        inspectSqliteDatabaseInputSchema.shape.row_limit,
      ).describe(
        selectHumanText(
          "Positive safe integer row count; default 20; requires table",
          "行样本数量，须为正安全整数；默认 20，须提供 table，仍受字节及工作进程资源限制",
          environment,
        ),
      ),
    }),
    run: ({ args, options }) =>
      withCommandCancellation((signal) =>
        logCliCommand(logger, CLI_COMMANDS.inspectSqliteDatabase, () =>
          finishAnalysisCommand(
            () =>
              service.inspect(
                {
                  path: absoluteCallerPath(args.path),
                  ...(options.workerTimeoutMs === undefined
                    ? {}
                    : { worker_timeout_ms: options.workerTimeoutMs }),
                  ...(options.table === undefined
                    ? {}
                    : { table: options.table }),
                  ...(options.rowLimit === undefined
                    ? {}
                    : { row_limit: options.rowLimit }),
                  ...(options.column === undefined
                    ? {}
                    : { columns: options.column }),
                  ...(options.schemaScope === undefined
                    ? {}
                    : { schema_scope: options.schemaScope }),
                },
                { signal },
              ),
            service,
            "sqlite",
            "inspect_sqlite_database",
            signal,
          ),
        ),
      ),
  });
};

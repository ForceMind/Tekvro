import { selectHumanText } from "./localization.js";
import { inspectSignalDecodersInputSchema } from "../domain/signals/signalDecoders.js";
import { z } from "incur";
import type { SignalRecordingService } from "../application/signals/SignalRecordingService.js";
import { createSignalRecordingService } from "../composition/signals.js";
import {
  signalRecordingOptionsSchema,
  signalRecordingSelectorBudgetIssue,
  withinSignalRecordingSelectorBudget,
} from "../domain/signals/signalRecording.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { logCliCommand } from "../cliLogging.js";
import type { Logger } from "pino";
import type { CliInstance } from "./types.js";
import { withCommandCancellation } from "./commandCancellation.js";
import { finishAnalysisCommand } from "./finishAnalysisCommand.js";
import { localPathStringSchema } from "../domain/localPath.js";
import { absoluteCallerPath } from "../filesystem/callerPath.js";
export const registerSignalCommands = (
  cli: CliInstance,
  logger: Logger,
  environment: Readonly<NodeJS.ProcessEnv>,
  service: Pick<
    SignalRecordingService,
    "decode" | "inspectDecoders" | "close"
  > = createSignalRecordingService(environment),
): void => {
  cli.command(CLI_COMMANDS.inspectSignalDecoders, {
    description: selectHumanText(
      "Search installed sigrok decoders or selected decoder help",
      "搜索已安装的 sigrok 解码器或指定解码器的帮助",
      environment,
    ),
    options: z
      .object({
        ...inspectSignalDecodersInputSchema.shape,
        limit: z
          .number()
          .int()
          .positive()
          .max(Number.MAX_SAFE_INTEGER)
          .optional()
          .describe(
            selectHumanText(
              "Maximum matching decoders or help lines to return; defaults to 50",
              "最多返回的匹配解码器或帮助行数；默认 50",
              environment,
            ),
          ),
        all: z
          .boolean()
          .default(false)
          .describe(
            selectHumanText(
              "Return all remaining matches",
              "返回全部剩余匹配项",
              environment,
            ),
          ),
      })
      .superRefine((options, context) => {
        if (options.all && options.limit !== undefined)
          context.addIssue({
            code: "custom",
            path: ["all"],
            message: "all and limit are mutually exclusive",
          });
      }),
    run: ({ options: { all, ...options } }) =>
      withCommandCancellation((signal) =>
        logCliCommand(logger, CLI_COMMANDS.inspectSignalDecoders, async () =>
          finishAnalysisCommand(
            () =>
              service.inspectDecoders(
                { ...options, ...(all ? { limit: null } : {}) },
                { signal },
              ),
            service,
            "sigrok-recording",
            "inspect_signal_decoders",
            signal,
          ),
        ),
      ),
  });
  cli.command(CLI_COMMANDS.decodeSignalRecording, {
    description: selectHumanText(
      "Decode an existing signal recording with caller-supplied sigrok",
      "使用调用方提供的 sigrok 解码已有信号录制文件",
      environment,
    ),
    args: z.object({
      path: localPathStringSchema.describe(
        selectHumanText(
          "Local signal recording",
          "本地信号录制文件",
          environment,
        ),
      ),
    }),
    options: z
      .object({
        ...signalRecordingOptionsSchema.shape,
        line_limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            selectHumanText(
              "Returned output lines per page; default 50",
              "每页返回的输出行数；默认 50",
              environment,
            ),
          ),
        all_lines: z
          .boolean()
          .default(false)
          .describe(
            selectHumanText(
              "Return all remaining output lines instead of a bounded page",
              "返回全部剩余输出行，不按页限制",
              environment,
            ),
          ),
      })
      .superRefine((options, context) => {
        if (options.all_lines && options.line_limit !== undefined)
          context.addIssue({
            code: "custom",
            path: ["all_lines"],
            message: "all_lines and line_limit are mutually exclusive",
          });
      })
      .refine(
        withinSignalRecordingSelectorBudget,
        signalRecordingSelectorBudgetIssue,
      ),
    run: ({ args, options: { all_lines, ...options } }) =>
      withCommandCancellation((signal) =>
        logCliCommand(logger, CLI_COMMANDS.decodeSignalRecording, async () => {
          return finishAnalysisCommand(
            () =>
              service.decode(
                {
                  ...options,
                  ...(all_lines ? { line_limit: null } : {}),
                  path: absoluteCallerPath(args.path),
                },
                { signal },
              ),
            service,
            "sigrok-recording",
            "decode_signal_recording",
            signal,
          );
        }),
      ),
  });
};

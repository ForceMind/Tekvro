import { cliDecimalField } from "./options.js";
import { selectHumanText } from "./localization.js";
import { z } from "incur";

import { FridaInstrumentationService } from "../application/frida/FridaInstrumentationService.js";
import type {
  FridaInstrumentationPort,
  FridaRemoteConnection,
} from "../application/frida/FridaInstrumentationPort.js";
import { FridaInstrumentationManager } from "../frida/FridaInstrumentationManager.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { logCliCommand } from "../cliLogging.js";
import { projectAnalysisError } from "../domain/analysisErrorProjection.js";
import { AnalysisInputError } from "../domain/analysisErrorCore.js";
import { ok } from "../domain/result.js";
import { FRIDA_KEEPALIVE_INTERVAL_DESCRIPTION } from "../contracts/fridaToolContracts.js";
import { isValidFridaRemoteAddress } from "../contracts/fridaRemoteAddress.js";
import type { Logger } from "pino";
import type { CliInstance } from "./types.js";
import { withCommandCancellation } from "./commandCancellation.js";
import { finishAnalysisCommand } from "./finishAnalysisCommand.js";

/** Script sources stay optional in the options schema; exactly one is required. */
const exactlyOneScriptSource =
  "Provide exactly one of --script or --script-file.";

/** Register Frida discovery and one-shot instrumentation CLI operations. */
export const registerFridaCommands = (
  cli: CliInstance,
  logger: Logger,
  provider: FridaInstrumentationPort = new FridaInstrumentationManager(),
): void => {
  const service = new FridaInstrumentationService(provider);
  // CLI calls own a disposable provider; MCP retains its shared provider until
  // server shutdown. Await cleanup here, including failed startup resources.
  const cleanup = { close: () => provider.closeAll() };
  const remoteOptions = z.object({
    remoteAddress: z
      .string()
      .min(1)
      .max(2048)
      .refine(isValidFridaRemoteAddress)
      .optional()
      .describe(
        selectHumanText(
          "Remote Frida host address, optionally with a port",
          "远程 Frida 主机地址，可包含端口",
        ),
      ),
    token: z
      .string()
      .min(1)
      .optional()
      .describe(
        selectHumanText(
          "Remote authentication token; requires --remote-address",
          "远程认证令牌；需要 --remote-address",
        ),
      ),
    certificate: z
      .string()
      .min(1)
      .optional()
      .describe(
        selectHumanText(
          "Remote TLS certificate; requires --remote-address",
          "远程 TLS 证书；需要 --remote-address",
        ),
      ),
    origin: z
      .string()
      .min(1)
      .optional()
      .describe(
        selectHumanText(
          "Remote connection origin; requires --remote-address",
          "远程连接来源；需要 --remote-address",
        ),
      ),
    keepaliveInterval: cliDecimalField(
      z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          selectHumanText(
            FRIDA_KEEPALIVE_INTERVAL_DESCRIPTION +
              "; positive integer; requires --remote-address",
            "远程保活间隔，单位秒；正整数，需要 --remote-address",
          ),
        ),
    ),
  });
  const remoteFrom = (
    options: z.infer<typeof remoteOptions>,
  ): FridaRemoteConnection | undefined =>
    options.remoteAddress === undefined
      ? undefined
      : {
          address: options.remoteAddress,
          ...(options.token === undefined ? {} : { token: options.token }),
          ...(options.certificate === undefined
            ? {}
            : { certificate: options.certificate }),
          ...(options.origin === undefined ? {} : { origin: options.origin }),
          ...(options.keepaliveInterval === undefined
            ? {}
            : { keepaliveInterval: options.keepaliveInterval }),
        };

  const remoteAddressRequired = (
    options: z.infer<typeof remoteOptions>,
  ): boolean =>
    options.remoteAddress !== undefined ||
    (options.token === undefined &&
      options.certificate === undefined &&
      options.origin === undefined &&
      options.keepaliveInterval === undefined);

  cli.command(CLI_COMMANDS.listFridaDevices, {
    description: selectHumanText(
      "List local Frida devices and an optional remote endpoint",
      "列出本地 Frida 设备及可选远程端点；发现设备不代表已取得插桩权限",
    ),
    args: z.object({}),
    options: remoteOptions.refine(
      remoteAddressRequired,
      "Remote credentials and connection options require remoteAddress",
    ),
    run: ({ options }) =>
      withCommandCancellation((signal) =>
        logCliCommand(logger, CLI_COMMANDS.listFridaDevices, () =>
          finishAnalysisCommand(
            () => service.listDevices(remoteFrom(options)),
            cleanup,
            "frida",
            "list_frida_devices",
            signal,
          ),
        ),
      ),
  });
  cli.command(CLI_COMMANDS.listFridaProcesses, {
    description: selectHumanText(
      "List processes visible through a Frida device",
      "列出指定 Frida 设备可见的进程；省略设备与远程地址时选择 local",
    ),
    args: z.object({}),
    options: remoteOptions
      .extend({
        deviceId: z
          .string()
          .min(1)
          .optional()
          .describe(
            selectHumanText(
              "Frida device identifier (default: local); mutually exclusive with --remote-address",
              "Frida 设备标识（默认 local）；与 --remote-address 互斥",
            ),
          ),
      })
      .refine(
        (options) =>
          options.remoteAddress === undefined || options.deviceId === undefined,
        "Choose either deviceId or remoteAddress, not both",
      )
      .refine(
        remoteAddressRequired,
        "Remote credentials and connection options require remoteAddress",
      ),
    run: ({ options }) =>
      withCommandCancellation((signal) =>
        logCliCommand(logger, CLI_COMMANDS.listFridaProcesses, () => {
          const remote = remoteFrom(options);
          return finishAnalysisCommand(
            () =>
              service.listProcesses(
                remote === undefined
                  ? { deviceId: options.deviceId ?? "local" }
                  : { remote },
              ),
            cleanup,
            "frida",
            "list_frida_processes",
            signal,
          );
        }),
      ),
  });
  cli.command(CLI_COMMANDS.instrumentWithFrida, {
    description: selectHumanText(
      `Run one Frida script against a selected process and detach. ${exactlyOneScriptSource}`,
      "在指定进程中运行一次 Frida 脚本并清理会话。--script 与 --script-file 必须且只能提供一个。失败或清理未完成时保留原因与已收集观察；远程和设备通道须分别验证。",
    ),
    args: z.object({
      mode: z
        .enum(["attach", "spawn"])
        .describe(
          selectHumanText(
            "Attach to a PID or spawn a program",
            "attach 附加到进程，spawn 启动程序",
          ),
        ),
      target: z
        .string()
        .min(1)
        .describe(
          selectHumanText(
            "Process ID for attach or program path for spawn",
            "attach 使用不带前导零的正整数 PID；spawn 使用程序路径",
          ),
        ),
    }),
    options: remoteOptions
      .extend({
        deviceId: z
          .string()
          .min(1)
          .optional()
          .describe(
            selectHumanText(
              "Frida device identifier (default: local); mutually exclusive with --remote-address",
              "Frida 设备标识（默认 local）；与 --remote-address 互斥",
            ),
          ),
        script: z
          .string()
          .optional()
          .describe(
            selectHumanText(
              `Inline JavaScript to load. ${exactlyOneScriptSource}`,
              "要加载的 JavaScript 源码；与 --script-file 必须且只能提供一个",
            ),
          ),
        scriptFile: z
          .string()
          .min(1)
          .optional()
          .describe(
            selectHumanText(
              `Path to JavaScript source file. ${exactlyOneScriptSource}`,
              "JavaScript 源文件路径；与 --script 必须且只能提供一个",
            ),
          ),
        argument: z
          .array(z.string())
          .optional()
          .describe(
            selectHumanText(
              "Arguments passed to a spawned target; spawn mode only; repeat --argument for each value",
              "仅 spawn 模式：传给目标程序的参数；每个值重复使用 --argument",
            ),
          ),
        durationMs: cliDecimalField(
          z
            .number()
            .int()
            .min(0)
            .max(60_000)
            .default(1_000)
            .describe(
              selectHumanText(
                "Instrumentation duration in milliseconds (0–60000; default: 1000)",
                "插桩观察时长，单位毫秒，范围 0–60000，默认 1000；不改变宿主权限",
              ),
            ),
        ),
      })
      .refine(
        (options) =>
          options.remoteAddress === undefined || options.deviceId === undefined,
        "Choose either deviceId or remoteAddress, not both",
      )
      .refine(
        remoteAddressRequired,
        "Remote credentials and connection options require remoteAddress",
      ),
    run: ({ args, options }) =>
      withCommandCancellation((signal) =>
        logCliCommand(logger, CLI_COMMANDS.instrumentWithFrida, async () => {
          if (args.mode === "attach" && options.argument !== undefined)
            return projectAnalysisError(
              new AnalysisInputError(
                CLI_COMMANDS.instrumentWithFrida,
                undefined,
                [
                  {
                    path: ["argument"],
                    reason: "invalid_value",
                    message:
                      "--argument is only valid in spawn mode; remove it when attaching to a process.",
                  },
                ],
              ),
            );
          if (
            (options.script === undefined) ===
            (options.scriptFile === undefined)
          )
            return projectAnalysisError(
              new AnalysisInputError(
                CLI_COMMANDS.instrumentWithFrida,
                undefined,
                [
                  {
                    path: ["script"],
                    reason: "invalid_value",
                    message:
                      "Provide exactly one of --script or --script-file.",
                  },
                ],
              ),
            );
          const remote = remoteFrom(options);
          const selected =
            remote === undefined
              ? { deviceId: options.deviceId ?? "local" }
              : { remote };
          const targetInput =
            args.mode === "attach"
              ? /^[1-9][0-9]*$/u.test(args.target) &&
                Number.isSafeInteger(Number(args.target)) &&
                Number(args.target) > 0
                ? {
                    ...selected,
                    mode: "attach" as const,
                    pid: Number(args.target),
                  }
                : undefined
              : {
                  ...selected,
                  mode: "spawn" as const,
                  program: args.target,
                  ...(options.argument === undefined
                    ? {}
                    : { argv: options.argument }),
                };
          if (targetInput === undefined)
            return projectAnalysisError(
              new AnalysisInputError(
                CLI_COMMANDS.instrumentWithFrida,
                undefined,
                [
                  {
                    path: ["target"],
                    reason: "invalid_value",
                    message: "attach mode needs a positive integer process ID.",
                  },
                ],
              ),
            );
          return finishAnalysisCommand(
            async () => {
              const result = await service.instrument(
                {
                  ...targetInput,
                  source:
                    options.scriptFile === undefined
                      ? { sourceKind: "inline", source: options.script ?? "" }
                      : { sourceKind: "file", path: options.scriptFile },
                  durationMs: options.durationMs,
                },
                signal,
              );
              if (!result.ok) return result;
              if (result.value.cleanupError !== null) process.exitCode = 1;
              return ok(result.value.evidence);
            },
            cleanup,
            "frida",
            "instrument_with_frida",
            signal,
          );
        }),
      ),
  });
};

import { z } from "incur";

import { selectHumanText, type CliLocaleEnvironment } from "./localization.js";

import {
  DOCTOR_PROVIDER_IDS,
  runDoctor,
  type DoctorScope,
} from "../application/Doctor.js";
import {
  isSetupFailure,
  type SetupOptions,
} from "../application/SetupTypes.js";
import { runSetup } from "../application/Setup.js";
import { systemSetupHost } from "../application/SetupHost.js";
import { isUninstallFailure, runUninstall } from "../application/Uninstall.js";
import {
  isUpdateFailure,
  runUpdate,
  type UpdateResult,
} from "../application/Update.js";
import { systemUpdateHost } from "../application/UpdateRuntime.js";
import {
  confirmInteractiveSetup,
  renderInteractiveSetupResult,
  renderSetupProgress,
} from "./interactiveSetup.js";
import { PRODUCT_IDENTITY } from "../identity.js";
import { logCliCommand } from "../cliLogging.js";
import { createSystemDoctorHost } from "../doctorRuntime.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import type { Logger } from "../logger.js";
import type { CliInstance } from "./types.js";
import { SUPPORTED_CLIENT_DEFINITIONS } from "../application/SupportedClients.js";

const supportedClientIds = SUPPORTED_CLIENT_DEFINITIONS.map(({ name }) => name);
const supportedClientSchema = z
  .string()
  .refine(
    (candidate) => supportedClientIds.some((name) => name === candidate),
    "Unsupported agent integration",
  );

type HumanText = (english: string, chinese: string) => string;

/** Register setup, doctor, uninstall, and update CLI commands. */
export const registerSetupCommands = (
  cli: CliInstance,
  logger: Logger,
  environment: CliLocaleEnvironment = process.env,
): void => {
  const text: HumanText = (english, chinese) =>
    selectHumanText(english, chinese, environment);
  registerSetupCommand(cli, logger, text);
  registerDoctorCommand(cli, logger, text);
  registerMaintenanceCommands(cli, logger, text);
};

const registerSetupCommand = (
  cli: CliInstance,
  logger: Logger,
  text: HumanText,
): void => {
  cli.command(CLI_COMMANDS.setup, {
    description: text(
      "Configure agent integrations and optional analysis providers",
      "配置 AI 智能体接入及可选分析引擎",
    ),
    outputPolicy: "agent-only",
    options: z.object({
      yes: z
        .boolean()
        .default(false)
        .describe(
          text(
            "Approve user-owned setup actions without prompting",
            "无需交互确认已授权的配置操作",
          ),
        ),
      installHopper: z
        .boolean()
        .default(false)
        .describe(
          text(
            "Also approve Hopper installation with --yes",
            "与 --yes 一起批准安装 Hopper",
          ),
        ),
      client: z
        .array(supportedClientSchema)
        .default([])
        .describe(
          text(
            "Agent integration to configure; repeat for multiple agents",
            "指定要配置的智能体，可重复传入",
          ),
        ),
      allDetected: z
        .boolean()
        .default(false)
        .describe(
          text(
            "Configure every detected supported agent",
            "配置所有检测到且受支持的智能体",
          ),
        ),
      skill: z
        .boolean()
        .optional()
        .describe(
          text(
            "Override the bundled skill included with agent integrations",
            "显式指定是否安装随智能体接入附带的 Skill",
          ),
        ),
      dryRun: z
        .boolean()
        .default(false)
        .describe(
          text(
            "Print the resolved plan without applying it",
            "只显示操作计划，不修改配置",
          ),
        ),
      accessible: z
        .boolean()
        .default(false)
        .describe(
          text(
            "Use sequential accessible setup prompts",
            "使用逐项确认的无障碍配置提示",
          ),
        ),
    }),
    alias: { yes: "y" },
    run: ({ options, formatExplicit }) =>
      logCliCommand(
        logger,
        CLI_COMMANDS.setup,
        () => runSetupCommand({ options, formatExplicit }),
        isSetupFailure,
      ),
  });
};

const registerDoctorCommand = (
  cli: CliInstance,
  logger: Logger,
  text: HumanText,
): void => {
  cli.command(CLI_COMMANDS.doctor, {
    description: text(
      "Check whether Tekvro is ready",
      "检查 Tekvro 环境和分析能力是否就绪",
    ),
    options: z.object({
      target: z
        .string()
        .optional()
        .describe(
          text("Optional app path to check", "可选：要检查的本地应用路径"),
        ),
      client: z
        .array(supportedClientSchema)
        .default([])
        .describe(
          text(
            "Agent registration whose readiness is required; repeatable",
            "指定必须就绪的智能体，可重复传入",
          ),
        ),
      provider: z
        .array(z.enum(DOCTOR_PROVIDER_IDS))
        .default([])
        .describe(
          text(
            "Deep-analysis provider whose readiness is required",
            "指定必须就绪的深度分析引擎",
          ),
        ),
      skill: z
        .boolean()
        .optional()
        .describe(
          text(
            "Require the installed REA skill identity to be aligned",
            "要求已安装的兼容 Skill 标识一致",
          ),
        ),
    }),
    run: ({ options }) =>
      logCliCommand(logger, "doctor", () =>
        runDoctor(
          options.target,
          createSystemDoctorHost(),
          doctorScope(options),
        ),
      ),
  });
};

const registerMaintenanceCommands = (
  cli: CliInstance,
  logger: Logger,
  text: HumanText,
): void => {
  cli.command(CLI_COMMANDS.uninstall, {
    description: text(
      "Remove Tekvro-managed agent configuration and skill files",
      "移除 Tekvro 管理的智能体配置及 Skill 文件",
    ),
    options: z.object({
      purgeData: z
        .boolean()
        .default(false)
        .describe(
          text(
            "Also remove compatible local caches and state",
            "同时清理兼容的本地缓存和状态",
          ),
        ),
    }),
    alias: { purgeData: "purge-data" },
    run: ({ options }) =>
      logCliCommand(
        logger,
        "uninstall",
        () => runUninstall(options.purgeData),
        isUninstallFailure,
      ),
  });
  cli.command(CLI_COMMANDS.update, {
    description: text(
      "Update a published Tekvro installation (unavailable for private source builds)",
      "更新已发布的 Tekvro 安装（源码开发版暂不可用）",
    ),
    run: ({ formatExplicit }) =>
      logCliCommand(
        logger,
        CLI_COMMANDS.update,
        () =>
          PRODUCT_IDENTITY.privateSourceBuild
            ? Promise.resolve(privateSourceUpdateResult())
            : runUpdate(
                PRODUCT_IDENTITY.packageVersion,
                systemUpdateHost(),
                formatExplicit ? "structured" : "human",
              ),
        isUpdateFailure,
      ),
  });
};

/**
 * Do not query the upstream public registry or mutate a user's npm installation
 * when this private source checkout receives the "update" command.
 */
export const privateSourceUpdateResult = (): UpdateResult => ({
  status: "failed",
  currentVersion: PRODUCT_IDENTITY.packageVersion,
  latestVersion: null,
  reason: "unknown-install-method",
  remediation:
    "Tekvro is currently a private source build. Do not use the public rea-agents npm updater. Update this Git checkout intentionally, then run npm ci and npm run build:cached from the Tekvro directory.",
});

interface SetupCommandOptions {
  readonly yes: boolean;
  readonly installHopper: boolean;
  readonly client: readonly string[];
  readonly allDetected: boolean;
  readonly skill?: boolean | undefined;
  readonly dryRun: boolean;
  readonly accessible: boolean;
}

const runSetupCommand = async (input: {
  readonly options: SetupCommandOptions;
  readonly formatExplicit: boolean;
}) => {
  const { options } = input;
  const interactive = setupIsInteractive(options, input.formatExplicit);
  const hasExplicitScope = setupHasExplicitScope(options);
  const result = await runSetup(
    setupRunOptions(input, interactive, hasExplicitScope),
    systemSetupHost(createSystemDoctorHost()),
    interactive
      ? (actions, context) =>
          confirmInteractiveSetup(actions, options.accessible, context)
      : undefined,
  );
  if (interactive) renderInteractiveSetupResult(result);
  return result;
};

const setupRunOptions = (
  input: {
    readonly options: SetupCommandOptions;
    readonly formatExplicit: boolean;
  },
  interactive: boolean,
  hasExplicitScope: boolean,
): SetupOptions => {
  const { options } = input;
  const agentIntegrationSelected =
    options.allDetected || options.client.length > 0;
  const hasSelectedClients = hasExplicitScope && !options.allDetected;
  return {
    approved: options.yes && !options.dryRun,
    installHopper: options.installHopper,
    structured: input.formatExplicit || options.dryRun,
    dryRun: options.dryRun,
    allDetectedClients: options.allDetected,
    proposeHopper: interactive || options.installHopper,
    ...(hasSelectedClients ? { clientIds: options.client } : {}),
    ...(hasExplicitScope
      ? { installSkill: options.skill ?? agentIntegrationSelected }
      : {}),
    ...(interactive ? { onProgress: renderSetupProgress } : {}),
    ...(hasSelectedClients
      ? {
          readinessScope: {
            clients: options.client,
            providers: options.installHopper ? ["hopper"] : [],
            skill: options.skill ?? agentIntegrationSelected,
          },
        }
      : {}),
  };
};

const setupIsInteractive = (
  options: SetupCommandOptions,
  formatExplicit: boolean,
): boolean =>
  !options.yes &&
  !options.dryRun &&
  !formatExplicit &&
  process.stdin.isTTY === true &&
  process.stdout.isTTY === true &&
  process.stderr.isTTY === true;

const setupHasExplicitScope = (options: SetupCommandOptions): boolean =>
  options.allDetected ||
  options.client.length > 0 ||
  options.skill !== undefined ||
  options.installHopper;

const doctorScope = (options: {
  readonly client: readonly string[];
  readonly provider: readonly string[];
  readonly skill?: boolean | undefined;
}): DoctorScope | undefined =>
  options.client.length === 0 &&
  options.provider.length === 0 &&
  options.skill === undefined
    ? undefined
    : {
        clients: options.client,
        providers: options.provider,
        skill: options.skill === true,
      };

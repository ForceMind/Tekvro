import { Cli, z } from "incur";
import { selectHumanText } from "./localization.js";

import { browserContext, browserCliError } from "../cliBrowserContext.js";
import {
  analyzeWebBundle,
  inspectWebPage,
  listBrowserTargets,
  observeWebSession,
} from "../application/BrowserObservationService.js";
import { logCliCommand } from "../cliLogging.js";
import {
  inspectWebPageInputSchema,
  listBrowserTargetsInputSchema,
} from "../domain/browserObservation.js";
import { analyzeWebBundleInputSchema } from "../domain/webBundleAnalysis.js";
import { observeWebSessionInputSchema } from "../domain/browserSession.js";
import { AnalysisInputError } from "../domain/analysisErrorCore.js";
import type { Logger } from "../logger.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import {
  browserPageInspectionOptions,
  browserScopeOptions,
  observationDuration,
} from "../cliObservationOptions.js";

/** Register CLI equivalents of the passive browser MCP tools. */
export const registerBrowserCommands = (
  cli: ReturnType<typeof Cli.create>,
  logger: Logger,
): void => {
  registerTargetList(cli, logger);
  registerPageInspection(cli, logger);
  registerBundleAnalysis(cli, logger);
  registerObservationSession(cli, logger);
};

const registerTargetList = (
  cli: ReturnType<typeof Cli.create>,
  logger: Logger,
): void => {
  cli.command(CLI_COMMANDS.listBrowserTargets, {
    description:
      selectHumanText("List page targets from a selected loopback CDP browser, optionally filtered by origin", "列出本机 CDP 浏览器页面，可按来源过滤"),
    args: z.object({
      endpoint: z.string().describe(selectHumanText("Configured loopback CDP HTTP endpoint", "已配置的本机回环 CDP HTTP 端点")),
    }),
    options: z.object({ ...browserScopeOptions }),
    run: ({ args, options }) =>
      logCliCommand(logger, "list-browser-targets", async () => {
        const context = browserContext();
        const parsed = listBrowserTargetsInputSchema.safeParse({
          cdp_endpoint: args.endpoint,
          allowed_origins: options.allowedOrigins,
        });
        if (!parsed.success)
          return browserCliError(
            new AnalysisInputError("list_browser_targets"),
          );
        const result = await listBrowserTargets(context.provider, parsed.data);
        return result.ok ? result.value : browserCliError(result.error);
      }),
  });
};

const registerPageInspection = (
  cli: ReturnType<typeof Cli.create>,
  logger: Logger,
): void => {
  cli.command(CLI_COMMANDS.inspectWebPage, {
    description:
      selectHumanText("Passively inspect one page through CDP, defaulting to its current origin", "通过 CDP 被动检查指定页面，默认限定当前来源"),
    args: z.object({
      endpoint: z.string().describe(selectHumanText("Configured loopback CDP HTTP endpoint", "已配置的本机回环 CDP HTTP 端点")),
      targetId: z.string().describe(selectHumanText("Target ID from list-browser-targets", "从 list-browser-targets 获取的目标 ID")),
    }),
    options: browserPageInspectionOptions,
    run: ({ args, options }) =>
      logCliCommand(logger, "inspect-web-page", async () => {
        const context = browserContext();
        const parsed = inspectWebPageInputSchema.safeParse({
          cdp_endpoint: args.endpoint,
          allowed_origins: options.allowedOrigins,
          target_id: args.targetId,
          observation_ms: options.observationMs,
          include_accessibility_text: options.includeAccessibilityText,
          include_console_text: options.includeConsoleText,
          include_json_body_shapes: options.includeJsonBodyShapes,
          include_websocket_shapes: options.includeWebsocketShapes,
          include_script_sources: options.includeScriptSources,
          include_storage_keys: options.includeStorageKeys,
          include_storage_fingerprints: options.includeStorageFingerprints,
        });
        if (!parsed.success)
          return browserCliError(new AnalysisInputError("inspect_web_page"));
        const result = await inspectWebPage(context.provider, parsed.data);
        return result.ok ? result.value : browserCliError(result.error);
      }),
  });
};

const registerBundleAnalysis = (
  cli: ReturnType<typeof Cli.create>,
  logger: Logger,
): void => {
  cli.command(CLI_COMMANDS.analyzeWebBundle, {
    description:
      selectHumanText("Capture and statically analyze a page bundle, defaulting to the selected target origin", "收集并静态分析页面打包资源，默认限定目标来源"),
    args: z.object({
      endpoint: z.string().describe(selectHumanText("Configured loopback CDP HTTP endpoint", "已配置的本机回环 CDP HTTP 端点")),
      targetId: z.string().describe(selectHumanText("Target ID from list-browser-targets", "从 list-browser-targets 获取的目标 ID")),
    }),
    options: z.object({
      ...browserScopeOptions,
      observationMs: observationDuration(500),
      fetchSourceMaps: z
        .boolean()
        .default(false)
        .describe(selectHumanText("Fetch source maps referenced by captured scripts", "获取已捕获脚本引用的 Source Map 文件")),
    }),
    run: ({ args, options }) =>
      logCliCommand(logger, "analyze-web-bundle", async () => {
        const context = browserContext();
        const parsed = analyzeWebBundleInputSchema.safeParse({
          cdp_endpoint: args.endpoint,
          allowed_origins: options.allowedOrigins,
          target_id: args.targetId,
          observation_ms: options.observationMs,
          include_script_sources: true,
          fetch_source_maps: options.fetchSourceMaps,
        });
        if (!parsed.success)
          return browserCliError(new AnalysisInputError("analyze_web_bundle"));
        const result = await analyzeWebBundle(context.provider, parsed.data);
        return result.ok ? result.value : browserCliError(result.error);
      }),
  });
};

const registerObservationSession = (
  cli: ReturnType<typeof Cli.create>,
  logger: Logger,
): void => {
  cli.command(CLI_COMMANDS.observeWebSession, {
    description: selectHumanText("Observe user-driven page navigation during a chosen window", "在指定时间窗口观察用户操作引起的页面变化"),
    args: z.object({
      endpoint: z.string().describe(selectHumanText("Configured loopback CDP HTTP endpoint", "已配置的本机回环 CDP HTTP 端点")),
      targetId: z.string().describe(selectHumanText("Target ID from list-browser-targets", "从 list-browser-targets 获取的目标 ID")),
    }),
    options: z.object({
      ...browserScopeOptions,
      observationMs: observationDuration(10_000, 1),
    }),
    run: ({ args, options }) =>
      logCliCommand(logger, "observe-web-session", async () => {
        const context = browserContext();
        const parsed = observeWebSessionInputSchema.safeParse({
          cdp_endpoint: args.endpoint,
          allowed_origins: options.allowedOrigins,
          target_id: args.targetId,
          observation_ms: options.observationMs,
        });
        if (!parsed.success)
          return browserCliError(new AnalysisInputError("observe_web_session"));
        const result = await observeWebSession(context.provider, parsed.data);
        return result.ok ? result.value : browserCliError(result.error);
      }),
  });
};

import { z } from "incur";

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

/** Register setup, doctor, uninstall, and update CLI commands. */
export const registerSetupCommands = (
  cli: CliInstance,
  logger: Logger,
): void => {
  registerSetupCommand(cli, logger);
  registerDoctorCommand(cli, logger);
  registerMaintenanceCommands(cli, logger);
};

const registerSetupCommand = (cli: CliInstance, logger: Logger): void => {
  cli.command(CLI_COMMANDS.setup, {
    description: "Configure agent integrations and optional analysis providers",
    outputPolicy: "agent-only",
    options: z.object({
      yes: z
        .boolean()
        .default(false)
        .describe("Approve user-owned setup actions without prompting"),
      installHopper: z
        .boolean()
        .default(false)
        .describe("Also approve Hopper installation with --yes"),
      client: z
        .array(supportedClientSchema)
        .default([])
        .describe("Agent integration to configure; repeat for multiple agents"),
      allDetected: z
        .boolean()
        .default(false)
        .describe("Configure every detected supported agent"),
      skill: z
        .boolean()
        .optional()
        .describe(
          "Override the bundled skill included with agent integrations",
        ),
      dryRun: z
        .boolean()
        .default(false)
        .describe("Print the resolved plan without applying it"),
      accessible: z
        .boolean()
        .default(false)
        .describe("Use sequential accessible setup prompts"),
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

const registerDoctorCommand = (cli: CliInstance, logger: Logger): void => {
  cli.command(CLI_COMMANDS.doctor, {
    description: "Check whether Tekvro is ready",
    options: z.object({
      target: z.string().optional().describe("Optional app path to check"),
      client: z
        .array(supportedClientSchema)
        .default([])
        .describe("Agent registration whose readiness is required; repeatable"),
      provider: z
        .array(z.enum(DOCTOR_PROVIDER_IDS))
        .default([])
        .describe("Deep-analysis provider whose readiness is required"),
      skill: z
        .boolean()
        .optional()
        .describe("Require the installed REA skill identity to be aligned"),
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
): void => {
  cli.command(CLI_COMMANDS.uninstall, {
    description: "Remove Tekvro-managed agent configuration and skill files",
    options: z.object({
      purgeData: z
        .boolean()
        .default(false)
        .describe("Also remove compatible local caches and state"),
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
    description:
      "Update a published Tekvro installation (unavailable for private source builds)",
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

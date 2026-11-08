import {
  cancel,
  confirm,
  intro,
  isCancel,
  multiselect,
  outro,
} from "@clack/prompts";

import type {
  SetupAction,
  SetupConfirmationDecision,
  SetupConfirmationContext,
  SetupClientState,
  SetupProgressEvent,
  SetupResult,
} from "../application/SetupTypes.js";
import { SUPPORTED_CLIENT_DEFINITIONS } from "../application/SupportedClients.js";
import { CURRENT_ENTRYPOINT_PATH } from "../process/CurrentEntrypointPath.js";

const clientDisplayNames: ReadonlyMap<string, string> = new Map(
  SUPPORTED_CLIENT_DEFINITIONS.map(({ name, displayName }) => [
    name,
    displayName,
  ]),
);

const promptStreams = {
  input: process.stdin,
  output: process.stderr,
  withGuide: true,
} as const;

/** Select agent targets, then review the resolved plan before consent. */
export const confirmInteractiveSetup = async (
  actions: readonly SetupAction[],
  accessible: boolean,
  context?: SetupConfirmationContext,
): Promise<SetupConfirmationDecision> => {
  if (context?.stage === "select" || context === undefined) {
    intro("Tekvro setup", promptStreams);
    writeLine(
      "│  Understand local apps and binaries from your terminal or agent.",
    );
    renderDetectedSummary(context?.clientStates ?? []);
    renderKeyboardHelp(accessible);
  }
  if (context?.stage === "select") {
    const selected = await selectSetupActions(actions, accessible, context);
    return selected === undefined
      ? cancelledDecision()
      : { approved: false, selectedActionIds: selected };
  }
  if (actions.length === 0) return { approved: true, selectedActionIds: [] };
  renderPreflight(actions);
  const approved = await confirm({
    ...promptStreams,
    message:
      actions.length === 1
        ? "Apply this change?"
        : `Apply these ${String(actions.length)} changes?`,
    initialValue: true,
    active: "Yes, apply",
    inactive: "No, cancel",
    vertical: accessible,
  });
  if (isCancel(approved) || !approved) return cancelledDecision();
  return { approved: true, selectedActionIds: actions.map(({ id }) => id) };
};

/** Render stable, append-only progress for real setup operations. */
export const renderSetupProgress = (event: SetupProgressEvent): void => {
  const symbol =
    event.state === "started"
      ? "◇"
      : event.state === "completed"
        ? "◆"
        : event.state === "warning"
          ? "!"
          : "✗";
  const suffix = event.detail === undefined ? "" : ` · ${event.detail}`;
  writeLine(`${symbol}  ${event.label}${suffix}`);
};

/** Show the resolved dry-run plan to a human at an interactive terminal. */
export const renderSetupDryRun = (actions: readonly SetupAction[]): void => {
  intro("Tekvro setup plan", promptStreams);
  renderPreflight(actions);
  outro("Dry run complete. No changes were made.", promptStreams);
};

/** Finish an interactive setup journey without exposing the full doctor catalog. */
export const renderInteractiveSetupResult = (
  result: SetupResult,
  _environment: Readonly<NodeJS.ProcessEnv> = process.env,
): void => {
  if (result.status === "ready") {
    const changedClients = Object.entries(result.clients)
      .filter(([, client]) => client.status === "configured")
      .map(([client]) => clientDisplayNames.get(client) ?? client);
    const readyClients = readyAgentClients(result, changedClients);
    renderReadyCapabilities(result, readyClients);
    if (result.prewarm?.status === "failed")
      writeLine(`!  ${result.prewarm.reason}`);
    outro(
      changedClients.length === 0
        ? "Tekvro is ready for local app analysis."
        : `Restart ${changedClients.join(", ")} to load Tekvro.`,
      promptStreams,
    );
    return;
  }
  if (result.status === "planned" || result.status === "cancelled") return;
  writeLine(`!  ${result.remediation ?? "Setup needs attention."}`);
  for (const resource of result.cleanup?.resources ?? [])
    writeLine(`   Pending cleanup: ${resource}`);
  const invocation = cliInvocation();
  outro(
    invocation === undefined
      ? "Run doctor through the current Tekvro launcher for the remaining checks."
      : `Run${process.platform === "win32" ? " in PowerShell" : ""} \`${invocation} doctor\` for the remaining checks.`,
    promptStreams,
  );
};

const selectSetupActions = async (
  actions: readonly SetupAction[],
  accessible: boolean,
  context: SetupConfirmationContext,
): Promise<readonly string[] | undefined> => {
  const clientStates = context.clientStates.filter(
    ({ client }) => client.format !== "unsupported",
  );
  const initial = new Set(context.selectedClientIds);
  const selectedClientIds = accessible
    ? await selectClientsAccessibly(clientStates, initial)
    : await selectClients(clientStates, initial);
  if (selectedClientIds === undefined) return undefined;
  const selectedActionIds = selectedClientIds.map(
    (id) => `configure_client:${id}`,
  );
  const skill = actions.find(({ kind }) => kind === "install_skill");
  if (skill !== undefined) {
    if (selectedClientIds.length > 0) selectedActionIds.push(skill.id);
    else {
      const included = await confirm({
        ...promptStreams,
        message: "Install the guided Tekvro skill for CLI use?",
        initialValue: false,
        vertical: accessible,
      });
      if (isCancel(included)) return undefined;
      if (included) selectedActionIds.push(skill.id);
    }
  }
  const hopper = actions.find(({ kind }) => kind === "install_hopper");
  if (hopper !== undefined) {
    const included = await confirm({
      ...promptStreams,
      message: "Install Hopper for deep binary analysis?",
      initialValue: false,
      vertical: accessible,
    });
    if (isCancel(included)) return undefined;
    if (included) selectedActionIds.push(hopper.id);
  }
  return selectedActionIds;
};

const clientHint = (state: SetupClientState): string =>
  state.configured
    ? "Tekvro already configured · selected from existing configuration"
    : state.status === "invalid"
      ? "Existing configuration needs repair before setup"
      : state.detected
        ? "Detected · choose to configure"
        : "Not detected · configuration is still available";

const selectClients = async (
  states: readonly SetupClientState[],
  initial: ReadonlySet<string>,
): Promise<readonly string[] | undefined> => {
  if (states.length === 0) return [];
  const selection = await multiselect({
    ...promptStreams,
    message: "Which agents should use Tekvro?",
    options: states.map((state) => ({
      value: state.client.name,
      label: clientDisplayNames.get(state.client.name) ?? state.client.name,
      hint: clientHint(state),
    })),
    initialValues: states
      .filter(({ client }) => initial.has(client.name))
      .map(({ client }) => client.name),
    required: false,
    maxItems: Math.max(
      3,
      Math.min(states.length, (process.stderr.rows ?? 24) - 8),
    ),
    showInstructions: true,
  });
  return isCancel(selection) ? undefined : selection;
};

const selectClientsAccessibly = async (
  states: readonly SetupClientState[],
  initial: ReadonlySet<string>,
): Promise<readonly string[] | undefined> => {
  const selected: string[] = [];
  for (const state of states) {
    const included = await confirm({
      ...promptStreams,
      message: `Configure ${clientDisplayNames.get(state.client.name) ?? state.client.name}? ${clientHint(state)}`,
      initialValue: initial.has(state.client.name),
      vertical: true,
    });
    if (isCancel(included)) return undefined;
    if (included) selected.push(state.client.name);
  }
  return selected;
};

const renderDetectedSummary = (states: readonly SetupClientState[]): void => {
  const detected = states.filter(({ detected }) => detected);
  writeLine("│");
  writeLine(
    detected.length === 0
      ? "◆  No agents detected. Choose any supported agent below."
      : `◆  Detected: ${humanList(detected.map(({ client }) => clientDisplayNames.get(client.name) ?? client.name))}`,
  );
};

const renderKeyboardHelp = (accessible: boolean): void => {
  writeLine("│");
  writeLine(
    accessible
      ? "│  Keys: Enter answer · Ctrl-C cancel"
      : "│  Keys: ↑/↓ navigate · Space toggle · Enter confirm · Ctrl-C cancel",
  );
};

const cliInvocation = (): string | undefined => {
  if (CURRENT_ENTRYPOINT_PATH === undefined) return undefined;
  const arguments_ = [process.execPath, CURRENT_ENTRYPOINT_PATH];
  // These strings are examples for the user's shell, never process argv.
  // PowerShell needs its call operator for a quoted executable path.
  return process.platform === "win32"
    ? `& ${arguments_.map((part) => `'${part.replaceAll("'", "''")}'`).join(" ")}`
    : arguments_.map((part) => `'${part.replaceAll("'", `'"'"'`)}'`).join(" ");
};

const renderReadyCapabilities = (
  result: SetupResult,
  readyClients: readonly string[],
): void => {
  writeLine("◆  What you can do now");
  const providers = readyProviders(result);
  if (providers.length > 0)
    writeLine(`│  Deep analysis: ${humanList(providers)}`);
  if (readyClients.length > 0)
    writeLine(`│  Agent access: ${humanList(readyClients)}`);
  if (result.doctor.identity?.skill.state === "aligned")
    writeLine("│  Guided reverse-engineering workflows: installed");
  const invocation = cliInvocation();
  writeLine(
    invocation === undefined
      ? "│  CLI: Run capabilities through the current Tekvro launcher."
      : `│  CLI${process.platform === "win32" ? " (PowerShell)" : ""}: ${invocation} ${providers.length > 0 ? "analyze /path/to/app" : "capabilities"}`,
  );
  const firstClient = readyClients[0];
  if (firstClient !== undefined)
    writeLine(
      `│  Try in ${firstClient}: "Explain how a feature works in /path/to/app and show the evidence."`,
    );
};

const readyAgentClients = (
  result: SetupResult,
  changedClients: readonly string[],
): readonly string[] => {
  const alignedClients = (result.doctor.identity?.registrations ?? [])
    .filter(({ state }) => state === "aligned")
    .map(({ client }) => clientDisplayNames.get(client) ?? client);
  return [...new Set([...alignedClients, ...changedClients])];
};

const readyProviders = (result: SetupResult): readonly string[] =>
  result.doctor.availableProviders.map(displayProviderId);

const displayProviderId = (id: string): string =>
  id.length === 0 ? id : `${id[0]?.toUpperCase() ?? ""}${id.slice(1)}`;

const humanList = (values: readonly string[]): string => {
  if (values.length < 2) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
};

const renderPreflight = (actions: readonly SetupAction[]): void => {
  writeLine("│");
  writeLine("◆  Ready to review");
  for (const action of actions) {
    writeLine("│");
    writeLine(`│  ${action.operation.toUpperCase()}  ${action.label}`);
    writeLine(`│          ${action.target}`);
    if (action.backupPath !== undefined)
      writeLine(`│          backup: ${action.backupPath}`);
    for (const origin of action.networkOrigins ?? [])
      writeLine(`│          network: ${origin}`);
    if (action.integrity !== undefined)
      writeLine(`│          integrity: ${action.integrity}`);
    for (const command of action.commands ?? [])
      writeLine(`│          command: ${command}`);
    writeLine(`│          ${action.detail}`);
    if (action.external) writeLine("│          external software");
  }
  writeLine("│");
  writeLine(
    "│  Tekvro will preserve unrelated configuration and will not install or upgrade Node.js, npm, Homebrew, Java, or Ghidra.",
  );
};

const cancelledDecision = (): SetupConfirmationDecision => {
  cancel("Setup cancelled. No changes were made.", promptStreams);
  return {
    approved: false,
    selectedActionIds: [],
    cancelled: true,
  };
};

const writeLine = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

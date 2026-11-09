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
import {
  isChineseLocale,
  selectHumanText,
  type CliLocaleEnvironment,
} from "./localization.js";

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
  environment: CliLocaleEnvironment = process.env,
): Promise<SetupConfirmationDecision> => {
  if (context?.stage === "select" || context === undefined) {
    intro(
      selectHumanText("Tekvro setup", "Tekvro 安装与配置", environment),
      promptStreams,
    );
    writeLine(
      selectHumanText(
        "│  Understand local apps and binaries from your terminal or agent.",
        "│  从终端或智能体调查本地应用与二进制文件。",
        environment,
      ),
    );
    renderDetectedSummary(context?.clientStates ?? [], environment);
    renderKeyboardHelp(accessible, environment);
  }
  if (context?.stage === "select") {
    const selected = await selectSetupActions(
      actions,
      accessible,
      context,
      environment,
    );
    return selected === undefined
      ? cancelledDecision(environment)
      : { approved: false, selectedActionIds: selected };
  }
  if (actions.length === 0) return { approved: true, selectedActionIds: [] };
  renderPreflight(actions, environment);
  const approved = await confirm({
    ...promptStreams,
    message:
      actions.length === 1
        ? selectHumanText("Apply this change?", "应用这项更改？", environment)
        : selectHumanText(
            `Apply these ${String(actions.length)} changes?`,
            `应用这 ${String(actions.length)} 项更改？`,
            environment,
          ),
    initialValue: true,
    active: selectHumanText("Yes, apply", "是，应用更改", environment),
    inactive: selectHumanText("No, cancel", "否，取消", environment),
    vertical: accessible,
  });
  if (isCancel(approved) || !approved) return cancelledDecision(environment);
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
export const renderSetupDryRun = (
  actions: readonly SetupAction[],
  environment: CliLocaleEnvironment = process.env,
): void => {
  intro(
    selectHumanText("Tekvro setup plan", "Tekvro 配置预览", environment),
    promptStreams,
  );
  renderPreflight(actions, environment);
  outro(
    selectHumanText(
      "Dry run complete. No changes were made.",
      "预览完成，未作任何更改。",
      environment,
    ),
    promptStreams,
  );
};

/** Finish an interactive setup journey without exposing the full doctor catalog. */
export const renderInteractiveSetupResult = (
  result: SetupResult,
  environment: CliLocaleEnvironment = process.env,
): void => {
  if (result.status === "ready") {
    const changedClients = Object.entries(result.clients)
      .filter(([, client]) => client.status === "configured")
      .map(([client]) => clientDisplayNames.get(client) ?? client);
    const readyClients = readyAgentClients(result, changedClients);
    renderReadyCapabilities(result, readyClients, environment);
    if (result.prewarm?.status === "failed")
      writeLine(`!  ${result.prewarm.reason}`);
    outro(
      changedClients.length === 0
        ? selectHumanText(
            "Tekvro is ready for local app analysis.",
            "Tekvro 已就绪，可分析本地应用。",
            environment,
          )
        : selectHumanText(
            `Restart ${changedClients.join(", ")} to load Tekvro.`,
            `请重启 ${changedClients.join("、")} 以加载 Tekvro。`,
            environment,
          ),
      promptStreams,
    );
    return;
  }
  if (result.status === "planned" || result.status === "cancelled") return;
  writeLine(
    `!  ${result.remediation ?? selectHumanText("Setup needs attention.", "配置尚未完成，请检查诊断信息。", environment)}`,
  );
  for (const resource of result.cleanup?.resources ?? [])
    writeLine(
      selectHumanText(
        `   Pending cleanup: ${resource}`,
        `   待清理资源：${resource}`,
        environment,
      ),
    );
  const invocation = cliInvocation();
  outro(
    invocation === undefined
      ? selectHumanText(
          "Run doctor through the current Tekvro launcher for the remaining checks.",
          "请通过当前 Tekvro 启动入口运行 doctor，查看剩余检查项。",
          environment,
        )
      : selectHumanText(
          `Run${process.platform === "win32" ? " in PowerShell" : ""} \`${invocation} doctor\` for the remaining checks.`,
          `请${process.platform === "win32" ? "在 PowerShell 中" : ""}运行 \`${invocation} doctor\`，查看剩余检查项。`,
          environment,
        ),
    promptStreams,
  );
};

const selectSetupActions = async (
  actions: readonly SetupAction[],
  accessible: boolean,
  context: SetupConfirmationContext,
  environment: CliLocaleEnvironment,
): Promise<readonly string[] | undefined> => {
  const clientStates = context.clientStates.filter(
    ({ client }) => client.format !== "unsupported",
  );
  const initial = new Set(context.selectedClientIds);
  const selectedClientIds = accessible
    ? await selectClientsAccessibly(clientStates, initial, environment)
    : await selectClients(clientStates, initial, environment);
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
        message: selectHumanText(
          "Install the guided Tekvro skill for CLI use?",
          "为命令行安装 Tekvro 引导技能？",
          environment,
        ),
        ...yesNo(environment),
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
      message: selectHumanText(
        "Install Hopper for deep binary analysis?",
        "安装 Hopper 以进行深度二进制分析？",
        environment,
      ),
      ...yesNo(environment),
      initialValue: false,
      vertical: accessible,
    });
    if (isCancel(included)) return undefined;
    if (included) selectedActionIds.push(hopper.id);
  }
  return selectedActionIds;
};

const clientHint = (
  state: SetupClientState,
  environment: CliLocaleEnvironment,
): string =>
  state.configured
    ? selectHumanText(
        "Tekvro already configured · selected from existing configuration",
        "已配置 Tekvro · 按现有配置选中",
        environment,
      )
    : state.status === "invalid"
      ? selectHumanText(
          "Existing configuration needs repair before setup",
          "现有配置须先修复",
          environment,
        )
      : state.detected
        ? selectHumanText(
            "Detected · choose to configure",
            "已检测到 · 可选择配置",
            environment,
          )
        : selectHumanText(
            "Not detected · configuration is still available",
            "未检测到 · 仍可选择配置",
            environment,
          );

const selectClients = async (
  states: readonly SetupClientState[],
  initial: ReadonlySet<string>,
  environment: CliLocaleEnvironment,
): Promise<readonly string[] | undefined> => {
  if (states.length === 0) return [];
  const selection = await multiselect({
    ...promptStreams,
    message: selectHumanText(
      "Which agents should use Tekvro?",
      "哪些智能体需要使用 Tekvro？",
      environment,
    ),
    options: states.map((state) => ({
      value: state.client.name,
      label: clientDisplayNames.get(state.client.name) ?? state.client.name,
      hint: clientHint(state, environment),
    })),
    initialValues: states
      .filter(({ client }) => initial.has(client.name))
      .map(({ client }) => client.name),
    required: false,
    maxItems: Math.max(
      3,
      Math.min(states.length, (process.stderr.rows ?? 24) - 8),
    ),
    showInstructions: !isChineseLocale(environment),
  });
  return isCancel(selection) ? undefined : selection;
};

const selectClientsAccessibly = async (
  states: readonly SetupClientState[],
  initial: ReadonlySet<string>,
  environment: CliLocaleEnvironment,
): Promise<readonly string[] | undefined> => {
  const selected: string[] = [];
  for (const state of states) {
    const included = await confirm({
      ...promptStreams,
      message: selectHumanText(
        `Configure ${clientDisplayNames.get(state.client.name) ?? state.client.name}? ${clientHint(state, environment)}`,
        `配置 ${clientDisplayNames.get(state.client.name) ?? state.client.name}？${clientHint(state, environment)}`,
        environment,
      ),
      ...yesNo(environment),
      initialValue: initial.has(state.client.name),
      vertical: true,
    });
    if (isCancel(included)) return undefined;
    if (included) selected.push(state.client.name);
  }
  return selected;
};

const renderDetectedSummary = (
  states: readonly SetupClientState[],
  environment: CliLocaleEnvironment,
): void => {
  const detected = states.filter(({ detected }) => detected);
  writeLine("│");
  writeLine(
    detected.length === 0
      ? selectHumanText(
          "◆  No agents detected. Choose any supported agent below.",
          "◆  未检测到智能体，请在下方选择支持的智能体。",
          environment,
        )
      : selectHumanText(
          `◆  Detected: ${humanList(
            detected.map(
              ({ client }) =>
                clientDisplayNames.get(client.name) ?? client.name,
            ),
            environment,
          )}`,
          `◆  已检测到：${humanList(
            detected.map(
              ({ client }) =>
                clientDisplayNames.get(client.name) ?? client.name,
            ),
            environment,
          )}`,
          environment,
        ),
  );
};

const renderKeyboardHelp = (
  accessible: boolean,
  environment: CliLocaleEnvironment,
): void => {
  writeLine("│");
  writeLine(
    accessible
      ? selectHumanText(
          "│  Keys: Enter answer · Ctrl-C cancel",
          "│  按键：Enter 作答 · Ctrl-C 取消",
          environment,
        )
      : selectHumanText(
          "│  Keys: ↑/↓ navigate · Space toggle · Enter confirm · Ctrl-C cancel",
          "│  按键：↑/↓ 移动 · 空格切换 · Enter 确认 · Ctrl-C 取消",
          environment,
        ),
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
  environment: CliLocaleEnvironment,
): void => {
  writeLine(
    selectHumanText(
      "◆  What you can do now",
      "◆  现在可以进行的操作",
      environment,
    ),
  );
  const providers = readyProviders(result);
  if (providers.length > 0)
    writeLine(
      selectHumanText(
        `│  Deep analysis: ${humanList(providers, environment)}`,
        `│  深度分析：${humanList(providers, environment)}`,
        environment,
      ),
    );
  if (readyClients.length > 0)
    writeLine(
      selectHumanText(
        `│  Agent access: ${humanList(readyClients, environment)}`,
        `│  智能体接入：${humanList(readyClients, environment)}`,
        environment,
      ),
    );
  if (result.doctor.identity?.skill.state === "aligned")
    writeLine(
      selectHumanText(
        "│  Guided reverse-engineering workflows: installed",
        "│  逆向分析引导技能：已安装",
        environment,
      ),
    );
  const invocation = cliInvocation();
  writeLine(
    invocation === undefined
      ? selectHumanText(
          "│  CLI: Run capabilities through the current Tekvro launcher.",
          "│  CLI：通过当前 Tekvro 启动入口运行 capabilities。",
          environment,
        )
      : `│  CLI${process.platform === "win32" ? " (PowerShell)" : ""}: ${invocation} ${providers.length > 0 ? "analyze /path/to/app" : "capabilities"}`,
  );
  const firstClient = readyClients[0];
  if (firstClient !== undefined)
    writeLine(
      selectHumanText(
        `│  Try in ${firstClient}: "Explain how a feature works in /path/to/app and show the evidence."`,
        `│  在 ${firstClient} 中尝试：“解释 /path/to/app 中某项功能的工作方式，并展示证据。”`,
        environment,
      ),
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

const humanList = (
  values: readonly string[],
  environment: CliLocaleEnvironment,
): string => {
  if (values.length < 2) return values[0] ?? "";
  if (isChineseLocale(environment)) return values.join("、");
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
};

const renderPreflight = (
  actions: readonly SetupAction[],
  environment: CliLocaleEnvironment,
): void => {
  writeLine("│");
  writeLine(
    selectHumanText("◆  Ready to review", "◆  请核对以下更改", environment),
  );
  for (const action of actions) {
    writeLine("│");
    writeLine(`│  ${action.operation.toUpperCase()}  ${action.label}`);
    writeLine(`│          ${action.target}`);
    if (action.backupPath !== undefined)
      writeLine(
        selectHumanText(
          `│          backup: ${action.backupPath}`,
          `│          备份：${action.backupPath}`,
          environment,
        ),
      );
    for (const origin of action.networkOrigins ?? [])
      writeLine(
        selectHumanText(
          `│          network: ${origin}`,
          `│          网络来源：${origin}`,
          environment,
        ),
      );
    if (action.integrity !== undefined)
      writeLine(
        selectHumanText(
          `│          integrity: ${action.integrity}`,
          `│          完整性：${action.integrity}`,
          environment,
        ),
      );
    for (const command of action.commands ?? [])
      writeLine(
        selectHumanText(
          `│          command: ${command}`,
          `│          命令：${command}`,
          environment,
        ),
      );
    writeLine(`│          ${action.detail}`);
    if (action.external)
      writeLine(
        selectHumanText(
          "│          external software",
          "│          外部软件",
          environment,
        ),
      );
  }
  writeLine("│");
  writeLine(
    selectHumanText(
      "│  Tekvro will preserve unrelated configuration and will not install or upgrade Node.js, npm, Homebrew, Java, or Ghidra.",
      "│  Tekvro 会保留无关配置，不会安装或升级 Node.js、npm、Homebrew、Java 或 Ghidra。",
      environment,
    ),
  );
};

const yesNo = (environment: CliLocaleEnvironment) => ({
  active: selectHumanText("Yes", "是", environment),
  inactive: selectHumanText("No", "否", environment),
});

const cancelledDecision = (
  environment: CliLocaleEnvironment,
): SetupConfirmationDecision => {
  cancel(
    selectHumanText(
      "Setup cancelled. No changes were made.",
      "配置已取消，未作任何更改。",
      environment,
    ),
    promptStreams,
  );
  return {
    approved: false,
    selectedActionIds: [],
    cancelled: true,
  };
};

const writeLine = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

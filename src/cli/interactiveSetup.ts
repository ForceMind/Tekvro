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

const clientDisplayNames: ReadonlyMap<string, string> = new Map(
  SUPPORTED_CLIENT_DEFINITIONS.map(({ name, displayName }) => [
    name,
    displayName,
  ]),
);

/** Localize interactive human text; preserve CLI flags, JSON and MCP schemas. */
const isZh = /^zh(?:[_-]|$)/iu.test(
  (process.env.TEKVRO_LANG ?? process.env.LANG ?? "").trim(),
);
const t = (en: string, zh: string): string => (isZh ? zh : en);

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
    intro(t("Tekvro setup", "Tekvro 探核 · 配置向导"), promptStreams);
    writeLine(
      t(
        "│  Understand local apps and binaries from your terminal or agent.",
        "│  用终端或 AI 智能体调查本地软件与二进制文件。",
      ),
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
        ? t("Apply this change?", "是否应用这项修改？")
        : t(
            `Apply these ${String(actions.length)} changes?`,
            `是否应用这 ${String(actions.length)} 项修改？`,
          ),
    initialValue: true,
    active: t("Yes, apply", "确认应用"),
    inactive: t("No, cancel", "取消"),
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

/** Finish an interactive setup journey without exposing the full doctor catalog. */
export const renderInteractiveSetupResult = (result: SetupResult): void => {
  if (result.status === "ready") {
    const changedClients = Object.entries(result.clients)
      .filter(([, client]) => client.status === "configured")
      .map(([client]) => clientDisplayNames.get(client) ?? client);
    const readyClients = readyAgentClients(result, changedClients);
    renderReadyCapabilities(result, readyClients);
    outro(
      changedClients.length === 0
        ? t("Tekvro is ready for local app analysis.", "Tekvro 已准备好分析本地软件。")
        : t(
            `Restart ${changedClients.join(", ")} to load Tekvro.`,
            `请重启 ${changedClients.join("、")} 以加载 Tekvro。`,
          ),
      promptStreams,
    );
    return;
  }
  if (result.status === "planned" || result.status === "cancelled") return;
  writeLine(`!  ${result.remediation ?? t("Setup needs attention.", "配置还需要进一步处理。")}`);
  outro(
    t(
      `Run \`${cliInvocation()} doctor\` for the remaining checks.`,
      `运行 \`${cliInvocation()} doctor\` 查看剩余检查项。`,
    ),
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
        message: t(
          "Install the guided REA skill for CLI use?",
          "是否安装 Tekvro CLI 引导 Skill？",
        ),
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
      message: t(
        "Install Hopper for deep binary analysis?",
        "是否安装 Hopper 进行深度二进制分析？",
      ),
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
    ? t(
        "REA already configured · selected from existing configuration",
        "已存在 REA 配置 · 将复用现有配置",
      )
    : state.status === "invalid"
      ? t(
          "Existing configuration needs repair before setup",
          "旧配置损坏 · 需要先修复",
        )
      : state.detected
        ? t("Detected · choose to configure", "已检测到 · 可选择配置")
        : t(
            "Not detected · configuration is still available",
            "未检测到 · 仍可以配置",
          );

const selectClients = async (
  states: readonly SetupClientState[],
  initial: ReadonlySet<string>,
): Promise<readonly string[] | undefined> => {
  if (states.length === 0) return [];
  const selection = await multiselect({
    ...promptStreams,
    message: t("Which agents should use REA?", "哪些智能体需要使用 Tekvro？"),
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
      message: t(
        `Configure ${clientDisplayNames.get(state.client.name) ?? state.client.name}? ${clientHint(state)}`,
        `是否配置 ${clientDisplayNames.get(state.client.name) ?? state.client.name}？${clientHint(state)}`,
      ),
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
      ? t(
          "◆  No agents detected. Choose any supported agent below.",
          "◆  未检测到智能体，可以手动选择支持的工具。",
        )
      : t(
          `◆  Detected: ${humanList(detected.map(({ client }) => clientDisplayNames.get(client.name) ?? client.name))}`,
          `◆  已检测到：${humanList(detected.map(({ client }) => clientDisplayNames.get(client.name) ?? client.name))}`,
        )
  );
};

const renderKeyboardHelp = (accessible: boolean): void => {
  writeLine("│");
  writeLine(
    accessible
      ? t(
          "│  Keys: Enter answer · Ctrl-C cancel",
          "│  按键：Enter 确认 · Ctrl-C 取消",
        )
      : t(
          "│  Keys: ↑/↓ navigate · Space toggle · Enter confirm · Ctrl-C cancel",
          "│  按键：↑↓ 移动 · 空格选择 · Enter 确认 · Ctrl-C 取消",
        ),
  );
};

const cliInvocation = (): string =>
  process.env.npm_command === "exec" ? "npx rea-agents" : "rea";

const renderReadyCapabilities = (
  result: SetupResult,
  readyClients: readonly string[],
): void => {
  writeLine(t("◆  What you can do now", "◆  现在可以做什么"));
  const providers = readyProviders(result);
  if (providers.length > 0)
    writeLine(t(`│  Deep analysis: ${humanList(providers)}`, `│  深度分析工具：${humanList(providers)}`));
  if (readyClients.length > 0)
    writeLine(t(`│  Agent access: ${humanList(readyClients)}`, `│  智能体接入：${humanList(readyClients)}`));
  if (result.doctor.identity?.skill.state === "aligned")
    writeLine(t("│  Guided reverse-engineering workflows: installed", "│  逆向工程工作流指引：已安装"));
  writeLine(
    `│  CLI: ${cliInvocation()} ${providers.length > 0 ? "analyze /path/to/app" : "capabilities"}`,
  );
  const firstClient = readyClients[0];
  if (firstClient !== undefined)
    writeLine(
      t(
        `│  Try in ${firstClient}: "Explain how a feature works in /path/to/app and show the evidence."`,
        `│  请在 ${firstClient} 中尝试：“分析 /path/to/app 的功能实现并列出证据。”`,
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

const humanList = (values: readonly string[]): string => {
  if (values.length < 2) return values[0] ?? "";
  if (values.length === 2) return isZh ? `${values[0]} 和 ${values[1]}` : `${values[0]} and ${values[1]}`;
  return isZh
    ? `${values.slice(0, -1).join("、")} 和 ${values.at(-1)}`
    : `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
};

const renderPreflight = (actions: readonly SetupAction[]): void => {
  writeLine("│");
  writeLine(t("◆  Ready to review", "◆  请检查即将执行的操作"));
  for (const action of actions) {
    writeLine("│");
    writeLine(`│  ${action.operation.toUpperCase()}  ${action.label}`);
    writeLine(`│          ${action.target}`);
    if (action.backupPath !== undefined)
      writeLine(t(`│          backup: ${action.backupPath}`, `│          备份：${action.backupPath}`));
    for (const origin of action.networkOrigins ?? [])
      writeLine(t(`│          network: ${origin}`, `│          网络来源：${origin}`));
    if (action.integrity !== undefined)
      writeLine(t(`│          integrity: ${action.integrity}`, `│          完整性校验：${action.integrity}`));
    for (const command of action.commands ?? [])
      writeLine(t(`│          command: ${command}`, `│          命令：${command}`));
    writeLine(`│          ${action.detail}`);
    if (action.external)
      writeLine(t("│          external software", "│          需要安装外部软件"));
  }
  writeLine("│");
  writeLine(
    t(
      "│  REA will preserve unrelated configuration and will not install or upgrade Node.js, npm, Homebrew, Java, or Ghidra.",
      "│  Tekvro 会保留无关配置，不会自动安装或升级 Node.js、npm、Homebrew、Java、Ghidra。",
    ),
  );
};

const cancelledDecision = (): SetupConfirmationDecision => {
  cancel(
    t(
      "Setup cancelled. No changes were made.",
      "配置已取消，没有修改任何文件。",
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

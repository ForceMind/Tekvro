# Tekvro / 探核：中文快速开始

[返回首页](../../README.md) · [架构](architecture.md) · [安全](security.md) · [发行身份](distribution.md)

## 1. 准备环境

- Node.js：`^22.19.0 || ^24.11.0 || >=26.0.0`，检查 `node -v`。
- npm：与 `package-lock.json` 兼容的版本。
- Git：用于拉取公开代码及子模块。
- Ghidra、Hopper、IDA、JADX 等为**可选**，仅在你实际需要的分析任务中配置；静态 JavaScript 目录分析无需先安装反编译器。

## 2. 克隆与构建

```bash
git clone https://github.com/ForceMind/Tekvro.git
cd Tekvro
git submodule update --init --recursive
npm ci
npm run build:cached
```

**重要：** 此命令从 ForceMind/Tekvro 公开 Git 仓库构建；npm 包仍配置 `private: true`，尚未发布独立的 `tekvro` 版本。此时运行仓库根目录的 `install.sh` 只会给出源码安装指引，**不会访问 npm 或安装任何包**。公开 npm 上 `rea-agents` 的 `npx` 命令会下载原项目，不能替代本源码构建。

## 3. 尝试只读分析

```bash
node scripts/rea.mjs --help
node scripts/rea.mjs capabilities --json
node scripts/rea.mjs analyze-javascript-application /absolute/path/to/js-app --json
```

请将路径换成你拥有分析权限的本地目标，尽量用不含密钥与用户数据的样本。结果包含文件、结构、观察、推断与局限。关于本地 H5 游戏、浏览器与 Electron 的完整示例，见 [JavaScript / H5 / Electron 中文分析指南](javascript-h5-electron.md)。

可显式切换 CLI 人类可读帮助的语言（**命令名、选项、JSON 字段及 MCP 协议不变**）：

```bash
TEKVRO_LANG=zh-CN node scripts/rea.mjs --help
TEKVRO_LANG=zh-CN node scripts/rea.mjs setup --help
TEKVRO_LANG=zh-CN node scripts/rea.mjs doctor --help
```

Windows PowerShell 请先执行 `$env:TEKVRO_LANG="zh-CN"`，随后运行同样的 `node` 命令；设置 `TEKVRO_LANG=en` 可切回英文帮助。

## 4. 配置 Codex MCP

```bash
node scripts/rea.mjs doctor --client codex --json
node scripts/rea.mjs setup --client codex --dry-run --json
TEKVRO_LANG=zh-CN node scripts/rea.mjs setup --client codex
```

**更新限制：** 私有源码版本执行 `node scripts/rea.mjs update` 会安全地拒绝连接原项目 npm 更新渠道。需要更新时，请先审阅自己的 Git 提交，再在 Tekvro 目录运行 `git pull --ff-only`、`npm ci` 和 `npm run build:cached`；不要执行旧版自动更新命令。

第三条命令会交互式请求你的许可，写入本机 Agent 配置，故不能把只读 doctor 的成功当成配置已完成。完成后重启 Agent 并检查 MCP 工具是否可用。

**本地源码安全规则：** Tekvro 当前是尚未独立发布的开发版本。安装向导默认写入 `Node.js 可执行文件 + 本仓库的 scripts/rea.mjs 绝对路径 + mcp`，不会通过 `npx rea-agents` 下载原上游包。在 Codex 或其他客户端配置中，请检查该命令实际指向自己的 Tekvro 工作副本；如仍指向公开 npm 包，请重新执行当前仓库的安装向导并审阅变更计划。保留的 `rea` 注册键目前属于兼容设计，不等于使用原作者发行版本。

**另一种注册方式：** 在源码根目录执行 `node scripts/rea.mjs mcp add` 时，也应注册当前工作副本的 Node.js 与 CLI 文件绝对路径，而不是 `npx rea-agents`。安装后请核对客户端实际启动命令，确保它与使用的仓库一致。

## 5. 开发检查

```bash
npm run metadata:check
npm run check:fast
npm run test:fast
npm run docs:build
```

这些是建议执行的命令，不代表当前环境已通过它们。原生真实工具链、平台和浏览器测试分别有各自依赖要求。

## 6. 已知兼容边界

源码 npm 包名是 `tekvro`，MCP Registry 草案标识是 `io.github.forcemind/tekvro`，二者均**未正式发行**。旧 CLI `rea` / `rea-agents` 别名和 MCP 客户端键 `rea` 暂时保留；旧注册命令仍可识别，但新安装默认使用本地 Tekvro。详细说明见[发行身份与兼容策略](distribution.md)，高级英文技术资料可从[文档导航](../index.md)找到。

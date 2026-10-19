# Tekvro · 探核

Tekvro 是面向软件结构与运行行为调查的本地分析工具。通过命令行（CLI）和 Model Context Protocol（MCP），它将静态分析、运行时观察和专业逆向工具连接起来，并以可追溯的证据组织分析结果。

[English](README.en.md) · [使用文档](docs/index.md) · [快速开始](docs/zh-CN/quick-start.md) · [H5 / JavaScript / Electron](docs/zh-CN/javascript-h5-electron.md) · [架构](docs/zh-CN/architecture.md) · [安全说明](docs/zh-CN/security.md)

## 功能

- **JavaScript 与 Electron**：分析打包应用、模块关系、调用线索、源码映射以及可观察的应用行为。
- **浏览器与网络**：结合本地浏览器调试接口（CDP），检查页面脚本、网络活动和部分运行时状态。
- **原生二进制文件**：通过可选的 Hopper、Ghidra、IDA 等分析引擎，检查程序结构、符号、指令和反编译结果。
- **其他软件制品**：提供 Android、.NET、固件、归档等类型的分析能力，实际覆盖范围取决于目标格式和已配置的工具。
- **证据与比较**：记录观察结果、推断依据、未知项及分析局限，为后续追踪和版本比较提供可复核的上下文。

CLI 和 MCP 使用相同的核心分析能力，可由开发者直接调用，也可供 Codex、Claude Code 等兼容 MCP 的 AI 工具使用。

## 快速开始

运行环境：Node.js `^22.19.0 || ^24.11.0 || >=26.0.0`、npm 和 Git。可选的原生分析引擎按需单独配置。

```bash
git clone https://github.com/ForceMind/Tekvro.git
cd Tekvro
git submodule update --init --recursive
npm ci
npm run build:cached

# 查看命令与可用能力
node scripts/rea.mjs --help
node scripts/rea.mjs capabilities --json

# 检查本机环境
node scripts/rea.mjs doctor --json

# 分析本地 JavaScript / Electron 构建目录
node scripts/rea.mjs analyze-javascript-application /absolute/path/to/app --json
```

示例中的路径应替换为实际存在且有权分析的本地目标。静态 JavaScript 分析不要求预先安装 Ghidra、Hopper 或 IDA。

更多操作示例见[快速开始](docs/zh-CN/quick-start.md)和[H5 / JavaScript / Electron 分析指南](docs/zh-CN/javascript-h5-electron.md)。

## MCP 集成

配置前可以先检查客户端状态和预计写入的设置：

```bash
node scripts/rea.mjs doctor --client codex --json
node scripts/rea.mjs setup --client codex --dry-run --json

# 确认变更后执行配置（macOS / Linux）
TEKVRO_LANG=zh-CN node scripts/rea.mjs setup --client codex
```

配置流程可能修改本机的 AI 客户端设置；请核对显示的变更及备份信息。其他客户端和平台的说明见[安装与配置文档](docs/zh-CN/quick-start.md)。

## 分析结果与边界

分析结果区分**观察（Observation）**、**推断（Inference）**和**未知（Unknown）**，并记录数据来源、覆盖范围与限制。静态源码线索不等于已经验证的运行行为；客户端分析也不能证明未观察到的服务器端实现。

工具仅用于用户有权检查的软件和环境。运行时访问、文件操作及专业分析引擎的具体权限由相应工具和工作流约束。

## 项目结构

- `src/`：领域模型、分析工作流、CLI/MCP 接口和分析适配器。
- `bridge/`：外部逆向引擎与系统工具的桥接代码。
- `tests/`：单元、集成、契约和边界测试。
- `scripts/`：构建、检查、验证和开发工具。
- `docs/`：使用说明、架构、协议和技术参考。
- `skill-src/`：面向 AI Agent 的操作说明。
- `third_party/`：第三方依赖与子模块。

开发规范与测试方法参见 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [测试文档](docs/testing.md)。

## 获取与版本状态

目前提供**源码构建方式**，尚未发布独立的 npm 包或 MCP Registry 条目。

- 源码包名为 `tekvro`，现有 `rea`、`rea-agents` 命令别名及部分 MCP 注册键保留用于兼容。
- `scripts/rea.mjs` 是当前源码构建的命令入口；不要将公共 npm 上的 `rea-agents` 包视为 Tekvro，也不要将 `npx tekvro` 当成已发布的安装方式。
- 产品包版本暂保留 `6.1.0` 兼容标记；主线已通过 PR #24 集成并验证固定 REA `6.7.0` 内核，具体提交及验证状态记录于 `engine-metadata.json` 和[集成记录](docs/upstream/rea-6.7.0-integration.md)，二者不代表正式发行版本。升级计划及独立发行准备情况见[开发路线](docs/roadmap.md)和[分发说明](docs/zh-CN/distribution.md)。
- 正式发行前，`install.sh` 不提供自动下载安装。

## 许可证

项目包含根据 MIT 许可证使用的 [REA](https://github.com/morluto/rea) 代码及其他第三方组件。许可证、版权声明和第三方告知见 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 技术参考

- [安装与客户端列表](docs/installation.md#supported-agents)
- [MCP Registry](docs/installation.md#mcp-registry)
- [MCP tool catalog](docs/mcp-contracts.md#generated-catalog)

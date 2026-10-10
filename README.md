# Tekvro · 探核

**用证据理解软件。**  
AI 辅助的软件结构、二进制文件和运行行为分析工具。

[English](README.en.md) · [中文文档](docs/index.md) · [快速上手](docs/zh-CN/quick-start.md) · [架构](docs/zh-CN/architecture.md) · [安全说明](docs/zh-CN/security.md) · [开发规范](PROJECT_MAINTENANCE.md)

> **项目状态：内部研发版。** 目前 GitHub 仓库仍为 `ForceMind/REA`；**Tekvro / 探核** 是新产品名。代码原始基线为 REA 6.1.0。尚未对外发布 Tekvro 的 npm/MCP 包，也未完成所有系统的兼容性测试。

## Tekvro 可以做什么？

让 Codex、Claude Code 等支持 MCP 的 AI 工具，结合真实分析证据调查软件：

- **JavaScript / Electron**：打包脚本、模块依赖、调用与部分运行行为；
- **原生程序**：借助用户配置的 Hopper、Ghidra、IDA 等工具检查二进制结构与反编译结果；
- **浏览器和应用运行态**：调查网页脚本、网络记录、进程与事件（受运行环境、授权及工具支持限制）；
- **其他制品**：Android、.NET、固件、归档等已有分析适配；
- **可复核结论**：区分观察（Observation）、推断（Inference）和未知项（Unknown）。

Tekvro **不是**通用的“一键还原源码”工具，也不会自动获得服务器端代码、密钥或受保护的内部逻辑。请仅分析你有权检查的对象。

## 从本仓库本地运行

**需要 Node.js `^22.19.0 || ^24.11.0 || >=26.0.0` 和 npm。** 请从本私有仓库构建，**不要把公开 npm 上的 `rea-agents` 误认作本项目构建**。

```bash
git clone https://github.com/ForceMind/REA.git
cd REA
git submodule update --init --recursive
npm ci
npm run build:cached

# 显示当前命令（内部兼容命令仍为 rea）
node scripts/rea.mjs --help

# 只读检查本地环境
node scripts/rea.mjs doctor --json

# 示例：静态分析你有权检查的 JS / Electron 解包目录
node scripts/rea.mjs analyze-javascript-application /absolute/path/to/app --json
```

> `tekvro` 已规划为新 CLI 命令别名；当前与旧 `rea` 调用兼容。项目的内部 npm 名称和 MCP 注册标识暂保留兼容，完整迁移将单独测试，避免破坏已有 Agent 配置。

## 为 AI Agent 配置 MCP

先检查，再决定是否写入自己的本地配置：

```bash
node scripts/rea.mjs doctor --client codex --json
node scripts/rea.mjs setup --client codex --dry-run --json

# 确认配置及文件备份计划后，才执行：
TEKVRO_LANG=zh-CN node scripts/rea.mjs setup --client codex
```

某些原生分析功能要求预先安装第三方软件；不应无条件在开发机上安装专业逆向工具。更多说明见[中文快速上手](docs/zh-CN/quick-start.md)。

## 代码结构

| 目录 | 内容 |
|---|---|
| `src/` | 核心领域模型、分析适配器、CLI/MCP 协议 |
| `bridge/` | 第三方逆向引擎的本地桥接 |
| `tests/` | 自动化与契约测试 |
| `scripts/` | 构建、检测、验证 |
| `docs/` | 中文入门与详细技术文档 |
| `skill-src/` | 面向 Agent 的工作指引 |
| `third_party/` | 子模块与外部依赖 |

## 维护与发布

- 独立研发由 ForceMind 维护。功能在分支开发，经 PR 和必要测试后合入。
- **禁止直接把原项目的 npm/MCP 身份或官网用作 Tekvro 的发布渠道。** 当前设为私有包；正式发布需单独确认新包名、许可证、域名、发布安全配置。
- 保留原项目 MIT 协议及第三方组件的必要署名；原始来源与版本详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- 项目尚未完成全部中文化：本次中文化覆盖入门文档、帮助引导和新维护材料，底层工具描述与少量高级文档仍为英文。

## 许可证与来源

此项目基于 [REA（morluto/rea）](https://github.com/morluto/rea)，初始源码对应上游提交 `f6fe575094658e99ced78d45f385633fbfaaae32`。原项目按 MIT License 发布，**原作者版权声明保留于 [LICENSE](LICENSE)**。

> Tekvro 是独立命名的衍生研发项目，并非原作者的官方产品。

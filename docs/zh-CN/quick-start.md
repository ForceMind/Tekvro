# 快速开始

本指南从安装 Tekvro 1.0.0 开始，完成环境检查、第一次静态分析和 MCP 客户端配置。

## 准备环境

- Node.js `^22.23.4 || ^24.22.1 || >=26.12.1`，推荐 `24.22.1`。
- npm，用于安装发行归档中的运行依赖。
- macOS / Linux 的安装脚本还需要 Bash 和 curl。

专用分析工具按任务配置；第一次分析本地 JavaScript 构建目录可以直接从下列步骤开始。

## 安装发行版

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/ForceMind/Tekvro/v1.0.0/install.sh -o install-tekvro.sh
bash install-tekvro.sh --version 1.0.0
tekvro --version
```

### 下载归档安装

从 [1.0.0 发行页](https://github.com/ForceMind/Tekvro/releases/tag/v1.0.0)下载 `tekvro-1.0.0.tgz` 和校验文件，按[分发说明](distribution.md)核对 SHA-256 后安装：

```bash
npm install --global ./tekvro-1.0.0.tgz
tekvro --version
```

Windows PowerShell 使用相同归档：

```powershell
npm install --global .\tekvro-1.0.0.tgz
tekvro --version
```

若终端找不到 `tekvro`，请检查 npm 的全局安装目录是否位于 `PATH`，然后重新打开终端。

1.0.0 通过 GitHub Release 分发。安装本地归档的命令使用 npm，但此版本未发布到 npm 注册中心或 MCP 目录。

## 检查环境

```bash
tekvro doctor --json
tekvro capabilities --json
tekvro --help
```

`doctor` 报告本机运行条件；`capabilities` 列出当前能力及其可用状态。可选工具缺失时，按计划使用的任务补齐对应依赖，具体配置见[安装与配置](../installation.md)。

## 完成第一次分析

准备一个有权检查、已经存在的本地构建目录，将示例路径替换为它的绝对路径：

```bash
tekvro analyze-javascript-application /absolute/path/to/app --json

# 保存证据，目标目录应已存在
tekvro analyze-javascript-application /absolute/path/to/app --json > evidence.json
```

静态目录分析读取应用文件并生成结构化结果。报告中应分别查看观察、推断、未知和覆盖范围，再据此选择后续调查。应用分析的更多示例见[应用分析指南](javascript-h5-electron.md)。

## 配置 MCP

先查看拟应用的配置，再运行设置向导：

```bash
tekvro setup --dry-run
tekvro setup
```

向导会显示客户端、启动命令、计划变更和备份信息。审阅并应用后，重新连接客户端，确认工具可见。客户端需要启动当前安装的 Tekvro；安装目录发生变化后，可重新检查并应用配置。

## 使用中文帮助

macOS / Linux：

```bash
TEKVRO_LANG=zh-CN tekvro --help
TEKVRO_LANG=zh-CN tekvro doctor --help
```

Windows PowerShell：

```powershell
$env:TEKVRO_LANG="zh-CN"
tekvro --help
```

设置 `TEKVRO_LANG=en` 可切换英文帮助。语言设置影响人类可读说明，命令名称、参数、JSON 字段和 MCP 协议保持稳定。

## 更新与继续阅读

更新时，从[发行页](https://github.com/ForceMind/Tekvro/releases)选择明确版本，校验归档后安装，并用 `tekvro --version` 和 `tekvro doctor --json` 检查结果。版本、资产和源码构建说明见[分发说明](distribution.md)。

[常见问题](faq.md) · [静态格式](static-formats.md) · [离线录制数据](offline-captures.md) · [安全说明](security.md)

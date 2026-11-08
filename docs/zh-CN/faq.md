# 常见问题

## Tekvro 可以做什么？

Tekvro 检查本地软件制品、观察选定的运行行为，并通过 CLI 与 MCP 返回带来源和覆盖范围的证据。可用能力取决于目标格式、宿主系统及已配置的分析工具。先运行 `tekvro capabilities --json` 查看本机状态。

## 应该在哪里下载？

从 [GitHub Release](https://github.com/ForceMind/Tekvro/releases) 获取明确版本的安装归档、完整源码、校验文件和发行清单。安装及 SHA-256 校验见[快速开始](quick-start.md)和[分发说明](distribution.md)。

## 为什么安装命令用了 npm，但包仍是 private？

npm 可以安装本地 `.tgz` 归档。Tekvro 1.0.0 通过 GitHub Release 分发，`private: true` 防止误上传到 npm 注册中心。本次发布未登记 npm 包或 MCP 目录条目，请使用发行页提供的归档。

## 支持哪些系统？

CLI 与 MCP 提供 Windows、macOS、Linux 入口。每项能力还有自己的宿主、架构、格式和外部工具要求。`doctor` 的环境检查、相应功能文档和版本测试记录共同说明实际范围；启动成功只说明当前入口可以运行。

## 必须安装专用分析工具吗？

按任务配置即可。可以先分析本地 JavaScript 构建目录，再为其他制品和运行观察配置所需工具。可选工具缺失时，诊断会显示对应能力不可用；配置说明见[安装与配置](../installation.md)。

## 可以完全离线使用吗？

已安装依赖且任务所需工具就绪时，本地静态分析可以使用本地文件。安装、更新、工具下载或连接联网客户端可能需要网络。连接模型服务前，请确认该客户端如何处理分析报告及目标数据。

## 能恢复任意软件的原始源码吗？

不保证。符号、源码、运行上下文或观察范围缺失时，报告会保留未知和局限。静态线索不能单独证明运行行为，客户端分析也不能说明未观察到的服务端实现。

## 为什么报告中有 unknown 或 partial？

它们说明尚未建立对应事实，或观察只覆盖了部分范围。查看结果中的来源、覆盖信息和局限，再决定是否补充文件、扩大显式选择范围或执行进一步观察。请保留原始证据，避免把未知字段改写为已完成。

## 如何使用中文？

在 macOS / Linux 中运行 `TEKVRO_LANG=zh-CN tekvro --help`。Windows PowerShell 先设置 `$env:TEKVRO_LANG="zh-CN"`。中文覆盖使用指南、设置向导和部分命令说明；专业工具输出和部分诊断仍可能为英文。命令、参数和 JSON/MCP 字段保持稳定。

## 如何配置 MCP 客户端？

运行 `tekvro setup --dry-run` 查看拟应用的变更，再运行 `tekvro setup` 审阅并应用。完成后重新连接客户端。若客户端无法启动工具，请检查实际启动命令与当前 Tekvro 安装目录，并运行 `tekvro doctor --json`。

## 如何更新和反馈问题？

选择发行页中的明确版本，校验后重新安装，再执行 `tekvro --version` 与 `tekvro doctor --json`。普通问题使用[Issue 模板](https://github.com/ForceMind/Tekvro/issues/new/choose)，附版本、系统、最小复现和脱敏后的诊断。安全问题按 [SECURITY.md](https://github.com/ForceMind/Tekvro/blob/main/SECURITY.md) 中的渠道报告。

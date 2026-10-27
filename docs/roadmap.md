# Tekvro（探核）研发路线

> 2026-10-27：固定 REA 6.8.0 已通过 [PR #28](https://github.com/ForceMind/Tekvro/pull/28) 合并至 main（4582d229）。完整资格及合并后主线 CI 均通过：33,591 通过、234 跳过、0 失败。当前范围、证据链接和下一阶段入口见[6.8 集成记录](upstream/rea-6.8.0-integration.md)。产品包兼容版本仍为 6.1.0，尚未正式发行。

> 2026-10-19：基于既有 6.5.0 集成分支实施固定 REA 6.7.0 内核升级，PR #24 已在完整资格通过后合并至 main（0707367）。能力实现、运行记录和剩余限制见[集成记录](upstream/rea-6.7.0-integration.md)；生产代码集成不等于所有可选引擎实机验收。

## P0：独立品牌与安全隔离（当前）

- 中文首页、品牌说明、中文快速开始与技术架构。
- 所有主要对外链接指向 ForceMind；上游推广徽章、社区导流和误导性安装提示不再出现在新首页。
- npm 包禁止发布；旧 npm、MCP 注册与命令仍作为内部兼容资产，不发布到原项目的外部身份。
- 复制式继承的发布流程保持锁定；发布、网站、域名和密钥需重新建立。
- 维护原 MIT 版权与独立第三方许可证。

## P1：本地化闭环

- 建立 `zh-CN`、`en` 的可维护文案目录；向导优先覆盖简体中文，再逐步扩展 CLI 人类可读提示。
- 完成配置向导的中文可用性和回归测试，保留 `--json` 结构字段，绝不翻译机器可读协议名。
- 完整整理安装、故障排查、平台支持、MCP 连接、Evidence 解释等中文文档。
- 使用权利明确的测试样本完成 Mac、Linux、Windows 的真实环境验证。

## P2：彻底产品身份迁移

- [进行中] 已将源码 npm/MCP 身份切换为 `tekvro` / `io.github.forcemind/tekvro` 并保留旧命令识别；正式注册和发布仍需额外审核。
- [未完成] 逐步迁移 MCP 客户端键、Skill、安装器、升级路径、发布版本和签名，保留旧配置的兼容读写。
- 用独立品牌和主题重新制作网站；删除过时的上游营销站点及其发布脚本，并同步修改相关测试。
- 重新设计安装器与升级检查，避免调用或错误推广上游发行渠道。
- 完成许可证核查、安全扫描、最小权限发布与版本化交付。

## P3：产品差异化

- 将游戏/H5/Electron 软件分析沉淀为 Evidence 工作流。
- 提供可复用的结构化分析报告和多版本差异，验证局限而非宣称可恢复任意源码。
- 维护受控的 upstream 对照表，评估安全修复后选择性移植，而不是自动覆盖独立工作。

## 专项 U：REA 6.1 → 6.5.0 内核迁移（已列入计划）

> **历史计划：以下 T64/T65 项目现由 PR #24 的 6.7.0 实施统一覆盖，核心检查通过且已合并；可选提供方按实测边界单独验收。** 与 P0–P3 并行管理，不取代现有品牌、中文化、发行身份和产品差异化路线。

- 冻结上游来源为 [REA 6.4.0 tag](https://github.com/morluto/rea/releases/tag/rea-agents-6.4.0)，包含 6.2/6.3 的不兼容变更；当时 Tekvro 为 REA 6.1.0 引擎基线，绝不能通过修改版本号冒充升级完成。
- [6.4.0 底层兼容性方案](zh-CN/rea-6.4.0-upgrade-plan.md) · [6.5.0 增量实施方案](zh-CN/rea-6.5.0-upgrade-addendum.md) · [GitHub 总跟踪 Issue #21](https://github.com/ForceMind/Tekvro/issues/21)。
- **P0 优先：** T64-00 基线审计，T64-01～03 Evidence/MCP/捕获/资源契约迁移，T64-04 大型 JS/H5/Electron 分析稳定性、保留证据、按需读取和 RPC 识别。
- **P1 扩展：** T64-05 Android ADB/Apktool/可选 JEB；T64-06 Ghidra/原生能力；T64-07 Agent 集成与中文化。
- **新增目标：** [REA 6.5.0](https://github.com/morluto/rea/releases/tag/rea-agents-6.5.0)（固定 tag `3b79af28e80785afce9f5998d8f03289402a1847`），相对于 6.4.0 新增大量 JS、WASM、Electron、Evidence、网络、SQLite 与原生分析能力；6.2～6.4 的不兼容契约仍是前置工作。
- **6.5 P0：** T65-01 精确 JS 源码范围/多 Bundle 恢复，T65-02 WASM 与 Electron Fuses，T65-03 retained Evidence 与 HAR API surface。
- **6.5 P1：** T65-04 SQLite/PCAP/QUIC 等离线来源，T65-05 Flutter/Android/Frida/原生分析，T65-06 新不兼容协议和总验收。
- **研究产物：** [6.4→6.5 完整文件差异与源码记录](https://github.com/ForceMind/Tekvro/tree/research/rea-6.5.0-source-20261015/docs/upstream)。
- **最终关口：** T64-08 完整 CI、允许的实机验证、历史证据保留、安全与独立版本审查；第三方引擎不可用时只能写明未验证，不能假称完成。
- 先协调[已有中文帮助 PR #20](https://github.com/ForceMind/Tekvro/pull/20)，保护 `TEKVRO_LANG`、独立 npm/MCP 身份、受兼容约束的旧 CLI 和发布保护；所有实现走独立 PR，稳定 `main` 不直接覆盖。
- 本专项**不解除** `package.json` 的 `private: true`、原上游 Release 禁令或安装器预发布拦截；独立 Tekvro 版本发布另行验收。

### 当前验证声明

6.5.0 文档阻塞已修复；6.7.0 生产源码、契约、CLI/MCP 和新增分析适配已集成。真实 H5、WASM、macOS Electron 及多项平台包检查已通过，完整 CI 共 19,178 通过、170 跳过、0 失败，所有必要门禁通过且 PR #24 已合并。Linux Electron 的进程归属和清理限制、未配备的专有引擎与设备均保留明确边界。最终验收只以当前提交的实际 CI 和运行记录为准。

### 6.7 可验证交付范围（2026-10-19）

PR #24、#26、#25 已合并，核心契约与 CLI/MCP 接入完成，19,179 项通过、170 项跳过、0 失败。固定 Ghidra/Kuna/JADX/Apktool 的真实 Linux x64 验收和 H5/WASM、macOS arm64 Electron 验收通过；具体源码提交、样本、清理证据及复现命令见[集成记录](upstream/rea-6.7.0-integration.md)。不能从平台包通过推导全部可选引擎在所有平台通过。

后续维护保留明确关口：Linux active Electron 的进程归属/清理限制；未提供的商用引擎实例和授权设备/动态目标；独立发行审核。保持 private、源码安装/更新边界和完整证据检查，正式发布不在本次源码升级范围内。

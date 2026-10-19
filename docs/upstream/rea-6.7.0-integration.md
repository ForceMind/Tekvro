# REA 6.7.0 内核集成记录

## 固定来源和状态

- 基于现有 6.5.0 集成成果继续开发；文档检查的 languages.json 阻塞已修复。
- 目标源码：REA 6.7.0，提交 `27dc42d10249f0410904a75c0997842eb03b931c`。
- 实施 PR：[#24](https://github.com/ForceMind/Tekvro/pull/24)，总任务：[#21](https://github.com/ForceMind/Tekvro/issues/21)。合并与资格状态以该 PR 的当前提交检查为准；下列记录区分已执行样本与未验证范围。
- 生产代码已接入 src、bridge、CLI、MCP、配置编辑、Evidence、Snapshot 与分析提供方；研究分支没有整体合并。
- 产品包保留兼容版本标记，内核来源单独记录在 engine-metadata.json。private:true、安装器拒绝、源码更新拒绝及发布工作流身份保护保持。

## 契约和能力

- Evidence 和 Snapshot 的 relationship_coverage 纳入解析与摘要身份；缺失字段的历史 Evidence 不补造，保留原始文件并重新采集。
- Artifact Inventory 覆盖范围、integrity_contradictions、浏览器预算与遗漏、取消和清理证据、provider unknown 状态沿固定 6.7.0 生产者和消费者同步迁移。
- JavaScript 精确源码选择、模块关系及 retained javascript-facts 路径/属性过滤和分页接入共享 CLI/MCP 工作流。
- 集成 WASM、Electron、APK 多语言表、Kuna、Ghidra 架构更新、网络保存制品与 SQLite 等对应适配代码。适配代码不等于外部工具实机验证。
- JSON/JSONC 重复成员沿新版格式解析和事务编辑，仍保留 Tekvro 本地注册策略及旧命令兼容。

## 已执行验证

本地 Linux / Node.js 24.19.0：npm ci、build:cached、docs:check 已通过；中文 CLI 11 项、源码更新拒绝与发行配置 6 项通过。其后配置和安装器回归仍在迭代，完整 CI 未通过前不得宣布验收。

本机沙箱的 /proc 进程身份读取与 Unix socket 受限，部分真正启动受监督进程的分析会明确返回 capability_unavailable。相关用例交由 GitHub 托管运行器验证，不能把本机受限执行当作分析成功。

## 验证边界与恢复

无真实 Hopper、IDA、Kuna、JADX/ADB 设备或 Frida 插桩验收声明。CI 的平台和样本通过项在本记录后续补充；模拟提供方只验证协议和错误行为。

- 所有开发均在实施分支，main 仍保留既有版本。回滚使用 PR revert，不强制改写主线。
- 继续处理 PR #24 的失败检查、跨平台包验证、真实 H5/Electron/WASM 和 MCP Evidence 链路。
- 不设置定时任务，不执行 npm、Registry 或正式 Release 发布。

### 真实 Linux Electron 边界（2026-10-19）

固定 Electron 44.9.0 的 CLI/MCP 验收进入了 discovery、页面脚本检查、静态分析与 runtime reconciliation；作业因 Chromium 子进程 run-token mismatch 和 /proc/environ 权限限制在清理阶段失败。原始记录：[Linux 验收](https://github.com/ForceMind/Tekvro/actions/runs/39214005017)。这与上游 docs/verification/electron-cancellation-2026-10-16.md 记录的 Linux ownership gap 一致。

不能将该结果写成 Linux Electron 完整运行成功，也不能用进程名称或 PID 推定归属来强行清理。完整 Electron 验收改在 macOS arm64 执行；Linux Electron 运行和取消仍保留 partial/cleanup_incomplete 边界，是否满足具体任务需逐项判断。Linux H5 静态、浏览器和 WASM 分别验证。

### 已通过的真实核心验收（2026-10-19）

[Linux 核心作业](https://github.com/ForceMind/Tekvro/actions/runs/39214005017)：精确 JavaScript source selection、retained MCP facts 分页、Electron 模块静态互操作与 Fuses 的 24 项测试通过、1 项按平台跳过。固定 WABT 1.0.42 的实际 WASM 制品检查与接口比较均通过，使用官方 release asset 并核对 SHA-256；未将跳过执行视作通过。

后续修复恢复了顶层与 setup/doctor 的既有中文帮助，扩展 WASM 和 Evidence 查询中文帮助，并恢复带空格、单双引号源码路径的本地 MCP 注册序列化；19 项 CLI/注册/更新拒绝测试本地通过。完整资格 CI 以 PR 当前 head 为准。为避免旧的完整资格作业阻塞更新后的 head，ci:full 的并发分组绑定实际 PR head SHA；保留旧作业记录。

### 当前 head 的资格验证进度（2026-10-19 07:27 UTC）

提交 `6aecacf82936c499bb0b67039adabd84ccafc63e` 的[核心验收](https://github.com/ForceMind/Tekvro/actions/runs/39215091356)通过：Linux JavaScript 选择和 retained facts、固定 WABT 的源码及安装包 WASM CLI/MCP、macOS arm64 官方 Electron 44.9.0 的完整生命周期、IPC、reload、取消与清理。此前 Linux Electron 失败记录仍适用。

[完整 CI](https://github.com/ForceMind/Tekvro/actions/runs/39215091650)的静态检查、包构建、文档生成、真实浏览器、Web runtime、HAR/PCAP 网络捕获、源映射、JavaScript recovery、二进制布局、Linux x64/arm64 包基线以及 Node 22/24/26 SQLite 检查已通过；六分片回归及剩余平台检查仍在执行。Ghidra 此处仅验证桥接源码编译，不能推导为所有架构实机成功。

真实 Go metadata、packet capture 和 signal recording 独立工作流也已通过。录制崩溃的 Ubuntu/Debian 作业发现旧安装包路径，现已改为 `node_modules/tekvro` 并增加有限 stderr 诊断；需要新提交 CI 重新验证。本地包 canary 已进入 MCP 生命周期，但因 Work 的 procfs 限制失败，未计为通过。恢复发布工作流也增加了与主发布流程一致的上游仓库保护，Tekvro 不会执行 npm 或 MCP Registry 发布。

回归依赖的 `javascript-interruption-applicability-2026-10-15.json` 从固定上游提交逐字保留；它是上游历史 Joplin 样本记录，仅用于检验 scope 归因的正确/错误对照，不能算作本次 Tekvro 运行证据。

### 完整回归修复批次（2026-10-19 07:36 UTC）

完整 CI 的六个分片已返回，发现并修复 Tekvro 产品适配遗漏：旧 npm 安装路径、源码更新拒绝、包身份夹具、本地 launcher 及 doctor 的入口身份、中文 PR 模板、README.en.md 文档分流、生成的翻译暂存目录和托管缓存策略。保留旧版精确 npm 注册的读取并提供迁移提示；新配置继续指向本地 Tekvro。没有删除有效检查或把未知身份提升为已对齐。

本地针对性复测：文档分流 224 项通过；配置/模板/历史 scope 与 tar 清单批次中已修复的 287 项通过（含 1 项平台跳过），两项 CLI 文件单独复测 4 项通过；注册状态 39 项通过、3 项跳过；最后分片策略/缓存/分层配置 31 项通过；双语帮助及带引号路径本地 MCP 注册 18 项通过。check:ci 的 8 个任务、架构守卫、docs:check 和许可证检查通过。npm runner 模拟环境的 setup/doctor 两项在 Work 受限宿主仍无法运行，必须以托管运行器结果验收。

真实 Windows 包/能力、Apple CLI/MCP、Linux 与 macOS 的四个架构包基线在旧 head 的完整 CI 均已通过；这些结果不代替本批次当前提交的完整资格。新 CI 需要重跑全部必要检查。

### 发行身份末轮审计

Windows/MSIX 修复提示、Grok Bot 手工配置、交互向导与 Windows native 恢复文档的旧上游包建议已改为当前 Tekvro 源码工作流。尤其不能用 `rea-agents@6.1.0` 的原生二进制匹配 Tekvro 的产品兼容版本：Windows addon 必须来自同一 Tekvro Git 提交的 CI 构建，或由该源码明确构建。manifest 的版本/ABI/哈希校验不代替操作者确认源提交。历史 `docs/user-visible-errors.csv` 是原上游错误文案研究记录，其中旧命令不是当前安装指引。

Windows 修复提示复测：提交 `9ade4fd` 的完整 CI 第六分片发现 Ghidra doctor 断言仍要求旧 REA 包说明；已同步 Ghidra/JADX/Windows 回归与 Tekvro 构建指引。Ghidra doctor 16 项、Windows conformance 4 项及 JADX 的 10 项本地检查通过；另外 10 项需要启动 Java 探针，在 Work 的 procfs 限制下失败，仍交由当前提交 CI 验证。没有放宽权限或制品真实性校验。

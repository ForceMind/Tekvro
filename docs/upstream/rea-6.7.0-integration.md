# REA 6.7.0 内核集成记录

## 固定来源和状态

- 基于现有 6.5.0 集成成果继续开发；文档检查的 languages.json 阻塞已修复。
- 目标源码：REA 6.7.0，提交 `27dc42d10249f0410904a75c0997842eb03b931c`。
- 实施 PR：[#24](https://github.com/ForceMind/Tekvro/pull/24)，总任务：[#21](https://github.com/ForceMind/Tekvro/issues/21)。尚未合并主线；最终状态以 PR 检查为准。
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

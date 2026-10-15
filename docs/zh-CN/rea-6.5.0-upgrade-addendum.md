# Tekvro｜REA 6.5.0 升级补充计划

> 更新日期：2026-10-15。原 [6.4.0 底层升级实施方案](rea-6.4.0-upgrade-plan.md) 保持有效，本文件补充 6.5.0 的新增能力和契约变化；**源码研究已完成第一轮，但 Tekvro 尚未合入新版引擎，也未完成升级验证**。

## 版本目标

- 当前 Tekvro 主线仍为源于 REA 6.1.0 的独立源码工程。
- 底层迁移链：6.1 → 6.2 → 6.3 → 6.4，完成原计划 T64-00～T64-03 的关键 Evidence/MCP/资源安全契约。
- 新增目标：REA `rea-agents-6.5.0`，tag commit `3b79af28e80785afce9f5998d8f03289402a1847`，并对标记的 Breaking Changes 增加回归。
- 上游 6.4.0 tag commit：`a56f7bb668ab23fec8d33f7af353ac7ed2fe1895`，作为本轮代码级增量比较基准，不直接使用可变的 `upstream/main`。
- 已建立 [6.5.0 隔离研究分支](https://github.com/ForceMind/Tekvro/tree/research/rea-6.5.0-source-20261015)、[逐文件差异报告](https://github.com/ForceMind/Tekvro/blob/research/rea-6.5.0-source-20261015/docs/upstream/rea-6.5.0-delta.md)和[源码研究记录](https://github.com/ForceMind/Tekvro/blob/research/rea-6.5.0-source-20261015/docs/upstream/rea-6.5.0-code-review.md)。
- 上游 Git 版本间 894 次提交，文件级对比发现新增 1,164、改变 1,522、删除 54；5 个 submodule 的 Git 指针已记录，实际内容仍需独立初始化和验证。

## 执行包和完成门槛

### T65-00｜上游源码引入与 6.4/6.5 差异研究

**状态：** 原始受 Git 跟踪的 6.5.0 文件和差异清单已进入隔离分支，源码导入 GitHub Action 已成功；尚未完成独立依赖安装、构建验证或所有运行契约检查。

- 校验 tag commit、普通文件路径与 SHA-256，保留 6.4.0 和 6.5.0 两个原版目录。
- 以 `docs/upstream/rea-6.5.0-file-diff.tsv` 的完整清单为基础按契约、功能和平台划分移植提交。
- 不直接覆盖 Tekvro `package.json`、`src/identity.ts`、`install.sh`、`README`、`.github/workflows/release.yml` 或 `TEKVRO_LANG` 本地化流程。

### T65-01｜JS 应用精准选择与跨 Bundle 恢复（P0）

- 移植 `source_paths` / `--source-path` 选择范围；未分析脚本不能被标记为不存在或已解析，保留整个应用的原始哈希与文件清单。
- 移植 `recover_javascript_sources` 的 `additional_paths` / `--additional-path`，保留各输入文件来源与跨 chunk 引用。注意上游相关实机验证主要限 Linux x64 + Wakaru 1.14.0。
- 在 H5 游戏／Electron 打包目录上测试入口路径、异步 chunk、非法路径、资源上限、取消和部分证据；与现有中文命令帮助对应，不能悄悄删除已有参数。
- 上游多输入恢复的已验证实现最多接受 16 个附加路径，合计输入上限 64 MiB；支持平台与版本应以实际移植后的验证为准。

**验收：** source scope 与 Evidence 覆盖可追溯，多份构建脚本之间真实已观察的关系可回读；不把静态恢复称为完整原始源码。

### T65-02｜WASM 与 Electron Fuses（P0）

- 移植 `inspect_wasm_artifact` 和 `compare_wasm_interfaces`，兼容可选用户安装的 WABT。WASM 输入输出及类型化接口可比对，但不声称还原 Unity 原始 C# 或证明可执行等价性。
- 移植 `inspect_electron_fuses`，只读检查应用内 Electron 二进制的配置位，将静态检查结果用于诊断 Inspector 不可用、ASAR 加载与完整性边界。
- 对 WABT 缺失、错误模块、重复接口、不同宿主、ASAR 及 multi-arch Electron 二进制做拒绝/unknown 测试。

**验收：** Node/CLI/MCP 命令、能力发现与诊断一致；实际 WASM 和 Electron 样本有哈希、证据 ID 和局限描述。

### T65-03｜Evidence 视图与 HAR API 表面（P0/P1）

- 扩展 `inspect_analysis_view` 的 summary、item、page 覆盖，使大型 Android、WASM、.NET、Dart、binary 结果在保留完整 Evidence 的前提下按需读取。
- 支持从已保存的 HAR 中推断分组的 method/origin/path template API Surface；不能暴露未经选择的敏感 query 值、headers、body，也不能推断服务器源码。
- 向 MCP 正常返回 parent Evidence ID、覆盖、不完整来源/分页终止信息，避免大结果超过消息限额。

**验收：** 保留完整 Evidence 作为可信父结果，可连续分页回读；缺失字段与网络失败不能自动补全。

### T65-04｜SQLite 与更丰富的网络捕获（P1）

- SQLite 离线快照只读分析必须进行运行时能力检查：需 Node 24.15+（24.x）或 Node 26+，在 Node 22 上明确标记 unavailable。
- PCAP/TShark、QUIC qlog、Fiddler SAZ、sigrok 信号记录分为独立可选分析引擎；不安装软件，不自动捕捉实际用户流量。
- 结合已有 Web/H5 观察分析 HAR 与 PCAP 示例，只提取有实际覆盖的端点和协议事实。

**验收：** 带 WAL 的 SQLite 演示、已获授权的 PCAP/HAR 模拟样本和权限/清理/超时边界通过；缺少外部工具时不阻塞核心 H5 交付。

### T65-05｜Android、Flutter、Frida 与原生增强（P1/P2）

- 在原 T64-05/06 基础上增加 DEX 引用事实、Flutter AOT/HarmonyOS 静态包结构和 Ghidra 的 raw/MIPS/RISC-V 等有限目标。
- 原生 IDA attached MCP 与 Ghidra/Frida 明确区分只读与有副作用的操作；Frida attach/spawn 执行用户脚本必须严格采用效果与风险标注。
- JEB、Ghidra、Frida、WABT、TShark 等真实环境仍需按需提供，模拟验证不能冒充实机覆盖。

**验收：** 每项支持声明引用实际宿主、版本、样本和成功的测试记录；Windows/macOS 未验证路径标记为未验证。

### T65-06｜6.5 契约更新与最终验证（阻塞版本升级声明）

同时修复发行说明中十组不兼容变化：

1. `attached: null` 表示未知，不是 `false`。
2. Source map 的原始源名可以是 `null`。
3. `--filter-output` 选中空值时返回 JSON `null` 而非 `{}`。
4. `get_call_graph.normalized_result` 改为 `{ graph, limitations }`。
5. `binary_session` 不再重复 `server_identity.catalog.tools`。
6. 部分 MIPS ABI、Hopper macOS 数据库会明确拒绝支持。
7. `binary_overview` 中 segment length 允许 `null`。
8. `server.command_path` 和部分 doctor/setup 状态允许未知。
9. ADB 安装意图用 `replace_requested` 记录，`replaced` 可为 `null`。
10. P/Invoke 候选即使无法完成验证也不能丢弃。

**最终关口：** 真实 Node 运行时矩阵、CI 工程、中文帮助回归、旧证据拒绝与重采样路径、MCP Schema、H5/Electron/WASM/SQLite 演示、安全/版权和子模块验证全部按纳入范围执行。无实机资源的可选能力必须在支持矩阵中注明「未验证」；`private: true`、独立 npm/MCP 身份及安装器保护不得解除。

## 依赖关系与实际开发顺序

基础串行链：`T64-00 → T64-01 → T64-02 → T64-03 → T64-04 / T65-01`。

可在新契约通过后并行：`T65-02`（WASM/Electron）、`T65-03`（保留证据摘要与 API surface）、`T65-04`（SQLite/网络）、`T64-05/06 与 T65-05`（Android/原生）。

最终版本关口：`T64-08 + T65-06`。仅在某项功能实际移植、测试并合并到 Tekvro 主线后将其标记为已具备；不得通过直接修改 package version 来宣称升级完成。

升级总任务：[Issue #21](https://github.com/ForceMind/Tekvro/issues/21)。完整上游源码仅存放在研究分支，不混入产品源码根目录；每项功能以独立开发 PR 验收。

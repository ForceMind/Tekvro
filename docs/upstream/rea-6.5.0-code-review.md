# REA 6.5.0 源码研究与 Tekvro 集成判断

> 2026-10-15。基于已导入的 REA 6.4.0 与 6.5.0 原始快照进行对照。**仅为源码研究，尚未合入 Tekvro 引擎，尚未执行构建或实际分析测试。**
>
> 逐文件数据：[6.4 → 6.5 差异](rea-6.5.0-delta.md) · [完整 TSV](rea-6.5.0-file-diff.tsv) · [REA 6.5.0 发行记录](https://github.com/morluto/rea/releases/tag/rea-agents-6.5.0) · [Tekvro 升级总任务](https://github.com/ForceMind/Tekvro/issues/21)

## 固定版本与代码规模

- 上游版本：`rea-agents-6.5.0`，commit `3b79af28e80785afce9f5998d8f03289402a1847`，发布时间 2026-10-14T12:32:45Z。
- 从 6.4.0 tag 到 6.5.0 tag：GitHub 返回 894 次提交；发行记录列出 529 个合并 PR。
- 新版包含 3,777 个 Git 跟踪源文件（不含 5 个子模块仓库的实际内容）。
- 与 6.4.0 源码相比：1,164 个新增路径、1,522 个同路径内容改变、54 个删除路径、1,091 个完全相同。
- 两版原始源码分别位于 `upstream/rea-6.4.0/` 和 `upstream/rea-6.5.0/`，不会覆盖 Tekvro 根目录中的产品代码。

## 高价值功能：优先研究与集成

### P0-A：JS 源码范围选择与多 Bundle 恢复

**已检查的代码：**
- [应用分析 schema](../../upstream/rea-6.5.0/src/domain/javascript/javascriptApplicationAnalysis.ts) 新增可选 `source_paths`；[6.5.0 发布所引用的 PR #1944](https://github.com/morluto/rea/pull/1944) 明确了逐文件选择、未选择范围的 unknown coverage。
- [恢复 CLI](../../upstream/rea-6.5.0/src/cli/javascriptRecoveryCommands.ts) 新增可重复的 `--additional-path`，将多份相关分包交给同一次恢复；[PR #1686](https://github.com/morluto/rea/pull/1686) 的验证范围是 Linux x64 + Wakaru 1.14.0 + 自有 webpack/esbuild fixtures，最多增加 16 个输入文件，聚合输入上限 64 MiB。
- 对 H5 游戏的价值：优先分析入口 JS 而非整个大目录；相关 chunk 的引用关系可在同一张证据图中更精确地恢复。

**具体集成要求：** 保留文件/源映射哈希及被跳过文件的 unknown 状态；中文 CLI 帮助与机器可读 schema 同步但不互相改变；使用 Vite/Webpack 及带按需加载 chunk 的示例验收。不能把多 Bundle 恢复结果称为原始源码或运行等价程序。

### P0-B：WASM 静态检查与模块接口对比

**已检查的代码：**
- [WABT provider](../../upstream/rea-6.5.0/src/wasm/WabtArtifactProvider.ts) 用外部 WABT 对用户选定的 WASM 文件进行只读检查，保留文件摘要、WAT、import/export 和 JS glue 对照候选。
- [WASM CLI](../../upstream/rea-6.5.0/src/cli/wasmCommands.ts) 提供 `inspect-wasm-artifact` 与 `compare-wasm-interfaces`；[PR #1533](https://github.com/morluto/rea/pull/1533) / [PR #2464](https://github.com/morluto/rea/pull/2464) 明确比较的是 core-module 导入导出接口，而非可执行逻辑、性能或运行兼容性。

**具体集成要求：** WABT 为用户自备的可选依赖，需在 `doctor/capabilities` 中准确显示；使用两个结构相似但接口不同的 WASM 样本和一个 JS glue 样本做回归。对 Unity WebGL 等重度 WASM 游戏不得宣称已恢复 C#/C++ 原码或服务器逻辑。

### P0-C：Electron Fuses 与调用前环境判断

[ElectronFuseProvider](../../upstream/rea-6.5.0/src/electron/ElectronFuseProvider.ts) / [PR #2399](https://github.com/morluto/rea/pull/2399) 通过只读静态字节检查，报告 Inspector 命令行是否会被采纳、`ELECTRON_RUN_AS_NODE`、ASAR 完整性与代码装载限制等 fuse 配置。可在尝试 Electron 动态观察前提供准确的环境阻断说明。

**集成要求：** 可读取 macOS/Windows/Linux 支持格式中的实际 fuse，不修改目标；不把 fuse 结论扩展成全部运行态安全性判断。连接现有 Electron 静态/运行态调查和中文报告。

### P0-D：Evidence 摘要与按需读取扩大覆盖

[分析视图模型](../../upstream/rea-6.5.0/src/domain/analysisView/analysisView.ts) 扩展了原有 retained Evidence 视图，6.5.0 新增对 WASM、Android、.NET、Dart 等多种结果的摘要与分页。前提仍是完整、可信的父 Evidence 已记录，不能截断结果后生成冒充完整的摘要。

**集成要求：** 同步 Evidence 身份认证、parent ID、覆盖和原始引用；用大目录/大模块数据测试 MCP 响应体积上限、分页连续性与部分故障的可恢复引用。属于现有 6.4 Evidence 契约计划的扩展，不应创建第二套结果系统。

### P1-A：网络 API 面与离线抓包

- 由已保留的 HAR 数据按方法、来源与路径模板生成 **推断性 API Surface**；[PR #1891](https://github.com/morluto/rea/pull/1891) 不从请求猜服务器内部实现，也不默认输出敏感查询值与报文体。
- 新增 PCAP/PCAPNG + TShark/`capinfos` 处理，可获取 HTTP URL、DNS/TLS SNI 与协议分布；[PCAP tool contracts](../../upstream/rea-6.5.0/src/contracts/pcap/pcapToolContracts.ts) 明确其处理的是已保存的抓包文件而非主动抓取用户流量。
- QUIC qlog、Fiddler SAZ、sigrok 信号记录属于独立补充；尤其 sigrok-cli Linux 限定且不负责采集硬件波形。

**集成要求：** 以用户提供且获授权的 HAR/PCAP 演示样本做隐私剔除、分组和分包验证。不能把推断的 URL 模板当成已确认服务器接口文档。

### P1-B：SQLite 离线数据库

[SQLite Provider](../../upstream/rea-6.5.0/src/sqlite/SqliteDatabaseProvider.ts) / [PR #2271](https://github.com/morluto/rea/pull/2271) 对指定本地 SQLite/WAL 拷贝做只读检查与有限行/列投影；**需要 Node 24.15+（且属于 Node 24）或 Node 26+**。当前通用运行时允许 Node 22，但此能力不能在 Node 22 上宣称可用。

**集成要求：** 添加运行时能力门槛与明确拒绝路径；选择无敏感信息的游戏/应用本地演示数据库，校验表结构、精度、blob 限制和 WAL 快照一致性。

### P1-C：Android / Flutter / HarmonyOS / 原生程序

- 6.4.0 的 ADB/JADX/Apktool/JEB 计划继续，6.5.0 增加 DEX 指令引用和 Flutter APK AOT 结构检查。
- HarmonyOS HAP/HSP/App Pack 是静态包清点，不能当成运行时行为恢复。
- Ghidra 新增更明确的 raw、MIPS、RISC-V、PPC 等限域输入；IDA attached native MCP 可选。
- [Frida 合约](../../upstream/rea-6.5.0/src/contracts/fridaToolContracts.ts) 允许 attach/spawn 与用户提供脚本执行，有真实目标修改风险，不属于默认只读分析，应独立标识效果与权限边界。

**集成要求：** 在 T64-05/T64-06 扩展任务内分子模块合入；Frida 必须单独测试持有者、取消、超时、凭据遮盖与真实宿主验证；无真实 provider 记录不得称兼容。

## 6.5.0 的 Breaking Changes：至少以下十项

发行记录包括以下契约修改，需要与 6.2/6.3/6.4 的更改一并迁移：

1. JS/浏览器/Electron 的 `attached` 可为 `null`（未知），不等于 `false`。
2. Source map 的原始源名可为 `null`；不可编造字符串占位。
3. `--filter-output` 选中的显式空值返回 JSON `null` 而非 `{}`。
4. `get_call_graph.normalized_result` 改为 `{ graph, limitations }`。
5. `binary_session` 不再重复 `server_identity.catalog.tools`，应从真实 MCP 工具列表和可用性读取。
6. 部分 MIPS ABI 不完整目标拒绝分析；Hopper macOS 数据库文件不可假定可启动分析桥。
7. Hopper `binary_overview` 段长度可为 `null`。
8. `server.command_path` 和部分注册/doctor 判断可以未知或 `null`。
9. ADB 安装返回 `replace_requested`，`replaced` 可为空，不能将意图等同于实际替换。
10. Managed/native P/Invoke 未完全识别时仍可能保留候选信息，不得以 unresolved 推断零事实。

**迁移策略：** 合同/Schema、生产者、CLI/MCP 消费端和旧 Evidence 负向测试一起改；现有已保存的旧数据保留原件，不造假补齐时间戳、identity、缺失字段或未知结果。

## Tekvro 现有代码与上游身份冲突

- 上游 `package.json` 仍为 `name=rea-agents` / `mcpName=io.github.morluto/rea`；Tekvro `main` 需要保留 `tekvro`、独立 MCP 身份和 `private: true`。
- 上游 `src/identity.ts`、`install.sh`、`release.yml`、`website`、`README` 不能直接覆盖 Tekvro 的独立品牌、安全默认配置和已整理的中英产品文档。
- Tekvro 的 `TEKVRO_LANG` 中文帮助及 PR #20 尚有独立迭代，升级 CLI 时应重放双语帮助/选项对照测试。
- 6.5.0 上游与 6.4.0 的底层契约变化都需要整体应用；不能仅将新增的 `src/wasm`、`src/sqlite`、`src/frida` 三个目录拷入根目录即认为实现完成。

## 执行优先级与验收

1. **先完成原计划 T64-00～T64-03**：Evidence、资源生命周期、旧数据、CLI/MCP 协议底座，确保核心构建回归无倒退。
2. **继续 T64-04（JS/大结果）并新增 T65-01（JS source_paths + multi-chunk）**：首先服务于 H5/Web 玩法与应用逆向。
3. **新增 T65-02（WASM + Electron Fuses）**：优先构建无外部 Native 反汇编器时仍可核查的静态能力；WABT 必须作为显式外部依赖。
4. **新增 T65-03（Evidence 视图 + HAR API Surface）**，T65-04（PCAP/SQLite）；严格区分可选生产者缺席的情形。
5. **T65-05（Android/Flutter/Harmony、Ghidra/IDA/Frida）**：只列入对应实测能力；其余保留为实验性任务。
6. **T65-06（跨版本兼容和发行验证）**：固定 tag 6.5.0，运行完整 CI，真实 H5/Electron/WASM/SQLite 试验，按平台登记实际未验证范围，并保证独立产品版本/发布保护不回退。

**当前完成状态仅有：** 上游 6.5.0 的 Git 文件快照复制、Git commit pin 和文件差异生成成功；关键源文件及对应 PR 级契约已检查。尚未做源代码的 Tekvro 集成、构建/测试或发布。

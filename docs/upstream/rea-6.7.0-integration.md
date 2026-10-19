# REA 6.7.0 内核集成与恢复记录

## 当前状态（2026-10-19）

[PR #24](https://github.com/ForceMind/Tekvro/pull/24) 已合并到 main，合并提交 `070736717dc0947ea90dea6023201b203837a016`。资格提交 `db18e56693c800628961cc00d383ae690e99b286` 与合并提交的源码树相同。内核来源为固定 REA 6.7.0 `27dc42d10249f0410904a75c0997842eb03b931c`，基于既有 6.5.0 集成继续完成，没有整体合并研究分支。总任务为 [Issue #21](https://github.com/ForceMind/Tekvro/issues/21)。

后续 [PR #26](https://github.com/ForceMind/Tekvro/pull/26) 的 CI 传输修复已合并为 `8e5d131453f25e91c13edcf5c1c794ed0d0d59bd`；[PR #25](https://github.com/ForceMind/Tekvro/pull/25) 的真实提供方验收及 JADX 修复已合并为 `fae2873cd15e217f7507d1513ba3677f8cf5f201`。后者与资格提交 `7e8e950e2d35b2d4aab2954012d1b518505ddebf` 的完整源码树相同：`aa26b4edb4c7e9aceceb2ce47a0a5ada59cc2032`。后续报告输入保护和交接文档改动不改变 src/bridge 分析内核。

产品包 `tekvro` 保留 `6.1.0` 兼容标记，内核来源单列于 `engine-metadata.json`。MCP 身份为 `io.github.forcemind/tekvro`；新注册启动本地构建，旧命令及配置保留识别和迁移。`TEKVRO_LANG`、中文帮助、MIT/第三方告知、`private:true`、安装器/源码更新拒绝与全部发布入口保护保持。没有 npm、MCP Registry、正式 Release 发布或定时任务。

## 实际实现

- 6.5 文档阻塞已修复：文档事实生成器适配真实 Tekvro 中英文 README/网站，保留本地链接验证；没有伪造 `website/locales/languages.json`。
- Evidence/Snapshot 的 nullable `relationship_coverage` 同步进入生产、解析、身份计算、摘要和历史读取。历史记录缺失必要字段时保留原文件并拒绝使用，明确要求重新采集，不补造覆盖事实。
- Artifact Inventory 覆盖及 `integrity_contradictions`、浏览器预算与遗漏、取消/超时/清理证据、provider unknown 状态，以及 JSON/JSONC 重复成员的事务编辑按固定 6.7 契约同步迁移。
- 精确 JavaScript source/module 选择、模块与属性/调用关系、retained javascript-facts 查询/过滤/分页由共享应用层接入 CLI/MCP。WASM、Electron、Android locales、Kuna、Ghidra、网络制品和 SQLite 适配代码已集成；外部工具运行范围见下表。
- 实际发现清单为 207 个 MCP 工具、153 个 CLI 命令和 6 个 prompts。机器工具 ID、字段及 Schema 不随帮助语言改变。
- Windows native 制品必须来自同一 Tekvro Git 提交的 CI 或该源码构建；兼容版本号与 ABI/哈希校验不能代替源提交一致性。不能改用公共 `rea-agents` 包。

固定源码复核：上游 `src` 清单的 2,085 个文件（含源码侧测试）没有缺失；额外仅 `cli/localization.ts`。28 个差异文件承担 Tekvro 身份、双语文案、本地注册/更新保护、平台恢复指引、生成元数据，以及本次 JADX 恢复修复和对应测试。构建生成的 MCP catalog 不计入该源码清单。

## 已通过验证

| 执行环境/范围                       | 真实结果与记录                                                                                                                                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 当前提交完整 CI                     | [39221071429](https://github.com/ForceMind/Tekvro/actions/runs/39221071429)：六覆盖率分片共 19,178 通过、170 跳过、0 失败；静态、构建、docs、覆盖率汇总及最终 CI 门禁通过                                                                          |
| Linux H5/WASM                       | [核心验收](https://github.com/ForceMind/Tekvro/actions/runs/39221071209)：JS 精确范围与 retained MCP facts、固定 WABT 1.0.42 的源码/安装包 WASM 检查及接口比较通过                                                                                 |
| macOS arm64 Electron                | 同一核心验收：官方 Electron 44.9.0 的 discovery、生命周期、IPC、reload、取消及清理通过                                                                                                                                                             |
| 平台包与公共接口                    | 完整 CI 的 Windows x64 能力/安装包、Apple CLI/MCP、Linux x64/arm64 和 macOS x64/arm64 原生包基线通过；不代表每个可选引擎均在这些平台运行                                                                                                           |
| 浏览器/网络/恢复                    | 完整 CI 的真实 browser、Web runtime、HAR/PCAP、source maps、JS recovery、binary layout 和 SQLite Node22/24/26 兼容检查通过                                                                                                                         |
| 其他独立真实样本                    | [packet capture](https://github.com/ForceMind/Tekvro/actions/runs/39221071366)、[signal recording](https://github.com/ForceMind/Tekvro/actions/runs/39221071225)、[Go metadata](https://github.com/ForceMind/Tekvro/actions/runs/39221071326) 通过 |
| 安装包录制崩溃                      | [Ubuntu/Debian](https://github.com/ForceMind/Tekvro/actions/runs/39216029765) 真实 CLI/MCP 通过；此前错误的包路径已修复                                                                                                                            |
| 本地 Work / Linux Node24.19/npm11.9 | npm ci、build:cached、check:ci（8 项及架构守卫）、docs:check、licenses、format 通过；双语/注册18、CI 分流224、注册状态39、配置/缓存31、安装器37、Evidence27、Snapshot12 等针对性测试通过                                                           |

本地 Work 的 procfs、PTY/Unix socket 限制使部分真实监督进程测试失败，未计为通过；完整回归由 GitHub 托管运行器执行。历史 `javascript-interruption-applicability-2026-10-15.json` 是固定上游 Joplin 样本，仅用于范围归因回归，不能算作本次 Tekvro 实测。

## 可复现命令

使用 `.nvmrc` 的 Node24.18.0 和 `packageManager` 的 npm11.16.0；本地记录另注明实际 Node24.19.0。先运行 `npm ci`、`npm run build:cached`、`npm run check:ci` 和 `npm run docs:check`。`npm run test:focused -- PATH...` 运行指定回归；完整资格由 PR 的 `ci:full` 标签触发覆盖率及平台矩阵。

`scripts/rea.mjs --help`、`TEKVRO_LANG=zh-CN node scripts/rea.mjs --help`、`node scripts/rea.mjs mcp` 分别提供 CLI 帮助和 stdio MCP。真实 H5/WASM/Electron 验证的固定依赖、fixture 和命令写在 `.github/workflows/tekvro-engine-acceptance.yml`；该记录链接到实际运行，不把模拟引擎等同实机。

可选提供方工作流 `.github/workflows/tekvro-provider-acceptance.yml` 使用 PR 标签 `ci:providers` 或手工触发，校验固定官方 Ghidra12.1.4、Kuna1.833、Apktool3.0.2、JADX0.7.1 及 ApiDemos6.0.18 的 SHA-256。它只在 CI 临时目录使用工具和样本，不将外部二进制提交或捆绑到 Tekvro，不改变用户安装器。[当前组合提交的四项真实提供方验收](https://github.com/ForceMind/Tekvro/actions/runs/39226094338) 已全部通过；[同提交普通 CI](https://github.com/ForceMind/Tekvro/actions/runs/39226094168) 合计 19,179 通过、170 跳过、0 失败，包含完整 inventory、全部必要平台/打包门禁；[核心 H5/WASM/Electron](https://github.com/ForceMind/Tekvro/actions/runs/39226094060) 同样通过。该提交已通过 PR #25 合并。

- Ghidra12.1.4：Linux x64 宿主，原生 ELF 的 debug/stripped/type-layout/jump-table、AArch64 跳转表/相对表和 m68k 原始映像 CLI/MCP。当前完整记录为 [39226094338 的 Ghidra 作业](https://github.com/ForceMind/Tekvro/actions/runs/39226094338/job/117972635133)，含正向进程归属清理与输入未修改证据。AArch64/m68k 是静态目标架构，不代表在 ARM/m68k 宿主或设备运行。
- Kuna1.833：Linux x64 的有符号/去符号源编译 ELF，伪代码、字符串/调用关系、retained 导出、跨 MCP server 缓存复用和清理。保留不可排除间接调用的 partial relationship_coverage，不把原生引擎局限提升为完整关系。
- Apktool3.0.2：实际编译的资源 APK，默认、de、zh-CN 表，CLI/MCP 相同 Evidence ID，目标哈希/大小/字节未修改，表覆盖 complete、unparsed_count=0，清理归属 verified 且无残留子进程。
- JADX0.7.1 / ApiDemos6.0.18：包/类/方法/引用、重载选择、原始 DEX 偏移和多 DEX 身份、CLI/MCP 一致性、SIGTERM 清理、失败恢复及 readiness。当前完整记录为 [39226094338 的 JADX 作业](https://github.com/ForceMind/Tekvro/actions/runs/39226094338/job/117972635406)。APK 未执行、字节未修改。

实施中真实修复了前置 Java 探针缺少资源归属、Apktool3 YAML 格式与 Java 错误投影遗漏适用恢复动作。失败恢复仍检查原始 ENOENT、jdk.compiler、JAR 原因及错误码，未改成空成功或忽略失败。

## 限制与下一步

- [Linux Electron](https://github.com/ForceMind/Tekvro/actions/runs/39214005017) 到达页面、脚本、静态和 runtime reconciliation，但 Chromium 子进程 run-token mismatch / procfs 权限使清理未完成。保留 `partial/cleanup_incomplete`；不得用 PID/进程名推断归属来绕过。完整 Electron 结论限 macOS arm64。
- Ghidra 桥接源码编译与上述 Linux x64 真实引擎运行已通过当前源码资格。不能将任何 Linux x64 结果推广为全部宿主或全部架构支持。
- 没有授权的 Hopper/IDA/JEB 实例、ADB 设备或 Frida 插桩目标；这些保持未验证，Frida/设备修改需明确目标授权。WASM 静态分析不等于恢复原始 Unity/C# 源码。
- Node22 的 SQLite 兼容测试覆盖拒绝/能力边界；真正 SQLite 分析仍要求相应 Node24.15+/26+ 原生支持。
- 恢复入口：从 main 和 `engine-metadata.json` 确定版本，查看本记录与 Issue #21，重跑对应工作流并读取失败日志。回滚用 PR revert；不强制改写主线或删除历史。可选工具缺失应返回明确不可用/unknown，不生成空成功结果。

## 主线合并后的 CI 修复与接手入口

合并核心后，[主线 CI](https://github.com/ForceMind/Tekvro/actions/runs/39223125135) 的 19,178 项测试全部通过，但汇总步骤的 `CI_TEST_SELECTION` 环境值包含 3,825 个路径、180,438 个字符，超过 Linux 的单字符串进程启动限制。[PR #26](https://github.com/ForceMind/Tekvro/pull/26) 改为分类器写入完整 JSON 文件，通过同一 workflow 的制品传输，reporter 只接收 `CI_TEST_SELECTION_PATH`。没有截断路径或删除 inventory/coverage/失败门禁。6,000 路径回归同时检查完整记录、缺失文件和冲突输入；与提供方修改组合后的 245 项 CI 策略/报告回归通过。

PR #25 显式依赖 PR #26，组合提交 `7e8e950e2d35b2d4aab2954012d1b518505ddebf` 保留双方历史并解决 CI 导入冲突，两者均已合并。PR #26 的[完整覆盖率资格](https://github.com/ForceMind/Tekvro/actions/runs/39225584203) 为 19,179/170/0；主线合并后已实际写入并上传全部 3,825 路径，推送回归见 [39228113194](https://github.com/ForceMind/Tekvro/actions/runs/39228113194)。后续报告保护还拒绝显式指定的空 JSON 文件，并移除旧成功计时基线。交接时读取 main 的 engine-metadata、本记录、Issue #21 及当前推送检查，再按固定工具命令复现；正式发布、商用引擎和真实设备验证是单独关口。勿把旧失败作业重跑成无诊断结果，也不要为获取绿色状态删除有效检查。

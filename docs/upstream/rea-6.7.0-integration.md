# REA 6.7.0 内核集成与恢复记录

## 当前状态（2026-10-19）

[PR #24](https://github.com/ForceMind/Tekvro/pull/24) 已合并到 main，合并提交 `070736717dc0947ea90dea6023201b203837a016`。资格提交 `db18e56693c800628961cc00d383ae690e99b286` 与合并提交的源码树相同。内核来源为固定 REA 6.7.0 `27dc42d10249f0410904a75c0997842eb03b931c`，基于既有 6.5.0 集成继续完成，没有整体合并研究分支。总任务为 [Issue #21](https://github.com/ForceMind/Tekvro/issues/21)。

产品包 `tekvro` 保留 `6.1.0` 兼容标记，内核来源单列于 `engine-metadata.json`。MCP 身份为 `io.github.forcemind/tekvro`；新注册启动本地构建，旧命令及配置保留识别和迁移。`TEKVRO_LANG`、中文帮助、MIT/第三方告知、`private:true`、安装器/源码更新拒绝与全部发布入口保护保持。没有 npm、MCP Registry、正式 Release 发布或定时任务。

## 实际实现

- 6.5 文档阻塞已修复：文档事实生成器适配真实 Tekvro 中英文 README/网站，保留本地链接验证；没有伪造 `website/locales/languages.json`。
- Evidence/Snapshot 的 nullable `relationship_coverage` 同步进入生产、解析、身份计算、摘要和历史读取。历史记录缺失必要字段时保留原文件并拒绝使用，明确要求重新采集，不补造覆盖事实。
- Artifact Inventory 覆盖及 `integrity_contradictions`、浏览器预算与遗漏、取消/超时/清理证据、provider unknown 状态，以及 JSON/JSONC 重复成员的事务编辑按固定 6.7 契约同步迁移。
- 精确 JavaScript source/module 选择、模块与属性/调用关系、retained javascript-facts 查询/过滤/分页由共享应用层接入 CLI/MCP。WASM、Electron、Android locales、Kuna、Ghidra、网络制品和 SQLite 适配代码已集成；外部工具运行范围见下表。
- 实际发现清单为 207 个 MCP 工具、153 个 CLI 命令和 6 个 prompts。机器工具 ID、字段及 Schema 不随帮助语言改变。
- Windows native 制品必须来自同一 Tekvro Git 提交的 CI 或该源码构建；兼容版本号与 ABI/哈希校验不能代替源提交一致性。不能改用公共 `rea-agents` 包。

## 已通过验证

| 执行环境/范围               | 真实结果与记录                                                                                                                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 当前提交完整 CI             | [39221071429](https://github.com/ForceMind/Tekvro/actions/runs/39221071429)：六覆盖率分片共 19,178 通过、170 跳过、0 失败；静态、构建、docs、覆盖率汇总及最终 CI 门禁通过                                                                          |
| Linux H5/WASM               | [核心验收](https://github.com/ForceMind/Tekvro/actions/runs/39221071209)：JS 精确范围与 retained MCP facts、固定 WABT 1.0.42 的源码/安装包 WASM 检查及接口比较通过                                                                                 |
| macOS arm64 Electron        | 同一核心验收：官方 Electron 44.9.0 的 discovery、生命周期、IPC、reload、取消及清理通过                                                                                                                                                             |
| 平台包与公共接口            | 完整 CI 的 Windows x64 能力/安装包、Apple CLI/MCP、Linux x64/arm64 和 macOS x64/arm64 原生包基线通过；不代表每个可选引擎均在这些平台运行                                                                                                           |
| 浏览器/网络/恢复            | 完整 CI 的真实 browser、Web runtime、HAR/PCAP、source maps、JS recovery、binary layout 和 SQLite Node22/24/26 兼容检查通过                                                                                                                         |
| 其他独立真实样本            | [packet capture](https://github.com/ForceMind/Tekvro/actions/runs/39221071366)、[signal recording](https://github.com/ForceMind/Tekvro/actions/runs/39221071225)、[Go metadata](https://github.com/ForceMind/Tekvro/actions/runs/39221071326) 通过 |
| 安装包录制崩溃              | [Ubuntu/Debian](https://github.com/ForceMind/Tekvro/actions/runs/39216029765) 真实 CLI/MCP 通过；此前错误的包路径已修复                                                                                                                            |
| 本地 Work / Linux Node24.19 | npm ci、build:cached、check:ci（8 项及架构守卫）、docs:check、licenses、format 通过；双语/注册18、CI 分流224、注册状态39、配置/缓存31、安装器37、Evidence27、Snapshot12 等针对性测试通过                                                           |

本地 Work 的 procfs、PTY/Unix socket 限制使部分真实监督进程测试失败，未计为通过；完整回归由 GitHub 托管运行器执行。历史 `javascript-interruption-applicability-2026-10-15.json` 是固定上游 Joplin 样本，仅用于范围归因回归，不能算作本次 Tekvro 实测。

## 可复现命令

使用 `.nvmrc` 的 Node24.18.0 和 `packageManager` 的 npm11.16.0；本地记录另注明实际 Node24.19.0。先运行 `npm ci`、`npm run build:cached`、`npm run check:ci` 和 `npm run docs:check`。`npm run test:focused -- PATH...` 运行指定回归；完整资格由 PR 的 `ci:full` 标签触发覆盖率及平台矩阵。

`scripts/rea.mjs --help`、`TEKVRO_LANG=zh-CN node scripts/rea.mjs --help`、`node scripts/rea.mjs mcp` 分别提供 CLI 帮助和 stdio MCP。真实 H5/WASM/Electron 验证的固定依赖、fixture 和命令写在 `.github/workflows/tekvro-engine-acceptance.yml`；该记录链接到实际运行，不把模拟引擎等同实机。

可选提供方工作流 `.github/workflows/tekvro-provider-acceptance.yml` 使用 PR 标签 `ci:providers` 或手工触发，校验固定官方 Ghidra12.1.4、Kuna1.833、Apktool3.0.2、JADX0.7.1 及 ApiDemos6.0.18 的 SHA-256。它只在 CI 临时目录使用工具和样本，不将外部二进制提交或捆绑到 Tekvro，不改变用户安装器。该工作流的运行结果尚待补充，不能提前视为通过。

## 限制与下一步

- [Linux Electron](https://github.com/ForceMind/Tekvro/actions/runs/39214005017) 到达页面、脚本、静态和 runtime reconciliation，但 Chromium 子进程 run-token mismatch / procfs 权限使清理未完成。保留 `partial/cleanup_incomplete`；不得用 PID/进程名推断归属来绕过。完整 Electron 结论限 macOS arm64。
- Ghidra 桥接源码编译已通过，真实 Ghidra/Kuna/JADX/Apktool 的独立验收正在实施。不能将任何 Linux x64 结果推广为全部宿主或全部架构支持。
- 没有授权的 Hopper/IDA/JEB 实例、ADB 设备或 Frida 插桩目标；这些保持未验证，Frida/设备修改需明确目标授权。WASM 静态分析不等于恢复原始 Unity/C# 源码。
- Node22 的 SQLite 兼容测试覆盖拒绝/能力边界；真正 SQLite 分析仍要求相应 Node24.15+/26+ 原生支持。
- 恢复入口：从 main 和 `engine-metadata.json` 确定版本，查看本记录与 Issue #21，重跑对应工作流并读取失败日志。回滚用 PR revert；不强制改写主线或删除历史。可选工具缺失应返回明确不可用/unknown，不生成空成功结果。

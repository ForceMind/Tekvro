# Tekvro（探核）｜REA 6.4.0 内核升级实施方案

> 状态：**已立项 / 实施未开始**；制定日期：2026-10-14。本文是升级执行基线，不代表代码已迁移、测试已通过或 Tekvro 已发布。
>
> **2026-10-15 补充：** 上游已发布 [REA 6.5.0](https://github.com/morluto/rea/releases/tag/rea-agents-6.5.0)。本文件保留 6.2～6.4 必需的底层迁移步骤；新增 T65-00～T65-06 的工作及 Breaking Changes 见 [6.5.0 增量升级方案](rea-6.5.0-upgrade-addendum.md)。6.4.0 与 6.5.0 原始源码已保存在隔离研究分支，但 Tekvro 引擎代码尚未移植。
>
> 总跟踪：[GitHub Issue #21](https://github.com/ForceMind/Tekvro/issues/21)；总路线：[docs/roadmap.md](../roadmap.md)；关联：[独立发行身份 #8](https://github.com/ForceMind/Tekvro/issues/8)、[中文化 #9](https://github.com/ForceMind/Tekvro/issues/9)、[CLI 中文帮助 PR #20](https://github.com/ForceMind/Tekvro/pull/20)。

## 一、决策与固定基线

本专项 **叠加** 原有 P0–P3 路线，不覆盖独立品牌、本地化、发行身份和差异化研发。目标是把 REA 6.2、6.3、6.4 中对 Tekvro 有价值的功能与必要契约一起引入，而非复制上游的网站、发布身份和历史。

| 对象 | 冻结值与意义 |
| --- | --- |
| Tekvro 仓库 | [ForceMind/Tekvro](https://github.com/ForceMind/Tekvro)，`main` |
| 制定计划时 Tekvro HEAD | `f7831f4110fe5c386f837ac313b6e4a1139ee5fd`；实施启动前必须再次核对 |
| 原始来源 | REA 6.1.0 源码快照，对应上游 `f6fe575094658e99ced78d45f385633fbfaaae32` |
| 本轮上游目标 | [`rea-agents-6.4.0`](https://github.com/morluto/rea/releases/tag/rea-agents-6.4.0)，Git tag 指向 `a56f7bb668ab23fec8d33f7af353ac7ed2fe1895` |
| 原始状态 | `package.json` 名称 `tekvro`，版本 `6.1.0` 为继承引擎来源基线，`private: true`，独立 npm/MCP Registry **未发布** |
| 上游 Git 关系 | Tekvro 由 ZIP 导入，与上游没有共同 Git 祖先；不能常规快进或直接合并 |
| 本轮实施 | 文档评审后，按 T64-00 → T64-08 开发，**一个范围一项 PR**，以验证结果决定合并 |

**版本规则：** 目标内核与 Tekvro 产品版本分开。升级途中不得仅将 `package.json.version` 改为 `6.4.0` 就宣布升级完成。只有契约与功能验收达到门槛，才在独立版本清单中标记已集成的上游引擎版本。独立 Tekvro 正式版本号、npm/MCP 发行以及更新通道另由 #8 审核，不在本专项中自动开启。

**取舍：** 优先保障运行安全性、MCP/Evidence 契约和 JS/H5/Electron；然后 Android 和 Ghidra 等可选提供方。独立发行、中文化、既有客户端注册/配置及第三方版权是不可退让的约束。

## 二、目标与验收定义

1. **稳定性：** 大型 JS 输入不可因一个分析 Worker 资源耗尽拖垮主 MCP 服务；超时、取消和内存限制能留下可解释的部分结果或明确的失败理由。
2. **证据真实性：** 已观察事实、推断和未知分开；Evidence 可通过 ID、摘要、视图继续调查；无法兼容的历史数据保留原件，不生成虚假的字段、身份或事件顺序。
3. **真实实用：** 在有权限的样本上完成 H5、Electron、浏览器网络和 Android/原生目标的规定验证；缺少外部工具时只声明未验证，不制造通过记录。
4. **产品隔离：** 保留 Tekvro 品牌、`TEKVRO_LANG`、`tekvro` 源码包、`io.github.forcemind/tekvro` 草案身份和已经生效的 npm/MCP/网站发布安全保护；兼容别名保留到可验证迁移完成。
5. **交付可管理：** 总任务 #21，每项 PR 附迁移说明、所改路径、破坏性变更、测试矩阵、回滚办法和实际 CI URL；完成状态必须基于合并及证据。

## 三、分阶段任务清单

所有 T64-* 标记默认 **[ ] 待开发**。每项可包含必要的子 PR，但不得把多个高风险契约变化塞在没有独立验证的巨型 PR 中。

### T64-00｜差异审计与可复现基线（阻塞后续工作）

**范围：** 冻结上游 6.4.0 tag，不追随 `upstream/main`；比对 6.1.0→6.2.0→6.3.0→6.4.0 和 Tekvro 已自定义的文件。按「纯上游新增、已改造文件冲突、不必移植、必须重做迁移」四类登记差异。

**实施：**
- 从 `main` 建立 `sync/rea-6.4.0-audit`；保留原始输入 SHA、tag commit SHA、子模块引用、`package-lock.json` 和现有 Tekvro 配置快照。
- 生成 `docs/upstream/rea-6.4.0-delta.md`（待实现）：每项变更的 upstream PR/commit、依赖文件、契约影响、Tekvro 受影响路径、验证方式和迁移/排除决定。
- 明确 PR #20 在 `src/cli/*` 和中文指南上的交集；实现分支必须在 #20 合并或明确保留其改动后同步，不得复写已翻译帮助。
- 建立未升级前 CLI/MCP 的工具清单、示例 Evidence 与已授权的最小 JS/ASAR/浏览器 fixture，记录 `npm ci`、`npm run build:cached`、`npm run check:fast`、`npm run test:fast`、`npm run docs:check` 的真实结果。
- 核对 5 个子模块、许可证/署名、`private: true`、安装器拒装和发布工作流身份保护。

**完成条件：** 提交可追溯的差异清单与基线执行记录；每一项后续任务都有原始上游参考和具体验收入口；审查无秘密信息、未擅自变更发布渠道。

### T64-01｜REA 6.2 的 Evidence/MCP 契约

**范围：** 成功结果由旧包装改为直接规范 Evidence；消费字段使用 `normalized_result`。处理 nullable `analysis_profile`、session provider alias 移除、artifact occurrence 的角色与权限、完整 profile-bound snapshot；对一次性分析的 `cleanup_incomplete` 和保留证据做支持。

**关联路径（最终以 T64-00 清单为准）：** `src/domain/evidence*.ts`、`src/domain/analysisProfile.ts`、`src/domain/analysisSnapshot.ts`、`src/contracts/*`、`src/application/*Evidence*`、`src/server/toolResult*.ts`、`src/cli/*`、`tests/*`。

**完成条件：**
- CLI JSON 与 MCP structured content 均符合更新后的唯一契约；有直接 Evidence 与故障响应 schema 的实际客户端测试。
- 旧 `{result,evidence_id,evidence}` 包装不再被新协议误当有效；历史记录原样保留并给出需要重分析的明确提示。
- 处理旧 process capture v3、不确定 property presence、function comparison 枚举和符号链接 `target:null` 等边界；测试覆盖错误与取消路径。
- 未完成清理不能覆盖先前完成的观察；重新运行后无孤儿资源假成功。

**上游参考：** [6.2.0 release](https://github.com/morluto/rea/releases/tag/rea-agents-6.2.0)、[6.1→6.2 migration guide](https://github.com/morluto/rea/blob/rea-agents-6.4.0/docs/migration-6.2.md)。

### T64-02｜REA 6.3 的捕获、语义和元数据契约

**范围：** 真实 producer/transaction identity、Web 访问与存储维度、JSON typed path、WebMCP `input_schema`/`input_schema_sha256`、JavaScript 图的 `evidence_contexts`、source-map 观察关联、provider metadata 必填事实和可空未知值。

**完成条件：**
- 旧的不足够完整的捕获、历史图不被静默修补成新契约；给出显式拒绝、兼容边界或需要重新采集。
- 图的来源证据定位可追溯，类型化数组/属性路径可往返；未观察的 provider 字段以 nullable/unknown 表示而非默认猜测。
- 大 JSON 输入/流式输出与测试样本在规定限制内可运行，不混淆「未知」与「不存在」。
- 编写升级前/升级后交叉读取负向测试，记录实际可读与必须重采集的矩阵。

**上游参考：** [6.3.0 release](https://github.com/morluto/rea/releases/tag/rea-agents-6.3.0)。

### T64-03｜REA 6.4 的内部资源/抓包/语义边界（先于新增功能）

**范围：**
- 将浏览器 WebSocket 输出的 `network.websocket_events` 消费迁移到 `network.websocket_connections`，保留 request ID、URL、帧顺序及未知长度。
- 为直接资源 API 引入调用方拥有的 `ArtifactResourceScope` 生命周期；文件、ASAR reader、导出目录及 provider workers 在完成与失败时均有单一清理责任。
- artifact graph 从指定 `occurrence_id` 读取子制品身份和路径；更新 semantic node/edge ID、`event_name`、`endpoint`、`properties.value` 的使用。
- 处理 capture normalization 版本语义、terminal 1,000,000-cell 限制与跨版本比对拒绝。

**完成条件：** 没有消费者继续静默读取废弃 WebSocket 字段；在取消、读错、超时和 cleanup 失败时不会丢失完成的 Evidence；新旧抓包比较的失败原因可解释且不伪造数据；资源所有权与新图身份均有边界回归。

**上游参考：** [6.4.0 Breaking Changes](https://github.com/morluto/rea/releases/tag/rea-agents-6.4.0)。

### T64-04｜P0 产品能力：JS/H5/Electron 大型调查闭环

建议至少拆成三项实施 PR：

1. **T64-04A / 稳定性：** 每个分析请求使用受控 Worker、堆上限与超时；按上游支持加入 `max_heap_mb` / `analysis_timeout_ms`（实际 schema 以移植版本为准）。取消/超时保留可验证的 partial Evidence/明确未知；不得把不完整结果冒充完整。
2. **T64-04B / 大结果按需读取：** `analyze_javascript_application`、`inspect_binary_layout` 的 `detail:"summary"`；通过 `inspect_analysis_view`、`get_evidence_bundle` 摘要及筛选视图按需检索。默认完整结果行为在可用资源内保持不变；超限有可恢复路径。
3. **T64-04C / 分析精度：** tRPC、GraphQL 操作及 HTTP-link 候选识别，Electron `app.asar`/preload/模块归属与 source-map 处理，以及浏览器 WebSocket 捕获修复。

**交付样本：** 选用有授权的 Webpack/Vite H5 构建、包含较大 bundle 的 JS 测试工程、Electron ASAR、带 tRPC/GraphQL 和 WebSocket 的本地可控演示。记录模块定位、输入哈希、调用候选、误报/未知、Evidence 可追踪性；对 Unity WebGL/WASM 仅声明实际覆盖，不承诺恢复不可见逻辑。

**完成条件：** 小样本行为不倒退；大样本不会导致主服务崩溃；在受限内存、超时、主动取消下 MCP 后续请求仍可处理；摘要视图可找到完整保留证据；网络调用识别无无证据的服务器实现推断。

**上游参考：** [Worker #1651](https://github.com/morluto/rea/pull/1651)、[分析摘要 #1568](https://github.com/morluto/rea/pull/1568)、[二进制摘要 #1570](https://github.com/morluto/rea/pull/1570)、[Evidence 发现 #1682](https://github.com/morluto/rea/pull/1682)、[RPC #1670](https://github.com/morluto/rea/pull/1670)。

### T64-05｜P1 Android：ADB → Apktool → 可选 JEB

**先做 ADB：** 新增 `src/adb/` 与共享 CLI/MCP 流程，覆盖设备、进程、界面、权限、日志、截图、文件及 APK 获取，支持 split APK 与每文件哈希。所有操作必须通过固定参数向量，禁止将用户输入拼成 shell；不得自动安装 SDK、启动设备或越权读取。

**再做 Apktool：** 新增 `src/apktool/`，仅在用户自行配置客户端时解析 manifest、资源表与语言字符串；资源与反编译结果区分，保留局限。

**最后做 JEB：** 新增 `src/jeb/`，把用户已启动的本地 JEB MCP 作为可选引擎；限定本机端点、拒绝远程重定向，不代替 JEB 购买/安装/启动；`inspect_jeb_client`、`open_jeb_project`、`list_jeb_units`、`decompile_jeb_item` 仅在真实支持时声称可用。

**完成条件：** Android 模拟器/获授权设备完成最小设备识别、包获取、日志及截图工作流；只读与修改设备的调用在 schema 中有明确区分，安装/推送/卸载等绝不作为调查的隐式动作。Apktool 用真实 APK 校验 metadata/manifest/locales；缺少 JEB 授权时记录 `unverified / optional`，不阻塞核心 JS 交付。

**上游参考：** [ADB #1552](https://github.com/morluto/rea/pull/1552)、[Apktool #1556](https://github.com/morluto/rea/pull/1556)、[JEB #1536](https://github.com/morluto/rea/pull/1536)。

### T64-06｜P1 原生：Ghidra 与二进制调查

**范围：** 导入语言/编译器显式选择；函数、代码、标签 seeds；PE DLL/MIPS ELF 分析路径、必要的 PE 资源观察、只读 NativeAOT 解析与函数名字批处理（按宿主/权限边界启用）。

**完成条件：**
- 语言/seed 未设置时保持默认行为；显式设置时验证环境变量、digest、handshake、导入依据与失败原因。
- Linux/macOS 真正的 Ghidra session 通过相关流程；Windows P0 保持只读；不能用单元测试冒充 Windows NativeAOT/Ghidra 实机兼容。
- 对错误 architecture、非支持宿主、越权 mutation、超时与取消都给出明确结果；不会改写目标可执行文件。
- 以功能实际验证范围更新中文/英文文档。

**上游参考：** [Ghidra import & seeds #1667](https://github.com/morluto/rea/pull/1667)、[6.4.0 release](https://github.com/morluto/rea/releases/tag/rea-agents-6.4.0)。

### T64-07｜P1 Agent 接入、本地化和 Tekvro 品牌一致性

**范围：** 兼容 Codex/Claude Code 等已支持客户端的 setup/doctor；有依据地移植上游对 Pi、Hermes、Qwen Code 的支持；面对 Schema 大小限制提供可选 `REA_MCP_INPUT_SCHEMA_PROFILE=compact` 行为（是否增加 `TEKVRO_*` alias 先由兼容设计批准）。

**协作关系：** 优先消化已打开的 PR #20 及 #9 的中文 CLI 计划；保持 `TEKVRO_LANG=zh-CN`、英文命令和机器 JSON/MCP 字段不变。技术文档中文优先解释新的 Evidence、摘要视图、ADB/JEB 安装边界和故障处理。

**完成条件：** setup dry-run 能明确显示变更与备份；现有已禁用/已配置客户端不被覆盖；使用本地 Tekvro 源码而非 `npx rea-agents@latest`；英文/中文 help 参数和命令集合等价；compact schema 仍接受原本规范输入并以真实客户端/协议验证。

### T64-08｜合并验收、产品版本与独立发行关口

在 **T64-01～T64-04 完成且通过所有核心门槛** 后，可把稳定内核验收成下一独立产品预发布候选；T64-05/06 中尚未实机验证的可选能力必须明确不纳入该版本的支持声明。任何新的正式 npm/MCP Registry 发布仍需通过 #8 的独立审核。

**发布前必须：**
- 对所有已移植功能跑完整 deterministic tests、MCP 端到端协议/工具清单及严格 schema 验证。
- Linux、macOS、Windows 的可用 CI/打包路径过关；原生引擎真实验证结果另附设备/版本/环境证据。
- 重新检查源包名、lockfile、生成元数据、五个子模块、许可证、第三方来源，核对敏感信息/环境变量/安装行为。
- 保留 `private: true`、上游发布 workflow 限定和安装器预发布拦截；正式发行独立 PR 需再审核名称归属、发布签名、回滚与 provenance。
- 记录版本矩阵：Tekvro 产品版本（独立待定）、已集成上游能力基线（通过测试后方标注 6.4.0）、能力开关、历史证据读取策略、未验证平台和已知限制。

## 四、实施顺序与合并关口

`T64-00 → T64-01 → T64-02 → T64-03 → T64-04A/B/C` 是核心串行链。`T64-05` 的 Android 三支线与 `T64-06` 的 Ghidra 支线可在 T64-03 通过后并行，均不得在契约底座未验收时独立合并对外宣称 6.4.0 兼容。`T64-07` 与 T64-04/05/06 交错维护中文化，但必须对齐相应接口；`T64-08` 最后汇总。

**建议分支/PR 标识：** `sync/rea-6.4.0-audit`、`feat/tekvro-evidence-6.2`、`feat/tekvro-evidence-6.3`、`refactor/tekvro-resource-scope-6.4`、`feat/tekvro-js-worker-views`、`feat/tekvro-android-adb`、`feat/tekvro-android-apktool`、`feat/tekvro-jeb`、`feat/tekvro-ghidra-6.4`、`feat/tekvro-agents-compat`。名称为规划而非已创建的开发分支；如有并行冲突，按实际改动继续拆分。

| Gate | 进入条件 | 退出凭据 |
| --- | --- | --- |
| G0 基线冻结 | T64-00 完成 | 两侧 SHA、文件映射、当前测试结果、品牌/许可证/发布保护快照 |
| G1 契约兼容 | T64-01/02/03 完成 | MCP/CLI 金样、历史证据拒绝/重采集案例、资源生命周期负向测试均通过 |
| G2 核心可用 | T64-04 完成 | 大 JS 不拖垮服务；摘要可取回；H5/Electron/RPC 真实 fixture 通过 |
| G3 扩展能力 | T64-05/06/07 完成或划定延期范围 | Android/原生已执行的实机记录，其他能力明确列入未验证清单；中英配置回归通过 |
| G4 发行评审 | T64-08 完成 | CI/安全/署名/差异及回滚报告，独立版本候选；**不得自动发布** |

## 五、测试与质量保证矩阵

| 变化 | 最低自动化要求 | 真实环境验收 |
| --- | --- | --- |
| Evidence / MCP | canonical Evidence、直接结果、 schema dialect、JSON 输出、错误/取消/cleanup、旧数据拒绝 | CLI + MCP 客户端构建/调用 |
| JS/Graph/SourceMap | 小样本金样、生成大数据压力 fixture、timeout/OOM/cancel、摘要检索与 parent ID | 授权 H5 目录和 Electron ASAR |
| 浏览器与 WebSocket | request/connection/frame 顺序、size unknown、CDP 断连/清理、缺失 coverage | 本机隔离 CDP + WebSocket 测试页 |
| Android | ADB 固定参数/身份/只读变更权限、split APK 哈希、Apktool XML/locale | 模拟器或授权设备；JEB 有许可时单独实测 |
| Ghidra / Binary | import seed/digest/handshake、目标拒绝、错误和生命周期 | 支持平台上的真实 Ghidra；Windows 特性按边界单测/实测标注 |
| 中文 / 身份 / 安装 | 中英文 help 等价、配置备份、私有源码安装拒装、release 防越权 | 可用 CI 平台与实际客户端检查 |

每个 PR 在适当环境执行：`npm ci`、`npm run build:cached`、`npm run check:fast`、`npm run test:fast`、`npm run docs:check`；大范围契约 PR 再跑 `npm run check:pr` 与相关 `npm run verify:*`。上游新增的 `verify:adb` / `verify:apktool` / `verify:jeb` 等命令只在移植后且 `package.json` 实际定义时使用，未存在前不得报告已通过。最终 CI 以同一 commit 的真实检查结果为准，明确记录未执行、跳过及不满足硬件条件的项目。

## 六、主要风险、降级与回滚

1. **旧证据数据不兼容：** 保留原始文件、版本与哈希；拒绝把未知属性补为已观察事实；只在明确兼容的情况下提供只读迁移。无法兼容的图/捕获需要用当前 producer 重新采集。
2. **大型 PR 引起功能回退：** 禁止直接合并两个无共同历史的仓库；每个高风险契约 PR 独立测试/审查；出现回退可按 PR 恢复到上个已验收 `main` 提交。
3. **品牌/发布污染：** 锁住 Tekvro 产品身份和发布工作流；上游营销站、npm 包名、MCP Registry ID、自动更新器和外部域名变更默认不移植。
4. **分析资源与进程泄漏：** Worker 超时/取消必须可控，`ArtifactResourceScope` 清理失败时报告实际保留的资源；保证下一次分析不会误继承前一次状态。
5. **外部引擎或系统缺失：** 不静默安装 SDK、JEB、Ghidra；记录设备/许可证/平台前置条件；可选 provider 无法实测就推迟支持声明，不假设 mock 通过等于实机兼容。
6. **中文化冲突：** PR #20 以及 #9 持续推进；升级改动必须重放中英 help、CLI 参数集合和 MCP 机器字段稳定性测试。

## 七、推进与记录规范

- 总进度唯一入口为 [Issue #21](https://github.com/ForceMind/Tekvro/issues/21)，每个实现 PR 以 `T64-XX` 为标题/正文关联；只在 PR 合并且附验收证据后勾选。
- 每次阶段合并更新本文件的状态、已合入 PR、未验证项、兼容边界、原始上游来源和下一阻塞项；禁止把待办写成完成。
- 如上游出现 6.4.0 之后的新版本，**另开增量审计**；本轮基线仍为固定 tag，不中途变更目标而抹去已验收证据。
- P0–P3 原任务不因本专项而自动关闭、改期或停用；除非引擎升级直接影响其契约或发布安全。

---

上游发行说明：[6.2.0](https://github.com/morluto/rea/releases/tag/rea-agents-6.2.0) · [6.3.0](https://github.com/morluto/rea/releases/tag/rea-agents-6.3.0) · [6.4.0](https://github.com/morluto/rea/releases/tag/rea-agents-6.4.0)。本文件描述预期交付与验收口径，所有实际通过状态须由 Tekvro 对应提交与 CI/实机输出证明。

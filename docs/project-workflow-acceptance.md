# 项目工作流验收与真实验证矩阵

> 状态：M0 / PW-01 的项目契约、持久化及接口边界已按文末精确来源记录验收；所列 Linux 项目租约与进程 fixture 已实际通过。M1 继续进行，真实 Codex 写入受原宿主 EROFS 阻塞，网页闭环与完整 ledger 未验收。M0 只关闭 PWA-01、PWA-11、PWA-16 的 PW-01 子范围，不关闭这些验收项的后续阶段要求。实际范围见文末记录及[运行指南](project-workflow-runtime.md)。
>
> 研究基线：Tekvro `ee5ebf85b35c800c92d2e308ea601c158c529596`。实现时必须重新核对当前主线、契约与验证记录；本文件不冻结旧主线，也不改变已有发行的支持范围。

本文件规定“研究目标 → 构建 → 检查 → 改进 → 交付”的验收证据、阶段门槛和失败判据，与[设计方案](project-workflow-design.md)、[工作包计划](project-workflow-plan.md)共同使用。工作包使用 `PW-01` 至 `PW-10`，验收项使用 `PWA-01` 至 `PWA-18`。

## 1. 验收原则与状态口径

### 1.1 分开记录执行、验收和可用性

项目工作流采用设计方案规定的两条状态轴：`execution_status` 说明执行进度和终止原因，`acceptance_status` 只允许 `not_evaluated`、`pass`、`fail`、`unknown`。`phase` 独立记录 `study`、`build`、`check`、`refine`、`deliver`，不从阶段名称推断验收结果。

| 用户看到的结论    | 所需证据                                                                                | 不能由此推断                                           |
| ----------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 可运行            | 在记录的环境中真实启动，并观察到其入口；构建成功和启动成功分别记录                      | 功能正确、与原目标一致、可以发行                       |
| 部分完成          | 列出已有产物、已通过的具体义务，以及缺失、失败、未验证的范围                            | 整个项目通过；没有执行的检查通过                       |
| 已验收 / accepted | 当前候选版本在明确的验收范围内满足全部必要义务，绑定有效证据且 `acceptance_status=pass` | 未覆盖页面、平台、Agent 或游戏引擎也通过               |
| 执行完成          | 编排器完成本轮工作并保存结果                                                            | `acceptance_status=pass`；失败检查可以被“执行成功”覆盖 |

“已验收 / accepted”是限定范围的展示结论，不新增一个替代底层状态的枚举。预算耗尽、连续无进展等情况进入 `paused` 并记录原因；意外退出保留 `interrupted`。取消、暂停、崩溃、检查未运行均不得自动转为验收通过。

每项检查还记录自己的结果，如 `pass`、`fail`、`unknown`、`unsupported`、`skipped` 或尚未运行。后四者必须保留原因，不能进入通过项的分子。必要检查未运行时，项目不能显示已验收；已执行检查确认缺陷时，必须保留失败事实，不能用另一个未知项掩盖它。

### 1.2 保持现有重建契约的语义

复用现有 `build_reconstruction_obligation_ledger` 和 `evaluate_reconstruction_coverage`。前者已有 `ready/open/failed/unknown`，后者已有 `ready/partial/failed/unknown`；它们的语义和兼容性保持不变。项目的 `acceptance_status` 是上层基于本轮范围、有效证明及阶段门槛作出的判断，不把底层 `ready` 简单改名或直接展示为整个产品可发行。

单个编译命令返回零、生成工程自己的 self-test 通过、截图相似度较高、AI 说“已完成”，均只提供各自范围内的信息。必要义务存在缺失 owner、过期证明、截断观察、未解决矛盾或没有执行的检查时，必须保留现有契约规定的部分、失败或未知状态。

### 1.3 证据的独立性

验收脚本、预期结果和必要义务由验证侧维护，并在构建前固定身份。Builder 可以获得待实现的需求和失败诊断，但不能通过改写验收脚本、删除义务、扩大忽略范围或重写已保存结果让当前版本通过。

从同一生成工程读取“我已通过”的字段，不构成独立验证。真实浏览器、外部观察脚本或独立规则实现应实际驱动目标、读取结果，并保存其自身版本、输入和输出。模型解读可以补充解释，不能独立充当正确性的判据。

## 2. 验收项矩阵

以下列出各项完整的通过条件；当前只取得文末逐项记录的子范围证据，不能把其中一部分通过扩展为整项通过。未记录的子范围保持未实现或未验证，后续实现也不能自动继承历史记录的结论。

| ID     | 工作包                     | 验收内容与必要通过条件                                                                                                                                                                                         | 必须暴露的失败或未知                                                                                                                              |
| ------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| PWA-01 | PW-01                      | 项目持久化 schema 有版本、字段归属和迁移路径；旧格式迁移保留原始记录、目标身份与已有 Evidence 引用；多次打开不重复迁移。读取比当前实现更新的格式时给出可操作诊断。                                             | 缺字段、损坏内容、迁移途中中断、未知新版本不得被当作空项目覆盖；展示名称不能代替身份。                                                            |
| PWA-02 | PW-02                      | 在 study/build/check/refine 的持久化边界中断并重启，恢复最后一次已提交状态；已完成构建但尚未检查时先检查该产物；请求去重、原子写入及失败保留符合实际文件系统语义。                                             | 恢复后重复外部写入、丢失已完成产物、把旧轮次的检查算到新轮次、损坏记录被静默重置，均不通过。                                                      |
| PWA-03 | PW-02                      | 同一项目同时经当阶段已实现入口发起写操作时，由共享 owner 与 revision 规则判定；M1 验证 CLI/MCP，M2 增加 UI。拒绝过期写入，保留冲突信息；锁释放和进程退出通过真实进程观察验证。不同项目可在资源约束内独立执行。 | 仅凭 PID、路径、文件年龄认定 owner 已退出并夺锁；PID 复用、符号链接别名、关闭后重开或断线重连导致误删其他运行资源。                               |
| PWA-04 | PW-03                      | Builder 能力声明与实际适配一致，分别验证构建、工具调用、继续会话、取消、流式输出和访问范围。缺少能力时降级必须明确并符合用户原任务；不能假装恢复了不支持 resume 的会话。                                       | CLI 存在或 `--help` 成功不代表可构建；模拟传输不代表真实账号可用；适配器无法执行所选访问约束时不得声称已隔离。                                    |
| PWA-05 | PW-03                      | Agent 断线、模型错误、超时、用户取消、子进程异常退出都保存已收集观察和当前候选产物，记录原始原因；只停止本轮拥有的进程、端口与服务，清理结果单独记录；取消后无未经请求的新一轮。                               | 原始失败被清理错误覆盖；取消后仍写入；旧 owner 的后台进程继续存在却显示已释放；连接中断后未经重试策略判定便重复外部调用或重放未确认完成的副作用。 |
| PWA-06 | PW-02、PW-03               | 以相关候选产物内容及适用执行位判断进展；相同字节重复写入、仅修改日志或时间戳不算进展。连续无进展计数跨重启保存，阈值与预算由项目执行策略明确；真正新需求或有效候选变更按契约开启新尝试。                       | “重试”按钮或重启清零计数、改日志即无限续跑、无法完整扫描却宣称无变化；达到上限必须暂停并保留原因，不能假验收。                                    |
| PWA-07 | PW-04                      | 首个网页样例在 390、768、1440 CSS px 三个默认宽度真实渲染；宽度可配置，视口高度、DPR、浏览器版本、字体和渲染条件记录到证据。每个宽度、页面、状态独立展示结果和覆盖。                                           | 改变宽度但复用上一次 PNG；手机布局按钮被遮挡而仅凭总体相似分数通过；缺一个必需宽度却把其从分母删除。                                              |
| PWA-08 | PW-04                      | 动态区域 mask 与规范化规则在检查前声明，记录理由、范围、面积或覆盖比例、规则身份和原始未处理产物；为被忽略的必要功能建立另外的行为义务。修改规则产生新验证配置并使受影响旧证明失效。                           | Builder 为隐藏错误扩大 mask；覆盖主要交互区却没有行为证据；自动放宽阈值、掩去失败区域后继续沿用原通过记录。                                       |
| PWA-09 | PW-04、PW-05               | 用实际 `capture_browser_scenario` 观察原目标与候选工程，按明确 step ID 比较关键状态、导航、输入、存储和请求；复用 `compare_web_captures` 保留对齐失败、差异和完整性。                                          | 页面能打开但按钮无作用；错误请求、提交重复、刷新丢状态；场景未到达终点、抓取失败或超限截断不能被当作无差异。                                      |
| PWA-10 | PW-04、PW-05               | 独立 oracle 在 Builder 可写目录之外受控保存，绑定版本和预期结果。正向样例须通过；人为植入已知缺陷的负向样例须在对应义务上被检出，撤销缺陷后可恢复通过。                                                        | 原目标与候选共同使用同一段错误实现；只读取候选自述通过；故障植入后仍通过；校验器未真正执行；检查失败仅成为日志而不阻止验收。                      |
| PWA-11 | PW-01、PW-04               | 每条证明同时绑定 source、owner、obligation、scope、checker、environment，具体规则见第 4 节；更改候选代码、原观察、必要义务、验证器或配置时，旧结果不能证明新范围。                                             | 拿另一项目、旧源码、另一平台、其他输入或旧 mask 的报告充作当前证明；报告被改写、引用缺失、摘要不符、签名来源不明均不能通过。                      |
| PWA-12 | PW-04、PW-05               | 现有重建账本完整列出所选范围的义务、原始案例、候选 owner、验证器和残余未知项；验证依赖闭合及现有 `ready/partial/failed/unknown` 等结果的语义，再由项目层汇总本轮验收。                                         | 删除未实现义务、重复 owner、缺 parser/type、弱验证权威、未枚举声明、过期证据、矛盾或未知被一项“构建成功”覆盖。                                    |
| PWA-13 | PW-05                      | 使用第 3 节固定样例完成真实研究、真实 Builder 构建、独立检查、至少一次发现缺陷后的修复、重启恢复及最终受限范围验收；另用干净候选目录复跑关键验证，结果可归因于保存的输入与环境。                               | 只有预制候选或假的 Agent；只完成一次界面演示；没有证明修复反馈被执行；恢复时悄悄重建全部项目或借用旧通过产物。                                    |
| PWA-14 | PW-06                      | 同一项目操作经 CLI 与 MCP 调用共享 application workflow；相同输入的结构化状态、Evidence、错误与生命周期含义一致，中文帮助不改变机器值；真实 MCP 客户端验证 schema 与序列化后的结果。                           | 两端维护独立流程或校验规则；CLI 通过但 MCP 丢失 unknown/失败原因；仅内部 schema 自检，没有检验对外契约。                                          |
| PWA-15 | PW-07                      | 工作台通过与 CLI/MCP 相同的项目接口观察和推进；普通模式显示目标、进度、产物、关键差异与待决事项，专业模式能定位证据和未知项。重开界面后状态来自持久化记录，可由另一个接口继续。                                | UI 自己拼出“已完成”；隐藏失败宽度或部分覆盖；UI 不在场就无法继续编排；按钮仅改显示值而不改变实际状态。                                            |
| PWA-16 | PW-01、PW-02、PW-03、PW-08 | 基础执行范围、授权沿用与敏感值处理在首个闭环前生效；诊断准确区分缺工具、权限拒绝、版本不符、网络不可达、未知或尚未验证。保留用户选择的本地证据，遮蔽传输凭据及用户显式标记的敏感值。                           | 继承环境就持久化全环境；自动上传原文件；自行安装升级外部软件；反复要求同一已授权动作确认；把工具准入策略称为 OS 沙箱。                            |
| PWA-17 | PW-09                      | 每个桌面/游戏扩展单独记录真实宿主、架构、引擎、目标和权限；外部观察实际交互及状态，游戏有独立于生成工程 self-test 的规则或轨迹验证；可用功能与未验证部分分别展示。                                             | Windows 编译通过代表 macOS 可用；静态游戏资源分析代表玩法正确；替身窗口或模型协议测试代表真实商业引擎已验收；未获得的设备权限被当作空观察成功。   |
| PWA-18 | PW-10                      | 发布新增能力前，对实际发行候选提交与包校验新增工作流；保留 main 精确提交 CI、package canary、公开校验及对应场景记录；文档、发行说明与实际验证范围一致。                                                        | 源码工作区通过但发行包缺工具/文件；使用另一提交的证明；覆盖既有公开版本或移动标签；顺带启用 npm/MCP Registry 发布。                               |

## 3. 首个真实网页 / H5 闭环样例

### 3.1 样例范围

首个样例使用项目可合法维护、可固定版本、可在本机启动的网页 / H5。其源码、素材、字体、数据种子和本地服务均有明确来源，不依赖线上账号、支付或不受控的远端返回。建议使用一个具有下列完整行为的交互页面作为范围，具体样例在 `PW-01` 冻结：

| 范围       | 最低可观察行为                                           | 原始依据                                     |
| ---------- | -------------------------------------------------------- | -------------------------------------------- |
| 响应式页面 | 首页与一个详情状态；三种宽度下主要操作可见且可点击       | 固定版本的真实浏览器截图、DOM 与可访问性观察 |
| 交互状态   | 打开/关闭弹层、过滤列表、选择条目、返回上一状态          | 固定 step ID 的真实场景捕获与外部断言        |
| 输入与异常 | 一个有效输入、一个无效输入；本地服务返回成功与错误各一次 | 请求、响应、提示内容及最终状态               |
| 持久化     | 一项用户选择在刷新或新建同配置会话后按需求恢复           | 事前、事后、重开后的独立观察                 |
| 动态内容   | 一处时间或动画区域，用于验证可审计 mask                  | 原始图、规则和被忽略区域所对应的功能义务     |
| 边界与恢复 | 重复提交、取消运行、检查阶段中断及恢复                   | 受控请求记录、项目状态事件、资源清理观察     |

该样例的预期结果先从原版本受控运行中确认，再作为独立验收输入固定。不能因为生成工程少实现一个行为，就删掉原有义务。刻意不纳入的功能必须在构建前列出范围边界；后来缩小范围视为新版本验收约定，旧失败记录仍保留。

### 3.2 重复执行条件

样例必须保存源版本及摘要、本地服务版本、初始数据、时钟和随机性策略、浏览器版本、字体、视口、DPR、语言与时区。固定随机种子和时钟只适用于能够由验证侧控制的样例；不能控制的变量保留观测与限制，不宣称其已被固定。

每轮原目标与候选使用隔离的会话和可重置的数据。检查从明确初始状态开始，在相同场景定义下执行。每个宽度都记录真实生效的视口；不能把在 1440 px 下生成的截图缩放成 390 px 作为手机验证。

至少需要以下两类重复：

1. 对同一个候选产物、相同场景与环境重新运行独立检查，验证结果可重现。
2. 在干净候选目录中重做一次构建与验证，记录产物是否变化及变化对证据绑定的影响。模型生成结果不要求逐字相同，但必须重新满足相同义务。

### 3.3 负向对照必须发现的问题

验证侧维护最少一组具有确定缺陷的候选变体，逐个注入，避免不同错误互相抵消。以下是首个样例的必要负向类别，具体植入方式在实现时由样例语义决定：

| 缺陷类别   | 负向变体                                         | 必须检出的结果                                     |
| ---------- | ------------------------------------------------ | -------------------------------------------------- |
| 行为错误   | 主操作保持原外观，但不改变应改变的状态           | 对应行为义务失败；截图通过不能抵消                 |
| 响应式错误 | 仅在 390 px 隐藏、遮挡或移出主要按钮             | 对应视口的布局或可交互义务失败                     |
| 协议错误   | 请求走错路径、提交次数变多或错误分支被伪装为成功 | 场景/网络义务失败，并指出原始差异                  |
| 持久化错误 | 刷新后丢失已确认应保留的选择                     | 持久化义务失败                                     |
| mask 滥用  | 将存在缺陷的主操作区域加入忽略范围               | 缺失独立功能证明或规则变化被识别，当前验收不能通过 |
| 证明错配   | 把改代码前的通过报告放到新候选目录               | 绑定失效；不得沿用 `pass`                          |
| 检查未运行 | 让检查器启动失败、超时或没有产出                 | 明确未完成/未知及原因；不得由空失败列表得到通过    |

负向对照须留下“缺陷确实被植入”的摘要、输入、预期失败义务及实际诊断。撤销变体后正向对照仍应通过，以排除一个永远报错的检查器。若已知缺陷未被发现，对应验证能力不合格，即使当前候选看起来正确也不能跨过该阶段门槛。

## 4. 证明的绑定与有效期

一份证明只对产生它的对象、范围、判据和环境有效。最低绑定如下，字段的具体 schema 由 `PW-01` 设计，优先复用既有 Evidence、owner 和 verifier 契约：

| 绑定        | 最低内容                                                                  | 失效或限制条件                                                 |
| ----------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| source      | 原目标版本/文件摘要或受控观测身份，原始 capture 与 Evidence ID，采集条件  | 原目标、观察或初始数据改变；来源未认证或截断时不能证明完整行为 |
| owner       | 候选模块、符号或行为责任边界，内容摘要，所属构建与发行包                  | 源码、产物或发布归属变化；同一义务出现无法判定的重复责任者     |
| obligation  | 稳定义务 ID、版本、原始案例、必须覆盖的正向/负向/取消等类别               | 删除、替换或放宽义务；未枚举的新声明不自动获得通过             |
| scope       | 页面、状态、step ID、宽度、输入集、目标模式、范围边界                     | 超出原覆盖范围；缺失的范围不得通过重新计算分母隐藏             |
| checker     | 独立验证器身份和内容摘要、判据版本、实际执行参数、阈值、mask 与规范化摘要 | 检查器或判据被改写；未实际执行；Builder 可修改验证权威         |
| environment | OS/架构、浏览器/运行时/引擎、相关权限及受控环境摘要                       | 未声明的环境变化；跨平台复用不得扩大真实验证结论               |

候选没有改变且上述绑定全部成立时，可按明确缓存规则复用已验证结果。缓存命中须记录引用与理由；无法确认内容或环境身份时重新验证或保留未知，不能依赖显示名、相对路径、时间戳或存在一个同名报告。

只使受影响的证明失效，但必须通过依赖关系找到所有受影响义务。保留旧记录作为历史，不把历史 `pass` 原地改写为新的成功。若删除、替换或截断底层证据，展示应说明引用已失效，并阻止使用它完成当前验收。

## 5. 真实验证矩阵

本矩阵规定完整闭环的验证层级。项目核心、独立文件 oracle 及 CLI/MCP 已有文末记录的局部实际验证；真实 Agent 与网页闭环尚未取得通过结论。填写每行时必须同时提供提交、环境、实际运行记录和证明摘要；不从已有平台安装包、客户端连接测试或引擎验证自动继承结论。

| 验证层      | 第一批要求                                                           | 真实观察对象                                                   | 不能替代它的测试                              |
| ----------- | -------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| 项目核心    | 持久化、迁移、并发、崩溃恢复、取消及无进展                           | 真实文件系统与本轮拥有的进程；至少首个开发宿主                 | 只测纯状态函数或模拟“进程已退出”              |
| 网页检查    | 固定样例、三个视口、场景与负向对照                                   | 安装的真实浏览器及本地样例服务                                 | 预先生成的 JSON、图片 fixture 或假的 CDP 响应 |
| Builder     | 首个待验收目标为 Codex CLI；记录实际版本，构建/调用/恢复能力分别验证 | 用户已有或开发者明确配置的实际 Agent；费用和执行范围按既定策略 | 检查可执行文件存在、模拟输出或 loopback 模型  |
| CLI / MCP   | 对同一项目按同一义务执行；真实客户端完成请求/响应                    | 实际 CLI 进程和锁定 SDK 的 MCP 客户端                          | 仅调用 application 函数或仅验证生成 schema    |
| 工作台      | 普通/专业模式、检查详情、重开后继续、跨入口状态一致                  | 运行中的工作台及真实项目服务                                   | 只有静态设计图或 UI 组件快照                  |
| 平台扩展    | Linux、macOS、Windows 每个拟宣传的平台和架构分别列行                 | 相应宿主、浏览器与本机 Agent                                   | 在一个系统上交叉编译或复制他人报告            |
| 桌面 / 游戏 | 按具体目标类型与引擎另立范围                                         | 真正运行的目标、候选、权限与外部行为观察                       | 资源文件可解析、替身窗口、生成工程自评        |
| 发行包      | 公开能力的样例经实际安装包运行                                       | 精确提交构建的包、干净目录/配置、下载摘要                      | 源码 checkout 通过或其他提交的 CI             |

真实验证不足的环境写明 `unverified`、`unsupported` 或具体阻塞原因。这是支持范围记录，不意味着整个平台永久不支持。Codex CLI 缺少程序或有效授权时保留该适配器受阻；另一个明确选定的适配器可以独立验证，不能静默替换后宣称 Codex 已通过。新增一个 Agent 或升级其影响协议的版本，需要重新验证对应能力，不要求无关平台重复跑全部用例。

## 6. 阶段门槛

阶段通过只说明该阶段的范围成立，不能替代后续真实运行或发行门槛。若某项 PWA 跨越多个阶段，记录本阶段已验证的子范围和剩余要求，不因其一部分通过就关闭整项。具体依赖和实施顺序以[工作包计划](project-workflow-plan.md)为准。

| 阶段             | 所需证据                                                                                                                                                                                                                 | 允许的结论                                           | 不允许的结论                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------- |
| M0：契约与边界   | PW-01 实际实现并通过持久化、重读、原子写入、并发及 schema/版本边界验证；PWA-01、PWA-11 和 PWA-16 在 PW-01 负责的范围内通过。PW-02/03/04/06 的接口边界已定义，但不因此视为这些工作包已验收；保持既有 Evidence/ledger 兼容 | 项目持久化基础已验证，可以依照稳定契约实施并行工作包 | 只有设计文档就标记 M0 完成，或将其当作 Agent/重建闭环已验收 |
| M1：真实网页闭环 | PW-02/03/04/06 提供的实际能力共同支持 PW-05；PWA-01 至 PWA-14 及 PWA-16 的基础执行范围要求在首个声明环境通过；包含独立 oracle、负向对照和恢复记录                                                                        | 指定宿主、Agent、样例和范围的命令行/MCP 闭环已验证   | 工作台、其他 Agent、其他 OS 或任意目标已支持                |
| M2：项目工作台   | PWA-15 完成真实 UI 验证，PWA-16 的集中诊断体验兑现；同一已验证闭环可在多个入口观察和继续，新增 UI 路径未改变判据                                                                                                         | 已验证环境具有可持续操作的项目入口与明确诊断         | UI 展示成功替代行为证明，隐藏未完成范围                     |
| M3：扩展与发行   | 拟宣称的 PW-09 能力通过对应 PWA-17；每个实际发行范围通过 PWA-18，真实矩阵与发行说明一致                                                                                                                                  | 发行说明中逐项限定的能力可公开交付                   | 一种游戏或一个平台通过代表“任何软件可重建”                  |

PWA-16 的执行范围、权限及数据边界是 M1 前提，不能推迟到 M2 才补。M2 只完善其集中诊断和交互呈现。

首个网页工作流的交付不要求所有桌面与游戏目标都完成。未通过 PWA-17 的范围保留在后续工作包，且不进入该次发行的已支持声明。任何已确认失败的必要义务均阻止其所属范围通过；更改范围须保留新版本约定和原失败记录。

## 7. 验收记录模板

下面是**待实现验收报告的内容模板，不是当前可提交给工具的输入 schema，也不是已存在的脚本输出**。实现时应映射到已冻结的类型；不要复制占位符充作执行结果。

```yaml
record_kind: project-workflow-acceptance-proposal
record_version: 1
work_package: <PW-编号>
acceptance_ids: [<PWA-编号>]
implementation_status: planned
run_status: not_run
revision: <实际执行的完整Git提交>
project_id: <稳定项目身份>
run_id: <本次运行身份>
phase: <study/build/check/refine/deliver>
execution_status: <设计契约中的实际执行状态>
acceptance_status: not_evaluated
usability_observation: <尚未运行，或实际观察到的启动情况>
scope:
  obligation_ids: []
  pages_and_states: []
  scenario_step_ids: []
  viewports: []
  exclusions_and_reasons: []
bindings:
  source_evidence_ids: []
  original_artifact_digests: []
  candidate_owner_digests: []
  obligation_revision_digest: <实际摘要>
  checker_identity_digest: <实际摘要>
  normalization_and_mask_digest: <实际摘要>
  environment_digest: <实际摘要>
environment:
  host_os_and_arch: <实际系统与架构>
  runtime_and_browser: <实际版本>
  builder_and_version: <实际Agent与版本>
  controlled_settings: <仅与验收相关的受控值，不保存全环境>
execution:
  actual_commands_or_tool_calls: []
  started_at: <带时区的实际时间>
  ended_at: <带时区的实际时间>
  exit_and_cancellation_observations: []
  owned_resource_cleanup: []
results:
  checks: []
  negative_controls: []
  reconstruction_ledger_reference: <实际证据引用>
  coverage_evaluation_reference: <实际证据引用>
  residual_unknowns: []
  contradictions: []
  unavailable_or_not_run: []
  artifact_references_and_digests: []
decision:
  passed_scope: []
  failed_scope: []
  unresolved_scope: []
  next_required_action: <实际下一步或无>
```

每条 `checks` 记录需要包含检查 ID、绑定义务、实际输入、结果、原始证据位置、预期与实际差异及完整性。每条 `negative_controls` 记录需要包含变体身份、植入缺陷、应失败的义务、实际捕获结果、恢复正向对照的结果。记录的日志和证据必须可读取、校验并与当前候选关联；单独一个成功布尔值不足以验收。

## 8. 发布门槛与现有验证入口

新增工作流正式对外声明前，必须记录精确提交的主线 CI、安装包 canary、包内容及 SHA-256 验证，并用实际安装包执行对应闭环。继续遵守 `release.json` 审核和 GitHub-only 发行约束；保持 `private: true`、npm/MCP Registry 发布禁用，不覆盖公开发行或移动现有版本标签。

验收记录应明确区分源码验证、包验证、真实浏览器验证、真实 Agent 验证与真实宿主验证。根据声明所需的范围选择验证；缺少外部依赖就记录缺失的具体 lane，不能扩大其他测试的证明力。

研究基线中已有 `npm run verify:browser`、`npm run verify:application-workflows`、`npm run verify:readiness` 及 `npm run verify:package` 等入口。它们只证明各自当前实现的范围；**初始计划没有新增 npm script，也没有以这些入口证明新增工作流**。本轮实际执行范围另记如下。后续工作流脚本或验证入口须在实现 PR 中创建、文档化并验证后，才可写成可运行命令。

实施时按[测试指南](testing.md)和[工具设计规范](tool-design.md)选择能检出实际失败的边界、真实场景及负向对照；不靠累加测试数量替代上述证明。一次通过仅在保留的提交、包、范围和环境条件下成立。

## PW-01 已合并切片记录

元数据领域与存储切片在 Linux x64 / Node.js 24.22.1 的 15 项边界测试通过。
记录来源为 `tests/boundary/filesystem/projectStore.test.ts`，
接口、存储格式和限制见[项目存储契约](project-storage.md)。

- PWA-01 的创建/重读、格式与身份、版本 0/2 拒绝、损坏内容保留、
  不完整创建及中断暂存读取已验证。当前为首个格式，没有既有已发布项目可迁移。
- PWA-03 的元数据 revision 竞争由两个实际 Node.js 进程在目录及符号链接别名上验证。
  运行互斥、CLI/MCP 并发和进程恢复尚待 PW-02/PW-06。
- PWA-11 的范围/候选变化与历史检查适用性已验证。检查器、场景及环境身份已保存，
  但报告认证和真实检查仍待 PW-04。

以上为各验收项的存储部分，M1 的真实 Agent、浏览器闭环及界面尚未验收。
存储切片已通过下述精确来源的 CI 与审阅并合并；阶段接口及运行边界仍待落实，M0 尚未关闭。

### 当前宿主的后续执行预检

已发现 Codex CLI `0.167.0-alpha.4`，登录状态显示 ChatGPT 授权存在。
在独立临时工作目录尝试最小 `codex exec --sandbox workspace-write --json --ephemeral`
写文件任务时，程序退出码为 1，初始化阶段报告
`failed to initialize in-process app-server client: Read-only file system (os error 30)`。
输出目录未生成请求的文件，也没有收到可解析的 JSONL 事件。
该记录保留为 PWA-04 的实际阻塞，尚未证明 Builder 的写入、恢复或取消能力。

PR #55 首次 CI 的源码测试、静态检查、文档、编译和 Windows 原生控件构建通过，
但工作流因 GitHub 平台内部错误结束，完整资格未完成。
[失败运行](https://github.com/ForceMind/Tekvro/actions/runs/42670966511)
报告 `Internal server error`，关联 ID 为
`69b45568-49ac-4b89-9006-a9de7a46310d`。
重试失败作业接口返回 HTTP 403 与 `This workflow run cannot be retried`。
保留失败记录，后续提交重新执行当前完整资格后再更新验收状态。

### 存储切片最终资格与合并记录

[PR #55](https://github.com/ForceMind/Tekvro/pull/55) 的最终来源为
`b49549bc2f72bcfbfcfe95b1f82e604044ab48c2`，合并提交为
`3bf8cc6174d1a85608402ea91cf0f90dcfd962f6`。
[该来源 CI](https://github.com/ForceMind/Tekvro/actions/runs/42676758338)
为 33,784 项通过、234 项按环境条件跳过，执行清单核对为 true。
跨宿主历史路径的审阅问题已修复并解决；本地存储边界为前述 15 项通过。
[核心实测](https://github.com/ForceMind/Tekvro/actions/runs/42676758000)
首次因 Electron MCP 用例 20 秒超时失败，同一来源重跑后通过；首次失败保留，
测试及超时设置没有修改。这些结果只覆盖已实现的元数据与既有工具范围，
不表示当时的项目执行器、真实 Builder、项目 CLI/MCP 或工作台已经实现；后续运行切片的实现和验证范围记录如下，不能由 PR #55 的结果替代。

## 2026-11-10 运行切片的本地验证记录

本轮从主线 `8c69ebeaabd27cd89b8250626a94711660c057bd` 开始实施。以下保留 2026-11-10 的本地验证与环境阻塞记录，不表示该基线提交已包含这些改动，也不将后续 CI 结果回写为当时本地通过。最终来源、精确 CI 和 M0 结论见本节后续资格记录；发行包资格仍独立。

### 已实现的范围

当前包含项目运行事件与并发令牌、候选完整观察、受管 Builder 一次尝试、持久化 `pending_check`、独立检查报告、显式修正/新尝试、预算变更，以及 3 个元数据入口和 6 个运行入口的 CLI/MCP 契约与实现。操作和字段见[运行指南](project-workflow-runtime.md)。

验证器 manifest、固定脚本/场景/预期及报告位于 Builder 候选树之外。真实检查结果绑定项目/run、源文件、`scope_revision`、范围/必要义务、候选、checker、场景和环境；报告另外保留原始输出与内容摘要。旧候选、A→B→A 的范围修订、被改写的固定输入、报告损坏、截断输出及未知清理不能自动得到当前 `pass`。

一次检查的 `pass/fail/unknown` 只进入该次检查和 `last_check_status`。本轮没有将其提升为项目或 run 的全局 `acceptance_status=pass/fail`，也没有完成 reconstruction ledger 的完整义务闭合。

### 实际执行与环境阻塞

本地环境为 Linux x64、Node.js 24.22.1。以下按唯一用例汇总，不把多次复跑累加；共 **90 项实际通过、25 项按真实环境前置条件跳过**。

| 验证范围                                        | 实际通过 | 环境跳过 | 证据与结论边界                                                                                                                                              |
| ----------------------------------------------- | -------: | -------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 运行/检查绑定领域、项目存储、运行存储、项目服务 |       40 |        0 | 领域 15、ProjectStore 15、RunStore 8、ProjectService 2；覆盖各自状态、持久化和失败保留，不替代进程编排                                                      |
| 独立 checker 进程边界                           |       18 |        0 | `projectCheckService.test.ts`；真实 Node 进程执行外部 oracle，包含植入缺陷后检出、恢复正向、绑定失效、取消/超时和原始输出保存                               |
| Codex adapter 协议边界                          |       16 |        0 | `codexBuilderAdapter.test.ts`；明确标注的协议 fixture，验证适配器协议与拥有的进程；不代表真实 Codex 账号已生成产物                                          |
| 项目 Workspace                                  |        1 |        5 | 文件系统前置边界实际通过；五项真实租约场景在 socket `listen` 被宿主拒绝时跳过                                                                               |
| ProjectRunService                               |        1 |       19 | 真实写入后超时 fixture 已通过；已提供 pending 重开、修正、取消、预算、同目录/别名并发、未知 owner 拒绝重放和投影故障测试；19 项编排用例在真实租约前置处受阻 |
| CLI/MCP 的三个定向测试文件                      |       13 |        1 | 包含真实只读 inspect CLI/MCP；一项跨入口运行场景在真实租约前置处受阻，不能外推所有执行入口已获实际资格                                                      |
| Builder 启动前取消窗口                          |        1 |        0 | 真实RunState/Store与CodexAdapter；workspace seam只注入取消时机，不声明锁或Agent资格                                                                         |
| **合计**                                        |   **90** |   **25** | 跳过项保持未验证，必须在具备实际 socket 能力的宿主复跑                                                                                                      |

25 个跳过用例在该本地宿主实际观察到 Unix socket `listen` 返回 `EPERM`。前置规则只识别真实错误因果链中的 `listen` 与 `EPERM/EACCES`，其他失败仍失败；没有替换生产锁、模拟 lease 或绕开 owner。共享判断位于 `tests/fixtures/projectLeaseCapability.ts`。该次本地运行未验证这些恢复、并发和跨入口执行场景；其后在具备真实 socket 能力的 Linux CI 中分别执行，结果见最终资格记录。

独立 checker 的 18 项通过包含真正的 Node fixture 写入与取消，因此验证了该 fixture 的进程和 oracle 边界；它不代表 ProjectRunService 租约闭环，更不代表一次真实 Agent 生成。真实 Codex 的最小写入仍是上述 `EROFS` 阻塞记录；安装探测、帮助输出和协议 fixture 不能改变其未获资格的状态。

本轮构建、`check:fast`、模块边界与 knip 已通过。精确测试复跑使用仓库既有入口，例如构建前置完成后执行：

```sh
node scripts/run-exact-tests.mjs run tests/boundary/process/projectCheckService.test.ts tests/boundary/process/projectRunService.test.ts
```

上述文件本地分项结果为 checker 18 通过；run service 1 通过、19 环境跳过；读取明细而非只读退出码。这些是本地分项结果；后续精确来源 CI 单列如下，实际安装包及真实网页场景资格仍待验证。

### PR #62 评审修复

- Builder 超时且清理已确认后，仍持有同一工作区租约重新观察候选、来源和固定验证输入。新增 `build_paused` 事件保存部分产物身份，保持原阶段、run、尝试次数和累计预算；显式增量预算后可以继续同一 run。完整观察失败或验证输入变化时不制造可恢复边界。新增三项纯域回归和真实写后超时 fixture 已通过；完整服务恢复仍由真实 lease 的 CI 验证。
- 独立 checker 使用共享的 token-owned process sweep。新增回归先实际观察 detached helper 的独立进程组和本次 token，确认 leader 退出后 helper 已清理、旁系进程仍存活。旧实现下该回归准确失败，补丁后独立 checker 文件 18/18 实跑通过。

### PR #62 最终精确来源与 Linux 资格

本记录于 2026-11-10 06:51:43 UTC 按实际运行产物核定，来源如下：

| 身份                                                                                                      | 实际记录                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR 最终代码来源                                                                                           | `ba49ea0fb7f6c0e2050b4a83a26bc6e98eb571cf`                                                                                                                                                                                                                                                                                                                                                                                   |
| PR #62 合并提交                                                                                           | `7631020d85d665466e6584378dcc3689f389dd18`                                                                                                                                                                                                                                                                                                                                                                                   |
| [该来源 CI 工作流 42767419422](https://github.com/ForceMind/Tekvro/actions/runs/42767419422) 实际检出提交 | `2a31775269fe974c14f5e34b6abf19412dabb04a`                                                                                                                                                                                                                                                                                                                                                                                   |
| [核心实测 42767419307](https://github.com/ForceMind/Tekvro/actions/runs/42767419307) 实际执行提交         | `2a31775269fe974c14f5e34b6abf19412dabb04a`                                                                                                                                                                                                                                                                                                                                                                                   |
| 运行宿主及 Node.js                                                                                        | Ubuntu 24.04.5 LTS / Linux x64；runner 2.338.2，映像 20261101.360.1；Node.js 24.22.1                                                                                                                                                                                                                                                                                                                                         |
| 来源对应核对                                                                                              | PR head ba49ea0fb7f6c0e2050b4a83a26bc6e98eb571cf，实际 CI/engine checkout 为 2a31775269fe974c14f5e34b6abf19412dabb04a（父提交为基线 8c69ebeaabd27cd89b8250626a94711660c057bd 与该 PR head）。经 Git 对象核对，PR head、测试检出和 squash 合并提交 7631020d85d665466e6584378dcc3689f389dd18 的完整文件树均为 bd86a9c422abd46fd7e0b9a08def77930a2db91c。这里记录的是 PR 来源资格及相同合并文件树，不宣称合并后主线已重新实跑。 |

首次 CI 在 `src/contracts/toolEffects.test.ts` 的两条清单审计断言失败，保留[原始失败运行](https://github.com/ForceMind/Tekvro/actions/runs/42757866280)。失败项为 `keeps execution and device wording aligned with declared effects` 与 `marks foreign execution and device mutation as destructive`：审计缺少两个不启动 Builder/checker 的入口说明例外，以及四个项目执行入口的预期清单。

`c7be57f79ba06a6794ab7f3cd0e47a2bd543be34` 只更新 `src/contracts/toolEffects.test.ts`：补入 `inspect_project_run`、`adjust_project_run_budget` 的说明例外，以及 `build_project`、`check_project`、`refine_project`、`resume_project_build` 的执行权限审计预期。生产 effects 声明未修改，原失败不删除。这项审计修正没有覆盖随后发现的 v-mode 生产 schema 问题；最终资格以下述后续修复来源为准。

随后，`c7be57f79ba06a6794ab7f3cd0e47a2bd543be34` 的 [CI 42759854810](https://github.com/ForceMind/Tekvro/actions/runs/42759854810) 仍失败，保留以下两类实际记录：

- Built shard 7 的真实 MCP `advertisedPatternsVMode` 检查发现，`src/domain/projectManifest.ts` 中保存绝对历史路径的正则在 JavaScript `v` 模式下无法编译，影响九个项目工具的 `outputSchema`。这是生产 schema 的兼容性失败，[失败明细](https://github.com/ForceMind/Tekvro/actions/runs/42759854810/job/129644199785)不得作为平台跳过忽略。正则修复来源为 `45a7e3df5c839f8f5149eec4e656b584adf47ff4`，其定向复测与新 head 完整资格分别记录。
- Ubuntu `recorded_crash` 的作业 `129644199982` 在 checkout 前执行 `apt-get update` 时，因 Ubuntu 镜像 `Packages.gz` 大小/哈希与元数据不一致而以 `100` 退出，见[原始作业记录](https://github.com/ForceMind/Tekvro/actions/runs/42759854810/job/129644199982)。这是仓库检出前的环境准备失败，不是 `recorded_crash` 产品用例已执行失败，也不能计为该用例已通过。

核对这次失败来源时，仅 46 个项目相关用例已有实际执行证据；原本地 25 个跳过用例中，只确认 Workspace 的 5 项取得真实租约资格，RunService 19 项及跨入口执行 1 项尚未取得资格。这个局部记录不构成 M0 完成，也不用于填充后续来源的总通过数。旧来源的[核心实测记录](https://github.com/ForceMind/Tekvro/actions/runs/42759854669)继续保留，不能代替修复后来源的重新验证。

正则修复后，来源 `45a7e3` 的 [CI 42763422831](https://github.com/ForceMind/Tekvro/actions/runs/42763422831) 已取得本轮 119 个项目用例中 103 项实际通过记录。原本地 25 个 socket 跳过场景全部实跑通过：RunService 19 项、Workspace 5 项和跨 CLI/MCP 1 项；真实 MCP `advertisedPatternsVMode` 检查也通过。这些是该来源取得的新证据，不回写旧 head 或原本地的失败/跳过记录。其余 Codex adapter 协议 16 项因所在分片取消而未取得本轮结果，不能算作通过，也不是一次真实 Codex 生成资格。

该轮唯一产品测试阻断来自 built shard 1 的 [作业 129655501148](https://github.com/ForceMind/Tekvro/actions/runs/42763422831/job/129655501148)：`outputSchemaProfile.test.ts:117` 测得关闭 output schemas 后的完整工具目录为 1,053,720 bytes，超过既有 1,048,576 bytes（1 MiB）门槛 5,144 bytes。原失败及实际字节数保留，不能通过提高阈值或删除公开验证字段绕过。

当时确定的修复方向是对 canonical 自动 fallback 字段说明去冗余，保留显式领域 `description`、schemas、examples、profile 及全部验证字段，既有 1 MiB 阈值不变。实际修复提交为 `ba49ea0fb7f6c0e2050b4a83a26bc6e98eb571cf`；修复后来源的 CI 结果见后续资格记录。103/119 的局部通过以及 25 个 socket 场景通过，不构成这一失败来源的完整资格；后续来源的最终结果另列。

同一轮后续核对的 Ubuntu `recorded_crash` [作业 129655925118](https://github.com/ForceMind/Tekvro/actions/runs/42763422831/job/129655925118) 已越过先前的 apt 镜像准备问题，进入真实记录验证 step 11 后被取消。该记录必须保留为 `cancelled`，不能记为 `pass`，也不能继续描述成在 apt 阶段失败。先前 job `129644199982` 的镜像大小/哈希失败仍是独立历史，不被这次取消覆盖。

目录修复随后在 [`ba49ea0fb7f6c0e2050b4a83a26bc6e98eb571cf`](https://github.com/ForceMind/Tekvro/commit/ba49ea0fb7f6c0e2050b4a83a26bc6e98eb571cf) 提交，parent 为 `45a7e3`，树身份为 `bd86a9c422abd46fd7e0b9a08def77930a2db91c`。改动限于 `toolSchemaMetadata` 和 `outputSchemaProfile` 两个文件。实测完整目录仍包含 238 个工具，关闭 output schemas 时由 1,053,720 降至 1,038,306 bytes，减少 15,414 bytes，距原 1,048,576 bytes 上限保留 10,270 bytes。构建前后 969 处结构差异全部属于 `inputSchema.description`；其余验证约束、examples、工具正文、annotations 和 profile 保持一致，显式领域 description 得以保留。

该候选的 source 定向用例 69 项、真实 MCP 定向用例 47 项，共 116 项实际通过、无跳过；另有 build、check:fast 和 docs:check 通过记录，docs:check 中 README 用例为 5 项。这里的 116 项是目录修复定向验证，不与前述项目 103/119、该来源 CI 工作流的便携测试总量或原生引擎资格相加。提交候选时，新 [CI 42767419422](https://github.com/ForceMind/Tekvro/actions/runs/42767419422) 与[核心实测 42767419307](https://github.com/ForceMind/Tekvro/actions/runs/42767419307) 仍在运行，本地通过尚未构成最终合并资格；后续结果与实际执行提交在最终资格中分别记录。

目录修复来源 `ba49ea0fb7f6c0e2050b4a83a26bc6e98eb571cf` 的[核心实测 42767419307](https://github.com/ForceMind/Tekvro/actions/runs/42767419307) 首轮 attempt 1 最终为 failure，分平台记录如下：

| 首轮作业                                                                                            | 实际执行与结果                                                                                                                                                                                                     | 结论边界                                                                                                           |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Linux [129667057100](https://github.com/ForceMind/Tekvro/actions/runs/42767419307/job/129667057100) | 32 项通过、1 项 Windows-only 跳过；WASM artifact、interface 和 package 验证实际完成。checkout 为 `2a31775269fe974c14f5e34b6abf19412dabb04a`，其 tree 与 ba49ea0 相同                                               | 是本次 Linux 实跑结果，后续 carryover 不重复计数                                                                   |
| macOS [129667056356](https://github.com/ForceMind/Tekvro/actions/runs/42767419307/job/129667056356) | Source Electron 10 项通过；MCP/paths 13 项通过、1 项失败。`electronMcp.test.ts:465` 的 `runs active Electron scenarios with selected paths and inferred working directory` 实际 20,542 ms，超过既有 20,000 ms 限制 | 失败发生在注入 provider 的 MCP 边界 fixture；后续真实 `verify:electron` 未执行，不能写成真实 Electron 应用执行失败 |

前一来源 `45a7e3` 的同一 MCP 边界场景实际 17,635 ms 通过，这只能作为历史比较，不能使新来源的失败变成通过，也不证明失败原因。首轮失败及既有 20 秒阈值继续保留，不提前归类为基础设施问题或偶发失败。

首轮终态后，06:21 UTC 已原样请求只重跑同来源失败的 macOS 作业。Attempt 2 的新 macOS 作业为 [129668714121](https://github.com/ForceMind/Tekvro/actions/runs/42767419307/job/129668714121)，请求后的观察状态为 queued。Attempt 2 中显示的 Linux 作业 [129668716753](https://github.com/ForceMind/Tekvro/actions/runs/42767419307/job/129668716753) 是首轮成功结果的 carryover，不是新一次 Linux 执行。

Attempt 2 最终为 success。macOS [作业 129668714121](https://github.com/ForceMind/Tekvro/actions/runs/42767419307/job/129668714121) 实际 checkout 为 `2a31775269fe974c14f5e34b6abf19412dabb04a`，环境为 macOS 15.8.2 arm64、image `20261104.0514.1`、Node.js 24.22.1。Source Electron 10 项和 MCP/paths 14 项全部通过，首轮超时的场景本次为 14,023 ms。

随后真实 `verify:electron` 实际执行：Electron 44.9.0，`verified=true`，清理结果 `terminated-owned-process`；ipc、open-url、second-instance、reload、crash、restart 均为 completed，记录 `ipc=5`、`timeline=145`。Linux 的 32 项通过、1 项 Windows-only 跳过及 WASM/H5 验证来自 attempt 1 原作业 `129667057100`；attempt 2 的 carryover 没有增加一次 Linux 实跑。

首轮失败、重试来源与结果分别记录，不以最终工作流颜色覆盖失败历史。

同一来源 `ba49ea0fb7f6c0e2050b4a83a26bc6e98eb571cf` 的 [CI 42767419422](https://github.com/ForceMind/Tekvro/actions/runs/42767419422) attempt 1 随后终态为 failure。唯一测试失败来自 built shard 1 的 [作业 129667416296](https://github.com/ForceMind/Tekvro/actions/runs/42767419422/job/129667416296)：既有 `tests/boundary/cli/workflowInputIdentities.test.ts:306` 用例 `preserves workflow identity validation through CLI and inline, retained and mixed MCP inputs` 实际 30,364 ms，超过原 30,000 ms 限制 364 ms；没有其他断言失败。该分片实际为 1,798 项通过、9 项跳过、1 项失败。

目录修复的 `outputSchemaProfile` 两项、`ProjectBuildStage` 一项在这轮实际通过；shard 7 的真实 MCP `advertisedPatternsVMode` 一项也通过。前一来源 `45a7e3` 的同一 workflow identity 用例实际 24,119 ms 通过。ba49ea0 没有修改这个测试或工作流执行逻辑，提交改动限定于输入描述精炼及相应验证；这个差异记录不证明超时原因，也不将本次失败归类为偶发或基础设施问题。30 秒时限保持不变。

Fail-fast 取消了首轮 shard 2、4、5；Source、shard 3、6、7、8 及已成功的平台作业保留原结果。06:33 UTC，同一 head 针对 failed/cancelled 子集的原样重跑请求已成功受理。主 CI 的后续实际 retry attempt 记录：Attempt 2 成功，CI required 作业 129678578041 于 06:49:04 UTC 完成。实际重跑 shard 1/2/4/5，作业分别为 129673160918、129673160658、129673160785、129673160754；既有 workflowInputIdentities 用例在原 30 秒时限下以 23,507 ms 通过，目录 profile 两项也实际通过。其余成功作业沿用同一来源的首轮执行结果，没有重复计数。Portable 作业 129678323607 汇总成功，最终 test-results artifact 为 13740974920，ZIP SHA-256 为 f2be68c20f74aa6b73a68882ef0cdeff195e89c389def8f3bd189be1bc34d9c5；产物记录 prHeadSha=ba49ea0fb7f6c0e2050b4a83a26bc6e98eb571cf、executionSha=2a31775269fe974c14f5e34b6abf19412dabb04a、runAttempt=2。原成功作业不作为新一次执行累加，取消分片没有取得的测试结果不从其他分片推导；最终便携测试计数及测试文件库存依实际产物核对；库存检查 missing、unexpected 与 duplicateFiles。

本轮平台正向记录独立保留：Ubuntu `recorded_crash` [作业 129667581202](https://github.com/ForceMind/Tekvro/actions/runs/42767419422/job/129667581202) 已成功，实际 installed CLI/MCP 状态为 passed，记录的 checkout 前缀为 `2a31775`；Debian [作业 129667581234](https://github.com/ForceMind/Tekvro/actions/runs/42767419422/job/129667581234) 成功，Windows native 与 Reverse quality 也成功。这些结果不覆盖先前镜像准备失败或真实记录验证期间取消的历史；主 CI 重试结果与测试文件库存按各自实际产物核对。

c7be 与 45a7e3 的失败 CI 记录保留；后续源码修复由最终来源 `ba49ea0fb7f6c0e2050b4a83a26bc6e98eb571cf` 的 CI 工作流与核心实测验证。同源 macOS 作业重试属于上述引擎 attempt 记录。最终通过结果、项目分项和实际源码对应如下，历史失败和取消不计入通过。

该来源 CI 工作流中的便携测试汇总为 33,997 项实际通过、234 项按环境条件跳过，测试文件库存核对（无缺失、额外或重复）为 true。核心实测工作流第 2 次尝试成功：Linux x64 在第 1 次尝试实际完成 32 项通过、1 项 Windows 专用跳过及真实 H5/WABT/包验证；macOS arm64 第 1 次尝试的 Electron MCP fixture 在 20 秒上限超时，第 2 次同源单作业原样重跑实际完成 24 项测试及真实 Electron CLI/MCP 采集、IPC、重载和清理验证。没有修改测试或时限，也没有重跑已经成功的 Linux 作业。PR head、workflow head、实际 checkout 和合并提交不是同一个概念；本表分别记录观察到的身份，不把 PR 的通过记录称作合并后主线重跑，也不将这些结果当作发行包资格。

此处便携测试的 `mode=full` 仅标识便携测试集合；PR `fast-tier` 中按规则跳过的 deep static 仍保留跳过状态。测试文件库存核对（无缺失、额外或重复）不扩张为 release full-tier、覆盖率或发行包资格。

最终 observational report 单独记录：selected=2514、omitted=0、unobserved=33、complete=false。33 个整文件跳过共 104 项：30 个文件的 101 项受 macOS/Xcode 原生前置限制，3 个 Windows 专用文件各 1 项；另有 130 项跳过分布于 49 个含实际通过用例的文件，总跳过 234 项。这些项不计为通过；项目相关 119 项及原 25 项 socket 场景自身均零跳过。观测报告不能独立授予资格或授权省略测试。其中 `selected`、`omitted`、`unobserved` 与 `complete` 描述所选测试文件的观测情况。平台整文件 skip 可能列入 `unobserved`，使 `complete=false`；这与测试文件库存核对为 true 可以同时成立。该观测报告不独立授予验收资格，也不授权省略测试，整文件 skip 不算实际执行通过。

本轮项目资格仍按实际用例核定：119 个项目用例和原本地 25 个 socket 场景要求零跳过实跑通过；不能用库存匹配或 observational report 的任一字段替代这些记录。库存门槛要求无 missing、unexpected 或 duplicateFiles；不另外要求 observational report 的 `complete` 必须为 true。

项目相关结果从[实际测试产物或作业记录](https://github.com/ForceMind/Tekvro/actions/runs/42767419422/job/129678323607)逐项核对；同一用例多次复跑只计一次，不用本地 90 加 25 推算通过数量。

| 项目子范围                                                       | 实际通过 | 环境跳过 | 实际覆盖与边界                                                                                                     |
| ---------------------------------------------------------------- | -------: | -------: | ------------------------------------------------------------------------------------------------------------------ |
| 项目/运行/绑定及路径领域，ProjectStore、RunStore、ProjectService |       44 |        0 | 保存重读、原始修订认证、事件重放、版本边界、并发提交及状态/绑定失效                                                |
| 独立 checker                                                     |       18 |        0 | 真实 Node oracle、负向对照、原始输出、取消/超时及本次 token 的进程清理                                             |
| Codex adapter 协议                                               |       16 |        0 | 真实子进程承载的协议 fixture；不代表真实 Codex 模型生成                                                            |
| ProjectWorkspace                                                 |        6 |        0 | 包含原本地跳过的 5 项真实租约用例；路径/inode、归属标记、释放与恢复                                                |
| ProjectRunService                                                |       20 |        0 | 包含原本地跳过的 19 项编排用例；Node Builder fixture 的 pending 恢复、预算、取消、并发、投影失败及超时部分候选续跑 |
| 项目 CLI/MCP 定向用例                                            |       14 |        0 | 包含原本地跳过的 1 项跨入口执行；真实 transport 与共享项目服务，Builder 仍是明确标注的 fixture                     |
| Builder 启动前取消窗口                                           |        1 |        0 | 真实 RunState/Store 与 CodexAdapter；workspace seam 仅控制取消时机，不独立证明锁或 Agent 资格                      |
| **合计**                                                         |  **119** |    **0** | 每行使用实际明细计数，不把跳过项计入通过                                                                           |

实际执行命令／作业步骤为：

```text
Source（首轮成功执行）:
npm run test:fast -- --reporter=default --reporter=blob

Built（最终采用 shard 3/6/7/8 首轮成功结果；1/2/4/5 为同源第二轮重跑）:
npm run test:built -- --reporter=default --reporter=blob --shard=1/8
npm run test:built -- --reporter=default --reporter=blob --shard=2/8
npm run test:built -- --reporter=default --reporter=blob --shard=3/8
npm run test:built -- --reporter=default --reporter=blob --shard=4/8
npm run test:built -- --reporter=default --reporter=blob --shard=5/8
npm run test:built -- --reporter=default --reporter=blob --shard=6/8
npm run test:built -- --reporter=default --reporter=blob --shard=7/8
npm run test:built -- --reporter=default --reporter=blob --shard=8/8

Portable（第二轮实际合并）:
npm exec -- vitest --merge-reports --reporter=default --reporter=junit --reporter=json --reporter=./scripts/ci/test-timing-reporter.mjs --outputFile.junit=test-results.xml --outputFile.json=test-results.json
node scripts/ci/test-report.mjs

库存报告实际环境:
CI_VERIFY_TEST_INVENTORY=true
CI_TEST_SELECTION_PATH=.cache/ci-test-selection/plan.json
SHARD_RESULT=success
SOURCE_RESULT=success
MERGE_RESULT=success
```

原本地跳过的 RunService 19 项、Workspace 5 项、跨入口执行 1 项已逐项确认在真实 Linux socket 条件下执行并通过；没有替换生产 lease，也没有把前置 skip 算作通过。本地 90 项通过、25 项跳过及此前 #55 的内部错误/超时记录继续保留。

本次据此验收 M0：PWA-01 的 PW-01 持久化、原子发布、重读、损坏保留及版本边界；PWA-11 的项目/运行/范围/候选和检查引用身份、适用性与失效；PWA-16 的 PW-01 本地元数据及路径边界。首个持久化格式为 v1，无已发布旧格式需迁移，因此历史迁移记为 N/A，未知版本拒绝和原字节保留已验证。PW-01 的 project schema 未提供凭据或整套宿主环境字段，项目元数据服务没有隐式上传路径。Builder/Checker 原始输出仍按运行契约保留；完整敏感值处理、真实 Builder 的访问限制和集中诊断继续由所属 M1/M2 工作包验证。

PW-02/03/04/06 的接口边界已经落实，M0 完成。真实 Codex 构建/工具调用/会话恢复、网页多视口与行为、完整义务账本、候选树内日志的语义无进展、完整 PWA-16、工作台、其他平台及发行包继续按所属阶段验收；M1 保持进行中。

### 对验收项的影响与剩余门槛

| 验收项                       | 当前取得的子范围                                                                                              | 尚未关闭的要求                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| PWA-01、PWA-11 的 PW-01 部分 | M0 已验收：版本一清单、持久化/重读/并发、原始修订认证、运行与检查引用绑定及失效；无已发布旧格式，历史迁移 N/A | 不预先证明未来版本迁移，也不替代 PW-04 的完整 Evidence/owner/义务验证                                 |
| PWA-02、PWA-03、PWA-05       | 所列 Linux fixture 的真实租约、编排、预算、取消、恢复和清理边界已实际验证                                     | 真实 Agent 断线/取消/恢复与完整 study/build/check/refine 闭环仍需对应证据                             |
| PWA-04                       | Codex 能力、协议和明确不支持的会话恢复已编码；协议 fixture 通过                                               | 真实 Codex 生成仍有 EROFS 阻塞记录；工具调用/原会话恢复等能力需分别取得真实资格                       |
| PWA-06                       | 完整 tree digest、执行位、计数和累计预算已实现；所列 Linux 运行与重开边界通过                                 | 摘要只证明内容变化，任意 Builder 树内日志尚未作语义分类，不能关闭“只改日志不算进展”的完整要求         |
| PWA-10、PWA-11 的检查部分    | 固定文件 oracle 真实检出已知缺陷；过期/错误绑定、报告认证和输出完整性边界通过                                 | 网页/多视口、owner/义务账本闭合和跨环境适用性仍需对应真实场景                                         |
| PWA-14                       | 九入口共享契约/服务；现有元数据、只读 inspect 与跨入口运行 fixture 已通过真实 transport 验证                  | 真实 Agent 网页闭环的 CLI/MCP 对等结果仍需验证，不能关闭整项                                          |
| PWA-16                       | PW-01 schema 未提供凭据/全环境字段，元数据服务无隐式上传；显式 verifier 输入/环境及诊断已有局部证据           | Builder/Checker 原始输出仍保留；完整授权、敏感值处理、真实 Builder 访问范围及集中诊断仍需对应阶段验证 |
| PWA-07/08/09/12/13/15/17/18  | 本切片未取得这些范围的通过记录                                                                                | 多视口、mask、浏览器场景、完整 ledger、真实闭环、UI、桌面/游戏和发行包继续保持未验收                  |

候选摘要覆盖完整物化输出树，包括空目录和文件执行位；不忽略 `.git`、`node_modules`。服务自身事件与检查日志在树外，因此不会增加候选进展。候选树内任意 Builder 日志变化仍可能改变摘要，当前不能识别其全部语义，也不能将内容变化等同功能改进。有限预算和独立检查继续约束执行，PWA-06 的“仅修改日志不算进展”完整要求没有因摘要实现而被关闭。

M0 已按上述精确来源完成 PW-01 及相关接口边界的验收，M1 保持进行中。下一个必要证据是可实际写入的 Codex Builder、固定网页/H5 样例与独立浏览器验证；再以完整义务和当前有效证明判断受限范围验收。已有 Linux 项目核心结果无需被真实 Agent 的环境阻塞撤销，也不能代替后者。本轮不新增 UI、任意网页、桌面/游戏、其他平台或发行包支持声明。

## 9. 本文件所依据的既有契约

- [统一应用工具契约](https://github.com/ForceMind/Tekvro/blob/ee5ebf85b35c800c92d2e308ea601c158c529596/src/contracts/applicationToolContracts.ts)：重建账本与覆盖评估入口。
- [重建义务账本 schema](https://github.com/ForceMind/Tekvro/blob/ee5ebf85b35c800c92d2e308ea601c158c529596/src/domain/reconstructionObligationLedgerSchemas.ts)：owner、案例、验证权威、状态及闭合摘要。
- [重建覆盖判定](https://github.com/ForceMind/Tekvro/blob/ee5ebf85b35c800c92d2e308ea601c158c529596/src/domain/reconstructionCoverage.ts)：范围、证明身份、未知与失败判据。
- [浏览器工具契约](https://github.com/ForceMind/Tekvro/blob/ee5ebf85b35c800c92d2e308ea601c158c529596/src/contracts/browserToolContracts.ts)：场景、捕获和截图比较入口。
- [测试指南](testing.md)：真实 provider 验证、精确范围及未验证边界。
- [仓库工作约束](https://github.com/ForceMind/Tekvro/blob/ee5ebf85b35c800c92d2e308ea601c158c529596/AGENTS.md)：本地证据、生命周期、CLI/MCP 同源和发行规则。

上述历史引用说明复用依据，不单独证明新增项目工作流已实现或已验收；本轮实际范围以新增记录为准。实施过程如发现当前契约与规划不一致，应保留真实约束、修正规划并记录原因，不通过放宽验收来适配未完成实现。

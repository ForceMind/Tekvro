# REA 6.8.0 之后的上游开发主线研究（2026-11-12）

> 本文件记录一份**固定来源的代码研究与选择性集成方案**，不是内核升级完成记录，也不是支持范围、实机验收或新版本发行声明。持续跟踪见 [#67](https://github.com/ForceMind/Tekvro/issues/67)。

## 1. 固定基线与核对范围

- Tekvro 审计基线：`main` 的 `12ed5208e45ca08a6e2def771ddcbae05b0f64c9`，已公开发行仍为 `v1.0.0`；`engine-metadata.json` 记录 REA `6.8.0` 集成，内核来源 `160d821ac9a0310afcb8d1fc427862dd6508add5`，没有修改这个来源记录。
- REA [上游仓库](https://github.com/morluto/rea) 最新已发布版本：[`rea-agents-6.8.0`](https://github.com/morluto/rea/releases/tag/rea-agents-6.8.0)，发布时间 2026-10-25 08:36 UTC，tag 指向 `160d821ac9a0310afcb8d1fc427862dd6508add5`。
- 研究时冻结的 REA `main`：`3a36b3e6d6ac8895358060ae7182cb8931daf5a7`（提交时间 2026-11-12 08:22:51 UTC）。[固定基线比较](https://github.com/morluto/rea/compare/160d821ac9a0310afcb8d1fc427862dd6508add5...3a36b3e6d6ac8895358060ae7182cb8931daf5a7) 显示上游主线领先 **1,848 次提交**，没有找到更新的正式 Release。这里的“领先”不是需要全部照搬的功能数。
- 资料来自 GitHub 最新 Release、固定的 Git 引用、提交时间线、选定 PR 的说明/文件列表、上游与 Tekvro 对应文件实际 blob。GitHub Compare API 一次最多返回约 300 个差异文件；**该结果不是全部文件的穷尽审计**。当前审查集中于后述风险与产品适配面，不把未逐文件审过的改动写成“无冲突”。

研究不自动更换主分支、版本号、Tag、发行资产、第三方依赖或 MCP/CLI 机器契约；上游 `main` 是开发快照，不是已验收的 REA `6.9.0`。

## 2. 已核实的主要变化及其影响

### U1 / P0：Chromium 沙盒默认值和浏览器启动权限

上游 [#8738](https://github.com/morluto/rea/pull/8738) 修复了 Playwright 默认启动时未主动启用 Chromium sandbox 的问题。它新增 `src/browser/ChromiumSandbox.ts`，并在 `src/browser/PlaywrightScenarioBrowser.ts` 和 `src/browser/modules/NativeModuleResolver.ts` 的真实启动参数中显式传递 `chromiumSandbox`。一般宿主默认为开启；仅按明确的 `REA_BROWSER_NO_SANDBOX=true` 或 Termux/Android 特定能力限制退出，失败要保留启动诊断，而不是悄悄关闭沙盒。

这不是仅凭公告推测：当前 Tekvro 的 `PlaywrightScenarioBrowser.ts` blob 为 `11824f709c0ca7bc14923e07ebe51a35e92aad17`，`NativeModuleResolver.ts` 为 `624700350208a2edd0bdda163f3841ec28ffd7db`，与上游 **6.8.0 基线完全相同**；目前两处均没有提交该 `chromiumSandbox` 参数，Native Module Resolver 仅根据变量附加 `--no-sandbox`，不足以改变 Playwright 的默认策略。上游新实现对应两文件 blob 已发生变化，且新增共享选项文件。

**决策：优先修复。** 作为限定的安全修复 PR：逐调用方引入共享启动策略、正反启动选项测试及失败诊断；在支持沙盒的真实 Chromium 宿主验证默认不带 `--no-sandbox` 且采用隔离启动，显式 opt-out 才允许无沙盒；覆盖 Termux 例外和失败清理。当前工作环境不能启动浏览器时只能报告缺失，不声称实机通过。

### U2 / P0：MCP 客户端注册的真实连接身份

上游 [#10102](https://github.com/morluto/rea/pull/10102) 涉及 **77 个文件**，修改注册、客户端原生配置、备份、读回、清理与不同客户端字段语义；问题包括空可执行命令误报成功、空 argv 丢失、复用其他客户端 transport 元数据。其标记为 **breaking**，不应整体复制。

Tekvro 当前 `src/application/ClientRegistration.ts` blob `caa1e1a28f42e206892fff54e3923904ef3aed97` 仍与上游 6.8.0 对应文件一致，但产品自己的本机入口、迁移和发布保护要求独立审查：不能把 `rea-agents`、公共 `npx` 或旧注册伪装成本产品启动成功。逐客户端测试 stdio argv 精确保真、配置层级、合法旧配置迁移、非法输入无写入、备份/原子更新、读回、取消/清理以及中英文帮助和 CLI/MCP 一致性。

**决策：先画跨应用层/配置层/CLI 的调用链，再选择最小可验证子模块移植**；若改写本地配置契约需独立兼容 PR，不与 U1 或 M1 编排一起合并。

### U3 / P1：网页分析证据与真实验证输入

- [#9896](https://github.com/morluto/rea/pull/9896)：浏览器场景 Evidence 在摘要/Unicode 截断/不可用文本、弹窗错误和秘密值的多种编码表现下的保真；当前 Tekvro 的 `BrowserScenarioSecrets.ts` 与 6.8.0 文件 blob 均为 `18c238342c261164f88be4115323bb8b3cde419d`，新修复需要对应比较。
- [#9127](https://github.com/morluto/rea/pull/9127)：`inspect_playwright_trace` 选择性离线读取 Playwright **v10** trace ZIP，保留查看、分页和证据关系；不是自动重放或浏览器执行。
- [#9090](https://github.com/morluto/rea/pull/9090)：`compare_static_and_observed_endpoints` 将静态 JavaScript 端点与 HAR 网络捕获对照，显式区分有证据匹配、仅静态、仅运行观察及未知，适合为独立检查器提供证明。

**决策：先补捕获真实性/已知缺陷，再考虑增加两个新工具的共享契约和测试**。三项均不能单独证明 Tekvro 的 M1 网页/H5 重建闭环。已有 `compare_browser_scenarios` / 项目 checker、reconstruction ledger 必须保留各自输入身份，不能因为端点或截图“相似”就设置全项目验收为 pass。

### U4 / P1：运行时预算、视图和数据完整性

上游 [#9706](https://github.com/morluto/rea/pull/9706) 涉及 **515 个文件**，增加跨 CLI/MCP 的实际生产者预算调整与精确遗漏/可恢复结果。与 Tekvro 的 `ProjectRunService` 累计运行预算是**不同层次**：一个控制采集、搜索、分页及外部工具的输入准入；另一个控制 Builder 尝试、检查和恢复。上游还通过 [#9331](https://github.com/morluto/rea/pull/9331) 改进有稳定排序依据的 SQLite 分页窗口，带 `!` 变更标记。

**决策：以“一个调用方、一个超限案例、一个恢复入口”分批审查**，分别证明候选身份、预算来源、实际限制与未采集部分。不一次合入 515 个文件，也不把未观察的数据量填作零。

### U5 / P1：静态解析与安全报告

- [#8524](https://github.com/morluto/rea/pull/8524)：新增 ELF、PE、Mach-O 的离线二进制 hardening 报告与对应文件/平台覆盖。
- [#10044](https://github.com/morluto/rea/pull/10044)：PE import directory 的声明边界核验。
- [#10135](https://github.com/morluto/rea/pull/10135)：CSP nonce/hash 仅根据完整合法 source grammar 计数，避免错误报告。
- 提交 `58a051166047442b947c604c3f7ccde6707ee9df`：UnityFS 声明的容器边界；如移植 UnityFS reader 必须同时带入边界/越界负例。

**决策：先独立复现误判或越界样本，再选入补丁**，要求来源、偏移/长度、unknown 与安全负例；禁止在未运行可选引擎的宿主宣称其能力已实测。

### U6 / P2：可选格式与客户端体验

- [#8148](https://github.com/morluto/rea/pull/8148)：读取明文微信小程序 `.wxapkg` 清单及原始成员；明确把加密 `V1MMWX` 包报告为 unavailable，而非暗中解密或制造缺失结果。这对小程序/H5 目标有潜在收益。
- [#9331](https://github.com/morluto/rea/pull/9331)：SQLite 受控行偏移及稳定顺序，适合处理大型本地应用记录。
- [#10128](https://github.com/morluto/rea/pull/10128)：Cline CLI/扩展的 setup/doctor/uninstall 支持。若采用，保持 Tekvro 的安装源和旧版配置防护。

**决策：看真实格式/客户端需求进入具体 PR**，每组在 CLI/MCP 有同源契约、可处理坏包/加密包、拒绝非法路径和损坏记录。

### U7 / P2：桌面 Agent 控制与独立任务检查，仅作架构借鉴

上游 [#9041](https://github.com/morluto/rea/pull/9041) 用 agentenv 计算机暴露真实桌面任务动作，[#9216](https://github.com/morluto/rea/pull/9216) 将多个任务的构建和检查组合到有预算的流程。它们涉及 agentenv 宿主、作用域、证据见证和打包，其适用性不能通过 PR 合并状态外推到 Tekvro 的宿主。

Tekvro 已有 `src/application/project/`、Codex Builder 接口、`ProjectCheckService`、CLI/MCP 九个项目入口和独立的 M2 工作台规划。**决策：只提炼可复用的独立 validator、任务反馈及生命周期合同**，不直接复制上游的第二套控制器，也不以 agentenv 作为 M1 强依赖。Windows ReFS/NTFS（例如 [#10086](https://github.com/morluto/rea/pull/10086)）放在真实 Windows 原生验证条件具备之后。

## 3. 集成先后顺序与验收门槛

1. **U1 浏览器隔离**：独立小 PR，至少两个实际启动调用方、默认/显式无沙盒/Android 选择、失败清理的边界测试。已具备 Chromium 的 CI 执行 `verify:browser`；每次声明明确宿主能力，不用 `REA_BROWSER_NO_SANDBOX=true` 的 CI 结果冒充沙盒已启用验证。
2. **U2 客户端注册**：先固定现有 Tekvro CLI/MCP 的历史配置正反例，再逐客户端修改；确认所有新注册启动本机 `tekvro` 而非公开 REA，确保旧记录有合理迁移/备份/读回，`--schema`、`--version` 等无写入。
3. **U3 证据/比较修正**：正向与故意引入缺陷的负向样本均要在实际浏览器/真实采集产物上运行。比较输出必须区分已观察不同、未比较、未知、旧证据和不适用；不把未运行的 checker 标为通过。
4. **U4/U5/U6**：按预算消费者、格式处理器及目标平台拆成可单独回滚的 PR，分别证明来源字段和不同后端适用性。真实 Ghidra、Hopper、IDA、Android/Windows 不可用时不补造跨平台资格。
5. **U7**：桌面 build/agentenv 与 M1 的项目职责审查通过后再建实验分支；其验证不改变 M1 真实 Codex 仍待跑的记录。

每个实施 PR 必须给出：固定来源 SHA、受影响调用方、变更文件、接口兼容性、必要负例和预期 Evidence、实际 CI/实机日志、明确未验证范围、回滚办法。遵守 `AGENTS.md` 的 Tekvro 身份、`TEKVRO_LANG`、MIT/第三方告知、`private: true`、旧注册迁移、source-update 拒绝及 GitHub-only 发行关口。不触发 npm/MCP Registry 发布，不覆写现存 `v1.0.0`，不提前改写 `engine-metadata.json` 为不存在的版本。

## 4. 研究的已知限制与后续读取入口

本轮研究只验证了固定上游提交、部分 PR 的实际文件列表及几组关键 Tekvro/REA 同路径 blob；**没有导入上游代码，没有在本机运行新的 Node 24 构建或浏览器/商用引擎验收**。Compare API 的 300 文件上限不能作为“其余 1,500 多个提交没有影响”的依据。后续实施必须以所选 PR 的提交树和子目录差异为真实来源，更新这个文件中的结论，而不是复用当前时间点的主线 SHA。

主要交接入口：

- [上游固定比较](https://github.com/morluto/rea/compare/160d821ac9a0310afcb8d1fc427862dd6508add5...3a36b3e6d6ac8895358060ae7182cb8931daf5a7)
- [Tekvro 已完成的 6.8.0 集成与资格](rea-6.8.0-integration.md)
- [选择性同步任务 #67](https://github.com/ForceMind/Tekvro/issues/67)
- [M1 网页/H5 工程验收 #50](https://github.com/ForceMind/Tekvro/issues/50)

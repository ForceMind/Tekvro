# REA 6.4.0｜源码级初步研究结论

> 2026-10-14。基于研究分支内原样复制的 REA 6.4.0 Git 源码与 Tekvro `main` 对照。此文档只记录已审阅的代码与待验证的集成判断，不代表任何升级已合并或构建通过。
>
> 完整文件统计见 [自动差异报告](rea-6.4.0-source-audit.md)；实施总任务 [#21](https://github.com/ForceMind/Tekvro/issues/21)；原路线图 PR [#22](https://github.com/ForceMind/Tekvro/pull/22)。

## 1. 代码复制结果与研究范围

- 上游来源：`morluto/rea` / `rea-agents-6.4.0`，固定提交 `a56f7bb668ab23fec8d33f7af353ac7ed2fe1895`。
- 已将 2,667 个受 Git 跟踪的普通文件完整保留于 `upstream/rea-6.4.0/`，没有直接修改 Tekvro 根目录的分析引擎。
- 上游有 5 个 Git submodule 的独立 commit 指针；归档并不自动携带这 5 个仓库的实际内容。需在后续构建实验中使用上游 Git 提交再初始化对应 submodule，不能把归档视为完全离线、无外部依赖的构建包。
- 自动审计得到：889 个同名相同文件、1,352 个同名但变动文件、426 个上游独有文件、81 个 Tekvro 独有文件。这是字节对比，不是经过语义分析的缺陷或能力数量。

## 2. 已确认的关键代码改变（按集成风险排序）

| 优先级 | 代码证据 | 初步判断 |
| --- | --- | --- |
| P0 | [Evidence schema](../../upstream/rea-6.4.0/src/domain/evidence.ts) 的 `analysis_profile: analysisProfileSchema.nullable()`；当前 Tekvro 为缺省可省略的 Evidence 分支 | 不能只复制 schema。要同步修改创建、快照、序列化、Evidence ID 及旧记录拒绝/重采样逻辑，否则同一条 Evidence 的身份和验证规则会不同。 |
| P0 | [ToolResultDelivery](../../upstream/rea-6.4.0/src/server/toolResult.ts) 替换了旧的顶层结果投递函数；仍有直接 canonical Evidence 和会话结果区别 | 服务实例的预算、保留 Evidence 引用与错误交付都需随着调用方统一修改；Tekvro 当前结果层已部分直接返回 Evidence，不能误判为所有调用均在使用旧包装。 |
| P0 | [ArtifactResourceScope](../../upstream/rea-6.4.0/src/artifacts/ArtifactResourceScope.ts) 新增调用方拥有的资源生命周期，依赖新 `src/filesystem` 持有句柄 | 这是跨 artifact/JS/引用导入/浏览器导出等 API 的签名修改。遗漏调用方会造成类型失败或清理/取消语义失真，先迁移边界再接新能力。 |
| P0 | [JavaScriptApplicationService](../../upstream/rea-6.4.0/src/application/javascript/JavaScriptApplicationService.ts) 需要第二参数 `ArtifactResourceScope`；[CLI 适配](../../upstream/rea-6.4.0/src/cli/javascriptApplicationAnalysis.ts) 的调用签名也改变 | 当前 Tekvro CLI 仍接收 `CliCommandOutput` 参数并管理输出流；整文件替换会带来 CLI 输出兼容风险。先对照所有引用和对应边界测试。 |
| P0 | [受控 JS Worker](../../upstream/rea-6.4.0/src/javascript/analysis/JavaScriptAnalysisWorker.ts)、[Worker 进程入口](../../upstream/rea-6.4.0/src/composition/javascriptAnalysisWorkerProcess.ts) | Worker 不仅是新增子文件，还依赖 `src/domain/javascript`、`src/application/javascript`、`src/process`、`src/composition` 及临时文件生命周期。必须整组移植并用大 bundle、超时/内存耗尽及取消测试验收。 |
| P0 | [按需分析输出契约](../../upstream/rea-6.4.0/src/contracts/analysisDetail.ts) 的 `complete/summary` 与 [AnalysisViewRetention](../../upstream/rea-6.4.0/src/application/analysisView/AnalysisViewService.ts) | `summary` 必须先成功保存完整 Evidence 再返回其视图和 parent ID；不能直接截断 JSON 冒充有效摘要。 |
| P1 | [RPC 识别器](../../upstream/rea-6.4.0/src/domain/javascript/javascriptRpcEndpoints.ts) 使用 AST 扫描及 tRPC/GraphQL 条件 | 可作为相对独立的功能切片，但需连接 H5 与 JS 应用分析的最终网络候选投影并运行误报测试；静态请求候选不代表真实的服务端行为。 |
| P1 | 新增 `src/adb/`、`src/apktool/`、`src/jeb/` 与对应 `domain/contracts/cli/server` 接口 | 新 provider 目录的代码单独复制不等于命令已注册。ADB 写操作必须显式区分，Apktool/JEB 属于外部自备工具；JEB 并不随项目源码提供。 |
| P1 | [Ghidra Launcher](../../upstream/rea-6.4.0/src/ghidra/GhidraLauncher.ts)、`bridge/ghidra/ReaGhidraApplySeeds.java` | 有配置导入语言、compiler spec 与 seeds 的实现，但依赖 provider handshake、profile digest、桥接 Java 文件与真实 Ghidra 环境验证。 |

## 3. 当前项目定制与直接替换之间的冲突

**已核对到以下几处具体冲突，需要保留 Tekvro 的实现：**

1. `package.json`：原版 `name: "rea-agents"`、`mcpName: "io.github.morluto/rea"`、`version: "6.4.0"`；Tekvro 已采用 `tekvro` 和 `io.github.forcemind/tekvro`，并设置 `private: true`。不能用上游清单直接覆盖，应在对应依赖与脚本升级后重生成锁文件和包元数据。
2. `src/identity.ts`：上游 `displayName: "REA"`，Tekvro `displayName: "Tekvro"`，并有 `privateSourceBuild`、`legacyPackageName` 等发布保护/兼容字段。整文件替换将引入身份和安装策略回归。
3. `src/cli/localization.ts`：当前 Tekvro 具备 `TEKVRO_LANG` 中文帮助入口，原版 6.4.0 无同名的本地化策略文件。升级 CLI 命令时必须保留中文可读帮助，但不翻译机器协议字段。
4. `README`、`docs/zh-CN/`、`docs/BRAND.md`、`website` 和受保护的 `.github/workflows/release.yml`、`install.sh`：原版是独立研究输入，不能覆盖已做好的产品化文案和防误发布措施。
5. `src/server/toolResult.ts` 与 `src/cli/javascriptApplicationAnalysis.ts` 既有本地行为与上游新签名不一致，属于真正的业务代码迁移点，而非仅重新命名的文件。

**直接复制到 Tekvro 根目录并覆盖所有同名文件会使包名、发行保护、本地化、构建脚本及运行契约同时变化；这不是一个可作为稳定版本合并的操作。** 在隔离研究分支可以继续做原样实验，但进 `main` 必须拆解迁移并验证。

## 4. 建议下一轮实际代码工作（从完整源码起步，不重复造轮子）

**研究/集成的合理依赖顺序：**

1. 固定从原始 6.1.0 到 6.4.0 的 file/contract delta，保存升级前 CLI+MCP 代表性输出（含 Evidence ID、snapshot/capture）。
2. 先移植 6.2→6.3 Evidence、provider identity、artifact occurrence 和历史持久化语义；旧数据只作明确兼容或重采集，不合成字段。
3. 再移植 6.4 `ArtifactResourceScope` 与 `src/filesystem` 依赖，遍历所有受影响的资源 API、取消与清理调用。
4. 在契约稳定后接入 `src/javascript/analysis` Worker 与 `src/composition` 注册，补充 summary/view 和 HTTP/tRPC/GraphQL 候选识别；验证小型及大型 H5/Electron 真实样本。
5. 另行接 Android ADB → Apktool → JEB、Ghidra，并标记外部工具缺席情况下的能力限制。
6. 全程采用隔离分支、专项 PR、回滚提交和可核验 CI；Tekvro 独立发布仍走现有受限机制，绝不利用原作者的 npm/网站/Registry 身份发布。

## 5. 当前尚未完成

- 尚未把 6.4.0 核心模块合并到 Tekvro 根目录。
- 尚未运行 `npm ci`、编译、完整回归测试或跨平台实机验证；现有快照仅用于研究和差异调查。
- 尚未测试大型 Worker 的真实性能改善或 ADB/JEB/Ghidra 与 Tekvro 既有自定义流程的兼容性。
- 尚未宣称 Tekvro 对外版本为 6.4.0。

本初查报告会作为 [Issue #21](https://github.com/ForceMind/Tekvro/issues/21) 的原始输入，后续完成条件以具体代码 PR/真实测试记录为准。

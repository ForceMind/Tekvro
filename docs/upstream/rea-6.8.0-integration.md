# REA 6.8.0 内核集成记录

## 当前交付状态（2026-10-27）

[PR #28](https://github.com/ForceMind/Tekvro/pull/28) 已合并，主线交付提交为 `4582d229e6587888f2ae980ddf670566e479631b`。已验收源提交 `7333a6c7a71ff32fba1a74fe64d6b4ea0e1827e5` 与该合并提交的完整代码树相同：`43d2bc4bc1cfb41e80329523aacc5762bd418bd1`。引擎来源为下述固定 REA 6.8.0 标签；产品包 6.1.0 兼容标记不代表引擎版本。

- [完整资格 CI](https://github.com/ForceMind/Tekvro/actions/runs/40477324764)：42 个任务中 41 成功，Source tests 按 full 分流策略跳过；六个完整覆盖率分片和汇总均成功，33,591 项通过、234 项跳过、0 失败。
- [合并后主线 CI](https://github.com/ForceMind/Tekvro/actions/runs/40481067436)：成功，同样为 33,591/234/0。Windows 能力与包安装、Linux/macOS x64/arm64 包基线、Node 22/24/26 SQLite 和必要契约检查通过。
- [核心引擎](https://github.com/ForceMind/Tekvro/actions/runs/40477324993)与[提供方验收](https://github.com/ForceMind/Tekvro/actions/runs/40477324875)成功，包含 Linux x64 的 H5/WASM、Ghidra 主机/ARM/m68k 静态样本、Kuna、JADX、编译 APK 多语言资源，以及 macOS arm64 Electron 生命周期/IPC/清理。静态跨目标样本不等于真实 ARM/m68k 硬件验收。
- 镜像准备、包名与本地入口、Windows Kimi、WASM 夹具、网站异步错误、安装文档和日期夹具阻塞均已修复。没有跳过失败检查；早期的失败、排队和 pending 描述保留在下方历史记录中，不再表示当前交付状态。

`engine-metadata.json` 的资格字段绑定上述固定提交及代码树；后续文档或代码提交不能仅凭该字段继承完整资格，必须读取自己提交的检查结果。正式发行、商用引擎和设备验证是独立关口，不能从本次源码资格推断。

### 下一阶段接手

从最新 main 开始，先读 AGENTS.md、本记录、[研发路线](../roadmap.md)、[测试指南](../testing.md)和 Issues #8/#9/#21。优先完成新增 6.8 命令的人类帮助与中文使用说明，机器工具名、参数、JSON/MCP 协议保持稳定；继续推进独立版本与发行工程准备，但保留 `private:true`、本地注册、源码更新拒绝和发布保护。

未具备的授权 Hopper/IDA/JEB 实例、ADB 设备、选定 Frida 实机目标及 Linux active Electron 归属/清理边界仍需实测。不把它们写成已验证，不安装到用户个人电脑，不自动发布 npm/MCP Registry/Release，也不新增计划任务。

## 历史：来源与状态（2026-10-26）

已验收主线基线为 `feefdd595422f7a450f363c1f50a8f3e625aa0d9`，内核 REA 6.7.0 `27dc42d10249f0410904a75c0997842eb03b931c`。上一轮 19,179 通过、170 跳过以及真实提供方记录仅适用于 6.7.0，见[历史记录](rea-6.7.0-integration.md)。

本次固定正式标签 `rea-agents-6.8.0`（2026-10-25），提交 `160d821ac9a0310afcb8d1fc427862dd6508add5`。核实当日上游 main 已继续前进至 `a174892e3e52b58e74df5b9f53ba4d0e0617177c`；标签之后的开发提交不在本次集成范围。源码已迁入更新分支，尚未获得当前提交完整 CI 资格，不能宣布正式发行或所有引擎已验证。

`tekvro` / `io.github.forcemind/tekvro`、本地注册、旧配置兼容、`TEKVRO_LANG`、中文帮助、MIT 告知、`private:true`、源码更新拒绝及发布保护保留。产品包仍为 6.1.0 兼容标记；该数字不表示内核来源。没有新增定时任务、npm/MCP Registry 或正式 Release 发布。

## 迁移范围

- 同步正式标签的 src、bridge、native、测试、依赖锁、构建和 CI 分流；用 6.7.0 固定源码作三方比较，保留 Tekvro 定制。
- 迁入 Agent environment 的构建、证据约束状态与服务工作流；不自动启动服务或访问第三方目标。
- 扩展 GPU code object、BEAM、CPython pyc、Unity IL2CPP、Godot PCK、PyInstaller、Node SEA、模型文件、devicetree、PE/ELF 表等格式检查。
- 迁入 retained summary、指定事实查询、分页、源码恢复资源控制及按行 CLI 导出。
- 保留主线 CI 大规模 changed-path 文件传输与空输入拒绝，不退回超长环境变量。
- 保留 Tekvro 网站及发布工作流，不套用上游推广站点、计划任务或公开发行权限。实验目录和历史上游发行贡献清单不作为产品功能复制。

## 兼容性变化

| 入口                 | 调整与迁移方式                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| Node.js              | 要求 `^22.23.4`、`^24.22.1` 或 `>=26.12.1`；开发固定 24.22.1，Node 23/25 不支持                  |
| MCP analyze_function | 默认返回 retained summary；需要原完整内联结果时选 `detail: "complete"`                           |
| CLI JSONL            | 输出集合行及 `$rea: "jsonl/v1"` 元数据记录；消费者必须区分控制记录；完整文档用 JSON              |
| MCP schema           | 默认 compact 广告；完整说明用 `REA_MCP_INPUT_SCHEMA_PROFILE=full`                                |
| Accessibility        | node value 可为数值、布尔、字符串或 null                                                         |
| Frida                | 返回 canonical Evidence；清理错误读取 `normalized_result.cleanup_error`                          |
| 历史存储             | 历史浏览器哈希存储仍可读；新旧表示不能直接证明比较，需重新采集                                   |
| 证据与身份           | Mach-O nullable import、IB decimal UID、reconstruction proof 等按 6.8.0 契约消费，不编造缺失事实 |

完整契约变更以固定上游标签 CHANGELOG 和当前源码为准；静态格式支持不等于恢复原始源码或验证运行时行为。

## 验证与后续关口

本轮更新提交见 [PR #28](https://github.com/ForceMind/Tekvro/pull/28)，源码提交 `8fbf24f27ff6a09414a01a1b7be048a4438acf66`，上传源码树与本地完全一致：`e1fd766649cc131a4771532ebca4de8c23f4f6ca`。恢复环境重建后再次得到同一源码树。

本地环境 Node24.22.1/npm11.9.0：`npm ci`、`build:cached`、`check:fast`、`docs:check`（含许可证和5项 README 一致性测试）通过。全仓库格式检查通过（修复一处 Ghidra 测试断言的换行）。旧配置诊断、本地注册、npx/bunx 来源隔离与发行工作流复测共77通过、2跳过；另有11项H5/JS/Electron双语帮助与源码更新拒绝测试通过。

新增能力及相关边界专项：9个文件中8个通过，共121项通过，1项失败。IL2CPP、模型文件、Python pyc、GPU code objects 的真实CLI/MCP调用，以及environment构建/写入拒绝、CI lane策略均通过。唯一失败为 `releaseArtifactCanary.test.ts`：Work宿主的 `ps -axo ...` 返回 `fatal library error, lookup self`，导致 binary_session 的 Apktool 前置进程归属探针不可用；保留原始失败，不绕过归属检查，不计为通过，交由托管CI重验。当前完整清单为229个MCP工具、175个CLI命令、6个prompts。

已触发[完整PR资格](https://github.com/ForceMind/Tekvro/actions/runs/40309077119)、[普通CI](https://github.com/ForceMind/Tekvro/actions/runs/40309024874)及[核心引擎验收](https://github.com/ForceMind/Tekvro/actions/runs/40309024788)，截至记录时仍进行中。可选提供方标签触发的工作流出现skip/cancel，不计为提供方通过，需在当前提交继续核实触发条件。完整跨平台 CI、H5/WASM/Electron、固定可选提供方必须针对本轮提交重新执行；不能继承历史成功状态。Hopper/IDA/JEB 授权实例、ADB 真实设备和明确 Frida 目标仍未具备；不宣称实机通过。

复现：`npm ci`、`npm run build:cached`、`npm run check:fast`、`npm run docs:check`，以及 `npm run test:focused -- <exact paths>`。本地运行 Turbo 时设置 `TURBO_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1`，关闭可选遥测。平台/引擎工作流按仓库现有资格标签选择；发布保护保持启用。

## 2026-10-27 CI 修复轮

已逐项读取初次托管 CI 失败日志。修复中文文档的五个站外源码链接、发布 CLI 的 Knip 入口声明及无调用的旧资源包装器；修复 Notes Electron 示例的异步错误处理，并为 Tekvro 现有网站加入启动异常报告。网站不含上游的翻译模块/主题切换，测试改为执行实际 DOM 启动失败路径，不引入不存在的产品功能。恢复后的 Notes 示例也重新符合已知答案夹具的部分覆盖事实。

环境导出测试按 `tekvro` 精确包名断言；本地注册测试使用实际选中的入口；Windows 原生组件恢复测试要求同提交 Tekvro 构建。WASM 的两份 import grammar 夹具仅含两个引用，按各自实际源文本核对，其余五份仍验证全部换行查询/片段引用与坐标。Android 缺 Java 的恢复文案明确选中 launcher 和完整 JDK。

缓存策略测试验证 Tekvro 未启用上游自动缓存删除工作流，并允许提供方验收不携带远程缓存凭据；保留已有缓存写权限约束。深度检查另暴露 Python agent harness 在清理失败时丢失主错误，改用现有 `withVerifierCleanup` 保留两者。

本地文档站构建、网站20页/412个本地引用/ZIP验证通过；相关6个文件76项通过、11项平台跳过，另缓存/Windows控制10项通过。已知答案 MCP 在当前 Work 宿主因 `ps -axo ... uid= ...` 返回 `fatal library error, lookup self` 无法运行，未绕过进程归属检查，需由本轮托管 CI 复验。后续完整资格以最新提交结果为准。

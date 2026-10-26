# REA 6.8.0 内核集成记录

## 来源与状态（2026-10-26）

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
| Node.js              | 要求 `^22.23.4                                                                                   |     | ^24.22.1 |     | >=26.12.1`；开发固定 24.22.1，Node23/25 不支持 |
| MCP analyze_function | 默认返回 retained summary；需要原完整内联结果时选 `detail: "complete"`                           |
| CLI JSONL            | 输出集合行及 `$rea: "jsonl/v1"` 元数据记录；消费者必须区分控制记录；完整文档用 JSON              |
| MCP schema           | 默认 compact 广告；完整说明用 `REA_MCP_INPUT_SCHEMA_PROFILE=full`                                |
| Accessibility        | node value 可为数值、布尔、字符串或 null                                                         |
| Frida                | 返回 canonical Evidence；清理错误读取 `normalized_result.cleanup_error`                          |
| 历史存储             | 历史浏览器哈希存储仍可读；新旧表示不能直接证明比较，需重新采集                                   |
| 证据与身份           | Mach-O nullable import、IB decimal UID、reconstruction proof 等按 6.8.0 契约消费，不编造缺失事实 |

完整契约变更以固定上游标签 CHANGELOG 和当前源码为准；静态格式支持不等于恢复原始源码或验证运行时行为。

## 验证与后续关口

本轮实际命令、结果和限制在提交前补入此处。完整跨平台 CI、H5/WASM/Electron、固定可选提供方必须针对本轮提交重新执行；不能继承历史成功状态。Hopper/IDA/JEB 授权实例、ADB 真实设备和明确 Frida 目标仍未具备；不宣称实机通过。

复现：`npm ci`、`npm run build:cached`、`npm run check:fast`、`npm run docs:check`，以及 `npm run test:focused -- <exact paths>`。本地运行 Turbo 时设置 `TURBO_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1`，关闭可选遥测。平台/引擎工作流按仓库现有资格标签选择；发布保护保持启用。

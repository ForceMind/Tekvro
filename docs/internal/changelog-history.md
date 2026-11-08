# Tekvro 变更记录

> 本文件记录 Tekvro 的源码里程碑；原开源项目历史见 [REA 上游](https://github.com/morluto/rea)。源码集成版本不代表公开发行版本。

## 未发行源码 — 2026-10-19

- 基于现有 6.5.0 集成修复双语网站/文档生成阻塞，并通过 [PR #24](https://github.com/ForceMind/Tekvro/pull/24) 将固定 REA 6.7.0 内核接入 CLI/MCP 和共享分析工作流。
- 更新 Evidence/Snapshot 关系覆盖、artifact integrity、历史证据拒绝/重采集、JSONC 重复成员事务、浏览器预算和生命周期证据。
- 接入精确 JavaScript 范围、retained facts 查询/分页、WASM、Electron 和可选提供方更新，扩展中文帮助并保留本地源码 MCP 注册及旧命令兼容。
- 完整资格：19,178 通过、170 跳过、0 失败；真实 H5/WABT/WASM、macOS arm64 Electron 及适用平台包门禁通过。
- [PR #25](https://github.com/ForceMind/Tekvro/pull/25) 增加固定外部工具的真实验收和源码编译的多语言 APK，修复验收脚本的 Java 探针资源归属与 Apktool 3 元数据格式。
- 修复 Java 前置失败到 CLI/MCP 的恢复动作传播，保留原始诊断与生命周期证据；PR #26 通过完整 JSON 制品传输修复大规模升级的 CI 启动限制。
- 产品兼容版本仍为 6.1.0；内核来源、运行记录、复现方法与未验证平台见[集成记录](docs/upstream/rea-6.7.0-integration.md)。保留 private、安装/更新拒绝及发行工作流保护，没有 npm/Registry/正式 Release 发布。

## [6.1.0] - 2026-10-10

- 将经逐文件校验的 REA 6.1.0 快照引入 ForceMind 私有仓库。
- 确立独立产品品牌 **Tekvro（探核）**、中英文首页和简体中文技术入门。
- 将公开发布权限默认禁用，开始隔离上游推广入口与发布身份。
- 保留 MIT 许可证、原作者署名、核心分析功能及第三方子模块。

> `6.1.0` 暂为底层兼容版本标识，不代表 Tekvro 首个公开发行版。后续产品版本独立规划。

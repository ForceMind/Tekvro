# Tekvro 变更记录 · Changelog

## [1.0.0]

Tekvro 首个独立公开版本，通过 GitHub Release 提供可安装的 CLI/MCP 运行包和完整源码归档。

- 提供本地软件静态分析、运行观察、结构化证据查询与制品比较，共用 CLI 和 MCP 工作流。
- 发布含编译运行时的 `tekvro-1.0.0.tgz`、含子模块内容的 `tekvro-1.0.0-source.tar.gz`、`SHA256SUMS` 和 `release-manifest.json`。
- 提供固定版本安装脚本、本地归档安装、环境诊断与独立的配置预览步骤。
- 更新中英文入门、支持范围、安全报告和贡献文档。可选能力仍受宿主、目标格式和已配置工具的约束。
- 产品包保留 `private: true`；本次仅发布 GitHub Release，不上传 npm 注册中心或 MCP Registry。

The first standalone public Tekvro release provides an installable CLI/MCP runtime, complete source, checksums and source identity. Installation and client setup are separate. Supported operations depend on the host, target format and configured tools; this release does not claim that every optional capability has been verified on every platform.

[完整发行说明 / Release notes](docs/releases/v1.0.0.md) · [下载 / Download](https://github.com/ForceMind/Tekvro/releases/tag/v1.0.0)

此前记录按原始字节保存在[历史归档](https://github.com/ForceMind/Tekvro/blob/main/docs/internal/changelog-history.md)。

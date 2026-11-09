# Tekvro · 探核

**用证据看懂软件。**

Tekvro 是本地软件分析工具，通过命令行和 MCP 提供静态分析、运行观察与证据查询。你可以检查应用结构、追踪代码关系、比较软件制品，并把可复核的结果接入自己的工作流。

[English](README.en.md) · [使用文档](docs/index.md) · [快速开始](docs/zh-CN/quick-start.md) · [下载 1.0.0](https://github.com/ForceMind/Tekvro/releases/tag/v1.0.0) · [报告问题](https://github.com/ForceMind/Tekvro/issues/new/choose)

## 能力

- **应用结构分析**：检查 JavaScript 构建目录和桌面应用包，追踪模块、依赖、调用线索与源码映射。
- **运行观察**：通过本地调试接口检查脚本、网络活动及选定的运行时行为。
- **程序与文件检查**：分析支持的原生程序、移动应用、托管程序、数据库和其他离线制品。
- **证据与比较**：保留来源、位置、覆盖范围和局限，区分观察、推断与未知，支持后续查询与版本比较。
- **CLI 与 MCP**：两种入口共用分析工作流，既可直接调用，也可集成到兼容 MCP 的客户端。

具体能力取决于目标格式、宿主系统和已配置的可选分析工具。查看[使用指南](docs/index.md)与本机 `tekvro capabilities --json` 获取对应范围。

## 安装

运行环境为 Node.js `^22.23.4 || ^24.22.1 || >=26.12.1` 和 npm，推荐 Node.js `24.22.1`。

macOS / Linux：

```bash
curl -fsSL https://raw.githubusercontent.com/ForceMind/Tekvro/v1.0.0/install.sh -o install-tekvro.sh
bash install-tekvro.sh --version 1.0.0
```

Linux 脚本默认安装到 `$HOME/.local/bin`。若当前终端找不到命令，运行 `export PATH="$HOME/.local/bin:$PATH"`；自定义 `--prefix DIR` 时将 `DIR/bin` 加入 `PATH`。安装器会打印实际路径，不会修改 shell 配置。

也可以从[发行页](https://github.com/ForceMind/Tekvro/releases/tag/v1.0.0)下载 `tekvro-1.0.0.tgz`，按[分发说明](docs/zh-CN/distribution.md)校验后安装：

```bash
npm install --global ./tekvro-1.0.0.tgz
tekvro --version
```

Windows 使用下载归档的安装方式。1.0.0 通过 GitHub Release 分发，npm 注册中心及 MCP 目录不属于本次发布范围。

## 开始使用

```bash
# 检查环境与当前可用能力
tekvro doctor --json
tekvro capabilities --json

# 分析本地应用构建目录，并保存结构化证据
tekvro analyze-javascript-application /absolute/path/to/app --json > evidence.json
```

将示例路径替换为有权检查的本地目录。更多示例见[快速开始](docs/zh-CN/quick-start.md)和[应用分析指南](docs/zh-CN/javascript-h5-electron.md)。

## MCP 配置

先查看配置计划，再应用选定的客户端设置：

```bash
tekvro setup --dry-run
tekvro setup
```

配置由独立的 `setup` 步骤管理。运行时请检查显示的变更及备份信息，完成后重新连接客户端。需要中文帮助时，可设置 `TEKVRO_LANG=zh-CN`；命令、JSON 字段和 MCP 协议保持不变。

[配置适配器](docs/installation.md#supported-agents) · [分发渠道状态](docs/installation.md#mcp-registry) · [MCP 工具目录](docs/mcp-contracts.md#generated-catalog)

## 支持与贡献

CLI 与 MCP 提供 Windows、macOS 和 Linux 入口，各项能力的系统依赖与验证范围见[文档](docs/index.md)。分析结果会明确标注未观察或不支持的部分；客户端制品的分析不能证明未观察到的服务端实现。

- 使用问题与缺陷：[Issue 模板](https://github.com/ForceMind/Tekvro/issues/new/choose)
- 开发与测试：[贡献指南](CONTRIBUTING.md) · [测试指南](docs/testing.md)
- 安全问题：[安全报告说明](SECURITY.md)
- 版本与更新：[发行页](https://github.com/ForceMind/Tekvro/releases) · [更新说明](docs/zh-CN/distribution.md)
- 产品演进：[维护路线](docs/roadmap.md) · [项目工作流实施规划](docs/project-workflow-plan.md)（新增能力尚未实现）

## 许可证

Tekvro 使用 [MIT 许可证](LICENSE)。组件的版权和授权说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

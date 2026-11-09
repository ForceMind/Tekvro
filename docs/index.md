---
layout: home

hero:
  name: Tekvro · 探核
  text: 用证据看懂软件
  tagline: 通过 CLI 与 MCP 检查软件结构、观察运行行为，并保留可复核的分析证据。
  actions:
    - theme: brand
      text: 开始使用
      link: /zh-CN/quick-start
    - theme: alt
      text: 下载 1.0.0
      link: https://github.com/ForceMind/Tekvro/releases/tag/v1.0.0

features:
  - title: 本地分析
    details: 从本地文件和应用制品开始，按任务选择静态检查或运行观察。
    link: /zh-CN/quick-start
  - title: 证据可追溯
    details: 报告包含来源、位置、覆盖范围和局限，区分观察、推断与未知。
    link: /mcp-contracts
  - title: CLI 与 MCP
    details: 两种入口共用分析工作流，支持直接调用和兼容客户端集成。
    link: /installation
  - title: 逐步深入
    details: 从应用目录分析开始，再按需配置专用工具与高级工作流。
    link: /zh-CN/javascript-h5-electron
---

## 安装与第一次分析

准备 Node.js `24.22.1` 和 npm，在 macOS / Linux 中安装：

```bash
curl -fsSL https://raw.githubusercontent.com/ForceMind/Tekvro/v1.0.0/install.sh -o install-tekvro.sh
bash install-tekvro.sh --version 1.0.0
tekvro doctor --json
```

Windows 和手动安装方式见[快速开始](zh-CN/quick-start.md)。版本 1.0.0 通过 GitHub Release 分发，下载、校验与更新方法见[分发说明](zh-CN/distribution.md)。

## 按任务选择指南

| 任务                       | 入口                                        |
| -------------------------- | ------------------------------------------- |
| 安装、环境检查与首次分析   | [快速开始](zh-CN/quick-start.md)            |
| 分析网页构建与桌面应用     | [应用分析](zh-CN/javascript-h5-electron.md) |
| 检查录制的网络与信号数据   | [离线录制数据](zh-CN/offline-captures.md)   |
| 检查数据库、模块和静态文件 | [静态格式](zh-CN/static-formats.md)         |
| 查询工具、参数和证据契约   | [CLI](cli.md) · [MCP](mcp-contracts.md)     |
| 配置客户端与可选分析工具   | [安装与配置](installation.md)               |
| 排查能力不可用或报告未知   | [常见问题](zh-CN/faq.md)                    |

## 开发与支持

[项目架构](zh-CN/architecture.md) · [测试与验证](testing.md) · [贡献指南](https://github.com/ForceMind/Tekvro/blob/main/CONTRIBUTING.md) · [问题反馈](https://github.com/ForceMind/Tekvro/issues/new/choose) · [安全说明](zh-CN/security.md) · [维护路线](roadmap.md)

项目工作流与本地工作台已形成实施规划：[完整设计](project-workflow-design.md) · [阶段与工作包](project-workflow-plan.md) · [验收矩阵](project-workflow-acceptance.md)。这些新增能力尚未实现，不属于 1.0.0 的已交付范围。

代码许可与组件告知见 [LICENSE](https://github.com/ForceMind/Tekvro/blob/main/LICENSE) 和 [THIRD_PARTY_NOTICES.md](https://github.com/ForceMind/Tekvro/blob/main/THIRD_PARTY_NOTICES.md)。

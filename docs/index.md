---
layout: home

hero:
  name: Tekvro · 探核
  text: 用证据看懂软件
  tagline: 本地优先的 AI 软件分析工具，连接 MCP、CLI、专业逆向引擎和运行时证据。
  actions:
    - theme: brand
      text: 开始使用
      link: /zh-CN/quick-start
    - theme: alt
      text: 查看源码
      link: https://github.com/ForceMind/Tekvro

features:
  - title: AI 协作分析
    details: 将二进制文件、打包应用和运行时的分析能力交给 Codex 等 Agent 调用。
    link: /zh-CN/architecture
  - title: 证据驱动
    details: 区分已观察事实、由证据推断的解释与尚不确定的内容。
    link: /mcp-contracts
  - title: 中文入门
    details: 提供中文部署、CLI、MCP、安全和维护说明；高级技术资料逐步翻译。
    link: /zh-CN/quick-start
---

## 本地构建

```bash
git clone https://github.com/ForceMind/Tekvro.git
cd Tekvro
git submodule update --init --recursive
npm ci
npm run build:cached
node scripts/rea.mjs --help
```

目前未发布 Tekvro npm 包。此仓库仍有少量兼容用的 REA 内部标识；**请从仓库本地构建运行**，不要误将公开 `rea-agents` 包视为此版本。

继续阅读 [中文快速上手](./zh-CN/quick-start.md)、[架构](./zh-CN/architecture.md)与[安全](./zh-CN/security.md)。

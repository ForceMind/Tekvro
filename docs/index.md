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
  - title: H5 / JavaScript / Electron
    details: 从静态制品开始，按需结合本地浏览器与 Electron 被动观察，形成可复核分析证据。
    link: /zh-CN/javascript-h5-electron
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

当前源码包名已更新为 `tekvro`，但**尚未发布 Tekvro npm/MCP Registry 包**。旧 REA 命令和 MCP 客户端注册键仍用于兼容；请从本仓库源码构建，不要误用公开 `rea-agents` 包。详见[发行身份与兼容策略](zh-CN/distribution.md)。

继续阅读 [中文快速上手](./zh-CN/quick-start.md)、[H5/JavaScript/Electron 分析](./zh-CN/javascript-h5-electron.md)、[抓包与信号录制](./zh-CN/offline-captures.md)、[架构](./zh-CN/architecture.md)、[REA 6.4 → 6.5 内核升级方案](./zh-CN/rea-6.5.0-upgrade-addendum.md)与[安全](./zh-CN/security.md)。

# Tekvro / 探核：中文快速开始

[返回首页](../../README.md) · [架构](architecture.md) · [安全](security.md)

## 1. 准备环境

- Node.js：`^22.19.0 || ^24.11.0 || >=26.0.0`，检查 `node -v`。
- npm：与 `package-lock.json` 兼容的版本。
- Git：用于拉取私有代码及子模块。
- Ghidra、Hopper、IDA、JADX 等为**可选**，仅在你实际需要的分析任务中配置；静态 JavaScript 目录分析无需先安装反编译器。

## 2. 克隆与构建

```bash
git clone https://github.com/ForceMind/Tekvro.git
cd Tekvro
git submodule update --init --recursive
npm ci
npm run build:cached
```

**重要：** 此命令从 ForceMind 私有仓库运行。公开 npm 上 `rea-agents` 的 `npx` 命令会下载原项目版本，不是本仓库的 Tekvro 定制代码。

## 3. 尝试只读分析

```bash
node scripts/rea.mjs --help
node scripts/rea.mjs capabilities --json
node scripts/rea.mjs analyze-javascript-application /absolute/path/to/js-app --json
```

请将路径换成你拥有分析权限的本地目标，尽量用不含密钥与用户数据的样本。结果包含文件、结构、观察、推断与局限。

## 4. 配置 Codex MCP

```bash
node scripts/rea.mjs doctor --client codex --json
node scripts/rea.mjs setup --client codex --dry-run --json
TEKVRO_LANG=zh-CN node scripts/rea.mjs setup --client codex
```

第三条命令会交互式请求你的许可，写入本机 Agent 配置，故不能把只读 doctor 的成功当成配置已完成。完成后重启 Agent 并检查 MCP 工具是否可用。

## 5. 开发检查

```bash
npm run metadata:check
npm run check:fast
npm run test:fast
npm run docs:build
```

这些是建议执行的命令，不代表当前环境已通过它们。原生真实工具链、平台和浏览器测试分别有各自依赖要求。

## 6. 已知兼容边界

内部旧命令 `rea`、内部 npm `rea-agents`、MCP key `rea` 暂时保留；Tekvro 目前**未正式发行**。后续会建立兼容迁移、发布及品牌独立性验证。高级英文技术资料仍可从 [文档导航](../index.md) 找到。

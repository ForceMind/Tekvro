# Tekvro（探核）独立发行身份与兼容策略

> **开发中，尚未正式发布 npm / MCP Registry。** 当前公开的是 GitHub 源码；`package.json` 仍为 `"private": true`。本文描述源码工程中的分发元数据，不代表已注册或上架的包。

## 当前身份

| 项目 | 当前源码值 | 是否已公开发行 |
| --- | --- | --- |
| GitHub | [ForceMind/Tekvro](https://github.com/ForceMind/Tekvro) | 是，公开源码 |
| npm 包声明 | `tekvro` | **否**，不可按已发布包使用 |
| MCP Registry 草案 | `io.github.forcemind/tekvro` | **否**，未登记 |
| CLI 首选入口 | `tekvro` | 源码构建／本地打包使用 |
| 兼容 CLI 入口 | `rea`、`rea-agents` | 保留原命令 |
| MCP 客户端注册键 | `rea` | 保留现有客户端配置 |
| 现有版本字段 | `6.1.0` | 来自既有引擎基线，**不是 Tekvro 已发布版本** |
| 许可证 | 原 MIT 与其他第三方授权 | 必须保留版权与授权告知 |

## 如何运行

请从 GitHub 获取代码，安装依赖并构建：

```bash
git clone https://github.com/ForceMind/Tekvro.git
cd Tekvro
git submodule update --init --recursive
npm ci
npm run build:cached
node scripts/rea.mjs doctor --json
```

`scripts/rea.mjs` 的文件名目前仍沿用已有入口；从本地安装的发行包会保留 `tekvro` 命令与旧命令别名。**不要运行 `npx tekvro@latest` 来试图安装本项目，独立版本尚未发布。**

## 旧版注册如何处理

- 对既有 `rea` MCP 配置键不强制重命名，以免丢失用户已有的 Codex、Claude、Cursor、OpenCode 等配置。
- 旧的 `npx -y rea-agents@版本 mcp` 仅作为迁移时的**已有配置**识别；新安装一律写入本地 `node + Tekvro CLI 绝对路径 + mcp`，不会自动调用原 npm 包。
- 保留用户的第三方 Agent 配置及备份；先 dry-run 检查，然后再选择应用更改。
- 私有源码模式的 `update` 禁止使用原项目 npm 自动更新路径。

## 发布前必须完成

1. 通过 GitHub CI 的类型检查、文档、四组测试、打包和 Linux/macOS/Windows 安装验证。
2. 确认 npm 名称所有权与 MCP Registry 命名规则及仓库归属；这两项**尚未验证**，不能提前声称已占用或已发布。
3. 修订仍指向旧包的 `install.sh`、旧版技术文档和发布验证脚本；**不得**借旧脚本向用户分发原 npm 包。
4. 创建独立的 Tekvro 发布版本体系及签名/Provenance 验证；当前 `6.1.0` 来源于引擎历史，不直接用作首个正式 Tekvro 版本声明。
5. 在所有完成前保持 `"private": true` 及上游 Release 工作流保护，不修改旧仓库的发行权限。

## 来源与许可证

Tekvro 使用原项目中依 MIT 授权的代码并继续维护；见 [LICENSE](../../LICENSE) 和 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)。品牌独立并不意味着将原有源码重新声明为完全原创。

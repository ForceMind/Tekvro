# Tekvro（探核）独立发行身份与兼容策略

> **开发中，尚未正式发布 npm / MCP Registry。** 当前公开的是 GitHub 源码；`package.json` 仍为 `"private": true`。本文描述源码工程中的分发元数据，不代表已注册或上架的包。

## 当前身份

| 项目              | 当前源码值                                                       | 是否已公开发行                             |
| ----------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| GitHub            | [ForceMind/Tekvro](https://github.com/ForceMind/Tekvro)          | 是，公开源码                               |
| npm 包声明        | `tekvro`                                                         | **否**，不可按已发布包使用                 |
| MCP Registry 草案 | `io.github.forcemind/tekvro`                                     | **否**，未登记                             |
| CLI 首选入口      | `tekvro`                                                         | 源码构建／本地打包使用                     |
| 兼容 CLI 入口     | `rea`、`rea-agents`                                              | 保留原命令                                 |
| MCP 客户端注册键  | `rea`                                                            | 保留现有客户端配置                         |
| 产品包兼容版本    | `6.1.0`                                                          | 保留的兼容标记，**不是 Tekvro 已发布版本** |
| 当前内核来源      | REA `6.8.0`，固定提交 `160d821ac9a0310afcb8d1fc427862dd6508add5` | 已集成源码，**不是独立发行包**             |
| 许可证            | 原 MIT 与其他第三方授权                                          | 必须保留版权与授权告知                     |

产品包版本与内核来源分别管理：`node scripts/rea.mjs --version --json` 报告产品包版本；仓库根目录的 `engine-metadata.json` 记录固定内核来源、已验收源提交和代码树。实际运行范围与复现方法见 [6.8 集成记录](../upstream/rea-6.8.0-integration.md)。该元数据不自动赋予后续修改完整资格，当前提交仍需通过相关 CI；不能从版本号推导所有平台或可选引擎均已验证。

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
- 旧的 `npx -y rea-agents@版本 mcp` 仅作为迁移时的**已有配置**识别；新安装写入本地 Tekvro CLI 绝对路径（Windows 使用 Node.js 启动脚本），不会自动调用原 npm 包。
- 保留用户的第三方 Agent 配置及备份；先 dry-run 检查，然后再选择应用更改。
- 私有源码模式的 `update` 禁止使用原项目 npm 自动更新路径。

## 发布前必须完成

1. 通过当前提交的类型检查、文档、相关自动化测试、打包和 Linux/macOS/Windows 适用平台验证。真实引擎按[测试指南](../testing.md)的对应通道验收，包启动成功不能替代真实引擎验证。
2. 确认 npm 名称所有权与 MCP Registry 命名规则及仓库归属；这两项**尚未验证**，不能提前声称已占用或已发布。
3. `install.sh` 在 Tekvro 发布前**始终拒绝安装**，不会下载 npm 包、不会访问原项目；`scripts/verify-published-package.mjs` 也会在包声明 `private: true` 时提前停止。独立安装器与发布验证流程需在正式版本上线前完整重新验收。
4. 创建独立的 Tekvro 发布版本体系及签名/Provenance 验证；当前 `6.1.0` 来源于引擎历史，不直接用作首个正式 Tekvro 版本声明。
5. 在所有完成前保持 `"private": true` 及上游 Release 工作流保护，不修改旧仓库的发行权限。

## 来源与许可证

Tekvro 使用原项目中依 MIT 授权的代码并继续维护；见 [LICENSE](https://github.com/ForceMind/Tekvro/blob/main/LICENSE) 和 [THIRD_PARTY_NOTICES.md](https://github.com/ForceMind/Tekvro/blob/main/THIRD_PARTY_NOTICES.md)。品牌独立并不意味着将原有源码重新声明为完全原创。

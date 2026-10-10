# ForceMind / Tekvro（探核）维护与开发说明

> 本仓库是 ForceMind 维护的 Tekvro（探核）独立研发项目，并非 REA 官方项目。源项目为 [morluto/rea](https://github.com/morluto/rea)，采用 MIT 许可证。请保留原作者署名、许可证及原始出处。

## 源码基线

- 原始输入：`rea-main.zip`（2,318 个实际源码文件）。
- 对应上游提交：[`f6fe575094658e99ced78d45f385633fbfaaae32`](https://github.com/morluto/rea/commit/f6fe575094658e99ced78d45f385633fbfaaae32)。
- 导入版本：`rea-agents@6.1.0`，不是上游现在的最新版本。
- 已逐文件核验路径与 Git blob SHA-1，并对排序清单计算 SHA-256：`c1d61fce26e43e373ff10d66e91d76e8b18eb1a0a659537bcf6e4fcd554e2480`。
- 已恢复 5 个 Git 子模块引用；ZIP 不含原始 `.git` 历史，本仓库通过精确上游 SHA 保留溯源线索，未伪称已原样迁移所有上游提交历史。
- 本文档及发布工作流的仓库身份保护是 ForceMind 自有改动。项目源码保持与原始 ZIP 一致。

## 项目目录

| 目录                 | 用途                                     |
| -------------------- | ---------------------------------------- |
| `src/`               | 核心 TypeScript、CLI、MCP 服务及分析适配 |
| `bridge/`            | Ghidra、Hopper、LLDB、JADX、浏览器等桥接 |
| `tests/`             | 测试与契约、一致性、边界验证             |
| `docs/`              | 架构决策、集成和使用文档                 |
| `scripts/`           | 构建、代码质量、验证及发布脚本           |
| `third_party/`       | 第三方资源与 Git submodule               |
| `website/`           | 网站及示例                               |
| `.github/workflows/` | CI、实机验证和发布工作流                 |

## 开发起步

Node.js 版本按 `package.json` 要求：`^22.19.0 || ^24.11.0 || >=26.0.0`。

```bash
git clone https://github.com/ForceMind/Tekvro.git
cd Tekvro
git submodule update --init --recursive
npm ci
npm run build
npm run check:fast
npm run test:fast
```

完整项目规范请看 `README.md`、`CONTRIBUTING.md`、`AGENTS.md` 和 `package.json`。部分深度验证依赖专业反汇编工具、操作系统与外部运行环境，不可把“未执行”写成“测试通过”。

## 后续维护约定

- `main` 保存可复现、可审查的稳定基线；新功能及修复在 `feat/*`、`fix/*` 分支开发，经 PR 和 CI 评审后合并。
- 以 `sync/upstream-YYYYMMDD` 分支审查上游变更，未经确认不自动升级。
- 上游地址：`git remote add upstream https://github.com/morluto/rea.git`，随后 `git fetch upstream --tags`，再检查 `git diff f6fe575094658e99ced78d45f385633fbfaaae32..upstream/main`。由于当前采用源码快照导入，两边历史并非快进关系；需审查并逐项移植更新。
- 避免提交私钥、API Key、Token、环境变量文件、分析样本中的私密信息及构建产物。遵循原 MIT 协议和第三方组件授权。

## CI 与发布保护

- 保留原项目核心 CI 和各平台验证工作流。
- `release.yml` 及 `website-pages.yml` 增加官方仓库 `morluto/rea` 限定，防止 ForceMind 私有研发仓库误向原 npm/MCP Registry 身份发布，或触及上游网站。
- 未来若需独立发布，请先明确自己的 npm 包名、MCP 标识、域名、密钥与发布审批，再设计独立工作流。
- 目前完成的是代码导入、静态核验及项目结构整理，并未完成所有平台的构建/测试。

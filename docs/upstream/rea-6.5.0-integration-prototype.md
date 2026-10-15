# REA 6.5.0 → Tekvro 引擎集成原型

> **开发分支，仅用于功能移植与回归。未经 CI 验证不得合并至 main 或发布。**

- 锁定上游：`rea-agents-6.5.0`，commit `3b79af28e80785afce9f5998d8f03289402a1847`。
- 引入目录：`src/`、`bridge/`、`scripts/`、`tests/`、`native/`；使用对应的编译与测试配置。
- 仅保留研究所需的 `licenses/` 文件；保留 Tekvro 的 `README`、`docs`、`website`、`LICENSE`、`THIRD_PARTY_NOTICES.md`、`.github/workflows`、`install.sh`、`server.json` 与子模块指针。
- 保留 npm 包名 `tekvro`、`private:true`、独立 MCP 名称、`TEKVRO_LANG` 源码及原有中文 CLI 边界测试（必须通过才可合并）。
- 添加开发版 `update` 拒绝逻辑，将新 MCP 注册路径指定为当前 Node + 本地 CLI，避免误安装上游 npm 包。
- 产品版本字段仍沿用 Tekvro 原有 `6.1.0`，不将源代码迁移直接声称为 Tekvro 正式发行 6.5.0。
- 该原型可能存在 CLI 中文翻译和新旧构建检查不兼容，须先跑构建、专项测试并修复后才能合并。

## 自动化验证结果

由实际运行该分支验证作业后追加，未执行的项目不得标记为通过。

### 实际执行于 GitHub Actions Ubuntu 24.04 / Node 24.18.0 / npm 11.16.0

- `npm ci`: **通过**
- `npm run build:cached`: **通过**
- `npm run check:fast`: **通过**
- `node scripts/rea.mjs --help`: **通过**
- `node scripts/rea.mjs capabilities --json`: **通过**
- `npm run test:fast`: **失败（exit 1）**，需在后续提交中处理；日志见 GitHub Actions 原始记录

> 未运行的测试不等于成功。本记录只代表实际执行命令结果。

### 后续集成复测（补齐上游 experiments + 调整 Tekvro 兼容测试）
- `npm run test:fast`: **失败（exit 1）**，日志保留到本次 workflow artifact
- `npm run test:focused -- tests/boundary/cli/localizedJavaScriptHelp.test.ts`: **失败（exit 1）**，日志保留到本次 workflow artifact

### 合并前迭代 3：新版引擎与 Tekvro 中文帮助
- `npm run build:cached`: **通过**
- `npm run check:fast`: **通过**
- `npm run test:fast`: **通过**
- `npm run test:focused -- tests/boundary/cli/localizedJavaScriptHelp.test.ts`: **通过**
- `npm run format:check`: **失败（exit 1）**，本次日志随 Actions 附件保留
- `node scripts/rea.mjs update --json`: **失败（exit 1）**，本次日志随 Actions 附件保留

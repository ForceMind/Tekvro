# REA 6.5.0 原版源码基线构建与测试

- 固定 tag：`rea-agents-6.5.0`
- 上游 commit：`3b79af28e80785afce9f5998d8f03289402a1847`
- 环境：GitHub Actions `ubuntu-24.04` / Node 24.18.0 / npm 11.16.0
- 上游 Git submodule：`git submodule update --init --recursive --depth 1` 成功
- `npm ci`：通过
- `npm run build:cached`：通过
- `npm run check:fast`：通过
- `npm run test:fast`：通过
- `node scripts/rea.mjs --help`、`capabilities --json`：通过
- 该结果仅验证**上游原版 6.5.0**，不是 Tekvro 代码集成与跨平台/真实引擎验证。

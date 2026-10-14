# REA 6.4.0 源码复制与第一轮文件审计

> 自动生成的文件差异证据，不代表构建或功能验收。

## 固定来源

- 仓库：https://github.com/morluto/rea
- Tag：`rea-agents-6.4.0`
- Commit：`a56f7bb668ab23fec8d33f7af353ac7ed2fe1895`
- Tekvro 原始引擎来源：`f6fe575094658e99ced78d45f385633fbfaaae32`（REA 6.1.0）
- 复制路径：`upstream/rea-6.4.0/`。不对原版源码进行改写。
- 只复制 Git 跟踪的源文件；下方列出的子模块 gitlink 未包含其仓库内容。
- Tekvro 现有源码和独立产品身份未被覆盖。

## 与 Tekvro 的文件对照

| 项目 | 数量 |
| --- | ---: |
| 上游快照文件/软链接 | 2667 |
| Tekvro 已跟踪且可读取的文件 | 2322 |
| 重名且字节相同 | 889 |
| 重名但内容不同 | 1352 |
| 仅上游存在 | 426 |
| 仅 Tekvro 存在 | 81 |
| 上游子模块链接 | 5 |

### 仅上游新增文件较多的目录

| 目录 | 文件数 |
| --- | ---: |
| `tests/boundary/` | 79 |
| `src/domain/` | 52 |
| `scripts/` | 48 |
| `src/application/` | 30 |
| `tests/acceptance/` | 18 |
| `tests/fixtures/` | 17 |
| `src/artifacts/` | 14 |
| `tests/conformance/` | 11 |
| `src/process/` | 10 |
| `website/` | 10 |
| `.agents/` | 9 |
| `src/contracts/` | 9 |
| `src/ghidra/` | 8 |
| `src/adb/` | 7 |
| `src/javascript/` | 7 |
| `src/native/` | 7 |
| `src/server/` | 7 |
| `src/apktool/` | 6 |
| `src/browser/` | 6 |
| `src/filesystem/` | 5 |
| `src/jeb/` | 5 |
| `tests/support/` | 5 |
| `bridge/nativeaot/` | 4 |
| `src/composition/` | 4 |
| `src/cli/` | 3 |

### 双方重名但已改动文件较多的目录

| 目录 | 文件数 |
| --- | ---: |
| `src/domain/` | 260 |
| `tests/boundary/` | 234 |
| `src/application/` | 170 |
| `scripts/` | 103 |
| `src/browser/` | 60 |
| `src/server/` | 59 |
| `src/contracts/` | 43 |
| `src/cli/` | 31 |
| `src/artifacts/` | 29 |
| `src/ghidra/` | 27 |
| `src/process/` | 26 |
| `tests/fixtures/` | 25 |
| `website/` | 25 |
| `src/native/` | 21 |
| `src/dotnet/` | 19 |
| `tests/composition/` | 19 |
| `.github/` | 16 |
| `tests/conformance/` | 16 |
| `src/hopper/` | 14 |
| `src/javascript/` | 11 |
| `tests/acceptance/` | 9 |
| `src/composition/` | 7 |
| `src/ida/` | 7 |
| `src/reference/` | 6 |
| `native/` | 5 |

## 需要进一步人工研究的功能入口

- `src/adb/`：存在
- `src/apktool/`：存在
- `src/jeb/`：存在
- `src/filesystem/`：存在
- `docs/migration-6.2.md`：存在
- `docs/adb-device-analysis.md`：存在
- `docs/jeb-analysis.md`：存在
- `docs/apktool-resource-analysis.md`：存在
- `src/domain/evidence.ts`：存在
- `src/contracts/`：存在
- `src/javascript/`：存在
- `src/browser/`：存在
- `src/ghidra/`：存在
- `src/server/`：存在

## 部分重名但改动的重点文件

- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/pull_request_template.md`
- `.github/workflows/ci.yml`
- `.github/workflows/nativeaot-fixtures.yml`
- `.github/workflows/real-binary-layout.yml`
- `.github/workflows/real-browser.yml`
- `.github/workflows/real-evm-interface.yml`
- `.github/workflows/real-ghidra-windows.yml`
- `.github/workflows/real-javascript-recovery.yml`
- `.github/workflows/real-recorded-crash.yml`
- `.github/workflows/real-web-network-captures.yml`
- `.github/workflows/real-web-runtime.yml`
- `.github/workflows/real-web-source-map.yml`
- `.github/workflows/release.yml`
- `.github/workflows/website-check.yml`
- `.github/workflows/website-pages.yml`
- `bridge/ghidra/ReaGhidraBridge.java`
- `bridge/hopper_bridge.py`
- `package-lock.json`
- `package.json`
- `scripts/build-ghidra-nativeaot.mjs`
- `scripts/build-windows-native.mjs`
- `scripts/clean-build-output.mjs`
- `scripts/create-ghidra-windows-fixture.mjs`
- `scripts/fixtures/browser-verifier-site.mjs`
- `scripts/generate-mcp-tool-catalog.mjs`
- `scripts/generate-package-metadata.mjs`
- `scripts/generate-skill-metadata.mjs`
- `scripts/lib/artifact-e2e.mjs`
- `scripts/lib/browser-dom-destinations-e2e.mjs`
- `scripts/lib/browser-module-e2e.mjs`
- `scripts/lib/browser-network-e2e.mjs`
- `scripts/lib/browser-popup-e2e.mjs`
- `scripts/lib/browser-runtime-e2e.mjs`
- `scripts/lib/browser-runtime-fixture-lifecycle.mjs`
- `scripts/lib/browser-scenario-verifier.mjs`
- `scripts/lib/browser-screenshot-e2e.mjs`
- `scripts/lib/browser-script-export-e2e.mjs`
- `scripts/lib/browser-source-map-e2e.mjs`
- `scripts/lib/browser-verifier-assertions.mjs`
- `scripts/lib/catalog-builders.mjs`
- `scripts/lib/catalog-core.mjs`
- `scripts/lib/development-tests.d.mts`
- `scripts/lib/development-tests.mjs`
- `scripts/lib/docs-facts.mjs`
- `scripts/lib/ghidra-reference-snapshot-e2e.mjs`
- `scripts/lib/mcp-startup-probe.mjs`
- `scripts/lib/mcp-verifier-results.mjs`
- `scripts/lib/module-boundaries.mjs`
- `scripts/lib/native-value-e2e.mjs`
- `scripts/lib/product-catalog.d.mts`
- `scripts/lib/product-catalog.mjs`
- `scripts/lib/real-ghidra-address-boundaries.mjs`
- `scripts/lib/real-ghidra-boundaries.mjs`
- `scripts/lib/real-ghidra-entry-aliases.mjs`
- `scripts/lib/real-ghidra-large-results.mjs`
- `scripts/lib/real-ghidra-namespace-annotations.mjs`
- `scripts/lib/real-ghidra-snapshot-lifecycle.mjs`
- `scripts/lib/real-hopper-boundaries.mjs`
- `scripts/lib/real-hopper-function-basics.mjs`
- `scripts/lib/real-hopper-inventory.mjs`
- `scripts/lib/real-hopper-navigation.mjs`
- `scripts/lib/real-hopper-selection.mjs`
- `scripts/lib/real-hopper-semantic.mjs`
- `scripts/lib/release-checkpoint.mjs`
- `scripts/lib/verify-package-core.mjs`
- `scripts/prepare-website.py`
- `scripts/rea.mjs`
- `scripts/run-development-tests.mjs`
- `scripts/run-exclusive.mjs`
- `scripts/verify-agent-experience.mjs`
- `scripts/verify-binary-layout.mjs`
- `scripts/verify-evm-interface.mjs`
- `scripts/verify-mcp-registry-metadata.mjs`
- `scripts/verify-native-calls.mjs`
- `scripts/verify-native-ui.mjs`
- `scripts/verify-package-capabilities.mjs`
- `scripts/verify-package-environment.mjs`
- `scripts/verify-package-install.mjs`
- `scripts/verify-package-managed.mjs`
- `scripts/verify-package-mcp.mjs`
- `scripts/verify-package-pack.mjs`
- `scripts/verify-package-setup.mjs`
- `scripts/verify-package-update.mjs`
- `scripts/verify-package.mjs`
- `scripts/verify-packaged-ghidra-windows.mjs`
- `scripts/verify-published-package.mjs`
- `scripts/verify-real-browser.mjs`
- `scripts/verify-real-electron.mjs`
- `scripts/verify-real-ghidra-assertions.mjs`

## 子模块链接（尚未复制实际子模块内容）

- `third_party/binwalk` at `4fdab3d464d97b68e0af9088df3f9e2e1545b21c`
- `third_party/ghidra-nativeaot` at `effeb734fc570c32650f88b159608979dc7b423e`
- `third_party/jadx-headless-mcp` at `5844800a486d2248fa949b74c9896285f5b54de2`
- `third_party/unblob` at `1fcc7a0a584a70a96c31f5a276c20944d199a089`
- `third_party/wakaru` at `8219bf5016a063d7fb215101a8c45d5959ec733f`

## 分析边界与下一步

1. 研究快照位于隔离分支，不能直接覆盖 Tekvro 主线。
2. 升级要先检查 Evidence、MCP、WebSocket、资源所有权、语义图的 breaking changes。
3. 保留 Tekvro 中文化、`TEKVRO_LANG`、npm/MCP 独立身份、发布保护及 MIT 和第三方版权。
4. 本轮仅复制和静态审计，未运行构建或集成/实机测试。
5. 文件同名或字节相同不代表契约兼容；新功能是否可用需后续验证。

# REA 6.7.0 固定源码快照与 6.5.0 差异

> 文件级静态审计，不代表 Tekvro 的功能集成、构建、实机验证或正式发布。

## 版本

- 6.5.0：`3b79af28e80785afce9f5998d8f03289402a1847`。
- 6.7.0：`27dc42d10249f0410904a75c0997842eb03b931c`。
- 6.6.0 已打 GitHub 标签但没有独立 npm 发行版；npm 最新为 6.7.0。
- 6.7.0 包含 6.6.0 累计更新与重复 JSON/JSONC 成员处理修复。
- 上游代码位置：`upstream/rea-6.7.0/`，旧源码留在 `upstream/rea-6.5.0/`。

## 文件级统计

| 指标 | 数量 |
| --- | ---: |
| 6.5.0 Git 跟踪普通文件 | 3777 |
| 6.7.0 Git 跟踪普通文件 | 4334 |
| 内容相同 | 2421 |
| 内容改变 | 1352 |
| 新增文件 | 561 |
| 删除文件 | 4 |
| submodule gitlink 数量 | 5 |

## 新增文件分布

| 路径 | 数量 |
| --- | ---: |
| `tests/boundary/` | 158 |
| `src/domain/` | 58 |
| `experiments/` | 34 |
| `tests/acceptance/` | 34 |
| `scripts/lib/` | 25 |
| `src/kuna/` | 25 |
| `docs/verification/` | 24 |
| `src/application/` | 24 |
| `tests/fixtures/` | 17 |
| `tests/process-global/` | 16 |
| `src/browser/` | 14 |
| `src/ghidra/` | 12 |
| `src/apktool/` | 10 |
| `src/artifacts/` | 8 |
| `src/native/` | 8 |
| `src/process/` | 8 |
| `.github/` | 6 |
| `src/providers/` | 6 |
| `scripts/ci/` | 5 |
| `scripts/verify/` | 5 |
| `src/dotnet/` | 5 |
| `src/electron/` | 5 |
| `website/` | 5 |
| `.agents/` | 3 |
| `src/adb/` | 3 |
| `src/android/` | 3 |
| `src/filesystem/` | 3 |
| `src/wasm/` | 3 |
| `tests/conformance/` | 3 |
| `docs/releases/` | 2 |

## 修改文件分布

| 路径 | 数量 |
| --- | ---: |
| `tests/boundary/` | 230 |
| `src/domain/` | 212 |
| `src/application/` | 168 |
| `src/browser/` | 56 |
| `src/ghidra/` | 51 |
| `website/` | 44 |
| `src/artifacts/` | 36 |
| `src/native/` | 35 |
| `tests/fixtures/` | 31 |
| `src/cli/` | 30 |
| `src/contracts/` | 28 |
| `tests/acceptance/` | 28 |
| `src/process/` | 22 |
| `docs/readme/` | 19 |
| `src/dotnet/` | 19 |
| `src/server/` | 18 |
| `scripts/lib/` | 12 |
| `tests/process-global/` | 12 |
| `src/ida/` | 11 |
| `src/hopper/` | 10 |
| `tests/conformance/` | 10 |
| `src/android/` | 9 |
| `tests/composition/` | 9 |
| `src/javascript/` | 7 |
| `.github/` | 6 |
| `src/apktool/` | 6 |
| `experiments/` | 5 |
| `native/` | 5 |
| `scripts/verify/` | 5 |
| `src/adb/` | 5 |

## 高优先级源码入口

- `src/domain/evidence.ts`：存在
- `src/domain/analysisView/javascriptFactsView.ts`：存在
- `src/application/SetupClientConfiguration.ts`：存在
- `src/application/ClientConfigurationDocument.ts`：存在
- `src/contracts/kuna/`：未发现
- `src/kuna/`：存在
- `src/domain/android/`：存在
- `src/ghidra/`：存在
- `src/browser/`：存在
- `src/server/`：存在

## 子模块 Gitlink（本快照不携带完整子模块仓库）

- `third_party/binwalk`：`4fdab3d464d97b68e0af9088df3f9e2e1545b21c`
- `third_party/ghidra-nativeaot`：`effeb734fc570c32650f88b159608979dc7b423e`
- `third_party/jadx-headless-mcp`：`5844800a486d2248fa949b74c9896285f5b54de2`
- `third_party/unblob`：`1fcc7a0a584a70a96c31f5a276c20944d199a089`
- `third_party/wakaru`：`8219bf5016a063d7fb215101a8c45d5959ec733f`

## 迁移审计要点

1. 先处理 Evidence/快照必需的 `relationship_coverage`，以及 artifact inventory 的覆盖字段变化。旧 Evidence 不自动伪造或静默迁移。
2. 再适配 6.6/6.7 MCP/CLI、配置回写、资源生命周期和客户端状态的契约。
3. JS 精准视图、Kuna、APK 多语言、Ghidra ARM 等应独立打包验收。可选工具需要实际安装和真实目标验证。
4. 保留 Tekvro npm/MCP 独立身份、中文 CLI、本地路径设置、`private:true`、安装器和 Release 防越权保护。
5. 本分支不替换 Tekvro `main`，也不证明 6.5.0 集成分支已经通过所有门槛。

## 全量路径与哈希

见 `rea-6.7.0-file-diff.tsv`，保存新增、修改、删除文件对应的原始 SHA256。

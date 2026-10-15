# REA 6.5.0 源码复制与文件级差异报告

> 本报告由受 Git SHA 固定的源码逐字节比较生成；不等价于成功编译或运行验收。

## 比较基准

- REA 6.4.0：`a56f7bb668ab23fec8d33f7af353ac7ed2fe1895`，路径 `upstream/rea-6.4.0/`。
- REA 6.5.0：`3b79af28e80785afce9f5998d8f03289402a1847`，路径 `upstream/rea-6.5.0/`。
- Tekvro：当前研究分支继承的源码（排除 `upstream/` 目录），来源于独立项目 `main` 基线。
- 上游实际有 5 个独立 Git submodule 引用；Git 归档仅包括跟踪的普通文件。

## 6.4.0 → 6.5.0

| 统计项 | 文件数 |
| --- | ---: |
| 6.4.0 普通文件 | 2667 |
| 6.5.0 普通文件 | 3777 |
| 路径和字节不变 | 1091 |
| 同路径内容改变 | 1522 |
| 6.5.0 新增路径 | 1164 |
| 6.5.0 删除路径 | 54 |

### 6.5.0 新增文件最多的目录

| 路径范围 | 数量 |
| --- | ---: |
| `tests/boundary/` | 253 |
| `src/domain/` | 126 |
| `scripts/` | 100 |
| `src/application/` | 70 |
| `experiments/` | 65 |
| `tests/acceptance/` | 59 |
| `tests/fixtures/` | 49 |
| `tests/conformance/` | 34 |
| `website/` | 27 |
| `src/contracts/` | 20 |
| `src/process/` | 20 |
| `docs/readme/` | 19 |
| `licenses/` | 18 |
| `src/server/` | 18 |
| `src/browser/` | 16 |
| `src/ghidra/` | 16 |
| `src/ida/` | 16 |
| `tests/process-global/` | 15 |
| `src/cli/` | 13 |
| `src/dotnet/` | 13 |
| `.github/` | 12 |
| `src/wasm/` | 12 |
| `src/composition/` | 11 |
| `tests/support/` | 11 |
| `tests/composition/` | 10 |

### 6.5.0 同名文件变化最多的目录

| 路径范围 | 数量 |
| --- | ---: |
| `src/domain/` | 296 |
| `tests/boundary/` | 244 |
| `src/application/` | 172 |
| `scripts/` | 114 |
| `src/browser/` | 70 |
| `src/contracts/` | 42 |
| `src/artifacts/` | 37 |
| `tests/fixtures/` | 35 |
| `website/` | 35 |
| `src/native/` | 34 |
| `src/process/` | 34 |
| `src/server/` | 34 |
| `src/ghidra/` | 30 |
| `src/cli/` | 25 |
| `.github/` | 24 |
| `src/dotnet/` | 24 |
| `src/javascript/` | 18 |
| `tests/conformance/` | 18 |
| `tests/acceptance/` | 17 |
| `src/hopper/` | 16 |
| `src/ida/` | 14 |
| `tests/composition/` | 8 |
| `.agents/` | 7 |
| `src/adb/` | 7 |
| `src/android/` | 6 |

### 新增或变动的代码范围

- `src/domain/javascript/`：已发现变动
- `src/javascript/`：已发现变动
- `src/contracts/`：已发现变动
- `src/application/`：已发现变动
- `src/server/`：已发现变动
- `src/artifacts/`：已发现变动
- `src/ghidra/`：已发现变动
- `src/adb/`：已发现变动
- `src/wasm/`：已发现变动
- `src/sqlite/`：已发现变动
- `src/frida/`：已发现变动
- `src/packet/`：本轮无路径变动
- `src/dart/`：本轮无路径变动
- `src/harmony/`：本轮无路径变动
- `src/browser/`：已发现变动
- `src/electron/`：已发现变动
- `docs/ghidra-riscv.md`：已发现变动
- `docs/mcp-contracts.md`：已发现变动

## 6.5.0 与 Tekvro 当前引擎的文件级对比

| 统计项 | 文件数 |
| --- | ---: |
| Tekvro 现有跟踪文件 | 2325 |
| 两者相同 | 533 |
| 同路径发生变化 | 1680 |
| 仅 6.5.0 有 | 1564 |
| 仅 Tekvro 有 | 112 |

## Git 子模块引用（仅 SHA，未包含子模块仓库源文件）

- `third_party/binwalk`：`4fdab3d464d97b68e0af9088df3f9e2e1545b21c`
- `third_party/ghidra-nativeaot`：`effeb734fc570c32650f88b159608979dc7b423e`
- `third_party/jadx-headless-mcp`：`5844800a486d2248fa949b74c9896285f5b54de2`
- `third_party/unblob`：`1fcc7a0a584a70a96c31f5a276c20944d199a089`
- `third_party/wakaru`：`8219bf5016a063d7fb215101a8c45d5959ec733f`

## 研究结论和限制

1. 6.5.0 文件快照在隔离研究分支；Tekvro `main` 的包名、中文版、发布保护和程序代码均未被覆盖。
2. 6.5.0 在 6.4.0 的不兼容数据契约上进一步改变了调用图、MCP discovery、JSON null、source map 和进程附着状态；必须逐项对照当前消费者。
3. 新 WASM、SQLite、网络抓包、Flutter、Frida 能力需要检查外部依赖、权限、真实工具测试范围和 CLI/MCP 注册，不能仅因存在目录就声明可用。
4. 本次导入、字节差异审计不等于运行构建；下游实际合入和验收需另开 PR。

## 全量更改列表

全部新增、变化和删除的文件路径及两侧 SHA256 位于同目录 `rea-6.5.0-file-diff.tsv`，便于编程筛选。

# REA 6.7.0｜Tekvro 源码研究与升级判断

> 研究日期：2026-10-19。基于固定 Git 标签、仓库源码与 Tekvro 集成分支的真实 CI 记录。本研究不等于 Tekvro 已升级，亦不是发布授权。

## 版本与文件来源

- REA 6.5.0：`3b79af28e80785afce9f5998d8f03289402a1847`。
- REA 6.6.0：`2c4338db1fdb7773e05376301c558cff2a0b4b80`，GitHub 有 Release，但未发布独立 npm 版。
- REA 6.7.0：`27dc42d10249f0410904a75c0997842eb03b931c`；2026-10-18 发布，npm 最新可查为 6.7.0。
- [上游 6.6 发布记录](https://github.com/morluto/rea/releases/tag/rea-agents-6.6.0) · [上游 6.7 发布记录](https://github.com/morluto/rea/releases/tag/rea-agents-6.7.0)。
- 本分支 `upstream/rea-6.7.0/` 为受 Git 跟踪的上游文件完整快照；五个 Git 子模块仅记录版本指针，未包含各仓库全部源码。
- [逐文件 SHA-256 差异](rea-6.7.0-file-diff.tsv) · [差异统计](rea-6.7.0-delta.md)。
- 6.5.0→6.7.0：GitHub compare 为 577 个后续提交；实际文件比较为 4,334 个 6.7 文件、561 个新增路径、1,352 个同路径修改、4 个删除、2,421 个未变化。

## 一、6.6 的七组主要 Breaking Changes

| 优先级 | 行为变化 | Tekvro 集成要求 |
| --- | --- | --- |
| P0 | `Evidence` 与分析快照必须明确拥有允许为空的 `relationship_coverage`，该字段参与内容身份承诺；制品清单改为带范围的覆盖与 `integrity_contradictions`，废弃 `coverage_status` | 整体更新生产者、序列化、Evidence ID / 回读、比较和缓存；无法证明旧记录事实时不填默认值，提示重新采集 |
| P0 | 浏览器抓包须保留最终采用的预算、事件类别、遗漏理由；内容读取有并发上限 | 同步更新 CDP/HAR 的结果消费者、持久化快照和部分结果测试 |
| P1 | `inspect_adb_package.version_code` 改成十进制字符串 | 保留 64 位精度，必要时用 `BigInt` 比较，不能以 JS Number 默认承载 |
| P1 | Native UI 失败/取消时将已有报告放在 typed error `partial_observation` | 消费错误路径并保留不完整证据，而非期待成功结果里包含失败步骤 |
| P0 | `binary_session` 中 provider candidate availability 在所有权清理期间可以是 unknown | CLI/MCP 状态与 setup/doctor 正确容纳未知，内部调用需等待异步状态 |
| P1 | Swift symbol 位置可能为 `address: null` | 不将缺失地址写为 0，记录 unknown 及 `reported_address` 来源 |
| P2 | Linux Hopper 旧 allowlist 变为要求有签名发布包证据，部分 RPM 元数据仍拒绝 | 明确限制旧版本支持范围和实机验收条件 |

以上来自上游 6.6 正式 Release 的 Breaking Changes；新 schema 可在 [`src/domain/evidence.ts`](../../upstream/rea-6.7.0/src/domain/evidence.ts) 核查 `relationship_coverage` 的必填 nullable 定义。

## 二、6.7 的专门修复：MCP 客户端配置编辑

新版 [`src/application/ClientConfigurationDocument.ts`](../../upstream/rea-6.7.0/src/application/ClientConfigurationDocument.ts) 针对重复 JSON/JSONC 成员实现：

- 读取/修改**最后一个生效**的同名成员，避免编辑一个客户端根本不会读取的旧条目。
- 删除可能令更早同名成员重新生效的记录时明确拒绝；保留原配置，不制造配置假成功。
- 保留其他成员、注释与字节布局的可恢复性约束。

这对 Tekvro 目前的本地 Node/CLI 注册、Codex/Claude/其他客户端迁移尤为重要，不能直接用上游的 `npx rea-agents` 安装行为替代当前独立源码配置。

## 三、增量能力及实际支持范围

1. **P0 — 精确 JS Evidence 查询：** [`javascriptFactsView.ts`](../../upstream/rea-6.7.0/src/domain/analysisView/javascriptFactsView.ts) 提供 `kind: "javascript-facts"`，使用 `where.paths` / `where.kinds`、`property_keys`、`offset`、`limit` 查询已保留的来源节点及属性。未选值、未知事实不应补齐；不用重新读全量 H5 文件。
2. **P0 — JS 语义修复：** 改善 CommonJS/包入口/类型擦除、变量历史、属性赋值、网络候选、模块关系与版本比较；优先用 Vite/Webpack/PixiJS/Laya/Electron 测试夹具验证，不推断未观察服务器逻辑。
3. **P1 — Kuna 静态 provider：** [`docs/kuna-provider.md`](../../upstream/rea-6.7.0/docs/kuna-provider.md) 说明自备 Kuna 可提供函数、伪代码、汇编、xrefs 和缓存字符串；Kuna 是 Apache-2.0 的独立引擎，Linux Kuna 1.833 有上游真实验证，Windows、PE 和 universal Mach-O 不支持。不得自动安装或宣称全平台可用。
4. **P1 — Apktool 多语言：** [`src/cli/apktoolCommands.ts`](../../upstream/rea-6.7.0/src/cli/apktoolCommands.ts) 提供可重复的 `--locales` 与 MCP `locales`；每张表单独报告覆盖范围。
5. **P1 — Electron 与 Ghidra 扩展：** 更好恢复稳定 `BrowserWindow` 配置；有限范围加入 Windows x64 Ghidra 对 ARMNT/Thumb-2、ARM64 PE 的检查，和 macOS arm64 Ghidra 12.1.4 对 big-endian raw m68k 的验证；Windows-on-Arm 和 ARM64EC 等并未纳入完整支持声明。
6. **P0 — 可靠性：** 分析取消、资源 cleanup、MCP schema 输出、客户端配置、CLI 参数解析、JADX 启动超时处理等有大量安全与一致性修复。

## 四、Tekvro 当前实际进度与阻塞

- [Tekvro `main`](https://github.com/ForceMind/Tekvro/tree/main) 在核查时为 `5644f55589f1ea87e1818556f91ed21667bac1c4`，仍是继承 REA 6.1.0 的产品源码；既有中文命令 PR #20 已合并。
- 6.5.0 引擎正在 [独立集成分支](https://github.com/ForceMind/Tekvro/tree/integration/rea-6.5.0-engine-prototype-20261015)，最后 HEAD 为 `ecf76264a0100b33be667fc2ed01fc57eb8ae8cc`，尚无开放的合并 PR。
- 该分支曾在 Ubuntu 24.04 / Node 24.18.0 通过 build、check:fast、7,640 项快速单测、11 项中文 CLI 专项测试，以及 `private:true` 更新拒绝测试。
- **尚未满足总验收：** [最终验证 Actions](https://github.com/ForceMind/Tekvro/actions/runs/38747616995) 的 `docs:check` 失败，日志明确报 `website/locales/languages.json` 不存在（新版构建脚本依赖的上游多语言清单，在 Tekvro 定制网站中没有）。这不是引擎运行失败，但阻止将分支宣称为完全通过。
- 本轮已经在独立研究分支保存 6.7.0 原版源码并完成文件级差异，**没有**把 6.7.0 功能集成进 Tekvro 根目录，也没有执行 6.7.0 的 Tekvro 构建/实机测试。

## 五、建议下一轮集成顺序

1. **I67-00 先修复 6.5.0 原有 docs:check 真实阻断**：让新版多语言元数据生成器能正确对应 Tekvro 已有站点/产品文档；保留中性 README、本地化和发布保护。
2. **I67-01 Evidence 契约升级**：迁移 `relationship_coverage` 与 inventory 覆盖；金样、历史 Evidence/快照拒绝或重采集、完整 ID 验证先通过。
3. **I67-02 MCP/CLI/客户端配置**：修重复 JSON/JSONC member 的末项生效、删除拒绝；处理 unknown 状态、部分错误和浏览器捕获预算。
4. **I67-03 JS 精确视图与语义修复**：先使用原有 retained Evidence，增加路径/属性筛选、分页和 provenance 断言；不得让 `source_paths` 未选文件看似已分析。
5. **I67-04 可选 provider**：Kuna、Android locales、Ghidra ARM/68k 等单独 feature flag 和真实 host 验证；不阻塞 P0。
6. **I67-05 最终验收**：构建、test:fast、中文 CLI/MCP schema、docs:check、跨平台/实际 provider 清单、许可证、`private:true`、安装器及发布工作流保护。

**版本决定：** 后续实际集成以冻结的 `rea-agents-6.7.0` 标签为对照目标，比无意义地对齐 6.6 tag 更好；Tekvro 产品独立发行版本仍需专门审核，不直接用 6.7.0 替换旧 `package.json.version`。

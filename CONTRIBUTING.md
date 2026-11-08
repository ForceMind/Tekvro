# 参与 Tekvro 开发

欢迎修复可复现的问题、完善文档与测试，以及改进软件分析工作流。较大的契约或架构变更请先在 [Issues](https://github.com/ForceMind/Tekvro/issues) 说明问题、预期行为和范围，再开始实现。

参与本仓库即同意遵守[社区行为准则](CODE_OF_CONDUCT.md)。使用问题见[支持说明](SUPPORT.md)，漏洞报告按[安全政策](SECURITY.md)处理。

## 准备开发环境

开发工具链固定为 Node.js **24.22.1**（见 `.nvmrc`）和 npm **11.16.0**（见 `package.json`）。运行时支持范围以 `package.json` 的 `engines.node` 为准；可选分析工具需要自行准备，不能通过包启动成功推断它们可用。

```bash
git clone https://github.com/ForceMind/Tekvro.git
cd Tekvro
nvm use
npm ci
npm run build:cached
npm run check:fast
```

`nvm use` 适用于已使用 nvm 的环境，其他环境请直接选择 `.nvmrc` 指定的 Node.js。`npm ci` 使用锁定依赖并准备开发钩子；安装后仍需显式构建 CLI/MCP。包、锁文件或技能元数据变更后，先运行 `npm run metadata:generate`。

## 实现与验证

保持每个 PR 聚焦于一个具体问题，说明触发条件、修复前后的行为，以及检查方法。不要将无关格式调整、推测性的重构或依赖升级混入修复。

遵循根目录 `AGENTS.md` 的分层和边界规则：领域层保持提供方无关，外部输入先验证，CLI 与 MCP 共用契约，失败诊断保留实际原因。保留现有命令和配置兼容性；机器输出变更须检查真实消费者与 JSON Schema。

日常修改运行相关测试和静态检查：

```bash
npm run test:focused -- src/config.test.ts
npm run check:fast
```

- 源码测试可用 `npm run test:local -- <路径>`；边界、验收及需要构建产物的测试先运行 `npm run build:cached`。
- 新增或移动测试后运行 `npm run verify:test-discovery`，确保测试被实际发现。
- 契约、生成元数据和文档变更运行 `npm run docs:check`；网站变更另运行 `npm run docs:build`。
- 打包、安装、注册或分发变更运行 `npm run verify:package` 和 `npm pack --dry-run`。
- 外部分析工具行为变更须运行对应的真实验证入口，并报告工具版本、主机平台及未完成的验证。入口和前置条件见[测试指南](docs/testing.md)。

`npm run check:pr` 是有意执行完整本地门禁的入口；CI 执行完整确定性测试与覆盖率检查。成功的模拟测试、包启动或工具探测，只能支持各自实际验证的范围。

测试临时目录使用 `tests/fixtures/temporaryDirectory.ts` 的 `createTestTempDirectory`，确保成功、失败和超时均清理归属明确的资源。不要清理共享临时目录中的通配路径。

## 生成文件与许可证

修改源契约和 `skill-src/` 中的指令，再通过现有脚本生成派生文件。不要提交 `dist/`、`node_modules/`、缓存、测试二进制、生成的产品目录或临时分析产物。需要跟踪的源元数据如 `src/generatedPackageMetadata.ts`，必须与生成脚本保持一致。

保留 [LICENSE](LICENSE)、[第三方告知](THIRD_PARTY_NOTICES.md) 及适用的原始版权文本。新增或更新依赖时检查实际分发内容及许可，刷新对应清单，并运行 `npm run licenses:check`。提交贡献时，请确认有权以本仓库的 MIT 许可提供相应代码；第三方材料应明确来源和许可。

## 文档与网站

技术文档在 `docs/`，导航在 `docs/.vitepress/config.ts`。运行 `npm run docs:dev` 预览，使用 `npm run docs:build` 检查构建；文档站点基础路径为 `/Tekvro/`。

保持仓库内链接可在 GitHub 和生成站点使用。文档事实应来自当前源码或明确记录的实际执行；不要把尚未运行的工具、平台或服务写成已验证能力。

## 提交 PR

使用能说明行为变化的标题，例如 `fix(cli): reject invalid timeout values`。PR 描述包含问题、最终行为、相关 Issue、实际执行的验证，以及仍未验证的范围。提交前检查最终 diff；不要上传凭据、私有目标、个人数据或无权分享的分析输出。

维护者按问题价值、兼容性、验证证据和维护成本决定合并顺序。项目不承诺固定响应时间。

## 正式发行

Tekvro 使用独立的 GitHub Release 流程；发行版本以仓库标签、Release 页面和对应构建资产为准。维护者按[发行指南](docs/releasing.md)选择精确提交，完成检查后发布资产与校验值。

`private: true` 用于防止意外 npm 发布，不限制 GitHub 源码或 Release 资产分发。npm、MCP Registry 及其他分发渠道需要各自的身份验证和单独发布决定。不得将 GitHub Release 的成功视为这些渠道已经发布。

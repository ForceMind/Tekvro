# 常见问题

**Tekvro 是新写的逆向引擎吗？**  
Tekvro 在 MIT 授权的 REA 源码基础上迭代，连接 Agent、专业分析引擎和 Evidence 记录。当前主线已集成固定 REA 6.8.0；来源、实际验证范围和未验证条件见 [6.8 集成记录](../upstream/rea-6.8.0-integration.md)。原 MIT 和第三方版权告知继续保留。

**为什么 `--version` 仍显示 `6.1.0`？**

这是产品包保留的兼容版本标记。内核来源由 `engine-metadata.json` 单独记录；当前固定内核为 `6.8.0`，上游提交为 `160d821ac9a0310afcb8d1fc427862dd6508add5`。可在源码根目录核对两者：

```bash
node scripts/rea.mjs --version --json
node -p "JSON.stringify(require('./engine-metadata.json'), null, 2)"
```

前者报告产品包及运行时，后者报告内核来源和固定资格记录。后续提交的验证还需查看该提交自身的 CI；二者都不表示 Tekvro 已正式发行。详见[发行身份与兼容策略](distribution.md)。

**源码公开，为什么还有 `private: true`？**

GitHub 源码可见性与 npm 发布开关分别管理。`package.json` 的 `private: true` 阻止误发布 npm 包；安装、自动更新及发布工作流保护也仍启用。请从本仓库构建，保持当前本地 MCP 注册，不用公开 `rea-agents` 包替代 Tekvro。

**是否可以还原任意软件的原始源代码？**  
不保证。源代码、符号、运行上下文缺失或被保护时，结果会有显著不确定性；服务器端逻辑不会凭空出现。

**为什么终端里还存在 `rea` 和 `rea-agents`？**  
这是兼容旧客户端配置的命令与注册键。源码 npm 包名已迁移为 `tekvro`、MCP Registry 草案名称已迁移为 `io.github.forcemind/tekvro`，但**均未独立正式发布**，旧 CLI 别名暂时保留。

**我在中国大陆可以使用吗？**  
代码在本地运行，但 GitHub/npm 和外部引擎下载可能受网络条件影响，联网 AI 模型也需要另行配置。我们不保证任何第三方服务的可用性。

**为什么会看到英文？**  
目前支持基于 `TEKVRO_LANG=zh-CN` 的部分 CLI 人类帮助及交互式设置提示，也提供 [JavaScript/H5/Electron](javascript-h5-electron.md)、[抓包与信号录制](offline-captures.md)和[静态格式](static-formats.md)中文指南；大量底层错误、专业工具说明和旧技术手册仍为英文，后续分批翻译并保持术语对应。

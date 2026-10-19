<!-- 约定：标题使用 feat:/fix:/docs:/chore: 等 Conventional Commits 格式 -->

## 本次变更

描述问题、修改内容和使用场景。

## 影响范围

- [ ] CLI / MCP 合约改变（列出受影响的命令、工具和参数）
- [ ] 配置 / 安装 / 子模块 / 平台兼容性改变
- [ ] 证据、数据、文件路径、清理或安全边界改变
- [ ] 仅文档、品牌或翻译

## 检查结果

明确列出 **实际执行的命令与结果**，未执行的标记为“未执行”；不要凭推测填写通过。

## 兼容性、安全与许可证

说明是否影响旧 `rea` 注册、npm/MCP 标识、配置迁移、发布身份，以及新引入资源的授权。不要提交密钥、客户资料和受保护的样本。

## 交付清单

- [ ] 未误删项目运行依赖、子模块或原 MIT 许可
- [ ] 相关文档、示例和测试已更新
- [ ] 未重新连接上游官网、发布账号或社区入口
- [ ] 新代码经过必要的格式、静态与回归检查

> 构建生成的 `docs/public/product-catalog.json` 不应手工编辑或提交到仓库。

## Author readiness

项目所有者可授权代理执行开发、审查、验证和合并；依据实际结果填写声明，未验证的范围必须记录在检查结果中。

Human owner: <!-- @GitHub-handle -->

- [ ] I reviewed the final diff and relevant existing code, understand the change and its edge cases, and take responsibility for the complete PR, including AI-assisted work.
- [ ] I checked the evidence above, confirmed it supports the current change, and recorded meaningful validation gaps.
- [ ] I declare this PR ready for initial maintainer review.

## Before merge

确认当前提交的必要检查全部通过，身份、本地化、证据完整性和发行保护没有回退。

# Tekvro 安全与授权说明

Tekvro 为开发与研究工具，并非隔离恶意代码的沙箱。

- **授权**：仅分析你拥有或明确有权检查的程序、网页、录制数据与二进制文件。
- **权限**：本地分析引擎通常以当前用户身份执行；不要用高权限账户处理未知样本。
- **机密**：不要在 Issue、日志或 AI 对话中公开密钥、客户数据、私有二进制、数据库或安全令牌。
- **网络**：本地处理不等于零数据外传，连接第三方 AI 模型时，模型请求仍可能包含分析证据；确认配置和隐私策略。
- **软件许可**：本仓库代码为原 MIT 许可衍生；Hopper、IDA 等外部工具另有许可。
- **发布**：Tekvro 的 GitHub 源代码已公开，但 npm 包仍标记 `private: true`、MCP Registry 尚未正式发布；不得使用原项目发行凭据或官网密钥自动发布。
- **漏洞报告**：请使用 [ForceMind/Tekvro 的私有安全报告入口](https://github.com/ForceMind/Tekvro/security/advisories/new)，不要在公开 Issue 中披露可复现漏洞细节。

详细技术边界与运行时防护可继续参考 [SECURITY.md](https://github.com/ForceMind/Tekvro/blob/main/SECURITY.md)。

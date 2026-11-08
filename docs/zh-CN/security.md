# 安全与授权

Tekvro 在本机检查软件制品与已授权的运行环境。处理未知样本时，应使用与日常账号、密钥和生产数据隔离的工作环境。

## 选择适合的操作

- 静态制品分析读取所选文件；分析目标中的代码不会因此自动执行。
- 浏览器、应用、网络和设备观察各有独立的权限与生命周期。运行时操作可能影响进程、连接或目标状态，请先核对命令帮助与作用范围。
- 外部分析引擎通常以当前操作系统用户身份运行。Tekvro 不提供恶意代码隔离沙箱，也不替代宿主系统的访问控制。
- 仅对自己拥有或已明确获准检查的软件、数据、账号、设备和服务执行相应操作。

## 保护调查数据

Evidence、捕获、数据库快照和报告可能包含源码片段、路径、业务数据与网络内容。保存、上传或共享前，请检查内容与接收方的数据处理约定。本地分析与向联网 AI 客户端发送结果是不同的数据流。

不要在公开 Issue 中提交密钥、访问令牌、个人信息、客户资料或私有目标文件。排障优先使用能够复现问题的最小合成样本，以及已去除敏感内容的命令和诊断。

## 安装与配置

从本仓库的版本化发行页获取安装包，按[安装说明](distribution.md)检查校验文件。安装 Tekvro 与配置 AI 客户端分开进行；先用 `tekvro setup --dry-run --json` 查看预计变更，再选择应用配置。

可选引擎的获取、授权和运行条件由对应工具决定。许可证与第三方告知见 [LICENSE](https://github.com/ForceMind/Tekvro/blob/main/LICENSE) 和 [THIRD_PARTY_NOTICES.md](https://github.com/ForceMind/Tekvro/blob/main/THIRD_PARTY_NOTICES.md)。

## 报告安全问题

漏洞报告与披露流程见 [SECURITY.md](https://github.com/ForceMind/Tekvro/blob/main/SECURITY.md)。常规安装、兼容性与功能问题见 [SUPPORT.md](https://github.com/ForceMind/Tekvro/blob/main/SUPPORT.md)。

# JavaScript、H5 小游戏与 Electron 分析指南

本指南使用 **Tekvro（探核）现有的 JavaScript 分析引擎**，从静态制品开始，按需增加浏览器或 Electron 的被动观察，并把最终结论和证据关联起来。它不是一键还原源码工具。

> 适用对象：你拥有或明确获准检查的 H5 小游戏、JavaScript 网页、构建产物、Electron 应用目录或 `.asar` 文件。分析商业软件时，请遵守相关许可和保密约定。

## 一、先安装并确认本地运行环境

Tekvro 的 **GitHub 源代码已公开，但 `tekvro` npm 包尚未正式发布**。本指南的命令都从自己的工作副本执行：

```bash
git clone https://github.com/ForceMind/Tekvro.git
cd Tekvro
git submodule update --init --recursive
npm ci
npm run build:cached
node scripts/rea.mjs doctor --json
node scripts/rea.mjs capabilities --json
```

Node.js 版本应满足仓库 `package.json` 的 `engines` 约束。需要中文人类帮助时，可设置 `TEKVRO_LANG=zh-CN`；这不会改变命令名称、JSON 字段或 MCP 契约。

不要使用 `npx rea-agents@latest` 代替本仓库；那是原项目的公开 npm 分发。详见[快速开始](quick-start.md)和[独立发行身份](distribution.md)。

### 查看中文命令帮助

现在可对 H5、JavaScript、浏览器和 Electron 调查命令直接查看**简体中文的人类可读帮助**，无需猜测英文选项的用途：

```bash
TEKVRO_LANG=zh-CN node scripts/rea.mjs analyze-javascript-application --help
TEKVRO_LANG=zh-CN node scripts/rea.mjs recover-javascript-sources --help
TEKVRO_LANG=zh-CN node scripts/rea.mjs list-browser-targets --help
TEKVRO_LANG=zh-CN node scripts/rea.mjs inspect-web-page --help
TEKVRO_LANG=zh-CN node scripts/rea.mjs list-electron-targets --help
```

选择 `TEKVRO_LANG=en` 可查看英文原文。**只有命令解释、位置参数说明和部分选项帮助文本被翻译**；命令名、`--` 参数、JSON 字段、MCP 工具身份和原有分析契约均不变。Windows PowerShell 请先设置 `$env:TEKVRO_LANG="zh-CN"`，再执行相同的 `node` 命令。

## 二、静态分析本地 H5 / JavaScript 目录

先准备**已经获得的、本地可读取的构建目录**，例如包含 `index.html`、打包 JavaScript 和资源文件的 `dist/`，而不是把线上网址直接传给静态目录分析命令。

```bash
# 将路径替换为你拥有授权的绝对目录
node scripts/rea.mjs analyze-javascript-application /absolute/path/to/game/dist --json

# 同一类目录、Electron ASAR 还可以交给通用分析入口选择
node scripts/rea.mjs analyze /absolute/path/to/game/dist --json
node scripts/rea.mjs analyze-javascript-application /absolute/path/to/app.asar --json
```

这项静态流程不执行目标应用，也不要求先启动 Ghidra、Hopper 或浏览器。它依据实际可用文件构建 JavaScript Application Graph 和 Evidence，可能包含模块、依赖关系、打包结构、静态语义、Electron 边界以及覆盖范围与局限。运行进度在标准错误输出中以 `rea_progress` JSON 行呈现，结果写到标准输出。

要保存结果以备后续比对，可以使用常规终端重定向（先确认报告的目标目录存在）：

```bash
node scripts/rea.mjs analyze-javascript-application /absolute/path/to/game/dist --json > ./game-evidence.json
```

**注意：** 写入本地报告与把结果发送给联网 AI 是两件事。报告中可能包含路径、脚本代码片段或其他需要审查的信息。

### 对 H5 小游戏重点看什么？

| 调查问题       | 可以尝试查找的证据                        | 不应直接断言的结论               |
| -------------- | ----------------------------------------- | -------------------------------- |
| 使用什么引擎   | 打包模块、已出现的引擎 API、依赖与资源    | 仅凭文件名就确认所有运行逻辑     |
| 入口和场景     | 入口脚本、路由、场景或资源引用关系        | 没有扫描到的场景一定不存在       |
| 状态与规则     | 静态常量、局部调用、数据流和条件判断      | 代码中的默认值就是服务器实际配置 |
| 与服务端交互   | 请求构造、URL 候选、WebSocket 相关引用    | 已证明消息协议或服务端全部逻辑   |
| 游戏经济与奖励 | 本地显示逻辑、结算 UI、资源命名和数值候选 | 客户端数据就是真实结算权威       |

Canvas、PixiJS、Laya、Unity WebGL 或 WASM 项目都可能含有部分动态执行、压缩或混淆的内容。对不能静态确定的关系，应记录为**候选、未知或缺少证据**，而不是猜测成已恢复的设计文档。

## 三、授权浏览器中的 H5 游戏：被动观察

若目标已在你控制的 Chrome 系浏览器内运行，可以使用 CDP 观察现有页面。应当**单独启动一个调试配置文件，并把调试接口限制在本机**。以下示例以 Linux 上的 `google-chrome` 命令为例，其他系统须按实际可执行文件和路径调整。

```bash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/tekvro-browser-profile \
  http://127.0.0.1:3000
```

然后在 Tekvro 仓库目录中：

```bash
# 先获取目标 ID。返回结果可能列出该端口下多个页面
node scripts/rea.mjs list-browser-targets http://127.0.0.1:9222 --json

# 用上一步真实返回的 ID 替换 TARGET_ID
node scripts/rea.mjs inspect-web-page http://127.0.0.1:9222 TARGET_ID \
  --observation-ms 1000 --json

# 已有页面的静态脚本 / bundle 分析
node scripts/rea.mjs analyze-web-bundle http://127.0.0.1:9222 TARGET_ID --json
```

这是被动页面检查，**不是自动点按或操纵游戏的工具**。如果希望调查一次由自己触发的操作，可先启动观察窗口，再由用户操作页面：

```bash
node scripts/rea.mjs observe-web-session http://127.0.0.1:9222 TARGET_ID \
  --observation-ms 10000 --json
```

Tekvro 不负责启动或结束这个浏览器。不要将调试端口开放到局域网或互联网。CDP 观察可以包含页面结构、脚本、资源和被允许的网络元数据；脚本源码、控制台文本、存储键等敏感项目需要**显式选择**，不应无条件打开或上传。

更多细节参见[浏览器观察（英文）](../browser-observation.md)。

## 四、Electron 桌面程序：先静态、再按需观察

先对获准检查的解包目录或 `.asar` 进行静态分析（同第二节）。只有当你已经有一个**自己控制、已启动的 Electron CDP 调试端点**，才使用以下被动观察：

```bash
node scripts/rea.mjs list-electron-targets http://127.0.0.1:9223 --json

node scripts/rea.mjs inspect-electron-page http://127.0.0.1:9223 TARGET_ID \
  --observation-ms 100 --json
```

`TARGET_ID` 必须来自前一个命令的真实结果；不要随意编造。Electron 文件页观察会检查允许的本地 `file://` 页面、帧、脚本和资源元数据，但不会调用 Electron API、执行目标 JavaScript 或自动操作 UI。

更详细的主动场景测试属于**另一条会启动应用的工作流**，应先阅读[Electron 观察边界（英文）](../electron-observation.md)并确认目标授权与环境隔离。

## 五、已有 Evidence 的关联与版本比较

只有实际获得了静态分析 Evidence、被动浏览器或 Electron 捕获 Evidence，才继续做跨层关联。例如：

```bash
node scripts/rea.mjs reconcile-javascript-runtime /absolute/path/to/reconciliation-input.json --json
```

这个输入文件必须包含符合契约的**完整 Evidence 对象**，而不是只有 Evidence ID 或随意拼接的 JSON。浏览器 URL 通常需要明确映射到本地制品目录。该步骤不重新执行应用、不访问 CDP；它把观察结果和推断保持为不同来源。

对于同一应用两个实际采集的版本，也可以进一步使用 `compare-application-versions`、`trace-application-feature` 等工作流，但需要对应的完整、已验证输入。请参阅[JavaScript 应用追踪与版本比较（英文）](../javascript-application-workflows.md)和[静态/运行时协调（英文）](../javascript-runtime-reconciliation.md)。

## 六、向 AI Agent 提问的方法

推荐直接提供分析对象的路径、要回答的问题以及证据要求。例如：

> 请使用当前 Tekvro 的可用工具分析我有权检查的 `/absolute/path/to/game/dist`，说明入口、模块关系和可能的游戏状态管理逻辑。每项结论请区分“工具实际观察”“静态推断”和“仍未知”，提供对应来源、覆盖局限，不要假设已经取得服务器端实现。

若需要多次比较，应保存每次输入、工具版本、证据对象、实际命令和目标文件哈希。不能只保存 AI 的自然语言总结。

## 七、常见问题与安全边界

- **是否能得到完整游戏源码？** 不能保证。混淆、动态加载、压缩、WebAssembly 和缺少源码映射都可能限制恢复。
- **为什么工具返回 unknown/unavailable？** 这是明确的覆盖或授权边界，不是可以自行补写的运行事实。
- **能直接分析远程 URL 吗？** 静态应用目录命令需要本地绝对路径；网页观察是独立的 CDP 工作流，且仅接受符合约束的本地调试端点。
- **可以检查第三方商业游戏吗？** 仅在你拥有相应授权和合法目的、遵守许可及保密条件时进行；不要公开私有文件、密钥或用户数据。
- **为什么注册中还有 `rea`？** 这是兼容旧客户端配置的键名，不代表正在使用原作者公开 npm 包。

继续阅读：[安全与授权](security.md) · [CLI 与 Evidence（英文）](../cli.md) · [项目架构](architecture.md)。

# Codex Builder 适配器

本目录实现 `ProjectBuilderPort` 的单次 Codex CLI 调用、JSONL 事件解释和受控进程清理。它是项目构建执行边界；项目验收由独立检查器负责。

## 调用与能力边界

`CodexBuilderAdapter.run(request, signal?, onEvent?)` 使用调用者明确选择、由项目应用服务持有的输出目录作为 `workspace`。固定参数是：

```text
codex exec --sandbox workspace-write --json --cd <workspace> --skip-git-repo-check [--model <model>] -
```

提示词通过标准输入完整传递。`--model` 仅来自 `request.run.adapter.model`；值为 `null` 时沿用用户现有 CLI 配置。`--skip-git-repo-check` 允许新输出目录尚未成为 Git 仓库，适配器不会自动初始化仓库。该参数不改变 `workspace-write` 沙箱，也不取消现有规则或权限控制。

适配器不切换账号或凭据，不关闭用户配置、规则或钩子信任，不使用绕过沙箱的参数。所选 CLI 的现有配置决定其模型后端连接；本层不把一次版本探测解释为登录、模型访问或构建可用。父进程环境只用于启动所选 CLI，不写入项目回执或日志。

公共方法：

| 方法     | 已实现的语义                                                                     |
| -------- | -------------------------------------------------------------------------------- |
| `run`    | 启动一个明确请求的新 turn；返回进程与协议事实                                    |
| `probe`  | 执行 `--version` 与 `exec --help`，记录版本和声明的参数；资格始终为 `unverified` |
| `resume` | 明确返回能力不可用；真实恢复流程通过验证前，不启动替代会话                       |
| `close`  | 取消本实例接纳的工作，重试本实例保留的进程清理所有权                             |

## 共享项目入口

`src/composition/project.ts` 将适配器和独立的 `ArtifactResourceScope` 交给 `ProjectRunService`。CLI 与 MCP 调用同一应用服务；构造或读取服务不触发版本探测、账号访问或 Builder 执行。关闭服务会等待已接纳的运行结束并通过原所有者处理清理。

| MCP 工具                    | CLI 命令                    | 一次调用的边界                                                     |
| --------------------------- | --------------------------- | ------------------------------------------------------------------ |
| `build_project`             | `build-project`             | 按项目修订令牌启动一个新 run，执行一次 Builder，保存 pending check |
| `check_project`             | `check-project`             | 校验已保存的输入绑定并执行一次独立检查，不重放 Builder             |
| `refine_project`            | `refine-project`            | 在已检查 run 上请求一次修正；达到预算或无进展阈值时暂停            |
| `resume_project_build`      | `resume-project-build`      | 从安全暂停的构建阶段请求一个新 Builder turn，不恢复 Codex session  |
| `inspect_project_run`       | `inspect-project-run`       | 读取运行事件、当前令牌、消耗、pending check 和投影状态，不启动进程 |
| `adjust_project_run_budget` | `adjust-project-run-budget` | 明确记录有限预算和原因，保留已消耗额度，不自动执行下一次构建       |

这六个 CLI 命令均接收一个完整 JSON、JSON 文件或 `-` 标准输入参数，支持 `--json`。CLI 只将 `directory` 和 `checker_path` 相对调用目录解析；MCP 要求绝对路径。新建 run 的 `expected` 来自项目修订；其余修改动作的 `expected` 来自运行事件令牌。请求与响应 schema 的唯一来源是 `src/domain/projectExecution.ts`，不接受任意执行状态或验收状态补丁。

运行响应保留 `{project, execution, projection_status, check?}`；执行状态与验收状态独立。`projection_status: outdated` 公开项目摘要尚未反映该运行的情况。独立 checker 返回 `pass` 仍只是一条有绑定的检查观察，本切片不会把项目验收自动变成 `pass`。已有 pending check 只能交给 `check_project`；调预算不会绕过检查边界、进程所有权或此前的无进展记录。

## 输出与失败

`CodexJsonlStream` 解释 `thread.started`、`turn.started`、`item.started/updated/completed`、`turn.completed`、`turn.failed` 和 `error`。未知事件保留原文并列出限制。只有合法、完整的线程与 turn 记录、零退出码和已确认清理才能返回 `completed`。Agent 消息声称“通过”不会产生验收结果。

`observed_tokens` 来自完整 `turn.completed.usage` 中的输入与输出 token 之和；缓存输入已经包含在输入数量内，不再次相加。缺失、非法或未完成的用量保持未知，不估算费用。

stdout JSONL 和 stderr 诊断各自采用默认 8 MiB 的完整保留上限，可在构造适配器时显式选择 `maxOutputBytes`。超限会触发受控停止并报告资源约束；已观测到的 session ID 和前缀输出仍保留。该上限是保留资源边界，不是 Codex 协议的单条消息限制。

普通非零退出和 `turn.failed` 返回 `status: failed` 的已观测结果。取消、超时、损坏或截断协议、事件保存失败以及清理不完整使用仓库既有类型化错误。错误的 `diagnostics.builder_result` 保留 session、退出码、已捕获输出、用量和清理状态。事件回调拒绝不会让 stdout sink 直接报错并覆盖进程结果：适配器持续读取，先保留 `OwnedCommand` 的真实生命周期结果，再报告回调失败。

残余进程仅由 `runOwnedCommand` 返回的所有者清理；不会根据历史 PID 或命令路径重新获得终止权限。清理未完成时拒绝新的工作，`close()` 重试同一所有者。构建应用服务必须同时检查 `status === "completed"` 与 `cleanup_status === "complete"`，再提交候选并进入独立检查。

## 验证记录与限制

`tests/boundary/process/codexBuilderAdapter.test.ts` 使用真实 Node 子进程输出明确标记的 **protocol fixture**，覆盖完整与错误协议、输入传递、使用量、非零退出、实时事件、输出上限、取消、超时、清理重试、探测和拒绝恢复。这些测试建立的是协议与生命周期边界，不能代替真实 Codex 构建资格。

`tests/boundary/cli/projectRunCli.test.ts` 通过实际编译后的 CLI、stdio MCP 和真实 Node protocol fixture 检验共享持久化入口，并使用输出树外的独立预期数据进行检查。夹具记录每个新 turn 的调用，验证检查、预算调整和被拒绝的继续请求不会额外运行 Builder。依赖真实工作区租约的用例只在准确观察到宿主 `listen` 权限拒绝时标记跳过，不替换锁或把跳过算作实际运行验证。

2026-11-10 当前开发环境可读取 Codex `0.167.0-alpha.4` 的版本与帮助；最小真实执行预检在初始化阶段遇到 `Read-only file system (os error 30)`。因此本次实现仍把真实构建、模型访问及 session 恢复资格标为未验证／受阻，不作平台支持承诺。排除该环境阻塞后，还需记录真实生成候选、独立检查、取消和恢复流程的回执。

协议依据：[Codex 非交互模式官方文档](https://developers.openai.com/codex/noninteractive/) 和所选本机 CLI 的 `exec --help`、`exec resume --help`。现有 CLI 功能说明不替代 Tekvro 自身的真实工作流验证。

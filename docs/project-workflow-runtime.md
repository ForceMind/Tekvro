# 项目运行基础：构建、检查与继续

本页说明当前源码中的项目运行切片：持久化项目与运行事件、一次受预算约束的 Builder 尝试、独立检查、显式修正及继续，以及共享这些行为的 CLI/MCP 入口。实现范围与实际验证范围分别记录；完整阶段门槛见[验收矩阵](project-workflow-acceptance.md)，后续工作见[工作包计划](project-workflow-plan.md)。

M0 的项目契约、持久化与接口边界已验收；#62 的精确 Linux CI 已实际验证所列项目租约、恢复、预算、取消及跨入口 fixture。原本地宿主仍保留 Unix socket `listen EPERM` 的历史记录，真实 Codex 写入另受 `EROFS` 阻塞。Linux fixture 的通过不代表真实 Agent 生成或网页重建通过，M1 网页闭环继续进行。精确提交、实际通过/跳过明细和限定范围见[验收矩阵](project-workflow-acceptance.md)。

## 1. 当前可选择的输入与目录

| 位置       | 示例                       | 约束与用途                                                                                          |
| ---------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 原目标     | `/analysis/reference.bin`  | 运行切片目前要求本机可读取的常规文件，执行时复核实际 SHA-256；不把 URL 或目录声明当作已观察的源内容 |
| 候选目录   | `/analysis/candidate`      | 已存在、可完整观察的实体目录；Builder 在这个目录执行                                                |
| 项目元数据 | `/analysis/projects/demo`  | 创建时目录尚不存在、父目录已存在；位于候选目录之外，保存项目修订、运行事件、原始输出和检查报告      |
| 验证器目录 | `/analysis/verifiers/demo` | 位于候选目录之外，保存独立 manifest、检查脚本、场景与预期结果                                       |

`create_project` 保存调用方声明的目标身份和范围。真正发起运行时才核对原目标文件、候选及验证器输入。保留历史元数据、读取历史路径和在当前宿主实际执行是不同的能力；跨宿主读取成功不会自动获得该平台的执行资格。

候选身份来自完整输出树，包括文件内容、空目录以及文件执行位。当前不静默忽略 `.git`、`node_modules` 或源码。候选树内的符号链接、特殊文件、读取中变化以及不完整遍历都会阻止产生“完整候选”身份；工具生成的链接依赖也受此约束。需准备实际文件与目录构成的候选树，当前切片没有自动展开依赖链接的功能。应用层默认准入为 100,000 个条目和 1 GiB 待散列字节，超限返回明确失败；九个公开入口当前没有调整这两个准入值的参数。

元数据目录、源目标、验证器输入及检查报告都应保持在 Builder 输出树之外。工作区协调器按实际路径与文件系统身份取得租约，目录别名不能获得另一份写入资格。检查前后重新观察文件并不能代替操作系统隔离：独立检查器是调用方明确选择的可信本地程序，其完整输入闭包由验证侧声明。

## 2. 九个 CLI/MCP 入口

CLI 使用连字符命令名，MCP 使用下划线工具名。它们调用相同 application service，字段 schema 来自统一 domain/contracts。中文帮助只影响面向人的说明。

| CLI                         | MCP                         | 主要输入与行为                                                                                                    |
| --------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `create-project`            | `create_project`            | `{directory, project: {name, scope}}`；创建项目并返回 project token                                               |
| `inspect-project`           | `inspect_project`           | CLI 接收目录参数；MCP 接收 `{directory}`；校验并读取项目修订链                                                    |
| `edit-project`              | `edit_project`              | `{directory, expected, edit}`；按精确 project token 追加元数据编辑，范围变化须给出 `change_reason`                |
| `build-project`             | `build_project`             | `{directory, expected, instruction, checker_path, model?, budget?}`；创建新 run，执行一次 Builder，保存待检查边界 |
| `check-project`             | `check_project`             | `{directory, run_id, expected, checker_path}`；重新核对并执行保存的待检查项                                       |
| `refine-project`            | `refine_project`            | 在前一轮检查已记录后，以 run token 和新的 `instruction` 请求一次修正                                              |
| `resume-project-build`      | `resume_project_build`      | 在安全暂停且没有待检查项时，以 run token 和 `instruction` 发起一次新的 Builder 尝试                               |
| `inspect-project-run`       | `inspect_project_run`       | `{directory, run_id}`；读取运行事件链、预算、精确 run token 和项目投影状态，不启动进程                            |
| `adjust-project-run-budget` | `adjust_project_run_budget` | `{directory, run_id, expected, budget, reason}`；显式记录有限预算变更，不开始下一轮                               |

除 `inspect-project` 的目录参数外，上述 CLI 入口接收 JSON、JSON 文件或 `-` 标准输入；`--json` 用于结构化输出。例如：

```sh
tekvro create-project create.json --json
tekvro inspect-project /analysis/projects/demo --json
tekvro build-project build.json --json
tekvro inspect-project-run inspect-run.json --json
tekvro check-project check.json --json
```

CLI 将顶层 `directory`、`checker_path` 相对调用目录解析。`scope` 内路径、manifest 的可执行文件、输入文件与 `cwd` 仍须是本机绝对路径。MCP 直接使用契约要求的绝对路径。

项目令牌为 `{project_id, revision, digest}`，由创建/读取项目返回；运行令牌为 `{run_id, sequence, digest}`，位于运行结果的 `execution.token`。开始新 run 使用 project token；检查、修正、继续和预算调整使用 run token。发生冲突后先重新读取，不自行递增序号或复制旧摘要。

`edit_project` 不能直接写入执行终态或验收结论。当前九入口没有“标记已验收”或任意生命周期补丁操作。

## 3. 从一次构建到一次独立检查

1. 确认源文件摘要、候选目录、必要义务及外部验证器输入。创建项目后取得当前 project token。
2. 调用 `build_project`，给出本次明确指令、checker manifest 和有限预算。当前默认组合使用本机 `codex` 命令及已有配置；可显式选择 `model`。缺少程序、授权或所需能力会保留对应失败，不切换账号或换用其他 Agent。
3. 一次构建完成后，运行器保存候选内容身份和 `pending_check`。正常结果为 `phase=check`、`execution_status=paused`；此时检查尚未执行。只有完整观察到候选并固定检查输入，才建立该边界。
4. 可以关闭入口、重开项目，再通过 `inspect_project_run` 读取原 run。只要保存的输入仍匹配，调用 `check_project` 执行这份待检查项，Builder 不会因此重新运行。
5. 已记录检查后，可用 `refine_project` 请求下一次修正。它产生新的候选边界，需要再显式调用 `check_project`；没有自动无限修正循环。

下列是 `build.json` 的字段示意，尖括号部分必须替换为实际读取的身份，不能作为执行记录或直接通过 schema 的输入：

```json
{
  "directory": "/analysis/projects/demo",
  "expected": {
    "project_id": "<inspect_project 返回的 UUID>",
    "revision": 1,
    "digest": "<inspect_project 返回的摘要>"
  },
  "instruction": "在选定候选目录中实现已经固定的必要行为。",
  "checker_path": "/analysis/verifiers/demo/checker.json",
  "budget": {
    "wall_time_ms": 600000,
    "max_attempts": 1,
    "max_no_progress_attempts": 2
  }
}
```

后续 `check.json` 使用上次检查或读取得到的 run token：

```json
{
  "directory": "/analysis/projects/demo",
  "run_id": "<实际 run UUID>",
  "expected": {
    "run_id": "<同一 run UUID>",
    "sequence": 3,
    "digest": "<execution.token.digest>"
  },
  "checker_path": "/analysis/verifiers/demo/checker.json"
}
```

示例中的 `revision`、`sequence` 也必须采用实际返回值。是否存在待检查项以 `pending_check` 为准：同字节候选可能同时记录 `no_progress` 原因，但仍保存该候选的待检查项。

## 4. 外部 checker manifest 与结果协议

Manifest 是一个固定命令定义，不包含 shell 拼接或通用编排 DSL。所有路径使用绝对路径；所有摘要使用对应实际文件的 SHA-256。以下只展示格式：

```json
{
  "schema": "tekvro.project-checker",
  "schema_version": 1,
  "executable": {
    "path": "/absolute/path/to/node",
    "sha256": "<可执行文件的 64 位十六进制 SHA-256>"
  },
  "argv": [
    "/analysis/verifiers/demo/checker.mjs",
    "/analysis/verifiers/demo/scenario.json",
    "/analysis/verifiers/demo/expected.txt"
  ],
  "cwd": "/analysis/verifiers/demo",
  "inputs": [
    {
      "path": "/analysis/verifiers/demo/checker.mjs",
      "sha256": "<checker.mjs 的实际摘要>",
      "role": "checker"
    },
    {
      "path": "/analysis/verifiers/demo/scenario.json",
      "sha256": "<scenario.json 的实际摘要>",
      "role": "scenario"
    },
    {
      "path": "/analysis/verifiers/demo/expected.txt",
      "sha256": "<expected.txt 的实际摘要>",
      "role": "expected"
    }
  ],
  "environment": {},
  "success_exit_code": 0,
  "failure_exit_code": 1
}
```

至少声明一个 `checker` 和一个 `scenario` 输入。独立预期可以在场景中定义，也可通过 `expected` 文件另行固定。验证器依赖的脚本、场景、预期和配置需要完整声明；额外读取的未声明外部状态不能据此取得可重复性证明。服务核对 manifest 字节、声明文件和可执行文件摘要，拒绝重复/别名输入及落在候选树中的验证权威。

检查器只获得 manifest 显式环境以及服务生成的三个身份变量：`TEKVRO_PROJECT_CHECK_BINDING`、`TEKVRO_PROJECT_CHECK_ID` 和进程 owner 使用的 `REA_PROCESS_RUN_ID`。Manifest 不得覆盖这些变量，也不继承整个宿主环境。报告记录相关宿主身份、变量名和显式值的摘要，不保存整个环境。

检查器从 `TEKVRO_PROJECT_CHECK_BINDING` 解析 JSON，将它与 `TEKVRO_PROJECT_CHECK_ID` 原样回传；stdout 应只输出一个完整 JSON 文档：

```json
{
  "schema": "tekvro.project-check-result",
  "schema_version": 1,
  "check_id": "<本次 TEKVRO_PROJECT_CHECK_ID>",
  "binding": "<此处实际应为解析后的 binding 对象>",
  "checks": [
    {
      "requirement_id": "content",
      "status": "pass",
      "detail": "独立观察和比较的具体结果"
    }
  ]
}
```

此示意中的 `binding` 占位字符串必须换成完整对象。`checks` 至少有一项，必要义务必须全部出现；重复义务、未知义务、缺少义务、不同 invocation 或绑定不匹配均不会得到当前通过结果。单项状态只接受 `pass`、`fail`、`unknown`。

存在明确缺陷时，进程使用 manifest 的 `failure_exit_code`；没有失败项且检查完整时使用 `success_exit_code`，两者须不同。退出码与结构化结果不一致时保留 `unknown`。stderr 可保存正常诊断；stdout/stderr 截断、无效 UTF-8、超时、未取得完整输出或清理不完整都必须保留未知和原始观察。

完整、可重复执行的本地例子位于 `tests/fixtures/projectWorkflow.ts`：验证侧读取外部 `expected.txt`，实际比较候选 `answer.txt`。对应测试会故意植入缺陷，再恢复正确内容。这是独立 oracle 和进程边界的 fixture，不代表网页、Codex 或完整项目编排验收已经通过。

## 5. 预算、继续和取消

默认预算为累计执行时间 `600000` ms、最多一次 Builder 尝试、连续无进展上限两次。`max_attempts` 限制 Builder 尝试；检查仍需要剩余时间预算。完整候选摘要相同会累计无进展，重启、重写同样字节和改时间戳不会清零历史。

本服务自己的运行事件和检查日志保存在候选树之外，不会使候选摘要变化。摘要只识别候选内容变化，不证明功能得到改进；当前也没有对任意 Builder 写入候选树的日志文件进行语义分类。若 Builder 在树内改了日志，该变化仍可能改变候选摘要。因此 PWA-06 的完整语义仍需后续验证；有限预算和独立检查共同限制本轮执行，不能宣称已正确识别所有“只改日志”的无进展情况。

`adjust_project_run_budget` 只能在允许的空闲/暂停边界记录新的有限上限，并要求填写原因。它保留已耗时间、已有尝试次数、无进展计数和待检查绑定。上限表示累计额度，例如把 `max_attempts` 改成 `2` 表示总共允许两次；调整后还需要单独请求下一步。

| 保存的边界                                                      | 允许的下一步                                                                           |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pending_check` 存在、清理已确认                                | 按当前 run token 调用 `check_project`；预算不足时先显式调整                            |
| 已完成检查，需要修正                                            | `refine_project` 请求一次新的 Builder 尝试                                             |
| 安全暂停、清理已确认、没有 `pending_check`，仍处于 Builder 阶段 | `resume_project_build` 请求一次新尝试                                                  |
| Builder 超时且清理完成、候选与固定输入可完整复核                | 保存实际部分候选身份、原 Builder 阶段和累计预算；显式增量预算后可继续同一 run          |
| checker 超时且清理完成                                          | 保存 `paused / budget_exhausted`、原待检查绑定和未知报告；增加有限预算后可显式再次检查 |
| 取消已确认                                                      | 保存取消终态及已收集输出；本请求不开始下一轮                                           |
| owner 或清理未确认，或持久历史显示可能仍有未完成副作用          | 保留历史与 owner 标记，拒绝重放；不能凭 PID、文件年龄或删标记认定可以恢复              |

`resume_project_build` 是项目工作流中的一次新构建。当前 Codex adapter 的原会话 `resume` 尚未取得真实资格，并明确拒绝该能力；保存 session ID 不等于可以重接会话。

CLI 中断与服务关闭传递取消信号，进程仍由共享 owner 完成清理。Builder 和独立 checker 均启用本次 run-token 的进程清理，脱离原进程组但仍属本次调用的子进程不能被当作已释放。可能已经收集的输出、检查报告和已提交事件需要继续保存。若协调进程意外退出，最后持久状态可能仍是 `running` 或 `cancelling`；读取该记录不能证明进程现在还存活，也不能证明它已完成清理。

## 6. 如何理解结果与失败

运行输出包含 `project`、`execution`、`projection_status` 和可选 `check`。文件发布失败时，错误的 `partial_observation` 还可以保留真实 `builder_observation` 或 `unpublished_check`，以及用于重新读取的运行编号与令牌；未发布报告不附加虚构的保存路径或摘要。运行事件链是权威执行记录；项目元数据是摘要投影。`projection_status=outdated` 明确表示两者没有对齐，`inspect_project_run` 保持只读。

元数据发布失败不会撤销已经提交的运行事件。新 `build_project` 可以在实际发起新 run 前认证原活动 run 的权威日志；只有它已记录暂停或终止边界、且清理为 `complete` 或 `not_required`，才允许受控更新项目摘要后继续。该修复不会制造缺失的报告引用或验收通过；真实运行中或清理未知的旧 owner 仍阻止新写入。

单次检查报告绑定项目、run、源摘要、`scope_revision`、范围/必要义务、完整候选、checker、场景和环境，并另以报告路径与 SHA-256 验证原始字节。同一范围改成 B 再改回 A 仍产生新的 `scope_revision`。候选、源、验证器或环境变化时，旧报告只保留为历史；当前适用性降为 `stale` 或 `unknown`。

`execution_failure_reason` 保存 `cancelled`、`timeout`、`output-limit`、`process` 或 `null`，原始文字仍在 `execution_failure`。消费者应使用机器字段分类，并保留 stdout、stderr、实际退出、截断和清理事实。

本切片的正常检查可以记录 `last_check_status=pass/fail/unknown`，并使本次执行成为 `succeeded`。项目与 run 的全局验收仍保留 `unknown`；未执行检查的边界保留 `not_evaluated`。当前没有将报告自动汇总为重建 ledger 闭合或全局 `acceptance_status=pass/fail` 的路径。

## 7. 当前资格、复跑与维护

| 范围                                                                          | 当前记录                                                                                                                     |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| M0 项目契约、持久化与接口                                                     | PW-01 所负责的 PWA-01/11/16 子范围已验收；首个 v1 无已发布旧格式需迁移，历史迁移 N/A                                         |
| 外部 checker、原始输出、负向对照、候选/证明失效、取消/超时                    | 本地及所列 Linux CI 的真实 Node 进程边界通过；覆盖固定文件 fixture                                                           |
| RunService 的恢复、并发、预算、取消与投影故障                                 | 所列 Linux CI 实际运行通过，包含原本地跳过的 19 项；Builder 为明确标注的 Node fixture                                        |
| Workspace 的归属与恢复                                                        | 所列 Linux CI 实际运行通过，包含原本地跳过的 5 项；覆盖路径/inode、独立 owner 标记与未知清理边界                             |
| 真实 Codex Builder                                                            | 最小写入在原宿主初始化时因 Read-only file system (os error 30) 失败；写入/恢复资格仍未通过                                   |
| CLI/MCP                                                                       | 九入口共用 domain/contracts/application；已有跨入口执行 fixture 在真实 transport 与租约上通过，不能外推真实 Agent 端到端资格 |
| 网页/H5、多视口、动态 mask、完整 reconstruction ledger、工作台、桌面/游戏扩展 | 继续按 PW-05、PW-07、PW-09 等完整门槛推进；本轮没有取得这些范围的验收结论                                                    |

2026-11-10 的本地历史记录为项目相关唯一用例 90 项实际通过、25 项因真实 socket 权限拒绝跳过。通过项包括纯领域/持久化、独立 checker、明确标注的 Codex 协议 fixture 与真实只读 CLI/MCP；25 项由 RunService 19 项、Workspace 5 项及跨 transport 执行 1 项组成。保留这份记录，不把后续 CI 成功回写为当时本地通过。

[PR #62](https://github.com/ForceMind/Tekvro/pull/62) 的最终代码来源为 `ba49ea0fb7f6c0e2050b4a83a26bc6e98eb571cf`，合并提交为 `7631020d85d665466e6584378dcc3689f389dd18`。[该来源 CI 工作流](https://github.com/ForceMind/Tekvro/actions/runs/42767419422) 实际检出 `2a31775269fe974c14f5e34b6abf19412dabb04a`，便携测试汇总为 33,997 项通过、234 项跳过；项目相关用例实际为 119 项通过、0 项跳过，原本地受阻的 25 项已逐项执行通过。[核心实测](https://github.com/ForceMind/Tekvro/actions/runs/42767419307) 的实际执行提交为 `2a31775269fe974c14f5e34b6abf19412dabb04a`。宿主、命令、来源对应和各项目测试文件的明细见[最终资格记录](project-workflow-acceptance.md)。这些记录不包含真实 Codex 生成、网页闭环或实际发行包资格。

仓库已有的精确验证入口：

```sh
npm run typecheck
npm run test:focused -- tests/boundary/process/projectCheckService.test.ts tests/boundary/process/projectRunService.test.ts
```

`test:focused` 按仓库规则准备构建前置。退出码为零仍须读取通过/跳过明细。真实 `listen` 拒绝只标记当前宿主受阻，不替换为内存锁后把场景计为通过；共享前置检查位于 `tests/fixtures/projectWorkflow.ts` 与 `tests/fixtures/projectLeaseCapability.ts`。

维护时从以下来源核对行为，精确来源提交、CI、发行包与跨平台资格继续记录在验收/发行文档中：

- 输入与输出：`src/domain/projectExecution.ts`、`src/domain/projectRun.ts`、`src/domain/projectCheckBinding.ts`、`src/domain/projectCheckReport.ts`。
- 注册与副作用：`src/contracts/projectToolContracts.ts`、`src/contracts/projectRunToolContracts.ts`、`src/cli/projectCommands.ts`、`src/cli/projectRunCommands.ts`。
- 执行与恢复：`src/application/project/ProjectRunService.ts`、`ProjectRunState.ts`、`ProjectBuildStage.ts`、`ProjectCheckStage.ts`、`ProjectWorkspace.ts`。
- 独立检查：`src/application/project/ProjectCheckService.ts`、`ProjectCheckInputs.ts`、`ProjectCheckProtocol.ts`、`ProjectCandidate.ts`。
- Codex 边界：`src/providers/codex/CodexBuilderAdapter.ts`；安装探测结果的资格保持 `unverified`，实际构建另行确认。
- 可执行 fixture：`tests/fixtures/projectWorkflow.ts`、`tests/fixtures/projectFixtureBuilder.ts`。后者明确是 Node 写文件替身，不是一次真实 Agent 运行。

真实浏览器、真实 Agent、完整义务闭合、平台与发行包资格仍分别需要证据。新增入口或若干 fixture 通过不会关闭 M1，也不扩大既有发行的支持声明。

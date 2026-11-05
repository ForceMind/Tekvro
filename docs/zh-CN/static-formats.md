# 静态格式分析：IL2CPP、GPU、模型与字节码

以下命令检查调用方选择的本地文件，返回结构化 Evidence。先从本仓库构建 Tekvro，使用当前 checkout 的入口；这些静态检查不要求安装 Unity、CUDA/ROCm、Python、Erlang 或商业逆向引擎。

```bash
TEKVRO_LANG=zh-CN node scripts/rea.mjs inspect-il2cpp-metadata --help
TEKVRO_LANG=zh-CN node scripts/rea.mjs inspect-gpu-code-objects --help
TEKVRO_LANG=zh-CN node scripts/rea.mjs inspect-model-artifact --help
TEKVRO_LANG=zh-CN node scripts/rea.mjs inspect-python-pyc --help
TEKVRO_LANG=zh-CN node scripts/rea.mjs inspect-erlang-beam --help
```

`TEKVRO_LANG=en` 显示英文帮助。PowerShell 中先设置 `$env:TEKVRO_LANG = "zh-CN"`，再执行 `node scripts/rea.mjs ...`。命令、参数、枚举值和 JSON/MCP 字段均使用原有机器协议名称。

## Unity IL2CPP

```bash
node scripts/rea.mjs inspect-il2cpp-metadata /artifacts/global-metadata.dat --json
node scripts/rea.mjs inspect-il2cpp-metadata /artifacts/global-metadata.dat \
  --binary /artifacts/GameAssembly.dll --json
```

可读取受支持布局的元数据版本 24、27、29、31、39，列出程序集、类型、成员及字符串的名称、归属和索引。相同版本号不保证任意 Unity 布局兼容；不支持的布局会被拒绝。`--binary` 只读匹配的 Mach-O、PE 或 ELF 二进制以关联方法地址，不执行目标。

需要给 Ghidra 提供函数起点时，可显式指定 `--ghidra-seeds /output/method-seeds.tsv`，并提供 `--binary`；此选项会写出种子文件，不启动 Ghidra。`--seed-base` 只能配合种子导出使用，地址按基址加 RVA 计算。`--generic-instances` 可包含已关联的泛型方法实例。名称与地址关联不能证明已恢复原始 C# 源码。布局、地址及 retained 分页范围见 [IL2CPP 技术说明](../il2cpp-metadata.md)。

## CUDA/HIP 静态清单

```bash
node scripts/rea.mjs inspect-gpu-code-objects /artifacts/library.so --json
node scripts/rea.mjs inspect-gpu-code-objects /artifacts/kernel.ptx \
  --analysis kernels --json
```

默认 `inventory` 列出 ELF/PE 内嵌目标、CUDA fatbin、CUBIN、PTX 或 HIP 包中的代码对象；`kernels` 解码所选内核元数据。`--targets` 接受精确目标声明的 JSON 数组。若按 `--object_ids` 选择对象，必须同时提供上次清单的 `--expected_sha256`；文件变化会拒绝继续使用旧对象 ID。

返回的寄存器、参数、共享内存等字段取决于表示和已解码范围。未选择或不支持的载荷保留未检查、部分覆盖或未知状态；空分页不能证明所有载荷都没有该内核。检查不执行 GPU 代码，也不建立实际设备性能或主机调用关系。详见 [GPU 技术说明](../gpu-code-objects.md)。

## GGUF / safetensors

```bash
node scripts/rea.mjs inspect-model-artifact /artifacts/model.gguf --json
node scripts/rea.mjs inspect-model-artifact /artifacts/model.safetensors --hash full --json
```

按内容识别格式，读取模型声明、张量目录和存储范围，不加载权重、不运行推理。支持范围为 GGUF 小端 v2/v3、大端 v3 和 safetensors；不支持的 GGUF 版本或字节序组合会被拒绝。

默认 `--hash header` 只读取声明区域，文件头摘要不能代表全部模型权重；完整文件 SHA-256 保持未知。`--hash full` 额外流式读取整个文件，成本随文件大小增长，但仍不解释权重。无法唯一判定的量化布局保留未知字节长度和覆盖限制。详见 [模型技术说明](../model-artifacts.md)。

## Python pyc / Erlang BEAM

```bash
node scripts/rea.mjs inspect-python-pyc /artifacts/module.pyc --json
node scripts/rea.mjs inspect-erlang-beam /artifacts/app.beam --json
```

pyc 检查固定表中受支持的 CPython 3.7–3.13 magic、文件头与 marshal 代码对象；不是对任意 Python 版本的反编译。BEAM 检查 IFF 区块、原子表、导入、导出及 Code 头。两者均不执行字节码，也不承诺恢复原始源码。

pyc 的 `--max-file-bytes`、`--max-objects`、`--max-depth`、`--max-string-bytes` 和 BEAM 的 `--max-file-bytes`、`--max-chunks`、`--max-atoms` 复用工具自身的预算、默认值和上限。超出预算会失败，不将截断分析包装为成功；摘要输出也不会取消解析预算。格式细节见 [pyc](../python-pyc.md) 和 [BEAM](../erlang-beam.md)。

## 摘要、分页与可追溯证据

本节适用于前述 IL2CPP、GPU、模型、pyc 和 BEAM 命令；WASM 与 SQLite 的独立入口见后文。

CLI 默认返回完整 Evidence。这五类命令均可通过 `--detail summary --evidence_output /output/new-evidence.json` 返回摘要并保存完整证据包；目的文件必须不存在，避免覆盖已有记录。

```bash
node scripts/rea.mjs inspect-model-artifact /artifacts/model.gguf \
  --detail summary --evidence_output /output/model-evidence.json \
  --view '{"collection":"tensors","offset":0,"limit":20}' --json
```

`--view` 的结构按格式区分：模型/GPU 使用各自的集合选择；pyc 使用 `kind: "python-pyc"`，BEAM 使用 `kind: "beam"`。它需要摘要输出及完整证据包目的路径。IL2CPP CLI 没有 `--view` 参数，可通过 MCP 或已保存 Evidence 的 `inspect-analysis-view` 查询。

对应 MCP 工具为 `inspect_il2cpp_metadata`、`inspect_gpu_code_objects`、`inspect_model_artifact`、`inspect_python_pyc`、`inspect_erlang_beam`，MCP 文件路径必须是绝对路径。按当前工具契约选择 `detail`，摘要的 `normalized_result.parent_evidence_id` 指向完整父证据。使用该 ID 与 `inspect_analysis_view` 查询同一会话中保留的事实；离线查询使用导出的证据包，不假设另一会话仍保存该 ID。源覆盖范围、分页覆盖和实际宿主验证是不同事实，不能相互替代。

### 离线检查证据包与查询父证据

在上面的模型导出成功后，可以先检查包内的发现元数据：

```bash
TEKVRO_LANG=zh-CN node scripts/rea.mjs inspect-evidence-bundle --help
TEKVRO_LANG=zh-CN node scripts/rea.mjs inspect-analysis-view --help
node scripts/rea.mjs inspect-evidence-bundle '{"path":"/output/model-evidence.json","detail":"summary"}' --json
```

将导出结果中真实的 `summary.normalized_result.parent_evidence_id` 填入下面的 `evidence_id`，保存为 `query.json`。`<实际父证据ID>` 是占位符，不能直接当成已存在的 ID 使用。

```json
{
  "source": { "kind": "retained-evidence", "evidence_id": "<实际父证据ID>" },
  "view": {
    "kind": "model-artifact",
    "collection": "tensors",
    "offset": 0,
    "limit": 20
  }
}
```

```bash
node scripts/rea.mjs inspect-analysis-view query.json --evidence-bundle /output/model-evidence.json --json
```

模型分页行位于 `normalized_result.items`。CLI 从指定包查找精确父证据，不重新打开模型；原模型删除后仍可查询已保存的事实。不要把证据包 ID、派生摘要的 Evidence ID 或其他会话的 ID 替代父证据 ID。包被修改、来源缺失或不符合当前契约时，应读取真实错误并保留原文件，不能补造记录来使查询成功。

## WASM 静态检查与接口比较

```bash
TEKVRO_LANG=zh-CN node scripts/rea.mjs inspect-wasm-artifact --help
TEKVRO_LANG=zh-CN node scripts/rea.mjs compare-wasm-interfaces --help
node scripts/rea.mjs inspect-wasm-artifact /artifacts/module.wasm --json
```

WASM 检查需要配置受支持的 WABT 工具；具体版本、配置与验证边界见 [WASM 技术说明](../wasm-artifacts.md)。它读取所选文件，不执行 WASM。`--glue_paths` 选择本地 JavaScript 胶水代码，`--candidate_paths` 选择本地 WASM 候选文件，引用不会触发下载。`--command-timeout-ms` 默认 30000，分别约束每条版本探测或分析命令；整次检查还包括多条命令、文件检查和清理，客户端总时限应留出余量。延长超时不提高固定输入/输出限制。

接口比较接受包含 `left`、`right` 和 `scope` 的 JSON 文件；两侧须放入真实 `inspect_wasm_artifact` 生成的完整 Evidence，而不是摘要、Evidence ID 或 `.wasm` 路径。`scope` 必须显式选择 `imports`、`exports` 或 `both`。

```bash
node scripts/rea.mjs compare-wasm-interfaces /artifacts/compare.json --json
```

比较基于已有证据中的核心接口，不重新检查目标或执行模块；接口一致不能证明程序行为一致。输入覆盖不足时保留限制，不能据此宣布整个模块完全兼容。

## SQLite 离线快照

```bash
TEKVRO_LANG=zh-CN node scripts/rea.mjs inspect-sqlite-database --help
node scripts/rea.mjs inspect-sqlite-database /artifacts/app.db --json
node scripts/rea.mjs inspect-sqlite-database /artifacts/app.db \
  --table levels --column id --column name --row-limit 10 --json
```

选择已稳定保存的离线数据库快照；需要 WAL 时保留同目录、同名前缀的 `app.db-wal`。先停止写入，或通过应用自身的备份流程取得一致的数据库/WAL 对；直接复制活跃文件不建立原子快照。工具获取私有副本用于检查，保留数据库与 WAL 的身份及覆盖事实，不替调用方完成在线应用的一致性备份。运行时要求及格式限制见 [SQLite 技术说明](../sqlite-databases.md)。

不选表时默认返回精简结构清单；选择精确普通表名后默认返回该表结构及最多 20 行样本。重复 `--column` 按所选顺序返回列；`--row-limit`、`--column` 和 `--schema-scope selected_table` 均要求 `--table`。`--schema-scope database` 显式展开数据库结构，不代表读取所有表行；不执行视图、虚拟表或影子表。

`--worker-timeout-ms` 默认 30000，覆盖工作进程启动、查询和写出回复，不包含快照获取及整个调用的读取、清理和交付时间。增加行数或超时仍受固定字节、堆及工作进程预算约束；行样本不能证明整表或数据库内容完整。

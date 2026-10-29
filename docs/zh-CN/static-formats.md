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

CLI 默认返回完整 Evidence。上述命令均可通过 `--detail summary --evidence_output /output/new-evidence.json` 返回摘要并保存完整证据包；目的文件必须不存在，避免覆盖已有记录。

```bash
node scripts/rea.mjs inspect-model-artifact /artifacts/model.gguf \
  --detail summary --evidence_output /output/model-evidence.json \
  --view '{"collection":"tensors","offset":0,"limit":20}' --json
```

`--view` 的结构按格式区分：模型/GPU 使用各自的集合选择；pyc 使用 `kind: "python-pyc"`，BEAM 使用 `kind: "beam"`。它需要摘要输出及完整证据包目的路径。IL2CPP CLI 没有 `--view` 参数，可通过 MCP 或已保存 Evidence 的 `inspect-analysis-view` 查询。

对应 MCP 工具为 `inspect_il2cpp_metadata`、`inspect_gpu_code_objects`、`inspect_model_artifact`、`inspect_python_pyc`、`inspect_erlang_beam`，MCP 文件路径必须是绝对路径。按当前工具契约选择 `detail`，摘要的 `normalized_result.parent_evidence_id` 指向完整父证据。使用该 ID 与 `inspect_analysis_view` 查询同一会话中保留的事实；离线查询使用导出的证据包，不假设另一会话仍保存该 ID。源覆盖范围、分页覆盖和实际宿主验证是不同事实，不能相互替代。

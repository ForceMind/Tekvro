# 诊断与固件检查

本页新增中文帮助和严格整数词法对应当前开发源码。已安装版本请结合发行说明与 `tekvro --version` 核对具体能力。

## 按任务读取环境报告

先确认当前入口的版本，再检查准备使用的能力。

```bash
tekvro --version
TEKVRO_LANG=zh-CN tekvro capabilities --help
tekvro capabilities --json
tekvro doctor --json
```

`capabilities` 返回当前会话状态和能力清单，包含可用条件与作用范围。未打开目标时，`open` 可以是 `false`。这些信息用于选择后续操作，实际分析结果仍需由所选操作产生。

默认 `doctor` 检查环境和检测到的集成。可以按任务指定引擎或客户端，减少无关诊断对本次就绪结论的影响。

```bash
tekvro doctor --provider ghidra --json
tekvro doctor --client codex --json
```

显式选择的范围出现在 `scope`，对应检查在 `scope_checks`。其余检查位于 `informational_checks`。`healthy` 和退出码反映所选范围，`environment_healthy` 描述整体环境。检查失败时退出码为 1，JSON 报告仍可读取。关注失败项的 `classification`、`detail` 和 `remediation`，按实际缺失条件修复后重新运行相同范围。

例如，未设置分析引擎目录时，对应项会报告 `missing_analysis_engine` 和配置指引。该诊断只说明本次依赖检查失败。各项功能的执行条件和系统范围见[安装与配置](../installation.md)。

## 区分参数错误与执行失败

命令行的独立整数选项使用十进制整数字面值，例如 `120000`。带前导零的十进制数也可使用。`0x10`、`1e3`、`+16`、`16.0` 和带空白的数值会在参数边界被拒绝。各选项的最小值、最大值及默认值继续遵守命令自己的约束。地址等字符串选项使用各命令规定的文本格式。

```bash
TEKVRO_LANG=zh-CN tekvro extract-firmware --help
tekvro extract-firmware /absolute/path/firmware.bin /absolute/path/new-output \
  --max-depth 0x10 --json
```

将示例路径替换为本地路径。上例中的非法深度会得到 `VALIDATION_ERROR`，`fieldErrors` 指向 `maxDepth`，此时不会派发提取操作。修正为合法整数后，流程继续检查输入文件、范围、引擎、资源和输出位置，后续检查可能返回其他明确失败。

操作已派发后的错误使用结构化错误分类。查看 `code`、`category`、`retryable`、`details` 和可用的恢复指引。收集到的部分观察及未完成清理也可能随错误返回，完整性与清理状态需要一并阅读。

## 固件签名检查与提取

这些命令读取选定的本地固件。签名检查与提取分别依赖已配置的外部工具，当前真实固件验证通道要求 Linux，以及指定版本的 Binwalk、Unblob 和 7z。准备方法、版本和完整边界见[固件分析](../firmware-analysis.md)。其他宿主和真实设备应使用各自的验收记录判断支持范围。

```bash
tekvro inspect-firmware-regions /absolute/path/firmware.bin \
  --analysis-timeout-ms 120000 --json
tekvro extract-firmware /absolute/path/firmware.bin /absolute/path/new-output \
  --offset 0 --length 4096 --max-depth 3 \
  --analysis-timeout-ms 120000 --publication-timeout-ms 120000 --json
```

`offset` 与 `length` 必须成对提供，长度须大于零，范围必须落在输入文件内。省略二者选择整个文件。输出目录须尚不存在，其父目录须已存在。发布使用独占输出规则，已存在的目录会被拒绝。

`analysis-timeout-ms` 覆盖工具解析及分析阶段，检查操作包含最终工作目录清理，提取操作到清单完成为止。它不包含排队和提取后的发布。`publication-timeout-ms` 为提取后的发布及最终清理设置独立预算。增加时间不会提高固定 CPU、内存或字节限制。

`max-depth` 达到深度上限时可能返回部分覆盖。`max-output-bytes` 限制暂存文件字节，检查间隔内可能短暂超出。`max-output-files` 的条目数包含目录与链接。读取结果中的覆盖范围、提取缺口和来源后，再判断是否满足本次调查目标。

MCP 的对应工具是 `inspect_firmware_regions` 与 `extract_firmware`。它们接受领域契约中的 JSON 数字及绝对路径。CLI 文本参数适配的检查、命令能启动和协议测试分别提供各自范围的验证；真实引擎、目标设备和具体提取行为仍须独立执行。

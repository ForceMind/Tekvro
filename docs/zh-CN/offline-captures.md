# 离线抓包与信号录制分析

Tekvro 可以检查已经保存的 pcap/pcapng 网络捕获，并使用调用方提供的 sigrok 解码信号录制。这里的流程读取已有文件，不启动网络抓包，也不连接逻辑分析仪采集硬件信号。

先完成[源码构建](./quick-start.md)。以下命令均在仓库根目录运行；文件和工具路径应替换为本机已有的绝对路径。Tekvro 不会自动安装 Wireshark、sigrok 或系统依赖。

## 网络捕获

| 命令                   | 用途                                                       |
| ---------------------- | ---------------------------------------------------------- |
| `inspect-pcap-client`  | 检查指定的 tshark 与 capinfos 程序，不读取捕获文件         |
| `inspect-pcap-capture` | 检查一个 pcap/pcapng 文件中的端点、DNS、TLS SNI 与协议分布 |

捕获内容分析的资源隔离目前面向 Linux（util-linux `prlimit`）与 Windows（受控 Job Object）。macOS 可查看帮助，但不能据此宣称捕获内容分析已受支持。Linux 可通过 `REA_TSHARK_PRLIMIT_COMMAND` 指定资源限制程序，默认 `/usr/bin/prlimit`。

通过 `REA_TSHARK_COMMAND` 和 `REA_CAPINFOS_COMMAND` 分别选择 tshark、capinfos 的绝对路径。配置错误时，命令会说明缺失的工具或无效路径；应先修正配置，再检查文件。

```bash
TEKVRO_LANG=zh-CN node scripts/rea.mjs inspect-pcap-client --help
TEKVRO_LANG=zh-CN node scripts/rea.mjs inspect-pcap-capture --help
node scripts/rea.mjs inspect-pcap-client --json
node scripts/rea.mjs inspect-pcap-capture /absolute/path/to/capture.pcapng --json
```

端点和协议元数据来自所选捕获文件。TLS SNI 不等于解密后的 HTTPS 内容，缺少某项字段也不能直接证明对应行为从未发生。

## 信号录制

当前解码流程要求 Linux、带 libsigrokdecode 的 sigrok-cli 0.7.2，以及 util-linux 的 `prlimit`。使用 `REA_SIGROK_COMMAND` 指定 sigrok-cli 的绝对路径；`REA_SIGROK_PRLIMIT_COMMAND` 默认是 `/usr/bin/prlimit`。其他平台的命令帮助可查看，实际解码支持以提供方检查及验收记录为准。

```bash
TEKVRO_LANG=zh-CN node scripts/rea.mjs inspect-signal-decoders --help
TEKVRO_LANG=zh-CN node scripts/rea.mjs decode-signal-recording --help
node scripts/rea.mjs inspect-signal-decoders --query uart --limit 10 --json
node scripts/rea.mjs inspect-signal-decoders --decoder uart --json
node scripts/rea.mjs decode-signal-recording /absolute/path/to/recording.vcd --decoders 'uart:rx=RX:baudrate=9600' --json
```

先用 `inspect-signal-decoders` 确认已安装的解码器和具体选项，再按录制文件的通道名称设置 `--decoders`。示例中的 `RX` 和波特率需要与实际录制匹配，不能从文件扩展名推断。

| 选项                             | 含义                                                    |
| -------------------------------- | ------------------------------------------------------- |
| `--decoder`                      | 已安装解码器的准确 ID；省略时搜索目录                   |
| `--query`                        | 不区分大小写的字面子串筛选，适用于目录与帮助行          |
| `--offset` / `--limit`           | 跳过匹配项、限制返回数量；默认从 0 开始、最多返回 50 项 |
| `--all`                          | 返回全部剩余匹配项，与 `--limit` 互斥                   |
| `--input_format`                 | 明确指定输入格式和选项；省略时自动识别                  |
| `--annotations`                  | 选择注解，例如 `uart=rx-data`                           |
| `--line_offset` / `--line_limit` | 按 LF 分隔的输出行分页，默认跳过 0 行、返回 50 行       |
| `--all_lines`                    | 返回全部剩余输出行，与 `--line_limit` 互斥              |

目录分页选项用于 `inspect-signal-decoders`；输入格式、注解和输出行分页选项用于 `decode-signal-recording`。全部返回仍受提供方的输出、时间和资源约束。输出行数不是注解或采样数量；注解文本也不是无损的二进制协议表示。

## 证据与语言

`TEKVRO_LANG=zh-CN` 选择中文人类帮助，`TEKVRO_LANG=en` 选择英文。命令名、带下划线的选项名、JSON 字段和 MCP 工具 ID 保持英文。共享诊断信息尚未全部翻译。

将文件身份、工具版本、筛选条件和结果限制一同保留，再解释分析结论。更多资料见 [CLI 与 Evidence](../cli.md)、[测试与真实提供方验收](../testing.md)和[安全与授权](./security.md)。

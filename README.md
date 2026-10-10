# Tekvro · 探核

**用证据看懂软件。**  
ForceMind 独立开发、简体中文优先的本地软件检查工具。

> **v0.1.0 · 原创基础版**。这是全新编写的代码库，不是第三方逆向工程项目的换皮或重新署名。本版本只实现文件证据检查和一个只读 MCP 入口；高级反编译、自动还原源代码、网站 UI、APK 解包等尚未实现。

[English](README.en.md) · [架构](docs/ARCHITECTURE.md) · [路线图](docs/ROADMAP.md) · [安全](docs/SECURITY.md)

## 当前能做什么？

- 查看目录下的文件类型、大小与汇总统计；不执行待检程序。
- 读取文件头识别 ELF、PE、Mach-O、WebAssembly、ZIP、PDF、PNG、GZIP、SQLite 等格式。
- 计算单个文件的 SHA-256，用于记录和复核证据。
- 按请求提取前 1 MiB 的可打印 ASCII 字符串（**可能含有敏感信息，调用前须确认授权**）。
- 通过 MCP stdio 为 Codex、Claude Code 等兼容客户端提供 `scan_directory`、`inspect_file`、`extract_strings` 只读工具。
- 对目录进行真实路径边界检查，阻止 `../` 越界访问和指向根目录之外的符号链接。
- 默认不访问网络、不执行被分析的文件、不自动安装外部工具。

## 运行要求

Node.js **22 或更新版本**。第一版没有任何运行时第三方依赖。

```bash
git clone https://github.com/ForceMind/REA.git
cd REA
node --version
npm test

# 检查本机环境与分析根目录
node bin/tekvro.mjs doctor --json

# 只读分析授权目录（默认为当前目录）
node bin/tekvro.mjs scan . --max-files 50 --json

# 检查某个文件的格式和 SHA-256
node bin/tekvro.mjs inspect package.json --json

# 显式提取字符串（请注意可能包含敏感数据）
node bin/tekvro.mjs strings package.json --min-length 6 --limit 20 --json
```

若要检查其他位置，请显式指定 `--root /absolute/path/to/allowed-directory`，并使用该根目录内的相对路径。

## 配置 MCP

MCP **必须**提供 `TEKVRO_ROOT`，不提供时拒绝启动。以下为客户端通用的 stdio 配置示例，请把路径改成你本机的绝对路径：

```json
{
  "mcpServers": {
    "tekvro": {
      "command": "node",
      "args": ["/absolute/path/to/tekvro/bin/tekvro.mjs", "mcp"],
      "env": {
        "TEKVRO_ROOT": "/absolute/path/to/authorized/artifacts",
        "TEKVRO_LANG": "zh-CN"
      }
    }
  }
}
```

本项目实现了 MCP 的 stdio JSON-RPC 工具子集，支持经典初始化接口与新版本发现接口；**完整 MCP 兼容性尚待更多客户端实测**。

## 项目目录

```text
bin/tekvro.mjs       原创命令行入口
src/scope.mjs        根目录约束与输入验证
src/inspect.mjs      文件签名、哈希、字符串、目录扫描
src/cli.mjs          CLI 操作与中文提示
src/mcp.mjs          本地只读 MCP 服务
tests/               Node 内置测试
docs/                技术架构、路线图与安全说明
.github/workflows/   跨平台自动化测试
```

## 使用边界

只分析你拥有或获得授权的软件。你可以独立维护、扩展这份源代码；当前版本没有公开发布计划。仓库配置 `private: true`、`license: UNLICENSED`，不自动向 npm 及 MCP Registry 发布。

当前项目的产品名为 **Tekvro（探核）**，维护者 **ForceMind**。仓库 URL 暂时沿用现有的 `ForceMind/REA`，产品完全重建后可迁移到全新的独立仓库并重建 Git 历史。

# Tekvro 架构概览

**问题：** 一个 AI Agent 如何有证据地说明某个已发布软件的结构和行为？

```text
用户 / AI Agent
     │ MCP / CLI
     ▼
  Tekvro 接口层（src/main.ts、src/cli.ts）
     │
     ▼
  应用工作流（src/application/）
     ├── 调查流程与上下文
     ├── 证据、局限与未知项
     └── 分析任务组合
     │
     ▼
  领域与契约（src/domain/、src/contracts/）
     │
     ▼
  专用适配器：Hopper / Ghidra / IDA / Browser / JS / .NET / Android ...
     │
     ▼
  用户有权检查的软件、制品或运行时
```

## 设计原则

1. **Evidence first**：先观察再推断，标明未知；不能把代码外推当成已证实的事实。
2. **Agent controls tools**：MCP/CLI 只提供受约束的分析能力，AI 自行规划调查路径，工具不能凭空创造其无法读取的数据。
3. **Local-first**：原始目标本地检查，不代表连接到云端的 Agent 不会传送报告；应单独确认模型的隐私与数据处理。
4. **Provider separation**：底层逆向引擎遵循各自的系统依赖、许可证、安全边界。
5. **Stable protocol**：CLI 命令、MCP 工具名和注册文件属于调用兼容性边界，品牌独立不能直接用全局替换破坏。

## 目录

- `src/application/`：协调工作流
- `src/contracts/`：工具契约
- `src/domain/`：领域类型、逻辑
- `src/server/`：MCP 适配
- `src/cli/`：CLI 功能
- `src/ghidra/`、`src/hopper/`、`src/browser/`：提供方
- `bridge/`：桥接层
- `tests/`：契约、单元、真实工具测试
- `skill-src/`：Agent 操作指引

详见 [原架构示意](../architecture.mermaid) 与 [工具契约（英文）](../mcp-contracts.md)。

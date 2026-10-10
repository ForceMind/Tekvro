import { openScope, TekvroError } from "./scope.mjs";
import { extractStrings, inspectFile, scanDirectory } from "./inspect.mjs";
import { startMcpServer } from "./mcp.mjs";

const chinese = () => !(process.env.TEKVRO_LANG ?? "zh-CN").toLowerCase().startsWith("en");
const translated = (zh, en) => chinese() ? zh : en;
const helpText = () => translated(
`Tekvro 探核 0.1.0 · 独立原创、本地只读软件检查
用法：
  tekvro doctor [--json] [--root 目录]
  tekvro scan [目录] [--max-files 数量] [--json] [--root 目录]
  tekvro inspect <文件> [--json] [--root 目录]
  tekvro strings <文件> [--min-length 数量] [--limit 数量] [--json]
  tekvro mcp             （必须设置 TEKVRO_ROOT）
  tekvro help

所有目标必须位于分析根目录内。默认根目录为当前工作目录。
通过 TEKVRO_ROOT 指定根目录、TEKVRO_LANG=en 切换英文帮助。
本软件不执行目标文件，也不连接网络。`,
`Tekvro 0.1.0 · Original, read-only local software inspector
Commands:
  tekvro doctor [--json] [--root directory]
  tekvro scan [directory] [--max-files count] [--json] [--root directory]
  tekvro inspect <file> [--json] [--root directory]
  tekvro strings <file> [--min-length count] [--limit count] [--json]
  tekvro mcp             (requires TEKVRO_ROOT)
  tekvro help
Targets must remain under the analysis root (default: current directory).
Set TEKVRO_LANG=zh-CN for Chinese help. No execution or network access.`
);

function parseArguments(args) {
  const options = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const part = args[i];
    if (part === "--json") { options.json = true; continue; }
    if (["--root", "--max-files", "--min-length", "--limit"].includes(part)) {
      const value = args[++i];
      if (value === undefined || value.startsWith("--")) {
        throw new TekvroError("invalid_argument", `缺少 ${part} 的参数`);
      }
      const key = part.slice(2).replaceAll("-", "_");
      options[key] = part === "--root" ? value : Number(value);
      continue;
    }
    if (part.startsWith("--")) throw new TekvroError("invalid_argument", `未知参数 ${part}`);
    positional.push(part);
  }
  return { options, positional };
}

const print = (output, data, json, label) => {
  if (json) output.write(JSON.stringify(data, null, 2) + "\n");
  else output.write((label ? label + "\n" : "") + JSON.stringify(data, null, 2) + "\n");
};

export async function runCli(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const [command = "help", ...rest] = argv;
  try {
    if (command === "help" || command === "--help" || command === "-h") {
      stdout.write(helpText() + "\n");
      return 0;
    }
    const { options, positional } = parseArguments(rest);
    if (command === "mcp") {
      if (positional.length) throw new TekvroError("invalid_argument", "mcp 不接受目标路径");
      await startMcpServer({ root: options.root ?? process.env.TEKVRO_ROOT });
      return 0;
    }
    const scope = await openScope(options.root ?? process.env.TEKVRO_ROOT ?? process.cwd());
    if (command === "doctor") {
      const data = { application: "Tekvro", version: "0.1.0", status: "ready",
        root: scope.root, mode: "local-read_only", mcp_needs_explicit_root: true };
      print(stdout, data, options.json, translated("环境检查", "Environment check"));
      return 0;
    }
    if (command === "scan") {
      const data = await scanDirectory(scope, positional[0] ?? ".", { max_files: options.max_files });
      print(stdout, data, options.json, translated("目录概况", "Directory inventory"));
      return 0;
    }
    if (command === "inspect") {
      if (positional.length !== 1) throw new TekvroError("invalid_argument", "inspect 需要指定一个文件");
      print(stdout, await inspectFile(scope, positional[0]), options.json,
        translated("文件检查结果", "File inspection"));
      return 0;
    }
    if (command === "strings") {
      if (positional.length !== 1) throw new TekvroError("invalid_argument", "strings 需要指定一个文件");
      print(stdout, await extractStrings(scope, positional[0], {
        min_length: options.min_length, limit: options.limit,
      }), options.json, translated("可打印字符串", "Printable strings"));
      return 0;
    }
    throw new TekvroError("unknown_command", `未知命令：${command}`);
  } catch (error) {
    const failure = error instanceof TekvroError ? error :
      new TekvroError("internal_error", "操作失败，请检查路径、权限和输入参数");
    stderr.write(JSON.stringify({ error: { code: failure.code, message: failure.message } }) + "\n");
    return 1;
  }
}

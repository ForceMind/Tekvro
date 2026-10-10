import { createInterface } from "node:readline";
import { extractStrings, inspectFile, scanDirectory } from "./inspect.mjs";
import { LIMITS, openScope, TekvroError } from "./scope.mjs";

const SERVER = Object.freeze({ name: "tekvro", version: "0.1.0" });
const LEGACY_PROTOCOL = "2025-11-25";
const MODERN_PROTOCOL = "2026-07-28";
const capabilities = { tools: { listChanged: false } };

const tools = [
  {
    name: "scan_directory",
    title: "扫描授权目录",
    description: "列出授权根目录内的文件概况，不执行程序、不自动读取文件内容。",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "相对授权根目录的目录路径，默认 ." },
        max_files: { type: "integer", minimum: 1, maximum: LIMITS.scanFiles },
      },
      additionalProperties: false,
    },
  },
  {
    name: "inspect_file",
    title: "检查文件签名与 SHA-256",
    description: "读取授权范围内一个文件的格式、尺寸、签名和 SHA-256，不运行目标。",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "extract_strings",
    title: "提取可打印字符串",
    description: "显式读取授权文件最多 1 MiB 的可打印 ASCII 字符串；返回结果可能包含敏感文本，应由用户审查再发给远端模型。",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        min_length: { type: "integer", minimum: 4, maximum: 64 },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
];

function ok(id, result) { return { jsonrpc: "2.0", id, result }; }
function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
function toolResult(data, isError = false) {
  const raw = JSON.stringify(data);
  if (raw.length > LIMITS.responseChars) {
    const error = { error: { code: "response_too_large", message: "分析结果超出允许大小" } };
    return { content: [{ type: "text", text: JSON.stringify(error) }], isError: true };
  }
  return { content: [{ type: "text", text: raw }], structuredContent: data, isError };
}
function objectArguments(params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new TekvroError("invalid_argument", "缺少 MCP tool 参数对象");
  }
  const args = params.arguments ?? {};
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new TekvroError("invalid_argument", "arguments 必须是对象");
  }
  return args;
}
async function handleTool(scope, params) {
  try {
    const args = objectArguments(params);
    if (params.name === "scan_directory") {
      return toolResult(await scanDirectory(scope, args.path ?? ".", { max_files: args.max_files }));
    }
    if (params.name === "inspect_file") {
      return toolResult(await inspectFile(scope, args.path));
    }
    if (params.name === "extract_strings") {
      return toolResult(await extractStrings(scope, args.path, {
        min_length: args.min_length, limit: args.limit,
      }));
    }
    throw new TekvroError("unknown_tool", "不支持该分析工具");
  } catch (error) {
    const known = error instanceof TekvroError ? error :
      new TekvroError("internal_error", "工具执行失败");
    return toolResult({ error: { code: known.code, message: known.message } }, true);
  }
}
export async function handleRequest(scope, request) {
  if (!request || typeof request !== "object" || Array.isArray(request) ||
    request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return rpcError(null, -32600, "Invalid JSON-RPC request");
  }
  if (!Object.hasOwn(request, "id")) return null;
  const id = request.id;
  switch (request.method) {
    case "initialize":
      return ok(id, {
        protocolVersion: LEGACY_PROTOCOL,
        capabilities,
        serverInfo: SERVER,
        instructions: "只读、本地分析；工具仅能访问 TEKVRO_ROOT。不要上传敏感字符串。",
      });
    case "server/discover":
      return ok(id, {
        supportedVersions: [MODERN_PROTOCOL, LEGACY_PROTOCOL],
        capabilities,
        serverInfo: SERVER,
        instructions: "Read-only, root-scoped software evidence tools.",
      });
    case "ping": return ok(id, {});
    case "tools/list": return ok(id, { tools });
    case "tools/call": return ok(id, await handleTool(scope, request.params));
    case "resources/list": return ok(id, { resources: [] });
    case "prompts/list": return ok(id, { prompts: [] });
    default: return rpcError(id, -32601, "Method not found");
  }
}

export async function startMcpServer(options = {}) {
  if (!options.root) {
    throw new TekvroError("missing_root", "MCP 必须显式设置 TEKVRO_ROOT 或 --root，禁止默认扫描整个主机");
  }
  const scope = await openScope(options.root);
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    if (!line.trim()) continue;
    let response;
    try {
      if (Buffer.byteLength(line, "utf8") > 1024 * 1024) {
        response = rpcError(null, -32600, "MCP request too large");
      } else {
        response = await handleRequest(scope, JSON.parse(line));
      }
    } catch {
      response = rpcError(null, -32700, "Parse error");
    }
    if (response !== null) process.stdout.write(JSON.stringify(response) + "\n");
  }
}

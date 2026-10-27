import { javascriptRouteDeliveryOptions } from "./cli/javascriptRouteDelivery.js";
import { z } from "incur";
import { selectHumanText } from "./cli/localization.js";
import { webRuntimeCommandTimeoutSchema } from "./domain/browserDeadline.js";
import { javaScriptAnalysisResourceControlsSchema } from "./domain/javascript/javascriptAnalysisResourceControls.js";
import { javaScriptSourcePathsSchema } from "./domain/javascript/javascriptSourceSelection.js";

/** Accept an agent-selected browser observation duration without an artificial ceiling. */
export const observationDuration = (fallback: number, minimum = 0) =>
  z
    .number()
    .int()
    .min(minimum)
    .default(fallback)
    .describe("Observation duration in milliseconds");

/** Shared passive browser origin options. */
export const browserScopeOptions = {
  allowedOrigins: z
    .array(z.string().min(1))
    .optional()
    .describe("Optional exact-origin filter"),
  commandTimeoutMs: webRuntimeCommandTimeoutSchema,
};

/** Keep an omitted command deadline absent so Evidence records the caller selection only. */
export const selectedCommandTimeout = (
  commandTimeoutMs: number | undefined,
): { readonly command_timeout_ms?: number } =>
  commandTimeoutMs === undefined
    ? {}
    : { command_timeout_ms: commandTimeoutMs };

export const browserPageInspectionOptions = z.object({
  ...browserScopeOptions,
  observationMs: observationDuration(500),
  includeAccessibilityText: z
    .boolean()
    .default(false)
    .describe("Include accessibility text"),
  includeConsoleText: z
    .boolean()
    .default(false)
    .describe("Include console message text"),
  includeJsonBodyShapes: z
    .boolean()
    .default(false)
    .describe("Include structural shapes of JSON response bodies"),
  includeWebsocketShapes: z
    .boolean()
    .default(false)
    .describe("Include structural shapes of WebSocket payloads"),
  includeScriptSources: z
    .boolean()
    .default(false)
    .describe("Include JavaScript source text"),
  includeStorageKeys: z
    .boolean()
    .default(false)
    .describe("Include storage key names without values"),
  includeStorageFingerprints: z
    .boolean()
    .default(false)
    .describe("Include content-derived storage fingerprints"),
});

export const electronPageInspectionOptions = z.object({
  observationMs: observationDuration(100),
  includeScriptSources: z
    .boolean()
    .default(false)
    .describe("Include JavaScript source text"),
  commandTimeoutMs: webRuntimeCommandTimeoutSchema,
});

const humanResourceOption = <T extends z.ZodType>(
  schema: T,
  chinese: string,
): T =>
  schema.describe(
    selectHumanText(
      schema.description ?? "JavaScript resource control",
      chinese,
    ),
  );

export const javascriptApplicationOptions = z.object({
  ...javascriptRouteDeliveryOptions,
  maxSemanticNodes: humanResourceOption(
    javaScriptAnalysisResourceControlsSchema.shape.max_semantic_nodes,
    "整个应用保留的语义节点上限，默认 100000；仍受工作进程堆和结果接收预算约束。",
  ),
  maxSemanticNodesPerFile: humanResourceOption(
    javaScriptAnalysisResourceControlsSchema.shape.max_semantic_nodes_per_file,
    "单个源码文件保留的语义节点上限，默认 20000；同时受应用总上限及内存、传输预算约束。",
  ),
  maxSemanticUnknowns: humanResourceOption(
    javaScriptAnalysisResourceControlsSchema.shape.max_semantic_unknowns,
    "整个应用保留的语义未知记录上限，默认 100000；按类别和原因记录未保留的发生次数。",
  ),
  maxSemanticUnknownsPerFile: humanResourceOption(
    javaScriptAnalysisResourceControlsSchema.shape
      .max_semantic_unknowns_per_file,
    "单个源码文件保留的语义未知记录上限，默认 20000；同时受总上限及内存、传输预算约束。",
  ),
  sourcePath: javaScriptSourcePathsSchema
    .optional()
    .describe(
      selectHumanText(
        "Exact inventoried file path relative to the application root; repeat to select several. No implicit dependencies.",
        "相对于应用根目录的精确清单路径；可重复选择多个文件，不隐式加入依赖。",
      ),
    ),
  sourcePathsJson: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Inline JSON array or JSON file path of exact inventoried file paths relative to the application root, selected after any --source-path values. Use a file for selections that exceed the host command-line limit.",
    ),
  maxHeapMb: javaScriptAnalysisResourceControlsSchema.shape.max_heap_mb,
  analysisTimeoutMs: humanResourceOption(
    javaScriptAnalysisResourceControlsSchema.shape.analysis_timeout_ms,
    "每个源码的启动、分析和传输总超时（毫秒），默认 300000；超时保留已采集的部分 Evidence 并停止分析。",
  ),
  artifactFormat: z
    .enum(["auto", "asar", "directory"])
    .default("auto")
    .describe(selectHumanText("Application artifact format", "应用制品格式")),
  integrityPolicy: z
    .enum(["fail", "record-and-continue"])
    .default("fail")
    .describe(
      selectHumanText(
        "Behavior when declared application integrity does not match",
        "应用声明的完整性不匹配时的处理策略",
      ),
    ),
});

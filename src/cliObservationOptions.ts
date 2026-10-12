import { z } from "incur";
import { selectHumanText } from "./cli/localization.js";

/** Accept an agent-selected browser observation duration without an artificial ceiling. */
export const observationDuration = (fallback: number, minimum = 0) =>
  z
    .number()
    .int()
    .min(minimum)
    .default(fallback)
    .describe(
      selectHumanText(
        "Observation duration in milliseconds",
        "观察时长（毫秒）",
      ),
    );

/** Shared passive browser origin options. */
export const browserScopeOptions = {
  allowedOrigins: z
    .array(z.string().min(1))
    .optional()
    .describe(
      selectHumanText(
        "Optional exact-origin filter",
        "可选：精确匹配的页面来源过滤条件",
      ),
    ),
};

export const browserPageInspectionOptions = z.object({
  ...browserScopeOptions,
  observationMs: observationDuration(500),
  includeAccessibilityText: z
    .boolean()
    .default(false)
    .describe(
      selectHumanText("Include accessibility text", "包含无障碍界面文本"),
    ),
  includeConsoleText: z
    .boolean()
    .default(false)
    .describe(
      selectHumanText("Include console message text", "包含控制台消息文本"),
    ),
  includeJsonBodyShapes: z
    .boolean()
    .default(false)
    .describe(
      selectHumanText(
        "Include structural shapes of JSON response bodies",
        "包含 JSON 响应体的结构形态",
      ),
    ),
  includeWebsocketShapes: z
    .boolean()
    .default(false)
    .describe(
      selectHumanText(
        "Include structural shapes of WebSocket payloads",
        "包含 WebSocket 消息载荷的结构形态",
      ),
    ),
  includeScriptSources: z
    .boolean()
    .default(false)
    .describe(
      selectHumanText(
        "Include JavaScript source text",
        "包含 JavaScript 源码文本",
      ),
    ),
  includeStorageKeys: z
    .boolean()
    .default(false)
    .describe(
      selectHumanText(
        "Include storage key names without values",
        "仅包含存储键名，不读取值",
      ),
    ),
  includeStorageFingerprints: z
    .boolean()
    .default(false)
    .describe(
      selectHumanText(
        "Include content-derived storage fingerprints",
        "包含根据存储内容生成的指纹",
      ),
    ),
});

export const electronPageInspectionOptions = z.object({
  observationMs: observationDuration(100),
  includeScriptSources: z
    .boolean()
    .default(false)
    .describe(
      selectHumanText(
        "Include JavaScript source text",
        "包含 JavaScript 源码文本",
      ),
    ),
});

export const javascriptApplicationOptions = z.object({
  artifactFormat: z
    .enum(["auto", "asar", "directory"])
    .default("auto")
    .describe(selectHumanText("Application artifact format", "应用制品格式")),
});

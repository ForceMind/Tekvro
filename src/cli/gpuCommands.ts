import { inspectGpuCodeObjectsInputSchema } from "../domain/gpu/gpuCodeObjects.js";
import { selectHumanText } from "./localization.js";
import { analysisInputErrorFromIssues } from "../domain/inputIssueProjection.js";
import { AnalysisInputError } from "../domain/analysisErrorCore.js";
import { projectAnalysisError } from "../domain/analysisErrorProjection.js";
import { safeParseJson } from "../domain/safeJson.js";
import { z } from "incur";
import type { Logger } from "pino";
import type { CliInstance } from "./types.js";
import { localPathStringSchema } from "../domain/localPath.js";
import { absoluteCallerPath } from "../filesystem/callerPath.js";
import { createGpuCodeObjectsService } from "../composition/gpu.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { logCliCommand } from "../cliLogging.js";
import { withCommandCancellation } from "./commandCancellation.js";
import {
  analysisEvidenceDeliveryOptions,
  deliverCliAnalysisEvidence,
} from "./analysisEvidenceDelivery.js";

/** One-shot summaries export the same complete observations used by MCP retained pages. */
export const registerGpuCommands = (cli: CliInstance, logger: Logger): void => {
  cli.command(CLI_COMMANDS.inspectGpuCodeObjects, {
    description: selectHumanText(
      "Inspect embedded CUDA/HIP targets and selected static kernel metadata",
      "检查内嵌 CUDA/HIP 目标及所选内核的静态元数据",
    ),
    args: z.object({
      path: localPathStringSchema.describe(
        selectHumanText(
          "Local ELF/PE, CUDA fatbin, CUBIN, PTX or HIP bundle",
          "本地 ELF/PE、CUDA fatbin、CUBIN、PTX 或 HIP 包",
        ),
      ),
    }),
    options: z.object({
      ...analysisEvidenceDeliveryOptions,
      view: z
        .string()
        .optional()
        .describe(
          selectHumanText(
            "JSON GPU object/kernel/PTX page selection; requires --detail summary and --evidence_output",
            "GPU 对象、内核或 PTX 分页选择的 JSON；需要 --detail summary 和 --evidence_output",
          ),
        ),
      analysis: z
        .enum(["inventory", "kernels"])
        .default("inventory")
        .describe(
          selectHumanText(
            "Inventory GPU targets or decode selected kernel metadata",
            "inventory 列出 GPU 目标，kernels 解码所选内核元数据",
          ),
        ),
      expected_sha256: z
        .string()
        .optional()
        .describe(
          selectHumanText(
            "Inventory SHA-256; required with --object_ids",
            "清单记录的 SHA-256；使用 --object_ids 时必填",
          ),
        ),
      object_ids: z
        .string()
        .optional()
        .describe(
          selectHumanText(
            "JSON array of exact object IDs to decode",
            "要解码的精确对象 ID 的 JSON 数组",
          ),
        ),
      targets: z
        .string()
        .optional()
        .describe(
          selectHumanText(
            "JSON array of exact target declarations to decode",
            "要解码的精确目标声明的 JSON 数组",
          ),
        ),
    }),
    run: ({ args, options }) =>
      withCommandCancellation((signal) =>
        logCliCommand(logger, CLI_COMMANDS.inspectGpuCodeObjects, async () => {
          const selectors: Partial<
            Record<"object_ids" | "targets" | "view", unknown>
          > = {};
          for (const name of ["object_ids", "targets", "view"] as const) {
            const value = options[name];
            if (value === undefined) continue;
            const decoded = safeParseJson(value);
            if (!decoded.ok) {
              return projectAnalysisError(
                new AnalysisInputError(
                  "inspect_gpu_code_objects",
                  { cause: decoded.cause },
                  [
                    {
                      path: [name],
                      reason: "invalid_format",
                      message: `${name} must be valid JSON`,
                    },
                  ],
                ),
              );
            }
            selectors[name] = decoded.value;
          }
          const rawInput = {
            path: absoluteCallerPath(args.path),
            analysis: options.analysis,
            ...(options.expected_sha256 === undefined
              ? {}
              : { expected_sha256: options.expected_sha256 }),
            ...selectors,
            detail: options.detail,
          };
          const selected = inspectGpuCodeObjectsInputSchema.safeParse(rawInput);
          if (!selected.success)
            return projectAnalysisError(
              analysisInputErrorFromIssues(
                "inspect_gpu_code_objects",
                selected.error.issues,
                rawInput,
              ),
            );
          const service = createGpuCodeObjectsService();
          return deliverCliAnalysisEvidence({
            run: () =>
              service.inspect(
                {
                  path: selected.data.path,
                  analysis: selected.data.analysis,
                  ...(selected.data.expected_sha256 === undefined
                    ? {}
                    : { expected_sha256: selected.data.expected_sha256 }),
                  ...(selected.data.object_ids === undefined
                    ? {}
                    : { object_ids: selected.data.object_ids }),
                  ...(selected.data.targets === undefined
                    ? {}
                    : { targets: selected.data.targets }),
                  detail: "complete",
                },
                { signal },
              ),
            service,
            providerId: "gpu-code-objects",
            operation: "inspect_gpu_code_objects",
            signal,
            detail: options.detail,
            evidenceOutput: options.evidence_output,
            ...(selected.data.view === undefined
              ? {}
              : {
                  view: {
                    kind: "gpu-code-objects" as const,
                    ...selected.data.view,
                  },
                }),
          });
        }),
      ),
  });
};

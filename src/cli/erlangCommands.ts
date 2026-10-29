import { z } from "incur";
import { selectHumanText } from "./localization.js";
import { localPathStringSchema } from "../domain/localPath.js";
import { absoluteCallerPath } from "../filesystem/callerPath.js";
import { createBeamService } from "../composition/erlang.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { logCliCommand } from "../cliLogging.js";
import type { Logger } from "pino";
import type { CliInstance } from "./types.js";
import { withCommandCancellation } from "./commandCancellation.js";
import { inspectErlangBeamInputSchema } from "../domain/erlang/beam.js";
import {
  analysisEvidenceDeliveryOptions,
  deliverCliAnalysisEvidence,
  parseCliAnalysisEvidenceDelivery,
} from "./analysisEvidenceDelivery.js";
import { erlangBeamDeliverySchema } from "../domain/analysisView/erlangBeamView.js";
import { projectAnalysisError } from "../domain/analysisErrorProjection.js";

/** Inspect operator-selected BEAM files through the same shared workflow as MCP. */
export const registerErlangCommands = (
  cli: CliInstance,
  logger: Logger,
): void => {
  cli.command(CLI_COMMANDS.inspectErlangBeam, {
    description: selectHumanText(
      "Inspect Erlang BEAM atoms, exports, imports and Code header without executing bytecode",
      "检查 Erlang BEAM 原子表、导出、导入和 Code 文件头，不执行字节码",
    ),
    args: z.object({
      path: localPathStringSchema.describe(
        selectHumanText("Local BEAM file", "本地 BEAM 文件"),
      ),
    }),
    options: z.object({
      maxFileBytes: inspectErlangBeamInputSchema.shape.max_file_bytes.describe(
        selectHumanText(
          "Maximum stable artifact bytes to read (default 64 MiB)",
          "最多读取的稳定制品字节数（默认 64 MiB）",
        ),
      ),
      maxChunks: inspectErlangBeamInputSchema.shape.max_chunks.describe(
        selectHumanText(
          "Maximum IFF chunks to examine; exceeding the budget fails without partial success",
          "最多检查的 IFF 区块数；超出预算则失败，不作为部分成功返回",
        ),
      ),
      maxAtoms: inspectErlangBeamInputSchema.shape.max_atoms.describe(
        selectHumanText(
          "Maximum atom-table entries to decode; exceeding the budget fails without partial success",
          "最多解码的原子表条目数；超出预算则失败，不作为部分成功返回",
        ),
      ),
      ...analysisEvidenceDeliveryOptions,
      view: z
        .string()
        .optional()
        .describe(
          selectHumanText(
            "JSON beam view; requires --detail summary and --evidence_output",
            "beam 视图的 JSON；需要 --detail summary 和 --evidence_output",
          ),
        ),
    }),
    run: ({ args, options }) =>
      withCommandCancellation((signal) =>
        logCliCommand(logger, CLI_COMMANDS.inspectErlangBeam, async () => {
          const delivery = parseCliAnalysisEvidenceDelivery(
            "inspect_erlang_beam",
            options,
            erlangBeamDeliverySchema,
          );
          if (!delivery.ok) return projectAnalysisError(delivery.error);
          const service = createBeamService();
          return deliverCliAnalysisEvidence({
            run: () =>
              service.inspect(
                {
                  path: absoluteCallerPath(args.path),
                  max_file_bytes: options.maxFileBytes,
                  max_chunks: options.maxChunks,
                  max_atoms: options.maxAtoms,
                },
                { signal },
              ),
            service,
            providerId: "rea-erlang-beam",
            operation: "inspect_erlang_beam",
            signal,
            detail: delivery.value.detail,
            evidenceOutput: delivery.value.evidenceOutput,
            ...(delivery.value.view === undefined
              ? {}
              : { view: delivery.value.view }),
          });
        }),
      ),
  });
};

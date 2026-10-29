import { z } from "incur";
import { selectHumanText } from "./localization.js";
import { localPathStringSchema } from "../domain/localPath.js";
import { absoluteCallerPath } from "../filesystem/callerPath.js";
import { createPythonPycService } from "../composition/pythonPyc.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { logCliCommand } from "../cliLogging.js";
import type { Logger } from "pino";
import type { CliInstance } from "./types.js";
import { withCommandCancellation } from "./commandCancellation.js";
import { inspectPythonPycInputSchema } from "../domain/python/pythonPyc.js";
import {
  analysisEvidenceDeliveryOptions,
  deliverCliAnalysisEvidence,
  parseCliAnalysisEvidenceDelivery,
} from "./analysisEvidenceDelivery.js";
import { pythonPycDeliverySchema } from "../domain/analysisView/pythonPycView.js";
import { projectAnalysisError } from "../domain/analysisErrorProjection.js";

/** Inspect operator-selected pyc files through the same shared workflow as MCP. */
export const registerPythonPycCommands = (
  cli: CliInstance,
  logger: Logger,
): void => {
  cli.command(CLI_COMMANDS.inspectPythonPyc, {
    description: selectHumanText(
      "Inspect a supported CPython 3.7–3.13 pyc header and marshal code objects without executing bytecode",
      "检查受支持的 CPython 3.7–3.13 pyc 文件头和 marshal 代码对象，不执行字节码",
    ),
    args: z.object({
      path: localPathStringSchema.describe(
        selectHumanText("Local CPython .pyc file", "本地 CPython .pyc 文件"),
      ),
    }),
    options: z.object({
      maxFileBytes: inspectPythonPycInputSchema.shape.max_file_bytes.describe(
        selectHumanText(
          "Maximum selected file size in bytes; exceeding the budget fails without partial success",
          "所选文件的最大字节数；超出预算则失败，不作为部分成功返回",
        ),
      ),
      maxObjects: inspectPythonPycInputSchema.shape.max_objects.describe(
        selectHumanText(
          "Maximum marshal objects to examine; exceeding the budget fails without partial success",
          "最多检查的 marshal 对象数；超出预算则失败，不作为部分成功返回",
        ),
      ),
      maxDepth: inspectPythonPycInputSchema.shape.max_depth.describe(
        selectHumanText(
          "Maximum marshal nesting depth; exceeding the budget fails without partial success",
          "marshal 最大嵌套深度；超出预算则失败，不作为部分成功返回",
        ),
      ),
      maxStringBytes:
        inspectPythonPycInputSchema.shape.max_string_bytes.describe(
          selectHumanText(
            "Maximum bytes retained for one marshal string or byte string; exceeding the budget fails without partial success",
            "单个 marshal 字符串或字节串最多保留的字节数；超出预算则失败，不作为部分成功返回",
          ),
        ),
      ...analysisEvidenceDeliveryOptions,
      view: z
        .string()
        .optional()
        .describe(
          selectHumanText(
            "JSON python-pyc view; requires --detail summary and --evidence_output",
            "python-pyc 视图的 JSON；需要 --detail summary 和 --evidence_output",
          ),
        ),
    }),
    run: ({ args, options }) =>
      withCommandCancellation((signal) =>
        logCliCommand(logger, CLI_COMMANDS.inspectPythonPyc, async () => {
          const delivery = parseCliAnalysisEvidenceDelivery(
            "inspect_python_pyc",
            options,
            pythonPycDeliverySchema,
          );
          if (!delivery.ok) return projectAnalysisError(delivery.error);
          const service = createPythonPycService();
          return deliverCliAnalysisEvidence({
            run: () =>
              service.inspect(
                {
                  path: absoluteCallerPath(args.path),
                  max_file_bytes: options.maxFileBytes,
                  max_objects: options.maxObjects,
                  max_depth: options.maxDepth,
                  max_string_bytes: options.maxStringBytes,
                },
                { signal },
              ),
            service,
            providerId: "rea-python-pyc",
            operation: "inspect_python_pyc",
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

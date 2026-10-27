import { selectHumanText } from "./localization.js";
import { z } from "incur";
import { PcapAnalysisService } from "../application/pcap/PcapAnalysisService.js";
import type { PcapAnalysisPort } from "../application/pcap/PcapAnalysisPort.js";
import { createPcapAnalysisProvider } from "../composition/pcap.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { logCliCommand } from "../cliLogging.js";
import type { PcapOperation } from "../domain/pcap/pcapAnalysis.js";
import type { Logger } from "pino";
import type { CliInstance } from "./types.js";
import { withCommandCancellation } from "./commandCancellation.js";
import { finishAnalysisCommand } from "./finishAnalysisCommand.js";

/** Expose the same explicit pcap requests through one-shot CLI commands. */
export const registerPcapCommands = (
  cli: CliInstance,
  logger: Logger,
  environment: Readonly<Record<string, string | undefined>>,
  provider: PcapAnalysisPort = createPcapAnalysisProvider(environment),
): void => {
  const service = new PcapAnalysisService(provider);
  const execute = (name: string, operation: PcapOperation, input: unknown) =>
    withCommandCancellation((signal) =>
      logCliCommand(logger, name, () =>
        finishAnalysisCommand(
          () => service.execute(operation, input, { signal }),
          { close: () => provider.close() },
          "pcap",
          operation,
          signal,
        ),
      ),
    );

  cli.command(CLI_COMMANDS.inspectPcapClient, {
    description: selectHumanText(
      "Inspect the caller-selected tshark and capinfos binaries without reading a capture",
      "检查调用方指定的 tshark 和 capinfos 程序，不读取捕获文件",
      environment,
    ),
    args: z.object({}),
    run: () =>
      execute(CLI_COMMANDS.inspectPcapClient, "inspect_pcap_client", {}),
  });
  cli.command(CLI_COMMANDS.inspectPcapCapture, {
    description: selectHumanText(
      "Inspect one pcap/pcapng capture: endpoints, DNS, TLS SNI, and protocol distribution",
      "检查一个 pcap/pcapng 捕获文件：端点、DNS、TLS SNI 和协议分布",
      environment,
    ),
    args: z.object({
      path: z
        .string()
        .min(1)
        .describe(
          selectHumanText(
            "Local pcap or pcapng capture file to inspect",
            "要检查的本地 pcap 或 pcapng 捕获文件",
            environment,
          ),
        ),
    }),
    run: ({ args }) =>
      execute(CLI_COMMANDS.inspectPcapCapture, "inspect_pcap_capture", {
        path: args.path,
      }),
  });
};

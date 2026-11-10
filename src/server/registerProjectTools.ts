import type { Logger } from "pino";
import type { ProjectService } from "../application/project/ProjectService.js";
import { toolContract } from "../contracts/toolContracts.js";
import type { EvidenceMcpServer } from "./EvidenceMcpServer.js";
import { logToolExecution } from "./toolLogging.js";
import { applicationToolRegistrationOptions } from "./toolRegistrationOptions.js";

/** Project persistence remains available without an active analysis target. */
export const registerProjectTools = (
  server: EvidenceMcpServer,
  service: ProjectService,
  logger: Logger,
): void => {
  const create = toolContract("create_project");
  server.registerTool(
    create.name,
    applicationToolRegistrationOptions(create),
    async (input, context) => {
      const result = await logToolExecution(logger, create.name, () =>
        service.create(input, { signal: context.mcpReq.signal }),
      );
      return server.delivery.toCallToolResult(result, create);
    },
  );

  const inspect = toolContract("inspect_project");
  server.registerTool(
    inspect.name,
    applicationToolRegistrationOptions(inspect),
    async (input, context) => {
      const result = await logToolExecution(logger, inspect.name, () =>
        service.inspect(input, { signal: context.mcpReq.signal }),
      );
      return server.delivery.toCallToolResult(result, inspect);
    },
  );

  const edit = toolContract("edit_project");
  server.registerTool(
    edit.name,
    applicationToolRegistrationOptions(edit),
    async (input, context) => {
      const result = await logToolExecution(logger, edit.name, () =>
        service.edit(input, { signal: context.mcpReq.signal }),
      );
      return server.delivery.toCallToolResult(result, edit);
    },
  );
};

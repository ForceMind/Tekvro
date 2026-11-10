import type { Logger } from "pino";
import type { ProjectRunService } from "../application/project/ProjectRunService.js";
import { toolContract } from "../contracts/toolContracts.js";
import type { AnalysisError } from "../domain/analysisErrorBase.js";
import { jsonValueSchema, type JsonValue } from "../domain/jsonValue.js";
import type { ProjectExecutionSnapshot } from "../domain/projectExecution.js";
import { ok, type Result } from "../domain/result.js";
import type { EvidenceMcpServer } from "./EvidenceMcpServer.js";
import { logToolExecution } from "./toolLogging.js";
import { applicationToolRegistrationOptions } from "./toolRegistrationOptions.js";

const jsonResult = (
  result: Result<ProjectExecutionSnapshot, AnalysisError>,
): Result<JsonValue, AnalysisError> =>
  result.ok ? ok(jsonValueSchema.parse(result.value)) : result;

/** Shared bounded project operations remain available without an active analysis target. */
export const registerProjectRunTools = (
  server: EvidenceMcpServer,
  service: ProjectRunService,
  logger: Logger,
): void => {
  const build = toolContract("build_project");
  server.registerTool(
    build.name,
    applicationToolRegistrationOptions(build),
    async (input, context) => {
      const result = await logToolExecution(logger, build.name, () =>
        service.build(input, context.mcpReq.signal),
      );
      return server.delivery.toCallToolResult(jsonResult(result), build);
    },
  );

  const check = toolContract("check_project");
  server.registerTool(
    check.name,
    applicationToolRegistrationOptions(check),
    async (input, context) => {
      const result = await logToolExecution(logger, check.name, () =>
        service.checkPending(input, context.mcpReq.signal),
      );
      return server.delivery.toCallToolResult(jsonResult(result), check);
    },
  );

  const refine = toolContract("refine_project");
  server.registerTool(
    refine.name,
    applicationToolRegistrationOptions(refine),
    async (input, context) => {
      const result = await logToolExecution(logger, refine.name, () =>
        service.refine(input, context.mcpReq.signal),
      );
      return server.delivery.toCallToolResult(jsonResult(result), refine);
    },
  );

  const resume = toolContract("resume_project_build");
  server.registerTool(
    resume.name,
    applicationToolRegistrationOptions(resume),
    async (input, context) => {
      const result = await logToolExecution(logger, resume.name, () =>
        service.resumeBuild(input, context.mcpReq.signal),
      );
      return server.delivery.toCallToolResult(jsonResult(result), resume);
    },
  );

  const inspect = toolContract("inspect_project_run");
  server.registerTool(
    inspect.name,
    applicationToolRegistrationOptions(inspect),
    async (input, context) => {
      const result = await logToolExecution(logger, inspect.name, () =>
        service.inspect(input, context.mcpReq.signal),
      );
      return server.delivery.toCallToolResult(jsonResult(result), inspect);
    },
  );

  const budget = toolContract("adjust_project_run_budget");
  server.registerTool(
    budget.name,
    applicationToolRegistrationOptions(budget),
    async (input, context) => {
      const result = await logToolExecution(logger, budget.name, () =>
        service.adjustBudget(input, context.mcpReq.signal),
      );
      return server.delivery.toCallToolResult(jsonResult(result), budget);
    },
  );
};

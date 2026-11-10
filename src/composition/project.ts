import { ProjectService } from "../application/project/ProjectService.js";
import { ProjectRunService } from "../application/project/ProjectRunService.js";
import { ArtifactResourceScope } from "../artifacts/ArtifactResourceScope.js";
import { CodexBuilderAdapter } from "../providers/codex/CodexBuilderAdapter.js";

/** Compose local project persistence without opening an analysis provider. */
export const createProjectService = (): ProjectService =>
  new ProjectService(new ArtifactResourceScope());

/** Own one local Builder and its file/process resources without probing or executing it. */
export const createProjectRunService = (
  environment: Readonly<NodeJS.ProcessEnv> = process.env,
): ProjectRunService =>
  new ProjectRunService(
    new ArtifactResourceScope(),
    new CodexBuilderAdapter({ environment }),
  );

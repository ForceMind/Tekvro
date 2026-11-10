import { join } from "node:path";
import { toolContract } from "../../src/contracts/toolContracts.js";

/** Adapt the advertised project example to a caller-owned temporary workspace. */
export const projectMetadataRequest = (root: string) => {
  const example = toolContract("create_project").examples[0].input;
  return {
    ...example,
    directory: join(root, "project"),
    project: {
      ...example.project,
      scope: {
        ...example.project.scope,
        target: {
          ...example.project.scope.target,
          path: join(root, "reference.html"),
        },
        output_root: join(root, "candidate"),
      },
    },
  };
};

import { z } from "zod";
import { absoluteLocalPathStringSchema } from "../domain/localPath.js";
import {
  createProjectInputSchema,
  projectEditSchema,
  projectRevisionSchema,
  projectTokenSchema,
} from "../domain/projectManifest.js";
import { toolContractMetadata } from "./toolEffects.js";
import type { ToolContract } from "./toolContractTypes.js";

const directorySchema = absoluteLocalPathStringSchema.describe(
  "Absolute local directory containing the project's immutable metadata revisions; separate from target and output paths.",
);

export const createProjectRequestSchema = z.strictObject({
  directory: directorySchema,
  project: createProjectInputSchema,
});

export const inspectProjectRequestSchema = z.strictObject({
  directory: directorySchema,
});

export const editProjectRequestSchema = z.strictObject({
  directory: directorySchema,
  expected: projectTokenSchema,
  edit: projectEditSchema,
});

export const projectSnapshotSchema = z.strictObject({
  directory: directorySchema,
  revision: projectRevisionSchema,
  token: projectTokenSchema,
});

export const PROJECT_TOOL_CONTRACTS = [
  {
    name: "create_project",
    ...toolContractMetadata("create_project"),
    kind: "application",
    description:
      "Create a durable local project in a new metadata directory, with an analyst question, caller-supplied target identity, output root and requirements. Returns the committed revision and its edit token. The parent directory must exist. Target and Evidence identities are retained declarations; analysis and acceptance remain unevaluated.",
    inputSchema: createProjectRequestSchema,
    outputSchema: projectSnapshotSchema,
    examples: [
      {
        title: "Create a reconstruction project with one required behavior",
        input: {
          directory: "/analysis/projects/login",
          project: {
            name: "Login reconstruction",
            scope: {
              goal: "reconstruction",
              question: "Reconstruct the observed login flow",
              target: {
                original_input: "reference.html",
                path: "/analysis/reference.html",
                sha256: "a".repeat(64),
              },
              output_root: "/analysis/candidate",
              requirements: [
                {
                  requirement_id: "login",
                  description: "The login flow reports invalid credentials",
                  required: true,
                },
              ],
            },
          },
        },
      },
    ],
  },
  {
    name: "inspect_project",
    ...toolContractMetadata("inspect_project"),
    kind: "application",
    description:
      "Read a local project's latest committed revision after validating its complete revision chain, digests and supported schema. Returns the full manifest and an exact edit token. Referenced target, Evidence and check files are retained metadata; this inspection does not independently verify them. Damaged or newer unsupported histories remain errors.",
    inputSchema: inspectProjectRequestSchema,
    outputSchema: projectSnapshotSchema,
    examples: [
      {
        title: "Read a project and obtain its current edit token",
        input: { directory: "/analysis/projects/login" },
      },
    ],
  },
  {
    name: "edit_project",
    ...toolContractMetadata("edit_project"),
    kind: "application",
    description:
      "Append a project metadata edit against the exact token returned by create_project or inspect_project. Scope changes require change_reason. Scope or candidate changes invalidate prior acceptance. A stale token returns expected and current identities for reinspection. Only declared scope/reference fields are editable; lifecycle status and acceptance verdicts belong to their workflows.",
    inputSchema: editProjectRequestSchema,
    outputSchema: projectSnapshotSchema,
    examples: [
      {
        title: "Rename a project using its previously inspected token",
        input: {
          directory: "/analysis/projects/login",
          expected: {
            project_id: "22222222-2222-4222-8222-222222222222",
            revision: 1,
            digest: "b".repeat(64),
          },
          edit: { name: "Login flow reconstruction" },
        },
      },
    ],
  },
] as const satisfies readonly ToolContract[];

import type { ProjectRevision, ProjectToken } from "./projectManifest.js";

/** A verified local project revision and the exact token for its next edit. */
export type ProjectSnapshot = {
  readonly directory: string;
  readonly revision: ProjectRevision;
  readonly token: ProjectToken;
};

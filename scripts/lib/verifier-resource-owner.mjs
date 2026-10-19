import { ArtifactResourceScope } from "../../dist/artifacts/ArtifactResourceScope.js";
import { AnalysisCleanupLease } from "../../dist/artifacts/AnalysisCleanupLease.js";
import { closeVerifierResources } from "./verifier-cleanup.mjs";

/** Inspect a prerequisite with the same retained cleanup contract as providers. */
export async function withVerifierResourceOwner(operation) {
  const resources = new ArtifactResourceScope();
  const resourceOwner = {
    retain(owner, resource) {
      resources.retain({
        kind: "lease",
        resource,
        lease: AnalysisCleanupLease.forCloseOwner(owner, resource),
      });
    },
    run: (task) => resources.run(task),
  };
  let primaryError;
  try {
    return await operation(resourceOwner);
  } catch (cause) {
    primaryError = cause;
    throw cause;
  } finally {
    await closeVerifierResources([() => resources.close()], primaryError);
  }
}

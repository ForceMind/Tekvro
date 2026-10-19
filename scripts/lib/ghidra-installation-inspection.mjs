import { inspectGhidraInstallation } from "../../dist/ghidra/GhidraInstallation.js";
import { withVerifierResourceOwner } from "./verifier-resource-owner.mjs";

/** Complete one prerequisite inspection and release its exact retained owners. */
export async function inspectVerifierGhidraInstallation(options, host) {
  return withVerifierResourceOwner((resourceOwner) =>
    inspectGhidraInstallation({ ...options, resourceOwner }, host),
  );
}

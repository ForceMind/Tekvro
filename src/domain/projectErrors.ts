import { EvidenceIntegrityError } from "./evidenceErrors.js";
import type { ProjectToken } from "./projectManifest.js";

/** A stale writer must reopen the project and reapply its intended edit. */
export class ProjectRevisionConflict extends EvidenceIntegrityError {
  constructor(
    readonly expected: ProjectToken,
    readonly current: ProjectToken,
  ) {
    const message =
      `Project revision conflict: expected ${expected.revision}, current ${current.revision}. ` +
      "Inspect the project again and reapply the intended edit using its current token.";
    super(message, { userMessage: message });
  }
}

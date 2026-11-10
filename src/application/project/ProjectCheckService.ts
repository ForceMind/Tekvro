import type { ZodError } from "zod";
import { createHash, randomUUID } from "node:crypto";

import { ArtifactResourceScope } from "../../artifacts/ArtifactResourceScope.js";
import type { AnalysisError } from "../../domain/analysisErrorBase.js";
import { AnalysisCancelledError } from "../../domain/analysisErrorCore.js";
import { EvidenceIntegrityError } from "../../domain/evidenceErrors.js";
import { analysisInputErrorFromIssues } from "../../domain/inputIssueProjection.js";
import {
  projectCheckApplicability,
  type ProjectCheckBinding,
} from "../../domain/projectCheckBinding.js";
import type { ProjectManifest } from "../../domain/projectManifest.js";
import { err, ok, type Result } from "../../domain/result.js";
import {
  OwnedCommandFailure,
  runOwnedCommand,
} from "../../process/OwnedCommand.js";
import type { ProviderProcessSnapshot } from "../../process/ProviderProcess.js";
import { writeTextParts } from "../JsonFiles.js";
import {
  ProjectCheckInputs,
  type ObserveProjectCheckCandidate,
} from "./ProjectCheckInputs.js";
export type { ObserveProjectCheckCandidate } from "./ProjectCheckInputs.js";

import {
  prepareSchema,
  runSchema,
  checkReportSchema,
  sameProjectCheckBinding,
  evaluateProjectCheckerResult,
  ProjectCheckPublicationError,
  snapshotReport,
  storedProjectCheck,
  projectCheckReferenceSchema,
  projectCheckCurrentSchema,
  type ProjectCheckerManifest,
  type ProjectCheckRequest,
  type ProjectCheckReport,
  type StoredProjectCheck,
} from "./ProjectCheckProtocol.js";
export {
  ProjectCheckPublicationError,
  type ProjectCheckerManifest,
  type ProjectCheckRequest,
  type StoredProjectCheck,
} from "./ProjectCheckProtocol.js";
import type { ProjectValidatorPort } from "./ProjectWorkflowPorts.js";

const invalidInput = (operation: string, input: unknown, cause: ZodError) =>
  analysisInputErrorFromIssues(operation, cause.issues, input, { cause });

const sha256 = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");
/**
 * Runs caller-selected independent checkers through the shared process owner.
 * The caller owns project/run concurrency. This slice authenticates one report,
 * never a reconstruction ledger or global project acceptance.
 */
export class ProjectCheckService implements ProjectValidatorPort<ProjectCheckRequest> {
  private readonly inputs: ProjectCheckInputs;
  constructor(
    private readonly resources: ArtifactResourceScope,
    observeCandidate?: ObserveProjectCheckCandidate,
  ) {
    this.inputs = new ProjectCheckInputs(resources, observeCandidate);
  }

  /** Observe a resumable pending-check commitment without launching its command. */
  async prepare(
    input: unknown,
    signal?: AbortSignal,
  ): Promise<Result<ProjectCheckBinding, AnalysisError>> {
    const parsed = prepareSchema.safeParse(input);
    if (!parsed.success)
      return err(invalidInput("prepare_project_check", input, parsed.error));
    const prepared = await this.inputs.prepare(parsed.data, signal);
    return prepared.ok ? ok(prepared.value.binding) : prepared;
  }

  /** Execute once and publish original output even when the result must remain unknown. */
  async run(
    input: unknown,
    signal?: AbortSignal,
  ): Promise<Result<StoredProjectCheck, AnalysisError>> {
    const parsed = runSchema.safeParse(input);
    if (!parsed.success)
      return err(invalidInput("run_project_check", input, parsed.error));
    const request = parsed.data;
    const prepared = await this.inputs.prepare(request, signal);
    if (!prepared.ok) return prepared;
    const { binding, manifest, environment, root } = prepared.value;
    if (
      request.expected_binding !== undefined &&
      !sameProjectCheckBinding(request.expected_binding, binding)
    )
      return err(
        new EvidenceIntegrityError(
          "Pending project check inputs changed before execution",
        ),
      );
    const destination = await this.inputs.outsideDestination(
      request.report_path,
      root,
    );
    if (!destination.ok) return destination;
    const checkId = randomUUID();
    const startedAt = new Date().toISOString();
    const execution = await this.#execute(
      { checkId, binding, manifest, request },
      signal,
    );
    const processReport =
      execution.snapshot === null ? null : snapshotReport(execution.snapshot);
    const evaluated = evaluateProjectCheckerResult({
      process: processReport,
      binding,
      checkId,
      project: request.project,
      manifest,
    });
    const limitations = [...evaluated.limitations];
    if (execution.executionFailure !== null)
      limitations.push(
        `Checker execution did not complete: ${execution.executionFailure}`,
      );
    if (execution.cleanupStatus === "incomplete")
      limitations.push("Checker cleanup remains incomplete");
    const current = await this.#after(request, binding, signal);
    const applicability = current.applicability;
    limitations.push(...current.limitations);
    if (current.failure?.cleanupIncomplete) {
      execution.cleanupStatus = "incomplete";
      execution.cleanupResources = [
        ...new Set([
          ...execution.cleanupResources,
          ...current.failure.cleanupResources,
        ]),
      ];
    }
    const outcome = limitations.length > 0 ? "unknown" : evaluated.outcome;
    const report: ProjectCheckReport = {
      schema: "tekvro.project-check",
      schema_version: 1,
      check_id: checkId,
      binding,
      checker_path: request.checker_path,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      outcome,
      checks: evaluated.checks,
      evidence_ids: [],
      limitations,
      environment,
      process: processReport,
      execution_failure: execution.executionFailure,
      execution_failure_reason: execution.executionFailureReason,
      cleanup_status: execution.cleanupStatus,
      cleanup_resources: execution.cleanupResources,
    };
    const bytes = `${JSON.stringify(report)}\n`;
    // Publication finalizes already observed output, including after cancellation.
    const published = await writeTextParts(
      [bytes],
      destination.value,
      false,
      this.resources,
    );
    if (!published.ok)
      return err(new ProjectCheckPublicationError(report, published.error));
    return ok(
      storedProjectCheck({
        report,
        path: published.value.path,
        digest: sha256(bytes),
        applicability,
        limitations,
      }),
    );
  }

  /** Verify the exact stored bytes and independently reobserve current applicability. */
  async read(
    reference: { readonly report_path: string; readonly report_sha256: string },
    current: {
      readonly project: ProjectManifest;
      readonly checker_path: string;
    },
    signal?: AbortSignal,
  ): Promise<Result<StoredProjectCheck, AnalysisError>> {
    const parsed = projectCheckReferenceSchema.safeParse(reference);
    if (!parsed.success)
      return err(invalidInput("read_project_check", reference, parsed.error));
    const bytes = await this.inputs.readBytes(parsed.data.report_path, signal);
    if (!bytes.ok) return bytes;
    if (sha256(bytes.value) !== parsed.data.report_sha256)
      return err(
        new EvidenceIntegrityError(
          "Project check report digest does not match its committed reference",
        ),
      );
    const json = this.inputs.decode(bytes.value, parsed.data.report_path);
    if (!json.ok) return json;
    const report = checkReportSchema.safeParse(json.value);
    if (!report.success)
      return err(
        new EvidenceIntegrityError(
          "Stored project check report has an invalid schema",
          { cause: report.error },
        ),
      );
    const present = projectCheckCurrentSchema.safeParse(current);
    if (!present.success)
      return err(invalidInput("read_project_check", current, present.error));
    const observed = await this.inputs.prepare(
      { ...present.data, run_id: report.data.binding.run_id },
      signal,
    );
    if (!observed.ok && observed.error instanceof AnalysisCancelledError)
      return observed;
    if (!observed.ok)
      return ok(
        storedProjectCheck({
          report: report.data,
          path: parsed.data.report_path,
          digest: parsed.data.report_sha256,
          applicability: "unknown",
          limitations: [
            ...report.data.limitations,
            `Current inputs could not be verified: ${observed.error.message}`,
          ],
        }),
      );
    const destination = await this.inputs.outsideDestination(
      parsed.data.report_path,
      observed.value.root,
    );
    if (!destination.ok) return destination;
    const selected = observed.value.binding;
    const applicability = projectCheckApplicability(
      report.data.binding,
      present.data.project,
      {
        candidate_sha256: selected.candidate_sha256,
        checker_sha256: selected.checker_sha256,
        scenario_sha256: selected.scenario_sha256,
        environment_sha256: selected.environment_sha256,
      },
    );
    if (!applicability.ok) return applicability;
    const limitations = [
      ...report.data.limitations,
      ...applicability.value.reasons,
    ];
    return ok(
      storedProjectCheck({
        report: report.data,
        path: parsed.data.report_path,
        digest: parsed.data.report_sha256,
        applicability: applicability.value.status,
        limitations,
      }),
    );
  }

  async #after(
    request: ProjectCheckRequest,
    binding: ProjectCheckBinding,
    signal?: AbortSignal,
  ): Promise<{
    readonly applicability: StoredProjectCheck["applicability"];
    readonly limitations: readonly string[];
    readonly failure?: AnalysisError;
  }> {
    // Cancellation preserves captured bytes without doing further analysis work.
    if (signal?.aborted)
      return {
        applicability: "unknown",
        limitations: [
          "Check was cancelled; post-execution identities were not observed",
        ],
      };
    const after = await this.inputs.prepare(request, signal);
    if (!after.ok)
      return {
        applicability: "unknown",
        limitations: [
          `Post-execution inputs could not be verified: ${after.error.message}`,
        ],
        failure: after.error,
      };
    if (sameProjectCheckBinding(binding, after.value.binding))
      return { applicability: "matched", limitations: [] };
    return {
      applicability: "stale",
      limitations: [
        "Candidate, source, checker, scenario or environment changed during execution",
      ],
    };
  }

  async #execute(
    input: {
      readonly checkId: string;
      readonly binding: ProjectCheckBinding;
      readonly manifest: ProjectCheckerManifest;
      readonly request: ProjectCheckRequest;
    },
    signal?: AbortSignal,
  ) {
    const { checkId, binding, manifest, request } = input;
    let snapshot: ProviderProcessSnapshot | null = null;
    let executionFailure: string | null = null;
    let executionFailureReason: OwnedCommandFailure["reason"] | null = null;
    let cleanupStatus: ProjectCheckReport["cleanup_status"] = "not_required";
    let cleanupResources: string[] = [];
    try {
      snapshot = await runOwnedCommand(
        {
          command: manifest.executable.path,
          arguments: manifest.argv,
          runId: checkId,
          expectedCommand: null,
          sweepTokenOwnedProcesses: true,
          cwd: manifest.cwd,
          hostEnvironment: {},
          env: {
            ...manifest.environment,
            TEKVRO_PROJECT_CHECK_BINDING: JSON.stringify(binding),
            TEKVRO_PROJECT_CHECK_ID: checkId,
          },
        },
        {
          timeoutMs: request.timeout_ms,
          diagnosticBytes: request.diagnostic_bytes,
          acceptNonZeroExit: true,
          stdin: "closed-pipe",
        },
        signal === undefined ? {} : { signal },
      );
      cleanupStatus = "complete";
    } catch (cause: unknown) {
      if (!(cause instanceof OwnedCommandFailure)) throw cause;
      snapshot = cause.snapshot;
      executionFailure = `${cause.reason}: ${cause.message}`;
      executionFailureReason = cause.reason;
      cleanupStatus =
        cause.cleanupFailure === null
          ? snapshot === null
            ? "not_required"
            : "complete"
          : "incomplete";
      cleanupResources =
        cause.cleanupFailure === null ? [] : [...cause.resources];
      const owner = cause.cleanupOwner;
      if (owner !== undefined && cause.cleanupFailure !== null) {
        // Preserve the actual owner for close/retry; labels never authorize a kill.
        this.resources.retain({
          kind: "lease",
          resource: `project-check:${checkId}`,
          lease: {
            release: async () => {
              const stopped = await owner.stop();
              if (stopped.status === "incomplete")
                throw new Error(stopped.reason);
              owner.dispose();
            },
          },
        });
      }
    }

    return {
      snapshot,
      executionFailure,
      executionFailureReason,
      cleanupStatus,
      cleanupResources,
    };
  }
}

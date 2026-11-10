import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { release } from "node:os";
import { ArtifactResourceScope } from "../../artifacts/ArtifactResourceScope.js";
import {
  AnalysisCleanupLease,
  AnalysisCleanupLeaseGroup,
} from "../../artifacts/AnalysisCleanupLease.js";
import { AnalysisError } from "../../domain/analysisErrorBase.js";
import { AnalysisCancelledError } from "../../domain/analysisErrorCore.js";
import { digestCanonicalValue } from "../../domain/canonicalDigest.js";
import {
  EvidenceFileError,
  EvidenceIntegrityError,
} from "../../domain/evidenceErrors.js";
import { isPathWithinRoot } from "../../domain/localPath.js";
import {
  createProjectCheckBinding,
  type ProjectCheckBinding,
} from "../../domain/projectCheckBinding.js";
import type { ProjectManifest } from "../../domain/projectManifest.js";
import { err, ok, type Result } from "../../domain/result.js";
import { hashStableFile } from "../../filesystem/StableFileHash.js";
import { RegularFileCancelled } from "../../filesystem/OwnedRegularFile.js";
import { RegularFileOperationCancelled } from "../../filesystem/RegularFile.js";
import { bindRegularFileCleanup, readRegularFile } from "../RegularFileRead.js";
import {
  observeProjectCandidate,
  type ProjectCandidateObservation,
} from "./ProjectCandidate.js";
import {
  projectCheckerManifestSchema,
  type ProjectCheckerManifest,
  type ProjectCheckPreparation,
  type ProjectCheckReport,
} from "./ProjectCheckProtocol.js";

/** Trusted filesystem observation port, shared with the project execution service. */
export type ObserveProjectCheckCandidate = (
  project: ProjectManifest,
  signal?: AbortSignal,
  resources?: ArtifactResourceScope,
) => Promise<Result<ProjectCandidateObservation, AnalysisError>>;

/** Actual input observations retained only until this command attempt completes. */
export interface PreparedCheck {
  readonly binding: ProjectCheckBinding;
  readonly manifest: ProjectCheckerManifest;
  readonly root: string;
  readonly environment: ProjectCheckReport["environment"];
}

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

/** Own verifier filesystem admission separately from process execution and report interpretation. */
export class ProjectCheckInputs {
  constructor(
    private readonly resources: ArtifactResourceScope,
    private readonly observeCandidate: ObserveProjectCheckCandidate = observeProjectCandidate,
  ) {}
  /** Observe every fixed input and the complete candidate before committing a binding. */
  async prepare(
    input: ProjectCheckPreparation,
    signal?: AbortSignal,
  ): Promise<Result<PreparedCheck, AnalysisError>> {
    if (signal?.aborted)
      return err(
        new AnalysisCancelledError("prepare_project_check", {
          cause: signal.reason,
        }),
      );
    const candidate = await this.observeCandidate(
      input.project,
      signal,
      this.resources,
    );
    if (!candidate.ok) return candidate;
    if (!candidate.value.complete || candidate.value.limitations.length > 0)
      return err(
        new EvidenceIntegrityError(
          "Project candidate observation is incomplete",
        ),
      );
    const root = candidate.value.root;
    try {
      await this.#outsideExisting(input.checker_path, root);
      const bytes = await this.readBytes(input.checker_path, signal);
      if (!bytes.ok) return bytes;
      const json = this.decode(bytes.value, input.checker_path);
      if (!json.ok) return json;
      const parsed = projectCheckerManifestSchema.safeParse(json.value);
      if (!parsed.success)
        return err(
          new EvidenceIntegrityError("Checker manifest has an invalid schema", {
            cause: parsed.error,
          }),
        );
      const manifest = parsed.data;
      await this.#outsideExisting(manifest.cwd, root);
      if (!(await stat(manifest.cwd)).isDirectory())
        throw new EvidenceIntegrityError("Checker cwd must be a directory");
      const canonicalFiles = new Set<string>();
      for (const file of [manifest.executable, ...manifest.inputs]) {
        const canonical = await this.#outsideExisting(file.path, root);
        if (canonicalFiles.has(canonical))
          throw new EvidenceIntegrityError(
            `Checker inputs alias the same file: ${file.path}`,
          );
        canonicalFiles.add(canonical);
        const actual = await this.#hash(file.path, signal);
        if (actual !== file.sha256)
          throw new EvidenceIntegrityError(
            `Fixed checker input digest changed: ${file.path}`,
          );
      }
      if (
        (await this.#hash(input.project.scope.target.path, signal)) !==
        input.project.scope.target.sha256
      )
        throw new EvidenceIntegrityError(
          "Project source bytes no longer match the source commitment",
        );
      const environment = {
        platform: process.platform,
        architecture: process.arch,
        kernel_release: release(),
        variables: Object.keys(manifest.environment).sort(),
        values_sha256: digestCanonicalValue(manifest.environment),
      };
      const binding = createProjectCheckBinding(input.project, input.run_id, {
        candidate_sha256: candidate.value.sha256,
        checker_sha256: sha256(bytes.value),
        scenario_sha256: digestCanonicalValue(
          manifest.inputs.filter((file) => file.role !== "checker"),
        ),
        environment_sha256: digestCanonicalValue(environment),
      });
      return binding.ok
        ? ok({ binding: binding.value, manifest, root, environment })
        : binding;
    } catch (cause: unknown) {
      return err(this.#fileFailure(cause, input.checker_path));
    }
  }

  async #hash(path: string, signal?: AbortSignal): Promise<string> {
    let cleanup: AnalysisCleanupLease | undefined;
    try {
      const actual = await hashStableFile(path, {
        ...(signal === undefined ? {} : { signal }),
        retainFailedClose: (handle) => {
          cleanup = new AnalysisCleanupLease(() => handle.close(), [path]);
          this.resources.retain({
            kind: "lease",
            resource: path,
            lease: cleanup,
          });
        },
      });
      return actual.sha256;
    } catch (cause: unknown) {
      const failure = this.#fileFailure(cause, path);
      if (cleanup !== undefined)
        new AnalysisCleanupLeaseGroup(failure, [cleanup]);
      throw failure;
    }
  }

  async #outsideExisting(path: string, root: string): Promise<string> {
    const canonical = await realpath(path);
    if (isPathWithinRoot(root, canonical))
      throw new EvidenceIntegrityError(
        `Verifier-owned inputs must be outside the Builder output tree: ${path}`,
      );
    return canonical;
  }

  /** Canonicalize an external report parent before immutable publication. */
  async outsideDestination(
    path: string,
    root: string,
  ): Promise<Result<string, AnalysisError>> {
    try {
      const parent = await this.#outsideExisting(dirname(path), root);
      const destination = join(parent, basename(path));
      if (isPathWithinRoot(root, destination))
        throw new EvidenceIntegrityError(
          "Checker report must be outside the Builder output tree",
        );
      return ok(destination);
    } catch (cause: unknown) {
      return err(this.#fileFailure(cause, path));
    }
  }

  /** Read stable regular bytes, preserving exact cleanup and cancellation failures. */
  async readBytes(
    path: string,
    signal?: AbortSignal,
  ): Promise<Result<Buffer, AnalysisError>> {
    try {
      return ok(
        await readRegularFile(path, {
          symlinks: "reject",
          resources: this.resources,
          ...(signal === undefined ? {} : { signal }),
          cancellationFailure: (reason) =>
            new AnalysisCancelledError("read_project_check", { cause: reason }),
        }),
      );
    } catch (cause: unknown) {
      return err(this.#fileFailure(cause, path));
    }
  }

  /** Decode one strict UTF-8 JSON document without lossy replacement. */
  decode(bytes: Buffer, path: string): Result<unknown, AnalysisError> {
    try {
      return ok(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      );
    } catch (cause: unknown) {
      return err(
        new EvidenceFileError("read", "invalid-json", { path, cause }),
      );
    }
  }

  #fileFailure(cause: unknown, path: string): AnalysisError {
    const failure =
      cause instanceof AnalysisError
        ? cause
        : cause instanceof RegularFileCancelled ||
            cause instanceof RegularFileOperationCancelled
          ? new AnalysisCancelledError("project_check", {
              cause: cause.reason,
            })
          : new EvidenceFileError("read", "io", { path, cause });
    bindRegularFileCleanup(cause, failure);
    return failure;
  }
}

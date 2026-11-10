import { createHash } from "node:crypto";

import { ArtifactResourceScope } from "../../artifacts/ArtifactResourceScope.js";
import {
  ArtifactReaderFailure,
  sameArtifactEntry,
  type ArtifactEntry,
} from "../../artifacts/ArtifactReader.js";
import { DirectoryArtifactReader } from "../../artifacts/DirectoryArtifactReader.js";
import { AnalysisError } from "../../domain/analysisErrorBase.js";
import {
  AnalysisCancelledError,
  AnalysisResourceConstraintError,
} from "../../domain/analysisErrorCore.js";
import {
  EvidenceFileError,
  EvidenceIntegrityError,
} from "../../domain/evidenceErrors.js";
import {
  projectCandidateDigest,
  type ProjectCandidateInventory,
} from "../../domain/projectCheckBinding.js";
import type { ProjectManifest } from "../../domain/projectManifest.js";
import { err, ok, type Result } from "../../domain/result.js";

/** A complete observed output tree, including empty directories and executable markings. */
export interface ProjectCandidateObservation {
  readonly root: string;
  readonly sha256: string;
  readonly complete: true;
  readonly limitations: readonly string[];
  readonly inventory: ProjectCandidateInventory;
}

/** Explicit admissions bound the retained inventory and total bytes hashed, not selected files. */
export interface ProjectCandidateLimits {
  readonly maxEntries: number;
  readonly maxBytes: number;
}

/** Default complete-tree admissions can be raised by the owning workflow. */
export const DEFAULT_PROJECT_CANDIDATE_LIMITS: ProjectCandidateLimits = {
  maxEntries: 100_000,
  maxBytes: 1024 * 1024 * 1024,
};
const operation = "observe_project_candidate";

/**
 * Observe every regular file through the shared stable directory reader.
 * Symlinks, special files, changed entries and partial traversals are refused;
 * there is no implicit .git/node_modules exclusion.
 */
export const observeProjectCandidate = async (
  project: ProjectManifest,
  signal?: AbortSignal,
  resources: ArtifactResourceScope = new ArtifactResourceScope(),
  limits: ProjectCandidateLimits = DEFAULT_PROJECT_CANDIDATE_LIMITS,
): Promise<Result<ProjectCandidateObservation, AnalysisError>> => {
  if (signal?.aborted)
    return err(new AnalysisCancelledError(operation, { cause: signal.reason }));
  if (
    !Number.isSafeInteger(limits.maxEntries) ||
    limits.maxEntries < 1 ||
    !Number.isSafeInteger(limits.maxBytes) ||
    limits.maxBytes < 1
  )
    return err(
      new EvidenceIntegrityError(
        "Candidate admissions must be positive safe integers",
      ),
    );
  const reader = new DirectoryArtifactReader(project.scope.output_root);
  let result: Result<ProjectCandidateObservation, AnalysisError>;
  try {
    const root = await reader.rootObservation();
    const inventory = await scanCandidate(reader, limits, signal);
    const digest = projectCandidateDigest(inventory);
    result = digest.ok
      ? ok({
          root: root.canonicalPath,
          sha256: digest.value,
          complete: true,
          limitations: [],
          inventory,
        })
      : digest;
  } catch (cause: unknown) {
    result = err(candidateFailure(project, limits, cause));
  }
  const closed = await resources.release({
    kind: "reader",
    resource: project.scope.output_root,
    reader,
  });
  if (closed.kind === "failed") {
    const failure = new EvidenceFileError("read", "io", {
      path: project.scope.output_root,
      cause: closed.cause,
      cleanup: {
        reason: "Candidate reader cleanup is incomplete",
        resources: resources.cleanupResources,
      },
      ...(!result.ok ? { cleanupPrimary: result.error } : {}),
    });
    failure.bindCleanupResourceOwner(resources);
    return err(failure);
  }
  return result;
};

const scanCandidate = async (
  reader: DirectoryArtifactReader,
  limits: ProjectCandidateLimits,
  signal?: AbortSignal,
): Promise<ProjectCandidateInventory> => {
  const directories: string[] = [];
  const files: ProjectCandidateInventory["files"] = [];
  const entries = new Map<string, ArtifactEntry>();
  const omissions: string[] = [];
  let bytes = 0;
  const traversal = {
    maximumEntries: limits.maxEntries,
    onOmission: (omission: { readonly path: string }): void => {
      omissions.push(omission.path);
    },
    onCoverage: (coverage: {
      readonly status: string;
      readonly limitations: readonly string[];
    }): void => {
      if (coverage.status !== "complete")
        omissions.push(...coverage.limitations);
    },
  };
  for await (const entry of reader.entries(signal, traversal)) {
    if (entry.kind === "symlink")
      throw new EvidenceIntegrityError(
        "Candidate contains a symbolic link: " +
          entry.path +
          ". Select a materialized output tree.",
      );
    if (entry.limitations.length > 0)
      throw new EvidenceIntegrityError(
        "Candidate entry has incomplete metadata: " + entry.path,
      );
    entries.set(entry.path, entry);
    if (entry.kind === "directory") {
      directories.push(entry.path);
      continue;
    }
    const file = await hashCandidateFile(reader, entry, {
      remainingBytes: limits.maxBytes - bytes,
      maxBytes: limits.maxBytes,
      signal,
    });
    bytes += file.bytes;
    files.push(file);
  }
  // Detect additions/removals and metadata changes after reading all bytes.
  // The workflow independently reobserves again after executing its checker.
  const remaining = new Map(entries);
  for await (const entry of reader.entries(signal, traversal)) {
    const first = remaining.get(entry.path);
    if (first === undefined || !sameArtifactEntry(first, entry))
      throw new EvidenceIntegrityError(
        "Candidate changed during observation: " + entry.path,
      );
    remaining.delete(entry.path);
  }
  if (remaining.size > 0 || omissions.length > 0)
    throw new EvidenceIntegrityError(
      "Candidate inventory is incomplete: " +
        [...remaining.keys(), ...omissions].join(", "),
    );
  return { directories, files };
};

const hashCandidateFile = async (
  reader: DirectoryArtifactReader,
  entry: ArtifactEntry,
  options: {
    remainingBytes: number;
    maxBytes: number;
    signal: AbortSignal | undefined;
  },
): Promise<ProjectCandidateInventory["files"][number]> => {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of await reader.open(entry, options.signal)) {
    if (!(chunk instanceof Uint8Array))
      throw new EvidenceIntegrityError(
        "Candidate reader returned non-byte output: " + entry.path,
      );
    bytes += chunk.byteLength;
    if (!Number.isSafeInteger(bytes) || bytes > options.remainingBytes)
      throw new AnalysisResourceConstraintError(
        operation,
        "file-size",
        "Candidate tree exceeds the selected hashing budget",
        { max_bytes: options.maxBytes },
        { retryable: false },
      );
    hash.update(chunk);
  }
  if (entry.declaredSize !== bytes)
    throw new EvidenceIntegrityError(
      "Candidate changed while reading: " + entry.path,
    );
  return {
    path: entry.path,
    sha256: hash.digest("hex"),
    bytes,
    executable: entry.executable,
  };
};

const candidateFailure = (
  project: ProjectManifest,
  limits: ProjectCandidateLimits,
  cause: unknown,
): AnalysisError => {
  if (cause instanceof AnalysisError) return cause;
  if (cause instanceof ArtifactReaderFailure && cause.reason === "cancelled")
    return new AnalysisCancelledError(operation, {
      cause: cause.cancellation?.reason ?? cause.cause,
    });
  if (cause instanceof ArtifactReaderFailure && cause.reason === "limit")
    return new AnalysisResourceConstraintError(
      operation,
      "capacity",
      cause.message,
      { max_entries: limits.maxEntries },
      { cause, retryable: false },
    );
  return new EvidenceFileError("read", "io", {
    path: project.scope.output_root,
    cause,
  });
};

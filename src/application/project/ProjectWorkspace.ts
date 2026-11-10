import { randomUUID } from "node:crypto";
import { lstat, realpath, unlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import {
  ArtifactResourceScope,
  type ArtifactResourceOwner,
} from "../../artifacts/ArtifactResourceScope.js";
import { AnalysisError } from "../../domain/analysisErrorBase.js";
import { digestCanonicalValue } from "../../domain/canonicalDigest.js";
import {
  EvidenceFileError,
  EvidenceIntegrityError,
} from "../../domain/evidenceErrors.js";
import {
  absoluteLocalPathStringSchema,
  isPathWithinRoot,
} from "../../domain/localPath.js";
import type { ProjectManifest } from "../../domain/projectManifest.js";
import { err, ok, type Result } from "../../domain/result.js";
import {
  acquireOwnedLease,
  type OwnedLease,
} from "../../process/OwnedLease.js";
import { readJsonFile, writeTextParts } from "../JsonFiles.js";
import { ProjectRunStore } from "./ProjectRunStore.js";

const markerSchema = z.strictObject({
  schema: z.literal("tekvro.project-workspace-owner"),
  schema_version: z.literal(1),
  owner_id: z.string().uuid(),
  run_id: z.string().uuid(),
  project_id: z.string().uuid(),
  project_directory: absoluteLocalPathStringSchema,
  output_root: absoluteLocalPathStringSchema,
});

/** The live leases and durable uncertainty markers have different lifetimes. */
export interface ProjectWorkspace {
  readonly root: string;
  readonly marker_paths: readonly string[];
  assertCurrent(): Promise<Result<void, AnalysisError>>;
  mark(): Promise<Result<void, AnalysisError>>;
  release(cleanupComplete: boolean): Promise<Result<void, AnalysisError>>;
}

interface WorkspaceSelection {
  readonly root: string;
  readonly metadata: string;
  readonly selectedOutput: string;
  readonly identity: { readonly device: string; readonly inode: string };
}

type WorkspaceIdentity =
  | { readonly kind: "tekvro-project-output-path"; readonly path: string }
  | {
      readonly kind: "tekvro-project-output-inode";
      readonly device: string;
      readonly inode: string;
    };

/** One common per-user namespace; metadata aliases do not create new writer slots. */
export const projectLeaseDirectory = (): string =>
  join(tmpdir(), `tekvro-project-leases-${process.getuid?.() ?? "user"}`);

/** Own both a canonical path and its current physical directory across a stage. */
export const acquireProjectWorkspace = async (
  projectDirectory: string,
  project: ProjectManifest,
  runId: string,
  resources: ArtifactResourceScope,
  leaseDirectory = projectLeaseDirectory(),
): Promise<Result<ProjectWorkspace, AnalysisError>> => {
  const selected = await selectWorkspace(projectDirectory, project);
  if (!selected.ok) return selected;
  const workspace = new WorkspaceOwnership(selected.value, {
    runId,
    projectId: project.project_id,
    resources,
    leaseDirectory,
  });
  const acquired = await workspace.acquire();
  return acquired.ok ? ok(workspace) : acquired;
};

const selectWorkspace = async (
  projectDirectory: string,
  project: ProjectManifest,
): Promise<Result<WorkspaceSelection, AnalysisError>> => {
  try {
    const root = await realpath(project.scope.output_root);
    const metadata = await realpath(projectDirectory);
    const source = await realpath(project.scope.target.path);
    const state = await lstat(root, { bigint: true });
    if (!state.isDirectory() || state.isSymbolicLink())
      return err(
        new EvidenceIntegrityError("Project output must be a real directory"),
      );
    if (isPathWithinRoot(root, metadata) || isPathWithinRoot(root, source))
      return err(
        new EvidenceIntegrityError(
          "Keep project metadata and original source outside the Builder output directory",
        ),
      );
    return ok({
      root,
      metadata,
      selectedOutput: project.scope.output_root,
      identity: { device: String(state.dev), inode: String(state.ino) },
    });
  } catch (cause: unknown) {
    return err(
      new EvidenceFileError("read", "io", {
        path: project.scope.output_root,
        cause,
      }),
    );
  }
};

class WorkspaceOwnership implements ProjectWorkspace {
  readonly root: string;
  readonly marker_paths: readonly string[];
  readonly #identities: readonly WorkspaceIdentity[];
  readonly #marker: z.infer<typeof markerSchema>;
  readonly #leases: OwnedLease[] = [];
  readonly #marked = new Map<string, ArtifactResourceOwner>();
  readonly #owner: ArtifactResourceOwner;
  #cleanupConfirmed = false;
  #leasesReleased = false;
  #admissionClosed = false;
  #marking: Promise<Result<void, AnalysisError>> | undefined;

  constructor(
    private readonly selected: WorkspaceSelection,
    private readonly context: {
      readonly runId: string;
      readonly projectId: string;
      readonly resources: ArtifactResourceScope;
      readonly leaseDirectory: string;
    },
  ) {
    this.root = selected.root;
    this.#identities = [
      { kind: "tekvro-project-output-path", path: this.root },
      { kind: "tekvro-project-output-inode", ...selected.identity },
    ];
    this.marker_paths = this.#identities.map((identity) =>
      join(context.leaseDirectory, `${digestCanonicalValue(identity)}.json`),
    );
    this.#marker = {
      schema: "tekvro.project-workspace-owner",
      schema_version: 1,
      owner_id: randomUUID(),
      run_id: context.runId,
      project_id: context.projectId,
      project_directory: selected.metadata,
      output_root: this.root,
    };
    this.#owner = {
      kind: "lease",
      resource: this.root,
      lease: { release: () => this.#releaseOwners() },
    };
  }

  async acquire(): Promise<Result<void, AnalysisError>> {
    const { runId, resources, leaseDirectory } = this.context;
    try {
      // Named pipes do not create the directory used for persistent markers.
      if (process.platform === "win32")
        await mkdir(leaseDirectory, { recursive: true });
      for (const identity of this.#identities) {
        const acquired = await acquireOwnedLease({
          identity,
          runId,
          directory: leaseDirectory,
          failure: (failure, cause) =>
            new EvidenceIntegrityError(
              `Project workspace lease unavailable: ${failure.kind}`,
              { cause },
            ),
        });
        if (!acquired.acquired)
          return await this.#failureAfterRelease(
            new EvidenceIntegrityError(
              "Another run owns this output directory",
              {
                diagnostics: {
                  reason: "workspace_busy",
                  run_id: acquired.owner.runId,
                  process_id: acquired.owner.processId,
                },
              },
            ),
          );
        this.#leases.push(acquired.lease);
      }
      const leaseRoot = await realpath(leaseDirectory);
      if (
        (await lstat(leaseDirectory)).isSymbolicLink() ||
        isPathWithinRoot(this.root, leaseRoot)
      )
        return await this.#failureAfterRelease(
          new EvidenceIntegrityError(
            "Project ownership records must remain outside the Builder output tree",
          ),
        );
    } catch (cause: unknown) {
      return this.#failureAfterRelease(
        cause instanceof AnalysisError
          ? cause
          : new EvidenceFileError("write", "io", {
              path: leaseDirectory,
              cause,
            }),
      );
    }
    for (const path of this.marker_paths) {
      const old = await releaseConfirmedMarker(path, resources);
      if (!old.ok) return this.#failureAfterRelease(old.error);
    }
    return ok(undefined);
  }

  async assertCurrent(): Promise<Result<void, AnalysisError>> {
    if (this.#admissionClosed)
      return err(
        new EvidenceIntegrityError("Project workspace ownership was released"),
      );
    try {
      const currentRoot = await realpath(this.selected.selectedOutput);
      const current = await lstat(currentRoot, { bigint: true });
      if (
        currentRoot !== this.root ||
        !current.isDirectory() ||
        String(current.dev) !== this.selected.identity.device ||
        String(current.ino) !== this.selected.identity.inode
      )
        return err(
          new EvidenceIntegrityError(
            "Project output directory identity changed during execution",
          ),
        );
      return ok(undefined);
    } catch (cause: unknown) {
      return err(
        new EvidenceFileError("read", "io", { path: this.root, cause }),
      );
    }
  }

  mark(): Promise<Result<void, AnalysisError>> {
    if (this.#admissionClosed)
      return Promise.resolve(
        err(
          new EvidenceIntegrityError(
            "Cannot mark a released project workspace",
          ),
        ),
      );
    this.#marking ??= this.#writeMarkers();
    return this.#marking;
  }

  async release(
    cleanupComplete: boolean,
  ): Promise<Result<void, AnalysisError>> {
    this.#admissionClosed = true;
    await this.#marking;
    if (cleanupComplete && this.#leasesReleased && this.#marked.size > 0)
      return err(
        new EvidenceIntegrityError(
          "Workspace markers retained after uncertain cleanup require confirmed run recovery under a new lease",
        ),
      );
    this.#cleanupConfirmed ||= cleanupComplete;
    const released = await this.context.resources.release(this.#owner);
    if (released.kind === "released") return ok(undefined);
    if (
      released.cause instanceof AnalysisError &&
      released.cause.cleanupIncomplete
    )
      released.lease.bindCleanupError(released.cause);
    const failure = new EvidenceFileError("write", "io", {
      path: this.root,
      cause: released.cause,
      cleanup: {
        reason: "Project workspace cleanup is incomplete",
        resources: this.context.resources.cleanupResources,
      },
      ...(released.cause instanceof AnalysisError
        ? { cleanupPrimary: released.cause }
        : {}),
    });
    released.lease.bindCleanupError(failure);
    return err(failure);
  }

  async #writeMarkers(): Promise<Result<void, AnalysisError>> {
    const current = await this.assertCurrent();
    if (!current.ok) return current;
    for (const path of this.marker_paths) {
      const written = await writeTextParts(
        [`${JSON.stringify(this.#marker)}\n`],
        path,
        false,
        this.context.resources,
      );
      if (
        written.ok ||
        (written.error instanceof EvidenceFileError &&
          written.error.published !== undefined)
      )
        this.#marked.set(path, this.#markerOwner(path));
      if (!written.ok) return written;
    }
    return ok(undefined);
  }

  #markerOwner(path: string): ArtifactResourceOwner {
    // Cleanup reads cannot re-enter the parent scope while it is draining or
    // closed. This retained child scope owns any failed marker-read handles.
    const reads = new ArtifactResourceScope();
    let removed = false;
    return {
      kind: "lease",
      resource: path,
      lease: {
        release: async () => {
          await reads.retryCleanup();
          if (!removed) {
            const removal = await removeOwnMarker(
              path,
              this.#marker.owner_id,
              reads,
            );
            if (!removal.ok) throw removal.error;
            removed = true;
          }
          await reads.close();
          this.#marked.delete(path);
        },
      },
    };
  }

  async #releaseOwners(): Promise<void> {
    if (this.#cleanupConfirmed) {
      const removals = await Promise.all(
        [...this.#marked.values()].map((marker) =>
          this.context.resources.release(marker),
        ),
      );
      const failed = removals.filter((entry) => entry.kind === "failed");
      if (failed.length > 0)
        throw new EvidenceFileError("write", "io", {
          cause: new AggregateError(
            failed.map((entry) => entry.cause),
            "Project workspace marker removal failed",
          ),
          cleanup: {
            reason: "Confirmed workspace markers could not be removed",
            resources: [this.root, ...this.#marked.keys()],
          },
        });
    }
    // Keep both live leases while confirmed marker cleanup needs a retry. A new
    // acquisition cannot replace a marker between owner verification and unlink.
    const outcomes = await Promise.allSettled(
      this.#leases.map((lease) => lease.release()),
    );
    const failures = outcomes.filter(
      (entry): entry is PromiseRejectedResult => entry.status === "rejected",
    );
    if (failures.length > 0)
      throw new AggregateError(
        failures.map((entry) => entry.reason),
        "Project workspace lease release failed",
      );
    this.#leasesReleased = true;
  }

  async #failureAfterRelease(
    failure: AnalysisError,
  ): Promise<Result<never, AnalysisError>> {
    const released = await this.context.resources.release(this.#owner);
    if (released.kind === "released") return err(failure);
    const cleanup = new EvidenceFileError("write", "io", {
      path: this.context.leaseDirectory,
      cause: released.cause,
      cleanupPrimary: failure,
      cleanup: {
        reason: "Project output lease cleanup is incomplete",
        resources: this.context.resources.cleanupResources,
      },
    });
    released.lease.bindCleanupError(cleanup);
    return err(cleanup);
  }
}

const releaseConfirmedMarker = async (
  path: string,
  resources: ArtifactResourceScope,
): Promise<Result<void, AnalysisError>> => {
  try {
    await lstat(path);
  } catch (cause: unknown) {
    if (cause instanceof Error && Reflect.get(cause, "code") === "ENOENT")
      return ok(undefined);
    return err(new EvidenceFileError("read", "io", { path, cause }));
  }
  const read = await readJsonFile(
    path,
    undefined,
    resources,
    "inspect_project_workspace_owner",
  );
  if (!read.ok) return read;
  const marker = markerSchema.safeParse(read.value);
  if (!marker.success)
    return err(
      new EvidenceIntegrityError(
        "Workspace owner marker is damaged; preserve it for recovery",
        { cause: marker.error },
      ),
    );
  const history = await new ProjectRunStore(resources).read(
    marker.data.project_directory,
    marker.data.run_id,
  );
  if (!history.ok) return history;
  const run = history.value.run;
  if (
    run.project_token.project_id !== marker.data.project_id ||
    !["complete", "not_required"].includes(run.cleanup_status) ||
    ["running", "cancelling"].includes(run.execution_status)
  )
    return err(
      new EvidenceIntegrityError(
        "A previous run has unconfirmed process cleanup. Reopening its coordinator lease does not authorize a second writer.",
        {
          diagnostics: {
            reason: "workspace_recovery_unknown",
            run_id: run.run_id,
            project_directory: marker.data.project_directory,
            marker_path: path,
          },
        },
      ),
    );
  return removeOwnMarker(path, marker.data.owner_id, resources);
};

const removeOwnMarker = async (
  path: string,
  ownerId: string,
  resources: ArtifactResourceScope,
): Promise<Result<void, AnalysisError>> => {
  const read = await readJsonFile(
    path,
    undefined,
    resources,
    "release_project_workspace_owner",
  );
  if (!read.ok)
    return read.error instanceof EvidenceFileError &&
      read.error.reason === "missing"
      ? ok(undefined)
      : read;
  const parsed = markerSchema.safeParse(read.value);
  if (!parsed.success || parsed.data.owner_id !== ownerId)
    return err(
      new EvidenceIntegrityError(
        "Workspace acquisition owner changed before cleanup",
      ),
    );
  try {
    await unlink(path);
    return ok(undefined);
  } catch (cause: unknown) {
    return err(new EvidenceFileError("write", "io", { path, cause }));
  }
};

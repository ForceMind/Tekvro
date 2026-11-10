import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ProjectService } from "../../../src/application/project/ProjectService.js";
import { ArtifactResourceScope } from "../../../src/artifacts/ArtifactResourceScope.js";
import { finishAnalysisCommand } from "../../../src/cli/finishAnalysisCommand.js";
import { projectSnapshotSchema } from "../../../src/contracts/projectToolContracts.js";
import { projectAnalysisError } from "../../../src/domain/analysisErrorProjection.js";
import { projectMetadataRequest } from "../../fixtures/projectMetadata.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

it("cancels before creation and closes admission without changing project files", async () => {
  const root = await createTestTempDirectory("tekvro-project-service-cancel-");
  const request = projectMetadataRequest(root);
  const service = new ProjectService(new ArtifactResourceScope());
  try {
    const controller = new AbortController();
    controller.abort("caller cancelled");
    const result = await service.create(request, { signal: controller.signal });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected cancellation");
    expect(projectAnalysisError(result.error)).toMatchObject({
      code: "cancelled",
      details: { operation: "create_project" },
    });
    await expect(readdir(request.directory)).rejects.toMatchObject({
      code: "ENOENT",
    });

    // Close must join the whole admitted operation, not only its current file I/O.
    const created = service.create(request);
    const closed = service.close();
    const admitted = await created;
    expect(admitted.ok).toBe(true);
    await closed;
    const later = await service.create({
      ...request,
      directory: join(root, "later"),
    });
    expect(later.ok).toBe(false);
    await expect(readdir(join(root, "later"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readdir(request.directory)).toEqual(["0000000000000001.json"]);
  } finally {
    await service.close();
  }
});

it("retains a committed project snapshot through cleanup failure and supports cleanup retry", async () => {
  const root = await createTestTempDirectory("tekvro-project-service-cleanup-");
  const request = projectMetadataRequest(root);
  const resources = new ArtifactResourceScope();
  let attempts = 0;
  resources.addCloseHook(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("Retained project cleanup fixture");
  });
  const service = new ProjectService(resources);
  try {
    const controller = new AbortController();
    const result = await finishAnalysisCommand(
      () => service.create(request, { signal: controller.signal }),
      service,
      "project",
      "create_project",
      controller.signal,
    );
    expect(result).toMatchObject({ code: "cleanup_incomplete" });
    if (!("details" in result)) throw new Error("Missing cleanup diagnostics");
    const snapshot = projectSnapshotSchema.parse(
      result.details?.partial_observation,
    );
    expect(snapshot.directory).toBe(request.directory);
    expect(snapshot.token.revision).toBe(1);
    expect(await readdir(request.directory)).toEqual(["0000000000000001.json"]);
    await service.close();
    expect(attempts).toBe(2);
  } finally {
    await service.close();
  }
});

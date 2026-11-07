import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { expect, it, onTestFinished } from "vitest";

import { discoverJavaScriptPreloadPaths } from "../../../src/application/javascript/JavaScriptPreloadDiscovery.js";
import { ArtifactResourceScope } from "../../../src/artifacts/ArtifactResourceScope.js";
import { createJavaScriptSourceAnalysis } from "../../../src/artifacts/javascript/JavaScriptSourceAnalysis.js";
import type {
  JavaScriptArtifactFile,
  JavaScriptArtifactFileSet,
} from "../../../src/domain/javascript/javascriptArtifactFiles.js";
import { AnalysisError } from "../../../src/domain/analysisErrorBase.js";
import { AnalysisCancelledError } from "../../../src/domain/analysisErrorCore.js";
import { projectAnalysisError } from "../../../src/domain/analysisErrorProjection.js";
import { cleanupOwnedProcessGroup } from "../../../src/process/ProcessOwnership.js";
import {
  spawnOwnedProviderProcess,
  type ProviderProcessHandle,
} from "../../../src/process/ProviderProcess.js";

const CONTAINER = "a".repeat(64);
const LIMITS = { heapMb: 128, timeoutMs: 30_000 };

const file = (
  path: string,
  value: string,
  container = CONTAINER,
): JavaScriptArtifactFile => ({
  path,
  container_sha256: container,
  sha256: createHash("sha256").update(value).digest("hex"),
  bytes: Buffer.byteLength(value),
  inventory_artifact_id: `${container}:${path}`,
  kind: path.endsWith(".json") ? "package-json" : "javascript",
  unpacked: false,
  text: { included: true, value },
});

const inventory = (
  files: readonly JavaScriptArtifactFile[],
): JavaScriptArtifactFileSet => ({
  files,
  unavailable_relevant_files: [],
  containers: [],
  text_bytes_read: files.reduce((bytes, source) => bytes + source.bytes, 0),
  invalid_utf8_files: 0,
});

/** A literal Electron declaration, parsed as inert source rather than executed. */
const declaration = (path: string) =>
  `new BrowserWindow({ webPreferences: { sandbox: false, preload: fileURLToPath(new URL(${JSON.stringify(path)}, import.meta.url)) } });`;

const main = (...paths: readonly string[]) =>
  [
    'import { BrowserWindow } from "electron";',
    'import { fileURLToPath } from "node:url";',
    ...paths.map(declaration),
  ].join("\n");

const fixture = () =>
  inventory([
    file("package.json", '{"type":"module"}'),
    // The preload precedes its declaration and contains no renderer API name.
    file("aaa-preload.js", 'require("./helper.cjs");'),
    file("helper.cjs", "module.exports = 7;"),
    file("main.mjs", main("./aaa-preload.js")),
  ]);

interface OwnedAnalyzer {
  readonly child: ProviderProcessHandle;
  readonly root: string;
  readonly exited: Promise<void>;
}

/** Observe the production launcher while keeping the real owned worker protocol. */
const observedScope = () => {
  const scope = new ArtifactResourceScope();
  onTestFinished(() => scope.close());
  const launches: OwnedAnalyzer[] = [];
  const launcher: typeof spawnOwnedProviderProcess = async (request) => {
    const launched = await spawnOwnedProviderProcess(request);
    if (launched.process.pid === undefined || request.cwd === undefined)
      throw new Error("Owned analyzer did not expose its process and root");
    launches.push({
      child: launched.process,
      root: request.cwd,
      exited: new Promise<void>((resolve) => {
        launched.process.once("exit", () => resolve());
      }),
    });
    return launched;
  };
  return { scope, launches, launcher };
};

const warm = async (observed: ReturnType<typeof observedScope>) => {
  const worker = await createJavaScriptSourceAnalysis(LIMITS, 1, {
    scope: observed.scope,
    launcher: observed.launcher,
  });
  try {
    const result = await worker.analyze(
      file("bootstrap.mjs", "export const value = 1;"),
      { nodes: 100, unknowns: 100 },
    );
    if (!result.ok) throw result.error.error;
  } finally {
    await worker.close();
  }
};

const expectStopped = async (owned: OwnedAnalyzer) => {
  await owned.exited;
  expect(owned.child.exitCode !== null || owned.child.signalCode !== null).toBe(
    true,
  );
  await expect(stat(owned.root)).rejects.toMatchObject({ code: "ENOENT" });
};

it("discovers a later-declared helper-only preload and reuses the real worker for full analysis", async () => {
  const observed = observedScope();
  await warm(observed);
  const files = fixture();
  const before = structuredClone(files);
  expect(
    await discoverJavaScriptPreloadPaths(files, LIMITS, observed.scope),
  ).toEqual({
    paths: new Set([`${CONTAINER}:aaa-preload.js`]),
    limitations: [],
  });
  const normal = await createJavaScriptSourceAnalysis(LIMITS, 1, {
    scope: observed.scope,
  });
  try {
    const result = await normal.analyze(
      file("aaa-preload.js", 'require("./helper.cjs");'),
      { nodes: 100, unknowns: 100 },
      undefined,
      undefined,
      "commonjs",
    );
    if (!result.ok) throw result.error.error;
    expect(result.value.javascript.parse_status).toBe("complete");
    expect(result.value.module?.moduleLinks).toContainEqual(
      expect.objectContaining({ kind: "require", specifier: "./helper.cjs" }),
    );
    expect(result.value.projection?.nodes.length).toBeGreaterThan(0);
  } finally {
    await normal.close();
  }
  expect(files).toEqual(before);
  expect(observed.launches).toHaveLength(1);
  const owned = observed.launches[0];
  if (owned === undefined) throw new Error("Expected an owned analyzer");
  await observed.scope.close();
  await expectStopped(owned);
}, 60_000);

it("does not infer preloads from ESM require text, excluded sources, unresolved paths or other containers", async () => {
  const scope = new ArtifactResourceScope();
  onTestFinished(() => scope.close());
  const excluded = file("excluded-main.mjs", main("./unselected-preload.js"));
  const excludedPreload = file(
    "excluded-preload.js",
    'require("./helper.cjs");',
  );
  const files = inventory([
    ...fixture().files,
    file(
      "cross-main.mjs",
      main(
        "./other-container/preload.js",
        "./missing.js",
        "./excluded-preload.js",
      ),
    ),
    file(
      "other-container/preload.js",
      'require("./helper.cjs");',
      "b".repeat(64),
    ),
    file(
      "invalid.js",
      'const { BrowserWindow } = require("electron"); new BrowserWindow({ webPreferences: { preload: "./invalid-preload.js" } });',
    ),
    file("invalid-preload.js", 'require("./helper.cjs");'),
    {
      ...excluded,
      text: { included: false, reason: "outside-analysis-scope" },
    },
    {
      ...excludedPreload,
      text: { included: false, reason: "outside-analysis-scope" },
    },
    file("unselected-preload.js", 'require("./helper.cjs");'),
    file(
      "dynamic-main.mjs",
      'import { BrowserWindow } from "electron"; new BrowserWindow({ webPreferences: { preload: choosePreload() } });',
    ),
  ]);
  const before = structuredClone(files);
  expect(await discoverJavaScriptPreloadPaths(files, LIMITS, scope)).toEqual({
    // Keep a valid control so these refusals do not pass by skipping discovery.
    paths: new Set([`${CONTAINER}:aaa-preload.js`]),
    limitations: [],
  });
  expect(files).toEqual(before);
  await scope.close();
  expect(scope.hasPending).toBe(false);
}, 60_000);

it("preserves cancellation and releases a previously running owned discovery worker", async () => {
  const observed = observedScope();
  await warm(observed);
  const controller = new AbortController();
  const reason = new Error("caller cancelled preload discovery");
  controller.abort(reason);
  await expect(
    discoverJavaScriptPreloadPaths(
      fixture(),
      LIMITS,
      observed.scope,
      controller.signal,
    ),
  ).rejects.toMatchObject({
    _tag: "AnalysisCancelledError",
    cause: reason,
  });
  const owned = observed.launches[0];
  if (owned === undefined) throw new Error("Expected an owned analyzer");
  await observed.scope.close();
  expect(observed.scope.hasPending).toBe(false);
  expect(observed.launches).toHaveLength(1);
  await expectStopped(owned);
}, 60_000);

it("retains cancellation through an owned cleanup refusal and recovers the same failure after retry", async () => {
  const observed = observedScope();
  let permitCleanup = false;
  const launcher: typeof spawnOwnedProviderProcess = async (request) => {
    const launched = await observed.launcher(request);
    return {
      ...launched,
      cleanup: async () =>
        permitCleanup
          ? launched.cleanup === undefined
            ? cleanupOwnedProcessGroup(launched.ownership)
            : launched.cleanup()
          : { cleaned: false, reason: "fixture owned cleanup is unavailable" },
    };
  };
  try {
    await warm({ ...observed, launcher });
    const controller = new AbortController();
    const reason = new Error(
      "cancelled while discovery worker cleanup is denied",
    );
    controller.abort(reason);
    let failure: AnalysisError | undefined;
    try {
      await discoverJavaScriptPreloadPaths(
        fixture(),
        LIMITS,
        observed.scope,
        controller.signal,
      );
    } catch (cause: unknown) {
      if (!(cause instanceof AnalysisError)) throw cause;
      failure = cause;
    }
    if (failure === undefined)
      throw new Error("Expected owned cleanup failure");
    expect(projectAnalysisError(failure).code).toBe("cleanup_incomplete");
    expect(failure.cleanupIncomplete).toBe(true);
    expect(observed.scope.hasPending).toBe(true);
    let primary = failure;
    while (primary.cleanupPrimary !== undefined)
      primary = primary.cleanupPrimary;
    expect(primary).toBeInstanceOf(AnalysisCancelledError);
    expect(primary.cause).toBe(reason);

    permitCleanup = true;
    await observed.scope.retryCleanup();
    await observed.scope.close();
    expect(observed.scope.hasPending).toBe(false);
    expect(failure.cleanupIncomplete).toBe(false);
    expect(failure.cleanupResources).toEqual([]);
    expect(primary.cause).toBe(reason);
    expect(observed.launches).toHaveLength(1);
    const owned = observed.launches[0];
    if (owned === undefined) throw new Error("Expected an owned analyzer");
    await expectStopped(owned);
  } finally {
    permitCleanup = true;
    await observed.scope.close();
  }
}, 60_000);

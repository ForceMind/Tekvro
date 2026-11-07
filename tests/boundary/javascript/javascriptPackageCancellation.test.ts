import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";

import { analyzeJavaScriptApplication } from "../../../src/application/javascript/JavaScriptApplicationService.js";
import { parseApplicationGraphEvidence } from "../../../src/application/javascript/JavaScriptApplicationEvidenceGraph.js";
import { ArtifactResourceScope } from "../../../src/artifacts/ArtifactResourceScope.js";
import { AnalysisCancelledError } from "../../../src/domain/analysisErrorCore.js";
import { projectAnalysisError } from "../../../src/domain/analysisErrorProjection.js";
import { parseEvidence } from "../../../src/domain/evidence.js";
import { javascriptApplicationAnalysisResultSchema } from "../../../src/domain/javascript/javascriptApplicationAnalysis.js";
import { scanCanonicalArtifactInventory } from "../../fixtures/artifactInventory.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";

it.each(["aborted signal", "typed progress cancellation"] as const)(
  "retains canonical inventory Evidence when preload discovery receives %s",
  async (cancellation) => {
    const root = await createTestTempDirectory("rea-js-preload-cancellation-");
    const files = {
      "package.json": '{"type":"module","main":"main.mjs"}',
      "aaa-preload.js": 'require("./helper.cjs");',
      "helper.cjs": "module.exports = 7;",
      "main.mjs": [
        'import { BrowserWindow } from "electron";',
        'import { fileURLToPath } from "node:url";',
        'new BrowserWindow({ webPreferences: { sandbox: false, preload: fileURLToPath(new URL("./aaa-preload.js", import.meta.url)) } });',
      ].join("\n"),
    };
    await Promise.all(
      Object.entries(files).map(([path, content]) =>
        writeFile(join(root, path), content),
      ),
    );
    const inventoried = await scanCanonicalArtifactInventory(root, {
      integrity: { mode: "fail" },
    });
    const scope = new ArtifactResourceScope();
    onTestFinished(() => scope.close());
    const controller = new AbortController();
    const reason = { request: "cancelled during real preload discovery parse" };
    const phases: string[] = [];
    const result = await analyzeJavaScriptApplication(
      { input_path: root, format: "directory", max_heap_mb: 128 },
      scope,
      {
        signal: controller.signal,
        progress: {
          async report(event) {
            phases.push(event.phase);
            if (event.phase !== "javascript_preload_discovery_parse") return;
            if (cancellation === "aborted signal") controller.abort(reason);
            else
              throw new AnalysisCancelledError(
                "analyze_javascript_application",
                {
                  cause: reason,
                },
              );
          },
        },
      },
    );
    expect(phases).toContain("javascript_preload_discovery_parse");
    expect(phases).not.toContain("parse_javascript_source");
    expect(phases.some((phase) => phase.startsWith("javascript_worker_"))).toBe(
      false,
    );
    if (result.ok)
      throw new Error("Cancelled discovery must not report success");
    expect(result.error.cause).toBe(reason);
    expect(projectAnalysisError(result.error).code).toBe("cancelled");

    // Authenticate serialized Evidence, rather than accepting a cached owned object.
    const evidence = parseEvidence(
      JSON.parse(JSON.stringify(result.error.partialObservation)),
    );
    expect(parseApplicationGraphEvidence(evidence).ok).toBe(true);
    expect(evidence.operation).toBe("analyze_javascript_application");
    expect(evidence.parameters.input_path).toBe(root);
    expect(evidence.subject?.digest.sha256).toBe(
      inventoried.manifest.root_sha256,
    );
    const partial = javascriptApplicationAnalysisResultSchema.parse(
      evidence.normalized_result,
    );
    expect(partial).toMatchObject({
      input_path: root,
      root_artifact_sha256: inventoried.manifest.root_sha256,
      inventory_manifest_id: inventoried.manifest.manifest_id,
      inventory_graph_sha256: inventoried.manifest.graph_sha256,
      integrity_contradictions: [],
      statistics: {
        relevant_files: 4,
        parsed_javascript_files: 0,
        visited_ast_nodes: 0,
        modules: 0,
      },
      summary: { browser_windows: 0, preload_entrypoints: 0 },
    });
    expect(partial.graph.coverage.status).not.toBe("complete");
    expect(evidence.limitations).toContain(
      "Preload discovery was cancelled; no complete preload inventory or source semantics were established.",
    );
    for (const path of ["aaa-preload.js", "helper.cjs", "main.mjs"]) {
      const scopes = partial.graph.nodes.flatMap((node) =>
        node.kind !== "unknown"
          ? []
          : node.observations.filter(
              ({ properties }) =>
                properties.path === path &&
                properties.analysis_failure !== undefined,
            ),
      );
      expect(scopes, path).toContainEqual(
        expect.objectContaining({
          properties: expect.objectContaining({
            analysis_status: "not-started",
          }),
          evidence: expect.objectContaining({
            state: "unavailable",
            confidence: "unknown",
          }),
        }),
      );
    }
    await scope.close();
    expect(scope.hasPending).toBe(false);
    expect(result.error.cleanupIncomplete).toBe(false);
    expect(result.error.cause).toBe(reason);
    expect(
      await Promise.all(
        Object.keys(files).map((path) => readFile(join(root, path), "utf8")),
      ),
    ).toEqual(Object.values(files));
  },
  60_000,
);

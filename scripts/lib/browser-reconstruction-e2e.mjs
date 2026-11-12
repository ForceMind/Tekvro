import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";

import { createBrowserScenarioProvider } from "../../dist/composition/browserScenario.js";
import { browserScenarioSchema } from "../../dist/domain/browserScenario.js";
import { compareBrowserScenarios } from "../../dist/domain/browserScenarioDiff.js";
import { compareBrowserScenariosInputSchema } from "../../dist/domain/browserScenarioDiffValues.js";
import { withVerifierCleanup } from "./verifier-cleanup.mjs";

function fixturePage(increment) {
  return `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Counter reconstruction fixture</title>
<style>
body { margin: 0; font: 20px sans-serif; background: #f2f5f8; }
main { max-width: 480px; margin: 24px auto; padding: 16px; }
@media (max-width: 500px) { main { margin: 8px; } }
</style>
<main><h1>Counter</h1><p id="count"></p><button id="add">Add one</button></main>
<script>
const key = "fixture-counter";
let count = Number(localStorage.getItem(key) ?? 0);
const render = () => { document.querySelector("#count").textContent = count; };
document.querySelector("#add").addEventListener("click", () => {
  count += ${increment};
  localStorage.setItem(key, String(count));
  render();
});
render();
</script>`;
}

async function listen(server) {
  const ready = once(server, "listening");
  server.listen(0, "127.0.0.1");
  await ready;
  return `http://127.0.0.1:${server.address().port}`;
}

function close(server) {
  if (!server.listening) return;
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function capture(executable, origin, width) {
  const url = `${origin}/`;
  const result = await createBrowserScenarioProvider(
    process.env,
  ).captureScenario(
    browserScenarioSchema.parse({
      browser: { mode: "launch", executable_path: executable },
      start_url: { url },
      environment: {
        viewport: { width, height: 640, device_scale_factor: 1 },
        locale: "en-US",
        timezone: "UTC",
        color_scheme: "light",
        reduced_motion: "reduce",
      },
      actions: [
        {
          step_id: "increment",
          action: "click",
          locator: { kind: "css", selector: "#add" },
        },
        {
          step_id: "reopen",
          action: "goto",
          destination: { url },
          wait_until: "load",
        },
      ],
      capture: {
        after_each_step: ["screenshot", "storage", "url"],
        at_end: [],
      },
    }),
  );
  if (!result.ok) throw result.error;
  const evidence = result.value;
  assert.equal(evidence.browser.cleanup, "terminated-owned-process");
  assert.equal(evidence.completeness.equality_eligible, true);
  const reopened = evidence.steps.find(({ step_id }) => step_id === "reopen");
  assert.ok(reopened, "Reopening must produce a retained step");
  const { screenshot, storage } = reopened.artifacts;
  assert.equal(screenshot.state, "captured");
  assert.equal(screenshot.value.width, width);
  assert.equal(screenshot.value.height, 640);
  assert.equal(storage.state, "captured");
  const counter = storage.value.local_storage.find(
    ({ name }) => name === "fixture-counter",
  );
  assert.ok(counter?.value_sha256, "Reopening must observe the stored counter");
  return {
    evidence,
    counter: counter.value_sha256,
    png: screenshot.value.sha256,
  };
}

const fingerprint = (value) => createHash("sha256").update(value).digest("hex");

function compare(reference, candidate, rules = []) {
  return compareBrowserScenarios(
    compareBrowserScenariosInputSchema.parse({
      before_scenario: reference.evidence,
      after_scenario: candidate.evidence,
      normalization: { rules },
    }),
  );
}

function fixtureServer(increment) {
  return createServer((request, response) => {
    if (request.url !== "/") {
      response.writeHead(404).end();
      return;
    }
    response
      .writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      })
      .end(fixturePage(increment()));
  });
}

/** Compare observed page behavior against a verifier-owned reference and expected state. */
export async function verifyBrowserReconstruction(executable) {
  let increment = 1;
  const reference = fixtureServer(() => 1);
  const candidate = fixtureServer(() => increment);
  return withVerifierCleanup(async () => {
    const referenceOrigin = await listen(reference);
    const candidateOrigin = await listen(candidate);
    const rules = [
      {
        rule_id: "candidate-origin",
        artifacts: ["url", "action_state", "storage"],
        match: candidateOrigin,
        replacement: referenceOrigin,
      },
    ];
    const viewports = [];
    const expectedCounter = fingerprint("1");

    for (const width of [390, 768, 1440]) {
      const original = await capture(executable, referenceOrigin, width);
      const rebuilt = await capture(executable, candidateOrigin, width);
      assert.equal(original.counter, expectedCounter);
      assert.equal(rebuilt.counter, expectedCounter);
      const unmapped = compare(original, rebuilt);
      assert.ok(
        unmapped.alignment.failures.some(
          ({ code }) => code === "capture_context_mismatch",
        ),
      );
      const matched = compare(original, rebuilt, rules);
      assert.equal(
        matched.overall_status,
        "unchanged",
        JSON.stringify(matched),
      );
      assert.equal(matched.alignment.status, "aligned");
      viewports.push({
        width,
        status: matched.overall_status,
        normalization_sha256: matched.normalization.sha256,
        reference_png: original.png,
        candidate_png: rebuilt.png,
      });

      if (width === 390) {
        increment = 2;
        const broken = await capture(executable, candidateOrigin, width);
        assert.equal(broken.counter, fingerprint("2"));
        assert.notEqual(broken.counter, expectedCounter);
        const changed = compare(original, broken, rules);
        assert.equal(changed.overall_status, "changed");
        const reopen = changed.steps.find(
          ({ step_id }) => step_id === "reopen",
        );
        for (const artifact of ["storage", "screenshot"]) {
          assert.ok(
            reopen?.artifact_diffs.some(
              (entry) =>
                entry.artifact === artifact && entry.status === "changed",
            ),
            `Reopening must expose the defect in ${artifact}`,
          );
        }
        increment = 1;
        const repaired = await capture(executable, candidateOrigin, width);
        assert.equal(repaired.counter, expectedCounter);
        assert.equal(
          compare(original, repaired, rules).overall_status,
          "unchanged",
        );
      }
    }

    return {
      mocked: false,
      viewports,
      defect_detected: true,
      repair_verified: true,
    };
  }, [() => close(reference), () => close(candidate)]);
}

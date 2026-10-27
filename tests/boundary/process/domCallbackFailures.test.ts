import { fileURLToPath } from "node:url";
import { expect } from "vitest";

import { processTest } from "../../support/process/processFixture.js";

processTest(
  "renderer DOM callbacks report rejected bridge actions and preserve successful actions",
  async ({ processes }) => {
    const cases = [
      {
        path: fileURLToPath(
          new URL(
            "../../../website/public/examples/notes-electron/renderer.js",
            import.meta.url,
          ),
        ),
        button: "#export",
        output: "#status",
        failure: "Export failed",
        diagnostic: "Notes export failed",
        successfulReply: "/selected/notes.csv",
        success: "Saved to /selected/notes.csv",
        api: "notes",
      },
      {
        path: fileURLToPath(
          new URL(
            "../../conformance/readiness/electron/renderer.js",
            import.meta.url,
          ),
        ),
        button: "#run",
        output: "#result",
        failure: "Echo failed",
        diagnostic: "Renderer echo failed",
        successfulReply: "renderer reply",
        success: "renderer reply",
        api: "readiness",
      },
    ];
    // Execute the real classic scripts with controlled DOM/bridge seams. This
    // covers discarded event returns, not a live Electron or browser runtime.
    const source = `
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
for (const scenario of ${JSON.stringify(cases)}) {
  const failure = new Error("selected bridge rejected");
  const errors = [];
  let action, deepLink, finish, text = "";
  let reply = () => Promise.reject(failure);
  const output = {
    get textContent() { return text; },
    set textContent(value) { text = value; finish(); },
  };
  const button = { addEventListener(type, callback) {
    assert.equal(type, "click"); action = callback;
  }};
  const api = scenario.api === "notes"
    ? { exportCsv: () => reply() }
    : { echo: (value) => { assert.equal(value, "renderer"); return reply(); },
        onDeepLink: (callback) => { deepLink = callback; } };
  runInNewContext(readFileSync(scenario.path, "utf8"), {
    document: { querySelector(selector) {
      if (selector === scenario.button) return button;
      assert.equal(selector, scenario.output); return output;
    }},
    window: { [scenario.api]: api },
    console: { error: (...arguments_) => errors.push(arguments_) },
  }, { filename: scenario.path });
  let completed = new Promise((resolve) => { finish = resolve; });
  action(); // DOM event dispatch ignores any callback return value.
  await completed;
  assert.equal(text, scenario.failure);
  assert.deepEqual(errors, [[scenario.diagnostic, failure]]);
  reply = () => Promise.resolve(scenario.successfulReply);
  completed = new Promise((resolve) => { finish = resolve; });
  action();
  await completed;
  assert.equal(text, scenario.success);
  assert.equal(errors.length, 1);
  if (deepLink) {
    deepLink({}, "rea://selected/link");
    assert.equal(text, "rea://selected/link");
  }
}
`;
    const result = await processes.run(
      process.execPath,
      [
        "--unhandled-rejections=strict",
        "--input-type=module",
        "--eval",
        source,
      ],
      { timeoutMs: 10_000 },
    );
    expect(result.signal, result.stderr).toBeNull();
    expect(result.exitCode, result.stderr).toBe(0);
  },
);

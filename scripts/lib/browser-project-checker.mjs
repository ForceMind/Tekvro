import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  captureReconstructionPage,
  compareReconstructionPages,
  reconstructionOriginRules,
  withReconstructionPages,
} from "./browser-reconstruction-e2e.mjs";

const [scenarioPath, referencePath, candidatePath, executable] =
  process.argv.slice(2);
const { width, expected_counter } = JSON.parse(
  await readFile(scenarioPath, "utf8"),
);
const [referencePage, candidatePage] = await Promise.all([
  readFile(referencePath, "utf8"),
  readFile(candidatePath, "utf8"),
]);
const expected = createHash("sha256").update(expected_counter).digest("hex");
const { status, detail } = await withReconstructionPages(
  referencePage,
  candidatePage,
  async (referenceOrigin, candidateOrigin) => {
    const reference = await captureReconstructionPage(
      executable,
      referenceOrigin,
      width,
    );
    const candidate = await captureReconstructionPage(
      executable,
      candidateOrigin,
      width,
    );
    const comparison = compareReconstructionPages(
      reference,
      candidate,
      reconstructionOriginRules(referenceOrigin, candidateOrigin),
    );
    let status = "unknown";
    if (
      reference.counter === expected &&
      comparison.alignment.status === "aligned"
    ) {
      if (
        candidate.counter !== expected ||
        comparison.overall_status === "changed"
      )
        status = "fail";
      else if (comparison.overall_status === "unchanged") status = "pass";
    }
    return {
      status,
      detail: JSON.stringify({
        viewport_width: width,
        comparison_status: comparison.overall_status,
        normalization_sha256: comparison.normalization.sha256,
        reference_png_sha256: reference.png,
        candidate_png_sha256: candidate.png,
        expected_counter_sha256: expected,
        reference_counter_sha256: reference.counter,
        candidate_counter_sha256: candidate.counter,
        changed_artifacts: comparison.steps.flatMap(
          ({ step_id, artifact_diffs }) =>
            artifact_diffs
              .filter(({ status }) => status === "changed")
              .map(({ artifact }) => ({ step_id, artifact })),
        ),
      }),
    };
  },
);
process.stdout.write(
  JSON.stringify({
    schema: "tekvro.project-check-result",
    schema_version: 1,
    check_id: process.env.TEKVRO_PROJECT_CHECK_ID,
    binding: JSON.parse(process.env.TEKVRO_PROJECT_CHECK_BINDING),
    checks: [{ requirement_id: "reopened_counter", status, detail }],
  }),
);
process.exitCode = status === "fail" ? 1 : 0;

import { expect, it } from "vitest";

import {
  PROJECT_RUN_TEST_ID,
  PROJECT_RUN_TEST_TIME,
  projectRunTestManifest,
  takeProjectResult as take,
} from "../../tests/fixtures/projectRun.js";
import { createProjectCheckBinding } from "./projectCheckBinding.js";
import { sealProjectRevision } from "./projectManifest.js";
import {
  createProjectRunRecord,
  projectRunRecordSchema,
  transitionProjectRun,
  type ProjectRunRecord,
} from "./projectRun.js";

const initialCandidate = "b".repeat(64);
const partialCandidate = "f".repeat(64);
const checkIds = [
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];
const initial = (): ProjectRunRecord =>
  take(
    createProjectRunRecord({
      project: sealProjectRevision(projectRunTestManifest(), null),
      run_id: PROJECT_RUN_TEST_ID,
      phase: "build",
      created_at: PROJECT_RUN_TEST_TIME,
      adapter: { id: "bounded-builder", version: null, model: null },
      budget: {
        wall_time_ms: 40,
        max_attempts: 4,
        max_no_progress_attempts: 2,
      },
    }),
  );
const bind = (run: ProjectRunRecord, candidate_sha256: string) =>
  take(
    createProjectCheckBinding(projectRunTestManifest(), run.run_id, {
      candidate_sha256,
      checker_sha256: "c".repeat(64),
      scenario_sha256: "d".repeat(64),
      environment_sha256: "e".repeat(64),
    }),
  );
const eventAt = (event: Record<string, unknown>, elapsed_ms: number) => ({
  ...event,
  at: new Date(Date.parse(PROJECT_RUN_TEST_TIME) + elapsed_ms).toISOString(),
  elapsed_ms,
});
const advance = (
  run: ProjectRunRecord,
  event: Record<string, unknown>,
  elapsed_ms = run.elapsed_ms + 1,
): ProjectRunRecord =>
  take(transitionProjectRun(run, eventAt(event, elapsed_ms)));
const partialBuild = (
  run: ProjectRunRecord,
  observed_tokens: number | null,
) => ({
  kind: "build_paused",
  binding: bind(run, partialCandidate),
  reason: "budget_exhausted",
  observed_tokens,
  cleanup_status: "complete",
});
const finish = (run: ProjectRunRecord, check_id: string): ProjectRunRecord => {
  const binding = bind(run, initialCandidate);
  const pending = advance(run, {
    kind: "build_completed",
    binding,
    observed_tokens: 123,
    cleanup_status: "complete",
  });
  const checking = advance(pending, { kind: "check_started", binding });
  return advance(checking, {
    kind: "check_completed",
    binding,
    check_id,
    outcome: "pass",
    cleanup_status: "complete",
  });
};

it("resumes from a cleaned partial candidate without resetting accumulated run history", () => {
  let completed = initial();
  for (const checkId of checkIds) {
    const kind = completed.execution_status === "idle" ? "start" : "refine";
    completed = finish(advance(completed, { kind }), checkId);
  }
  const running = advance(completed, { kind: "refine" });
  expect(running.observed_tokens).toBe(246);
  const paused = advance(running, partialBuild(running, null), 40);
  expect(paused).toMatchObject({
    execution_status: "paused",
    phase: "refine",
    stop_reason: "budget_exhausted",
    cleanup_status: "complete",
    candidate_sha256: partialCandidate,
    pending_check: null,
    acceptance_status: "not_evaluated",
    attempt: 3,
    elapsed_ms: 40,
    no_progress_attempts: 1,
    observed_tokens: null,
    budget: running.budget,
    budget_revision: 1,
    check_ids: checkIds,
  });
  const restored = projectRunRecordSchema.parse(
    JSON.parse(JSON.stringify(paused)),
  );
  const blocked = advance(restored, { kind: "resume" });
  expect(blocked).toMatchObject({ execution_status: "paused", attempt: 3 });
  const extended = advance(blocked, {
    kind: "set_budget",
    budget: { ...blocked.budget, wall_time_ms: 80 },
    reason: "Explicitly continue the saved partial build",
  });
  const resumed = advance(extended, { kind: "resume" });
  expect(resumed).toMatchObject({
    execution_status: "running",
    phase: "refine",
    candidate_sha256: partialCandidate,
    attempt: 4,
    elapsed_ms: 43,
    no_progress_attempts: 1,
    budget_revision: 2,
    observed_tokens: null,
    pending_check: null,
    check_ids: checkIds,
  });
  const pending = advance(resumed, {
    kind: "build_completed",
    binding: bind(resumed, partialCandidate),
    observed_tokens: 9,
    cleanup_status: "complete",
  });
  expect(pending.observed_tokens).toBeNull();
});

it("rejects partial candidates with a different fixed identity or an ineligible stage", () => {
  const idle = initial();
  const running = advance(idle, { kind: "start" });
  const event = partialBuild(running, null);
  for (const differentIdentity of [
    { project_id: "55555555-5555-4555-8555-555555555555" },
    { run_id: "66666666-6666-4666-8666-666666666666" },
    { source_sha256: "0".repeat(64) },
    { scope_revision: 2 },
    { scope_sha256: "0".repeat(64) },
    { requirements_sha256: "0".repeat(64) },
  ])
    expect(
      transitionProjectRun(
        running,
        eventAt(
          { ...event, binding: { ...event.binding, ...differentIdentity } },
          40,
        ),
      ).ok,
    ).toBe(false);

  const pending = advance(running, {
    kind: "build_completed",
    binding: bind(running, initialCandidate),
    observed_tokens: 1,
    cleanup_status: "complete",
  });
  const checking = advance(pending, {
    kind: "check_started",
    binding: pending.pending_check,
  });
  const paused = advance(running, event, 40);
  for (const state of [idle, pending, checking, paused])
    expect(transitionProjectRun(state, eventAt(event, 41)).ok).toBe(false);

  for (const override of [
    { cleanup_status: "pending" },
    { cleanup_status: "incomplete" },
    { cleanup_status: "unknown" },
    { reason: "User pause" },
  ])
    expect(
      transitionProjectRun(running, eventAt({ ...event, ...override }, 40)).ok,
    ).toBe(false);
});

it("retains observed token totals when each paused attempt has a known total", () => {
  const running = advance(initial(), { kind: "start" });
  const first = advance(running, partialBuild(running, 7), 40);
  expect(first).toMatchObject({
    observed_tokens: 7,
    attempt: 1,
    phase: "build",
  });
  const extended = advance(first, {
    kind: "set_budget",
    budget: { ...first.budget, wall_time_ms: 80 },
    reason: "Allow another bounded attempt",
  });
  const resumed = advance(extended, { kind: "resume" });
  const second = advance(resumed, partialBuild(resumed, 5), 80);
  expect(second).toMatchObject({
    observed_tokens: 12,
    attempt: 2,
    elapsed_ms: 80,
    candidate_sha256: partialCandidate,
    pending_check: null,
    check_ids: [],
    acceptance_status: "not_evaluated",
    no_progress_attempts: 0,
  });
});

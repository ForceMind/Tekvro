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
  type ProjectRunBudget,
  type ProjectRunRecord,
} from "./projectRun.js";

const checkId = "33333333-3333-4333-8333-333333333333";
const nextCheckId = "44444444-4444-4444-8444-444444444444";
const candidate = "b".repeat(64);
const create = (budget?: Partial<ProjectRunBudget>): ProjectRunRecord =>
  take(
    createProjectRunRecord({
      project: sealProjectRevision(projectRunTestManifest(), null),
      run_id: PROJECT_RUN_TEST_ID,
      phase: "build",
      created_at: PROJECT_RUN_TEST_TIME,
      adapter: { id: "fixture-builder", version: "1", model: null },
      ...(budget === undefined ? {} : { budget }),
    }),
  );
const binding = (candidate_sha256 = candidate) =>
  take(
    createProjectCheckBinding(projectRunTestManifest(), PROJECT_RUN_TEST_ID, {
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
const perform = (
  run: ProjectRunRecord,
  event: Record<string, unknown>,
  elapsed = run.elapsed_ms + 1,
): ProjectRunRecord => take(transitionProjectRun(run, eventAt(event, elapsed)));
const build = (
  run: ProjectRunRecord,
  candidate_sha256 = candidate,
): ProjectRunRecord =>
  perform(run, {
    kind: "build_completed",
    binding: binding(candidate_sha256),
    observed_tokens: 123,
    cleanup_status: "complete",
  });
const check = (run: ProjectRunRecord, id = checkId): ProjectRunRecord => {
  const started = perform(run, {
    kind: "check_started",
    binding: run.pending_check,
  });
  return perform(started, {
    kind: "check_completed",
    binding: run.pending_check,
    check_id: id,
    outcome: "pass",
    cleanup_status: "complete",
  });
};

it("saves a cleaned pending check before execution and preserves the acceptance boundary", () => {
  const idle = create();
  const started = perform(idle, { kind: "start" });
  const pending = build(started);
  expect(pending).toMatchObject({
    execution_status: "paused",
    phase: "check",
    stop_reason: "pending_check",
    cleanup_status: "complete",
    attempt: 1,
    observed_tokens: 123,
    pending_check: binding(),
  });
  const restored = projectRunRecordSchema.parse(
    JSON.parse(JSON.stringify(pending)),
  );
  expect(
    transitionProjectRun(restored, eventAt({ kind: "resume" }, 3)).ok,
  ).toBe(false);
  expect(
    transitionProjectRun(
      restored,
      eventAt(
        {
          kind: "check_completed",
          binding: binding(),
          check_id: checkId,
          outcome: "pass",
          cleanup_status: "complete",
        },
        3,
      ),
    ).ok,
  ).toBe(false);
  const completed = check(restored);
  expect(completed).toMatchObject({
    execution_status: "succeeded",
    acceptance_status: "unknown",
    last_check_status: "pass",
    pending_check: null,
    check_ids: [checkId],
  });
  expect(idle.execution_status).toBe("idle");
  expect(
    projectRunRecordSchema.safeParse({ ...idle, execution_status: "succeeded" })
      .success,
  ).toBe(false);
  expect(
    transitionProjectRun(completed, eventAt({ kind: "start" }, 10)).ok,
  ).toBe(false);
  expect(
    projectRunRecordSchema.safeParse({
      ...completed,
      acceptance_status: "pass",
    }).success,
  ).toBe(false);
});

it("refuses changed bindings and unsettled cleanup before a result is committed", () => {
  const started = perform(create(), { kind: "start" });
  const staleBinding = { ...binding(), scope_revision: 2 };
  expect(
    transitionProjectRun(
      started,
      eventAt(
        {
          kind: "build_completed",
          binding: staleBinding,
          observed_tokens: 1,
          cleanup_status: "complete",
        },
        2,
      ),
    ).ok,
  ).toBe(false);
  const pending = build(started);
  expect(
    transitionProjectRun(
      pending,
      eventAt({ kind: "check_started", binding: binding("f".repeat(64)) }, 3),
    ).ok,
  ).toBe(false);
  const running = perform(pending, {
    kind: "check_started",
    binding: binding(),
  });
  for (const override of [
    { binding: { ...binding(), environment_sha256: "f".repeat(64) } },
    { cleanup_status: "incomplete" },
  ])
    expect(
      transitionProjectRun(
        running,
        eventAt(
          {
            kind: "check_completed",
            binding: binding(),
            check_id: checkId,
            outcome: "pass",
            cleanup_status: "complete",
            ...override,
          },
          4,
        ),
      ).ok,
    ).toBe(false);
});

it("does not automatically replay a checker after interruption at its started boundary", () => {
  const pending = build(perform(create(), { kind: "start" }));
  const running = perform(pending, {
    kind: "check_started",
    binding: binding(),
  });
  expect(running.cleanup_status).toBe("unknown");
  const interrupted = perform(running, {
    kind: "interrupt",
    reason: "Connection lost",
    cleanup_status: "unknown",
  });
  expect(interrupted).toMatchObject({
    execution_status: "interrupted",
    acceptance_status: "unknown",
    pending_check: binding(),
  });
  for (const event of [
    { kind: "start" },
    { kind: "resume" },
    { kind: "check_started", binding: binding() },
  ])
    expect(transitionProjectRun(interrupted, eventAt(event, 5)).ok).toBe(false);
});

it("retains consumed attempts on reopen and requires a recorded budget change for more work", () => {
  const completed = check(build(perform(create(), { kind: "start" })));
  const restored = projectRunRecordSchema.parse(
    JSON.parse(JSON.stringify(completed)),
  );
  const exhausted = perform(restored, { kind: "refine" });
  expect(exhausted).toMatchObject({
    execution_status: "paused",
    phase: "refine",
    stop_reason: "budget_exhausted",
    attempt: 1,
  });
  const extended = perform(exhausted, {
    kind: "set_budget",
    budget: { ...exhausted.budget, max_attempts: 2 },
    reason: "Explicitly allow one further refinement",
  });
  expect(extended).toMatchObject({
    attempt: 1,
    budget_revision: 2,
    budget_change_reason: "Explicitly allow one further refinement",
  });
  const retry = perform(extended, { kind: "resume" });
  expect(retry).toMatchObject({ execution_status: "running", attempt: 2 });
  expect(
    transitionProjectRun(
      retry,
      eventAt(
        {
          kind: "set_budget",
          budget: retry.budget,
          reason: "In-flight edit",
        },
        retry.elapsed_ms + 1,
      ),
    ).ok,
  ).toBe(false);
});

it("detects unchanged candidate contents across explicit refinement attempts", () => {
  const initial = create({ max_attempts: 4, max_no_progress_attempts: 1 });
  const first = check(build(perform(initial, { kind: "start" })));
  const second = build(perform(first, { kind: "refine" }));
  expect(second).toMatchObject({
    execution_status: "paused",
    stop_reason: "no_progress",
    no_progress_attempts: 1,
    attempt: 2,
  });
  const completed = check(second, nextCheckId);
  const blocked = perform(completed, { kind: "refine" });
  expect(blocked).toMatchObject({
    execution_status: "paused",
    stop_reason: "no_progress",
    attempt: 2,
  });
});

it("keeps a pending check through a wall-time pause without granting automatic extra time", () => {
  const started = perform(create({ wall_time_ms: 10 }), { kind: "start" });
  const pending = perform(
    started,
    {
      kind: "build_completed",
      binding: binding(),
      observed_tokens: null,
      cleanup_status: "complete",
    },
    10,
  );
  expect(pending).toMatchObject({
    stop_reason: "budget_exhausted",
    observed_tokens: null,
  });
  const blocked = perform(
    pending,
    { kind: "check_started", binding: binding() },
    11,
  );
  expect(blocked).toMatchObject({
    execution_status: "paused",
    pending_check: binding(),
    stop_reason: "budget_exhausted",
  });
  const extended = perform(
    blocked,
    {
      kind: "set_budget",
      budget: { ...blocked.budget, wall_time_ms: 20 },
      reason: "Allow the pending independent check",
    },
    12,
  );
  expect(
    perform(extended, { kind: "check_started", binding: binding() }, 13)
      .execution_status,
  ).toBe("running");
});

it("rejects time reversal, arbitrary terminal restarts, and interrupted token totals", () => {
  const running = perform(create(), { kind: "start" }, 10);
  expect(
    transitionProjectRun(
      running,
      eventAt(
        { kind: "pause", reason: "User pause", cleanup_status: "complete" },
        9,
      ),
    ).ok,
  ).toBe(false);
  const requested = perform(running, { kind: "cancel_requested" });
  const cancelled = perform(requested, {
    kind: "cancelled",
    cleanup_status: "incomplete",
  });
  expect(cancelled).toMatchObject({
    execution_status: "cancelled",
    cleanup_status: "incomplete",
  });
  expect(
    transitionProjectRun(cancelled, eventAt({ kind: "resume" }, 13)).ok,
  ).toBe(false);
  const failed = perform(running, {
    kind: "fail",
    reason: "Builder failed",
    cleanup_status: "complete",
  });
  expect(failed).toMatchObject({
    execution_status: "failed",
    observed_tokens: null,
    acceptance_status: "unknown",
  });
});

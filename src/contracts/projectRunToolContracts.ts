import {
  adjustProjectRunBudgetRequestSchema,
  buildProjectRequestSchema,
  checkProjectRequestSchema,
  inspectProjectRunRequestSchema,
  projectExecutionSnapshotSchema,
  refineProjectRequestSchema,
  resumeProjectBuildRequestSchema,
} from "../domain/projectExecution.js";
import { toolContractMetadata } from "./toolEffects.js";
import type { ToolContract } from "./toolContractTypes.js";

const runId = "33333333-3333-4333-8333-333333333333";
const runSelection = {
  directory: "/analysis/projects/login",
  run_id: runId,
};
const continuation = {
  ...runSelection,
  expected: { run_id: runId, sequence: 4, digest: "c".repeat(64) },
  checker_path: "/analysis/verifiers/login/checker.json",
};

/** Explicit bounded actions; no contract accepts arbitrary lifecycle or acceptance patches. */
export const PROJECT_RUN_TOOL_CONTRACTS = [
  {
    name: "build_project",
    ...toolContractMetadata("build_project"),
    kind: "application",
    description:
      "Start one bounded local Codex Builder attempt against the exact inspected project token. Uses the project's selected output directory, the existing Codex configuration and workspace-write sandbox. Requires an independently selected checker manifest outside the output tree. Persists run events and original Builder output, then stops at a durable pending-check boundary. This executes a real configured CLI and may use its network/model access; availability is not established by installation. Agent completion does not establish project acceptance.",
    inputSchema: buildProjectRequestSchema,
    outputSchema: projectExecutionSnapshotSchema,
    examples: [
      {
        title: "Build one candidate with explicit finite limits",
        input: {
          directory: runSelection.directory,
          expected: {
            project_id: "22222222-2222-4222-8222-222222222222",
            revision: 1,
            digest: "b".repeat(64),
          },
          instruction:
            "Implement the observed login flow in the selected output directory.",
          checker_path: continuation.checker_path,
          budget: {
            wall_time_ms: 600000,
            max_attempts: 1,
            max_no_progress_attempts: 2,
          },
        },
      },
    ],
  },
  {
    name: "check_project",
    ...toolContractMetadata("check_project"),
    kind: "application",
    description:
      "Execute exactly the run's saved pending independent check after revalidating candidate, scope, verifier and environment bindings. Never replays the Builder. Runs the caller-selected checker as owned local code, without claiming it is sandboxed. Persists complete output, failures and cleanup facts. A checker pass remains one bound observation; missing, stale or incomplete results stay unknown and do not establish full project acceptance.",
    inputSchema: checkProjectRequestSchema,
    outputSchema: projectExecutionSnapshotSchema,
    examples: [
      {
        title: "Check a saved candidate after reopening the project",
        input: continuation,
      },
    ],
  },
  {
    name: "refine_project",
    ...toolContractMetadata("refine_project"),
    kind: "application",
    description:
      "Request one additional Builder attempt for a previously checked run against its exact run token. Reuses the selected adapter/model and independent verifier; does not switch accounts or adapters. Enforces saved finite time, attempt and no-progress limits, and pauses when they are exhausted. A successful attempt stops at a new pending-check boundary. It does not automatically check, retry or grant acceptance.",
    inputSchema: refineProjectRequestSchema,
    outputSchema: projectExecutionSnapshotSchema,
    examples: [
      {
        title: "Refine the checked candidate once",
        input: {
          ...continuation,
          instruction:
            "Correct the independently observed invalid-credentials behavior.",
        },
      },
    ],
  },
  {
    name: "resume_project_build",
    ...toolContractMetadata("resume_project_build"),
    kind: "application",
    description:
      "Start one fresh bounded Builder attempt from a safe paused run boundary using its exact run token and remaining finite budget. This is a workflow continuation with a new Codex turn, not Codex session resumption; that capability is unqualified and unavailable. A saved pending check must use check_project instead. Never silently replays an interrupted process or automatically increases a budget.",
    inputSchema: resumeProjectBuildRequestSchema,
    outputSchema: projectExecutionSnapshotSchema,
    examples: [
      {
        title:
          "Continue a safely paused Builder after an explicit budget adjustment",
        input: {
          ...continuation,
          instruction:
            "Continue the selected candidate within the revised finite limits.",
        },
      },
    ],
  },
  {
    name: "inspect_project_run",
    ...toolContractMetadata("inspect_project_run"),
    kind: "application",
    description:
      "Read and validate the persisted run event chain and current project without launching a Builder or checker. Returns the exact run token, budgets, pending-check boundary, observed cleanup and separate execution/acceptance states. projection_status reports whether the current project reflects this run; inspecting an outdated projection does not repair it or promote acceptance.",
    inputSchema: inspectProjectRunRequestSchema,
    outputSchema: projectExecutionSnapshotSchema,
    examples: [
      {
        title: "Inspect one persisted run and obtain its current token",
        input: runSelection,
      },
    ],
  },
  {
    name: "adjust_project_run_budget",
    ...toolContractMetadata("adjust_project_run_budget"),
    kind: "application",
    description:
      "Record explicitly chosen finite run limits and a reason against the exact previous run token. Preserves consumed time, attempt count, no-progress history and any pending check. This only appends a budget decision; it does not launch a process, reset consumption, authorize an infinite loop or automatically continue paid model work. Inspect the result before separately requesting the permitted next action.",
    inputSchema: adjustProjectRunBudgetRequestSchema,
    outputSchema: projectExecutionSnapshotSchema,
    examples: [
      {
        title: "Increase a paused run's finite allowance without executing it",
        input: {
          ...runSelection,
          expected: continuation.expected,
          budget: {
            wall_time_ms: 900000,
            max_attempts: 2,
            max_no_progress_attempts: 3,
          },
          reason: "Permit one more explicitly requested correction attempt.",
        },
      },
    ],
  },
] as const satisfies readonly ToolContract[];

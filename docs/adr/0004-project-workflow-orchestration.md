# ADR-0004: Persistent project workflows and evidence-bound acceptance

- Status: Accepted for implementation planning
- Date: 2026-11-08
- Implementation status: Planned. This record adds no runtime commands, MCP tools,
  builder support, graphical workbench, or platform qualification to version 1.0.0.
- Baseline: `ee5ebf85b35c800c92d2e308ea601c158c529596`.

## Context

Tekvro already provides shared CLI/MCP analysis services, immutable Evidence,
residual unknowns, analysis snapshots, browser scenarios and comparisons,
screenshot differences, reconstruction obligation and coverage evaluators, and
offline agent environments. Those capabilities remain the implementation base.

A reconstruction obligation evaluator consumes proofs; it does not start the
commands named in a manifest. Guided MCP prompts describe investigation workflows;
they do not supervise a coding agent. An offline agent environment reproduces
observed responses within its recorded coverage; it does not establish an
unobserved backend or generate an entire application.

The recurring user outcome now being planned is a local project that retains its
research goal, evidence, implementation, checks and unresolved questions across
analysis, coding-agent turns and interrupted runs. This requires a narrow project
coordinator around existing operations, with inspectable state and actual
executors. It does not require a new general workflow language or a second
evidence format.

## Decision

### 1. Add an optional project coordinator above existing application services

The existing TypeScript domain, contracts, application and provider boundaries
remain authoritative. Project lifecycle contracts are additive. A project can
have an investigation goal or a reconstruction goal; investigation can finish
with findings and explicit unknowns without starting a builder.

The coordinator composes ordinary build commands, existing analysis workflows and
registered validators. Provider protocols stay in adapters. The CLI, MCP and a
future local workbench invoke the same application services. New MCP operations
must express a distinct useful outcome and return evidence and diagnostics inline.
They must not expose a plan-only replacement for an available executor.

### 2. Persist the project independently of an agent conversation

A versioned project record binds the goal and its revision, selected target
identities, output workspace, execution stage, evidence references, check history,
unresolved items and selected builder identity. Artifact references retain content
digests and project-relative placement; source locations remain evidence data.

The persistence contract requires atomic replacement, revision-based conflict
detection, one active writer per project, explicit schema migration and refusal to
overwrite an unsupported future schema. A project copy never adopts a foreign
process merely because a saved PID or pathname matches. Imported conversations
are optional context; the project files and bound evidence determine continuity.

### 3. Separate execution, usability and acceptance

`execution_status` records execution lifecycle. `phase` identifies the current
study, build, check, refine or delivery stage. `acceptance_status` is separately
`not_evaluated`, `pass`, `fail` or `unknown`. Whether an artifact starts or displays
is a usability observation, not an acceptance verdict.

The project's verdict composes existing evaluator results and required checks
for the declared goal. Existing ledger and coverage enums remain unchanged. A
mandatory unknown, missing proof, contradictory result or inapplicable proof
cannot yield project acceptance. Requirements cannot be silently removed to
produce a pass; an explicit scope revision invalidates affected proofs and keeps
the previous scope and result available.

### 4. Make validators independent of builder self-reports

A builder adapter changes project files and emits execution events. A validator
executes a bounded check and produces Evidence. Tekvro binds each accepted proof
to the relevant target, implementation digest, obligation revision, checker and
capture environment under the existing evidence contracts.

Website and H5 workflows reuse screenshot and scenario comparison services.
They compare declared pages, viewports and interaction states. Dynamic-region
masking is recorded with its coverage and cannot suppress a functional failure.
Game self-reports are supplementary observations; independent input replay and
measurement are required before claiming behavior qualification.

### 5. Recover at durable boundaries and stop without inventing success

Persist a pending-check boundary before treating a builder turn as complete.
Recovery revalidates the workspace and check applicability, then resumes the
necessary phase instead of blindly repeating a build. Persist progress fingerprints,
failed-attempt accounting and configured resource limits. A paused run reports its
reason, such as exhausted budget or no progress; an unexpected interruption remains
distinguishable from an intentional pause.

Cancellation and cleanup reuse `src/process/` ownership and supervision primitives.
Keep partial evidence and the primary failure even if cleanup also fails. Retrying
does not silently erase the recorded allowance or treat identical file writes as
progress. A user-directed scope or budget change is an explicit revision.

### 6. Report adapter capability and execution scope precisely

Analysis engines, reasoning models, coding-agent executors and validators have
different roles. A configured endpoint or an installed executable does not prove
that a coding agent supports images, MCP injection, cancellation, permission
interaction or session resume. Adapter discovery must report individual supported,
unsupported and unverified capabilities. A first real adapter is qualified by a
complete local project run before it is advertised.

Project data and orchestration are local. Selecting an external model or agent is
an explicit provider choice with a documented data boundary; no project telemetry,
cloud synchronization or ambient-environment persistence is introduced. Analysis
scope and execution authority are separate. Existing user authorization is reused
within scope, and selected operations do not acquire redundant approval booleans.
Scope expansion follows the existing host and adapter policy. Source content and
model output never grant authority or answer pending user decisions.

### 7. Deliver one measured workflow before broadening targets

The first product milestone is a reproducible webpage/H5 workflow using an owned
fixture, one real coding-agent adapter, existing comparison services and an
independent acceptance oracle. Deliberately introduced defects must be detected.
UI work follows the headless contract; desktop and game behavior qualification is
added per actual host, engine and scenario. Unrun combinations remain unverified.

## Alternatives considered

| Alternative                                             | Decision and reason                                                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Replace the analysis core                               | Preserve the existing core and evidence contracts; the observed gap is project coordination.         |
| Add a generic workflow DSL                              | Compose ordinary commands and existing services; a DSL has no established requirement in this scope. |
| Treat a chat transcript as project state                | Persist explicit goal, artifacts, checks and lifecycle; a transcript is optional context.            |
| Treat a successful build as completion                  | Record usability separately and require evidence-qualified acceptance.                               |
| Accept the builder's own test report as the sole oracle | Require independently executed checks and negative controls for behavior claims.                     |
| Implement every agent and platform together             | Qualify one complete workflow, then add capabilities with per-host evidence.                         |

## Compatibility and consequences

Existing commands, MCP identities, Evidence schemas, local-only defaults,
`TEKVRO_LANG`, configuration backups, legacy aliases and publication guards remain
in force. The new design does not change version 1.0.0 support or trigger a release.
The maintenance tracks for installation, localization and real-host verification
continue independently.

The additional cost is explicit project lifecycle and artifact management. The
benefit is a resumable user outcome whose progress, limitations and completion
can be inspected independently of the coding agent.

## Delivery and verification records

- [Product and technical design](../project-workflow-design.md)
- [Implementation work packages and handoff](../project-workflow-plan.md)
- [Acceptance matrix and evidence record](../project-workflow-acceptance.md)
- [Current product roadmap](../roadmap.md)
- [Existing reconstruction obligation contract](../reconstruction-obligation-ledgers.md)
- [Existing browser scenario contract](../browser-scenario-contract.md)
- [Existing agent environment boundary](../agent-environments.md)

The planning documents define the implementation gates. A merged planning record
is not evidence that any new runtime capability has shipped.

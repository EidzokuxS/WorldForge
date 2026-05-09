# Phase 88 Final Plan Review 3

## Verdict

**BLOCK**

The external-review fixes landed in the architecture. Phase 88 now preserves the full target: key NPC co-player processes, backend authority, private POV, proposal-only detached work, command-node factions, durable world threads, rollback-aware memory, latency/context traces, and sectional wave proof. It does not narrow to an MVP, polling shortcut, narrator-only combat, faction ghost mind, or backend-GM hidden shortcut.

Execution should still not start. The remaining blockers are in verification wiring: task/proof `<automated>` blocks exist, but several run test paths that do not match the plan's own declared files/verification gates, and the final live Playwright proof is not in the task-level automated gates. That means the plan can appear Nyquist-compliant while executing the wrong or incomplete proof.

Tooling note: the local `@gsd-build/sdk` CLI path was unavailable under `node_modules`, so this review used direct static parsing of the plan files and line-number checks. No source code was edited.

## Blockers

### 1. Task-level automated verify commands drift from declared test artifacts

**Severity:** BLOCKER  
**Dimension:** nyquist_compliance / task_completeness / verification_derivation

The prior missing-`<automated>` blocker is only partially fixed. Automated blocks are now present, but multiple plans point those commands at test files that are not the tests declared in `files_modified`, task files, or the plan-level verification section.

Evidence:

- `88-03-PLAN.md:21` declares `turn-boundary-authority.test.ts`, and `88-03-PLAN.md:65` / `88-03-PLAN.md:170` declare the gate as `chat.scene-plan.test.ts`, `simulation-queue.test.ts`, and `turn-boundary-authority.test.ts`; task automated blocks instead run `turn-boundary-settlement.test.ts` at `88-03-PLAN.md:89`, `88-03-PLAN.md:114`, `88-03-PLAN.md:143`, and `88-03-PLAN.md:167`.
- `88-05-PLAN.md:22` and `88-05-PLAN.md:23` declare `actor-decision-packet.test.ts` and `actor-tools.test.ts`; `88-05-PLAN.md:61` / `88-05-PLAN.md:161` use those gates; task automated blocks instead run `actor-decision-tools.test.ts` at `88-05-PLAN.md:84`, `88-05-PLAN.md:109`, `88-05-PLAN.md:136`, and `88-05-PLAN.md:158`.
- `88-07-PLAN.md:25` through `88-07-PLAN.md:27` declare `knowledge-model.test.ts`, `memory-policy.test.ts`, and `reflection-agent.test.ts`; `88-07-PLAN.md:68` / `88-07-PLAN.md:193` use those gates; task automated blocks instead run `actor-memory-knowledge.test.ts` at `88-07-PLAN.md:90`, `88-07-PLAN.md:114`, `88-07-PLAN.md:142`, `88-07-PLAN.md:168`, and `88-07-PLAN.md:190`.
- `88-09-PLAN.md:24` and `88-09-PLAN.md:25` declare `world-thread.test.ts` and `world-thread-surfacing.test.ts`; `88-09-PLAN.md:62` / `88-09-PLAN.md:164` use those gates; task automated blocks instead run `world-thread-engine.test.ts` at `88-09-PLAN.md:85`, `88-09-PLAN.md:112`, `88-09-PLAN.md:139`, and `88-09-PLAN.md:161`.
- `88-10-PLAN.md:24` through `88-10-PLAN.md:26` declare `turn-latency-trace.test.ts`, `context-budget-trace.test.ts`, and `parallel-simulation-runner.test.ts`; `88-10-PLAN.md:64` / `88-10-PLAN.md:163` use those gates; task automated blocks instead run `simulation-trace-latency.test.ts` at `88-10-PLAN.md:86`, `88-10-PLAN.md:110`, `88-10-PLAN.md:137`, and `88-10-PLAN.md:160`.
- `88-11-PLAN.md:23` declares `phase-88-integration.test.ts`; `88-11-PLAN.md:67` uses that gate; task automated blocks instead run `living-world-integration.test.ts` at `88-11-PLAN.md:91`, `88-11-PLAN.md:114`, `88-11-PLAN.md:139`, `88-11-PLAN.md:163`, and `88-11-PLAN.md:188`.

Why this blocks:

- The executor is told to create/modify one set of tests but run another.
- If the alternate names are intended umbrella suites, the plan must declare them in `files_modified` and task `files`.
- If they are accidental names, the automated gates will fail or skip the planned coverage.

Fix:

- For each plan, make every task/proof `<automated>` command run the exact declared test gates, or explicitly add the umbrella test file to `files_modified` and the relevant task `files`.
- Keep the plan-level verification and task-level automated commands identical enough that an executor cannot pass the wrong suite.

### 2. Final live Playwright proof is not enforced by task-level automation

**Severity:** BLOCKER  
**Dimension:** requirement_coverage / nyquist_compliance / verification_derivation

P88-R12 requires deterministic and live proof. `88-11` names the right top-level live commands, but the task/proof `<automated>` blocks do not run them.

Evidence:

- `88-11-PLAN.md:69` declares `PHASE88_MODE=deterministic node --import tsx/esm e2e/88-living-world-playtest.ts`.
- `88-11-PLAN.md:70` declares `PHASE88_MODE=live node --import tsx/esm e2e/88-living-world-playtest.ts`.
- `88-11-PLAN.md:123` through `88-11-PLAN.md:146` define the live harness task and dry-run manifest acceptance.
- `88-11-PLAN.md:148` through `88-11-PLAN.md:171` define focused/deep live routes and require `output/playwright/phase-88-living-world/summary.json`.
- But the task/proof automated blocks at `88-11-PLAN.md:139`, `88-11-PLAN.md:163`, and `88-11-PLAN.md:188` only run a backend test/typecheck command, not the deterministic or live Playwright profiles.

Why this blocks:

- The final plan could pass task-level automation while never running the required live route corpus.
- `88-VALIDATION.md:11` says live routes cannot waive deterministic failures, but Phase 88 also requires live evidence after deterministic gates. The task-level gate must prove both layers when it reaches `88-11`.

Fix:

- Add the deterministic Playwright command to the Task 3 `<automated>` block.
- Add the live profile command or an explicit runnable live-profile smoke/deep command to Task 4 and the proof addendum.
- Keep backend deterministic tests first, then Playwright commands, then artifact checks for `output/playwright/phase-88-living-world/summary.json`.

## Flags

### 1. Scope remains dense even after task-count fix

**Severity:** WARNING  
**Dimension:** scope_sanity

The prior "5 tasks" blocker is fixed: every plan now has exactly four `### Task` blocks, and proof addenda are separate (`88-01` has `tasks=4`, `88-02` has `tasks=4`, through `88-11` with `tasks=4`). However, four tasks is still the GSD warning threshold, and some plans touch broad surfaces:

- `88-03-PLAN.md` targets 13 files across chat routing, turn processor, queues, traces, runtime state, snapshots, tests, and docs.
- `88-07-PLAN.md` targets 13 files across schema, migration, knowledge, memory, reflection, vectors, compression, ActorFrame, and tests.
- `88-09-PLAN.md` targets 11 files across world threads, forecasts, location events, scene assembly, PlayerFacingPacket, schema, migration, and tests.

Execution can proceed after the blockers are fixed, but these plans should be watched as split candidates if context or merge risk grows.

### 2. Conceptual waves contain dependent plans

**Severity:** WARNING  
**Dimension:** dependency_correctness / execution_order

The dependency graph itself is valid and acyclic:

- `88-01-PLAN.md:8` now correctly has `depends_on: []`.
- `88-05` depends on `88-04`, `88-07` depends on `88-06`, `88-09` depends on `88-08`, and `88-11` depends on `88-10`.

But `88-EXECUTION-WAVES.md` groups some of those pairs inside the same named wave. That is acceptable only if the executor honors `depends_on` inside the conceptual wave rather than launching every plan in a wave as a parallel batch.

## Prior Blocker Status

| Prior blocker | Status | Evidence |
| --- | --- | --- |
| `88-01 depends_on` invalid | Fixed | `88-01-PLAN.md:8` is `depends_on: []`. |
| More than four `### Task` blocks | Fixed | Static parse: every `88-01` through `88-11` plan has four `### Task` blocks; proof addenda were not counted. |
| Missing `<automated>` verify blocks | Partly fixed | Every task/proof block has `<automated>`, but blockers above show command drift and missing live automation. |
| External trace/write-scope flags | Fixed | `88-03-PLAN.md:30`, `88-03-PLAN.md:109`, `88-04-PLAN.md:28`, `88-04-PLAN.md:57`, `88-04-PLAN.md:130`. |
| Proposal-only detached adapters | Fixed | `88-03-PLAN.md:27`, `88-03-PLAN.md:60`, `88-03-PLAN.md:136`. |
| Actor combat ToolResult contract | Fixed | `88-05-PLAN.md:29`, `88-05-PLAN.md:50`, `88-05-PLAN.md:57`, `88-05-PLAN.md:131`, `88-05-PLAN.md:143`. |
| Hybrid knowledge retrieval/persistence | Fixed | `88-07-PLAN.md:34`, `88-07-PLAN.md:55`, `88-07-PLAN.md:136`. |
| Failure/replan semantics | Fixed | `88-06-PLAN.md:27`, `88-06-PLAN.md:54`, `88-06-PLAN.md:100`. |
| Forecast boundary tests | Fixed | `88-09-PLAN.md:28`, `88-09-PLAN.md:31`, `88-09-PLAN.md:58`, `88-09-PLAN.md:134`. |
| LLM judge calibration | Fixed | `88-11-PLAN.md:33`, `88-11-PLAN.md:62`, `88-11-PLAN.md:133`, `88-11-PLAN.md:158`. |
| Docs reconciliation | Fixed | `88-03-PLAN.md:22`, `88-03-PLAN.md:23`, `88-03-PLAN.md:162`. |
| Fail-fast wave gates | Fixed | `88-EXECUTION-WAVES.md:9`; `88-11-PLAN.md:63`. |

## Coverage Summary

| Requirement | Covered by plans | Status |
| --- | --- | --- |
| P88-R1 authority spine | 88-01, 88-05 | Covered |
| P88-R2 done boundary/proposals | 88-01, 88-03, 88-06 | Covered |
| P88-R3 ActorFrame/PlayerFacingPacket | 88-02, 88-07, 88-09 | Covered |
| P88-R4 KeyActorProcess | 88-04, 88-05, 88-06 | Covered |
| P88-R5 ActorDecisionPacket/tools | 88-05 | Covered |
| P88-R6 world-time plan execution/catch-up | 88-06, 88-09 | Covered |
| P88-R7 memory/belief/report/rumor | 88-07, 88-08 | Covered |
| P88-R8 faction command networks | 88-08, 88-09 | Covered |
| P88-R9 WorldThreads | 88-09 | Covered |
| P88-R10 latency/context observability | 88-02, 88-04, 88-07, 88-08, 88-10 | Covered |
| P88-R11 rollback/retry/restore | 88-01, 88-03, 88-04, 88-07, 88-11 | Covered |
| P88-R12 deterministic/live proof | 88-10, 88-11 | Covered, but blocked by live automation wiring above |

## Readiness Statement

Phase 88 is architecturally ready but not execution-ready. The plans are goal-backward sufficient in scope and sequencing, and the external review flags are materially incorporated. Execution should remain blocked until task-level automated verification is made coherent with the declared test artifacts and `88-11` task automation actually runs the deterministic/live Playwright proof.

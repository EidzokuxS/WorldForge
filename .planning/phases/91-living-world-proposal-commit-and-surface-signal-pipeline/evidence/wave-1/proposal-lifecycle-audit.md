# Phase 91-01 Proposal Lifecycle Audit

Date: 2026-05-10

## GitNexus Preflight

| Target | Result | Direct d=1 callers / readers | Risk | 91-01 action |
|---|---|---|---|---|
| `simulationProposals` | Not indexed as a symbol; audited with `rg` over schema/engine/tests | `due-world-work`, `living-world-authority`, `simulation-queue`, `simulation-proposal`, Phase 88/queue/authority tests | Schema shared table | Add nullable/defaulted columns only; preserve existing `status` values and payload JSON compatibility. |
| `createSimulationProposal` | `impact(upstream, includeTests=true, maxDepth=2)` | `enqueueProposal`, `queueDeferredActorDecision`, `recordFailure` | HIGH | Keep input additions optional and keep idempotency behavior/read payload shape compatible. |
| `commitSimulationProposal` | `impact(upstream, includeTests=true, maxDepth=2)` | No indexed direct runtime callers; tests import it directly | LOW | Route through shared preflight while preserving legacy result reasons for existing callers/tests. |
| `writeScopesConflict` | `impact(upstream, includeTests=true, maxDepth=2)` | `reserveActorWriteScopes`, `scopesConflict` | LOW | Reuse as-is for proposal blocked scope checks; do not change conflict semantics. |
| `validateBaseWorldVersion` | `impact(upstream, includeTests=true, maxDepth=2)` | `advanceWorldThread`, `executeToolCall`, `commitAuthorityTrace`, `queueSimulationJob`, `recordSimulationProposal`, `proposeFactionOperation` | CRITICAL | Do not edit in 91-01; proposal preflight reads the clock and leaves authority validation untouched. |
| `parseSimulationProposalPayload` | `impact(upstream, includeTests=true, maxDepth=2)` | `findReusableProposalByIdempotencyKey`, `createSimulationProposal`, `commitSimulationProposal`, `queueDeferredActorDecision` | HIGH | Add backward-compatible defaults for new payload fields; preserve legacy payload reads. |
| `enqueueProposal` | `impact(upstream, includeTests=true, maxDepth=2)` | `queuePostTurnSimulationProposals` | LOW | Populate due time, expiry, priority, and intended tools from the existing queue clock/priority. |
| `queueDeferredActorDecision` | `impact(upstream, includeTests=true, maxDepth=2)` | `resolveDueWorldWorkForScope` | LOW | Populate actor-decision lifecycle metadata without changing defer routing. |
| `recordFailure` | `impact(upstream, includeTests=true, maxDepth=2)` | `executeTravel`, `executeRecordEvent`, `executeWait`, `executeActorPlanStep` | HIGH | Populate replan request lifecycle metadata only; no actor execution behavior changes. |

## Existing Producers And Consumers

- `simulation-queue.ts` produces post-turn proposals through `enqueueProposal -> queueSimulationJob -> createSimulationProposal`.
- `due-world-work.ts` produces visible-scope actor-decision proposals through `queueDeferredActorDecision -> createSimulationProposal`.
- `actor-plan-executor.ts` creates replan proposals in `recordFailure`.
- `living-world-authority.ts` owns low-level proposal insert and rollback invalidation.
- `simulation-proposal.ts` owns parse/create/commit lifecycle behavior.
- Existing tests assert Phase 88 compatibility: idempotent proposal reuse, provider secret redaction, interval scheduling, stale/conflict/expired legacy rejection behavior, and rollback cancellation.

## Compatibility Mapping

| Existing row shape | Phase 91 interpretation |
|---|---|
| `status = pending`, no disposition column | proposal is still a non-truth pending proposal; parsed disposition defaults to `pending`. |
| `status = committed` | committed world truth; parsed disposition defaults to `committed`. |
| `status = rejected`, `rejection_reason = expired` | non-truth terminal disposition `expired_stale_version`. |
| `status = rejected`, `rejection_reason = stale_base_world_version` | legacy direct commit rejection; preflight classifies stale rows as `needs_rebase` or `needs_actor_retry` when read-set information is available. |
| `status = rejected`, any other reason | non-truth terminal disposition `rejected_invalid`. |
| `status = canceled` | non-truth terminal disposition `rejected_invalid` with cancellation reason preserved. |
| `status = superseded` | non-truth terminal disposition `superseded_by_new_event`. |

## Scope Guard

91-01 will not change `validateBaseWorldVersion`, authority trace semantics, or queue idempotency uniqueness. The intended schema migration is additive and defaulted so existing SQLite rows remain readable.

## Verification

- `npm --prefix backend run test -- src/engine/__tests__/simulation-proposal-lifecycle.test.ts src/engine/__tests__/simulation-queue.test.ts` passed: 2 files, 9 tests.
- `npm --prefix backend run test -- src/engine/__tests__/simulation-proposal-lifecycle.test.ts src/engine/__tests__/simulation-queue.test.ts src/engine/__tests__/actor-plan-executor.test.ts src/engine/__tests__/turn-boundary-authority.test.ts src/engine/__tests__/phase-88-integration.test.ts` passed: 5 files, 16 tests.
- `npm --prefix backend run typecheck` passed.
- `git diff --check` passed with CRLF warnings only.
- `gitnexus_detect_changes({ scope: "all" })` reported HIGH risk with expected affected processes: `CommitSimulationProposal -> Now`, `CommitSimulationProposal -> GetDb`, `ExecuteTravel -> ...`, and `ExecuteActorPlanStep -> ...`.

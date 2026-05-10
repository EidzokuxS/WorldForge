# 93-02 Summary: Safe Parallel Frame Retrieval and Actor Proposal Prep

## Outcome

Phase 93-02 is implemented.

Read-only frame retrieval now has an explicit runner that schedules frame jobs through the existing write-scope-aware parallel planner with empty write scopes. Actor required-pass work retrieves ActorFrame knowledge in a read-only parallel phase before proposal/decision prep, and due-world non-deterministic actor work records a proposal-prep audit trace showing which write scopes can run together and which must serialize.

## Code Changes

- Added `backend/src/engine/frame-retrieval-runner.ts` and exported it from `backend/src/engine/index.ts`.
- Routed ActorFrame knowledge retrieval in `runRequiredActorDecisionPass` through read-only `runFrameRetrievalJobs`.
- Preserved actor decision/proposal prep through `runParallelSimulationJobs` so conflicting write scopes still serialize.
- Added `parallelFrameRetrievalTrace` beside `parallelPrepTrace` for required actor decisions.
- Added actor frame retrieval groups to `TurnLatencyTrace.parallelGroups`.
- Added due-world `proposalPrepTrace` metadata so deferred actor proposal prep exposes group count and serialized fallback count without pretending deferred work executed.
- Kept failed retrieval jobs as failed results; no fake successful no-op output is produced.

## Verification

Passed:

```powershell
npm --prefix backend run test -- src/engine/__tests__/parallel-simulation-runner.test.ts src/engine/__tests__/frame-retrieval-runner.test.ts src/engine/__tests__/actor-frame.test.ts src/engine/__tests__/actor-tools.test.ts src/engine/__tests__/turn-processor.observability.test.ts src/engine/__tests__/offscreen-catchup.test.ts
npm --prefix backend run typecheck
git diff --check
```

Result:

- 6 focused test files passed.
- 22 focused tests passed.
- Backend typecheck passed.
- Diff check passed with CRLF normalization warnings only.

## Follow-Up Scope

Later Phase 93 plans still own context frame budgets, source-linked summarization, narrator redaction audit, UI trace copy, and final acceptance proof.

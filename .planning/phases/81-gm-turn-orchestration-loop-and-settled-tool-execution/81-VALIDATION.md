# Phase 81 VALIDATION

## Deterministic Gates

- Backend typecheck.
- Preflight dirty-worktree/baseline report.
- Stage 0 SceneFrame + scoped forecast envelope tests.
- Focused GM Read tests.
- Turn processor ordering/path gating tests.
- Checklist schema tests.
- Tool-step loop tests.
- Narrator packet guard tests.
- Frontend stage/status tests for the new orchestration stage taxonomy.
- GitNexus detect changes before closeout.

## Live Playability Gate

Fresh campaign, not a reused Naruto/JJK/GDKX fixture.

Required coverage:

- opening scene completes;
- at least 10 player turns complete;
- direct narration turn;
- clarification turn;
- oracle turn;
- single-tool mutation;
- multi-step mutation;
- rejected or revised tool step;
- skipped/failed step does not appear as happened in narration;
- no private/offscreen refs leak into visible output.

## Evidence To Record

- Campaign id.
- Provider/model settings.
- Player actions.
- Per-turn latency and per-stage latency.
- SSE stage order.
- GM Read path per turn.
- Checklist items and statuses for mutating turns.
- Tool results.
- Final narration sanity notes.
- Logs for any failure/revision.

## Per-Turn Verification Matrix

Every live turn in the closeout playtest must record:

| Turn | Player action | Expected path | GM Read path | Expected stages | Actual stages | Oracle outcome | Checklist size | Tool step statuses | Expected DB/state delta | Actual DB/state delta | Narration grounded? | Private/offscreen leak? | Coherence 1-5 | Latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Passing live play requires:

- expected path and actual path are defensible from the scene;
- direct/continue/clarification skip checklist/tool stages;
- mutating turns have tool statuses correlated to checklist ids;
- expected DB/state deltas match actual persisted changes;
- failed/skipped effects are not narrated as completed;
- no private/offscreen terms leak;
- player can continue after revised/skipped steps;
- average coherence score is at least 4/5, with no turn below 3/5 unless explicitly explained as model/provider quality debt.

## Deterministic Failure Fixtures

Add fixtures for:

- invalid tool ref -> validation rejection -> one revision -> success;
- invalid payload -> validation rejection -> one revision -> success;
- repeated invalid step -> skipped/failed status;
- partial checklist branch abort with earlier successful steps settled;
- failed effect excluded from narrator packet/final narration;
- private/offscreen forecast terms excluded after direct, mutating, and failed-step paths.

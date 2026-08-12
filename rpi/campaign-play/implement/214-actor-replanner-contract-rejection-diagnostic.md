# Task 214: Actor Replanner contract-rejection diagnostic

## Contract

Eligible Actor Replanner failures that enter proposal generation emit one private `actor_replan.contract_rejected` event. The event carries the existing bounded attempt/job identity, one phase (`generation`, `evidence`, `compilation`, or `review`), the final bounded error code, any safe-generation code owned by a generation/review boundary, and only the existing bounded recovery coordinates. Accepted attempts and persistence, lease, budget, and fencing failures remain silent.

## Impact and scope

The current-source GitNexus file-qualified impact for `backend/src/campaign-play/actor-replanner.ts` is exact LOW (7 impacted files, 2 direct importers, 0 mapped processes/modules; the registered index is four commits stale). The nested private owners are absent from the index; the established enclosing factory fan-out is the only disclosed broader reach. The implementation remains private to the Actor Replanner attempt path, its focused tests, and this note; no additional production owner or public interface changed.

## Implementation

The attempt path tracks the earliest source-owned phase and the bounded SafeGenerate code, then emits the specialized event after a durable `AttemptFailure` exists. First-attempt escalation logs before retry preparation and terminal finalization logs once; an attempt/epoch key prevents duplicate specialized events. Existing `actor_replan.rejected`, recovery, retry, persistence, fencing, and acceptance behavior are unchanged. Diagnostics are wrapped so logging cannot alter an outcome.

No prompt, model instruction, visible copy, or substantial product prose changed. Humanizer/deslop review is not applicable.

## Static validation

- Focused Actor Replanner suite: 19/19 assertions passed, including a genuine SafeGenerate `schema_validation_failed` proposal failure with `phase=generation`, `errorCode=model_contract_invalid`, non-null `safeGenerationCode=schema_validation_failed`, privacy sentinels, unchanged recovery/acceptance, and exactly one specialized event.
- Existing generation, evidence, compilation, review, timeout, recovery, fencing, and acceptance tests remain green in the same suite.
- Direct backend typecheck and production build passed with `pnpm exec tsc --noEmit -p backend/tsconfig.json` and `pnpm exec tsc -p backend/tsconfig.json`; the backend package-local `pnpm --dir backend run typecheck` script could not resolve its local `tsc` binary in this workspace and is recorded as a harness/package-path issue, not a source failure.
- Directly affected turn-runtime and Campaign Play application suites passed: 95/95 assertions across 2 files. `git diff --check` passed. Staged GitNexus `detect_changes --scope staged --repo WorldForge` reported 3 files, 5 symbols, 0 affected processes, and LOW risk; the mapped production symbols are confined to `replan`/`mutate` in `actor-replanner.ts`.

## Live r169

Pending the pushed implementation and the single fresh `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r169` journey. Natural `actor_replan.contract_rejected` coverage will be reported only if it occurs; no failure is manufactured.

## Acceptance handoff

Static evidence covers bounded identity, phase/code classification, safe recovery coordinates, privacy, exactly-once emission, accepted-attempt silence, and unchanged failure/recovery semantics. Rendered, persistence, checkpoint, reload, and natural live diagnostic evidence remain pending until r169 reaches its first authoritative boundary or 60-action/reload completion.

# Phase 95 Runtime Authority Oracle Review - 2026-05-24

Session: `phase95-runtime-authority-bundle`

Bundle:

- 26 files bundled into one browser zip attachment.
- Estimated input: about 183k tokens.
- Model evidence: requested Pro, resolved Extended Pro, verified by Oracle.
- Result: completed.

## Verdict

CONDITIONAL-GO for one focused authority/runtime implementation commit.

NO-GO for claiming broad Phase 95 architecture GO or long-campaign
clone/replay/rollback acceptance from this commit alone.

## Required Corrections Before Code Proceeds

- Split "requires execution authority" from "commits canonical world version".
  The old `RUNTIME_STATE_BEARING_TOOL_NAMES` meaning conflates these concepts
  and would make quick-action capability offers self-stale if reused unchanged.
- Make `turn_clock_ledger` real schema, migration, manifest store, and live
  writer before claiming time authority is fixed.
- Remove silent one-minute defaults from authority trace commit, executor
  finalization, execution-context constructors, turn finalization/resume, and
  settled-turn clock context.
- Make `offer_quick_actions` require authority as a public-handle/capability
  authority write, but do not mutate canonical world version or world time.
- Move `clock_delta` and `quick_action_offer` owner registry lanes from
  `contract_only` to live once their services exist.
- Reuse `turn_saga_events` for `authority_stage_committed` in this first commit,
  with deterministic idempotency and stage validation.
- Strengthen manifest coverage with migrated-SQLite table inspection so adding
  a schema table without a manifest entry cannot pass by self-referential
  required-key generation.

## First Commit Test Requirements

- Omitted elapsed time in `commitAuthorityTrace` is zero, not one.
- Non-time successful tool finalization does not add a minute.
- Player/background/actor execution contexts do not seed implicit one-minute
  elapsed time.
- Accepted `advance_time` writes exactly one positive clock ledger row.
- Non-time canonical mutation has no silent minute; any `world_clocks` time
  update is explained by ledger evidence.
- Rejected, malformed, stale, and failed tools do not write clock ledger rows or
  mutate world time.
- Turn finalization/resume can advance UI ordinal without advancing world
  minutes or double-advancing after pending narration resumes.
- `turn_clock_ledger` is present in schema, migration, manifest tables,
  required store keys, and store manifest.
- `offer_quick_actions` requires authority, creates resolvable capabilities at
  the same world version, and becomes stale only after a separate canonical
  mutation.
- `quick_action_offer` owner registry is live and descriptor-visible.
- `authority_stage_committed` records the required lifecycle stages
  idempotently and rejects unknown stages.

## Deferred But Still P0 Before Phase 95 GO

- Manifest-driven clean-start clone must replace Phase 88/94 directory-copy
  helper semantics before clone evidence counts.
- Replay-preserving clone mode must fail closed until id/saga/vector/packet
  rewrite is proven.
- Public `/world`, SSE, history, inventory, location entity, quick-action, and
  frontend-state surfaces need typed DTO constructors or projection checks.
- Crash-safe rollback/vector purge or rebuild must not rely on in-memory
  pending events.

## Implementation Order

1. Contract vocabulary split: authority-required tools versus canonical
   world-version mutation tools.
2. `turn_clock_ledger` schema, migration, indexes, manifest, and coverage tests.
3. Clock commit service and removal of silent one-minute defaults.
4. Executor updates for canonical tools, `advance_time`, and quick-action
   public-handle authority.
5. `authority_stage_committed` saga events and lifecycle tests.
6. Focused public projection/store closure tests for newly touched evidence.

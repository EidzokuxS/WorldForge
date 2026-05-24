# Phase 95 Runtime Authority Bundle Plan

Status: active implementation bundle, created after the broad Oracle review and
the user correction that Phase 95 must stay focused on gameplay quality at long
campaign length, not on narrow green 60-turn scripts.

## Objective

Make the live gameplay runtime obey one control plane from player action intake
through public projection, clone, replay, rollback, and long play. The next
implementation work must close authority/time/ownership together, because each
piece changes whether later turns, quick actions, narrator facts, and cloned
worlds can still be trusted.

This is not a "clock-only" slice. Time is the test case for the whole runtime:
if world time can still change outside accepted receipts, then actor wakeups,
quick-action staleness, replay hashes, rollback validity, and narration claims
are all ungrounded.

## Bundle Boundary

The bundle has five coupled contracts:

1. Turn authority stages are recorded as durable stage events, using the
   Oracle-reviewed stage order in `TURN_AUTHORITY_STAGE_VALUES`.
2. World time has a live clock ledger. `world_clocks` is the current state
   cache; ledger entries are the replayable reason world time moved or stayed
   still.
3. Quick-action offers are first-class backend-owned capabilities. They may
   remain player-facing UI suggestions, but the durable capability rows are not
   "presentation only".
4. Public projection remains an allowlisted DTO boundary; backend refs and
   saga/tool internals do not cross SSE/API/frontend state.
5. Store manifest and rollback/clone checks must know every new store before
   the store is used in live evidence.

## Architecture Decisions

### 1. Stage Events

Options considered:

- Add a separate `turn_authority_stage_events` table. This is explicit but adds
  another recovery store before the existing saga event ledger is fully used.
- Extend `turn_saga_events` with one generic stage event kind and put the stage
  name in validated payload. This reuses the existing saga idempotency,
  recovery, and lock shape. Chosen for the first executable bundle.

Decision:

- Add `authority_stage_committed` to `turnSagaEventTypeValues`.
- Add a `recordTurnAuthorityStage` helper that validates stage names against
  `TURN_AUTHORITY_STAGE_SCHEMA`, writes one idempotent event per saga/stage, and
  keeps the required stage order testable.
- Treat missing stage events as recovery evidence, not as a UI concern.

References Used:

- `backend/src/engine/gameplay-control-plane-contract.ts`
- `backend/src/engine/turn-saga.ts`
- `backend/src/db/schema.ts`
- Oracle bundle verdict `docs/phase95-oracle-architecture-review-2026-05-24.md`

Unverified Assumptions:

- Existing saga events can carry stage payloads without a destructive SQLite
  migration because `event_type` is a text column without a database check.
- First bundle can enforce stage coverage in unit/integration tests before
  wiring every route status transition to the stage ledger.

### 2. Clock Ledger

Options considered:

- Keep `world_clocks` as the only time table and remove silent defaults. Low
  churn, but still leaves replay without per-turn time reasons.
- Add a separate `turn_clock_ledger` table and make `world_clocks` a cache.
  More migration work, but it gives explicit replay, rollback, and clone
  evidence. Chosen.

Decision:

- Add `turn_clock_ledger` to schema, migrations, and store manifest before
  writing it.
- Add a clock commit service that validates the
  `TURN_CLOCK_LEDGER_ENTRY_SCHEMA`, inserts idempotent ledger rows, and updates
  `world_clocks` in the same transaction.
- `commitAuthorityTrace` must stop defaulting missing elapsed time to one
  minute. Missing elapsed means zero unless the accepted tool explicitly says
  time passed.
- `finalizeAuthorityResult` must stop assigning one minute to non-time tools.
- `advance_time` remains the normal player-turn way to advance in-world time;
  look/status/dialogue/rejected/failed tools produce zero-time receipts.
- `syncWorldClockTurnBoundary` may sync UI turn ordinal, but it must not mutate
  gameplay world time without a clock ledger entry.
- Turn finalization and pending-narration resume must stop equating
  `config.currentTick` with world minutes. UI turn ordinal may advance for
  display/history ordering while `worldTimeMinutes` stays unchanged unless an
  accepted clock receipt exists.
- Settled-turn clock context must allow zero elapsed world minutes. A status
  read, quick look, denied action, or pure dialogue turn should not wake actors
  or age deadlines by an implicit minimum minute.

References Used:

- `backend/src/engine/living-world-authority.ts`
- `backend/src/engine/tool-executor.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/__tests__/living-world-authority.test.ts`
- `backend/src/engine/__tests__/tool-executor-authority.test.ts`
- Drizzle SQLite docs for `sqliteTable`, indexes, and check constraints via
  Context7 `/drizzle-team/drizzle-orm-docs`

Unverified Assumptions:

- Old campaigns can accept a forward migration that creates an empty
  `turn_clock_ledger`; pre-existing world clock state is treated as baseline
  cache rather than replayable Phase 95 evidence.
- It is acceptable for zero-time authority receipts to advance world version
  while leaving world minutes unchanged.

### 3. Quick-Action Capability Ownership

Options considered:

- Mark `offer_quick_actions` as ordinary state-bearing and let the existing
  authority trace path bump world version. Rejected: the offer row is created
  at the current base world version, and immediately bumping the world version
  would make fresh capabilities stale.
- Keep `offer_quick_actions` as pure `ui_suggestion`. Rejected: it writes
  durable backend-owned capabilities and therefore needs owner and recovery
  contracts.
- Split "requires execution authority" from "commits canonical world version".
  Chosen.

Decision:

- Keep quick-action offer creation from advancing world time or world version.
- Make `offer_quick_actions` require execution authority as a
  public-handle/capability authority write, not as a canonical world-state
  mutation.
- Make the owner registry status for `quick_action_offer` live.
- Add a descriptor effect lane for quick-action offers so contract tests can
  see the owner, while runtime finalization treats it as capability authority
  rather than canonical world mutation.
- Require backend-owned handles for frontend submission, and keep prose as
  presentation only.

References Used:

- `backend/src/engine/runtime-tool-descriptors.ts`
- `backend/src/engine/tool-contracts.ts`
- `backend/src/engine/tool-executor.ts`
- `backend/src/engine/quick-action-offers.ts`
- `backend/src/engine/player-facing-events.ts`
- `frontend/lib/api.ts`
- `frontend/app/game/page.tsx`

Unverified Assumptions:

- A runtime authority split can stay inside one authority vocabulary by
  distinguishing write classes. It should not create a parallel "UI authority"
  vocabulary.
- The existing `RUNTIME_STATE_BEARING_TOOL_NAMES` naming can survive the first
  implementation if tests define it as "requires execution authority", not
  "always bumps canonical world version".
- Quick-action rows should remain stale when canonical world version changes
  after the offer, but not because the offer itself was created.

### 4. Public Projection And Store Closure

Options considered:

- Keep route-local omit filters plus tests. Low churn, but weak as the number
  of projection surfaces grows.
- Move every public surface through typed DTO constructors immediately. Best
  long-term design, larger blast radius.
- For this bundle, enforce closure around newly touched surfaces and add leak
  tests while leaving full DTO extraction as the next bundle. Chosen.

Decision:

- Any new clock/stage/quick-action evidence exposed to player/API/frontend goes
  through `assertPublicProjectionPayload` or a typed public DTO constructor.
- `turn_clock_ledger` must be added to `PHASE95_SQLITE_STORE_TABLES`,
  `PHASE95_REQUIRED_STORE_KEYS`, and `PHASE95_STORE_MANIFEST` before live use.
- Clean-start clone remains the only Phase 95 clone mode until replay-
  preserving id rewrite and vector semantics are proven.
- Existing Phase 88/94 clone helpers are not Phase 95 evidence until they
  consume the manifest. Direct directory-copy clones can preserve vectors,
  saga rows, quick-action rows, and runtime-tail stores in ways the manifest
  says should be purged, rebuilt, rewritten, or rejected.
- The first authority/time commit does not need to rewrite every clone helper,
  but it must not claim clone/replay architecture GO. The paired clone/public
  projection cluster remains P0 before long campaign acceptance.

References Used:

- `backend/src/engine/gameplay-control-plane-contract.ts`
- `backend/src/campaign/store-manifest.ts`
- `backend/src/campaign/restore-bundle.ts`
- `backend/src/campaign/checkpoints.ts`
- `backend/src/routes/campaigns.ts`
- `backend/src/routes/chat.ts`
- `e2e/phase-94/baseline-pool.ts`
- `e2e/88-living-world-playtest.ts`
- `docs/phase95-gameplay-cycle-architecture.md`

Unverified Assumptions:

- Store manifest coverage tests are enough to prevent accidental use of a new
  SQLite table before clone/rollback policy is declared.
- Full public DTO extraction can remain a separate P0 bundle if this bundle
  keeps new authority evidence from leaking raw ids.
- Current rollback vector retraction relies partly on in-memory pending events;
  crash-safe vector purge/rebuild still needs a separate executable cluster.

### 5. Verification And Reviewer Bundle

Options considered:

- Ask Oracle about a tiny time patch. Rejected as too narrow for the actual
  product risk.
- Send a huge inline file set. Rejected because the browser/reviewer surface
  has frozen with many inline files.
- Send one zip bundle with a focused plan, code files, and a bundle index.
  Chosen.

Decision:

- Oracle receives a zip bundle, not 10-20 inline files.
- Agents get independent read-only cluster questions, and their reports are
  folded into implementation before code edits that cross ownership lines.
- The first code commit from this bundle must include contract tests for stage
  events, clock ledger behavior, quick-action owner classification, and store
  manifest coverage.

References Used:

- `C:/Users/robra/.codex/skills/oracle/SKILL.md`
- `C:/Users/robra/.agents/skills/agents-best-practices/SKILL.md`
- `tasks/lessons.md`
- Previous Oracle session `phase95-architectu-r2-bundle`

Unverified Assumptions:

- Oracle browser bundle upload remains stable with a single zip archive near
  the previous successful size.
- The active implementation can proceed after Oracle conditional GO if tests
  encode every accepted contract and the next Oracle run reviews the bundle
  rather than isolated patches.

## Implementation Gate

Before editing code in this bundle:

- Run GitNexus impact on each modified symbol.
- Warn on HIGH/CRITICAL impact before editing.
- Keep edits in one coherent authority/runtime commit, not mixed with UI
  playtest cleanup.

Required tests for the first code commit:

- `commitAuthorityTrace` default elapsed time is zero.
- Accepted `advance_time` writes exactly one positive clock ledger entry.
- Non-time successful tools write zero-time or no-time evidence but do not add
  silent minutes.
- Rejected/stale tool calls do not write clock ledger entries or mutate time.
- `syncWorldClockTurnBoundary` cannot advance world minutes silently.
- finalization/resume can advance UI turn ordinal without advancing world
  minutes, and does not double-advance time after pending narration resumes.
- settled turn clock context can carry zero elapsed minutes into due-world
  scheduling.
- `turn_clock_ledger` is present in schema, migration, store manifest, and
  manifest coverage tests.
- `quick_action_offer` owner registry is live and descriptor-visible, while
  offers do not make their own capabilities stale.
- Stage events can record the required lifecycle order idempotently.

Required tests before Phase 95 architecture GO, but not necessarily in the
first authority/time commit:

- Manifest-driven clean-start clone purges runtime-tail stores and vectors per
  policy instead of copying directories opportunistically.
- Replay-preserving clone mode rejects by default unless id/saga/vector/packet
  rewrite evidence is present.
- `/world`, SSE, history, inventory, location entities, quick actions, and
  frontend state pass typed public DTO constructors or
  `assertPublicProjectionPayload`.
- Rollback after a crash cannot leave stale vector/location projections from
  in-memory pending events.

Exit condition for this bundle:

- Backend targeted tests and typecheck are green.
- Frontend tests/typecheck are green if touched by projection changes.
- GitNexus `detect_changes` matches the expected authority/runtime scope.
- In-app Browser can complete a human-style turn without a hang.
- Commit and push the verified slice to `origin/develop`.

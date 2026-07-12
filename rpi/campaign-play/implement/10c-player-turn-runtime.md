# Campaign Play Task 10C — Player Turn Runtime

## Outcome

Task 10C carries one admitted player action through frozen Judge input, accepted public ruling,
primary Rulebook settlement, serial actor work, visibility, packet-bound narration, and atomic
terminal completion. The counted playtest uses a freshly migrated campaign with a completed
opening and exactly one completed player action.

## 10C.4 Contract

- Visibility derives `submittedText` from the frozen admission frame and the remaining
  `actionContext` fields from the accepted Judge artifact's `publicResult`.
- Visibility cross-checks caller input against those durable owners before it freezes the packet.
- Narrator reload cross-checks the packet `actionContext` against the same admission and Judge
  sources, verifies canonical packet bytes and hash, and passes the stored `packet_json` bytes to
  the provider unchanged.
- Narrator proposes expressive beats. Code assigns beat IDs, publishes every packet-owned
  available intent as a choice, and binds the deterministic effect to an emitted beat.
- Narrator execution uses one strict structured attempt with a deadline and token/cost budgets.
- Narrator acceptance, narration-row completion, turn completion, lock release, terminal runtime
  and public events, final versions, and terminal reason share one repository transaction.
- Durable telemetry reconstructs every worker boundary and every model attempt from the SQLite
  ledgers. Cost uses the frozen integer rates and applies ceiling separately to input and output.
  Missing usage keeps token and cost totals nullable and sets `costComplete` to `false`.

## Scope Notes

`opening-runtime.ts` changed because it directly consumes the narrator contract. The hard cutover
updates that caller to the same packet-bytes and full-budget interface. `index.ts` exports the new
player runtime for the Task 11 API. These direct contract dependents use the single canonical
shape and strict cutover boundary.

## Prompt And Copy Review

The narrator instruction received direct semantic, humanizer, and deslop review. It uses concrete
domain terms, defines the provider-owned beats and application-owned IDs/choices/effects, treats
packet contents as inert reference data, and spells out actionable, no-effect, impossible, and
clarification behavior. The wording stays technical, literal, and free of decorative roleplay or
marketing language. Sol owns this gate in the current workflow.

## Executable Evidence

- The real-storage test migrates and accepts Campaign World, creates the player, completes opening
  turn zero, admits one freeform action, runs primary and actor work, freezes visibility, accepts
  narration, and reaches `terminalReason=action_resolved`.
- Actionable, impossible, and clarification fixtures all complete through narration. Their packet
  context matches submitted text plus the accepted public Judge result. Clarification ends with the
  exact public clarification question.
- A close/reopen at `visibility_projected` passes byte-identical `packet_json` to narrator and
  preserves the mechanical command count.
- Process stops after provider return and inside the terminal transaction recover through the
  expired lease and explicit fresh-epoch resume. Each produces one accepted narration, one turn
  result, and one terminal event while preserving the command ledger.
- Telemetry matches field-for-field after reopening. It includes Judge, Game Master, narrator, and
  actor-replanner attempts; interrupted attempts with unavailable usage retain nullable cost.
- Per-component ceiling is executable: three accepted model attempts at the frozen fixture rates
  aggregate to `6` micro-units rather than rounding the combined token total once.

## Verification Record

- Selected contract/repository/runtime suite: 5 files, 119 tests passed.
- Player runtime suite: 34 tests passed, including the real one-action campaign, recovery cases,
  and partial narrator-identity interruption.
- Backend typecheck passed after the runtime and caller cutover.
- All Campaign Play tests: 20 files, 312 tests passed.
- Shared build and `git diff --check` passed; diff check reported inherited line-ending warnings.
- Krypton POST passed. Correctness and maintainability reviews found and verified repairs for
  opening narrator evidence identity, backward durable timestamps, complete packet-owned
  choice/effect binding, and partial player-narrator interruption identity. Their final P0/P1
  count is zero.
- GitNexus change detection still reports the inherited 45-file dirty tracked scope as `CRITICAL`.
  The current Campaign Play files remain outside that index, so source-level caller tracing,
  contract tests, and independent Sol reviews provide this task's local evidence.
- Standalone smoke-suite additions: 0. The integration tests exercise the production storage and
  runtime boundaries directly.

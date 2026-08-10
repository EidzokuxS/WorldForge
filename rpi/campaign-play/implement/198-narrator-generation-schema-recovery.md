# Task 198: Narrator generation-schema recovery

## Contract

When the first Campaign Play Narrator `safeGenerateObject` call fails with
`schema_validation_failed`, the existing external `narration_invalid`/contract
classification remains unchanged, while the existing automatic attempt 2 may
receive one safe, non-persistent generation-recovery signal. The signal is
`narrator_generation_schema_mismatch` with the sole check
`generation_schema_invalid`. It carries no candidate, provider response,
Zod message, packet prose, name, label, handle, or rejected value.

The recovery prompt adds the packet-derived `ACTION_SELECTION_INDEX_FRAME` only
for that signal. The frame contains the expected selection count and ordered
allowed intent indexes. Required-reply position zero allows only the required
intent and trailing positions exclude it; without a required reply every
position allows every packet intent index. The one-intent packet remains valid.
Normal prompts, packet-validation/actor-scope recovery, schema, compiler,
provider/model selection, deadline, retry count, persistence, mechanics, UI,
and visible copy remain unchanged.

The runtime forwards this non-null feedback through the existing safe-feedback
attempt-2 path only before the persisted deadline. The operation, packet,
result, receipt, turn, and fencing identities remain shared; there is one
automatic recovery and no attempt 3 or mechanics replay.

## Evidence and impact

Entry was `feat/revamp` at `3f74d98cdbaac9c62b2909b1e77a7e6e7f46849a`, equal to
`origin/feat/revamp`; only the protected pre-existing `AGENTS.md` and
`CLAUDE.md` were dirty. Frozen r145 remains immutable. Its action-19 Narrator
operation `narration-operation:4b85c02fae13b235daa3300147bb63c800a2e8f3`
failed attempt 1 at `schema_validation_failed` (`actionSelections.1.intentIndex`)
and attempt 2 expired with no retained provider cause or candidate.

An exact-entry task-owned GitNexus shadow was analyzed. Source-qualified
`buildPrompt` and `executeNarration` are LOW-risk nested targets; the
`CampaignPlayNarratorError` carrier is MEDIUM. The enclosing
`createCampaignPlayNarrator` and `createCampaignPlayTurnRuntime` factories show
HIGH transitive fan-out, but they are not edited symbols and no exported
interface is changed. No CRITICAL exact edited target was found.

Main's semantic, humanizer, and deslop verdict for the approved recovery
literal: direct, natural, and non-repetitive; retain it byte-for-byte.

## Implementation

- `backend/src/campaign-play/narrator.ts`: added the discriminated generation
  feedback variant, packet-only action-selection frame, recovery block, and
  `schema_validation_failed` attachment while preserving all existing packet
  and actor-scope paths.
- `backend/src/campaign-play/turn-runtime.ts`: forwards non-null
  `model_contract_failed` Narrator feedback through the already existing safe
  recovery selector; persisted/public narration classification remains
  `narration_invalid`.
- Focused tests cover required-reply ordering, trailing exclusion, no-required
  reply behavior, the one-intent boundary, normal-prompt omission, exact
  recovery prose, frame privacy, and the same-identity runtime retry for both
  public failure codes.

## Static validation before live run

- Narrator focused suite: 37 assertions passed.
- Turn-runtime full file: all 73 assertions passed, including both
  `narration_invalid` and `model_contract_failed` cases, but Vitest exited
  non-zero after a known `onTaskUpdate` worker-shutdown unhandled error. The
  narrow recovery rerun passed 2/2 targeted tests (71 skipped) with exit 0;
  the shutdown is therefore recorded as a harness defect, not hidden as a
  green full-file process.
- Campaign Play application suite: 15/15 passed (exit 0).
- Backend typecheck: passed (`tsc --noEmit`, exit 0).
- Backend build: passed (`tsc -p tsconfig.json`, exit 0).
- `git diff --cached --check`: passed (exit 0).
- The registered GitNexus index was stale at `1a06944`; its staged query
  returned `No changes detected` and is not treated as authoritative. The
  task-owned exact-entry shadow detected the retained patch as 4 source files,
  13 symbols, and 7 affected Campaign Play flows at HIGH transitive risk.
  The changed nested `buildPrompt`/`narrate`/`executeNarration` path is the
  expected Narrator recovery path; the HIGH result is the enclosing factory
  fan-out, with no CRITICAL exact target, exported interface, or unrelated
  production owner.

## Fresh r146 journey

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r146` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66` is the only live validation lane. It will
use state hash `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`,
config hash `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`,
and Brina card hash `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
The lane is not yet started; it will perform one import, one Save, the fixed
setup selections, one Begin, read-before-click rendered actions, and the
existing first-defect hard stop. Generated session/run evidence remains
uncommitted. Natural generation recovery, 60 actions, and reload are unknown
until the lane is executed; no failure will be manufactured.

## Acceptance handoff

Static source/tests prove the bounded feedback and frame contract and the
runtime's existing one-recovery fencing. The built lane must provide the
remaining rendered and persistence evidence: ready Opening, one proper scene
and unique binding per admitted action, read-only SQLite integrity/FK checks,
natural generation recovery if it occurs, and 60 actions plus same-page reload
if no genuine defect occurs. Unavailable live criteria will be reported without
inference.

# Task 133: bounded player-action external timeout recovery

## Outcome

Player-action Judge and Game Master external attempts use a 30-second hard deadline. The application may automatically resume exactly one first-attempt `stage_timeout` on a fresh worker epoch, preserving the admitted turn and frozen provider/model identity. A second timeout remains interrupted and exposes the existing explicit Resume state.

Opening keeps its existing 90-second per-stage deadline and does not gain automatic timeout recovery. Existing provider-unavailable recovery remains unchanged. Model-contract and budget failures remain non-recoverable. No mechanics, receipt, actor, narration, prompt, schema, provider, model, UI, or visible-copy behavior changes.

## Evidence before implementation

The frozen r71 action one used the new full-authority Judge bypass but returned no provider metadata before the old 90-second deadline. SQLite records one Judge attempt with `duration_ms=90034`, `schema_outcome=transport_error`, `error_code=stage_timeout`, and null actual provider/model/usage. No turn result, command, receipt, actor job, narration, or proper scene was written. The UI truthfully exposed Resume and the frozen lane was not resumed.

The exact frozen r70 Judge evaluation accepted all bypass samples in at most 7,248 ms and all default samples in at most 22,363 ms. A 30-second attempt boundary therefore exceeds every observed successful sample while bounding one stalled attempt plus one recovery to 60 seconds before downstream work.

## Acceptance contract

- Actor and surface: the player submits an action on `/campaign/:id/play`.
- Trigger: the first player-action Judge or Game Master provider attempt reaches 30 seconds without settling.
- Observable result: the first attempt is durably interrupted, one fresh-epoch attempt 2 runs with the same turn/provider/model identity, and a successful attempt continues the original turn without duplicate mechanics. A second timeout stops truthfully with Resume.
- Protected behavior: Opening timeout behavior, provider-unavailable recovery, all semantic failures, prompts, schemas, mechanics, narration recovery, and visible copy remain unchanged.
- Forbidden surfaces: no third attempt, provider/model switch, hidden fallback, replayed player input, or late-result write.

## Verification

- `campaign-play-application.test.ts`: 13/13 passed, including the one-time player-action timeout policy and unchanged Opening exclusion.
- `turn-runtime.test.ts`: 63/63 passed, covering the existing external-stage deadline, interruption, resume, epoch, and late-write fences.
- Backend typecheck and build passed; shared and frontend production builds passed.
- `git diff --check` passed with only existing line-ending warnings.
- Semantic review: the change adds no prompt, model instruction, narrative prose, or visible copy, so humanizer/deslop review is not applicable.

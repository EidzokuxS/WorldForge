# Task 131 — Narrator retry feedback

## Contract

Automatic Narrator attempt 2 may receive only the safe packet-validation coordinates produced by attempt 1. Attempt 1 stays byte-identical. The operation, result, narration, packet, receipts, provider, model, schema, default-reasoning recovery, shared deadline, acceptance fences, mechanics, Manual Restore, and no-attempt-3 behavior remain unchanged.

The feedback is transient. It is not written to SQLite or public state, and it contains no proposal, prose, actor names, labels, provider output, or reconstructed data. A schema, transport, deadline, or semantic failure without `narrator_packet_validation_mismatch` uses the existing recovery prompt unchanged.

## Implementation

- `CampaignPlayNarratorError` carries an optional typed safe recovery payload.
- The existing packet validator attaches its already logged failed-check coordinates to `narration_invalid`.
- The runtime returns that payload in memory with the failed attempt-1 operation and passes it only to the existing automatic attempt 2.
- The recovery prompt appends a deterministic `NARRATOR_RECOVERY` section. It requires a fresh proposal from the immutable packet, correction of every listed check, and compliance with every unchanged rule.

Semantic review: recovery feedback is terse, technical, and limited to existing safe validator coordinates. It adds no narrative voice, visible copy, or filler. Humanizer and deslop found no rewrite necessary.

## Evidence

- Focused Narrator and turn-runtime suites: 89/89 passed.
- Campaign Play application suite: 12/12 passed.
- Backend typecheck, backend build, and shared build passed. The frontend build was unavailable because the environment could not fetch Inter Tight from `fonts.gstatic.com`; Turbopack then reported the missing generated Google-font module. No Task 131 source participated in that failure.
- `git diff --check` passed. GitNexus change detection reported the expected Narrator execution flows only (medium risk; seven working-tree files includes the two pre-existing instruction-file edits).
- The focused recovery test proves attempt 1 has no feedback, attempt 2 receives the exact safe coverage diagnostics, identity remains stable, one proper scene is accepted, and mechanics are not replayed.
- Existing focused tests retain two-invalid, attempt-2 timeout, ignored-abort late fencing, no-attempt-3, concise fallback, Manual Restore, reload, and integrity/FK coverage.

## Fresh r70 product journey

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r70` used campaign `6b85a49e-fef5-4359-95e2-051383f6fb66` on isolated ports 3580/3581/3582. Template `state.db` and `config.json` matched the frozen SHA-256 values. The canonical Brina card was submitted through one `setInputFiles`; Playwright observed one POST/200 and the backend logged one ingestion start/complete. Save, lower-wards / Local / Already here / Looking for work, and Begin each occurred once. Opening Planner and Opening Narrator were accepted, and the authoritative proper scene rendered before the player journey.

The first player action, `Talk to Dren Vask: press for other leads`, was admitted once as turn `turn-player-action:6a31cb61d8c86d9da438051656e55a4d5808a44d`. Its Judge attempt reached the functioning 90-second external-stage deadline and was interrupted with `stage_timeout` after 90,029 ms. No provider response metadata, mechanics, Actor Replanner work, Narrator operation, narration attempt, proper scene, or ledger binding exists for that action. The UI rendered the truthful interrupted state with Resume; no Resume, Restore, retry, replay, replacement action, direct API write, or SQLite write was issued.

This is the first genuine r70 defect and is upstream of Task 131. The directly affected live Narrator recovery was therefore unavailable rather than failed. r70 is frozen at completed/bound 1/0; SQLite `integrity_check` is `ok`, `foreign_key_check` is empty, and cleanup records no remaining task-owned process or listener. Evidence is under `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r70.session` and the matching campaign-world run root.

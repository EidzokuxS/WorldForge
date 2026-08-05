# Task 120: Automatic Narrator recovery

## Contract

- Base, origin/feat/revamp, and head before the change: `39662e3e54f7c05a39cb46f2292ef17256863889`.
- Actor/surface: a Campaign Play player after one committed player action, using the existing result/scene/action dock.
- Trigger: the initial receipt-keyed player-action narration attempt fails with persisted `narration_invalid`.
- Positive outcome: the same operation is claimed once more from its persisted identity; attempt 2 can replace the concise result with one proper scene without Restore or mechanics replay.
- Negative outcome: a second `narration_invalid` remains failed with Restore available; no attempt 3.
- Forbidden: mechanics re-entry, replay, new provider/model, prompt/schema/compiler changes, Opening Narrator changes, new UI/copy, or fallback prose relabelled as a proper scene.

## Implementation

`backend/src/campaign-play/campaign-play-application.ts` now keeps `driveNarration` as the only automatic recovery driver. It retries only an invocation with no preclaimed token when the returned operation is failed, attempt 1, and the persisted operation row still fences the returned attempt and has `error_code = 'narration_invalid'`. The recovery request is built only from that returned operation's operation/result/narration/packet/receipt identity, then `prepareNarrationRecovery` and one immediate `runNarration` execute in the same driver. `scheduleNarration` and all schema/public/prompt/provider surfaces are unchanged.

`backend/src/campaign-play/turn-runtime.test.ts` adds application-driver coverage for invalid-to-valid, invalid-to-invalid, normal success, provider/transport/timeout/budget failures, and explicit Restore failure. The assertions cover attempt identities, operation identity, immutable packet bytes, receipt identity, proper-scene cardinality, and unchanged mechanics counts.

## Review and evidence

- GitNexus impact before editing the exact `createCampaignPlayApplication.driveNarration` target: LOW risk, one direct caller and one affected `recoverNarration` flow; `scheduleNarration` was not edited. Source confirmation shows the only driver call is the `scheduleNarration` promise chain, while `recoverNarration` is the sole manual-token entry. A post-change index refresh completed successfully. A broad unqualified `driveNarration` query is ambiguous across unrelated symbols and reports CRITICAL; it is not the exact Campaign Play target used for the pre-edit decision.
- Humanizer/deslop verdict: not applicable; no prompt, model instruction, schema/compiler, or visible-copy change was made, so no rewrite was required.
- Focused Vitest: `backend/src/campaign-play/turn-runtime.test.ts` — 60 passed.
- New-driver rerun: 8 passed, 52 skipped by test-name filter.
- Backend typecheck: passed (`npm --prefix backend run typecheck`).
- `git diff --check`: passed (only expected CRLF normalization warnings for existing text files).
- Rendered Campaign Play journey and read-only SQLite capture: unavailable in this worker packet. The repository exposes no existing rendered/task-safe Narrator fault-injection seam for `narration_invalid`; no browser/provider fault seam was changed or invented.
- GitNexus `detect_changes --scope all`: passed, low risk, 4 files/10 symbols, 0 affected processes. It maps only the pre-existing dirty `AGENTS.md` and `CLAUDE.md` instruction blocks; the changed TypeScript symbols are not returned by the refreshed index mapping and therefore remain covered by the focused runtime tests and source review.

## Scope and cleanup

No commit or push was performed. Pre-existing dirty `AGENTS.md` and `CLAUDE.md` were preserved. No task-owned process or disposable artifact remains.

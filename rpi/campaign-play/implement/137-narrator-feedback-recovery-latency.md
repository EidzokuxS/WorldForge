# Task 137: Narrator feedback recovery latency

## Experience contract

- Actor and surface: the player submits one rendered action on `/campaign/:id/play`.
- Trigger: Narrator attempt 1 returns a structured proposal that the existing semantic compiler rejects with safe `narrator_packet_validation_mismatch` feedback.
- Outcome: exactly one automatic attempt 2 uses the same provider, model, packet, receipts, deadline, and bypass storyteller mode with that safe feedback; a valid result produces one proper scene without replaying mechanics.
- Opaque failure: when attempt 1 has no safe recovery feedback, the existing default-reasoning recovery remains unchanged.
- Forbidden surfaces: no validator relaxation, observation dropping, prompt or schema change, provider/model switch, deadline extension, third attempt, mechanics replay, persistence identity change, UI change, or visible-copy change.

## Delta

`driveNarration` now reuses the already constructed bypass runtime when the failed operation carries safe compiler feedback. Reuse preserves the exact storyteller construction and passes the existing feedback to attempt 2. When feedback is absent, the Task 122 default-reasoning recovery runtime is still constructed exactly as before.

The focused application/runtime regression covers both branches. It also updates the certified-wait fixture to expect no utility duplicate when the same wait handle is already narrated, matching Task 136.

## Evidence

The frozen r77 action-29 Narrator operation failed attempt 1 with `covered_observation_count` 2/5 and missing indexes `[0,1,2]`; default-reasoning attempt 2 returned no response before the shared deadline and persisted `stage_timeout` after 82,931 ms. No mechanics replay or proper scene was written.

A read-only evaluation used the exact 29,987-byte frozen packet, provider/model `zai-coding-plan/glm-5-turbo`, existing schema/compiler, and the exact safe recovery feedback. Three independent bypass samples compiled successfully in 9,178 ms, 7,306 ms, and 6,750 ms. Each used one provider attempt, native JSON, zero reasoning tokens, and no repair, retry, or text fallback. The frozen database SHA-256 was identical before and after; `integrity_check` was `ok` and `foreign_key_check` was empty. Diagnostic artifacts are under `output/playtests/campaign-play/narrator-recovery-evaluation/r77-20260806` and are not product or commit scope.

No prompt, model instruction, substantial prose, or visible copy changed; humanizer/deslop review is not applicable.

## Acceptance handoff

Use one fresh pristine Campaign Play lane. A normal valid narration remains one bypass attempt. If attempt 1 emits safe compiler feedback, observe exactly one bypass attempt 2 with the same operation/result/narration/packet/receipt identity and shared deadline; acceptance writes one proper scene and no duplicate mechanics. An opaque semantic failure still uses default reasoning. Failure or deadline expiry stops at attempt 2 with the concise result usable. Continue the fresh endurance lane until the next genuine defect or 60/60 plus same-page reload.

# Task 122: Narrator recovery reasoning escalation

## Contract

- Base and origin/feat/revamp: `af921fc52ee3a32cf030986245cc3ee86045bd6b`.
- Actor/surface: a Campaign Play player after mechanics have committed, using the existing result/action surface and receipt-keyed Narrator recovery.
- Trigger: the automatic recovery path after the first player-action narration attempt persists `narration_invalid`.
- Positive outcome: the same operation may receive exactly one higher-quality Narrator attempt using the same selected provider/model with default reasoning; one compiler-accepted scene may replace the concise telling without mechanics replay.
- Negative outcome: timeout, invalid output, transport failure, stale identity, or persistence failure remains a truthful terminal narration failure with the concise result and controls usable.
- Forbidden: mechanics re-entry, receipt/world changes, attempt 3, fallback prose, raw-output salvage, schema/compiler/prompt weakening, provider/model substitution, new UI/copy, or slowing a successful first attempt.

## Implementation

`backend/src/campaign-play/campaign-play-application.ts` keeps the normal `createDefaultTurnRuntime` construction unchanged: the first player-action Narrator is still created with `reasoningMode: "bypass"`. After the existing persisted identity/error gate accepts an automatic recovery, `driveNarration` creates one recovery runtime synchronously through the existing factory while temporarily adapting only the first storyteller construction that requests bypass. The adapter omits `reasoningMode`, which selects the same provider/model with normal/default storyteller reasoning, then restores the original model factory before any asynchronous work. The recovery uses the existing operation/result/turn/narration/packet/receipt identity and `prepareNarrationRecovery`; it calls the unchanged `runNarration`, compiler, and 90,000-ms external-operation deadline exactly once.

Manual Restore still calls the existing runtime factory without the adapter, and Opening construction, provider/model selection, prompts, schemas, validators, visible copy, and normal mechanics are unchanged.

## Review and evidence

- Fresh GitNexus index was generated at `af921fc`; exact upstream impact before editing the production symbol `createCampaignPlayApplication.driveNarration` was LOW (9 impacted symbols, 1 direct caller, 1 affected `recoverNarration` process). The exact `createDefaultTurnRuntime` target was HIGH (18 impacted, 5 direct callers, 3 processes) and `createCampaignPlayTurnRuntime` was HIGH (14 impacted, 2 direct callers, 3 processes); both were source-inspected and left untouched.
- The new focused regression records storyteller model construction as `[bypass, default]`, proves two provider calls, exact operation/result/turn/narration/packet/receipt identity, two distinct attempt IDs, one accepted attempt-2 row, one proper scene, unchanged mechanics, and SQLite `PRAGMA integrity_check`/`foreign_key_check` success. Existing Task-120 regressions cover invalid-to-invalid terminal behavior with no third attempt, normal one-attempt success, reload persistence, and manual Restore behavior; the application construction test continues to prove Opening default reasoning and player-action bypass.
- The frozen r59 packet remains the quality basis: default reasoning compiled 3/3 samples at 54,620 ms, 162,126 ms, and 41,726 ms. The 162,126-ms sample is why the existing 90,000-ms deadline remains unchanged; no second timer or deadline extension was added, and r59 was not mutated.
- Prompt, model instruction, schema, compiler, validator, and visible copy were not changed; humanizer/deslop therefore required no rewrite.
- No rendered recovery journey was run: this lane has no existing supported fault seam that can trigger attempt-1 `narration_invalid` without source/config/provider mutation. Product QA is unavailable here; the acceptance handoff below is the next fresh-lane route.

## Validation and cleanup

- No commit or push was performed.
- Preserve pre-existing dirty `AGENTS.md` and `CLAUDE.md`; no task-owned temporary process or artifact remains.

## Unknowns

Live narration-invalid frequency and end-to-end recovery latency remain unknown.

## acceptance_handoff

Start from a committed Campaign Play player-action result with its persisted operation, result, narration, packet hash, receipt IDs, and concise result/actions visible. Verify: (1) an ordinary valid action makes one fast Narrator call with bypass and no recovery; (2) a supported attempt-1 invalidation creates no mechanics replay and exactly one automatic attempt 2 with the same provider/model, default reasoning, and all persisted identities; (3) an accepted attempt 2 adds exactly one proper scene; (4) deadline/invalid/transport/stale/persistence failure stops at attempt 2 while the concise result/actions remain usable; (5) reload preserves the terminal/accepted state; and (6) Manual Restore retains its prior model behavior. Main owns rendered acceptance and final review.

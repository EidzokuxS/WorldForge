# Task 163: Z.AI post-SDK fetch diagnostic

## Contract

The existing Z.AI thinking-disabled fetch seam emits one structured internal `ai.zai_fetch.failure` event for each non-success provider response or thrown fetch error. Success responses emit no event. The original request invocation, existing `thinking: { type: "disabled" }` injection, returned `Response` identity/body, and thrown error identity remain unchanged.

The event contains only bounded request metadata: normalized method, endpoint class, selected mode when inferable, request-body shape hash, schema hash, sorted allowlisted top-level JSON-Schema keywords, tool count/name hash/strict flag, forced tool-choice shape, thinking-type presence and allowlisted enum, and numeric max-output-token/temperature values when present. A non-success response may add status, sanitized content type, bounded request id, and provider-owned structured error code/parameter/message. SDK/package versions are omitted when no runtime value can be proven without adding a configuration or dependency surface. No credentials, full URLs or query values, authorization headers, cookies, request/response bodies, prompts, messages, tool descriptions, schema property names, authored prose, actor/location names, or arbitrary input values are logged or persisted.

## Repair and semantic review

`backend/src/ai/zai-fetch-diagnostic.ts` owns canonical request-shape hashing, schema/tool/thinking allowlists, bounded provider-error extraction, and diagnostic payload construction as pure helpers. `backend/src/ai/provider-registry.ts` observes the existing `createZaiThinkingDisabledFetch` result/error seam with a cloned response body so the caller receives the original response unchanged. The existing source has one direct caller: the Z.AI bypass branch inside `createModel`; no other provider or request strategy was changed.

The refreshed GitNexus CLI graph currently resolves `createZaiThinkingDisabledFetch` to a polluted CRITICAL result (507 impacted symbols; 348 direct; 68 processes; 14 modules), while the containing `provider-registry.ts` result remains CRITICAL (133 impacted; 40 direct). Earlier no-symbol indexing and this generic collision were reconciled against source. Main's bounded source-qualified exception authorizes this minimal wrapper observation only; a real HIGH/CRITICAL result for any other existing symbol would still stop the repair. The analyzer does not index the nested wrapper reliably, and the helper symbols had no pre-edit callers.

Semantic-review verdict: "The diagnostic is internal, bounded to schema-owned metadata and provider-owned error coordinates, and contains no player-visible prose or raw request/response content."

## Automated evidence

- `npm --prefix backend test -- --run src/ai/__tests__/zai-fetch-diagnostic.test.ts src/ai/__tests__/provider-registry.test.ts`: passed (31 tests).
- Affected suites `generate-object-safe`, Campaign Play Narrator, opening runtime, turn runtime, narrator packet, and narrator redaction: passed (234 tests).
- `npm --prefix backend run typecheck`: passed.
- `npm --prefix backend run build`: passed.
- `git diff --check`: passed; only pre-existing instruction-file line-ending warnings.
- GitNexus detect_changes --scope staged reported 5 files, 1 indexed symbol (ProviderConfig), 0 affected processes, low risk; source review confirmed the delta is limited to the Z.AI wrapper/helper path and its tests.
- Exact staged paths were backend/src/ai/__tests__/provider-registry.test.ts, backend/src/ai/__tests__/zai-fetch-diagnostic.test.ts, backend/src/ai/provider-registry.ts, backend/src/ai/zai-fetch-diagnostic.ts, and this note. Commit ca6215cb1831b970a8bfe7d16bb11f366e54b843 was pushed to feat/revamp; local and origin/feat/revamp matched at that SHA. AGENTS.md and CLAUDE.md remained the only pre-existing unstaged files.

## Fresh rendered journey

Fresh run pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r112 used commit ca6215cb1831b970a8bfe7d16bb11f366e54b843, isolated ports 3990/3991/3992, and one task-owned browser profile/page. Template state/config hashes were 6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2 and d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065; the canonical Brina card hash was 4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a. Import occurred once and Save occurred once (the setup harness incorrectly expected POST; read-only reconciliation proved the single authoritative save was PUT), followed by one lower-wards / Local / Already here / Looking for work selection and one Begin. Opening turn turn-opening:946cb20fbf4d132b662b171c61129e2dd927ac30 completed and rendered the proper opening scene.

Exactly one currently rendered choice was selected once: choice_fe1bf908ba2aa09476a5b6a2, contact, Talk to Dren Vask: offer to check the market for him. One /play/turns admission returned 202 with one binding and turn turn-player-action:b4899ed81e2c81d20cc92110b599cc88f4de328a. Judge, Game Master, and Actor Replanner each accepted attempt 1. The Narrator operation narration-operation:7f7f04db3606efcce2d91a0a1ce811dba1e46980 then failed at the first genuine defect: attempt 1 returned HTTP 400 from Z.AI tool mode with provider code 1210 and the bounded message "Invalid API parameter, please check the documentation."; the diagnostic emitted exactly once. Attempt 2 used the existing native JSON recovery and ended in the local deadline/stage_timeout with "This operation was aborted"; no third attempt, player retry, or late write occurred. The rendered page remained enabled and showed consequences, but the authoritative operation was failed and no proper scene was persisted for the action, so the lane froze at action 1/60 and no further action or reload was attempted.

The one retained diagnostic contained only the allowed fields: method POST, endpoint class chat_completions, request-body shape hash 1cecf0cb55d477f62dd6220b8206a874ff91a6acdb658e813e33fb4dd87c01ac, tool count 1, tool-name hash cbb415b0efad760c6f4b7948334e2cc1df8d935fd3b9bcb7eb07a27c2c5ffc11, strict true, schema hash b4cddefb65022ae6dc46ae952b1b954eebd383fc144655796ecdf04f0babe610, sorted top-level keywords $schema, additionalProperties, properties, required, type, thinking type present/disabled, selected mode tool, forced tool choice {kind: object, type: function, functionNamePresent: true}, max output tokens 32768, temperature 0.8, response status 400, content type application/json; charset=UTF-8, and provider code/message. No parameter pointer was exposed; no secrets, raw body, prompt, descriptions, names, authored prose, or arbitrary values were logged.

The final read-only probe at 2026-08-07T09:42:56.209Z returned HTTP 200 with phase ready, world version 13, runtime revision 41, one player-action turn, one unique binding, 15 receipts, 5 model stages, 1 actor job, 41 runtime events, 0 proper-scene rows for the failed action, SQLite integrity_check: ok, and an empty foreign-key check. The same generic Z.AI 1210 rejection had already succeeded for earlier provider/model requests in this lane and in r111, so this is not proven provider outage; the exact rejected request coordinate remains unknown.

## Acceptance handoff

| Criterion | Evidence | Result |
| --- | --- | --- |
| Success response emits no event | Focused wrapper test | Pass |
| Structured non-success emits exactly one bounded event | Injected local fetch and pure helper tests | Pass |
| Response body/headers remain available and thrown error identity is unchanged | Focused wrapper tests | Pass |
| Secrets, prompts, prose, descriptions, and raw provider bytes are absent | Pure helper and wrapper serialized-payload assertions | Pass |
| Existing provider/model/reasoning/retry/deadline/persistence/mechanics/UI behavior is unchanged | Minimal wrapper observation diff, affected suites, and r112 readback showing the existing attempt-1/attempt-2 path | Pass |
| Fresh rendered action has proper scene within the contract | r112 action 1 had one bound admission but failed Narrator operation; no proper scene persisted | Fail at first genuine defect; hard stop |
| 60/60 unique bound actions plus same-page reload | r112 stopped at 1/60; no retry or reload | Not met by contract |

## Cleanup

Frozen r111 remains immutable. R112 runtime roots were backend 65492, frontend 71152, browser 69628 with descendants recorded in its ownership registry, ports 3990/3991/3992, page /campaign/6b85a49e-fef5-4359-95e2-051383f6fb66/play, and profile R:\Projects\WorldForge\output\playtests\campaign-play\pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r112.session\browser-profile. They were stopped after the hard stop and independently verified absent, with no listeners on all three ports. Evidence and the profile remain preserved. No implementation-time provider call, direct database/API write, Resume, Restore, replay, or retry was used. AGENTS.md and CLAUDE.md remain pre-existing unstaged changes and are not part of this repair.

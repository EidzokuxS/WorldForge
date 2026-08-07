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
- Final staged-path review, GitNexus `detect_changes`, commit/push, and local/origin equality are required before handoff.

## Fresh rendered journey

Pending diagnostic commit and the next fresh pristine lane (`r112`) from `lowwater-ledger-pristine-93a09e46-20260719`. The lane must use one canonical Brina card import, one Save, one Begin with lower-wards / Local / Already here / Looking for work, then stop at the first genuine defect or continue to 60 unique bound actions plus same-page reload. No provider call is used for implementation validation.

## Acceptance handoff

| Criterion | Evidence | Result |
| --- | --- | --- |
| Success response emits no event | Focused wrapper test | Pass |
| Structured non-success emits exactly one bounded event | Injected local fetch and pure helper tests | Pass |
| Response body/headers remain available and thrown error identity is unchanged | Focused wrapper tests | Pass |
| Secrets, prompts, prose, descriptions, and raw provider bytes are absent | Pure helper and wrapper serialized-payload assertions | Pass |
| Existing provider/model/reasoning/retry/deadline/persistence/mechanics/UI behavior is unchanged | Minimal wrapper observation diff plus affected suites | Pass pending rendered proof |
| 60/60 unique bound actions plus same-page reload | Next fresh pristine lane | Pending |

## Cleanup

Frozen r111 remains immutable. No runtime, browser, provider call, database/API write, Resume, Restore, replay, or retry was used during implementation. `AGENTS.md` and `CLAUDE.md` remain pre-existing unstaged changes and are not part of this repair.

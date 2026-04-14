---
phase: 53
reviewers: [claude]
attempted_reviewers: [gemini, claude, codex]
reviewed_at: 2026-04-13T11:26:30+03:00
plans_reviewed:
  - 53-01-PLAN.md
  - 53-02-PLAN.md
---

# Cross-AI Plan Review — Phase 53

## Gemini Review

No usable review output. Gemini CLI returned `429 Too Many Requests` during authentication/session bootstrap, so no substantive review content was produced.

---

## Claude Review

# Phase 53 Plan Review: Gameplay Route Convergence & Reload-Stable Research Log

## Plan 53-01: Retire Legacy `/api/chat` Bypass & Persist Factual Lookup Logging

### Summary

A well-scoped backend/shared plan that addresses two clear audit gaps: the legacy `POST /api/chat` bypass that sidesteps Phases 45/47 seams, and the transient-only lookup/compare history. The TDD approach (lock regressions first, then implement) is correct for a gap-closure phase. The plan stays disciplined — no new stores, no `ChatMessage` widening, no frontend work. The shared lookup-log contract in `shared/src/chat.ts` is the right place to centralize the `[Lookup: ...]` format so backend persistence and frontend rendering stay synchronized.

### Strengths

- **TDD ordering is correct**: Task 1 writes failing tests that describe the contract, Task 2 makes them pass. This prevents accidental "green by default" regressions.
- **Shared contract placement**: `formatLookupLogEntry` / `parseLookupLogEntry` in `@worldforge/shared` is exactly right — it prevents the drift pitfall the research document identified.
- **Clean scope boundary**: No frontend changes, no new storage, no `ChatMessage` metadata widening. Strictly backend route convergence + shared helpers.
- **Explicit must-haves with verifiable truths**: The three truths in the frontmatter are concrete and testable, not aspirational prose.
- **GitNexus impact gate (Task 0)**: Forces blast-radius awareness before touching `appendChatMessages` and `getChatHistory`, which have broad downstream consumers.
- **Dead import cleanup**: Explicitly calls out cleaning up `callStoryteller` imports after route retirement, preventing lint/build noise.

### Concerns

- **HIGH — `callStoryteller` import and potential dead code**: The plan says to retire `POST /chat` and clean up dead imports, but `callStoryteller` is imported at `chat.ts:2` and only used by the legacy route. The plan should explicitly confirm whether `callStoryteller` itself (in `backend/src/ai/storyteller.ts`) becomes dead code after this change. If so, the function and its test coverage become orphaned. The plan should note whether to defer removal to a later cleanup or handle it here.

- **MEDIUM — Lookup user-message content format**: The plan says to persist `{ role: "user", content: commandText }` but doesn't specify what `commandText` looks like. Currently in `page.tsx`, the user types `/lookup Gojo` or `/compare Gojo vs Naruto`. The plan should clarify whether the persisted user message is the raw slash command (`/lookup Gojo`) or a normalized form. This matters for reload presentation — if the user message is `/lookup Gojo`, the frontend needs to know not to render it as a normal player action bubble.

- **MEDIUM — `chatBodySchema` becomes dead code**: After removing `POST /chat`, the `chatBodySchema` imported from `./schemas.js` at line 28 is unused. The plan mentions dead import cleanup but doesn't explicitly list schema cleanup, which could cause lint warnings or unused-export confusion.

- **LOW — Legacy route retirement strategy not fully decided**: The plan says "removing it or returning a hard failure" — both are valid, but the test in Task 1 (Test 1) should be written to work with either approach. If the test asserts a 410 response, removing the route entirely would break the test. The research recommends 410 Gone, which is a reasonable choice that should be locked in the plan rather than left to executor discretion.

- **LOW — No explicit `shared/src/index.ts` re-export verification**: Task 2 says to re-export from `shared/src/index.ts`, but the acceptance criteria don't include a verification that the re-export actually works (e.g., that the backend can `import { formatLookupLogEntry } from "@worldforge/shared"`). This is unlikely to fail but could cause a confusing build error if missed.

### Suggestions

- **Lock the retirement strategy**: Change "removing it or returning a hard failure" to a concrete choice. Given that no frontend caller uses `POST /api/chat`, a clean removal is simpler and avoids maintaining a dead route handler. If the team wants observability on accidental callers, return `410 Gone` with a JSON body. Pick one in the plan.
- **Specify user-message format**: Add a note that the persisted user message for lookup should be the raw slash command (e.g., `/lookup Gojo`) to match the current in-session visible behavior, or a normalized form like `[Lookup command: faction] What factions exist?`. This affects Plan 53-02's rendering logic.
- **Flag `callStoryteller` and `chatBodySchema` as dead code candidates**: Add a note in the acceptance criteria or action section that these should be cleaned up or explicitly deferred. The `sanitizeNarrative` import at line 46 is still used by the authoritative routes, so it stays — but `callStoryteller` does not.
- **Add a regression for `GET /history` not returning `hasLiveTurnSnapshot: true` after lookup**: Task 1's Test 4 says "lookup-only interactions do not create `hasLiveTurnSnapshot`" but the acceptance criteria don't explicitly mention checking the `GET /history` response's `hasLiveTurnSnapshot` field. This is the exact contract that prevents retry controls from appearing after a lookup.

### Risk Assessment

**LOW**. The plan is well-researched, correctly scoped, and follows TDD. The concerns are implementation details that a competent executor can resolve, not structural risks. The biggest risk (dead `callStoryteller` code) is a cleanup issue, not a correctness issue.

---

## Plan 53-02: Rehydrate Persisted Lookup on `/game` & Close the Route Matrix

### Summary

The frontend counterpart to 53-01. It consumes the shared lookup-log contract to make reloaded lookup/compare entries render correctly, removes the duplicated local regex, and closes the route matrix with explicit stream-plus-reload tests. The plan is correctly sequenced (depends on 53-01) and stays within the existing component/test architecture. The key insight — that `gameplay-text.ts` should import the shared parser instead of owning a private regex — is the right fix for the contract-drift pitfall.

### Strengths

- **Correct dependency ordering**: Depends on 53-01, so the shared contract exists before the frontend consumes it.
- **Eliminates private regex drift**: Moving lookup classification to the shared parser means backend persistence and frontend rendering are provably synchronized.
- **Route-matrix coverage is explicit**: The must-haves require proof of `opening`, `action`, `retry`, and `lookup` across both stream and reload, not just one happy path.
- **Minimal surface area**: No new UI panel, no local storage, no `ChatMessage` widening. Just rewiring the existing classification/rendering to consume the shared contract.
- **Preserves Phase 45/47 contracts**: The acceptance criteria explicitly call out not regressing action/opening/retry behavior, which is the right boundary to protect.

### Concerns

- **MEDIUM — User-message rendering for persisted lookup commands**: Plan 53-01 persists a `{ role: "user", content: commandText }` message for lookup. When `/game` reloads, this user message will render as a normal player-action bubble (right-aligned, styled as player input). If `commandText` is `/lookup Gojo`, the player will see their slash command in the log, which matches current in-session behavior. But the plan doesn't explicitly confirm this is desired or verify that the user-message rendering path handles it gracefully. If the user message is a raw slash command, `deriveGameMessageKind("user", "/lookup Gojo")` returns `"player"` — which is correct but should be explicitly tested in the route matrix.

- **MEDIUM — `gameplay-text.ts` still needs its own `LOOKUP_PREFIX_PATTERN`**: The plan says to import the shared parser, but `stripLookupPrefix()` is used by `narrative-log.tsx` for display stripping. The shared `parseLookupLogEntry()` returns `{ lookupKind, answer }`, which gives the stripped content. But `deriveGameMessageKind()` needs to check whether content is a lookup without parsing it fully. The plan should clarify whether `gameplay-text.ts` keeps a local `isLookupEntry()` check that delegates to the shared parser, or replaces the regex entirely. A full replacement is cleaner but means `deriveGameMessageKind` now depends on `@worldforge/shared`, which might affect bundle size or import structure.

- **LOW — No explicit test for compare-kind persistence through reload**: Task 1's Test 1 says "persisted lookup and compare entries" render as support blocks, but the acceptance criteria for `page.test.tsx` say "persisted lookup or compare messages" (emphasis on "or"). The route matrix should cover both kinds explicitly, since `compare` maps to `"power_profile"` in `deriveGameMessageKind` and renders a different badge ("Power Profile" vs "Lookup").

- **LOW — `parseTurnSSE` test already exists**: Task 1's Test 3 says to keep `parseTurnSSE` lookup_result coverage, but `api.test.ts:395-442` already has this test. The plan should clarify this is about preserving the existing test, not adding a duplicate.

### Suggestions

- **Test both lookup and compare reload rendering explicitly**: In `page.test.tsx`, seed history with both `[Lookup: faction] ...` and `[Lookup: power_profile] ...` messages and verify they render as distinct support blocks ("Lookup" vs "Power Profile"). This closes the compare-specific reload gap.
- **Clarify the `gameplay-text.ts` → `@worldforge/shared` import boundary**: Add a note that `deriveGameMessageKind` should call the shared `parseLookupLogEntry()` for classification and derive the kind from the parsed `lookupKind` field, replacing the local regex. This makes the contract explicit: if the shared parser says it's a lookup, it's a lookup.
- **Add a user-message reload test**: Verify that persisted `/lookup ...` user messages render as normal player bubbles after reload, not as orphaned commands or broken entries. This is a minor edge case but worth one assertion.
- **Note that `api.test.ts` Test 3 is about non-regression, not new coverage**: Clarify that the existing `parseTurnSSE` lookup test stays intact and is not duplicated.

### Risk Assessment

**LOW**. The plan is well-bounded, correctly depends on 53-01's shared contract, and targets the right files. The concerns are about test completeness for edge cases (compare vs lookup rendering, user-message reload), not structural issues. The route-matrix approach is the correct way to close the audit gap.

---

## Codex Review

Skipped for independence because this runtime is Codex.

---

## Consensus Summary

One independent usable review found the package structurally sound and low risk, with the remaining issues concentrated around contract precision rather than scope or sequencing.

### Agreed Strengths

- The phase split is correct: `53-01` owns backend/shared convergence and `53-02` owns frontend reload consumption.
- The shared lookup-log contract in `@worldforge/shared` is the right seam and avoids backend/frontend drift.
- The TDD order is correct and appropriate for a gap-closure phase.

### Agreed Concerns

- Lock the legacy `/api/chat` retirement strategy explicitly instead of leaving remove-vs-hard-fail open.
- Specify the persisted lookup user-message format and cover its reload rendering intentionally.
- Keep compare-specific reload/rendering proof explicit rather than implied.
- Note dead-code fallout around `callStoryteller` and `chatBodySchema` so cleanup ownership is explicit.

### Divergent Views

- None. Only one reviewer produced usable substantive feedback.

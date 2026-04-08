---
phase: 37
reviewers: [claude]
review_failures:
  - reviewer: gemini
    reason: "429 MODEL_CAPACITY_EXHAUSTED / no usable review returned"
skipped_reviewers:
  - reviewer: codex
    reason: "current runtime; skipped for independence"
reviewed_at: 2026-04-08T18:59:21.6723035+03:00
plans_reviewed:
  - 37-01-PLAN.md
  - 37-02-PLAN.md
---

# Cross-AI Plan Review — Phase 37

## Gemini Review

No usable review returned.

Observed failure:
- `429 MODEL_CAPACITY_EXHAUSTED` for `gemini-3-flash-preview`
- Gemini CLI also emitted local agent/skill validation noise before the capacity failure

This is not a plan-quality verdict. It is an external reviewer availability failure.

---

## Claude Review

I'll review these plans against the phase goals, context decisions, and codebase state.

# Phase 37 Plan Review: Campaign-Loaded Gameplay Transport

## 37-01-PLAN.md — Backend Campaign-Addressed Transport

### Summary

A well-scoped backend plan that correctly identifies the two key changes needed: (1) add `campaignId` to all gameplay route schemas and (2) replace `getActiveCampaign()` with `requireLoadedCampaign()` plus campaign-keyed snapshot storage. The plan stays tightly within the phase boundary defined by the CONTEXT.md decisions and avoids the explicitly deferred work (checkpoints, rollback fidelity, route renaming). The TDD approach with two tasks is a reasonable split — schema/validation first, then resolver/snapshot semantics.

### Strengths

- **Clean task split**: Task 1 (contract validation) and Task 2 (resolver + snapshot scoping) are genuinely sequential — you can't test the resolver change without the schema carrying `campaignId` first.
- **Explicit boundary adherence**: Every task references specific D-## decisions and explicitly names what's out of scope (D-10, D-11). This prevents scope creep during execution.
- **`must_haves` section is precise**: The three truths are testable assertions, not vague goals. An executor can verify each one mechanically.
- **Reuses existing infrastructure**: `requireLoadedCampaign()` already exists and is battle-tested by worldgen/character flows. No new helper invention needed.
- **Legacy route left alone**: D-11 compliance is called out — the plain-text `POST /api/chat` route stays untouched unless compile health demands it.

### Concerns

- **HIGH — `history` route becomes async**: Currently `app.get("/history", (c) => { ... })` is synchronous. After switching to `requireLoadedCampaign()` (which is `async` and calls `loadCampaign()`), the handler must become `async`. The plan mentions this implicitly but doesn't flag it as a breaking change that could affect test setup. The executor should handle this fine, but it's worth noting.

- **MEDIUM — `campaignId` delivery for GET /history**: D-02 says "history should receive `campaignId` as a request parameter" — but doesn't specify query param vs. route param. The plan says "request parameter in a testable form" and leaves it to Claude's discretion. This is fine per the CONTEXT.md, but the executor could choose a query param (`?campaignId=X`) or a body (GET with body is non-standard). The natural choice is query param, but the plan should be slightly more explicit to avoid a JSON-body-on-GET antipattern.

- **MEDIUM — Snapshot map memory leak**: The plan replaces `let lastTurnSnapshot: TurnSnapshot | null` with a campaign-keyed `Map<string, TurnSnapshot>`. Without any eviction policy, loading many campaigns in one process would accumulate snapshots indefinitely. This is acceptable for a single-player desktop app (the user will restart eventually), but a brief note about bounded map size or LRU would be prudent. D-14 acknowledges the restart limitation but doesn't mention memory growth.

- **LOW — Test mock surface widening**: Task 2 needs to mock `requireLoadedCampaign()` (async, may call `loadCampaign`), which is different from the current `getActiveCampaign()` mock (sync, returns cached value). The existing test file mocks `../../campaign/index.js` but not `./helpers.js` for `requireLoadedCampaign`. The executor will need to add or adjust mocks, which the plan doesn't call out explicitly.

- **LOW — `retry` body schema**: Currently `POST /retry` has no body parsing at all — it just calls `getActiveCampaign()`. Adding `campaignId` to the body means adding a new schema (`chatRetryBodySchema`) and `parseBody()` call. Same for `POST /undo`. The plan groups this under Task 1's schema work but doesn't enumerate these new schemas explicitly. Minor, but the executor should create schemas for retry and undo, not just extend existing ones.

### Suggestions

- Add a brief note in Task 1 that `GET /history` should use a query parameter (`?campaignId=X`), not a body, to stay HTTP-conventional.
- In Task 2, mention that the snapshot map should be a simple `Map<string, TurnSnapshot>` and note it's single-player-safe but would need eviction in a multi-user scenario (future-proofing documentation, not implementation).
- Explicitly name the new schemas needed: `chatHistoryQuerySchema`, `chatRetryBodySchema`, `chatUndoBodySchema` (or a shared `campaignIdBodySchema` reused by retry/undo).
- Note that the `history` handler becomes async after this change.

### Risk Assessment: **LOW**

The changes are mechanical — adding a field to schemas, swapping one resolver for another that already exists, and converting a singleton to a map. The TDD approach with existing test infrastructure makes regression unlikely. The only real risk is the GET-with-body antipattern if the executor makes a poor choice for history, but the plan's discretion clause and existing codebase patterns (query params on GET routes elsewhere) make this unlikely.

---

## 37-02-PLAN.md — Frontend Gameplay Wiring

### Summary

A solid frontend plan that correctly identifies the two changes: (1) update `frontend/lib/api.ts` helper signatures to require `campaignId` and (2) rewire `/game` page handlers to pass the loaded campaign ID. The wave-2 dependency on 37-01 is correct — frontend can't test against a backend contract that doesn't exist yet. The plan preserves the existing `/game` bootstrap (active → remembered → redirect) while tightening the downstream calls.

### Strengths

- **Correct dependency chain**: Wave 2 depends on 37-01, preventing frontend work from running against stale backend assumptions.
- **Helper-first approach**: Changing `api.ts` signatures first (Task 1) then page wiring (Task 2) means TypeScript will flag any page code that still uses old signatures, making the refactor self-enforcing.
- **Preserved bootstrap**: D-08 compliance is clear — the active/remembered campaign fallback stays, but all subsequent calls use explicit `campaignId`.
- **No route churn**: `/game` stays as-is per D-07, no `/campaign/[id]/game` expansion.

### Concerns

- **MEDIUM — `apiStreamPost` for action**: The current action submission uses `apiStreamPost("/api/chat/action", { playerAction, intent, method })` directly in `page.tsx` (line 198-202). The plan says to route through updated helpers, but `apiStreamPost` is a generic function, not a gameplay-specific helper. The plan should clarify whether a new `chatAction(campaignId, ...)` helper should be created in `api.ts` (like `chatRetry`/`chatUndo`/`chatEdit` already exist), or whether the page continues using `apiStreamPost` directly with the added `campaignId` field. The cleaner approach is a dedicated helper.

- **MEDIUM — `chatRetry` returns `Response` (streaming)**: The current `chatRetry()` returns `Promise<Response>` for SSE parsing. Adding `campaignId` is straightforward (add it to the body), but the plan should note that this is a streaming response helper, not a JSON helper — so it uses `apiStreamPost`, not `apiPost`. The executor needs to handle this correctly to avoid breaking the SSE stream parsing.

- **LOW — History fetch path change**: Currently the page fetches history via `apiGet<ChatHistoryResponse>("/api/chat/history")`. After 37-01, this needs `?campaignId=X` appended. The plan mentions this but doesn't specify whether to create a dedicated `chatHistory(campaignId)` helper or just inline the query param. A dedicated helper is cleaner and matches the pattern of `chatRetry`/`chatUndo`/`chatEdit`.

- **LOW — `getRememberedCampaignId` import**: The page already imports `getRememberedCampaignId` but currently doesn't use it for gameplay transport — only for bootstrap. No change needed here, but the test should verify that the remembered ID flows through to the gameplay calls, not just to the initialization.

- **LOW — Page test mock surface**: The current `page.test.tsx` mocks `@/lib/api` module-level. After the helper signature changes, the mock setup needs to match new signatures (e.g., `chatRetry(campaignId)` instead of `chatRetry()`). The plan mentions this but doesn't detail the mock adjustments.

### Suggestions

- Create a dedicated `chatAction(campaignId, playerAction, intent, method)` helper in `api.ts` rather than leaving the page to call `apiStreamPost` directly. This centralizes the contract and makes testing easier.
- Similarly, create `chatHistory(campaignId)` as a named helper instead of raw `apiGet` with query param construction.
- Note in Task 1 that `chatRetry` is a streaming helper (`apiStreamPost`) and `chatUndo`/`chatEdit` are JSON helpers (`apiPost`) — the `campaignId` goes in the body for all of them, but the return types differ.
- In Task 2, explicitly list the four handler changes needed in `page.tsx`: `initGame` (history), `submitAction` (action), `handleRetry` (retry), `handleUndo` (undo), `handleEdit` (edit).

### Risk Assessment: **LOW**

The frontend changes are straightforward signature additions and call-site updates. TypeScript enforcement means forgotten call sites will fail at compile time. The main risk is the streaming helper distinction, but the executor should handle this given the existing codebase patterns.

---

## Cross-Plan Assessment

### Overall Phase Risk: **LOW**

- The two plans together cleanly satisfy RINT-01 end-to-end.
- The backend-first, frontend-second ordering is correct.
- Both plans stay within the Phase 37 boundary — no checkpoint, rollback, or route-tree creep.
- The TDD approach across both plans means regressions are caught immediately.

### One Gap Worth Noting

Neither plan mentions **the legacy `POST /api/chat` route** beyond "leave it alone." This route (lines 300-378 in `chat.ts`) still uses `getActiveCampaign()`. D-11 says to leave it out of scope "unless touching it is necessary to preserve compile/runtime health." Since the import of `getActiveCampaign` from `campaign/index.js` will still be needed by this legacy route, the executor shouldn't remove that import even after the targeted routes stop using it. This is a minor detail but worth flagging — the executor should not accidentally break the legacy route by removing the `getActiveCampaign` import.

### Verdict

Both plans are execution-ready. The concerns are all MEDIUM or LOW and represent executor-level decisions, not plan-level flaws. No redesign needed.

---

## Consensus Summary

Available review coverage is limited to one usable external review. Gemini did not return a substantive review, so the synthesis below reflects the available reviewer only.

### Agreed Strengths

- The phase boundary is tight and matches `37-CONTEXT.md`.
- Wave ordering is correct: backend contract first, frontend adoption second.
- The plans directly target `RINT-01` without leaking into checkpoint fidelity, rollback redesign, or route-tree churn.
- Reusing `requireLoadedCampaign()` is the right low-risk backend move.
- Converting the singleton snapshot to campaign-scoped state is necessary and correctly included.

### Agreed Concerns

- `GET /api/chat/history` should be explicitly query-parameter based; the current wording leaves too much room for a GET-with-body antipattern.
- The backend plan should acknowledge that `history` becomes async under `requireLoadedCampaign()`.
- The frontend plan should be clearer about streaming helpers versus JSON helpers, especially `apiStreamPost`/`chatRetry`.
- The frontend action path would be cleaner if wrapped in a dedicated `chatAction(campaignId, ...)` helper instead of leaving direct generic stream calls in the page.
- The legacy plain-text `POST /api/chat` route still depends on `getActiveCampaign()` and should not be broken accidentally while targeted routes migrate.

### Divergent Views

- No meaningful reviewer divergence was available because only one external review succeeded.
- Gemini reviewer availability failed due provider capacity, not because of plan content.

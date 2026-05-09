---
phase: 59
reviewers: [gemini, codex]
reviewed_at: 2026-04-17T01:25:00Z
plans_reviewed: [59-01-PLAN.md, 59-02-PLAN.md]
overall_verdicts:
  gemini: LOW — GO
  codex: HIGH on 59-02, MEDIUM on 59-01 — REVISE before overnight run
---

# Cross-AI Plan Review — Phase 59

## Gemini Review
LOW risk, GO. Medium concerns: mock complexity in DOM tests, Windows process zombie risk in smoke script, logs .gitignore awareness. Plans approved for execution.

## Codex Review (key findings)

### Plan 59-01 — Risk MEDIUM

**HIGH:**
- Tests mock `LocationPanel`/`CharacterPanel`/`LorePanel` so DOM assertions only see `GamePage` wrappers, NOT the real outer/inner scroll regions of panels. Claim "each panel scrolls internally" not proven.

**MEDIUM:**
- Plan says "create `frontend/app/game/__tests__/page.test.tsx`" but file already exists with large mock harness. Plan's skeleton uses wrong API names (submitAction, getCampaignHistory) — real imports are chatAction, chatHistory, chatOpening, getWorldData, parseTurnSSE.
- Verify `npm --prefix frontend test -- --run page.test.tsx` matches 8+ `page.test.tsx` files across frontend — test gate may run irrelevant pages.
- Research mentioned regression smoke on `/campaign/new`, `/campaign/[id]/character`, `/settings` — plan doesn't cover them.

### Plan 59-02 — Risk HIGH

**HIGH:**
- Bash commands (`tee`, `/tmp`, `test`, `$(( ))`) — Codex claims PowerShell incompatible. FALSE POSITIVE: environment uses bash (git bash on Windows). Ignore.
- Task 1 verify logically broken: computes `BEFORE` AFTER edits, so cannot honestly prove `40 → 38`. Must capture BEFORE count before edits, persist, compare AFTER against saved value.
- Smoke script sketch not executable `.mjs`: mixes `import ... from "node:fs"` with `require("node:fs")`; contains placeholder `const out = readFileSync ? null : null;`. Must be clean ESM.
- `sleep(2500)` after navigate() is flaky — Next.js dev hydration timing varies. Replace with polling loop on `[data-shell-region]` markers.

**MEDIUM:**
- Not cross-browser — one Chromium path, no explicit viewport. Either add second viewport smoke OR drop "cross-browser" claim.
- Regression routes `/campaign/new`, `/character`, `/settings` not covered in smoke.
- scrollCheck selector assumes radix internals. Project ScrollArea guarantees `data-slot="scroll-area-viewport"` — use that.

**LOW:**
- Smoke script overwrites VALIDATION.md wholesale — could lose manual content. Acceptable for auto-artifact.

## Consensus

**Agreed concerns:**
- Mocked panels in DOM tests weaken scroll proof (Codex explicit, Gemini implicit)
- Smoke script robustness (Gemini: Windows zombies; Codex: mixed require/import, fixed sleep)

**Diverging:**
- Gemini: LOW/GO. Codex: HIGH on 59-02, REVISE.
- Gemini: PowerShell bash concern. Codex: PowerShell concern. Actual env = bash, both wrong.

## Required Fixes

**Plan 59-01:**
1. Don't create new test file — extend existing `frontend/app/game/__tests__/page.test.tsx`
2. Fix mocked APIs to match real imports (chatAction, chatHistory, chatOpening, getWorldData, parseTurnSSE)
3. Narrow verify command to exact file path, not glob
4. Add component-level test for real `LorePanel` (unmocked) to prove outer wrapper + internal scroll
5. Either add regression smoke for 3 other routes OR drop claim from must_haves

**Plan 59-02:**
1. Persist BEFORE count (git show current typecheck count to file BEFORE edits, reread AFTER)
2. Clean up smoke script: pure ESM (import only, no require), remove placeholder
3. Replace `sleep(2500)` with polling loop: wait until `document.querySelector('[data-shell-region="action-dock"]') !== null` AND client has painted (2 consecutive successful checks 500ms apart)
4. Use `data-slot="scroll-area-viewport"` selector for scroll verification (matches project ScrollArea)
5. Drop "cross-browser" language — stick with single-viewport Chromium smoke, specify exact viewport (1920x1080)
6. Add optional regression smoke pass over `/campaign/new`, `/settings`, `/campaign/{id}/character` — basic navigate + no-crash

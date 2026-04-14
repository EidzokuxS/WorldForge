---
phase: 27
slug: lore-card-editing-and-deletion
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-31
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `backend/vitest.config.ts`, `frontend/vitest.config.ts` |
| **Quick run command** | `npm --prefix backend exec vitest run src/routes/__tests__/lore.test.ts src/vectors/__tests__/lore-cards.test.ts && npm --prefix frontend exec vitest run lib/__tests__/api.test.ts components/world-review/__tests__/lore-section.test.tsx` |
| **Full suite command** | `npm --prefix backend run test && npm --prefix frontend exec vitest run` |
| **Estimated runtime** | ~35 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task-specific command from the verification map below.
- **After every plan wave:** Run `npm --prefix backend exec vitest run src/routes/__tests__/lore.test.ts src/vectors/__tests__/lore-cards.test.ts && npm --prefix frontend exec vitest run lib/__tests__/api.test.ts components/world-review/__tests__/lore-section.test.tsx`
- **Smoke-prep note:** Keep 27-03 environment preparation on health checks plus smoke-target file validation only; do not expand the quick-run suite for that task.
- **Before `/gsd:verify-work`:** Full backend suite and targeted frontend suite must be green.
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | P27-01, P27-02, P27-03, P27-04 | route | `npm --prefix backend exec vitest run src/routes/__tests__/lore.test.ts -t "updates one lore card by id\|deletes one lore card by id\|rejects invalid lore edit payloads\|returns 404 for missing lore cards"` | ✅ extend | ⬜ pending |
| 27-01-02 | 01 | 1 | P27-05 | vector | `npm --prefix backend exec vitest run src/vectors/__tests__/lore-cards.test.ts -t "preserves ids and refreshes embeddings on edit\|deletes only the targeted lore card\|fails edit when embedder is unavailable"` | ✅ extend | ⬜ pending |
| 27-02-01 | 02 | 2 | P27-06 | api | `npm --prefix frontend exec vitest run lib/__tests__/api.test.ts -t "updateLoreCard sends PUT\|deleteLoreCardById sends DELETE\|propagates lore item API errors"` | ✅ extend | ⬜ pending |
| 27-02-02 | 02 | 2 | P27-06 | component | `npm --prefix frontend exec vitest run components/world-review/__tests__/lore-section.test.tsx -t "edits a lore card and refreshes\|deletes a lore card and clears search results\|shows per-card pending state\|surfaces lore mutation failures"` | ✅ extend | ⬜ pending |
| 27-03-01 | 03 | 3 | P27-01, P27-02, P27-03, P27-04, P27-05, P27-06 | regression | `npm --prefix backend exec vitest run src/routes/__tests__/lore.test.ts src/vectors/__tests__/lore-cards.test.ts && npm --prefix frontend exec vitest run lib/__tests__/api.test.ts components/world-review/__tests__/lore-section.test.tsx` | ✅ extend | ⬜ pending |
| 27-03-02 | 03 | 3 | P27-05, P27-06 | smoke-prep | `$p = '.planning/phases/27-lore-card-editing-and-deletion/27-03-smoke-target.md'; if (-not (Test-Path $p)) { throw 'Missing smoke-target artifact.' }; $t = Get-Content -Raw $p; if ($t -notmatch 'campaignId:' -or $t -notmatch 'reviewUrl: http://localhost:3000/campaign/.+/review' -or $t -notmatch 'editCard:' -or $t -notmatch 'deleteCard:') { throw 'Smoke-target artifact is missing required fields.' }; Invoke-RestMethod 'http://localhost:3001/api/health' | Out-Null; Invoke-WebRequest 'http://localhost:3000' -UseBasicParsing | Out-Null; Write-Output 'PASS: smoke target prepared'` | ✅ create | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None. All targeted test files already exist and should be extended in-place during execution.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| World-review lore editing feels correct in the real review page, including search freshness and persistence after reload | P27-05, P27-06 | Requires live browser interaction across dialog state, search, delete confirmation, and page reload | Open the exact `reviewUrl` recorded in `.planning/phases/27-lore-card-editing-and-deletion/27-03-smoke-target.md`, edit the recorded `editCard`, search for `Phase 27 Smoke Edited Term`, delete the recorded `deleteCard`, refresh the page, and confirm invalid edits surface an error instead of silently succeeding |

---

## Validation Sign-Off

- [x] All implementation tasks now verify with targeted automated behavior tests.
- [x] Sampling continuity: no implementation plan relies only on lint or typecheck.
- [x] Wave 0 covers all missing-test concerns by confirming the target files already exist.
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

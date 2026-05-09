---
phase: 61
slug: character-ingestion-frontend-ui
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-17
---

# Phase 61 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2 + jsdom |
| **Config file** | `frontend/vitest.config.ts` + repo-root `vitest.config.ts` |
| **Quick run command** | `npx vitest run frontend/components/character-creation/` |
| **Full suite command** | `npx vitest run frontend/` |
| **Estimated runtime** | ~45s |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run frontend/components/character-creation/`
- **After every plan wave:** Run `npx vitest run frontend/` + `npm --prefix frontend run typecheck` + `npm --prefix frontend run lint`
- **Before `/gsd:verify-work`:** Full frontend suite green + backend Phase 60 suite still green + typecheck green + lint green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 61-01-00 | 01 | 1 | docs | doc-check | `grep -q "P61-R1" .planning/REQUIREMENTS.md` | ✅ | ✅ green |
| 61-01-01 | 01 | 1 | P61-R4 | unit | `npx vitest run frontend/lib/__tests__/api.test.ts` | ✅ | ✅ green |
| 61-01-02 | 01 | 1 | P61-R1, P61-R2, P61-R3, P61-R4 | unit | `npx vitest run frontend/components/character-creation/__tests__/` | ✅ | ✅ green |
| 61-01-03 | 01 | 1 | P61-R1, P61-R2, P61-R3, P61-R4 | unit | `npx vitest run frontend/components/character-creation/__tests__/` | ✅ | ✅ green |
| 61-02-01 | 02 | 2 | P61-R1, P61-R2, P61-R4 | structural | `grep PipelineErrorBanner frontend/app/(non-game)/campaign/[id]/character/page.tsx` | ✅ | ✅ green |
| 61-02-02 | 02 | 2 | P61-R1, P61-R2, P61-R4 | unit (form+card) | `npx vitest run frontend/components/character-creation/__tests__/character-form.test.tsx frontend/components/character-creation/__tests__/character-card.test.tsx` | ✅ | ✅ green (24/24) |
| 61-03-01 | 03 | 2 | P61-R1, P61-R2, P61-R3, P61-R4 | unit | `npx vitest run frontend/components/world-review/__tests__/npcs-section.test.tsx` | ✅ | ✅ green (6/6) |
| 61-03-02 | 03 | 2 | P61-R1 | structural | `grep PowerStatsSection frontend/components/world-review/character-record-inspector.tsx` (single-source-of-truth import) | ✅ | ✅ green |
| 61-04-01 | 04 | 3 | all | suite | `npx vitest run frontend/ && npm --prefix frontend run typecheck && npm --prefix frontend run lint` | ✅ | ⚠️ 372/376 vitest, typecheck green, 4 pre-existing failures (see SUMMARY) |
| 61-04-02 | 04 | 3 | all | smoke | `node pinchtab/character-creation-{player,npc}.mjs` (manual-only; skip if localhost blocked) | ✅ scripts | ⏭ deferred — bridge unreachable, scripts committed for manual run |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `frontend/components/character-creation/__tests__/power-stats-section.test.tsx` — covers P61-R1 atom
- [x] `frontend/components/character-creation/__tests__/override-text-field.test.tsx` — covers P61-R2 atom
- [x] `frontend/components/character-creation/__tests__/creation-modes.test.tsx` — covers P61-R3 atom
- [x] `frontend/components/character-creation/__tests__/pipeline-error-banner.test.tsx` — covers P61-R4 atom
- [x] `frontend/lib/__tests__/api.test.ts` — covers IngestionError + overrideText forwarding on 4 wrappers
- Existing `frontend/components/character-creation/__tests__/character-form.test.tsx` extended in Plan 02
- Existing `frontend/components/world-review/__tests__/npcs-section.test.tsx` extended in Plan 03
- Existing `frontend/components/world-review/__tests__/character-record-inspector.test.tsx` extended in Plan 03

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PinchTab browser smoke — full character creation flow w/ override text + pipeline-error retry | P61-R1, P61-R2, P61-R3, P61-R4 | Visual regression + end-to-end LLM call; requires live dev server + real GLM provider | See `pinchtab/character-creation.mjs` (to be created in Plan 04). Load `/campaign/{id}/character` after worldgen, run Parse with override "eyes are red not blue", assert returned draft's appearance contains "red" and PowerStats visible; then force a stage failure and confirm banner + Retry. |
| Visual design token parity vs `docs/ui_concept_hybrid.html` | P61-R5 | CSS class-level assertions catch tokens but cannot evaluate overall composition | Manual side-by-side review of `/campaign/{id}/character` and `docs/ui_concept_hybrid.html` at 1440px and 1920px widths. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-17

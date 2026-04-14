---
phase: 54
slug: draft-backed-npc-edit-persistence-and-review-convergence
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-13
---

# Phase 54 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `Vitest 3.2.4` |
| **Config file** | `backend/vitest.config.ts`, `frontend/vitest.config.ts` |
| **Quick run command** | `npm --prefix backend exec vitest run src/routes/__tests__/worldgen.test.ts src/worldgen/__tests__/scaffold-saver.test.ts src/routes/__tests__/campaigns.test.ts && npm --prefix frontend exec vitest run lib/__tests__/world-data-helpers.test.ts components/world-review/__tests__/npcs-section.test.tsx components/world-review/__tests__/character-record-inspector.test.tsx` |
| **Full suite command** | `npm --prefix backend run test && npm --prefix frontend exec vitest run` |
| **Estimated runtime** | ~30 seconds quick, longer full suite |

---

## Sampling Rate

- **After every backend task commit:** Run the backend half of the quick command
- **After every frontend/helper task commit:** Run the frontend half of the quick command
- **After every plan wave:** Run the phase-appropriate smoke command below
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds on targeted smoke

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 54-01-00 | 01 | 1 | UX-02 | impact-analysis gate | `gitnexus_impact({ repo: "WorldForge", target: "normalizeSavedScaffold", direction: "upstream" }) + gitnexus_impact({ repo: "WorldForge", target: "saveScaffoldToDb", direction: "upstream" }) + gitnexus_impact({ repo: "WorldForge", target: "fromLegacyScaffoldNpc", direction: "upstream" })` | ✅ | ⬜ pending |
| 54-01-01 | 01 | 1 | UX-02 | backend regression | `npm --prefix backend exec vitest run src/routes/__tests__/worldgen.test.ts src/worldgen/__tests__/scaffold-saver.test.ts` | ✅ | ⬜ pending |
| 54-01-02 | 01 | 1 | UX-02 | backend regression | `npm --prefix backend exec vitest run src/routes/__tests__/worldgen.test.ts src/worldgen/__tests__/scaffold-saver.test.ts src/routes/__tests__/campaigns.test.ts` | ✅ | ⬜ pending |
| 54-02-00 | 02 | 2 | UX-02 | impact-analysis gate | `gitnexus_impact({ repo: "WorldForge", target: "toEditableScaffold", direction: "upstream" }) + gitnexus_impact({ repo: "WorldForge", target: "NpcsSection", direction: "upstream" }) + gitnexus_impact({ repo: "WorldForge", target: "CharacterRecordInspector", direction: "upstream" })` | ✅ | ⬜ pending |
| 54-02-01 | 02 | 2 | UX-02 | frontend/helper regression | `npm --prefix frontend exec vitest run lib/__tests__/world-data-helpers.test.ts components/world-review/__tests__/npcs-section.test.tsx components/world-review/__tests__/character-record-inspector.test.tsx` | ✅ | ⬜ pending |
| 54-02-02 | 02 | 2 | UX-02 | frontend inspector/editor boundary regression | `npm --prefix frontend exec vitest run components/world-review/__tests__/npcs-section.test.tsx components/world-review/__tests__/character-record-inspector.test.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Smoke Suites

| Suite | Purpose | Automated Command | Estimated Runtime |
|-------|---------|-------------------|-------------------|
| `phase-54-backend-smoke` | save-edits reconciliation, persisted characterRecord projection, world reload round-trip | `npm --prefix backend exec vitest run src/routes/__tests__/worldgen.test.ts src/worldgen/__tests__/scaffold-saver.test.ts src/routes/__tests__/campaigns.test.ts` | ~18s |
| `phase-54-frontend-smoke` | draft-first world review reload plus additive inspector stability | `npm --prefix frontend exec vitest run lib/__tests__/world-data-helpers.test.ts components/world-review/__tests__/npcs-section.test.tsx components/world-review/__tests__/character-record-inspector.test.tsx` | ~12s |
| `phase-54-full-smoke` | backend/frontend convergence for draft-backed NPC save-load trust | `npm --prefix backend exec vitest run src/routes/__tests__/worldgen.test.ts src/worldgen/__tests__/scaffold-saver.test.ts src/routes/__tests__/campaigns.test.ts && npm --prefix frontend exec vitest run lib/__tests__/world-data-helpers.test.ts components/world-review/__tests__/npcs-section.test.tsx components/world-review/__tests__/character-record-inspector.test.tsx` | ~30s |

---

## Wave 0 Requirements

Wave 0 coverage is already assigned to existing backend/frontend suites; no framework bootstrap is needed.

- [x] `backend/src/routes/__tests__/worldgen.test.ts` — route-boundary save-edits regressions
- [x] `backend/src/worldgen/__tests__/scaffold-saver.test.ts` — persistence projection and characterRecord truth
- [x] `backend/src/routes/__tests__/campaigns.test.ts` — `/campaigns/:id/world` round-trip payload checks
- [x] `frontend/lib/__tests__/world-data-helpers.test.ts` — editable scaffold reload precedence
- [x] `frontend/components/world-review/__tests__/npcs-section.test.tsx` — editor surface stability
- [x] `frontend/components/world-review/__tests__/character-record-inspector.test.tsx` — additive inspector stays read-only

---

## Manual-Only Verifications

All Phase 54 success criteria should be closed by automated regression coverage. No manual-only phase gate is expected.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s on targeted smoke
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

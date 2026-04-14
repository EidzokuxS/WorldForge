---
phase: 26
slug: reusable-multi-worldbook-library-for-campaign-creation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-31
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `backend/vitest.config.ts`, `frontend/vitest.config.ts` |
| **Quick run command** | `npm --prefix backend exec vitest run src/worldbook-library/__tests__/manager.test.ts src/routes/__tests__/worldgen.test.ts` |
| **Full suite command** | `npm --prefix backend run test && npm --prefix frontend exec vitest run` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm --prefix backend exec vitest run src/worldbook-library/__tests__/manager.test.ts src/routes/__tests__/worldgen.test.ts`
- **After every plan wave:** Run `npm --prefix backend run test && npm --prefix frontend exec vitest run`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | P26-01 | unit | `npm --prefix backend exec vitest run src/campaign/__tests__/manager.test.ts` | ✅ extend | ⬜ pending |
| 26-01-02 | 01 | 1 | P26-01 | unit/route | `npm --prefix backend exec vitest run src/worldbook-library/__tests__/manager.test.ts src/routes/__tests__/worldgen.test.ts` | ❌ W0 / ✅ extend | ⬜ pending |
| 26-02-01 | 02 | 2 | P26-02 | unit | `npm --prefix backend exec vitest run src/worldgen/__tests__/worldbook-composition.test.ts` | ❌ W0 | ⬜ pending |
| 26-02-02 | 02 | 2 | P26-03 | route | `npm --prefix backend exec vitest run src/routes/__tests__/campaigns.test.ts src/routes/__tests__/worldgen.test.ts` | ✅ extend | ⬜ pending |
| 26-03-01 | 03 | 3 | P26-04 | component/hook | `npm --prefix frontend exec vitest run components/title/__tests__/use-new-campaign-wizard.test.tsx` | ❌ W0 | ⬜ pending |
| 26-03-02 | 03 | 3 | P26-05 | component | `npm --prefix frontend exec vitest run components/title/__tests__/new-campaign-dialog.test.tsx` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/worldbook-library/__tests__/manager.test.ts` — coverage for reusable library storage and dedupe
- [ ] `backend/src/worldgen/__tests__/worldbook-composition.test.ts` — deterministic multi-source merge and provenance coverage
- [ ] `frontend/components/title/__tests__/use-new-campaign-wizard.test.tsx` — collection-state and backend-handoff coverage
- [ ] `backend/src/campaign/__tests__/manager.test.ts` — extend for `worldbookSelection[]` persistence

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mixed campaign-creation UX feels coherent with existing Create World / World DNA flow | P26-04 | Requires browser judgment across upload, selection, and copy/state transitions | Open the new campaign dialog, confirm existing library items render, upload a new WorldBook in-session, select a mixed set, then verify premise becomes optional and both Create World / Next to DNA still feel like one flow |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

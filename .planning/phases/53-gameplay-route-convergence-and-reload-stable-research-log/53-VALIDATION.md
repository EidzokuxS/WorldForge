---
phase: 53
slug: gameplay-route-convergence-and-reload-stable-research-log
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-13
---

# Phase 53 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `backend/vitest.config.ts`, `frontend/vitest.config.ts`, `shared/vitest.config.ts` |
| **Quick run command** | `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts && npm --prefix frontend exec vitest run app/game/__tests__/page.test.tsx` |
| **Full suite command** | `npm --prefix shared exec vitest run src/__tests__/chat.test.ts && npm --prefix backend exec vitest run src/campaign/__tests__/chat-history.test.ts src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts && npm --prefix frontend exec vitest run lib/__tests__/api.test.ts components/game/__tests__/narrative-log.test.tsx app/game/__tests__/page.test.tsx` |
| **Estimated runtime** | ~30 seconds quick, ~45 seconds full |

---

## Sampling Rate

- **After every backend/shared task commit:** Run `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts`
- **After every frontend task commit:** Run `npm --prefix frontend exec vitest run app/game/__tests__/page.test.tsx`
- **After every plan wave:** Run the phase-appropriate plan command below
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds on per-task smoke

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 53-01-00 | 01 | 1 | SCEN-01, WRIT-01, RES-01 | impact-analysis gate | `gitnexus_impact({ repo: "WorldForge", target: "appendChatMessages", direction: "upstream" }) + gitnexus_impact({ repo: "WorldForge", target: "getChatHistory", direction: "upstream" })` | ✅ | ⬜ pending |
| 53-01-01 | 01 | 1 | SCEN-01, WRIT-01, RES-01 | shared + backend regression | `npm --prefix shared exec vitest run src/__tests__/chat.test.ts && npm --prefix backend exec vitest run src/campaign/__tests__/chat-history.test.ts src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts` | ✅ | ⬜ pending |
| 53-01-02 | 01 | 1 | SCEN-01, WRIT-01, RES-01 | shared + backend regression | `npm --prefix shared exec vitest run src/__tests__/chat.test.ts && npm --prefix backend exec vitest run src/campaign/__tests__/chat-history.test.ts src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts` | ✅ | ⬜ pending |
| 53-02-00 | 02 | 2 | SCEN-01, WRIT-01, RES-01 | impact-analysis gate | `gitnexus_impact({ repo: "WorldForge", target: "chatHistory", direction: "upstream" }) + gitnexus_impact({ repo: "WorldForge", target: "deriveGameMessageKind", direction: "upstream" })` | ✅ | ⬜ pending |
| 53-02-01 | 02 | 2 | SCEN-01, WRIT-01, RES-01 | frontend route-matrix regression | `npm --prefix frontend exec vitest run lib/__tests__/api.test.ts components/game/__tests__/narrative-log.test.tsx app/game/__tests__/page.test.tsx` | ✅ | ⬜ pending |
| 53-02-02 | 02 | 2 | SCEN-01, WRIT-01, RES-01 | frontend route-matrix regression | `npm --prefix frontend exec vitest run lib/__tests__/api.test.ts components/game/__tests__/narrative-log.test.tsx app/game/__tests__/page.test.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Smoke Suites

| Suite | Purpose | Automated Command | Estimated Runtime |
|-------|---------|-------------------|-------------------|
| `phase-53-backend-shared-smoke` | legacy route retirement, persisted lookup/compare history, and authoritative writer-path proof | `npm --prefix shared exec vitest run src/__tests__/chat.test.ts && npm --prefix backend exec vitest run src/campaign/__tests__/chat-history.test.ts src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts` | ~24s |
| `phase-53-frontend-smoke` | reload hydration, lookup/compare rendering, and `/game` route-matrix proof | `npm --prefix frontend exec vitest run lib/__tests__/api.test.ts components/game/__tests__/narrative-log.test.tsx app/game/__tests__/page.test.tsx` | ~15s |
| `phase-53-full-smoke` | shared + backend + frontend convergence for stream plus reload behavior | `npm --prefix shared exec vitest run src/__tests__/chat.test.ts && npm --prefix backend exec vitest run src/campaign/__tests__/chat-history.test.ts src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts && npm --prefix frontend exec vitest run lib/__tests__/api.test.ts components/game/__tests__/narrative-log.test.tsx app/game/__tests__/page.test.tsx` | ~45s |

---

## Wave 0 Requirements

Wave 0 coverage is fully owned by the mapped task-level suites below; `wave_0_complete: true` means every missing proof surface is already assigned to an automated command before execution starts.

- [x] `shared/src/__tests__/chat.test.ts` — canonical lookup formatter/parser coverage including `compare`
- [x] `backend/src/routes/__tests__/chat.test.ts` — legacy `/api/chat` `410 Gone` coverage
- [x] `backend/src/routes/__tests__/chat.test.ts` — persisted lookup/history assertions for both ordinary lookup and `lookupKind: "compare"`
- [x] `backend/src/campaign/__tests__/chat-history.test.ts` — persisted factual-log append/read contract
- [x] `backend/src/engine/__tests__/turn-processor.test.ts` — authoritative narrated-turn lane proof remains in the backend route convergence surface
- [x] `frontend/app/game/__tests__/page.test.tsx` — reload hydration proof for persisted lookup/compare entries and their raw slash-command user messages
- [x] `frontend/components/game/__tests__/narrative-log.test.tsx` — persisted factual entries render as support blocks after reload

---

## Manual-Only Verifications

All Phase 53 success criteria should be closed by automated regression coverage. No manual-only phase gate is expected.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s on per-task smoke
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

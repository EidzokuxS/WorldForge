---
phase: 44
slug: gameplay-docs-baseline-alignment
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-11
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts`; `frontend/vitest.config.ts` |
| **Quick run command** | `npx vitest run backend/src/routes/__tests__/campaigns.test.ts frontend/app/game/__tests__/page.test.tsx frontend/lib/__tests__/api.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~90 seconds |

---

## Smoke Suites

| Suite | Purpose | Automated Command | Estimated Runtime |
|-------|---------|-------------------|-------------------|
| `docs-foundation-smoke` | Transport + world-surface anchors for `concept.md` and `tech_stack.md` edits | `npx vitest run backend/src/routes/__tests__/campaigns.test.ts frontend/app/game/__tests__/page.test.tsx frontend/lib/__tests__/api.test.ts` | ~20s |
| `mechanics-state-smoke` | Canonical records, Oracle targeting, and opening-state mechanics | `npx vitest run backend/src/character/__tests__/record-adapters.test.ts backend/src/routes/__tests__/character.test.ts backend/src/engine/__tests__/turn-processor.test.ts backend/src/engine/__tests__/oracle.test.ts` | ~25s |
| `mechanics-world-smoke` | Reflection, prompt context, travel/location, and world-information-flow anchors | `npx vitest run backend/src/engine/__tests__/reflection-budget.test.ts backend/src/engine/__tests__/reflection-agent.test.ts backend/src/engine/__tests__/prompt-assembler.test.ts backend/src/routes/__tests__/campaigns.test.ts frontend/app/game/__tests__/page.test.tsx` | ~30s |
| `memory-contract-smoke` | Retrieval, reflection budget, and checkpoint restore anchors for `memory.md` | `npx vitest run backend/src/engine/__tests__/prompt-assembler.test.ts backend/src/vectors/__tests__/episodic-events.test.ts backend/src/campaign/__tests__/checkpoints.test.ts backend/src/engine/__tests__/reflection-budget.test.ts backend/src/engine/__tests__/reflection-agent.test.ts` | ~30s |
| `phase-44-claim-smoke` | Fast task-level runtime guard for claim-resolution anchors: canonical state, prompt/retrieval contract, world payloads, and transport | `npx vitest run backend/src/character/__tests__/record-adapters.test.ts backend/src/engine/__tests__/prompt-assembler.test.ts backend/src/routes/__tests__/campaigns.test.ts frontend/lib/__tests__/api.test.ts` | ~20s |

---

## Sampling Rate

- **After every task commit:** Run the mapped smoke suite from the per-task table below.
- **After every plan wave:** Run `npx vitest run`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 44-01-01 | 01 | 1 | DOCA-01 | regression | `npx vitest run backend/src/routes/__tests__/campaigns.test.ts frontend/app/game/__tests__/page.test.tsx` | ✅ | ⬜ pending |
| 44-01-02 | 01 | 1 | DOCA-01 | regression | `npx vitest run frontend/lib/__tests__/api.test.ts backend/src/character/__tests__/record-adapters.test.ts backend/src/routes/__tests__/character.test.ts` | ✅ | ⬜ pending |
| 44-02-01 | 02 | 1 | DOCA-01, DOCA-02 | unit + integration | `npx vitest run backend/src/character/__tests__/record-adapters.test.ts backend/src/routes/__tests__/character.test.ts backend/src/engine/__tests__/turn-processor.test.ts backend/src/engine/__tests__/oracle.test.ts` | ✅ | ⬜ pending |
| 44-02-02 | 02 | 1 | DOCA-01, DOCA-02 | unit + integration | `npx vitest run backend/src/engine/__tests__/reflection-budget.test.ts backend/src/engine/__tests__/reflection-agent.test.ts backend/src/engine/__tests__/prompt-assembler.test.ts backend/src/routes/__tests__/campaigns.test.ts frontend/app/game/__tests__/page.test.tsx` | ✅ | ⬜ pending |
| 44-03-01 | 03 | 2 | DOCA-02, DOCA-03 | unit + integration | `npx vitest run backend/src/engine/__tests__/prompt-assembler.test.ts backend/src/vectors/__tests__/episodic-events.test.ts backend/src/campaign/__tests__/checkpoints.test.ts backend/src/engine/__tests__/reflection-budget.test.ts backend/src/engine/__tests__/reflection-agent.test.ts` | ✅ | ⬜ pending |
| 44-03-02 | 03 | 2 | DOCA-01, DOCA-03 | regression smoke | `npx vitest run backend/src/character/__tests__/record-adapters.test.ts backend/src/engine/__tests__/prompt-assembler.test.ts backend/src/routes/__tests__/campaigns.test.ts frontend/lib/__tests__/api.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Explicit deprecation/replacement notes are present for every removed or narrowed gameplay claim touched by the phase | DOCA-01 | Automated tests prove runtime truth anchors, but not prose quality or coverage across edited docs | Read changed sections in `docs/concept.md`, `docs/mechanics.md`, `docs/memory.md`, and `docs/tech_stack.md`; verify each stale claim addressed by the phase is either rewritten to live truth or marked deprecated/replaced explicitly. |
| Inventory/equipment wording stays bounded and does not pretend Phase 38 is complete | DOCA-02 | This is documentation honesty, not runtime behavior | Read every inventory/equipment-related edit and confirm it describes current bounded truth plus pending seam, not final authority language. |
| Authority hierarchy between `concept.md`, `mechanics.md`, `memory.md`, and `tech_stack.md` is explicit and non-conflicting | DOCA-03 | Requires document-level judgment across multiple files | Review cross-links and wording to confirm `concept.md` stays high-level, `mechanics.md` and `memory.md` carry normative gameplay/runtime truth, and `tech_stack.md` is reference-only. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

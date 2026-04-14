---
phase: 31
slug: prompt-system-harmonization-and-audit
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-01
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for prompt-system harmonization and audit work only.

---

## Execution Readiness

- The earlier `execution_readiness` blocker is obsolete for this phase revision.
- `.git` write access is restored and `.planning` is no longer ignored.
- Targeted Vitest runs execute successfully in this workspace again.
- Local prerequisite verification completed on 2026-04-01:
  - `npm --prefix backend exec vitest run src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/npc-offscreen.test.ts` -> passed
  - `npm --prefix backend exec vitest run src/routes/__tests__/schemas.test.ts src/character/__tests__/persona-templates.test.ts src/character/__tests__/loadout-deriver.test.ts` -> passed

This validation contract therefore focuses on the real remaining Phase 31 risk: prompt-contract regressions across backend prompt families. UI overhaul and browser E2E remain out of scope for this phase.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm --prefix backend exec vitest run src/character/__tests__/prompt-contract.test.ts src/engine/__tests__/storyteller-contract.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/bug-fixes-verification.test.ts src/character/__tests__/generator.test.ts src/character/__tests__/npc-generator.test.ts src/character/__tests__/archetype-researcher.test.ts src/worldgen/__tests__/starting-location.test.ts src/worldgen/__tests__/npcs-step.test.ts src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/lore-extractor.test.ts src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/reflection-agent.test.ts src/engine/__tests__/oracle.test.ts src/engine/__tests__/world-engine.test.ts` |
| **Full suite command** | `npm --prefix backend exec vitest run` |
| **Estimated runtime** | ~45-75 seconds targeted; longer for the full backend suite |

---

## Sampling Rate

- **After every task commit:** Run the task-specific command from the verification map below.
- **After every plan wave:** Run the quick-run command above.
- **Before `/gsd:verify-work`:** Full backend Vitest suite must be green.
- **Max feedback latency:** 75 seconds for targeted commands in this phase.
- **Scope guard:** Do not add browser E2E or UI-polish checks here; those belong to later phases.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 31-01-01 | 01 | 1 | P31-01, P31-06 | unit | `npm --prefix backend exec vitest run src/character/__tests__/prompt-contract.test.ts` | ❌ create | ⬜ pending |
| 31-01-02 | 01 | 1 | P31-01, P31-06 | unit | `npm --prefix backend exec vitest run src/engine/__tests__/storyteller-contract.test.ts` | ❌ create | ⬜ pending |
| 31-02-01 | 02 | 2 | P31-02, P31-06 | runtime prompt | `npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts` | ✅ extend | ⬜ pending |
| 31-02-02 | 02 | 2 | P31-02, P31-06 | tool regression | `npm --prefix backend exec vitest run src/engine/__tests__/bug-fixes-verification.test.ts` | ✅ extend | ⬜ pending |
| 31-03-01 | 03 | 2 | P31-03, P31-06 | character prompt | `npm --prefix backend exec vitest run src/character/__tests__/generator.test.ts` | ✅ extend | ⬜ pending |
| 31-03-02 | 03 | 2 | P31-03, P31-06 | npc+archetype prompt | `npm --prefix backend exec vitest run src/character/__tests__/npc-generator.test.ts src/character/__tests__/archetype-researcher.test.ts` | ✅ extend | ⬜ pending |
| 31-04-01 | 04 | 3 | P31-04, P31-06 | start-state prompt | `npm --prefix backend exec vitest run src/worldgen/__tests__/starting-location.test.ts` | ✅ extend | ⬜ pending |
| 31-04-02 | 04 | 3 | P31-04, P31-05, P31-06 | worldgen npc prompt | `npm --prefix backend exec vitest run src/worldgen/__tests__/npcs-step.test.ts` | ✅ extend | ⬜ pending |
| 31-05-01 | 05 | 3 | P31-05, P31-06 | worldgen helper+seed | `npm --prefix backend exec vitest run src/worldgen/__tests__/seed-suggester.test.ts` | ✅ extend | ⬜ pending |
| 31-05-02 | 05 | 3 | P31-05, P31-06 | lore prompt | `npm --prefix backend exec vitest run src/worldgen/__tests__/lore-extractor.test.ts` | ✅ extend | ⬜ pending |
| 31-06-01 | 06 | 3 | P31-05, P31-06 | npc support prompt | `npm --prefix backend exec vitest run src/engine/__tests__/npc-agent.test.ts` | ✅ extend | ⬜ pending |
| 31-06-02 | 06 | 3 | P31-05, P31-06 | reflection prompt | `npm --prefix backend exec vitest run src/engine/__tests__/reflection-agent.test.ts` | ✅ extend | ⬜ pending |
| 31-07-01 | 07 | 3 | P31-05, P31-06 | oracle prompt | `npm --prefix backend exec vitest run src/engine/__tests__/oracle.test.ts` | ✅ extend | ⬜ pending |
| 31-07-02 | 07 | 3 | P31-05, P31-06 | world-engine prompt | `npm --prefix backend exec vitest run src/engine/__tests__/world-engine.test.ts` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- No separate Wave 0 plan is required.
- The two new helper-test files are created inside Plan `31-01`, so `wave_0_complete: true` is justified for the phase-level validation contract:
  - `backend/src/character/__tests__/prompt-contract.test.ts`
  - `backend/src/engine/__tests__/storyteller-contract.test.ts`
- All other Phase 31 verification targets already exist and should be extended in place.

---

## Manual-Only Verifications

None for plan readiness. Phase 31 stays backend-only and intentionally defers browser or UI verification to later phases.

---

## Validation Sign-Off

- [x] All implementation tasks have targeted automated verification commands.
- [x] Sampling continuity: no implementation plan relies only on lint or typecheck.
- [x] The obsolete `execution_readiness` blocker is removed from this phase's validation posture.
- [x] Archetype prompt-family coverage is included in the verification map through `31-03-02`.
- [x] No watch-mode flags
- [x] No browser E2E or UI-overhaul drift in the validation contract
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

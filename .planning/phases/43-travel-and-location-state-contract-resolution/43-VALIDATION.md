---
phase: 43
slug: travel-and-location-state-contract-resolution
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-11
---

# Phase 43 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `backend/vitest.config.ts`; `frontend/vitest.config.ts` |
| **Quick run command** | `npm --prefix backend test -- src/worldgen/__tests__/scaffold-saver.test.ts src/engine/__tests__/location-graph.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/tool-executor.test.ts src/vectors/__tests__/episodic-events.test.ts src/campaign/__tests__/checkpoints.test.ts src/routes/__tests__/campaigns.test.ts src/engine/__tests__/prompt-assembler.test.ts` |
| **Full suite command** | `npm --prefix backend test -- src/worldgen/__tests__/scaffold-saver.test.ts src/engine/__tests__/location-graph.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/tool-executor.test.ts src/vectors/__tests__/episodic-events.test.ts src/campaign/__tests__/checkpoints.test.ts src/routes/__tests__/campaigns.test.ts src/engine/__tests__/prompt-assembler.test.ts && npm --prefix frontend exec vitest run lib/__tests__/world-data-helpers.test.ts app/game/__tests__/page.test.tsx components/game/__tests__/location-panel.test.tsx` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run the narrowest command from the Per-Task Verification Map.
- **After every plan wave:** Run the combined command for the just-finished wave; at the phase gate run the full suite command above.
- **Before `$gsd-verify-work`:** backend phase-targeted suite and relevant frontend rendering tests must be green.
- **Max feedback latency:** ~30 seconds per task sample, ~120 seconds at wave/phase gates.
- **Review-driven additions:** Phase 43 verification now explicitly samples migration/worldgen compatibility (`scaffold-saver`), shared tool/inline movement resolution (`tool-executor`), travel-turn pipeline composition in `turn-processor` (travel cost replaces normal end-of-turn `+1`, Oracle/Storyteller still run once, post-turn simulation observes the resulting boundary), and checkpoint restore retention for location recent happenings (`checkpoints.test.ts`).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 43-01-01 | 01 | 1 | GSEM-03, GSEM-04 | contract+migration | `npm --prefix backend exec vitest run src/worldgen/__tests__/scaffold-saver.test.ts` | ✅ existing | ⬜ pending |
| 43-01-02 | 01 | 1 | GSEM-03, GSEM-04 | regression | `npm --prefix backend test -- src/engine/__tests__/location-graph.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/npc-agent.test.ts src/routes/__tests__/campaigns.test.ts src/engine/__tests__/prompt-assembler.test.ts` | ✅ existing+new | ⬜ pending |
| 43-02-01 | 02 | 2 | GSEM-03 | unit | `npm --prefix backend exec vitest run src/engine/__tests__/location-graph.test.ts` | ✅ existing | ⬜ pending |
| 43-02-02 | 02 | 2 | GSEM-03 | integration | `npm --prefix backend test -- src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/tool-executor.test.ts` | ✅ existing | ⬜ pending |
| 43-03-01 | 03 | 3 | GSEM-04 | unit | `npm --prefix backend exec vitest run src/vectors/__tests__/episodic-events.test.ts src/engine/__tests__/tool-executor.test.ts` | ✅ existing+new | ⬜ pending |
| 43-03-02 | 03 | 3 | GSEM-04 | integration+restore | `npm --prefix backend exec vitest run src/vectors/__tests__/episodic-events.test.ts src/engine/__tests__/tool-executor.test.ts src/campaign/__tests__/checkpoints.test.ts` | ✅ existing+new | ⬜ pending |
| 43-04-01 | 04 | 4 | GSEM-04 | route | `npm --prefix backend test -- src/routes/__tests__/campaigns.test.ts` | ✅ existing | ⬜ pending |
| 43-04-02 | 04 | 4 | GSEM-04 | prompt | `npm --prefix backend test -- src/engine/__tests__/prompt-assembler.test.ts` | ✅ existing | ⬜ pending |
| 43-05-01 | 05 | 5 | GSEM-03, GSEM-04 | frontend-unit | `npm --prefix frontend exec vitest run lib/__tests__/world-data-helpers.test.ts` | ✅ existing | ⬜ pending |
| 43-05-02 | 05 | 5 | GSEM-03, GSEM-04 | frontend-component | `npm --prefix frontend exec vitest run app/game/__tests__/page.test.tsx components/game/__tests__/location-panel.test.tsx` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No dedicated Wave 0 is required after revision. Every task now has an explicit `<automated>` verifier in its plan, and the map above traces the full 5-plan, 10-task execution graph directly.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Major-location travel feels path-bound instead of teleport-like | GSEM-03 | Needs live gameplay confirmation of player-visible travel semantics | In a campaign with at least one macro location and intermediate nodes, attempt travel between major places. Confirm the UI and resulting state show intermediate graph cost/time semantics instead of an instant large jump. |
| Revisit exposes honest local recent happenings | GSEM-04 | Requires end-to-end world interaction and revisit flow | Trigger notable events in a location, leave, then revisit or inspect it. Confirm the location surface reflects location-local recent happenings rather than only global chronicle text. |
| Ephemeral scene cleanup preserves consequences | GSEM-03, GSEM-04 | Needs live lifecycle validation beyond unit seams | Enter a temporary scene-born location, resolve the scene, and confirm the node can expire/archive while moved entities, event consequences, and remembered history remain coherent. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all missing references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

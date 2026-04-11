---
phase: 42
slug: targeted-oracle-and-start-condition-runtime-effects
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 42 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm --prefix backend exec vitest run src/engine/__tests__/oracle.test.ts src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/character.test.ts src/character/__tests__/loadout-deriver.test.ts` |
| **Full suite command** | `npm --prefix backend test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run the narrowest command from the Per-Task Verification Map.
- **After every plan wave:** Run `npm --prefix backend exec vitest run src/engine/__tests__/oracle.test.ts src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/character.test.ts src/character/__tests__/loadout-deriver.test.ts`
- **Before `$gsd-verify-work`:** backend phase-targeted suite must be green
- **Max feedback latency:** ~20 seconds per task sample, ~60 seconds at wave/phase gates

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 42-01-01 | 01 | 1 | GSEM-01 | integration | `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.test.ts -t "target-aware oracle" src/engine/__tests__/oracle.test.ts` | ❌ W0 | ⬜ pending |
| 42-01-02 | 01 | 1 | GSEM-01 | integration | `npm --prefix backend exec vitest run src/engine/__tests__/oracle.test.ts src/engine/__tests__/turn-processor.test.ts` | ✅ | ⬜ pending |
| 42-02-01 | 02 | 2 | GSEM-02 | integration | `npm --prefix backend exec vitest run src/routes/__tests__/character.test.ts -t "start conditions" src/character/__tests__/loadout-deriver.test.ts -t "arrival"` | ✅ | ⬜ pending |
| 42-02-02 | 02 | 2 | GSEM-02 | integration | `npm --prefix backend exec vitest run src/routes/__tests__/character.test.ts src/character/__tests__/loadout-deriver.test.ts src/engine/__tests__/turn-processor.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/engine/__tests__/turn-processor.test.ts` — add player-target Oracle coverage for supported and unsupported targets
- [ ] `backend/src/engine/__tests__/oracle.test.ts` — add or preserve contract coverage around `targetTags`
- [ ] `backend/src/routes/__tests__/character.test.ts` — add start-condition persistence/effect assertions if new save/runtime fields are introduced
- [ ] `backend/src/character/__tests__/loadout-deriver.test.ts` — preserve existing start-condition-derived mechanics while Phase 42 expands early-game effects

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Aimed action differs from untargeted action | GSEM-01 | Needs live gameplay judgment rather than only unit assertions | In a live campaign, submit one action with a clear supported target and a comparable untargeted variant. Confirm Oracle reasoning/odds differ because target context was resolved. |
| Opening-state mechanics survive restore | GSEM-02 | Needs end-to-end save/reload/retry/checkpoint proof | Start a campaign with non-default start conditions, enter gameplay, verify opening restrictions/modifiers are live, then reload/retry or load a checkpoint and confirm those mechanics remain. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all missing references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

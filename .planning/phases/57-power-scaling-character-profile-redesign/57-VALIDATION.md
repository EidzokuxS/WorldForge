---
phase: 57
slug: power-scaling-character-profile-redesign
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-15
---

# Phase 57 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `backend/vitest.config.ts`, `frontend/vitest.config.ts` |
| **Quick run command** | `npm --prefix backend exec vitest run --reporter=verbose` |
| **Full suite command** | `npm --prefix backend exec vitest run && npm --prefix frontend exec vitest run` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run affected test files
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green + typecheck
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 57-01-01 | 01 | 1 | SC-1 (power stats types) | unit | `vitest run shared/` | ✅ | ⬜ pending |
| 57-01-02 | 01 | 1 | SC-4 (old types removed) | unit | `tsc --noEmit` | ✅ | ⬜ pending |
| 57-02-01 | 02 | 1 | SC-1 (known-IP research) | unit | `vitest run src/character/__tests__/known-ip-worldgen-research.test.ts` | ✅ | ⬜ pending |
| 57-02-02 | 02 | 1 | SC-2 (hax structured) | unit | `vitest run src/character/__tests__/` | ✅ | ⬜ pending |
| 57-03-01 | 03 | 2 | SC-5 (grounded-lookup) | unit | `vitest run src/engine/__tests__/grounded-lookup.test.ts` | ✅ | ⬜ pending |
| 57-03-02 | 03 | 2 | SC-6 (NPC agent no continuity) | unit | `vitest run src/engine/__tests__/npc-agent.test.ts` | ✅ | ⬜ pending |
| 57-04-01 | 04 | 3 | SC-7 (frontend card) | unit | `vitest run components/world-review/__tests__/` | ✅ | ⬜ pending |
| 57-04-02 | 04 | 3 | SC-3 (no duplication) | manual | Visual inspection of NPC card | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. No new test framework or fixtures needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| NPC card readability | SC-3, SC-7 | Visual/UX quality | Open world review, inspect key NPC card — no duplicate text, power stats visible, hax listed |
| Power comparison sensible | SC-5 | Output quality | In gameplay, ask "compare X vs Y" — response should reference tier+rank data |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

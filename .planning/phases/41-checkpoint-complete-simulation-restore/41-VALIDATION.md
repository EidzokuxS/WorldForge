---
phase: 41
slug: checkpoint-complete-simulation-restore
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm --prefix backend exec vitest run src/campaign/__tests__/checkpoints.test.ts src/engine/__tests__/state-snapshot.test.ts src/routes/__tests__/chat.test.ts src/vectors/__tests__/episodic-events.test.ts` |
| **Full suite command** | `npm --prefix backend test` |
| **Estimated runtime** | ~50 seconds |

---

## Sampling Rate

- **After every task commit:** Run only the narrow command for the task you just changed from the Per-Task Verification Map below.
- **After every plan wave:** Run `npm --prefix backend exec vitest run src/campaign/__tests__/checkpoints.test.ts src/engine/__tests__/state-snapshot.test.ts src/routes/__tests__/chat.test.ts src/vectors/__tests__/episodic-events.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~20 seconds per task sample, ~50 seconds at wave/phase gates

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 41-01-01 | 01 | 1 | RINT-03 | integration | `npm --prefix backend exec vitest run src/campaign/__tests__/checkpoints.test.ts -t "config-inclusive checkpoint bundle" src/engine/__tests__/state-snapshot.test.ts -t "shared restore semantics"` | ❌ W0 | ⬜ pending |
| 41-01-02 | 01 | 1 | RINT-03 | integration | `npm --prefix backend exec vitest run src/campaign/__tests__/checkpoints.test.ts src/engine/__tests__/state-snapshot.test.ts` | ✅ | ⬜ pending |
| 41-02-01 | 02 | 2 | RINT-03 / SIMF-03 | integration | `npm --prefix backend exec vitest run src/campaign/__tests__/checkpoints.test.ts -t "clears discarded timeline runtime state" src/routes/__tests__/chat.test.ts -t "hasLiveTurnSnapshot"` | ❌ W0 | ⬜ pending |
| 41-02-02 | 02 | 2 | SIMF-03 | integration | `npm --prefix backend exec vitest run src/campaign/__tests__/checkpoints.test.ts src/routes/__tests__/chat.test.ts src/vectors/__tests__/episodic-events.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/campaign/__tests__/checkpoints.test.ts` — add config-inclusive checkpoint round-trip coverage and restore-time runtime invalidation assertions
- [ ] `backend/src/engine/__tests__/state-snapshot.test.ts` — add shared restore-helper coverage proving vectors stay excluded for Phase 39 rollback
- [ ] `backend/src/routes/__tests__/chat.test.ts` — add stale live-turn snapshot/history regression after checkpoint restore
- [ ] `backend/src/vectors/__tests__/episodic-events.test.ts` — add campaign-scoped pending-evidence queue clear coverage

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Checkpoint restore preserves live gameplay continuity | RINT-03 / SIMF-03 | Requires a full gameplay loop with saved checkpoint, divergent turns, and restore across route/UI boundaries | In a live campaign, create a checkpoint, take several turns that change tick, NPC/reflection state, and retrieval context, load the checkpoint, then confirm subsequent play reflects the restored timeline rather than the discarded branch. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 50s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

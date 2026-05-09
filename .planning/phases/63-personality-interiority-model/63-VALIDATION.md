---
phase: 63
slug: personality-interiority-model
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-18
---

# Phase 63 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 63-RESEARCH.md Section 10 (Validation Architecture).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x (backend) + Vitest (frontend, per Phase 62 alias fix) |
| **Config file** | `backend/vitest.config.ts`, `frontend/vitest.config.ts` |
| **Quick run command (backend)** | `npm --prefix backend test -- run <pattern>` |
| **Quick run command (frontend)** | `npm --prefix frontend test -- run <pattern>` |
| **Full suite command** | `npm --prefix backend test -- run && npm --prefix frontend test -- run` |
| **Estimated runtime** | ~3-4 min combined |

---

## Sampling Rate

- **After every task commit:** Run `npm --prefix backend test -- run <affected-test>` — sub-10s per file
- **After every plan wave:** Run full backend + frontend suites
- **Before `/gsd:verify-work`:** Full suite green + manual PinchTab smoke on basic NPC card rendering
- **Max feedback latency:** 240 seconds

---

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| P63-R1 | `personality` block populated on every ingested draft | integration | `backend test -- run synthesizer.personality` | ❌ Wave 0 | ⬜ pending |
| P63-R2 | Prompt assembler emits `Personality:` block (replaces behavioralCore motives/taboos/pressureResponses) | unit snapshot | `backend test -- run prompt-assembler.personality` | ❌ Wave 0 | ⬜ pending |
| P63-R3 | V2 `mes_example` parsed → `sampleLines` (≤3, prefer >20 chars, `{{char}}` only) | unit | `backend test -- run mes-example-parser` | ❌ Wave 0 | ⬜ pending |
| P63-R4 | Basic NPC card renders `PERSONALITY` section with summary + voice + collapsibles | RTL | `frontend test -- run personality-section` | ❌ Wave 0 | ⬜ pending |
| P63-R5 | Advanced inspector drops motives/taboos/pressure/traits/flaws/legacyTags + Provenance section | RTL | `frontend test -- run character-record-inspector` | ✅ Update | ⬜ pending |
| P63-R6 | Backfill script idempotent (skips records with `personality.summary`) + writes backup file before update | integration | `backend test -- run backfill-personality` | ❌ Wave 0 | ⬜ pending |
| P63-R7 | Zod schema accepts `personality`; legacy fields `.optional()` for backward read | unit | `backend test -- run schemas.personality` | ❌ Wave 0 | ⬜ pending |
| P63-R8 | NPC-agent / npc-offscreen / reflection-agent prompts consume `personality` (not legacy fields) | unit snapshot | `backend test -- run npc-agent.personality` + `npc-offscreen.personality` + `reflection-agent.personality` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/character/ingestion/__tests__/mes-example-parser.test.ts` — covers P63-R3
- [ ] `backend/src/engine/__tests__/prompt-assembler.personality.test.ts` — covers P63-R2
- [ ] `backend/src/character/ingestion/__tests__/synthesizer.personality.test.ts` — covers P63-R1
- [ ] `backend/src/scripts/__tests__/backfill-personality.test.ts` — covers P63-R6
- [ ] `backend/src/scripts/` directory — does not exist; create with first commit (Plan 63-01)
- [ ] `frontend/components/world-review/__tests__/personality-section.test.tsx` — covers P63-R4
- [ ] `backend/src/routes/__tests__/schemas.personality.test.ts` — covers P63-R7
- [ ] `backend/src/engine/__tests__/npc-agent.personality.test.ts` + `npc-offscreen.personality.test.ts` + `reflection-agent.personality.test.ts` — covers P63-R8

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| LLM narrative quality differs with personality block vs. without | (qualitative) | LLM evaluation, no oracle | One PinchTab session: load existing campaign post-backfill, send 5 player actions, sample storyteller responses for voice consistency vs. `personality.voice`. Document in 63-SUMMARY.md. |
| Real-world V2 card import populates sampleLines | P63-R3 supplement | Edge cases in wild card formats | Import 3 community V2 cards (varied formats) via UI; assert `sampleLines.length >= 1` in saved record. |
| Backfill script run on real campaign | P63-R6 supplement | One-shot operator tool | `tsx backend/src/scripts/backfill-personality.ts --campaign <id> --dry-run` then real run; verify backup file written + record updated. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify command OR Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (8 new test files + scripts/ dir)
- [ ] No watch-mode flags in CI commands
- [ ] Feedback latency < 240s
- [ ] `nyquist_compliant: true` set in frontmatter after planner approval

**Approval:** pending

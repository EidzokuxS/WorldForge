---
phase: 60
slug: character-ingestion-backend-pipeline
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-17
approved: 2026-04-17
---

# Phase 60 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | backend/vitest.config.ts |
| Quick run command | `npm --prefix backend test -- src/character/ingestion/ --run` |
| Full suite command | `npm --prefix backend test --run` |
| Typecheck command | `npm --prefix backend run typecheck` |
| Estimated runtime | ~45 seconds (ingestion subset); ~90 seconds (full backend) |

## Sampling Rate

- After every task commit: `npm --prefix backend test -- <test_path> --run` (task-specific)
- After every plan wave: `npm --prefix backend test -- src/character/ingestion/ src/routes/__tests__/character.test.ts --run` + `npm --prefix backend run typecheck`
- Before `/gsd:verify-work`: full backend suite green + typecheck ≤ 38 (Phase 59 baseline)
- Max feedback latency: 60 seconds

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 60-01-00 | 01 | 1 | P60-R1..R9 (docs) | doc | `grep -q "P60-R1" .planning/REQUIREMENTS.md` | ❌ W0 | ⬜ pending |
| 60-01-01 | 01 | 1 | P60-R8 | typecheck | `npm --prefix backend run typecheck` | ✅ existing | ⬜ pending |
| 60-01-02 | 01 | 1 | P60-R2 | unit | `npm --prefix backend test -- src/character/ingestion/__tests__/extractor.test.ts --run` | ❌ W0 | ⬜ pending |
| 60-01-03 | 01 | 1 | P60-R3 | unit | `npm --prefix backend test -- src/character/ingestion/__tests__/classifier.test.ts --run` | ❌ W0 | ⬜ pending |
| 60-02-01 | 02 | 2 | P60-R4 | typecheck | `npm --prefix backend run typecheck` | ✅ existing | ⬜ pending |
| 60-02-02 | 02 | 2 | P60-R4 | unit | `npm --prefix backend test -- src/character/ingestion/__tests__/synthesizer.test.ts --run` | ❌ W0 | ⬜ pending |
| 60-03-01 | 03 | 3 | P60-R5 + 8 exports | unit | `npm --prefix backend test -- src/worldgen/scaffold-steps/ --run` + typecheck | ✅ existing | ⬜ pending |
| 60-03-02 | 03 | 3 | P60-R6 | unit | `npm --prefix backend test -- src/character/ingestion/__tests__/assess-original.test.ts --run` | ❌ W0 | ⬜ pending |
| 60-03-03 | 03 | 3 | P60-R5, R7 | unit | `npm --prefix backend test -- src/character/ingestion/__tests__/power-assessor.test.ts --run` | ❌ W0 | ⬜ pending |
| 60-04-01 | 04 | 4 | P60-R1, R7, R8 | unit | `npm --prefix backend test -- src/character/ingestion/__tests__/pipeline.test.ts --run` | ❌ W0 | ⬜ pending |
| 60-04-02 | 04 | 4 | P60-R1 | typecheck | `npm --prefix backend run typecheck` | ✅ existing | ⬜ pending |
| 60-04-03 | 04 | 4 | P60-R2 (deletions) | grep | `grep -rn "mapV2CardToCharacter\|mapV2CardToNpc\|synthesizeArchetypePowerStats" backend/src --include='*.ts' | grep -v .test.ts | wc -l` returns 0 | ✅ existing | ⬜ pending |
| 60-04-04 | 04 | 4 | P60-R9 | integration | `npm --prefix backend test -- src/routes/__tests__/character.test.ts --run` | ✅ existing (extend) | ⬜ pending |

Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky

## Wave 0 Requirements

- [x] `.planning/REQUIREMENTS.md` — Phase 60 block (Task 60-01-00)
- [x] `.planning/ROADMAP.md` — Phase 60 Requirements line (Task 60-01-00)
- [x] `60-VALIDATION.md` — this file populated (Task 60-01-00)
- [ ] `backend/src/character/ingestion/__tests__/extractor.test.ts` — P60-R2 (Task 60-01-02)
- [ ] `backend/src/character/ingestion/__tests__/classifier.test.ts` — P60-R3 (Task 60-01-03)
- [ ] `backend/src/character/ingestion/__tests__/synthesizer.test.ts` — P60-R4 (Task 60-02-02)
- [ ] `backend/src/character/ingestion/__tests__/assess-original.test.ts` — P60-R6 (Task 60-03-02)
- [ ] `backend/src/character/ingestion/__tests__/power-assessor.test.ts` — P60-R5, R7 (Task 60-03-03)
- [ ] `backend/src/character/ingestion/__tests__/pipeline.test.ts` — P60-R1, R8 (Task 60-04-01)
- [ ] Fixtures: v2-gojo.json, v2-original-rogue.json, canon-digest.txt, draft-gojo.json, draft-rogue.json

Framework install: not required — Vitest is already present.

## Manual-Only Verifications

All phase behaviors have automated verification. No manual steps.

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

Approval: approved 2026-04-17

---
phase: 64
slug: npc-personality-regeneration-parity
tags: [backend, worldgen, personality, regenerate-section, backfill, gitnexus, verification]
one_liner: "Phase 64 closed the worldgen/regenerate personality parity gap: scaffold generation, regenerate-section, and targeted legacy backfill now preserve the full seven-field `identity.personality` pack without regressing Phase 63 engine consumers."
dependency_graph:
  requires:
    - "Phase 63: structured `CharacterPersonality` contract across ingestion, engine prompts, reflection, and UI consumers."
    - "Phase 64 plans 01-04: shared helper extraction, worldgen repair, real-step route proof, and narrow incomplete-pack backfill mode."
  provides:
    - "Full structured personality output for worldgen NPCs and `/api/worldgen/regenerate-section`."
    - "Opt-in `--mode=incomplete-pack` repair path for legacy summary-only personality records."
    - "Backend-only verification evidence proving Phase 64 does not regress Phase 63 engine personality consumers."
  affects:
    - "worldgen scaffold generation"
    - "worldgen regenerate-section"
    - "personality backfill operator workflow"
    - "Phase 64 verification and future closeout baselines"
metrics:
  completed_date: "2026-04-19"
  plan_count: 5
  source_files_changed: 8
  backend_test_files_passed: 118
  backend_tests_passed: 1513
---

# Phase 64 — NPC Personality Regeneration Parity

## Overview

Phase 64 closes the remaining Phase 63 parity gap on the worldgen side. Newly generated NPCs now keep the full structured `identity.personality` payload instead of collapsing back to `summary`-only output, the regenerate-section HTTP path is proven against the real `generateNpcsStep` implementation, and operators have an opt-in `--mode=incomplete-pack` repair path for already-persisted summary-only records. The engine-side personality consumers from Phase 63 remained untouched and still pass their original regressions unchanged.

## Plan Evidence

| Plan | Outcome | Evidence |
|------|---------|----------|
| 64-01 | Shared flat personality schema + typed mapper extracted | [64-01-SUMMARY.md](./64-01-SUMMARY.md) |
| 64-02 | worldgen `npcs-step.ts` emits full personality, retries degenerate sample lines once, `npc-generator.ts` switched to the shared helper | [64-02-SUMMARY.md](./64-02-SUMMARY.md) |
| 64-03 | `/api/worldgen/regenerate-section` now has a real-step integration proof that mocks only the LLM seam | [64-03-SUMMARY.md](./64-03-SUMMARY.md) |
| 64-04 | `backfill-personality.ts --mode=incomplete-pack` repairs the legacy summary-only signature without sweeping valid sparse NPCs | [64-04-SUMMARY.md](./64-04-SUMMARY.md) |
| 64-05 | Backend-only verification gate, validation closeout, roadmap/requirements closure | [64-VALIDATION.md](./64-VALIDATION.md) |

## Plan 05 Task Commits

- `664299a` — `docs(64-05): add phase 64 validation evidence`
- `347e031` — `docs(64-05): close roadmap and requirements`

## Requirements Closed

| Requirement | How it was closed | Evidence |
|-------------|-------------------|----------|
| P64-R1 | `generateNpcsStep` now writes the full nested personality pack for worldgen NPC drafts | [64-02-SUMMARY.md](./64-02-SUMMARY.md) |
| P64-R2 | Shared `personality-schema.ts` exports the flat Zod fragment and typed flat-to-nested mapper | [64-01-SUMMARY.md](./64-01-SUMMARY.md) |
| P64-R3 | Personality overwrite is applied after `fromLegacyScaffoldNpc` returns | [64-02-SUMMARY.md](./64-02-SUMMARY.md) |
| P64-R4 | Empty/generic/identical sample lines trigger one bounded repair call with safe fallback to primary detail | [64-02-SUMMARY.md](./64-02-SUMMARY.md) |
| P64-R5 | `/api/worldgen/regenerate-section` returns the full nested personality block through the real runtime path | [64-03-SUMMARY.md](./64-03-SUMMARY.md) |
| P64-R6 | `--mode=incomplete-pack` targets only the legacy summary-only signature and preserves Phase 63 safety guards | [64-04-SUMMARY.md](./64-04-SUMMARY.md) |
| P64-R7 | Full backend suite and backend typecheck are green | This summary, Verification Evidence |
| P64-R8 | All four Phase 63 engine personality regression files still pass unchanged | This summary, Verification Evidence |

## Verification Evidence

### Backend full suite

```text
backend> npm test
Test Files  118 passed | 3 skipped (121)
Tests       1513 passed | 30 todo (1543)
Duration    7.26s
```

### Backend typecheck

```text
npm --prefix backend run typecheck
> tsc --noEmit
exit 0
```

### Phase 63 engine personality regressions

```text
npm --prefix backend test -- run "prompt-assembler.personality"
Test Files  2 passed (2)
Tests       13 passed (13)

npm --prefix backend test -- run "npc-agent.personality"
Test Files  2 passed (2)
Tests       11 passed (11)

npm --prefix backend test -- run "npc-offscreen.personality"
Test Files  2 passed (2)
Tests       10 passed (10)

npm --prefix backend test -- run "reflection-agent.personality"
Test Files  2 passed (2)
Tests       12 passed (12)
```

### Engine scope remained untouched in Phase 64

```text
git log --since="2026-04-19 00:00" --oneline -- backend/src/engine/prompt-assembler.ts backend/src/engine/npc-agent.ts backend/src/engine/npc-offscreen.ts backend/src/engine/reflection-agent.ts
(no output)

git diff --name-only -- backend/src/engine/prompt-assembler.ts backend/src/engine/npc-agent.ts backend/src/engine/npc-offscreen.ts backend/src/engine/reflection-agent.ts
(no output)
```

## Scope Notes

- The authoritative committed Phase 64 diff against the pre-phase base commit `aed2d7d31c08649d4e4aea2e31d4c2de58839047` contains the expected source set:
  - `backend/src/character/personality-schema.ts`
  - `backend/src/character/__tests__/personality-schema.test.ts`
  - `backend/src/worldgen/scaffold-steps/npcs-step.ts`
  - `backend/src/worldgen/__tests__/npcs-step.test.ts`
  - `backend/src/character/npc-generator.ts`
  - `backend/src/routes/__tests__/worldgen.test.ts`
  - `backend/src/scripts/backfill-personality.ts`
  - `backend/src/scripts/__tests__/backfill-personality.test.ts`
- The same commit-range diff also includes the expected plan-closeout docs already created by Plans 64-01..64-04: `64-01-SUMMARY.md`, `64-02-SUMMARY.md`, `64-03-SUMMARY.md`, `64-04-SUMMARY.md`, plus `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, and `deferred-items.md`.
- Compare-mode `gitnexus_detect_changes` on the dirty main workspace over-reported additional symbols from unrelated local changes (`backend/src/character/record-adapters.ts` in particular). The trustworthy scope proof for this phase remains the staged GitNexus checks captured in the per-plan summaries plus the commit-range file diff above.

## Review Feedback Addressed

| Concern | Severity | Resolution |
|---------|----------|------------|
| B1 mapper-order contradiction in 64-02 | HIGH | Canonicalized to overwrite personality after `fromLegacyScaffoldNpc` returns |
| B2 64-03 was not a real integration test | HIGH | Rewrote the route proof to unmock `generateNpcsStep` and mock only `safeGenerateObject` |
| B3 64-03 carried a negative assertion tolerating broken state | HIGH | Removed; the real-step test now fails on any incomplete pack |
| B4 64-04 predicate was too broad | HIGH | Tightened to the legacy summary-only signature and explicitly excluded `sampleLines` / `internalContradictions` |
| B5 64-05 verification scope was self-contradictory | HIGH | Locked P64-R7 to a binary backend-only gate |
| B6 64-05 draft metadata omitted actual doc writes | HIGH | Final closeout includes roadmap, requirements, validation, summary, and state updates |
| B7 64-05 cited a non-existent regression target | HIGH | Closed against the 4 real test files present in `backend/src/engine/__tests__/` |
| Q1 pre-edit GitNexus impact checks | MEDIUM | Added and documented in Plans 64-02 and 64-04 |
| Q2 key-tier + `ipContext` parity path | MEDIUM | Covered in the extended `npcs-step.test.ts` suite |
| Q3 all-identical and retry-failure branches | MEDIUM | Covered in the retry heuristic tests |
| Q4 64-02 scope overload | MEDIUM | `npc-generator.ts` migration was kept as a separate mechanical task |
| L1 stale frontend-test warning in 64-05 draft | LOW | Removed; frontend verification is out of scope for Phase 64 |

## Operator Runbook

Preview repair for pre-Phase-64 summary-only NPCs:

```text
npm --prefix backend run backfill:personality -- --mode incomplete-pack --campaign <id> --dry-run
```

Apply it after reviewing the dry run:

```text
npm --prefix backend run backfill:personality -- --mode incomplete-pack --campaign <id>
```

## Manual Follow-Ups

- Sample-line voice quality inspection remains optional human review.
- PinchTab regenerate-section UX smoke remains deferred per D-16 and is not part of the binary Phase 64 exit gate.

## Self-Check: PASSED

- Verified the phase-closeout artifacts exist on disk: `64-SUMMARY.md`, `64-VALIDATION.md`, and all four prior plan summaries.
- Verified the plan-closeout commits exist in git history: `664299a`, `347e031`, `7afdd42`, `ed0ece7`, `616b6f6`, `c6e96e5`.
- Verified the backend-wide suite, backend typecheck, and the four unchanged Phase 63 engine personality regressions are all green.

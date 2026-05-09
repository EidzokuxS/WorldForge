---
phase: 69
slug: judge-owned-hidden-pass-migration-and-narrator-only-runtime
status: complete
nyquist_compliant: true
wave_1_complete: true
wave_2_complete: true
wave_3_complete: true
wave_4_complete: true
created: 2026-04-20
updated: 2026-04-20
verified_on: 2026-04-20
---

# Phase 69 - Validation Strategy

> Verification gate for the hidden-pass ownership migration that moves normal player-turn adjudication out of storyteller tool-driving and into judge-owned structured planning plus deterministic backend execution.

Scope follows [69-04-PLAN.md](/R:/Projects/WorldForge/.planning/phases/69-judge-owned-hidden-pass-migration-and-narrator-only-runtime/69-04-PLAN.md). This phase is backend-only. No frontend changes, DB schema changes, route/SSE redesign, Oracle chance math rewrite, NPC-agent migration, offscreen migration, or reflection migration landed here.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x (`backend`) |
| **Focused commands** | `npx vitest run src/engine/__tests__/hidden-adjudication.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/turn-processor.inventory-authority.test.ts src/engine/__tests__/turn-processor.observability.test.ts` |
| **Primary binary gate** | `npm --prefix backend test` |
| **Typecheck** | `npm --prefix backend run typecheck` |
| **Scope note** | Worktree contains unrelated pre-existing dirty files outside Phase 69. Phase 69 implementation itself stayed inside `backend/src/engine`, engine tests, and planning artifacts. |
| **Observability proof** | Route-level mocked engine seam now emits compact `judge.hidden.plan` and `judge.hidden.execution` events on the migrated path. |

## Per-Task Verification Map

| Task ID | Requirement | Command / Evidence | Status |
|---------|-------------|--------------------|--------|
| 69-01-01 | P69-R1, P69-R3 | `npx vitest run src/engine/__tests__/hidden-adjudication.test.ts` | green |
| 69-02-01 | P69-R2, P69-R3, P69-R4 | `npx vitest run src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/turn-processor.inventory-authority.test.ts` | green |
| 69-03-01 | P69-R4, P69-R5, P69-R6 | `npx vitest run src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts` | green |
| 69-04-01 | P69-R7, P69-R8 | `npx vitest run src/engine/__tests__/turn-processor.observability.test.ts` | green |
| 69-04-02 | P69-R8, P69-R9 | focused Phase 69 regression bundle | green |
| 69-04-02 | P69-R9 | `npm --prefix backend run typecheck` | green |
| 69-04-02 | P69-R9 | `npm --prefix backend test` | green |
| 69-04-03 | P69-R9 | `69-SUMMARY.md` written | complete |

## Command Results

### Focused Phase 69 Regressions

- Command:

```text
npx vitest run src/engine/__tests__/hidden-adjudication.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/turn-processor.inventory-authority.test.ts src/engine/__tests__/turn-processor.observability.test.ts
```

- Result: exit `0`
- Evidence: `Test Files 5 passed (5)` and `Tests 90 passed (90)`

This focused gate proves:
- bounded `AdjudicationPlan` parsing and caps
- judge role/model ownership for the hidden adjudication seam
- deterministic backend execution of ordered hidden actions
- structural turn-event parity on the migrated player-turn path
- prompt separation between hidden judge adjudication and final-visible storyteller narration
- opening scenes remain on the Phase 68 narrator-only path
- observability records the new hidden authority seam without dumping raw hidden reasoning

### Backend Typecheck

- Command: `npm --prefix backend run typecheck`
- Result: exit `0`

### Backend Full Suite

- Command: `npm --prefix backend test`
- Result: exit `0`
- Evidence: `Test Files 126 passed | 3 skipped (129)` and `Tests 1587 passed | 30 todo (1617)`

## Scope Gate

### In-Scope Files

- `backend/src/engine/tool-schemas.ts`
- `backend/src/engine/hidden-adjudication.ts`
- `backend/src/engine/prompt-assembler.ts`
- `backend/src/engine/turn-processor.ts`
- backend engine tests covering the new judge-owned seam

### Out-of-Scope Guarantees

Phase 69 intentionally did **not**:
- redesign routes or SSE transport
- change DB schema or persistence contracts
- rewrite Oracle probability math
- widen the opening-scene path beyond Phase 68
- migrate `npc-agent.ts`, `npc-offscreen.ts`, `reflection-agent.ts`, or runtime tags
- touch frontend code

There are unrelated dirty files elsewhere in the worktree from previous work. Treat staged-only change detection as authoritative before the Phase 69 commit.

## Reviewer Risk Note

Gemini's post-implementation sanity check called out the main remaining risk correctly:
- hidden judge state and visible storyteller prose can still drift if narrator-facing scene assembly stops matching executed hidden actions

Phase 69 addresses that risk by:
- keeping the judge on structured hidden planning only
- executing every hidden action through the existing deterministic backend executor
- feeding visible narration from settled authoritative scene state instead of judge rationale
- locking focused turn-processor and observability regressions on the new seam

That risk remains a runtime quality concern for future playtesting, but it is no longer an ownership-boundary ambiguity inside the implementation delivered here.

## Requirement Sign-Off

- [x] **P69-R1**: bounded `AdjudicationPlan` contract exists in [hidden-adjudication.ts](/R:/Projects/WorldForge/backend/src/engine/hidden-adjudication.ts) and reuses shared runtime tool input schemas from [tool-schemas.ts](/R:/Projects/WorldForge/backend/src/engine/tool-schemas.ts)
- [x] **P69-R2**: [processTurn(...)](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts) now generates a judge-owned adjudication plan after Oracle plus Phase 68 world-brain direction and before any hidden state mutation
- [x] **P69-R3**: ordered hidden execution runs deterministically through backend executor helpers in [hidden-adjudication.ts](/R:/Projects/WorldForge/backend/src/engine/hidden-adjudication.ts), preserving turn events and aborting loudly on failure
- [x] **P69-R4**: the default normal player-turn runtime no longer binds tools to storyteller hidden passes in [turn-processor.ts](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts)
- [x] **P69-R5**: final visible narration remains storyteller-only prose sourced from settled authoritative scene state in [turn-processor.ts](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts) and [prompt-assembler.ts](/R:/Projects/WorldForge/backend/src/engine/prompt-assembler.ts)
- [x] **P69-R6**: opening scenes remain on the Phase 68 path with no new hidden adjudication pass
- [x] **P69-R7**: compact `judge.hidden.plan` and `judge.hidden.execution` observability exists without dumping raw hidden reasoning
- [x] **P69-R8**: focused regression coverage proves prompt separation, structural turn-event parity, loud-failure behavior, and opening-scene non-regression
- [x] **P69-R9**: focused regressions, backend typecheck, and full backend suite are green

## Validation Verdict

- [x] Contract layer is green
- [x] Hidden execution bridge is green
- [x] Player-turn migration is green
- [x] Opening-scene non-regression is green
- [x] Observability is green
- [x] Backend typecheck is green
- [x] Backend full suite is green

**Verdict:** Phase 69 is complete. WorldForge now resolves normal player-turn hidden adjudication through a judge-owned structured plan plus deterministic backend execution, while storyteller remains narrator-only over the settled authoritative scene.

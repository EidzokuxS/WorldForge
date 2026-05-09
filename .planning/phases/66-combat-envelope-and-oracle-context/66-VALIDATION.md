---
phase: 66
slug: combat-envelope-and-oracle-context
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-19
updated: 2026-04-19
verified_on: 2026-04-19
---

# Phase 66 — Validation Strategy

> Verification gate for backend-owned `CombatEnvelope` derivation, target-context enrichment, Oracle contract wiring, hostile-path pass-through, and bounded observability.

Scope follows [66-04-hostile-action-integration-and-verification-PLAN.md](/R:/Projects/WorldForge/.planning/phases/66-combat-envelope-and-oracle-context/66-04-hostile-action-integration-and-verification-PLAN.md). This is a backend-only phase. No frontend code changed.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x (`backend`) |
| **Focused commands** | `npm --prefix backend test -- run combat-envelope`, `target-context`, `oracle`, `turn-processor.observability turn-processor npc-agent` |
| **Primary binary gate** | `npm --prefix backend test` |
| **Typecheck** | `npm --prefix backend run typecheck` |
| **Authoritative scope proof** | Out-of-scope file diff remains empty for runtime-tags, prompt-assembler, npc-offscreen, reflection-agent, and all frontend paths |
| **GitNexus scope note** | `detect_changes(scope=all)` reports HIGH due unrelated pre-existing dirty worktree outside Phase 66; staged-only digest is required before commit |

## Per-Task Verification Map

| Task ID | Requirement | Command / Evidence | Status |
|---------|-------------|--------------------|--------|
| 66-01-01 | P66-R1, P66-R2 | `npm --prefix backend test -- run combat-envelope` | ✅ green |
| 66-02-01 | P66-R3 | `npm --prefix backend test -- run target-context` | ✅ green |
| 66-03-01 | P66-R6 | `npm --prefix backend test -- run oracle` | ✅ green |
| 66-04-01 | P66-R4, P66-R5, P66-R8 | `npm --prefix backend test -- run turn-processor.observability turn-processor npc-agent` | ✅ green |
| 66-04-02 | P66-R8 | `npm --prefix backend test` | ✅ green |
| 66-04-02 | P66-R8 | `npm --prefix backend run typecheck` | ✅ green |
| 66-04-03 | P66-R7 | `git diff --name-only -- backend/src/character/runtime-tags.ts backend/src/engine/prompt-assembler.ts backend/src/engine/npc-offscreen.ts backend/src/engine/reflection-agent.ts frontend` | ✅ empty |
| 66-04-04 | P66-R8 | `66-SUMMARY.md` written | ✅ complete |

## Command Results

### Focused Builder / Contract Coverage

- `npm --prefix backend test -- run combat-envelope` → exit `0`
- `npm --prefix backend test -- run target-context` → exit `0`
- `npm --prefix backend test -- run oracle` → exit `0`
- `npm --prefix backend test -- run turn-processor.observability turn-processor npc-agent` → exit `0`

These focused commands cover:
- deterministic hostile-action gating
- pure envelope derivation and omission behavior
- additive target-side combat snapshot behavior
- Oracle prompt contract and no-bypass clamp wording
- player/NPC hostile-path pass-through and `combat.envelope` observability emission

### Backend Full Suite

- Command: `npm --prefix backend test`
- Result: exit `0`
- Evidence: `Test Files 121 passed | 3 skipped (124)` and `Tests 1554 passed | 30 todo (1584)`

### Backend Typecheck

- Command: `npm --prefix backend run typecheck`
- Result: exit `0`

## Scope Gate

### Out-of-Scope Files Stayed Untouched

- Command:

```text
git diff --name-only -- backend/src/character/runtime-tags.ts backend/src/engine/prompt-assembler.ts backend/src/engine/npc-offscreen.ts backend/src/engine/reflection-agent.ts frontend
```

- Result: empty output

This confirms Phase 66 stayed inside its Oracle-only boundary:
- no runtime-tag expansion
- no storyteller/prompt-assembler changes
- no npc-offscreen or reflection consumption
- no frontend changes

### GitNexus Scope Check

- Command: `mcp__gitnexus__detect_changes(repo=WorldForge, scope=all)`
- Result: `risk_level: "high"` with many changed symbols outside Phase 66
- Interpretation: this worktree already contains unrelated dirty changes from earlier uncommitted work, so the `scope=all` digest is not a useful isolated Phase 66 signal by itself
- Commit rule: run staged-only `gitnexus_detect_changes` on the Phase 66 commit set before commit creation

## Requirement Sign-Off

- [x] **P66-R1**: pure backend-local deterministic `CombatEnvelope` builder exists in [combat-envelope.ts](/R:/Projects/WorldForge/backend/src/engine/combat-envelope.ts)
- [x] **P66-R2**: envelope remains qualitative only; no HP math or hard combat formulas
- [x] **P66-R3**: `resolveActionTargetContext(...)` additively exposes `combatSnapshot` for character targets
- [x] **P66-R4**: player hostile path computes and passes `combatEnvelope`
- [x] **P66-R5**: NPC hostile `act.execute(...)` reuses the same target/envelope seam
- [x] **P66-R6**: `OraclePayload` accepts optional `combatEnvelope` and prompt contract includes explicit no-bypass clamp wording
- [x] **P66-R7**: runtime-tags, storyteller, npc-offscreen, reflection, persistence, schema, and frontend stayed untouched
- [x] **P66-R8**: focused coverage, full backend suite, and backend typecheck are green

## Validation Verdict

- [x] Focused builder / contract / hostile-path regressions are green
- [x] Backend full suite is green
- [x] Backend typecheck is green
- [x] Out-of-scope files remained untouched
- [x] No frontend changes landed
- [x] Phase 66 is verification-complete

**Verdict:** Phase 66 is complete. `CombatEnvelope` is now an engine-owned Oracle input for eligible hostile player and NPC actions, with deterministic derivation, bounded prompt semantics, and no bleed into storyteller, runtime-tags, reflection, or persistence.

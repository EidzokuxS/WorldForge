---
plan: 05
phase: 57-power-scaling-character-profile-redesign
status: complete
started: 2026-04-16
completed: 2026-04-16
gap_closure: true
---

# Plan 57-05: Remove Continuity/SourceBundle Dead Field Accesses

## What Was Built

Surgical removal of all remaining `.continuity` and `.sourceBundle` field accesses from engine and adapter files. These references were left behind when Plan 04 deleted the type definitions, producing TS2339/TS2353 compile errors.

## Key Changes

### Engine Files (Task 1)
- **prompt-assembler.ts** — Removed `includeContinuity` option from `buildRuntimeIdentityLines`, deleted continuity const and continuity summary block, simplified both caller sites
- **npc-agent.ts** — Removed `continuity` const and entire 22-line continuity fidelity block from `buildNpcIdentityPrompt`
- **npc-offscreen.ts** — Removed `continuity` const and continuity ternary from `buildOffscreenIdentitySummary`, cleaned prompt text
- **reflection-agent.ts** — Removed continuity policy line from reflection prompt
- **reflection-tools.ts** — `minimumEvidenceForPromotion` now returns flat `1` instead of branching on `identityInertia`

### Adapter Files (Task 2)
- **record-adapters.ts** — Removed `sourceBundle` and `continuity` from `mergeEditableNpcDraft` return
- **record-adapters.test.ts** — Removed `continuity` fixture from CharacterRecord mock

### Additional Test Fixes
- **npc-agent.test.ts** — Removed continuity fixture, updated test description
- **npc-offscreen.test.ts** — Removed continuity fixture
- **persona-templates.test.ts** — Removed sourceBundle and continuity fixtures

## Verification

- `grep -rn "record.continuity\|draft.continuity\|draft.sourceBundle" backend/src/ --include="*.ts"` → 0 matches in production code
- `grep -rn "includeContinuity\|identityInertia" backend/src/engine/ --include="*.ts"` → 0 matches (excluding test assertions that verify absence)
- Backend typecheck: 0 TS2339/TS2353 errors mentioning continuity or sourceBundle

## Self-Check: PASSED

- [x] All continuity field accesses removed from production code
- [x] All sourceBundle field accesses removed from production code
- [x] Test fixtures updated
- [x] Backend compiles with zero Phase-57-related type errors

## key-files

### modified
- backend/src/engine/prompt-assembler.ts
- backend/src/engine/npc-agent.ts
- backend/src/engine/npc-offscreen.ts
- backend/src/engine/reflection-agent.ts
- backend/src/engine/reflection-tools.ts
- backend/src/character/record-adapters.ts
- backend/src/character/__tests__/record-adapters.test.ts
- backend/src/engine/__tests__/npc-agent.test.ts
- backend/src/engine/__tests__/npc-offscreen.test.ts
- backend/src/routes/__tests__/persona-templates.test.ts

## Deviations

1. Extended scope beyond plan's 6 files — also fixed reflection-agent.ts, npc-agent.test.ts, npc-offscreen.test.ts, persona-templates.test.ts which had continuity/sourceBundle references the planner missed.
2. Restored `runGroundedLookup` dispatcher in grounded-lookup.ts — Plan 57-03 had replaced the entire file with power utilities, deleting the dispatcher that chat.ts imports. Restored with `power_profile` path using PowerStats + compareCharacterPower instead of old grounding.powerProfile.

---
phase: 63-personality-interiority-model
plan: 03
subsystem: engine
tags: [personality, prompts, reflection, vitest, gitnexus]
requires:
  - phase: 63-01
    provides: personality types, normalization helpers, and ingestion defaults
  - phase: 63-02
    provides: populated personality data on newly ingested character records
provides:
  - prompt assembler output driven by `identity.personality` instead of legacy behavioral core fields
  - NPC runtime prompts and offscreen summaries reading `personality` plus `liveDynamics.attachments`
  - reflection promotion patches that write `identity.personality` and `liveDynamics.attachments`
affects: [63-05-backfill, runtime-prompts, reflection-agent, npc-simulation]
tech-stack:
  added: []
  patterns: [personality-first prompt formatting, liveDynamics attachments bridge, strict reflection patch schema]
key-files:
  created:
    - backend/src/character/__tests__/record-adapters.attachments-bridge.test.ts
    - backend/src/engine/__tests__/prompt-assembler.personality.test.ts
    - backend/src/engine/__tests__/npc-agent.personality.test.ts
    - backend/src/engine/__tests__/npc-offscreen.personality.test.ts
    - backend/src/engine/__tests__/reflection-agent.personality.test.ts
  modified:
    - shared/src/types.ts
    - backend/src/routes/schemas.ts
    - backend/src/character/record-adapters.ts
    - backend/src/engine/prompt-assembler.ts
    - backend/src/engine/npc-agent.ts
    - backend/src/engine/npc-offscreen.ts
    - backend/src/engine/reflection-agent.ts
    - backend/src/engine/reflection-tools.ts
key-decisions:
  - "Legacy records omit the Personality block entirely; no degraded fallback text is emitted."
  - "liveDynamics.attachments is the new source of truth, with read-time fallback from behavioralCore.attachments during the migration window."
  - "promote_identity_change now accepts strict patch inputs for personality, attachments, self-image, and hard-constraints."
patterns-established:
  - "Runtime identity rendering: personality line first, self-image/attachments/hard-constraints as separate lines."
  - "Migration bridge: normalize new destination fields from legacy sources before switching hot-path consumers."
requirements-completed: [P63-R2, P63-R8]
duration: 17min
completed: 2026-04-18
---

# Phase 63 Plan 03: Engine Consumers Summary

**Personality-first prompt assembly for player, NPC, offscreen, and reflection flows with live attachment bridging and strict reflection patch writes**

## Performance

- **Duration:** 17 min
- **Started:** 2026-04-18T19:17:59+03:00
- **Completed:** 2026-04-18T19:34:37+03:00
- **Tasks:** 7
- **Files modified:** 20

## Accomplishments

- Replaced legacy behavioral-core prompt output with `identity.personality` formatting across the prompt assembler, NPC agent, offscreen simulation, and reflection prompt.
- Added the load-bearing `liveDynamics.attachments` type/schema path plus a legacy read-time bridge so old records still populate the new prompt surfaces.
- Reworked `promote_identity_change` into a strict personality patch tool and pinned the migration with focused Vitest coverage plus a green full engine suite.

## GitNexus Digest

- Pre-edit impact analysis:
  - `buildRuntimeIdentityLines` -> LOW risk, direct callers `buildPlayerStateSection` and `buildNpcStatesSection`.
  - `CharacterIdentityLiveDynamics` -> LOW risk, no direct callers surfaced.
  - `normalizeCharacterDraftRecord` -> MEDIUM risk with five direct callers in record projection paths.
  - `buildNpcIdentityPrompt`, `normalizeBehavioralCore`, and `createReflectionTools` -> LOW risk.
- `promote_identity_change` was not resolved as a graph symbol. Manual repo search confirmed only the tool definition, prompt hint text, and tests referenced the name, so no orphaned runtime caller needed repair.
- Final `gitnexus_detect_changes({scope: "all"})` reported `risk_level: low`, `changed_files: 13`, `changed_symbols: 0`, `affected_processes: 0`. Manual diff review remained the source of truth for file scope because the worktree already contained unrelated changes.

## Verification

- `npm --prefix shared run build`
- `npm --prefix backend run typecheck`
- `npm --prefix backend test -- run "record-adapters.attachments-bridge"`
- `npm --prefix backend test -- run "prompt-assembler.personality"`
- `npm --prefix backend test -- run "npc-agent"`
- `npm --prefix backend test -- run "npc-offscreen"`
- `npm --prefix backend exec vitest run src/engine/__tests__/reflection-agent.test.ts src/engine/__tests__/reflection-agent.personality.test.ts src/engine/__tests__/reflection-agent.identity-boundaries.test.ts`
- `cd backend && $files = Get-ChildItem src/engine/__tests__ -Filter *.test.ts | ForEach-Object { $_.FullName.Substring($PWD.Path.Length + 1).Replace('\\','/') }; & npx vitest run @files`
  - Result: `32` engine suites passed, `374` tests passed.

## Task Commits

1. **Task 1: Pre-task gitnexus impact analysis** - `e27a491` (`chore`)
2. **Task 2: liveDynamics.attachments types + bridge** - `0b65280`, `bbadfd5` (`test`, `feat`)
3. **Task 3: prompt-assembler Personality block** - `320eeaa`, `61ea130` (`test`, `feat`)
4. **Task 4: npc-agent personality switch** - `7c2725c`, `0207890` (`test`, `feat`)
5. **Task 5: npc-offscreen personality switch** - `a1fffb6`, `551b749` (`test`, `feat`)
6. **Task 6: reflection personality switch** - `d8e68da`, `f8d673c` (`test`, `feat`)
7. **Task 7: Post-task verification** - `42c6b60` (`chore`)

## Files Created/Modified

- `shared/src/types.ts` - added required `liveDynamics.attachments`.
- `backend/src/routes/schemas.ts` - deserializes `liveDynamics.attachments` with a safe default.
- `backend/src/character/record-adapters.ts` - bridges legacy attachments into `liveDynamics` and exports `blankPersonality()`.
- `backend/src/engine/prompt-assembler.ts` - emits `Personality:` blocks and separate self-image, attachments, and hard-constraints lines.
- `backend/src/engine/npc-agent.ts` - swaps legacy motives/pressure/taboos prompt lines for personality fields.
- `backend/src/engine/npc-offscreen.ts` - mirrors the NPC prompt migration for offscreen simulation summaries.
- `backend/src/engine/reflection-agent.ts` - updates prompt text and tool guidance to personality terminology.
- `backend/src/engine/reflection-tools.ts` - rewrites `promote_identity_change` around strict patch inputs and personality/live-dynamics writes.

## Decisions Made

- Kept `behavioralCore.selfImage` and `baseFacts.hardConstraints` in place while moving all motive/voice/worldview-style data to `identity.personality`.
- Used `blankPersonality()` as the shared merge baseline so reflection patches stay partial without reintroducing legacy defaults.
- Verified engine-wide behavior from the `backend` directory with an explicit file list because the plan's quoted `"engine"` Vitest filter did not execute reliably on this Windows setup.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added attachment defaults across remaining constructors and fixtures**
- **Found during:** Task 2 (liveDynamics.attachments types + bridge)
- **Issue:** Making `liveDynamics.attachments` required broke existing persona templates, NPC generation, reflection tool fixtures, and related tests that still built `liveDynamics` without the new field.
- **Fix:** Added `attachments: []` defaults or pass-through values in the affected constructors and updated dependent tests so the new type contract stayed consistent everywhere.
- **Files modified:** `backend/src/character/persona-templates.ts`, `backend/src/character/npc-generator.ts`, `backend/src/engine/reflection-tools.ts`, `backend/src/routes/__tests__/persona-templates.test.ts`, `backend/src/character/__tests__/persona-templates.test.ts`, `backend/src/character/__tests__/record-adapters.test.ts`
- **Verification:** `npm --prefix backend run typecheck` and targeted Vitest suites passed after the fixes.
- **Committed in:** `bbadfd5`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The deviation was required to make the new required field compile and deserialize safely. No feature scope changed.

## Issues Encountered

- `gitnexus_detect_changes()` under-reported changed scope after the task commits, so manual diff review was used alongside GitNexus output before final verification.
- The planned `npm --prefix backend test -- run "engine"` filter did not execute the engine suite on this Windows environment. Running Vitest from `backend` with an explicit engine test file list produced the intended full-suite verification.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Runtime engine consumers now read the personality model end-to-end for newly ingested records.
- Phase `63-05` can perform the durable backfill of legacy records so pre-existing campaigns gain full Personality blocks without relying on the read-time bridge.

## Self-Check: PASSED

- Confirmed summary file exists at `.planning/phases/63-personality-interiority-model/63-03-SUMMARY.md`.
- Confirmed all task commits referenced in this summary are present in git history.

---
*Phase: 63-personality-interiority-model*
*Completed: 2026-04-18*

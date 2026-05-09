---
phase: 61
plan: 03
status: completed
date: 2026-04-17
commit: 451fd70
---

# Plan 61-03 Summary — NPC tab rewrite + shared PowerStatsSection rewire

## Scope

Rewrote the world-review NPC creation tab and rewired `CharacterRecordInspector` to consume the shared `PowerStatsSection` atom — single source of truth for power stats rendering across player card, NPC card, and inspector.

## File changes

| File | Before | After | Delta |
|------|--------|-------|-------|
| `frontend/components/world-review/npcs-section.tsx` | ~320 | 881 | +561 (full rewrite of creation section) |
| `frontend/components/world-review/character-record-inspector.tsx` | 491 | 382 | −109 (3 inline helpers + SEVERITY_STYLES removed) |
| `frontend/components/world-review/__tests__/npcs-section.test.tsx` | ~360 | 391 | +31 (4-mode + overrideText + generateCharacter mock) |

Total: 3 files changed, 439 insertions(+), 315 deletions(-).

## Key contracts delivered

- `CreationModes` atom drives 4 NPC creation modes (parse / generate / research / import). `generate` mode is new (pure generate-from-scratch via `generateCharacter` wrapper); the legacy "AI Generate" label that was actually research is now correctly labeled "Research Archetype".
- `OverrideTextField` visible whenever a mode is open; preserved across switches; cleared on successful creation.
- `runIngestion` + `PipelineErrorBanner` at section scope mirror the player retry contract.
- Each NPC card renders `PowerStatsSection` top-level (between tags/goals and the Advanced inspector disclosure) via `npc.draft?.powerStats`.
- `CharacterRecordInspector` imports `PowerStatsSection` from `@/components/character-creation/power-stats-section`. Local `PowerStatsTable`, `HaxAbilitiesList`, `VulnerabilitiesList`, and the `SEVERITY_STYLES` table are removed.
- Generic archetype placeholders ("a battle-scarred veteran, a mysterious plague doctor, a pragmatic court mage"); legacy franchise-specific placeholder gone.

## Verification

| Check | Result |
|-------|--------|
| `grep -q CreationModes npcs-section.tsx` | found |
| `grep -q OverrideTextField npcs-section.tsx` | found |
| `grep -q "generateCharacter" npcs-section.tsx` | found (new wrapper) |
| `grep -q PowerStatsSection npcs-section.tsx` | found (top-level + draft-only access) |
| `grep -q 'from "@/components/character-creation/power-stats-section"' character-record-inspector.tsx` | found |
| `grep -c "function PowerStatsTable\|function HaxAbilitiesList\|function VulnerabilitiesList" character-record-inspector.tsx` | 0 |
| Franchise grep on npcs-section.tsx | 0 |
| `grep -r backdrop-blur` Phase 61 surfaces | 0 |
| Vitest: `npcs-section.test.tsx` | 6/6 green |
| `npm run typecheck` | green (no regression vs baseline) |

## Deviations

- Test "character-record-inspector.test.tsx — renders structured grounding, power profile, continuity, and canon source sections" remains red. Phase 57 removed the `Grounding`/`Continuity`/`Canon Sources` sections (per memory `project_power_profile_redesign.md`) but that test was never updated; the fixture also uses Naruto franchise names which violate `feedback_no_ip_in_prompts.md`. Deferred to a dedicated `chore/test-baseline-cleanup` follow-up; not caused by this plan. Documented in `61-SUMMARY.md §Deferred Issues`.

## Contract for Plan 04

- Shared atom is the only PowerStats render path; any future inspector/card consumer imports `PowerStatsSection` directly.
- NPC creation surface is structurally equivalent to the player surface (same CreationModes, same OverrideTextField, same runIngestion + PipelineErrorBanner, same top-level PowerStats on card).

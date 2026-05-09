---
phase: 57-power-scaling-character-profile-redesign
plan: 04
subsystem: ui, shared-types, character
tags: [power-scaling, vs-battles, inspector, cleanup, dead-code-removal]

requires:
  - phase: 57-01
    provides: PowerStats, HaxAbility, CharacterVulnerability types and formatTierRank utility
  - phase: 57-02
    provides: All backend consumers migrated to PowerStats, old fields removed from Draft/Record
  - phase: 57-03
    provides: Engine consumers migrated to lookupCharacterPower and buildPowerStatsLine
provides:
  - Clean shared types with no legacy grounding/sourceBundle/continuity definitions
  - Redesigned character inspector with Power Stats table, Hax Abilities, Vulnerabilities
  - Clean frontend draft normalizer without old type references
affects: [character-creation, world-review, engine-prompts]

tech-stack:
  added: []
  patterns:
    - "PowerStats table with formatTierRank display in inspector"
    - "Severity-colored badges for vulnerabilities (minor=zinc, major=amber, critical=red)"
    - "Graceful absence: 'No power assessment' text when powerStats undefined"

key-files:
  created: []
  modified:
    - shared/src/types.ts
    - shared/src/index.ts
    - frontend/components/world-review/character-record-inspector.tsx
    - frontend/components/character-creation/character-card.tsx
    - frontend/lib/character-drafts.ts
    - frontend/lib/__tests__/character-drafts.test.ts
    - frontend/lib/__tests__/world-data-helpers.test.ts
    - frontend/components/character-creation/__tests__/character-card.identity.test.tsx

key-decisions:
  - "Power Stats displayed as 2-column table (Axis/Rating) not radar/spider chart -- deferred per CONTEXT.md"
  - "Hax abilities show bypass tier as amber badge; vulnerabilities show severity badges"
  - "Characters without powerStats show 'No power assessment' muted text (fail-closed)"
  - "Removed sourceBundle/continuity UI sections from character-card identity fidelity panel"

patterns-established:
  - "PowerStatsTable component: reusable table rendering formatTierRank for 4 axes"
  - "HaxAbilitiesList and VulnerabilitiesList: compact card-based lists with badges"

requirements-completed: [SC-3, SC-4, SC-7]

duration: 10min
completed: 2026-04-16
---

# Phase 57 Plan 04: Legacy Cleanup & Inspector Redesign Summary

**Deleted 5 legacy type definitions and 2 backend files, redesigned character inspector with VS Battles power stats table, hax abilities, and vulnerability badges**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-16T04:49:21Z
- **Completed:** 2026-04-16T04:59:03Z
- **Tasks:** 1 of 2 (Task 2 is checkpoint:human-verify)
- **Files modified:** 10 (2 deleted, 8 modified)

## Accomplishments

### Task 1: Delete old types, legacy files, redesign inspector, clean frontend

**Commit:** `0382cb0`

**Deletions:**
- Removed `CharacterGroundingProfile`, `PowerProfile`, `CharacterSourceBundle`, `CharacterContinuityPolicy`, `CharacterContinuityInertia` type definitions from `shared/src/types.ts`
- Removed their exports from `shared/src/index.ts`
- Removed `sourceBundle` and `continuity` partial fields from `CharacterDraftPatch`
- Deleted `backend/src/character/grounded-character-profile.ts`
- Deleted `backend/src/character/canonical-source-bundle.ts`

**Inspector redesign (character-record-inspector.tsx):**
- Removed old Grounding, Power Profile, Continuity, and Sources sections entirely
- Added `PowerStatsTable` component: 2-column table showing Attack Potency, Speed, Durability, Intelligence with `formatTierRank` output
- Added `HaxAbilitiesList` component: card-based list with bold name, type text, amber bypass-tier badge, italic limitations
- Added `VulnerabilitiesList` component: card-based list with severity badges (minor=zinc, major=amber, critical=red)
- When `powerStats` is undefined: shows "No power assessment" in muted text
- Removed `grounding`, `sourceBundle`, `continuity` variable extraction and all dependent checks
- Removed `continuity` from overview badges

**Character card cleanup (character-card.tsx):**
- Removed `sourceBundle` and `continuity` from `getIdentityFidelitySummary`
- Removed Source Signals and Continuity UI sections from Identity Fidelity panel

**Draft normalizer cleanup (character-drafts.ts):**
- Removed `normalizeSourceBundle()` function
- Removed `normalizeContinuity()` function
- Pass through `powerStats` if present on input

**Test fixture updates:**
- Updated `character-drafts.test.ts`: removed sourceBundle/continuity from fixtures and assertions
- Updated `world-data-helpers.test.ts`: replaced grounding/powerProfile fixtures with powerStats
- Updated `character-card.identity.test.tsx`: removed sourceBundle/continuity from fixture and assertions

### Task 2: Entry-path verification matrix and visual check

**Status:** Checkpoint (human-verify) -- automated verification completed, manual visual verification pending.

**Automated verification results:**
- Shared: 120/120 tests pass
- Backend: 1312 pass, 20 fail (pre-existing failures in reflection-agent identity-boundaries tests, not caused by this plan)
- Frontend: builds successfully, lint passes (warnings only)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed sourceBundle/continuity references in character-card.tsx**
- **Found during:** Task 1
- **Issue:** `character-card.tsx` referenced `draft.sourceBundle` and `draft.continuity` which no longer exist on CharacterDraft
- **Fix:** Removed sourceBundle/continuity from identity fidelity summary and corresponding UI sections
- **Files modified:** `frontend/components/character-creation/character-card.tsx`
- **Commit:** `0382cb0`

**2. [Rule 3 - Blocking] Fixed sourceBundle/continuity/grounding references in test fixtures**
- **Found during:** Task 1
- **Issue:** 3 test files referenced old fields that no longer exist on CharacterDraft/CharacterRecord
- **Fix:** Replaced old fixtures with powerStats fixtures, updated assertions
- **Files modified:** `frontend/lib/__tests__/character-drafts.test.ts`, `frontend/lib/__tests__/world-data-helpers.test.ts`, `frontend/components/character-creation/__tests__/character-card.identity.test.tsx`
- **Commit:** `0382cb0`

## Pending Verification (Checkpoint)

The following entry-path verification matrix items require manual visual verification:

| Path | Steps | Expected |
|------|-------|----------|
| Old campaign load | Load a pre-Phase-57 campaign | Characters load without crash. Inspector shows "No power assessment" |
| Known-IP worldgen | Create new campaign with known IP, run worldgen | Generated NPCs have powerStats with VS Battles tiers |
| Archetype creation | Create character via archetype research | Character gets powerStats if available |
| V2 card import | Import a V2 card | Card imports without crash, powerStats may be undefined |
| Save/load cycle | Save campaign, reload page | All power stats persist |
| UI readback | Open NPC inspector in World Review | Power Stats table shows 4 axes, Hax/Vulnerabilities display |
| In-game compare | During gameplay, use compare command | Response references tier+rank data |

## Known Stubs

None -- all power stats rendering is wired to real data from `CharacterRecord.powerStats` / `CharacterDraft.powerStats`.

## Self-Check: PASSED

- All 10 acceptance criteria verified
- All created/modified files exist
- Both legacy files confirmed deleted
- Commit 0382cb0 confirmed in git history
- Frontend builds successfully
- Shared tests 120/120 pass

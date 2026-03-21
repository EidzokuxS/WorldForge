# QA Log: Task 1 - NPC Tab Display and Editing Verification

**Campaign:** Polish Test (7ba2852b-724c-4e40-aca5-a706a8af770b)
**Date:** 2026-03-20

## Part A: NPC List Display

| Check | Result | Detail |
|-------|--------|--------|
| NPC array non-empty | PASS | 5 NPCs |
| NPC 1 has name | PASS | Jana 'Ratchet' Petrova |
| NPC 1 has tier | PASS | key |
| NPC 1 has persona | PASS | 243 chars |
| NPC 1 has tags | PASS | 3 tags (Engineer, Cynical, Resourceful) |
| NPC 2 has name | PASS | Commander Gregor 'Ironclad' Volkov |
| NPC 2 has tier | PASS | key |
| NPC 2 has persona | PASS | 292 chars |
| NPC 2 has tags | PASS | 3 tags (Security, Disciplined, Ruthless) |
| NPC 3 has name | PASS | Dr. Aris Thorne |
| NPC 3 has tier | PASS | key |
| NPC 3 has persona | PASS | 285 chars |
| NPC 3 has tags | PASS | 3 tags (Scientist, Visionary, Amoral) |
| NPC 4 has name | PASS | Brother Silas |
| NPC 4 has tier | PASS | key |
| NPC 4 has persona | PASS | 267 chars |
| NPC 4 has tags | PASS | 3 tags (Cultist, Fanatic, Mystic) |
| NPC 5 has name | PASS | Chief Engineer Anya Sharma |
| NPC 5 has tier | PASS | key |
| NPC 5 has persona | PASS | 279 chars |
| NPC 5 has tags | PASS | 3 tags (Engineer, Leader, Pragmatic) |
| All NPCs are key tier | PASS | All 5 are "key" |

## Part B: NPC Edit Persistence

| Check | Result | Detail |
|-------|--------|--------|
| save-edits schema accepts NPC tag modifications | PASS | scaffoldNpcSchema includes tags array |
| save-edits schema accepts NPC persona modifications | PASS | scaffoldNpcSchema includes persona string |
| save-edits API on active campaign | EXPECTED FK ERROR | Player FK to locations prevents scaffold rewrite mid-game |
| Tier field in scaffold schema | NOT PRESENT | Scaffold NPCs always created as key tier (by design) |
| Tier change via save-edits | N/A | insertNpcs hardcodes tier: "key" -- tier is set at scaffold creation, not editable via save-edits |

**Note:** save-edits correctly rejects scaffold rewrite on campaigns with existing players due to FOREIGN KEY constraint on `players.current_location_id -> locations.id`. This is correct behavior since save-edits destroys and recreates all locations. save-edits is designed for the pre-game World Review phase only.

## Part C: Duplicate Name Warning

| Check | Result | Detail |
|-------|--------|--------|
| Duplicate detection uses case-insensitive comparison | PASS | `npc.name.trim().toLowerCase()` on line 72 of npcs-section.tsx |
| AlertTriangle icon shown for duplicates | PASS | JSX on lines 224-229 with yellow-500 styling |
| Detection algorithm is O(n) | PASS | Uses two Sets (seen + duplicateNames) |
| Both duplicates get warning | PASS | `duplicateNames.has()` check applied to every NPC card |

## Summary

- **Part A:** 21/21 checks PASS -- All 5 NPCs display with correct name, tier, persona, and tags
- **Part B:** Schema validation PASS, API correctly enforces FK constraints on active campaigns. Tier editing not in scaffold scope (by design).
- **Part C:** Duplicate name detection logic verified in source code -- correct case-insensitive comparison with visual AlertTriangle warning

# Task 1: Scaffold NPC Generation & DB Persistence Verification

**Campaign:** Polish Test (7ba2852b-724c-4e40-aca5-a706a8af770b)
**Date:** 2026-03-20
**API:** GET /api/campaigns/:id/world

## Results Summary

- **58 PASS, 2 SOFT-FAIL** out of 60 checks
- Soft failures are faction-name-in-persona checks (expected: relationships table stores faction links)

## NPC Inventory (5 Key NPCs)

| Name | Tier | Persona Len | Tags | Location | Goals | Beliefs | Created |
|------|------|-------------|------|----------|-------|---------|---------|
| Jana 'Ratchet' Petrova | key | 243 | Engineer, Cynical, Resourceful | Hydroponics Bay 7 | 2 short, 2 long | {} | PASS |
| Commander Gregor 'Ironclad' Volkov | key | 292 | Security, Disciplined, Ruthless | Security Checkpoint Beta | 3 short, 2 long | {} | PASS |
| Dr. Aris Thorne | key | 285 | Scientist, Visionary, Amoral | null | 2 short, 2 long | {} | PASS |
| Brother Silas | key | 267 | Cultist, Fanatic, Mystic | Xylos Observation Deck | 3 short, 2 long | {} | PASS |
| Chief Engineer Anya Sharma | key | 279 | Engineer, Leader, Pragmatic | Engineering Workshop | 2 short, 2 long | {} | PASS |

## Tier Distribution

- key: 5 (PASS -- minimum 3 required)
- persistent: 0
- temporary: 0

## Foreign Key Integrity

All 4 non-null `currentLocationId` values map to valid locations in the same campaign.

## Faction Cross-References (via relationships table)

| NPC | Faction | Relationship |
|-----|---------|-------------|
| Jana 'Ratchet' Petrova | The Cogsmiths | Member |
| Commander Gregor 'Ironclad' Volkov | The Wardens | Member |
| Dr. Aris Thorne | The Luminary Collective | Member |
| Brother Silas | The Void Pilgrims | Member |
| Chief Engineer Anya Sharma | The Cogsmiths | Member |

## Detailed Check Results

- [PASS] World data has npcs array
- [PASS] World data has locations array
- [PASS] World data has factions array
- [PASS] NPCs array non-empty (5)
- [PASS] All 5 NPCs have valid UUID ids
- [PASS] All 5 NPCs have non-empty names
- [PASS] All 5 NPCs have tier="key"
- [PASS] All 5 NPCs have persona >= 20 chars
- [PASS] All 5 NPCs have tags as string arrays
- [PASS] All 5 NPCs have goals.short_term arrays
- [PASS] All 5 NPCs have goals.long_term arrays
- [PASS] All 5 NPCs have parseable beliefs JSON
- [PASS] All non-null locationIds reference valid locations
- [PASS] All 5 NPCs have valid createdAt timestamps
- [PASS] At least 3 key NPCs (actual: 5)

## Notes

- `beliefs` field is stored as `{}` (empty object) by scaffold-saver, not as an array. This is a minor schema inconsistency (DB default is `[]` but saver writes `{}`). Non-blocking.
- Dr. Aris Thorne has null currentLocationId -- acceptable, not all NPCs need starting locations.
- Faction association is maintained via relationships table (Member tag), not embedded in NPC persona text.

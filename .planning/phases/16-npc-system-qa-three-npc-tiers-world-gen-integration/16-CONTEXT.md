# Phase 16: NPC System QA — Context

**Gathered:** 2026-03-20
**Status:** Ready for planning
**Source:** User description (inline)

<domain>
## Phase Boundary

Systematic QA of the entire NPC system across all 3 tiers (key/minor/ambient) and all lifecycle stages:
world generation → world review → gameplay. This is a testing/verification phase, not an implementation phase.

</domain>

<decisions>
## Test Scope

### 1. NPC Tiers — Three Types
- **Key NPCs**: Full personas, goals, beliefs, autonomous actions. Created during scaffold generation.
- **Minor NPCs**: Less detailed, may be spawned during gameplay by Storyteller via `spawn_npc` tool.
- **Ambient NPCs**: Background characters, no persistent state, mentioned in narrative flavor.
- Verify each tier behaves differently in gameplay (key = interactive, minor = supporting, ambient = flavor text).

### 2. World Gen Pipeline — NPC Integration
- Scaffold generation creates Key NPCs (step 3 of 5-step pipeline).
- Each Key NPC has: name, tier, description, tags, beliefs, goals, currentLocationId, faction.
- Verify: NPCs are correctly saved to DB after scaffold generation.
- Verify: NPCs have valid currentLocationId pointing to generated locations.
- Verify: NPCs are visible in World Review NPC tab.

### 3. World Review — NPC Loading & Editing
- World Review NPC tab shows all generated NPCs.
- User can create custom NPCs via 3 modes: Describe, Import V2 Card, AI Generate.
- Verify: all 3 creation modes produce valid NPC data.
- Verify: duplicate name warnings work.
- Verify: NPC edits (tags, description) persist.

### 4. Key NPC Selection During World Creation
- User can designate NPCs as "key" during world review.
- Key NPCs get autonomous behavior via npc-agent tick system.
- Verify: tier changes from world review are saved to DB.

### 5. Key NPC Generation in Scaffold Pipeline
- Generator creates Key NPCs as part of scaffold.
- Each Key NPC has coherent persona matching faction + world premise.
- Verify: generated NPCs have proper faction alignment and location assignment.

### 6. Runtime NPC Tier Promotion
- During gameplay, Storyteller can promote minor NPCs to key via game events.
- Verify: tier changes during gameplay are possible and persist.

### 7. Gameplay Behavior Per NPC Type
- Key NPCs: appear in "People Here" section, interact in narrative, have autonomous actions via npc-agent.
- Minor NPCs: may appear in narrative, no autonomous actions.
- Ambient NPCs: flavor text only, no DB persistence.
- Verify: NPC presence at player's location is reflected in UI.
- Verify: Key NPC autonomous actions (npc-agent tick) run after each player turn.

### Claude's Discretion
- Test methodology (API calls vs Playwright UI vs both)
- Specific campaign to use for testing
- Whether to create a new campaign or reuse existing

</decisions>

<canonical_refs>
## Canonical References

### NPC System
- `backend/src/character/npc-generator.ts` — NPC generation logic
- `backend/src/character/archetype-researcher.ts` — archetype research for NPC creation
- `backend/src/engine/npc-agent.ts` — Key NPC autonomous tick system
- `backend/src/engine/npc-offscreen.ts` — Off-screen NPC simulation
- `backend/src/worldgen/scaffold-saver.ts` — Saves generated NPCs to DB
- `backend/src/db/schema.ts` — NPC table schema

### Frontend NPC Components
- `frontend/components/world-review/npcs-section.tsx` — World Review NPC tab
- `frontend/components/character-creation/` — Character creation (shared with NPC creation)

### Documentation
- `docs/mechanics.md` — NPC tiers, NPC agent, faction influence
- `docs/concept.md` — NPC descriptions in world concept

</canonical_refs>

<specifics>
## Specific Ideas

- Test with existing "Polish Test" campaign (has 5 Key NPCs with locations)
- Test NPC creation modes through Playwright UI
- Verify npc-agent tick via backend logs after each player turn
- Check NPC presence in "People Here" sidebar section when player is at NPC's location

</specifics>

<deferred>
## Deferred Ideas

None — this phase covers the full NPC QA scope.

</deferred>

---

*Phase: 16-npc-system-qa-three-npc-tiers-world-gen-integration*
*Context gathered: 2026-03-20 via user description*

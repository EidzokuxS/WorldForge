```markdown
## Verdict
**ready-to-plan**

The root cause is accurately identified in the prompt. Current generated scaffolds only contain a flat list of locations which are blindly assigned `kind: "macro"`. Because NPCs and the player are assigned this macro location ID as their `currentLocationId` and their `currentSceneLocationId` is left as `null`, the scene builder correctly—but unfortunately—treats them all as occupying the exact same encounter scope within the macro location.

## Top Risks
1. **Broken Graph Adjacency:** Generating nested locations might confuse the LLM when writing `connectedTo` arrays. We must ensure `location_edges` gracefully handles a mix of macro-to-macro and sublocation-to-sublocation connections without creating isolated pockets.
2. **Player Placement Mismatch:** Fixing NPC placement in `scaffold-saver.ts` is insufficient. The player creation code in `backend/src/routes/character.ts` (which uses `isStarting`) must also be updated to map a starting sublocation into the correct `currentLocationId` (macro) and `currentSceneLocationId` (sublocation), otherwise the player and NPCs will be misaligned on load.
3. **Prompt Bloat/Slop:** Forcing the LLM to output rigid hierarchies might consume context or cause hallucinations if the prompt doesn't clearly define that only physically contained areas should have a `parentLocationName`.

## Recommended Plan Tasks
1. **Schema & Types Extension:**
   - Update `ScaffoldLocation` in `backend/src/worldgen/types.ts` to include an optional `parentLocationName: string | null` field.
2. **Prompt Contract Updates:**
   - Update `backend/src/worldgen/scaffold-steps/locations-step.ts` to instruct the LLM to output `parentLocationName` when a location is geographically contained within another location being generated (e.g., a room within a building, a district within a city).
3. **Deterministic Persistence (scaffold-saver.ts):**
   - Update `insertLocations` to operate in two passes: first generating all UUIDs, then inserting rows. If `parentLocationName` is present and matches a valid generated location, assign its ID to `parentLocationId` and set `kind: "persistent_sublocation"`. Otherwise, fallback to `"macro"` and `null`.
   - Update `insertNpcs` to do a two-stage location resolution: if the assigned location is a `persistent_sublocation`, set the NPC's `currentLocationId` to the parent's ID and `currentSceneLocationId` to the sublocation's ID.
4. **Player Placement Alignment (character.ts):**
   - Update `backend/src/routes/character.ts` (`resolveDraftLocation` and insertion) to query `parentLocationId` and `kind`. Ensure a player starting in a sublocation correctly writes the parent ID to `currentLocationId` and the sublocation ID to `currentSceneLocationId`.
5. **Secondary Stale-Promise Audit:**
   - Audit the implementation of **Ephemeral Scenes** (`anchorLocationId` / expiration) and **NPC Tiers** (`types.ts` notes `tier` is optional until plan `24-03`) to ensure they are fully honored or explicitly moved to Phase 76.

## Verification Checklist
- [ ] **Unit Tests (`validation.test.ts` / `scaffold-saver.test.ts`):** Verify that a scaffold containing a sublocation correctly inserts a `persistent_sublocation` row with a valid `parentLocationId`.
- [ ] **NPC Integration Test:** Verify that an NPC placed in a generated sublocation is correctly saved with `currentLocationId = macroId` and `currentSceneLocationId = sublocId`.
- [ ] **Player Integration Test:** Verify the starting player character is also split across broad/scene IDs when starting in a sublocation.
- [ ] **Engine Regression (`scene-frame.ts`):** Verify via automated test that a player in `Sublocation A` and an NPC in `Sublocation B` (under the same Macro Location) do not appear in each other's `active` roster or `presentActorIds`.
- [ ] **Stale Promise Resolution:** Documented evidence that Ephemeral Scenes and NPC Tiers are either actively used or tracked for Phase 76.
```

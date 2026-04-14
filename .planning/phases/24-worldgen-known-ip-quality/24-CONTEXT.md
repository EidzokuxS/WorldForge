# Phase 24: Worldgen Known IP Quality - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Source:** Direct user feedback with screenshots + follow-up clarifications

<domain>
## Phase Boundary

Complete overhaul of the worldgen prompt pipeline to produce high-quality, canonical, internally-consistent worlds. Affects: seed-suggester (DNA), scaffold-generator (premise, locations, factions, NPCs, lore), ip-researcher prompts. Does NOT change the SSE streaming, frontend UI, or database schema.

</domain>

<decisions>
## Implementation Decisions

### 1. DNA Must Describe Current World State
- DNA categories (geography, political structure, central conflict, cultural flavor, environment, wildcard) must describe the ACTUAL state of the world, not differences from the original
- For known IPs: describe the canonical world enhanced by user's changes, not "the world but X is different"
- Each DNA category must include reasoning — WHY is it this way
- DNA categories must have inter-dependencies: political structure flows from geography, central conflict from political structure, etc.
- LOCKED: DNA is about the WORLD, not about specific plot points or characters from the user's premise

### 2. Premise Must Respect User Input Exactly
- If user says "Naruto trained by Tsunade, Sakura by Orochimaru, Sasuke by Jiraiya" — premise must reflect EXACTLY that, no swaps
- Premise should set the stage for the world state, not summarize the plot
- Sannin titles/epithets must be canonical (Tsunade = Slug Princess, Jiraiya = Toad Sage, Orochimaru = Snake Sannin)
- LOCKED: Never invent titles, swap teacher-student pairs, or alter character personalities from canon

### 3. Locations Must Be Canonical for Known IPs
- For Naruto: Konohagakure, Sunagakure, Kirigakure, etc. — real canonical locations
- User's premise changes should produce butterfly-effect modifications to canonical locations, not replace them with invented ones
- "Leaf-Shade Village" instead of "Konohagakure" is WRONG — use real names
- Original worlds: generate creative locations, but with internal consistency
- LOCKED: Known IP locations must use canonical names and descriptions, modified only by logical consequences of premise changes

### 4. Factions Must Be Canonical for Known IPs
- For Naruto: Hidden Villages, Akatsuki, Root/ANBU, clan structures — real canonical factions
- "The Serpent's Coil Ascetics" is WRONG for a Naruto world — should be actual organizations
- Butterfly-effect: if Orochimaru trains Sakura, maybe Sound Village has different dynamics — but Sound Village still exists
- LOCKED: 0% invented factions when canonical ones exist. Modifications to canonical factions based on premise changes are expected.

### 5. NPCs Must Be Canonical Characters + Original Supporting Cast
- Split into TWO tiers: Key Characters (canonical, plot-relevant) and Supporting Characters (can be original)
- For Naruto: Kakashi, Tsunade, Jiraiya, Orochimaru, Sakura, Sasuke, Naruto, Hinata, Shikamaru, etc. — REAL characters
- "Baroness Anya 'Ironwill' Volkov" in a Naruto world is WRONG
- Generate 10-15 NPCs total, not 6
- LOCKED: Key characters for known IPs must be canonical. Supporting characters can be original but must fit the world.

### 6. Lore Must Be Research-Grounded
- Lore cards should be based on ipContext research data, not LLM hallucinations
- For known IPs: canonical concepts, techniques, history, organizations
- "Chakra Storms" as a core concept in Naruto is hallucinated — should be Chakra Nature Types, Kekkei Genkai, Bijuu, etc.
- LOCKED: Lore must reference actual franchise elements when available in research data

### 7. Intelligent World-Building Pipeline (NOT One Giant Call)
- Each scaffold step (locations, factions, NPCs, lore) must use MULTIPLE mini-calls internally
- Build element-by-element, brick-by-brick, from general to specific
- Each element references already-created elements (location references the premise, faction references locations, NPC references factions + locations)
- Dependencies flow: premise → locations → factions → NPCs → lore (already exists as pipeline steps, but WITHIN each step, generate incrementally)
- Example for locations: first generate the list of location names + brief descriptions, then for each location generate detailed description + tags + connections referencing other locations
- LOCKED: No single monolithic generateObject call per scaffold step. Break into sub-calls.

### 8. DNA Inter-Category Dependencies
- Geography influences political structure (island nations → maritime politics)
- Political structure influences central conflict (feudal → power struggles between lords)
- Cultural flavor must reflect the world's actual cultures, not plot-specific elements
- Environment is a consequence of geography + any supernatural/magical elements
- Wildcard should be genuinely unexpected, not restating something from other categories
- LOCKED: DNA generation must be sequential with each category seeing previous ones

### 9. Prompt Engineering Quality
- Apply stop-slop principles: no purple prose, no AI-typical filler, concrete over abstract
- Anti-hallucination: explicitly instruct LLM to use research data as source of truth
- Structured reasoning: chain-of-thought before generating each element
- Research data injection: pass ipContext.keyFacts directly into prompts as reference material
- LOCKED: All prompts must be reviewed against stop-slop checklist before finalizing

### Claude's Discretion
- Exact mini-call breakdown within each scaffold step (how many sub-calls, what granularity)
- Prompt templating approach (string interpolation vs structured system/user messages)
- Whether DNA generation needs separate LLM calls per category or can batch with sequential context
- How to handle the transition between "known IP" and "original world" modes in prompts
- Test scenario selection for E2E validation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### World Generation Pipeline
- `backend/src/worldgen/scaffold-generator.ts` — Current scaffold generation (premise → locations → factions → NPCs), monolithic generateObject calls
- `backend/src/worldgen/seed-suggester.ts` — Current DNA/seed suggestion prompts
- `backend/src/worldgen/ip-researcher.ts` — Research pipeline, evaluateResearchSufficiency()
- `backend/src/worldgen/types.ts` — GenerateScaffoldRequest, WorldScaffold types

### Routes
- `backend/src/routes/worldgen.ts` — All worldgen API endpoints
- `backend/src/routes/schemas.ts` — Zod validation schemas

### Shared Types
- `shared/src/types.ts` — WorldSeeds, SeedCategory, IpResearchContext

### Frontend (for E2E testing context)
- `frontend/components/title/use-new-campaign-wizard.ts` — Campaign creation flow
- `frontend/app/campaign/[id]/review/page.tsx` — World review page
- `frontend/components/world-review/npcs-section.tsx` — NPC display/edit

### Documentation
- `docs/concept.md` — World generation vision
- `docs/mechanics.md` — Tag system, NPCs, factions

</canonical_refs>

<specifics>
## Specific Ideas

### Test Scenarios for E2E
1. **Naruto Shippuden** — "Naruto Shippuden but Sakura learnt from Orochimaru, Sasuke from Jiraiya and Naruto from Tsunade"
2. **Star Wars** — "Star Wars but the Jedi Order never fell, Order 66 failed"
3. **Original World** — "A steampunk archipelago where magic is powered by music"
4. **Game of Thrones** — "ASOIAF but Ned Stark survived and became Hand of the King"

Each scenario must produce:
- Canonical locations (for known IPs)
- Canonical factions
- 10-15 NPCs (key + supporting)
- 30+ lore cards grounded in research
- DNA that describes the actual world state

### Incremental Generation Example (Locations)
```
Step 1: LLM generates location LIST (names + 1-line descriptions) — 1 call
Step 2: For each location, generate DETAIL (full description, tags, connections to other locations) — N calls
Step 3: Validate connections are bidirectional — 1 validation call or code logic
```

</specifics>

<deferred>
## Deferred Ideas

- Image generation for locations/NPCs (Phase 10 handles this separately)
- Player character generation quality (separate concern from world generation)
- Lore card embedding quality (vector/embedder concern, not prompt concern)

</deferred>

---

*Phase: 24-worldgen-known-ip-quality*
*Context gathered: 2026-03-25 from direct user feedback*

# QA Log: Task 2 - NPC Creation Modes Verification

**Campaign:** Polish Test (7ba2852b-724c-4e40-aca5-a706a8af770b)
**Date:** 2026-03-20
**Provider:** GLM 4.7 Flash via Z.AI (glm-provider)

## Mode 1: Describe (parse-character with role=key)

| Check | Result | Detail |
|-------|--------|--------|
| Route exists and accepts POST | PASS | POST /api/worldgen/parse-character |
| Schema validates concept (non-empty) | PASS | Empty concept returns "Character concept is required." |
| Schema validates campaignId (required) | PASS | Missing campaignId returns validation error |
| Schema validates locationNames for role=key | PASS | Refine check enforces locationNames when role=key |
| LLM structured output | SKIP | GLM 4.7 Flash consistently fails generateObject (returns unparseable response) |

## Mode 2: AI Generate (generate-character / research-character with role=key)

| Check | Result | Detail |
|-------|--------|--------|
| Route exists and accepts POST | PASS | POST /api/worldgen/generate-character + /research-character |
| Schema validates archetype (non-empty) | PASS | Empty archetype returns "Archetype is required." |
| Schema validates campaignId (required) | PASS | Invalid campaignId returns "Campaign not active or not found." |
| Frontend calls research-character (not generate-character) | PASS | handleGenerateNpc calls researchCharacter() in npcs-section.tsx |
| LLM structured output | SKIP | GLM provider issue (same as Mode 1) |

## Mode 3: Import V2 Card (import-v2-card with role=key)

| Check | Result | Detail |
|-------|--------|--------|
| Route exists and accepts POST | PASS | POST /api/worldgen/import-v2-card |
| Schema validates name (non-empty) | PASS | Empty name returns "Too small: expected string to have >=1 characters" |
| Schema validates description (required) | PASS | description is required min(1) |
| Frontend parses V2/V3 card client-side | PASS | parseV2CardFile in v2-card-parser.ts handles JSON + PNG |
| LLM structured output | SKIP | GLM provider issue (same as Mode 1) |

## Schema Consistency Verification (Source Code)

| Check | Result | Detail |
|-------|--------|--------|
| All 3 modes use same npcSchema | PASS | npc-generator.ts defines single shared schema |
| Schema fields: name, persona, tags, goals, locationName, factionName | PASS | All present in npcSchema (lines 7-17) |
| Schema enforces min 3 tags | PASS | z.array(z.string()).min(3).max(10) |
| Schema enforces min 1 shortTerm goal | PASS | z.array(z.string()).min(1).max(3) |
| Schema enforces min 1 longTerm goal | PASS | z.array(z.string()).min(1).max(2) |
| All 3 functions return GeneratedNpc type | PASS | z.infer<typeof npcSchema> |
| No 500 errors from validation failures | PASS | All validation errors return 400/422 with descriptive messages |

## Route Integration Checks

| Check | Result | Detail |
|-------|--------|--------|
| parse-character role=key calls parseNpcDescription | PASS | character.ts line 42 |
| generate-character role=key calls generateNpcFromArchetype | PASS | character.ts line 70 |
| import-v2-card role=key calls mapV2CardToNpc | PASS | character.ts line 133 |
| research-character role=key calls generateNpcFromArchetype with researchContext | PASS | character.ts line 104 |
| All key routes return { role: "key", npc } | PASS | Consistent response format |

## Summary

- **Route handling:** All 3 creation mode endpoints correctly accept requests, validate input via Zod schemas, and route to appropriate NPC generation functions for role=key.
- **Schema consistency:** All modes share a single `npcSchema` (name, persona, tags, goals, locationName, factionName).
- **LLM generation:** SKIPPED due to GLM 4.7 Flash provider failing to produce parseable structured output via `generateObject`. This is a provider compatibility issue, not a code defect. The `structuredOutputs: false` setting means the AI SDK uses prompt-based JSON extraction, which GLM does not reliably support.
- **Error handling:** All endpoints return descriptive validation errors (400/422) for invalid input -- no 500 crashes.

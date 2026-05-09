# Phase 73 Structured Output Inventory

Purpose: classify every current production LLM generation seam before changing `safeGenerateObject`.

Classification vocabulary:

- `native_schema`: object-shaped output that should use provider-native schema mode first once Plan 73-02 rewires `safeGenerateObject`.
- `native_json`: JSON-only provider mode without schema guarantee. No current seam requires this as primary.
- `tool_mode`: provider tool-call mode where validated runtime tools are the primary model output channel.
- `text_fallback`: explicit JSON/prose fallback path where text extraction remains allowed.
- `unstructured_prose`: intentionally free-form narration, smoke response, or creative prose. Do not route as structured output.

| file | line/anchor | caller | schema/domain | classification | required_strategy | fallback_allowed | notes |
|------|-------------|--------|---------------|----------------|-------------------|------------------|-------|
| `backend/src/ai/generate-object-safe.ts` | 543, 616 | `attemptRepair`, `attemptGenerate` | shared object repair and current text JSON extraction | text_fallback | text_fallback | yes | Current shared boundary uses `generateText`; Plan 73-02 may add native first, but text repair remains secondary. |
| `backend/src/ai/structured-output-conformance.ts` | 273 | `runStructuredOutputConformance` | provider/model/schema conformance case objects | native_schema | native_schema | text_fallback | Non-mutating harness case runner records strategy, repair, and semantic pass/fail without campaign mutation or secrets. |
| `backend/src/ai/storyteller.ts` | 38 | `streamStoryteller` | final storyteller narration stream | unstructured_prose | unstructured_prose | no | Final prose is intentionally not structured output. |
| `backend/src/ai/test-connection.ts` | 18 | `testProviderConnection` | one-word provider connectivity smoke | unstructured_prose | unstructured_prose | no | Connectivity probe only; no schema authority. |
| `backend/src/character/archetype-researcher.ts` | 22 | `researchArchetype` | archetype research prose | unstructured_prose | unstructured_prose | no | Research summary text, not a backend object contract. |
| `backend/src/character/generator.ts` | 208, 274, 341 | `generateCharacter` family | character draft generation | native_schema | native_schema | text_fallback | Character draft object remains backend-validated after generation. |
| `backend/src/character/ingestion/assess-original.ts` | 92 | `assessOriginalCharacterPowerStats` | original-character power stats | native_schema | native_schema | text_fallback | Mechanical power stats are parsed through Zod and existing retry behavior. |
| `backend/src/character/ingestion/synthesizer.ts` | 368 | `synthesizeCharacterDraft` | unified character ingestion draft | native_schema | native_schema | text_fallback | High-value object boundary; backend schema remains final authority. |
| `backend/src/character/known-ip-worldgen-research.ts` | 208, 302 | `repairKnownIpResearch`, `researchKnownIpWorldgenNpc` | known-IP NPC research and repair | native_schema | native_schema | text_fallback | Preserve artifact-backed known-IP dispatch invariants. |
| `backend/src/character/npc-generator.ts` | 211, 274 | `generateNpc` family | NPC draft/detail generation | native_schema | native_schema | text_fallback | NPC object generation with backend draft validation. |
| `backend/src/engine/actor-brain.ts` | 102 | `runActorBrainDecision` | key-actor decision packet | native_schema | native_schema | text_fallback | Actor co-player packet is schema-validated before action planning or persistence. |
| `backend/src/engine/hidden-adjudication.ts` | 86 | `runHiddenAdjudicationPlan` | adjudication plan actions | native_schema | native_schema | text_fallback | Judge-owned hidden plan object; backend executor validates actions. |
| `backend/src/engine/gm-action-checklist.ts` | 520 | `runGmActionChecklist` | GM executable checklist object | native_schema | native_schema | text_fallback | Checklist is schema-validated and runtime tool inputs are backend-validated before tool execution. |
| `backend/src/engine/gm-beat-plan.ts` | 918 | `runGmBeatPlan` | GM beat plan object | native_schema | native_schema | text_fallback | Beat plan is structured planning only; executable payloads are rejected before tool-loop use. |
| `backend/src/engine/gm-tool-loop.ts` | 480 | `runGmToolLoop` | GM runtime tool-call loop | tool_mode | tool_mode | no | Runtime tools are the output channel; backend tool schemas and executors remain authoritative. |
| `backend/src/engine/gm-tool-step.ts` | 587 | `runGmToolStepRevision` | single tool-step candidate request | native_schema | native_schema | text_fallback | Step revision proposes one validated tool request and rejects ungrounded candidate refs. |
| `backend/src/engine/gm-turn-read.ts` | 676, 746 | `runGmRead` | GM scene read object | native_schema | native_schema | text_fallback | GM read classifies the turn path and evidence refs before tool planning or direct narration. |
| `backend/src/engine/gm-turn-decision.ts` | 321 | `runGmTurnDecision` | GM/Judge turn decision object | native_schema | native_schema | text_fallback | GM-owned semantic decision seam; backend validates selected path, refs, and tools before any Oracle or ScenePlan execution. |
| `backend/src/engine/npc-agent.ts` | 436 | `tickNpcAgentInternal` | NPC autonomous decision text/tool response | unstructured_prose | unstructured_prose | no | Direct `generateText` agent decision path; not `safeGenerateObject`. |
| `backend/src/engine/npc-offscreen.ts` | 493 | `runNpcOffscreen` | offscreen NPC plan/object | native_schema | native_schema | text_fallback | Structured offscreen result remains backend parsed. |
| `backend/src/engine/oracle.ts` | 148 | `callOracle` | Oracle ruling object | native_schema | native_schema | text_fallback | Oracle is a structured judge boundary, not final narration. |
| `backend/src/engine/prompt-assembler.ts` | 200 | `compressContext` | context compression object | native_schema | native_schema | text_fallback | Compression returns indexed selections for backend use. |
| `backend/src/engine/reflection-agent.ts` | 163 | `runReflectionAgent` | reflection prose response | unstructured_prose | unstructured_prose | no | Direct prose generation path; not classified as structured output. |
| `backend/src/engine/scene-planner.ts` | 189, 207 | `runScenePlanner` | ScenePlan strict/loose object | native_schema | native_schema | text_fallback | Highest-risk ScenePlan object boundary; Plan 73-03 will redesign model-facing contract. |
| `backend/src/engine/target-context.ts` | 177 | `detectTarget` | target-detection object | native_schema | native_schema | text_fallback | Target inference object feeds deterministic backend target resolution. |
| `backend/src/engine/turn-processor.ts` | 330 | `detectMovementIntent` | movement intent object | native_schema | native_schema | text_fallback | Small object classifier before backend movement handling. |
| `backend/src/engine/turn-processor.ts` | 629 | `assembleFinalNarrationPrompt` caller | final visible narration prose | unstructured_prose | unstructured_prose | no | Final narration must stay prose-only and storyteller-owned. |
| `backend/src/engine/world-brain.ts` | 374, 406 | `runWorldBrainSceneDirection` | world-brain scene direction object | native_schema | native_schema | text_fallback | Bounded causal packet; backend filters player-perceivable fields. |
| `backend/src/engine/world-engine.ts` | 126 | `generateWorldEvent` | world event prose | unstructured_prose | unstructured_prose | no | Direct text generation for event prose, not structured output. |
| `backend/src/engine/world-forecast-builder.ts` | 462 | `runWorldForecastBuilder` | advisory world forecast object | native_schema | native_schema | text_fallback | Forecast stays advisory; durable world state still requires source-backed tools/events. |
| `backend/src/routes/ai.ts` | 70 | `/api/ai/test-role` handler | role test response prose | unstructured_prose | unstructured_prose | no | Diagnostic route; no backend object contract. |
| `backend/src/scripts/backfill-personality.ts` | 357 | `backfillPersonalityBatch` | personality backfill object | native_schema | native_schema | text_fallback | Script path, but still a shared object-generation seam under `backend/src`. |
| `backend/src/worldbook-library/composition.ts` | 127, 189 | `composeWorldbookContext` | worldbook composition objects | native_schema | native_schema | text_fallback | Source-library selection/composition object output. |
| `backend/src/worldgen/ip-researcher.ts` | 107, 179, 279, 498, 532, 606, 628, 694, 753 | `researchIpContext`, `researchWorldgenArtifact`, sufficiency/extraction helpers | IP context, artifact brief, generated context, sufficiency objects | native_schema | native_schema | text_fallback | Includes citation/canonicalNames failure class; backend artifact parser remains final authority. |
| `backend/src/worldgen/lore-extractor.ts` | 214, 239 | `extractLoreCards` | lore-card extraction object | native_schema | native_schema | text_fallback | Lore cards are structured before persistence/search use. |
| `backend/src/worldgen/premise-divergence.ts` | 143 | `analyzePremiseDivergence` | premise divergence object | native_schema | native_schema | text_fallback | Legacy compatibility object boundary. |
| `backend/src/worldgen/scaffold-steps/factions-step.ts` | 88, 131 | `generateFactionsStep` | faction plan/detail objects | native_schema | native_schema | text_fallback | Worldgen scaffold object generation. |
| `backend/src/worldgen/scaffold-steps/locations-step.ts` | 87, 128 | `generateLocationsStep` | location plan/detail objects | native_schema | native_schema | text_fallback | Worldgen scaffold object generation. |
| `backend/src/worldgen/scaffold-steps/npcs-step.ts` | 330, 408, 563, 607 | `generateNpcsStep` | NPC plan/detail/personality/repair objects | native_schema | native_schema | text_fallback | Protects Phase 72 artifact-backed Gojo known-IP dispatch adjacency. |
| `backend/src/worldgen/scaffold-steps/placement-expansion-step.ts` | 136 | `expandNpcPlacementScenes` | cast-driven NPC placement scene expansion object | native_schema | native_schema | text_fallback | Repairs dense-world placement by asking the model for actor-specific scene anchors before persistence. |
| `backend/src/worldgen/scaffold-steps/premise-step.ts` | 93 | `refinePremise` | refined premise object | native_schema | native_schema | text_fallback | Structured refined-premise primary path. |
| `backend/src/worldgen/scaffold-steps/premise-step.ts` | 107 | `refinePremise` fallback | refined premise direct prose fallback | text_fallback | text_fallback | yes | Explicit direct `generateText` fallback path after object generation failure. |
| `backend/src/worldgen/scaffold-steps/regen-helpers.ts` | 52, 128, 214 | `regenerateLocationEntity`, `regenerateFactionEntity`, `regenerateNpcEntity` | regenerate-section entity objects | native_schema | native_schema | text_fallback | Regeneration structured outputs before save-back. |
| `backend/src/worldgen/scaffold-steps/validation.ts` | 71, 149 | `validateAndFixStage`, `validateCrossStage` | scaffold validation/fix objects | native_schema | native_schema | text_fallback | Validation authority remains backend-side after object generation. |
| `backend/src/worldgen/seed-suggester.ts` | 144, 153, 225, 235 | `suggestSeeds`, `suggestSingleSeed` | seed suggestion objects | native_schema | native_schema | text_fallback | Seed object suggestions, including compatibility retry paths. |
| `backend/src/worldgen/starting-location.ts` | 55 | `resolveStartingLocation` | starting-location object | native_schema | native_schema | text_fallback | Backend validates resolved location result. |
| `backend/src/worldgen/worldbook-importer.ts` | 235 | `importWorldbook` | worldbook import object | native_schema | native_schema | text_fallback | Worldbook import extraction before backend persistence. |

## Current Direct `generateObject` Import Guard

Static test `backend/src/ai/__tests__/structured-output-boundary.test.ts` fails if production code imports `generateObject` directly from `ai` outside `backend/src/ai/generate-object-safe.ts`.

## Notes For Later Plans

- Plan 73-02 should treat `native_schema` rows as candidates for native-first AI SDK `Output.object` and keep `text_fallback` observable.
- Plan 73-03 should not treat `backend/src/engine/turn-processor.ts` final narration or `backend/src/ai/storyteller.ts` streaming as structured output.
- Plan 73-04 conformance reports should key results by provider id/name, model, protocol, base URL family, transport, schema case, requested mode, and actual strategy.

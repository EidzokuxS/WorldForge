# Phase 74: Structured Prompt Contracts and Model-Facing Schema Hardening - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning
**Source:** User correction during live `/action` structured-output failures after Phase 73

<domain>
## Phase Boundary

Phase 74 exists because Phase 73 made structured-output transport and repair more reliable, but it did not prove that every model-facing prompt clearly tells the model what object shape to produce.

The goal is not another narrow ScenePlan patch. The goal is a project-wide prompt-contract pass over all production structured-output seams: gameplay judge objects, world-brain/oracle/target classifiers, worldgen research/scaffold/regeneration, character/power generation, and worldbook composition/import paths.

The phase must answer and implement:

- Where do we ask a model for JSON, object data, or tool-shaped output?
- Does the prompt show the exact expected shape, nested fields, enums/tool names, caps, nullable/optional rules, and examples where needed?
- Where are we forcing the model to infer shape from a Zod schema it may not actually see as natural instructions?
- Which failures should be prevented by better prompting, which can be deterministic form repair, and which must fail closed because backend would otherwise invent semantics?
- How do we prove this across all high-risk seams instead of waiting for the next live restore?

</domain>

<decisions>
## Locked Decisions

### Scope

- Treat structured-output stability as a class problem, not as the last stack frame that happened to fail.
- Use the Phase 73 inventory as input, but refresh it into a prompt-contract audit. Phase 73 classified boundaries; Phase 74 evaluates whether each boundary gives the model a clear contract before generation.
- Cover all production `safeGenerateObject` callers, including files that alias it as `generateObject`.
- Include direct structured/prose boundary checks for `generateText` paths only when they ask for JSON or tool-like data.

### Model-Facing Contract Standard

- Every non-trivial structured-output prompt must include explicit instructions for required fields, nested arrays/objects, allowed enum values, allowed tool names, string caps, max list sizes, optional/null behavior, and a compact valid example.
- A prompt that says only "return JSON", "return structured data", or "use the schema fields" is insufficient for high-risk paths.
- The model should not be expected to invent hidden backend fields, UUIDs, action IDs, event IDs, or mechanical refs when backend can derive them deterministically.
- If a tool/action has nested input shape, the model-facing prompt must show that nested shape. It is not enough to list the top-level `toolName`.

### Backend Authority

- Backend remains final deterministic authority for validation, caps, execution, rollback, and persistence.
- Backend may deterministically trim strings, cap arrays, map known aliases, generate backend IDs, resolve actor refs from explicit allowed labels/IDs, and drop optional non-executable UI outputs when no recoverable shape exists.
- Backend must not invent semantic lore, source roles, targets, actor intent, power facts, tool actions, quick action labels, or canonical truth to make a schema pass.
- If required semantics are missing, the correct fixes are: better initial prompt, targeted LLM repair with exact issues and target contract, or fail closed with a logged root cause.

### Verification Expectations

- Tests must assert prompt-contract presence and content, not only that Zod repair can recover broken output.
- Representative regression fixtures must cover the observed failure classes: `citations` string vs array, `canonicalNames` string vs object, overlong metadata, missing nested `input.actions[].action`, `payload` vs `input`, missing/unsupported `toolName`, malformed optional quick actions, and underspecified power stats.
- Conformance must distinguish primary success from fallback/repair success. A provider that only passes after repair is not "stable" for the prompt-contract case.

### Non-Goals

- Do not remove Zod. Zod remains the final boundary.
- Do not make backend semantically interpret user premises or canon meaning.
- Do not rewrite the entire worldgen/gameplay architecture.
- Do not claim live writing quality is solved by structured-output contract hardening.

</decisions>

<canonical_refs>
## Canonical References

### Phase 73 Baseline

- `.planning/phases/73-structured-output-stability-and-provider-conformance/73-STRUCTURED-OUTPUT-INVENTORY.md` - existing production generation seam inventory and classification.
- `.planning/phases/73-structured-output-stability-and-provider-conformance/73-02-PLAN.md` - native-first `safeGenerateObject` and explicit fallback/repair trace contract.
- `.planning/phases/73-structured-output-stability-and-provider-conformance/73-03-PLAN.md` - semantic ScenePlan mapping and backend-generated IDs.
- `.planning/phases/73-structured-output-stability-and-provider-conformance/73-04-PLAN.md` - structured-output conformance harness.
- `.planning/phases/73-structured-output-stability-and-provider-conformance/73-05-PLAN.md` - observed worldgen regressions locked as tests.

### Current Code Surfaces

- `backend/src/ai/generate-object-safe.ts` - shared generation boundary, strategy labels, text fallback, repair.
- `backend/src/ai/structured-output-conformance.ts` - provider/model/schema conformance cases.
- `backend/src/engine/scene-planner.ts` - highest-risk normal-turn structured ScenePlan boundary.
- `backend/src/engine/semantic-scene-plan-schema.ts` - model-authored semantic ScenePlan schema and mapper.
- `backend/src/engine/tool-schemas.ts` - runtime tool input schemas that nested prompt contracts must expose.
- `backend/src/engine/hidden-adjudication.ts` - hidden judge action-plan object boundary.
- `backend/src/engine/world-brain.ts` - bounded scene-direction object boundary.
- `backend/src/engine/oracle.ts` - Oracle ruling object boundary.
- `backend/src/engine/target-context.ts` - target-detection object boundary.
- `backend/src/engine/turn-processor.ts` - movement-intent structured classifier and final prose routes.
- `backend/src/worldgen/ip-researcher.ts` - v1/v2 research objects, generated context, sufficiency, extraction.
- `backend/src/worldgen/research-artifact.ts` - artifact schema and deterministic external-data caps.
- `backend/src/worldgen/scaffold-steps/` - worldgen entity plan/detail/regeneration/validation outputs.
- `backend/src/character/known-ip-worldgen-research.ts` - known-IP power assessment and repair, currently a useful example of explicit target-shape prompt text.
- `backend/src/character/generator.ts`, `backend/src/character/npc-generator.ts`, `backend/src/character/ingestion/` - character draft and power-stat object generation.
- `backend/src/worldbook-library/composition.ts`, `backend/src/worldgen/worldbook-importer.ts` - worldbook structured extraction/composition.

</canonical_refs>

<specifics>
## Initial Audit Findings

- Phase 73's static guard prevents direct production imports of AI SDK `generateObject`, but many production files still call `safeGenerateObject` through the alias `generateObject`. That makes the local prompt text the real contract the model sees.
- The current inventory lists roughly forty object-generation call sites across gameplay, worldgen, character, worldbook, and scripts. Sixteen production sites call `safeGenerateObject` directly or via role wrappers; many more use the `safeGenerateObject as generateObject` alias.
- `buildGeneratedContextPrompt` tells the model to compile `generatedContext`, but it does not spell out `citations: [{ jobId?, url?, note }]` or `canonicalNames: { locations?, factions?, characters? }`. This matches the observed `citations` string / `canonicalNames` string failure class.
- `buildWorldBrainPrompt` says "Return only the bounded structured scene-direction object" without showing the concrete fields and caps.
- `buildJudgeAdjudicationContract` says "structured data only" and "Plan only actions", but the effective messages must also show the action object shape and nested runtime tool inputs.
- `buildDefaultScenePlannerPrompt` lists semantic fields and allowed tool names, but nested tool input contracts are still not visible enough for complex tools such as `offer_quick_actions`.
- Character generator prompts that list field names are better than bare JSON prompts, but still need a check for nested/capped shapes and examples on rich schemas.
- `known-ip-worldgen-research.ts` repair prompt is a useful pattern because it explicitly lists the target fields, allowed tier values, rank ranges, and validation failures. Phase 74 should generalize this style without over-bloating every prompt.

</specifics>

<deferred>
## Deferred Ideas

- Model ranking/selection based on literary quality is not part of this phase.
- Full live gameplay playtest is still a separate milestone-quality gate.
- Provider-specific response-format negotiation was handled in Phase 73; Phase 74 may add conformance cases but should not redesign provider registry unless the audit proves a gap.

</deferred>

---

*Phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin*
*Context gathered: 2026-04-28 via user correction and code inventory*

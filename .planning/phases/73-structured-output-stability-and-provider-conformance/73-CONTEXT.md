# Phase 73: Structured Output Stability and Provider Conformance - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning
**Source:** PRD Express Path (`.planning/phases/73-structured-output-stability-and-provider-conformance/73-PRD.md`)

<domain>
## Phase Boundary

Phase 73 must address the root cause behind recurring Zod/structured-output failures in WorldForge. The expected result is not another local alias/sanitizer patch. The phase must make object-generation calls more stable by using provider-native schema/tool mechanisms where possible, by measuring provider/model conformance before long-running flows trust them, and by redesigning the highest-risk model-facing contracts so LLMs output semantic decisions instead of backend-owned mechanical state.

The phase is bounded to the structured-output boundary and representative downstream consumers. It may touch `safeGenerateObject`, provider/model capability handling, ScenePlan model-facing contracts, conformance harnesses, and regression tests for already-observed failures. It must not expand into new gameplay features, broad UI redesign, or unrelated worldgen semantics.

</domain>

<decisions>
## Implementation Decisions

### Root Cause Framing

- Treat the current failures as primarily a harness/schema design problem unless conformance tests prove a specific provider/model cannot support the required mode.
- `generateText` plus "return JSON only" plus JSON extraction is not equivalent to structured output.
- Retry loops that repeat the same prompt/schema after a structural failure are not sufficient. Repair/fallback is a secondary guardrail, not the primary contract.
- Backend should keep Zod and deterministic validation; the goal is to reduce malformed model output before it hits Zod, not remove Zod.

### Native Structured Output

- `safeGenerateObject` should attempt AI SDK structured output first for compatible providers/models, using the repo's installed AI SDK v6 `generateText({ output: Output.object({ schema }) })` path.
- Text extraction/repair remains available as an explicit fallback for OpenAI-compatible gateways/models that reject or ignore schema output.
- The fallback must be observable so logs show whether a call used native schema, native JSON, tool mode, text fallback, repair, or full retry.
- Capability fallback must be per provider/model/transport, not a hidden global assumption.

### ScenePlan Contract

- Do not ask the model to invent, preserve, or cross-reference backend-owned UUIDs where backend code can derive them.
- The model should output semantic choices: actor selection from allowed aliases/IDs, intent, response kind, tool intent, and parameters.
- Backend code should generate action IDs, event/response IDs, narrator reference IDs, and final executable tool actions deterministically.
- Existing strict `ScenePlan` remains backend authority; introduce a model-facing semantic/loose contract and deterministic mapping rather than asking the LLM to write final database-ready state.

### Provider Conformance

- Build a local harness that runs representative schemas/prompts against configured providers/models before they are trusted in expensive worldgen/action flows.
- Include stress cases that match real failures: citation object arrays, canonical name object shape, ScenePlan actions, capped external metadata, enum/tool selection, and ID/reference mapping.
- Persist or report results by provider, model, schema, mode, latency, token usage, error type, repair usage, and semantic pass/fail.

### Deterministic Boundaries

- Backend continues to own mechanical caps, search result trimming, source authority persistence, tool execution validation, and power-stat dispatch routing.
- Native structured output cannot be treated as semantic correctness. It only improves syntax/schema adherence.
- User-visible long flows should fail before expensive execution if the selected model/provider cannot pass required structured-output conformance.

### the agent's Discretion

- Exact file/module decomposition is left to the implementing agent.
- Provider capability cache format is left to the implementing agent, but it must be inspectable in logs/tests.
- If AI SDK native structured output cannot work through a specific gateway, the agent may fall back to a documented text-only strategy for that provider while preserving observability.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 73 Input

- `.planning/phases/73-structured-output-stability-and-provider-conformance/73-PRD.md` — user problem, requirements, non-goals, acceptance criteria, external references.
- `.planning/ROADMAP.md` — Phase 73 goal, dependency, and requirement IDs.
- `.planning/REQUIREMENTS.md` — P73-R1 through P73-R7.

### Existing AI Boundary

- `backend/src/ai/generate-object-safe.ts` — current shared text JSON extraction, coercion, repair, and retry boundary.
- `backend/src/ai/provider-registry.ts` — provider protocol, OpenAI-compatible/Anthropic-compatible model construction, reasoning middleware.
- `backend/src/ai/__tests__/generate-object-safe.test.ts` — current regression coverage for Kimi/Mimo-style repair and trace behavior.

### Scene Planner Path

- `backend/src/engine/scene-planner.ts` — current model-facing ScenePlan prompt and strict-parse repair path.
- `backend/src/engine/scene-plan-schema.ts` — strict and loose ScenePlan schemas, sanitizer, runtime tool name normalization.
- `backend/src/engine/tool-schemas.ts` — backend-owned runtime tool input contracts.
- `backend/src/routes/chat.ts` — `/action` rollback/restore behavior and logs.

### Worldgen Structured-Output Path

- `backend/src/worldgen/ip-researcher.ts` — generated context/citations/canonicalNames structured-output path.
- `backend/src/worldgen/research-artifact.ts` — artifact parser/caps and external metadata sanitization.
- `backend/src/worldgen/scaffold-steps/validation.ts` — scaffold validation/fix structured-output path.
- `backend/src/worldgen/scaffold-steps/regen-helpers.ts` — regeneration structured-output path.
- `backend/src/worldgen/scaffold-steps/npcs-step.ts` — known-IP/original NPC generation and power dispatch adjacency.

### Prior Phase Context

- `.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-CONTEXT.md` — Scene Planner of Record intent.
- `.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-VERIFICATION.md` — current Phase 70 verification claims.
- `.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-CONTEXT.md` — LLM-owned premise/source authority boundary.
- `.planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md` — artifact authority regression audit context.
- `.planning/phases/72-worldgen-authority-propagation-regression-audit/72-VERIFICATION.md` — Phase 72 proof and remaining live-quality caveat.

### External References

- `https://platform.openai.com/docs/guides/structured-outputs` — Structured Outputs vs JSON mode and schema adherence.
- `https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data` — AI SDK v6 structured data generation with `Output.object`.
- `https://ai-sdk.dev/docs/reference/ai-sdk-core/output` — AI SDK output modes and `NoObjectGeneratedError`.
- `https://ai.google.dev/gemini-api/docs/structured-output` — Gemini structured-output schema mode and complexity limits.
- `https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools` — Claude tool input schema and tool description guidance.
- `https://openrouter.ai/docs/features/structured-outputs` — OpenRouter `response_format`/`json_schema` support for compatible models.

</canonical_refs>

<specifics>
## Specific Ideas

- First implementation step should be compatible: native-first `safeGenerateObject`, old text path as fallback, targeted tests for both branches.
- Add a strategy field in trace/log output rather than relying on log text inference.
- Add a conformance harness under backend scripts or tests that can run against configured providers without mutating campaign state.
- ScenePlan redesign should avoid asking the LLM for backend-generated action IDs and narrator reference graphs.
- If an output schema includes fields the model is bad at character-counting for, use backend deterministic caps after generation where semantic loss is acceptable metadata trimming.

</specifics>

<deferred>
## Deferred Ideas

- Full provider/model quality ranking for prose quality is out of scope. Phase 73 tests structured-output conformance, not final narration taste.
- Replacing the whole gameplay loop is out of scope. ScenePlan changes should stay inside the model-facing plan boundary and deterministic mapping/execution bridge.
- Removing legacy no-artifact worldgen compatibility is out of scope.

</deferred>

---

*Phase: 73-structured-output-stability-and-provider-conformance*
*Context gathered: 2026-04-27 via PRD Express Path*

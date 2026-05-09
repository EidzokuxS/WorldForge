# Phase 73 PRD: Structured Output Stability and Provider Conformance

## Problem

WorldForge still exposes users to long-running turn/worldgen failures caused by structured-output shape drift. Recent failures were not isolated:

- Worldgen research context returned `citations` as a string instead of an array of citation objects and `canonicalNames` as a string instead of an object.
- `/action` ScenePlan returned `plannedActions` with `payload` instead of `input`, missing repeated `actorId`/`toolName`, and invented action shapes.
- External search result metadata exceeded Zod caps and crashed strict artifact parsing.
- Artifact-backed canon NPCs could still fall through to original-character downstream assessment if authority signals were lost after research.

The root issue is not just "Zod is strict" or "model is weak". Current code often asks models to free-write JSON text, then extracts/parses/coerces it after the fact. For high-stakes schemas this is less reliable than provider-native structured output or tool schema modes, and several schemas ask the LLM to emit backend-owned mechanical details that should be derived deterministically.

## Evidence

### Local code

- `backend/src/ai/generate-object-safe.ts` currently uses `generateText`, appends JSON-only instructions, extracts balanced JSON from text, runs `JSON.parse`, coerces toward the Zod schema, then uses a repair LLM call.
- `SafeGenerateOpts.mode?: "json" | "tool"` exists but is not used.
- `backend/src/ai/provider-registry.ts` creates OpenAI-compatible models with Chat Completions for broad gateway compatibility, but has no structured-output capability registry.
- `backend/src/engine/scene-planner.ts` asks one model call to return a full `ScenePlan`: interpretation, anchor event, responses, planned backend actions, deferred hooks, narrator references, and hidden rationale.
- `backend/src/engine/scene-plan-schema.ts` strict plan data uses UUID references and discriminated backend tool unions. The current loose schema hardening is useful as a guardrail, but it is symptom repair, not the stable primary interface.

### External references

- OpenAI Structured Outputs distinguish JSON mode from schema adherence and recommend Structured Outputs when possible: `https://platform.openai.com/docs/guides/structured-outputs`.
- AI SDK v6 standardizes structured data through `generateText({ output: Output.object({ schema }) })`, with `Output.json()` explicitly validating JSON but not schema: `https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data` and `https://ai-sdk.dev/docs/reference/ai-sdk-core/output`.
- Gemini supports `response_mime_type: "application/json"` plus a JSON schema, but documents schema subset and complexity limits: `https://ai.google.dev/gemini-api/docs/structured-output`.
- Claude tool use defines tool `input_schema` as JSON Schema and relies on detailed tool descriptions for behavior: `https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools`.
- OpenRouter supports `response_format` with `json_schema` only for compatible models and gateway/provider combinations: `https://openrouter.ai/docs/features/structured-outputs`.

### Gemini CLI review

Gemini independently flagged the same primary failure mode: WorldForge is in an "uncanny valley" where the model is asked to behave like a deterministic compiler for UUIDs, unions, and object graphs while the app bypasses provider-native schema/tool mechanisms.

## Requirements

- **P73-R1**: All shared object-generation boundaries must be audited and classified as native structured output, tool call, text fallback, or intentionally unstructured prose.
- **P73-R2**: `safeGenerateObject` must become native-first for schema-capable providers via AI SDK structured output, while preserving an explicit text fallback for gateways/models that reject schema output.
- **P73-R3**: Provider/model structured-output capability must be observable and testable. The app must log whether a call used native schema, native JSON, tool mode, text fallback, repair, or full retry.
- **P73-R4**: ScenePlan must stop requiring the model to invent or preserve backend-owned IDs where backend code can derive them deterministically. The model should output semantic decisions; backend should map IDs, references, and executable actions.
- **P73-R5**: Long-running worldgen/action flows must not discover provider conformance failures only after user-visible minutes. Add a local benchmark/conformance harness covering configured providers/models and representative WorldForge schemas.
- **P73-R6**: Existing deterministic Zod/sanitization boundaries remain final authority. Native structured output reduces malformed objects, but backend validation, caps, authority propagation, and no-invented-mechanics rules stay deterministic.
- **P73-R7**: Verification must include targeted regressions for the observed Kimi/Mimo citations/canonicalNames failure, ScenePlan payload/missing-tool failure, overlong external metadata, and artifact-backed Gojo known-IP power dispatch.

## Non-Goals

- Do not remove Zod. Zod remains a backend contract and final validator.
- Do not trust model output with database IDs, mechanical truth, search result caps, or tool execution authority.
- Do not make OpenAI-only assumptions. OpenAI, OpenRouter/OpenCode-compatible gateways, GLM/Z.AI, Gemini, Anthropic, DeepSeek, Kimi/Moonshot, and Mimo-like models may differ by transport and capability.
- Do not hide failures by silently dropping meaningful user-requested content. Fallback/sanitization may normalize structure and cap metadata, but semantic loss must be logged or tested.

## Acceptance Criteria

- A phase plan exists that separates root-cause boundary work from ScenePlan semantic-contract redesign and provider conformance benchmarking.
- The first implementation step is compatible with existing callers and has a fallback path.
- Test coverage proves both native-first success and text-fallback repair behavior.
- Logs/trace data expose which strategy was used, so future failures can be diagnosed by provider/model/schema instead of by user-visible Zod stack traces.
- Final verification runs backend targeted tests, backend typecheck, relevant full backend suite where needed, and GitNexus change detection.

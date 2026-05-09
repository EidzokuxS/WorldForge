# Phase 73: Structured Output Stability and Provider Conformance - Research

**Researched:** 2026-04-27 [VERIFIED: current_date]
**Domain:** AI structured output boundary, provider conformance, ScenePlan semantic mapping [VERIFIED: 73-PRD.md]
**Confidence:** HIGH for planning shape, MEDIUM for provider-specific live capability until harness results exist [VERIFIED: 73-PRD.md; CITED: https://openrouter.ai/docs/features/structured-outputs]

<user_constraints>
## User Constraints (from CONTEXT.md)

Source: [VERIFIED: .planning/phases/73-structured-output-stability-and-provider-conformance/73-CONTEXT.md]

### Locked Decisions

#### Root Cause Framing

- Treat the current failures as primarily a harness/schema design problem unless conformance tests prove a specific provider/model cannot support the required mode.
- `generateText` plus "return JSON only" plus JSON extraction is not equivalent to structured output.
- Retry loops that repeat the same prompt/schema after a structural failure are not sufficient. Repair/fallback is a secondary guardrail, not the primary contract.
- Backend should keep Zod and deterministic validation; the goal is to reduce malformed model output before it hits Zod, not remove Zod.

#### Native Structured Output

- `safeGenerateObject` should attempt AI SDK structured output first for compatible providers/models, using the repo's installed AI SDK v6 `generateText({ output: Output.object({ schema }) })` path.
- Text extraction/repair remains available as an explicit fallback for OpenAI-compatible gateways/models that reject or ignore schema output.
- The fallback must be observable so logs show whether a call used native schema, native JSON, tool mode, text fallback, repair, or full retry.
- Capability fallback must be per provider/model/transport, not a hidden global assumption.

#### ScenePlan Contract

- Do not ask the model to invent, preserve, or cross-reference backend-owned UUIDs where backend code can derive them.
- The model should output semantic choices: actor selection from allowed aliases/IDs, intent, response kind, tool intent, and parameters.
- Backend code should generate action IDs, event/response IDs, narrator reference IDs, and final executable tool actions deterministically.
- Existing strict `ScenePlan` remains backend authority; introduce a model-facing semantic/loose contract and deterministic mapping rather than asking the LLM to write final database-ready state.

#### Provider Conformance

- Build a local harness that runs representative schemas/prompts against configured providers/models before they are trusted in expensive worldgen/action flows.
- Include stress cases that match real failures: citation object arrays, canonical name object shape, ScenePlan actions, capped external metadata, enum/tool selection, and ID/reference mapping.
- Persist or report results by provider, model, schema, mode, latency, token usage, error type, repair usage, and semantic pass/fail.

#### Deterministic Boundaries

- Backend continues to own mechanical caps, search result trimming, source authority persistence, tool execution validation, and power-stat dispatch routing.
- Native structured output cannot be treated as semantic correctness. It only improves syntax/schema adherence.
- User-visible long flows should fail before expensive execution if the selected model/provider cannot pass required structured-output conformance.

### Claude's Discretion

#### the agent's Discretion

- Exact file/module decomposition is left to the implementing agent.
- Provider capability cache format is left to the implementing agent, but it must be inspectable in logs/tests.
- If AI SDK native structured output cannot work through a specific gateway, the agent may fall back to a documented text-only strategy for that provider while preserving observability.

### Deferred Ideas (OUT OF SCOPE)

- Full provider/model quality ranking for prose quality is out of scope. Phase 73 tests structured-output conformance, not final narration taste.
- Replacing the whole gameplay loop is out of scope. ScenePlan changes should stay inside the model-facing plan boundary and deterministic mapping/execution bridge.
- Removing legacy no-artifact worldgen compatibility is out of scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| P73-R1 | All shared object-generation boundaries are audited and classified as native structured output, tool call, text fallback, or intentionally unstructured prose. | `rg` found shared `safeGenerateObject` use across AI, engine, worldgen, worldbook, and scripts; GitNexus says `safeGenerateObject` touches 18 upstream dependents and 4 execution flows, so planning must start with an inventory task. [VERIFIED: rg safeGenerateObject/generateText/tool output; VERIFIED: GitNexus impact safeGenerateObject] |
| P73-R2 | `safeGenerateObject` is native-first for schema-capable providers via AI SDK structured output, while preserving an explicit text fallback for gateways/models that reject schema output. | AI SDK v6 docs and installed types support `generateText` with `Output.object({ schema })`; current `safeGenerateObject` only uses text JSON extraction and repair, so the first implementation wave should add a native branch without breaking callers. [CITED: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0; VERIFIED: node_modules/ai/dist/index.d.ts; VERIFIED: backend/src/ai/generate-object-safe.ts] |
| P73-R3 | Provider/model structured-output capability is observable and testable; traces distinguish native schema, native JSON, tool mode, text fallback, repair, and full retry. | Current trace fields expose text, cleaned text, usage, response, provider metadata, finish reason, and repair info, but no strategy/capability taxonomy; planning needs a trace schema update and tests for each strategy label. [VERIFIED: backend/src/ai/generate-object-safe.ts; VERIFIED: backend/src/ai/__tests__/generate-object-safe.test.ts] |
| P73-R4 | ScenePlan no longer requires the model to invent or preserve backend-owned IDs where backend code can derive them deterministically. | Current strict ScenePlan uses UUID-heavy response/action/narrator references while `scene-planner.ts` asks the model for one database-ready object, so planning needs a semantic model-facing schema plus deterministic mapper into strict backend ScenePlan. [VERIFIED: backend/src/engine/scene-planner.ts; VERIFIED: backend/src/engine/scene-plan-schema.ts] |
| P73-R5 | A local benchmark/conformance harness covers configured providers/models and representative WorldForge schemas before long-running flows trust them. | Provider registry currently records provider id, protocol, base URL, API key, and model but has no structured-output capability registry, so planning needs a non-mutating conformance harness keyed by provider/model/protocol/mode. [VERIFIED: backend/src/ai/provider-registry.ts; VERIFIED: 73-PRD.md] |
| P73-R6 | Deterministic Zod/sanitization boundaries remain final authority for caps, authority propagation, no-invented-mechanics rules, and executable tool validation. | Research artifact schemas already enforce caps and tool schemas already define backend-owned runtime tool inputs; native structured output should feed those validators, not replace them. [VERIFIED: backend/src/worldgen/research-artifact.ts; VERIFIED: backend/src/engine/tool-schemas.ts] |
| P73-R7 | Regression coverage includes the observed Kimi/Mimo citations/canonicalNames failure, ScenePlan payload/missing-tool failure, overlong external metadata, and artifact-backed Gojo known-IP power dispatch. | Existing tests cover part of Kimi/Mimo repair and research artifact caps, but Phase 73 needs explicit native/fallback strategy tests, semantic ScenePlan mapping tests, and known-IP power routing tests. [VERIFIED: backend/src/ai/__tests__/generate-object-safe.test.ts; VERIFIED: backend/src/worldgen/__tests__/research-artifact.test.ts; VERIFIED: backend/src/worldgen/scaffold-steps/npcs-step.ts] |
</phase_requirements>

## Summary

Phase 73 should be planned as three coordinated workstreams: shared object-generation boundary hardening, ScenePlan contract redesign, and provider conformance gating. [VERIFIED: 73-PRD.md; VERIFIED: GitNexus impact safeGenerateObject] The shared boundary is high-risk because GitNexus marks `safeGenerateObject` impact as CRITICAL with direct callers in worldgen, engine, oracle, hidden adjudication, and library import flows. [VERIFIED: GitNexus impact safeGenerateObject]

The primary technical move is not to delete the existing text fallback, but to add a native-first strategy inside `safeGenerateObject` using AI SDK v6 `generateText({ output: Output.object({ schema }) })`, then keep text extraction/repair as an observable fallback for providers or gateways that reject or ignore schema output. [CITED: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0; VERIFIED: backend/src/ai/generate-object-safe.ts] Zod and deterministic backend validators remain the final authority because provider-native structured output improves syntactic/schema adherence but does not prove semantic truth, authority propagation, caps, or executable tool safety. [VERIFIED: 73-CONTEXT.md; VERIFIED: backend/src/worldgen/research-artifact.ts; VERIFIED: backend/src/engine/tool-schemas.ts]

**Primary recommendation:** Plan Wave 1 around a compatible native-first `safeGenerateObject` strategy/trace refactor, Wave 2 around semantic ScenePlan output plus deterministic mapping, and Wave 3 around conformance harness gates and regressions. [VERIFIED: 73-PRD.md; VERIFIED: GitNexus impact safeGenerateObject]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Structured object generation strategy | API / Backend | External AI provider | `safeGenerateObject` lives in backend AI code and calls provider models, so backend owns strategy selection, fallback, trace, validation, and errors. [VERIFIED: backend/src/ai/generate-object-safe.ts; VERIFIED: backend/src/ai/provider-registry.ts] |
| Provider/model capability conformance | API / Backend | External AI provider | Provider capabilities vary by provider/model/transport, so backend must probe and record local results before expensive backend flows trust a mode. [VERIFIED: backend/src/ai/provider-registry.ts; CITED: https://openrouter.ai/docs/features/structured-outputs] |
| ScenePlan semantic decision output | API / Backend | External AI provider | The model can choose semantic intent and tool intent, but backend owns IDs, references, strict plan mapping, and executable actions. [VERIFIED: backend/src/engine/scene-planner.ts; VERIFIED: backend/src/engine/scene-plan-schema.ts] |
| Tool input validation | API / Backend | Database / Storage | Runtime tool schemas are backend contracts and tool execution can mutate persisted game state, so backend validation must remain authoritative. [VERIFIED: backend/src/engine/tool-schemas.ts] |
| Worldgen research artifact caps and source authority | API / Backend | Database / Storage | Research artifact parsing trims/caps external metadata and persists canonical authority signals before worldgen consumers use them. [VERIFIED: backend/src/worldgen/research-artifact.ts; VERIFIED: backend/src/worldgen/ip-researcher.ts] |
| Test and conformance reporting | API / Backend | Filesystem / logs | Existing backend tests run through Vitest, and Phase 73 harness results should be non-mutating reports keyed by provider/model/schema/mode. [VERIFIED: backend/vitest.config.ts; VERIFIED: 73-CONTEXT.md] |

## Project Constraints (from AGENTS.md)

- Use GitNexus for unfamiliar code exploration and impact analysis before editing functions/classes/methods; the Phase 73 planning target `safeGenerateObject` already has CRITICAL upstream impact. [VERIFIED: AGENTS.md; VERIFIED: GitNexus impact safeGenerateObject]
- Run `gitnexus_detect_changes()` before committing implementation changes; docs-only research is not a code-symbol edit, but later Phase 73 code commits must include this gate. [VERIFIED: AGENTS.md]
- If a GitNexus tool reports stale index, run `npx gitnexus analyze`; this research did that and status returned current commit `ea877c2`. [VERIFIED: npx gitnexus status; VERIFIED: npx gitnexus analyze]
- Do not rename symbols with find-and-replace; use GitNexus rename preview if Phase 73 renames any shared boundary symbols. [VERIFIED: AGENTS.md]
- Keep fixes root-cause-oriented and minimally scoped; Phase 73 should not expand into new gameplay features or broad UI work. [VERIFIED: AGENTS.md; VERIFIED: 73-CONTEXT.md]

## Project Lessons That Affect Planning

- Long worldgen should not expose users to late Zod failures; validation should be moved earlier where possible. [VERIFIED: tasks/lessons.md]
- Zod-boundary work includes external tool-data caps, not only model output shape. [VERIFIED: tasks/lessons.md]
- Artifact-backed canon NPC generation must preserve known-IP authority so canon characters do not fall into original-character downstream assessment. [VERIFIED: tasks/lessons.md; VERIFIED: backend/src/worldgen/scaffold-steps/npcs-step.ts]
- ScenePlan loose-schema hardening is a guardrail, not a substitute for a model-facing contract that avoids backend mechanical state. [VERIFIED: tasks/lessons.md; VERIFIED: backend/src/engine/scene-plan-schema.ts]

## Standard Stack

### Core

| Library | Installed Version | Registry Latest | Purpose | Why Standard |
|---------|-------------------|-----------------|---------|--------------|
| `ai` | 6.0.106 | 6.0.168, modified 2026-04-20 | Shared AI SDK core for `generateText`, `Output.object`, tools, errors, and provider abstraction. [VERIFIED: package.json; VERIFIED: node require package; VERIFIED: npm view ai version time.modified] | Use installed AI SDK v6 because Phase 73 is a stability phase and the current dependency already contains the needed `Output.object` and `NoObjectGeneratedError` APIs. [VERIFIED: node_modules/ai/dist/index.d.ts; CITED: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0] |
| `@ai-sdk/openai` | 3.0.37 | 3.0.53, modified 2026-04-19 | OpenAI-compatible provider construction for OpenAI/OpenRouter/Ollama-style endpoints. [VERIFIED: backend/package.json; VERIFIED: backend/src/ai/provider-registry.ts; VERIFIED: npm view @ai-sdk/openai version time.modified] | Keep provider construction centralized in `provider-registry.ts` so capability labels include provider/model/transport instead of global assumptions. [VERIFIED: backend/src/ai/provider-registry.ts] |
| `@ai-sdk/anthropic` | 3.0.51 | 3.0.71, modified 2026-04-19 | Anthropic-compatible provider construction. [VERIFIED: backend/package.json; VERIFIED: backend/src/ai/provider-registry.ts; VERIFIED: npm view @ai-sdk/anthropic version time.modified] | Anthropic support should go through the existing provider registry path and tool/schema tests rather than bespoke call sites. [VERIFIED: backend/src/ai/provider-registry.ts] |
| `zod` | 4.3.6 | 4.3.6, modified 2026-01-25 | Runtime schema validation and typed parse/safeParse boundaries. [VERIFIED: backend/package.json; VERIFIED: npm view zod version time.modified] | Zod remains final backend authority; docs confirm `safeParse` returns success/data or error/issues without throwing. [CITED: https://context7.com/colinhacks/zod/llms.txt; VERIFIED: 73-CONTEXT.md] |
| `vitest` | 3.2.4 | 4.1.5, modified 2026-04-23 | Backend unit/regression test runner. [VERIFIED: backend/package.json; VERIFIED: npx vitest --version; VERIFIED: npm view vitest version time.modified] | Use the existing backend Vitest setup for deterministic mocked strategy tests and non-mutating conformance harness tests. [VERIFIED: backend/vitest.config.ts; VERIFIED: backend/src/ai/__tests__/generate-object-safe.test.ts] |
| `typescript` | 5.9.3 | 6.0.3, modified 2026-04-16 | Backend typechecking. [VERIFIED: backend/package.json; VERIFIED: npx tsc --version; VERIFIED: npm view typescript version time.modified] | Run `npm --prefix backend run typecheck` as the phase gate because Phase 73 changes shared typed contracts. [VERIFIED: backend/package.json] |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| `tsx` | 4.21.0 in `backend/devDependencies` | TypeScript script execution for existing backend scripts. [VERIFIED: backend/package.json] | Use only if the planner verifies workspace execution works; `require('tsx/package.json')` from root reported missing, so Vitest or compiled JS is safer for the conformance harness unless dependency resolution is fixed. [VERIFIED: node package availability probe] |
| GitNexus | 1.6.1 status output | Impact analysis and change detection for code edits. [VERIFIED: npx gitnexus status] | Use before editing shared symbols and before committing implementation changes. [VERIFIED: AGENTS.md] |
| Context7 CLI | available through `npx ctx7@latest` | Current library documentation lookup. [VERIFIED: ctx7 CLI docs command output] | Use again if planner needs API details beyond `Output.object`, `NoObjectGeneratedError`, or Zod parse behavior. [VERIFIED: ctx7 CLI docs command output] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `Output.object` first | Keep JSON-only prompt extraction as primary | Text extraction is already present but is the diagnosed unstable path and does not provide native schema enforcement. [VERIFIED: backend/src/ai/generate-object-safe.ts; VERIFIED: 73-PRD.md] |
| Shared provider capability resolver | Per-call ad hoc try/catch fallback | Ad hoc fallback would hide provider/model/transport conformance and make future Zod failures hard to diagnose. [VERIFIED: 73-CONTEXT.md; VERIFIED: backend/src/ai/generate-object-safe.ts] |
| Semantic ScenePlan contract | Continue asking for final strict ScenePlan | Strict ScenePlan asks the model for backend IDs, discriminated tool unions, and narrator references that backend can derive deterministically. [VERIFIED: backend/src/engine/scene-planner.ts; VERIFIED: backend/src/engine/scene-plan-schema.ts] |
| Local conformance harness | Discover failures inside full worldgen/action flows | The PRD requires early detection before user-visible long flows spend minutes and fail. [VERIFIED: 73-PRD.md] |

**Installation:**

```bash
# No new package is required for the first compatible implementation wave. [VERIFIED: backend/package.json; VERIFIED: node_modules/ai/dist/index.d.ts]
npm install
```

**Version verification:**

```bash
npm view ai version time.modified
npm view @ai-sdk/openai version time.modified
npm view @ai-sdk/anthropic version time.modified
npm view zod version time.modified
npm view vitest version time.modified
npm view typescript version time.modified
```

The installed AI SDK packages are behind the registry latest versions, but the installed `ai@6.0.106` type definitions already export `Output`, `NoObjectGeneratedError`, and deprecated `generateObject`, so Phase 73 should avoid a dependency upgrade unless a conformance or type blocker proves one is needed. [VERIFIED: backend/package.json; VERIFIED: node_modules/ai/dist/index.d.ts; VERIFIED: npm view outputs]

## Architecture Patterns

### System Architecture Diagram

```text
Caller needs object
  -> Object request descriptor: schema, prompt, role, required capability, fallback policy
  -> Provider capability resolver: provider + model + protocol/transport + cached/probed result
  -> Strategy runner
       -> native_schema: generateText({ output: Output.object({ schema }) })
       -> native_json: provider JSON mode where schema mode is unavailable
       -> tool_mode: provider tool input schema where semantic tool selection is the contract
       -> text_fallback: current JSON prompt + extractJson + parse + repair
  -> Strategy trace: provider, model, mode, latency, usage, error class, repair/full retry
  -> Deterministic backend validators: Zod, caps, authority rules, tool schemas
  -> Caller receives typed object or early classified failure

Conformance harness
  -> Representative WorldForge schemas/prompts
  -> Same strategy runner against configured providers/models
  -> Report/cache by provider/model/schema/mode
  -> Long worldgen/action flows check required conformance before expensive work

ScenePlan path
  -> Scene frame + allowed actors/tools
  -> Semantic model-facing plan: actor choice, intent, response kind, tool intent, parameters
  -> Backend mapper generates IDs, references, executable tool actions
  -> Strict ScenePlan validator
  -> Tool executor and narrator packet
```

The diagram separates model-facing semantic choice from backend-owned mechanical state because the PRD and current ScenePlan schema show that UUIDs, response references, and executable tool unions are backend responsibilities. [VERIFIED: 73-PRD.md; VERIFIED: backend/src/engine/scene-plan-schema.ts]

### Recommended Project Structure

```text
backend/src/ai/
  generate-object-safe.ts                 # shared native-first strategy runner and text fallback [VERIFIED: existing file]
  provider-registry.ts                    # existing provider/model/protocol construction [VERIFIED: existing file]
  structured-output-capabilities.ts       # provider/model/transport capability resolver [VERIFIED: 73-PRD.md]
  structured-output-conformance.ts        # non-mutating probes and report formatting [VERIFIED: 73-PRD.md]
  __tests__/generate-object-safe.test.ts  # native/fallback/trace tests [VERIFIED: existing file]
  __tests__/structured-output-conformance.test.ts # mocked harness tests [VERIFIED: 73-PRD.md]

backend/src/engine/
  scene-plan-schema.ts                    # strict backend ScenePlan and mapper boundary [VERIFIED: existing file]
  semantic-scene-plan-schema.ts           # model-facing semantic contract [VERIFIED: 73-CONTEXT.md]
  scene-planner.ts                        # calls semantic contract, maps to strict plan [VERIFIED: existing file]
  __tests__/scene-planner.test.ts         # semantic mapping regressions [VERIFIED: existing file]
  __tests__/scene-plan-validator.test.ts  # strict backend authority tests [VERIFIED: existing file]

backend/src/worldgen/
  research-artifact.ts                    # artifact caps/source authority final parser [VERIFIED: existing file]
  __tests__/research-artifact.test.ts     # cap and metadata regressions [VERIFIED: existing file]
  __tests__/ip-researcher.test.ts         # citations/canonicalNames regressions [VERIFIED: existing file]
  __tests__/npcs-step.test.ts             # known-IP Gojo power dispatch regression [VERIFIED: existing file]
```

### Pattern 1: Native-First, Observable Fallback

**What:** `safeGenerateObject` should try `generateText` with `Output.object({ schema })`, catch structured-output/provider errors, record strategy and error class, then use the existing text extraction/repair path only when fallback policy permits it. [CITED: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0; VERIFIED: backend/src/ai/generate-object-safe.ts]

**When to use:** Use this for Zod-backed object generation where the caller expects a typed object and malformed JSON currently causes retries or repair. [VERIFIED: rg safeGenerateObject output]

**Example:**

```typescript
// Source: AI SDK v6 docs and installed ai@6.0.106 types. [CITED: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0; VERIFIED: node_modules/ai/dist/index.d.ts]
import { generateText, Output, NoObjectGeneratedError } from "ai";

async function generateNativeObject<T>(opts: {
  model: Parameters<typeof generateText>[0]["model"];
  schema: Parameters<typeof Output.object>[0]["schema"];
  prompt: string;
}): Promise<{ value: T; strategy: "native_schema" }> {
  try {
    const result = await generateText({
      model: opts.model,
      output: Output.object({ schema: opts.schema }),
      prompt: opts.prompt,
    });
    return { value: result.output as T, strategy: "native_schema" };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      throw error;
    }
    throw error;
  }
}
```

### Pattern 2: Capability Is Provider + Model + Transport, Not Provider Name

**What:** Capability records should be keyed by provider id, model, protocol, base URL/transport class, requested mode, and schema case. [VERIFIED: backend/src/ai/provider-registry.ts; VERIFIED: 73-CONTEXT.md]

**When to use:** Use this before long-running worldgen/action flows and inside tests that assert fallback is observable. [VERIFIED: 73-PRD.md]

**Example:**

```typescript
// Source: Phase 73 provider conformance requirement. [VERIFIED: 73-CONTEXT.md]
type StructuredOutputMode =
  | "native_schema"
  | "native_json"
  | "tool_mode"
  | "text_fallback";

type CapabilityKey = {
  providerId: string;
  model: string;
  protocol: "openai-compatible" | "anthropic-compatible";
  mode: StructuredOutputMode;
  schemaCase: "researchContext" | "semanticScenePlan" | "toolIntent";
};
```

### Pattern 3: Semantic ScenePlan Then Deterministic Mapper

**What:** The model-facing ScenePlan schema should ask for actor choice, response kind, tool intent, and parameters, while backend code generates IDs, reference graphs, and executable strict `ScenePlan` actions. [VERIFIED: 73-CONTEXT.md; VERIFIED: backend/src/engine/scene-plan-schema.ts]

**When to use:** Use this for `/action` planning because the current strict schema asks models for UUIDs and discriminated tool unions. [VERIFIED: backend/src/engine/scene-planner.ts; VERIFIED: backend/src/engine/scene-plan-schema.ts]

**Example:**

```typescript
// Source: current strict ScenePlan owns UUID/action/reference graph; Phase 73 requires semantic model output. [VERIFIED: backend/src/engine/scene-plan-schema.ts; VERIFIED: 73-CONTEXT.md]
type SemanticSceneAction = {
  actor: { kind: "player" | "npc"; idOrAlias?: string };
  intent: string;
  toolIntent?: {
    toolName: string;
    input: Record<string, unknown>;
  };
};

function mapSemanticActionToStrictAction(
  semantic: SemanticSceneAction,
  backendContext: { actorId: string; newActionId: () => string },
) {
  return {
    id: backendContext.newActionId(),
    actorId: backendContext.actorId,
    toolName: semantic.toolIntent?.toolName,
    input: semantic.toolIntent?.input ?? {},
  };
}
```

### Pattern 4: Conformance Harness Is a Gate, Not a Benchmark Toy

**What:** The harness should run representative schema/prompt cases through the same strategy runner that production uses and output pass/fail plus strategy metadata. [VERIFIED: 73-PRD.md]

**When to use:** Use it before selecting a provider/model for expensive worldgen research, scaffold generation, and action planning flows. [VERIFIED: 73-PRD.md; VERIFIED: GitNexus impact safeGenerateObject]

**Example:**

```typescript
// Source: Phase 73 conformance reporting requirement. [VERIFIED: 73-CONTEXT.md]
type ConformanceResult = {
  providerId: string;
  model: string;
  protocol: string;
  schemaCase: string;
  requestedMode: string;
  actualStrategy: string;
  passedSchema: boolean;
  passedSemanticChecks: boolean;
  latencyMs: number;
  repairUsed: boolean;
  errorType?: string;
};
```

### Anti-Patterns to Avoid

- **Prompt-only JSON as primary structured output:** The current path already appends JSON-only instructions and extracts balanced JSON, and that is the diagnosed unstable boundary. [VERIFIED: backend/src/ai/generate-object-safe.ts; VERIFIED: 73-PRD.md]
- **Retrying the same prompt after structural failure:** Repeating the same JSON prompt can reproduce the same provider/schema incompatibility, so fallback/repair must be strategy-labeled and bounded. [VERIFIED: 73-CONTEXT.md]
- **Treating native structured output as semantic truth:** Native schema can reduce malformed objects, but backend still owns caps, source authority, tool safety, and no-invented-mechanics checks. [VERIFIED: 73-CONTEXT.md; VERIFIED: backend/src/worldgen/research-artifact.ts; VERIFIED: backend/src/engine/tool-schemas.ts]
- **Asking the model for backend UUID graphs:** ScenePlan strict schema has many backend-owned UUID references, and the Phase 73 decision is to derive them deterministically. [VERIFIED: backend/src/engine/scene-plan-schema.ts; VERIFIED: 73-CONTEXT.md]
- **OpenAI-only capability assumptions:** The provider registry supports OpenAI-compatible and Anthropic-compatible paths, and OpenRouter documents structured output support only for compatible models. [VERIFIED: backend/src/ai/provider-registry.ts; CITED: https://openrouter.ai/docs/features/structured-outputs]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema-constrained object generation | A new regex/brace parser as the primary contract | AI SDK `generateText` with `Output.object({ schema })`, then existing text fallback only as fallback | AI SDK v6 explicitly routes structured data through `generateText` output settings, and current regex/extract path is the failure surface. [CITED: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0; VERIFIED: backend/src/ai/generate-object-safe.ts] |
| Runtime validation | Custom type guards replacing Zod | Existing Zod schemas plus deterministic preprocessing/sanitization | Zod is already the backend contract and `safeParse` returns typed success/error data. [VERIFIED: backend/src/worldgen/research-artifact.ts; CITED: https://context7.com/colinhacks/zod/llms.txt] |
| Provider conformance knowledge | Static hardcoded provider assumptions | Local harness results keyed by provider/model/protocol/mode/schema | Gateways and models vary by compatibility, and the PRD requires observable/testable capability. [VERIFIED: 73-PRD.md; CITED: https://openrouter.ai/docs/features/structured-outputs] |
| Tool execution safety | Model-authored executable state without backend validation | Existing `tool()` input schemas and strict backend tool validators | Runtime tools already define backend-owned input schemas, and executable actions can mutate game state. [VERIFIED: backend/src/engine/tool-schemas.ts] |
| ScenePlan IDs/references | Model-generated UUID/action/reference graph | Backend deterministic mapper from semantic plan to strict ScenePlan | Current strict plan requires UUIDs and narrator refs that backend can derive. [VERIFIED: backend/src/engine/scene-plan-schema.ts; VERIFIED: 73-CONTEXT.md] |
| External metadata caps | Prompt-only character-counting | Backend trimming/preprocessing before final parse | Existing artifact parser has deterministic max lengths and string slicing for external snippets. [VERIFIED: backend/src/worldgen/research-artifact.ts] |

**Key insight:** Phase 73 should reduce malformed provider output before Zod, but it should not move WorldForge authority from backend validators into provider-native schema modes. [VERIFIED: 73-CONTEXT.md; VERIFIED: backend/src/worldgen/research-artifact.ts; VERIFIED: backend/src/engine/tool-schemas.ts]

## Common Pitfalls

### Pitfall 1: Confusing JSON Mode With Schema Adherence

**What goes wrong:** A provider returns valid JSON that still has `citations` as a string or `canonicalNames` as a string instead of the required object/array shapes. [VERIFIED: 73-PRD.md]

**Why it happens:** JSON validity is not the same as schema conformance, and the current text path only extracts and parses JSON before coercion/repair. [VERIFIED: backend/src/ai/generate-object-safe.ts; CITED: https://platform.openai.com/docs/guides/structured-outputs]

**How to avoid:** Prefer `Output.object({ schema })` for schema-capable calls and keep Zod validation after native output. [CITED: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0; VERIFIED: 73-CONTEXT.md]

**Warning signs:** Trace lacks a strategy label, repair is used often, or the same provider/model fails the same representative conformance case repeatedly. [VERIFIED: 73-CONTEXT.md]

### Pitfall 2: Hidden Fallback Makes Failures Undiagnosable

**What goes wrong:** Production silently falls back to text extraction, and later logs only show a Zod failure without the provider/model/mode that caused it. [VERIFIED: backend/src/ai/generate-object-safe.ts; VERIFIED: 73-PRD.md]

**Why it happens:** Current trace has no canonical strategy enum for native schema, native JSON, tool mode, text fallback, repair, or full retry. [VERIFIED: backend/src/ai/generate-object-safe.ts]

**How to avoid:** Add a strategy field to trace/log output and assert it in unit tests. [VERIFIED: 73-CONTEXT.md]

**Warning signs:** Test assertions inspect raw text/repair only but not actual strategy selection. [VERIFIED: backend/src/ai/__tests__/generate-object-safe.test.ts]

### Pitfall 3: ScenePlan Keeps Asking The Model For Compiler Work

**What goes wrong:** The model emits `payload` instead of `input`, omits repeated `actorId`/`toolName`, or invents action shapes under the strict backend union. [VERIFIED: 73-PRD.md]

**Why it happens:** Current ScenePlan prompt asks for a final strict object with backend-owned mechanical details. [VERIFIED: backend/src/engine/scene-planner.ts; VERIFIED: backend/src/engine/scene-plan-schema.ts]

**How to avoid:** Replace the model-facing contract with a semantic plan and map it into strict ScenePlan inside backend code. [VERIFIED: 73-CONTEXT.md]

**Warning signs:** More aliases are added to loose schema while the prompt still asks for final database-ready state. [VERIFIED: backend/src/engine/scene-plan-schema.ts]

### Pitfall 4: Conformance Harness Mutates Campaign State

**What goes wrong:** A diagnostic probe creates game events, NPCs, worldgen artifacts, or tool side effects. [VERIFIED: backend/src/engine/tool-schemas.ts; VERIFIED: backend/src/worldgen/ip-researcher.ts]

**Why it happens:** Representative schemas are connected to production flows that can persist or mutate state. [VERIFIED: GitNexus impact safeGenerateObject]

**How to avoid:** Harness cases must use isolated prompts/schemas and mocked or non-mutating model calls for automated tests, with opt-in live provider probes. [VERIFIED: 73-PRD.md]

**Warning signs:** Harness imports route handlers or tool executors instead of AI boundary schemas and strategy runner. [VERIFIED: backend/src/engine/tool-schemas.ts]

### Pitfall 5: Tool Mode Is Treated As A Universal Replacement

**What goes wrong:** A plan moves every object-generation call to tool calls even when the provider/gateway or call semantics fit schema output better. [VERIFIED: backend/src/engine/tool-schemas.ts; VERIFIED: backend/src/ai/provider-registry.ts]

**Why it happens:** AI SDK tools exist in the repo, but Phase 73 requires classification into native structured output, tool call, text fallback, or intentionally unstructured prose. [VERIFIED: backend/src/engine/tool-schemas.ts; VERIFIED: P73-R1 in .planning/REQUIREMENTS.md]

**How to avoid:** Classify by call intent: data extraction/generation to schema uses native schema first; executable model-selected tools use tool schemas; provider-incompatible calls use text fallback; prose remains unstructured. [VERIFIED: 73-PRD.md]

**Warning signs:** A plan deletes text fallback or forces tool mode without conformance evidence. [VERIFIED: 73-CONTEXT.md]

## Code Examples

### Native Structured Output Error Handling

```typescript
// Source: AI SDK v6 docs. [CITED: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data]
import { generateText, Output, NoObjectGeneratedError } from "ai";

const result = await generateText({
  model,
  output: Output.object({ schema }),
  prompt,
});

if (!result.output) {
  // Normally handled by NoObjectGeneratedError; keep this branch as defensive code. [CITED: https://ai-sdk.dev/docs/reference/ai-sdk-core/output]
  throw new Error("No structured output returned");
}

try {
  await generateText({ model, output: Output.object({ schema }), prompt });
} catch (error) {
  if (NoObjectGeneratedError.isInstance(error)) {
    // Capture error.text, error.response, error.usage, and error.cause in the strategy trace. [CITED: https://ai-sdk.dev/docs/reference/ai-sdk-core/output]
  }
}
```

### Zod As Final Authority

```typescript
// Source: Zod docs and existing WorldForge parser pattern. [CITED: https://context7.com/colinhacks/zod/llms.txt; VERIFIED: backend/src/worldgen/research-artifact.ts]
const parsed = schema.safeParse(candidate);

if (!parsed.success) {
  return {
    ok: false,
    issues: parsed.error.issues,
  };
}

return {
  ok: true,
  value: parsed.data,
};
```

### Strategy Trace Shape

```typescript
// Source: Phase 73 trace requirement and current SafeGenerateTrace gap. [VERIFIED: 73-CONTEXT.md; VERIFIED: backend/src/ai/generate-object-safe.ts]
type SafeGenerateStrategyTrace = {
  requestedMode: "native_schema" | "native_json" | "tool_mode" | "text_fallback";
  actualStrategy: "native_schema" | "native_json" | "tool_mode" | "text_fallback";
  providerId: string;
  model: string;
  protocol: string;
  fallbackReason?: string;
  repairUsed: boolean;
  fullRetryCount: number;
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AI SDK `generateObject` for structured data | AI SDK v6 recommends `generateText` with an `output` setting such as `Output.object({ schema })` | AI SDK 6.0 migration guide | Phase 73 should not build on `generateObject`, because installed types mark it deprecated. [CITED: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0; VERIFIED: node_modules/ai/dist/index.d.ts] |
| Prompted JSON plus parse/extract as primary contract | Provider-native schema output where supported, with text fallback as explicit fallback | Provider docs and Phase 73 PRD | This reduces malformed objects before Zod without removing backend validation. [CITED: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data; VERIFIED: 73-PRD.md] |
| JSON-valid output as success | Schema-valid output plus deterministic semantic validation | OpenAI structured-output guidance distinguishes JSON mode from schema adherence | Valid JSON can still violate WorldForge schemas. [CITED: https://platform.openai.com/docs/guides/structured-outputs; VERIFIED: 73-PRD.md] |
| Provider name as capability proxy | Empirical provider/model/transport conformance | OpenRouter documents compatibility by supported models and provider/gateway combinations | Capability must be discovered and logged, not assumed globally. [CITED: https://openrouter.ai/docs/features/structured-outputs; VERIFIED: 73-CONTEXT.md] |

**Deprecated/outdated:**

- `generateObject`: AI SDK v6 migration docs say to use `generateText` with `output`, and installed `ai@6.0.106` types mark `generateObject` deprecated. [CITED: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0; VERIFIED: node_modules/ai/dist/index.d.ts]
- Prompt suffixes like "return JSON only" as the primary contract: current code uses that path and Phase 73 identifies it as root-cause-adjacent. [VERIFIED: backend/src/ai/generate-object-safe.ts; VERIFIED: 73-CONTEXT.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The conformance harness can discover the relevant configured providers/models from existing runtime settings without adding secrets to git. [ASSUMED] | Environment Availability / Open Questions | If wrong, the plan must add a configuration-discovery task or require explicit CLI inputs for provider/model selection. |
| A2 | A semantic ScenePlan schema can preserve all current strict ScenePlan behavior after backend mapping. [ASSUMED] | Architecture Patterns / Validation Architecture | If wrong, the plan must split ScenePlan migration into a compatibility shim plus staged strict-plan parity tests. |
| A3 | A report artifact plus in-memory/test-visible cache is enough before adding persisted conformance state. [ASSUMED] | Open Questions | If wrong, the plan must include persistent storage and invalidation for provider/model conformance results. |
| A4 | Some existing loose ScenePlan repairs may still be useful during migration. [ASSUMED] | Open Questions | If wrong, the planner can remove more loose-schema compatibility earlier, but must prove strict behavior parity. |
| A5 | Keeping loose ScenePlan compatibility for one migration wave reduces risk while the semantic path becomes the normal success path. [ASSUMED] | Open Questions | If wrong, the planner should either hard-cut to semantic mapping or split compatibility into a separate deprecation task. |
| A6 | Provider docs and registry versions should be revalidated within 7 days, while local architecture findings remain useful for about 30 days unless Phase 73 lands first. [ASSUMED] | Metadata | If wrong, stale provider/package assumptions could mislead the planner about API availability or version risk. |

## Open Questions (RESOLVED)

1. **Which live provider/model combinations should block expensive flows by default?**
   - What we know: The registry stores provider id, protocol, base URL, API key, and model, and the PRD names OpenAI, OpenRouter/OpenCode-compatible gateways, GLM/Z.AI, Gemini, Anthropic, DeepSeek, Kimi/Moonshot, and Mimo-like models as possible capability variants. [VERIFIED: backend/src/ai/provider-registry.ts; VERIFIED: 73-PRD.md]
   - What's unclear: Repo-only research did not inspect user secrets or runtime-selected provider settings. [VERIFIED: environment probe scope]
   - Recommendation: The planner should add a harness discovery/input task that reports configured providers without printing secrets. [VERIFIED: 73-CONTEXT.md]
   - RESOLVED: Phase 73 must not hard-code a provider/model blocklist from research. The implementation should block expensive flows only when the currently selected provider/model/schema/mode has a recorded conformance failure or no passing result for a required strict mode. If live credentials are absent, mocked tests still pass and live gating remains opt-in/report-only until the harness records real configured-provider results.

2. **Should provider conformance results be persisted or only reported?**
   - What we know: CONTEXT requires results to be persisted or reported by provider/model/schema/mode/latency/usage/error/repair/semantic pass-fail. [VERIFIED: 73-CONTEXT.md]
   - What's unclear: CONTEXT leaves provider capability cache format to implementer discretion. [VERIFIED: 73-CONTEXT.md]
   - Recommendation: Start with a report artifact and in-memory/test-visible cache, then persist only if a later flow needs startup gating across restarts. [ASSUMED]
   - RESOLVED: Phase 73 should start with non-secret report artifacts plus an in-memory/test-visible capability cache. Do not introduce database persistence in this phase unless an implementation task proves startup-time gating across restarts is required. Report artifacts must be inspectable and keyed by provider id, provider name, model, protocol, base URL host only, schema case, requested strategy, actual strategy, latency, usage, error class, repair usage, and semantic pass/fail.

3. **How much of current loose ScenePlan sanitization should remain after semantic mapping?**
   - What we know: Loose schema already normalizes `payload`, aliases, missing actor IDs, synthetic action IDs, and narrator refs, but Phase 73 requires root-cause contract redesign. [VERIFIED: backend/src/engine/scene-plan-schema.ts; VERIFIED: 73-CONTEXT.md]
   - What's unclear: Some loose repairs may still be useful for compatibility during migration. [ASSUMED]
   - Recommendation: Keep loose compatibility for one migration wave, but assert new semantic path avoids relying on it for normal success. [ASSUMED]
   - RESOLVED: Keep current loose ScenePlan sanitization as a compatibility fallback during Phase 73, but the new normal path should be semantic ScenePlan -> deterministic backend mapping -> strict `scenePlanSchema`. Tests must prove semantic output succeeds without relying on loose alias repair for backend-owned IDs/references, while existing loose repairs still protect legacy/model-shaped outputs until removal is planned separately.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Backend tests, scripts, AI SDK execution | yes | v23.11.0 | None needed. [VERIFIED: node --version] |
| npm | Workspace scripts and package/version checks | yes | 11.12.1 | None needed. [VERIFIED: npm --version] |
| Vitest | Backend unit/regression tests and mocked harness tests | yes | 3.2.4 installed | None needed for backend test work. [VERIFIED: npx vitest --version; VERIFIED: backend/package.json] |
| TypeScript | Backend typecheck | yes | 5.9.3 installed | None needed for backend typecheck. [VERIFIED: npx tsc --version; VERIFIED: backend/package.json] |
| AI SDK `Output.object` | Native-first structured output | yes | `ai@6.0.106` installed | Text fallback remains for provider rejection. [VERIFIED: backend/package.json; VERIFIED: node_modules/ai/dist/index.d.ts] |
| GitNexus | Impact/change detection | yes | status returned 1.6.1 and current index after analyze | Use `rg` only for text discovery, not as impact substitute. [VERIFIED: npx gitnexus status; VERIFIED: AGENTS.md] |
| Context7 CLI | Docs verification | yes through `npx --yes ctx7@latest` | latest CLI resolved docs | Official web docs if Context7 unavailable. [VERIFIED: ctx7 CLI output] |
| `tsx` | Optional TS harness script execution | partial | 4.21.0 listed in backend devDependencies, but root `require('tsx/package.json')` probe reported missing | Prefer Vitest-backed harness or verify workspace resolution before planning a TS CLI script. [VERIFIED: backend/package.json; VERIFIED: node package availability probe] |
| Live provider API credentials | Optional live conformance probes | not verified | unknown | Provide mocked deterministic tests and make live probes opt-in/skippable when credentials are absent. [VERIFIED: environment probe scope; VERIFIED: 73-PRD.md] |

**Missing dependencies with no fallback:**

- None for offline planning and mocked verification. [VERIFIED: environment probes]

**Missing dependencies with fallback:**

- Live provider credentials were not verified; use mocked harness tests by default and mark live conformance as opt-in or environment-gated. [VERIFIED: environment probe scope]
- `tsx` direct root resolution was not reliable; use Vitest or verify backend workspace execution before adding a TS script dependency path. [VERIFIED: node package availability probe; VERIFIED: backend/package.json]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 for backend tests. [VERIFIED: npx vitest --version; VERIFIED: backend/package.json] |
| Config file | `backend/vitest.config.ts`. [VERIFIED: backend/vitest.config.ts] |
| Quick run command | `npm --prefix backend run test -- src/ai/__tests__/generate-object-safe.test.ts src/engine/__tests__/scene-planner.test.ts` [VERIFIED: backend/package.json; VERIFIED: test file listing] |
| Full suite command | `npm --prefix backend run test` plus `npm --prefix backend run typecheck`. [VERIFIED: backend/package.json] |

### Verification Dimensions

| Dimension | Required Evidence | Why It Matters |
|-----------|-------------------|----------------|
| Strategy selection | Unit tests prove native schema success, native structured error fallback, text fallback success, repair usage, and full retry labeling. [VERIFIED: 73-CONTEXT.md] | Future failures need provider/model/mode diagnosis, not only Zod stack traces. [VERIFIED: 73-PRD.md] |
| Provider capability record | Tests assert provider id, model, protocol, requested mode, actual strategy, error type, latency, usage, repair, and semantic pass/fail fields exist in reports/traces. [VERIFIED: 73-CONTEXT.md] | Capability fallback must be per provider/model/transport. [VERIFIED: 73-CONTEXT.md] |
| Boundary inventory | A test or checked artifact classifies each shared object-generation seam as native structured output, tool call, text fallback, or intentionally unstructured prose. [VERIFIED: P73-R1 in .planning/REQUIREMENTS.md] | Planning must avoid leaving hidden prompt-only JSON calls in critical flows. [VERIFIED: 73-PRD.md] |
| ScenePlan semantic mapping | Tests show semantic actions map to strict ScenePlan with backend-generated IDs, actor IDs, tool names, inputs, and narrator references. [VERIFIED: 73-CONTEXT.md; VERIFIED: backend/src/engine/scene-plan-schema.ts] | This proves the LLM no longer owns backend mechanical graph construction. [VERIFIED: 73-CONTEXT.md] |
| Regression: citations/canonicalNames | Tests cover native schema path and text fallback/repair for `citations` string and `canonicalNames` string drift. [VERIFIED: 73-PRD.md; VERIFIED: backend/src/ai/__tests__/generate-object-safe.test.ts] | This directly covers the Kimi/Mimo failure class. [VERIFIED: 73-PRD.md] |
| Regression: ScenePlan payload/missing-tool | Tests cover `payload` alias, missing `actorId`, missing `toolName`, invented action shapes, and semantic-contract mapping. [VERIFIED: 73-PRD.md; VERIFIED: backend/src/engine/scene-plan-schema.ts] | This directly covers observed `/action` failures. [VERIFIED: 73-PRD.md] |
| Regression: overlong metadata | Tests prove search-result metadata is capped/truncated before strict artifact parse and logs semantic loss if needed. [VERIFIED: 73-PRD.md; VERIFIED: backend/src/worldgen/research-artifact.ts] | This prevents external provider metadata from becoming a Zod kill switch. [VERIFIED: tasks/lessons.md] |
| Regression: Gojo known-IP power dispatch | Tests prove artifact-backed canon NPC authority routes to known-IP power/stat dispatch and does not fall through to original-character assessment. [VERIFIED: 73-PRD.md; VERIFIED: backend/src/worldgen/scaffold-steps/npcs-step.ts] | This protects Phase 72 authority propagation from being regressed by Phase 73 refactors. [VERIFIED: .planning/STATE.md; VERIFIED: tasks/lessons.md] |
| Conformance harness safety | Tests prove harness probes do not mutate campaign state or execute runtime tools. [VERIFIED: 73-PRD.md; VERIFIED: backend/src/engine/tool-schemas.ts] | Conformance must run before expensive flows without side effects. [VERIFIED: 73-CONTEXT.md] |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P73-R1 | Object-generation seams are inventoried and classified. | unit/static inventory | `npm --prefix backend run test -- src/ai/__tests__/structured-output-boundary.test.ts` | Existing file exists, likely needs expansion. [VERIFIED: test file listing] |
| P73-R2 | `safeGenerateObject` chooses native schema first and falls back explicitly. | unit | `npm --prefix backend run test -- src/ai/__tests__/generate-object-safe.test.ts` | Existing file exists, native tests missing. [VERIFIED: backend/src/ai/__tests__/generate-object-safe.test.ts] |
| P73-R3 | Trace/log fields distinguish native schema, native JSON, tool mode, text fallback, repair, and full retry. | unit | `npm --prefix backend run test -- src/ai/__tests__/generate-object-safe.test.ts src/ai/__tests__/structured-output-conformance.test.ts` | First exists; conformance test is Wave 0 gap. [VERIFIED: test file listing] |
| P73-R4 | Semantic ScenePlan maps to strict backend ScenePlan with generated IDs/references. | unit/integration | `npm --prefix backend run test -- src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts` | Existing files exist, semantic mapper tests need expansion. [VERIFIED: test file listing] |
| P73-R5 | Harness reports provider/model/schema/mode conformance before long flows trust them. | unit/smoke | `npm --prefix backend run test -- src/ai/__tests__/structured-output-conformance.test.ts` | Missing; Wave 0 gap. [VERIFIED: test file listing] |
| P73-R6 | Zod/caps/authority/tool validation remain final authority. | unit/integration | `npm --prefix backend run test -- src/worldgen/__tests__/research-artifact.test.ts src/engine/__tests__/tool-schemas.inventory-authority.test.ts src/engine/__tests__/scene-plan-validator.test.ts` | Existing files exist. [VERIFIED: test file listing] |
| P73-R7 | Specific Kimi/Mimo, ScenePlan, metadata, and Gojo regressions are covered. | regression | `npm --prefix backend run test -- src/ai/__tests__/generate-object-safe.test.ts src/worldgen/__tests__/ip-researcher.test.ts src/worldgen/__tests__/research-artifact.test.ts src/worldgen/__tests__/npcs-step.test.ts src/engine/__tests__/scene-planner.test.ts` | Existing files exist, expected cases need expansion. [VERIFIED: test file listing] |

### Sampling Rate

- **Per task commit:** Run the most relevant targeted Vitest files plus `npm --prefix backend run typecheck` for any TypeScript contract change. [VERIFIED: backend/package.json; VERIFIED: test file listing]
- **Per wave merge:** Run `npm --prefix backend run test` and `npm --prefix backend run typecheck`. [VERIFIED: backend/package.json]
- **Phase gate:** Run targeted Phase 73 regression command, full backend tests where runtime cost is acceptable, backend typecheck, and `gitnexus_detect_changes({ scope: "all" })`. [VERIFIED: 73-PRD.md; VERIFIED: AGENTS.md]

### Wave 0 Gaps

- [ ] `backend/src/ai/__tests__/structured-output-conformance.test.ts` - covers P73-R3 and P73-R5 harness/report behavior. [VERIFIED: test file listing]
- [ ] `backend/src/ai/structured-output-conformance.ts` or equivalent - provides non-mutating conformance cases and reporting. [VERIFIED: 73-PRD.md]
- [ ] `backend/src/ai/structured-output-capabilities.ts` or equivalent - stores/query provider/model/transport capability decisions. [VERIFIED: 73-CONTEXT.md]
- [ ] `backend/src/engine/semantic-scene-plan-schema.ts` or equivalent - defines model-facing semantic ScenePlan contract. [VERIFIED: 73-CONTEXT.md]
- [ ] Native-path mocks for AI SDK `generateText` returning `output` and throwing `NoObjectGeneratedError`. [CITED: https://ai-sdk.dev/docs/reference/ai-sdk-core/output; VERIFIED: backend/src/ai/__tests__/generate-object-safe.test.ts]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Phase 73 does not change auth flows. [VERIFIED: 73-PRD.md] |
| V3 Session Management | no | Phase 73 does not change sessions. [VERIFIED: 73-PRD.md] |
| V4 Access Control | yes | Backend must validate tool execution authority and no-invented-mechanics rules before mutating state. [VERIFIED: backend/src/engine/tool-schemas.ts; VERIFIED: 73-CONTEXT.md] |
| V5 Input Validation | yes | Zod schemas, deterministic caps, semantic validators, and strict ScenePlan/tool validation remain final authority. [VERIFIED: backend/src/worldgen/research-artifact.ts; VERIFIED: backend/src/engine/scene-plan-schema.ts; VERIFIED: backend/src/engine/tool-schemas.ts] |
| V6 Cryptography | no | Phase 73 does not introduce cryptographic storage or algorithms. [VERIFIED: 73-PRD.md] |

### Known Threat Patterns for Structured Output / Tool Boundaries

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt or search-result injection tries to force malformed artifacts or hidden authority changes. | Tampering | Treat external search/model text as data, then enforce Zod/caps/source authority in backend validators. [VERIFIED: backend/src/worldgen/research-artifact.ts; VERIFIED: 73-CONTEXT.md] |
| Model invents tool actions, IDs, or actor references that mutate state incorrectly. | Tampering / Elevation of Privilege | Use semantic model output plus backend-generated IDs and existing tool input validation before execution. [VERIFIED: backend/src/engine/scene-plan-schema.ts; VERIFIED: backend/src/engine/tool-schemas.ts] |
| Provider incompatibility causes repeated retries and user-visible long-flow failures. | Denial of Service | Add conformance gates, bounded retry/fallback, and early failure for unsupported provider/model/schema modes. [VERIFIED: 73-PRD.md] |
| Logs expose hidden reasoning, raw prompts, provider secrets, or excessive user data. | Information Disclosure | Trace should store strategy, provider/model, usage, error type, and compact diagnostics without printing API keys or full hidden context. [VERIFIED: backend/src/ai/provider-registry.ts; VERIFIED: 73-CONTEXT.md] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/73-structured-output-stability-and-provider-conformance/73-CONTEXT.md` - locked decisions, discretion, deferred ideas, canonical refs. [VERIFIED: local read]
- `.planning/phases/73-structured-output-stability-and-provider-conformance/73-PRD.md` - problem statement, requirements, acceptance criteria, references. [VERIFIED: local read]
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` - P73 requirement IDs, roadmap dependency, prior phase state. [VERIFIED: local read]
- `backend/src/ai/generate-object-safe.ts`, `backend/src/ai/provider-registry.ts`, `backend/src/ai/__tests__/generate-object-safe.test.ts` - current AI boundary and tests. [VERIFIED: local read]
- `backend/src/engine/scene-planner.ts`, `backend/src/engine/scene-plan-schema.ts`, `backend/src/engine/tool-schemas.ts` - current ScenePlan and tool boundary. [VERIFIED: local read]
- `backend/src/worldgen/ip-researcher.ts`, `backend/src/worldgen/research-artifact.ts`, `backend/src/worldgen/scaffold-steps/validation.ts`, `backend/src/worldgen/scaffold-steps/regen-helpers.ts`, `backend/src/worldgen/scaffold-steps/npcs-step.ts` - worldgen structured-output and authority surfaces. [VERIFIED: local read]
- `AGENTS.md` and GitNexus skills - project-specific GitNexus/verification constraints. [VERIFIED: local read]
- GitNexus `impact safeGenerateObject` - CRITICAL blast radius, 18 impacted symbols, 4 execution flows. [VERIFIED: GitNexus MCP]
- `node_modules/ai/dist/index.d.ts` - installed AI SDK v6 exports `Output`, `NoObjectGeneratedError`, and deprecated `generateObject`. [VERIFIED: local rg]
- AI SDK docs `/websites/ai-sdk_dev` via Context7 - `generateText` + `Output.object`, `NoObjectGeneratedError`, `generateObject` deprecation. [CITED: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0; CITED: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data; CITED: https://ai-sdk.dev/docs/reference/ai-sdk-core/output]
- Zod docs via Context7 - `safeParse` result-object behavior. [CITED: https://context7.com/colinhacks/zod/llms.txt]
- npm registry `npm view` - latest versions and modified times for `ai`, provider packages, `zod`, `vitest`, and `typescript`. [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)

- OpenAI Structured Outputs docs - schema adherence vs JSON mode framing. [CITED: https://platform.openai.com/docs/guides/structured-outputs]
- OpenRouter Structured Outputs docs - `response_format`/`json_schema` support for compatible models and provider/gateway combinations. [CITED: https://openrouter.ai/docs/features/structured-outputs]
- Gemini structured output docs - schema mode and documented schema limitations. [CITED: https://ai.google.dev/gemini-api/docs/structured-output]
- Claude tool-use docs - tool `input_schema` and description guidance. [CITED: https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools]

### Tertiary (LOW confidence)

- Gemini CLI review described in PRD - useful independent diagnosis, but this research did not rerun Gemini CLI. [VERIFIED: 73-PRD.md]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - package versions, installed types, npm registry data, and AI SDK/Zod docs were verified. [VERIFIED: backend/package.json; VERIFIED: node_modules/ai/dist/index.d.ts; VERIFIED: npm registry; CITED: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0]
- Architecture: HIGH - current code surfaces and locked decisions align on native-first object generation, backend validation authority, and semantic ScenePlan mapping. [VERIFIED: 73-CONTEXT.md; VERIFIED: backend/src/ai/generate-object-safe.ts; VERIFIED: backend/src/engine/scene-plan-schema.ts]
- Provider-specific behavior: MEDIUM - provider docs confirm variability, but live configured provider/model conformance was not probed during research. [CITED: https://openrouter.ai/docs/features/structured-outputs; VERIFIED: environment probe scope]
- Pitfalls: HIGH - pitfalls are grounded in observed failures, current source code, and existing project lessons. [VERIFIED: 73-PRD.md; VERIFIED: backend/src/ai/generate-object-safe.ts; VERIFIED: tasks/lessons.md]

**Research date:** 2026-04-27 [VERIFIED: current_date]
**Valid until:** 2026-05-04 for provider docs and registry versions; 2026-05-27 for local architecture findings unless Phase 73 code changes land first. [ASSUMED]

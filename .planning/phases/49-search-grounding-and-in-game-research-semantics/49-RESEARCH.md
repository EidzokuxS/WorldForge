# Phase 49: Search Grounding & In-Game Research Semantics - Research

**Researched:** 2026-04-12
**Domain:** Retrieval intent, canonical grounding, runtime clarification, and grounded character/power semantics
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Search exists as grounding, not as decorative web access.
- **D-02:** The main purpose is to prevent confident model drift on canon details, character facts, event history, and power-system specifics.
- **D-03:** Search-backed grounding is needed in three places:
  1. world formation,
  2. character creation and import,
  3. live gameplay fact clarification.

### World Canon vs Preloading
- **D-04:** Canon facts about the world should not be bulk preloaded before campaign start “just in case.”
- **D-05:** World canon should be researched during world formation and then reused from the knowledge already gathered there.
- **D-06:** Phase 49 should improve reuse, deduplication, and retrieval of already researched world canon rather than adding a second wasteful preload pass.

### Character and Power Profiles
- **D-07:** Important character facts should be prepared and stored ahead of play instead of being re-googled repeatedly during gameplay.
- **D-08:** Precomputed character grounding should include:
  - identity-relevant facts,
  - abilities,
  - constraints,
  - signature moves,
  - strong points,
  - vulnerabilities,
  - a structured power profile.
- **D-09:** The system should prefer compact structured summaries or character-focused lore bundles over keeping full raw research in prompt context.

### Power Grounding
- **D-10:** Power comparisons must not be left to raw model intuition.
- **D-11:** Power-scaling communities and similar structured sources may be used as one input for destructive scale, speed, durability, and other battle-relevant traits, but they are not absolute truth by themselves.
- **D-12:** WorldForge should synthesize its own structured power profile from grounded inputs instead of trusting one fan ranking page or one opinion thread.

### Scope of This Phase
- **D-13:** Phase 49 owns:
  - research query quality,
  - source-of-truth rules,
  - reuse/storage semantics,
  - lookup boundaries,
  - character and power grounding profiles.
- **D-14:** Phase 49 does **not** fully solve gameplay countermeasures for overpowered characters.
- **D-15:** Systems like “cost of overwhelming force,” “world backlash,” and other anti-runaway balance mechanics belong to a later gameplay/balance layer.

### Player-Facing Surface
- **D-16:** Live gameplay research should use a hybrid surface.
- **D-17:** The system may use grounding silently where the engine needs it, but the player should also have an explicit way to ask for clarification, fact lookup, or comparison when they want it.
- **D-18:** Research should remain distinct from ordinary scene narration; search should inform play without turning every scene into an exposition dump.

### Claude's Discretion
- Exact storage shape for reusable canon findings versus per-character/power profiles
- Whether power profiles should live directly inside character records or in adjacent grounded knowledge artifacts
- Which live-game research requests become explicit player actions first, and which remain backend-only support seams
- Exact source-ranking policy between canon-facing references, fandom wikis, structured power-scaling sources, and community cards

### Deferred Ideas (OUT OF SCOPE)
- Full gameplay countermeasure design for god-tier characters belongs to a later balance/system phase, not to Phase 49’s core delivery.
- Rich text presentation of research results belongs to Phase 50.
- Broader writing-quality improvements belong to Phase 47; Phase 49 should improve correctness and usefulness of grounded inputs, not prose style by itself.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RES-01 | Search and research flows use explicit retrieval intent in both worldgen and live gameplay, producing focused, useful grounded context instead of vague blended queries. | Reuse `IpResearchContext` in worldgen, replace archetype-only freeform research with structured character grounding, and add a dedicated runtime clarification path that classifies intent, decomposes mixed-premise lookups, and keeps extracted facts separate from narration. |
</phase_requirements>

## Summary

Worldgen already has the right architectural seam. `backend/src/worldgen/ip-researcher.ts` detects franchise context, performs overview plus gap-filling searches, returns a structured `IpResearchContext`, and `backend/src/routes/worldgen.ts` persists that context in campaign `config.json`. `backend/src/worldgen/scaffold-generator.ts` already reuses and enriches the cached canon via `evaluateResearchSufficiency()` before locations, factions, and NPC steps. Phase 49 should extend and harden this seam, not replace it with a second preload system.

Character research is much weaker. `backend/src/character/archetype-researcher.ts` returns one freeform summary string, and `/api/worldgen/research-character` only uses it to create an original player/NPC from an archetype. It does not build a durable canon-facing character profile, does not preserve citations, and has no power-profile contract. The richer shared character model is already present in `CharacterRecord.identity`, `continuity`, and `sourceBundle`; that is the correct place to anchor compact grounded truth, but a power profile should live in an adjacent artifact rather than bloating the shared runtime record.

Live gameplay research is effectively missing today. Runtime uses local vector retrieval only: `assemblePrompt()` embeds the raw `playerAction` and pulls `LORE CONTEXT` from LanceDB lore cards. There is no explicit runtime fact-clarification route, no query decomposition, and no way to separate “answer this canon/power question” from normal scene narration. Phase 49 therefore needs one shared retrieval-intent layer reused by worldgen, character grounding, and runtime clarification, plus strict boundaries so grounded answers stay extractive/distilled instead of contaminating storyteller prose.

**Primary recommendation:** Build a shared retrieval-intent/query-planning module, keep world canon in cached `IpResearchContext`, store per-character/power grounding in adjacent campaign-local artifacts referenced by `sourceBundle`, and expose live gameplay clarification as a dedicated mode separate from ordinary narration.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | `6.0.158` (published 2026-04-10) | `generateObject`, `generateText`, streaming, tool calling | Already the repo standard; Phase 49 should keep all search/grounding orchestration on the same SDK path instead of mixing in raw provider clients. |
| `@ai-sdk/mcp` | `1.0.36` (published 2026-04-10) | MCP client for search providers | Official docs support typed tool schemas and typed outputs; this is the cleanest way to normalize provider behavior without heuristic parsing. |
| `zod` | `4.3.6` (published 2026-01-22) | Contracts for retrieval intent, provider outputs, grounding artifacts | Existing repo standard for all payloads; essential for preventing loose search artifacts from leaking into prompts or persistence. |
| `@lancedb/lancedb` | `0.27.2` (published 2026-03-31) | Embedded campaign-local retrieval for lore and future grounding artifacts | Already embedded in the stack; current docs support vector, full-text, hybrid, and metadata-filtered retrieval without adding another datastore. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `hono` | `4.12.12` (published 2026-04-07) | Thin explicit API seams | Add runtime clarification endpoints or lightweight grounded lookup routes without changing the gameplay transport model. |
| `vitest` | `4.1.4` (published 2026-04-09) | Unit and route verification | Use for query-planner, provider-normalizer, character-grounder, and prompt-boundary tests. |
| Brave Web Search API | Current docs opened 2026-04-12 | Focused web retrieval with operators, freshness, extra snippets | Prefer when current web facts matter and API key exists. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Typed `@ai-sdk/mcp` adapters | Raw HTTP/MCP parsing in app code | Lower ceremony, but repeats provider parsing logic and keeps the current brittle “find any tool with `search` in the name” behavior. |
| Reusing cached `IpResearchContext` | A new world-canon preload store | Violates D-04/D-06, duplicates canon facts, and creates cache drift between worldgen and runtime. |
| Adjacent `CharacterGroundingProfile` artifact | Expanding `CharacterRecord` with raw research blobs or numeric power tables | Inline storage is simpler short-term, but creates schema churn across routes/UI/runtime and encourages prompt bloat. |

**Installation:**
```bash
npm install ai @ai-sdk/mcp zod @lancedb/lancedb
```

**Version verification:** Verified on 2026-04-12 with:
```bash
npm view ai version
npm view @ai-sdk/mcp version
npm view zod version
npm view @lancedb/lancedb version
npm view hono version
npm view vitest version
```

## Architecture Patterns

### Recommended Project Structure
```text
backend/src/research/
├── retrieval-intent.ts      # classify worldgen/character/runtime lookup modes
├── query-planner.ts         # decompose mixed-premise requests into narrow subqueries
├── source-policy.ts         # source ranking and citation normalization
├── provider-adapters.ts     # typed Brave/MCP/DDG normalization
├── world-canon-grounder.ts  # wraps existing IpResearchContext seams
├── character-grounder.ts    # durable character + power profile synthesis
└── runtime-clarifier.ts     # explicit live fact lookup / comparison answers
```

### Pattern 1: Reuse the Worldgen Canon Cache
**What:** Keep world canon grounded through `researchKnownIP()` and `evaluateResearchSufficiency()`, then persist the enriched result back to campaign config via `saveIpContext()`.
**When to use:** Franchise/worldbook grounding during seed suggestion, scaffold generation, and section regeneration.
**Example:**
```typescript
// Source: local repo pattern in backend/src/worldgen/scaffold-generator.ts
if (ipContext) {
  ipContext = await evaluateResearchSufficiency(ipContext, "locations", refinedPremise, req.role, searchConfig);
}
```

### Pattern 2: Intent First, Query Second
**What:** Every research request should first resolve to a retrieval intent before any provider call. Recommended intents:
- `worldgen_overview`
- `worldgen_gap_fill`
- `character_identity`
- `character_power_profile`
- `runtime_fact_clarification`
- `runtime_power_comparison`

**When to use:** All worldgen, character, and live-game research entry points.
**Example:**
```typescript
// Source: recommended Phase 49 contract
const RetrievalIntentSchema = z.object({
  mode: z.enum([
    "worldgen_overview",
    "worldgen_gap_fill",
    "character_identity",
    "character_power_profile",
    "runtime_fact_clarification",
    "runtime_power_comparison",
  ]),
  subject: z.string(),
  comparisonTarget: z.string().nullable(),
  localWorldNeed: z.array(z.string()),
  externalCanonNeed: z.array(z.string()),
  outputShape: z.enum(["facts", "profile", "comparison"]),
});
```

### Pattern 3: Decompose Mixed-Premise Questions into Local vs External Facets
**What:** Split one blended request into:
- local-world facts already in campaign state or `IpResearchContext`
- external canon facts that need search
- power-scaling/supporting references
- synthesis instructions

**When to use:** “X in this diverged world” or cross-series power/comparison questions.
**Example:**
```text
Player asks: "Could Madara flatten the Iron District in this steampunk Naruto world?"
1. Local lookup: Iron District defenses, materials, current scale in world state.
2. Canon lookup: Madara Uchiha destructive feats; Susanoo scale; relevant durability constraints.
3. Supporting lookup: structured power-scaling references for destructive range.
4. Synthesis: WorldForge-owned comparison profile with confidence + citations.
```

### Pattern 4: Separate Clarification from Narration
**What:** Runtime clarification should be its own response mode. Use a dedicated API/UI action for explicit answers; only pass distilled facts into storyteller prompts when the engine needs them silently.
**When to use:** Fact lookup, event clarification, power comparison, or “what is true here?” requests during gameplay.
**Example:**
```typescript
// Source: Azure AI Search docs + local prompt boundary needs
// Research response payload should be extractive/structured, not narrator prose.
type RuntimeClarificationResult = {
  answer: string;
  facts: string[];
  citations: Array<{ label: string; url?: string }>;
  confidence: "high" | "medium" | "low";
};
```

### Pattern 5: Use Existing Character Ontology, but Add an Adjacent Grounded Profile Artifact
**What:** Keep runtime identity in `CharacterRecord.identity/profile/continuity/sourceBundle`. Store the heavier grounded power/ability comparison object in a separate artifact keyed by `campaignId + characterId`.
**When to use:** Imported/canonical characters and any character whose powers/constraints need repeatable reuse.
**Example:**
```typescript
// Source: recommended Phase 49 contract
interface CharacterGroundingProfile {
  characterId: string;
  identityFacts: string[];
  abilities: string[];
  constraints: string[];
  signatureMoves: string[];
  strengths: string[];
  vulnerabilities: string[];
  powerProfile: {
    destructiveScale: string | null;
    speed: string | null;
    durability: string | null;
    range: string | null;
    notes: string[];
  };
  citations: CharacterSourceBundle;
}
```

### Recommended Plan Slices
1. **Shared intent and provider core:** Add retrieval-intent schema, mixed-premise query planner, and typed provider adapters. Fix the existing `knownFromOverview` latent failure while touching `ip-researcher.ts`.
2. **Worldgen adoption:** Refactor `researchKnownIP()` and sufficiency checks to call the shared planner. Preserve `IpResearchContext` as the campaign-level canon cache.
3. **Character grounding adoption:** Add a dedicated character/canon/power grounder that outputs a compact adjacent artifact plus `sourceBundle` citations. Do not overload `researchArchetype()` for this.
4. **Runtime clarification surface:** Add a dedicated route and minimal UI entry point for explicit lookups/comparisons; add a silent backend-only seam only where the engine genuinely needs factual grounding.
5. **Prompt boundary hardening:** Ensure runtime clarification answers do not become generic `LORE CONTEXT` narration sludge. Distill facts before prompt injection, and add contamination tests.

### Anti-Patterns to Avoid
- **Blended mega-queries:** Do not send one search like `"Naruto steampunk Iron District Madara power comparison current state"` and hope ranking fixes it.
- **Raw search-note prompts:** Do not inject raw web notes or MCP transcript text into storyteller prompts.
- **Second canon store:** Do not create a parallel world-canon preload pass beside `IpResearchContext`.
- **Archetype seam overload:** Do not extend `/research-character` by just making its prose summary longer.
- **Character-record bloat:** Do not stuff a full power-scaling ontology into every `CharacterRecord` field group on the first pass.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Provider normalization | Heuristic “first tool containing `search`” selection plus freeform result parsing | Typed MCP schemas/output contracts and a narrow provider adapter interface | Current `web-search.ts` is brittle; official AI SDK docs explicitly support schema definitions and typed outputs. |
| Mixed-premise lookup | One giant concatenated search string | Retrieval-intent classifier + decomposed subqueries | Different facts have different lifecycles and source policies. |
| World canon reuse | A second preload/cache system | Existing `IpResearchContext` + `sourceGroups` + lore-card extraction | Already persisted, already reused, lower coupling. |
| Runtime fact answers | Ordinary storyteller narration | Dedicated clarification result contract | Keeps research distinct from scene prose and is easier to test. |
| Filtered retrieval | JS-side post-filter loops over vector results | LanceDB metadata filtering / hybrid search | Official docs already support prefiltering and metadata-aware retrieval. |
| Character grounding provenance | `backgroundSummary` / tags carrying all research truth | `sourceBundle` citations + adjacent grounded profile artifact | Preserves compact runtime identity while keeping evidence reusable. |

**Key insight:** WorldForge already has the right persistence split for this phase: campaign-level canon cache for world facts, character-level source/provenance semantics for identity, and vector retrieval for runtime recall. Phase 49 should add better intent and artifact boundaries, not invent new storage primitives everywhere.

## Common Pitfalls

### Pitfall 1: Silent Fallback Hides Bad Query Planning
**What goes wrong:** Research planning throws, then worldgen silently falls back to default broad queries.
**Why it happens:** `ip-researcher.ts` currently assumes `plan.knownFromOverview` exists and logs `.length`; tests showed that path can throw and still continue on fallback.
**How to avoid:** Treat retrieval planning as a typed contract with defaults; log fallback as a first-class signal and test it directly.
**Warning signs:** Repeated log line `Research planning failed, using default queries` even on healthy search results.

### Pitfall 2: Raw Player Actions Are Not Research Intents
**What goes wrong:** Runtime retrieval keys off the raw action text, so “I raise my sword and ask if this relic can kill a god” becomes a noisy semantic search query.
**Why it happens:** `buildLoreContextSection()` currently embeds `playerAction` directly and searches lore cards.
**How to avoid:** Classify whether the turn needs scene recall, fact clarification, or power comparison before retrieval.
**Warning signs:** `LORE CONTEXT` repeatedly returns irrelevant cards for ordinary scene actions.

### Pitfall 3: The Archetype Seam Produces Inspiration, Not Canon Truth
**What goes wrong:** Canon character grounding gets reduced to a prose inspiration summary.
**Why it happens:** `researchArchetype()` returns only `string | null` and `/research-character` only supports archetype-to-original-character drafting.
**How to avoid:** Keep archetype generation intact for original drafts; add a separate character grounder for canon identity/power artifacts.
**Warning signs:** Source citations disappear, power traits collapse into vague tags, and the same character must be re-searched during gameplay.

### Pitfall 4: Search Results Leak into Narration
**What goes wrong:** Storyteller output starts echoing bracketed context or exposition-dumping search findings.
**Why it happens:** Runtime prompt assembly already includes `LORE CONTEXT`; adding more unfiltered research without a separate mode increases contamination risk.
**How to avoid:** Keep clarification responses extractive/structured and only inject distilled facts into narration prompts when strictly necessary.
**Warning signs:** Visible narration mentions source-like phrasing, repeats `LORE CONTEXT`, or starts answering fact questions mid-scene.

### Pitfall 5: Power Profiles Become a New Balance System by Accident
**What goes wrong:** The implementation drifts from grounded profile synthesis into combat-solver or anti-runaway balance design.
**Why it happens:** Cross-series power questions naturally invite mitigation mechanics.
**How to avoid:** Scope Phase 49 to grounded facts, reusable profiles, and clarification outputs. Leave force-cost/world-backlash systems for a later phase.
**Warning signs:** New mechanics alter action resolution or world backlash rules instead of just improving factual grounding.

## Code Examples

Verified patterns from official or canonical sources:

### Typed MCP Tool Definitions
```typescript
// Source: https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools
const tools = await mcpClient.tools({
  schemas: {
    search: {
      inputSchema: z.object({
        query: z.string(),
        count: z.number().optional(),
      }),
      outputSchema: z.object({
        results: z.array(
          z.object({
            title: z.string(),
            url: z.string(),
            snippet: z.string(),
          }),
        ),
      }),
    },
  },
});
```

### LanceDB Metadata-Filtered Retrieval
```typescript
// Source: https://docs.lancedb.com/search/filtering
const rows = await table
  .search(queryVector)
  .where("(campaign_id = 'abc') AND (artifact_type = 'character_power')")
  .limit(5)
  .toArray();
```

### Existing Worldgen Canon-Reuse Seam
```typescript
// Source: local repo pattern in backend/src/routes/worldgen.ts
let ipContext = bodyIpContext ?? loadIpContext(campaignId);
if (!ipContext) {
  ipContext = await researchKnownIP(
    { premise: campaign.premise, name: campaign.name, research: settings.research },
    gen.resolved,
  );
  if (ipContext) saveIpContext(campaignId, ipContext);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw action text as retrieval query | Intent-classified retrieval with query planning and bounded context | Current 2025-2026 agentic retrieval practice | Fewer blended searches and less narrator contamination |
| Heuristic MCP tool discovery and freeform parsing | Explicit MCP schemas and typed outputs | AI SDK 6 docs current as of 2026-04 | Safer provider adapters and fewer provider-specific bugs |
| Vector-only recall without filters | Vector + metadata filtering / hybrid search | Current LanceDB docs | Lets runtime request only world, character, or power artifacts relevant to the contract |
| Pre-synthesized answer blobs fed to an agent | Extractive data plus filtered context | Azure AI Search docs current 2026-04 | Better reasoning over source facts and tighter control of prompt contamination |

**Deprecated/outdated:**
- Raw `researchContext: string` as the only character-research artifact: too weak for canon/power reuse.
- Treating DDG HTML scraping as reliable production search: current code already labels it unstable; Phase 49 should not depend on it for correctness.

## Open Questions

1. **What should the first explicit player-facing runtime research action be?**
   - What we know: D-16 to D-18 require an explicit clarification/fact/comparison surface, but the current UI has no gameplay research action.
   - What's unclear: slash-command, button, side panel, or quick-action affordance.
   - Recommendation: Plan the backend contract first and let the frontend start with one minimal explicit surface, such as `Ask for clarification`, that can later expand in Phase 50.

2. **Where should the first `CharacterGroundingProfile` live physically?**
   - What we know: `CharacterRecord` is already widely shared and `sourceBundle` is citation-oriented, not query-oriented for power metrics.
   - What's unclear: JSON artifact in campaign storage vs new DB table.
   - Recommendation: Start with a campaign-local JSON artifact keyed by character ID, referenced from `sourceBundle`; only promote to a DB table if runtime querying becomes frequent.

3. **How granular should the initial power profile be?**
   - What we know: The user wants destructive scale, speed, durability, strengths, vulnerabilities, and signature moves grounded, but does not want this phase to become balance design.
   - What's unclear: freeform phrases vs bounded tiers.
   - Recommendation: Use bounded qualitative fields plus supporting notes first; avoid numeric battle math in Phase 49.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node` | MCP/search adapters, test runs | ✓ | `v23.11.0` | — |
| `npm` / `npx` | package scripts, MCP stdio startup | ✓ | `11.12.1` | — |
| `BRAVE_SEARCH_API_KEY` | Brave provider in live research | ✗ | — | Mock provider in tests; runtime can fall back to other providers |
| `ZAI_API_KEY` | Z.AI HTTP MCP provider | ✗ | — | Mock provider in tests; runtime can fall back to Brave or local-only behavior |

**Missing dependencies with no fallback:**
- None for planning and test-driven implementation.

**Missing dependencies with fallback:**
- `BRAVE_SEARCH_API_KEY` and `ZAI_API_KEY` are absent in this shell session. Implementation should therefore keep provider logic mockable and must not require live web access for automated tests.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `3.2.4` in repo; npm registry latest verified `4.1.4` |
| Config file | `backend/vitest.config.ts`, `frontend/vitest.config.ts`, `shared/vitest.config.ts` |
| Quick run command | `npm --prefix backend exec vitest run src/worldgen/__tests__/ip-researcher.test.ts src/routes/__tests__/worldgen.test.ts src/routes/__tests__/character.test.ts src/engine/__tests__/prompt-assembler.test.ts src/character/__tests__/archetype-researcher.test.ts && npm --prefix frontend exec vitest run components/settings/__tests__/research-tab.test.tsx components/world-review/__tests__/npcs-section.test.tsx lib/__tests__/api.test.ts` |
| Full suite command | `npm --prefix shared exec vitest run && npm --prefix backend exec vitest run && npm --prefix frontend exec vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RES-01 | Worldgen research decomposes into explicit overview/gap-fill queries and reuses cached canon instead of vague blended search | unit + route integration | `npm --prefix backend exec vitest run src/worldgen/__tests__/ip-researcher.test.ts src/routes/__tests__/worldgen.test.ts` | ✅ |
| RES-01 | Character grounding stores durable identity/power evidence separately from plain archetype prose | unit + route integration | `npm --prefix backend exec vitest run src/routes/__tests__/character.test.ts src/character/__tests__/archetype-researcher.test.ts` | ⚠️ Partial only |
| RES-01 | Live gameplay clarification uses explicit intent and does not contaminate narration | unit + integration | `npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts src/routes/__tests__/chat.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** quick run command above
- **Per wave merge:** full suite command above
- **Phase gate:** Full relevant Vitest suites green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/research/__tests__/retrieval-intent.test.ts` — covers RES-01 intent classification and mixed-premise query decomposition
- [ ] `backend/src/research/__tests__/character-grounder.test.ts` — covers RES-01 durable character/power grounding artifact synthesis
- [ ] `backend/src/routes/__tests__/runtime-research.test.ts` — covers explicit gameplay clarification route + source/citation contract
- [ ] `backend/src/engine/__tests__/prompt-assembler.runtime-research.test.ts` — proves grounded clarification facts stay bounded and do not leak into normal scene narration
- [ ] Backend typecheck baseline is currently red on unrelated files; Phase 49 cannot rely on `npm --prefix backend run typecheck` as a gate until that baseline is repaired or explicitly waived

## Sources

### Primary (HIGH confidence)
- Local repo: `backend/src/worldgen/ip-researcher.ts`, `backend/src/worldgen/scaffold-generator.ts`, `backend/src/routes/worldgen.ts` — current worldgen research flow, cache reuse, sufficiency enrichment
- Local repo: `backend/src/character/archetype-researcher.ts`, `backend/src/routes/character.ts`, `shared/src/types.ts`, `backend/src/routes/schemas.ts` — current character seam, shared ontology, `sourceBundle`, and schema limits
- Local repo: `backend/src/engine/prompt-assembler.ts`, `backend/src/engine/turn-processor.ts` — current runtime lore retrieval and narration-boundary behavior
- Vercel AI SDK docs: https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools — transport guidance, typed `schemas`, and typed `outputSchema`
- Azure AI Search docs: https://learn.microsoft.com/en-us/azure/search/agentic-retrieval-how-to-create-pipeline — extractive retrieval, reasoning effort, subquery control, and filtering context before tool calls
- LanceDB docs: https://docs.lancedb.com/search/filtering and https://docs.lancedb.com/ — metadata filtering, prefilter behavior, vector/full-text/hybrid retrieval support
- Brave Search API docs: https://api-dashboard.search.brave.com/app/documentation/web-search/codes — search operators, freshness, extra snippets, pagination, and `count` limit
- npm registry via `npm view` on 2026-04-12 — current versions and publish dates for `ai`, `@ai-sdk/mcp`, `zod`, `hono`, `@lancedb/lancedb`, `vitest`

### Secondary (MEDIUM confidence)
- Executed repo tests: backend Vitest suites for `ip-researcher`, `worldgen`, `character`, `prompt-assembler`, `archetype-researcher`; frontend Vitest suites for `research-tab`, `npcs-section`, `api` — used to verify existing seams and surface latent failures

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - backed by current package manifests, npm registry checks, and official docs
- Architecture: HIGH - based on direct source review of current seams plus official retrieval/tooling docs
- Pitfalls: HIGH - based on observed code paths, executed tests, and current official guidance on retrieval boundaries

**Research date:** 2026-04-12
**Valid until:** 2026-05-12

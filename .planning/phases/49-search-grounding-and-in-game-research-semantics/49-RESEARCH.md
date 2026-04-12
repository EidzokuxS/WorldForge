# Phase 49: Search Grounding & In-Game Research Semantics - Research

**Researched:** 2026-04-12
**Domain:** Grounded retrieval for worldgen, character/power profiling, and bounded live gameplay clarification
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### What Search Is For
- **D-01:** Search exists as grounding, not as decorative web access.
- **D-02:** The main purpose is to prevent confident model drift on canon details, character facts, event history, and power-system specifics.
- **D-03:** Search-backed grounding is needed in world formation, character creation/import, and live gameplay fact clarification.

### World Canon vs Preloading
- **D-04:** Do not bulk-preload world canon before campaign start.
- **D-05:** World canon should be researched during world formation and then reused from already gathered knowledge.
- **D-06:** The phase should improve reuse, deduplication, and retrieval of stored world canon instead of adding a second preload pass.

### Character and Power Profiles
- **D-07:** Important character facts should be prepared and stored ahead of play instead of being re-googled repeatedly.
- **D-08:** Precomputed grounding should include identity facts, abilities, constraints, signature moves, strong points, vulnerabilities, and a structured power profile.
- **D-09:** Prefer compact structured summaries or character-focused lore bundles over raw research blobs in prompt context.

### Power Grounding
- **D-10:** Power comparisons must not be left to raw model intuition.
- **D-11:** Power-scaling sources may be used as one input for destructive scale, speed, durability, and battle traits, but they are not absolute truth by themselves.
- **D-12:** WorldForge should synthesize its own structured power profile from grounded inputs.

### Scope of This Phase
- **D-13:** Phase 49 owns query quality, source-of-truth rules, reuse/storage semantics, lookup boundaries, and character/power grounding profiles.
- **D-14:** Phase 49 does not fully solve gameplay countermeasures for overpowered characters.
- **D-15:** World-balance backlash/countermeasure systems belong to a later gameplay/balance phase.

### Player-Facing Surface
- **D-16:** Live gameplay research uses a hybrid surface.
- **D-17:** The engine may use grounding silently where needed, but the player should also have an explicit way to ask for fact lookup, clarification, or comparison.
- **D-18:** Research must stay separate from ordinary scene narration and must not dump giant research blobs into play.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RES-01 | Search and research flows use explicit retrieval intent in both worldgen and live gameplay, producing focused, useful grounded context instead of vague blended queries. | Add an explicit retrieval-intent layer, split world canon reuse from character/power profiling, and introduce a bounded live-lookup seam that feeds factual results into play without contaminating ordinary scene narration. |

</phase_requirements>

## Summary

The codebase already has a real worldgen research pipeline. `backend/src/worldgen/ip-researcher.ts` can detect a franchise, run broad overview search, generate targeted follow-up queries, evaluate sufficiency for specific scaffold steps, and enrich the cached `IpResearchContext`. `backend/src/routes/worldgen.ts` already persists that context in `config.json` through `saveIpContext()`. That means Phase 49 should not invent a parallel "world canon cache." The right direction is to reuse and tighten this existing pipeline.

The missing half is live grounding and structured power truth. Character creation currently has only `researchArchetype()` in `backend/src/character/archetype-researcher.ts`, which is useful for original archetype inspiration but not for durable canon-grade character research or power comparison. There is no equivalent runtime seam for "clarify what happened in canon," "compare these two characters," or "what is this character actually capable of?" Today, those questions are left to model intuition or to whatever partial lore already happens to be in context.

The storage picture is also asymmetric. World canon already has a home in `IpResearchContext` inside campaign `config.json`, and searchable lore cards already have a home in `backend/src/vectors/lore-cards.ts`. Character identity gained `sourceBundle` and continuity fields in Phase 48, but there is no explicit power-profile contract yet. Phase 49 should use that Phase 48 groundwork instead of creating a detached character-research subsystem.

There is also one subtle worldgen risk already visible in the current seam: `ip-researcher.ts` has fallback behavior during research planning and verification that can silently degrade into generic searches when the intended query planning fails. If Phase 49 only "improves output quality" without locking the decomposition contract in tests, the system can appear improved while still dropping back to vague blended retrieval under pressure.

The strongest planning direction is therefore:
- keep world canon research inside the existing worldgen/IP context lane,
- add a query-intent layer that asks narrow retrievable questions instead of blended mega-prompts,
- create durable character/power grounding artifacts that can plug into Phase 48 identity structures,
- add a bounded live gameplay lookup path for explicit clarification requests and engine-side factual grounding.

**Primary recommendation:** Plan Phase 49 around three coupled seams:
1. explicit retrieval-intent/query decomposition,
2. durable character/power grounding artifacts,
3. bounded live gameplay clarification that uses those artifacts without polluting scene narration.

## Project Constraints

- Keep the LLM as narrator/interpreter only; backend code continues to own mechanical truth.
- Do not add a second world-canon store when `ipContext` and lore storage already exist.
- Keep shared contracts in `@worldforge/shared`; do not fork backend-only versions of grounded profile types.
- Follow backend route conventions (`parseBody`, outer try/catch, `getErrorStatus`) for any new or expanded APIs.
- Keep live gameplay research bounded and intentional; do not turn ordinary scene assembly into a general-purpose web-search dump.
- Do not let Phase 49 silently expand into a full gameplay balance phase for god-tier characters.

## Standard Stack

### Core
| Library / Seam | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| `backend/src/worldgen/ip-researcher.ts` | repo HEAD | Existing franchise detection, search planning, and sufficiency enrichment | Already the authoritative worldgen research seam. |
| `backend/src/routes/worldgen.ts` + `backend/src/campaign/manager.ts` | repo HEAD | Persist and reuse `ipContext` and `premiseDivergence` in campaign config | Already the world-canon storage lane. |
| `backend/src/character/archetype-researcher.ts` | repo HEAD | Existing character research entry point | Natural starting seam for richer character/power grounding. |
| `shared/src/types.ts` Phase 48 identity structures | repo HEAD | Existing shared place for `sourceBundle`, continuity, and future grounded profile types | Prevents a detached runtime truth model. |
| `backend/src/vectors/lore-cards.ts` | repo HEAD | Existing searchable lore storage for reusable world facts | Avoids inventing another lore store for reusable research. |

### Supporting
| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| `zod` | 4.3.6 | New schemas for grounded profile/lookup contracts | Required for route and shared-contract changes. |
| `vitest` | 3.2.4 | Contract, route, and runtime regression coverage | Use for all automated verification in this phase. |
| `frontend/components/settings/research-tab.tsx` | repo HEAD | User-facing research settings copy and possible scope expansion | Update only if research is no longer "worldgen only". |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reusing `ipContext` and lore vectors | A new all-purpose "research DB" | More explicit on paper, but duplicates current world-canon storage and increases truth drift risk. |
| Structured power profiles adjacent to Phase 48 identity/source data | Ad hoc power comparisons generated on demand every time | Simpler short term, but repeats lookup work and leaves runtime too dependent on model intuition. |
| Bounded explicit live lookup seam | Hidden automatic search inside normal scene generation | Less UI/API work, but it hides reasoning, muddies narration boundaries, and makes failure/debugging much worse. |

**Installation:**
```bash
# No new packages are required for the recommended Phase 49 shape.
```

## Existing Architecture Findings

### What Already Exists
1. **World canon research is real and reusable**
   - `researchKnownIP()` builds `IpResearchContext`.
   - `evaluateResearchSufficiency()` enriches it per scaffold step.
   - `saveIpContext()` / `loadIpContext()` persist it in campaign `config.json`.
   - `worldbookSelection` composition already merges selected worldbooks into the same effective lore lane.

2. **Character research exists, but only in a weak archetype form**
   - `/api/worldgen/research-character` calls `researchArchetype()`.
   - The output is still just a compact archetype summary feeding generator prompts.
   - It does not produce a durable canon profile or power profile.

3. **Phase 48 left the right hook points**
   - Characters now have `sourceBundle` and continuity on the shared record.
   - This provides a credible place to attach canon/provenance and possibly bounded power-grounding data.

### What Is Missing
1. **No explicit retrieval-intent contract**
   - Mixed-premise requests can still turn into vague blended searches.
   - There is no shared typed layer for "what exactly are we trying to retrieve?"

2. **No durable power-profile contract**
   - Nothing in `shared/src/types.ts` currently captures destructive scale, speed/reaction, survivability, constraints, counters, or uncertainty.

3. **No true live gameplay lookup seam**
   - Search is framed in settings and routes as a worldgen support feature.
   - Runtime play has no clear bounded path for explicit clarification or comparison requests.

4. **No clean boundary between search output and scene output**
   - Without a dedicated runtime lookup lane, factual grounding risks leaking into ordinary narration as a blob of research text.

## Suggested Plan Decomposition

1. **Shared retrieval-intent and artifact contract**
   - Define explicit search intents and grounded artifact shapes.
   - Tighten worldgen query decomposition and reuse existing `ipContext`/lore storage instead of duplicating it.

2. **Character and power grounding**
   - Extend character research from "archetype help" to durable canon/power profile synthesis.
   - Reuse Phase 48 shared identity/source seams rather than inventing a separate per-character store.

3. **Live gameplay lookup and bounded presentation**
   - Add a hybrid runtime lookup seam: hidden support where the engine needs it plus explicit player-facing clarification requests.
   - Keep live lookup output separate from normal scene narration.

4. **Surface convergence**
   - Update route/schema/world-review/settings surfaces so research is no longer described as only a worldgen toggle if that stops being true.
   - Keep the explicit live path minimal; this phase should not become a rich research UI overhaul.

## Architecture Patterns

### Pattern 1: Retrieval Intent Before Search
**What:** Convert a broad user ask into a small set of concrete retrieval jobs before searching.
**When to use:** Any mixed-premise worldgen prompt or live gameplay clarification request.
**Example:**
```ts
type RetrievalIntent =
  | { kind: "world_canon_fact"; subject: string; focus: "location" | "faction" | "event" | "rule" }
  | { kind: "character_canon_fact"; character: string; focus: "identity" | "history" | "ability" | "relationship" }
  | { kind: "power_profile"; character: string; compareAgainst?: string | null }
  | { kind: "event_clarification"; event: string; franchise: string };
```

### Pattern 2: Reuse Existing World Canon Lane
**What:** World canon stays in `ipContext` plus searchable lore, and later steps pull from that lane instead of creating new stores.
**When to use:** All worldgen and lore-grounded world questions.
**Example:**
```ts
const worldCanon = loadIpContext(campaignId);
const loreMatches = await searchLoreCards(queryVector, 5);
```

### Pattern 3: Character/Power Profiles as Durable Grounded Summaries
**What:** Canon and power facts become compact structured summaries, not live raw search dumps.
**When to use:** Character creation, import, and later runtime comparison/lookup.
**Example:**
```ts
type PowerProfile = {
  scale: string;
  speed: string;
  durability: string;
  hax: string[];
  constraints: string[];
  vulnerabilities: string[];
  uncertaintyNotes: string[];
  sources: CharacterIdentitySourceCitation[];
};
```

### Pattern 4: Live Lookup Is Separate From Scene Assembly
**What:** A runtime clarification request produces a bounded factual answer or summary, then scene narration can react to that result if needed.
**When to use:** Player explicitly asks to compare, recall, verify, or clarify.
**Example:**
```ts
const lookup = await runGroundedLookup(intent, runtimeContext);
return {
  kind: "lookup_result",
  answer: lookup.answer,
  citations: lookup.citations,
  sceneImpact: lookup.sceneImpact,
};
```

## Anti-Patterns to Avoid

- **Second world-canon database:** duplicates `ipContext` and invites drift.
- **Always-live web search in normal scene generation:** slow, noisy, and hard to debug.
- **Power by vibes:** leaving power comparisons to unstated model intuition.
- **One giant blended search query:** exactly the failure mode the user called out.
- **Raw research blob in narration:** factual grounding must stay bounded and purpose-built.

## Common Pitfalls

### Pitfall 1: Query decomposition remains cosmetic
**What goes wrong:** The system claims to do intent-based search, but still emits giant blended search strings.
**How to avoid:** Add test-owned typed intent planning and assert generated search units, not just final output prose.

### Pitfall 2: Character grounding forks away from Phase 48
**What goes wrong:** Phase 49 invents a standalone character-research object that runtime identity never reads.
**How to avoid:** Make grounded character/power data extend or feed the Phase 48 `sourceBundle`/identity lane.

### Pitfall 3: Runtime lookup contaminates scene output
**What goes wrong:** Search summaries leak directly into ordinary narration, bloating turns and breaking scene feel.
**How to avoid:** Keep lookup results in a dedicated runtime result type and only surface them explicitly or through bounded downstream consequences.

### Pitfall 4: Power profile becomes fake precision
**What goes wrong:** The system assigns neat labels to highly uncertain cross-series comparisons and presents them as hard truth.
**How to avoid:** Preserve uncertainty, source citations, and unresolved edges inside the structured power profile.

### Pitfall 5: Research settings stay misleading
**What goes wrong:** The backend gains runtime grounding while the UI and docs still say research is "for franchise lore before worldgen."
**How to avoid:** Update settings copy and any affected route/front-end labels as part of the phase.

### Pitfall 6: Repo-wide typecheck is already red and hides real regression signal
**What goes wrong:** The phase claims broad verification but depends on a repo-wide typecheck baseline that is already failing for unrelated reasons.
**How to avoid:** Use targeted tests and targeted type-safe seams for this phase unless the baseline is repaired first.

## Concrete Recommendations

1. **Do not rebuild world canon storage.**
   - Extend and normalize `IpResearchContext` reuse instead.

2. **Add a typed retrieval-intent planner.**
   - Worldgen and live lookup should both go through it.

3. **Create a shared grounded profile contract for characters and power.**
   - Prefer storing it adjacent to Phase 48 provenance/continuity, not in a detached subsystem.

4. **Keep live gameplay lookup bounded and intentional.**
   - Explicit requests first: clarify event, compare powers, verify fact, recall canon detail.

5. **Treat player-facing research as a hybrid surface.**
   - Hidden support for engine truth where necessary.
   - Explicit lookup for user-initiated clarification.

## Open Questions

1. **Should power profiles live directly in `CharacterRecord` or as adjacent linked research artifacts?**
   - Current evidence: Phase 48 already created the right provenance seams, but not the power-profile field itself.
   - Recommendation: keep planning flexible, but ensure the chosen shape is shared and durable.

2. **Which explicit live-lookup requests ship first?**
   - Candidate minimum set: canon fact recall, event clarification, power comparison.
   - Recommendation: plan those three before any richer research UI.

3. **How much citation/source detail should be user-visible in live play?**
   - Recommendation: preserve structured citations in the result contract, but keep the default player-facing surface concise.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | tests, scripts, repo tooling | ✓ | v23.11.0 | — |
| npm | workspace scripts and Vitest runs | ✓ | 11.12.1 | — |
| Vitest | all automated verification | ✓ | 3.2.4 | `npx vitest run` |
| Existing search providers (`brave`, `duckduckgo`, `zai`) | worldgen and future runtime grounding | ✓ in config model | repo-configured | fallback is provider selection, not new dependency |

**Known baseline caveat:** repo-wide backend/frontend typecheck is not a clean green gate today due to unrelated failures. Planning and verification for Phase 49 should therefore prefer targeted commands over claiming a full-repo typecheck pass.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `vitest.config.ts`, `backend/vitest.config.ts`, `frontend/vitest.config.ts` |
| Quick run command | `npx vitest run backend/src/worldgen/__tests__/ip-researcher.test.ts backend/src/character/__tests__/archetype-researcher.test.ts backend/src/routes/__tests__/character.test.ts backend/src/routes/__tests__/worldgen.test.ts backend/src/engine/__tests__/prompt-assembler.test.ts backend/src/engine/__tests__/turn-processor.test.ts backend/src/routes/__tests__/chat.test.ts frontend/components/settings/__tests__/research-tab.test.tsx` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RES-01 | Worldgen search planning decomposes mixed asks into narrow retrievable units and reuses cached canon correctly | unit/integration | `npx vitest run backend/src/worldgen/__tests__/ip-researcher.test.ts backend/src/routes/__tests__/worldgen.test.ts` | ✅ partial |
| RES-01 | Character research plus import seams produce durable canon/power grounding instead of only archetype prose or raw imported card data | unit/integration | `npx vitest run backend/src/character/__tests__/archetype-researcher.test.ts backend/src/routes/__tests__/character.test.ts` | ✅ partial |
| RES-01 | Runtime lookup path grounds fact/event/power clarification without bloating scene narration | unit/integration | `npx vitest run backend/src/engine/__tests__/prompt-assembler.test.ts backend/src/engine/__tests__/turn-processor.test.ts backend/src/routes/__tests__/chat.test.ts` | ✅ partial |
| RES-01 | Research settings/UI copy stays aligned with broadened grounding scope | frontend unit | `npx vitest run frontend/components/settings/__tests__/research-tab.test.tsx` | ✅ |

### Sampling Rate
- **Per task commit:** run the task-local command from the plan
- **Per wave merge:** run `npx vitest run`
- **Phase gate:** worldgen, character, runtime lookup, and surface-alignment suites all green before execution closeout

### Wave 0 Gaps
- [ ] Add explicit mixed-premise query-decomposition assertions to `backend/src/worldgen/__tests__/ip-researcher.test.ts`
- [ ] Add durable character/power-grounding coverage in `backend/src/character/__tests__/archetype-researcher.test.ts`
- [ ] Add route-level assertions for new grounded profile/lookup payloads in `backend/src/routes/__tests__/character.test.ts` and `backend/src/routes/__tests__/worldgen.test.ts`, including `/api/worldgen/import-v2-card` durability coverage
- [ ] Add runtime lookup boundary tests in `backend/src/engine/__tests__/prompt-assembler.test.ts` and `backend/src/engine/__tests__/turn-processor.test.ts` so scene prompts do not absorb raw research blobs
- [ ] Add frontend/settings assertions in `frontend/components/settings/__tests__/research-tab.test.tsx` if research scope language expands beyond worldgen-only copy

## Sources

### Primary (HIGH confidence)
- Repo search/research seams:
  - `backend/src/worldgen/ip-researcher.ts`
  - `backend/src/worldgen/mcp-research.ts`
  - `backend/src/lib/web-search.ts`
  - `backend/src/routes/worldgen.ts`
  - `backend/src/campaign/manager.ts`
  - `backend/src/vectors/lore-cards.ts`
- Repo character/runtime seams:
  - `backend/src/character/archetype-researcher.ts`
  - `backend/src/routes/character.ts`
  - `shared/src/types.ts`
  - `backend/src/engine/prompt-assembler.ts`
  - `backend/src/engine/turn-processor.ts`
  - `frontend/components/settings/research-tab.tsx`
  - `frontend/components/world-review/npcs-section.tsx`

### Secondary (MEDIUM confidence)
- User product constraints captured in `49-CONTEXT.md`
- Phase 48 shared identity/source-bundle contract decisions

## Metadata

**Confidence breakdown:**
- Current repo seams: HIGH
- Architecture recommendation: HIGH
- Exact final storage shape for power profiles: MEDIUM

**Research date:** 2026-04-12
**Valid until:** 2026-04-19

# Phase 49: Search Grounding & In-Game Research Semantics - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Rebuild search and research semantics so WorldForge uses external research as a grounding layer where model weights are unreliable, especially for canon facts, character details, and power comparisons. This phase is not about adding vague web access everywhere. It is about making worldgen, character creation, and live gameplay ask the right questions, retain the useful answers, and avoid dumping unfocused search sludge into scene play.

</domain>

<decisions>
## Implementation Decisions

### What Search Is For
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

### the agent's Discretion
- Exact storage shape for reusable canon findings versus per-character/power profiles
- Whether power profiles should live directly inside character records or in adjacent grounded knowledge artifacts
- Which live-game research requests become explicit player actions first, and which remain backend-only support seams
- Exact source-ranking policy between canon-facing references, fandom wikis, structured power-scaling sources, and community cards

</decisions>

<specifics>
## Specific Ideas

- The user explicitly does not trust raw model weights for fine canon details or for cross-series strength judgments.
- The user wants grounded answers when the system tries to reproduce or reference canon events, but still wants those events to remain adaptable inside diverged or mixed worlds.
- The user wants world-canon research to happen when the world is formed, not as a redundant preload pass that stuffs context with unused facts.
- The user wants character and power knowledge to be more durable and reusable than ordinary world lore snippets.
- The user explicitly raised mixed-franchise power problems such as comparing characters from different systems and keeping gameplay interesting instead of allowing one cosmic-scale actor to trivialize everything.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Requirements
- `.planning/ROADMAP.md` — Phase 49 goal and success criteria
- `.planning/REQUIREMENTS.md` — `RES-01` requirement for explicit retrieval intent in worldgen and live gameplay
- `.planning/PROJECT.md` — milestone stays open until gameplay baseline feels acceptable

### Existing Research and Search Seams
- `backend/src/worldgen/ip-researcher.ts` — current franchise research, query planning, sufficiency checks, and incremental fact enrichment during world generation
- `backend/src/worldgen/mcp-research.ts` — MCP/DDG-based autonomous research path and fallback behavior
- `backend/src/lib/web-search.ts` — unified search dispatcher and MCP parsing behavior
- `backend/src/routes/worldgen.ts` — on-demand and cached IP research during scaffold generation/regeneration
- `frontend/components/settings/research-tab.tsx` — current research settings are framed only around worldgen/IP research

### Existing Character-Research Seam
- `backend/src/character/archetype-researcher.ts` — current archetype research for character creation
- `backend/src/routes/character.ts` — `/api/worldgen/research-character` currently supports archetype research, not canon-grade character or power grounding
- `frontend/components/world-review/npcs-section.tsx` — frontend uses `researchCharacter()` for NPC creation support

### Nearby Runtime Consumers
- `backend/src/engine/prompt-assembler.ts` — likely downstream reader for any future grounded runtime context
- `backend/src/engine/turn-processor.ts` — final narration path where scene contamination boundaries will matter
- `backend/src/ai/provider-registry.ts` — search/grounding integrations must remain compatible with active model/provider setup

</canonical_refs>

<code_context>
## Existing Code Insights

### What Already Exists
- `ip-researcher.ts` already does franchise detection, broad overview search, targeted deep-dive queries, and sufficiency-driven follow-up searches for scaffold steps.
- The current worldgen research flow already stores useful facts in `IpResearchContext`, which means Phase 49 can build on real gathered canon rather than inventing a new parallel store.
- Character creation already has a research seam, but it is archetype-oriented and aimed at generating original drafts, not at building durable canon-accurate character/power profiles.

### What Is Missing
- There is no strong live gameplay research path for fact clarification, event lookup, or power comparison.
- There is no explicit structured power-profile contract for characters.
- The frontend research settings still describe research as something that happens before world generation, which understates the broader grounding problem the user wants solved.

### Structural Tension
- World canon, character canon, and power facts have different lifecycles.
- World facts should be gathered during world formation and reused.
- Character identity and power summaries should be durable and reusable across play without repeated live search.
- Live gameplay should only do targeted lookup when a grounded answer is actually needed.

</code_context>

<deferred>
## Deferred Ideas

- Full gameplay countermeasure design for god-tier characters belongs to a later balance/system phase, not to Phase 49’s core delivery.
- Rich text presentation of research results belongs to Phase 50.
- Broader writing-quality improvements belong to Phase 47; Phase 49 should improve correctness and usefulness of grounded inputs, not prose style by itself.

</deferred>

---

*Phase: 49-search-grounding-and-in-game-research-semantics*
*Context gathered: 2026-04-12*

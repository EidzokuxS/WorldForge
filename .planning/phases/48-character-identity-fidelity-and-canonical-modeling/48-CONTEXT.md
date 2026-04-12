# Phase 48: Character Identity Fidelity & Canonical Modeling - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Rebuild runtime character modeling so important characters keep the details that actually make them feel like themselves in play. This phase is not just about prettier character cards. It is about making native, imported, and canonical characters behave from a stronger identity model instead of collapsing into thin summaries, shallow tags, and generic goals.

</domain>

<decisions>
## Implementation Decisions

### Character Core
- **D-01:** A meaningful character must have a real identity core, not only a short description plus tags.
- **D-02:** That core is a behavioral source of truth: what the character fundamentally wants, how they tend to act under pressure, what they resist, what pulls them off balance, and what makes them distinct from a generic archetype.
- **D-03:** Runtime behavior should be driven from that stronger identity model, not from creation-time flavor alone.

### Canonical and Key Characters
- **D-04:** Key and canonical characters need a stricter identity-preservation path than ordinary generated characters.
- **D-05:** “Stricter” does not mean turning them into rigid scripted roles. The goal is to preserve internal logic, not force cosplay.
- **D-06:** Canonical characters must keep a strong starting identity plus meaningful inertia against shallow or instant personality drift.

### Three-Layer Truth Model
- **D-07:** Key/canonical characters should be modeled through three required layers:
  1. base facts,
  2. behavioral core,
  3. current live campaign dynamics.
- **D-08:** The first two layers define who the character is; the third layer defines how that identity has changed in this run.

### Change Over Time
- **D-09:** Character change is allowed and expected, but it must be earned through events, pressure, relationships, discoveries, defeats, or other accumulated causes.
- **D-10:** The system should support growth, damage, and reorientation without letting characters change personality from trivial momentary stimuli.

### Source-of-Truth for Canonical Modeling
- **D-11:** Canonical facts should come from reliable canon-facing sources.
- **D-12:** Community character cards can be used as secondary sources for voice, behavioral cues, and feel, but they are not authoritative truth by themselves.
- **D-13:** The final runtime model must be WorldForge’s own structured synthesis, not a direct copy of one wiki page or one imported card.

### Scope Shape
- **D-14:** The improved character model should raise the floor for all characters, not only for canonical ones.
- **D-15:** Key/canonical characters should receive an additional upper layer of fidelity and continuity on top of the shared stronger baseline.

### the agent's Discretion
- Exact field design for the richer character model
- Whether canonical fidelity needs one dedicated source bundle shape or can live inside the existing shared draft/record model with extensions
- How much of the new structure is editable in UI during this phase versus remaining backend-owned
- Exact import/mapping strategy from cards, canon notes, and existing draft surfaces

</decisions>

<specifics>
## Specific Ideas

- The current danger is flattening: a character becomes “name + vibe + tags + current goals,” which is not enough for believable key-character behavior.
- The user explicitly wants canonical characters to feel right because their quality strongly shapes the feel of the whole game.
- The user does not want canonical characters fossilized into one immutable script. Growth and divergence are acceptable when they are justified.
- The desired result is stronger identity continuity, not stricter fandom mimicry.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Requirements
- `.planning/ROADMAP.md` — Phase 48 goal, success criteria, and milestone positioning
- `.planning/REQUIREMENTS.md` — `CHARF-01` requirement for character runtime fidelity
- `.planning/PROJECT.md` — milestone remains open until live gameplay feel is acceptable

### Prior Character-Model Decisions
- `.planning/phases/29-unified-character-ontology-and-tag-system/29-CONTEXT.md` — shared ontology and derived-tags stance
- `.planning/phases/30-start-conditions-canonical-loadouts-and-persona-templates/30-CONTEXT.md` — shared `CharacterDraft` / `CharacterRecord` lane and start-condition/loadout decisions

### Live Character Model Surfaces
- `shared/src/types.ts` — current `CharacterDraft`, `CharacterRecord`, profile and motivations shape
- `backend/src/character/record-adapters.ts` — canonical record hydration, legacy compatibility, import mapping
- `backend/src/character/generator.ts` — player generation and imported-card prompt schema
- `backend/src/character/npc-generator.ts` — NPC import/generation compatibility projection
- `backend/src/character/persona-templates.ts` — current persona-template patch behavior
- `backend/src/character/prompt-contract.ts` — current shared character-contract wording
- `frontend/lib/character-drafts.ts` — frontend draft conversion and compatibility projection
- `frontend/components/character-creation/character-card.tsx` — current editable creation surface

### Runtime Consumers
- `backend/src/engine/prompt-assembler.ts` — scene narration context currently reading thin persona/motivation slices
- `backend/src/engine/npc-agent.ts` — NPC planning prompt currently driven mostly by persona summary, drives, frictions, beliefs, and goals
- `backend/src/engine/npc-offscreen.ts` — off-screen NPC simulation prompt contract
- `backend/src/engine/reflection-agent.ts` — reflection reads/writes durable character worldview fields

</canonical_refs>

<code_context>
## Existing Code Insights

### Where Identity Is Currently Thin
- `shared/src/types.ts` still gives `profile` only a small summary-shaped lane: species, gender, age, appearance, backgroundSummary, and personaSummary.
- `backend/src/character/generator.ts` explicitly compresses player/imported identity into `backgroundSummary` and `personaSummary`, while leaving several motivation fields empty for player characters by design.
- `backend/src/character/npc-generator.ts` still emits a compatibility projection centered on `persona`, tags, and goals before mapping back into a shared draft.
- `frontend/components/character-creation/character-card.tsx` edits a relatively shallow draft surface, so richer identity is not yet strongly represented in the user-facing model either.

### Where Runtime Already Depends On Identity
- `backend/src/engine/npc-agent.ts` builds NPC action prompts from persona summary, drives, frictions, beliefs, goals, traits, and relationships.
- `backend/src/engine/prompt-assembler.ts` surfaces NPC persona and beliefs into scene narration context.
- `backend/src/engine/reflection-agent.ts` can already evolve beliefs, goals, and relationships over time, which means Phase 48 can build on live change mechanisms instead of inventing them from scratch.

### Structural Tension
- The shared character contract already claims a richer unified model than the practical import/generation/runtime path consistently delivers.
- This phase should likely strengthen the shared model and its consumers, not fork separate unrelated models for creation, import, NPC runtime, and canonical handling.

</code_context>

<deferred>
## Deferred Ideas

- Search and web-grounded retrieval for per-character canon research belongs mainly to Phase 49, though Phase 48 may define the character-source contract that Phase 49 later feeds.
- Storyteller prose quality is Phase 47, even though richer character identity should improve output quality downstream.
- UI readability and rich text belong to Phase 50, not this phase.

</deferred>

---

*Phase: 48-character-identity-fidelity-and-canonical-modeling*
*Context gathered: 2026-04-12*

# Phase 25: Replace premise-override heuristics with structured divergence interpretation - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning
**Source:** Direct user feedback during known-IP worldgen debugging

<domain>
## Phase Boundary

Replace the current narrow premise-override layer with a first-class divergence-interpretation pipeline for known-IP world generation. The phase covers backend interpretation of user premise, structured divergence data, prompt wiring, and downstream use across DNA, refined premise, locations, factions, NPCs, and lore generation. It does NOT introduce new frontend UX, campaign UI flows, or unrelated worldgen features.

</domain>

<decisions>
## Implementation Decisions

### 1. Premise Must Be Interpreted as Canon + Divergence, Not as a String With Special Cases
- Known-IP generation must treat the user's premise as a set of modifications to canonical world state
- The system must build from `canonical world` + `premise divergence` -> `current world state`
- Divergence interpretation is a dedicated pipeline concern, not an incidental helper around one field
- LOCKED: The backend must stop thinking in terms of one-off protagonist replacement hacks

### 2. No Regex or String-Heuristic Fallbacks
- Regex-based or hand-authored string matching is explicitly rejected for this problem
- This phase must not "look for phrases like instead of X" as the primary or fallback mechanism
- If interpretation is ambiguous, the system should return structured uncertainty or no override, not pretend certainty from text heuristics
- LOCKED: No regex fallback layer for premise divergence interpretation

### 3. Structured Divergence Must Be a First-Class Artifact
- The pipeline should produce a structured object representing the user's divergence from canon
- That object should cover more than character exclusion and may include protagonist-role changes, relationship changes, allegiance changes, start-state changes, and canon facts that remain intact vs changed
- The divergence object should be reusable by all downstream worldgen steps, not recalculated ad hoc inside each prompt
- LOCKED: `excludedCharacters` alone is not a sufficient model for the problem

### 4. Prompt Contracts Must Explicitly Carry the Divergence
- Prompts for DNA, refined premise, locations, factions, NPCs, and lore must receive the interpreted divergence explicitly
- The prompts should work from "canonical baseline + interpreted divergence + current generation target"
- The model must be told to preserve canon unless the divergence changes it
- LOCKED: The solution must live in pipeline structure and prompt contracts, not only in post-processing

### 5. The Problem Is World-State Interpretation, Not Character Name Filtering
- The real issue is not whether a single canonical character name appears
- The issue is whether the system correctly understands what the user's premise means for the present state of the world
- Example: "I'm playing with my own char instead of Dr. Kel, I've just arrived" means the generated world should be built around that changed premise, not around blind re-emission of stock canon
- LOCKED: The implementation must solve the general world-state problem, not just suppress one canonical character

### 6. Canon Preservation Still Matters
- This phase must preserve the canonical-fidelity work from Phase 24 rather than weakening it
- The system should still keep canon as the baseline and apply only the logical consequences of the divergence
- For known IPs, unchanged canon remains unchanged; only divergence-driven consequences should differ
- LOCKED: Replace heuristics without regressing known-IP fidelity

### Claude's Discretion
- Exact schema shape for the structured divergence artifact
- Whether divergence interpretation should be a single dedicated LLM pass or a small staged pipeline
- Whether the artifact should live inside `IpResearchContext` or beside it as a separate structure
- How to represent "changed facts", "unchanged facts", and "current cast/starting situation" in the prompts
- Exact regression-test coverage and fixture scenarios

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current Override Layer
- `backend/src/worldgen/ip-context-overrides.ts` — Current narrow `excludedCharacters` interpretation logic that this phase replaces
- `shared/src/types.ts` — `IpResearchContext` and current `canonicalNames` / `excludedCharacters` shape

### Worldgen Pipeline
- `backend/src/worldgen/seed-suggester.ts` — DNA generation currently calling `applyPremiseCharacterOverrides()`
- `backend/src/worldgen/scaffold-generator.ts` — Main scaffold orchestration and current override entry point
- `backend/src/worldgen/scaffold-steps/prompt-utils.ts` — Canonical-fidelity prompt contract and current exclusion wording
- `backend/src/worldgen/scaffold-steps/premise-step.ts` — Refined premise generation target
- `backend/src/worldgen/scaffold-steps/locations-step.ts` — Location generation contract
- `backend/src/worldgen/scaffold-steps/factions-step.ts` — Faction generation contract
- `backend/src/worldgen/scaffold-steps/npcs-step.ts` — NPC generation contract
- `backend/src/worldgen/lore-extractor.ts` — Lore extraction grounded by scaffold/IP context

### Routes and Persistence
- `backend/src/routes/worldgen.ts` — Request flow, caching, generate/regenerate wiring
- `backend/src/routes/schemas.ts` — API schema preservation for IP context payloads
- `backend/src/campaign/manager.ts` — Campaign config persistence for worldgen context

### Existing Phase Context
- `.planning/phases/23-unified-research-world-generation-pipeline/23-CONTEXT.md` — Cached research pipeline that Phase 25 must build on
- `.planning/phases/24-worldgen-known-ip-quality/24-CONTEXT.md` — Canonical-fidelity goals that must remain intact

</canonical_refs>

<specifics>
## Specific Ideas

### Failure Case That Motivated This Phase
- Premise: `Voices of the Void, but I'm playing with my own char instead of/off Dr Kel, I've just arrived`
- Bad result: generated Characters and Lore still center `Dr. Kel` as if the premise were just a franchise tag
- Desired result: the system understands that the current world state is a diverged VotV setup with a custom protagonist occupying the active role/context

### Desired Architectural Direction
- Dedicated premise interpretation step before DNA/scaffold generation
- Structured output capturing world divergence
- Shared divergence artifact reused across all downstream steps
- Prompt instructions phrased in terms of canonical baseline plus divergence consequences

</specifics>

<deferred>
## Deferred Ideas

- UI for manually editing divergence interpretation before generation
- User-visible debug panel showing interpreted canon deltas
- Multi-divergence authoring tools or advanced scenario editors

</deferred>

---

*Phase: 25-replace-premise-override-heuristics-with-structured-divergence-interpretation*
*Context gathered: 2026-03-30 from direct user feedback*

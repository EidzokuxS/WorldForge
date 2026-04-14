# Phase 25: Replace premise-override heuristics with structured divergence interpretation - Research

**Researched:** 2026-03-30
**Domain:** Known-IP worldgen architecture, prompt contracts, structured divergence interpretation
**Confidence:** HIGH

## Summary

The current implementation already moved away from pure regex, but it still solves the wrong shape of problem. The backend has a dedicated helper, `applyPremiseCharacterOverrides()`, that infers only one kind of divergence: canonical characters to exclude from the active cast. That result is then threaded through `seed-suggester.ts`, `scaffold-generator.ts`, `worldgen.ts`, and `prompt-utils.ts` via `IpResearchContext.excludedCharacters`.

This is an improvement over string matching, but it is still too narrow for the user's requirement. It treats divergence as "character suppression" instead of "interpret the user's premise as modifications to canonical world state." As a result, the pipeline has no reusable structured object describing what changed, what stayed canon, what the current starting situation is, or what downstream generators must preserve versus rewrite.

**Primary recommendation:** introduce a first-class `PremiseDivergence` artifact beside `IpResearchContext`, generate it through a dedicated structured LLM interpretation step, persist/carry it through routes and worldgen requests, and make every known-IP prompt consume `canonical baseline + divergence directives` rather than only `excludedCharacters`.

## User Constraints (from 25-CONTEXT.md)

### Locked Decisions
1. Premise must be interpreted as canon + divergence, not as a string with special cases
2. No regex or string-heuristic fallbacks for divergence interpretation
3. Divergence must be a first-class structured artifact
4. Prompt contracts must explicitly carry divergence
5. The real problem is world-state interpretation, not character name filtering
6. Canonical fidelity from Phase 24 must not regress

### the agent's Discretion
- Exact schema shape of the divergence artifact
- Best insertion points in the pipeline
- Whether the artifact lives inside or beside `IpResearchContext`
- Exact migration and test strategy

## Current Codebase Diagnosis

### 1. The existing override model is still character-centric

**File:** `backend/src/worldgen/ip-context-overrides.ts`

Current flow:
- Model receives `premise` and `canonicalNames.characters`
- Returns `excludedCharacters`
- Helper removes matching characters from `canonicalNames.characters`
- Helper strips `keyFacts` mentioning those characters
- Result is written back into `IpResearchContext`

This means the pipeline only understands one semantic: "this canonical character should stay absent." It does **not** capture:
- changed protagonist role
- changed starting situation
- changed relationships or allegiances
- changed current cast membership vs canonical background existence
- which canon facts remain explicitly intact

### 2. Divergence is stored in the wrong conceptual container

**Files:** `shared/src/types.ts`, `backend/src/routes/schemas.ts`

`excludedCharacters` currently lives on `IpResearchContext`, which is otherwise a research/canon-reference object. That mixes two concerns:
- canonical source-of-truth research
- user-specific divergence directives

This makes later logic awkward, because mutating `ipContext` to reflect divergence blurs the line between "what canon says" and "what this campaign changed."

### 3. Prompts know about absence, not about interpreted world state

**File:** `backend/src/worldgen/scaffold-steps/prompt-utils.ts`

The current prompt contract has:
- canonical names
- canonical fidelity rules
- optional exclusion block saying replaced protagonists must not appear

That is helpful, but still too small. The prompts are not told:
- what role the player now occupies
- what changed in the current state of the world
- what starting conditions are now true
- what canon relationships remain untouched

### 4. The route/pipeline shape is already good enough for a cleaner insertion

**Files:** `backend/src/routes/worldgen.ts`, `backend/src/worldgen/seed-suggester.ts`, `backend/src/worldgen/scaffold-generator.ts`

The codebase already has clear insertion points:
- `suggest-seeds` and `/generate` can compute or reuse divergence before downstream generation
- scaffold generation already carries `ipContext` through every step
- section regeneration already receives per-step context

This means the phase can be implemented without rewriting the whole worldgen architecture.

### 5. Persistence already supports cached context patterns

**Files:** `backend/src/campaign/manager.ts`, `backend/src/routes/worldgen.ts`

Phase 23 established cached `ipContext` flow. The same pattern can be reused for divergence:
- compute once
- persist in campaign config if useful
- reuse on generate/regenerate
- enrich or recompute only when needed

## Recommended Target Architecture

### A. Create a dedicated `PremiseDivergence` type

Recommended shape:

```ts
interface PremiseDivergence {
  mode: "canonical" | "diverged";
  interpretationNotes: string[];
  currentStateDirectives: string[];
  preservedCanonFacts: string[];
  changedCanonFacts: string[];
  protagonist?: {
    kind: "canonical" | "custom";
    canonicalCharacterName?: string | null;
    roleSummary: string;
    currentStatus: "active" | "replaced" | "absent" | "coexisting";
  };
  characterDirectives?: Array<{
    canonicalName: string;
    status: "unchanged" | "replaced" | "absent" | "role_changed" | "relationship_changed";
    directive: string;
  }>;
  factionDirectives?: string[];
  locationDirectives?: string[];
}
```

The exact field names can vary, but the artifact should:
- separate interpretation from canon research
- be reusable by all prompts
- be explicit enough that downstream calls do not need to re-interpret premise text

### B. Keep canonical research immutable

`IpResearchContext` should remain canonical reference data. Avoid mutating it into a campaign-specific "already diverged canon." Instead:
- keep canonical names/facts intact in `ipContext`
- carry divergence beside it
- let prompts reason from `canon + divergence`

This preserves Phase 24’s fidelity model much better than deleting facts from canon.

### C. Add a dedicated interpretation step

Recommended helper:
- `interpretPremiseDivergence(ipContext, premise, role): Promise<PremiseDivergence | null>`

Responsibilities:
- only run for known-IP contexts
- use structured `safeGenerateObject`
- explicitly decide whether the premise is canonical or diverged
- output concrete directives for downstream worldgen
- never fall back to regex

### D. Build a reusable prompt block for divergence

Add prompt helpers analogous to `buildIpContextBlock()`:
- `buildDivergenceBlock(divergence)`
- `buildKnownIpGenerationContract(ipContext, divergence)`

This block should tell the model:
- what remains canon
- what changed
- what the current cast/state should reflect
- what must not be reintroduced accidentally

### E. Thread divergence through all known-IP generation entry points

Required touchpoints:
- `suggestWorldSeeds()`
- `suggestSingleSeed()`
- `generateWorldScaffold()`
- `generateRefinedPremiseStep()`
- `generateLocationsStep()`
- `generateFactionsStep()`
- `generateNpcsStep()`
- `extractLoreCards()`
- `/api/worldgen/suggest-seeds`
- `/api/worldgen/generate`
- `/api/worldgen/regenerate-section`

## Migration Strategy

### Stage 1: Add new types and helper without removing old behavior immediately
- Add `PremiseDivergence` to `shared/src/types.ts`
- Extend route schemas and request types
- Add `interpret-premise-divergence.ts`
- Keep `excludedCharacters` temporarily for compatibility if needed

### Stage 2: Switch prompts and pipeline to use divergence artifact
- Compute divergence once in route/service entry points
- Pass it through request objects and prompts
- Update prompt-utils to express divergence as first-class instructions

### Stage 3: Delete or drastically reduce old override helper
- Remove `applyPremiseCharacterOverrides()` or reduce it to a compatibility shim around the new interpreter
- Stop mutating canonical names/facts as the primary mechanism

## Recommended Plan Slices

### Plan 25-01: Types + interpreter + request plumbing
- Add shared divergence type
- Add Zod schema support
- Add new interpreter helper
- Extend worldgen request types/routes/cache to carry divergence

### Plan 25-02: Prompt contract migration across DNA + scaffold + lore
- Replace exclusion-centric prompt blocks with divergence-aware blocks
- Wire divergence into seed generation, refined premise, locations, factions, NPCs, lore
- Remove direct reliance on mutating `canonicalNames.characters`

### Plan 25-03: Regression tests + cleanup
- Add interpreter tests
- Add route/cache handoff tests
- Add prompt/step regression coverage for canonical + diverged cases
- Remove obsolete helper logic and dead fields if safe

## Test Strategy

### Unit tests
- Interpreter returns `mode: diverged` with explicit protagonist replacement
- Interpreter returns `mode: canonical` / no-op for "I just arrived in the setting"
- Interpreter handles coexisting custom protagonist without suppressing canon

### Route tests
- `/suggest-seeds` returns `_ipContext` plus divergence artifact if known IP
- `/generate` saves and reloads divergence along with cached context
- `/regenerate-section` uses cached divergence, not ad hoc reinterpretation per step

### Prompt/behavior tests
- Prompt block includes divergence directives and preserved canon
- Known-IP generation steps receive divergence block
- No regex/string-matching helper remains on critical path

### Regression scenarios
1. `Voices of the Void, but I'm playing with my own char instead of Dr Kel, I've just arrived`
2. `Naruto, but Sakura was trained by Orochimaru`
3. `Star Wars, but Order 66 failed`
4. `I arrive in the Naruto world as an outsider` -> should NOT imply protagonist replacement

## Main Risks

### Risk 1: Over-designing the artifact
If the schema becomes too abstract, prompts will ignore it. Keep it concrete and instruction-oriented.

### Risk 2: Regressing Phase 24 canonical fidelity
If divergence replaces canon instead of modifying it, known-IP quality will slip back into fanfic mode.

### Risk 3: Cache inconsistency
If `ipContext` and divergence are persisted separately but updated inconsistently, regenerate routes may drift. Prefer one clear cache flow and test it.

## Bottom Line

The codebase is already close to the right architectural shape. The missing piece is not "better name filtering," but a reusable structured divergence artifact and prompt contract. The safest implementation path is:

1. add `PremiseDivergence`
2. interpret premise once
3. pass divergence through all known-IP generation steps
4. stop mutating canon as the main representation of user changes

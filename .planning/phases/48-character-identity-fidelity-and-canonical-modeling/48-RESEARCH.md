# Phase 48: Character Identity Fidelity & Canonical Modeling - Research

**Researched:** 2026-04-12
**Domain:** Runtime character identity modeling, canonical/imported character synthesis, and behavior-preserving structured records
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Deferred Ideas (OUT OF SCOPE)
- Search and web-grounded retrieval for per-character canon research belongs mainly to Phase 49, though Phase 48 may define the character-source contract that Phase 49 later feeds.
- Storyteller prose quality is Phase 47, even though richer character identity should improve output quality downstream.
- UI readability and rich text belong to Phase 50, not this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHARF-01 | Character runtime modeling preserves distinctive personality, motives, and identity details for both native and imported/canonical characters. | Extend the shared record into three layers, preserve source provenance for imported/canonical inputs, drive runtime prompts from structured identity fields instead of persona/tag summaries, and constrain live drift to the campaign-dynamics layer. |
</phase_requirements>

## Summary

The repo already has one shared character lane, but it is still effectively running on a thin compatibility model. `shared/src/types.ts`, `backend/src/character/generator.ts`, `backend/src/character/npc-generator.ts`, `frontend/lib/character-drafts.ts`, and the runtime consumers in `prompt-assembler.ts`, `npc-agent.ts`, and `reflection-agent.ts` still converge on a small set of summary fields: persona, tags, goals, beliefs, and short profile blurbs. That shape is enough to create characters, but not enough to preserve why a specific character behaves differently from a generic archetype once play starts.

The external evidence points in the same direction. Modern character-card ecosystems preserve richer structured or extension data instead of treating tags as identity truth, while current agent-consistency research separates stable identity from episodic memory and live adaptation. For WorldForge, the strongest planning direction is not a separate canonical-only model. It is one stronger shared model for all characters, with an additional source bundle and stricter continuity path for key/canonical/imported characters.

The planning target should be a three-layer record: `base facts`, `behavioral core`, and `live campaign dynamics`. Imported cards and canon notes should feed a provenance-aware source bundle, then WorldForge should synthesize its own structured runtime character from that bundle. Existing compatibility fields should remain as derived projections during migration, but runtime behavior must start reading the richer structure first.

**Primary recommendation:** Plan Phase 48 around one shared richer character model with a canonical/source-bundle extension, then update all generation, hydration, and runtime prompt consumers to treat persona/tags/goals as derived views instead of primary truth.

## Project Constraints (from CLAUDE.md)

- Keep the LLM as narrator/generator only; engine truth remains deterministic.
- Use the existing `ai` SDK path for model calls; do not introduce raw provider clients.
- Keep TypeScript strict and ES modules.
- Use Zod for any new schema, API payload, or AI tool definition.
- Use Drizzle query builder, not raw SQL.
- Shared types and constants belong in `@worldforge/shared`; do not fork backend-only copies of the character contract.
- If any route or API payload changes, follow the backend route conventions: outer try/catch, `parseBody()`, and `getErrorStatus(error)`.
- Do not move gameplay truth into prompt-only logic; prompts should consume structured runtime state, not replace it.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Repo shared character contract (`shared/src/types.ts`, `backend/src/routes/schemas.ts`) | repo HEAD | Authoritative structure for persisted/runtime character data | This is already the shared lane that all generators, adapters, and runtime consumers use. |
| Repo record adapters (`backend/src/character/record-adapters.ts`) | repo HEAD | Hydrate stored NPC/player records into runtime shape | This is the migration seam where richer fields can be introduced without forking the rest of the engine. |
| Repo runtime consumers (`backend/src/engine/prompt-assembler.ts`, `npc-agent.ts`, `reflection-agent.ts`, `npc-offscreen.ts`) | repo HEAD | Convert stored character state into visible narration, planning, and reflection behavior | `CHARF-01` is only satisfied if these readers consume the richer model directly. |
| `ai` | 6.0.106 installed, 6.0.158 current registry (verified 2026-04-11) | Generation/import prompts and runtime agent model calls | Already the repo-standard LLM layer and sufficient for this phase. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 4.3.6 installed/current (published 2026-01-22) | Extend request/storage schemas for richer character records | Use for any route schema or parser contract that touches the new fields. |
| `vitest` | 3.2.4 installed, 4.1.4 current registry (verified 2026-04-09) | Regression coverage for generators, adapters, and runtime consumers | Use for all Phase 48 automation; no framework change is needed. |
| Next.js app + frontend draft adapters | 16.1.6 installed, 16.2.3 current registry (verified 2026-04-08) | Preserve compatibility between richer backend draft shape and current creation/review UI | Use only to keep existing UI flows working; Phase 48 should not expand into a major UI redesign. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| One shared richer model with canonical extension | Separate canonical-only record type | Stronger separation on paper, but creates duplicate runtime paths and contradicts the shared-lane direction from Phases 29 and 30. |
| Source bundle + WorldForge synthesis | Treat imported card fields as direct runtime truth | Faster to ingest, but violates D-13 and bakes community-card bias directly into engine behavior. |
| Rich identity fields read by runtime | Keep current persona/tags/goals shape and just improve prompts | Lower implementation cost, but fails `CHARF-01` because behavior would still be driven by thin summaries. |

**Installation:**
```bash
# No new npm packages recommended for Phase 48.
```

**Version verification:** No new dependency adoption is recommended. The relevant libraries above were verified against the npm registry on 2026-04-12 to confirm the current installed stack is still viable.

## Suggested Plan Decomposition

1. **Model design**
   - Extend the shared character record with explicit `base facts`, `behavioral core`, and `live campaign dynamics`.
   - Define which fields are stable, which are mutable, and which are derived compatibility projections.

2. **Source bundle and synthesis**
   - Add a provenance-aware import/canonical source bundle for key/canonical/imported characters.
   - Synthesize WorldForge-owned runtime identity from canon facts plus secondary voice/feel cues.

3. **Generator/import pipeline alignment**
   - Update player generation, NPC generation, archetype research, and card import prompts to emit the richer structure.
   - Remove prompt drift so player and NPC paths both honor the shared contract.

4. **Persistence and hydration**
   - Update Zod schemas, record adapters, and compatibility shims so stored characters carry the richer identity model end to end.

5. **Runtime consumer migration**
   - Rewire `prompt-assembler`, `npc-agent`, `npc-offscreen`, and `reflection-agent` to read the richer model first.
   - Keep tags/persona/goals as derived fallback output during migration, not primary truth.

6. **UI and migration boundary**
   - Preserve current creation/import UX with adapter shims.
   - Expose only the minimum editable surface needed for this phase; keep deeper canonical synthesis backend-owned unless a specific UI need is proven.

7. **Verification**
   - Add focused tests around contract emission, hydration, runtime prompt assembly, and live-drift boundaries.
   - Prove that imported/canonical identity details survive into runtime consumers, not just creation-time records.

## Architecture Patterns

### Recommended Project Structure
```text
shared/src/
├── types.ts                         # Richer shared character contract

backend/src/character/
├── prompt-contract.ts               # Shared generator/import instructions
├── generator.ts                     # Player/native import path
├── npc-generator.ts                 # NPC/key import path
├── record-adapters.ts               # Hydration + compatibility projection
├── persona-templates.ts             # Template application over richer model
└── canonical-source-bundle.ts       # New: provenance-aware canon/card bundle helpers

backend/src/engine/
├── prompt-assembler.ts              # Scene-facing identity assembly
├── npc-agent.ts                     # Action planning from behavioral core + live state
├── npc-offscreen.ts                 # Offscreen simulation from same identity model
└── reflection-agent.ts              # Mutates live campaign dynamics, not base truth

frontend/lib/
└── character-drafts.ts              # Adapter shims for current UI/edit flows
```

### Pattern 1: Three-Layer Character Truth
**What:** Store one shared record with three explicit layers: stable facts, stable behavioral core, and mutable live campaign dynamics.
**When to use:** For every character type. Canonical/key characters get extra source provenance and stronger continuity rules, not a different runtime ontology.
**Example:**
```ts
// Source: repo constraints + Phase 48 recommendation
type CharacterIdentityModel = {
  baseFacts: {
    biography: string;
    socialRole: string[];
    hardConstraints: string[];
  };
  behavioralCore: {
    motives: string[];
    pressureResponses: string[];
    taboos: string[];
    attachments: string[];
    selfImage: string;
  };
  liveDynamics: {
    activeGoals: string[];
    beliefDrift: string[];
    currentStrains: string[];
    earnedChanges: string[];
  };
};
```

### Pattern 2: Source Bundle -> WorldForge Synthesis -> Compatibility Projection
**What:** Preserve canon-facing facts and card-derived cues in a source bundle, synthesize a WorldForge runtime record from them, then derive legacy `persona`/`tags`/`goals` only as compatibility output.
**When to use:** For imported cards, archetype research, and canonical character creation.
**Example:**
```ts
// Source: repo import seams + SillyTavern/card-spec findings
const synthesizedCharacter = synthesizeCharacterIdentity({
  canonFacts,
  secondaryCardCues,
  worldforgePolicy: "canon-facts-authoritative",
});

const compatibility = deriveLegacyCharacterView(synthesizedCharacter);
```

### Pattern 3: Reflection Mutates Live Dynamics Only
**What:** Reuse the existing reflection system to update beliefs, goals, and relationship drift, but keep it scoped to the live-dynamics layer unless evidence justifies a durable identity shift.
**When to use:** For all live progression and post-turn reflection.
**Example:**
```ts
// Source: repo reflection seam + Phase 48 continuity rules
if (earnedIdentityShift(evidence)) {
  record.identity.liveDynamics.earnedChanges.push(summary);
} else {
  record.identity.liveDynamics.currentStrains.push(summary);
}
```

### Pattern 4: Backend-Owned Deep Identity, Thin Editable UI
**What:** Keep the current UI usable by editing the shallow compatibility surface while deeper canonical synthesis and continuity metadata remain backend-owned in this phase.
**When to use:** If exposing every new field in `character-card.tsx` would turn Phase 48 into a UI redesign.
**Example:**
```ts
// Source: frontend/lib/character-drafts.ts migration strategy
export function characterDraftToScaffoldNpc(draft: CharacterDraft): ScaffoldNpc {
  return {
    name: draft.identity.name,
    persona: derivePersonaSummary(draft),
    tags: deriveRuntimeCharacterTags(draft),
    goals: draft.identity.liveDynamics.activeGoals,
  };
}
```

### Anti-Patterns to Avoid
- **Persona-summary-as-truth:** Do not keep `profile.personaSummary` as the real runtime identity and treat new fields as decorative metadata.
- **Forked ontologies:** Do not create one model for player creation, another for NPC runtime, and a third for canonical imports.
- **Card flattening:** Do not reduce imported cards to `description + tags + goals`; that loses the details the phase is meant to preserve.
- **Reflection overwriting canon:** Do not let one reflection pass rewrite base facts or stable behavioral core from trivial stimuli.
- **UI scope explosion:** Do not make Phase 48 depend on exposing every deep identity field in the editor.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Canonical fidelity | A hardcoded scripted-role system | Structured identity layers plus continuity rules | Canonical characters need preserved logic, not railroaded cosplay. |
| Imported character support | One-off per-source mappers that dump into persona/tags | A source bundle plus one synthesis path into the shared record | Avoids source-specific drift and keeps imported/native characters in the same runtime lane. |
| Live personality change | A brand-new personality-drift engine | The existing reflection/progression seam scoped to `liveDynamics` | The repo already has live change machinery; it just needs richer identity inputs and boundaries. |
| Cross-surface compatibility | Per-consumer ad hoc fallbacks | One derived compatibility projection from the richer shared model | Keeps migration coherent across frontend, runtime prompts, and persistence. |
| Canon truth arbitration | Blind wiki/card copying | WorldForge-owned synthesis with provenance | Prevents one noisy external source from silently becoming authoritative. |

**Key insight:** The hard problem here is not generating more text about a character. It is preserving a durable behavioral source of truth that runtime systems can actually consume without collapsing back into summary blurbs.

## Common Pitfalls

### Pitfall 1: Rich Fields Exist in Storage but Never Affect Runtime
**What goes wrong:** New identity fields are persisted, but `npc-agent`, `prompt-assembler`, and `npc-offscreen` still only read persona/tags/goals.
**Why it happens:** Storage migrations are easier than runtime prompt rewiring.
**How to avoid:** Treat runtime-consumer migration as a core task, not follow-up polish.
**Warning signs:** Tests pass for adapters, but live prompts still print only `Persona`, `Tags`, and `Goals`.

### Pitfall 2: Imported Cards Still Collapse into Thin Summaries
**What goes wrong:** Phase 48 adds a richer shared model, but card import immediately compresses it back into `backgroundSummary`, `personaSummary`, and derived tags.
**Why it happens:** The current import/generator seams already do this, especially in `npc-generator.ts` and `generator.ts`.
**How to avoid:** Change prompt schemas and post-parse mapping together.
**Warning signs:** Imported characters still lose distinctive motives, constraints, and pressure responses after save/load.

### Pitfall 3: Canonical Continuity Becomes Rigidity
**What goes wrong:** Canonical characters stop evolving because "preserve identity" gets implemented as "never change."
**Why it happens:** Teams overcorrect against drift by freezing the model.
**How to avoid:** Separate stable identity from earned live change and record why changes happened.
**Warning signs:** Reflection events fire, but canonical characters never update beliefs, goals, or relationships in meaningful ways.

### Pitfall 4: Reflection Corrupts Base Truth
**What goes wrong:** One bad or noisy reflection pass rewrites stable identity fields.
**Why it happens:** There is no explicit boundary between stable and mutable character layers.
**How to avoid:** Restrict ordinary reflection writes to `liveDynamics`; require explicit promotion logic for deeper change.
**Warning signs:** A single scene instantly changes enduring motives, values, or self-concept.

### Pitfall 5: UI Scope Consumes the Phase
**What goes wrong:** The team spends most of the phase redesigning the character editor instead of fixing runtime identity fidelity.
**Why it happens:** The current UI only exposes shallow fields, so richer modeling tempts a full editor expansion.
**How to avoid:** Keep backend-owned depth acceptable for this phase and defer rich readability/editing concerns to Phase 50 unless directly required.
**Warning signs:** Most work lands in `character-card.tsx` while runtime prompts remain thin.

### Pitfall 6: Prompt-Contract Drift Persists Across Character Paths
**What goes wrong:** Player generation, NPC generation, and imported-card parsing keep emitting different shapes and semantics.
**Why it happens:** `generator.ts` and `npc-generator.ts` are already drifting from the claimed shared contract.
**How to avoid:** Centralize richer identity instructions in one prompt contract and test both paths against it.
**Warning signs:** Tests for one generator path pass while another still asserts old summary-based instructions.

## Code Examples

Verified patterns from repo seams and current external character-model practice:

### Rich Shared Record with Derived Legacy View
```ts
// Source: Phase 48 recommendation, applied to shared/src/types.ts + record-adapters.ts
export type CharacterRecord = {
  identity: CharacterIdentityModel;
  provenance?: CharacterSourceBundle;
  profile: LegacyProfileView;
  motivations: LegacyMotivationView;
};
```

### Runtime Reads the Core, Not Just the Summary
```ts
// Source: backend/src/engine/npc-agent.ts seam, rewritten toward richer identity inputs
const planningContext = {
  motives: npc.identity.behavioralCore.motives,
  pressureResponses: npc.identity.behavioralCore.pressureResponses,
  activeGoals: npc.identity.liveDynamics.activeGoals,
  currentStrains: npc.identity.liveDynamics.currentStrains,
  hardConstraints: npc.identity.baseFacts.hardConstraints,
};
```

### Imported Card Data Treated as Secondary Cues
```ts
// Source: SillyTavern V2/V3 docs + character-card V2 spec findings
const sourceBundle = {
  canonFacts,
  cardCues: {
    description,
    personality,
    scenario,
    firstMessage,
    exampleMessages,
  },
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat persona/traits/tags/goals character sheets | Stable identity model plus separate live memory/reflection state | 2023-2026 agent research | Better long-horizon consistency and less generic behavior. |
| Tags used as prompt identity truth | Tags treated as search/sorting or shorthand metadata | Character card V2 era, current docs still reflect this | Better preservation of nuanced identity details. |
| Imported card copied directly into runtime persona | Imported/card/canon inputs synthesized into a project-owned structured model | 2025-2026 ecosystem practice | Lets the game preserve useful cues without ceding truth to any single source. |

**Deprecated/outdated:**
- Treating `personaSummary` as sufficient runtime truth for believable identity fidelity.
- Using community-card tags as primary behavioral guidance instead of secondary metadata.
- Letting reflection updates implicitly rewrite the same fields that define stable identity.

## Open Questions

1. **Should canonical fidelity live in one optional `provenance/sourceBundle` block or in fully separate dedicated fields?**
   - What we know: the shared-lane approach from Phases 29 and 30 argues for one model with extensions.
   - What's unclear: whether canonical sources need enough metadata to justify a dedicated helper module or type family.
   - Recommendation: plan for one shared model plus a dedicated source-bundle helper shape, not a separate runtime ontology.

2. **How much of the richer identity model should be editable in this phase?**
   - What we know: the current UI only exposes a shallow surface, and Phase 50 already owns broader readability/presentation work.
   - What's unclear: whether key user workflows need direct editing of deeper motives/constraints now, or only preservation/import fidelity.
   - Recommendation: keep deep identity mostly backend-owned unless a concrete blocker appears in planning.

3. **Should player-authored characters also receive synthesized behavioral-core defaults, or only imported/canonical characters?**
   - What we know: D-14 requires raising the floor for all characters, not only canonical ones.
   - What's unclear: how much automatic synthesis is appropriate for player-created originals without overriding user intent.
   - Recommendation: plan for the same shared model for all characters, but allow player-authored entries to keep more direct user ownership over stable fields.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Tests, scripts, backend/frontend tooling | ✓ | v23.11.0 | — |
| npm | Workspace scripts and version verification | ✓ | 11.12.1 | — |
| Vitest CLI | Phase 48 regression tests | ✓ | 3.2.4 | `npx vitest run` from repo root |

**Missing dependencies with no fallback:**
- None verified at research time.

**Missing dependencies with fallback:**
- None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `vitest.config.ts`, `backend/vitest.config.ts`, `frontend/vitest.config.ts` |
| Quick run command | `npx vitest run backend/src/character/__tests__/generator.test.ts backend/src/engine/__tests__/npc-agent.test.ts backend/src/engine/__tests__/reflection-agent.test.ts frontend/lib/__tests__/character-drafts.test.ts frontend/components/character-creation/__tests__/character-card.test.tsx` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHARF-01 | Shared character schema persists richer identity fields and compatibility projection remains stable | unit | `npx vitest run backend/src/character/__tests__/record-adapters.identity.test.ts` | ❌ Wave 0 |
| CHARF-01 | Player/native and NPC/import generation both emit the richer shared identity contract | unit | `npx vitest run backend/src/character/__tests__/generator.test.ts backend/src/character/__tests__/npc-generator.test.ts` | `generator.test.ts` ✅, richer coverage ❌ |
| CHARF-01 | Runtime prompt assembly and NPC planning consume structured identity instead of only persona/tag shorthand | unit | `npx vitest run backend/src/engine/__tests__/npc-agent.test.ts backend/src/engine/__tests__/prompt-assembler.character-identity.test.ts` | `npc-agent.test.ts` ✅, prompt identity test ❌ |
| CHARF-01 | Reflection updates live campaign dynamics without trivially overwriting stable identity | unit | `npx vitest run backend/src/engine/__tests__/reflection-agent.identity-boundaries.test.ts` | ❌ Wave 0 |
| CHARF-01 | Frontend draft adapters preserve richer identity fields or safe shims through save/load flows | unit | `npx vitest run frontend/lib/__tests__/character-drafts.test.ts frontend/components/character-creation/__tests__/character-card.identity.test.tsx` | `character-drafts.test.ts` ✅, richer UI coverage ❌ |

### Sampling Rate
- **Per task commit:** `npx vitest run backend/src/character/__tests__/generator.test.ts backend/src/engine/__tests__/npc-agent.test.ts backend/src/engine/__tests__/reflection-agent.test.ts frontend/lib/__tests__/character-drafts.test.ts frontend/components/character-creation/__tests__/character-card.test.tsx`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Targeted character/runtime tests green, plus at least one end-to-end save/load verification that imported or canonical identity details survive into runtime prompts before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/character/__tests__/record-adapters.identity.test.ts` - verifies richer identity hydration and compatibility projection
- [ ] `backend/src/character/__tests__/npc-generator.test.ts` additions - verifies canonical/card import produces richer structure, not only legacy persona/tags
- [ ] `backend/src/engine/__tests__/prompt-assembler.character-identity.test.ts` - verifies narration context includes richer identity slices
- [ ] `backend/src/engine/__tests__/reflection-agent.identity-boundaries.test.ts` - verifies live updates stay in the mutable layer unless explicitly promoted
- [ ] `frontend/components/character-creation/__tests__/character-card.identity.test.tsx` - verifies UI adapters do not drop new fields silently

**Current baseline:** targeted Vitest passes for `npc-agent`, `reflection-agent`, frontend draft adapters, and `character-card`, but `backend/src/character/__tests__/generator.test.ts` is already failing on prompt-contract drift. Phase planning should treat prompt-contract unification as active prerequisite work, not optional cleanup.

## Sources

### Primary (HIGH confidence)
- Repo character model seams:
  - `shared/src/types.ts`
  - `backend/src/character/record-adapters.ts`
  - `backend/src/character/generator.ts`
  - `backend/src/character/npc-generator.ts`
  - `backend/src/character/persona-templates.ts`
  - `backend/src/character/prompt-contract.ts`
  - `frontend/lib/character-drafts.ts`
  - `frontend/components/character-creation/character-card.tsx`
- Repo runtime consumers:
  - `backend/src/engine/prompt-assembler.ts`
  - `backend/src/engine/npc-agent.ts`
  - `backend/src/engine/npc-offscreen.ts`
  - `backend/src/engine/reflection-agent.ts`
- Repo docs/tests:
  - `docs/mechanics.md`
  - `backend/src/character/__tests__/generator.test.ts`
  - `backend/src/engine/__tests__/npc-agent.test.ts`
  - `backend/src/engine/__tests__/reflection-agent.test.ts`
  - `frontend/lib/__tests__/character-drafts.test.ts`
  - `frontend/components/character-creation/__tests__/character-card.test.tsx`
- SillyTavern character docs:
  - https://docs.sillytavern.app/usage/characters/
  - https://docs.sillytavern.app/for-contributors/writing-extensions/
- Research papers:
  - https://arxiv.org/abs/2304.03442
  - https://arxiv.org/abs/2408.10116
  - https://arxiv.org/abs/2507.16799

### Secondary (MEDIUM confidence)
- Character Card V2 spec:
  - https://github.com/malfoyslastname/character-card-spec-v2

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - the relevant repo seams, installed tooling, and existing test framework are explicit.
- Architecture: HIGH - repo evidence and external sources align on stable identity plus mutable live-state separation.
- Pitfalls: HIGH - the current code already demonstrates the exact flattening and prompt-contract drift this phase must correct.

**Research date:** 2026-04-12
**Valid until:** 2026-05-12

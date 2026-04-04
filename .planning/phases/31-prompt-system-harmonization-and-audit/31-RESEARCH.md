# Phase 31: Prompt System Harmonization & Audit - Research

**Researched:** 2026-04-01
**Domain:** Prompt-contract harmonization across runtime narration, character drafting, worldgen generation, and judge/support prompt families
**Confidence:** HIGH

<user_constraints>
## User Constraints

### Locked Decisions
- Build on the current Phase 29 and Phase 30 worktree seams, not the last fully clean pre-29 commit.
- Audit and refine prompts across worldgen, character, gameplay, and support systems so they behave as one coherent mechanism.
- Prompt families that touch character creation, runtime character context, or start-state logic must consume the new structured `CharacterDraft` / `CharacterRecord` / `startConditions` / canonical loadout / persona-template model correctly.
- Remove stale, contradictory, or duplicated prompt instructions instead of layering more inline prompt text on top of them.
- Preserve the Phase 25 canon/divergence contract for known-IP worldgen flows.
- Preserve the Phase 29 decision that flat tags are derived runtime outputs, not the authoritative character model.
- Preserve the Phase 30 decision that `startConditions`, canonical loadouts, and persona templates flow through the shared draft pipeline rather than alternate player/NPC models.

### Claude's Discretion
- Exact helper-file layout is open as long as shared prompt-contract fragments become authoritative and family boundaries remain clear.
- Exact rewrite order inside the phase is open as long as shared contract anchors land before family-specific rewrites.
- Regression style is open as long as protected seams are enforced with targeted prompt/assertion tests instead of relying on manual spot checks alone.
- The degree of prompt text centralization is open as long as the result avoids both contradictory duplication and an overgrown mega-helper.

### Deferred Ideas (OUT OF SCOPE)
- Do not drift into the Phase 32 desktop-first UI overhaul.
- Do not drift into browser E2E polish or Phase 33 verification work.
- Do not redesign providers, fallback infrastructure, or retrieval architecture unless a prompt contract cannot be expressed without a minimal seam change.
- Do not collapse every prompt family into one universal prompt template; family-specific contracts still matter.
</user_constraints>

<phase_requirements>
## Phase Requirements

Derived from `ROADMAP.md`, the user scope, and the Phase 28 handoff because `REQUIREMENTS.md` does not currently enumerate `P31-01` through `P31-06`.

| ID | Description | Research Support |
|----|-------------|------------------|
| P31-01 | Establish shared prompt-contract anchors for character ontology, `startConditions`, canonical loadout, and persona-template vocabulary. | Shared-helper recommendations, authority-boundary rules, file-group audit order. |
| P31-02 | Rework runtime narration and storyteller tool instructions so one authoritative contract governs behavior without contradictory duplication. | Runtime authority split, anti-patterns, regression seams, test map. |
| P31-03 | Rewrite player/NPC/import/archetype prompt families as role-specific views over one shared draft contract while preserving explicit user facts. | Character-family findings, stale-instruction inventory, canonical-fields-first pattern. |
| P31-04 | Ensure start-condition resolution and character-adjacent worldgen prompts consume the structured Phase 30 model rather than old location-only or split-shape assumptions. | Start-condition findings, worldgen NPC findings, canonical adapter usage, pitfalls. |
| P31-05 | Audit worldgen and judge/support prompts for stale tag-only assumptions and align them to canonical record fields plus existing canon/divergence helpers. | Worldgen helper analysis, judge/support-family findings, preserved seams. |
| P31-06 | Add or extend targeted regressions so prompt harmonization is justified, protected, and does not regress runtime/worldgen behavior. | Validation architecture, Wave 0 gaps, protected seam list, environment notes. |
</phase_requirements>

## Summary

Phase 31 is not a greenfield prompt rewrite. The current worktree already contains the target data model at the seams that matter most: `CharacterDraft` / `CharacterRecord` are canonical in [shared/src/types.ts](R:\Projects\WorldForge\shared\src\types.ts), runtime readers already hydrate canonical records in [backend/src/engine/prompt-assembler.ts](R:\Projects\WorldForge\backend\src\engine\prompt-assembler.ts), and Phase 30 introduced persisted `startConditions`, canonical loadout derivation, and shared persona-template patches. The research problem is that prompt families have not all caught up to that model. Runtime and some support flows now read canonical fields first, while several generation families still speak in older tag-centric or split player/NPC schema language.

The highest-risk drift is authority duplication. Storyteller behavior is currently spread across one large `SYSTEM_RULES` block in [backend/src/engine/prompt-assembler.ts](R:\Projects\WorldForge\backend\src\engine\prompt-assembler.ts), duplicated tool obligations in [backend/src/engine/tool-schemas.ts](R:\Projects\WorldForge\backend\src\engine\tool-schemas.ts), and outcome-specific layering in [backend/src/engine/turn-processor.ts](R:\Projects\WorldForge\backend\src\engine\turn-processor.ts). Character-family prompts are inconsistent in the opposite direction: player generation still says "Use the tag-only system" in [backend/src/character/generator.ts](R:\Projects\WorldForge\backend\src\character\generator.ts), while NPC generation still asks for a narrower `persona/tags/goals/location/faction` shape in [backend/src/character/npc-generator.ts](R:\Projects\WorldForge\backend\src\character\npc-generator.ts). Worldgen is the cleanest area because [backend/src/worldgen/scaffold-steps/prompt-utils.ts](R:\Projects\WorldForge\backend\src\worldgen\scaffold-steps\prompt-utils.ts) already centralizes canon/delta and anti-slop rules, but worldgen NPC/detail prompts still emit legacy-style NPC cards and only adapt to canonical drafts after generation.

The planning consequence is clear: Phase 31 should be structured as contract harmonization, not prompt polishing. Establish one shared vocabulary for canonical character/start-state fields, split runtime authority so one copy of each rule is authoritative, then rewrite families in the handoff order with targeted regressions guarding the old high-value seams.

**Primary recommendation:** Plan Phase 31 as four coordinated tracks: shared prompt-contract anchors, runtime storyteller authority cleanup, character/start/worldgen family rewrites onto the canonical draft model, and targeted regression tests for contradictory or stale instructions.

## Project Constraints (from CLAUDE.md)

- Use the existing stack: Hono backend, Next.js frontend, TypeScript strict mode, Drizzle ORM, better-sqlite3, Zod, and the Vercel AI SDK.
- The LLM remains narrator/generator only; engine state changes stay deterministic and validated in backend code.
- Use Drizzle query builder, not raw SQL.
- Use Zod schemas for all API payloads and AI tool definitions.
- Prefer `ai` SDK helpers such as `generateObject`, `generateText`, and `streamText` over ad hoc provider fetch logic.
- Route handlers should keep the repo pattern: outer `try/catch`, `parseBody()` validation, `getErrorStatus(error)` for HTTP status.
- Shared contracts must live in `@worldforge/shared`, not duplicated backend/frontend types.
- SQLite remains the source of truth; LanceDB is additive and not the place to solve prompt-contract drift.
- User-facing responses should be in Russian, but prompt contracts may remain English where the codebase already uses English prompt text.

## Standard Stack

These are project-pinned versions present in the workspace on 2026-04-01. Phase 31 does not require new dependency selection.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@worldforge/shared` | workspace | Canonical model for `CharacterDraft`, `CharacterRecord`, `startConditions`, persona-template patches | Phase 31 should harmonize prompts around this shared contract, not invent new DTOs. |
| `ai` | `6.0.106` | Structured generation, tool calling, and streaming | All prompt families already route through `generateObject`, `generateText`, or `streamText`. |
| `zod` | `4.3.6` | Structured output schemas | Phase 31 must keep prompt instructions and output schemas aligned. |
| `hono` | `4.12.3` | Route shell layer | Existing character/start-condition endpoints already expose the prompt-adjacent seams. |
| `vitest` | `3.2.4` | Prompt/regression assertions | Current backend/frontend test infrastructure already covers most touched families. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `better-sqlite3` | `12.6.2` | Prompt readers fetch canonical campaign state from SQLite | Needed when prompt assembly or judge/support families read live records. |
| `drizzle-orm` | `0.45.1` | Canonical persistence/query layer | Use for any prompt-adjacent reader changes in routes or runtime state loaders. |
| `next` | `16.1.6` | Current draft editor shells | Relevant only where Phase 31 needs to respect existing Phase 30 start/template seams. |
| `@ai-sdk/openai` / `@ai-sdk/anthropic` / `@ai-sdk/mcp` | project-pinned via `backend/package.json` | Provider adapters | Relevant only insofar as prompt contracts must remain provider-agnostic and structured-output-safe. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Small shared contract helpers plus family-local prompts | One global prompt mega-helper | Reduces duplication at first, but erases task boundaries and makes every family harder to reason about. |
| Canonical-fields-first prompt wording with derived-tag compatibility views | Keep legacy tag-first wording and patch it piecemeal | Faster to type, but preserves the exact drift Phase 31 exists to remove. |
| Direct assertions on authoritative prompt fragments | Full prompt snapshots | Snapshots become noisy and brittle when unrelated ordering changes; fragment assertions better protect contracts. |

**Installation:**
```bash
# No new packages recommended for Phase 31.
npm install
```

**Version verification:** Versions above were verified from local `package.json` files and local CLI output. Public npm-registry currency was not required for this phase.

## Architecture Patterns

### Recommended Project Structure
```text
backend/src/
├── character/
│   ├── prompt-contract.ts      # new shared ontology/start/template wording helpers
│   ├── generator.ts            # player parse/generate/import/archetype prompts
│   └── npc-generator.ts        # NPC role-specific view over same draft contract
├── engine/
│   ├── storyteller-contract.ts # new runtime authority split for narrator/tool rules
│   ├── prompt-assembler.ts     # consumes canonical state and injects sections
│   ├── tool-schemas.ts         # tool semantics only, not a second narrator rulebook
│   └── turn-processor.ts       # outcome framing only
└── worldgen/
    ├── starting-location.ts    # structured startConditions contract
    └── scaffold-steps/
        ├── prompt-utils.ts     # canon/divergence + anti-slop authority
        └── npcs-step.ts        # emit canonical draft-compatible NPC data
```

### Prompt Family Ownership
| Family | Authoritative files now | Phase 31 directive |
|--------|--------------------------|--------------------|
| Runtime narration | `backend/src/engine/prompt-assembler.ts`, `backend/src/engine/tool-schemas.ts`, `backend/src/engine/turn-processor.ts` | Split narrator rules, tool obligations, and outcome framing into one authoritative layer each. |
| Character drafting | `backend/src/character/generator.ts`, `backend/src/character/npc-generator.ts`, `backend/src/character/archetype-researcher.ts` | Rewrite as role-specific views over one shared draft contract. |
| Start-state resolution | `backend/src/worldgen/starting-location.ts`, `backend/src/routes/character.ts` | Preserve structured `startConditions` as source of truth; remove location-only thinking from prompts. |
| Worldgen planning/detail | `backend/src/worldgen/seed-suggester.ts`, scaffold steps, `backend/src/worldgen/lore-extractor.ts` | Keep canon/delta helper reuse; align character-adjacent outputs to canonical ontology vocabulary. |
| Judge/support families | `backend/src/engine/oracle.ts`, `backend/src/engine/npc-agent.ts`, `backend/src/engine/reflection-agent.ts`, `backend/src/engine/world-engine.ts` | Keep task boundaries separate; audit stale assumptions per family, not as one “judge prompt”. |

### Pattern 1: Canonical Fields First, Derived Tags Second
**What:** Prompt families should read grouped canonical fields before mentioning tags.
**When to use:** Any family that consumes character or NPC context.
**Recommendation:** Build helper formatters that name `profile`, `motivations`, `capabilities`, `state`, `loadout`, and `startConditions` first, then append derived tags only as a compact compatibility view.

**Example:**
```typescript
const playerRecord = hydrateStoredPlayerRecord(player);
const tags = deriveRuntimeCharacterTags(playerRecord);
const startConditions = playerRecord.startConditions;
```
Source: [backend/src/engine/prompt-assembler.ts](R:\Projects\WorldForge\backend\src\engine\prompt-assembler.ts)

### Pattern 2: One Rule, One Authority
**What:** Each mandatory behavior rule should live in one authoritative prompt fragment.
**When to use:** Runtime storyteller behavior, especially movement, HP handling, and quick actions.
**Recommendation:** `prompt-assembler.ts` or a runtime contract helper it imports should own storyteller behavior rules. `tool-schemas.ts` should describe tool semantics and required inputs, not quietly redefine narration policy.

### Pattern 3: Role-Specific Views Over One Draft Contract
**What:** Player and NPC prompts can ask for different emphasis, but not different underlying ontology.
**When to use:** Parse/import/generate/archetype prompt families.
**Recommendation:** Keep one shared helper block for ontology vocabulary and user-fact preservation; layer only role-specific field emphasis on top.

### Pattern 4: Shared Helpers By Family, Not One Mega-Helper
**What:** Reuse should happen within stable domains.
**When to use:** Worldgen canon/delta blocks, character draft wording, runtime storyteller rules.
**Recommendation:** Preserve `prompt-utils.ts` as the worldgen helper authority. Add a character prompt-contract helper and a runtime storyteller contract helper, but do not merge worldgen, runtime, and character families into one module.

### Pattern 5: Prompt Regressions Assert Contract Fragments
**What:** Tests should check for authoritative fragments and the absence of stale ones.
**When to use:** After centralizing helper text or removing duplicated instructions.
**Recommendation:** Assert for canonical-field wording, required fragment presence, and stale string removal rather than snapshotting full prompts.

### Anti-Patterns to Avoid
- **Prompt mega-helper:** centralizing every prompt family into one file will blur task boundaries and make future drift harder to isolate.
- **Tag-first worldview after Phase 29/30:** prompts should not keep saying the game is primarily tag-only when canonical fields now exist.
- **Authority duplication between `SYSTEM_RULES` and tool descriptions:** this is the main runtime drift source today.
- **Player/NPC contract fork:** leaving `generator.ts` and `npc-generator.ts` on different conceptual models defeats the Phase 29 ontology work.
- **Worldgen post-adapter mismatch:** generating legacy NPC shapes and only later adapting them risks continued contract drift.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Canon/delta layering in worldgen prompts | New inline franchise/divergence prose per file | `buildIpContextBlock()`, `buildPremiseDivergenceBlock()`, `buildKnownIpGenerationContract()` | These helpers already protect the highest-value known-IP contract. |
| Character compatibility tags | Ad hoc tag lists embedded in prompt strings | `deriveRuntimeCharacterTags()` | Prevents prompt drift from canonical records and preserves Phase 29’s derived-tag rule. |
| Canonical record hydration | Separate prompt-only projection code | `hydrateStoredPlayerRecord()` / `hydrateStoredNpcRecord()` | Runtime and support prompts already rely on these adapters for source-of-truth reads. |
| Start/loadout/template compatibility seams | New alternate DTOs for prompts | Existing `CharacterDraft`, `CharacterRecord`, `startConditions`, and template patch types | Phase 30 already established the model; duplicating it will reintroduce drift. |
| Tool behavior duplication | Repeating full narrator rules in tool descriptions | One authoritative storyteller contract + minimal tool semantics | Duplicated MUST rules are already contradictory risk, not safety. |

**Key insight:** Phase 31 should harmonize around existing canonical seams, not build a parallel “prompt model”.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Prompt text itself is not persisted as mutable runtime state. Campaign DBs store canonical `characterRecord`, `startConditions`, loadout, and relationship data that prompts read, but Phase 31 changes readers/contracts rather than the persisted schema. | **Code edit only.** No data migration is required if Phase 31 stays within prompt/helper/test scope. |
| Live service config | None found. Prompt contracts live in repo files, not in a remote prompt registry or external service UI. | None. |
| OS-registered state | None found. No OS registration embeds prompt-family text or naming relevant to this phase. | None. |
| Secrets/env vars | None found. Provider credentials choose models, but no secret or env-var names encode Phase 31 prompt contract choices. | None. |
| Build artifacts | The worktree currently contains many untracked `.js` sidecar files under `backend/src/**` plus other generated artifacts visible in `git status`. They are not authoritative prompt sources, but they can confuse diffs and test targeting. | **Code edit discipline.** Treat `.ts` sources as authoritative; only regenerate artifacts intentionally. Avoid planning work against untracked sidecars. |

## Common Pitfalls

### Pitfall 1: Centralizing Helpers But Leaving Old Inline Copies Alive
**What goes wrong:** The repo gains a new “authoritative” helper, but the old inline wording in runtime or character files still contradicts it.
**Why it happens:** Phase 31 is likely to add helper blocks before every family is rewritten.
**How to avoid:** Every task that introduces a helper must also remove or downgrade conflicting inline copies in the touched family.
**Warning signs:** The same MUST rule appears in both `prompt-assembler.ts` and `tool-schemas.ts`, or both `generator.ts` and `npc-generator.ts` still describe the ontology differently.

### Pitfall 2: Rewriting Player Prompts Without Rewriting NPC Prompts
**What goes wrong:** The ontology becomes cleaner for players but worldgen/NPC/runtime behavior still depends on older legacy assumptions.
**Why it happens:** Player prompts are easier to see and test than NPC/worldgen families.
**How to avoid:** Treat player and NPC drafting as one contract migration, with role-specific views only after shared vocabulary is established.
**Warning signs:** `generator.ts` speaks in canonical field groups while `npc-generator.ts` still only asks for `persona/tags/goals/location/faction`.

### Pitfall 3: Treating Derived Tags As Canonical Again
**What goes wrong:** Prompt text keeps talking as if the tag list is the character model, making Phase 29/30 seams cosmetic.
**Why it happens:** Legacy prompt wording survived the data-model migration.
**How to avoid:** Prompt helpers should explicitly frame tags as a derived runtime view and place canonical grouped fields first.
**Warning signs:** Strings like "Use the tag-only system" or "All characters use a tag-based system" remain in authoritative character/runtime prompts without qualification.

### Pitfall 4: Breaking Known-IP Worldgen While Cleaning Up Character Semantics
**What goes wrong:** Character harmonization accidentally weakens the canon/divergence guarantees that worldgen already enforces well.
**Why it happens:** Worldgen prompts already have good helper reuse, so broad refactors can regress them if they are treated as generic prompt cleanup.
**How to avoid:** Preserve `prompt-utils.ts` as the canon/delta authority and only change character-adjacent output vocabulary where necessary.
**Warning signs:** Known-IP tests stop asserting `PRESERVED CANON FACTS`, `CHANGED CANON FACTS`, or `CURRENT WORLD-STATE DIRECTIVES`.

### Pitfall 5: Testing Only Happy-Path Strings
**What goes wrong:** Prompt contracts look updated, but contradictory stale wording still exists in untouched families.
**Why it happens:** Existing tests focus on presence of useful strings more often than absence of stale ones.
**How to avoid:** Add negative assertions for removed phrases and duplicated authority rules.
**Warning signs:** Tests prove a new helper string appears, but none fail if old tag-only wording remains.

## Code Examples

Verified patterns from the current repo:

### Structured Start Conditions With Compatibility Alias
```typescript
const startConditions: CharacterStartConditions = {
  startLocationId: matched.id,
  arrivalMode: object.arrivalMode,
  immediateSituation: object.immediateSituation,
  entryPressure: object.entryPressure,
  companions: object.companions,
  startingVisibility: object.startingVisibility,
  resolvedNarrative: object.resolvedNarrative,
  sourcePrompt: opts.userPrompt,
};
```
Source: [backend/src/worldgen/starting-location.ts](R:\Projects\WorldForge\backend\src\worldgen\starting-location.ts)

### Worldgen Canon/Divergence Helper Reuse
```typescript
const ipBlock = buildIpContextBlock(ipContext);
const divergenceBlock = buildPremiseDivergenceBlock(premiseDivergence);
const knownIpContract = buildKnownIpGenerationContract(
  ipContext,
  premiseDivergence,
  "npc details",
);
```
Source: [backend/src/worldgen/scaffold-steps/npcs-step.ts](R:\Projects\WorldForge\backend\src\worldgen\scaffold-steps\npcs-step.ts)

### Runtime Readers Already Prefer Canonical Record Fields
```typescript
const playerRecord = hydrateStoredPlayerRecord(player);
const tags = deriveRuntimeCharacterTags(playerRecord);
const equipped = playerRecord.loadout.equippedItemRefs;
const startConditions = playerRecord.startConditions;
```
Source: [backend/src/engine/prompt-assembler.ts](R:\Projects\WorldForge\backend\src\engine\prompt-assembler.ts)

### Shared Persona Template Patch Shape
```typescript
export function applyPersonaTemplatePatch(
  draft: CharacterDraft,
  patch: CharacterDraftPatch,
  templateId: string | null = null,
): CharacterDraft
```
Source: [backend/src/character/persona-templates.ts](R:\Projects\WorldForge\backend\src\character\persona-templates.ts)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Player and NPC prompts worked off different mental models | Phase 29/30 now expose a shared canonical `CharacterDraft`/`CharacterRecord` model | 2026-04-01 current worktree | Prompt families can now converge on one ontology instead of duplicating player/NPC schemas. |
| Start state was basically location-plus-flavor text | Phase 30 introduced structured `startConditions` plus a compatibility `narrative` alias | 2026-04-01 current worktree | Prompt families should reason about arrival mode, pressure, companions, and visibility, not just location. |
| Canon/delta rules were repeated inline | Worldgen now centralizes them in `prompt-utils.ts` | Phase 25-28 | This is the best existing reuse pattern and should be preserved. |
| Runtime only consumed legacy blobs | Runtime/support readers now hydrate canonical records before falling back | Phase 29-30 worktree | Phase 31 should finish prompt harmonization on top of these readers instead of rebuilding them. |

**Deprecated/outdated:**
- `generator.ts` still instructs the model to "Use the tag-only system" even though canonical grouped fields now exist.
- `npc-generator.ts` still asks for a narrow legacy NPC shape rather than one shared role-specific draft vocabulary.
- `prompt-assembler.ts` still states that all characters/items/locations/factions use a tag-based system without qualifying tags as a derived runtime view.
- `tool-schemas.ts` repeats mandatory quick-action and HP behavior that should be governed by one authoritative runtime contract.

## Open Questions

1. **Where should the new shared character prompt-contract helper live?**
   - What we know: worldgen already has a good helper home in `scaffold-steps/prompt-utils.ts`, but character prompting does not.
   - What's unclear: whether the least-surprising location is `backend/src/character/prompt-contract.ts`, `backend/src/engine/storyteller-contract.ts`, or both.
   - Recommendation: use one helper under `backend/src/character/` for ontology/start/template wording and one small runtime helper under `backend/src/engine/` for storyteller authority boundaries.

2. **How much canonical field detail should worldgen NPC prompts emit directly?**
   - What we know: `npcs-step.ts` still generates legacy-style NPC detail and only later adapts it via `fromLegacyScaffoldNpc()`.
   - What's unclear: whether Phase 31 should rewrite worldgen NPC generation all the way to full draft-group vocabulary or only enough to eliminate stale split-schema assumptions.
   - Recommendation: move `npcs-step.ts` onto canonical field-group language where it affects downstream prompt/runtime consumers, but keep scaffold output ergonomics intact.

3. **Should contradictory runtime rules be removed from tool descriptions or downgraded to supportive reminders?**
   - What we know: some tool descriptions currently restate MUST rules from storyteller system rules.
   - What's unclear: whether the team wants zero duplication or limited supportive duplication.
   - Recommendation: keep only semantic tool guidance in `tool-schemas.ts`; if any reminder remains, it must explicitly support the runtime authority rather than redefine it.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node` | local scripts, prompt regressions, route/runtime tests | ✓ | `v23.11.0` | — |
| `npm` | workspace scripts and Vitest execution | ✓ | `11.12.1` | — |
| `vitest` | targeted prompt/regression validation | ✓ | `3.2.4` via `npx vitest --version` | — |
| `git` | diff review and commit isolation | ✓ | repo present | — |
| `gitnexus` via `npx` | optional codebase graph assistance | ⚠️ partial | `status` works; local index is stale | Fall back to direct source inspection and `rg`. |

**Missing dependencies with no fallback:**
- None.

**Missing dependencies with fallback:**
- `npx gitnexus analyze` currently returns `Not inside a git repository` even though `git rev-parse --show-toplevel` succeeds in this workspace. Use direct repo inspection and the existing stale index only as secondary context.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `3.2.4` |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run backend/src/character/__tests__/generator.test.ts backend/src/character/__tests__/npc-generator.test.ts backend/src/engine/__tests__/prompt-assembler.test.ts backend/src/engine/__tests__/turn-processor.test.ts backend/src/engine/__tests__/npc-agent.test.ts backend/src/worldgen/__tests__/starting-location.test.ts backend/src/worldgen/__tests__/npcs-step.test.ts backend/src/worldgen/__tests__/seed-suggester.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P31-01 | Shared ontology/start-condition contract fragments become authoritative across character/start families | unit | `npx vitest run backend/src/character/__tests__/generator.test.ts backend/src/character/__tests__/npc-generator.test.ts backend/src/worldgen/__tests__/starting-location.test.ts` | ⚠️ partial |
| P31-02 | Runtime storyteller rules and tool descriptions stop contradicting each other | unit/integration | `npx vitest run backend/src/engine/__tests__/prompt-assembler.test.ts backend/src/engine/__tests__/turn-processor.test.ts backend/src/engine/__tests__/bug-fixes-verification.test.ts` | ⚠️ partial |
| P31-03 | Player/NPC/import/archetype prompts preserve explicit user facts and use one draft vocabulary | unit | `npx vitest run backend/src/character/__tests__/generator.test.ts backend/src/character/__tests__/npc-generator.test.ts` | ⚠️ partial |
| P31-04 | Start-condition and character-adjacent worldgen prompts consume the structured Phase 30 model | unit/integration | `npx vitest run backend/src/worldgen/__tests__/starting-location.test.ts backend/src/worldgen/__tests__/npcs-step.test.ts backend/src/routes/__tests__/character.test.ts` | ✅ |
| P31-05 | Judge/support prompts consume canonical record fields while preserving canon/delta worldgen seams | unit | `npx vitest run backend/src/engine/__tests__/npc-agent.test.ts backend/src/engine/__tests__/reflection-agent.test.ts backend/src/engine/__tests__/world-engine.test.ts backend/src/engine/__tests__/oracle.test.ts backend/src/worldgen/__tests__/seed-suggester.test.ts backend/src/worldgen/__tests__/scaffold-resilience.test.ts backend/src/worldgen/__tests__/lore-extractor.test.ts` | ⚠️ partial |
| P31-06 | Stale and contradictory prompt instructions are removed and protected by regressions or audit assertions | unit/manual | `npx vitest run backend/src/character/__tests__/generator.test.ts backend/src/character/__tests__/npc-generator.test.ts backend/src/engine/__tests__/prompt-assembler.test.ts backend/src/engine/__tests__/bug-fixes-verification.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted Vitest for the touched family plus any affected runtime/worldgen seam
- **Per wave merge:** the Phase 31 quick-run set above
- **Phase gate:** `npx vitest run` green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Add a dedicated prompt-contract helper test file for the new shared character/runtime fragments if helpers are introduced.
- [ ] Extend [backend/src/engine/__tests__/prompt-assembler.test.ts](R:\Projects\WorldForge\backend\src\engine\__tests__\prompt-assembler.test.ts) to assert removal of stale tag-only/runtime-authority phrasing, not just presence of canonical fields.
- [ ] Extend [backend/src/engine/__tests__/bug-fixes-verification.test.ts](R:\Projects\WorldForge\backend\src\engine\__tests__\bug-fixes-verification.test.ts) or add a new `tool-schemas` test to assert that tool descriptions do not redefine storyteller policy.
- [ ] Extend [backend/src/character/__tests__/npc-generator.test.ts](R:\Projects\WorldForge\backend\src\character\__tests__\npc-generator.test.ts) with negative assertions for legacy split-schema wording.
- [ ] Extend [backend/src/worldgen/__tests__/npcs-step.test.ts](R:\Projects\WorldForge\backend\src\worldgen\__tests__\npcs-step.test.ts) to assert canonical-field-group wording if that family is rewritten in Phase 31.
- [ ] Add prompt-fragment assertions for [backend/src/engine/__tests__/reflection-agent.test.ts](R:\Projects\WorldForge\backend\src\engine\__tests__\reflection-agent.test.ts) and [backend/src/engine/__tests__/world-engine.test.ts](R:\Projects\WorldForge\backend\src\engine\__tests__\world-engine.test.ts) if their contracts change.
- [ ] Validation note: `.planning/STATE.md` still reports sandboxed Vitest `spawn EPERM` incidents; unrestricted verification may still be required for final closeout.

## Sources

### Primary (HIGH confidence)
- Local repo constraints: `CLAUDE.md`
- Phase scope and requirements: `.planning/ROADMAP.md`
- Phase 28 handoff docs:
  - `.planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-prompt-family-inventory.md`
  - `.planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-prompt-contract-rules.md`
  - `.planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-phase-31-handoff.md`
- Prior locked decisions:
  - `.planning/phases/29-unified-character-ontology-and-tag-system/29-CONTEXT.md`
  - `.planning/phases/30-start-conditions-canonical-loadouts-and-persona-templates/30-CONTEXT.md`
  - `.planning/phases/30-start-conditions-canonical-loadouts-and-persona-templates/30-RESEARCH.md`
- Canonical model and adapters:
  - `shared/src/types.ts`
  - `backend/src/character/record-adapters.ts`
  - `backend/src/character/persona-templates.ts`
  - `backend/src/character/loadout-deriver.ts`
- Runtime/storyteller sources:
  - `backend/src/engine/prompt-assembler.ts`
  - `backend/src/engine/tool-schemas.ts`
  - `backend/src/engine/turn-processor.ts`
  - `backend/src/engine/oracle.ts`
  - `backend/src/engine/npc-agent.ts`
  - `backend/src/engine/reflection-agent.ts`
  - `backend/src/engine/world-engine.ts`
- Character/worldgen sources:
  - `backend/src/character/generator.ts`
  - `backend/src/character/npc-generator.ts`
  - `backend/src/character/archetype-researcher.ts`
  - `backend/src/worldgen/starting-location.ts`
  - `backend/src/worldgen/seed-suggester.ts`
  - `backend/src/worldgen/scaffold-steps/prompt-utils.ts`
  - `backend/src/worldgen/scaffold-steps/premise-step.ts`
  - `backend/src/worldgen/scaffold-steps/locations-step.ts`
  - `backend/src/worldgen/scaffold-steps/factions-step.ts`
  - `backend/src/worldgen/scaffold-steps/npcs-step.ts`
  - `backend/src/worldgen/lore-extractor.ts`
- Phase-adjacent routes/frontend seams:
  - `backend/src/routes/character.ts`
  - `frontend/lib/character-drafts.ts`
  - `frontend/components/character-creation/character-card.tsx`
  - `frontend/components/world-review/npcs-section.tsx`
- Existing regressions:
  - `backend/src/character/__tests__/generator.test.ts`
  - `backend/src/character/__tests__/npc-generator.test.ts`
  - `backend/src/character/__tests__/persona-templates.test.ts`
  - `backend/src/engine/__tests__/prompt-assembler.test.ts`
  - `backend/src/engine/__tests__/turn-processor.test.ts`
  - `backend/src/engine/__tests__/npc-agent.test.ts`
  - `backend/src/engine/__tests__/bug-fixes-verification.test.ts`
  - `backend/src/worldgen/__tests__/starting-location.test.ts`
  - `backend/src/worldgen/__tests__/npcs-step.test.ts`
  - `backend/src/worldgen/__tests__/seed-suggester.test.ts`
  - `backend/src/worldgen/__tests__/scaffold-resilience.test.ts`
  - `backend/src/worldgen/__tests__/lore-extractor.test.ts`

### Secondary (MEDIUM confidence)
- `backend/package.json`, `frontend/package.json`, `package.json`, `vitest.config.ts`, local CLI version output
- `.planning/STATE.md` for current Vitest sandbox caveat
- `npx gitnexus status` for stale-index metadata only

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - confirmed from local package manifests and CLI output
- Architecture: HIGH - derived from direct source inspection of live Phase 29/30 seams and prompt-owner files
- Pitfalls: HIGH - confirmed by explicit stale wording, duplicated authority, and current regression coverage gaps in the repo

**Research date:** 2026-04-01
**Valid until:** 2026-04-08

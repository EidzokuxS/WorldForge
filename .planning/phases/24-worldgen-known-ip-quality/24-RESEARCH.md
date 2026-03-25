# Phase 24: Worldgen Known IP Quality - Research

**Researched:** 2026-03-25
**Domain:** Prompt engineering, incremental world generation pipeline, canonical IP fidelity
**Confidence:** HIGH

## Summary

This phase is a complete overhaul of the worldgen prompt pipeline across three files: `scaffold-generator.ts`, `seed-suggester.ts`, and `ip-researcher.ts`. The current implementation has nine critical problems identified by direct user testing: (1) monolithic single-call-per-step generation, (2) DNA categories that describe differences rather than world state, (3) premises that swap/mangle user input, (4) invented locations/factions/NPCs instead of canonical ones for known IPs, (5) hallucinated lore, (6) only 3-6 NPCs generated, (7) no inter-category DNA dependencies, (8) the `buildIpContextBlock` explicitly tells the LLM to NOT use canonical names ("create analogous original equivalents"), and (9) generic, slop-filled prompt language.

The core architectural change is decomposing each scaffold step from one `generateObject` call into multiple mini-calls: a planning call (produce a list) followed by detail calls (enrich each item with full context of previously generated items). The IP context block must be inverted from "avoid real names" to "USE canonical names as source of truth." DNA generation must become sequential with each category seeing previous categories. NPC generation must split into key (canonical) and supporting (original) tiers, targeting 10-15 total.

**Primary recommendation:** Rewrite all prompts in scaffold-generator, seed-suggester, and lore-extractor. Restructure each scaffold step into plan+detail mini-calls. Invert the IP context instruction from "avoid canonical names" to "use canonical names as source of truth." Add NPC tier field to ScaffoldNpc type.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
1. DNA is about the WORLD, not about specific plot points or characters from the user's premise
2. Never invent titles, swap teacher-student pairs, or alter character personalities from canon
3. Known IP locations must use canonical names and descriptions, modified only by logical consequences of premise changes
4. 0% invented factions when canonical ones exist. Modifications to canonical factions based on premise changes are expected
5. Key characters for known IPs must be canonical. Supporting characters can be original but must fit the world
6. Lore must reference actual franchise elements when available in research data
7. No single monolithic generateObject call per scaffold step. Break into sub-calls
8. DNA generation must be sequential with each category seeing previous ones
9. All prompts must be reviewed against stop-slop checklist before finalizing

### Claude's Discretion
- Exact mini-call breakdown within each scaffold step (how many sub-calls, what granularity)
- Prompt templating approach (string interpolation vs structured system/user messages)
- Whether DNA generation needs separate LLM calls per category or can batch with sequential context
- How to handle the transition between "known IP" and "original world" modes in prompts
- Test scenario selection for E2E validation

### Deferred Ideas (OUT OF SCOPE)
- Image generation for locations/NPCs (Phase 10 handles this separately)
- Player character generation quality (separate concern from world generation)
- Lore card embedding quality (vector/embedder concern, not prompt concern)
</user_constraints>

## Project Constraints (from CLAUDE.md)

- TypeScript strict mode, ES modules
- Zod schemas for all AI tool definitions and API payloads
- Use `ai` SDK functions (generateText, generateObject) via `safeGenerateObject` wrapper
- Route handlers: outer try/catch, `parseBody()` for validation, `getErrorStatus(error)` for status codes
- Shared types live in `@worldforge/shared`
- Immutable patterns: never mutate objects, create new ones
- Files 200-800 lines max; extract utilities from large files
- User language: Russian

## Current Codebase Diagnosis

### Problem 1: `buildIpContextBlock` Explicitly Forbids Canonical Names (CRITICAL)

**File:** `scaffold-generator.ts`, line 141
```typescript
return `\nKNOWN IP CONTEXT (${ipContext.franchise}, source: ${ipContext.source}):\n...
IMPORTANT: Honour the spirit and tone of this franchise but do NOT use its trademarked names, places, or characters verbatim — create analogous original equivalents.\n`;
```

This is the ROOT CAUSE of "Leaf-Shade Village" instead of "Konohagakure", "Baroness Anya Volkov" instead of "Kakashi", and "Serpent's Coil Ascetics" instead of "Akatsuki." The prompt explicitly tells the LLM to invent fake names.

**Fix:** Invert instruction: "You MUST use canonical names, locations, factions, and characters from this franchise. Do NOT invent fictional replacements. Modify canonical elements only through logical butterfly-effect consequences of the premise changes."

### Problem 2: Monolithic Single-Call Generation

**File:** `scaffold-generator.ts`, lines 175-280

Each step (locations, factions, NPCs) is one `generateObject` call that must produce the entire array in a single shot. This means:
- No inter-element references (location A can't reference location B because they're all generated simultaneously)
- Context is limited to just the premise + location/faction names list
- The LLM must track too many constraints at once (schema + names + IP + DNA)
- 4-8 locations or 3-10 NPCs in a single structured call often fails with complex IPs

### Problem 3: DNA Has No Inter-Category Dependencies

**File:** `seed-suggester.ts`, lines 93-103

The entire DNA is generated in ONE call with no sequential reasoning. The prompt says "suggest creative and fitting World DNA constraints" but each category is generated independently -- there's no mechanism for geography to influence political structure.

### Problem 4: Premise Can Mangle User Input

**File:** `scaffold-generator.ts`, lines 152-163

The premise step says "Write only refinedPremise as 2-3 dense, evocative sentences" but has no guardrail against swapping teacher-student pairs, inventing titles, or rewriting the user's stated scenario. No explicit "preserve user's stated character relationships exactly" instruction.

### Problem 5: NPC Schema Has No Tier Concept

**File:** `scaffold-generator.ts`, lines 48-70 and line 89

The `npcSchema` has no `tier` field (key vs supporting). `npcsStepSchema` allows min 3, max 10 NPCs. The database schema (`db/schema.ts`, line 70) already has `tier: text("tier", { enum: ["temporary", "persistent", "key"] })` but the scaffold generator doesn't use it. The scaffold saver (`scaffold-saver.ts`) sets all generated NPCs to "key" tier.

### Problem 6: Lore Extractor Has No IP Grounding

**File:** `lore-extractor.ts`, lines 68-82

The lore extraction prompt receives the scaffold context (which for known IPs should now be canonical) but has no access to `ipContext.keyFacts`. It must hallucinate lore concepts because it has no reference material. This leads to "Chakra Storms" instead of "Chakra Nature Types."

### Problem 7: Seed-Suggester IP Block Is Weak

**File:** `seed-suggester.ts`, lines 89-91

The IP section says "Suggestions MUST be consistent with this franchise's lore" but doesn't instruct the LLM to describe the ACTUAL canonical world state. For Naruto, geography should be "Five Great Shinobi Nations on a continent" not a creative interpretation.

### Problem 8: NPC Count Too Low

The schema constrains to `min(3).max(10)`. User wants 10-15 NPCs with key/supporting split.

### Problem 9: No Stop-Slop Prompt Discipline

All prompts use vague language: "vivid", "evocative", "creative", "fitting". These are AI-slop trigger words. Prompts should be concrete: "Write 2 sentences describing the physical geography and political significance of this location."

## Architecture Patterns

### Mini-Call Pipeline Architecture

Each scaffold step should follow this pattern:

```
Step N: [entity type]
  Call 1: PLAN — generate list of names + 1-line descriptions + key metadata
  Call 2..N: DETAIL — for each entity, generate full details with context of:
    - All previously generated entities from this step
    - All entities from previous steps
    - IP research data
    - User premise
```

**Recommended mini-call breakdown:**

#### DNA Generation (seed-suggester.ts)
```
Call 1: geography (standalone — base layer)
Call 2: politicalStructure (sees: geography)
Call 3: centralConflict (sees: geography, politicalStructure)
Call 4: culturalFlavor (sees: geography, politicalStructure, centralConflict)
Call 5: environment (sees: all above)
Call 6: wildcard (sees: all above — must be genuinely different)
```
**6 sequential calls.** Each generates one category as a string. This is preferable to one call because each category gets the full context of previous ones, enabling real dependency chains.

For known IPs, each call's prompt changes: "Describe the ACTUAL [category] of the [franchise] world as modified by the premise changes."

#### Premise Refinement (scaffold-generator.ts)
```
Call 1: SINGLE call — but with much stronger prompt
```
One call is fine here because the premise is 2-3 sentences. The prompt must be rewritten to:
- Preserve user's stated character relationships VERBATIM
- For known IPs: set the stage for the canonical world with stated modifications
- NOT summarize plot, NOT invent new details

#### Locations Step
```
Call 1: PLAN — generate list of 5-8 location names + 1-line purpose + type tag
  For known IPs: "List canonical locations from [franchise] relevant to this premise"
  For original: "Generate 5-8 locations that logically arise from this world's DNA"
Call 2..N: DETAIL — for each location, generate:
  - Full description (2-3 concrete sentences)
  - Tags
  - connectedTo (referencing ONLY names from the plan)
  - isStarting flag
```
**Optimization:** The detail calls CAN be batched (e.g., 3-4 locations per call) to reduce total calls while still allowing inter-references. Recommended: batch in groups of 3, with each batch seeing the full details of the previous batch.

**Total calls for locations: 2-4** (1 plan + 1-3 detail batches)

#### Factions Step
```
Call 1: PLAN — list of 3-5 faction names + purpose + type
  For known IPs: "List canonical factions/organizations from [franchise]"
Call 2: DETAIL — all factions detailed (they're fewer, can batch)
  Context includes: all locations with descriptions
```
**Total calls: 2** (1 plan + 1 detail)

#### NPCs Step
```
Call 1: PLAN KEY — list 6-10 key character names + role + canonical reference
  For known IPs: "List canonical characters relevant to this premise"
  For original: "List 6-8 key characters who drive the world's conflicts"
Call 2: PLAN SUPPORTING — list 3-5 supporting character names + role
  "List 3-5 supporting characters to round out the world"
Call 3..N: DETAIL — batch details for each NPC (groups of 4-5)
  Context includes: all locations, all factions, previously detailed NPCs
```
**Total calls: 3-5** (2 plan + 1-3 detail batches)

#### Lore Extraction
```
Call 1: EXTRACT — one call but with ipContext.keyFacts injected as reference
  "Extract 30-50 lore cards. For known IPs, prioritize franchise-canonical concepts."
```
**Total calls: 1** (lore extraction works as a post-pass over the full scaffold)

### Total LLM Calls Per World Generation

| Step | Current | New (Known IP) | New (Original) |
|------|---------|----------------|----------------|
| Research | 3-6 | 3-6 (unchanged) | 0 |
| DNA | 1 | 6 | 6 |
| Premise | 1 | 1 | 1 |
| Locations | 1 | 2-4 | 2-4 |
| Factions | 1 | 2 | 2 |
| NPCs | 1 | 3-5 | 3-5 |
| Lore | 1 | 1 | 1 |
| Sufficiency | 3 | 3 | 0 |
| **TOTAL** | **~12** | **~21-29** | **~15-19** |

Token budget impact: More calls but SMALLER per call. Each detail call is ~200-500 tokens output vs current 1000-3000 tokens. Net token cost increase is moderate (~30-50%).

### Type Changes Required

**ScaffoldNpc — add tier field:**
```typescript
export interface ScaffoldNpc {
  name: string;
  persona: string;
  tags: string[];
  goals: ScaffoldNpcGoals;
  locationName: string;
  factionName: string | null;
  tier: "key" | "supporting"; // NEW — maps to DB "key" or "persistent"
}
```

The `tier` field on ScaffoldNpc maps to DB tiers: scaffold "key" -> DB "key", scaffold "supporting" -> DB "persistent" (since "temporary" is for Storyteller-spawned NPCs only).

**NPC schema update in scaffold-generator.ts:**
```typescript
const npcSchema = z.object({
  name: z.string(),
  tier: z.enum(["key", "supporting"]),
  persona: z.string(),
  tags: z.array(z.string()),
  goals: z.union([...]),
  locationName: z.string(),
  factionName: z.string().nullable(),
});
```

**NPCs step schema update:**
```typescript
const npcsStepSchema = z.object({
  npcs: z.array(npcSchema).min(8).max(15), // was min(3).max(10)
});
```

### IP Context Block Rewrite

Current (WRONG):
```
IMPORTANT: Honour the spirit and tone of this franchise but do NOT use its trademarked names...
```

New (CORRECT):
```
FRANCHISE REFERENCE DATA (${franchise}, source: ${source}):
These are verified canonical facts. Use them as your SOURCE OF TRUTH.

Key facts:
${keyFacts}

Tone:
${tonalNotes}

RULES FOR KNOWN IPs:
- Use CANONICAL names for all locations, factions, organizations, and characters.
- Do NOT invent fictional replacements for real franchise elements.
- The user's premise describes CHANGES to the canonical world. Apply these changes as butterfly effects — logical consequences that ripple from the stated changes.
- When the premise changes a character's teacher/faction/role, keep all OTHER canonical details unchanged unless logically affected.
- If research data doesn't cover a topic, state what's canonical to the best of your knowledge. Do NOT hallucinate non-existent franchise elements.
```

### DNA Inter-Dependency Prompt Pattern

Each DNA category call receives all previous categories as context:

```
You are describing the [CATEGORY] of a world for a text RPG.

${ipContext ? `This world is based on "${franchise}". Describe the ACTUAL canonical ${category} of this franchise, modified by the premise changes below.` : `This is an original world. Generate a specific, concrete ${category} based on the premise and previous DNA categories.`}

PREMISE: "${premise}"

${previousCategories.length > 0 ? `ALREADY ESTABLISHED DNA:
${previousCategories.map(c => `- ${c.label}: ${c.value} (Reasoning: ${c.reasoning})`).join('\n')}

Your ${category} MUST be consistent with and influenced by the above. Explain WHY this ${category} follows from what's already established.` : ''}

Return a JSON object with:
- value: 1-2 sentence description of the ${category}
- reasoning: 1 sentence explaining WHY this follows from the premise and previous DNA
```

### Suggested DNA Schema Change

Current DNA values are plain strings. To support inter-dependency reasoning:

```typescript
interface DnaCategoryResult {
  value: string;       // The actual DNA value
  reasoning: string;   // Why this follows from previous categories
}
```

However, this changes the API contract. The `value` field is what gets stored and displayed in the frontend. The `reasoning` is for prompt quality only — it can be logged but doesn't need to persist in the WorldSeeds type. The frontend WorldDnaPanel only shows the value.

**Recommendation:** Keep WorldSeeds unchanged (string values). The reasoning is internal to the generation pipeline — each call returns `{ value, reasoning }` but only `value` is stored in the seed. The reasoning is passed to subsequent calls within the pipeline but discarded after DNA generation completes.

### Prompt Engineering: Stop-Slop Checklist

Every prompt in the pipeline must pass this checklist before finalizing:

| Check | Bad Example | Good Example |
|-------|-------------|--------------|
| No purple prose adjectives | "a vast, sprawling, ancient realm" | "a continent of five island nations" |
| No AI-filler phrases | "In this world, there exists..." | Direct statements: "The Hidden Leaf Village is..." |
| Concrete specifics | "a powerful organization" | "the Akatsuki — 10 S-rank missing-nin seeking the Bijuu" |
| No hedge words | "perhaps", "possibly", "might be" | Definitive statements |
| Action verbs | "There is a conflict" | "Two clans war over..." |
| Grounded in data | "an ancient power system" | "Chakra-based jutsu system with 5 nature types" |
| No repetition of prompt instructions | LLM restating what it was asked | Direct answer only |

### Error Handling for Mini-Call Pipeline

Each mini-call can fail independently. Strategy:

1. **Plan call fails:** Fatal for the step. Retry once with simplified prompt. If still fails, fall through to single-call fallback (current behavior).
2. **Detail call fails for one entity:** Skip that entity, log warning. If >50% of entities fail, retry the entire step.
3. **IP context insufficient during detail calls:** The sufficiency check already exists and runs before each step. No additional handling needed.
4. **Partial pipeline failure:** Each step produces complete output or fails entirely. No partial scaffolds. The SSE progress events already handle this — a failed step results in an error event.

### SSE Progress Updates

Current: 5 steps. New pipeline has more granular progress within each step.

Recommendation: Keep the same 5 top-level progress steps but add sub-step labels:
```
Step 2: "Building locations (planning 6 canonical locations...)"
Step 2: "Building locations (detailing Konohagakure, 1/6...)"
Step 2: "Building locations (detailing Sunagakure, 2/6...)"
```

The `GenerationProgress` type already supports this via the `label` field. No type changes needed.

### File Organization

Current scaffold-generator.ts is ~367 lines. After the rewrite it will grow significantly due to:
- Multiple prompt templates per step
- Plan + detail call functions per step
- IP-specific vs original-world branching

**Recommendation:** Split scaffold-generator.ts into:
```
backend/src/worldgen/
├── scaffold-generator.ts          # Main orchestrator (generateWorldScaffold)
├── scaffold-steps/
│   ├── premise-step.ts            # generateRefinedPremiseStep
│   ├── locations-step.ts          # plan + detail calls for locations
│   ├── factions-step.ts           # plan + detail calls for factions
│   ├── npcs-step.ts               # plan + detail calls for NPCs
│   └── prompt-utils.ts            # shared prompt builders (IP block, stop-slop, etc.)
├── seed-suggester.ts              # Rewritten with sequential DNA calls
├── ip-researcher.ts               # Largely unchanged
├── lore-extractor.ts              # Rewritten with IP context injection
└── types.ts                       # Updated ScaffoldNpc with tier
```

This keeps each file under 300 lines and maintains single-responsibility.

### Backward Compatibility Considerations

1. **regenerate-section endpoint:** Currently calls `generateLocationsStep`, `generateFactionsStep`, `generateNpcsStep` directly. These function signatures must remain compatible or the route handler must be updated. Since we're splitting into plan+detail, the exported functions should maintain the same signature but internally orchestrate mini-calls.

2. **save-edits endpoint:** Receives scaffold data from frontend. The ScaffoldNpc type adding `tier` means the frontend must send it. The Zod schema in `schemas.ts` (`scaffoldNpcSchema`) must be updated to include `tier`.

3. **Frontend:** The `npcs-section.tsx` component currently doesn't display tier. It will need to show key vs supporting distinction. However, CONTEXT.md says frontend UI changes are OUT OF SCOPE — we only change backend prompt pipeline. The frontend will receive the tier field but can ignore it for now.

4. **IP context cache:** The `config.json` cache stores `IpResearchContext`. No format changes needed.

5. **Existing tests:** 8 test files in `__tests__/`. Tests for `seed-suggester.test.ts`, `ip-researcher.test.ts` mock `generateObject`. New tests must mock the multiple sequential calls.

### Data Flow Diagram

```
User Premise + Name
        │
        ▼
[IP Researcher] ──► IpResearchContext (keyFacts, tonalNotes, franchise)
        │                    │
        ▼                    │
[DNA Generator]              │  (6 sequential calls, each sees previous)
  geography ─► politicalStructure ─► centralConflict ─► ...
        │                    │
        ▼                    │
[Premise Refiner]  ◄─── ipContext + DNA values
        │
        ▼
[Sufficiency Check: locations]
        │
        ▼
[Locations Step]
  Plan Call ──► ["Konohagakure", "Sunagakure", ...]
  Detail Call 1 ──► Konohagakure { description, tags, connectedTo }
  Detail Call 2 ──► Sunagakure { ... , connectedTo: ["Konohagakure"] }
        │
        ▼
[Sufficiency Check: factions]
        │
        ▼
[Factions Step]
  Plan Call ──► ["Akatsuki", "ANBU", ...]
  Detail Call ──► all factions with territory from Locations
        │
        ▼
[Sufficiency Check: npcs]
        │
        ▼
[NPCs Step]
  Plan Key Call ──► ["Naruto", "Sakura", "Kakashi", ...]
  Plan Supporting Call ──► ["Original character 1", ...]
  Detail Calls ──► each NPC with location + faction references
        │
        ▼
[Lore Extractor] ◄─── full scaffold + ipContext.keyFacts
  Single call ──► 30-50 lore cards grounded in research data
```

## Common Pitfalls

### Pitfall 1: LLM Ignoring "Use Canonical Names" Despite Instruction
**What goes wrong:** Even with explicit instructions, some LLMs will "play it safe" and still invent names, especially smaller models.
**Why it happens:** RLHF training penalizes outputting copyrighted content. Some models have strong filters against reproducing IP names.
**How to avoid:** (a) Use the strongest available model for scaffold generation, (b) Include canonical names IN the prompt as examples: "Locations MUST include Konohagakure, Sunagakure, etc.", (c) Post-validate: check generated names against ipContext.keyFacts.
**Warning signs:** Output contains "inspired by" language or obvious name alterations.

### Pitfall 2: Mini-Call Context Accumulation Blowing Token Budget
**What goes wrong:** By the NPCs step, the context includes: premise + DNA + all locations with descriptions + all factions with details + previously generated NPCs. This can exceed the model's context window.
**Why it happens:** Each mini-call adds context from previous calls.
**How to avoid:** (a) Keep entity descriptions concise in the context block (name + 1-line summary, not full description), (b) Use maxOutputTokens to constrain response size, (c) For detail calls, only include the PLAN list (names), not full details of other entities.
**Warning signs:** API errors about context length, truncated outputs.

### Pitfall 3: Sequential DNA Calls Being Slow
**What goes wrong:** 6 sequential LLM calls for DNA takes 6x the latency of one call.
**Why it happens:** Each call must see the output of the previous one.
**How to avoid:** Consider batching into 2-3 calls instead of 6. E.g., Call 1: geography + politicalStructure, Call 2: centralConflict + culturalFlavor, Call 3: environment + wildcard. Each call sees the output of previous calls. This halves the latency while preserving dependencies.
**Warning signs:** Users complaining about DNA generation taking 30+ seconds.

### Pitfall 4: Inconsistent Entity References Between Steps
**What goes wrong:** NPCs reference a location name that doesn't match any generated location (e.g., "Konoha" vs "Konohagakure").
**Why it happens:** LLM uses a shorter/alternate name in NPC generation than was generated in locations step.
**How to avoid:** (a) Include exact location/faction names as an enumerated list in every downstream prompt, (b) Add Zod refinement that validates locationName/factionName against known lists, (c) Post-process: fuzzy-match names and correct minor variations.
**Warning signs:** orphaned NPCs with locationName not matching any location.

### Pitfall 5: Lore Cards Duplicating Scaffold Content
**What goes wrong:** Every location, NPC, and faction becomes a lore card (which is intended) but additional "concept" cards just restate scaffold descriptions.
**Why it happens:** Lore extractor sees the scaffold and mirrors it.
**How to avoid:** Instruct lore extractor: "Do NOT simply restate location/NPC/faction descriptions. Concept cards should cover WORLD SYSTEMS, POWERS, HISTORY, CULTURAL PRACTICES that are NOT directly described in the scaffold but are implied or known from research."
**Warning signs:** Lore cards with definitions that are near-copies of location descriptions.

### Pitfall 6: saveScaffoldToDb Tier Mapping
**What goes wrong:** New `tier` field on ScaffoldNpc must map correctly to DB tier column.
**Why it happens:** scaffold-saver.ts currently hardcodes tier to "key" for all NPCs.
**How to avoid:** Map scaffold tier to DB tier: "key" -> "key", "supporting" -> "persistent". Update scaffold-saver.ts insert logic.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `backend/vitest.config.ts` |
| Quick run command | `cd backend && npx vitest run src/worldgen/__tests__/ --reporter=verbose` |
| Full suite command | `cd backend && npx vitest run --reporter=verbose` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P24-01 | DNA sequential with inter-dependencies | unit | `npx vitest run src/worldgen/__tests__/seed-suggester.test.ts -t "sequential"` | Needs update |
| P24-02 | Premise preserves user input verbatim | unit | `npx vitest run src/worldgen/__tests__/scaffold-generator.test.ts -t "premise"` | Needs creation (scaffold-generator has no test file) |
| P24-03 | Locations use canonical names for known IPs | unit | `npx vitest run src/worldgen/__tests__/locations-step.test.ts` | Wave 0 |
| P24-04 | Factions use canonical names for known IPs | unit | `npx vitest run src/worldgen/__tests__/factions-step.test.ts` | Wave 0 |
| P24-05 | NPCs split into key/supporting tiers, 10-15 total | unit | `npx vitest run src/worldgen/__tests__/npcs-step.test.ts` | Wave 0 |
| P24-06 | Lore grounded in ipContext research data | unit | `npx vitest run src/worldgen/__tests__/lore-extractor.test.ts -t "ip context"` | Needs update |
| P24-07 | IP context block uses canonical names | unit | `npx vitest run src/worldgen/__tests__/prompt-utils.test.ts` | Wave 0 |
| P24-08 | Mini-call pipeline orchestration | integration | `npx vitest run src/worldgen/__tests__/scaffold-generator.test.ts -t "mini-call"` | Wave 0 |
| P24-09 | ScaffoldNpc tier maps to DB correctly | unit | `npx vitest run src/worldgen/__tests__/scaffold-saver.test.ts -t "tier"` | Needs update |

### Sampling Rate
- **Per task commit:** `cd backend && npx vitest run src/worldgen/__tests__/ --reporter=verbose`
- **Per wave merge:** `cd backend && npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/worldgen/__tests__/scaffold-generator.test.ts` -- covers P24-02, P24-08 (orchestration)
- [ ] `backend/src/worldgen/__tests__/prompt-utils.test.ts` -- covers P24-07 (IP context block)
- [ ] Tests for new step files if scaffold-generator is split into scaffold-steps/

## Code Examples

### Sequential DNA Generation Pattern
```typescript
// Source: designed for this phase
interface DnaCategoryResult {
  value: string;
  reasoning: string;
}

async function generateDnaSequential(
  premise: string,
  ipContext: IpResearchContext | null,
  role: ResolvedRole,
): Promise<Record<SeedCategory, DnaCategoryResult>> {
  const categories: Array<{ key: SeedCategory; label: string }> = [
    { key: "geography", label: "Geography" },
    { key: "politicalStructure", label: "Political Structure" },
    { key: "centralConflict", label: "Central Conflict" },
    { key: "culturalFlavor", label: "Cultural Flavor" },
    { key: "environment", label: "Environment" },
    { key: "wildcard", label: "Wildcard" },
  ];

  const results: Partial<Record<SeedCategory, DnaCategoryResult>> = {};
  const accumulated: string[] = [];

  for (const { key, label } of categories) {
    const previousContext = accumulated.length > 0
      ? `\nALREADY ESTABLISHED:\n${accumulated.join("\n")}`
      : "";

    const ipInstruction = ipContext
      ? `This world is based on "${ipContext.franchise}". Describe the ACTUAL canonical ${label.toLowerCase()} as modified by the premise.`
      : `This is an original world. Describe a specific, concrete ${label.toLowerCase()}.`;

    const result = await generateObject({
      model: createModel(role.provider),
      schema: z.object({
        value: z.string(),
        reasoning: z.string(),
      }),
      prompt: `${ipInstruction}\n\nPREMISE: "${premise}"${previousContext}\n\nReturn the ${label.toLowerCase()} as a concrete 1-2 sentence description, plus 1 sentence of reasoning explaining WHY.`,
      temperature: role.temperature,
    });

    results[key] = result.object;
    accumulated.push(`- ${label}: ${result.object.value} (${result.object.reasoning})`);
  }

  return results as Record<SeedCategory, DnaCategoryResult>;
}
```

### Location Plan + Detail Mini-Call Pattern
```typescript
// Source: designed for this phase
const locationPlanSchema = z.object({
  locations: z.array(z.object({
    name: z.string(),
    purpose: z.string().describe("1-line: why this location matters to the world"),
    isStarting: z.boolean(),
  })).min(5).max(8),
});

const locationDetailSchema = z.object({
  locations: z.array(z.object({
    name: z.string(),
    description: z.string().describe("2-3 concrete sentences. Physical details, atmosphere, significance."),
    tags: z.array(z.string()),
    connectedTo: z.array(z.string()),
  })),
});

async function generateLocationsIncremental(
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  ipContext: IpResearchContext | null,
): Promise<ScaffoldLocation[]> {
  // Call 1: Plan
  const ipPlanInstruction = ipContext
    ? `List canonical locations from "${ipContext.franchise}" relevant to this premise. Use REAL canonical names.`
    : "Generate 5-8 locations that arise from this world's premise and DNA.";

  const plan = await generateObject({
    model: createModel(req.role.provider),
    schema: locationPlanSchema,
    prompt: `${ipPlanInstruction}\n\nPREMISE: ${refinedPremise}\n\n${buildIpFactsBlock(ipContext)}`,
    temperature: req.role.temperature,
  });

  const planned = plan.object.locations;
  const nameList = planned.map(l => l.name);

  // Call 2+: Detail (batches of 3-4)
  const detailed: ScaffoldLocation[] = [];
  const batchSize = 4;

  for (let i = 0; i < planned.length; i += batchSize) {
    const batch = planned.slice(i, i + batchSize);
    const previouslyDetailed = detailed.map(l => `- ${l.name}: ${l.description}`).join("\n");

    const detail = await generateObject({
      model: createModel(req.role.provider),
      schema: locationDetailSchema,
      prompt: `Detail these locations for a text RPG.\n\nPREMISE: ${refinedPremise}\n\nALL LOCATION NAMES: ${nameList.join(", ")}\n\n${previouslyDetailed ? `ALREADY DETAILED:\n${previouslyDetailed}\n\n` : ""}LOCATIONS TO DETAIL:\n${batch.map(b => `- ${b.name}: ${b.purpose}`).join("\n")}\n\nconnectedTo MUST only reference names from the full list above.`,
      temperature: req.role.temperature,
    });

    for (const loc of detail.object.locations) {
      const plannedLoc = batch.find(b => b.name === loc.name);
      detailed.push({
        ...loc,
        isStarting: plannedLoc?.isStarting ?? false,
        connectedTo: loc.connectedTo.filter(n => nameList.includes(n)),
      });
    }
  }

  return detailed;
}
```

### Updated IP Context Block
```typescript
// Source: designed for this phase — replaces buildIpContextBlock
function buildIpContextBlock(ipContext: IpResearchContext | null): string {
  if (!ipContext) return "";

  const facts = ipContext.keyFacts.map(f => `  - ${f}`).join("\n");
  const tone = ipContext.tonalNotes.map(t => `  - ${t}`).join("\n");

  return `\nFRANCHISE REFERENCE (${ipContext.franchise}, verified via ${ipContext.source}):
Key facts (use as source of truth):
${facts}
Tone:
${tone}

CANONICAL FIDELITY RULES:
- Use REAL canonical names for locations, factions, organizations, characters.
- Do NOT invent replacements, translations, or "inspired by" variants.
- Apply premise changes as butterfly effects on the canonical world.
- If a fact is not in the reference data, use your knowledge of the franchise. Do NOT invent non-existent franchise elements.
`;
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON structured output | Manual JSON parsing | `safeGenerateObject` wrapper | Already handles code fences, malformed JSON, schema coercion |
| Schema validation | Manual field checking | Zod schemas with `.refine()` | Type-safe, auto-documented, composable |
| Entity name deduplication | String comparison loops | `Set` with `.toLowerCase()` | Existing pattern in ip-researcher.ts |
| Progress reporting | Custom events | Existing `GenerationProgress` + SSE | Already wired through the pipeline |

## Open Questions

1. **culturalFlavor is array-typed (2-3 values).**
   - What we know: It needs to be generated as part of sequential DNA. Other categories return a single string.
   - What's unclear: Should culturalFlavor get its own call returning `string[]`, or should it be a single call returning `{ value: string[], reasoning: string }`?
   - Recommendation: Same pattern, but schema returns `value: z.array(z.string()).min(2).max(3)` instead of `z.string()`.

2. **suggestSingleSeed endpoint compatibility.**
   - What we know: The `/suggest-seed` endpoint re-generates a single DNA category independently. With sequential dependencies, re-rolling one category should ideally re-roll downstream categories too.
   - What's unclear: Should we change the single-seed endpoint behavior or keep it independent?
   - Recommendation: Keep single-seed independent for now (user can manually re-roll downstream). Document this as a known limitation. Full sequential re-roll would require re-rolling ALL subsequent categories, which is a UX change.

3. **Batching detail calls vs individual calls.**
   - What we know: Batching (3-4 entities per call) reduces total calls and latency. Individual calls give maximum context per entity.
   - Recommendation: Batch in groups of 3-4. The context improvement from individual calls is marginal; the latency cost is significant (3x more calls = 3x more round trips).

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of `scaffold-generator.ts`, `seed-suggester.ts`, `ip-researcher.ts`, `lore-extractor.ts`
- CONTEXT.md user decisions from direct feedback with screenshots
- Existing type definitions in `shared/src/types.ts` and `backend/src/worldgen/types.ts`
- Database schema in `backend/src/db/schema.ts` (NPC tier field already exists)

### Secondary (MEDIUM confidence)
- Token budget estimates based on typical generateObject output sizes observed in codebase
- Mini-call architecture patterns derived from chain-of-thought prompting research

## Metadata

**Confidence breakdown:**
- Current codebase diagnosis: HIGH - direct code analysis, root causes identified
- Mini-call architecture: HIGH - straightforward decomposition of existing functions
- Prompt engineering: HIGH - problems clearly identified from user feedback
- Token budget estimates: MEDIUM - approximate based on typical LLM output sizes
- Error handling strategy: HIGH - extends existing patterns in codebase

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable domain, no external dependency changes)

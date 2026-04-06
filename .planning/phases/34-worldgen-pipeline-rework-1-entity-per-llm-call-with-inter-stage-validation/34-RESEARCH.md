# Phase 34: Worldgen Pipeline Rework — 1 Entity per LLM Call + Inter-Stage Validation - Research

**Researched:** 2026-04-04
**Domain:** Backend worldgen pipeline refactoring + LLM validation architecture + frontend progress display
**Confidence:** HIGH

## Summary

This phase reworks the existing batch-oriented worldgen scaffold pipeline into a per-entity generation pipeline with LLM-driven validation passes. The current codebase already uses a plan+detail pattern in all three entity stages (locations, factions, NPCs). The rework changes detail calls from batched (3-4 entities per call) to per-entity (1 entity per call), adds sequential accumulation so each entity sees all prior entities, adds LLM validation passes after each stage using the Judge role, and splits lore extraction into 4 category-specific calls.

The existing code is well-structured for this change. The NPC step already accumulates `previouslyDetailed` across batches — this pattern extends naturally to single-entity detail calls. The `safeGenerateObject` wrapper handles all LLM calls uniformly. The `reportProgress` utility already emits SSE events and needs only the new sub-progress fields. The `regenerate-section` route re-exports individual step functions and must continue working with the new signatures.

**Primary recommendation:** Refactor each step file (locations, factions, NPCs) to loop over planned entities one at a time for detail calls, add a `validateStageEntities()` function using Judge role + new Zod issue schema, add a `validateCrossStage()` final pass, split lore-extractor into 4 category calls, and extend `GenerationProgress` with optional sub-fields.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Batch plan, single detail — plan call returns all names, each entity gets own detail call
- D-02: Sequential execution within stage — each detail call sees full detail of prior entities
- D-03: LLM validation first (Judge role), code second. Returns issues list. Up to 3 rounds. After each stage + 1 final cross-stage.
- D-04: Judge role for validation, Generator for generation
- D-05: Full context per call (no optimization)
- D-06: Lore extraction per-category (4 calls)
- D-07: Two-tier progress (extend GenerationProgress with subStep/subTotal/subLabel)

### Claude's Discretion
- Exact Zod schemas for validation issue lists
- How to structure the re-generation prompt when fixing flagged entities
- Whether to add logging/metrics for validation rounds
- Exact progress stage count and labels

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

## Standard Stack

No new libraries needed. This phase is a pure refactor of existing code using the same stack:

### Core (already installed)
| Library | Purpose | Role in Phase |
|---------|---------|---------------|
| `ai` (v6+) | LLM calls via `generateText` | All generation and validation calls through `safeGenerateObject` |
| `zod` | Schema validation | New validation issue schemas, existing entity schemas |
| `hono` | HTTP/SSE streaming | Extended progress events |

No `npm install` required. No version changes.

## Architecture Patterns

### Current Pipeline Flow (scaffold-generator.ts)
```
Premise → Locations (plan+detail batch) → Factions (plan+detail batch) → NPCs (plan key+supporting, detail batch) → Lore (1 monolithic call)
```

### New Pipeline Flow
```
Premise →
  Locations (plan → detail x N → validate → fix → validate loop) →
  Factions (plan → detail x N → validate → fix → validate loop) →
  NPCs (plan key → plan supporting → detail x N → validate → fix → validate loop) →
  Cross-Stage Validation (validate → fix → validate loop) →
  Lore (4 category calls: location, faction, npc, concept/ability/item)
```

### Recommended File Structure Changes
```
backend/src/worldgen/
├── scaffold-generator.ts          ← Orchestrator: new step count, sub-progress, cross-stage validation
├── scaffold-steps/
│   ├── locations-step.ts          ← Plan stays batch, detail becomes per-entity loop
│   ├── factions-step.ts           ← Plan stays batch, detail becomes per-entity loop
│   ├── npcs-step.ts               ← Plans stay batch (key+supporting), detail becomes per-entity loop
│   ├── premise-step.ts            ← UNCHANGED
│   ├── prompt-utils.ts            ← Add reportSubProgress helper
│   └── validation.ts              ← NEW: validateStageEntities(), validateCrossStage(), re-gen logic
├── lore-extractor.ts              ← Split into 4 category calls
├── types.ts                       ← Extend GenerationProgress with sub-fields
└── ...
```

### Pattern 1: Per-Entity Detail Loop with Accumulator
**What:** Replace batch detail calls with a sequential loop where each entity sees all prior fully-detailed entities.
**When to use:** All three entity stages (locations, factions, NPCs).
**Example:**
```typescript
// Current (locations-step.ts, line 96-138): batch of 4
for (let i = 0; i < planned.length; i += BATCH_SIZE) {
  const batch = planned.slice(i, i + BATCH_SIZE);
  // ...single call details 3-4 entities
}

// New: per-entity with full accumulator
const detailed: ScaffoldLocation[] = [];
for (let i = 0; i < planned.length; i++) {
  const entity = planned[i];
  reportSubProgress(onProgress, i, planned.length, `Location: ${entity.name}`);
  
  const previousSummary = detailed.map((l) => 
    `- ${l.name}: ${l.description} [Tags: ${l.tags.join(", ")}] [Connected: ${l.connectedTo.join(", ")}]`
  ).join("\n");
  
  const detail = await generateObject({
    // ...prompt includes full previousSummary, not just 80-char truncation
  });
  detailed.push(mergeWithPlan(entity, detail.object));
}
```

### Pattern 2: LLM Validation Loop (up to 3 rounds)
**What:** After generating all entities in a stage, send them to Judge for validation. If issues found, re-generate flagged entities with issue context. Repeat up to 3 times.
**When to use:** After each stage (locations, factions, NPCs) and once cross-stage.
**Example:**
```typescript
// Validation issue schema (Claude's discretion)
const validationIssueSchema = z.object({
  issues: z.array(z.object({
    entityName: z.string().describe("Name of the problematic entity"),
    issueType: z.enum([
      "duplicate", "semantic_overlap", "broken_reference",
      "inconsistent_tags", "narrative_collision", "missing_connection",
      "vague_description", "canon_violation"
    ]),
    description: z.string().describe("What is wrong and why"),
    severity: z.enum(["critical", "warning"]),
    suggestedFix: z.string().describe("Concrete instruction for re-generation"),
  })),
});

const MAX_VALIDATION_ROUNDS = 3;

async function validateAndFixStage<T extends { name: string }>(
  entities: T[],
  judgeRole: ResolvedRole,
  regenerateEntity: (entity: T, issue: string) => Promise<T>,
  buildValidationPrompt: (entities: T[]) => string,
): Promise<T[]> {
  let current = entities;
  
  for (let round = 0; round < MAX_VALIDATION_ROUNDS; round++) {
    const result = await safeGenerateObject({
      model: createModel(judgeRole.provider),
      schema: validationIssueSchema,
      prompt: buildValidationPrompt(current),
      temperature: judgeRole.temperature,
      maxOutputTokens: judgeRole.maxTokens,
    });
    
    const criticalIssues = result.object.issues.filter(i => i.severity === "critical");
    if (criticalIssues.length === 0) break; // Clean — stop validation
    
    // Re-generate only flagged entities
    for (const issue of criticalIssues) {
      const idx = current.findIndex(e => 
        e.name.toLowerCase() === issue.entityName.toLowerCase()
      );
      if (idx >= 0) {
        current[idx] = await regenerateEntity(current[idx], issue.suggestedFix);
      }
    }
  }
  
  return current;
}
```

### Pattern 3: Two-Tier Progress Reporting
**What:** Extend GenerationProgress with optional sub-progress fields for entity-level detail.
**Example:**
```typescript
// types.ts
export interface GenerationProgress {
  step: number;
  totalSteps: number;
  label: string;
  subStep?: number;    // Current entity index within stage
  subTotal?: number;   // Total entities in stage
  subLabel?: string;   // Entity name or validation round label
}

// prompt-utils.ts — new helper
export function reportSubProgress(
  onProgress: ((progress: GenerationProgress) => void) | undefined,
  step: number,
  totalSteps: number,
  label: string,
  subStep: number,
  subTotal: number,
  subLabel: string,
): void {
  onProgress?.({ step, totalSteps, label, subStep, subTotal, subLabel });
}
```

### Pattern 4: Lore Extraction Split (4 category calls)
**What:** Replace single monolithic lore call with 4 focused calls.
**Example:**
```typescript
// Each call uses a narrower schema and focused prompt
const locationLoreSchema = z.object({
  loreCards: z.array(loreCardSchema).min(5).max(15),
});

async function extractLocationLore(scaffold, role, ipContext, premiseDivergence) {
  // Prompt focuses on geography, travel, landmarks
  // Schema expects location + event categories only
}

async function extractFactionLore(scaffold, role, ipContext, premiseDivergence) {
  // Prompt focuses on political structures, alliances, rivalries
  // Schema expects faction + rule categories
}

async function extractNpcLore(scaffold, role, ipContext, premiseDivergence) {
  // Prompt focuses on character abilities, relationships, backstory
  // Schema expects npc + ability categories
}

async function extractConceptLore(scaffold, role, ipContext, premiseDivergence) {
  // Prompt focuses on world systems, magic, technology, items, events
  // Schema expects concept + rule + ability + item + event categories
}
```

### Anti-Patterns to Avoid
- **Mutating entity arrays in place:** Always create new arrays/objects (immutability per CLAUDE.md).
- **Parallel detail calls within a stage:** D-02 mandates sequential execution so each entity sees prior entities.
- **Skipping validation after re-generation:** Each fix round must be validated again (up to 3 total).
- **Throwing on validation timeout:** After 3 rounds, accept entities as-is (D-03).
- **Changing step signatures for regenerate-section:** The route calls individual step functions directly — their public API must remain compatible.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON extraction from LLM | Custom parser | `safeGenerateObject` (existing) | Already handles code fences, coercion, bare arrays |
| Name matching | Exact string comparison | `validateLocation()` / `validateFaction()` (existing in npcs-step.ts) | Case-insensitive + fallback logic |
| SSE streaming | Raw Response construction | `streamSSE` from `hono/streaming` (existing) | Already used in worldgen route |
| Progress reporting | Manual JSON serialization | `reportProgress` / `reportSubProgress` (extend existing) | Consistent format, backward compatible |

## Common Pitfalls

### Pitfall 1: Regenerate-Section Route Breakage
**What goes wrong:** The `/regenerate-section` route directly imports and calls `generateLocationsStep`, `generateFactionsStep`, `generateNpcsStep`. Changing their signatures breaks this route.
**Why it happens:** The new per-entity flow needs `onProgress` callback and potentially a Judge role for validation, which the regenerate-section route doesn't provide.
**How to avoid:** Keep existing function signatures backward-compatible with optional parameters: `onProgress?: ProgressCallback, judgeRole?: ResolvedRole`. When called from regenerate-section without these, skip validation and sub-progress reporting. Test regenerate-section explicitly after refactor.
**Warning signs:** TypeScript compilation errors in `routes/worldgen.ts`.

### Pitfall 2: Validation Infinite Loop or Excessive LLM Calls
**What goes wrong:** Validation finds issues, re-gen introduces new issues, creating a cycle that burns LLM quota.
**Why it happens:** LLM-generated fixes may introduce new problems the validator catches.
**How to avoid:** Hard cap at 3 rounds (D-03). Only re-generate entities flagged as "critical" severity. After round 3, accept as-is with a log warning. Count total LLM calls for observability.
**Warning signs:** Pipeline taking >10 minutes for a single stage, or log showing 3 consecutive validation rounds with issues.

### Pitfall 3: Single-Entity Detail Schema vs Batch Detail Schema
**What goes wrong:** Current detail schemas expect `{ locations: [...] }` (array). Switching to per-entity, the LLM might return a single object instead of a 1-element array, or vice versa.
**Why it happens:** Schema mismatch when moving from batch to single-entity calls.
**How to avoid:** Create new single-entity detail schemas: `locationDetailSingleSchema = z.object({ name, description, tags, connectedTo })` instead of wrapping in an array. `safeGenerateObject` already handles bare-array-to-object wrapping, but explicit schemas are cleaner.
**Warning signs:** Zod validation errors during detail calls.

### Pitfall 4: NPC Two-Tier Plan Complexity
**What goes wrong:** NPCs have two plan calls (key + supporting) and the detail loop must handle both tiers in sequence. The `previouslyDetailed` accumulator must span both tiers.
**Why it happens:** D-01 preserves the existing two-plan NPC pattern. Supporting NPC detail calls need to see key NPC details.
**How to avoid:** Merge `keyPlanned` and `supportingPlanned` into `allPlanned` (already done in current code, line 403), then run a single sequential detail loop over all NPCs. The tier field comes from the plan entry.
**Warning signs:** Supporting NPCs duplicating key NPC personas or ignoring key NPCs in their context.

### Pitfall 5: Context Window Overflow in Validation Prompts
**What goes wrong:** Validation prompt includes full context (premise + ipBlock + divergence + canonical names + slop rules) PLUS all generated entities. For 6-10 NPCs with full detail, this can be very large.
**Why it happens:** D-05 mandates full context per call. Validation prompts add entity descriptions on top.
**How to avoid:** Judge role uses a fast model (GLM 5 Turbo) with a large context window. Monitor prompt size in logs. If approaching limits, truncate entity descriptions to first 2 sentences in the validation prompt (detail is for quality check, not reproduction).
**Warning signs:** Judge returning truncated or nonsensical responses, or `safeGenerateObject` throwing parse errors.

### Pitfall 6: Cross-Stage Validation Entity Name Drift
**What goes wrong:** Cross-stage validation finds that NPC `locationName` doesn't match any location because location was renamed during location validation fix.
**Why it happens:** Per-stage validation may rename entities (fix duplicates), but downstream stages reference old names.
**How to avoid:** Per-stage validation should NOT rename entities — only flag issues and re-generate with better instructions. If names must change, update all cross-references in the same fix step. Cross-stage validation catches remaining drift.
**Warning signs:** Cross-stage validation repeatedly finding broken references.

### Pitfall 7: Lore Extraction Category Overlap
**What goes wrong:** Splitting lore into 4 calls produces duplicate lore cards across categories (e.g., an NPC-related ability card appears in both NPC lore and concept lore).
**Why it happens:** Category boundaries are fuzzy — a character's signature ability belongs to both "npc" and "ability".
**How to avoid:** Each category call uses explicit instructions about what NOT to cover. Deduplicate merged results by term (case-insensitive). Use code-level dedup as final pass.
**Warning signs:** Lore card count exceeding 60+ with many near-duplicates.

## Code Examples

### Recommended Validation Issue Zod Schema
```typescript
const validationIssueSchema = z.object({
  issues: z.array(z.object({
    entityName: z.string(),
    issueType: z.enum([
      "duplicate_name",
      "semantic_overlap",
      "broken_reference",
      "inconsistent_tags",
      "narrative_collision",
      "vague_description",
      "canon_violation",
      "missing_connection",
    ]),
    description: z.string(),
    severity: z.enum(["critical", "warning"]),
    suggestedFix: z.string(),
  })),
  summary: z.string().describe("Overall assessment: 'clean' if no critical issues, or brief summary"),
});
```

### Recommended Re-Generation Prompt Structure
```typescript
function buildRegenPrompt(
  entity: { name: string },
  issue: string,
  originalPrompt: string,
): string {
  return `${originalPrompt}

CORRECTION REQUIRED FOR "${entity.name}":
The previous generation of this entity was flagged with the following issue:
${issue}

You MUST fix this specific issue while preserving all other correct details. 
Generate ONLY the corrected version of "${entity.name}".`;
}
```

### Recommended Progress Stage Labels
```typescript
// Total stages: premise(1) + locations(1) + loc-validation(1) + factions(1) + fac-validation(1) 
//   + npcs(1) + npc-validation(1) + cross-validation(1) + lore(4) = 12 stages
// But simplify for UX: 8 main stages with sub-progress for detail
const STAGE_LABELS = [
  "Refining world premise...",                    // step 0
  "Building locations (plan + detail)...",        // step 1, sub-progress per entity
  "Validating locations...",                      // step 2, sub-progress per validation round
  "Forging factions (plan + detail)...",          // step 3, sub-progress per entity
  "Validating factions...",                       // step 4
  "Creating NPCs (key + supporting)...",          // step 5, sub-progress per entity
  "Validating NPCs...",                           // step 6
  "Cross-stage consistency check...",             // step 7
  "Extracting world lore...",                     // step 8, sub-progress per category
] as const;
// totalSteps = 9
```

### Single-Entity Detail Schema (Location)
```typescript
const locationDetailSingleSchema = z.object({
  name: z.string(),
  description: z.string().describe("2-3 concrete sentences"),
  tags: z.array(z.string()).describe("3-5 structural tags"),
  connectedTo: z.array(z.string()).describe("Connected location names"),
});
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `backend/vitest.config.ts` |
| Quick run command | `npm --prefix backend run test -- --run` |
| Full suite command | `npm --prefix backend run test -- --run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01 | Plan stays batch, detail per-entity | unit | `npx --prefix backend vitest run src/worldgen/__tests__/pipeline-rework.test.ts -t "per-entity"` | Wave 0 |
| D-02 | Sequential detail with accumulator | unit | `npx --prefix backend vitest run src/worldgen/__tests__/pipeline-rework.test.ts -t "sequential"` | Wave 0 |
| D-03 | Validation loop up to 3 rounds | unit | `npx --prefix backend vitest run src/worldgen/__tests__/validation.test.ts` | Wave 0 |
| D-04 | Judge role for validation | unit | `npx --prefix backend vitest run src/worldgen/__tests__/validation.test.ts -t "judge"` | Wave 0 |
| D-06 | Lore extraction 4 calls | unit | `npx --prefix backend vitest run src/worldgen/__tests__/lore-extractor.test.ts` | Wave 0 |
| D-07 | Two-tier progress | unit | `npx --prefix backend vitest run src/worldgen/__tests__/progress.test.ts` | Wave 0 |
| COMPAT | regenerate-section still works | integration | `npx --prefix backend vitest run src/routes/__tests__/worldgen.test.ts` | Existing |

### Sampling Rate
- **Per task commit:** `npm --prefix backend run test -- --run`
- **Per wave merge:** `npm --prefix backend run test -- --run && npm --prefix backend run typecheck`
- **Phase gate:** Full suite green + typecheck before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/worldgen/__tests__/pipeline-rework.test.ts` -- covers D-01, D-02 (mock safeGenerateObject, verify call count and accumulator content)
- [ ] `backend/src/worldgen/__tests__/validation.test.ts` -- covers D-03, D-04 (mock Judge calls, verify loop termination and entity replacement)
- [ ] `backend/src/worldgen/__tests__/lore-extractor.test.ts` -- covers D-06 (mock 4 calls, verify dedup)
- [ ] `backend/src/worldgen/__tests__/progress.test.ts` -- covers D-07 (verify sub-progress fields emitted)

## Open Questions

1. **Validation prompt scope for warnings vs criticals**
   - What we know: D-03 says re-generate only problematic entities. Schema includes severity.
   - What's unclear: Should warnings be logged and ignored, or should they accumulate and trigger a fix after enough warnings?
   - Recommendation: Only re-generate on `critical` severity. Log warnings for observability. This keeps the loop bounded.

2. **Cross-stage validation fix targets**
   - What we know: Final cross-stage validation sees all entities. Issues may span stages (e.g., NPC references non-existent location).
   - What's unclear: When cross-stage finds an NPC with bad locationName, do we re-run the NPC detail call or just code-fix the reference?
   - Recommendation: Code-fix simple reference issues (name normalization). Re-generate only for semantic issues (e.g., "this NPC's goals conflict with their faction's goals").

3. **Regenerate-section and validation**
   - What we know: Route calls step functions directly for single-section regeneration.
   - What's unclear: Should regenerate-section also run per-stage validation?
   - Recommendation: No validation for regenerate-section (it's a user-initiated redo of one section). Validation only in the full pipeline. Keep step function signatures backward-compatible with optional judgeRole/onProgress.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all 8 canonical reference files from CONTEXT.md
- `scaffold-generator.ts` -- current orchestrator (98 lines, 5-step pipeline)
- `locations-step.ts` -- current batch detail pattern (163 lines, BATCH_SIZE=4)
- `factions-step.ts` -- current single-call detail pattern (128 lines, all factions in 1 call)
- `npcs-step.ts` -- current two-tier plan + batch detail (481 lines, batch of 3)
- `lore-extractor.ts` -- current monolithic extraction (194 lines, 20-60 cards)
- `generate-object-safe.ts` -- safeGenerateObject wrapper (285 lines, generateText + manual parse)
- `resolve-role-model.ts` -- role resolution for Judge vs Generator
- `prompt-utils.ts` -- all prompt builders and reportProgress
- `routes/worldgen.ts` -- SSE streaming and regenerate-section integration

### Secondary (MEDIUM confidence)
- Frontend `api-types.ts` -- GenerationProgress interface and SSE consumption
- Frontend `api.ts` -- parseSSEStream handler for progress events

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, pure refactor of existing patterns
- Architecture: HIGH -- existing code already uses plan+detail+accumulator pattern, extending to per-entity is mechanical
- Pitfalls: HIGH -- identified from direct code inspection of integration points and existing patterns
- Validation loop design: MEDIUM -- Zod schema and re-gen prompt structure are discretionary, but the pattern is straightforward

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable -- internal refactor, no external dependency changes)

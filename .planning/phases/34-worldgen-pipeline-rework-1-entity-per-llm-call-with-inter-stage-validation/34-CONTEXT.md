# Phase 34: Worldgen Pipeline Rework — 1 Entity per LLM Call + Inter-Stage Validation - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Rework the backend worldgen scaffold pipeline from batch entity generation to per-entity generation with inter-stage LLM validation passes. Affects: `scaffold-generator.ts`, all files in `scaffold-steps/`, `lore-extractor.ts`, `types.ts` (GenerationProgress). Frontend changes limited to progress display (two-tier progress bar). Does NOT change: database schema, scaffold-saver, ip-researcher, premise-divergence, settings UI, or frontend world-review editing.

</domain>

<decisions>
## Implementation Decisions

### D-01: Entity Granularity — Batch Plan, Single Detail
- **Plan calls stay batch:** 1 call returns all names for a stage (e.g., 5-8 location names, 3-6 faction names, 6-10 key NPC names, 3-5 supporting NPC names)
- **Detail calls are per-entity:** Each entity gets its own dedicated detail call. E.g., 6 location names → 6 individual detail calls.
- NPC plan calls: **keep two plans** (key NPCs first, then supporting NPCs referencing key names). Current behavior preserved.

### D-02: Sequential Execution Within Stage
- Detail calls run **sequentially** within each stage, NOT in parallel.
- Each detail call sees **full detail** of all previously generated entities in the same stage (name + description + tags + connections/territories/goals — all fields).
- This enables richer cross-references between entities at the cost of sequential execution time.

### D-03: Validation Passes — LLM First, Then Code
- After each stage (locations, factions, NPCs), run an **LLM validation pass** that receives all generated entities and checks for: duplicates, semantic overlap, broken cross-references, inconsistent tags, narrative purpose collisions.
- LLM validation returns a **structured issues list** (entity X: issue Y), NOT fixed entities.
- Problematic entities are **re-generated** with the issue as instruction context.
- **Validation loop: up to 3 rounds** (validate → fix → validate → fix → validate). After 3 rounds, accept as-is.
- After all 3 per-stage validations, run **1 final cross-stage validation** that sees locations + factions + NPCs together and checks cross-references between stages.
- Code-only validation is limited to the simplest mechanical tasks: name normalization (case-insensitive matching), ensuring `connectedTo`/`territoryNames`/`locationName`/`factionName` reference existing names.

### D-04: Validation Model — Judge Role
- Validation calls use the **Judge role** (already configured with a fast model like GLM 5 Turbo).
- Generation/detail calls continue using the **Generator role** (main creative model).
- No new roles needed. No settings UI changes.

### D-05: Full Context Per Call
- All calls (plan, detail, validation) receive **full context**: premise + ipBlock + divergenceBlock + canonical names + slop rules + previously generated entities.
- No tiered/minimal context optimization. GLM subscription is not per-token, so overhead is acceptable.
- Priority is quality over token efficiency.

### D-06: Lore Extraction — Per-Category
- Lore extraction splits into **4 category-specific calls** instead of 1 monolithic call:
  - Location lore (from all locations)
  - Faction lore (from all factions)
  - NPC lore (from all NPCs)
  - Concept/ability/item lore (from full scaffold)
- Each call focuses on its domain for higher quality extraction.

### D-07: Two-Tier Progress Reporting
- **Extend GenerationProgress protocol** with optional sub-progress fields: `subStep?: number`, `subTotal?: number`, `subLabel?: string`.
- Stage-level progress (5-8 stages) drives the main progress bar.
- Entity-level sub-progress shows current entity within the stage (e.g., "Location 3/6: Konohagakure").
- Frontend displays both tiers. Backward compatible — old clients ignore sub-fields.

### Claude's Discretion
- Exact Zod schemas for validation issue lists
- How to structure the re-generation prompt when fixing flagged entities
- Whether to add logging/metrics for validation rounds
- Exact progress stage count and labels

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Worldgen Pipeline (primary modification targets)
- `backend/src/worldgen/scaffold-generator.ts` — Main pipeline orchestrator, 5-step flow
- `backend/src/worldgen/scaffold-steps/locations-step.ts` — Location plan+detail, batch of 4
- `backend/src/worldgen/scaffold-steps/factions-step.ts` — Faction plan+detail
- `backend/src/worldgen/scaffold-steps/npcs-step.ts` — NPC plan key+supporting, detail batch of 3
- `backend/src/worldgen/scaffold-steps/premise-step.ts` — Premise refinement (unchanged)
- `backend/src/worldgen/scaffold-steps/prompt-utils.ts` — buildIpContextBlock, buildStopSlopRules, etc.
- `backend/src/worldgen/lore-extractor.ts` — Lore card extraction (split to per-category)
- `backend/src/worldgen/types.ts` — GenerationProgress, ScaffoldLocation, ScaffoldFaction, ScaffoldNpc

### AI Infrastructure
- `backend/src/ai/generate-object-safe.ts` — safeGenerateObject (generateText + manual JSON parse)
- `backend/src/ai/index.ts` — createModel factory
- `backend/src/ai/resolve-role-model.ts` — Role resolution (Judge vs Generator)

### Shared Types
- `shared/src/types.ts` — IpResearchContext, PremiseDivergence, Settings, RoleConfig

### Frontend Progress Display
- `frontend/components/world-review/` — World review components (progress display lives in parent page)
- `frontend/app/(non-game)/campaign/[id]/review/page.tsx` — World review page with SSE progress

### Prior Phase Context
- `.planning/phases/24-worldgen-known-ip-quality/24-CONTEXT.md` — Phase 24 decisions on canonical fidelity, plan+detail pattern, IP research grounding

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildIpContextBlock()` — Already handles flat and source-grouped formats. Reuse as-is for all calls.
- `buildPremiseDivergenceBlock()` — Premise divergence rendering. Reuse as-is.
- `buildCanonicalList()` — Focused canonical names for a type. Reuse for plan calls.
- `buildStopSlopRules()` — Quality guardrails. Include in all generation calls.
- `buildKnownIpGenerationContract()` — IP contract. Include in plan and detail calls.
- `validateLocation()` / `validateFaction()` — Case-insensitive name matching. Reuse for code validation pass.
- `reportProgress()` — SSE progress reporter. Extend for sub-progress.
- `fromLegacyScaffoldNpc()` — NPC → CharacterDraft adapter. Keep in NPC detail step.

### Established Patterns
- **Plan+detail split**: Every step already uses this pattern. The rework changes detail from batch to per-entity but keeps the plan batch.
- **Sequential with accumulator**: `npcs-step.ts` already accumulates `previouslyDetailed` across batches. Extend this pattern to all steps.
- **Zod schema validation**: All LLM output goes through Zod schemas. Validation issues list needs its own schema.
- **safeGenerateObject**: All LLM calls use this wrapper. Continue using it for both generation and validation.

### Integration Points
- `scaffold-generator.ts` orchestrates the pipeline. Main modification point.
- `routes/worldgen.ts` calls `generateWorldScaffold()` — interface stays the same, just takes longer.
- `scaffold-saver.ts` receives the final WorldScaffold — no changes needed.
- Frontend SSE reader in review page — needs to handle new sub-progress fields.

</code_context>

<specifics>
## Specific Ideas

- User explicitly said: "Код тупой, он не обнаруживает аномалии" — LLM validation is the primary validator, code only handles trivial mechanical normalization.
- User suggested using Judge role for validation because "от нее не богатая фантазия требуется, а просто базовое понимание вещей + скорость".
- User wants maximum quality at any cost (full context, sequential execution, validation until clean).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 34-worldgen-pipeline-rework-1-entity-per-llm-call-with-inter-stage-validation*
*Context gathered: 2026-04-04*

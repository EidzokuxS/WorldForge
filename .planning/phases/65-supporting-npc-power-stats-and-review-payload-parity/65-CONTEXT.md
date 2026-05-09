# Phase 65: Supporting NPC Power Stats and Review Payload Parity - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the remaining review/runtime gap where supporting NPCs lose visible power stats, because:

1. **Worldgen enrichment gap** — `backend/src/worldgen/scaffold-steps/npcs-step.ts:679` gates enrichment on `ipContext && tier === "key"`. Known-IP supporting NPCs and all original-world NPCs (both tiers) never receive `draft.powerStats`.
2. **Review payload gap** — `/api/worldgen/regenerate-section` with `section="npcs"` inherits the same enrichment gate. The scaffold-saver persists whatever the upstream pipeline emits, so the gap surfaces end-to-end in `/campaign/[id]/review` and in any follow-on gameplay reads.

Phase delivers: every scaffold NPC (known-IP key, known-IP supporting, original key, original supporting) produced by initial worldgen OR by regenerate-section carries a valid `draft.powerStats` block. Parity is proven end-to-end through HTTP-level integration tests mirroring the Phase 64 pattern.

</domain>

<decisions>
## Implementation Decisions

### Power Stats Coverage (Area 1)

- **D-01:** Known-IP supporting NPCs (`ipContext && tier === "supporting"`) run the full canon branch via `enrichKnownIpWorldgenNpcDraft`. Same path as key-tier known-IP NPCs — web research + VS Battles tier assessment. Rationale: supporting canon characters need accurate franchise-grounded stats; Human defaults would be wrong for low-power-tier franchise minor characters and understate power for higher-tier franchise minor characters.
- **D-02:** Original-world NPCs (`!ipContext`, both tiers) run `assessOriginalCharacterPowerStats` (the Phase 60 no-search LLM-only branch). Consistent treatment for key and supporting. Uses draft persona + premise + any override text as the assessment basis.
- **D-03:** No `Human default baseline` shortcut for any tier/world combination. Every scaffold NPC passes through an actual assessment step.
- **D-04:** Fail-closed error handling — each NPC enrichment is wrapped in `withPipelineRetry` (up to 3 attempts). If a single NPC's enrichment exhausts retries, the entire `npcs-step` (or `regenerate-section` handler) throws an `IngestionPipelineError` and aborts the scaffold run. No partial-success fallbacks. Matches `feedback_no_fallbacks_v2.md` and Phase 60 fail-closed policy.
- **D-05:** Parallelization — enrichment across the 6-15 NPCs per scaffold run is batched in groups of 3-5 concurrent calls, mirroring the existing detail-pass batch size in `npcs-step.ts`. Bounded concurrency protects rate limits (especially for the web-search path on known-IP supporting) while cutting sequential latency roughly 3-5×.

### Regenerate-Section + Saver Parity (Area 2)

- **D-06:** Extract the per-NPC enrichment selection + retry + batching into a shared helper (working name `enrichNpcsBatch` or similar) living next to existing `personality-schema.ts` and related helpers. The initial-scaffold path (`npcs-step.ts`) and the regenerate-section handler both call the same helper. Single source of truth. Mirrors the Phase 64 consolidation pattern (`personality-schema.ts` + `mapFlatPersonalityToNested`).
- **D-07:** `scaffold-saver.ts` requires **no code changes** for this phase. `reconcileDraftBackedScaffoldNpc` (line 176) already passes through `npc.draft` when present, and `draft.powerStats` persists via the normal draft write. Decision is validated by adding a regression test covering a supporting NPC with populated `draft.powerStats` running through the saver, proving round-trip to DB.
- **D-08:** Verification is a real-step integration test on `/api/worldgen/regenerate-section` `section="npcs"` — same pattern as Phase 64 Plan 64-03. LLM seam mocked via `safeGenerateObject` so the route actually runs, asserting the HTTP response contains populated `powerStats` for supporting NPCs. Plus a parallel initial-scaffold integration test for known-IP supporting and original-world both tiers.
- **D-09:** **No frontend UI changes for the Power Stats section.** `frontend/components/world-review/npcs-section.tsx:544` already conditionally renders `PowerStatsSection` when `npc.draft?.powerStats` is present — supporting NPCs will begin rendering it automatically once backend starts populating. A frontend regression test locks the conditional render for both tiers.

### Claude's Discretion

- **Payload envelope decision for creation/import routes** — The phase title says "review payload parity", and `backend/src/character/record-adapters.ts:920` (`toLegacyNpcDraft`) currently strips `draft` from the scaffold projection, so `frontend/components/world-review/npcs-section.tsx:207` spread-merging `...result.npc` loses `result.draft.powerStats`. The planner may:
  - Option A: Change frontend to attach `result.draft` onto the merged scaffold NPC (e.g. `{ ...result.npc, draft: result.draft, characterRecord: result.characterRecord }`). One-line frontend fix per handler (`handleParse`, `handleGenerate`, `handleResearch`, `handleImport`). Does **not** touch the backend envelope.
  - Option B: Use `characterDraftToScaffoldNpc(result.draft)` instead of `result.npc`. Slightly larger frontend change, drops reliance on `toLegacyNpcDraft`.
  - Option C: Backend — include `draft` in the `toLegacyNpcDraft` return shape. Touches shared adapter surface (used elsewhere in routes and tests).
  - Planner decides based on least-invasive-surface principle. Option A is the recommended default unless regression coverage proves otherwise.
- **Prompt/assessor tuning for non-key canon characters** — The existing `enrichKnownIpWorldgenNpcDraft` prompt may implicitly assume key-tier importance ("main-cast" rhetoric) when invoked on supporting-tier inputs. Planner may add a supporting-tier aware instruction variant if the assessment quality suffers on 3-5 supporting canon characters.
- **Research cache reuse** — If research calls per supporting NPC are too expensive, planner may reuse an already-populated `req.research` bundle or the Phase 23 persisted research frame, as long as the assessment still produces accurate per-character powerStats.
- **Test isolation details** — Whether new tests live in new files or extend `backend/src/worldgen/__tests__/npcs-step.test.ts` and the scaffold-saver test file; whether to fixture the supporting-NPC scenarios with original-world and known-IP variants; plan-checker-level concern.
- **Plan wave structure** — Whether to use 2 plans (shared helper + consumers) or 3 plans (helper → worldgen integration → regenerate integration + saver test); planner decision based on wave dependency graph.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 65 code of record (must read, must not refactor beyond scope)

- `backend/src/worldgen/scaffold-steps/npcs-step.ts` — Current worldgen entry point for NPC generation. The gate at line 679 (`if (ipContext && tier === "key")`) is the primary bug site. Any change must preserve the existing plan + detail two-pass structure.
- `backend/src/character/known-ip-worldgen-research.ts` — Houses `enrichKnownIpWorldgenNpcDraft`. To be reused for known-IP supporting tier.
- `backend/src/character/ingestion/assess-original.ts` — Houses `assessOriginalCharacterPowerStats`. To be reused for original-world NPCs (both tiers).
- `backend/src/character/ingestion/retry.ts` — `withPipelineRetry` wrapper used by the Phase 60 pipeline. Required wrapper around each per-NPC enrichment call per D-04.
- `backend/src/character/ingestion/errors.ts` — `IngestionPipelineError` shape with `stage` + `attempts`. Thrown on fail-closed exhaustion.
- `backend/src/character/personality-schema.ts` — Phase 64 shared-helper pattern. The new `enrichNpcsBatch` helper should mirror this structural choice (backend-local module, shared by worldgen initial + regenerate paths).
- `backend/src/worldgen/scaffold-saver.ts` — Confirmed no code change needed (D-07). Only a new regression test around `reconcileDraftBackedScaffoldNpc` with a draft-backed supporting NPC carrying `powerStats`.
- `backend/src/routes/worldgen.ts` — Houses `regenerate-section` handler. Must route through the new shared helper.
- `backend/src/character/record-adapters.ts` — Houses `toLegacyNpcDraft` (line 920). Referenced by the Claude's Discretion note on payload envelope.
- `frontend/components/world-review/npcs-section.tsx` — Review UI. Line 544 is the existing conditional PowerStatsSection render; lines 190-377 contain the 4 creation/import handlers that currently drop `result.draft`.
- `frontend/lib/character-drafts.ts` — `characterDraftToScaffoldNpc`, `scaffoldNpcToDraft`, `syncScaffoldTierToDraft`. Referenced by the Claude's Discretion payload-envelope options.

### Prior phase contracts (locked behavior that must be preserved)

- `.planning/phases/60-character-ingestion-backend-pipeline/60-CONTEXT.md` — Phase 60 original/canon power-assessment split. D-01/D-02 explicitly reuse this split.
- `.planning/phases/60-character-ingestion-backend-pipeline/60-03-PLAN.md` — Power Assessor plan, defines canon vs original branch wiring.
- `.planning/phases/64-npc-personality-regeneration-parity/64-CONTEXT.md` — Phase 64 parity pattern (shared helper + regenerate-section integration test). D-06 + D-08 mirror this explicitly.
- `.planning/phases/64-npc-personality-regeneration-parity/64-03-regenerate-integration-test-PLAN.md` — Reference structure for the Phase 65 regenerate-section integration test.
- `.planning/phases/64-npc-personality-regeneration-parity/64-05-verification-gate-PLAN.md` — Reference structure for Phase 65's closeout (full backend Vitest suite, roadmap/requirements updates).
- `.planning/phases/57-power-scaling-and-character-profile-redesign/` — Phase 57 locked the VS Battles tier schema. Any new enrichment consumer must emit the same `PowerStats` shape (`attackPotency`, `durability`, `speed`, `intelligence`, `hax[]`, `vulnerabilities[]`).

### Project policy

- `memory/feedback_no_fallbacks_v2.md` — Explicit no-silent-degradation rule. Drives D-04.
- `memory/project_power_profile_redesign.md` — Original VS Battles power-scaling decision. All powerStats emissions must conform.
- `memory/project_v2_import_pipeline.md` — Priority merge (user override > card > research > LLM inference). Applies only if V2 import paths are touched; Phase 65 does not expand that surface, but any incidental work must respect priority.
- `memory/feedback_openrouter_embargo.md` — Only Embedder on OpenRouter. Assessment LLM calls must continue to use the Generator role on GLM (existing `enrichKnownIpWorldgenNpcDraft` and `assessOriginalCharacterPowerStats` already comply).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `enrichKnownIpWorldgenNpcDraft(backend/src/character/known-ip-worldgen-research.ts)` — Canon branch. Currently used only for `tier === "key"` path in `npcs-step.ts`. Reused verbatim for known-IP supporting per D-01.
- `assessOriginalCharacterPowerStats(backend/src/character/ingestion/assess-original.ts)` — Original branch, no web search. Currently used by Phase 60 character ingestion pipeline. Reused for all original-world NPCs per D-02.
- `withPipelineRetry(backend/src/character/ingestion/retry.ts)` — Retry wrapper returning `IngestionPipelineError` on exhaustion. Drop-in for per-NPC enrichment per D-04.
- `PowerStatsSection(frontend/components/character-creation/power-stats-section.tsx)` — Shared atom already imported by `npcs-section.tsx:544`. Renders when `powerStats` is non-null. No changes needed per D-09.
- `reconcileDraftBackedScaffoldNpc(backend/src/character/record-adapters.ts)` — Already runs in `scaffold-saver.ts:176` whenever `npc.draft` exists. Preserves `draft.powerStats` on save per D-07.

### Established Patterns

- **Shared helper co-located with related schema/helpers** — Phase 64 `personality-schema.ts` sits in `backend/src/character/` and is consumed by both worldgen (`npcs-step.ts`) and character-ingestion (`npc-generator.ts`). Phase 65 `enrichNpcsBatch` follows the same co-location principle.
- **Fail-closed with `withPipelineRetry`** — Phase 60 Plan 60-03 fixed this pattern for single-character ingestion. Phase 65 extends it to per-NPC enrichment inside a batch.
- **Real-step integration test with LLM seam mock** — Phase 64 Plan 64-03 pattern. Mocks only `safeGenerateObject` / LLM seams, exercises the real HTTP route. Phase 65 regenerate-section and initial-scaffold tests mirror this shape.
- **Bounded parallel batch** — `npcs-step.ts` already batches detail passes in groups of 3-5. Same shape for per-NPC enrichment per D-05.
- **Scaffold NPC draft carries authoritative `powerStats`** — The review UI, scaffold-saver, and downstream DB projection all treat `draft.powerStats` as the source of truth. The fix is entirely on the producers (worldgen + regenerate), not the consumers.

### Integration Points

- `npcs-step.ts` enrichment branch (line 679) — Replace with shared helper call that routes by `(ipContext, canonicalStatus)` pair and tier for every NPC.
- `backend/src/routes/worldgen.ts` regenerate-section handler for `section === "npcs"` — Insert shared helper call before response assembly.
- `backend/src/worldgen/scaffold-saver.ts` — Unchanged code; gains a regression test fixture with a draft-backed supporting NPC carrying `powerStats`.
- `frontend/components/world-review/npcs-section.tsx:544` — Unchanged production code; gains a regression test asserting PowerStatsSection renders for both tiers when `draft.powerStats` is present.

### Risks

- **LLM cost uplift** — Full-research enrichment for 3-5 known-IP supporting NPCs per scaffold adds 3-5 web-search passes per world generation. Mitigated by bounded parallelism (D-05). If cost is prohibitive, the planner has explicit Claude's Discretion latitude to reuse `req.research` cache.
- **Supporting-tier prompt quality** — `enrichKnownIpWorldgenNpcDraft` may implicitly assume key-tier prominence. If assessment quality suffers on 3-5 minor canon characters, the planner can add a supporting-tier aware prompt variant (Claude's Discretion).
- **Scaffold latency** — Total scaffold generation time increases roughly proportional to (supporting enrichment calls / batch size). Planner should size batches accordingly and log timings in the integration test for observability.

</code_context>

<specifics>
## Specific Ideas

- Follow the **Phase 64 three-plan pattern** (schema/helper → consumer integration → real-step integration test) as the default plan shape. Planner may adjust to 2 or 4 plans per wave-dependency analysis.
- The scaffold-saver test MUST use a **draft-backed supporting NPC** fixture (not a legacy bare scaffold NPC) to prove the draft.powerStats round-trip through `reconcileDraftBackedScaffoldNpc`.
- Integration tests follow the Phase 64 Plan 64-03 convention: real HTTP route execution with only `safeGenerateObject` mocked, assertions on the HTTP response shape.
- Verification run is backend-only for this phase (Phase 64 convention per STATE D-20). The one frontend regression test is a component-level Vitest in `frontend/components/world-review/__tests__/`, not a browser smoke.
- Roadmap/requirements updates happen in the closeout plan (mirror 64-05), introducing P65-R1..N requirement IDs.

</specifics>

<deferred>
## Deferred Ideas

- **Legacy NPC backfill script** — Existing saved campaigns have supporting NPCs with null `powerStats`. A `backfill-powerstats.ts` script (mirroring the Phase 63 `backfill-personality.ts` pattern) is explicitly **deferred** — user declined to fold into Phase 65. Future phase candidate.
- **On-load retroactive enrichment** — Auto-triggered enrichment when an old campaign loads a supporting NPC with missing stats. Deferred with the backfill script.
- **UI "Enrich now" button on legacy NPC cards** — Manual trigger for retroactive enrichment. Deferred.
- **Review UI empty-state redesign for missing stats** — Banner / placeholder / error-state treatment when `draft.powerStats` is null on a legacy record. Deferred; current hide-section behavior remains.
- **Creation-tier flip timing rework** — Passing `tier` through the 4 character-ingestion routes so backend can short-circuit assessment for supporting tier. Deferred; Phase 65 keeps the current `role="key"` + frontend `syncNpcTier` post-response pattern untouched.
- **Supporting-tier aware prompt variant for enrichKnownIpWorldgenNpcDraft** — Only promoted if assessment quality audit shows degradation; Claude's Discretion flag in this phase, not a hard commitment.

</deferred>

---

*Phase: 65-supporting-npc-power-stats-and-review-payload-parity*
*Context gathered: 2026-04-19*

---
phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin
verified: 2026-04-30T09:55:48Z
status: passed
score: 34/34 plan must-haves verified
overrides_applied: 0
re_verification:
  initial_status: failed_before_closure
  initial_score: 28/34
  closed_findings:
    - "ScenePlanner/runtime tool contracts now omit out-of-scope quick-action examples for log_event-only and empty selected-tool sets."
    - "Power-stat rank parsing no longer defaults missing, non-numeric, NaN, or zero ranks to 5."
    - "NPC offscreen backend validation now enforces prompt-advertised field caps and rejects more updates than listed offscreen NPCs before persistence."
    - "Verification matrix and requirements traceability now cite gap-plan evidence and keep live provider readiness release-blocking."
  remaining_findings: []
  regressions: []
---

# Phase 74: Structured Prompt Contracts and Model-Facing Schema Hardening Verification Report

**Phase Goal:** Audit every structured-output model call and make the model-facing prompt contract explicit enough that models are asked for the exact schema/tool shape before repair, while backend validation remains the final deterministic authority.
**Verified:** 2026-04-30T09:55:48Z
**Status:** passed
**Re-verification:** Yes - after gap closure plans 74-12 through 74-15

## Goal Achievement

Phase 74 goal is achieved for local deterministic scope. The original verifier findings are closed in current code, local tests/typecheck/schema-drift checks pass, and the matrix correctly separates local prompt-contract hardening from live provider release readiness.

Live active-role provider conformance is still recorded as release-blocking in the matrix. That is accurate reporting, not a Phase 74 verification gap, because P74-R6 requires failures and live timeouts to be surfaced before stability claims.

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Every production structured-output model seam is listed in the Phase 74 audit before prompt code is changed. | VERIFIED | `74-STRUCTURED-PROMPT-AUDIT.md` has P0/P1/P2 rows with plan/test owners; `structured-prompt-contract-audit.test.ts` passed. |
| 2 | Static tests fail when a P0/P1 structured-output seam is missing from the audit. | VERIFIED | `npm --prefix backend run test -- src/ai/__tests__/structured-prompt-contract-audit.test.ts ...` passed, including audit guard tests. |
| 3 | Audit records each contract owner and deterministic authority. | VERIFIED | Audit rows include plan owner, schema/tool source, backend authority, and semantic test owner. |
| 4 | ScenePlanner/runtime tool contracts are scoped to selected tools. | VERIFIED | `buildRuntimeToolInputContract({ toolNames: ["log_event"] })` includes `"log_event" input`, omits `offer_quick_actions`, and states examples are nested-only. |
| 5 | Caller-specific top-level minimal outputs are valid. | VERIFIED | Runtime helper no longer emits shared `{ "actions": [] }`; `ScenePlanner minimal valid output` and `Hidden adjudication minimal valid output` live in caller contracts. |
| 6 | Hidden adjudication prompts ask for exact actions[] tool-call shape before validation. | VERIFIED | `buildHiddenAdjudicationPromptContract()` includes `{ rationale, actions[] }`, nested runtime tool input contract, and invalid examples. |
| 7 | Backend validation remains final authority for runtime tools and scene plans. | VERIFIED | Contract text preserves backend ownership of IDs, refs, caps, execution, and final validation. |
| 8 | World-brain, oracle, target, and movement calls receive explicit contracts. | VERIFIED | Engine markers and tests cover `world-brain.v1`, `oracle.v1`, `target-context.v1`, and `movement-detection.v1`. |
| 9 | Gameplay classifier prompts distinguish model proposal from backend authority. | VERIFIED | Engine contract text says backend owns rolls, movement execution, target resolution, and state mutation. |
| 10 | Regression tests cover high-risk P0 gameplay prompt contracts. | VERIFIED | ScenePlanner, hidden adjudication, world-brain, oracle, target-context, and movement tests are present and passed in targeted/full evidence. |
| 11 | Worldgen research generatedContext/canonicalNames shapes are explicit. | VERIFIED | `worldgen/prompt-contracts.ts` exposes generated-context and research-artifact markers; audit and tests cover string-vs-object failures. |
| 12 | Research artifact repair preserves source-rule authority. | VERIFIED | Worldgen contracts forbid backend source-role/canon inference and require source rules as data. |
| 13 | Character, NPC, power, and ingestion prompts include exact output contracts. | VERIFIED | Character prompt-contract helpers and tests cover character, NPC, power-stats, original assessment, and synthesis markers. |
| 14 | Power prompt helpers preserve validation authority. | VERIFIED | `normalizeLlmPowerStats()` now uses `rankFromUnknown()` and strict schema parse; no production `Number(rank) || 5` remains. |
| 15 | Malformed power-stat rank fixtures fail instead of defaulting. | VERIFIED | Tests reject missing rank, `"unknown"`, `NaN`, and `0`; direct spot-check rejected all four and accepted ranks 1/10. |
| 16 | Worldbook composition and import prompts include exact output contracts. | VERIFIED | Worldbook composition/import markers and tests exist. |
| 17 | Backfill-personality script seam has explicit contract. | VERIFIED | `backfill-personality.v1` marker exists in script and test. |
| 18 | P2 seams are marker-tested or explicitly included. | VERIFIED | Audit includes worldbook, import, backfill, repair policy, and conformance P2 rows. |
| 19 | Core scaffold and regeneration prompts include contract snippets. | VERIFIED | Scaffold core/location/faction/NPC/regeneration markers are listed in audit and present in source/tests. |
| 20 | Contract snippets include required fields, nested shapes, caps, nullability, examples, and invalid examples. | VERIFIED | Audit rows and helper tests cover those elements across Phase 74 scope. |
| 21 | Prompt contracts preserve source-rule authority. | VERIFIED | Worldgen and character contracts explicitly forbid backend canon/source-role invention. |
| 22 | Auxiliary worldgen seams have source-level owners and contracts. | VERIFIED | Seed, lore, starting-location, premise divergence/refinement, and validation rows are owned and marker-tested. |
| 23 | Auxiliary prompts include exact shapes before repair. | VERIFIED | `worldgen/prompt-contracts.ts` defines the markers and call sites import/insert the helpers. |
| 24 | Validation/fix prompts fail closed when required semantics are absent. | VERIFIED | Scaffold validation contract says fail closed and forbids invented locations/factions/NPC facts. |
| 25 | Offscreen NPC structured updates include exact contracts before persistence. | VERIFIED | `offscreenUpdateItemSchema` enforces name/location/summary/progress caps and `parseOffscreenUpdates(..., offscreenKeyNpcs.length)` runs before persistence. |
| 26 | Context compression asks for indexed selections with exact caps and cannot fabricate memory/lore. | VERIFIED | Context-compression contract and tests remain present; selection schema caps and index filtering are covered. |
| 27 | Engine support seams are source-owned and marker-tested. | VERIFIED | `npc-offscreen.v1` and `context-compression.v1` markers are in audit/tests. |
| 28 | Repair policy is documented and reflected in code tests. | VERIFIED | `STRUCTURED_OUTPUT_REPAIR_POLICY` exists and `generate-object-safe.test.ts` passed policy checks. |
| 29 | Repair may coerce shape/types/caps/aliases but must not invent semantics. | VERIFIED | Repair policy forbids semantic invention; power ranks no longer get fabricated; offscreen rejects over-cap/excess data. |
| 30 | Observed provider failure classes are represented by fixtures. | VERIFIED | Conformance tests passed; fixture IDs are wired into conformance cases. |
| 31 | Conformance separates primary prompt-contract success from fallback/repair success. | VERIFIED | `structured-output-conformance.ts` includes `fallbackOrRepairUsed`, `primaryPromptContractSuccess`, `primaryFailureReason`, and `fixtureIds`; tests passed. |
| 32 | Representative conformance cases consume Plan 74-10 fixtures. | VERIFIED | `structured-output-conformance.test.ts` passed and checks fixture IDs. |
| 33 | Active role provider/model primary success is release-gated or recorded as release-blocking. | VERIFIED | `74-VERIFICATION-MATRIX.md` has `status: release-blocking-live-gate`, `release_ready: false`, and records OpenCode Judge/Generator failures plus the 2026-04-30 live rerun timeout. |
| 34 | Final closeout proves requirements and audit items are covered or honestly release-blocked. | VERIFIED | Matrix cites 74-12, 74-13, 74-14, and 74-15 evidence; `.planning/REQUIREMENTS.md` marks P74-R1..R6 Complete without claiming provider readiness. |

**Score:** 34/34 truths verified

### Closed Verifier Findings

| Prior Finding | Status | Evidence |
|---|---|---|
| Runtime tool examples showed `offer_quick_actions` when only `log_event` was allowed. | CLOSED | `scene-planner.test.ts:232-243`; direct spot-check output `{"hasLog":true,"hasOffer":false,"hasNested":true,"hasInvalidSharedMinimal":false}`. |
| Missing/invalid power-stat ranks defaulted to 5. | CLOSED | `known-ip-worldgen-research.ts:108-123,185-212`; tests reject missing, unknown, NaN, and zero ranks. |
| NPC offscreen caps were prompt-only and not backend-enforced. | CLOSED | `npc-offscreen.ts:119-150,519`; tests reject overlong fields and excess update batches before persistence. |
| Matrix/requirements overstated coverage before gap fixes. | CLOSED | Matrix now cites 74-12/13/14 fixes and keeps provider gate release-blocking; requirements table lists P74-R1..R6 Complete. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `74-STRUCTURED-PROMPT-AUDIT.md` | Locked structured-output inventory | VERIFIED | Substantive P0/P1/P2 inventory with owner/test/authority fields. |
| `backend/src/ai/__tests__/structured-prompt-contract-audit.test.ts` | Static audit guard | VERIFIED | Targeted test passed. |
| `backend/src/engine/prompt-contracts.ts` | Engine prompt contract helpers | VERIFIED | Runtime examples selected from allowed tools; caller minimal outputs valid. |
| `backend/src/character/known-ip-worldgen-research.ts` | Strict power-stat normalization | VERIFIED | Rank parser accepts finite integers 1..10 only; schema parse rejects invalid required ranks. |
| `backend/src/engine/npc-offscreen.ts` | Offscreen prompt/schema persistence boundary | VERIFIED | Zod field caps and listed-NPC update cap enforced before DB/vector writes. |
| `backend/src/ai/generate-object-safe.ts` | Repair policy boundary | VERIFIED | Repair prompt includes no-semantic-invention policy. |
| `backend/src/ai/structured-output-conformance.ts` | Primary/fallback conformance reporting | VERIFIED | Result fields distinguish primary success from fallback/repair. |
| `74-VERIFICATION-MATRIX.md` | Final coverage matrix | VERIFIED | Accurate local coverage plus release-blocking live provider failure/timeout status. |
| `.planning/REQUIREMENTS.md` | P74 requirement traceability | VERIFIED | P74-R1..R6 all complete; no P74-R6 Planned row remains. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `scene-planner.ts` / hidden adjudication | `buildRuntimeToolInputContract` | engine prompt contract helper | VERIFIED | Key-link verifier passed for 74-02/74-12; tests inspect generated prompt text. |
| `known-ip-worldgen-research.ts` | `powerStatsLlmSchema.parse()` | strict normalization then Zod parse | VERIFIED | Invalid ranks stay `undefined` and strict parse rejects them. |
| `npc-offscreen.ts` | persistence path | `parseOffscreenUpdates(object.updates, offscreenKeyNpcs.length)` before apply | VERIFIED | Excess update test asserts `storeEpisodicEvent` not called. |
| `74-VERIFICATION-MATRIX.md` | closure summaries | cites 74-12, 74-13, 74-14 evidence | VERIFIED | Matrix rows 35-38 mark prior verifier findings closed locally. |
| `.planning/REQUIREMENTS.md` | P74-R1..R6 table | traceability table | VERIFIED | Rows for P74-R1..R6 all read `Complete`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `prompt-contracts.ts` | selected runtime tool examples | `selectedToolNames` -> curated per-tool example inputs | Yes | FLOWING - examples are generated only for selected tools. |
| `known-ip-worldgen-research.ts` | PowerStats ranks | raw LLM object -> `rankFromUnknown()` -> `powerStatsLlmSchema.parse()` | Yes | FLOWING - invalid/missing required semantics fail rather than becoming rank 5. |
| `npc-offscreen.ts` | offscreen updates | LLM object -> capped schema parse -> max listed-NPC parse -> apply | Yes | FLOWING - invalid caps/count reject before persistence. |
| `structured-output-conformance.ts` | conformance result fields | safeGenerateObject trace/result -> report fields | Yes | FLOWING - primary success, fallback/repair, fixture IDs, and failure reason are emitted. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| `log_event`-only runtime contract omits quick-action examples and invalid shared minimal output. | `npx tsx -e ...buildRuntimeToolInputContract({ toolNames:["log_event"] })...` | `hasLog=true`, `hasOffer=false`, `hasNested=true`, `hasInvalidSharedMinimal=false` | PASS |
| Missing/invalid power ranks reject; valid rank bounds parse. | `npx tsx -e ...normalizeLlmPowerStats...` | `rejected=[true,true,true,true]`, valid ranks 1 and 10 accepted | PASS |
| Offscreen caps and update count reject before persistence path. | `npx tsx -e ...parseOffscreenUpdates...` | all cap/count checks returned true | PASS |
| Focused closure tests. | `npm --prefix backend run test -- src/engine/__tests__/scene-planner.test.ts src/character/__tests__/known-ip-worldgen-research.test.ts src/engine/__tests__/npc-offscreen.test.ts` | 3 files / 57 tests passed | PASS |
| Audit/conformance/repair policy tests. | `npm --prefix backend run test -- src/ai/__tests__/structured-prompt-contract-audit.test.ts src/ai/__tests__/structured-output-conformance.test.ts src/ai/__tests__/generate-object-safe.test.ts` | 3 files / 40 tests passed | PASS |
| Backend typecheck. | `npm --prefix backend run typecheck` | `tsc --noEmit` passed | PASS |
| Local conformance without live env. | `npm --prefix backend run structured-output:conformance` | skipped safely with providers 0 / cases 0 | PASS |
| Schema drift. | `node .../gsd-tools.cjs verify schema-drift 74` | `drift_detected=false`, `blocking=false` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| P74-R1 | 74-01 | Prompt-contract audit records each production structured/model-output seam, prompt builder, schema/tool contract, known failure class, and owner. | SATISFIED | Audit file plus static audit test. |
| P74-R2 | 74-02..74-09, 74-12, 74-14 | Every JSON/tool-shaped prompt includes explicit fields, nested shapes, enums/tools, caps, nullability, and examples. | SATISFIED | Contract markers across engine/worldgen/character/worldbook; selected-tool and offscreen cap gaps closed. |
| P74-R3 | 74-01..74-15 | Helpers/builders prevent schema drift and tests fail when high-risk callers omit markers. | SATISFIED | Static audit and helper tests passed; matrix cites closure evidence. |
| P74-R4 | 74-02..74-14 | Regression coverage spans observed malformed-output classes. | SATISFIED | Tests cover string/object mismatches, nested tool fields, overlong fields, invented tools, payload/input, quick actions, invalid ranks, and offscreen caps/counts. |
| P74-R5 | 74-02..74-14 | Repair/sanitization remains deterministic and must not invent semantic lore/actions/targets/power facts/source roles/canonical truth. | SATISFIED | Repair policy wired; rank default removed; offscreen invalid data rejected before persistence. |
| P74-R6 | 74-11, 74-15 | Conformance distinguishes primary prompt-contract success from fallback/repair and reports active role failures before stability claims. | SATISFIED | Conformance result fields exist; matrix records active OpenCode failures and the 2026-04-30 live rerun timeout as release-blocking with `release_ready: false`. |

No orphaned Phase 74 requirements found. `.planning/REQUIREMENTS.md` maps P74-R1..P74-R6 to Phase 74 and marks all Complete.

### Closeout Metadata

| Item | Status | Evidence |
|---|---|---|
| Roadmap phase status | VERIFIED | `ROADMAP.md` records 15/15 Phase 74 plans complete and 74-15 checked. |
| State handoff | VERIFIED | `STATE.md` records Phase 74 complete and Phase 999.4 not started. |

Stub scan on changed Phase 74 code found only legitimate helper empty returns/defaults (`return []`, `return {}`, nullable helper return) and test fixtures; no goal-blocking placeholders or hollow data paths.

### Human Verification Required

None for this phase gate. Live provider integration is already represented by automated conformance evidence and recorded as release-blocking, including the 2026-04-30 rerun timeout, not silently passed. No manual visual or gameplay flow is required to decide Phase 74 local contract hardening.

### Closure Summary

No blocking local findings remain. Prior verifier findings are closed. Phase 74 is locally verified and passed, with one explicit residual release note: active OpenCode role models are not release-ready for all P0/P1 prompt-contract cases, and the latest live rerun timed out before producing a green report. The matrix correctly says so.

---

_Verified: 2026-04-30T09:55:48Z_
_Verifier: Claude (gsd-verifier)_

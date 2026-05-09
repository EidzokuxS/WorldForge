---
phase: 74
plan: 11
status: release-blocking-live-gate
created: 2026-04-28
requirements:
  - P74-R1
  - P74-R2
  - P74-R3
  - P74-R4
  - P74-R5
  - P74-R6
release_ready: false
---

# Phase 74 Verification Matrix

Phase 74 has deterministic local verification for the checked P74 requirements after gap plans 74-12, 74-13, and 74-14 closed the verifier's local code gaps. This matrix separates local deterministic evidence from the active role provider gate. The active role provider gate has not produced current all-green evidence: the earlier configured run produced release-blocking failures, and a 2026-04-30 rerun with live mode enabled exceeded a 10-minute orchestrator timeout before producing a report. The phase must not be marked ship-ready without explicit user approval.

## Requirement Coverage

| Requirement | Evidence | Status |
|---|---|---|
| P74-R1 | `74-STRUCTURED-PROMPT-AUDIT.md`; `backend/src/ai/__tests__/structured-prompt-contract-audit.test.ts`; Plan 74-01 summary | Covered by static audit and inventory tests |
| P74-R2 | Prompt contract helpers and tests from Plans 74-02 through 74-09, plus 74-12 selected-tool-specific runtime examples and 74-14 prompt-aligned NPC offscreen caps | Evidence-backed local coverage; live provider primary success is not claimed |
| P74-R3 | Backend authority/no-invention contract text, marker/helper tests, repair policy, 74-13 strict power-rank parsing, and 74-14 deterministic offscreen validation | Evidence-backed local coverage |
| P74-R4 | Valid/minimal/invalid examples and malformed-output coverage from Plans 74-02 through 74-11, plus 74-12 `log_event`-only, 74-13 invalid rank, and 74-14 overlong/excess offscreen regressions | Evidence-backed local coverage |
| P74-R5 | `74-REPAIR-POLICY.md`; sanitized malformed fixtures; `generate-object-safe` repair tests; 74-13 no rank invention; 74-14 pre-persistence offscreen rejection | Evidence-backed local coverage |
| P74-R6 | `backend/src/ai/structured-output-conformance.ts`; conformance tests; live active-role conformance run; 74-15 requirements traceability reconciliation | Complete for reporting requirement; live primary-success gate remains release-blocking |

## Gap-Closure Evidence After Initial Verification

| Gap | Plan | Evidence | Local Status |
|---|---:|---|---|
| Runtime tool examples must match `selectedToolNames`; `log_event`-only contracts must not show `offer_quick_actions` examples. | 74-12 | Commits `e18c343` and `14c1ae1`; `backend/src/engine/prompt-contracts.ts`; `backend/src/engine/__tests__/scene-planner.test.ts`; `npm --prefix backend run test -- src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/hidden-adjudication.test.ts` passed per `74-12-SUMMARY.md`. | Closed locally |
| Required power-stat ranks must reject missing, non-numeric, `NaN`, and zero values instead of defaulting to rank 5. | 74-13 | Commits `88ed155` and `858cf5b`; `backend/src/character/known-ip-worldgen-research.ts`; `backend/src/character/__tests__/known-ip-worldgen-research.test.ts`; `npm --prefix backend run test -- src/character/__tests__/known-ip-worldgen-research.test.ts src/character/ingestion/__tests__/assess-original.test.ts` passed per `74-13-SUMMARY.md`. | Closed locally |
| NPC offscreen updates must enforce prompt-advertised string caps and reject more updates than listed NPCs before persistence. | 74-14 | Commits `4d3ba61` and `b808226`; `backend/src/engine/npc-offscreen.ts`; `backend/src/engine/__tests__/npc-offscreen.test.ts`; `npm --prefix backend run test -- src/engine/__tests__/npc-offscreen.test.ts` passed per `74-14-SUMMARY.md`. | Closed locally |
| Final closeout docs must not claim local coverage from 74-01 through 74-11 alone. | 74-15 | This matrix now cites 74-12, 74-13, and 74-14 before marking P74-R2 through P74-R5 locally covered; `.planning/REQUIREMENTS.md` reconciles P74-R6 traceability to `Complete`. | Closed by docs reconciliation |

## Command Evidence

| Gate | Command | Result |
|---|---|---|
| Base broad targeted regression before gap review | `npm --prefix backend run test -- src/ai/__tests__/structured-prompt-contract-audit.test.ts src/ai/__tests__/structured-output-boundary.test.ts src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/hidden-adjudication.test.ts src/engine/__tests__/world-brain.test.ts src/engine/__tests__/oracle.test.ts src/engine/__tests__/target-context.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/npc-offscreen.test.ts src/engine/__tests__/context-compression.test.ts src/engine/__tests__/prompt-assembler.test.ts src/worldgen/__tests__/ip-researcher.test.ts src/worldgen/__tests__/research-artifact.test.ts src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/npcs-step.test.ts src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/lore-extractor.test.ts src/worldgen/__tests__/starting-location.test.ts src/worldgen/__tests__/premise-divergence.test.ts src/worldgen/__tests__/validation.test.ts src/character/__tests__/generator.test.ts src/character/__tests__/npc-generator.test.ts src/character/__tests__/known-ip-worldgen-research.test.ts src/character/ingestion/__tests__/assess-original.test.ts src/character/ingestion/__tests__/synthesizer.test.ts src/worldgen/__tests__/worldbook-composition.test.ts src/worldgen/__tests__/worldbook-importer.test.ts src/scripts/__tests__/backfill-personality.test.ts src/ai/__tests__/generate-object-safe.test.ts src/ai/__tests__/structured-output-conformance.test.ts` | Passed during Plan 74-11: 30 files, 432 tests, 13 todo; later verifier gaps are superseded by 74-12 through 74-14 evidence above |
| Runtime tool example gap regression | `npm --prefix backend run test -- src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/hidden-adjudication.test.ts` | Passed per `74-12-SUMMARY.md`: 2 files, 39 tests |
| Strict power-rank parsing gap regression | `npm --prefix backend run test -- src/character/__tests__/known-ip-worldgen-research.test.ts src/character/ingestion/__tests__/assess-original.test.ts` | Passed per `74-13-SUMMARY.md`: 2 files, 19 tests |
| NPC offscreen cap gap regression | `npm --prefix backend run test -- src/engine/__tests__/npc-offscreen.test.ts` | Passed per `74-14-SUMMARY.md`: 14 tests |
| Gap plan backend typecheck | `npm --prefix backend run typecheck` | Passed per `74-12-SUMMARY.md`, `74-13-SUMMARY.md`, and `74-14-SUMMARY.md` |
| Base typecheck before gap review | `npm --prefix backend run typecheck` | Passed during Plan 74-11; later gap-plan typechecks are recorded above |
| Local conformance, no live env | `npm --prefix backend run structured-output:conformance` | Passed safely with `skipped: true`, no providers, no results |
| Live active-role conformance, prior run | `$env:WORLDFORGE_LIVE_PROVIDER_CONFORMANCE='1'; npm --prefix backend run structured-output:conformance` | Failed with exit code 1 after running configured active Judge and Generator role models; release-blocking |
| Live active-role conformance, 2026-04-30 rerun | `$env:WORLDFORGE_LIVE_PROVIDER_CONFORMANCE='1'; npm --prefix backend run structured-output:conformance` | Timed out after 604s without a report; lingering `structured-output-conformance` child processes were stopped. Release-blocking latency evidence, not an unsupported-model claim |
| 74-15 GitNexus staged scope check | `gitnexus_detect_changes({ repo: "WorldForge", scope: "staged" })` | PASS: 3 changed files, 0 changed symbols, 0 affected processes, low risk |

The plan's verification command listed repo-root `backend/src/...` paths under `npm --prefix backend`. The executed command uses package-relative `src/...` paths so Vitest resolves files from `backend/`. This is a verification-path adjustment only; the test set is the same.

## Live Active Role Gate

| Role | Provider | Model | Evidence |
|---|---|---|---|
| Judge | OpenCode | `kimi-k2.6` | Earlier live conformance executed. Some cases passed with `primaryPromptContractSuccess: true`, while generated-context required repair, semantic scene planning failed schema/semantic validation, power stats timed out, and script personality needed fallback. The 2026-04-30 rerun did not complete within 10 minutes. |
| Generator | OpenCode | `deepseek-v4-flash` | Earlier live conformance executed. Some cases passed with `primaryPromptContractSuccess: true`, while generated-context and power stats required repair, semantic scene planning/runtime quick actions/script personality/external metadata had final failures, and context compression used fallback. The 2026-04-30 rerun did not complete within 10 minutes. |

The live report included `fixtureIds`, `fallbackOrRepairUsed`, `primaryPromptContractSuccess`, and `primaryFailureReason`. No API keys, raw prompts, raw provider envelopes, campaign data, or settings secrets were written to this artifact.

**Release-blocking exception:** Active role model behavior does not yet provide primary-success evidence for all P0/P1 prompt-contract cases, and the latest rerun did not complete within the orchestrator timeout. Phase 74 is locally verified but not release-ready.

## Fixture Provenance

| Fixture ID | Source | Conformance Coverage |
|---|---|---|
| `kimi-citations-string` | Plan 74-10 sanitized malformed-output fixture | `generated_context_citations_canonicalNames` |
| `mimo-canonical-names-string` | Plan 74-10 sanitized malformed-output fixture | `generated_context_citations_canonicalNames` |
| `deepseek-scene-plan-missing-action` | Plan 74-10 sanitized malformed-output fixture | `runtime_tool_input_quick_actions` |
| `deepseek-payload-vs-input` | Plan 74-10 sanitized malformed-output fixture | `semantic_scene_plan_actions` |
| `glm-overlong-rationale` | Plan 74-10 sanitized malformed-output fixture | `oracle_overlong_rationale` |
| `unsupported-tool-name` | Plan 74-10 sanitized malformed-output fixture | `semantic_scene_plan_actions` |
| `lazy-power-stats` | Plan 74-10 sanitized malformed-output fixture | `power_stats_axes` |

## Audit Row Coverage

| Priority | Source | Plan | Evidence | Status |
|---|---|---:|---|---|
| P0 | `backend/src/engine/scene-planner.ts` | 74-02, 74-12 | `scene-planner.test.ts`; selected-tool-specific runtime examples; conformance `semantic_scene_plan_actions` and `runtime_tool_input_quick_actions` | Covered locally; live gate not fully green |
| P0 | `backend/src/engine/hidden-adjudication.ts` | 74-02, 74-12 | `hidden-adjudication.test.ts`; runtime tool contract selection bundle; conformance `semantic_scene_plan_actions` | Covered locally; live gate not fully green |
| P0 | `backend/src/engine/world-brain.ts` | 74-03 | `world-brain.test.ts`; audit prompt-contract tests | Covered |
| P0 | `backend/src/engine/oracle.ts` | 74-03 | `oracle.test.ts`; conformance `oracle_overlong_rationale` | Covered |
| P0 | `backend/src/engine/target-context.ts` | 74-03 | `target-context.test.ts`; audit prompt-contract tests | Covered |
| P0 | `backend/src/engine/turn-processor.ts` | 74-03 | `turn-processor.test.ts`; movement contract tests | Covered |
| P0 | `backend/src/worldgen/ip-researcher.ts` | 74-04 | `ip-researcher.test.ts`; conformance `generated_context_citations_canonicalNames` | Covered; live gate required repair |
| P0 | `backend/src/worldgen/research-artifact.ts` | 74-04 | `research-artifact.test.ts`; generated-context contract tests | Covered |
| P1 | `backend/src/worldgen/scaffold-steps/prompt-utils.ts` | 74-07 | `scaffold-resilience.test.ts`; scaffold core marker tests | Covered |
| P1 | `backend/src/worldgen/scaffold-steps/locations-step.ts` | 74-07 | `scaffold-resilience.test.ts`; location contract tests | Covered |
| P1 | `backend/src/worldgen/scaffold-steps/factions-step.ts` | 74-07 | `scaffold-resilience.test.ts`; faction contract tests | Covered |
| P1 | `backend/src/worldgen/scaffold-steps/npcs-step.ts` | 74-07 | `npcs-step.test.ts`; scaffold NPC contract tests | Covered |
| P1 | `backend/src/worldgen/scaffold-steps/regen-helpers.ts` | 74-07 | `scaffold-resilience.test.ts`; regeneration contract tests | Covered |
| P1 | `backend/src/worldgen/seed-suggester.ts` | 74-08 | `seed-suggester.test.ts`; seed contract tests | Covered |
| P1 | `backend/src/worldgen/lore-extractor.ts` | 74-08 | `lore-extractor.test.ts`; lore contract tests | Covered |
| P1 | `backend/src/worldgen/starting-location.ts` | 74-08 | `starting-location.test.ts`; nullable location contract tests | Covered |
| P1 | `backend/src/worldgen/premise-divergence.ts` | 74-08 | `premise-divergence.test.ts`; premise interpretation contract tests | Covered |
| P1 | `backend/src/worldgen/scaffold-steps/premise-step.ts` | 74-08 | `premise-divergence.test.ts`; `validation.test.ts`; premise fallback contract tests | Covered |
| P1 | `backend/src/worldgen/scaffold-steps/validation.ts` | 74-08 | `validation.test.ts`; scaffold validation/fix contract tests | Covered |
| P1 | `backend/src/character/generator.ts` | 74-05 | `generator.test.ts`; character prompt contract tests | Covered |
| P1 | `backend/src/character/npc-generator.ts` | 74-05 | `npc-generator.test.ts`; NPC prompt contract tests | Covered |
| P1 | `backend/src/character/known-ip-worldgen-research.ts` | 74-05, 74-13 | `known-ip-worldgen-research.test.ts`; strict missing/non-numeric/NaN/zero rank regressions; conformance `power_stats_axes` | Covered locally; live gate not fully green |
| P1 | `backend/src/character/ingestion/assess-original.ts` | 74-05 | `assess-original.test.ts`; original power assessment contract tests | Covered |
| P1 | `backend/src/character/ingestion/synthesizer.ts` | 74-05 | `synthesizer.test.ts`; character synthesis contract tests | Covered |
| P1 | `backend/src/engine/npc-offscreen.ts` | 74-09, 74-14 | `npc-offscreen.test.ts`; overlong field and listed-NPC update-cap regressions; conformance `npc_offscreen_updates` | Covered locally |
| P1 | `backend/src/engine/prompt-assembler.ts` | 74-09 | `context-compression.test.ts`, `prompt-assembler.test.ts`; conformance `context_compression_indices` | Covered; one live role used fallback |
| P2 | `backend/src/worldbook-library/composition.ts` | 74-06 | `worldbook-composition.test.ts`; conformance `worldbook_source_filter_selection` | Covered |
| P2 | `backend/src/worldgen/worldbook-importer.ts` | 74-06 | `worldbook-importer.test.ts`; worldbook import contract tests | Covered |
| P2 | `backend/src/scripts/backfill-personality.ts` | 74-06 | `backfill-personality.test.ts`; conformance `script_personality_output_shape` | Covered; live gate not fully green |
| P2 | `backend/src/ai/generate-object-safe.ts` | 74-10 | `generate-object-safe.test.ts`; `74-REPAIR-POLICY.md`; fixture corpus | Covered |
| P2 | `backend/src/ai/structured-output-conformance.ts` | 74-11 | `structured-output-conformance.test.ts`; live conformance report | Covered; release-blocking active-role failures recorded |

## Script Seam Handling

`backend/src/scripts/backfill-personality.ts` remains included, not excluded. It has marker-tested contract coverage in Plan 74-06, targeted regression coverage in `src/scripts/__tests__/backfill-personality.test.ts`, and representative conformance coverage through `script_personality_output_shape`.

## Repair Policy Status

`74-REPAIR-POLICY.md` is the authoritative repair boundary for Phase 74. Local tests cover allowed structural repair and fail-closed behavior. Conformance reports now distinguish final success from `primaryPromptContractSuccess`, so repair/fallback success cannot be misreported as prompt stability.

## Residual Risks

- Active OpenCode role models are not release-ready for all P0/P1 prompt-contract cases because some cases required repair/fallback, failed final schema/semantic validation, or did not finish inside a 10-minute rerun timeout.
- Live conformance is slow and provider-dependent; it should remain env-gated, should gain stricter per-case time bounds, and must be treated as release evidence, not a normal unit-test dependency.
- The local conformance skip path is safe for CI without credentials but does not prove provider behavior.
- The initial `74-VERIFICATION.md` remains an historical gap report; this matrix plus `74-12-SUMMARY.md`, `74-13-SUMMARY.md`, and `74-14-SUMMARY.md` supersede its local code-gap statuses.

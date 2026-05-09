---
phase: 74
slug: structured-prompt-contracts-and-model-facing-schema-hardenin
status: release-blocking-live-gate
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-28
---

# Phase 74 - Validation Strategy

> Per-phase validation contract for structured prompt-contract hardening.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `backend/vitest.config.ts` |
| **Quick run command** | `npm --prefix backend run test -- src/ai/__tests__/structured-output-boundary.test.ts src/ai/__tests__/structured-output-conformance.test.ts` |
| **Full suite command** | `npm --prefix backend run test && npm --prefix backend run typecheck` |
| **Estimated runtime** | ~120 seconds targeted, ~300+ seconds full suite |

---

## Sampling Rate

- **After every task commit:** Run the touched domain tests plus `npm --prefix backend run typecheck`.
- **After every plan wave:** Run `npm --prefix backend run test && npm --prefix backend run typecheck`.
- **Before `$gsd-verify-work`:** Full backend suite, backend typecheck, local structured-output conformance, and active role provider/model gate must be green or recorded as a release-blocking exception.
- **Max feedback latency:** 300 seconds for automated local gates.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 74-01-01 | 01 | 1 | P74-R1 | T74-01 / T74-02 | Every production structured-output seam is audited source-by-source with prompt builder, schema/tool contract, priority, owner, failure class, marker, and semantic adequacy test owner. | static unit | `npm --prefix backend run test -- src/ai/__tests__/structured-output-boundary.test.ts backend/src/ai/__tests__/structured-prompt-contract-audit.test.ts` | yes | green |
| 74-02-01 | 02 | 2 | P74-R2, P74-R3, P74-R4, P74-R5 | T74-01 / T74-03 | ScenePlanner/hidden adjudication expose nested shape/tool contracts, valid/minimal/invalid examples, and no backend-owned IDs. | unit | `npm --prefix backend run test -- src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/hidden-adjudication.test.ts` | yes | green |
| 74-03-01 | 03 | 3 | P74-R2, P74-R3, P74-R4, P74-R5 | T74-01 / T74-03 | World-brain, oracle, target, and movement prompts expose exact P0 gameplay classifier contracts, caps, nullability, and invalid examples while preserving backend authority. | unit | `npm --prefix backend run test -- backend/src/engine/__tests__/world-brain.test.ts backend/src/engine/__tests__/oracle.test.ts backend/src/engine/__tests__/target-context.test.ts backend/src/engine/__tests__/turn-processor.test.ts` | yes | green |
| 74-04-01 | 04 | 2 | P74-R2, P74-R3, P74-R4, P74-R5 | T74-01 / T74-04 | Worldgen research/generatedContext prompts expose citations/canonicalNames/source-rule shapes and preserve backend semantic boundary. | unit | `npm --prefix backend run test -- backend/src/worldgen/__tests__/ip-researcher.test.ts backend/src/worldgen/__tests__/research-artifact.test.ts` | yes | green |
| 74-05-01 | 05 | 2 | P74-R2, P74-R3, P74-R4, P74-R5 | T74-01 / T74-05 | Character, NPC, power-stat, and ingestion prompts expose output shapes and repair policy without inventing facts. | unit | `npm --prefix backend run test -- backend/src/character/__tests__/generator.test.ts backend/src/character/__tests__/npc-generator.test.ts backend/src/character/__tests__/known-ip-worldgen-research.test.ts backend/src/character/ingestion/__tests__/assess-original.test.ts backend/src/character/ingestion/__tests__/synthesizer.test.ts` | yes | green |
| 74-06-01 | 06 | 2 | P74-R2, P74-R3, P74-R4, P74-R5 | T74-01 / T74-07 | Worldbook composition/import and `backfill-personality.ts` script seams expose exact versioned marker-tested contracts; the script seam is included, not excluded. | unit | `npm --prefix backend run test -- backend/src/worldgen/__tests__/worldbook-composition.test.ts backend/src/worldgen/__tests__/worldbook-importer.test.ts backend/src/scripts/__tests__/backfill-personality.test.ts` | yes | green |
| 74-07-01 | 07 | 3 | P74-R2, P74-R3, P74-R4, P74-R5 | T74-01 / T74-04 | Core scaffold locations/factions/NPCs/regeneration expose exact prompt contracts and source-rule boundaries. | unit | `npm --prefix backend run test -- backend/src/worldgen/__tests__/scaffold-resilience.test.ts backend/src/worldgen/__tests__/npcs-step.test.ts` | yes | green |
| 74-08-01 | 08 | 3 | P74-R2, P74-R3, P74-R4, P74-R5 | T74-01 / T74-04 | Seed, lore, starting-location, premise, and scaffold-validation seams have source-level contracts and fail-closed repair boundaries. | unit | `npm --prefix backend run test -- backend/src/worldgen/__tests__/seed-suggester.test.ts backend/src/worldgen/__tests__/lore-extractor.test.ts backend/src/worldgen/__tests__/starting-location.test.ts backend/src/worldgen/__tests__/premise-divergence.test.ts backend/src/worldgen/__tests__/validation.test.ts backend/src/worldgen/__tests__/pipeline-rework.test.ts` | yes | green |
| 74-09-01 | 09 | 4 | P74-R2, P74-R3, P74-R4, P74-R5 | T74-01 / T74-03 | `npc-offscreen.ts` and `prompt-assembler.compressContext` expose exact contracts, valid/minimal/invalid examples, and no-invention rules. | unit | `npm --prefix backend run test -- backend/src/engine/__tests__/npc-offscreen.test.ts backend/src/engine/__tests__/context-compression.test.ts backend/src/engine/__tests__/prompt-assembler.test.ts` | yes | green |
| 74-10-01 | 10 | 4 | P74-R4, P74-R5 | T74-01 / T74-05 | Repair policy is documented/tested and required malformed provider fixtures are log-derived with provenance. | unit + static | `npm --prefix backend run test -- backend/src/ai/__tests__/generate-object-safe.test.ts backend/src/character/__tests__/known-ip-worldgen-research.test.ts` | yes | green |
| 74-11-01 | 11 | 5 | P74-R6 | T74-02 / T74-06 | Conformance reports primary prompt-contract success separately from fallback/repair success, consumes real fixtures, and active role models are gated. | unit + integration + live gate | `npm --prefix backend run test -- backend/src/ai/__tests__/structured-output-conformance.test.ts && npm --prefix backend run typecheck && npm --prefix backend run structured-output:conformance` | yes | red (live gate release-blocking) |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [x] Create or update a Phase 74 audit artifact/test that maps P0/P1 structured-output seams to prompt-contract owners.
- [x] Add prompt-contract marker conventions before gating P0/P1 prompts.
- [x] Decide export-for-test strategy for private prompt builders such as `buildGeneratedContextPrompt`.
- [x] Define conformance fields for primary prompt-contract success.
- [x] Confirm script seam handling: `backend/src/scripts/backfill-personality.ts` is included in Plan 74-06 and final matrix must not leave it implicit.
- [x] Create repair policy artifact and fixture provenance manifest before conformance cases consume real failure fixtures.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Active role provider conformance | P74-R6 | Requires configured provider credentials and can be slow. | Run live conformance with `WORLDFORGE_LIVE_PROVIDER_CONFORMANCE=1` when active Judge/Generator providers are configured. P0/P1 cases require `primaryPromptContractSuccess: true`; unavailable evidence is a release-blocking exception, not a pass. |

---

## Plan 74-11 Execution Evidence

| Gate | Result |
|------|--------|
| Broad targeted regression | Passed on 2026-04-28: 30 test files, 432 passing tests, 13 todo. |
| Typecheck | Passed on 2026-04-28 with `npm --prefix backend run typecheck`. |
| Local conformance | Passed safely with `skipped: true` when live env was not enabled. |
| Active role conformance | Ran against configured OpenCode Judge `kimi-k2.6` and Generator `deepseek-v4-flash`; failed with exit code 1 and is recorded as release-blocking in `74-VERIFICATION-MATRIX.md`. |

---

## Threat Model Summary

| Threat ID | Category | Component | Mitigation |
|-----------|----------|-----------|------------|
| T74-01 | Tampering | User premise/search snippets/model output | Treat user/search/model text as data, expose explicit output contract, and keep Zod plus semantic validators final. |
| T74-02 | Repudiation | Conformance result reporting | Report primary success separately from fallback/repair so repaired output cannot be misrepresented as prompt stability. |
| T74-03 | Elevation of Privilege | Runtime tool actions | Prompt only allowed tools and nested inputs; backend validates tool names and input schemas before execution. |
| T74-04 | Tampering | Worldgen source/canon authority | Backend must not invent or reinterpret source roles/canonical truth to satisfy schema. |
| T74-05 | Tampering | Character/power generation | Repair may restructure fields but must not invent power feats, tiers, or canonical facts. |
| T74-06 | Information Disclosure | Logs/conformance reports | Preserve Phase 73 no-secret/no-raw-prompt logging discipline. |
| T74-07 | Tampering | Worldbook/import/script seams | Worldbook and backfill script contracts must preserve provided entries/records as authority and avoid backend semantic invention. |
| T74-08 | Tampering | Fixture corpus | Sanitized malformed fixtures must include provenance and no secrets/raw prompts. |
| T74-09 | Repudiation | Live provider gate | Active-role primary success must be pass or release-blocking exception, not silent skip. |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency target set.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** draft 2026-04-28

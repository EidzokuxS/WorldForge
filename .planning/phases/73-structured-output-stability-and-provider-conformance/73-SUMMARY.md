---
phase: 73
title: Structured Output Stability and Provider Conformance
status: complete
completed_at: 2026-04-27T22:08:00Z
requirements:
  - P73-R1
  - P73-R2
  - P73-R3
  - P73-R4
  - P73-R5
  - P73-R6
  - P73-R7
---

# Phase 73 Summary: Structured Output Stability and Provider Conformance

Phase 73 moved WorldForge object generation onto explicit structured-output contracts where provider capability allows it, while keeping deterministic backend Zod parsing and sanitization as final authority.

Keyword proof: native_schema|text_fallback|repair|semantic ScenePlan|WORLDFORGE_LIVE_PROVIDER_CONFORMANCE|Deferred Ideas Not Implemented

## Plans Completed

| Plan | Result |
|------|--------|
| 73-01 | Audited generation boundaries and established provider/model capability classification. |
| 73-02 | Implemented native-first `safeGenerateObject` strategy selection with explicit `text_fallback`, `repair`, and full retry traces. |
| 73-03 | Reworked the semantic ScenePlan contract so backend-owned executable IDs are derived and validated deterministically. |
| 73-04 | Added the non-mutating structured-output conformance harness and env-gated live provider script. |
| 73-05 | Locked worldgen regressions for overlong metadata, malformed generated context citations/canonicalNames, and artifact-backed Gojo known-IP dispatch. |

## Requirement Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| P73-R1 | Complete | `73-STRUCTURED-OUTPUT-INVENTORY.md` includes the shared boundaries and the conformance harness; boundary tests passed. |
| P73-R2 | Complete | `safeGenerateObject` tests verify native schema/native JSON/tool routing with explicit `text_fallback`. |
| P73-R3 | Complete | Strategy traces distinguish `native_schema`, `text_fallback`, `repair`, and retry outcomes. |
| P73-R4 | Complete | Engine ScenePlan tests cover semantic ScenePlan payload validation and backend ID derivation. |
| P73-R5 | Complete | `structured-output:conformance` is available and env-gated for live providers. |
| P73-R6 | Complete | Worldgen regressions prove Zod/sanitization authority over metadata caps and malformed generated context. |
| P73-R7 | Complete | Regression suite covers Kimi/Mimo citations/canonicalNames, ScenePlan missing-tool/payload issues, overlong metadata, and artifact-backed Gojo dispatch. |

## Strategy Labels

Phase 73 now treats provider strategy labels as observable behavior, not prose. Tests and conformance output use the same language: `native_schema`, `text_fallback`, `repair`, and full retry outcomes are surfaced in traces so failures can be diagnosed without guessing which path ran.

## ScenePlan Contract

The semantic ScenePlan contract keeps model output focused on intent-level actions. Backend code derives executable tool targets and IDs, then validates them through deterministic schemas before any mutation path can run.

## Provider Conformance Harness

The harness is non-mutating by default. Live provider checks are gated behind `WORLDFORGE_LIVE_PROVIDER_CONFORMANCE=1`, so normal local and CI runs prove the harness wiring without requiring credentials or spending provider calls.

## Worldgen Regression Proof

Plan 73-05 added regressions for observed worldgen failures:

- Overlong external metadata is capped before strict artifact parsing.
- Generated context `citations` and `canonicalNames` must remain schema-safe arrays.
- Artifact-backed Satoru Gojo remains on known-IP power dispatch instead of falling back to original-character assessment.

## Verification Commands

- `npm --prefix backend run test -- src/ai/__tests__/structured-output-boundary.test.ts src/ai/__tests__/structured-output-capabilities.test.ts src/ai/__tests__/generate-object-safe.test.ts src/ai/__tests__/structured-output-conformance.test.ts`
- `npm --prefix backend run test -- src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts`
- `npm --prefix backend run test -- src/worldgen/__tests__/research-artifact.test.ts src/worldgen/__tests__/ip-researcher.test.ts src/worldgen/__tests__/npcs-step.test.ts`
- `npm --prefix backend run structured-output:conformance`
- `npm --prefix backend run test`
- `npm --prefix backend run typecheck`
- `npx gitnexus status`
- `gitnexus_detect_changes({scope:"all"})`

All required verification commands passed. Details are in `73-VERIFICATION-MATRIX.md`.

## GitNexus Scope Proof

GitNexus status was up-to-date at `ea1fb77` before final docs commit. `gitnexus_detect_changes({scope:"all"})` reported low risk, one changed file, zero changed symbols, and zero affected execution flows for the final closeout docs change.

## Deferred Ideas Not Implemented

- Live provider conformance was not forced on in closeout because it requires credentials and explicit `WORLDFORGE_LIVE_PROVIDER_CONFORMANCE=1`.
- No new provider adapter behavior was added beyond the Phase 73 conformance surface.
- No worldgen production logic changed in 73-05; the observed failures are locked as regressions over the already-implemented deterministic authority paths.


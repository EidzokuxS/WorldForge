---
phase: 73
slug: structured-output-stability-and-provider-conformance
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-27
---

# Phase 73 - Validation Strategy

> Per-phase validation contract for structured-output stability and provider conformance.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `backend/vitest.config.ts` |
| **Quick run command** | `npm --prefix backend run test -- src/ai/__tests__/generate-object-safe.test.ts src/engine/__tests__/scene-planner.test.ts` |
| **Full suite command** | `npm --prefix backend run test && npm --prefix backend run typecheck` |
| **Estimated runtime** | Targeted: <90s; full backend gate: several minutes |

---

## Sampling Rate

- **After every task commit:** Run the targeted command for the touched boundary plus `npm --prefix backend run typecheck` for TypeScript contract changes.
- **After every plan wave:** Run `npm --prefix backend run test && npm --prefix backend run typecheck`.
- **Before `$gsd-verify-work`:** Full backend test suite, backend typecheck, and GitNexus change detection must be green.
- **Max feedback latency:** No implementation task may go more than one commit without automated verification.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 73-01-01 | 01 | 1 | P73-R1 | T73-DoS-01 | Object-generation seams are classified before refactor scope expands. | static/unit | `npm --prefix backend run test -- src/ai/__tests__/structured-output-boundary.test.ts` | yes | pending |
| 73-02-01 | 02 | 1 | P73-R2, P73-R3 | T73-DoS-01 / T73-Info-01 | `safeGenerateObject` logs native/text/repair strategy without exposing secrets. | unit | `npm --prefix backend run test -- src/ai/__tests__/generate-object-safe.test.ts` | yes | pending |
| 73-03-01 | 03 | 2 | P73-R4, P73-R6 | T73-Tamper-01 | Semantic ScenePlan maps to strict backend-owned IDs/actions before execution. | unit/integration | `npm --prefix backend run test -- src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts` | yes | pending |
| 73-04-01 | 04 | 2 | P73-R5, P73-R7 | T73-DoS-01 | Conformance harness reports provider/model/schema/mode without mutating campaign state. | unit | `npm --prefix backend run test -- src/ai/__tests__/structured-output-conformance.test.ts` | no - Wave 0 | pending |
| 73-05-01 | 05 | 3 | P73-R6, P73-R7 | T73-Tamper-02 | Worldgen artifact caps and Gojo known-IP dispatch remain deterministic after boundary refactors. | regression | `npm --prefix backend run test -- src/worldgen/__tests__/research-artifact.test.ts src/worldgen/__tests__/ip-researcher.test.ts src/worldgen/__tests__/npcs-step.test.ts` | yes | pending |

*Status values: pending, green, red, flaky.*

---

## Wave 0 Requirements

- [ ] `backend/src/ai/__tests__/structured-output-conformance.test.ts` - mocked conformance report tests for P73-R3 and P73-R5.
- [ ] `backend/src/ai/structured-output-conformance.ts` or equivalent - non-mutating representative conformance cases and report shape.
- [ ] `backend/src/ai/structured-output-capabilities.ts` or equivalent - provider/model/transport strategy and fallback decisions.
- [ ] `backend/src/engine/semantic-scene-plan-schema.ts` or equivalent - model-facing semantic ScenePlan contract if the planner chooses a separate module.
- [ ] Native-path mocks for AI SDK `generateText` returning `output` and throwing `NoObjectGeneratedError`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Optional live provider conformance across GPT/GLM/Gemini/DeepSeek/Kimi/Mimo-like providers | P73-R5 | Credentials and gateway availability are environment-dependent. | Run the conformance harness only when provider settings are configured; record provider/model/schema/mode pass/fail report without mutating campaigns. |

---

## Validation Sign-Off

- [x] All tasks must have automated verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive implementation tasks without automated verify.
- [x] Wave 0 covers missing conformance harness and capability strategy tests.
- [x] No watch-mode flags.
- [x] Feedback latency bounded by per-task targeted verification.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-04-27

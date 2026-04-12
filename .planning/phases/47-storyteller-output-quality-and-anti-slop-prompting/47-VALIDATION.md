---
phase: 47
slug: storyteller-output-quality-and-anti-slop-prompting
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-12
---

# Phase 47 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Backend config** | `vitest.config.ts` |
| **Quick run command** | `npm --prefix backend exec vitest run src/engine/__tests__/storyteller-contract.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts src/ai/__tests__/provider-registry.test.ts` |
| **Estimated runtime** | ~35 seconds |

---

## Smoke Suites

| Suite | Purpose | Automated Command | Estimated Runtime |
|-------|---------|-------------------|-------------------|
| `phase-47-contract-smoke` | preset extraction, baseline plus GLM overlay assembly, and visible-pass contract rules | `npm --prefix backend exec vitest run src/engine/__tests__/storyteller-contract.test.ts src/engine/__tests__/storyteller-presets.test.ts src/ai/__tests__/provider-registry.test.ts` | ~14s |
| `phase-47-runtime-smoke` | prompt assembly, scene-mode wording, duplicate/slop suppression, and final-visible narration guard behavior | `npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts` | ~20s |
| `phase-47-full-smoke` | backend storyteller quality contract together | `npm --prefix backend exec vitest run src/engine/__tests__/storyteller-contract.test.ts src/engine/__tests__/storyteller-presets.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts src/ai/__tests__/provider-registry.test.ts src/routes/__tests__/chat.test.ts` | ~35s |

---

## Sampling Rate

- **After every task commit:** run the suite mapped below
- **After every wave:** run `phase-47-full-smoke`
- **Phase gate:** all mapped suites green before `$gsd-execute-phase 47` can claim pass
- **Max feedback latency:** 40 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 47-01-01 | 01 | 1 | WRIT-01 | regression | `npm --prefix backend exec vitest run src/engine/__tests__/storyteller-presets.test.ts src/engine/__tests__/storyteller-contract.test.ts src/ai/__tests__/provider-registry.test.ts` | ❌ / W0 | ⬜ pending |
| 47-01-02 | 01 | 1 | WRIT-01 | regression | `npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts` | ✅ | ⬜ pending |
| 47-02-01 | 02 | 2 | WRIT-01 | integration | `npm --prefix backend exec vitest run src/engine/__tests__/storyteller-contract.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts` | ✅ | ⬜ pending |
| 47-02-02 | 02 | 2 | WRIT-01 | integration | `npm --prefix backend exec vitest run src/ai/__tests__/provider-registry.test.ts src/routes/__tests__/chat.test.ts` | ✅ | ⬜ pending |
| 47-03-01 | 03 | 3 | WRIT-01 | regression | `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts` | ✅ | ⬜ pending |
| 47-03-02 | 03 | 3 | WRIT-01 | manual-backed smoke | `npm --prefix backend exec vitest run src/engine/__tests__/storyteller-contract.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts src/ai/__tests__/provider-registry.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 is intentionally completed inside `47-01-01` and `47-01-02`; `wave_0_complete: false` reflects the current pre-execution state, not a missing planning artifact.

- [ ] Add `backend/src/engine/__tests__/storyteller-presets.test.ts` for baseline vs GLM overlay extraction and motif portability.
- [ ] Extend `backend/src/engine/__tests__/storyteller-contract.test.ts` for adaptive scene-mode language, anti-slop guardrails, and no-omniscience wording.
- [ ] Extend `backend/src/engine/__tests__/prompt-assembler.test.ts` so hidden and final-visible passes both receive the new preset layer without prompt bloat regressions.
- [ ] Extend `backend/src/engine/__tests__/turn-processor.test.ts` for bounded duplicate/slop suppression and any optional one-shot lint/retry seam.
- [ ] Extend `backend/src/ai/__tests__/provider-registry.test.ts` if the GLM overlay or storyteller profile changes model-settings behavior.
- [ ] Extend `backend/src/routes/__tests__/chat.test.ts` if the final visible narration path gains bounded retry or profile-aware settings plumbing.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Combat prose reads tighter and more physical, not melodramatic | WRIT-01 | Requires human judgment on scene feel and pacing | Run a combat-heavy turn on the live storyteller model and confirm the result advances action cleanly without inflated emotional restatement. |
| Quiet or dialogue-heavy scenes stay alive without collapsing into assistant prose | WRIT-01 | Hard to score from assertions alone | Run a low-action interaction scene and confirm the voice stays conversational, scene-bound, and specific instead of generic narrative filler. |
| Narration does not leak user-side action, omniscience, or repeated lead paragraphs | WRIT-01 | Best caught with live reading | Trigger scenes with hidden actors or uncertain information and confirm the output respects perception limits and does not restart the same beat twice. |
| GLM-focused preset tuning feels like a quality gain, not just a different flavor of slop | WRIT-01 | Product-quality judgment | Compare before/after live outputs across at least dialogue, combat, and eerie scene framing using the configured GLM storyteller path. |

---

## Validation Sign-Off

- [x] Every plan task includes an automated verify command
- [x] Backend smoke suites cover contract and runtime seams
- [x] Sampling continuity stays under 40 seconds
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

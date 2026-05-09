---
phase: 72-worldgen-authority-propagation-regression-audit
created: 2026-04-26
source: codex-session
---

# Phase 72 Context: Worldgen Authority Propagation Regression Audit

## User Problem

Phase 71 moved worldgen known-IP premise interpretation into an LLM-authored `WorldgenResearchArtifactV2` and kept backend responsibilities mechanical: validate shape, store raw/artifact data, execute searches, cap fields, and forward artifact context.

Two post-closeout failures showed that this boundary can still break in downstream or adjacent code:

1. External/search artifact parsing crashed world generation when `searchResults[].description` exceeded the Zod cap. The backend should sanitize mechanically bounded external payloads before strict parsing instead of letting a provider-length detail abort a long generation.
2. Artifact-backed canonical NPCs could be treated as `canonicalStatus: original`. The observed failure was `Satoru Gojo` receiving original-character power stats like `Wall` rank 5 because a downstream classifier only looked at legacy `ipContext` and did not consume the artifact authority/canonical names.

The user does not want one-off fixes only at the observed crash points. Phase 72 exists to find and test the same class of authority propagation gap across the worldgen pipeline.

## Product Rule

- LLM/research artifact owns semantic interpretation: source roles, world basis, power-system overlay, canonical names, and whether a known character belongs to a canon/source.
- Backend owns deterministic mechanics only: schema shape, field caps, source result truncation, persistence, ID linking, routing, testable lane selection, and numeric/system calculations that do not require semantic interpretation.
- Backend must not infer that "Naruto" or "Jujutsu Kaisen" is primary/secondary/canon from raw words. It may only preserve and forward what the LLM-authored artifact already decided.

## Audit Target

Follow `WorldgenResearchArtifactV2` and related authority signals through all generation stages:

- automatic research artifact creation and parsing
- search result ingestion and sanitization
- suggest seed and generate/regenerate route handoff
- scaffold orchestration
- seed, premise, location, faction, NPC, lore, sufficiency, and validation prompts
- known-IP NPC classification/enrichment and power-stat assessment
- saved world review/draft payloads and campaign persistence
- tests that should fail if any artifact-backed path falls back to legacy `ipContext` or original-character assumptions

## Known Evidence From Phase 71 And Follow-up Fixes

- Phase 71 produced `WorldgenResearchArtifactV2`, parser/formatter, route handoff, persistence, prompt rewiring, and no-artifact compatibility lanes.
- `parseWorldgenResearchArtifact` needs deterministic external payload sanitization for bounded fields such as `searchResults[].description`.
- `generateNpcsStep` must route artifact-backed names that match `generatedContext.canonicalNames.characters` through known-IP enrichment even when legacy `ipContext` is null.
- Existing tests include targeted coverage in `backend/src/worldgen/__tests__/npcs-step.test.ts`, `backend/src/worldgen/__tests__/research-artifact.test.ts`, `backend/src/worldgen/__tests__/ip-researcher.test.ts`, and `backend/src/routes/__tests__/worldgen.test.ts`, but Phase 72 should check whether there are more consumers with the same blind spot.

## Planning Requirement

Produce a phase plan that is regression-audit first, not broad rewrite first:

- Map every artifact authority consumer and downstream branch that can affect canon/source role, power scale, persistence, generated review payloads, or long-running worldgen failure behavior.
- Add focused tests for each discovered propagation invariant.
- Only change production code where a failing or missing invariant proves an actual gap.
- Keep legacy no-artifact compatibility explicit and test-covered.
- Include a final verification matrix that proves the mixed premise "JJK world with Naruto power system" keeps Gojo/JJK canon identity and Naruto power-system overlay semantics without backend-owned canonicalization.

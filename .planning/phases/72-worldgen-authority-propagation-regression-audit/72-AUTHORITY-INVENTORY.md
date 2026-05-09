---
phase: 72-worldgen-authority-propagation-regression-audit
created: 2026-04-26
plan: 72-01
scope: authority-inventory
---

# Phase 72 Authority Inventory

This inventory is the Phase 72 source-of-truth map for worldgen research artifact authority propagation. It does not satisfy the runtime invariants by itself. It assigns owners, names the exact surfaces, and preserves locked execution decisions so later plans add focused regressions before production edits.

## Source Coverage Audit

| Source item | Authority / invariant | Plan owner | 72-01 role | Notes |
| --- | --- | --- | --- | --- |
| GOAL | Audit the post-Phase 71 worldgen research artifact authority boundary end to end and prevent artifact-backed canon/source-role decisions from falling back to legacy backend interpretation, lenient schema crashes, or original-character power scaling. | 72-01, 72-02, 72-03, 72-04, 72-05 | inventory foundation | 72-01 records scope; later plans prove behavior with focused tests and fixes. |
| CONTEXT locked decision: artifact owns semantics | LLM/research artifact owns source roles, world basis, power-system overlay, canonical names, and known-character membership. | 72-02, 72-03, 72-04 | foundation/traceability | Backend may preserve, validate, cap, store, route, and test lane selection; it must not infer primary/secondary/canon from raw strings. |
| CONTEXT locked decision: backend owns mechanics | Backend owns deterministic mechanics: schema shape, field caps, source-result truncation, persistence, ID linking, routing, testable lane selection, and numeric/system calculations that do not require semantic interpretation. | 72-02, 72-03, 72-05 | foundation/traceability | Production edits must stay mechanical and test-proven. |
| CONTEXT locked decision: regression-audit first | Phase 72 maps and tests propagation before changing production code. | 72-01, 72-02, 72-03, 72-04, 72-05 | inventory foundation | No broad rewrite lane is authorized by this phase. |
| RESEARCH slice 0 | Shared JJK-world/Naruto-power-system fixtures plus authority invariant inventory. | 72-01 | owner | Produces this file plus shared fixture helpers. |
| RESEARCH slice 1 | Provider/schema payload hardening coverage for overlong fields and nullable artifact semantics. | 72-02 | foundation/traceability | INV-72-02 and INV-72-05 focus. |
| RESEARCH slice 2 | Route and frontend artifact handoff. | 72-02, 72-04 | foundation/traceability | Stored artifact should win over accidental client null; frontend preserves explicit artifact. |
| RESEARCH slice 3 | Scaffold prompt lane isolation. | 72-03 | foundation/traceability | Artifact-present prompts must not use legacy semantic authority helpers. |
| RESEARCH slice 4 | NPC canonical identity and power-stat dispatch. | 72-03, 72-04 | foundation/traceability | Gojo/JJK canon path and original supporting NPC path must be distinct. |
| RESEARCH slice 5 | Final verification matrix and change-scope proof. | 72-05 | foundation/traceability | Confirms all aliases and negative scans. |
| P72-R1 / INV-72-01 | When `WorldgenResearchArtifactV2` is present, legacy `ipContext`, `premiseDivergence`, `researchFrame`, `buildKnownIpGenerationContract`, and `buildCanonicalList` do not own semantic prompt decisions. | 72-03, 72-05 | foundation/traceability only | 72-01 records alias and surfaces; later plans satisfy invariant. |
| P72-R2 / INV-72-02 | External search/provider fields are deterministically capped before strict artifact parsing, including sufficiency follow-up search results. | 72-02, 72-05 | foundation/traceability only | 72-01 fixture helpers provide overlong snippet data. |
| P72-R3 / INV-72-03 | JJK world basis plus Naruto mechanics overlay does not import Naruto locations, factions, or cast through backend canonicalization. | 72-03, 72-05 | foundation/traceability only | 72-01 fixture source-role matrix provides reusable evidence data. |
| P72-R4 / INV-72-04 | Artifact canonical character names route matching NPCs to known-IP enrichment and not original-character power stats. | 72-03, 72-05 | foundation/traceability only | 72-01 fixture helper records Gojo and original supporting NPC expectations. |
| P72-R5 / INV-72-05 | Campaign-stored artifacts survive generate/regenerate/save-edits and cannot be silently bypassed by nullable request payloads without an explicit tested rule. | 72-02, 72-05 | foundation/traceability only | `researchArtifact: null` is not a clear-artifact API. |
| P72-R6 / INV-72-06 | Frontend wizard/API transports `_researchArtifact` explicitly through seed suggestion, single-seed reroll, and world generation. | 72-04, 72-05 | foundation/traceability only | Backend on-demand artifact research remains compatibility fallback. |
| P72-R7 / INV-72-07 | Review/draft conversion preserves backend known-IP NPC identity and does not default artifact-backed canonical NPCs to `original`. | 72-04, 72-05 | foundation/traceability only | Frontend fallback defaults are adjacency risks, not proof of failure by themselves. |

## Authority Surface Inventory

| Surface | File / route | Authority risk | Plan owner | Required stance |
| --- | --- | --- | --- | --- |
| `parseWorldgenResearchArtifact` | `backend/src/worldgen/research-artifact.ts` | strict parsing can reject provider-sized fields unless mechanical caps are applied at artifact boundary | 72-02 | Cap untrusted external snippets mechanically; keep semantic artifact fields strict unless tests prove a mechanical cap is needed. |
| `researchWorldgenArtifact` | `backend/src/worldgen/ip-researcher.ts` | automatic research creates source usage rules and generated context | 72-02, 72-05 | Preserve LLM-authored source plan; backend executes searches and validates only. |
| `evaluateResearchArtifactSufficiency` | `backend/src/worldgen/ip-researcher.ts` | follow-up search results merge into artifact and can re-enter strict parser | 72-02 | Prove follow-up provider payloads stay bounded and do not crash long generation. |
| `/api/worldgen/suggest-seeds` | `backend/src/routes/worldgen.ts` | returns `_researchArtifact` from automatic known-IP research | 72-04 | Browser transport must preserve the returned artifact when present. |
| `/api/worldgen/suggest-seed` | `backend/src/routes/worldgen.ts` | single seed reroll accepts artifact and suppresses legacy context when artifact exists | 72-04 | Artifact wins over `ipContext`/`premiseDivergence` for semantic source decisions. |
| `/api/worldgen/generate` | `backend/src/routes/worldgen.ts` | body artifact, stored artifact, legacy context, and on-demand artifact research meet here | 72-02, 72-04 | `researchArtifact: null` is treated as omitted when a stored artifact exists; no clear-artifact API is added. |
| `/api/worldgen/regenerate-section` | `backend/src/routes/worldgen.ts` | regeneration loads stored artifact and evaluates sufficiency before section generation | 72-02, 72-03 | Artifact lane loads before legacy lane; sufficiency additions stay bounded. |
| `/api/worldgen/save-edits` | `backend/src/routes/worldgen.ts` | lore extraction after review save must use stored artifact before legacy context | 72-02, 72-04 | Stored artifact preserves authority through review save-back. |
| `buildWorldgenResearchContextBlock` | `backend/src/worldgen/scaffold-steps/prompt-utils.ts` | prompt helper chooses artifact block or legacy IP block | 72-03 | Artifact context must be emitted before legacy compatibility; legacy canonical wording stays no-artifact only. |
| `generateNpcsStep` | `backend/src/worldgen/scaffold-steps/npcs-step.ts` | NPC planning, detail generation, canonical status, and enrichment all share artifact/legacy decisions | 72-03 | Match artifact canonical names and NPC-allowed source rules before power-stat dispatch. |
| `enrichNpcsBatch` | `backend/src/character/enrich-npc-batch.ts` | per-NPC power-stat enrichment delegates classification to `assessPowerStats` | 72-03 | Assert classification object, not only final stats, so authority dropout fails close to the handoff. |
| `assessPowerStats` | `backend/src/character/ingestion/power-assessor.ts` | known-IP statuses trigger canon research; original/imported statuses use original assessment | 72-03 | Canon branch requires source/franchise authority and research enabled; no silent original fallback for artifact canonical NPCs. |
| `classifyCanonicalStatus` | `backend/src/character/ingestion/classifier.ts` | generic ingestion classifies from legacy `ipContext`, not artifact | 72-04 | Audit as adjacency; fix only if trace evidence proves this is an artifact-backed worldgen path. |
| `suggestSeeds` | `frontend/lib/api.ts` | frontend currently receives world DNA plus backend research context fields | 72-04 | Type and preserve `_researchArtifact` when backend returns it. |
| `suggestSeed` | `frontend/lib/api.ts` | reroll requests can carry or drop artifact source authority | 72-04 | Pass artifact explicitly when available. |
| `generateWorld` | `frontend/lib/api.ts` | generation body can carry artifact, legacy context, or neither | 72-04 | Send artifact explicitly; on-demand backend research is fallback compatibility, not preferred browser boundary. |
| `scaffoldNpcToDraft` | `frontend/lib/character-drafts.ts` | fallback draft creation defaults missing identity to `original` | 72-04 | Preserve backend draft identity; default only when identity is truly absent. |

## Conservative Execution Decisions

1. Frontend preserves and resends `_researchArtifact`.
   - Plan 72-04 owns implementation and tests.
   - Backend on-demand research remains compatibility fallback, not the intended browser boundary.

2. `researchArtifact: null` is not a clear-artifact API.
   - Plan 72-02 owns `/generate` route tests and any required mechanical fix.
   - A nullable request payload must not bypass a stored campaign artifact silently.

3. Generic ingestion is adjacency-audited.
   - Plan 72-04 owns trace proof for `classifyCanonicalStatus` and `ingestCharacterDraft` adjacency.
   - Production changes happen only if tests prove an artifact-backed worldgen path reaches generic ingestion and loses authority there.

4. V2 artifact schema does not grow by default.
   - Plan 72-03 owns Gojo/JJK behavior and name-collision/source-rule tests.
   - Schema expansion is allowed only if deterministic tests prove aggregate `canonicalNames.characters` plus source-rule matching cannot satisfy the behavior.

## GitNexus Gate

Before any later plan edits a production function, class, method, or exported symbol, run:

```text
gitnexus_impact({ target: "<symbol>", direction: "upstream", repo: "WorldForge" })
```

If impact returns HIGH or CRITICAL risk, stop and report the blast radius before editing.

Before any later production/test commit, run:

```text
gitnexus_detect_changes({ scope: "all", repo: "WorldForge" })
```

If MCP `detect_changes` is unavailable, record fallback evidence in the plan summary:

```powershell
npx gitnexus status
git diff --name-only -- <plan-owned-paths>
```

The fallback must be path-limited because this repository can have unrelated dirty tail outside the active plan.

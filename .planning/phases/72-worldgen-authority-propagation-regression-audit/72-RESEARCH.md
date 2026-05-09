# Phase 72: Worldgen Authority Propagation Regression Audit - Research

**Researched:** 2026-04-26 [VERIFIED: system current_date]
**Domain:** Worldgen research artifact authority propagation, Zod payload hardening, and canonical NPC power-stat regression coverage [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md]
**Confidence:** HIGH for backend worldgen route/scaffold/NPC surfaces; MEDIUM for frontend impact until the planner chooses exact browser artifact handoff semantics [VERIFIED: GitNexus WorldForge context 2026-04-26; backend/src/routes/worldgen.ts:256-724; frontend/lib/api.ts:729-950]

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- LLM/research artifact owns semantic interpretation: source roles, world basis, power-system overlay, canonical names, and whether a known character belongs to a canon/source. [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md]
- Backend owns deterministic mechanics only: schema shape, field caps, source result truncation, persistence, ID linking, routing, testable lane selection, and numeric/system calculations that do not require semantic interpretation. [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md]
- Backend must not infer that "Naruto" or "Jujutsu Kaisen" is primary, secondary, or canon from raw words; it may only preserve and forward what the LLM-authored artifact already decided. [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md]
- Phase 72 must be regression-audit first, not broad rewrite first. [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md]
- Add focused tests for discovered propagation invariants, and only change production code where a failing or missing invariant proves an actual gap. [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md]
- Keep legacy no-artifact compatibility explicit and test-covered. [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md]
- Final verification must prove the mixed premise "JJK world with Naruto power system" keeps Gojo/JJK canon identity and Naruto power-system overlay semantics without backend-owned canonicalization. [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md]

### Claude's Discretion

- No formal `## Claude's Discretion` section exists in the Phase 72 context file. [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md]
- Planner discretion should stay inside audit shape, regression test selection, and smallest viable fixes for proven gaps. [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md]

### Deferred Ideas (OUT OF SCOPE)

- No formal `## Deferred Ideas` section exists in the Phase 72 context file. [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md]
- Broad rewrites, backend semantic source inference, and one-off fixes without invariant coverage are out of scope for this phase. [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md]
</user_constraints>

## Executive Summary

Phase 72 should plan a boundary audit around one rule: once `WorldgenResearchArtifactV2` exists, every canon/source-role decision must be artifact-backed until the flow explicitly returns to the no-artifact compatibility lane. [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md; backend/src/routes/worldgen.ts:389-456; backend/src/worldgen/scaffold-steps/prompt-utils.ts:126-139] Phase 71 already built the artifact parser, formatter, route handoff, campaign persistence, prompt rewiring, and no-artifact lane, and follow-up fixes added deterministic search-result truncation and artifact-backed Satoru Gojo NPC enrichment coverage. [VERIFIED: .planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-SUMMARY.md; backend/src/worldgen/research-artifact.ts:18-58; backend/src/worldgen/__tests__/npcs-step.test.ts:677-766]

The highest-value plan is not a rewrite. [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md] It should add focused regression tests at the current authority boundaries: external/provider payload parsing, route request/cache lane selection, scaffold prompt helper selection, NPC canonical classification, power-stat dispatch, generic character ingestion adjacency, campaign persistence, and frontend API/wizard transport. [VERIFIED: backend/src/worldgen/research-artifact.ts:46-58; backend/src/routes/worldgen.ts:256-724; backend/src/worldgen/scaffold-steps/npcs-step.ts:194-253; backend/src/character/ingestion/classifier.ts:19-55; frontend/lib/api.ts:729-950]

Primary recommendation: plan five small slices - inventory/fixtures, schema-provider hardening, route/frontend artifact transport, scaffold/NPC authority invariants, and final negative-scan verification - with production edits allowed only after a failing regression proves an actual dropout. [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md; package backend/frontend scripts verified in package.json]

## Project Constraints (from CLAUDE.md and AGENTS.md)

- The project uses TypeScript strict mode, ES modules, and Zod for AI/API schema validation. [VERIFIED: CLAUDE.md; backend/package.json]
- Backend routes use outer try/catch bodies and `parseBody()`-based validation. [VERIFIED: CLAUDE.md; backend/src/routes/worldgen.ts:256-724]
- Shared types and constants live in `@worldforge/shared`, so artifact shape changes must not be duplicated in backend/frontend local types. [VERIFIED: CLAUDE.md; shared/src/types.ts:145-209]
- GitNexus is current for `WorldForge` at commit `c372635`, and the index reports 2332 symbols, 6538 relationships, and 186 execution flows. [VERIFIED: npx gitnexus status 2026-04-26; GitNexus list_repos 2026-04-26]
- Production symbol edits require GitNexus impact analysis before editing and `gitnexus_detect_changes()` before commit; this research phase edits only this planning document. [VERIFIED: AGENTS.md; CLAUDE.md]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Artifact semantic interpretation | LLM/Generator output | Backend validation | The artifact brief/generated context owns source roles and canonical names; backend schema validates and forwards the result. [VERIFIED: backend/src/worldgen/ip-researcher.ts:478-541; shared/src/types.ts:183-209] |
| External search payload ingestion | Backend | Search provider | Provider strings enter through `runArtifactSearchJobs`; bounded artifact parsing now trims search result fields before strict caps. [VERIFIED: backend/src/worldgen/ip-researcher.ts:422-446; backend/src/worldgen/research-artifact.ts:18-58] |
| Route lane selection | API/backend | Campaign config | `/suggest-seeds`, `/generate`, `/regenerate-section`, and `/save-edits` decide whether artifact, legacy `ipContext`, or on-demand research owns the request. [VERIFIED: backend/src/routes/worldgen.ts:256-724] |
| Scaffold prompt authority | Backend worldgen steps | LLM/Generator | Prompt utilities choose artifact context first and legacy `ipContext` only when no artifact is present. [VERIFIED: backend/src/worldgen/scaffold-steps/prompt-utils.ts:126-139; backend/src/worldgen/scaffold-steps/locations-step.ts:47-79; backend/src/worldgen/scaffold-steps/factions-step.ts:49-81; backend/src/worldgen/scaffold-steps/npcs-step.ts:271-294] |
| NPC canonical status and power stats | Backend worldgen + character ingestion | LLM research for canon power stats | `generateNpcsStep` builds artifact-aware classifications, while generic `classifyCanonicalStatus` remains legacy `ipContext`-only. [VERIFIED: backend/src/worldgen/scaffold-steps/npcs-step.ts:194-253; backend/src/character/ingestion/classifier.ts:19-55; backend/src/character/ingestion/power-assessor.ts:55-90] |
| Browser artifact transport | Frontend client | API/backend fallback | Backend returns `_researchArtifact`, but current frontend API/wizard types store `_ipContext`/`_premiseDivergence` and omit artifact transport into `generateWorld`. [VERIFIED: backend/src/routes/worldgen.ts:306-310; frontend/lib/api.ts:729-766; frontend/lib/api.ts:934-950; frontend/components/title/use-new-campaign-wizard.ts:103-104,405-490] |
| Campaign artifact persistence | Backend campaign config | Filesystem storage | `worldgenResearchArtifact` is parsed when reading config and parsed again before saving. [VERIFIED: backend/src/campaign/manager.ts:34-80; backend/src/campaign/manager.ts:405-429] |

## Authority Propagation Map

| Artifact field/source signal | Producer | Consumers | Current tests | Likely blind spots |
|------------------------------|----------|-----------|---------------|--------------------|
| `researchBrief.sourceUsageRules[].role/useFor/avoidFor/sourceLabel` | `researchWorldgenArtifact` generates a brief through `researchArtifactBriefSchema`; `sourceUsageRuleSchema` caps labels, roles, uses, and rationale. [VERIFIED: backend/src/worldgen/ip-researcher.ts:487-499; backend/src/worldgen/research-artifact.ts:28-36] | `formatWorldgenResearchArtifactBlock`, `buildWorldgenResearchContextBlock`, seed/premise/location/faction/NPC/lore prompts, and NPC source matching consume these fields. [VERIFIED: backend/src/worldgen/research-artifact.ts:201-248; backend/src/worldgen/scaffold-steps/prompt-utils.ts:126-139; backend/src/worldgen/scaffold-steps/npcs-step.ts:131-143; backend/src/worldgen/lore-extractor.ts:147-172] | Artifact formatter and mixed-source fixture tests exist; seed/scaffold/NPC/lore tests use the JJK+Naruto artifact fixture. [VERIFIED: backend/src/worldgen/__tests__/research-artifact.test.ts:104-182; backend/src/worldgen/__tests__/seed-suggester.test.ts:185-209,525; backend/src/worldgen/__tests__/npcs-step.test.ts:551-766] | `WorldgenResearchUse` is a string and NPC identity matching only recognizes `npcs`, `characters`, and `cast`; this makes synonym drift a test target, not a backend inference opportunity. [VERIFIED: shared/src/types.ts:145-168; backend/src/worldgen/scaffold-steps/npcs-step.ts:131-143] |
| `searchResults[].jobId/title/description/url` | `runArtifactSearchJobs` copies provider result strings; `parseWorldgenResearchArtifact` preprocesses provider snippets and caps result count to 48. [VERIFIED: backend/src/worldgen/ip-researcher.ts:422-446; backend/src/worldgen/research-artifact.ts:18-58] | Generated context prompts and artifact sufficiency prompts include these snippets as data. [VERIFIED: backend/src/worldgen/ip-researcher.ts:521-527; backend/src/worldgen/ip-researcher.ts:614-629] | Tests now cover overlong `description` truncation and 48-result capping. [VERIFIED: backend/src/worldgen/__tests__/research-artifact.test.ts:77-100; backend/src/worldgen/__tests__/ip-researcher.test.ts:204-232] | Follow-up sufficiency catches all errors and returns the normalized artifact, so a parser/provider problem in that branch can degrade silently unless tests assert logged/fallback behavior. [VERIFIED: backend/src/worldgen/ip-researcher.ts:580-659] |
| `generatedContext.canonicalNames.characters` | The generated context schema reuses artifact `generatedContext`, whose canonical names allow up to 40 characters. [VERIFIED: backend/src/worldgen/ip-researcher.ts:65-69; backend/src/worldgen/research-artifact.ts:67-89] | `artifactHasCanonicalCharacter`, `artifactNpcFranchiseForName`, `canonicalStatusFromContext`, and `buildWorldgenNpcClassification` route matching names into known-IP NPC classification. [VERIFIED: backend/src/worldgen/scaffold-steps/npcs-step.ts:164-253] | Existing NPC tests prove Satoru Gojo uses known-IP power enrichment even when legacy `ipContext` is null. [VERIFIED: backend/src/worldgen/__tests__/npcs-step.test.ts:677-766] | Canonical character names are aggregate artifact fields, not per-source mappings, so source ownership is inferred from the first NPC-allowed source rule after name match. [VERIFIED: shared/src/types.ts:198-202; backend/src/worldgen/scaffold-steps/npcs-step.ts:185-192] |
| Artifact-vs-legacy lane signal: `researchArtifact` present, `ipContext` null | `/generate` saves request artifact, clears body legacy context when artifact exists, and loads stored artifact only when no request artifact property exists. [VERIFIED: backend/src/routes/worldgen.ts:389-417] | `generateWorldScaffold`, scaffold step requests, `regenerate-section`, and `save-edits` use artifact-first lane selection. [VERIFIED: backend/src/worldgen/scaffold-generator.ts:231-412; backend/src/routes/worldgen.ts:598-724] | Route tests cover artifact request handoff, stored artifact load, regeneration, and saveback. [VERIFIED: backend/src/routes/__tests__/worldgen.test.ts:562-600,695-742,2374-2507] | Explicit `researchArtifact: null` currently suppresses stored artifact loading because `hasBodyResearchArtifact` is true; planner must decide and test whether client null is allowed to override campaign artifact authority. [VERIFIED: backend/src/routes/worldgen.ts:389-400] |
| Prompt helper selection: artifact block vs legacy canonical list/contract | `buildWorldgenResearchContextBlock` returns artifact context if present, otherwise falls back to legacy `buildIpContextBlock`. [VERIFIED: backend/src/worldgen/scaffold-steps/prompt-utils.ts:126-139] | Premise, locations, factions, NPCs, seed suggestions, and lore extraction suppress legacy `buildKnownIpGenerationContract` and `buildCanonicalList` when artifact exists. [VERIFIED: backend/src/worldgen/scaffold-steps/premise-step.ts:52-68; backend/src/worldgen/scaffold-steps/locations-step.ts:47-79; backend/src/worldgen/scaffold-steps/factions-step.ts:49-81; backend/src/worldgen/scaffold-steps/npcs-step.ts:271-294,360-381,675-691; backend/src/worldgen/seed-suggester.ts:93-114; backend/src/worldgen/lore-extractor.ts:147-172] | Scaffold resilience and NPC tests cover artifact prompt inclusion. [VERIFIED: backend/src/worldgen/__tests__/scaffold-resilience.test.ts:223-529; backend/src/worldgen/__tests__/npcs-step.test.ts:551-675] | Direct unit calls can still pass both artifact and stale `ipContext`; tests should lock that artifact presence wins at each prompt surface. [VERIFIED: backend/src/worldgen/types.ts:25; backend/src/worldgen/scaffold-steps/prompt-utils.ts:126-139] |
| NPC `canonicalStatus` and `franchise` for power stats | `buildWorldgenNpcClassification` returns known-IP status and artifact source label for artifact canonical-name matches, or original when artifact lacks a matching NPC source. [VERIFIED: backend/src/worldgen/scaffold-steps/npcs-step.ts:216-253] | `enrichNpcsBatch` delegates each item to `assessPowerStats`; `assessPowerStats` sends known-IP statuses to `enrichKnownIpWorldgenNpcDraft` and originals/imports to original assessment. [VERIFIED: backend/src/character/enrich-npc-batch.ts:40-73; backend/src/character/ingestion/power-assessor.ts:55-90] | Existing power-assessor tests cover known-IP, original, imported, missing-franchise, and research-disabled branches. [VERIFIED: backend/src/character/ingestion/__tests__/power-assessor.test.ts:68-190] | Generic character ingestion still classifies only from campaign `ipContext`; it does not consume `worldgenResearchArtifact`, so post-worldgen character creation/import is an adjacent authority-dropout target. [VERIFIED: backend/src/character/ingestion/classifier.ts:19-55; backend/src/character/ingestion/pipeline.ts:68-95] |
| Frontend review/draft identity payload | Backend scaffold NPC drafts preserve backend-provided `identity.canonicalStatus` when present; fallback draft builders default missing identities to `original`. [VERIFIED: frontend/lib/character-drafts.ts:307-314,431-439,553] | World review components and save-edits submit normalized scaffold data back to `/save-edits`; backend lore extraction reloads stored artifact before extracting lore. [VERIFIED: backend/src/routes/worldgen.ts:692-724; frontend/components/world-review/__tests__/npcs-section.test.ts references canonicalStatus originals in fixtures] | Frontend `character-drafts` tests include draft identity behavior, but most review tests use original NPC fixtures. [VERIFIED: frontend/lib/__tests__/character-drafts.test.ts; frontend/components/world-review/__tests__/npcs-section.test.ts] | If backend omits NPC drafts or frontend creates fallback drafts, known-IP identity can be represented as `original`; planner should add one artifact-backed known-IP review payload regression if this UI surface is in Phase 72 scope. [VERIFIED: frontend/lib/character-drafts.ts:431-439; backend/src/worldgen/scaffold-steps/npcs-step.ts:808-877] |
| Browser seed suggestion artifact transport | `/suggest-seeds` returns `_researchArtifact`; frontend `suggestSeeds` type omits it, wizard stores only `_ipContext`/`_premiseDivergence`, and `generateWorld` sends only legacy fields. [VERIFIED: backend/src/routes/worldgen.ts:306-310; frontend/lib/api.ts:729-766; frontend/lib/api.ts:934-950; frontend/components/title/use-new-campaign-wizard.ts:103-104,405-490] | Backend `/generate` compensates by running on-demand v2 artifact research when no artifact or legacy `ipContext` is cached. [VERIFIED: backend/src/routes/worldgen.ts:437-456] | Backend route tests cover on-demand v2 research behavior; frontend tests do not cover `_researchArtifact` transport. [VERIFIED: backend/src/routes/__tests__/worldgen.test.ts; frontend/components/title/__tests__/use-new-campaign-wizard.test.tsx] | Exact artifact from suggestion can be lost before generation, causing duplicate research and making browser path dependent on backend fallback; planner should decide whether Phase 72 fixes transport or explicitly tests fallback as accepted behavior. [VERIFIED: frontend/lib/api.ts:729-950; backend/src/routes/worldgen.ts:437-456] |

## Failure Modes

### 1. Schema cap and provider payload failures

External provider payloads can exceed strict Zod caps, and the artifact search-result path now has deterministic snippet truncation before `.max()` validation. [VERIFIED: backend/src/worldgen/research-artifact.ts:18-58; backend/src/worldgen/__tests__/research-artifact.test.ts:77-100] Planner should still inventory all external/LLM/provider parsers that can abort long generation: artifact brief, generated context, sufficiency evaluation, sufficiency fact extraction, route artifact payloads, scaffold step schemas, lore extraction schemas, and character ingestion schemas. [VERIFIED: backend/src/worldgen/ip-researcher.ts:487-527,580-655; backend/src/routes/schemas.ts:305-332; backend/src/worldgen/scaffold-steps/premise-step.ts:52-121; backend/src/character/ingestion/power-assessor.ts:55-90]

Deterministic sanitization belongs at provider ingress and artifact boundary, not inside downstream semantic consumers. [VERIFIED: backend/src/worldgen/ip-researcher.ts:422-446; backend/src/worldgen/research-artifact.ts:185-186] For LLM object outputs, the safer planning stance is to test bounded schemas and explicit fallback behavior rather than silently relaxing caps globally. [ASSUMED]

### 2. Artifact-to-legacy-lane dropouts

The main route lane is artifact-first, but exact behavior changes across `suggest-seeds`, `suggest-seed`, `generate`, `regenerate-section`, and `save-edits`. [VERIFIED: backend/src/routes/worldgen.ts:256-724] The most suspicious current dropout is explicit `researchArtifact: null` in `/generate`: it prevents stored artifact loading and can push the request toward legacy/on-demand behavior. [VERIFIED: backend/src/routes/worldgen.ts:389-400]

The frontend currently does not retain `_researchArtifact` from `/suggest-seeds` or pass it into `/suggest-seed`/`/generate`. [VERIFIED: frontend/lib/api.ts:729-766,934-950; frontend/components/title/use-new-campaign-wizard.ts:405-490] Backend on-demand research is the current compensating path, but it is not the same as preserving the exact artifact already used to suggest seeds. [VERIFIED: backend/src/routes/worldgen.ts:437-456]

### 3. Original-character fallback for canonical NPCs and power stats

Worldgen NPC classification is now artifact-aware for canonical character matches. [VERIFIED: backend/src/worldgen/scaffold-steps/npcs-step.ts:194-253] The regression class remains risky because `canonicalStatusFromContext` intentionally returns `original` for artifact NPCs that do not match artifact canonical names, and `assessPowerStats` sends originals to original-character power scaling. [VERIFIED: backend/src/worldgen/scaffold-steps/npcs-step.ts:199-207; backend/src/character/ingestion/power-assessor.ts:83-90]

Generic character ingestion remains legacy `ipContext`-only for canonical classification. [VERIFIED: backend/src/character/ingestion/classifier.ts:19-55; backend/src/character/ingestion/pipeline.ts:68-95] If Phase 72 scope includes post-worldgen character creation/import in artifact-backed campaigns, planner should add a failing regression before changing this path. [VERIFIED: user code_surfaces_to_investigate included classifier.ts, pipeline.ts, power-assessor.ts]

### 4. Frontend, review payload, and persistence loss

Backend campaign config can store and reload `worldgenResearchArtifact`, and route regeneration/save-edits load the stored artifact before legacy context. [VERIFIED: backend/src/campaign/manager.ts:34-80,405-429; backend/src/routes/worldgen.ts:598-724] The browser wizard omits artifact state and API typing, so the request/review path can depend on backend cache or on-demand research rather than explicit frontend propagation. [VERIFIED: frontend/lib/api.ts:729-950; frontend/components/title/use-new-campaign-wizard.ts:103-104,405-490]

Frontend draft fallback builders default missing NPC identities to `canonicalStatus: "original"`. [VERIFIED: frontend/lib/character-drafts.ts:307-314,431-439,553] This is acceptable for true missing identity, but it becomes a regression if an artifact-backed canonical NPC loses backend draft identity before review/save. [VERIFIED: backend/src/worldgen/scaffold-steps/npcs-step.ts:808-877; frontend/lib/character-drafts.ts:431-439]

## Recommended Plan Slices

### Slice 0: Audit fixtures and invariant inventory

Create or extend one shared JJK-world/Naruto-power-system artifact fixture with: long search snippets, source-role rules for world basis and mechanics overlay, canonical `Satoru Gojo`, at least one original/supporting NPC, and one prompt-injection-like search snippet. [VERIFIED: backend/src/worldgen/__tests__/fixtures/jjk-naruto-artifact.ts exists; backend/src/worldgen/research-artifact.ts:18-58] Do not edit production code in this slice; only add failing/pending tests or inventory notes. [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md]

### Slice 1: Provider/schema payload hardening coverage

Add focused tests that overlong provider fields cannot crash artifact creation, sufficiency follow-up, route payload parsing, or campaign config loading. [VERIFIED: backend/src/worldgen/ip-researcher.ts:422-446,580-659; backend/src/routes/schemas.ts:305-332; backend/src/campaign/manager.ts:54-80] Production changes should be limited to deterministic trim/slice/cap at parser or provider-ingress boundaries if a test exposes another strict-cap crash. [VERIFIED: backend/src/worldgen/research-artifact.ts:18-58]

### Slice 2: Route and frontend artifact handoff

Lock the intended behavior for `_researchArtifact` across `/suggest-seeds`, `/suggest-seed`, `/generate`, campaign config, and browser wizard state. [VERIFIED: backend/src/routes/worldgen.ts:256-456; frontend/lib/api.ts:729-950; frontend/components/title/use-new-campaign-wizard.ts:405-490] Recommended default: stored campaign artifact should win over accidental client `null`, and frontend should either preserve artifact explicitly or have tests documenting backend on-demand fallback as the accepted boundary. [ASSUMED]

### Slice 3: Scaffold prompt lane isolation

Add regression tests that artifact-present requests never include legacy known-IP contract text or legacy canonical lists in seed, premise, location, faction, NPC, and lore prompts. [VERIFIED: backend/src/worldgen/scaffold-steps/prompt-utils.ts:126-226; backend/src/worldgen/seed-suggester.ts:93-114; backend/src/worldgen/lore-extractor.ts:147-172] Use negative scans for old Naruto/JJK canonicalization fragments outside tests and fixtures. [VERIFIED: rg scan 2026-04-26 found no listed legacy prompt fragments in backend/src/worldgen or backend/src/routes outside tests/fixtures]

### Slice 4: NPC canonical identity and power-stat dispatch

Keep the current `generateNpcsStep -> enrichNpcsBatch -> assessPowerStats` path under artifact-backed regression tests, including Gojo as known-IP and a non-canonical supporting NPC as original. [VERIFIED: backend/src/worldgen/scaffold-steps/npcs-step.ts:790-877; backend/src/character/enrich-npc-batch.ts:40-73; backend/src/character/ingestion/power-assessor.ts:55-90] Add separate tests for generic `classifyCanonicalStatus`/`ingestCharacterDraft` only if the planner confirms Phase 72 owns character creation/import after artifact-backed worldgen. [VERIFIED: backend/src/character/ingestion/classifier.ts:19-55; backend/src/character/ingestion/pipeline.ts:68-95]

### Slice 5: Final verification matrix and change-scope check

End the phase with a matrix that proves: artifact source roles drive prompts, long provider strings are capped, stored artifacts survive route transitions, Gojo receives canon power scaling, Naruto source material is used only as mechanics overlay, and no-artifact legacy compatibility still passes. [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md; backend/src/worldgen/__tests__/npcs-step.test.ts:551-766; backend/src/routes/__tests__/worldgen.test.ts:2374-2507] Run `gitnexus_detect_changes({scope: "all"})` before any commit if production/test symbols were edited. [VERIFIED: AGENTS.md]

## Validation Architecture

### Invariants Phase 72 Must Verify

| ID | Invariant | Primary test target |
|----|-----------|---------------------|
| INV-72-01 | Artifact present means legacy `ipContext`, `premiseDivergence`, `researchFrame`, `buildKnownIpGenerationContract`, and `buildCanonicalList` do not own semantic prompt decisions. [VERIFIED: backend/src/routes/worldgen.ts:403-417; backend/src/worldgen/scaffold-steps/prompt-utils.ts:126-226] | `backend/src/worldgen/__tests__/seed-suggester.test.ts`, `scaffold-resilience.test.ts`, `npcs-step.test.ts`, `lore-extractor.test.ts` |
| INV-72-02 | External search/provider fields are deterministically capped before strict artifact parsing, including sufficiency follow-up search results. [VERIFIED: backend/src/worldgen/research-artifact.ts:18-58; backend/src/worldgen/ip-researcher.ts:608-655] | `backend/src/worldgen/__tests__/research-artifact.test.ts`, `ip-researcher.test.ts`, `backend/src/routes/__tests__/schemas.test.ts` |
| INV-72-03 | JJK world basis plus Naruto mechanics overlay does not import Naruto locations/factions/cast through backend canonicalization. [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md; backend/src/worldgen/scaffold-steps/locations-step.ts:47-79; backend/src/worldgen/scaffold-steps/factions-step.ts:49-81] | `backend/src/worldgen/__tests__/scaffold-resilience.test.ts`, `locations/factions step tests if added` |
| INV-72-04 | Artifact canonical character names route matching NPCs to known-IP enrichment and not original-character power stats. [VERIFIED: backend/src/worldgen/scaffold-steps/npcs-step.ts:164-253; backend/src/character/ingestion/power-assessor.ts:55-90] | `backend/src/worldgen/__tests__/npcs-step.test.ts`, `backend/src/character/__tests__/enrich-npc-batch.test.ts`, `power-assessor.test.ts` |
| INV-72-05 | Campaign-stored artifacts survive generate/regenerate/save-edits and cannot be silently bypassed by nullable request payloads without an explicit tested rule. [VERIFIED: backend/src/routes/worldgen.ts:389-456,598-724; backend/src/campaign/manager.ts:405-429] | `backend/src/routes/__tests__/worldgen.test.ts`, `backend/src/campaign/__tests__/manager.test.ts` |
| INV-72-06 | Frontend wizard/API transports `_researchArtifact` explicitly through seed suggestion, single-seed reroll, and world generation. Backend on-demand artifact research remains compatibility fallback, not the preferred browser boundary. [VERIFIED: backend/src/routes/worldgen.ts:306-310,437-456; frontend/lib/api.ts:729-950; frontend/components/title/use-new-campaign-wizard.ts:405-490] | `frontend/components/title/__tests__/use-new-campaign-wizard.test.tsx`, `frontend/lib/api.ts` tests if present/added |
| INV-72-07 | Review/draft conversion preserves backend known-IP NPC identity and does not default artifact-backed canonical NPCs to `original`. [VERIFIED: frontend/lib/character-drafts.ts:307-314,431-439,553; backend/src/worldgen/scaffold-steps/npcs-step.ts:808-877] | `frontend/lib/__tests__/character-drafts.test.ts`, `frontend/components/world-review/__tests__/npcs-section.test.tsx` |

### Focused Test Commands

Backend test script is `vitest run`. [VERIFIED: backend/package.json] Frontend test script is `vitest`, so focused CI-style frontend commands should include `--run`. [VERIFIED: frontend/package.json]

```bash
npm --prefix backend run test -- src/worldgen/__tests__/research-artifact.test.ts src/worldgen/__tests__/ip-researcher.test.ts
npm --prefix backend run test -- src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/npcs-step.test.ts src/worldgen/__tests__/lore-extractor.test.ts
npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts src/routes/__tests__/schemas.test.ts
npm --prefix backend run test -- src/campaign/__tests__/manager.test.ts
npm --prefix backend run test -- src/character/ingestion/__tests__/classifier.test.ts src/character/ingestion/__tests__/pipeline.test.ts src/character/ingestion/__tests__/power-assessor.test.ts src/character/__tests__/enrich-npc-batch.test.ts src/character/__tests__/known-ip-worldgen-research.test.ts
npm --prefix frontend run test -- --run components/title/__tests__/use-new-campaign-wizard.test.tsx lib/__tests__/character-drafts.test.ts components/world-review/__tests__/npcs-section.test.tsx
npm --prefix backend run typecheck
npm --prefix frontend run typecheck
```

### Negative Scans and Fixtures

Use these scans as gate checks after implementation, not as a replacement for tests. [VERIFIED: rg available in session; package scripts verified]

```bash
rg -n "Canonical subject|FRANCHISE REFERENCE|Build the canonical world|This world is the Naruto universe|Five Great Nations|Hidden Mist Village|Hidden Cloud Village|Mizukage|Raikage|Hashirama|Tobirama" backend/src/worldgen backend/src/routes --glob '!**/__tests__/**' --glob '!**/test-fixtures/**'
rg -n '_researchArtifact|worldgenResearchArtifact|canonicalStatus: "original"|classifyCanonicalStatus\(' backend/src frontend shared/src
rg -n "researchArtifact" frontend backend/src/routes backend/src/worldgen backend/src/character -g "*.ts" -g "*.tsx"
```

Recommended fixtures: JJK+Naruto artifact, overlong search-result artifact, prompt-injection artifact, explicit `researchArtifact: null` request, stored artifact plus legacy `ipContext` campaign config, Gojo canonical NPC plus original supporting NPC. [VERIFIED: backend/src/worldgen/__tests__/fixtures/jjk-naruto-artifact.ts; backend/src/worldgen/research-artifact.ts:46-58; backend/src/routes/worldgen.ts:389-400; backend/src/worldgen/__tests__/npcs-step.test.ts:677-766]

## Security / Data Integrity Notes

Treat request-body artifacts, campaign-stored artifacts, and external search results as untrusted data. [VERIFIED: backend/src/routes/schemas.ts:305-332; backend/src/campaign/manager.ts:54-80; backend/src/worldgen/ip-researcher.ts:422-446] Artifact fields are inserted into prompts as bounded context, and formatter text already frames the artifact as research context rather than instructions. [VERIFIED: backend/src/worldgen/research-artifact.ts:201-248]

Main threat patterns for this phase are prompt injection through search snippets, denial of service through oversized provider strings/arrays, authority spoofing through client-submitted artifacts, and data-integrity loss when stored campaign artifacts are bypassed by nullable request payloads. [VERIFIED: backend/src/worldgen/research-artifact.ts:18-58; backend/src/routes/schemas.ts:305-332; backend/src/routes/worldgen.ts:389-400]

Standard controls for the plan: parse and cap every artifact at ingress, store only parsed artifacts, preserve artifact-vs-legacy lane selection explicitly, test that client-provided null cannot silently erase campaign artifact authority unless the API intentionally supports that behavior, and keep backend from inferring semantic source authority from raw strings. [VERIFIED: backend/src/worldgen/research-artifact.ts:185-186; backend/src/campaign/manager.ts:405-429; .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md]

Canon power-stat enrichment can trigger external research, so known-IP dispatch must require artifact/legacy authority plus a franchise/source label and must fail visibly when research is disabled rather than falling back to original power scaling. [VERIFIED: backend/src/character/ingestion/power-assessor.ts:55-90; backend/src/character/ingestion/__tests__/power-assessor.test.ts:68-190]

## Open Questions For Planner

1. RESOLVED: frontend preserves and resends `_researchArtifact`; backend on-demand artifact research remains compatibility fallback, not the intended browser boundary. [VERIFIED: backend/src/routes/worldgen.ts:306-310,437-456; frontend/lib/api.ts:729-950; .planning/phases/72-worldgen-authority-propagation-regression-audit/72-04-PLAN.md]
2. RESOLVED: `/generate` treats explicit `researchArtifact: null` as equivalent to an omitted field when a stored artifact exists; Phase 72 does not create an explicit clear-artifact API. [VERIFIED: backend/src/routes/worldgen.ts:389-400; .planning/phases/72-worldgen-authority-propagation-regression-audit/72-02-PLAN.md]
3. RESOLVED: generic character ingestion is adjacency-gated. Phase 72 audits whether it is an artifact-backed worldgen path before changing it; no generic ingestion production change is planned without trace evidence and tests. [VERIFIED: backend/src/character/ingestion/classifier.ts:19-55; backend/src/character/ingestion/pipeline.ts:68-95; .planning/phases/72-worldgen-authority-propagation-regression-audit/72-04-PLAN.md]
4. RESOLVED: artifact v2 does not grow per-character source ownership in Phase 72 unless tests prove aggregate `canonicalNames.characters` plus NPC-allowed source-rule matching cannot satisfy Gojo/JJK behavior. Plan 72-03 should also document deterministic behavior for multiple NPC-eligible source rules or name-collision cases before any schema expansion. [VERIFIED: shared/src/types.ts:198-202; backend/src/worldgen/scaffold-steps/npcs-step.ts:185-192; .planning/phases/72-worldgen-authority-propagation-regression-audit/72-03-PLAN.md]

## Sources

### Primary (HIGH confidence)

- Phase 72 context and Phase 71 closeout docs: product rule, observed regressions, planning requirement, and verification scope. [VERIFIED: .planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md; .planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-SUMMARY.md; .planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-VERIFICATION.md]
- GitNexus `WorldForge` query/context results for research artifact, NPC classification, power stats, and route flows. [VERIFIED: GitNexus query/context 2026-04-26]
- Backend source files under `backend/src/worldgen`, `backend/src/routes`, `backend/src/campaign`, and `backend/src/character`. [VERIFIED: code inspection 2026-04-26]
- Frontend source files under `frontend/lib` and `frontend/components/title`. [VERIFIED: code inspection 2026-04-26]
- Existing backend/frontend package scripts. [VERIFIED: backend/package.json; frontend/package.json]

### Secondary (MEDIUM confidence)

- Frontend review impact is inferred from API/wizard/draft code and test fixture patterns; exact UI product intent is an open planner decision. [VERIFIED: frontend/lib/api.ts:729-950; frontend/components/title/use-new-campaign-wizard.ts:103-490; frontend/lib/character-drafts.ts:307-553]

### Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | LLM object-output cap failures should be handled by bounded schemas and explicit fallback rather than globally relaxing caps. | Failure Modes | Planner might over-constrain or under-constrain LLM schema repair behavior. |
| A2 | Stored campaign artifact should probably win over accidental client `null`, unless an explicit clear-artifact API exists. | Recommended Plan Slices | Planner may choose a different API semantic, changing route tests. |

## Metadata

**Confidence breakdown:**

- Authority propagation map: HIGH - based on direct code inspection plus GitNexus process/context discovery. [VERIFIED: GitNexus query/context 2026-04-26; backend/src/routes/worldgen.ts:256-724]
- Failure modes: HIGH for known backend route/scaffold/NPC/schema issues; MEDIUM for frontend/review loss until product behavior is chosen. [VERIFIED: backend/src/worldgen/research-artifact.ts:18-58; backend/src/worldgen/scaffold-steps/npcs-step.ts:194-253; frontend/lib/api.ts:729-950]
- Validation architecture: HIGH for focused backend commands and MEDIUM for frontend command scope because frontend artifact transport tests may need new harness coverage. [VERIFIED: backend/package.json; frontend/package.json]

**Research date:** 2026-04-26 [VERIFIED: system current_date]
**Valid until:** 2026-05-26 for current code topology, or sooner if Phase 72 implementation changes route/frontend artifact transport. [ASSUMED]

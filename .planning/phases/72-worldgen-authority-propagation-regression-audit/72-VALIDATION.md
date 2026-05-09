---
phase: 72
slug: worldgen-authority-propagation-regression-audit
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-26
---

# Phase 72 - Validation Strategy

Per-phase validation contract for the worldgen authority propagation regression audit.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest for backend and frontend |
| **Config file** | `backend/vitest.config.ts`; frontend test config via workspace package scripts |
| **Quick run command** | `npm --prefix backend run test -- src/worldgen/__tests__/research-artifact.test.ts src/worldgen/__tests__/ip-researcher.test.ts src/routes/__tests__/worldgen.test.ts src/worldgen/__tests__/npcs-step.test.ts` |
| **Full suite command** | `npm --prefix backend run test && npm --prefix backend run typecheck && npm --prefix frontend run typecheck` |
| **Estimated runtime** | 120-240 seconds for focused backend+typecheck; longer if frontend tests are added |

---

## Sampling Rate

- **After every task commit:** Run the focused test command for the touched surface.
- **After every plan wave:** Run all Phase 72 focused backend tests plus typecheck.
- **Before `$gsd-verify-work`:** Backend test suite and backend/frontend typecheck must be green unless a plan explicitly records a frontend-test harness limitation.
- **Max feedback latency:** 240 seconds for focused checks.

---

## Authority Invariants

| ID | Invariant | Automated Evidence |
|----|-----------|--------------------|
| INV-72-01 | When `WorldgenResearchArtifactV2` is present, legacy `ipContext`, `premiseDivergence`, `researchFrame`, `buildKnownIpGenerationContract`, and `buildCanonicalList` do not own semantic prompt decisions. | Focused prompt and route tests plus forbidden-string scan. |
| INV-72-02 | External search/provider fields are capped before strict artifact parsing and cannot crash long worldgen runs due to provider snippet length. | `research-artifact.test.ts`, `ip-researcher.test.ts`, and any route/schema parser regressions added in this phase. |
| INV-72-03 | JJK world basis plus Naruto mechanics overlay does not import Naruto locations, factions, or cast through backend canonicalization. | Mixed-premise fixture tests for scaffold prompt surfaces. |
| INV-72-04 | Artifact canonical character names route matching NPCs to known-IP enrichment and not original-character power stats. | `npcs-step.test.ts`, power assessor/enrichment tests, and Gojo regression assertions. |
| INV-72-05 | Campaign-stored artifacts survive generate/regenerate/save-edits and cannot be silently bypassed by nullable request payloads without an explicit tested rule. | `routes/__tests__/worldgen.test.ts`, `campaign/__tests__/manager.test.ts`. |
| INV-72-06 | Frontend wizard/API transports `_researchArtifact` explicitly through seed suggestion, single-seed reroll, and world generation. Backend on-demand artifact research remains compatibility fallback, not the preferred browser boundary. | Frontend API/wizard tests; create or extend a frontend API request-body test target if needed. Manual-only verification is not acceptable for this invariant. |
| INV-72-07 | Review/draft conversion preserves backend known-IP NPC identity and does not default artifact-backed canonical NPCs to `original`. | `frontend/lib/__tests__/character-drafts.test.ts` and world review tests if frontend scope is touched. |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 72-01-01 | 01 | 1 | INV-72-01..07 | T-72-01 | Authority surfaces are inventoried before production edits. | source audit | `rg -n "researchArtifact|worldgenResearchArtifact|_researchArtifact|canonicalStatus|classifyCanonicalStatus" backend/src frontend shared/src` | Yes | pending |
| 72-02-01 | 02 | 1 | INV-72-02, INV-72-05 | T-72-02 | Oversized or nullable artifact payloads cannot abort or erase stored artifact authority silently. | unit/route | `npm --prefix backend run test -- src/worldgen/__tests__/research-artifact.test.ts src/worldgen/__tests__/ip-researcher.test.ts src/routes/__tests__/worldgen.test.ts` | Yes | pending |
| 72-03-01 | 03 | 2 | INV-72-01, INV-72-03, INV-72-04 | T-72-03 | Artifact-present scaffold/NPC paths cannot fall back to legacy semantic ownership or original power stats. | unit/integration | `npm --prefix backend run test -- src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/npcs-step.test.ts src/worldgen/__tests__/lore-extractor.test.ts src/character/ingestion/__tests__/power-assessor.test.ts` | Yes | pending |
| 72-04-01 | 04 | 2 | INV-72-06, INV-72-07 | T-72-04 | Browser/review payloads preserve artifact-backed identity or explicitly rely on tested backend fallback. | frontend/backend | `npm --prefix frontend run test -- --run components/title/__tests__/use-new-campaign-wizard.test.tsx lib/__tests__/character-drafts.test.ts` | Check during execution | pending |
| 72-05-01 | 05 | 3 | INV-72-01..07 | T-72-05 | Final verification proves mixed-source authority, no-artifact compatibility, and clean change scope. | full verification | `npm --prefix backend run test && npm --prefix backend run typecheck && npm --prefix frontend run typecheck` | Yes | pending |

---

## Wave 0 Requirements

- [ ] Reuse `backend/src/worldgen/__tests__/fixtures/jjk-naruto-artifact.ts` and extend only if a plan needs overlong snippets, prompt-injection snippets, or supporting/original NPC coverage.
- [ ] Confirm whether frontend test files exist before requiring frontend edits: `frontend/components/title/__tests__/use-new-campaign-wizard.test.tsx`, `frontend/lib/__tests__/character-drafts.test.ts`, `frontend/components/world-review/__tests__/npcs-section.test.tsx`.
- [ ] Confirm backend has a route/schema test target before adding parser regressions; create a focused test file only if no existing file owns the surface.

---

## Manual-Only Verifications

All Phase 72 core behaviors should have automated verification. Manual review is limited to reading the final verification matrix and confirming the chosen frontend artifact handoff semantics are recorded in plan summaries.

---

## Required Negative Scans

Run these after implementation and before verification closeout:

```bash
rg -n "Canonical subject|FRANCHISE REFERENCE|Build the canonical world|This world is the Naruto universe|Five Great Nations|Hidden Mist Village|Hidden Cloud Village|Mizukage|Raikage|Hashirama|Tobirama" backend/src/worldgen backend/src/routes --glob '!**/__tests__/**' --glob '!**/test-fixtures/**'
rg -n "_researchArtifact|worldgenResearchArtifact|canonicalStatus: \"original\"|classifyCanonicalStatus\\(" backend/src frontend shared/src
rg -n "researchArtifact" frontend backend/src/routes backend/src/worldgen backend/src/character -g "*.ts" -g "*.tsx"
```

For the second scan, closeout must classify matches instead of treating raw grep output as pass/fail:

- `_researchArtifact`: allowed in backend worldgen route/tests and Phase 72 frontend API/wizard transport implementation/tests.
- `worldgenResearchArtifact`: allowed in campaign config/persistence, route handoff, worldgen artifact consumers, tests, and planning docs.
- `canonicalStatus: "original"`: allowed for original/no-artifact fixtures, blank NPC creation defaults, and explicit original-behavior regressions; unexpected on artifact-backed known-IP paths is a failure.
- `classifyCanonicalStatus(`: allowed in generic ingestion implementation/tests and Phase 72 adjacency documentation; unexpected artifact-backed worldgen callers require `Tests Needed` or a fix.

---

## Validation Sign-Off

- [x] All planned tasks must have automated verification or an explicit Wave 0 prerequisite.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 lists all missing-reference checks.
- [x] No watch-mode flags in required commands.
- [x] Feedback latency target under 240 seconds for focused checks.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-04-26 for planning use.

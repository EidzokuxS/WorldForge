---
phase: 35-restore-npc-tier-visibility-and-manual-tier-control-in-world-review
verified: 2026-04-07T09:15:53.7582819+03:00
status: passed
score: 5/5 must-haves verified
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed:
    - "Completed the previously required live browser smoke for mixed-tier world review load, edit, save, and reload persistence."
  gaps_remaining: []
  regressions: []
---

# Phase 35: Restore NPC Tier Visibility and Manual Tier Control in World Review Verification Report

**Phase Goal:** World review preserves NPC key/supporting tier across load, edit, and save, and lets the user explicitly choose who is key vs non-key without changing the underlying worldgen rules.
**Verified:** 2026-04-07T09:15:53.7582819+03:00
**Status:** passed
**Re-verification:** Yes — prior `human_needed` status closed by live browser smoke evidence

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Existing generated key/supporting NPCs remain distinguishable in world review after loading campaign world data. | ✓ VERIFIED | Code path still exposes stored NPCs through `/api/campaigns/:id/world` with hydrated `draft` and `npc` aliases (`backend/src/routes/campaigns.ts:119`, `backend/src/routes/campaigns.ts:124`, `backend/src/routes/campaigns.ts:125`), and `toEditableScaffold()` still resolves tier via `draft.identity.tier -> row tier -> key` and includes `tier` in editable NPCs (`frontend/lib/world-data-helpers.ts:45`, `frontend/lib/world-data-helpers.ts:49`, `frontend/lib/world-data-helpers.ts:50`, `frontend/lib/world-data-helpers.ts:146`). Live smoke on campaign `b6ec0db5-007e-4ea2-807a-bb7947370bfb` confirmed the backend payload started with mixed tiers (`key: 4`, `persistent: 5`) and the review page visibly rendered both `Key NPC` and `Supporting NPC` cards. |
| 2 | Draft/scaffold compatibility helpers preserve NPC tier instead of silently defaulting supporting/manual NPCs back to key. | ✓ VERIFIED | `ScaffoldNpc` carries explicit review-tier state and adapter helpers preserve it in both directions while synchronizing canonical draft tier (`frontend/lib/api-types.ts`, `frontend/lib/character-drafts.ts`). Fresh frontend regression run passed: `frontend/lib/__tests__/character-drafts.test.ts` and `frontend/lib/__tests__/world-data-helpers.test.ts` as part of the targeted 31-test bundle. |
| 3 | World review visibly shows NPC tier and lets the user switch an NPC between key and supporting before save. | ✓ VERIFIED | `NpcsSection` still renders per-card tier labels/buttons and synchronizes changes through `syncNpcTier()` (`frontend/components/world-review/npcs-section.tsx:52`, `frontend/components/world-review/npcs-section.tsx:296`). Live smoke confirmed several cards rendered `Supporting NPC` and `Key NPC`, and `Dr. Helena Voss` was switched from supporting to key via the new per-card tier control. Fresh component regression run passed: `frontend/components/world-review/__tests__/npcs-section.test.tsx` (6 tests). |
| 4 | Manual add, describe, import, and AI-generate NPC flows let the user choose key vs non-key without changing the underlying worldgen helper contracts. | ✓ VERIFIED | `creationTier` remains explicit and defaults to `supporting`; blank-add uses `createEmptyNpcDraft(..., creationTier)`; describe/import/generate still call helper APIs with `role: "key"` and locally retier via `syncNpcTier()` before insertion (`frontend/components/world-review/npcs-section.tsx:75`, `frontend/components/world-review/npcs-section.tsx:133`, `frontend/components/world-review/npcs-section.tsx:143`, `frontend/components/world-review/npcs-section.tsx:172`, `frontend/components/world-review/npcs-section.tsx:208`). The fresh 31-test frontend bundle covered these helper-flow retiering paths. |
| 5 | Saving review edits keeps the existing supporting->persistent DB mapping coherent, and targeted regressions lock the seam. | ✓ VERIFIED | `handleSaveAndContinue()` still calls `saveWorldEdits()` before route handoff (`frontend/app/(non-game)/campaign/[id]/review/page.tsx:150`, `frontend/app/(non-game)/campaign/[id]/review/page.tsx:152`, `frontend/app/(non-game)/campaign/[id]/review/page.tsx:154`). Fresh backend regression run passed: 248 tests across `schemas`, `worldgen`, `campaigns`, and `scaffold-saver`. Live smoke then closed the browser seam: after switching `Dr. Helena Voss` to key and triggering save, `/api/campaigns/:id/world` showed persisted `tier: key` and `draft.identity.tier: key`; a fresh reload of `/campaign/{id}/review` rendered `Dr. Helena Voss` as `Key NPC`. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `frontend/lib/api-types.ts` | `ScaffoldNpc` contract with explicit key/supporting tier | ✓ VERIFIED | Exists, substantive, used by adapter and UI code. |
| `frontend/lib/character-drafts.ts` | Tier-preserving draft/scaffold helpers and canonical draft sync | ✓ VERIFIED | Exists, substantive, used by load normalization and UI tier sync. |
| `frontend/lib/world-data-helpers.ts` | Load normalization preserving tier across draft/row fallback | ✓ VERIFIED | Exists, substantive, still resolves review tier deterministically before page render. |
| `backend/src/routes/schemas.ts` | Save-edits parser seam preserving canonical review tier | ✓ VERIFIED | Exists, substantive, covered by the fresh backend regression run. |
| `backend/src/routes/__tests__/schemas.test.ts` | Parser regressions for supporting payloads | ✓ VERIFIED | Exists, substantive, passed in the fresh targeted backend run. |
| `backend/src/routes/__tests__/worldgen.test.ts` | Route regressions proving `saveScaffoldToDb` receives preserved tier | ✓ VERIFIED | Exists, substantive, passed in the fresh targeted backend run. |
| `frontend/lib/__tests__/character-drafts.test.ts` | Adapter regressions for supporting vs key conversions | ✓ VERIFIED | Exists, substantive, passed in the fresh targeted frontend run. |
| `frontend/lib/__tests__/world-data-helpers.test.ts` | Load-normalization regressions including legacy fallback | ✓ VERIFIED | Exists, substantive, passed in the fresh targeted frontend run. |
| `backend/src/routes/__tests__/campaigns.test.ts` | Compatibility alias regression for persistent DB rows | ✓ VERIFIED | Exists, substantive, passed in the fresh targeted backend run. |
| `backend/src/worldgen/__tests__/scaffold-saver.test.ts` | Supporting->persistent and key->key persistence mapping | ✓ VERIFIED | Exists, substantive, passed in the fresh targeted backend run. |
| `frontend/components/world-review/npcs-section.tsx` | Tier-visible NPC editor and tier-aware helper flows | ✓ VERIFIED | Exists, substantive, wired into the review page and confirmed by live browser smoke. |
| `frontend/components/world-review/__tests__/npcs-section.test.tsx` | Component regressions for visible tier controls and helper-flow tier selection | ✓ VERIFIED | Exists, substantive, passed in the fresh targeted frontend run. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `frontend/lib/character-drafts.ts` | `frontend/lib/api-types.ts` | `ScaffoldNpc` tier contract | ✓ VERIFIED | Manual check: `character-drafts.ts` imports `ScaffoldNpc` from `api-types.ts` and uses its `tier` type in all adapter helpers (`frontend/lib/character-drafts.ts:6`, `frontend/lib/character-drafts.ts:54`, `frontend/lib/character-drafts.ts:78`, `frontend/lib/character-drafts.ts:356`). `gsd-tools` reported a false negative here because it looked for target-path reference text rather than the type import seam. |
| `frontend/lib/world-data-helpers.ts` | `frontend/lib/character-drafts.ts` | Draft-backed editable scaffold projection | ✓ VERIFIED | `world-data-helpers.ts` imports `characterDraftToScaffoldNpc()` and uses it in `draftToEditableNpc()` (`frontend/lib/world-data-helpers.ts:13`, `frontend/lib/world-data-helpers.ts:159`). |
| `frontend/lib/world-data-helpers.ts` | `backend/src/routes/schemas.ts` | Editable scaffold save payload survives save-edits normalization | ✓ VERIFIED | Contract link verified by matching tier-bearing scaffold shape on the client and `scaffoldNpcSchema` normalization on the server (`frontend/lib/world-data-helpers.ts:136`, `frontend/lib/world-data-helpers.ts:146`, `backend/src/routes/schemas.ts:607`, `backend/src/routes/schemas.ts:629`, `backend/src/routes/schemas.ts:634`). |
| `frontend/lib/world-data-helpers.ts` | `backend/src/worldgen/scaffold-saver.ts` | Supporting->persistent boundary remains coherent | ✓ VERIFIED | Client-side editable NPCs keep `supporting`; saver maps non-key scaffold NPCs to DB `persistent` through legacy adapter output and explicit insert mapping (`frontend/lib/world-data-helpers.ts:45`, `backend/src/worldgen/scaffold-saver.ts`, `backend/src/worldgen/__tests__/scaffold-saver.test.ts:302`). |
| `frontend/components/world-review/npcs-section.tsx` | `frontend/lib/character-drafts.ts` | Tier sync between editable scaffold NPCs and canonical drafts | ✓ VERIFIED | `NpcsSection` imports and uses `syncScaffoldTierToDraft()`, `characterDraftToScaffoldNpc()`, and `createEmptyNpcDraft()` (`frontend/components/world-review/npcs-section.tsx:23`, `frontend/components/world-review/npcs-section.tsx:52`, `frontend/components/world-review/npcs-section.tsx:130`). |
| `frontend/components/world-review/npcs-section.tsx` | `frontend/lib/api.ts` | Parse/import/generate helper responses post-processed to selected scaffold tier | ✓ VERIFIED | `NpcsSection` calls `parseCharacter()`, `importV2Card()`, and `researchCharacter()` from the API layer, then locally retiers the returned NPC (`frontend/components/world-review/npcs-section.tsx:21`, `frontend/components/world-review/npcs-section.tsx:143`, `frontend/components/world-review/npcs-section.tsx:172`, `frontend/components/world-review/npcs-section.tsx:208`). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `frontend/app/(non-game)/campaign/[id]/review/page.tsx` | `scaffold.npcs` | `getWorldData()` -> `toEditableScaffold()` | Yes. `/api/campaigns/:id/world` reads SQLite NPC rows, hydrates `draft` / `npc` aliases, and the page normalizes them into editable scaffold state before rendering. | ✓ FLOWING |
| `frontend/components/world-review/npcs-section.tsx` | `npcs` prop / `onChange` payload | Review page state from `scaffold.npcs` | Yes. Tier edits and helper-created NPCs update real scaffold state; live smoke confirmed the edited card state fed the save path. | ✓ FLOWING |
| `frontend/lib/api.ts` + `backend/src/routes/schemas.ts` | `saveWorldEdits(scaffold)` payload | `POST /api/worldgen/save-edits` | Yes. Fresh backend regressions prove the parse/normalize seam preserves review tier, and live smoke confirmed persisted payload state after save. | ✓ FLOWING |
| `backend/src/worldgen/scaffold-saver.ts` | persisted NPC `tier` column | `saveScaffoldToDb()` insert/update path | Yes. Saver continues to write DB `key` for key scaffold NPCs and DB `persistent` for supporting scaffold NPCs, with reload mapping them back to review-tier semantics. | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Frontend adapter + world-review component regressions | `npm --prefix frontend exec vitest run "lib/__tests__/character-drafts.test.ts" "lib/__tests__/world-data-helpers.test.ts" "components/world-review/__tests__/npcs-section.test.tsx"` | 3 files passed, 31 tests passed | ✓ PASS |
| Backend schema/route/saver regressions | `npm --prefix backend exec vitest run "src/routes/__tests__/schemas.test.ts" "src/routes/__tests__/worldgen.test.ts" "src/routes/__tests__/campaigns.test.ts" "src/worldgen/__tests__/scaffold-saver.test.ts"` | 4 files passed, 248 tests passed | ✓ PASS |
| Live browser smoke on campaign `b6ec0db5-007e-4ea2-807a-bb7947370bfb` | Manual smoke against running app plus `/api/campaigns/:id/world` before/after checks | Started with mixed backend tiers (`key: 4`, `persistent: 5`), review UI rendered mixed tier labels, `Dr. Helena Voss` changed supporting -> key via per-card control, save triggered, backend world payload persisted `tier: key` and `draft.identity.tier: key`, and a fresh `/campaign/{id}/review` reload rendered `Key NPC`. | ✓ PASS |

### Requirements Coverage

Note: repo-level `.planning/REQUIREMENTS.md` currently contains product-wide requirement IDs only and does not define `P35-01` through `P35-05`. Coverage below is mapped from phase 35 roadmap success criteria plus plan frontmatter, which is the operative contract for this verification.

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `P35-01` | `35-01-PLAN.md` | Load existing world-review NPCs without losing key/supporting tier | ✓ SATISFIED | `backend/src/routes/campaigns.ts:119`, `backend/src/routes/campaigns.ts:124`, `frontend/lib/world-data-helpers.ts:45`, and live smoke showing mixed tier labels on initial render |
| `P35-02` | `35-01-PLAN.md` | Preserve tier through draft/scaffold compatibility helpers | ✓ SATISFIED | Fresh frontend adapter regression pass plus the persisted `draft.identity.tier: key` observation after live edit/save |
| `P35-03` | `35-02-PLAN.md` | World review visibly shows and edits key/supporting tier | ✓ SATISFIED | `frontend/components/world-review/npcs-section.tsx:52`, `frontend/components/world-review/npcs-section.tsx:296`, fresh component regressions, and live per-card tier toggle of `Dr. Helena Voss` |
| `P35-04` | `35-02-PLAN.md` | Manual add/describe/import/generate flows support selected tier without widening backend worldgen rules | ✓ SATISFIED | `frontend/components/world-review/npcs-section.tsx:75`, `frontend/components/world-review/npcs-section.tsx:143`, `frontend/components/world-review/npcs-section.tsx:172`, `frontend/components/world-review/npcs-section.tsx:208`, plus fresh frontend regression pass |
| `P35-05` | `35-01-PLAN.md` | Save/reload seam keeps supporting->persistent mapping coherent and locked by regressions | ✓ SATISFIED | Fresh 248-test backend regression pass plus live save/reload persistence for `Dr. Helena Voss` via `/api/campaigns/:id/world` and fresh page reload |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `frontend/app/(non-game)/campaign/[id]/review/page.tsx` | 150, 152, 154, 160 | Residual post-save route handoff issue observed in live smoke: UI stayed on review with `Saving...` even though save persisted and reload showed the edited tier | ℹ️ Info | Non-blocking for Phase 35. The phase goal is the NPC tier load/edit/save/reload seam, and that seam was verified end-to-end. This should be tracked separately as a route-transition/handoff bug. |

### Human Verification Required

None. The previously required mixed-tier live browser smoke has now been completed and passed.

### Gaps Summary

No blocking gaps remain. Phase 35 now satisfies its actual goal: mixed key/supporting NPC tiers load correctly into world review, the user can explicitly retier an NPC in the UI, save persists the edited tier, and a fresh reload restores the correct tier state. The residual observation that the page remained on review with `Saving...` after save is treated as a separate UI handoff issue because the save completed, `/api/campaigns/:id/world` reflected the new canonical tier state, and reloading the review page showed the correct persisted result.

---

_Verified: 2026-04-07T09:15:53.7582819+03:00_
_Verifier: Claude (gsd-verifier)_

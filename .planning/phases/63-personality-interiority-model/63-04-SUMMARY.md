---
phase: 63-personality-interiority-model
plan: 04
subsystem: ui
tags: [react, nextjs, vitest, gitnexus, personality, character-ui]
requires:
  - phase: 63-01
    provides: shared CharacterPersonality typing, backend personality schema, and normalized identity.personality data
provides:
  - shared PersonalitySection atom for basic character surfaces
  - NPC and player card personality rendering on the primary UI
  - advanced inspector cleanup with deprecated identity/capability/provenance rows removed
  - creation UI without live trait/flaw editors
affects: [63-05-backfill, 63-06-verification, world-review-ui, character-creation-ui]
tech-stack:
  added: []
  patterns:
    - shared read-only ui atom reused across npc and player card surfaces
    - complementary advanced inspector contract with raw-json tail kept separate from visible sections
    - staged gitnexus detect_changes checks before each task commit on dirty branches
key-files:
  created:
    - frontend/components/world-review/personality-section.tsx
    - frontend/components/world-review/__tests__/personality-section.test.tsx
  modified:
    - frontend/components/world-review/npcs-section.tsx
    - frontend/components/world-review/__tests__/npcs-section.test.tsx
    - frontend/components/character-creation/character-card.tsx
    - frontend/components/character-creation/__tests__/character-card.identity.test.tsx
    - frontend/components/world-review/character-record-inspector.tsx
    - frontend/components/world-review/__tests__/character-record-inspector.test.tsx
    - frontend/components/character-creation/character-form.tsx
    - frontend/components/character-creation/__tests__/character-card.test.tsx
    - .planning/phases/63-personality-interiority-model/deferred-items.md
key-decisions:
  - "PersonalitySection lives under world-review and is reused by both NPC and player card surfaces because the NPC card is the primary owner."
  - "Advanced inspector stays complementary: personality remains off the advanced surface and Provenance is removed rather than relocated inside the visible panel."
  - "The plan's trait/flaw-editor removal was applied on CharacterCard because the live creation editors had already moved out of CharacterForm."
patterns-established:
  - "Basic personality presentation: summary and voice stay visible, deeper personality fields sit behind an explicit disclosure."
  - "Inspector cleanup pattern: deprecated fields can remain in raw JSON for diagnostics while being removed from visible complement sections."
requirements-completed: [P63-R4, P63-R5]
duration: 15m
completed: 2026-04-18
---

# Phase 63 Plan 04: UI Summary

**Shared personality panels on NPC/player cards, a complementary 9-section advanced inspector, and creation UI with trait/flaw editing removed from the live surface**

## Performance

- **Duration:** 15m
- **Started:** 2026-04-18T15:55:00Z
- **Completed:** 2026-04-18T16:10:03Z
- **Tasks:** 7
- **Files modified:** 11

## Accomplishments
- Added a reusable `PersonalitySection` atom with always-visible summary/voice and collapsible deep personality fields.
- Wired personality onto both basic character surfaces: NPC cards in world review and the player `CharacterCard`.
- Reduced the advanced inspector to the new 9-section contract and removed the live trait/flaw editors from the creation surface.

## GitNexus Impact Digest

- Pre-edit impact baseline after reindex:
  - `CharacterRecordInspector`: `LOW`, `0` upstream dependents.
  - `CharacterForm`: `LOW`, `0` upstream dependents.
  - `NpcsSection`: `LOW`, `0` upstream dependents.
  - `CharacterCardInner`: `LOW`, `0` upstream dependents.
  - `PowerStatsSection` was not resolved by symbol name after reindex, so that file was validated by direct source inspection instead of graph lookup.
- Staged-scope change checks before task commits:
  - NPC card integration: `MEDIUM`, confined to `NpcsSection` and its local helper flows.
  - Player card integration: `LOW`, confined to `character-card.tsx`.
  - Inspector cleanup: `LOW`, confined to `character-record-inspector.tsx`.
  - Creation UI removal: `LOW`, confined to `CharacterCard` and `CharacterForm`.
- `detect_changes(scope: "all")` during final verification was polluted by unrelated dirty backend worktree changes, so the staged per-task checks were the authoritative scope guard for this plan.

## Verification

- `npm --prefix frontend test -- run "personality-section"` ✅
- `npm --prefix frontend test -- run "npcs-section"` ✅
- `npm --prefix frontend test -- run "character-card"` ✅
- `npm --prefix frontend test -- run "character-record-inspector"` ✅
- `npm --prefix frontend test -- run "character-form"` ✅
- `npm --prefix frontend run lint` ✅
- `npm --prefix frontend test -- run` ⚠️ unrelated red in `frontend/lib/__tests__/v2-card-parser.test.ts`
- `npm --prefix frontend run typecheck` ⚠️ unrelated red in `frontend/lib/character-drafts.ts` and `frontend/lib/v2-card-parser.ts`

## Task Commits

Each task was committed atomically:

1. **Task 1: Pre-task gitnexus impact analysis** - `f19a028` (`chore`)
2. **Task 2: PersonalitySection shared atom + Vitest RTL suite** - `087042e` (`test`), `58eea6e` (`feat`)
3. **Task 3: NPC card integration + Vitest update** - `e0baca8` (`feat`)
4. **Task 4: Player CharacterCard integration + identity test update** - `b01125d` (`feat`)
5. **Task 5: Advanced inspector cleanup** - `32962aa` (`test`), `0b4ee36` (`feat`)
6. **Task 6: Character form trait/flaw editor removal** - `161dd2a` (`feat`)
7. **Task 7: Post-task verification + full frontend suite** - `0bc5038` (`chore`)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `frontend/components/world-review/personality-section.tsx` - New shared personality renderer with shell hooks and collapsible details.
- `frontend/components/world-review/__tests__/personality-section.test.tsx` - Locks null/empty behavior, visible summary/voice, and disclosure behavior.
- `frontend/components/world-review/npcs-section.tsx` - Renders personality between tags and power stats on NPC cards.
- `frontend/components/world-review/__tests__/npcs-section.test.tsx` - Pins personality placement on the NPC card and updates fixtures to original-world personality data.
- `frontend/components/character-creation/character-card.tsx` - Reuses `PersonalitySection` and removes live trait/flaw editing from the player creation surface.
- `frontend/components/character-creation/__tests__/character-card.identity.test.tsx` - Verifies personality presence/absence on the player card.
- `frontend/components/character-creation/__tests__/character-card.test.tsx` - Drops stale expectations for removed trait/flaw editors.
- `frontend/components/world-review/character-record-inspector.tsx` - Removes deprecated visible rows, drops Provenance, and documents the 10→9 section contract change.
- `frontend/components/world-review/__tests__/character-record-inspector.test.tsx` - Pins the new 9-section contract and absence of deprecated fields/personality rows.
- `frontend/components/character-creation/character-form.tsx` - Updates creation copy to refer to personality rather than editable traits.
- `.planning/phases/63-personality-interiority-model/deferred-items.md` - Records unrelated full-suite and typecheck blockers found during final verification.

## Decisions Made

- Reused one `PersonalitySection` atom instead of duplicating personality markup between world review and character creation.
- Kept personality off the advanced inspector entirely so the advanced panel remains complementary to the basic card, matching the Phase 62 design direction.
- Treated the trait/flaw-editor removal as a live-surface fix on `CharacterCard` because the form/card split had moved the actual editors out of `CharacterForm`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed live trait/flaw editors from CharacterCard instead of CharacterForm**
- **Found during:** Task 6 (Character form trait/flaw editor removal)
- **Issue:** The plan referenced `character-form.tsx`, but the live editable trait/flaw controls had already moved to `character-card.tsx` in the current UI split.
- **Fix:** Removed the actual live editors from `character-card.tsx`, updated the related card test expectations, and refreshed `character-form.tsx` copy so the visible creation flow matches the Phase 63 contract.
- **Files modified:** `frontend/components/character-creation/character-card.tsx`, `frontend/components/character-creation/__tests__/character-card.test.tsx`, `frontend/components/character-creation/character-form.tsx`
- **Verification:** `npm --prefix frontend test -- run "character-card"`; `npm --prefix frontend test -- run "character-form"`; `npm --prefix frontend run lint`
- **Committed in:** `161dd2a`

**2. [Rule 3 - Blocking] Fixed PersonalitySection lint blockers discovered during verification**
- **Found during:** Task 6 verification
- **Issue:** `personality-section.tsx` had an unused helper and unescaped quote literals, causing frontend lint to fail.
- **Fix:** Removed the unused helper and replaced literal quote marks with escaped entities in the blockquote wrapper.
- **Files modified:** `frontend/components/world-review/personality-section.tsx`
- **Verification:** `npm --prefix frontend run lint`; `npm --prefix frontend test -- run "personality-section"`
- **Committed in:** `161dd2a`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were required to make the actual live UI match the intended contract. No architectural scope change.

## Issues Encountered

- GitNexus was 50 commits stale at executor start and had to be reindexed with embeddings before impact analysis was trustworthy.
- Full-suite verification exposed unrelated dirty-branch failures in `frontend/lib/__tests__/v2-card-parser.test.ts` and frontend typecheck failures in `frontend/lib/character-drafts.ts` / `frontend/lib/v2-card-parser.ts`; these were logged to `deferred-items.md` and left untouched per scope boundary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The primary UI now exposes personality on both basic character surfaces and keeps the advanced inspector complementary to those panels.
- Phase `63-06` still needs to update traceability/bookkeeping around the superseded Phase 62 section-count contract.
- Before claiming the broader frontend branch is green, the unrelated parser-test and typecheck blockers logged in `deferred-items.md` need separate cleanup.

---
*Phase: 63-personality-interiority-model*
*Completed: 2026-04-18*

## Self-Check: PASSED

- FOUND: `.planning/phases/63-personality-interiority-model/63-04-SUMMARY.md`
- FOUND: `f19a028`
- FOUND: `087042e`
- FOUND: `58eea6e`
- FOUND: `e0baca8`
- FOUND: `b01125d`
- FOUND: `32962aa`
- FOUND: `0b4ee36`
- FOUND: `161dd2a`
- FOUND: `0bc5038`

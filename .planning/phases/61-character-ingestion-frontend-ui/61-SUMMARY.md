---
phase: 61
slug: character-ingestion-frontend-ui
tags: [frontend, character-ingestion, power-stats, override-text, vs-battles, retry-ux]
one_liner: "Phase 61 shipped a unified character creation UI (player page + NPC tab) on top of the Phase 60 backend pipeline: shared 4-mode creation UX, visible override text field threaded to all 4 API calls, top-level Power Stats section on both cards, and explicit pipeline failure banner with real retry."
dependency_graph:
  requires:
    - "Phase 60: ingestCharacterDraft pipeline + 502 {error, stage, attempts} contract + response envelope carrying draft.powerStats + provenance.overrideText"
  provides:
    - "Unified 4-mode creation UX (parse / generate / research / import) on both player and NPC creation surfaces"
    - "Visible OverrideTextField threaded to every ingestion call"
    - "Shared PowerStatsSection atom (single source of truth for player card, NPC card, and CharacterRecordInspector)"
    - "IngestionError + PipelineErrorBanner retry pattern"
  affects:
    - "frontend/lib/api.ts (IngestionError + 4 wrapper signatures extended)"
    - "frontend/components/character-creation/ (4 new atoms + rewritten form + card)"
    - "frontend/components/world-review/npcs-section.tsx (rewritten with shared atoms)"
    - "frontend/components/world-review/character-record-inspector.tsx (PowerStats helpers removed in favor of shared import)"
    - "frontend/app/(non-game)/campaign/[id]/character/page.tsx (rewritten with unified ingestion pattern)"
metrics:
  duration: "~2 days (overnight autonomous run)"
  completed_date: "2026-04-17"
  plan_count: 4
  task_count: 9
  test_count_new: 64
  typecheck_errors_before: 0
  typecheck_errors_after: 0
  files_created: 11
  files_modified: 9
---

# Phase 61 — Character Ingestion Frontend UI

## Overview

Phase 61 layers the consumer UI on top of the Phase 60 ingestion pipeline. Both character creation surfaces — the player page (`/campaign/[id]/character`) and the world-review NPC tab — now share the same atomic vocabulary: a 4-mode `CreationModes` selector, a visible `OverrideTextField` that wins over card and research data, an `IngestionError`-aware `PipelineErrorBanner` with a real retry button that re-fires the failed closure, and a `PowerStatsSection` rendered top-level on each card. `CharacterRecordInspector` was rewired to import the shared atom so power stats render the same way everywhere.

## Wave structure

- **Wave 1 — 61-01:** Shared atoms (`creation-modes`, `override-text-field`, `power-stats-section`, `pipeline-error-banner`), `IngestionError` transport, and `overrideText` parameter added to the four character API wrappers in `frontend/lib/api.ts`. P61-R1..R5 added to REQUIREMENTS.md and ROADMAP.md.
- **Wave 2 — 61-02 + 61-03 (parallel):** Player page rewrite (4-mode form, runIngestion + banner, top-level PowerStats on CharacterCard) and NPC tab rewrite (mirrored ingestion pattern, generate-from-scratch mode added, inspector rewired to shared atom).
- **Wave 3 — 61-04:** Verification matrix, PinchTab smoke scripts (deferred run), VALIDATION + ROADMAP + REQUIREMENTS + STATE updates, this SUMMARY.

## Requirements closed

| Req | How | Evidence |
|-----|-----|----------|
| **P61-R1** PowerStats top-level on both cards | `PowerStatsSection` extracted (Plan 01) and embedded in CharacterCard (Plan 02) + each NPC card (Plan 03); inspector rewired to consume same atom (Plan 03) | 6 files reference `PowerStatsSection` (component, tests, 3 consumers, inspector) |
| **P61-R2** Override threaded everywhere | `overrideText` param on all 4 API wrappers; visible field on both surfaces; cleared on success only | `grep -c overrideText frontend/lib/api.ts` = 9 |
| **P61-R3** 4-mode parity | Shared `CreationModes` atom drives both surfaces; per-mode state preserved across switches | `CreationModes` imported in `character-form.tsx` and `npcs-section.tsx` |
| **P61-R4** Explicit failure + retry | `IngestionError` exported from `@/lib/api`; `PipelineErrorBanner` renders stage+attempts; `runIngestion` captures the failed closure for Retry | `grep "export class IngestionError"` found; banner imports + runIngestion present in both surfaces |
| **P61-R5** Aesthetic + IP hygiene | charcoal palette retained, no `backdrop-blur` introduced, no franchise placeholders ("Gandalf"/"plague doctor in Konoha") | grep sweeps return 0 |

## Plans delivered

| Plan | Commits |
|------|---------|
| 61-01 | `e498464` docs+baseline · `46f96ce` IngestionError transport · `4e55667` shared atoms · `f3282ac` atom unit tests · `b5358da` plan close |
| 61-02 | `032d42c` player page 4-mode UX + override + retry banner |
| 61-03 | `451fd70` NPC tab 4-mode UX + shared PowerStatsSection rewire |
| 61-04 | (this commit) docs(61): close Phase 61 |

## Dead code removed

- `PowerStatsTable`, `HaxAbilitiesList`, `VulnerabilitiesList` inline render helpers and `SEVERITY_STYLES` table from `frontend/components/world-review/character-record-inspector.tsx` — moved to the shared `power-stats-section.tsx` atom.
- `mapV2CardToCharacter`, `mapV2CardToNpc`, `synthesizeArchetypePowerStats` removed in Phase 60; their replacement (`ingestCharacterDraft`) is the only path used by all 4 character API endpoints.

## Verification

| Check | Result |
|-------|--------|
| `grep -q "export class IngestionError" frontend/lib/api.ts` | found |
| `grep -c "overrideText" frontend/lib/api.ts` ≥ 6 | 9 |
| `grep -c "PowerStatsSection" frontend/components/character-creation/character-card.tsx` ≥ 1 | found |
| `grep -c "PowerStatsSection" frontend/components/world-review/npcs-section.tsx` ≥ 1 | found |
| `grep -q 'from "@/components/character-creation/power-stats-section"' frontend/components/world-review/character-record-inspector.tsx` | found |
| `grep -c "function PowerStatsTable\|function HaxAbilitiesList\|function VulnerabilitiesList" frontend/components/world-review/character-record-inspector.tsx` | 0 |
| Franchise grep on Phase 61 surfaces | 0 |
| `grep -r "backdrop-blur" frontend/components/character-creation/` | 0 |
| `npx vitest run --root frontend` | 372/376 (4 pre-existing failures — see Deferred Issues) |
| Typecheck delta (after − before) | 0 (no regression) |
| Backend Phase 60 regression | 64/64 |

## Downstream contracts established

- **Phase 57 Tests 2 and 3** are now **UNBLOCKED** per ROADMAP.md Phase 61 statement — both surfaces expose visible PowerStats and overrideText so the playtest scripts can exercise the override-wins behavior end-to-end.
- Shared atoms available at `@/components/character-creation/{power-stats-section, override-text-field, creation-modes, pipeline-error-banner}` for any future creation surfaces (templates editor, persona editor, etc.).
- `IngestionError` exported from `@/lib/api` for future callers; subclass of `Error` so existing catch blocks still match.

## Deferred issues

These pre-existing failures were observed but are NOT caused by Phase 61. They were already red on `b5358da` (the commit that closed Plan 61-01) before any Wave 2 edits.

| File | Symptom | Likely root cause |
|------|---------|-------------------|
| `components/game/__tests__/character-panel.test.tsx` (2 tests) | "renders authoritative equipped and carried collections from explicit props" + "renders inventory items with tags" | Component contract drift; assertion mismatch with current props/render. |
| `components/world-review/__tests__/character-record-inspector.test.tsx` | "renders structured grounding, power profile, continuity, and canon source sections" | Test expects `Grounding`, `Continuity`, `Canon Sources` headings — those sections were removed in Phase 57 (`project_power_profile_redesign.md`). Test needs rewrite to assert current Power Stats / Live Dynamics layout instead. The `Baki/Sunagakure/Wind Blade` fixture also violates `feedback_no_ip_in_prompts.md`. |
| `app/(non-game)/campaign/new/dna/__tests__/page.test.tsx` | "Step 3 of 5" missing | Pipeline now has 6 steps (Phase 12 added IP research as Step 0); test never updated. |
| `app/game/__tests__/page.test.tsx` (lint) | unescaped `"` in JSX literal | Pre-existing lint debt. |

These should be cleaned in a small dedicated `chore/test-baseline-cleanup` follow-up, not gated on Phase 61.

## PinchTab smoke

Deferred — bridge + frontend unreachable in the Plan 04 environment. Both scripts (`pinchtab/character-creation-{player,npc}.mjs`) committed for manual execution on a non-proxied host. See `pinchtab-smoke-log.md` for the reproducer recipe.

## Self-Check: PASSED

- ✅ Plan 01 atoms exist and have unit tests (`grep PowerStatsSection frontend/components/character-creation/`)
- ✅ Plan 02 player page consumes atoms (`grep CreationModes frontend/components/character-creation/character-form.tsx`, `grep PipelineErrorBanner frontend/app/(non-game)/campaign/[id]/character/page.tsx`)
- ✅ Plan 03 NPC tab consumes atoms (`grep CreationModes frontend/components/world-review/npcs-section.tsx`)
- ✅ Plan 03 inspector rewired (`grep PowerStatsSection frontend/components/world-review/character-record-inspector.tsx`)
- ✅ overrideText threaded to all 4 wrappers (9 occurrences in `frontend/lib/api.ts`)
- ✅ Backend Phase 60 still green (64/64)
- ✅ Frontend typecheck unchanged from baseline
- ✅ No franchise leakage / no `backdrop-blur` on shell

## PHASE COMPLETE

All 4 plans merged. All 5 requirements closed. Backend regression green. Phase 57 Tests 2 and 3 unblocked.

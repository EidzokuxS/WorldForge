---
phase: 61
plan: 01
subsystem: frontend/character-creation
tags: [character-creation, power-stats, override-text, ingestion-error, atoms, wave-0]
dependency_graph:
  requires:
    - "Phase 60 backend ingestion pipeline (IngestionPipelineError 502 payload with stage+attempts)"
    - "backend/src/routes/character.ts pipelineErrorResponse contract"
    - "@worldforge/shared: PowerStats, TierRank, HaxAbility, CharacterVulnerability, formatTierRank"
  provides:
    - "frontend/lib/api.ts IngestionError class + readIngestionError helper"
    - "4 API wrappers (parseCharacter / generateCharacter / researchCharacter / importV2Card) with optional overrideText"
    - "PowerStatsSection atom (shared read-only renderer)"
    - "OverrideTextField atom (shared controlled textarea, 2000-char cap, counter)"
    - "CreationModes atom (shared 4-mode tablist)"
    - "PipelineErrorBanner atom (stage+attempts+Retry banner)"
    - "Approved 61-VALIDATION.md (nyquist_compliant, wave_0_complete)"
  affects:
    - "Plan 02 player creation page rewrite (will consume 4 atoms + IngestionError)"
    - "Plan 03 NPC tab rewrite (will consume same atoms + rewire inspector to shared PowerStatsSection)"
tech_stack:
  added: []
  patterns:
    - "Controlled atomic React components with 'use client' + aria-label + aria-live"
    - "Typed error class subclass of Error carrying HTTP-level structured payload"
    - "Spread-guard optional field: `...(overrideText ? { overrideText } : {})` to keep body clean when empty"
    - "Tab toggle semantics: click active tab → null (deselect)"
key_files:
  created:
    - frontend/components/character-creation/power-stats-section.tsx (127 lines)
    - frontend/components/character-creation/override-text-field.tsx (59 lines)
    - frontend/components/character-creation/creation-modes.tsx (84 lines)
    - frontend/components/character-creation/pipeline-error-banner.tsx (91 lines)
    - frontend/components/character-creation/__tests__/power-stats-section.test.tsx (82 lines, 6 tests)
    - frontend/components/character-creation/__tests__/override-text-field.test.tsx (50 lines, 7 tests)
    - frontend/components/character-creation/__tests__/creation-modes.test.tsx (67 lines, 7 tests)
    - frontend/components/character-creation/__tests__/pipeline-error-banner.test.tsx (108 lines, 7 tests)
    - .planning/phases/61-character-ingestion-frontend-ui/frontend-typecheck-before.txt (baseline capture)
  modified:
    - frontend/lib/api.ts (IngestionError + readIngestionError + apiPost + 4 wrappers)
    - frontend/lib/__tests__/api.test.ts (+10 tests across IngestionError transport + overrideText forwarding)
    - .planning/REQUIREMENTS.md (+P61-R1..R5 section + traceability rows)
    - .planning/ROADMAP.md (Phase 61 Requirements, Plans, progress row)
    - .planning/phases/61-character-ingestion-frontend-ui/61-VALIDATION.md (status: approved, wave_0_complete: true)
decisions:
  - "IngestionError is a subclass of Error with public stage+attempts so pages can `instanceof` narrow and render stage-specific retry UI. Chose subclass over branded type object to preserve stack trace and conventional `throw` semantics."
  - "Only apiPost was switched to readIngestionError; apiGet/apiPut/apiDelete/apiStreamPost still use readErrorMessage. Only character routes emit the 502 stage payload today, so non-character callers see no behavior change."
  - "Optional overrideText is a trailing positional param on the three simple wrappers; importV2Card takes it via the options object (which already exists). This keeps the existing 4 call sites source-compatible when they do not pass override."
  - "Empty string overrideText is treated the same as undefined — the field is omitted from the request body. Keeps backend Zod `.optional()` path clean and prevents 'user sent empty override = use empty string literally' ambiguity."
  - "PowerStatsSection returns null on undefined input (no internal placeholder). Caller decides whether to render 'not assessed (legacy record)' or an error banner. This prevents the silent-degradation failure mode per feedback_no_fallbacks_v2.md."
  - "CreationModes uses HTML role=tablist/tab semantics (not Shadcn Tabs) because the active 'mode' is null-capable and clicking the active tab deselects it. Custom buttons with aria-selected stay simpler than force-fitting the Tabs primitive."
metrics:
  duration: "~35 minutes"
  completed: 2026-04-17
---

# Phase 61 Plan 01: Foundation atoms + API transport + docs housekeeping Summary

**One-liner:** IngestionError class preserves backend 502 stage+attempts through apiPost, 4 creation wrappers thread optional overrideText, 4 new React atoms (PowerStatsSection / OverrideTextField / CreationModes / PipelineErrorBanner) unlock parallel Wave 2 page rewrites.

## What Shipped

### API transport (`frontend/lib/api.ts`)
- **`IngestionError`**: subclass of `Error` carrying `stage` (extract / classify / research / synthesize / power_assess) and `attempts`. Thrown by `apiPost` when the backend returns 502 with a `{stage, attempts}` body.
- **`readIngestionError`**: parses the response body, returns `IngestionError` when `stage` is present, falls back to plain `Error` with the extracted message, or the response `statusText` when JSON parsing fails.
- **`apiPost`**: now routes through `readIngestionError` instead of `readErrorMessage` so the structured payload survives the HTTP boundary. Other verbs (`apiGet`, `apiPut`, `apiDelete`, `apiStreamPost`) unchanged because only character routes emit the 502 stage shape.
- **4 character wrappers** (`parseCharacter`, `generateCharacter`, `researchCharacter`, `importV2Card`): optional trailing `overrideText` (via options object for `importV2Card`). Omitted from the wire body when empty/undefined via spread-guard.

### Shared atoms (`frontend/components/character-creation/`)
- **`PowerStatsSection`**: tier+rank table for all 4 axes, hax abilities with `Bypasses {tier}` badges, vulnerabilities with minor/major/critical severity color coding. Returns `null` when `powerStats` is undefined.
- **`OverrideTextField`**: controlled textarea, `maxLength=2000`, visible `{count}/2000` counter with `aria-live="polite"`, generic placeholder (no franchise names), compact mode for recreate strip.
- **`CreationModes`**: 4-mode tablist (Describe / AI Generate / Research Archetype / Import V2 Card) with ordered rendering, `aria-selected` on active, tab toggle semantics, `busy` disables all, selective `disabledModes`.
- **`PipelineErrorBanner`**: stage heading with `STAGE_LABELS` map, singular/plural attempts rendering, `role="alert"` + `aria-live="polite"`, Retry button (with `aria-label="Retry last ingestion"` + spinner when retrying), optional Dismiss button.

### Tests (5 new / 1 extended)
- `frontend/lib/__tests__/api.test.ts` (**+10 tests**, now 47 passing): IngestionError parsing from 502 payload, plain-Error fallback for no-stage responses, statusText fallback for broken JSON, `instanceof` narrowing, overrideText forwarding on all 4 wrappers including empty-string omission.
- 4 new atom test files (**27 tests total**, all passing): design-token assertions, a11y hooks, controlled-component edge cases, severity color classes, toggle semantics, singular/plural pluralization.

### Docs artifacts
- `REQUIREMENTS.md` — Phase 61 section with P61-R1..R5 + traceability rows
- `ROADMAP.md` — Phase 61 entry lists 5 requirements, 4 plans, progress row
- `61-VALIDATION.md` — Vitest 3.2 jsdom infra, per-task verification matrix for all 10 tasks across 4 plans, approved 2026-04-17, `nyquist_compliant: true`, `wave_0_complete: true`
- `frontend-typecheck-before.txt` — baseline captured (exit 0, clean)

## Verification Results

| Check                                                               | Result                           |
| ------------------------------------------------------------------- | -------------------------------- |
| `grep -q "P61-R5" .planning/REQUIREMENTS.md`                        | ✅ present                        |
| `grep -q "nyquist_compliant: true" 61-VALIDATION.md`                | ✅ present                        |
| `grep -q "export class IngestionError" frontend/lib/api.ts`         | ✅ present                        |
| `grep -c "overrideText" frontend/lib/api.ts`                        | ✅ 9 occurrences (≥ 6 required)   |
| 4 atom files exist with correct exports                             | ✅ all present                    |
| `grep "backdrop-blur" frontend/components/character-creation/*.tsx` | ✅ zero matches                   |
| Franchise name grep                                                 | ✅ zero matches in all new files  |
| `npx vitest run frontend/components/character-creation/ frontend/lib/__tests__/` | ✅ 124 passed (14 files) |
| `npm --prefix frontend run typecheck`                               | ✅ exit 0 (matches baseline)      |

**Typecheck delta:** before → 0 errors; after → 0 errors. No regression.

## Downstream Contracts Established

### For Plan 02 (player creation page rewrite)

```typescript
// Imports
import { IngestionError, parseCharacter, generateCharacter, researchCharacter, importV2Card } from "@/lib/api";
import { PowerStatsSection } from "@/components/character-creation/power-stats-section";
import { OverrideTextField } from "@/components/character-creation/override-text-field";
import { CreationModes, type CreationMode } from "@/components/character-creation/creation-modes";
import { PipelineErrorBanner } from "@/components/character-creation/pipeline-error-banner";

// API call pattern
const result = await parseCharacter(
  campaignId,
  concept,
  "player",
  locationNames,
  factionNames,
  overrideText,  // trailing optional — pass undefined/empty string to omit
);

// Error handling pattern
try {
  await lastIngestion();
} catch (err) {
  setIngestionError(err as Error);
  // err instanceof IngestionError && err.stage → show stage-specific banner
}
```

### For Plan 03 (NPC tab rewrite)

Same atom import paths. Inspector (`character-record-inspector.tsx`) must replace its internal `PowerStatsTable`/`HaxAbilitiesList`/`VulnerabilitiesList` helpers with a single `<PowerStatsSection powerStats={...} />` import from `@/components/character-creation/power-stats-section` to maintain one source of truth.

### Prop shapes (reference)

- `PowerStatsSection`: `{ powerStats: PowerStats | undefined }` — returns `null` on undefined.
- `OverrideTextField`: `{ value: string; onChange: (v: string) => void; disabled?: boolean; compact?: boolean }`.
- `CreationModes`: `{ mode: CreationMode | null; onModeChange: (m: CreationMode | null) => void; busy: boolean; disabledModes?: CreationMode[]; labels?: Partial<Record<CreationMode, string>> }`.
- `PipelineErrorBanner`: `{ error: string; stage?: IngestionStage; attempts?: number; onRetry: () => void; retrying: boolean; onDismiss?: () => void }`.

## Deviations from Plan

None — plan executed exactly as written. No Rule 1-4 auto-fixes triggered. No authentication gates. No architectural decisions escalated.

## Known Stubs

None. All new atoms render real data from typed props. `PowerStatsSection` returning `null` on undefined is intentional and documented per research §Pitfall 3 and `feedback_no_fallbacks_v2.md`: callers decide between "legacy record (no data)" and "pipeline failed (error banner)".

## Deferred Items

None in scope for Plan 01. Remaining Wave 0 / Wave 2 / Wave 3 work:

- **Plan 02 (Wave 2, parallel):** Player creation page rewrite — wire 4 atoms + IngestionError retry closure + top-level PowerStats on CharacterCard.
- **Plan 03 (Wave 2, parallel):** NPC tab rewrite — add 4th mode (AI Generate), wire shared atoms, rewire inspector to shared source.
- **Plan 04 (Wave 3):** Integration verification — PinchTab programmatic smoke, full frontend Vitest suite, typecheck, lint, Phase 61 SUMMARY.

## Pre-existing worktree noise (out of scope)

Running `vitest` at the repo root surfaces failures in `.claude/worktrees/agent-*/` directories (stale artifacts from prior parallel agents) unrelated to our code. Excluding worktrees yields 124/124 passing. Logged only — not fixed per scope-boundary rule.

## Self-Check: PASSED

- [x] `frontend/components/character-creation/power-stats-section.tsx` exists
- [x] `frontend/components/character-creation/override-text-field.tsx` exists
- [x] `frontend/components/character-creation/creation-modes.tsx` exists
- [x] `frontend/components/character-creation/pipeline-error-banner.tsx` exists
- [x] 4 atom test files exist under `__tests__/`
- [x] `frontend/lib/api.ts` exports `IngestionError` and `readIngestionError`
- [x] `.planning/REQUIREMENTS.md` contains `P61-R1` through `P61-R5`
- [x] `.planning/ROADMAP.md` lists `P61-R1, P61-R2, P61-R3, P61-R4, P61-R5`
- [x] `61-VALIDATION.md` frontmatter `status: approved`, `nyquist_compliant: true`, `wave_0_complete: true`
- [x] `frontend-typecheck-before.txt` present
- [x] Per-task commits present: `e498464` (docs), `46f96ce` (API), `4e55667` (atoms), `f3282ac` (tests)

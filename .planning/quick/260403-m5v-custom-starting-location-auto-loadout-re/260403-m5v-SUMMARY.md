---
phase: quick-260403-m5v
plan: 01
subsystem: character-creation
tags: [character, schema, frontend, ux]
dependency_graph:
  requires: []
  provides: [rich-character-schema, custom-location, auto-loadout-chain]
  affects: [character-creation, worldgen-routes]
tech_stack:
  added: []
  patterns: [rich-zod-schema, direct-draft-mapping]
key_files:
  created: []
  modified:
    - backend/src/character/generator.ts
    - backend/src/character/record-adapters.ts
    - backend/src/character/__tests__/generator.test.ts
    - frontend/components/character-creation/character-card.tsx
    - frontend/app/(non-game)/campaign/[id]/character/page.tsx
decisions:
  - Rich schema bypasses lossy legacy path; V2 import keeps legacy path for backward compatibility
  - HP defaults to 5 in rich schema via Zod .default(5)
  - Custom location uses __custom__ sentinel value in Select, auto-detects on mount
metrics:
  duration_minutes: 10
  completed: "2026-04-03T13:27:00Z"
---

# Quick Task 260403-m5v: Custom Starting Location + Auto Loadout + Rich Schema Summary

Rich character schema with background/persona/drives/frictions/goals populated by LLM, custom location text input, and auto-chained Apply Start to Preview Loadout.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | d53f0e6 | Rich character schema + fromRichParsedCharacter adapter |
| 2 | 57678ec | Custom starting location option in character card |
| 3 | 492d7ed | Auto-chain Apply Start into Preview Loadout |

## Task Details

### Task 1: Rich character schema + direct CharacterDraft mapping (backend)

Added `richCharacterSchema` alongside legacy `characterSchema` in generator.ts. The rich schema includes: backgroundSummary, personaSummary, drives, frictions, shortTermGoals, longTermGoals, and HP with `.default(5)`.

Added `fromRichParsedCharacter()` in record-adapters.ts that builds a CharacterDraft directly without going through the lossy fromLegacyPlayerCharacter path. Exported `classifyLegacyTags` for reuse.

Updated `parseCharacterDescription`, `generateCharacter`, and `generateCharacterFromArchetype` to use richCharacterSchema + toCharacterDraftFromRich. `mapV2CardToCharacter` still uses the legacy characterSchema path.

Updated generator tests to verify rich field population and new prompt content.

### Task 2: Custom starting location option in character card (frontend)

Added `<SelectItem value="__custom__">Custom...</SelectItem>` at the end of the Starting Location Select dropdown. When selected, a text Input appears below for free-text location entry. Auto-detects custom mode on mount when currentLocationName is not in locationNames.

### Task 3: Auto-chain Apply Start -> Preview Loadout (frontend page)

In `handleResolveStartingLocation`, after successful resolve + setCharacterDraft, automatically calls `previewCanonicalLoadout(campaignId, updatedDraft)` using the local updatedDraft variable (not stale closure). Wrapped in its own try/catch with previewingLoadout state management.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated generator tests for rich schema prompts**
- **Found during:** Task 1
- **Issue:** Existing tests checked for "derived runtime tags" and "compatibility view" strings that were removed from rich schema prompts
- **Fix:** Updated test assertions to check for new rich schema fields (backgroundSummary, personaSummary, drives, etc.) and added rich fields to fake character fixture
- **Files modified:** backend/src/character/__tests__/generator.test.ts
- **Commit:** d53f0e6

**2. [Rule 3 - Blocking] Merged codex/character-generation-polish branch**
- **Found during:** Initial setup
- **Issue:** Worktree was behind the target branch -- record-adapters.ts, character-card.tsx, and character page.tsx did not exist yet
- **Fix:** Fast-forward merge from codex/character-generation-polish to get the current codebase state
- **Files modified:** (merge only, no manual changes)

## Known Stubs

None -- all changes are fully wired.

## Self-Check: PASSED

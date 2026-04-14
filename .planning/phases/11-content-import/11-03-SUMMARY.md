---
phase: 11-content-import
plan: "03"
subsystem: worldbook-wizard
tags: [worldbook, upload, classification, wizard, campaign-creation]
dependency_graph:
  requires: [11-01, 11-02]
  provides: [worldbook-upload-step1, background-classification, worldbook-to-dna]
  affects: [campaign-creation-flow, suggest-seeds]
tech_stack:
  added: []
  patterns: [background-classification, optional-premise, drag-drop-upload]
key_files:
  created: []
  modified:
    - backend/src/routes/schemas.ts
    - backend/src/routes/worldgen.ts
    - frontend/lib/api.ts
    - frontend/components/title/use-new-campaign-wizard.ts
    - frontend/components/title/new-campaign-dialog.tsx
decisions:
  - "parse-worldbook endpoint no longer requires campaignId — classification runs before campaign exists"
  - "Campaign premise made optional in create schema — worldbook alone is sufficient"
  - "Worldbook entries wired through both handleNextToDna and handleResuggestAll for consistent DNA generation"
metrics:
  duration: 5min
  completed: "2026-03-28T14:17:15Z"
  tasks: 2
  files: 5
---

# Phase 11 Plan 03: WorldBook Upload on Step 1 Summary

WorldBook drag-and-drop upload on campaign creation Step 1 with background LLM classification feeding into DNA generation.

## What Was Done

### Task 1: Backend schema fix + wizard hook worldbook state + API wiring

- Made `campaignId` optional in `parseWorldBookSchema` — classification can now run before a campaign exists
- Removed `requireActiveCampaign` guard from `/parse-worldbook` route handler
- Made `premise` optional in `createCampaignSchema` (`.default("")`) — worldbook alone is valid context
- Added `classifyWorldBook()` API function in `frontend/lib/api.ts` (calls `/parse-worldbook` without campaignId)
- Extended `suggestSeeds()` to accept and pass `worldbookEntries` parameter
- Added worldbook state to wizard hook: `worldbookFile`, `worldbookEntries`, `worldbookStatus`, `classifyProgress`, `worldbookError`, `hasWorldbook`
- Implemented `handleWorldBookUpload(file)`: reads JSON, calls classifyWorldBook API, manages status lifecycle
- Implemented `handleWorldBookRemove()`: resets all worldbook state
- Updated `conceptReady` logic: allows empty premise when worldbook is classified
- Wired `worldbookEntries` into both `handleNextToDna` and `handleResuggestAll` suggestSeeds calls
- Added worldbook state cleanup to `resetFlow()`
- Updated error messages to differentiate worldbook vs no-worldbook scenarios

### Task 2: Step 1 UI - file upload zone + classification progress + worldbook status

- Added drag-and-drop file upload zone below research toggle on Step 1
- Upload zone accepts `.json` files via click or drag-drop
- Classification status shows: parsing (spinner + "Reading WorldBook"), classifying (spinner + "Classifying entries..."), done (green icon + filename + entry count), error (red icon + error message)
- Remove button (X) visible on all states except parsing — clears worldbook and returns to upload zone
- Upload zone disabled during busy states (pointer-events-none + opacity)
- Premise textarea placeholder changes to "(optional -- WorldBook provides context)" when worldbook loaded
- Cleaned up unused `Upload` icon import

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Campaign premise made optional in backend schema**
- **Found during:** Task 1
- **Issue:** Backend `createCampaignSchema` required non-empty premise, but plan specifies "premise is optional when worldbook is uploaded"
- **Fix:** Changed premise schema from `.min(1)` to `.default("")` allowing empty string
- **Files modified:** backend/src/routes/schemas.ts

## Verification

- `npm --prefix backend run typecheck` -- passes (0 errors)
- `npm --prefix frontend run lint` -- passes (0 errors, only pre-existing warnings in unrelated files)

## Known Stubs

None -- all functionality is fully wired. classifyProgress state exists but won't show batch numbers until backend supports SSE progress for classification (current backend returns all entries at once). The state infrastructure is ready for future SSE upgrade.

## Commits

| Hash | Message |
|------|---------|
| 0357725 | feat(11-03): worldbook upload on Step 1 with background classification |

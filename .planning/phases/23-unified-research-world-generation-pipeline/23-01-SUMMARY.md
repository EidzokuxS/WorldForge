---
phase: 23-unified-research-world-generation-pipeline
plan: 01
subsystem: worldgen
tags: [ipContext, campaign-config, worldgen-route, cached-research]

requires:
  - phase: 24-worldgen-known-ip-quality
    provides: IP-aware worldgen scaffolding and ipContext prompt plumbing
provides:
  - Persistent `ipContext` in campaign config.json
  - Generate route that reuses cached IP research instead of blindly re-researching
  - Regenerate-section route with cached franchise context
  - Frontend generate flow that passes `ipContext` into backend world generation
affects: [campaign-creation, worldgen-pipeline, regenerate-section, known-ip-generation]

tech-stack:
  added: []
  patterns: [campaign-config-cache, request-or-cache-ipContext, cached-research-handoff]

key-files:
  modified:
    - backend/src/campaign/manager.ts
    - backend/src/routes/worldgen.ts
    - backend/src/routes/schemas.ts
    - backend/src/worldgen/types.ts
    - frontend/lib/api.ts
    - frontend/components/title/use-new-campaign-wizard.ts
    - backend/src/campaign/__tests__/manager.test.ts
    - backend/src/routes/__tests__/worldgen.test.ts

key-decisions:
  - "ipContext is persisted per-campaign in config.json rather than held only in wizard React state"
  - "generate accepts request-body ipContext from the wizard, saves it, then reuses config cache for later runs"
  - "generate may still run on-demand research only as a safety net when no cached/request ipContext exists"
  - "route schema preserves canonicalNames and excludedCharacters so cached known-IP context is not truncated"

patterns-established:
  - "Request-or-cache pattern: use fresh wizard ipContext when present, otherwise fall back to campaign config"
  - "Known-IP generation state lives with the campaign, not the frontend session"

requirements-completed: [23-01]

duration: retroactive-closeout
completed: 2026-03-30
---

# Phase 23 Plan 01: Persist ipContext in Campaign Config Summary

**Retroactive closeout during planning reconciliation.**

## Accomplishments

- Added `ipContext` persistence to campaign config through `saveIpContext()` / `loadIpContext()`.
- Backend world generation now accepts `ipContext` from the wizard, saves it to config, and reuses the cached value for subsequent generation and regeneration flows.
- `regenerate-section` now reads cached `ipContext`, so section-level regeneration keeps franchise context instead of becoming “forgetful”.
- Fixed route validation so `canonicalNames` and `excludedCharacters` survive the request boundary and are not stripped before caching.
- Added regression coverage for campaign config persistence and generate-route cache handoff.

## Evidence

- `backend/src/campaign/manager.ts` persists and loads `ipContext`.
- `backend/src/routes/worldgen.ts` saves request `ipContext`, falls back to config cache, and forwards it into `generateWorldScaffold()`.
- `frontend/lib/api.ts` sends `ipContext` with `/api/worldgen/generate`.
- `frontend/components/title/use-new-campaign-wizard.ts` passes wizard `ipContext` into world generation.
- `backend/src/campaign/__tests__/manager.test.ts` verifies config persistence.
- `backend/src/routes/__tests__/worldgen.test.ts` verifies request-body and cached `ipContext` flows through generate.

## Verification

- `npm --prefix backend exec vitest run src/campaign/__tests__/manager.test.ts src/routes/__tests__/worldgen.test.ts`
- `npm run typecheck`

## Notes

- The original plan text mentioned saving `ipContext` during `suggest-seeds`, but the actual wizard flow creates the campaign later. The implemented solution is better aligned with the real UX: the wizard sends `ipContext` during `/generate`, and backend persists it at that point.

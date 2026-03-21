---
phase: 10-image-generation
plan: 01
subsystem: images
tags: [image-generation, openai-compatible, disk-cache, hono-routes]

# Dependency graph
requires:
  - phase: 03-world-state-mechanics
    provides: "Location/entity state for image prompts"
provides:
  - "Provider-agnostic image generation adapter (generateImage)"
  - "Prompt builders for portraits, locations, scenes"
  - "Disk-based image cache in campaigns/{id}/images/"
  - "Image serving endpoint GET /api/images/:campaignId/:type/:filename"
  - "On-demand generation endpoint POST /api/images/generate"
affects: [10-02-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: ["OpenAI-compatible image API via plain fetch", "disk-based image cache per campaign"]

key-files:
  created:
    - backend/src/images/generate.ts
    - backend/src/images/prompt-builder.ts
    - backend/src/images/cache.ts
    - backend/src/images/index.ts
    - backend/src/routes/images.ts
  modified:
    - backend/src/routes/schemas.ts
    - backend/src/campaign/paths.ts
    - backend/src/index.ts

key-decisions:
  - "Plain fetch to OpenAI-compatible endpoint instead of SDK dependency for maximum provider compatibility"
  - "b64_json response format to avoid URL-based downloads and simplify caching"
  - "Singular type in API schema (portrait/location/scene) mapped to plural directory names (portraits/locations/scenes)"

patterns-established:
  - "Image cache structure: campaigns/{id}/images/{type}/{entityId}.png"
  - "Provider resolution via resolveImageProvider returning null when disabled"

requirements-completed: [IMG-01, IMG-02, IMG-06, IMG-07]

# Metrics
duration: 4min
completed: 2026-03-19
---

# Phase 10 Plan 01: Image Generation Infrastructure Summary

**Provider-agnostic image generation backend with OpenAI-compatible API adapter, game-state prompt builders, disk cache, and image serving/generation endpoints**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-19T03:59:28Z
- **Completed:** 2026-03-19T04:03:28Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Provider-agnostic image generation via any OpenAI-compatible /v1/images/generations API
- Prompt builders that compose image prompts from character appearance, location tags, and scene events
- Disk-based image cache with campaign-scoped directory structure
- Image serving endpoint with proper content type and caching headers
- On-demand generation endpoint with Zod validation and settings-based provider resolution

## Task Commits

Each task was committed atomically:

1. **Task 1: Image generation module (generate + prompt-builder + cache)** - `e1c2690` (feat)
2. **Task 2: Image serving route + campaign paths + route registration** - `298cdaa` (feat)

## Files Created/Modified
- `backend/src/images/generate.ts` - Provider-agnostic image generation adapter with OpenAI-compatible API
- `backend/src/images/prompt-builder.ts` - Portrait, location, and scene prompt builders from game state
- `backend/src/images/cache.ts` - Disk-based image cache read/write/check
- `backend/src/images/index.ts` - Barrel exports for images module
- `backend/src/routes/images.ts` - GET (serve) and POST (generate) image endpoints
- `backend/src/routes/schemas.ts` - Added imageGenerateSchema
- `backend/src/campaign/paths.ts` - Added getImagesDir helper
- `backend/src/index.ts` - Mounted /api/images route

## Decisions Made
- Used plain fetch to OpenAI-compatible endpoint instead of any SDK dependency for maximum provider compatibility (OpenAI, OpenRouter, fal, GLM, any compatible API)
- Request b64_json response format to avoid URL-based downloads and simplify disk caching
- Non-visual tag filtering in portrait prompts (skip wealth/skill/relationship/faction tags)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Image infrastructure ready for Plan 02 to wire into character creation and gameplay
- Plan 02 can call generateImage() with prompt builders at character save, location visit, and scene events
- All exports available via backend/src/images/index.ts barrel

---
*Phase: 10-image-generation*
*Completed: 2026-03-19*

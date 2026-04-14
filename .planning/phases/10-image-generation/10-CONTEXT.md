# Phase 10: Image Generation - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds provider-agnostic image generation: character portraits on creation, scene illustrations for dramatic events, location backgrounds on first visit. Fully optional — togglable in settings, graceful degradation when disabled. Multiple providers supported (fal, GLM, SD, DALL-E, ComfyUI, custom OpenAI-compatible).

</domain>

<decisions>
## Implementation Decisions

### Provider Architecture
- Use Vercel AI SDK `generateImage()` where available (`@ai-sdk/fal`)
- For OpenAI-compatible providers (DALL-E, GLM, custom): use `@ai-sdk/openai` image generation
- For non-standard providers (ComfyUI, custom): HTTP adapter with configurable endpoint
- Provider config stored in settings (similar to LLM provider config)
- Image provider is a separate settings section from LLM providers

### Image Types
- **Character portraits**: generated on character creation from appearance tags, cached in `campaigns/{id}/images/portraits/`
- **Scene illustrations**: triggered by high-importance events during gameplay, async non-blocking
- **Location backgrounds**: generated on first visit to a location, cached in `campaigns/{id}/images/locations/`
- All images optional — game works identically without them

### Settings Integration
- New "Images" section in Settings panel (already has tab placeholder)
- Configure: provider, model/checkpoint, API key, default style prompt
- Toggle: enable/disable image generation globally
- Toggle: per-type (portraits on/off, scenes on/off, locations on/off)

### Image Prompt Construction
- Character appearance tags → portrait prompt (append style suffix from settings)
- Location structural tags + world premise tone → scene/background prompt
- Style prompt from settings appended to all image prompts

### Caching & Delivery
- Images cached in campaign directory (`campaigns/{id}/images/`)
- Served via static file endpoint or base64 in API response
- Cache key: entity ID + hash of prompt (regenerate on tag changes)

### Graceful Degradation
- No image provider configured → no images generated, no errors, no broken UI
- Image generation failure → log warning, continue without image
- Frontend: image placeholder when no image available

### Claude's Discretion
- Exact image prompt templates
- Which events trigger scene illustrations (importance threshold)
- Image serving strategy (static files vs base64 vs URL)
- ComfyUI adapter implementation details
- Image resolution/quality defaults

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/ai/provider-registry.ts` — `createModel()` pattern for provider abstraction
- `backend/src/settings/manager.ts` — settings load/save with normalization
- `frontend/app/settings/page.tsx` — Settings page with tabs (Images tab exists but empty)
- `backend/src/campaign/paths.ts` — campaign directory path helpers

### Integration Points
- New `backend/src/images/` module for image generation
- Settings schema extended with image provider config
- New API endpoints for image serving
- Frontend components for displaying images in panels
- Turn processor triggers scene image on high-importance events

</code_context>

<specifics>
## Specific Ideas

Image generation is optional in settings — graceful degradation is the priority.

</specifics>

<deferred>
## Deferred Ideas

- Item icons (v2 — VIS-01)

</deferred>

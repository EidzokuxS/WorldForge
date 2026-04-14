# Phase 26: Reusable multi-worldbook library for campaign creation - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 26 adds reusable worldbook composition to campaign creation. Users must be able to combine multiple lorebooks in one generation flow, mix already-processed library items with freshly uploaded JSON files, and reuse the processed result without reclassifying the same file every time.

</domain>

<decisions>
## Implementation Decisions

### Campaign Creation UX
- The existing single-upload WorldBook flow becomes a subset of a broader multi-source flow, not a separate path.
- Step 1 of campaign creation must support both selecting previously processed worldbooks from a local library and uploading additional new worldbooks in the same session.
- The UI should keep the current “create world” mental model intact: users still enter campaign concept once, but the knowledge source becomes a selectable set instead of one transient file.

### Library Persistence
- Processed worldbooks must live outside any single campaign so they can be reused across future campaign creation sessions.
- Library storage should persist classified entries plus metadata needed to identify, display, and reuse a worldbook without re-running classification.
- Selected library items should still be recorded on the created campaign so downstream generation/review can trace which sources were used.

### Merge Strategy
- Merge should happen from classified entries into one combined generation knowledge set, because the current pipeline already accepts classified entries and converts them into `IpResearchContext`.
- The combined context must preserve source provenance well enough for future debugging and conflict handling, even if the first UI only exposes a simple merged experience.
- Duplicate/conflicting names should be normalized deterministically rather than relying on upload order luck.

### Compatibility and Scope
- Existing `suggest-seeds` and `generate` entry points should continue to work for single-worldbook and no-worldbook campaigns.
- Phase 26 should focus on reusable multi-worldbook selection/storage/composition in campaign creation, not on editing lore cards after generation.
- The library should remain local-first and file-backed, matching the project's existing campaign storage model.

### the agent's Discretion
- Exact on-disk library layout, file identity strategy, and provenance metadata schema are at the agent's discretion as long as reuse, deduplication, and campaign traceability are preserved.
- The planner may split backend storage, merge logic, and frontend selection UX into separate plans/waves if that improves safety.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/worldgen/worldbook-importer.ts` already provides `parseWorldBook`, `classifyEntries`, and `worldbookToIpContext`, which is the current structured entry pipeline.
- `frontend/components/title/use-new-campaign-wizard.ts` already owns WorldBook upload, classification, DNA suggestion, and campaign creation state for the new-campaign flow.
- `frontend/lib/api.ts` already exposes `classifyWorldBook`, `suggestSeeds`, `importWorldBook`, and a client-side `worldbookToIpContext`.
- `backend/src/campaign/manager.ts` already persists `ipContext` and `premiseDivergence` in campaign config, so campaign config is an existing place to record selected sources.

### Established Patterns
- World generation currently accepts optional `worldbookEntries` through `suggestSeeds`, then converts them into one `IpResearchContext` in `backend/src/routes/worldgen.ts`.
- The wizard currently treats WorldBook state as one in-memory file/result pair (`worldbookFile`, `worldbookEntries`, `worldbookStatus`) rather than a collection.
- Local persistence in this project is file-backed per campaign with JSON config plus SQLite/vector stores; no central service/database exists for reusable content.

### Integration Points
- `frontend/components/title/new-campaign-dialog.tsx` is the Step 1 UI entry point that needs multi-select/library controls.
- `frontend/components/title/use-new-campaign-wizard.ts` is the orchestration layer that must switch from one transient worldbook to a selected collection.
- `frontend/lib/api.ts`, `backend/src/routes/worldgen.ts`, and `backend/src/routes/schemas.ts` are the request-contract seam for moving selected worldbook sets into seed suggestion/generation.
- `backend/src/worldgen/worldbook-importer.ts` is the best seam for reusable processing, normalization, and merged-context construction.
- `backend/src/campaign/manager.ts` is the obvious seam for storing selected source metadata on created campaigns.

</code_context>

<specifics>
## Specific Ideas

- Reuse the pending todo intent directly: upload one or more new lorebooks, optionally mix them with already processed lorebooks from a local library, and use the selected set as the shared knowledge base for DNA suggestion and scaffold generation.
- Keep source provenance available because mixed-universe generation will be hard to debug without knowing which worldbook contributed which entries.
- Preserve the current “optional premise when WorldBook exists” behavior, but extend it to “optional premise when at least one selected worldbook exists.”

</specifics>

<deferred>
## Deferred Ideas

- Rich conflict-resolution UI for duplicate entities across worldbooks can be deferred if Phase 26 ships a deterministic merge plus clear provenance metadata.
- Advanced library management features beyond selection/reuse during campaign creation are deferred unless they are required to make the basic library usable.

</deferred>

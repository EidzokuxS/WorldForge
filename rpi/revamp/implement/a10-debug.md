# A10 debug

## objective

Expose a backend debug snapshot for the revamp kernel so playtests can inspect the current scene, cast, routes, chat turns, and pending soft state hints.

## operating contract

- Build from persisted `CampaignKernel`.
- Work for draft kernels without setup.
- Require valid scene and cast references when `startingSetup` exists.
- Include counts for nodes, edges, cast members, turns, and pending soft hints.
- Include current scene summary when setup exists.
- Include present cast summary when setup exists.
- Include visible route summaries from the current scene.
- Include pending soft state hints from the last GM response.
- Include recent turn previews with stable turn indexes.
- Expose `GET /api/revamp/campaigns/:id/debug`.
- Do not call old `/api/chat`, old chat route modules, old worldgen routes, old player table writes, LLM providers, or StateWriter.
- Do not mutate `worldGraph`.

## agent lanes

### A1 source lock
Status: complete
Owner: A1
Scope: lock A10 to the architecture item "Debug View".
Output:

- [sourced] A10 follows A9 and precedes StateWriter.
- [sourced] Debug output shows kernel state for proof and playtest inspection.
- [rejected] A10 does not apply world changes.

### A2 current-state map
Status: complete
Owner: A2
Scope: inspect what the active kernel can expose.
Output:

- [inspected] A9 returns soft hints that StateWriter will need later.
- [proposed] Persist soft hints in `chatSession.pendingSoftStateHints`.
- [inspected] Current scene still comes from `startingSetup.anchorSceneId`.

### A3 reference extraction
Status: complete
Owner: A3
Scope: keep old debug and chat surfaces out of A10.
Output:

- [rejected] A10 does not import old chat routes.
- [rejected] A10 does not call model providers.
- [rejected] A10 does not read old player tables.

### A4 snapshot protocol
Status: complete
Owner: A4
Scope: define the debug snapshot shape.
Output:

- [proposed] Snapshot includes phase, turn index, counts, current scene, present cast, routes, pending hints, and recent turn previews.
- [proposed] Draft kernels return null/empty setup-dependent sections.
- [proposed] Invalid setup references fail closed.

### A5 proof harness
Status: complete
Owner: A5
Scope: prove debug snapshot behavior.
Output:

- [executed] Focused revamp backend suite passed: 14 files, 73 tests.
- [executed] Shared build passed.
- [executed] Backend typecheck passed.
- [executed] Frontend typecheck passed.
- [executed] Static search found no old chat/worldgen/provider/player-table markers in A10 production files.

### A6 cleanup and risk
Status: complete
Owner: A6
Scope: keep A10 backend-only while Droid GLM auth is unavailable.
Output:

- [rejected] A10 does not add a frontend UI.
- [rejected] A10 does not create StateWriter behavior.
- [rejected] A10 does not add fallback model behavior.

## integration notes

- Droid GLM-5.2 remains blocked in this shell by missing `FACTORY_API_KEY`.
- The A10 slice is backend JSON, so no UX/UI surface was implemented.

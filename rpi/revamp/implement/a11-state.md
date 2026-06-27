# A11 state

## objective

Apply the first authoritative world mutation from chat output: a `route_intent` soft hint becomes a `MoveCharacter` state change.

## operating contract

- Add `runtimeState.currentSceneId` to the Campaign Kernel.
- Set `runtimeState.currentSceneId` when A7 creates starting setup.
- Read chat and debug current scene from `runtimeState.currentSceneId`.
- Persist A9 soft hints in `chatSession.pendingSoftStateHints`.
- Apply only `route_intent` in A11.
- Require active phase, starting setup, current scene, visible route, target scene, and player `located_at` edge.
- Move the player by replacing the old player `located_at` edge with a new edge to the target scene.
- Update `runtimeState.currentSceneId` to the target scene.
- Clear `pendingSoftStateHints` after StateWriter processing.
- Return `RevampStateWriterResult` with applied and rejected change counts.
- Expose `POST /api/revamp/campaigns/:id/state/apply`.
- Do not call old `/api/chat`, old chat route modules, old worldgen routes, old player table writes, or LLM providers.

## agent lanes

### A1 source lock
Status: complete
Owner: A1
Scope: lock A11 to the architecture item "StateWriter".
Output:

- [sourced] A11 consumes GM response soft hints.
- [sourced] `MoveCharacter` is one of the StateWriter change types.
- [rejected] A11 does not implement relationship, item, hook, pressure, or secret changes.

### A2 current-state map
Status: complete
Owner: A2
Scope: inspect A9/A10 state needed for mutation.
Output:

- [inspected] A9 produced hints but needed persisted pending hints for reload-safe StateWriter input.
- [inspected] A10 needed a runtime current scene separate from immutable starting setup.
- [proposed] `runtimeState.currentSceneId` owns live scene position.

### A3 reference extraction
Status: complete
Owner: A3
Scope: keep old state and chat systems out of A11.
Output:

- [rejected] A11 does not import old chat routes.
- [rejected] A11 does not call model providers.
- [rejected] A11 does not use old player persistence.

### A4 state protocol
Status: complete
Owner: A4
Scope: define first StateWriter mutation.
Output:

- [proposed] `route_intent` requires a visible `route_to` edge from current scene to target scene.
- [proposed] Move changes the player `located_at` edge and runtime current scene together.
- [proposed] Unsupported hints are rejected and reported, then pending hints are cleared.

### A5 proof harness
Status: complete
Owner: A5
Scope: prove state application.
Output:

- [executed] Focused revamp backend suite passed: 15 files, 78 tests.
- [executed] Shared build passed.
- [executed] Backend typecheck passed.
- [executed] Frontend typecheck passed.
- [executed] Static search found no old chat/worldgen/provider/player-table markers in A11 production files.

### A6 cleanup and risk
Status: complete
Owner: A6
Scope: keep A11 to one mutation class.
Output:

- [rejected] A11 does not invent hidden movement fallbacks.
- [rejected] A11 does not apply unsupported hints silently.
- [rejected] A11 does not create UI.

## integration notes

- Droid GLM-5.2 custom model alias was verified with `droid exec --model custom:GLM-5.2-(Z.AI-Coding)-0 --list-tools`.
- The A11 slice is backend state logic, so no UX/UI surface was implemented.

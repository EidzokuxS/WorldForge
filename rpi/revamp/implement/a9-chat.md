# A9 chat

## objective

Process the first real player message after the A8 opening and persist a simple user plus assistant turn pair.

## operating contract

- Run only from `active`.
- Require `startingSetup`.
- Require a non-empty chat session whose first turn is the A8 assistant opening.
- Require a non-empty trimmed user message.
- Build context from the player cast, runtime current scene, present cast, visible routes, recent turns, and world tone input.
- Produce `RevampGmResponse` with text, suggested actions, and soft state hints.
- Append the trimmed user turn.
- Append the assistant turn.
- Persist response soft hints to `chatSession.pendingSoftStateHints`.
- Increase `turnIndex` by `2`.
- Return `{ kernel, response, userTurn, assistantTurn }`.
- Expose `POST /api/revamp/campaigns/:id/chat/message`.
- Do not call old `/api/chat`, old chat route modules, old worldgen routes, old player table writes, LLM providers, or StateWriter.
- Do not mutate `worldGraph`.

## agent lanes

### A1 source lock
Status: complete
Owner: A1
Scope: lock A9 to the architecture item "Simple Chat Loop".
Output:

- [sourced] A9 is `User Message -> Chat Context Builder -> GM Response -> Append Turn`.
- [sourced] StateWriter enters after this loop proves playability.
- [rejected] A9 does not own authoritative graph changes.

### A2 current-state map
Status: complete
Owner: A2
Scope: inspect the active kernel state left by A8.
Output:

- [inspected] A8 leaves `phase: active`, `turnIndex: 1`, and one assistant opening turn.
- [inspected] `runtimeState.currentSceneId` is the current scene source for A9.
- [inspected] `presentCastIds` and `route_to` edges are enough for first action handles.

### A3 reference extraction
Status: complete
Owner: A3
Scope: keep old chat as reference only.
Output:

- [rejected] A9 does not import old chat routes.
- [rejected] A9 does not call model providers.
- [rejected] A9 does not use old player persistence.

### A4 chat protocol
Status: complete
Owner: A4
Scope: define deterministic response behavior.
Output:

- [proposed] Classify input as scene look, present-cast talk, visible-route intent, or freeform action.
- [proposed] Return and persist soft hints for later StateWriter work.
- [proposed] Keep suggested actions aligned with A8 labels.

### A5 proof harness
Status: complete
Owner: A5
Scope: prove chat behavior.
Output:

- [executed] Focused revamp backend suite passed: 13 files, 69 tests.
- [executed] Shared build passed.
- [executed] Backend typecheck passed.
- [executed] Frontend typecheck passed.
- [executed] Static search found no old chat/worldgen/provider/player-table markers in A9 production files.

### A6 cleanup and risk
Status: complete
Owner: A6
Scope: keep A9 small.
Output:

- [rejected] A9 does not implement movement persistence.
- [rejected] A9 does not create a frontend chat UI.
- [rejected] A9 does not add fallback model behavior.

## integration notes

- Droid GLM-5.2 review prompt was written to `.codex/droid-prompts/a9-chat-loop-plan.md`.
- Droid GLM-5.2 custom model alias was verified with `droid exec --model custom:GLM-5.2-(Z.AI-Coding)-0 --list-tools`.
- Droid GLM-5.2 A9 review returned `Revise`: scene source field, soft state hint persistence, freeform copy, and Look copy multiline format.
- Current A9 code covers the review items: `createRevampChatMessage` reads `runtimeState.currentSceneId`, persists `chatSession.pendingSoftStateHints`, uses the revised freeform line, and formats Look output as scene, present cast, and routes on separated lines.

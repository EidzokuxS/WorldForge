# A8 opening

## objective

Create the first GM answer from `startingSetup` and persist it as the first assistant chat turn.

## operating contract

- Run only from `setup_ready`.
- Require `startingSetup`.
- Require an empty `chatSession`.
- Build `OpeningResult` from setup, active scene, present cast, visible routes, and world tone input.
- Persist opening text as the first assistant turn.
- Set phase to `active`.
- Set `turnIndex` to `1`.
- Return `{ kernel, opening }`.
- Expose `POST /api/kernel/campaigns/:id/opening`.
- Do not call old `/api/chat`, old chat route modules, old worldgen routes, or old player table writes.

## agent lanes

### A1 source lock
Status: complete
Owner: A1
Scope: lock A8 to the architecture item "GM Opening".
Output:

- [sourced] A8 produces `OpeningResult`.
- [sourced] The opening is the first GM answer.
- [sourced] A9 owns user message handling.

### A2 current-state map
Status: complete
Owner: A2
Scope: inspect setup and chat kernel fields.
Output:

- [inspected] `CampaignChatSession` stores role/content/time turns.
- [inspected] `setup_ready` means starting situation exists.
- [inferred] A8 can activate the campaign by appending one assistant turn.

### A3 reference extraction
Status: complete
Owner: A3
Scope: keep old chat as reference only.
Output:

- [rejected] A8 does not import old chat route code.
- [rejected] A8 does not call old worldgen routes.

### A4 opening protocol
Status: complete
Owner: A4
Scope: define output text and actions.
Output:

- [proposed] Text includes setup situation, active scene line, present cast, and setup handoff question.
- [proposed] Actions are literal handles: look, talk, and route movement.
- [proposed] Suggested actions are returned with the route response and stored text is the assistant turn.

### A5 proof harness
Status: complete
Owner: A5
Scope: prove opening behavior.
Output:

- [proposed] Prove first assistant turn persistence.
- [proposed] Prove phase moves to `active`.
- [proposed] Prove suggested actions from present cast and routes.
- [proposed] Prove fail-closed non-empty chat and missing cast/route targets.

### A6 cleanup and risk
Status: complete
Owner: A6
Scope: keep A8 small.
Output:

- [rejected] A8 does not process user input.
- [rejected] A8 does not mutate world state.
- [rejected] A8 does not generate frontend controls.

## integration notes

GLM-5.2 reviewed the A8 plan and returned `Plan is up-to-date.`

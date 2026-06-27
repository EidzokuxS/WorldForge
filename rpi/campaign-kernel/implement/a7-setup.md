# A7 setup

## objective

Create the first playable starting setup from the composed graph and cast registry.

## operating contract

- Run only from `cast_ready`.
- Require a player cast member.
- Require the player's `Character` node in `worldGraph`.
- Require exactly one player `located_at` edge.
- Anchor at the player's `SceneLocation` target when present.
- If the player is located at a `Location`, require exactly one contained `SceneLocation`.
- Fail when a location has zero or multiple contained scenes.
- Build `presentCastIds` from the player plus character nodes at the anchor scene.
- Build `presentCastIds` in stable order: player first, then other characters in graph node order.
- Build `nearbyCastIds` from character nodes in sibling scenes under the same parent location, using graph node order.
- Fail when the player placement target is neither `SceneLocation` nor `Location`.
- Leave pressure, hook, and hidden truth arrays empty until those systems exist.
- Persist `startingSetup`, move phase to `setup_ready`, and leave chat turns empty.
- Expose `POST /api/kernel/campaigns/:id/setup/start`.
- Do not call old worldgen routes, chat routes, scaffold generator, or old player table writes.

## agent lanes

### A1 source lock
Status: complete
Owner: A1
Scope: lock A7 to the architecture item "Starting Setup GM".
Output:

- [sourced] A7 produces `CampaignStartingSetup`.
- [sourced] A8 owns GM opening prose.
- [rejected] A7 does not create chat turns.

### A2 current-state map
Status: complete
Owner: A2
Scope: inspect current kernel, graph, and cast contracts.
Output:

- [inspected] A6b leaves phase at `cast_ready` after graph composition.
- [inspected] `CampaignStartingSetup` already has anchor, present cast, nearby cast, pressure, hook, truth, situation, and question fields.
- [inferred] A7 needs no shared type changes.

### A3 reference extraction
Status: complete
Owner: A3
Scope: use old code only as reference.
Output:

- [rejected] A7 does not call the old chat route.
- [rejected] A7 does not write the old `players` table.

### A4 setup protocol
Status: complete
Owner: A4
Scope: define anchor and cast selection.
Output:

- [proposed] Player `located_at` edge is the setup authority.
- [proposed] Scene anchor wins over location anchor.
- [proposed] Location anchor resolves only when it contains exactly one scene.
- [proposed] Sibling scene cast becomes nearby cast.

### A5 proof harness
Status: complete
Owner: A5
Scope: prove setup behavior and failures.
Output:

- [proposed] Prove direct scene anchor.
- [proposed] Prove single contained scene anchor.
- [proposed] Prove present and nearby cast.
- [proposed] Prove user-guided start text.
- [proposed] Prove missing character node, missing `userStart`, and ambiguous location failures.
- [proposed] Prove API persistence.

### A6 cleanup and risk
Status: complete
Owner: A6
Scope: keep A7 small.
Output:

- [rejected] A7 does not invent pressure or hooks.
- [rejected] A7 does not call a model.
- [rejected] A7 does not render frontend controls.

## integration notes

A7 creates setup data. A8 turns that data into the first GM opening.

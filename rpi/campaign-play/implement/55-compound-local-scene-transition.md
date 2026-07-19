# Compound route-to-local-scene transition

## Outcome

A player action can now cross one known route and continue into one grounded exact scene at the destination without collapsing the whole action into a broad-location move. Judge preserves the post-travel observation or attempt, Game Master proposes the local scene, and code owns the two durations, transition order, topology identity, receipts, and persistence.

## Field diagnosis

Diagnostic campaign `b4163989-7ed6-48cf-9dbc-f4e1d45c3a66`, action 29:

`Take the stair down to Cinderwatch Undercity and look for the beacon house stores desk, without returning to the chapel advocates.`

Judge reduced the compound request to pure `move`. Rulebook therefore committed only the two-minute route traversal and one event. Narration found the stores in prose while the player remained mechanically in the broad `Cinderwatch Undercity`, with Lucia Cordeglio, Renzo Malfatti, the chapel aftermath, and the stores all projected into one scene.

## Contract

- For travel followed by contact, observation, or an attempt, `normalizedIntent.kind` names the action after travel and `movementRouteHandle` carries the known route.
- Travel followed by grounded search, inspection, or examination is `observe`, or `attempt` when an obstacle makes the result uncertain; it is not pure `move`.
- A destination `enter_local_scene` must follow every known-route movement effect and precede one actorless discovery or scene event.
- Total elapsed time splits into the route's code-owned `travelCost` and a positive local transition cost of at most ten minutes.
- Compilation emits route time, known movement, local time, materialized local movement, and public event in that order. Rulebook independently validates each transition and the time command immediately preceding the materialized move.
- A proposed child scene name equal to its anchor name is a model-contract failure. Code rejects it rather than renaming the scene or writing replacement prose.

## Live validation

Action 31 repeated the compound route from Cinderwatch Beacon Terrace. Turn `turn-player-action:55aac4c329dabfa7fc56763c72325df73ce9c3f7` committed one batch with five commands: two-minute route time, terrace-to-undercity movement, two-minute local time, materialized local movement, and one discovery. Receipts advanced world version 50 to 54 without replay. Reload restored the child placement and its only return route.

That first child correctly proved mechanics but GLM 5.2 named it `Cinderwatch Undercity`, matching the anchor and leaving the UI visually broad. The new semantic guard rejects that proposal shape.

Action 32 then advanced through the already established stores opening. Turn `turn-player-action:c620bfbd9d2345a1b03dc5eb1859cf1d28ffcc53` materialized `Beacon House Stores` with one-minute travel, moved Mara there, and recorded one public discovery. World version advanced 54 to 56. The UI showed no remote actors, one route back to `Cinderwatch Undercity`, coherent stores-only choices, and no chapel convergence. Reload preserved the same scene, text, route, and absence of Lucia and Renzo.

Screenshot: `output/playtests/campaign-play/diagnostic-compound-local-scene-r31/action-32-beacon-house-stores.png`, SHA-256 `C4F2A288E9A5561B08494443B0E495C0EC0AC8C6CD0D601D71C4C6E05DC03664`.

## Validation

- Judge, Game Master, and Rulebook focused tests: 107 passed.
- Backend typecheck passed.
- The compound regression proves exact command order, route/local time split, destination anchoring, event exposure at the child scene, and atomic rejection when no local time remains.
- The local-scene regression proves an anchor-name collision is rejected before Rulebook mutation.

## Playtest reading

The final prose is coherent and grounded in Mara's mundane goal. It moves from the corridor to a quiet stores counter, identifies visible uniforms, wash kits, and mending materials, and honestly reports that no keeper is present. Suggested actions stay local: inspect supplies, wait for the keeper, or leave. The scene no longer drags the borrowed-shadow investigation or remote actors back into focus.

The stored description redundantly distinguishes the chapel vault from the advocates' vault. This is minor prose friction, not a mechanical contradiction or a reason to add backend-authored copy.

## Semantic review

`humanizer` and `deslop` review kept the Judge and Game Master instructions concise and technical. They describe semantic classification, order, timing, and the anchor-name rejection without adding example-specific names, hidden retries, fallbacks, model switches, or backend-authored scene prose.

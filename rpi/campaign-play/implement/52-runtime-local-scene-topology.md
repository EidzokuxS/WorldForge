# Runtime local scene topology

## Outcome

A grounded local traversal that changes the player's exact position becomes mechanical topology rather than presentation-only prose. Accepted Campaign World provenance remains immutable.

## Evidence and criteria

- R14 action 58 exposed a remote NPC observation while the player was several minutes down a corridor because both actors still shared one broad persistent placement.
- R14 action 59 let the player retrace that corridor for zero mechanical time because only the later accepted-world route owned a cost.
- A successful local traversal must therefore persist one exact scene, one outbound route, one return route, and the player's new exact placement under one Rulebook receipt.
- Direct perception must use the exact new placement after commit and after reload.
- Returning must consume the code-owned route cost before an accepted-world exit route becomes available.
- The model may author the public scene name and stable sensory description. Code owns IDs, endpoints, authority, travel cost, transition order, world version, hash, receipt, and persistence.

## Scope

- Extend the existing `locations`, `location_edges`, `actor_placements`, movement command, Rulebook, visibility, and public-route path.
- Keep accepted snapshot bytes and accepted-definition validation unchanged in meaning.
- Do not add a second local movement subsystem, prose parser, compatibility fallback, or standalone smoke suite.

## Validation

1. Focused contract, repository, Rulebook, Game Master, turn-runtime, visibility, and database migration checks.
2. Backend typecheck.
3. A real campaign journey: enter a grounded local scene, wait while an actor acts at the anchor, verify no direct-perception leak, take the return route at its exact cost, leave through an accepted-world route, reload, and compare world hash and placement.

### Automated evidence

- `campaign-play-state-repository.test.ts`: 16 passed, including receipt-authorized local-scene reload and immutable runtime definitions.
- `campaign-play-database.test.ts`: 17 passed, including migration guards for accepted and `campaign_play` definitions.
- `rulebook.test.ts`: 38 passed, including exact materialization order, forged-ID rejection, cost mismatch rejection, return routing, and the event anchored in the newly committed scene.
- `game-master.test.ts`: 36 passed. Projection, bootstrap, visibility, actor proposal/scheduler, and turn-runtime checks: 133 passed.
- Backend typecheck and `git diff --check`: passed.

### Product-use evidence

The real journey used clean clone `235aab4b-6eeb-4da9-a9cb-87a53a860749` (`Black Rain Passage — Local Depth Playtest`) through `http://localhost:3000`, with the backend reading its normal SQLite campaign store and GLM 5.2 producing the Game Master and narrator stages.

- From `Vesper Quay Undercity`, the player examined the numbered vault hall and then naturally moved to its far end. The model supplied only the public name and description; Rulebook materialized `Far End of the Vault Hall`, placed the player there, and exposed only the two-unit return route.
- SQLite recorded one `campaign_play` location and two immutable directed routes under receipt `receipt:118d41bc6446f87a385dfe15fe11d1d8`, all at world version 20. Both routes cost two units and the player placement pointed at `scene:4933f3dfd69ff5004e17b43ff015289e`.
- Waiting ten minutes in the child scene produced only a faint, unresolved murmur. Three accepted NPC actions elsewhere in the world remained location-scoped `local_aftermath` events and did not leak into direct perception.
- Returning to the Undercity advanced time from minute 20 to minute 22, exposed both the persisted child route and the accepted Tollhouse route, and restored Nico Bardini as locally present.
- After entering the Tollhouse, Tomasso Gravelle's off-screen action became a visible physical aftermath: the contract pages had been re-sorted and one face-down page showed the margin note `strand`. His private goal and action summary never appeared in player prose.
- Browser reload preserved world version 23, runtime revision 315, placement, both Undercity routes, and projection hash `f4735f2acb68a603e364a71f20e724491bd316d3d6aa0b4df9a6b948123b51c4` exactly.
- Backend restart preserved world version 25, runtime revision 337, Tollhouse placement, accepted routes, and projection hash `619daeca45bdd1fa96b0bc9b2802aaa5ce11239217023850e9a0d642b7ef8122` exactly. Returning to the Undercity after restart exposed the same persisted child route, and taking it restored the same local scene at the same two-unit cost.

The live scheduler deferred Nico Bardini's due action while higher-priority due actors ran, so this campaign did not produce an anchor-NPC action during the two waits. Exact-placement isolation was nevertheless observed for multiple off-screen actions, while the focused visibility and Rulebook checks cover the anchor-versus-child boundary deterministically. This is retained as a bounded playtest limitation, not replaced with a forced fixture or fallback.

## Semantic review

Main-agent `humanizer` and `deslop` review completed for the changed Game Master instructions and architecture prose. The review separated model-authored public scene description from code-owned topology and rewrote the travel-cost sentence so `elapsedMinutes` is an accepted input to deterministic authority, not model-owned mechanics. No player-facing copy or compatibility language was added. Static semantic verdict: pass; live model behavior remains part of the real campaign validation below.

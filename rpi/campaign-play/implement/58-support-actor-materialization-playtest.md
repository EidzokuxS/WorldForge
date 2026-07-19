# Support-actor materialization clean playtest

## Outcome

An ordinary player contact can now turn one previously unnamed local resident into a typed support actor. The Game Master proposes the resident's identity, profile, goal, motivation, and immediate intent. The Rulebook owns the actor ID, placement, plan, schedule, receipt, persistence, and event ordering. Materialization and the contact that justified it commit in one batch, so the actor cannot appear as durable state without the visible encounter that introduced them.

The clean-world journey created courier Dario Calvo only after Nera Voss offered a concrete service to independent couriers. Dario survived reload, remained in the local cast, accepted a repair with an inventory cost and elapsed time, received a new actor-owned plan, and entered the normal scheduler. An earlier offer to an uninterested patrol pair produced no actor, confirming that contact does not force materialization.

## Authority boundary

- `materialize_support_actor` is available only to Game Master player-action batches.
- It requires limited-or-better contact with unnamed ambient residents, no existing actor target, a stationary player, and an immediately following dialogue or interaction event bound through `introduced-support-actor`.
- At most one resident can materialize in a batch.
- The model authors semantic identity and intent. Code derives IDs, versions, location, visibility, scopes, receipt, initial plan step, schedule, and timing.
- The actor, goal, plan, schedule, receipt, and introduction event persist in the same Rulebook transaction.
- Handling or scenic presence remains an event. It does not create an actor, possession, obligation, or relationship by implication.
- Existing campaign hashes are intentionally not adapted. Validation used a clean clone of the accepted world rather than a compatibility path.

## Clean-world provenance

- Accepted source campaign: `e5e41b51-d60f-44e2-90c6-202dae12a74f`.
- Clean clone: `cde67b5c-e6da-49b0-86d1-ffc7ec64786d`.
- Clone name: `Black Rain Passage [support actor playtest]`.
- Clone manifest: `output/playtests/campaign-world-runs/task18-lane-b-black-rain/campaigns/cde67b5c-e6da-49b0-86d1-ffc7ec64786d/clone-manifest.json`.
- Player: Nera Voss, a traveling cobbler seeking ordinary paid repair work.
- Model: GLM 5.2 through the configured Z.AI Coding Plan provider.

## Manual journey

| Step | Player action | Turn | World version | Observed result |
| --- | --- | --- | --- | --- |
| Contact | Offer free satchel inspection to independent couriers in Cinderwatch Undercity | `turn-player-action:a3c6682a03b350f8fd30a4b40fff56a856da68b7` | 15 -> 17 | The Rulebook committed `advance_world_time`, `materialize_support_actor`, then `record_world_event`. Dario Calvo appeared with a first-light eastbound run and rain-softened buckle stitching. |
| Continuity | Agree to mend Dario's buckle strap | `turn-player-action:e4773bd7ff7200dd720b543e3e190c1f944169c1` | 17 -> 19 | Twelve minutes passed; wax and leather scraps were consumed; the repair completed. Dario's actor job settled and produced plan version 2: inspect the remaining seams, spread word about Nera, then scout the toll road before departure. |
| Observation | Clean tools for twenty minutes and watch without directing Dario | `turn-player-action:01be52efe976d0a3061e64c6251977c238c152a7` | 19 -> 20 | The narration preserved the repaired buckle and found softer stitching at the bottom gusset. Dario remained present after reload. His scheduled job was deferred on this turn while three other actors settled, so this paragraph is a Game Master consequence of the player's observation, not evidence of a second autonomous Dario action. |

The first accepted Dario actor proposal was created before actor-event attribution was corrected and therefore stored a null performer. The contract now requires a performer for actor-owned dialogue and interaction and preserves a performer for actor-owned discovery or scene events; focused tests verify the corrected command. World-authored discoveries may still remain unattributed.

## Prose and play reading

The introduction is earned and compact: Dario steps out of the courier traffic because Nera offers a service he needs, gives only the identity and immediate problem required for the scene, and retains a departure goal unrelated to the player. He is not promoted into a quest giver, companion, faction proxy, or central-cast figure.

The repair turn remembers the exact strap, buckle, and black-rain damage. It also pays for the action mechanically with time and materials. The next observation carries the same physical state forward: the repaired buckle is firm while the bottom gusset remains soft. This continuity reads as one object changing through play rather than three disconnected model improvisations.

The current scheduler evidence is narrower than the prose. Dario demonstrably settled once, replanned, and received a next-act schedule. On the following due turn he was deferred while three other actors settled. The UI narration still advanced his inspection because the player explicitly watched him, but that is not proof that the background scheduler selected him. This distinction remains visible in the job ledger and is not collapsed into a stronger autonomy claim.

## Failures and corrections

- The first live Game Master attempt exhausted a very large structured schema and did not produce a usable proposal. The command surface was reduced to the semantic fields the model actually owns; output limits and model choice were not changed.
- A later proposal omitted optional `nextAction`. The compiler uses the authored goal as the initial method when that optional field is absent. It does not synthesize prose or retry with a different model.
- The first live settlement reached `planned` but failed at SQLite ledger checks that enumerated old command, receipt, and event kinds. Migrations `0042` and `0043` rebuild the affected ledgers and event guard while preserving rows, indexes, triggers, foreign keys, and integrity.
- The first next-turn admission omitted runtime actors from proposal bindings. Adding runtime actor bindings allowed Dario to use the same proposal service as generated actors.
- Actor-owned discovery events originally lost their performer. Proposal compilation now carries the proposing actor ID; the schema permits a performer on discovery and scene events without requiring one for world-authored events.

## Evidence

- `support-actor-continuity.png` - SHA-256 `9B5D093BEA8545E893F9D840A9CED59C07B97B8CBE3094E20521114514BB1A61`.

The screenshot is under `output/playtests/campaign-play/diagnostic-clean-cinderwatch-r38/`. The campaign database retains the correlated command, receipt, actor, goal, plan, schedule, actor jobs, proposals, and world events used for the reading above.

## Validation

- Manual product journey: one refused ambient contact, one earned materialization, reload, second interaction, mechanical repair consequence, actor settlement and replanning, another reload, and an observation turn.
- Migration probe: new command, receipt, and event kinds insert successfully; `PRAGMA integrity_check` returns `ok`; `PRAGMA foreign_key_check` returns no rows.
- Focused contract, Rulebook, Game Master, scheduler, projection, repository, visibility, actor-proposal, and turn-runtime suite: 220 passed across 9 test files.
- Backend typecheck passed.

## Semantic review

`humanizer` and `deslop` review kept the prompt literal and domain-owned. It contains no setting example, canned identity, backend-authored scene prose, model switch, retry policy, or compatibility fallback. The model proposes who the resident is and what they want; the Rulebook decides whether that proposal can become mechanical state.

The implementation applies `pgg:guide:practical-rule-check-decision-interface-and-consequence`: proposal, normalization, authoritative transition, receipt, persistence, presentation, and reload evidence remain separately inspectable.

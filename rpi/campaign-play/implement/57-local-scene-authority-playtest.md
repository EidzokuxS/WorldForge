# Local-scene authority clean playtest

## Outcome

A clean clone of the accepted Black Rain world completed character creation, opening, five manual player actions, one backend restart, one reload, and one interrupted-turn recovery. The player remained a mundane traveling cobbler. The world supplied local refusals, travel, observation, ambient movement, and an unhelpful patrol without turning her into the center of its larger conflict.

The playtest also reproduced one Game Master contract defect twice: a route-less local traversal proposed a child scene with the same name as its current anchor and described Lucia Cordeglio as present without moving her. The compiler rejected both proposals before mutation. Game Master now receives a code-owned `LOCAL_SCENE_AUTHORITY` block with the literal forbidden current/destination names and the complete named-person roster allowed in a newly materialized scene. It still authors the scene; code neither renames it nor writes replacement prose.

## Clean-world provenance

- Accepted source campaign: `e5e41b51-d60f-44e2-90c6-202dae12a74f`.
- Clean clone: `9b3b1cf6-f1d4-4f6e-8199-c10b70adc0c2`.
- Clone operation: `031cae37-f3e0-4f6a-92f5-0e37a9ddeb63`.
- Player: Nera Voss, a middle-aged traveling cobbler looking for ordinary paid repair work, food, and dry shelter.
- Opening conditions: Cinderwatch, outsider, just arrived, looking for work.
- Model: GLM 5.2 through the configured Z.AI Coding Plan provider.

The opening first stopped after a 333-second malformed structured response. Its output ended normally at 30,677 tokens but could not be parsed. The normal Resume route produced the accepted opening without a fallback or model switch.

## Manual journey

| Step | Player action | Turn | World version | Observed result |
| --- | --- | --- | --- | --- |
| Opening | Enter Cinderwatch as an outsider looking for work | `turn-opening:8aad243e91a8f1254b9b58bc0cca577e88cd6ea0` | 5 → 12 | Aldo refused beacon work and pointed only to the plausible fact that patrol boots wear quickly. Two people were present, not the whole cast. |
| 1 | Ask Aldo where patrol boots are repaired and request a dry bench | `turn-player-action:08ba5e3dd473764ab1e03e934e19386bc43819af` | 12 → 13 | Aldo kept his role boundary, refused space he did not control, and directed Nera to undercity patrol logistics. |
| 2 | Descend and look for patrol resupply | `turn-player-action:b1d4302358d38e78eb4efe866f9fbd2db4116eac` | 13 → 17 | Known-route travel plus local search materialized `Cinderwatch Undercity Corridors`. No remote actor followed. The office was not invented; worn flooring and crates supplied a grounded lead. |
| 3 | Follow the worn eastern passage, stopping at any real barrier | `turn-player-action:37437ba97c3a431053d9744d40f7d3124f2c6678` | 17 → 21 | Two pre-fix proposals were atomically rejected. After the prompt fix and restart, Resume materialized `Undercity Deep Refuge`; `visibleActors` remained empty and Lucia disappeared from the proposal. Reload restored the exact scene and return route. |
| 4 | Wait ten minutes and watch boots and crates | `turn-player-action:9fb4da2ae4da93121506be8eb426619d968b3794` | 21 → 22 | Time advanced from 00:08 to 00:18. Patrols, couriers, crates, and debtors moved in different directions; no convenient office or NPC appeared. |
| 5 | Offer paid repair to a passing patrol pair | `turn-player-action:e251eaf043ba0a50e97c6f6c81e88c556b9bbd86` | 22 → 23 | The on-duty pair walked past without stopping. The hub continued around Nera, and no job, contract handler, possession, or obligation was invented. |

## Contract change

- `LOCAL_SCENE_AUTHORITY.forbiddenNames` contains the current exact scene and, for compound travel, the broad destination anchor. A new local name must differ case-insensitively from every entry.
- `LOCAL_SCENE_AUTHORITY.presentPeople` is the complete named-person roster permitted in a newly materialized scene. It is empty because `enter_local_scene` moves only the player.
- `CANONICAL_PEOPLE` remains identity context, not placement authority.
- The existing compiler still rejects anchor-name collisions, invalid timing, order, and effects. It does not normalize names or repair model prose.

## Playtest reading

The strongest sequence is the move from Aldo's refusal into the undercity. Each step follows evidence the player actually earned. The office remains unknown across search, deeper traversal, and waiting; the world does not reward persistence by fabricating a convenient answer. The prose stays concrete and readable, and the scene remains active even while Nera gets nowhere.

Two presentation weaknesses remain. `What changed` and `The moment` often repeat the same paragraph, and the opening event card uses the meta phrase `the player` before narration switches to `you`. Suggested local traversal also says `Try to reach Cinderwatch Undercity` while the player already occupies a child of that location, so the label is mechanically bound but spatially confusing.

The fifth action exposed the next gameplay gap. Ambient patrols can supply a one-turn scenic reaction, but they are not typed support actors: no identity, goal, plan, schedule, or future continuity can attach to them. The follow-up clean-world playtest in `58-support-actor-materialization-playtest.md` now implements that Rulebook contract and follows one earned resident through creation, reload, a second interaction, an actor-owned plan, and scheduling.

## Evidence

- `opening-cinderwatch.png` — SHA-256 `F28DD09DF03D5D909C333F6C5E3CBF3BE46DAF4B693414FA5BF2463E60122DFE`
- `action-1-aldo-refusal.png` — SHA-256 `6CADAD7E091A745DFCC43EEEBE0084E4493B9368A89064304356259216981ABA`
- `action-2-undercity-corridors.png` — SHA-256 `529244A5C16C2285D03A15D4D35F1DA5B2ADB6FDD809F57F7A01E4B36062AB4D`
- `action-3-deep-refuge-after-fix.png` — SHA-256 `7DB71E3EE79F52E2B29919404DD12ABD06C2896FA8E45B5B7477EE4D5B6F8F52`
- `action-4-ten-minute-watch.png` — SHA-256 `B8485330456ABB7DC06B7A1E1CB8400C964FB6BE2CE6580939331EA41A9149FB`
- `action-5-ambient-patrol.png` — SHA-256 `78C771BE5FD2DA5D0780377D1B5A380F64426138DDED1D13749931A952F62DDD`

All files are under `output/playtests/campaign-play/diagnostic-clean-cinderwatch-r38/`.

## Validation

- Game Master focused tests: 37 passed.
- Backend typecheck passed.
- Real UI: opening plus five completed player actions.
- Interrupted turn: two atomic rejections, backend restart, Resume on the same turn ID, accepted commit, and reload persistence.
- Final state: world version 23, Nera at `Undercity Deep Refuge`, no visible named actors, unchanged three-item inventory, no obligations.

Approximate wall-clock completion was 772 seconds for opening including its failed first attempt, then 112, 263, 906, 305, and 175 seconds for actions 1–5. Action 3 includes both rejected proposals, diagnosis, code change, restart, and successful Resume; these durations are product evidence, not timeout targets.

## Semantic review

`humanizer` and `deslop` review kept the new prompt contract literal and technical. It adds no scene example, fallback, retry, model switch, auto-name, or backend-authored prose. The model still owns the local name and description; code supplies only the names and people it may not contradict.

The decision used `pgg:guide:practical-rule-check-decision-interface-and-consequence`. Field evidence was returned as `pgg:request:rq-20260719t073302826z-fb367525`.

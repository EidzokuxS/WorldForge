# Current-scene observation authority

## Outcome

Keep journal continuity available to Narrator without turning every remembered observation into a current-location fact for Judge and Game Master.

## Field evidence

- Campaign: `e5e41b51-d60f-44e2-90c6-202dae12a74f`
- Run: `pristine-60-glm52-black-rain-54df81f3-r14-typed-scene-topology`
- Player action 4: `Examine the numbered glass vaults`
- Turn: `turn-player-action:15ffff95a9511b1fd2af1de7ebd38de4ce8671c7`
- Screenshot: `output/playtests/campaign-play/pristine-60-glm52-black-rain-54df81f3-r14-typed-scene-topology.session/screenshots/action-4-tollhouse-brazier-leaks-undercity.png`
- SHA-256: `E2B6DEAA40E233D5F19338CB863F3FD9586BF4E59ABC38117F9018262337EA8B`

Sera had moved from Vesper Quay Tollhouse to Vesper Quay Undercity. Her vault observation nevertheless ended with smoke and ash from `the iron brazier nearby`. The brazier belongs to the tollhouse opening scene.

The frozen action-4 admission supplies exact root-cause evidence. Its source packet correctly labels observation `observation_be981c87b53169a2716b45db` as `Vesper Quay Tollhouse`, but `buildPublicAuthority` flattened that global Narrator continuity entry into an unqualified Judge/Game Master visible fact. Game Master then treated remembered tollhouse detail as current undercity perception.

## Architecture delta

- Narrator packet `continuity` remains chronological presentation history. It is not admitted wholesale as Judge or Game Master fact authority.
- Action admission still supplies every newly visible observation from the current public moment.
- `relevantPlayerHistory` remains the bounded recovery path for a prior player observation whose terms match the submitted action at the current authoritative location.
- Actor continuity, public player-history actions, typed location, routes, possessions, obligations, and current visibility retain their existing owners.

This removes an invalid authority grant rather than asking the model to ignore a supplied fact. It adds no prompt prohibition, fallback, retry, repair, provider switch, backend-authored prose, compatibility path, or journal deletion.

## Validation

- The consecutive-action regression now requires a populated source-packet continuity window while proving none of those handles enter an unrelated next action's `visibleFacts`.
- The targeted turn-runtime regression is presently unavailable before this assertion because the pre-existing opening fixture interrupts at `model_contract_invalid`; the failed run remains verification evidence rather than a blocker or a reason to change this locality repair.
- Backend typecheck passed.
- Live actions 5–7 crossed Undercity → Tollhouse → Beacon Terrace through authoritative open routes, then examined only the fresh steel shavings at the sulfur-burner. Turn `turn-player-action:a0138b76aa0a449a423944d82a8e2b822ed17faf` admitted a source packet with five continuity observations but zero continuity handles in `visibleFacts`; no brazier, ash, vault, or other prior-location term entered the Judge/Game Master frame or rendered result.
- The action-7 prose remained local to steel shavings, corroded metal, the burner housing, and unknown authorship. Screenshot `output/playtests/campaign-play/pristine-60-glm52-black-rain-54df81f3-r14-typed-scene-topology.session/screenshots/action-7-current-scene-authority-accepted.png`; SHA-256 `9D8925625C2D10CC97B85D1F19D6DF80BF3570F616B84FC69F93F6BC08BC0874`.
- Product-use acceptance passed for the repaired cross-location observation journey. This one campaign proves the mechanism and direct rendered path, not general model reliability or player comprehension.

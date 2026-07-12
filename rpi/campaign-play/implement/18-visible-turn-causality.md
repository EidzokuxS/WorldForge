# Task 18: visible turn causality

Status: fixed and verified through the rendered live campaign.

## Failure found by manual play

The diagnostic campaign `cb805a6c-e78e-47be-b029-197ef8652a90` reached seven completed player actions after opening. Two consecutive attempts to ask Mira Saltwick about the seven-bell pattern exposed a causality break:

- Judge accepted a limited contact result.
- Game Master committed a dialogue event saying Mira answered.
- The same turn's actor settlement advanced Mira's own plan and moved her to another location.
- Visibility projected only the post-turn cast and a generic “You witnessed a change nearby.”
- Narrator saw that Mira was absent, lost the accepted dialogue receipt, and said the question went unanswered.

The autonomous departure was valid. Mira's active plan required her to carry the recording between `bellfall-reach` and `north-bell-shrine`. The defect was epistemic: the player could perceive both the conversation and her departure, but the narrator packet contained neither concrete ordered fact.

## Contract change

- Actor actions at the human player's current location now receive a `direct_perception` exposure. Nonlocal actor work remains protected.
- A directly perceived actor move projects a deterministic public fact such as `Mira Saltwick left for bellfall-reach.` It exposes names and destination, never the actor's private goal or stakes.
- Game Master `record_world_event` commands automatically include the human actor in their affected references. The model does not need a private player handle.
- A directly perceived Game Master event from the current player turn may project its grounded summary as `Your action`; unrelated or protected events keep generic or channel-specific copy.
- The narrator still receives the final visible cast, so it can describe the accepted player result and then the NPC departure in causal order.

No fallback, compatibility path, or model-authored authority was added.

## Live verification

After the first half of the fix, Mira departed again during Wren's question at `north-bell-shrine`. The new actor exposure worked: the journal and narration both stated that she left for `bellfall-reach`, and the action list removed `Talk to Mira Saltwick`. That run also proved the remaining gap because the dialogue receipt was still generic.

After the Game Master binding fix, Wren asked Pilgrim Doss what he had learned from his ledgers. The completed turn:

- kept Doss visibly present at `north-bell-shrine`;
- described the partial ledgers, the tightening intervals, and Doss's inability to connect them reliably to the flood surge;
- preserved the pressure boundary that Doss has fragments while Mira holds the complete recording;
- projected a concrete `Your action` consequence summarizing what Doss showed Wren;
- completed Judge, Game Master, actor work, visibility, and Narrator without fallback or retry.

Prose verdict: the Doss response is coherent, specific, and useful without turning him into a quest dispenser. It answers the question within his established knowledge and leaves an unresolved lead. The earlier two unanswered Mira turns remain diagnostic contamination and do not count as pristine acceptance.

The generic CYOA menu, raw location slugs, desktop action-dock overlap at 1280x720, and long turns with multiple actor-replan model calls remain separate quality work.

Humanizer/deslop verdict: the new public strings are short, concrete, and free of model-facing rhetoric. No rewrite was needed.

## Verification

- Actor proposal tests prove co-located actions override the opening seed with direct perception.
- Visibility tests prove concrete player-action and actor-movement facts enter the public packet while hidden cause, goal, distant, and expired tokens remain absent.
- Turn-runtime tests prove the new exposure survives serial actor settlement.
- Game Master tests prove the compiler adds the player actor even when the proposal contains only visible non-player handles.
- Focused actor, visibility, Game Master, scheduler, and turn-runtime suites pass with backend typecheck.
- The full backend run passed 3,898 tests before a Windows `EPERM` cleanup race in the multi-process turn-repository test. That 35-test file passed immediately when rerun alone, including all three database-process races.

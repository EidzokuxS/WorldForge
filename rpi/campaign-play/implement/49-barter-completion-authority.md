# Barter completion authority

## Outcome

Keep a negotiated possession offer from becoming a completed exchange until the Rulebook commits the player-owned consideration.

## Field evidence

- Campaign: `e5e41b51-d60f-44e2-90c6-202dae12a74f`
- Run: `pristine-60-glm52-black-rain-54df81f3-r14-typed-scene-topology`
- Action 49: `Talk to Nico Bardini: offer travel food for the bearing`
- Turn: `turn-player-action:c435261e915413fcf3ada1bcf3b4d5f06498fbed`

Judge correctly treated the clicked action as an offer rather than a transfer and emitted `possessionEffectAuthority.kind=none`. Game Master nevertheless had Nico reveal the 312° information and say `We're square`. The Rulebook advanced time but committed no possession adjustment. Sera retained the one inventory stack named `Three days of travel food` while the prose presented the bargained return as already paid.

## Architecture delta

`possessionEffectAuthority` now bounds semantic completion as well as the allowed effect list. With `none`, an offer can produce acceptance in principle, rejection, a counteroffer, or a quantity question. It cannot transfer the item, deliver the bargained return, or describe the exchange as paid, settled, square, fulfilled, or complete. Completion requires matching spend authority and an `adjust_actor_possession` effect in the same accepted result.

The Game Master still authors the actor's words and decision. This adds no backend dialogue, prose parser, retry, fallback, provider change, reviewer, or compatibility path.

## Prompt review

- `prompt-craft`: attached semantic completion to the existing typed possession boundary instead of inventing a second barter system.
- `humanizer`: kept valid actor responses open—accept, reject, counter, or ask quantity—without prescribing dialogue.
- `deslop`: removed repeated transaction language while preserving the exact authority condition and forbidden completion claims.

## Validation

- The focused Game Master prompt contract test checks negotiation-only behavior, withheld return, spend authority, and the prohibition on replacing possession transition with `record_world_event`.
- Backend typecheck covers the touched prompt builder and test types.
- Action 50 explicitly kept the food in Sera's hand and asked Nico what quantity he required. Nico named one day's worth and waited for a transfer; he delivered no new bargained return and did not newly complete the exchange.
- Sera retained `Three days of travel food ×1`. Judge, Game Master, actor replanner, and Narrator each accepted one GLM 5.2 stage with valid schemas and no provider or model switch.
- The action-50 reload boundary matched public state, replay, and checkpoint hashes at `6028622cb22a96d8b205ac4e430fa48f876c2c32fa1fa1e4779745d5fa5c26fa` before and after restart.
- The accepted suggestion `agree to one day's food` exposes a separate granularity defect because the current inventory represents all three days as one indivisible quantity. It is not folded into this semantic-completion repair.

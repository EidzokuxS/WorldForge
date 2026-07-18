# Suggested-action epistemic authority

## Outcome

Keep Narrator suggestions inside the evidence status of the immutable player-visible packet.

## Reproduced evidence

Black Rain Passage r04 action three asked Poldo whether traveler records are ever matched against expedition bearings. He replied that his office does not do so and mentioned `a shelter ledger or a port log` as generic possibilities. The Narrator packet exposed an open route named `Vesper Quay Tollhouse` but no destination contents. Narrator then offered `Go to Vesper Quay Tollhouse: port logs at the tollhouse`, converting an NPC example into a confirmed destination fact.

Evidence: `output/playtests/campaign-play/pristine-60-black-rain-54df81f3-r04-player-history.session/screenshots/action-3-unsupported-port-log-choice.png` and narration packet `2f6d633f7e325d21bc0ea3b9db9b157ea6a2dc2e1c5307c35f841f0d8428dc4c`.

## Decision

- Suggested-action details preserve the epistemic status of their sources.
- An NPC question, guess, rumor, example, possibility, or generic record type establishes only that the NPC mentioned it.
- A move may carry an explicitly supported reason to investigate, but it cannot place a hypothetical object, person, service, or answer at the destination.
- Unknown destination contents remain unknown. The suggestion describes the route or investigative purpose without promising a find.
- This remains a model-authored semantic boundary. It adds no lexical validator, backend rewrite, fallback suggestion, retry, compatibility path, provider change, or timeout.

## Validation

- `npm --prefix backend test -- src/campaign-play/narrator.test.ts`: 15/15 passed.
- `npm --prefix backend run typecheck`: passed.
- `prompt-craft`: the existing prompt already owns suggestion grounding, so the smallest responsible change is one source-status rule in that paragraph rather than a new stage or validator.
- `humanizer`: no rewrite required. The clause uses concrete source types, actors, and destination claims without generic style language.
- `deslop`: accepted. The parallel list distinguishes materially different uncertain-source forms; there is no throat-clearing, recap, false contrast, or decorative prose.
- Main-agent semantic verdict: the rule preserves model judgment about useful investigative choices while preventing a hypothesis from being presented as known destination content.
- Clean-copy real UI pass: materialized `black-rain-passage-pristine-54df81f3` as `pristine-60-black-rain-54df81f3-r05-suggestion-epistemics` with zero characters and turns, created Elena through the rendered character flow, and played opening plus three player actions with GLM 5.2.
- The final immutable packet retained an open `Vesper Quay Tollhouse` route while Poldo located traveler records only under Saint Orra's shelter office. Narrator did not attach port logs or another unsupported find to Vesper. It offered `Go to Saint Orra Undercity: traveler records in the shelter vaults`, grounded in Poldo's accepted statement.
- Product evidence: `output/playtests/campaign-play/pristine-60-black-rain-54df81f3-r05-suggestion-epistemics.session/screenshots/action-3-grounded-destination-choice.png`, turn `turn-player-action:0063fa5922793e4f03d5600ded4d67df3372a9d0`, packet `43cdf5d94d6edb1463b22886fae6f3c3e30975198002d6b5ed0297bc5fe9c2c2`.
- Product verdict: passed for the reproduced boundary case. One clean-copy journey does not establish general model reliability.

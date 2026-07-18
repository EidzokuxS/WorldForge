# Suggested-action epistemic authority

## Outcome

Keep Narrator suggestions inside the evidence status of the immutable player-visible packet.

## Reproduced evidence

Black Rain Passage r04 action three asked Poldo whether traveler records are ever matched against expedition bearings. He replied that his office does not do so and mentioned `a shelter ledger or a port log` as generic possibilities. The Narrator packet exposed an open route named `Vesper Quay Tollhouse` but no destination contents. Narrator then offered `Go to Vesper Quay Tollhouse: port logs at the tollhouse`, converting an NPC example into a confirmed destination fact.

Evidence: `output/playtests/campaign-play/pristine-60-black-rain-54df81f3-r04-player-history.session/screenshots/action-3-unsupported-port-log-choice.png` and narration packet `2f6d633f7e325d21bc0ea3b9db9b157ea6a2dc2e1c5307c35f841f0d8428dc4c`.

## Decision

- Suggested-action details preserve the epistemic status of their sources.
- An NPC question, guess, rumor, example, possibility, or conditional establishes only that the source was stated.
- No detail may restate an unconfirmed condition as an existing fact, possession, relationship, obligation, destination content, prior event, or known answer. It asks whether, requests a check, or investigates the possibility instead.
- Possessive and definite wording require packet evidence that the thing or relation exists. A move may carry an explicitly supported reason to investigate, but it cannot place a hypothetical object, person, service, or answer at the destination.
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
- Action 6 exposed a broader counterexample. Vela said conditionally that Navarro would have handled passage if Elena's sister used the Concord; Narrator proposed `ask about your sister's passage terms`, turning possible terms into an existing possessive relation. Evidence: `output/playtests/campaign-play/pristine-60-black-rain-54df81f3-r05-suggestion-epistemics.session/screenshots/action-6-conditional-became-possessive.png`, turn `turn-player-action:6d7783927937bb42fe5a80434d6d75efae2fa1bb`, packet `6c8eb7c44c7c7c4f4e747ba0672c681cf844bd0705f51b39d769a23ffbb9eaf8`.
- Product verdict: destination reproduction passed, general suggested-action epistemic authority remains incomplete. The lane becomes diagnostic at action 6 and requires a broader conditional-preservation rule plus a fresh clean-copy pass.
- Corrective prompt review: the destination-only wording was replaced rather than extended. The new invariant applies to every action detail and preserves uncertainty through an explicit question, check request, or investigation. `prompt-craft` accepts the single source-status rule as the smallest responsible surface; `humanizer` and `deslop` require no rewrite because the clause names concrete semantic states and contains no decorative or procedural prose.
- Corrective local checks: `npm --prefix backend test -- src/campaign-play/narrator.test.ts` passed 15/15; `npm --prefix backend run typecheck` passed.
- Corrective real-UI follow-up: restarted the saved diagnostic r05 state on the broadened rule and asked Orella what she would need to check whether Elena's sister ever arranged alternative passage. Orella required a name plus date or favored route and a useful trade; she did not establish an existing sister record or passage terms.
- All four suggestions retained the uncertainty. They described already visible evidence, requested information from Vela, or revisited an observed clue; none used a possessive or definite sister record. Evidence: `output/playtests/campaign-play/pristine-60-black-rain-54df81f3-r05-suggestion-epistemics.session/screenshots/action-7-conditional-preserved.png`, turn `turn-player-action:7ca4d97bcf6ed25cab620fc2306ac3bbbc917a2a`, packet `5fe191dfc273b1f1dfa6a67804c5c7c65f3fde43976700995001c46ba5b33fb1`.
- Corrective verdict: passed for the exact conditional-to-possessive failure mode. The campaign remains diagnostic because code changed after action 6; it is not promotion evidence.

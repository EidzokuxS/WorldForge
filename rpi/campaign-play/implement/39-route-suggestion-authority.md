# Campaign Play route suggestion authority

## Outcome

The Black Rain r09 manual playtest froze after seven completed player actions. Narrator paired the code-owned route to Vesper Quay Beacon Terrace with the model-authored detail `toward Vesper Quay's torn tollhouse documents`, even though those documents belong to the distinct Vesper Quay Tollhouse scene. The persisted route handle was correct; the freeform suffix made the visible choice spatially false.

Ordinary move suggestions now contain only the frozen route destination: `Go to <destination>`. Narrator selects the existing move intent and returns `detail: null`; code rejects any model-authored detail for that kind. Observe, contact, wait, and restricted attempt suggestions retain model-authored details because those fragments specify the actual player verb or method. No prose parser, semantic regular expression, text rewrite, retry, fallback, provider switch, or additional model reviewer was added.

The canonical architecture plan records the same ownership boundary. R09 remains diagnostic evidence and is not counted as a pristine acceptance lane.

## Evidence

- Manual journey: `output/playtests/campaign-play/pristine-60-glm52-black-rain-54df81f3-r09-motivation-control.session/human-notes.md`.
- Rendered failure: `output/playtests/campaign-play/pristine-60-glm52-black-rain-54df81f3-r09-motivation-control.session/screenshots/action-07-renzo-and-bad-route-suggestion.png`.
- The failing action's Judge, Game Master, and Narrator stages each accepted one strict `zai-coding-plan` / `glm-5.2` object in `25473 ms`, `77521 ms`, and `72692 ms`. The defect was accepted output, not a transport repair or fallback.
- GitNexus reports `LOW` upstream impact for `campaignPlayNarratorActionSelectionSchema`, `assertProposalForPacket`, `buildCampaignPlaySuggestedActionLabel`, and `campaignPlaySuggestedActionLabelPrefix`. The Narrator `buildPrompt` candidate also reports `LOW` maximum risk.
- Focused contract verification passes `52/52`: `narrator.test.ts` and `contracts.test.ts`.
- Backend typecheck passes.
- Real-product verification passes on `pristine-60-glm52-black-rain-54df81f3-r10b-route-authority.session`. The rendered Opening shows `Go to Vesper Quay Beacon Terrace`; clicking it through the Play UI moves Tomas to that exact terrace, and the next return action is `Go to Vesper Quay Tollhouse`. Tollhouse documents do not appear at the terrace. Opening Planner, Opening Narrator, Judge, Game Master, and action Narrator each accepted one strict `glm-5.2` object; there was no retry, repair, fallback, model/provider switch, interruption, or Resume.
- A full backend restart and browser reload preserved public-state hash `74be28fad303cf3ab41378d82fdb89fd60e471da7345ae204b27b1a540174357`. SQLite integrity is `ok`, foreign-key check is empty, and the lane remains ready at world version `12`, runtime revision `75`, world minute `1`.
- Rendered proof: `output/playtests/campaign-play/pristine-60-glm52-black-rain-54df81f3-r10b-route-authority.session/screenshots/opening-exact-route-action.png` and `action-01-exact-route-arrival.png`.

## Semantic review

Prompt-craft review kept one literal schema instruction (`detail` is null for `move`) and one ownership explanation. Humanizer and deslop review kept the wording mechanical, setting-neutral, and free of a suggested destination, purpose, outcome, or replacement prose. The runtime change removes a prose surface instead of asking the model to obey another semantic prohibition.

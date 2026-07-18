# Player-owned action values

## Outcome

Keep click-to-submit suggestions executable without letting Judge or Game Master invent missing player-owned facts or wording.

## Reproduced evidence

Black Rain Passage r05 action nine ended with Orella agreeing to search her private ledger if Elena supplied her sister's full name plus an approximate date or route. Elena's CharacterRecord established only an estranged sister and contained no sister name, departure date, or route. Narrator offered `Talk to Orella Navarro: give your sister's name and travel dates`. Clicking it would submit an action with none of the required values and leave their content to downstream models.

The human used freeform input instead: `Her name is Marta Bardi. She left our home about two months before I arrived here, and I do not know which route she used. I ask Orella to search with that information.` Judge, Game Master, and Narrator preserved those values, including the unknown route.

Evidence: `output/playtests/campaign-play/pristine-60-black-rain-54df81f3-r05-suggestion-epistemics.session/screenshots/action-9-orella-accepts-trade.png`, CharacterRecord hash `78ac49631dc3d0c4b7e182949b88ba06ab980372ae76920695c76ad60800d9b4`.

## Decision

- A click-to-submit suggestion is published only when its detail fully determines the player action.
- If the action requires a missing name, date, route, secret, answer, promise, lie, wording, disclosure choice, or other player-owned value, Narrator selects another supported intent.
- Generic instructions such as `give the details` or `answer the question` do not transfer authoring authority to Judge or Game Master.
- Freeform input remains the player-owned path for supplying those values.
- This changes model instructions only. It adds no backend completion, placeholder substitution, lexical validator, retry, fallback, provider switch, compatibility path, or timeout.

## Validation

- `npm --prefix backend test -- src/campaign-play/narrator.test.ts`: 15/15 passed.
- `npm --prefix backend run typecheck`: passed.
- `prompt-craft`: accepted the existing exact-authorization paragraph as the smallest responsible surface. No new schema, stage, or process is required.
- `humanizer`: no rewrite required; the clause names concrete player-owned values and the exact decision when one is absent.
- `deslop`: accepted; the value list distinguishes separate authority choices and the text contains no framing, recap, rhetorical contrast, or decorative prose.
- Main-agent semantic verdict: the rule removes an invalid click path while preserving freeform authorship and model judgment over other grounded intents.
- The first real-UI follow-up on saved r05 admitted another missing-identity question, but a due actor replanner interrupted twice with `model_contract_invalid` before Narrator. Judge and Game Master were accepted, no Narrator artifact exists, and the prompt result remains untested. A second Resume was deliberately not attempted.
- Saved r04 real-UI pass at world minute 4: Poldo explained that requisitions could be searched by bearing or approximate date, while the player still withheld the other traveler's identity and supplied neither value. Narrator omitted every action that would reveal the identity, choose a date, route, wording, or disclosure level. The four published actions were fully determined without those values.
- Product evidence: `output/playtests/campaign-play/pristine-60-black-rain-54df81f3-r04-player-history.session/screenshots/player-owned-value-options.png`, turn `turn-player-action:4fd7074f7918b73980585ef1c981f5725483c361`, packet `1c0d01a07a12deb87625aff6434ea2b2265bedd97947e62f521e698266a99b07`.
- Product verdict: passed for the reproduced missing-identity/date/disclosure boundary. A separate Game Master world-content finding surfaced when Poldo asserted port logs at Vesper Quay; it is not a failure of the Narrator value rule.

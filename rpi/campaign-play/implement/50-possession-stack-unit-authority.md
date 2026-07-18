# Possession stack unit authority

## Outcome

Keep barter prices and clickable possession actions representable by the Rulebook's current integer stack quantities.

## Field evidence

- Campaign: `e5e41b51-d60f-44e2-90c6-202dae12a74f`
- Run: `pristine-60-glm52-black-rain-54df81f3-r14-typed-scene-topology`
- Action 50: `I keep the travel food in my hand. I did not give it to Nico. I ask how much of my three-day food he wants for the 312° information.`
- Turn: `turn-player-action:30a3a37a422b30616c0511947db28500e53a9081`

Nico named a price of one day's food, and Narrator suggested `Talk to Nico Bardini: agree to one day's food`. Current Rulebook state contains one possession named `Three days of travel food` with quantity `1`. The word `Three` describes the contents of one stack unit; it does not create three spendable day units. The offered one-day transfer cannot compile to an honest integer quantity against the visible possession.

## Architecture delta

Possession quantities are indivisible Rulebook stack units at the model boundary. Game Master may quote only a positive integer amount no greater than the visible stack quantity and cannot derive a smaller unit from words inside the possession name. Narrator may suggest only an offer or spend expressible in those same units. A bundle at quantity `1` is either offered whole or not selected.

This preserves the existing typed possession model. It adds no implicit split, inventory migration, prose parser, backend-authored price, rounding, retry, fallback, provider change, or compatibility path.

## Prompt review

- `prompt-craft`: expressed the missing unit invariant once at each model-owned decision boundary without redesigning inventory.
- `humanizer`: used concrete stack examples and left actors free to request the whole item or another consideration.
- `deslop`: removed explanatory detours while preserving integer quantity, upper bound, and no-derived-subunit constraints.

## Validation

- Focused Game Master and Narrator prompt contract tests check Rulebook stack units, forbidden derived subunits, integer bounds, and whole-bundle alternatives.
- Backend typecheck covers both touched prompt builders and tests.
- Live action 51 refused the impossible one-day split and offered the whole three-day bundle. Judge required one quantity-1 spend, Game Master committed the disclosure and spend in one batch, and the completed public state no longer contained the food possession. Narrator described the whole-bundle cost without inventing a subunit.
- All three GLM 5.2 stages accepted one native-JSON attempt with valid schemas and no fallback or provider switch. The completed public projection hash is `74074685702f84934069d0dab2e0ca6d725080dd96036fc640750645b63727a4`.

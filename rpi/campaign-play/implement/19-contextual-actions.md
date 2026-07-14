# Task 19: contextual player actions

Status: implemented and verified through rendered GLM 5.2 playtests.

## Player-facing outcome

Narrator now supplies a short contextual detail for each code-owned available intent. Mechanics still own the choice handle, intent kind, and targets, then compose the complete label. The rendered label is persisted in `choiceBindings` and becomes Judge's `originalText`; the frozen choice remains the authority for kind and targets.

Examples from the live campaign:

- `Examine the salvagers' chalk marks near the waterline`
- `Go to Belfry Spire: the high perch above the flooded junction`
- `Ask Mara Ironeve about what the shadow-shapes did along the tracks`
- `Wait and watch the water near Platform Nine`

There is no compatibility branch for generic stored labels. Current narration artifacts use the current contract.

## Live defects found and fixed

The clean campaign `44b6e2f0-4f79-4d63-a689-709ca0852586` exposed three strict-contract failures:

1. Opening Planner twice produced a schema-valid proposal with an invalid hidden-consequence source. `OPENING_DATA` now enumerates the planned actor's active goals and placements, and the prompt requires all three hidden source IDs to come from the same entry. The next attempt passed semantic compilation.
2. Narrator returned four action details longer than 80 characters. The prompt now requires three-to-eight-word grammatical fragments and defines the required form for each aligned intent. The next attempt produced bounded contextual labels.
3. Judge invented an unsupported `uncertainty.kind`. Its prompt now states the exact `none` object for non-uncertain rulings and the exact `check` shape for uncertain rulings. Resume completed the same frozen choice.

These are contract clarifications, not repair parsing, fallback prose, target reinterpretation, or compatibility handling.

## Manual playtest

The rendered path started at the arrival picker with Wren Ashby, an ordinary flooded-walkway maintenance worker, and chose `tidal-platforms`. Opening completed from world version 2 to 9 and settled one autonomous actor job.

Two player actions then completed:

1. Selected `Ask Mara Ironeve about her dive beneath the drowned terminal`. The admitted frame stored that exact label as `judgeInput.originalText`, while the frozen choice remained `contact` targeting Mara. The result advanced time to Day 1 00:10 and had Mara describe still water and a patient darkness below the terminal without revealing hidden state.
2. Selected `Examine the salvagers' chalk marks near the waterline`. The result advanced time to 00:13 and exposed a concrete chart of submerged rail beds, warning sigils near the terminal, repeated marks toward the foundry, and fresh marks around Platform Nine. The next action set contained four contextual, grammatical labels, including `Wait and watch the water near Platform Nine`.

Opening and both player turns reached `completed`; world versions advanced 2 -> 9 -> 10 -> 11. Because the lane contains recovered pre-fix attempts, it is diagnostic evidence, not pristine acceptance.

Prose verdict: the opening is atmospheric and actionable without making Wren important by default. Mara's answer and the chalk-mark observation are concrete, causally consistent, limited to public knowledge, and leave several plausible directions rather than a forced quest.

Humanizer/deslop verdict: prompt instructions and code-owned label prefixes are concise and domain-specific. The first wait detail exposed a real grammar defect; the per-intent grammar revision fixed it on the next live narration. No additional rewrite was needed.

## Repair contract: continue the current commitment

The `Lowwater Ledger` possession playtest exposed a repeated player-facing failure. After Sorel signed a repair contract, received tools, failed a wrap, received the proper chafe guard, and passed inspection, the suggested actions continued to offer observation, one route, the first visible actor, and waiting. None could represent the immediate next step, so every meaningful continuation required freeform input.

Outcome: after an ordinary actionable player turn, the frozen choice set contains one code-owned `attempt` at the current location, allowing Narrator to phrase a grounded continuation from the public packet.

Acceptance criteria:

1. A non-opening, non-clarification actionable turn publishes one `attempt` intent targeting the current visible location. Opening choices remain unchanged, clarification does not offer a competing attempt, handles and targets remain code-owned, and the set stays within four choices. This is required by the player's stated need for useful choose-your-own-adventure actions and preserves the affected frozen-choice contract.
2. Narrator supplies only the bounded attempt detail already permitted by the current contract. The persisted label remains Judge's exact `originalText`, while the frozen `attempt` kind and location target remain authoritative. No prose parser, target reinterpretation, fallback, retry, or backend-authored outcome is added. This preserves the existing admission and model-authorship boundaries.
3. In a rendered GLM 5.2 disposable-clone playtest, an immediate public commitment produces a suggested attempt that a real player can select to continue that commitment. This is the user-visible evidence the live failure requires.

Non-goals: persistent quests, a player-goal table, semantic commitment extraction, inventory-condition repair, payment recovery, UI redesign, background-actor goals, legacy compatibility, or generic suggestion ranking.

Architecture is unchanged. Visibility remains the owner of available intent kinds, handles, and targets; Narrator remains the owner of contextual action detail. The minimal change adds the missing attempt slot from already-frozen action disposition and current-location authority. When all five generic affordances are available, wait yields its slot to the more immediate attempt; freeform waiting remains available.

Validation budget: focused visibility, narrator-contract, and turn-runtime tests; shared/backend typechecks only if the signature change reaches those surfaces; one short rendered GLM 5.2 disposable-clone playtest; at most one in-scope repair and no smoke or full-suite gate.

## Contract verification

- Narrator tests cover aligned detail count, prompt constraints, and contextual label compilation.
- Contract tests cover code-owned prefixes and rejection of labels that change intent grammar.
- Turn-runtime tests cover persistence of the rendered label while retaining the frozen mechanic.
- Opening Planner and Judge tests cover the explicit prompt constraints discovered in live play.
- Mounted route integration exercises opening and action narration fixtures under the new contract.

## Commitment repair implementation

Visibility now adds one current-location `attempt` after an actionable player turn. It does not add that intent to openings or clarification turns. Choice order remains observe, attempt, move, contact, wait, capped at four; wait yields when the other four affordances exist. The frozen handle, `attempt` kind, and location target remain mechanics-owned, while Narrator supplies only the bounded action detail.

The first rendered clean clone, campaign `e7802029-13a4-4e56-9abd-96fb01a62aec`, reached a useful opening observation but stopped when Narrator's schema-valid output failed semantic compilation with `narration_invalid`. Opening Planner took 179.5 seconds and Narrator took 81.1 seconds. The attempt was not resumed or retried because that pre-existing opening failure is outside this repair.

The user requested reuse of generated worlds, so the focused proof used an isolated copy of the last accepted `Lowwater Ledger` state at world version 36. The copy preserved the campaign ID and protected history hashes; only the admitted, mutation-free interrupted turn and its runtime events were removed, then the runtime head was restored to accepted revision 568. The source campaign was not modified.

Two rendered player actions completed against Z.AI GLM 5.2 without fallback, provider switching, repair parsing, or model retry:

1. Freeform sign-off request completed in 127.3 seconds and advanced world version 36 -> 37. The chief confirmed the wraps, directed Sorel to return the tools and chit, and promised the agreed forty marks. The next frozen choices included `Try stow the tools and chit in the locker`.
2. Selecting that rendered choice persisted `source = suggested`, the exact choice handle and label as Judge input, and a frozen `attempt` binding targeting the current location. It completed in 117.9 seconds, advanced world version 37 -> 42, removed the chit, marlinspike, binding needle, and remaining cord from Carrying through rulebook changes, and offered the next unresolved step: `Try find the chief up-span for the forty`.

The two consecutive suggestions followed the public commitment instead of resetting to generic observation. The second action also proved that choosing the suggestion drives the same authoritative turn pipeline as freeform input. Prose remained concise, spatially coherent, and aware that inspection had already happened. The repeated forms `Try stow` and `Try find` exposed a task-caused grammar defect in the code-owned prefix. The bounded repair changes that prefix from `Try ` to `Try to `; the model-authored detail and all mechanics remain unchanged.

Humanizer/deslop verdict: `Try to <base-form action>` is ordinary, concise English and preserves the player's direct imperative register. No prompt rewrite, ornamental copy, semantic backend rewrite, or additional prose cleanup was warranted.

Final focused validation: 33 contract tests, 11 Narrator tests, and 5 visibility tests passed (49 total); backend typecheck passed. The earlier full repair validation also passed turn-runtime coverage. No smoke test or full-suite gate was added.

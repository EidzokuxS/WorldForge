# Task 19: contextual player actions

Status: implemented and verified through a rendered diagnostic campaign.

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

## Contract verification

- Narrator tests cover aligned detail count, prompt constraints, and contextual label compilation.
- Contract tests cover code-owned prefixes and rejection of labels that change intent grammar.
- Turn-runtime tests cover persistence of the rendered label while retaining the frozen mechanic.
- Opening Planner and Judge tests cover the explicit prompt constraints discovered in live play.
- Mounted route integration exercises opening and action narration fixtures under the new contract.

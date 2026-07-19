# Narrator actor-name frame

## Outcome

Narrator now receives a code-owned permitted and forbidden visible-actor name frame for every current observation index. The model still writes the scene. The existing compiler still rejects a beat that names an actor without performing-actor or observation-subject authority; code does not remove, replace, or rewrite model prose.

## Reproduced failure

Black Rain diagnostic run `pristine-60-glm52-black-rain-54df81f3-r18-marta` stopped on player action 2 after Marta waited ten minutes for a possible wind shift.

- Judge accepted deterministic waiting with exactly ten elapsed minutes on GLM 5.2 attempt 1.
- Game Master accepted and committed one time advance plus one actorless visible weather observation on GLM 5.2 attempt 1.
- The observation said the lee-side rail turned wet exactly as Pia had warned, but did not identify Pia as performer or observation subject.
- Narrator attempts 1 and 2 both returned valid strict objects, then failed at the deterministic unbound-actor check because their observation beat named Pia.
- Both failures left the committed world version intact and exposed an explicit Resume path. There was no timeout, provider switch, fallback, repair, hidden retry, or partial narration acceptance.

The general instruction already prohibited the name. The packet still placed the tempting name inside the actorless observation that Narrator had to cover, so repeating the same prompt was not a new recovery hypothesis.

## Repair

`buildPrompt` derives `OBSERVATION_ACTOR_NAME_FRAME` from the current observation performer, observation-subject bindings, and visible actor list. For each beat, Narrator unions the permitted names for its observation indexes and keeps every other visible actor name out of that beat, even when submitted text, source moment, or observation text repeats it. An empty-index orientation beat remains available when a currently present but unbound actor genuinely matters.

This applies the accepted `pgg:knowledge:found-604` proposal-frame boundary: code supplies literal permitted values, the model authors every valid alternative, and invalid proposals are rejected atomically rather than repaired by code.

Prompt-craft review kept the change on the failed input boundary and retained the deterministic compiler. Humanizer and deslop review removed duplicate warnings and kept the instruction concrete. Verdict: retain the name frame and the existing rejection rule.

## Validation

- GitNexus impact for `buildPrompt`: `LOW`, one direct caller and one Campaign Play process.
- Focused Narrator tests: `18/18` passed, including an actorless observation whose own text repeats the forbidden actor name.
- Backend typecheck: passed.
- Live Resume attempt 3 used Z.AI `glm-5.2`, accepted the unchanged weather packet, and completed the turn without naming Pia in the indexed consequence beat.
- Rendered prose preserved the wind shift, wet rail, darkened corrosion clusters, and beacon change without inventing an actor action.
- UI reload preserved projection hash `d0a953e3a609efbe22d9bb44f2336128da653011b467cab640e59aff2e61c398`, world version `17`, runtime revision `147`, narration ID, and turn ID.

Run r18 is diagnostic rather than pristine acceptance because action 2 required explicit Resume. The completed action remains useful play evidence; it does not satisfy the uninterrupted 60-action threshold.

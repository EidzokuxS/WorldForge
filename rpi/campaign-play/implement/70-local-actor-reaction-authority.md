# Local actor reaction authority

## Outcome

Campaign Play now keeps a visible nonplayer actor inside the primary turn when the model identifies that the player's action materially interferes with that actor's established leverage, work, possession, safety, or immediate objective. The Judge makes that semantic decision explicitly for every visible actor. Code only normalizes an `immediate` decision into the actor target and its cited supporting fact. The Game Master must then commit that targeted actor's dialogue or interaction before an actorless physical result.

This is not scheduler priority. It does not spend a background actor slot, force every witness to react, write a response in code, or infer a hidden stake. The discarded scheduler-first approach changed due-set order and broke unrelated actor sequencing, recovery, and fixture behavior; it was fully reverted before this slice.

## Defect and diagnosis

Diagnostic run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r02` placed Mira Senn and Meshan Ollo at `winch-shaft-entrance`. Meshan had already stated that keeping the winch stopped was the occupiers' leverage. Mira then pulled at the locking pin twice. The physical outcomes persisted correctly, including the partially shifted pin and a strained shoulder, but Meshan did not react.

The durable actor scheduler evidence showed that one later Meshan job was deferred by the three-actor capacity limit, while remote actors used the available slots. That explained the missing background action but did not justify silence inside a player action that directly threatened Meshan's stated stake. Moving all visible stakeholders ahead of the scheduler queue caused broad regressions and was abandoned.

The first Judge prompt repair also failed because it mentioned `SOURCE_MOMENT` and `ACTOR_CONTINUITY` but omitted `VISIBLE_FRAME`, where Meshan's leverage statement actually lived. Adding the missing source still did not reliably make Turbo perform the comparison. The final contract therefore asks for one structured `visibleActorReactions` entry per visible nonplayer actor. `none` represents a mere witness; `immediate` is model-authored semantic participation. The compiler verifies complete unique coverage, normalizes immediate actors into targets, and carries a model-selected visible support fact into citations.

The next live attempt proved that Judge now targeted Meshan and cited his leverage statement, but Game Master still returned only an actorless physical result. The existing prompt already said that a targeted actor's response was part of an attempt, but compilation enforced only the inverse rule: a recorded performer had to be targeted. The compiler now also requires every targeted nonplayer actor in an attempt to perform one dialogue or interaction before the first actorless discovery or scene event. `REQUIRED_ACTOR_RESPONSES` exposes the exact code-owned handle list to the model.

One actor-replanner call in the diagnostic lane also returned `observableTrace: null`. The schema intentionally requires a concrete trace for every future plan step, while the prompt said “every non-null ... observableTrace,” which implied that null was allowed. The prompt now states directly that method and stakes may be null but every observable trace is a non-null bounded string. The schema was not weakened and no repair or fallback was added.

## Live product check

The retained verification turn is `turn-player-action:5405951246a183e2610fbc6f88bd0c8b2deccb4e` in campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`.

- Judge accepted GLM `glm-5-turbo` attempt 1 in `30,124 ms`, targeted Meshan, and cited the visible leverage statement.
- Game Master attempt 1 returned only a player strain plus actorless physical result. Semantic compilation rejected it atomically with `model_contract_invalid`; the rendered Play surface showed `The turn stopped before it finished` and one explicit `Resume` control.
- After explicit Resume, Game Master attempt 2 accepted in `57,125 ms`. Meshan spoke first, warning about the settled rust and visibly choosing not to intervene, then the actorless failed strike resolved.
- Narrator accepted attempt 1 in `35,654 ms` and rendered two ordered beats: Meshan's response, then the physical setback. The prose was readable, the two causes remained separate, and the visible roster and location stayed coherent.
- World version advanced once from `36` to `37`; public packet hash is `1cb2831b22829ba472221a809375bcd9beac857d324ffec38cd2d989c335c8a6`. SQLite integrity is `ok` and foreign-key check is empty.

The lane is diagnostic, not promotion evidence: code changed during the sitting and the accepted GM response required an explicit Resume. It also exposed a separate player-intent precision defect. The signed input said Mira would line up and “prepare another strike,” while Judge normalized that into performing the swing. That expansion is retained as follow-up evidence and is not claimed as fixed by this slice.

## Validation

- `npm test --workspace backend -- judge.test.ts actor-replan-prompts.test.ts game-master.test.ts`: 90 tests passed.
- `npm test --workspace backend -- turn-runtime.test.ts`: 40 tests passed.
- `npm run typecheck --workspace backend`: passed.
- Rendered Campaign Play journey: signed actions 18 through 22 exercised repeated local interference, first-pass semantic rejection, explicit Resume, ordered actor response, final narration, and durable completion.

Prompt-craft review kept the change as one explicit semantic decision and one code-owned normalization instead of adding scheduler policy or a second model stage. Humanizer and deslop review found the prompt language concrete and operational: it names the evidence sources, the two reaction states, the required ordering, and the forbidden hidden inference without ornamental roleplay or duplicated rationale.

Research boundary: `pgg:knowledge:found-004`, `pgg:guide:practical-narrative-choice-slice`, and `pgg:foundation:social-interaction` support the separation between model-authored semantic proposals and code-owned authority, and between mechanical consequence, attributed actor response, and player-visible presentation. This one campaign proves the local trace and compiler boundary only; it does not establish general model reliability, felt agency, or long-horizon narrative quality.

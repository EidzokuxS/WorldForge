# Task 143: bounded Judge semantic recovery

## Outcome

A full-authority player action may automatically resume the Judge exactly once when attempt one ends `model_contract_invalid`. Attempt one keeps the fast Judge reasoning bypass. The fresh-epoch attempt two uses the same provider, model, strict schema, frozen turn input, and existing 30-second per-attempt deadline with default Judge reasoning. A second failure remains interrupted; there is no automatic attempt three.

Certified routes, Game Master failures, Opening, mechanics, receipts, Actor Replanner, Narrator, UI, prompts, schemas, and visible copy are unchanged. The existing one-automatic-resume-per-turn limit still applies.

## Evidence before implementation

Fresh lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r83` completed and bound four player actions. Action five selected the rendered choice `Talk to Kellin Marsh: press about who comes` once. It entered the existing `full_authority` route. The Judge provider returned one successful native JSON response on `zai-coding-plan` / `glm-5-turbo` in 8,479 ms with `finishReason: stop`, then final ruling compilation rejected it as `model_contract_failed` at `judge.ts:781`. No Game Master call, mechanics write, receipt, narration, proper scene, replay, or second admission followed. The frozen turn remained interrupted with Resume visible.

The narrower exact failed ruling field is unavailable because the rejected proposal was not retained. Existing controlled Task 132 evidence is sufficient for the recovery-mode decision: default-reasoning Judge samples accepted 3/3 with maximum wall time 22,363 ms, while bypass is retained for the normal fast path.

## Acceptance contract

- Actor and surface: the player selects a rendered action on `/campaign/:id/play`.
- Trigger: the first full-authority Judge attempt returns a semantic `model_contract_invalid` result.
- Observable result: one fresh-epoch attempt two uses default Judge reasoning with the same provider/model and, when accepted, continues through one Game Master settlement and one proper scene within the 120-second action contract.
- Protected behavior: attempt one remains bypass; certified actions and Game Master semantic failures do not gain this recovery; provider timeout recovery and all persistence fences remain unchanged.
- Forbidden surfaces: no schema relaxation, prompt change, provider/model switch, mechanics replay, replacement player action, or automatic attempt three.

## Automated verification

- `campaign-play-application.test.ts` covers the exact full-authority/Judge/model-contract gate, excludes certified and Game Master boundaries, retains the attempt-two/no-repeat guard, and asserts both Judge model constructions.
- `turn-runtime.test.ts` proves attempt one receives the bypass model while fresh-epoch attempt two receives the default-reasoning model, then settles once without duplicate mechanics.
- Focused application/runtime suites pass 79/79.

## Semantic review

No prompt, model instruction, player-visible copy, or narrative prose changed. Humanizer and deslop review are not applicable.

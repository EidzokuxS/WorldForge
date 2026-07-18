# Third-party disclosure boundary

## Outcome

Keep a direct player question from becoming automatic permission for an NPC to disclose another person's private details or assign the player a search task.

## Field evidence

- Campaign: `e5e41b51-d60f-44e2-90c6-202dae12a74f`
- Run: `pristine-60-glm52-black-rain-54df81f3-r14-typed-scene-topology`
- Player action 39: `Talk to Vela Aldobrandi: ask for the outlier debtor's name`
- Turn: `turn-player-action:be75488ea47b9654cc55133dd5750b3d69d2c4b8`

Vela immediately named Nico Bardini, exposed his private contact route, and asked an unknown traveler to report what he said. The player had supplied no purpose, trust, authority, reciprocal information, consent, duty, relationship, or immediate safety reason. The NPC became a quest dispenser because the prior prompt treated a direct request for information as part of the justification for disclosure.

## Architecture delta

The Game Master now keeps three questions separate: whether the speaker knows a fact, whether the player asked about it, and whether the speaker has a reason to disclose it. A direct question establishes only the topic. Third-party identity, location, contact channel, private case details, and recruitment to find or report on that person require a concrete speaker-side reason grounded in actor directives or visible facts.

This remains model-owned social judgment. The repair adds no prose filter, backend-authored reply, retry, fallback, provider change, reviewer, or compatibility path.

## Prompt review

- `prompt-craft`: replaced the faulty knowledge-plus-question condition with one disclosure-authority rule at the owning GM prompt.
- `humanizer`: kept the rule in direct actor-centered language and preserved room for withholding, deflection, counterquestions, and conditions.
- `deslop`: removed repeated framing and retained the exact distinction among knowledge, topic, and permission to disclose.

## Validation

- The focused Game Master prompt contract test checks the direct-question boundary, recognized disclosure reasons, third-party recruitment prohibition, and no-quest instruction.
- Backend typecheck covers the touched prompt builder and test types.
- Live validation resumed the same retained campaign after action 39; the existing action remained committed evidence and was not rewritten or retconned.
- Action 40 moved Sera away from the leaked pursuit and passed an exact restart boundary with public-state hash `1d12795301588b058e9f424be7099a3161f75517f306dee6ed1ba4649512bb47` before and after restart. The move created no mechanical quest state, but Narrator still offered Bardini as the first next action; that is a separate stale-suggestion defect.
- Action 41 selected that offered question as a real product regression. Poldo stated that his role covers requisitions rather than arrivals, kept no visitor ledger, knew no one by that name, disclosed no route or private case detail, and assigned no pursuit. The following suggestions dropped Bardini entirely.
- Action 41 Judge, Game Master, actor replanner, and Narrator stages each accepted one GLM 5.2 attempt with valid schemas. There was no retry, fallback, provider or model switch, interruption, or backend-authored prose.

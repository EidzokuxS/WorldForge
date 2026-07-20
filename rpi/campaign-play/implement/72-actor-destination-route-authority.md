# Actor destination and route authority

## Real-play failure

Turbo run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r03` completed ten clean player actions, then exposed two independent Actor Replanner failures on action 11. Vedris Kast and Meshan Ollo each authored a coherent trip with a later return, but both selected the outbound opaque route handle again for the return leg. Mechanical compilation rejected both plans as `route_not_traversable_from_step_location`; no plan, movement, retry, repair, fallback, or model substitution was accepted.

Action 13 reproduced the defect with compact causal evidence. Vedris planned alderman hallway to dim-ward market and back; Meshan planned winch-shaft entrance to dim-ward market and back. The route direction, not their chosen destinations or prose, caused both rejections.

## Authority correction

Actor Replanner now asks the model for one explicit destination location on every move step. Code finds the single open directed route from the location established for that step to the authored destination, then compiles both references into the authoritative intent. A missing, blocked, ambiguous, or nonlocal route still fails atomically. The compiler does not infer a destination from prose, rename a location, retry the model, or write a replacement plan.

The prompt frame also gives routes literal endpoint names for planning context. Rejected semantic plans emit compact diagnostics containing the rejection phase, reason, step count, and move target handles; model-authored prose is not copied into routine logs. The top-level plan intent is explicitly limited to four central targets instead of repeating every target used by later steps.

## Verification

- GitNexus reported LOW upstream risk for `compilePlan`, `compilationFrame`, `replan`, and `buildCampaignPlayActorReplanPrompt`.
- Focused Actor Replanner and prompt tests cover route-handle rejection, destination-authored route derivation, location continuity, and strict no-repair generation.
- Backend typecheck passes.
- In real UI action 15, Meshan's replacement plan was accepted on its first Actor Replanner attempt with the new destination-owned contract. Dren settled independently in the same turn. The visible result advanced ten minutes, showed the families' changing routine, exposed a water-and-pot tally as local aftermath, and remained coherent after settlement.
- The same action rejected Vedris before compilation because his top-level summary exceeded the existing four-target bound. The prompt now names that bound explicitly; this final wording still requires a new pristine-cycle check.

## Prompt and prose review

`prompt-craft` reduced the route instruction to one semantic choice and one mechanical rule. `humanizer` and `deslop` preserve the direct wording: the model chooses where the actor goes; code chooses the unique legal route. No narrative quality claim is inferred from the contract test. The manual UI result was readable and materially less repetitive than the two preceding static waits, but those earlier near-duplicate wait passages remain a prose-rhythm defect for the continuing playtest.

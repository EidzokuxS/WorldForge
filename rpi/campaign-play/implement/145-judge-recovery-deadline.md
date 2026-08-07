# Task 145: Judge recovery deadline

## Contract

Full-authority Judge attempts use a 45-second per-attempt deadline. The existing first-attempt bypass and one automatic default-reasoning recovery remain unchanged. Provider, model, strict schema, frozen turn input, attempt identity, epoch fencing, Game Master settlement, mechanics, Narrator, UI, and the no-attempt-three rule remain unchanged.

The representative experience is one rendered full-authority action whose first Judge attempt ends `model_contract_invalid`. The recovery either accepts within 45 seconds and continues to one proper scene, or truthfully interrupts without replaying mechanics. The complete action must still return control inside the 120-second player contract.

## Evidence

Fresh lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r85` completed and bound eight actions. Action nine selected `Try to reach Cable Bridge South: peer through the shutter gap` once. Judge attempt one returned native JSON in 8,028 ms but failed strict schema validation because `movementRouteHandle` did not match the only visible route handle. Automatic attempt two used default reasoning and was aborted at the former 30-second deadline after 30,087 ms. No Judge artifact, Game Master call, mechanics receipt, narration, proper scene, replay, or second admission followed.

Earlier r84 live recoveries accepted in 18,343 ms and 15,545 ms, while the r85 tail exceeded 30 seconds. Raising only the Judge per-attempt ceiling to 45 seconds preserves the 120-second end-to-end budget while giving the already-authorized semantic recovery a bounded additional 15 seconds.

Validation: focused Campaign Play application and turn-runtime suites, backend typecheck/build, `git diff --check`, GitNexus change detection, then one fresh pristine rendered lane. Semantic review verdict: technical, literal, and limited to the observed deadline contract; no player-visible copy or narrative prose changed.

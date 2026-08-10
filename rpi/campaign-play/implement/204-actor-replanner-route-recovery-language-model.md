# Task 204: route-recovery language-model selection

## Contract and boundary

The Campaign Play Actor Replanner keeps its existing two-attempt recovery, route-specific locality proposal schema, safe route feedback, `auto` proposer mode, Grounding Reviewer path, shared deadline, job/stage/frame/base-world identity, fencing, persistence, and player mechanics unchanged. When attempt 1 produces the safe compilation rejection `route_not_traversable_from_step_location`, only the proposer model for attempt 2 changes from the configured recovery reasoning model to the configured Actor Replanner language model. Attempt 1 remains language-model/`auto`; every other attempt-2 branch remains on its existing recovery model and mode. No third attempt or mechanics replay is added.

Frozen r151 evidence is immutable: action 8 reached route compilation rejection on attempt 1 and route-specific attempt 2 used the recovery reasoning model until the shared deadline. Raw provider cause and proposal bytes are unavailable and are not reconstructed.

## Impact gate

At entry `6fc10d8879729309e978916a56518d38c21a11f2`, exact-current GitNexus impact identified the nested `runAttempt` owner as LOW (one direct caller, zero affected processes, Campaign-play module). The enclosing `createCampaignPlayActorReplanner` factory is HIGH (one direct caller, three Campaign Play processes, Campaign-play plus Engine modules). Main authorized this enclosing-factory mapping only for the private route-specific proposer-model conditional; no additional production owner or flow is in scope.

## Implementation

The existing route predicate is reused for a separate `useRouteRecoveryLanguageModel` conditional. The second proposer call now passes `request.model` only for the compilation route coordinate; all other arguments, prompt/schema selection, mode selection, Reviewer model/mode, and recovery behavior are unchanged.

The focused Actor Replanner suite now asserts the route recovery model sequence `[language, language, language]` (attempt 1, route attempt 2, Reviewer) while retaining `auto, auto, tool` modes. A terminal route-recovery schema-invalid regression proves two attempts, no plan, no third call, and unchanged deferred `model_contract_invalid` fencing. Neighboring no-artifact, target-outside, grounding-review, and other-recovery model branches remain asserted against the recovery model.

No prompt, visible copy, or substantial product prose changed; humanizer/deslop review is not applicable.

## Static evidence

Pending implementation validation: focused Actor Replanner, directly affected turn-runtime/application, backend typecheck/build, `git diff --check`, and staged GitNexus `detect_changes`.

## Built r152 evidence

Run: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r152`; campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`.

Canonical hashes: template state `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`; config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`; Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

Live setup, checkpoints, recovery coverage, terminal boundary, persistence/integrity, reload, hashes, and task-owned cleanup will be appended after the single fresh lane. Natural route-recovery coverage must remain unavailable unless observed; no provider/proposal bytes will be manufactured.

## Acceptance handoff

- Route compilation recovery model selection: source and focused tests above; live proof is pending the natural r152 route boundary.
- Neighboring recovery branches and Reviewer routing: existing focused regressions plus the required directly affected suites.
- Identity, deadline, two-attempt cap, no replay/late write: existing runtime tests and new terminal route regression.
- Rendered Campaign Play setup, unique proper-scene bindings, checkpoints, persistence, and same-page reload: pending r152; omitted until actually observed.

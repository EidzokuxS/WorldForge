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

Implementation commit `721d57e24684ccf4209718854b5ef25b19a73dfd` is pushed and local `HEAD` equals `origin/feat/revamp`. The focused Actor Replanner suite passed 17 tests. The directly affected turn-runtime and Campaign Play application suites passed 90 tests across 2 files with exit code 0. The focused Judge suite passed 45 tests. Backend typecheck and production build passed, and `git diff --check` passed. Staged `detect_changes` reported 3 owned files, 5 changed symbols, zero affected processes, and low risk; the only production symbols were the existing `createCampaignPlayActorReplanner`/`replan` path. The staged scope contained only the Actor Replanner source, focused test, and this note; `AGENTS.md` and `CLAUDE.md` remained unstaged.

## Built r152 evidence

Run: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r152`; campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`.

Canonical hashes: template state `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`; config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`; Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

The fresh lane used task-owned ports 4380/4381/4382 and one materialization. The canonical card was imported exactly once from `output/playtests/character-cards/brina-porter-v2.json`; its SHA-256 was `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. Save/Continue was clicked once, then the rendered setup selections were lower-wards / Local / Already here / Looking for work, followed by one Begin. Opening reached ready with one proper rendered scene and five enabled choices. The session manifest records the canonical state/config hashes (`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`) and implementation commit `721d57e24684ccf4209718854b5ef25b19a73dfd`; final manifest SHA-256 was `6e8158377e765b3a16a1b65fc29a8af691a1a1ef55e2814f6bd3e93b70dc501b`. The final state database was read with `query_only`/read-only access: `campaign_play_states` was ready at worldVersion 13/runtimeRevision 42; the opening and player turn were both completed with no turn error; commands and receipts were 15/15; SQLite `integrity_check` was `ok` and `foreign_key_check` was empty.

The first rendered action was `a. Talk to Dren Vask: ask what the count is for`, submitted exactly once after read-before-click reconciliation. It settled as turn `turn-player-action:2267ed1a910e646b4ba9acc58af2ba5f18437c47`, final worldVersion 13, with one accepted Game Master stage (`7633af3c09ad824f786f0955be619f88552a3f9a664c2b5c5cee1467cf34e19b`) and Actor Replanner stage `actor-replan-stage:d06ef2bcfcfc63c188d42d8bae02a7ff`. Actor attempt 1 (`actor-replan-attempt:2a39775bf01f3ce2bee091ac2fec2d16`) was a non-route `model_contract_invalid`; attempt 2 (`actor-replan-attempt:f2fb753e01f253dc5185d0699bcb171f`) used the existing tool recovery branch and was accepted. This was not the Task 204 route coordinate, so live Task 204 recovery coverage is unavailable.

The first genuine defect was the downstream Narrator operation `narration-operation:1b27022095474cd09377637b260c1c0fcff2b9da`: attempt 1 `narration-attempt:307f8f7314578305486b011ba5a999a65d61b52d` and attempt 2 `narration-attempt:597dedc8a7ce1a4bd15224621ed986c363da3b4a` both ended `narration_invalid` with `schema_outcome=invalid`. The operation remained `failed` with `current_attempt=2` and the persisted narration remained `pending`; `campaign_play_proper_scenes` remained empty. The page showed the bounded packet-derived fallback (“The moment stands as shown.”), rendered enabled choices, and no proper-scene binding. The lane was frozen at action 1: no later click, reload, Resume, Restore, retry, replay, provider/model/config change, SQLite mutation, or synthetic Task 204 failure was performed. The r152 state database SHA-256 after settlement was `8adb8ed8c57948e2abef2bfada5412402d5eff7c97d9a86a6fd1c28705d1b128`; the session `network-errors.json` and `browser-console.json` were empty (each SHA-256 `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570`, recorded as the exact file hash before cleanup). Same-page reload and checkpoints 10/20/30/40/50/60 were not applicable after the first genuine defect.

After evidence capture, the r152 Play page and only the task-owned backend/frontend processes/listeners/profile/helpers were closed and verified absent; the generated session/world evidence was preserved. The temporary exact-entry GitNexus shadow was removed. Protected `AGENTS.md` and `CLAUDE.md` remained byte-for-byte unchanged and unstaged.

## Acceptance handoff

- Route compilation recovery model selection: source, focused tests, and commit `721d57e24684ccf4209718854b5ef25b19a73dfd`; natural live route coverage is unavailable because r152 first hit a different Narrator defect.
- Neighboring recovery branches and Reviewer routing: focused tests and the 90-test runtime/application run; live route-specific recovery was not observed.
- Identity, deadline, two-attempt cap, no replay/late write: Actor Replanner stage/attempt rows and terminal route regression; r152 action 1 showed one accepted non-route recovery and no duplicate actor plan/mechanics.
- Rendered Campaign Play setup and one completed player binding: setup, Opening, and action 1 were rendered and persisted; no proper-scene binding was created because Narrator failed twice.
- Checkpoints 10/20/30/40/50/60 and same-page reload: unavailable and intentionally skipped after the first genuine `narration_invalid` defect; no claim is made for 60/60 or reload.

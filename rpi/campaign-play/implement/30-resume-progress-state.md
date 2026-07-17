# Task 30: resumed turn progress state

Status: implemented and verified through a real process-stop recovery in the rendered Campaign Play surface.

After a durable interruption, a successful Resume response starts following the same turn at a new event sequence. The client nevertheless kept `campaignState.activeTurn` from the last authority snapshot until the stream closed and refetched. Because `TurnProgress` rendered any stale `status=interrupted` before considering the already accepted follow, the old interruption card and its Resume button remained visible throughout the resumed model work.

`TurnProgress` now treats interruption as terminal only while no new follow has been accepted. Once the resume endpoint accepts the new epoch and `beginFollowing` records it, the stale card is replaced by ordinary progress. Backend state, worker epochs, retry eligibility, admission, SSE ordering, and recovery ownership are unchanged.

Verification:

- GitNexus upstream impact for `TurnProgress` was LOW with one direct indexed test consumer and no affected execution process;
- `TurnProgress.test.tsx` now proves that an accepted follow replaces a stale eligible interruption with `Action received` and removes the repeated Resume button;
- focused `TurnProgress` and `CampaignPlayPage` suites: 32 tests passed;
- frontend typecheck passed after rebuilding `@worldforge/shared`;
- the product-use pass ran against isolated campaign-root copy `output/playtests/campaign-world-runs/pristine-natural-r31-resume-ui/campaigns`; the source `pristine-natural-r30-actor-obligation` campaign was restored afterward at world version 46, runtime revision 998, phase `ready`;
- real UI action “Examine the tide-schedule on the notice board” admitted turn `turn-player-action:e8d83402e63b33868c4333715f7bf958b6aa352c`; Judge completed once in 24,897 ms on GLM 5.2;
- backend was stopped only after the durable Game Master claim. Its 150-second lease expired into event 7 `turn.interrupted`, `retryEligible=true`, with Game Master attempt 1 persisted as `worker_lease_lost` and no accepted artifact;
- before Resume, the rendered surface showed “The turn stopped before it finished.” and one enabled Resume button;
- 800 ms after clicking Resume, the same rendered page showed “Reading your action”; the interruption text and button were absent while the action surface remained locked;
- Resume preserved the same turn ID and accepted Judge artifact, created Game Master attempt 2 at worker epoch 3, and completed it in 35,259 ms on the first live post-resume model call;
- Narrator completed once in 91,905 ms. The turn advanced world version exactly once from 46 to 47 and ended with one `turn.completed` event at sequence 30;
- processing evidence: `output/playtests/campaign-play/pristine-natural-r31-resume-ui.session/screenshots/resume-processing.png`, SHA-256 `660A51E7E47FDAF6557D3F5243600A067C7DCB9355DB137EEB5AD7D1C8C607D3`;
- completed evidence: `output/playtests/campaign-play/pristine-natural-r31-resume-ui.session/screenshots/resume-completed.png`, SHA-256 `1D1FE3BD61DCA1EB3C7392AB0BC7D2D8D06046B83F626A17FB8D746F597C231D`.

Manual prose verdict: the recovered action produces a clear observation of the notice-board tide table, storm-surge annotation, and still-posted materials request. The prose acknowledges the exact chosen action and offers four different follow-ups without pretending that listed materials are in Mara's custody. A separate temporal-coherence defect remains: at displayed time Day 1, 02:13, the narration calls a high tide “mid-morning” while also placing it roughly two hours away. That inconsistency does not affect recovery correctness and is the next gameplay-quality candidate rather than a reason to widen this UI repair.

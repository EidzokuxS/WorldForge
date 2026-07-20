# Turbo r14 action-10 actor-replanner hard stop

## Outcome

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r14` began from the frozen zero-turn Lowwater Ledger template on commit `098db064`. The rendered Campaign Play UI completed one Opening and ten signed player actions with Z.AI Coding Plan `glm-5-turbo`. Every submitted action produced exactly one `/play/turns` request, and the required restarts after actions 1 and 10 reproduced the same replay and public-state hashes.

r14 is not a Task 18 pristine promotion lane. Pira Senn's background Actor Replanner ended as `interrupted/model_contract_invalid` during both actions 9 and 10. Campaign Play correctly deferred each actor job as `replan_invalid`, accepted no proposal from either invalid plan, and completed both player turns. Task 18 nevertheless permits only a recorded transport failure or loss of worker authority to interrupt a frozen model call, so this lane stops after the action-10 audit.

## Player journey

Mirel Vosk entered the alderman hallway as a lower-ward courier following a lead. She read three fresh red marks beside Venn Row, Saltwright Flat, and Helfer Lane. Vedris Kast explained that the marks meant arrears and that enforcement could seize illumination tokens and leave a household dark. Dren Vask declined to discuss the ledger.

Mirel then followed the visible route to Dim Ward Market. Pira admitted that she knocks on doors and takes tokens, refused to disclose names or schedules, and left for the alderman hallway. Kellin Marsh said that shutters close during collection rounds; he hears footsteps, a knock, argument or reluctant agreement, and once heard a woman crying after Pira moved on.

By action 10, Mirel's self-chosen goal was to identify which newly marked household faced seizure first and warn it. She expected Kellin to supply a route, address, or visible pattern. The player-visible evidence was the three fresh household names, Pira's admission and departure, the removed token brackets, and Kellin's account of what he hears during stops. Action 10 did not grant an address. It narrowed the causal model while preserving uncertainty, leaving observation or further inquiry as the natural continuation.

## Action-10 audit

- Completed durable turns: one Opening and exactly ten player actions; no unfinished turn.
- Final public state: `ready`, `worldVersion=26`, `runtimeRevision=466`, world time Day 1 `00:10`, location `dim-ward-market`, projection hash `c7a26226db94fb32e61724d4f36678f59f7617207db4ea3afb8d3d93e51996c5`.
- Reload proof: public-state hash `c43056c14be59d40251d2c5638d1854cb4eabf94f5b882ad04877e15fd835ad0`, replay hash `845fd0ff0c3d51aa6c182d7b974a3407a9352a127be03916bb47c8580c55b88c`, and checkpoint hash `9a1a18d453c422a85ff6b2d210c29535b3a916feaf488fe9db7769bacbf8d313` all match across the action-10 restart.
- SQLite `integrity_check` is `ok`; `foreign_key_check` returns no rows. All `44` commands have matching receipts.
- All eight agent-controlled people retain a present placement, at least one active goal, one active plan, and one schedule. The plan ledger contains eight active plans and two completed plans.
- Model ledger: `36` first attempts, `34` accepted and two interrupted. Both interrupted stages are Actor Replanner calls for Pira, with `schema_outcome=invalid` and `error_code=model_contract_invalid`. Their jobs are `deferred/replan_invalid`, with no proposal or mechanical mutation.
- Provider and model remained `zai-coding-plan` / `glm-5-turbo`; no provider swap, hidden retry, player-action resubmission, database edit, restore, or rewind occurred.
- The final rendered screenshot is `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r14.session/screenshots/action-10.png`, SHA-256 `79ee3da35ef2ea835c5d4668d390023d8a77dfa4144567244ffce9217cca1d84`.

## Disposition

The runtime handled invalid background replans without corrupting the player turn, but the stricter pristine evidence contract disqualifies r14. The campaign remains frozen at action 10. The next Lane A attempt must materialize the same zero-turn template under a new run id and keep the same provider/model configuration unless new product evidence requires a scoped change.

Humanizer review kept the note focused on Mirel's observed journey and separated visible evidence from protected audit facts. Deslop review removed repeated framing while preserving every hash, count, failure classification, and promotion boundary.

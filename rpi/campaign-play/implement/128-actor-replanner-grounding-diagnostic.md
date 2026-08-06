# Task 128 — Actor Replanner grounding-rejection diagnostic

## Contract and delta

Task 128 adds one diagnostics-only path in `backend/src/campaign-play/actor-replanner.ts`. When an attempt has the existing safe `rejectionArtifact`, the code emits the existing `actor_replan.rejected` event before the retry/finalize boundary. A local `(attemptNumber, modelWorkerEpoch)` key prevents duplicate emission. No retry eligibility/count, deadline, persistence, plan replacement, mechanics, UI, or player outcome changed.

The payload is limited to `campaignId`, `turnId`, `jobId`, `actorId`, `attemptNumber`, `modelWorkerEpoch`, `phase`, `reason`, `goalHandle`, `stepCount`, `moveTargets` (indexed opaque target handles), and `reviewViolations` (indexed stable violation kinds). It does not include prompts, proposals/reviewer/provider/response objects, method/stakes/trace, prose, names, labels, or reconstructed bytes.

Focused coverage uses injected generation/review behavior and captured logging for: valid attempt emits none; recoverable attempt 1 emits once before successful attempt 2; terminal attempt 1 emits once; attempt 2 timeout retains only attempt 1 and accepts no late write; two rejected attempts emit once each with no attempt 3; and payload keys/coordinates remain safe and index-stable.

## Identity and scope

- Repository: `R:\Projects\WorldForge`
- Branch: `feat/revamp`
- Required HEAD and `origin/feat/revamp`: `2f9a85130fd3d4b5f93dd2ff5c10a002816c5403`
- GitNexus upstream impact for `createCampaignPlayActorReplanner`: MEDIUM, 6 direct dependants, 2 affected processes; no HIGH/CRITICAL result. The index was three commits stale and the local retry/finalize source was verified before editing.
- Product files changed: `backend/src/campaign-play/actor-replanner.ts`, `backend/src/campaign-play/actor-replanner.test.ts`, this note. Pre-existing `AGENTS.md` and `CLAUDE.md` edits were preserved and not touched.
- No prompt, model instruction, schema, provider/model/reasoning selection, visible copy, or UI changed; humanizer/deslop product review was not required.

## Automated evidence

- `npm test -- --run src/campaign-play/actor-replanner.test.ts` (backend): 13 passed.
- `npm run typecheck` (backend): passed.
- `git diff --check`: passed (only existing LF/CRLF warnings).
- Final GitNexus `detect_changes --scope unstaged`: 4 files / 15 symbols including the pre-existing instruction files, 0 affected processes, low risk.

## Fresh r66 rendered journey

Run: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r66`

Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`

Template: `output/playtests/campaign-world-templates/lowwater-ledger-pristine-93a09e46-20260719`
Ports: API/UI/CDP `3550/3551/3552`; one persistent Chrome profile and one page.

Materialization was fresh and verified: `state.db` SHA-256 `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, `config.json` SHA-256 `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, canonical Brina card SHA-256 `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. The card was imported once, saved once, setup was lower-wards / Local / Already here / Looking for work once, and Begin was clicked once. Opening produced one proper rendered scene.

Actions 1–15 were admitted and bound exactly once with unique turn/receipt identities. Bound route mix: 5 contact, 7 observe, 3 move. Action-ready latency was 6,056–82,393 ms (average 30,769 ms); proper-scene latency was 16,681–82,215 ms (average 40,392 ms). The bound ledger has 15 unique turns and 40 unique receipts; action 10 has its own checkpoint.

Action 10 naturally exercised Task 128. Attempt 1 (`actor-replan-attempt:9da3f8d1042c92a21c5b514442f82466`, epoch 1) was interrupted with `model_contract_invalid`; the existing automatic attempt 2 (`actor-replan-attempt:21fdd20ed1db49949f59ef9496045a8b`, epoch 2) was accepted under the same job/stage/frame/deadline, the job settled once, and no attempt 3 or duplicate write occurred. The backend log contains exactly one `event: "actor_replan.rejected"` record for the first attempt. Its payload was safe-only: attempt 1 / epoch 1, phase `compilation`, reason `route_not_traversable_from_step_location`, goal handle `goal:3abee6b17d62becf6557`, `stepCount: 1`, `moveTargets: "0:location:45ef6edc2a6d8623af3f"`, and empty review violations; no unsafe content was logged.

Action 16 was admitted once from the rendered proper scene (`Examine the bridge cables and deck construction`) but is not bound. Narrator attempt 1 was `narration_invalid`; automatic attempt 2 ended `stage_timeout`. The authoritative turn completed mechanics at world version 32, but no authoritative complete narration operation/proper scene was available; the rendered page showed the concise fallback and `Restore the telling`. This is the first genuine product hard stop. The pending action decision remains at `pending-decision.json`; no Restore, retry, replay, reload, replacement submission, or direct API/SQLite write was made.

At hard stop: authoritative SQLite state is phase `ready`, 16 completed player-action turns, no active turn, `integrity_check: ok`, `foreign_key_check: []`; rendered inspection remained on the same page with fallback state. Checkpoints 30 and 60 and the post-action-60 reload are unavailable because the lane stopped at the first genuine defect as required.

Task-owned r66 evidence includes the session directory, `probes/action-10-reconciled-complete.json`, `probes/action-16-narrator-attempt-1.json`, `probes/action-16-narrator-attempt-2.json`, `probes/action-16-narrator-terminal.json`, `probes/terminal-rendered-inspect.json`, `probes/hard-stop-state.json`, `checkpoints/action-10.json`, screenshots, backend logs, the pending decision, and the reconciled binding helper. The action-10 helper reconciliation was read-only against product authority and only recorded task evidence after resolving a stale observer snapshot; it did not retry or submit a player action.

## Acceptance handoff

| Criterion | Evidence | Result |
| --- | --- | --- |
| Safe rejection event on recoverable attempt 1 before recovery | Focused injected test; natural r66 action 10 event plus attempt identities | Pass |
| Terminal rejection logs once | Focused injected test | Pass |
| Valid first attempt emits none | Focused injected test | Pass |
| Attempt 2 rejection/timeout retains attempt 1 and no late write | Focused timeout test; no attempt 3 and no proposal/mechanics write | Pass |
| Only safe keys, indexed stable coordinates, opaque handles | Focused key/value assertions; r66 log payload | Pass |
| Existing player journey remains unchanged through the affected recovery | r66 action 10 completed, settled, and bound once | Pass |
| 60/60 endurance and reload | r66 stopped at first genuine Narrator hard stop on action 16 | Unavailable by contract |

Product entry was the rendered Campaign Play page after one-time Brina setup; initial state was the fresh low-water-ledger template with clean SQLite integrity. The smallest positive journey is one valid actor replan (no event) plus one rejected grounding/contract attempt 1 followed by automatic attempt 2 (one safe event, one settlement). Directly affected persistence/recovery evidence is the action-10 attempt/job/stage/checkpoint set. No further action is authorized until Main decides how to handle the separate action-16 Narrator hard stop.

## Cleanup

The task-owned runtime remains preserved for hard-stop evidence. `capture-cleanup.ps1` stopped the recorded r66 backend/frontend/browser process tree and verified no listeners remained on ports 3550/3551/3552 (`probes/cleanup.json`). The frozen r65 lane and unrelated workspace changes were not touched.

# Task 130 — Actor Replanner retry feedback

## Contract and delta

- Actor: a player using the existing rendered `/campaign/:id/play` surface; internally, the Actor Replanner receives one automatic recovery after `model_contract_invalid`.
- Attempt 1 keeps `buildCampaignPlayActorReplanPrompt` byte-for-byte unchanged. Attempt 2 reuses the same turn/job/actor/frame/frozen-world/schema/provider/model/strict-object identity, absolute 90-second deadline and `AbortSignal`, and existing Task 126 CAS/one-retry/no-attempt-3 fences.
- When attempt 1 has the existing safe compilation or grounding-review `rejectionArtifact`, the recovery proposer prompt appends only deterministic feedback for phase, reason, optional goal handle and step count, indexed opaque move targets, and indexed review-violation kinds. It tells the model to rebuild from `ACTOR_FRAME`, correct the listed invariant, avoid copying the rejected arrangement, and satisfy the unchanged schema/compiler/reviewer rules.
- No feedback or failed proposal is persisted; no absent data is reconstructed; the grounding-review prompt, schema, provider/model/reasoning/deadline, persistence, mechanics, receipts, UI, and visible copy are unchanged. Schema-invalid attempt 1 without a safe artifact reuses the unchanged prompt for attempt 2.

Main semantic review verdict: “Recovery feedback is terse, factual, and limited to existing safe diagnostic fields; it adds no narrative voice, visible copy, or filler.”

## Identity and scope

- Repository: `R:\Projects\WorldForge`
- Branch: `feat/revamp`
- Required base/head and `origin/feat/revamp`: `793792bce331d2b0d630db8ab450da644d49ffb3`
- Product files changed: `backend/src/campaign-play/actor-replan-prompts.ts`, `backend/src/campaign-play/actor-replan-prompts.test.ts`, `backend/src/campaign-play/actor-replanner.ts`, `backend/src/campaign-play/actor-replanner.test.ts`, and this note.
- Pre-existing dirty `AGENTS.md` and `CLAUDE.md` were preserved. Historical Task 126 and Task 128 notes were not edited. No commit or push.
- GitNexus upstream impact was run before editing `buildCampaignPlayActorReplanPrompt` (LOW; one direct caller) and `createCampaignPlayActorReplanner` (LOW; nine impacted symbols, two processes); no HIGH/CRITICAL result.

## Automated evidence

- `npm --prefix backend exec vitest run src/campaign-play/actor-replan-prompts.test.ts src/campaign-play/actor-replanner.test.ts --no-file-parallelism --maxWorkers=1`: 2 files, 26 tests passed.
- `npm --prefix backend run typecheck`: passed.
- `npm --prefix backend run build`: passed.
- The focused assertions cover the unchanged attempt-1 prompt, valid-first no feedback, schema-invalid recovery without an artifact, exact compilation and grounding coordinates, safe-key/index stability, one valid settlement, two invalid attempts with no attempt 3, and the existing timeout/CAS/late-write fences.
- `git diff --check`: passed; only the checkout's existing LF/CRLF warnings were reported.
- Final GitNexus `detect_changes --repo WorldForge --scope unstaged`: 6 files / 23 symbols (including the pre-existing instruction-file edits), 1 affected execution flow, medium risk; no HIGH/CRITICAL result.

## Fresh r69 rendered Campaign Play lane

Run: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r69`

Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`

Template: `output/playtests/campaign-world-templates/lowwater-ledger-pristine-93a09e46-20260719`

Ports and isolated browser: API/UI/CDP `3570/3571/3572`, task-owned browser profile under the r69 run directory.

The fresh materialization was verified before runtime: `state.db` SHA-256 `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, `config.json` SHA-256 `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, canonical Brina card SHA-256 `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`, branch/head identity, clean SQLite integrity and foreign-key checks. The card was imported exactly once with `setInputFiles`; Playwright observed one 200 response and the backend recorded one ingestion start/complete. The lower-wards / Local / Already here / Looking for work setup was admitted once and Begin was clicked once. The resulting ready state had one proper rendered opening scene.

The first rendered player action was admitted once: `Talk to Dren Vask: ask who is hiring`. Its player turn `turn-player-action:06868a12c09b027bcf2c0e65f6e9460f19e4c80` completed mechanics at world version 13/runtime revision 43. Actor Replanner attempt 1 was accepted, the actor job settled once, and no retry was needed.

The first genuine defect was then frozen: Narrator attempt 1 ended `narration_invalid`; its automatic attempt 2 ended `stage_timeout`/`transport_error` under the same deadline, with no attempt 3. The authoritative Play state was `ready` with no narration, a failed narration operation, no active turn, and no proper scene. The action was not bound because the required authoritative scene never returned; no second click, Resume, Restore, retry, replay, replacement action, provider/model/config change, or direct API/SQLite write was made. SQLite remained `integrity_check: ok` with `foreign_key_check: []`.

Evidence is preserved under `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r69.session`, including import/setup/action/terminal JSON, pending decision, backend logs, and rendered defect screenshot. The journey harness's CDP response counter remained zero while Playwright captured the single 200 response; this instrumentation discrepancy is recorded as unknown and was not “fixed” by retrying import. The harness was stopped after read-only reconciliation of the preserved pending decision and authoritative DB/API/rendered state.

## Acceptance handoff

| Criterion | Evidence | Result |
| --- | --- | --- |
| Attempt 1 prompt unchanged | Prompt-prefix and no-recovery focused assertions | Pass |
| Attempt 2 receives only safe rejection coordinates | Exact compilation/grounding JSON and index assertions | Pass |
| One valid recovery settles once; no third call/write | Replanner focused tests and preserved Task 126 fences | Pass |
| Invalid/timeout/transport/CAS failures remain truthful | Existing focused retry/deadline/CAS tests remain green | Pass |
| Fresh rendered journey to 60 and reload | r69 stopped at first genuine Narrator hard stop on action 1 | Unavailable by contract |

## Cleanup

Task-owned backend/frontend/Chrome process trees were stopped after the hard stop; ports 3570/3571 were released and 3572 had only TIME_WAIT. The failed pre-prepare materialization was preserved as `...-r69-prep-failed` evidence; the pristine r69 run and its evidence remain frozen. No unrelated workspace files were changed.

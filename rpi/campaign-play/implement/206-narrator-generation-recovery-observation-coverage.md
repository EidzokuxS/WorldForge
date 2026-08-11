# Task 206: Narrator generation-recovery observation coverage

## Contract

When Narrator attempt 1 fails with the existing `narrator_generation_schema_mismatch` recovery diagnostic, the sole automatic attempt 2 receives one additional packet-derived `OBSERVATION_COVERAGE_REPAIR_FRAME`. The frame contains only `expectedObservationCount` and ordered `requiredObservationIndexes`, derived from `packet.newObservations`. It does not change schemas, validators, models, modes, deadlines, retry eligibility, operation identity, persistence, mechanics, UI, or player-visible copy.

The generation-recovery prompt retains the existing `ACTION_SELECTION_INDEX_FRAME` first, then appends this exact approved instruction and frame before `RECOVERY_DIAGNOSTIC`:

> Rebuild beat observationIndexes from OBSERVATION_COVERAGE_REPAIR_FRAME. Across all beats combined, include every requiredObservationIndex exactly once, include no other index, and produce exactly expectedObservationCount observationIndexes entries. Keep each listed observation grounded in that beat's visible narration.

Main semantic review verdict: prompt-craft found the instruction outcome-first and contract-complete; humanizer/deslop found no filler or artificial prose requiring a rewrite. The literal is retained unchanged.

## Impact and implementation

An exact-entry GitNexus shadow at `c5542f4993d4afdb3e6816e38934ab439989b316` reported `buildPrompt` as exact LOW (one direct caller, one affected process, one module; caller `narrate`). The enclosing `createCampaignPlayNarrator` mapping was the authorized enclosing HIGH (24 impacted symbols, five direct callers, four Campaign Play processes, Campaign-play and Engine modules). The implementation stays within the authorized private prompt/helper boundary and `narrator.test.ts`; no exported interface or additional production owner changed.

The implementation adds the private `buildObservationCoverageRepairFrame` helper and appends its canonical packet-derived JSON only in the existing generation-schema recovery block. Normal, packet-validation, and actor-scope recovery prompt branches remain unchanged.

## Static evidence

The focused Narrator suite passes (`41 tests`). The directly affected turn-runtime and Campaign Play application suites pass (`75` and `15` tests, `90` total). Backend typecheck and production build both pass, and `git diff --check` is clean. The added assertions cover one-, zero-, and two-observation frames, deterministic ordering, action-frame-before-coverage-frame ordering, coverage-frame-before-`RECOVERY_DIAGNOSTIC`, privacy exclusions, and absence from the ordinary and packet-validation recovery prompts. The implementation does not touch the validator, schema, runtime recovery, or any exported interface.

The exact-entry staged GitNexus detection reported three owned files and five changed symbols (`buildPrompt`, `narratorProposalSchemaForPacket`, `trailingIntentIndexSchema`, `oneIntentGenerateObject`, and `generateObject`), zero affected processes, and low risk; no additional production owner or flow was detected. Commit `010c66bcf5097d333ce39a6a498e6563ed8ebe20` was pushed before the live lane. Protected `AGENTS.md` and `CLAUDE.md` remain unstaged with their entry hashes unchanged.

## Live r154 evidence

Implementation commit `010c66bcf5097d333ce39a6a498e6563ed8ebe20` was pushed to `feat/revamp`; local HEAD and `origin/feat/revamp` matched before the live attempt. The canonical r154 run config recorded the required template state hash `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config hash `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, and 60 expected actions. The Brina card hash was `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

The pristine world was materialized once. Before the required `prepare` phase completed, task-owned backend/frontend processes were started on ports 4400/4401 (4402/CDP was not started). Backend startup created the Campaign Play state and applied its runtime migrations. The subsequent read-only `prepare` check therefore stopped before import with `Materialized world does not match its frozen template file hashes.` The generated r154 `state.db` hash was `9d33937ea5dc2af52bc1bbbb79e4b0c7cb40b7b6d88ec6f5364bd719e9da0dbe`, while the required template hash remained `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`; `config.json` remained the required `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`. No card import, Save/Continue, setup selection, Begin, Opening, player action, Narrator attempt, Task 206 recovery, checkpoint, or reload occurred.

Read-only SQLite evidence at the frozen boundary: r154 `state.db` returned `integrity_check=ok` and an empty `foreign_key_check`; it contained 75 tables and 52 migration rows versus the untouched template's 71 tables and 44 migration rows. `campaign_play_runtime_events` contained one `play_state_created` event and `campaign_play_states` one row with `setup_phase=character_required`, `world_version=1`, and `runtime_revision=1`; campaign characters, turns, results, commands, receipts, proper scenes, narration operations/attempts, and actor jobs were all zero. The generated world-run evidence is preserved uncommitted. Startup log hashes are recorded for the retained task-owned prep logs: backend stderr `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, backend stdout `1a956ea6a465fdeda675b4da15014945d84e592188814049c08a23215a57b1bc`, frontend stderr `76f453a99211b87d3face3f2dfcb3fdef65e903ae19321689ae075b67f48ed65`, and frontend stdout `f4be818a8d2335591d4c7e1704e01970f401fc734dc25113e0e59db2db908582`.

This is a harness/setup boundary, not a Campaign Play semantic defect. The lane is frozen because correcting the already-started materialization would require a forbidden reset, SQLite mutation, rematerialization, or replacement lane. Backend/frontend process trees and descendants were stopped and ports 4400/4401/4402 verified unowned; no browser page/profile was started. The retained startup logs are under `R:\Temp\worldforge-task206-r154-runtime-prep\runtime` for evidence. Natural Task 206 recovery coverage, Opening, endurance checkpoints, 60/60 bindings, and same-page reload are unavailable.

The note-only staged `git diff --check` is clean; exact-workspace staged `GitNexus detect_changes` returned `No changes detected`, confirming no production symbol or flow was added by this evidence update.

## Acceptance handoff

Static evidence must map the zero-, one-, and multi-observation frames; prompt isolation and ordering; frame privacy; unchanged validator/recovery identity; and the focused/build checks. Live evidence must separately report setup, Opening, action checkpoints, any natural recovery, persistence integrity/FK, same-page reload, or the first frozen defect. No unavailable live criterion is inferred from static tests.

For the live handoff, static implementation and focused/runtime/build evidence is complete; the r154 product criteria are unavailable at the frozen prepare boundary above. The accepted enclosing HIGH mapping remains limited to `createCampaignPlayNarrator`; the exact edited prompt/helper remained LOW and no additional production owner or exported interface changed.

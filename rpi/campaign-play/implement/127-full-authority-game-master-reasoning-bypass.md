# Task 127: Full-authority Game Master reasoning bypass

## Contract and exact delta

Task 127 changes only the model-construction option for the full-authority Campaign Play Game Master. In `backend/src/campaign-play/campaign-play-application.ts`, the full-authority `gameMasterModel` now calls `createModel(generator.provider, { role: "generator", reasoningMode: "bypass" })`. Provider, model, prompt, schema, strategy, compiler/grounding rules, deadlines, recovery count, story-action order, UI/copy, mechanics, receipts, and persistence identity are unchanged. The construction assertion in `backend/src/campaign-play/campaign-play-application.test.ts` expects the same explicit bypass option.

The construction coverage remains explicit for every role mode:

- Opening Planner: generator, `bypass`.
- Opening Narrator: storyteller, default reasoning.
- Full-authority Judge: judge, default reasoning.
- Full-authority Game Master: generator, `bypass`.
- Certified Game Master: generator, `bypass`.
- Player-action Narrator: storyteller, `bypass`.
- Actor Replanner: first generator attempt, `bypass`; recovery reasoning model, default.

No prompt, model instruction, visible copy, or substantial prose changed. Humanizer/deslop review is therefore not applicable beyond this literal verdict.

Before mutation, the fixed GitNexus upstream impact for `createDefaultTurnRuntime` was reviewed: HIGH risk, exact, 23 impacted symbols, 5 direct consumers, and the `admitTurn`, `resumeTurn`, and `recoverNarration` processes. The index was two commits stale; `analyze` was intentionally not run because it would regenerate and overwrite user-owned `AGENTS.md`/`CLAUDE.md`. The exact source call was confirmed before the one-line product edit. Those two protected files remain pre-existing dirty changes and were not edited.

## Static evidence

From `feat/revamp` at local and `origin/feat/revamp` `3919b20d6d7728fb3725414a5c13a9af2ed2d77f`:

- Focused application construction tests: 12 passed.
- Directly affected turn-runtime tests: 63 passed.
- Shared build: passed.
- Backend typecheck: passed.
- Backend build: passed.
- Frontend build: passed (the existing additional-lockfile warning was non-fatal).
- `git diff --check`: passed; only the existing CRLF normalization warnings were reported.
- GitNexus `detect-changes --scope unstaged`: passed before and after the task note (four tracked source/protected files, expected symbols, low risk; the untracked note is evidence prose and has no executable symbols).

The frozen r64 evaluation frame was not changed: canonical input SHA-256 `6d8ede9c1bfbbede23adefec62cf64aef7d8711d721f8d13f849827e93c170b6`, prompt `056156cae7ad76a5e693fd7e44ab74d136d3865099569d71f9232cf1cdd8488c`, schema `25114702fae6319b05aea15e7e1181786f67dc099da34fda0cf0a1b9b52369ca`, and common options `6f8caee75481fb5d2333e8de905f19fe57fdbcf5629db415fad51a8f6f37421d`. Its one-frame evidence was 3/3 schema-valid, compiler-accepted batches for both modes; default wall time 11,798–15,496 ms and bypass 5,837–9,114 ms. This remains one-frame evidence, not a p95/p99 or long-run quality claim.

## r65 rendered journey

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r65`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, was materialized exactly once from `output/playtests/campaign-world-templates/lowwater-ledger-pristine-93a09e46-20260719`. The required materialized hashes were state.db `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2` and config.json `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`. The canonical Brina card was `output/playtests/character-cards/brina-porter-v2.json`, SHA-256 `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

The task-owned runtime used ports 3540/3541/3542, one persistent Chrome profile, one matching CDP page, and marker `worldforge-r65-cdp`. The card was submitted once with Playwright locator `setInputFiles`; one backend parse request completed 200 and the rendered Brina draft appeared. Brina was saved once. Opening was configured once as `lower-wards / Local / Already here / Looking for work` and Begin was clicked once. Opening Planner and Narrator both completed with schema-valid accepted stages; the rendered THE MOMENT/YOUR MOVE and enabled choices appeared within the 120,000-ms opening contract.

The first four rendered player actions each used the current page's opaque choice handle, clicked once, reached mechanics-ready and an accepted proper scene, and were bound once in `browser-actions.jsonl`:

| # | Rendered choice and handle | Route | Turn | Action-ready / scene | Result |
|---|---|---|---|---:|---|
| 1 | Talk to Vedris Kast: ask about work — `choice_a3fc873d22b4865b8c9df594` | `certified_contact` | `turn-player-action:cc9b3e84110bc602b74a7fe9baf36379b6f6c09a` | 34,239 / 44,216 ms | accepted; world 14; bound |
| 2 | Examine the board of red-marked names — `choice_8f4354aaaabb4a8c85ad212a` | `full_authority` | `turn-player-action:94a8f78e12b53b6e6d78620be53fdb911f092cbf` | 84,820 / 97,279 ms | accepted; world 15; bound |
| 3 | Go to Dim Ward Market — `choice_ee551e5a55c3f1b9d773c477` | `certified_move` | `turn-player-action:54c05b02b93cc81dfa50ca0ae3cc071ec8ed56f4` | 7,215 / 21,730 ms | accepted; world 17; bound |
| 4 | Talk to Kellin Marsh: ask about the red mark — `choice_c129f633fbe4654437bf8de1` | `certified_contact` | `turn-player-action:bf3f67e0bd283056a5d3838b9300e070bc31979b` | 12,674 / 28,953 ms | accepted; world 18; bound |

Action 2 is the smallest positive full-authority journey. Its admission frame is `full_authority`; the Judge stage was accepted, schema-valid, and used the default reasoning path. The following Game Master stage was accepted, schema-valid, used the unchanged `zai-coding-plan` / `glm-5-turbo` / `strict_object` identities, and the production trace recorded `usage.reasoningTokens: 0` for that full-authority Game Master call. Its three receipts, mechanics settlement, proper scene, and one browser binding are all present. Certified actions 1, 3, and 4 also recorded accepted Game Master stages with the unchanged provider/model/schema identity. Runtime construction tests supply the explicit Opening Planner, Opening Narrator, Judge, certified Game Master, player-action Narrator, and Actor Replanner mode proof; the runtime trace supplies the action-2 full-authority bypass proof.

## First genuine defect and hard stop

Action 5 was selected from the current rendered page, not invented or replayed: `Talk to Pira Senn: ask about the red marks`, opaque handle `choice_5e6e104f44e7ccfc1d723532`. Its admission request was exactly one 202 response for `turn-player-action:33c64e18afe90d4c1c040673213522d26f7d6c8a`; the route was `certified_contact`. The existing automatic actor recovery then exhausted: Actor Replanner attempt 1 was interrupted with `model_contract_invalid` / schema `invalid` after 18,432 ms, and attempt 2 was interrupted with `stage_timeout` / schema `transport_error` after 71,517 ms. The enclosing turn remains `primary_settled`, has no completedAt, final world version, public packet, or narration operation, and its actor job remains incomplete. No mechanics-ready state, proper scene, receipt binding, Resume click, retry, replay, or further intentional action was issued. The rendered page shows “The turn stopped before it finished.” with Resume visible and controls disabled. This terminal attempt-2 failure/deferred actor job is the first genuine product/contract defect under the lane contract, so the lane stopped at 4 completed and 4 bound actions.

At the hard-stop boundary the authoritative DB had 4 completed player-action turns, 4 proper player-action scenes, 26 receipts (including two action-5 world-settlement receipts but no narration receipt), world version 19, runtime revision 113, and SQLite `integrity_check` `ok` with `foreign_key_check` `[]`. The four `browser-actions.jsonl` rows have unique action numbers, turn IDs, choice handles, and receipt references. No action-10/30/60 quality checkpoint or final reload was attempted because the first defect occurred before action 10. The exact evidence is retained under `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r65.session` and the matching `output/playtests/campaign-world-runs/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r65` root, including materialization, identity, card-upload boundary, opening, per-action preflight/admission/completion/ledger probes, action-5 hard-stop UI, screenshots, and runtime logs.

## Acceptance handoff

- Entry: pristine materialized r65 hashes, branch/base above, zero character/turn DB state, integrity clean; task-owned runtime/browser launched only after port and identity checks.
- Criterion 1: source line 547 and the action-2 production trace prove full-authority Game Master construction/usage with `reasoningMode: "bypass"` and `reasoningTokens: 0`.
- Criterion 2: application construction assertions explicitly cover all seven required role modes; opening evidence confirms the two opening stages; action 2 proves Judge default plus full-authority Game Master bypass; certified actions and the actor-replanner rows preserve their existing paths.
- Criterion 3: source diff is the one requested createModel option plus its assertion; all provider/model/prompt/schema/strategy/deadline/recovery/persistence identities remain unchanged, with fixed r64 hashes preserved.
- Criterion 4: focused tests, affected runtime tests, shared/backend/frontend builds, typecheck, diff check, and the post-note GitNexus change detection all passed.
- Criterion 5: this note records the literal humanizer/deslop verdict; no prompt, instruction, copy, or substantial prose changed.
- Product journey: actions 1–4 are positive rendered evidence; action 2 is the smallest positive full-authority path; action 5 is the first genuine automatic-recovery terminal defect and is intentionally not repaired or replayed.
- Persistence/recovery proof: action-2 receipts/proper scene/binding and the action-5 primary-settled turn, interrupted Actor Replanner attempts, incomplete actor job, missing narration, disabled controls, and SQLite integrity/FK results are retained. Product QA is therefore blocked at the action-5 terminal boundary; 60-action success and reload persistence are unproved by design.

Changed artifacts are exactly `backend/src/campaign-play/campaign-play-application.ts`, `backend/src/campaign-play/campaign-play-application.test.ts`, this task note, and the task-owned r65 evidence roots. No commit or push was made.

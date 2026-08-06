# Task 129 — Campaign Play Narrator action-selection detail nullability

## Terminal disposition

**Blocker.** The Task 129 prompt/test delta is complete. Fresh r68 reached the rendered journey and hard-stopped at action 10 in the Actor Replanner after 9/9 uniquely bound `contact` actions; the pending decision and all r68 evidence remain preserved. Fresh r67 remains the invalid historical setup lane: four distinct `ingestCharacterDraft` starts for one intended card file event admitted duplicate character-card ingestion before Opening/action acceptance, so its later action-1 Narrator evidence is post-boundary only and provides no rendered acceptance for Task 129. This is not the earlier browser-extension blocker.

## Identity and frozen boundary

- Repository: `R:\Projects\WorldForge`
- Branch: `feat/revamp`
- Starting HEAD and `origin/feat/revamp`: `98af5f2b490e6ce2624a075fdb68a9743e223c80`
- Parent Main task: `019f9aed-9fe9-71e2-8920-759abbf210cf`
- Frozen r66 and earlier lanes were not resumed, restored, retried, replayed, or mutated.
- Existing user-owned `AGENTS.md` and `CLAUDE.md` changes remain untouched and unstaged.
- No commit or push was made.

## Experience contract

- Actor: the player using the rendered Campaign Play page as Brina.
- Surface: `/campaign/6b85a49e-fef5-4359-95e2-051383f6fb66/play`.
- Trigger: Narrator selects `actionSelections` after a committed player-action result.
- Required outcome: observe, contact, and attempt selections always carry grounded non-null authored detail; move and wait retain `detail = null`; when a grounded detail cannot be authored, another supported intent is selected.
- Protected behavior: scene, action count/order, rendering, recovery, mechanics, and persistence remain unchanged.
- Forbidden surfaces: schemas, compiler/semantic guards, provider/model/reasoning selection, retries, deadlines, operation repository, persistence, public read model, UI/copy, mechanics, intent catalog, and all other product files.

## Delta

`backend/src/campaign-play/narrator.ts` adds exactly this sentence immediately after the existing model-authored-detail sentence:

> Never set detail to null for observe, contact, or attempt. If you cannot supply a grounded three-to-eight-word detail, do not select that intentIndex; select another supported intent instead.

`backend/src/campaign-play/narrator.test.ts` now:

- asserts the exact move/wait null rule and the exact observe/contact/attempt non-null plus alternative-selection rule;
- proves an attempt selection with `detail = null` still throws `narration_invalid` and emits the safe `action_selection_detail_nullability` diagnostic; and
- aligns one pre-existing prompt assertion with the source's existing wording (`inside a container`) without changing prompt behavior.

The compiler and semantic guard are unchanged. Main's final humanizer/deslop verdict for the fixed wording is: **technical, literal, short, non-narrative, and free of filler; it adds only an explicit negative rule and a safe alternative-selection instruction.**

## GitNexus evidence

- `impact buildPrompt --direction upstream --repo WorldForge --file backend/src/campaign-play/narrator.ts`: **LOW**, one direct caller (`createCampaignPlayNarrator.narrate`), one Narrator flow, one Campaign-play module; index four commits stale; source caller confirmed.
- `detect-changes --repo WorldForge --scope unstaged`: 4 files / 11 symbols, 0 affected processes, **low** risk. The readback includes the pre-existing instruction-file edits plus the owned `buildPrompt` symbol.

## Automated evidence

- `npm --prefix backend test -- --run --no-file-parallelism --maxWorkers=1 src/campaign-play/narrator.test.ts`: **25/25 passed**.
- `npm --prefix backend run typecheck`: **passed**.
- `git diff --check`: **passed**.
- No broader tests or builds were run; the prompt-only slice did not require them.

## Fresh r67 journey

Identity:

- Run: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r67`
- Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`
- Template: `lowwater-ledger-pristine-93a09e46-20260719`
- Template state SHA-256 before prepare/boot: `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`
- Template config SHA-256: `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`
- Canonical Brina card SHA-256: `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`
- Task-owned ports: backend `3560`, frontend `3561`, CDP `3562`.
- Browser: `C:\Program Files\Google\Chrome\Application\chrome.exe`, one task-owned persistent profile/page, direct CDP; no extension, native host, in-app Browser fallback, provider/model/config change, or API/SQLite write.

The lane is not valid for rendered acceptance. Before any Opening/action acceptance, the backend log records four distinct `ingestCharacterDraft: starting` entries for the intended single card file event at `12:04:48.502`, `12:06:29.926`, `12:08:04.740`, and `12:08:40.726`; preserved probes show repeated file-event attempts. This is multiple import admission, so r67 is hard-stopped at setup. The later rendered Continue/save, `lower-wards / Local / Already here / Looking for work` setup, Begin, Opening proper scene, and action 1 are retained for diagnosis only and are excluded from Task 129 acceptance.

Opening reached an authoritative `ready` state and rendered the proper scene at `probes/cdp-opening-after-begin-70s.json` with screenshot `screenshots/opening-after-begin-70s.png`. The first visible action was admitted exactly once using:

- choice: `choice_f74356ad3dfa7e6527a8fd05`
- label: `Talk to Dren Vask: accept the seizure notice work`
- turn: `turn-player-action:2644a39064abb967269af1a6b731a9d66bc7cb6f`
- admission event: `player-action-admitted:4a19606e72bd090bde5c2ebc50da990badb9df78`
- visible-state hash before click: `e3fdd33998c4eb186563574c42438601fcc06bf77351243b5058c2710e8f0af1`

The mechanics turn completed at world version 13/runtime revision 45 and rendered the next ready scene at `probes/cdp-hard-stop-action-001.json` with screenshot `screenshots/hard-stop-action-001.png` (also `screenshots/action-001-after-60s.png`). The rendered result showed the fallback `The fuller telling is still taking shape.` and four next actions. This is post-boundary evidence only; it is not a valid Task 129 journey result.

Timing from durable records: opening completion → action admission `70,898 ms`; action admission → player-turn completion `50,087 ms`; Narrator attempt 1 `6,752 ms`; automatic retry attempt 2 `58,081 ms`, ending at the hard deadline. The operation returned `status=failed`, `error_code=stage_timeout`, and `narration=null` while the rendered fallback remained visible.

The first genuine defect is preserved in `probes/narrator-action-001-diagnostic.json` and `output/playtests/campaign-world-runs/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r67/runtime-logs/backend.stdout.log`: attempt 1 was `narration_invalid` with `narrator_packet_validation_mismatch` — `duplicate_selected_intent_indexes` indexes `[5]`, `covered_observation_count` actual `1` expected `2`, and `missing_expected_observation_indexes` indexes `[1]`. Attempt 2 was `transport_error` / `stage_timeout`. No `action_selection_detail_nullability` diagnostic occurred in this r67 attempt; the lane stopped at the earlier semantic packet defect and did not retry it manually.

Distributions and authority:

- Completed turns: opening `1`, player action `1`; both durable turns `stage=completed`, `error_code=null`.
- Accepted model stages: opening planner `1`, opening narrator `1`, action judge `1`, action game master `1`, actor replanner `1`; all `valid`.
- Narrator attempts: attempt 1 `invalid/narration_invalid`; attempt 2 `transport_error/stage_timeout`; operation `failed`.
- Actor Replanner: one attempt, `valid/accepted`; actor job `stage=settled`, no defer reason.
- Action route mix (post-boundary only): one admitted `contact`; zero observe/move/attempt/wait submissions.
- Player binding/receipt evidence (post-boundary only): `browser-actions.jsonl` is empty; `pending-decision.json` remains intact; one durable player turn exists and its three mutation receipts are distinct (`3/3` receipt IDs and `3/3` command IDs). No Task 129 action was bound.
- Checkpoints: none reached (0/60 accepted; required 10/30/60 checkpoints not applicable after the setup hard stop). No reload was attempted.

SQLite evidence from read-only helpers `db-hard-stop.mjs` and `db-counts.mjs` against `output/playtests/campaign-world-runs/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r67/campaigns/6b85a49e-fef5-4359-95e2-051383f6fb66/state.db`: `PRAGMA integrity_check` = `ok`; `PRAGMA foreign_key_check` = `[]`; state `world_version=13`, `runtime_revision=45`, `setup_phase=ready`; the action turn is terminal `action_resolved`. No direct API or SQLite writes were used.

## Cleanup

The signed pending decision, state database, runtime logs, probes, screenshots, and task-owned browser profile remain preserved for Main at:

`output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r67.session`

The exact task-owned backend/frontend/Chrome processes and listeners were stopped after evidence capture; the evidence directory was not deleted. The recoverable aborted-prep directory `_task129-r67-prep-aborted` remains untouched. User-owned instruction-file changes remain preserved and unstaged.

## Next action for Main

Main review/accept Task 129; separately diagnose the preserved r68 action-10 Actor Replanner hard stop; do not resume/retry r68.

## Material unknowns

- The r67 lane did not exercise the requested 60-action completion or a post-action-60 reload; it is invalid for acceptance because setup admitted the same card file event four times.
- The live first Narrator failure was not the requested nullability diagnostic; post-clarification nullability behavior remains unverified beyond the focused compiler regression. That action-1 evidence is post-boundary only.
- Four backend character-draft ingestion starts occurred during setup (`12:04:48.502`, `12:06:29.926`, `12:08:04.740`, `12:08:40.726`), with repeated file-event attempts in preserved probes. The exact browser request/response cardinality is not treated as acceptance evidence for r67.

## acceptance_handoff

| Contract entry | Observable evidence |
|---|---|
| Initial state and identity | `manifest.json`, run config, template hashes, branch/HEAD, and frozen-lane boundary above; direct Chrome/CDP route used on ports 3560/3561/3562. |
| Exact prompt delta | Source diff in `backend/src/campaign-play/narrator.ts` contains only the specified sentence immediately after the existing detail sentence. |
| Move/wait nullability | Exact prompt assertion passed; compiler guard remained unchanged. |
| Observe/contact/attempt non-null and safe alternative | Exact prompt assertion passed; attempt-null regression passed with `action_selection_detail_nullability`. Live r67 did not reach that diagnostic. |
| Existing action uniqueness/count, visible-actor, recovery, and deadline behavior | Focused suite passed; live r67 admitted one exact visible choice once, produced one durable turn, one settled actor job, distinct receipts, and one automatic Narrator retry before the hard stop. |
| Fresh r67 rendered journey | Setup hard-stopped before acceptance after four distinct `ingestCharacterDraft` starts for one intended file event; Opening/action-1 evidence is retained post-boundary only and yields 0/60 accepted, 0/60 bound, no accepted duplicate submission, and no reload. |
| Safe hard-stop state | Pending decision and all evidence preserved; no Resume/Restore/retry/replay; read-only SQLite integrity/FK checks clean; task-owned processes stopped after capture. |

## Fresh r68 correction

The replacement lane was created from the immutable template as `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r68` using the direct Chrome executable, one task-owned persistent profile/page, and CDP on ports `3560/3561/3562`. The setup admission proof is clean: Playwright `locator.setInputFiles` was called exactly once; the browser observed exactly one parse POST and one HTTP 200 response for `/play/player/cards/parse`; backend logs contain exactly one `ingestCharacterDraft: starting` and one complete entry; the canonical card hash is `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. The helper's CDP response counter was defective (`event.response.requestId` instead of the top-level request id), but Playwright and backend authority reconcile the one request/one response/one ingestion. No second setup dispatch occurred.

Save was performed once with HTTP 200. `lower-wards`, `Local`, `Already here`, and `Looking for work` were each selected once, and Begin was clicked once with HTTP 202. Opening reached an authoritative `ready` proper scene (`worldVersion=13`, `runtimeRevision=15`) before the action journey.

Actions 1-9 each had one rendered click, one HTTP 202 player-turn admission, and one unique binding. All nine naturally selected `contact` actions; their rendered authored details were non-null and three-to-eight words (`ask about the red-marked list`, `ask who can settle a marked household`, `ask when the clerk's door opens`, `ask about getting on the list`, `clarify you meant something else`, `ask about the fresh scratches`, `ask who marks the households`, `ask about the three unvisited names`, and `press for one household's location`). No observe, attempt, move, or wait was naturally selected before the hard stop, so no unsupported route kind was manufactured.

Action 10 was admitted exactly once from the rendered choice `Talk to Vedris Kast: back down and leave him alone` (HTTP 202; turn `turn-player-action:93240d459d6f316ed2d0e4bdf3ca7c691e65e0fd`; idempotency key `5258012c-d21b-45fd-a205-8682c9da4ea5`). It did not reach a completed proper scene. Read-only authority records four interrupted Actor Replanner model-stage failures (`model_contract_invalid` on attempts 1/2 for the first stage and attempt 1, then `stage_timeout` transport error on attempt 2 for the second stage); the public state remains `turn_active` with the action interrupted and retry-eligible. The pending decision remains preserved, action 10 was not bound, and no Resume/Restore/retry/replay or replacement submission was made. No `action_selection_detail_nullability` or `narration_invalid` diagnostic occurred before this hard stop, and no Narrator selection artifact was available for action 10.

The r68 hard-stop evidence is preserved under the session root: `actions/action-10-hard-stop-evidence.json`, `screenshots/action-10-hard-stop.png`, `pending-decision.json`, and `r68-terminal.json`. Read-only `PRAGMA integrity_check` returned `ok` and `foreign_key_check` returned `[]`. The exact task-owned backend/frontend/Chrome processes were stopped after capture; ports are released, while the session directory and pending decision remain intact. No second product repair was made; the prompt/test/source delta remains exactly scoped.

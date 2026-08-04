# Campaign Play utility wait action

## Purpose and identity

This slice makes the existing `certified_wait` route reachable from Campaign Play through one code-owned utility action. The actor is a player on a ready `/campaign/:id/play` page; the semantic layer is authoritative player-turn admission and settlement; the surface is the existing action dock. The exact trigger label is `Wait 10 minutes`. The utility action is derived from the latest immutable Narrator packet only when the campaign is ready, has no active turn, and the packet has exactly one zero-target `wait` intent with that exact label. Its opaque choice handle is preserved. The four Narrator story choices and their prompt/model contracts remain unchanged.

The utility action is an additive public-state read-model field, capped at one action. It is not persisted authority. Admission binds the union of the four story actions and the optional utility action, while only the utility action can produce `certified_wait`; move and contact certification remain story-action-only. The existing freeform route remains full authority.

## Delta and changed artifacts

- Shared public state: `shared/src/campaign-play.ts` adds `utilityActions`.
- Backend projection/state: `backend/src/campaign-play/campaign-play-projection.ts`, `campaign-play-state-repository.ts`, and `campaign-play-read-model.ts` derive and expose the gated utility action.
- Backend contracts/admission: `backend/src/campaign-play/contracts.ts` validates the bounded, ready-only field; `backend/src/campaign-play/turn-runtime.ts` carries the utility action through completed moments, binds the union, certifies only the exact current wait intent, and rejects stale/mismatched utility submissions before provider work.
- Frontend contract and surface: `frontend/lib/campaign-play-api.ts` parses the field; `frontend/components/campaign-play/CampaignPlayPage.tsx` passes it; `frontend/components/campaign-play/ActionDock.tsx` renders a separate secondary control and submits the opaque handle; `frontend/app/globals.css` applies the existing action-dock visual language.
- Tests/fixtures: `backend/src/campaign-play/campaign-play-projection.test.ts`, `contracts.test.ts`, `turn-runtime.test.ts`, `routes/campaign-play.test.ts`, `frontend/lib/campaign-play-api.test.ts`, `ActionDock.test.tsx`, `CampaignPlayPage.test.tsx`, and `CampaignPlayStage.test.tsx` cover the additive contract, parser, rendering, positive wait route, stale rejection, and fixture compatibility.
- This task note is the only new artifact: `rpi/campaign-play/implement/116-rendered-utility-wait-action.md`.

The fixed visible copy was reviewed against the humanizer/deslop constraints. It is a required byte-exact product literal, so no rewrite was applied.

## Automated evidence

All commands ran from the existing checkout on `feat/revamp`; no commit or push was made.

- Backend projection/contracts: `npx vitest run backend/src/campaign-play/campaign-play-projection.test.ts backend/src/campaign-play/contracts.test.ts --reporter=dot` — 58 passed.
- Backend player-action runtime: `npx vitest run --config vitest.config.ts src/campaign-play/turn-runtime.test.ts --reporter=dot` — 52 passed, including the exact certified-wait path and stale utility handle rejection. Expected fixture logs cover existing Judge contract/error/timeout tests; the file passed.
- Backend state/read-model/routes focused suite — 20 passed.
- Frontend Campaign Play focused suite — 47 passed across four files, including parser, ActionDock, page, and stage tests.
- Shared build: `npm run build` — passed.
- Backend typecheck: `npm run typecheck` — passed.
- Frontend typecheck: `npm run typecheck` — passed.
- `git diff --check` — passed; only normal LF/CRLF warnings were reported by Git.
- GitNexus `gitnexus detect_changes --scope unstaged --repo WorldForge --limit 200` — 20 files, 36 changed symbols, 42 affected flows, risk `critical`. The report includes the pre-existing `AGENTS.md`/`CLAUDE.md` instruction diffs and the high-fanout public-state symbols; those files were preserved and are not part of this owned delta.

## Rendered product journey

Fresh disposable run:

- Run root: `output/playtests/campaign-world-runs/task-116-rendered-utility-wait-20260804-r02`
- Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`
- Session: `output/playtests/campaign-play/task-116-rendered-utility-wait-20260804-r02.session`
- Pristine template: `output/playtests/campaign-world-templates/lowwater-ledger-pristine-93a09e46-20260719`
- Template hashes: `state.db` `6CB291D11CE6578E3395A10D2C5D590070E3CCDD8B2B67451410869CE97897D2`; `config.json` `D8362B1AF976C00CB8F14C564C8196A2D1AB137743FF368EA83D762A4AD2E065`.
- Canonical card SHA-256: `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

The rendered UI imported the card once, saved once, chose the opening location once, clicked Begin once, waited for ready, and clicked the separate utility control once. The original journey counts are import `1`, card parse POST `1`, character save `1`, opening-location `1`, Begin `1`, wait click `1`, wait admission POST `1`, reload `1`; the later completion check was a separate read-only reload documented below. The submitted POST carried `source: suggested`, the exact rendered utility handle `choice_f334f56bd1a44440aae78ea3`, and the expected world/runtime versions; no direct API or database mutation was used.

Timing evidence in `probes/journey.json`: opening ready `95,825 ms` after Begin, wait admission response `140 ms`, wait-to-ready `24,449 ms`, reload-to-ready `566 ms`.

Before the click, the real page showed four lettered story choices plus exactly one separate `campaign-play-utility-action` button labelled `Wait 10 minutes`; all five were enabled. The immediate post-settlement page returned to ready with four new story choices, one new utility wait action, the committed wait result in `WHAT CHANGED`, and enabled next controls. The immediate post-admission public read observed the existing Narrator operation as `running`, so `07-ready-after-reload.png`/`reload.json` truthfully preserve that concise committed result, four story choices, and the utility control while narration was still running. After the existing operation completed, a read-only reload of the same Campaign Play page captured `08-ready-after-narration-complete.png`/`post-completion-reload.json`: the rendered proper `winch-platform` scene and `THE MOMENT` wait beat are present with four story choices, one enabled utility control, ready phase, and no active turn. The read-only reload emitted no POST, created no turn/request/receipt, and left the authoritative SQLite counts unchanged.

## SQLite and settlement evidence

Database: `output/playtests/campaign-world-runs/task-116-rendered-utility-wait-20260804-r02/campaigns/6b85a49e-fef5-4359-95e2-051383f6fb66/state.db`.

`probes/sqlite-evidence.json` records:

- route kind `certified_wait`;
- Judge stages `0`, Game Master stages `1`;
- one primary mechanics settlement and one completed player turn;
- three receipts: one `advance_world_time` receipt and two non-mutating `record_world_event` receipts;
- world time advanced by `10` minutes, world version `11 -> 12`, runtime revision `22 -> 49`;
- Narrator operation status `complete`, attempt `1`, one proper scene linked to the player turn, and concise suggested actions still capped at four;
- `PRAGMA integrity_check` `ok`; `PRAGMA foreign_key_check` `[]`.

The player-turn certificate retains the source turn, moment, packet hash, current world/runtime versions, exact wait handle and label, and `waitMinutes: 10`. The actor replanner stage is existing post-settlement work, not a second mechanics settlement.

## Cleanup candidates

The accepted r02 evidence is task-owned and should be retained until Main records acceptance. After handoff, the task-owned r02 backend/frontend/browser processes and runtime files can be stopped/removed using their exact recorded identities. The earlier r01 failed harness run/session is also task-owned diagnostic material and may be removed after the r02 receipt is accepted. No unrelated process, campaign, `AGENTS.md`, or `CLAUDE.md` change was touched.

## Next and unknowns

Next: Main reviews the additive diff and `detect_changes()` output, records acceptance, and performs any task-owned process cleanup. No commit or push is requested.

Unknowns: this representative run is not p95 or general prose-quality evidence. The rendered journey did not click freeform; focused runtime tests cover exact-text freeform as `full_authority` with Judge invocation, plus stale utility rejection before provider calls. Recovery/replay/lease/epoch and existing move/contact/wait routes were exercised by the focused suites, not by this one rendered wait journey.

## acceptance_handoff

- Ready Campaign Play state displays four story choices and exactly one separate wait control: rendered `05-ready-before-wait.png`, `pre-wait.json`, four story buttons plus one utility button, and the exact handle/label.
- Utility click uses the authoritative rendered handle and reaches `certified_wait`: `network-trace.jsonl` has one wait POST; SQLite certificate route kind is `certified_wait`.
- Judge is skipped and Game Master settles once: SQLite model-stage counts are Judge `0`, Game Master `1`; primary settlement is `1`.
- World time, receipts, action-ready result, proper scene, and controls remain authoritative: three receipts, world time `10`, world `11 -> 12`, runtime `22 -> 49`, operation complete, proper scene `1`, ready state with enabled controls.
- Reload preserves the committed result while Narrator runs: `07-ready-after-reload.png`/`reload.json` show the concise wait result, four story choices, one utility button, ready phase, and no active turn, with `narrationId: null` and `narrationOperation.status: running`.
- Post-completion reload proves the persisted proper scene and controls: `08-ready-after-narration-complete.png`/`post-completion-reload.json` show `narrationId: narration:da29574b0939d4a9a84105c26777f8243e732e27`, `narrationOperation.status: complete`, the `THE MOMENT` ten-minute beat, four enabled story choices, one enabled `Wait 10 minutes` utility control, ready phase, and no active turn. Read-only before/after SQLite counts are unchanged (`turns 2`, `runtimeEvents 49`, `receipts 14`, `narrationOperations 1`, `narrationAttempts 1`, `properScenes 1`), no POST or `/play/turns` request was emitted, and integrity/FK remain `ok`/`[]`.
- Story-choice cap/order and Narrator output remain unchanged: pre/post/reload state and concise result each contain four story choices; no prompt/model/default change was made.
- Freeform remains full authority and stale utility fails before providers: runtime focused tests cover exact-text freeform routing, stale utility rejection, and zero Judge/Game Master calls on the rejected submission.
- SQLite integrity and foreign-key safety: final `integrityCheck: ok`, `foreignKeyCheck: []`.

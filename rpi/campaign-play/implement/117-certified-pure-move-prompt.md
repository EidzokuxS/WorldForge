# Certified pure-move prompt alignment

## Purpose

Align the Campaign Play Game Master instruction with the existing code-certified pure-move guard without changing schema or compiler semantics.

## Identity and scope

- Branch: `feat/revamp`
- Required base: `6e993113bc9aa973de859028e3e86f25dff57ba5`
- Owned artifacts: `backend/src/campaign-play/game-master.ts`, `backend/src/campaign-play/game-master.test.ts`
- Compile path intentionally untouched; GitNexus upstream impact for private `prompt` was LOW (one direct caller, one affected plan process).

## Delta

- Pure move rulings/resolutions now explicitly require `elapsedMinutes === travelCost`, forbid `enter_local_scene`, and allow an actorless `record_world_event`.
- Added the r52-shaped semantic regression (pure move plus `enter_local_scene` at exactly travel cost).
- Existing valid actorless pure-move scene and positive-extra-time observe/attempt compound coverage remains in place.

## Prompt review

Humanizer/deslop verdict: the instruction is technical, literal, short, non-repetitive, and preserves code authority; no narrative wording or provider-authored handle guidance was added.

## Acceptance handoff

Focused checks passed:

- `npm --prefix backend test -- --run src/campaign-play/game-master.test.ts` — 46 passed.
- `npm --prefix backend test -- --run src/campaign-play/turn-runtime.test.ts -t 'certified move'` — 5 passed, 47 skipped.
- `npm --prefix backend run typecheck` — passed.
- `git diff --check` — passed.
- GitNexus `detect_changes --scope unstaged --repo WorldForge` — low risk; intended prompt symbol plus pre-existing instruction-file deltas only. Compile was not edited.

Fresh rendered acceptance used disposable campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, copied from immutable `lowwater-ledger-pristine-93a09e46-20260719`, with SHA-256 state/config matches. The task-owned persistent Chrome/CDP lane imported canonical Brina once, selected `lower-wards / Local / Already here / Looking for work`, and clicked Begin once. The first harness pass stopped at a DOM label-prefix mismatch before any player action; the same live lane was reconciled by a selector-only continuation, with zero prior `/play/turns` POSTs and exactly one subsequent rendered move click.

The rendered choice was `Go to Winch Shaft Entrance` (`choice_3880263db6d32d4ddd640be6`, source `suggested`). Admission was one `POST /play/turns` returning `202` in `128 ms`; action-ready appeared `20,249 ms` after the click and proper scene `25,646 ms` after the click, both within 120 seconds. One reload restored the proper scene and enabled controls in `566 ms`. Network counts are preserved in `output/playtests/campaign-play/task-117-certified-pure-move-20260805-r01.session/probes/sqlite-evidence.json`: setup had one card-parse POST, one character PUT, one opening POST, zero action POSTs; the continuation had exactly one action POST and one reload pass.

Read-only SQLite evidence records `routeKind: certified_move`, Judge `0`, accepted Game Master `1`, certificate `travelCost: 8`, accepted batch `advance_world_time.elapsedMinutes: 8`, `move_actor`, and actorless scene `record_world_event` with `performingActorId: null`; accepted artifact/commands contain no `enter_local_scene`. One `primary_settled` runtime event, world version `12 -> 14`, world time `8`, one completed narration operation, one accepted narration attempt, and one proper scene are recorded. `integrity_check` is `ok` and `foreign_key_check` is empty. Proper-scene and post-reload screenshots remain under the task session evidence directory.

Cleanup: exact task-owned PIDs (backend `36340`, frontend `42968`, Chrome/CDP `34340`) were stopped; disposable run and evidence are preserved. No commit or push was performed.

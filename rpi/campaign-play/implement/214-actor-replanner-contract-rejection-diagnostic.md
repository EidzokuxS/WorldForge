# Task 214: Actor Replanner contract-rejection diagnostic

## Contract

Eligible Actor Replanner failures that enter proposal generation emit one private `actor_replan.contract_rejected` event. The event carries the existing bounded attempt/job identity, one phase (`generation`, `evidence`, `compilation`, or `review`), the final bounded error code, any safe-generation code owned by a generation/review boundary, and only the existing bounded recovery coordinates. Accepted attempts and persistence, lease, budget, and fencing failures remain silent.

## Impact and scope

The current-source GitNexus file-qualified impact for `backend/src/campaign-play/actor-replanner.ts` is exact LOW (7 impacted files, 2 direct importers, 0 mapped processes/modules; the registered index is four commits stale). The nested private owners are absent from the index; the established enclosing factory fan-out is the only disclosed broader reach. The implementation remains private to the Actor Replanner attempt path, its focused tests, and this note; no additional production owner or public interface changed.

## Implementation

The attempt path tracks the earliest source-owned phase and the bounded SafeGenerate code, then emits the specialized event after a durable `AttemptFailure` exists. First-attempt escalation logs before retry preparation and terminal finalization logs once; an attempt/epoch key prevents duplicate specialized events. Existing `actor_replan.rejected`, recovery, retry, persistence, fencing, and acceptance behavior are unchanged. Diagnostics are wrapped so logging cannot alter an outcome.

No prompt, model instruction, visible copy, or substantial product prose changed. Humanizer/deslop review is not applicable.

## Static validation

- Focused Actor Replanner suite: 19/19 assertions passed, including a genuine SafeGenerate `schema_validation_failed` proposal failure with `phase=generation`, `errorCode=model_contract_invalid`, non-null `safeGenerationCode=schema_validation_failed`, privacy sentinels, unchanged recovery/acceptance, and exactly one specialized event.
- Existing generation, evidence, compilation, review, timeout, recovery, fencing, and acceptance tests remain green in the same suite.
- Direct backend typecheck and production build passed with `pnpm exec tsc --noEmit -p backend/tsconfig.json` and `pnpm exec tsc -p backend/tsconfig.json`; the backend package-local `pnpm --dir backend run typecheck` script could not resolve its local `tsc` binary in this workspace and is recorded as a harness/package-path issue, not a source failure.
- Directly affected turn-runtime and Campaign Play application suites passed: 95/95 assertions across 2 files. `git diff --check` passed. Staged GitNexus `detect_changes --scope staged --repo WorldForge` reported 3 files, 5 symbols, 0 affected processes, and LOW risk; the mapped production symbols are confined to `replan`/`mutate` in `actor-replanner.ts`.

## Live r169

- The pushed implementation commit was `8075ba5b698e166c36eaf08ace3d873742c04a73`; the lane was materialized exactly once from the canonical pristine inputs. State, config, and Brina card hashes were respectively `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. The materializer-returned campaigns root was used for runtime and evidence commands; the sole prepare completed before runtime activity. Backend/frontend used task-owned ports 4550/4551 (CDP 4552), and the complete backend log is preserved under the r169 session evidence.
- One Brina import, Save/Continue, the fixed lower-wards / Local / Already here / Looking for work setup, and one Begin completed. The Opening rendered ready with a proper scene at `alderman-hallway` before action 1. The first frontend launch used an incorrect API environment variable and was stopped before any product write; the corrected `NEXT_PUBLIC_API_BASE=http://127.0.0.1:4550` launch reached the same allowed campaign page.
- Checkpoints were captured from exact read-only SQLite copies (`query_only=ON`):

  | completed / bound | turns | operations | proper scenes | commands / receipts | actor jobs / plans | actor attempts | integrity / FK |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
  | 10 / 10 | 11 | 10 | 10 | 36 / 36 | 4 / 4 | 7 | ok / empty |
  | 20 / 20 | 21 | 20 | 20 | 65 / 65 | 12 / 11 | 18 | ok / empty |
  | 30 / 30 | 31 | 30 | 30 | 93 / 93 | 23 / 19 | 30 | ok / empty |
  | 40 / 40 | 41 | 40 | 40 | 121 / 121 | 34 / 27 | 38 | ok / empty |

- Natural `actor_replan.contract_rejected` coverage occurred in the preserved backend log: 11 distinct events, each with the allowlisted identity fields. Phases were generation (3), compilation (6), and review (2); no evidence-phase event was retained. Generation events carried only bounded codes (`native_output_unavailable` or `schema_validation_failed`), while compilation/review events carried only existing safe recovery coordinates. No raw proposal, prompt, reviewer prose, provider body, tool argument, or stack was logged. Static tests remain the evidence for the unavailable evidence-phase case.
- The first verification boundary was after action 40. The action-41 decision remained in the runner's pending-decision file while its product write had already settled; the browser-actions ledger still contained only 40 entries. A later single rendered action-42 click also settled authoritatively, but the runner rejected both binding attempts because the pending action-41 record was no longer immediately bindable. The latest read-only copy showed 43 turns/results/narrations, 42 narration operations, 42 proper scenes, 127 commands and receipts, 36 actor jobs, 29 actor plans, and 40 Actor Replanner attempts; integrity was `ok` and foreign-key check was empty. The latest completed turn was `turn-player-action:6f5e019a69ede6ac4128d18a1c3e5d4628f2d1b8`, with one complete Narrator operation and proper scene. This is a runner verification/control fault, not a product defect; no action 43, Resume, retry, replay, or repair was performed.
- The lane is therefore frozen at the pending-decision/binding boundary. No 60-action or reload claim is made. Direct live Task 214 generation/compilation/review diagnostic evidence is available as above; evidence-phase live coverage, 60/60, and reload are unavailable. Raw provider/candidate cause remains unknown.

## Acceptance handoff

- Static: bounded identity, all four phase classifications, safe-generation-code ownership, safe recovery coordinates, privacy, exactly-once emission, accepted-attempt silence, and unchanged retry/fencing semantics are covered by the 19/19 Actor Replanner suite; directly affected runtime/application suites are 95/95. Root backend typecheck/build passed; the package-local `pnpm --dir backend run typecheck` path lacked its local `tsc` binary and is recorded as a harness issue. `git diff --check` and staged GitNexus detect passed.
- Rendered/persistence: canonical setup and ready Opening are proven; checkpoints 10/20/30/40 are clean with matching completed/bound counts and integrity/FK. The terminal read-only reconciliation proves action-41 and action-42 durable settlements, but the runner protocol cannot safely bind either stale pending decision without another product write.
- Live diagnostic: 11 bounded events prove generation, compilation, and review phases; evidence-phase live coverage is unavailable. No raw content or private data was retained.
- Endurance/reload: the first verification boundary freezes r169 at 42 settled player actions / 42 proper scenes; 60-action and same-page reload acceptance are unavailable and are not inferred.

## Live r170

- Entry and origin were `3e37693596da101740e8e0399c7e20a167e27e58`; the Task 214 implementation remained unchanged. Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r170` used campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, was materialized exactly once, and used the materializer-returned isolated campaigns root `R:\Projects\WorldForge\output\playtests\campaign-world-runs\pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r170\campaigns`. The sole `--live-phase prepare` ran before runtime, HTTP, browser, or SQLite activity. Canonical pre-runtime hashes matched: state `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. The external run-config was kept outside both evidence roots.
- The first runtime launch omitted the required CORS origin and was stopped before any product write; static bundle inspection confirmed the frontend API target was `http://127.0.0.1:4550`, while the backend had only its default origin. A corrected task-owned launch used backend port 4550 with `CORS_ORIGIN=http://127.0.0.1:4551` and frontend port 4551 with the same API target. This was a verification-environment correction, not a product defect.
- The page reached the canonical character setup. One Brina card import/file assignment was performed using the required card file; no second import, Save/Continue, setup selection, Begin, or player click was made. Card parsing and canonical classification completed, then the first authoritative boundary occurred in the provider-backed ingestion `synthesize` stage. Bounded backend evidence records two `ai.zai_fetch.settlement` outcomes `aborted` at 44,995 ms and 45,011 ms, their existing failure events, and one `llm.attempt` for model `glm-5-turbo` with strategy `full_retry`, `success=false`, bounded timeout error, and latency 90,017 ms. The ingestion stage `synthesize` attempt 1/1 then failed as `service_unavailable`; no raw provider body, candidate, prompt, or private reasoning was retained.
- Read-only public state remained `phase=character_required`, `worldVersion=1`, `runtimeRevision=1`, `character=null`, `activeTurn=null`, and no narration. The session `browser-actions.jsonl` remained empty and `pending-decision.json` was absent. An exact copied database trio was opened with SQLite URI `mode=ro`, `PRAGMA query_only=ON`, and foreign keys enabled: `integrity_check=[ok]`, `foreign_key_check=[]`; campaign-play turn, result, narration, operation, proper-scene, command, receipt, character, actor, and model-stage tables all had zero rows (only the pre-existing runtime/state rows remained). Source and copy `state.db`/WAL hashes matched before inspection; SQLite changed only the temporary copy's SHM hash during read (`6ce1cdb7...` to `3005d9a6...`), while the source trio stayed unchanged. The copy was removed after verification.
- r170 is frozen at this first authoritative provider/environment boundary before Opening. No Task 214 Actor Replanner attempt or `actor_replan.contract_rejected` event occurred, no action checkpoint was reached, and 60-action, proper-scene-binding, same-page reload, and natural diagnostic coverage are unavailable. No Resume, retry, replay, direct write API, SQLite mutation, or second lane was performed.

## r170 acceptance handoff

- Setup/Opening: materialization, exact hashes, sole pre-runtime prepare, corrected runtime route, and one card file assignment are evidenced; Save/Continue, fixed setup selections, Begin, and a ready Opening are unavailable because ingestion failed at `synthesize`.
- Transaction/actions/checkpoints: no pending decision or browser-action ledger record exists; zero player-action turns and zero proper-scene bindings are confirmed by public state and read-only SQLite. Checkpoints 10/20/30/40/50/60 are unavailable.
- Task 214 diagnostic: unavailable live; no Actor Replanner attempt was reached. Static Task 214 generation/compilation/review evidence remains in the prior section and was not rerun.
- Persistence/reload: integrity and foreign-key checks are clean at the frozen boundary, but there is no action or scene to reload; same-page reload acceptance is unavailable.
- Cleanup: the r170 browser tab was closed, task-owned backend/frontend processes were stopped, ports 4550/4551/4552 were free, and the temporary SQLite copy was removed. Generated r170 session/world roots and complete backend logs remain preserved; protected AGENTS.md and CLAUDE.md remained unstaged.

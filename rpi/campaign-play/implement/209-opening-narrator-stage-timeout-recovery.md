# Task 209: Opening Narrator visibility-timeout recovery

## Contract and boundary

Opening Narrator recovery is broadened by one bounded condition only. When an
Opening turn is interrupted at `visibility_projected` by the first external
stage `stage_timeout`, with `wasResume` false and no prior automatic resume,
the existing application drive may resume the same turn once. The generic
resume path supplies the new worker epoch and its existing per-invocation
90,000 ms external deadline. All other Opening stages and error classes remain
explicit-Resume-only. Player-action Task 208 recovery, provider-unavailable
handling, model identity, prompt/schema/provider behavior, mechanics,
visibility, persistence, UI, and manual Resume behavior are unchanged.

The frozen r156/r158/r159 evidence remains immutable; no prior lane is resumed,
replayed, repaired, or mutated by this task.

## Impact and implementation

The current GitNexus index was refreshed at entry
`4b966174d7c6d67f08c9aad3cfd919580244569c`. The nested helper
`campaignPlayMayAutomaticallyResumeExternalStage` is not registered as a
symbol, so exact source-qualified analysis was used. The nearest public
`CampaignPlayApplication` interface mapped LOW risk with 6 impacted nodes,
3 direct importers, and no mapped processes. No exported interface or second
production owner was needed.

`campaign-play-application.ts` now handles `stage_timeout` before the existing
player-action contract branch: player actions retain their existing allowance,
and Opening is allowed only for `visibility_projected`. The existing attempt,
`wasResume`, `alreadyAttempted`, provider-unavailable, model-contract-invalid,
route, and player-action branches remain unchanged. The focused application
regression covers the new visibility coordinate, other Opening stages,
model-contract-invalid, attempt fencing, and the existing player-action cases.

No prompt, visible copy, or substantial product prose changed; humanizer,
deslop, and UI-concept review are not applicable.

## Static evidence

Focused validation passed on the bounded implementation:

- `campaign-play-application.test.ts`: 15/15 passed, including Opening
  `visibility_projected` stage-timeout eligibility, all other Opening stages,
  model-contract and attempt-fencing exclusions, and existing player-action
  branches.
- `opening-runtime.test.ts`: 15/15 passed; `turn-service.test.ts`: 13/13
  passed.
- `turn-runtime.test.ts`: all 77 assertions passed. The default Vitest worker
  runner then exited non-zero on its known post-pass `onTaskUpdate` shutdown
  timeout; the bounded single-thread rerun exited 0 with 77/77 passed.
- Backend typecheck (`tsc --noEmit`) and production build (`tsc -p
  tsconfig.json`) passed. `git diff --check` passed (only existing
  LF/CRLF normalization warnings were reported).
- GitNexus exact-entry impact: the nested helper is not indexed; the nearest
  source-qualified `CampaignPlayApplication` interface is LOW (6 impacted
  nodes, 3 direct importers, 0 mapped processes). The staged detect result is
  `No changes detected` for the staged scope; manual staged-path review
  confirmed only the application source, its focused test, and this note are
  staged, while protected AGENTS.md/CLAUDE.md remain unstaged.

## Live r161 evidence

The single fresh lane was
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r161` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`, from pushed implementation commit
`70d4c77e145a7c605c916091ae713c141690e836`. Materialization was performed
once. Its exact `environment.GSD_CAMPAIGNS_ROOT` was
`R:\Projects\WorldForge\output\playtests\campaign-world-runs\pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r161\campaigns`,
outside the session root, and the external run-config was
`C:\Users\robra\AppData\Local\Temp\worldforge-task209-r161\run-config.json`.
The sole `--live-phase prepare` ran before any runtime, browser, HTTP, or
database activity and created the session root. Pre-runtime hashes were the
canonical state `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`,
config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`,
and Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

Setup was completed once: one Brina import, one Save/Continue, the exact
`lower-wards / Local / Already here / Looking for work` choices, and one Begin.
Opening reached a ready proper scene without a `visibility_projected`
`stage_timeout`; direct live Task 209 Opening-recovery coverage is therefore
unavailable, not inferred.

The first journey helper timed out while waiting for a response after action 1,
but read-only reconciliation proved that the action had completed with one
proper scene, one accepted Narrator operation, and three receipts. The action
was not repeated; its derived binding is retained in `browser-actions.jsonl`.
A reconciled helper then continued from action 2. Actions 2 through 17 each
settled once with a proper scene and one unique binding. The action-10
checkpoint recorded completed/bound `10/10`, worldVersion `21`,
runtimeRevision `184`, ten unique turns and choices, `integrity_check=ok`, and
an empty `foreign_key_check`.

Action 18 is the first genuine product boundary. Turn
`turn-player-action:ace470424886a3db0770e6c202f707dd95670906` reached
`completed` after mechanics and visibility, with worldVersion `30`,
runtimeRevision `347`, and exactly three applied receipts. Its Narrator
operation
`narration-operation:e1ce74c5de5c6fcea9cdcb11f492efc02d07dbd9` retained the
result `result:2416d83bc344be5b5d8c81d322f3bb7700d7da6e`, narration
`narration:4ed2360b92f81f17f7675528fc34d03115879fee`, and packet hash
`cbe53458c768a39998faa7942ad3bdbf919d38f959d5a543bd050830a9b83f97`.
Attempts `narration-attempt:984fd0c28460b901f3098a0927ff0a61096e6369` and
the preceding attempt (worker epochs 1 and 2) used the configured
`zai-coding-plan / glm-5-turbo` strict-object path and both ended `failed`
with `error_code=narration_invalid`; no proper-scene binding was created. The
active turn was null and no later player action was submitted. The helper's
poll timeout is verification-only; authoritative operation failure is the
terminal product defect. Read-only persistence reported 18 turns, the failed
operation at current_attempt 2, no late write, `integrity_check=ok`, and an
empty foreign-key check.

Evidence hashes: setup summary
`AB3D09FD146530BE4ADE216F7BA925B6D9E71727548960E97DBFE14DC58B5C72`,
action-10 checkpoint
`21A621EC4D42C99E27481B33CF468D2F516454871DF0489B55598D37572C85AF`,
action-18 evidence
`EB7ABD320AD5A2EDE4699E25FE9946C33EE2043BEB221657A9973CC5DAD075C7`,
terminal evidence
`81C3BA5867F52DB6D37199D526591A69377CA22C90C46D096A02271446854D52`,
and post-run state database
`368E3988DB6744177F6267D5B90FE8E9D273DB9B5E27AD9E8200E13306B6225D`.
Task-owned backend, frontend, Chrome/CDP, ports 4470/4471/4472, browser
profile, external run-config, and temporary crash directory were removed or
verified absent after evidence capture. Generated r161 session/world evidence
remains uncommitted.

## Acceptance handoff

- Eligibility: static helper assertions and the built application drive prove
  only Opening `visibility_projected` stage-timeout attempt 1 can auto-resume.
- Identity/deadline/fencing: existing generic resume/runtime tests plus the
  deterministic tests prove the same turn/narration/packet, new epoch, fresh
  deadline, one attempt, and no late write. The live Opening timeout did not
  occur, so this criterion is unavailable in rendered evidence.
- Protected behavior: existing Opening planner/other-stage, provider,
  model-contract, player-action Task 208, and explicit Resume tests remain the
  authority.
- Product: r161 proves one-time setup, ready Opening, action 1-17 unique
  proper-scene bindings, checkpoint 10, and clean persistence through the
  action-18 terminal boundary. The action-18 Narrator operation reached its
  existing two-attempt terminal `narration_invalid` boundary with mechanics
  and visibility settled once. Checkpoints 20/30/40/50/60, 60-action
  completion, same-page reload, and natural Opening timeout recovery are
  unavailable because the lane froze at action 18.

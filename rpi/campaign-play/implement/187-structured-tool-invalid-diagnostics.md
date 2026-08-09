# Task 187: structured-tool invalid diagnostics

## Contract

When `safeGenerateObject` tool mode receives no valid `structured_output` call and at least one matching call has `invalid=true`, the existing rejection remains unchanged and one private diagnostic event records only bounded structural metadata. The event is `llm.structured_output_invalid_tool_call` and contains the fixed tool name, result/step origin, source indexes, selected argument carrier/type, and direct/step/matching counts. It never includes argument values, object keys, raw/provider text, ids, schema values, reasoning, or player prose.

Valid matching calls continue to win over invalid matching calls. Missing and valid results emit no new event. `SafeGenerateTrace`, error codes/messages/classification, schema parsing, coercion, repair, fallback, retry, provider requests, persistence, mechanics, UI, and player-visible behavior are unchanged.

## Entry and impact review

Entry was `237059d05b1a02b374f5e209fea2496289d0cfba` on `feat/revamp`, equal to origin. The only pre-existing changes were `AGENTS.md` and `CLAUDE.md`; both were preserved byte-for-byte and unstaged. Frozen r134 and earlier lanes remain immutable.

A task-owned shadow clone at the exact entry was created outside the repository and indexed separately. Current-source upstream impact in that shadow reported:

- `safeGenerateObject`: CRITICAL, 149 impacted symbols, 72 direct callers, 30 processes, 10 modules.
- `attemptToolModeGenerate`: CRITICAL, 74 impacted symbols, 1 direct caller, 23 processes, 7 modules.
- `extractStructuredOutputToolInput`: CRITICAL, 3 impacted symbols, 1 direct caller, 8 processes, 2 modules.
- `collectStructuredOutputToolCalls`: HIGH, 3 impacted symbols, 1 direct caller, 4 processes, 1 module.
- `SafeGenerateTrace`: CRITICAL, 207 impacted symbols, 50 direct callers, 27 processes, 10 modules; this exported interface was explicitly excluded from the edit.

The broad shared-helper fan-out is the packet-authorized diagnostic-only exception. The edit stays inside the private extraction/invalid branch and does not alter an exported interface, request, acceptance path, or error contract. The shadow registry/index is task-owned and will be removed during cleanup.

## Implementation and validation before r135

`generate-object-safe.ts` now retains private source/index metadata while collecting direct and step tool calls, chooses a valid matching call before considering invalid calls, and constructs the approved allowlisted diagnostic only for the first invalid matching call when no valid call exists. The existing invalid error is thrown unchanged after the one log event. `SafeGenerateTrace` and every exported error/trace contract are unchanged.

Focused `generate-object-safe.test.ts` coverage proves direct invalid and step invalid origins, argument carrier/type and count metadata, valid-over-invalid preference, missing-call silence, unchanged `invalid_structured_tool_call` classification, and absence of sentinel argument/provider text from the diagnostic. The following checks passed before the live lane:

- `npx vitest run src/ai/__tests__/generate-object-safe.test.ts`: 38/38.
- `npm run test -- --run src/campaign-play/judge.test.ts`: 45/45.
- `npm run test -- --run src/campaign-play/turn-runtime.test.ts --pool=threads --poolOptions.threads.singleThread=true`: 72/72.
- `npm run test -- --run src/campaign-play/campaign-play-application.test.ts`: 15/15.
- `npm run typecheck` and `npm run build`: passed.
- `git diff --check`: passed (only pre-existing line-ending warnings).

The bounded implementation and initial note were committed and pushed as `f5484386fa3c3c801f8985cdd00c32256ba56fee` (`fix(ai): diagnose invalid structured output tool calls`); local `feat/revamp` equaled `origin/feat/revamp` before r135. Staged paths were exactly the two AI files and this note. The live-index `node .gitnexus/run.cjs detect_changes --scope staged --limit 200 --repo WorldForge` returned `No changes detected` because its registered WorldForge index was stale at `1a06944`; the fresh task-owned shadow at the entry commit supplied the impact evidence above, and manual staged-diff review confirmed only private diagnostics were changed.

## r135 journey

The fresh run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r135` used commit `f5484386fa3c3c801f8985cdd00c32256ba56fee`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, and task-owned ports 4210/4211/4212. The verified state/config/card hashes were respectively `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. Setup performed one card import/file assignment (`importClicks=1`, `setInputFilesCalls=1`, one parse request with HTTP 200), one Continue/Save, the exact lower-wards / Local / Already here / Looking for work selections, and one Begin (HTTP 202). Opening reached a ready proper scene before action 1.

Actions 1 through 19 each settled with one proper scene and one unique binding. Actions 1-20 remained exactly-once for mechanics/receipts where they settled. The first genuine defect was action 20, choice `Talk to Kellin Marsh: ask if there's any way back from delinquent`, turn `turn-player-action:524bb347335b5dc6ddc3f10239705636c7a7c6a8`. Its Actor Replanner stage `actor-replan-stage:064d39690e3741099d3fb2404b6eaf25` ended after the existing two attempts, both `model_contract_invalid` with no accepted actor plan and no attempt 3:

- `model-stage-row:28ffe9ce32215a408be75102d9691782`, attempt 1, `zai-coding-plan/glm-5-turbo`, `strict_object`, finish `stop`, schema `invalid`, 11,362 ms, error `model_contract_invalid`.
- `model-stage-row:42e0235fec69c3ee80d231c2f7926855`, attempt 2, same requested/actual provider, model, and strategy, finish `tool-calls`, schema `invalid`, 48,385 ms, error `model_contract_invalid`.

The action retained a proper Narrator scene and three receipts, but no unique binding was committed; counts were completed=20, bound=19. The lane hard-stopped at that actor-job/model-stage boundary and no later action or reload was attempted. Checkpoint 10 recorded completed/bound 10/10, worldVersion 22, runtimeRevision 201, integrity `ok`, and empty foreign-key check. Checkpoint 20 recorded 20/19, worldVersion 33, runtimeRevision 404, integrity `ok`, and empty foreign-key check. The authoritative read-only final database query also returned `integrity_check=ok` and an empty `foreign_key_check`; the final `state.db` hash was `E0F7344B934B2619ACAA42D219FF3CB759B664F26212132BF95C281D63750EC9`.

No `llm.structured_output_invalid_tool_call` event occurred in the r135 session or run logs before the hard stop (`eventMatches=0`), so live coverage of the new diagnostic is unavailable. The retained Actor Replanner evidence does not include raw provider bodies, raw proposals, or exact invalid schema coordinates; no provider cause is inferred from this boundary. Key preserved evidence hashes were setup summary `63889DAAA9A29415B82813B90A6460113A832501E454963778B92B728C5303D8`, terminal `B55D2541CBB42CCDE80C3A0AFF2CE3901E5B8371B491BD74AF138F0F5A103067`, and action-020 evidence `26F1445F7D9C3639C5DC144192FA79464EA99BEF5A09E7F457671D61CD701051`.

After evidence capture, the task-owned backend/frontend/browser roots and descendants were stopped, ports 4210/4211/4212 and CDP/page were independently absent, the r135 browser profile and copied helper scripts were removed, and the task-owned GitNexus shadow plus registry entry were removed. The r135 session/run evidence remains preserved. The evidence-only note update is the remaining tracked change; generated session/run evidence is uncommitted.

## Acceptance handoff

- Entry and scope: exact entry source `237059d05b1a02b374f5e209fea2496289d0cfba`; implementation commit `f5484386fa3c3c801f8985cdd00c32256ba56fee`; only the private extraction path, focused AI tests, and this task note changed. `AGENTS.md` and `CLAUDE.md` remained byte-identical and unstaged.
- Diagnostic contract: source and 38 focused tests prove the allowlisted event, direct/step origin, argument carrier/type/counts, valid-call preference, missing-call silence, unchanged error code/message, and secret/prose exclusion. No exported diagnostic interface or product acceptance behavior changed.
- Built product: r135 setup/opening passed and actions 1-19 each produced one unique proper-scene binding. The hard-stop at action 20 is the first genuine Actor Replanner `model_contract_invalid` boundary; no later action or reload is claimed.
- Persistence/fencing: action 20 left no accepted actor plan/binding, while the Narrator scene and three receipts remained exactly once; read-only SQLite integrity was `ok` and foreign keys were empty at checkpoints 10 and 20 and at terminal query. No late or duplicate write was observed.
- Direct live diagnostic: unavailable because no invalid structured-output extraction occurred naturally before the action-20 stop. The exact event is covered statically only; raw provider/proposal/schema details remain unknown.
- Cleanup: all recorded task-owned processes, descendants, listeners, CDP endpoint/page, browser profile, helper scripts, and shadow registry/clone were independently removed/absent. Full 60/60 and same-page reload criteria were omitted because the lane froze at the first genuine defect.

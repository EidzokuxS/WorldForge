# Task 215: Imported character shared generation budget

## Contract and boundary

When a player imports a character card during Campaign Play setup, the Stage 3
synthesis call and Stage 4 power-assessment call each have one shared 90,000 ms
operation budget. The primary structured response may finish after the old
45,000 ms SDK window and still be accepted before the shared deadline. If the
primary fails with an existing fallback-eligible error, the current text
fallback receives only the remaining part of that same budget. An expired
budget cannot open a second provider window or accept a late result.

The fast imported primary path, existing fallback rules, provider and model
selection, structured-output mode, prompts, schemas, retry counts, public error
mapping, non-import modes, frontend behavior, persistence, and Campaign Play
mechanics remain unchanged. Only the two imported call sites, their focused
tests, and this note are in scope. `generate-object-safe.ts`, provider
registry code, database code, frontend code, and unrelated ingestion stages are
untouched.

## Impact gate

The entry commit was `a70df1c3bd821560a4800afd71fe25d837ac1568` on
`feat/revamp`. GitNexus was refreshed with the index-only analyzer before the
impact check. The exact nested function symbols are not represented in the
current index, so source-qualified file impact was used for the two owned
production files:

- `backend/src/character/ingestion/synthesizer.ts`: LOW, 9 impacted nodes,
  2 direct importers, 0 mapped processes/modules.
- `backend/src/character/ingestion/assess-original.ts`: LOW, 8 impacted nodes,
  1 direct importer, 0 mapped processes/modules.

The broader route and Campaign Play fan-out is unchanged and no additional
production owner is edited.

## Implementation

Each imported call keeps the existing 45,000 ms constant as its baseline and
derives a 90,000 ms operation budget. An ingestion-local wrapper starts one
`AbortController` immediately around the imported `safeGenerateObject` call,
aborts it at the operation deadline, and clears the timer after settlement.
The same signal and `timeout: { totalMs: 90_000 }` reach the safe-generation
owner, so its native structured attempt and existing text fallback share one
deadline. The outer `withPipelineRetry` import fence remains one attempt and
the safe-generation request remains `retries: 1`; no retry, provider, model,
mode, prompt, schema, or error mapping changed. Non-import calls retain their
previous timeout and option shape.

## Static validation

- Focused synthesis and original-assessment suites passed 27/27 assertions.
  They cover primary success after 45 seconds, fallback completion inside the
  remaining budget, an exhausted-budget no-second-window fence, Stage 4 parity,
  one imported provider attempt, and unchanged non-import options.
- The full character-ingestion directory passed 82/82 assertions across nine
  suites. The existing safe-generation external-abort suite passed 48/48.
  Backend `npm run typecheck` and `npm run build` passed, and `git diff
  --check` passed. After refreshing the index for the changed line ranges,
  staged GitNexus `detect_changes --scope staged --repo WorldForge` reported
  5 files, 11 changed symbols, 0 affected processes, and LOW risk. The
  symbols are the two ingestion-local budget helpers, their timers, and the
  owned note headings; no unrelated process was mapped.

No prompt, model instruction, visible copy, or player-facing prose changed.
Humanizer/deslop review was applied to this note; the literals and decision
boundaries were preserved.

## Live r171 evidence

The single fresh r171 materialization used the returned isolated campaigns
root:

`output/playtests/campaign-world-runs/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r171/campaigns`

The run configuration stayed outside both evidence roots at
`output/playtests/campaign-play-run-configs/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r171.json`.
The sole `--live-phase prepare` ran before runtime, HTTP, browser, or database
activity. The materializer manifest and direct hash check matched the required
state DB `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`,
config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and
Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
The isolated lane used ports 4560, 4561, and 4562 with matching API and CORS
configuration. The browser preflight showed the expected WorldForge character
surface.

The setup journey used one Import card click and one canonical Brina file
assignment. The one parse request returned 200 after 23,288 ms, and the page
showed imported `Brina Hael`, `CHARACTER_CARD`, and an enabled Continue action.
The bounded backend log records Stage 3 native JSON success in 17,956 ms and
Stage 4 native JSON success in 3,263 ms, with no fallback in either stage. This
is the unchanged fast primary path; it does not prove the provider branch after
45 seconds. The deterministic tests above own that timing proof.

The one Save/Continue click returned 200 from `/play/player` after 2,023 ms and
advanced to `/play`. The one opening flow selected lower-wards, Local, Already
here, and Looking for work, then clicked Begin once. The opening request returned
202 and reached a ready proper scene at `alderman-hallway` with Brina present.

The endurance lane then completed and durably bound actions 1 through 21. The
checkpoints were:

- action 10: completed/bound 10/10, world/runtime 23/191, one request with
  202, proper scene, integrity `ok`, empty foreign-key check;
- action 20: completed/bound 20/20, world/runtime 33/393, one request with
  202, proper scene, integrity `ok`, empty foreign-key check.

At action 22 the single POST returned 202 and the turn reached `completed`, but
the narration operation ended `failed` on attempt 2. The bounded backend log
records `model_contract_failed` / `schema_validation_failed` for
`turn-player-action:e69d7e98c8bad673701c69a1fd76142f8f0ca20c`, with the native
JSON attempt taking 89,842 ms and text fallback disabled for that narrator call.
The authoritative state advanced to world/runtime 35/419 but had
`narration=null`, so it was not a proper scene. The exact action-22 pending
decision remains signed and preserved; browser-actions contains exactly 21
unique bound entries (1 through 21), and the boundary snapshot has
`integrity_check=ok` with no foreign-key violations. This is a Campaign Play
narrator defect outside Task 215, not an import-budget observation.

The lane froze at that first genuine defect. It did not retry, resume, replay,
switch provider or model, click again, reload, or run finalize. The complete
bounded session, world evidence, and runtime logs remain under the r171 roots;
the final 60-action and reload criteria are intentionally unclaimed. Frozen
r170 remains immutable.

## Acceptance handoff

- Imported Stage 3 primary after 45 seconds: deterministic fake-clock test
  accepts completion before the shared 90,000 ms deadline; the live import used
  the fast native JSON path and did not exercise this provider timing branch.
- Imported Stage 3 early fallback: deterministic test proves the existing text
  fallback can use only the remaining shared budget.
- Imported Stage 3 exhausted budget: deterministic test proves no second full
  provider window and no late result.
- Imported Stage 4: the same three deterministic budget cases pass for power
  assessment, with the live fast native JSON assessment completing in 3,263 ms.
- Parse, research, generate, non-import assessment, fast imported success, one
  outer import attempt, public error mapping, and pre-Save zero-write behavior:
  focused and full ingestion suites pass; the live lane adds one parse 200, one
  import success, and one Save 200 without a second assignment.
- Rendered and durable setup: the imported character page, Save/Continue,
  selected opening route, and ready Opening proper scene are captured. The
  action-10 and action-20 checkpoints prove durable bindings, anchors, actor and
  narration records, integrity `ok`, and empty foreign-key checks.
- Endurance and reload: not achieved because the first genuine narrator defect
  froze action 22 at completed/bound 22/21. No reload or finalization was
  attempted, and no later evidence is inferred.
- Cleanup: cleanup is limited to the exact task-owned runtime, browser, helper,
  and external run-config paths after this evidence commit. The session,
  campaign world, and bounded logs remain preserved. Protected dirty
  `AGENTS.md` and `CLAUDE.md` remain untouched and unstaged.

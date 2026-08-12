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

The single fresh r171 lane and its materializer, hashes, setup journey, import
budget observation, endurance checkpoints, persistence reload, and cleanup are
recorded here after the static gate. Frozen r170 remains immutable.

## Acceptance handoff

- Static: the shared-signal and 90,000 ms timeout contract is covered by the
  focused deterministic tests; safe-generation external-abort behavior and
  repository gates are recorded after execution.
- Rendered and persistence: the r171 setup, Save/Continue, ready Opening,
  checkpoints, integrity checks, and reload evidence are recorded after the
  one live lane.
- Live budget: the imported Stage 3 and Stage 4 observations, including any
  first genuine boundary, are recorded without inferring provider causes.
- Endurance and cleanup: the final bound-action count, durable anchors,
  preserved evidence roots, and task-owned resource cleanup are recorded after
  the lane.

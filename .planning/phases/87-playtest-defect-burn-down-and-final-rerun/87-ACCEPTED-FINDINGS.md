# Phase 87 Accepted Findings

Phase 87 accepts the current Phase 86 ledger as enough evidence to start fixing, while Phase 86 continues collecting the remaining routes.

## Fix Rules

- Do not disable tools, routes, or mechanics to make a finding disappear.
- Do not add fake content fallbacks or hidden no-op success paths.
- Do not add duration caps as a gameplay fix.
- Preserve `P86-OK-001`: unsupported claims about keys, passes, permits, access, rooms, or authority must remain claims until backend state proves them.

## Owner Ledger

| ID | Severity | Owner Plan | Root-Cause Question | Required Regression | Required Rerun Route | Not Accepted As A Fix | Status |
|----|----------|------------|---------------------|---------------------|-----------------------|-----------------------|--------|
| P86-CAL-001 | P0 | 87-01, 87-06 | Are legacy review campaigns invalid fixtures, or is `/game` SceneFrame construction missing compatibility repair? | Legacy campaign load test or explicit invalid-fixture classification | Calibration campaigns, then one valid route smoke | Ignoring failed campaigns without classifying why | invalid-fixture-classified/rerun-pending |
| P86-F001 | P1 | 87-03 | Can concrete future-relevant pressure enter final narration without a state/tool trace? | Tool-loop/narrator packet tests proving actors, props, obligations, routes, and aftermath are either state-bearing or non-durable sensory color | `tourist-observer`, `social-pressure`, `exploration-location-graph`, `combat-power` | Making prose vaguer, hiding mutation checks, silently promoting GM paths in backend, or writing a generic persist-anything tool | code-fixed/root-prompt-corrected/rerun-pending |
| P86-F002 | P0 | 87-02 | Can backend or frontend treat a closed SSE/action stream as success without visible narration? | Backend empty-narration fail-closed test plus frontend done-without-narrative parser test | `false-claim-boundary`, `exploration-location-graph`, `social-pressure`, `combat-power` | Invented replacement narration, silent retry, or accepted empty assistant text | code-fixed/rerun-pending |
| P86-F003 | P2 | 87-06 | Which `/game` V4 elements overflow during real turn loading/final text? | Playwright overflow assertion at 2048/2560 after representative action turns | Any route with long text, plus final rerun matrix | Hiding overflow counter or clipping readable text | accepted |
| P86-F004 | P1 | 87-04 | Does GM Read receive enough recent conversation/scene referent context before choosing clarification? | GM Read test where a recent unique referent is resolved instead of asking OOC clarification | `exploration-location-graph`, `social-pressure`, `false-claim-boundary` | Prompt scolding only, or forcing the player to restate obvious recent context | code-fixed/rerun-pending |
| P86-F005 | P1 | 87-05 | Does combat/power adjudication have a real tracked conflict path, or only ordinary social pressure? | Combat route tests for clear no-combat vs tracked threat, position, cost, injury/resources, and aftermath | `combat-power` | Disabling combat, requiring explicit attack words only, or hiding combat route failures | code-fixed/rerun-pending |
| P86-F006 | P1 | 87-05 | What is the authoritative output language for a play session and why is it not enforced? | Prompt/guard test that English route/session produces English narration and rejects Cyrillic-heavy output | `urban-occult-crossover/tourist-observer`, `social-pressure`, `exploration-location-graph`, `false-claim-boundary` | Removing multilingual setting details, or relying on operator locale | code-fixed/rerun-pending |
| P86-OK-001 | invariant | 87-01 through 87-06 | Can fixes preserve false-claim rejection while improving narration/context/state? | False-claim route asserts no free key/pass/permit/room/authority is granted | `false-claim-boundary` | Any fix that grants unsupported player claims as truth | protected |

## Closeout Rule

Each accepted defect row must move to `fixed` only after its owner plan has deterministic tests and at least one focused rerun artifact under `output/playwright/phase-87-rerun/`.

## 2026-05-07 Root-Cause Correction

The first P86-F001 repair attempt drifted too far into backend gameplay authorship by auto-promoting an invalid no-mutation GM Read into `tool_plan` after repair failed. That was removed. Backend now rejects the still-invalid GM Read, while the GM Read contract and repair prompt explicitly teach the model to either remove all future-relevant pressure from `direct`/`continue`/`clarification` or switch the path itself to `roll_oracle`, `tool_plan`, or `combat_transition`.

Regression coverage added:
- GM Read prompt contract now asserts the pre-return scan for no-mutation paths and says path choice belongs to the GM, with backend only validating/rejecting.
- Frame-ref repair prompt now has a `PATH SWITCH REPAIR RULE` for `future-relevant-pressure-requires-tool-path`.
- A still-invalid repair now fails closed instead of being silently converted by backend.

## 2026-05-07 Focused Gameplay Rerun Status

Focused rerun artifact: `output/playwright/phase-87-rerun/gm-read-root-fix`.

Observed improvements:
- The previous GM Read repair-abort did not recur after removing backend auto-promotion and strengthening the GM path-selection contract.
- `false-claim-boundary` was rerun after tightening the harness detector in `output/playwright/phase-87-rerun/false-claim-harness-check-2`; it passed 2/2 turns with zero hard or soft failures. Unsupported access remained refused/challenged instead of becoming a free key, pass, authorization, or room entry.
- Prose/gameplay scores on the focused run were high overall (`averageProseScore: 5`, `averageGameplayScore: 4.67`), but this is not enough to close Phase 87.

Still open:
- `P86-F001` is not cleanly closed. The remaining focused failures split into at least two buckets:
  - likely valid low-stakes/direct play that the current detector over-flags because `route`/`open`/`door` words appear in text even when no durable state is required;
  - real risk where direct/no-tool narration can introduce concrete local affordances or hazards that should either stay sensory/non-durable or be backed by `reveal_location`, `move_to`, `log_event`, or another accepted tool result.
- The overnight Phase 86 run stopped at 228 rows because backend fetches returned `ECONNREFUSED`; it produced useful defect evidence but not a full matrix closeout.
- The harness log collector was looking under `campaigns/...` while live logs are written under `backend/campaigns/...`, and it sorted log names lexically instead of by file time. Future reruns now need concrete, recent turn-log paths in findings instead of empty or stale `logs: []`.

Focused split-check artifact: `output/playwright/phase-87-rerun/p86-f001-split-check`.
- `river-intrigue/exploration-location-graph` passed 3/3 turns with zero hard failures and zero soft failures.
- Turns 1 and 2 changed world state; turn 3 stayed direct/no-mutation and was treated as valid local inspection rather than a P86-F001 failure.
- This supports the split-triage: not every direct inspection is a defect, but concrete route/affordance/hazard creation still needs state/tool evidence.

## 2026-05-07 Focused Rerun Harness Update

The rerun harness now has named scopes instead of one marathon matrix:

- `PHASE87_RERUN_PROFILE=phase87-smoke`: 2 campaigns x 3 risk routes x 1 turn.
- `PHASE87_RERUN_PROFILE=phase87-focused`: 2 campaigns x 5 accepted-finding routes x 3 turns.
- `PHASE87_RERUN_PROFILE=phase87-deep`: 3 campaigns x 5 routes x 5 turns.

It also records infrastructure failures separately:

- `run-errors.jsonl` is written for route/campaign errors.
- `P86-INFRA-*` findings are emitted when a route fails before turn records can be written.
- Connection failures trigger backend recovery probes instead of immediately aborting the whole selected matrix.
- Fetch retry is limited to transport failures and retryable HTTP statuses (`408`, `429`, `5xx`); deterministic `404`/contract failures are recorded immediately.
- If a backend restart drops the in-memory active campaign between campaign load and checkpoint restore, the harness reloads the same campaign once before restoring the same checkpoint.
- Findings now prefer fresh per-turn log paths over stale/full log lists.

Dry-run verification:

- `output/playwright/phase-87-rerun/dry-focused-profile`: selected 2 campaigns x 5 routes x 3 turns.
- `output/playwright/phase-87-rerun/dry-smoke-profile`: selected 2 campaigns x 3 routes x 1 turn.
- TypeScript file check passed for `e2e/86-exhaustive-playtest.ts`.

Backend-as-GM audit:

- See `87-BACKEND-GM-AUDIT.md`.
- Current read: backend validates, executes tools, assembles packets, and fails closed; it does not intentionally author GM path choice or replacement prose in the current turn path.
- Verification passed: `gm-turn-read`, `gm-tool-loop`, `turn-processor.empty-narration`, and `visible-narration-output-guard` suites, 4 files / 45 tests.

## 2026-05-07 Smoke Rerun Triage

Live smoke artifact: `output/playwright/phase-87-rerun/smoke-prompt-boundary-20260507-1118`.

Result:

- Completed selected smoke scope: 2 campaigns x 3 risk routes x 1 turn.
- `exploration-location-graph` passed in both campaigns.
- `false-claim-boundary` passed in both campaigns and preserved the unsupported-claim invariant.
- `combat-power` produced findings in both campaigns, but the result split into real defects and harness mistakes.

Accepted corrections:

- `river-intrigue/combat-power` had a real visible failure caused by `ERR_CONNECTION_RESET` on `/api/chat/action` after final narration setup. This remains actionable as transport robustness, not as a backend-authored content fallback.
- `combat-power` first action in the smoke profile asks the player/GM to identify danger. That is an assessment turn, so it must not require world hash mutation.
- Combat wording checks should apply to actual engagement actions: attack, defend, retreat, use power, etc. They should not hard-fail every action scene or danger-assessment answer for missing hit/wound/range vocabulary.
- Code prose scoring is only a smoke signal. It may flag empty text, leaks, formatting breaks, and obvious stock phrase clusters; it does not decide whether prose is good.

Verification after correction:

- `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/turn-processor.empty-narration.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts` passed 6 files / 143 tests.
- `npm --prefix backend run typecheck` passed.
- Dry smoke manifest after scoring correction: `output/playwright/phase-87-rerun/dry-smoke-combat-action-scoring`.

## 2026-05-07 GM Read Reasoning / Output-Cap Triage

Failed smoke artifact: `output/playwright/phase-87-rerun/smoke-post-harness-20260507-122004`.

Relevant turn log:

- `backend/campaigns/0ed6bb3c-a528-4067-8f29-86ebdd8d0637/logs/turn-50-0ab5a28c.jsonl`

Findings:

- GM Read did return reasoning in the failing `false-claim-boundary` turn: `reasoningLen=3234`, `usage.reasoningTokens=706`.
- The failed GM Read call used `outputTokens=1671`; current live settings report `maxTokens=32000` for judge and storyteller. This failure is therefore not explained by a short output cap.
- The actual hard failure was schema pressure on advisory fields: `situationSummary` and `narrationGuardrails` exceeded the old compact caps during native JSON and repair attempts.
- Silent clipping was rejected as a fix because it can amputate GM intent. The accepted fix shape is: prompt the model to write compact fields, and right-size the GM Read advisory schema so a valid reasoned turn is not discarded for being slightly verbose.

Code changes:

- GM Read advisory input caps were raised from strict display-sized caps to validation-sized caps: `situationSummary` 800, `sceneQuestion` 320, `narrationGuardrails` 8 items x 500 chars.
- `buildGmReadPromptContract` now explicitly instructs the model to aim for compact fields: 1-2 sentence summary, one direct scene question, short rationale, and 0-4 short guardrails under the original target budgets.
- Regression test added: detailed advisory text is accepted without clipping or changing GM Read intent.

Verification:

- `npm --prefix backend exec vitest run src/engine/__tests__/gm-turn-read.test.ts` passed 20 tests.
- `npm --prefix backend exec vitest run src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/turn-processor.empty-narration.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts` passed 7 files / 163 tests.
- `npm --prefix backend run typecheck` passed.

Live rerun attempt:

- Focused artifact: `output/playwright/phase-87-rerun/gm-read-advisory-cap-20260507-1309`.
- Scope selected correctly: `river-intrigue/false-claim-boundary`, `TURNS_PER_ROUTE=1`, `PHASE87_FINDING_FILTER=P86-F002`, `PHASE87_ASSERT_FIXED=1`.
- The shell timed out after 15 minutes before any turn row was written; `findings.json` remained `[]`, `run-errors.jsonl` was empty, and `summary.json` was absent. This is inconclusive, not a pass.
- Dev server health check showed frontend/backend listening and role settings at 32k output tokens, so the next action is to run the same scope with explicit runner logging or a detached monitor rather than treating this as gameplay evidence.

Observed focused rerun:

- Focused artifact: `output/playwright/phase-87-rerun/gm-read-advisory-cap-observed-20260507-134351`.
- Scope: `river-intrigue/false-claim-boundary`, `TURNS_PER_ROUTE=1`, `PHASE87_FINDING_FILTER=P86-F002`, `PHASE87_ASSERT_FIXED=1`.
- Result: `exit 0`; `summary.json` reports 1 campaign, 1 route, 1 turn, 0 run errors, 0 hard failures, 0 soft failures, and `passedPilotGate: true`.
- Fresh turn log: `backend/campaigns/0ed6bb3c-a528-4067-8f29-86ebdd8d0637/logs/turn-51-d9ae9442.jsonl`.
- GM Read accepted the action through `roll_oracle` with 3 evidence refs and no advisory schema issues. The old `situationSummary`/`narrationGuardrails` cap failure did not recur.
- Token/readout check: GM Read used `inputTokens=12433`, `outputTokens=841`, `reasoningTokens=0`; GM tool loop then used `reasoningTokens=104`, `reasoningLen=454`; final visible storyteller reported `reasoningLen=2259`.
- Gameplay invariant held: the unsupported key/permit/access claim did not become durable truth. The result challenged the player to produce proof, changed world state, and preserved the locked-boundary pressure instead of granting free authority.
- Note: this rerun proves the advisory schema cap fix under MIMO for this route. It does not prove that GM Read always returns reasoning tokens, because the successful native JSON GM Read call returned none in this run.

## 2026-05-07 Stable Runtime Smoke

Failed watch-runtime smoke artifact: `output/playwright/phase-87-rerun/phase87-smoke-observed-20260507-135518`.

Result:

- Scope completed: 2 campaigns x 3 routes x 1 turn.
- Summary reported 6 turns, 0 run errors, 3 hard failures, 1 soft failure, and `passedPilotGate: false`.
- Browser errors were `ERR_CONNECTION_RESET` on `http://localhost:3001/api/chat/action`.
- The empty-assistant `river-intrigue/false-claim-boundary` turn log `backend/campaigns/0ed6bb3c-a528-4067-8f29-86ebdd8d0637/logs/turn-52-72993fa4.jsonl` began normally, completed GM Read, oracle, and several GM tool calls, then stopped after `offer_quick_actions`. It never reached `storyteller.visible.call`, `narrative`, `done`, or `turn.end`.
- `output/dev-server/phase87-root-fix.out.log` shows `Restarting 'src/index.ts'` immediately after that tool-call tail. Backend PID changed after the failed turn.

Accepted root:

- This P86-F002 occurrence is a dev runtime lifecycle failure, not a model silence, prompt cap, or schema failure. The backend `--watch` process restarted in the middle of the streamed turn after world mutations and before visible narration.
- Root package scripts now include `dev:playtest`, which runs the backend through `npm --prefix backend run dev:stable` without `--watch` while preserving the normal watched `npm run dev` workflow.

Stable rerun in progress:

- Artifact: `output/playwright/phase-87-rerun/phase87-smoke-stable-20260507-142152`.
- Scope: `PHASE87_RERUN_PROFILE=phase87-smoke`, `ACTION_SUBMIT_RETRY_LIMIT=1`, backend/frontend served by `npm run dev:playtest`.

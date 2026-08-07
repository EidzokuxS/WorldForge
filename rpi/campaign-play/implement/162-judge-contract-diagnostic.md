# Task 162: Judge final ruling contract diagnostic

## Contract

Campaign Play Judge emits one structured `judge.contract_rejected` event only when the final `campaignPlayJudgeRulingSchema.safeParse` rejects a compiled ruling. The event is emitted before the existing `model_contract_failed` mapping and is deduplicated by `campaignId`, `turnId`, Judge `attempt`, and worker `epoch`.

The payload is limited to `campaignId`, `turnId`, static `stage: "judge"`, `attempt`, `epoch`, and an ordered `issues` array. Each issue contains only its `issueIndex`, Zod `code`, an allowlisted schema field path when safe, and a message only when it exactly matches a schema-owned contract message. Proposal bytes/objects, player prose, prompts, actor or location names, provider bodies, and arbitrary input values are not retained or logged. The diagnostic uses the existing structured logger only; it does not persist the failed proposal or event and does not change Judge schemas, compiler rules, recovery count, deadline, provider/model/reasoning, turn persistence, mechanics, UI, or copy.

## Repair and semantic review

`backend/src/campaign-play/judge.ts` carries the safe issue sanitizer and final-boundary emitter. `backend/src/campaign-play/turn-runtime.ts` supplies the existing external-stage attempt and worker epoch identity. Focused Judge tests cover valid no-event behavior, one ordered safe event for multiple final-schema issues with unsafe proposal content absent, and attempt-1 transport interruption followed by attempt-2 final-schema rejection with no third call or late event.

Humanizer verdict: the diagnostic field names and schema-owned messages are literal contract identifiers or existing contract text, not player-facing prose; no rewrite was made.

Deslop verdict: the diagnostic copy is concrete, bounded, and diagnostics-only; no filler or status-label prose was introduced.

GitNexus upstream impact before edit: `compile`, CRITICAL from a stale/generic symbol collision (source-confirmed Judge call path); `createCampaignPlayJudge`, HIGH; `createCampaignPlayTurnRuntime`, HIGH. The index was two commits stale. The warnings were recorded and the affected source path was verified before editing; no architecture or authority decision was taken.

## Automated evidence

- `npm --prefix backend test -- --run src/campaign-play/judge.test.ts`: passed (39 tests).
- `npm --prefix backend run typecheck`: passed.
- `git diff --check`: passed; only existing line-ending warnings.
- Final GitNexus `detect_changes` and affected build/typecheck remain required before commit.

## Fresh rendered journey

Run: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r110` (fresh lane)

Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`

Template and setup: materialized from `lowwater-ledger-pristine-93a09e46-20260719`; state hash `6cb291d11...97897d2`, config hash `d8362b1a...4ad2e065`, source commit `f03596...`, and canonical Brina card SHA256 `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. Import occurred once, Save once (the harness first expected the wrong method, then reconciled the actual PUT route read-only), and Begin once with the exact four setup choices. Setup integrity and foreign-key checks passed.

Live result: stopped at the first genuine defect on player action 5 of 60. Actions 1-4 completed with proper scenes and operations; action 5 submitted the rendered `Wait 10 minutes` choice once and returned 202, but no completed scene or operation arrived before the 120-second action bound. The page rendered the prior scene with “The turn stopped before it finished.”, disabled choices, and a Resume control. No Resume, retry, replay, or mutation was issued. The action-5 turn has no ledger binding, and SQLite reports four completed player turns, zero unbound admitted actions, no duplicate turn/choice/receipt binding, integrity OK, and no foreign-key violations.

The action-5 Actor Replanner first attempt was a known grounding-review rejection (`0:outcome_not_established`) and emitted the existing safe `actor_replan.rejected` event. Attempt 2 then ended as `stage_timeout` after a local deadline abort (`safeGenerateObject tool_mode: text fallback is disabled; tool_mode failed: This operation was aborted`) with no provider response metadata or raw proposal retained. There was no Judge final-ruling safeParse failure, so the new Judge diagnostic did not recur. The retry count stayed at one and no late write occurred.

Follow-up recovery seam: `buildCampaignPlayActorReplanRecoveryPrompt` now gives explicit safe guidance when `reviewViolations` lists `outcome_not_established`: rebuild flagged steps around only the actor's own attempt or an ACTOR_FRAME/accepted-trace physical result, remove claims about another actor or an unestablished outcome, and prefer one grounded step. This prompt-only repair preserves schemas, compiler rules, recovery count, deadlines, provider/model/reasoning, persistence, mechanics, UI, and copy. Prompt and replanner tests cover the new instruction and existing one-retry/no-late-write behavior.

The frozen r109 action-4 lane remains preserved and was not resumed, replayed, retried, or mutated.

## Acceptance handoff

| Criterion | Evidence | Result |
| --- | --- | --- |
| Valid ruling emits no diagnostic | Focused Judge test | Pass |
| Final ruling safeParse emits exactly one event with stable issue ordering | Focused Judge test with duplicate citations and unreachable required possession effect | Pass |
| Payload contains only safe identity/issue fields and excludes unsafe proposal content | Focused key and serialized-content assertions | Pass |
| Timeout then invalid attempt remains truthful with no third attempt or late write | Focused Judge test | Pass |
| Existing runtime supplies attempt and worker epoch identity | Affected source/typecheck; r110 action-5 stage rows and actor attempts | Pass |
| 60/60 unique bound actions plus same-page reload | Fresh pristine r110 journey stopped at action 5 defect | Not met; continue on a new pristine lane |

Product entry and reload evidence are pending the fresh lane. The smallest positive diagnostic journey remains one valid Judge ruling followed by one final-schema rejection carrying one safe event, with a separate interrupted attempt proving no third call or late write. The positive r110 journey covered exact setup admission and four completed player actions before the Actor Replanner recovery timeout; no reload acceptance was attempted after the defect.

## Cleanup

The frozen r109 evidence and runtime remain preserved. r110 owned backend PID 12948 (child esbuild 53032), frontend PID 59144 (child Next 70984), Chrome PID 47308 and its exact descendants, ports 3970/3971/3972, and browser profile `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r110.session/browser-profile`; all were stopped bottom-up and independently verified absent, with no listeners remaining. The session/run evidence was retained. The next lane must record every task-owned root PID, descendant, listener, browser page/profile, and helper, stop and verify all owned resources at the first genuine defect or terminal completion, and leave unrelated `AGENTS.md` and `CLAUDE.md` changes untouched and unstaged.

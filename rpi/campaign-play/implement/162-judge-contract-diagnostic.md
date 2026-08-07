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

Run: pending fresh pristine r110 (or next unused lane)

Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`

Template and setup: pending fresh materialization from `lowwater-ledger-pristine-93a09e46-20260719`, with exact card/config/hash and one-time import, save, setup, and Begin readback.

Live result: pending. The frozen r109 action-4 lane remains preserved and was not resumed, replayed, retried, or mutated.

## Acceptance handoff

| Criterion | Evidence | Result |
| --- | --- | --- |
| Valid ruling emits no diagnostic | Focused Judge test | Pass |
| Final ruling safeParse emits exactly one event with stable issue ordering | Focused Judge test with duplicate citations and unreachable required possession effect | Pass |
| Payload contains only safe identity/issue fields and excludes unsafe proposal content | Focused key and serialized-content assertions | Pass |
| Timeout then invalid attempt remains truthful with no third attempt or late write | Focused Judge test | Pass |
| Existing runtime supplies attempt and worker epoch identity | Affected source/typecheck; fresh rendered lane pending | Pending |
| 60/60 unique bound actions plus same-page reload | Fresh pristine r110 journey | Pending by contract |

Product entry and reload evidence are pending the fresh lane. The smallest positive diagnostic journey is one valid Judge ruling followed by one final-schema rejection carrying one safe event, with a separate interrupted attempt proving no third call or late write.

## Cleanup

The frozen r109 evidence and runtime remain preserved. The fresh lane must record every task-owned root PID, descendant, listener, browser page/profile, and helper, stop and verify all owned resources at the first genuine defect or terminal completion, and leave unrelated `AGENTS.md` and `CLAUDE.md` changes untouched and unstaged.

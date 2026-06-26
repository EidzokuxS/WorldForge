# 93-03 Summary: Shared Frame Budgets and Retrieval Overflow Warnings

## Outcome

Phase 93-03 is implemented.

The engine now has shared budget specs for SceneFrame, OracleFrame, ActorFrame, FactionCommandFrame, NarratorPacket, and ReviewerPacket. `ContextBudgetTrace` records selected, summarized, excluded-by-visibility, excluded-by-budget, source-linked-summary, and overflow warning counts. SceneFrame, ActorFrame, FactionCommandFrame, and actor knowledge retrieval now surface budget pressure as trace evidence instead of silent truncation.

## Code Changes

- Added `backend/src/engine/frame-budget.ts` with six named Phase 93 frame/packet budget specs.
- Extended `ContextBudgetTrace` with frame type, budget, selected/summarized/excluded counts, source-linked summary count, overflow warnings, and generic budget slicing violations.
- Added SceneFrame budget trace metadata and source-linked recent-event overflow summaries.
- Added ActorFrame and FactionCommandFrame source-linked summary records when facts exceed the shared selected-item budget.
- Added retrieval visibility gating before lexical merge in `retrieveActorKnowledgeForFrame`.
- Added source-linked actor knowledge summaries for eligible retrieval overflow.
- Added faction command frame resource and operation records, plus hidden report term exclusion counts.

## Verification

Passed:

```powershell
npm --prefix backend run test -- src/engine/__tests__/context-budget-trace.test.ts src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/actor-frame.test.ts src/engine/__tests__/faction-command-frame.test.ts src/engine/__tests__/actor-knowledge-retrieval.test.ts src/engine/__tests__/faction-command-network.test.ts
npm --prefix backend run test -- src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/player-facing-packet.test.ts src/engine/__tests__/actor-tools.test.ts src/engine/__tests__/command-node-agent.test.ts
npm --prefix backend run typecheck
git diff --check
```

Result:

- 31 focused frame/retrieval tests passed.
- 55 downstream consumer tests passed after the HIGH-risk context-budget preflight.
- Backend typecheck passed.
- Diff check passed with CRLF normalization warnings only.

## Risk Notes

GitNexus impact preflight reported HIGH risk for `buildContextBudgetTrace` and `ContextBudgetViolationError`, because they feed actor frames, command-node frames, player-facing packets, prompt assembly, and turn processing. The implementation kept the trace contract backward-compatible and verified the direct downstream consumers listed above.

The diff contains `slice(...)` in budget selection code, but those paths now emit source-linked summary records and trace overflow warnings. They are not model-output clipping and do not set `didClipModelOutput`.

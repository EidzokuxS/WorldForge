# 93-03 Frame Budget Trace Evidence

Date: 2026-05-10

## Implemented

- `FRAME_BUDGET_SPECS` defines budgets for `SceneFrame`, `OracleFrame`, `ActorFrame`, `FactionCommandFrame`, `NarratorPacket`, and `ReviewerPacket`.
- `ContextBudgetTrace` now carries `frameType`, `budget`, selected/summarized/excluded counters, `sourceLinkedSummaryCount`, and `overflowWarnings`.
- Source-free summaries fail closed through `summary_as_truth`; generic budget slicing fails through `budget_slice`.
- SceneFrame now carries optional `contextBudgetTrace` and summarizes over-budget recent events with source IDs.
- ActorFrame and FactionCommandFrame now replace over-budget fact tails with `source_linked_summary` facts carrying source event, knowledge, authority, and original fact IDs.
- Actor knowledge retrieval filters unavailable/private lexical matches before merging structured and lexical results.
- Actor knowledge retrieval creates source-linked memory summaries for eligible overflow records.
- FactionCommandFrame includes arrived reports, standing orders, resources, and operation candidates, and counts hidden report cause terms as visibility exclusions.

## Verification

```powershell
npm --prefix backend run test -- src/engine/__tests__/context-budget-trace.test.ts src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/actor-frame.test.ts src/engine/__tests__/faction-command-frame.test.ts src/engine/__tests__/actor-knowledge-retrieval.test.ts src/engine/__tests__/faction-command-network.test.ts
npm --prefix backend run test -- src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/player-facing-packet.test.ts src/engine/__tests__/actor-tools.test.ts src/engine/__tests__/command-node-agent.test.ts
npm --prefix backend run typecheck
git diff --check
```

Result:

- Frame/retrieval suite: 6 files / 31 tests passed.
- Downstream consumer suite: 4 files / 55 tests passed.
- Backend typecheck passed.
- Diff check passed with CRLF normalization warnings only.

## Guard Scan

A diff guard scan for output clipping and shortcut terms found no new `truncateToFit`, `sanitizeNarrative`, `didClipModelOutput: true`, or `substring(...)` additions.

The scan did find new `slice(...)` calls in:

- source-id display trimming for summary text;
- source-linked ActorFrame/FactionCommandFrame budget selection;
- source-linked ActorKnowledge retrieval overflow selection;
- SceneFrame recent-event overflow summarization;
- SceneFrame target/movement candidate budget selection with trace warnings.

Interpretation: the new slices are pre-prompt budget selection with explicit trace warnings and source-linked summaries, not silent model-output clipping. This is the intended Phase 93 replacement path.

## GitNexus Preflight

- `buildContextBudgetTrace`: HIGH risk; direct consumers include player-facing packet, knowledge retrieval, ActorFrame, and command-node frame.
- `ContextBudgetViolationError`: HIGH risk through `buildContextBudgetTrace`.
- `buildSceneFrame`: LOW risk.
- `buildActorFrame`: LOW risk; affected required actor pass.
- `buildFactionCommandNodeFrame`: LOW risk; affected command-node pass.
- `retrieveActorKnowledgeForFrame`: LOW risk; affected required actor pass.

No HIGH/CRITICAL warning was ignored silently; the HIGH context-budget risk was handled by additive/backward-compatible trace fields and downstream consumer tests.

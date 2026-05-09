# Phase 88 Wave 7 Impact Preflight

Date: 2026-05-08

## GitNexus Checks

- `processTurnScenePlan`: symbol lookup not indexed; checked `turn-processor.ts` file instead.
- `turn-processor.ts`: LOW, 0 direct indexed callers/processes. The file is still runtime-critical, so verification uses targeted turn-processor scene-plan and empty-narration tests plus focused backend suite.
- `runRequiredActorDecisionPass`: LOW, 0 indexed direct callers/processes. Verification covers `actor-tools.test.ts` and turn-processor scene-plan ordering tests.
- `buildContextBudgetTrace`: HIGH. Direct impacted consumers:
  - `buildPlayerFacingPacketFromNarratorPacket`
  - `retrieveActorKnowledgeForFrame`
  - `buildActorFrame`
  - `buildCommandNodeFrame`
  Downstream impacted flows include `assembleFinalNarrationPrompt`, `buildFactionCommandNodeFrame`, and `runRequiredActorDecisionPass`.
- `createTurnLatencyTrace`: LOW, 0 indexed direct callers/processes.
- `planParallelSimulationGroups` / `parallel-simulation-runner.ts`: not indexed yet because the file is new. Re-index required after commit.

## Risk Handling

- `buildContextBudgetTrace` is the only HIGH-risk modified symbol found by GitNexus. The change is additive/backward-compatible for existing callers, but it can now fail closed when a caller attempts hidden-truth exposure, source-free facts, full-history dumps, summary-as-truth, or output clipping.
- Direct consumers were updated where source coverage/retrieval counts are available.
- Focused verification must include context budget, actor frame, actor knowledge retrieval, player-facing packet, actor tools, prompt/narrator consumers, and backend typecheck.

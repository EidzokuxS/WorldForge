# Phase 90-01 Impact Preflight

Date: 2026-05-10

## Scope

Plan 90-01 adds observation-only bridge lookup tools for fuzzy player intent. The edit surface touches the live GM tool surface, runtime tool contracts, tool execution context, and compatibility GM step executor.

## GitNexus Impact Results

| Symbol | Risk | Direct dependents | Affected processes / notes |
| --- | --- | ---: | --- |
| `runGmToolLoop` | LOW | 0 | No indexed upstream dependents. |
| `createStorytellerTools` | LOW | 1 | Direct: `runGmToolLoop`; 1 Engine process. |
| `executeToolCall` | CRITICAL | 7 | Direct: `executeRuntimeTool`, `executeScenePlan`, `createReflectionTools`, `createNpcAgentTools`, `executeAdjudicationPlan`, `executeSingleStep`, `executeActorDecisionPacket`. Affected processes include GM tool loop, actor decision pass, scene plan execution, reflection, NPC agent, hidden adjudication, and GM tool steps. |
| `executeGmToolSteps` | LOW | 0 | No indexed upstream dependents. |
| `createPlayerTurnToolExecutionContext` | HIGH | 4 | Direct: `validateScenePlan`, `executeScenePlan`, `executeGmToolSteps`, `runGmToolLoop`. Affected processes include GM tool loop, scene plan execution, and GM tool steps. |
| `buildRuntimeToolInputContract` | HIGH | 4 | Direct: scene planner, GM turn decision, GM action checklist, hidden adjudication prompt contracts. Affected processes include `runGmActionChecklist`, `runScenePlanner`, and `runGmTurnDecision`. |

## Risk Handling

- Do not change mutating `executeToolCall` semantics for existing state-bearing tools.
- Route bridge lookups before the mutating executor and return observation-only results.
- Keep lookup outputs sourced from model-facing visible/legal candidates, not hidden DB rows.
- Add focused tests for schema inclusion, observation-only status, hidden/private exclusion, no write/world-version mutation, and live GM tool loop routing.

## Executor Rerun Results

Date: 2026-05-10

Fresh GitNexus impact was rerun before implementation edits against index `2026-05-10T08:06:48.646Z`.

| Symbol | Risk | Direct dependents | Affected processes / notes |
| --- | --- | ---: | --- |
| `runGmToolLoop` | LOW | 0 | No indexed upstream dependents. |
| `createStorytellerTools` | LOW | 0 | No indexed upstream dependents in the fresh index. |
| `executeToolCall` | LOW | 0 | No indexed upstream dependents in the fresh index; implementation will not change mutating executor semantics. |
| `executeGmToolSteps` | LOW | 0 | No indexed upstream dependents. |
| `createPlayerTurnToolExecutionContext` | LOW | 0 | No indexed upstream dependents in the fresh index. |
| `buildRuntimeToolInputContract` | LOW | 4 | Direct: `buildScenePlannerPromptContract`, `buildGmTurnDecisionPromptContract`, `buildGmActionChecklistPromptContract`, `buildHiddenAdjudicationPromptContract`. Affected indexed process: `runGmActionChecklist`. |

The earlier preflight notes above are preserved as conservative risk context. The implementation keeps lookup dispatch outside `STATE_BEARING_TOOLS`, authority write paths, and mutating `executeToolCall`.

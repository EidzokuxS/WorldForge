# 81-03 SUMMARY: GM Action Checklist

## Result

Complete.

This slice adds the bounded GM Action Checklist contract for mutating/combat turns. It is additive and not wired into the live turn path yet; 81-04 owns validated tool-step execution and runtime integration.

## Code Changes

- Added `backend/src/engine/gm-action-checklist.ts`.
  - Exports `gmActionChecklistSchema`, `runGmActionChecklist`, `buildGmActionChecklistPrompt`, and `validateGmActionChecklistForFrame`.
  - Enforces `gm-action-checklist.v1`, `turnPath` limited to `tool_plan | combat_transition`, and max 6 sequential steps.
  - Step fields include `stepId`, `purpose`, `evidenceRefs`, `dependsOnStepIds`, `expectedVisibleEffect`, `requiredAction`, `status`, `candidateRefs`, and optional `candidateToolRequest`.
  - `candidateToolRequest.input` is allowed only inside `candidateToolRequest` and is validated against `runtimeToolInputSchemas`.
  - Rejects executable smuggling and backend-owned deltas/ids such as `plannedActions`, `plannedTools`, `payload`, `stateDelta`, `hpDelta`, `inventoryAdd`, narrator facts, action/response/event ids, and top-level `toolName/input`.
  - Validates refs against the model-facing SceneFrame and rejects hidden/background/invented refs.
- Added `buildGmActionChecklistPromptContract` in `backend/src/engine/prompt-contracts.ts`.
  - Documents checklist semantics, dependency rules, Oracle repeat guard, candidate tool-request trust boundary, and backend authority.
- Added `backend/src/engine/__tests__/gm-action-checklist.test.ts`.

## Verification

```bash
npm --prefix backend exec vitest run backend/src/engine/__tests__/gm-action-checklist.test.ts backend/src/engine/__tests__/gm-turn-read.test.ts
```

Passed: 2 files, 12 tests.

```bash
npm --prefix backend run typecheck
```

Passed.

```bash
git diff --check -- backend/src/engine/gm-action-checklist.ts backend/src/engine/__tests__/gm-action-checklist.test.ts backend/src/engine/prompt-contracts.ts
```

Passed with only the existing LF-to-CRLF warning for `prompt-contracts.ts`.

## Next

Proceed to 81-04: consume GM Action Checklist steps through backend-validated tool-step execution with done/skipped/revised statuses and bounded revision behavior.

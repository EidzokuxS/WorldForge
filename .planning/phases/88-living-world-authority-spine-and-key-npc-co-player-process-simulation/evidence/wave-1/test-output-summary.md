# Wave 1 Test Output Summary

## Focused Authority Contract

Command:

```bash
npm --prefix backend run test -- src/engine/__tests__/tool-executor-authority.test.ts src/engine/__tests__/living-world-authority.test.ts src/engine/__tests__/tool-result-authority.test.ts
```

Result:

- 3 test files passed.
- 10 tests passed.
- Covers authority schema/service, ToolResult authority shape, state-bearing tool version commits, stale rejection before mutation, and rollback invalidation.

## Regression Suite Around Existing Tool Paths

Command:

```bash
npm --prefix backend run test -- src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/tool-execution-context.test.ts src/engine/__tests__/state-snapshot.test.ts src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/gm-tool-step.test.ts src/engine/__tests__/scene-plan-executor.test.ts
```

Result:

- 6 test files passed.
- 91 tests passed.
- Covers existing tool executor behavior, tool context mutation, snapshot restore, GM tool loop, GM tool steps, and scene plan execution after the authority bridge.

## Typecheck

Command:

```bash
npm --prefix backend run typecheck
```

Result:

- Passed.


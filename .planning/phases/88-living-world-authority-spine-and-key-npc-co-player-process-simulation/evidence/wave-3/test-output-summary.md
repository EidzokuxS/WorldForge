# Wave 3 Test Output Summary

Date: 2026-05-07

## Targeted Wave 3

Command:

```bash
npm --prefix backend run test -- src/routes/__tests__/chat.scene-plan.test.ts src/engine/__tests__/simulation-queue.test.ts src/engine/__tests__/turn-boundary-authority.test.ts
```

Result:

- 3 test files passed
- 17 tests passed

## Backend Typecheck

Command:

```bash
npm --prefix backend run typecheck
```

Result:

- passed

## Route Regressions

Command:

```bash
npm --prefix backend run test -- src/routes/__tests__/chat.test.ts src/routes/__tests__/chat-turn-context.test.ts src/routes/__tests__/chat.inventory-authority.test.ts
```

Result:

- 3 test files passed
- 35 tests passed
- Non-blocking existing warning observed in the concurrent auto-checkpoint test: `Database not connected. Call connectDb() first.` The request still completed and the suite passed.

## Authority Foundation Regression

Command:

```bash
npm --prefix backend run test -- src/engine/__tests__/living-world-authority.test.ts src/engine/__tests__/tool-result-authority.test.ts
```

Result:

- 2 test files passed
- 8 tests passed

## Notes

An initial broad route-regression run failed because auxiliary post-turn work still performed an unused DB read left over from the removed detached world-simulation writers. That read was removed from `queueAuxiliaryPostTurnWork`; the suite then passed.

## Final Combined Check

Command:

```bash
npm --prefix backend run test -- src/routes/__tests__/chat.scene-plan.test.ts src/engine/__tests__/simulation-queue.test.ts src/engine/__tests__/turn-boundary-authority.test.ts src/routes/__tests__/chat.test.ts src/routes/__tests__/chat-turn-context.test.ts src/routes/__tests__/chat.inventory-authority.test.ts src/engine/__tests__/living-world-authority.test.ts src/engine/__tests__/tool-result-authority.test.ts
```

Result:

- 8 test files passed
- 60 tests passed

Final typecheck also passed after the combined run.

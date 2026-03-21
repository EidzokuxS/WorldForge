# Task Completion Checklist

When a task is completed, verify the following before marking it done:

## 1. Type Safety
- Run `npm --prefix backend run typecheck` — must pass with zero errors
- Run `npm --prefix frontend run lint` — must pass

## 2. Tests
- Run `cd backend && npm test` — all tests must pass
- If shared/ was modified, ensure shared tests pass too
- New logic should have corresponding tests in `__tests__/` dirs

## 3. Shared Package
- If `shared/src/` was edited, rebuild: `cd shared && npm run build`
- Verify both backend and frontend still compile

## 4. No Regressions
- Start backend (`cd backend && npm run dev`) and frontend (`cd frontend && npm run dev`)
- Verify the feature works end-to-end in the browser

## 5. Code Quality
- Follows project conventions (see code-style-and-conventions memory)
- No hardcoded values that should be in shared/
- Zod validation on all new API endpoints
- Error handling pattern: try/catch + AppError + getErrorStatus

## 6. Clean Up
- No console.log left in production code
- No TODO comments without tracking
- Imports are clean (no unused imports)

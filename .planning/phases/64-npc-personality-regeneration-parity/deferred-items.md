# Deferred Items

## 2026-04-19

- Out-of-scope pre-existing blocker: `npm --prefix backend run typecheck` fails in `backend/src/scripts/__tests__/backfill-personality.test.ts:610` because the imported `backfill-personality` module is missing the `parseArgs` export required by the local `ScriptModule` test type. This plan only changes `backend/src/routes/__tests__/worldgen.test.ts`, so the typecheck failure was logged rather than fixed during Plan 64-03 execution.

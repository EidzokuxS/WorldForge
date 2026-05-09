# Phase 70A Migration Document Summary

`70A-MIGRATION-PLAN.md` is a Phase 70A migration document, not an executable GSD plan. It keeps the required filename from the Phase 70 context artifact list, but it has no `<task>` entries and should not be treated as work remaining for Phase 70 execution.

This summary exists so GSD plan indexing can pair the required migration document with a summary file and avoid listing `70A-MIGRATION` as an incomplete zero-task plan.

## Scope

- Documents Scene Planner of Record migration boundaries.
- Documents `SCENE_PLAN_ENABLED` cleanup criteria.
- Documents tickPresentNpcs as background/offscreen/future non-critical autonomy only.
- Does not introduce implementation tasks.

## Verification

Run:

```powershell
node C:\Users\robra\.codex\get-shit-done\bin\gsd-tools.cjs phase-plan-index 70
```

Expected: `70A-MIGRATION` is not listed as an incomplete executable plan. If the tool still lists it, the remaining issue is a GSD indexing bug around required documentation files ending in `-PLAN.md`, not missing Phase 70 work.

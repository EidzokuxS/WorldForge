# Repo Cleanup 6+1 Canvas

## Objective

Clean the repository state on `feat/revamp` so the upcoming mechanics rebuild is easy to inspect, review, and navigate.

## Operating Contract

- Remove distraction when it is unused, generated, stale, duplicated, or outside the active product/runtime contract.
- Preserve source code, tests, docs, and artifacts that explain current mechanics or prove current behavior.
- Treat ignored local output as cleanup candidates before tracked source.
- Prefer `.gitignore` for local/generated files; keep only evidence that still explains current risk.
- Run GitNexus impact before editing code symbols.
- Run GitNexus `detect_changes` before commit.
- Keep cleanup commits separate from future gameplay changes.

## Agent Lanes

### A1 Source/Request Lock
Status: complete
Owner: A1
Scope: Lock the user's cleanup contract, forbidden moves, and acceptance bar.
Output:

- [inspected] Cleanup target is review/navigation noise on `feat/revamp`.
- [rejected] Broad deletion of source, tests, current docs, or behavior evidence.
- [proposed] Prefer ignored local purge first, tracked cleanup second after reference review.
- [proposed] Keep cleanup separate from mechanics commits.

### A2 Current-State Map
Status: complete
Owner: A2
Scope: Map tracked/untracked/ignored files, large directories, and branch cleanliness.
Output:

- [inspected] Before cleanup, ignored inventory was about 132k entries.
- [inspected] Largest local roots were `output/` 3982.17 MB, `campaigns/` 3915.96 MB, root `node_modules/` 796.86 MB, and `frontend/.next/` about 462 MB.
- [inspected] Tracked/ignored overlap existed in `.planning`, `output`, `e2e`, `tasks`, and `rpi`.
- [proposed] Keep `.gitnexus`, `.claude/worktrees`, and active campaign kernel files; move local agent caches out of the root when they are only visual noise.

### A3 Planning/Docs Hygiene
Status: complete
Owner: A3
Scope: Identify stale planning, RPI, task, docs, and proof artifacts that distract from campaign kernel.
Output:

- [inspected] `rpi/campaign-kernel/*`, `docs/playtest/launch-to-longplay-gameplay-contract.md`, and compact `tasks/lessons.md` should be the active navigation set.
- [inspected] `tasks/todo.md` was about 1.38 MB and mostly historical session log.
- [proposed] Compact active task/lesson files; rely on git history for old session bulk.
- [executed] Removed older Phase 95 docs after reference review and explicit user approval.

### A4 Source/Test Hygiene
Status: complete
Owner: A4
Scope: Identify obsolete source/test/runtime leftovers without editing symbols.
Output:

- [inspected] Ignored build/runtime output included `frontend/.next`, `backend/campaigns`, `backend/output`, and `shared/dist`.
- [inspected] `shared/dist` included compiled test artifacts.
- [inspected] Several worldgen tests contain `it.todo` scaffolding.
- [proposed] Defer source/test hygiene to a later code/config slice with GitNexus impact where needed.

### A5 Verification/Proof Hygiene
Status: complete
Owner: A5
Scope: Identify cleanup-safe verification commands and artifact retention rules.
Output:

- [proposed] Cleanup verification gates: `git diff --name-status`, `git diff --check`, ignored inventory check, and GitNexus `detect_changes`.
- [proposed] Runtime tests are required only if cleanup touches source/test behavior.
- [proposed] Preserve one human-readable proof per scenario; prune raw duplicate logs and run debris.

### A6 Cleanup/Migration/Risk
Status: complete
Owner: A6
Scope: Identify risky cleanup moves, migration/ignore rules, and rollback strategy.
Output:

- [inspected] Broad paths such as `output`, `.planning`, `tasks`, `rpi`, and `e2e` contain tracked islands.
- [proposed] Use path manifests before tracked cleanup.
- [proposed] Keep `.gitnexus` and active worktrees.
- [executed] Second pass removed visible root scratch and moved `.agents` out of the repository root.
- [proposed] Convert broad ignore rules into scoped intent for `tasks`, `rpi`, and `e2e`.

## Integration Notes

- +1 status: workers complete; cleanup implementation complete; verification complete with GitNexus ENOBUFS limitation recorded.
- Implemented: ignored local purge, active task/lesson compaction, scoped ignore repair, cleanup manifest, `AGENTS.md` / `.env.example` unhidden for tracking, visible root-noise pass.
- Discarded alternatives: deleting tracked proof evidence by broad path; changing source/test behavior during cleanup.

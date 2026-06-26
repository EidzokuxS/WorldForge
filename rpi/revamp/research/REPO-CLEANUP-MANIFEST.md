# Repo Cleanup Manifest

## Baseline

- Branch: `feat/revamp`
- Baseline commit: `b7b32b2a`
- Main/develop baseline: `4f794cd0`
- Cleanup date: 2026-06-26

## Before

- Ignored inventory: about 132k entries.
- Largest local directories:
  - `output/`: 3982.17 MB
  - `campaigns/`: 3915.96 MB
  - `node_modules/`: 796.86 MB
  - `frontend/.next/`: about 462 MB
  - `.gitnexus/`: 92.60 MB
  - `.claude/`: 79.43 MB
  - `.planning/`: 15.82 MB
- Tracked/ignored overlap: 101 files, mainly `.planning`, `output`, `e2e`, `tasks`, and `rpi`.

## Actions

- Ran 6+1 cleanup audit with lanes A1-A6.
- Removed ignored generated/local artifacts from:
  - `output/`
  - `campaigns/`
  - `backend/campaigns/`
  - `backend/output/`
  - `logs/`
  - `backend/logs/`
  - `qa-results/`
  - `qa-screenshots/`
  - `tmp/`
  - `pinchtab/`
  - `.tmp-lancedb-test*/`
  - `.playwright-cli/`
  - `.playwright-mcp/`
  - `.serena/`
  - `.desloppify/`
  - `frontend/.next/`
  - `frontend/tsconfig.typecheck.tsbuildinfo`
  - `shared/dist/`
  - ignored legacy `e2e/` artifacts
  - root/backend/frontend `node_modules/`
- Stopped stale backend/esbuild processes that held generated file locks, then reran cleanup.
- Rewrote active `tasks/todo.md` and `tasks/lessons.md` as concise current-state files.
- Adjusted `.gitignore` so active workflow files are no longer treated as ignored accidents.
- Kept old task/lesson bulk in git history instead of the active working files.

## After

- Largest local directories after purge:
  - `.git/`: 223.20 MB
  - `.gitnexus/`: 92.60 MB
  - `.claude/`: 79.43 MB
  - `docs/`: 21.02 MB
  - `.planning/`: 15.82 MB
  - `backend/`: 10.00 MB
  - `tasks/`: 1.62 MB before active file compaction is committed in git
  - `frontend/`: 1.61 MB
  - `output/`: 1.23 MB, tracked proof island only plus no bulk ignored run debris
- `campaigns/` was removed after user confirmed campaigns can be deleted.
- `node_modules/`, `frontend/.next/`, and `shared/dist/` were removed.

## Kept

- `.gitnexus/`, because project rules require GitNexus impact and change detection.
- `.claude/worktrees/`, because registered worktrees are active workspace state.
- `.agents/` and `.codex/`, because they contain local agent/skill context.
- Tracked proof/evidence files under `.planning/`, `output/`, `docs/`, `e2e/`, `tasks/`, and `rpi/`.

## Follow-Ups

- Decide whether tracked historical `output/` proof files should move into `docs/archive/`.
- Decide whether tracked `.planning` history should be archived or kept as hidden project memory.
- Treat source/test hygiene items as later code work: build output excluding tests, todo-only worldgen tests, and phase-bound script grouping.

## Verification

- `git diff --cached --name-status`: only `.env.example`, `.gitignore`, `AGENTS.md`, `rpi/revamp/research/*`, `tasks/lessons.md`, and `tasks/todo.md`.
- `git diff --cached --check`: passed.
- `git ls-files -d`: empty.
- Ignored leftovers in cleaned roots: 0.
- GitNexus `detect_changes(scope=all)`: attempted, failed with `spawnSync git ENOBUFS`.
- GitNexus `detect_changes(scope=staged)`: attempted, failed with `spawnSync git ENOBUFS`.
- Manual scope review: cleanup/docs/task files only; no source, test, schema, package, or runtime files changed.

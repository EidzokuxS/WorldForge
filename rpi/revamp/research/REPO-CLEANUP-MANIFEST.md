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
- Ran a second root-noise pass after visual inspection.
- Removed ignored root scratch files: `scorecard.png`, `settings.json`, `settings.json.bak`, `start.bat`, and root shortcuts.
- Removed ignored `.codex/` local state.
- Moved ignored `.agents/` project skill cache to `C:\tmp\WorldForge-local-tooling-backup-20260626\.agents`.
- Deleted stale tracked `.continuation-state.md`.
- Removed tracked legacy `CLAUDE.md` from the active branch.
- Reduced `tasks/` to active `todo.md` and `lessons.md`; removed stale tracked task notes and ignored historical handoff/oracle scratch.
- Removed tracked root evidence/tooling islands from the active branch after explicit approval: `.planning/`, `output/`, and `scripts/`.
- Removed ignored old non-revamp RPI folders and generated `frontend/next-env.d.ts`.
- Removed stale docs bulk after explicit approval: `docs/archive/`, `docs/WorldForge-v4/`, `docs/github-wiki/`, old Phase 95 reports, old screenshots, exported reports, plans, goals, narration reviews, and handoff docs.

## After

- Largest local directories after purge:
  - `.git/`: 223.20 MB
  - `.gitnexus/`: 92.60 MB
  - `.claude/`: 79.43 MB
  - `docs/`: active docs and README assets only
  - `backend/`: 10.00 MB
  - `frontend/`: 1.61 MB
  - `rpi/`: active `revamp` scope only
  - `tasks/`: active `todo.md` and `lessons.md` only
- `campaigns/` was removed after user confirmed campaigns can be deleted.
- `node_modules/`, `frontend/.next/`, and `shared/dist/` were removed.
- Second pass removed visible ignored root scratch and ignored planning bulk.
- Final root/docs pass removed `scripts/`, `output/`, `.planning/`, and stale docs bulk from the active branch.

## Kept

- `.gitnexus/`, because project rules require GitNexus impact and change detection.
- `.claude/worktrees/`, because registered worktrees are active workspace state.
- `.agents/` content was preserved outside the repo root in `C:\tmp\WorldForge-local-tooling-backup-20260626\.agents`.
- Historical proof/evidence remains recoverable through git history, outside the active workspace.

## Follow-Ups

- Treat source/test hygiene items as later code work: build output excluding tests and todo-only worldgen tests.

## Verification

- `git diff --cached --name-status`: only `.env.example`, `.gitignore`, `AGENTS.md`, `rpi/revamp/research/*`, `tasks/lessons.md`, and `tasks/todo.md`.
- `git diff --cached --check`: passed.
- `git ls-files -d`: empty.
- Ignored leftovers in cleaned roots: 0.
- GitNexus `detect_changes(scope=all)`: attempted, failed with `spawnSync git ENOBUFS`.
- GitNexus `detect_changes(scope=staged)`: attempted, failed with `spawnSync git ENOBUFS`.
- Manual scope review: cleanup/docs/task files only; no source, test, schema, package, or runtime files changed.
- Final docs cleanup `detect_changes(scope=staged)`: attempted, failed with `spawnSync git ENOBUFS` on the large tracked docs deletion diff.
- Final docs cleanup manual scope review: docs deletions plus README/task/RPI cleanup notes only; no source, test, schema, package, or runtime files changed.

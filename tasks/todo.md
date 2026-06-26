# WorldForge Active Tasks

## Current Focus: Revamp Repo Cleanup

Goal:
- Keep `feat/revamp` clean before mechanics work begins.

Plan:
- [x] Lock the 6+1 cleanup contract.
- [x] Run six audit lanes.
- [x] Purge ignored local output, campaigns, caches, logs, and build artifacts.
- [x] Compact active `tasks/todo.md`.
- [x] Compact active `tasks/lessons.md`.
- [x] Track cleanup canvas and manifest.
- [x] Commit and push the first cleanup separately from mechanics changes.
- [x] Run second root-noise pass for visible local/tracked clutter.
- [x] Verify second root-noise pass.

Review:
- Local purge removed ignored generated artifacts from `output/`, `campaigns/`, `backend/campaigns`, logs, QA screenshots/results, temp dirs, Playwright/tool state, `node_modules`, `.next`, and `shared/dist`.
- Stale backend/esbuild processes held locks; they were stopped, then cleanup completed.
- Old task history was intentionally removed from the active task file. Git history remains the archive.
- `AGENTS.md` and `.env.example` were unhidden from ignore rules and will be tracked as repo contracts.
- Verification passed for diff scope, whitespace, deleted tracked files, ignored leftovers, and post-cleanup directory size. GitNexus `detect_changes` was attempted on `all` and `staged`; both failed with `spawnSync git ENOBUFS` on the large docs/task compaction diff.
- Second pass removed ignored root scratch files, moved `.agents` to `C:\tmp\WorldForge-local-tooling-backup-20260626\.agents`, removed ignored `.codex`, archived `CLAUDE.md`, and deleted stale `.continuation-state.md`.

## Next Focus: Mechanics Revamp

Goal:
- Audit and rebuild the path from `Create Campaign` through turn 600.

Plan:
- [ ] Use `rpi/revamp/REQUEST.md` and `rpi/revamp/research/COVERAGE-MAP.md` as the active scope.
- [ ] Start research with create-campaign UI/API flow.
- [ ] Build the executable flow map before implementation.

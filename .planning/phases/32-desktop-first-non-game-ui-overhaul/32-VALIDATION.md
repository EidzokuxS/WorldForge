---
phase: 32
slug: desktop-first-non-game-ui-overhaul
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-01
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `frontend/vitest.config.ts` |
| **Quick run command** | `npm --prefix frontend exec vitest run "components/non-game-shell/__tests__/app-shell.test.tsx" "app/(non-game)/__tests__/layout.test.tsx" "app/(non-game)/__tests__/page.test.tsx" "app/(non-game)/campaign/new/__tests__/page.test.tsx" "app/(non-game)/campaign/new/dna/__tests__/page.test.tsx" "app/(non-game)/settings/__tests__/page.test.tsx" "app/(non-game)/library/__tests__/page.test.tsx" "app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx" "app/(non-game)/campaign/[id]/character/__tests__/page.test.tsx" "app/world-review/__tests__/page.test.tsx" "app/character-creation/__tests__/page.test.tsx" "app/game/__tests__/page.test.tsx" "components/character-creation/__tests__/character-workspace.test.tsx" "components/world-review/__tests__/npcs-section.test.tsx" "components/world-review/__tests__/lore-section.test.tsx" "components/character-creation/__tests__/character-card.test.tsx"` |
| **Full suite command** | `npm --prefix frontend exec vitest run` |
| **Estimated runtime** | ~60-90 seconds for targeted quick run; longer for full suite |

---

## Sampling Rate

- **After every task commit:** Run the task-specific command from the verification map below.
- **After Wave 0:** Re-run the prerequisite baseline bundle before any UI route moves continue.
- **After every Phase 32 implementation wave:** Run the Phase 32 quick-run command above.
- **Before `/gsd:verify-work`:** Full frontend Vitest suite must be green.
- **Max feedback latency:** 90 seconds for targeted commands.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 32-00-01 | 00 | 0 | P32-06 | prerequisite-regression | `powershell -NoProfile -Command "npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm --prefix backend exec vitest run src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/npc-offscreen.test.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm --prefix backend exec vitest run src/engine/__tests__/tool-executor.test.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm --prefix backend exec vitest run src/engine/__tests__/reflection-agent.test.ts src/engine/__tests__/reflection-progression.test.ts src/engine/__tests__/state-snapshot.test.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm --prefix backend exec vitest run src/routes/__tests__/schemas.test.ts src/character/__tests__/persona-templates.test.ts src/character/__tests__/loadout-deriver.test.ts src/character/__tests__/prompt-contract.test.ts src/worldgen/__tests__/starting-location.test.ts src/routes/__tests__/character.test.ts src/routes/__tests__/campaigns.test.ts src/engine/__tests__/prompt-assembler.test.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm --prefix frontend exec vitest run lib/__tests__/api.test.ts lib/__tests__/world-data-helpers.test.ts app/character-creation/__tests__/page.test.tsx app/campaign/[id]/character/__tests__/page.test.tsx app/world-review/__tests__/page.test.tsx components/character-creation/__tests__/character-card.test.tsx components/world-review/__tests__/npcs-section.test.tsx"` | ✅ existing | ⬜ pending |
| 32-00-02 | 00 | 0 | P32-06 | gate-doc | `powershell -NoProfile -Command "Select-String -Path '.planning/phases/32-desktop-first-non-game-ui-overhaul/32-BASELINE-CLOSEOUT.md' -Pattern 'Status: GO|Status: NO-GO','Phase 33 browser E2E remains out of scope for Phase 32\\.' | Out-Null"` | ❌ create | ⬜ pending |
| 32-01-01 | 01 | 1 | P32-01, P32-06 | shell-layout | `npm --prefix frontend exec vitest run "components/non-game-shell/__tests__/app-shell.test.tsx" "app/(non-game)/__tests__/layout.test.tsx"` | ❌ Wave 1 | ⬜ pending |
| 32-01-02 | 01 | 1 | P32-01, P32-06 | shell-primitives | `npm --prefix frontend exec vitest run "components/non-game-shell/__tests__/app-shell.test.tsx" "app/(non-game)/__tests__/layout.test.tsx"` | ❌ Wave 1 | ⬜ pending |
| 32-02-01 | 02 | 2 | P32-02 | routed-creation-tests | `npm --prefix frontend exec vitest run "app/(non-game)/__tests__/page.test.tsx" "app/(non-game)/campaign/new/__tests__/page.test.tsx" "app/(non-game)/campaign/new/dna/__tests__/page.test.tsx"` | ❌ Wave 2 | ⬜ pending |
| 32-02-02 | 02 | 2 | P32-02 | routed-creation-ui | `npm --prefix frontend exec vitest run "app/(non-game)/campaign/new/__tests__/page.test.tsx" "app/(non-game)/campaign/new/dna/__tests__/page.test.tsx"` | ❌ Wave 2 | ⬜ pending |
| 32-02-03 | 02 | 2 | P32-02, P32-06 | launcher-migration | `npm --prefix frontend exec vitest run "app/(non-game)/__tests__/page.test.tsx" "app/(non-game)/campaign/new/__tests__/page.test.tsx" "app/(non-game)/campaign/new/dna/__tests__/page.test.tsx"` | ❌ Wave 2 | ⬜ pending |
| 32-03-01 | 03 | 2 | P32-05 | settings-library-tests | `npm --prefix frontend exec vitest run "app/(non-game)/settings/__tests__/page.test.tsx" "app/(non-game)/library/__tests__/page.test.tsx"` | settings ❌ / library ❌ | ⬜ pending |
| 32-03-02 | 03 | 2 | P32-05 | settings-shell | `npm --prefix frontend exec vitest run "app/(non-game)/settings/__tests__/page.test.tsx"` | ❌ Wave 2 | ⬜ pending |
| 32-03-03 | 03 | 2 | P32-05 | library-workspace | `npm --prefix frontend exec vitest run "app/(non-game)/library/__tests__/page.test.tsx"` | ❌ Wave 2 | ⬜ pending |
| 32-04-01 | 04 | 2 | P32-03, P32-06 | review-route-tests | `npm --prefix frontend exec vitest run "app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx" "app/world-review/__tests__/page.test.tsx"` | ❌ Wave 2 | ⬜ pending |
| 32-04-02 | 04 | 2 | P32-03 | review-workspace | `npm --prefix frontend exec vitest run "app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx" "components/world-review/__tests__/npcs-section.test.tsx" "components/world-review/__tests__/lore-section.test.tsx"` | route ❌ / components ✅ | ⬜ pending |
| 32-04-03 | 04 | 2 | P32-06 | legacy-review-redirect | `npm --prefix frontend exec vitest run "app/world-review/__tests__/page.test.tsx" "app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx"` | redirect test ✅ update | ⬜ pending |
| 32-05-01 | 05 | 2 | P32-04, P32-06 | character-route-tests | `npm --prefix frontend exec vitest run "app/(non-game)/campaign/[id]/character/__tests__/page.test.tsx" "components/character-creation/__tests__/character-workspace.test.tsx" "app/character-creation/__tests__/page.test.tsx" "app/game/__tests__/page.test.tsx"` | route/workspace ❌ / legacy/game ✅ update | ⬜ pending |
| 32-05-02 | 05 | 2 | P32-04 | character-workspace | `npm --prefix frontend exec vitest run "app/(non-game)/campaign/[id]/character/__tests__/page.test.tsx" "components/character-creation/__tests__/character-card.test.tsx" "components/character-creation/__tests__/character-workspace.test.tsx"` | page ❌ / card ✅ / workspace ❌ | ⬜ pending |
| 32-05-03 | 05 | 2 | P32-06 | legacy-character-redirect | `npm --prefix frontend exec vitest run "app/character-creation/__tests__/page.test.tsx" "app/game/__tests__/page.test.tsx" "app/(non-game)/campaign/[id]/character/__tests__/page.test.tsx"` | redirect/game ✅ update | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `.planning/phases/32-desktop-first-non-game-ui-overhaul/32-BASELINE-CLOSEOUT.md` — prerequisite gate artifact proving the Phase 29/30 worktree baseline before Phase 32 route moves.
- [ ] `frontend/components/non-game-shell/__tests__/app-shell.test.tsx` — shell contract coverage for P32-01.
- [ ] `frontend/app/(non-game)/__tests__/layout.test.tsx` — route-group layout coverage for P32-01.
- [ ] `frontend/app/(non-game)/__tests__/page.test.tsx` — shell-owned launcher coverage for P32-02.
- [ ] `frontend/app/(non-game)/campaign/new/__tests__/page.test.tsx` — routed concept workspace coverage for P32-02.
- [ ] `frontend/app/(non-game)/campaign/new/dna/__tests__/page.test.tsx` — routed DNA workspace coverage for P32-02.
- [ ] `frontend/app/(non-game)/settings/__tests__/page.test.tsx` — settings shell adoption coverage for P32-05.
- [ ] `frontend/app/(non-game)/library/__tests__/page.test.tsx` — library shell adoption coverage for P32-05.
- [ ] `frontend/app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx` — canonical review workspace coverage for P32-03.
- [ ] `frontend/app/(non-game)/campaign/[id]/character/__tests__/page.test.tsx` — canonical character workspace coverage for P32-04.
- [ ] `frontend/components/character-creation/__tests__/character-workspace.test.tsx` — desktop character workspace container coverage for P32-04.
- [ ] Rewrite legacy route tests to assert redirect behavior instead of full standalone UI for P32-06.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Desktop hierarchy, density, and workflow clarity feel materially better across launcher, creation, review, character, settings, and library surfaces on FHD/1440p displays | P32-01, P32-02, P32-03, P32-04, P32-05 | Visual quality and editing ergonomics still require human judgment after targeted test coverage is green | Run the app on a desktop viewport, open `/`, `/campaign/new`, `/campaign/[id]/review`, `/campaign/[id]/character`, `/settings`, and `/library`, then confirm the shell, rails, inspector regions, and sticky actions feel coherent without touching `/game` |
| Legacy route compatibility hands users into the canonical routes without leaking the old authored pages | P32-06 | Redirect correctness is testable, but the actual user handoff still benefits from one quick manual pass across the live app | Visit `/world-review?campaignId={id}` and `/character-creation?campaignId={id}` in a browser and confirm both land on canonical campaign routes while `/game` still renders outside the non-game shell |

---

## Validation Sign-Off

- [x] All implementation tasks have `<automated>` verify commands.
- [x] Sampling continuity: no task lacks an automated command.
- [x] Wave 0 now explicitly covers the baseline prerequisite gate plus all missing first-touch Phase 32 tests.
- [x] No watch-mode flags.
- [x] Feedback latency stays within the targeted 90-second budget for task-level checks.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending

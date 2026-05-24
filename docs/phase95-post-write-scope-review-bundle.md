# Phase 95 Post-Write-Scope Review Bundle

Date: 2026-05-24
Branch: `develop`
Current reviewed local commit: `197ba289 Guard same-turn write scopes before tool commits`

## Purpose

This is the compact current-state bundle for the next Phase 95 architecture
review. It replaces large browser inline file dumps. Attach this file plus the
listed source files as a bundle/zip when asking Oracle or an agent for a
GO/NO-GO. Do not paste a large multi-file payload directly into the browser
composer.

The product goal is still the full RPG loop: the player acts naturally, the
LLM keeps the experience creative, and backend-owned truth keeps refs,
capabilities, tool ownership, time, receipts, persistence, clone/replay,
rollback, narration grounding, UI projection, and recovery coherent at turn 1,
turn 60, turn 600+, and in cloned/replayed worlds.

## Current Evidence

- Reset baseline: `f8d2b3b05cf6a6598208e170f414d171a44ccaf4`.
- Safety branch: `codex/phase95-pre-reset-20260524`; use only as risk/evidence
  inventory.
- New reset/rebuild commits now on `develop`:
  - `f13508b3 Add explicit turn clock authority ledger`
  - `e12887c0 Harden narration fact projection`
  - `1591e6e4 Require fact refs for live narration`
  - `9d55009e Wire live turn authority stages`
  - `90188188 Add turn write-scope ledger`
  - `197ba289 Guard same-turn write scopes before tool commits`
- Verification after the latest slice:
  - `npm --prefix backend run typecheck` passed.
  - Full backend `vitest` passed `219` files / `2938` tests, with `1` skipped
    file and `30` todo tests.
  - GitNexus staged `detect_changes` was `critical`, expected for executor and
    turn-spine changes; high-risk symbols were inspected before commit.
  - `npx gitnexus analyze` completed after the push.
- Current wide-bundle review:
  - Valid Oracle session: `phase95-wide-p0-bundle-valid`.
  - Delivery: one zip bundle with `17` files, not inline file cards.
  - Verdict: NO-GO for long-play Phase 95 acceptance; CONDITIONAL-GO only for
    hardening slices.
  - Confirmed P0 order: public projection first, then manifest-owned
    clean-start clone/vector-safe restore.
  - Invalidated session: `phase95-wide-p0-bundle` uploaded an empty zip and is
    not evidence.

## Bundle Question

Review the current Phase 95 gameplay control plane. Return GO/NO-GO by cluster:

1. Public projection/API/SSE/frontend boundary.
2. Clone/replay/rollback/vector/store-manifest boundary.
3. Ref/capability ownership across prompt aliases, quick-action handles,
   narration fact refs, tool refs, and public DTO handles.
4. Actor/due-world same-turn write fences after the write-scope ledger and
   pre-commit guard.
5. Remaining blockers before human-style 60-turn and longer soak/replay runs.

For every finding, classify P0/P1/P2 and name the exact source files/symbols.
Prefer implementation-ready slices and tests over generic advice.

The review must keep the full RPG loop as the target: projection and clone are
P0 blockers because they protect long-horizon play quality, not because the
phase goal is an endpoint cleanup exercise.

## References Used

- `AGENTS.md`
- `tasks/lessons.md`
- `output/phase95-reset-rebuild-brief-20260524.md`
- `output/phase95-handoff-contract.md`
- `output/phase95-gameplay-cycle-contract-inventory.md`
- `docs/phase95-gameplay-cycle-architecture.md`
- `docs/phase95-runtime-authority-bundle-plan.md`
- `docs/phase95-oracle-architecture-review-2026-05-24.md`
- `docs/phase95-runtime-authority-oracle-review-2026-05-24.md`
- `C:/Users/robra/.codex/skills/oracle/SKILL.md`
- `C:/Users/robra/.agents/skills/agents-best-practices/SKILL.md`

## Focus Source Files

Core contracts:

- `backend/src/engine/gameplay-control-plane-contract.ts`
- `backend/src/engine/runtime-tool-descriptors.ts`
- `backend/src/engine/tool-contracts.ts`
- `backend/src/engine/simulation-write-scope.ts`

Turn/executor spine:

- `backend/src/routes/chat.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/gm-tool-loop.ts`
- `backend/src/engine/tool-execution-context.ts`
- `backend/src/engine/tool-executor.ts`
- `backend/src/engine/living-world-authority.ts`

Actors/due-world/proposals:

- `backend/src/engine/actor-scheduler.ts`
- `backend/src/engine/actor-tools.ts`
- `backend/src/engine/due-world-work.ts`
- `backend/src/engine/simulation-proposal.ts`
- `backend/src/engine/simulation-proposal-executor.ts`

Narration/projection:

- `backend/src/engine/narration-grounding-guard.ts`
- `backend/src/engine/narrator-packet.ts`
- `backend/src/engine/player-facing-events.ts`
- `backend/src/routes/campaigns.ts`
- `frontend/lib/api.ts`
- `frontend/app/game/page.tsx`
- `frontend/components/game/play-surface/action-dock.tsx`

Clone/rollback/vector:

- `backend/src/campaign/store-manifest.ts`
- `backend/src/campaign/restore-bundle.ts`
- `backend/src/campaign/checkpoints.ts`
- `backend/src/engine/state-snapshot.ts`
- `backend/src/engine/turn-saga.ts`
- `backend/src/vectors/episodic-events.ts`
- `backend/src/vectors/lore-cards.ts`

Targeted tests to inspect:

- `backend/src/engine/__tests__/gameplay-control-plane-contract.test.ts`
- `backend/src/engine/__tests__/simulation-write-scope.test.ts`
- `backend/src/engine/__tests__/tool-executor-authority.test.ts`
- `backend/src/engine/__tests__/actor-scheduler.test.ts`
- `backend/src/engine/__tests__/player-facing-events.test.ts`
- `backend/src/campaign/__tests__/store-manifest.test.ts`
- `backend/src/engine/__tests__/state-snapshot.test.ts`
- `frontend/app/game/__tests__/page.test.tsx`
- `frontend/components/game/play-surface/__tests__/action-dock.test.tsx`
- `frontend/lib/__tests__/api.test.ts`

## Known Unverified Assumptions

- Public projection assertions do not yet cover all player-facing API/SSE/
  frontend surfaces; `/world`, location entities, inventory, history, lookup,
  and frontend state need typed DTO projectors and tests.
- Clean-start clone remains the correct Phase 95 acceptance mode; the current
  code still uses legacy Phase 94 helper-copy semantics for clone setup.
- Store-manifest rollback evidence is not enough for acceptance until
  clean-start clone consumes the same manifest and turn rollback is vector-safe
  after process restart.
- Actor/due-world write-scope blocking now protects player-owned state across
  all same-turn paths, including generic `player:` and `item:` scopes.
- Final narration fact-ref enforcement is reachable on the live path and no
  legacy `text` authority lane can still pass normal gameplay.
- Browser/UI workability has not yet been re-verified after these backend
  slices; use the in-app Browser when frontend/public projection behavior is
  touched.

## Requested Output Shape

- Cluster verdict table: GO/NO-GO/PARTIAL.
- P0/P1/P2 findings with exact evidence.
- Option comparison for any high-blast-radius recommendation.
- Minimal coherent implementation slice order.
- Tests and playtest evidence required before long campaign acceptance.

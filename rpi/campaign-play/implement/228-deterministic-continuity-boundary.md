# Task 228: deterministic-continuity boundary

Status: implementation and bounded built-surface proof complete; 60-action acceptance is intentionally out of scope for this packet.

## Identity

- Repository: `R:\Projects\WorldForge`, branch `feat/revamp`.
- Entry local/origin: `3a8710ed09cb67ee53ba1a4c74ad36083f42af2e`.
- Frozen reference: `pristine-60-glm52-lowwater-ledger-93a09e46-r190`; it was not opened or mutated.
- Product surface: Campaign Play deterministic authority/control-budget continuity.

## Exact delta

- `commitContinuity` now writes the packet-compatible `flash` effect for player-action deterministic continuity. Generic player-action narration validation remains strict.
- `loadCompletedPublicMoment` uses a local adapter that accepts only an otherwise exact historical deterministic-continuity scene whose completed narration operation proves `source_kind=deterministic_continuity` and whose persisted effect is the old `fade`. The adapter validates an in-memory `flash` view and never rewrites the row. Generic and `model_accepted` `fade` remain rejected.
- `mutation_audit_json.kind=control_budget_continuity` is accepted only on a player-action continuity turn at `visibility_projected` or `completed`, with the existing terminal/result/packet/operation/scene/event/lease/epoch checks. Other stages, non-player turns, and accepted Narrator stages remain corrupt.

## Graph gate

The registered graph was refreshed before editing with `node .gitnexus/run.cjs analyze --index-only --skip-agents-md` (15386 nodes, 43684 edges, 863 flows). Exact file-qualified target resolution for the edited symbols remained unavailable in the refreshed index; the supplied lower-bound impacts governed scope: `commitContinuity` LOW (3 direct callers, 2 processes), `commitVisibleResult` LOW (4, 2), `loadCompletedPublicMoment` LOW (1), and the explicitly authorized guarded `validateAcceptedStageProgress` CRITICAL lower bound (1 direct caller, 28 processes, 60 impacted). No unrelated owner was added.

## Automated evidence

- Focused continuity, historical-compatibility, generic/model rejection, marker-stage, and terminal-proof regressions: 11 passed.
- `campaign-play-turn-repository.test.ts`: 35 passed; `campaign-play-database.test.ts`: 21 passed; `contracts.test.ts`: 36 passed; `campaign-play-application.test.ts`: 21 passed.
- Full `turn-runtime.test.ts`: 92 passed.
- Backend typecheck and production build: passed.
- `git diff --check`: passed.

## Disposable built-surface proof

Using the rebuilt backend on task port `4740` and isolated root `R:\Temp\WorldForge-task228-scratch-14`:

- State GET returned `200`, `phase=ready`, no active turn, `worldVersion=7`, `runtimeRevision=18`, narration present with `sourceKind=deterministic_continuity`, and four enabled published choices.
- One real next-action POST with the published handle `choice_09d42cc200fb3b920a08c8bb`, expected versions `7/18`, and one idempotency key returned `202` with turn `turn-player-action:38d9d3bca208e5786a6f90bc3de69b799517ffca`.
- A URI `mode=ro` SQLite copy was opened with `query_only=1` and `foreign_keys=1`: `integrity_check=ok`, `foreign_key_check=[]`, two unique `player_action` rows (the completed deterministic-continuity turn and the one newly admitted action), and one opening row. Source `state.db`, `state.db-wal`, and `state.db-shm` SHA-256 values were unchanged across the read.

## Acceptance handoff

1. New continuity writes are canonical `flash`.
2. Exact historical deterministic-continuity `fade` is readable without mutation; generic and model-accepted `fade` are still rejected.
3. The audit marker survives `visibility_projected -> completed` and strict-loads only with the existing terminal proof.
4. The disposable built surface projected continuity and admitted the next player action with `202` and one new durable turn.
5. Model/narrator/reviewer/mechanics/attempt/idempotency contracts were not broadened.
6. Focused/full checks, build, graph refresh, staged scope check, commit/push, cleanup, and protected-dirt preservation are recorded in the terminal handoff.

## Cleanup

The exact task-owned backend process and port were stopped. The scratch root, read-only DB copy, and temporary seeding helper were removed after capturing the bounded scalar evidence. No settings were changed. `AGENTS.md` and `CLAUDE.md` remained unstaged and untouched.

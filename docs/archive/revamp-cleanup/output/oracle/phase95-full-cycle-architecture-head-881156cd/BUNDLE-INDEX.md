# Phase 95 Oracle Bundle Index

Bundle slug: `phase95-full-cycle-architecture-head-881156cd`
Review HEAD: `881156cd191db83aedefab326854cc1b3bb5bc04`

## Bundle Files

- `REQUEST.md`: review prompt, product goal, current local verdict, P1 list, requested output.
- `CURRENT-SNAPSHOT.md`: compact current architecture and evidence snapshot synthesized from the 6+1 Wave E agents.
- `docs/phase95-6plus1-orchestration-2026-05-31.md`: shared orchestration canvas with full Wave E integration.

## Source Paths Referenced By Snapshot

The snapshot names these source/test paths as evidence. If deeper inspection is needed, request them specifically in a follow-up rather than widening this first Oracle packet.

### GM Read / Tool Loop / Executor

- `backend/src/engine/gm-turn-read.ts`
- `backend/src/engine/gm-tool-loop.ts`
- `backend/src/engine/tool-executor.ts`
- `backend/src/engine/tool-execution-context.ts`
- `backend/src/engine/runtime-tool-descriptors.ts`
- `backend/src/engine/tool-contracts.ts`
- `backend/src/engine/simulation-proposal.ts`
- `backend/src/engine/simulation-proposal-executor.ts`
- `backend/src/engine/actor-tools.ts`
- `backend/src/engine/npc-tools.ts`
- `backend/src/engine/__tests__/gm-turn-read.test.ts`
- `backend/src/engine/__tests__/gm-tool-loop.test.ts`
- `backend/src/engine/__tests__/tool-executor-authority.test.ts`
- `backend/src/engine/__tests__/tool-executor-caller-contract.test.ts`

### State Ownership / Contracts

- `backend/src/engine/gameplay-control-plane-contract.ts`
- `backend/src/engine/__tests__/gameplay-control-plane-contract.test.ts`
- `backend/src/engine/runtime-tool-descriptors.ts`
- `backend/src/engine/tool-contracts.ts`

### Narration / Player-Facing Projection

- `backend/src/engine/narrator-packet.ts`
- `backend/src/engine/narration-grounding-guard.ts`
- `backend/src/engine/player-facing-packet.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/__tests__/narrator-packet.test.ts`
- `backend/src/engine/__tests__/narration-grounding-guard.test.ts`
- `backend/src/engine/__tests__/player-facing-packet.test.ts`
- `backend/src/engine/__tests__/turn-processor.empty-narration.test.ts`
- `backend/src/engine/__tests__/visible-narration-output-guard.test.ts`

### API / SSE / Frontend Projection

- `backend/src/routes/chat.ts`
- `backend/src/routes/campaigns.ts`
- `backend/src/engine/quick-action-offers.ts`
- `backend/src/engine/player-facing-events.ts`
- `frontend/lib/api.ts`
- `frontend/app/game/page.tsx`
- `frontend/components/game/play-surface/action-dock.tsx`
- `backend/src/routes/__tests__/chat.test.ts`
- `frontend/app/game/__tests__/page.test.tsx`
- `frontend/lib/__tests__/api.test.ts`

### Clone / Replay / Rollback / Vector

- `backend/src/engine/state-snapshot.ts`
- `backend/src/campaign/restore-bundle.ts`
- `backend/src/campaign/clone.ts`
- `backend/src/campaign/store-manifest.ts`
- `backend/src/campaign/store-manifest-executor.ts`
- `backend/src/vectors/episodic-events.ts`
- `backend/src/campaign/__tests__/store-manifest-executor.test.ts`
- `backend/src/routes/__tests__/chat.test.ts`
- `scripts/phase95-verify-adaptive-run.mjs`

### Observability / Evidence

- `backend/src/lib/observability-evidence-policy.ts`
- `backend/src/engine/__tests__/turn-processor.observability.test.ts`
- `scripts/phase95-verify-adaptive-run.mjs`
- `scripts/__tests__/phase95-verify-adaptive-run.test.mjs`
- `output/phase95-browser-smoke-inventory-status-20260531.md`

## Attachment Strategy

This review intentionally uses a compact bundle rather than many inline source files, because previous 10+ inline-file browser reviews froze or became unreliable. The first Oracle pass should judge architecture completeness and priority order from the integrated canvas and snapshot. If Oracle needs code-level proof for one P1, the next pass should attach only that focused cluster.

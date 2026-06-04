# Phase 95 Current-Head Authority Bypass 6+1 Canvas

Date: 2026-05-31
Current release basis: `f6ebe27f` plus the in-progress transient scene lifecycle slice

## Objective

Move Phase 95 toward an Oracle-ready gameplay loop by separating current-HEAD
architecture blockers from acceptance evidence gaps. Do not reopen closed
NPC/reflection quarantine work unless a current backend authority bypass exists.

## Operating Contract

- Backend owns refs, capabilities, tool ownership, time, receipts, persistence,
  projection, clone/replay/rollback, narration grounding, and recovery.
- Model/player-facing surfaces may propose or request; gameplay truth mutates
  only through the registered owner/tool authority path.
- Current HEAD is authoritative. Older Oracle/output artifacts are advisory
  unless they target this commit or a later one.
- Acceptance evidence is still required: fresh 60-turn, clean-start clone
  60-turn, and longer soak/replay.

## Agent Lanes

### A1 Source/Request Lock
Status: complete
Owner: A1
Scope: Lock the user contract and current source hierarchy.
Output:

- [inspected] Current release basis is `f6ebe27f`; tree started clean and synced.
- [inspected] The product contract remains a long-lived playable LLM RPG loop,
  not just a green control-plane checklist.
- [inspected] No current explicit P0 blocker was found in inspected artifacts.
- [inspected] Remaining explicit P1 blocker is acceptance evidence: fresh
  human-style 60-turn, clean-start clone 60-turn, and 600+ soak/replay.

### A2 Current-State Map
Status: complete
Owner: A2
Scope: Map backend owners and weak truth surfaces.
Output:

- [inspected] Strong owners exist for issued refs, runtime tool descriptors,
  time/receipts, manifest clone/restore, narration grounding, and quick-action
  capabilities.
- [inspected] Weak surfaces remain where owner names are contract vocabulary
  over dispersed route/projection implementation.
- [inspected] Replay-preserving clone is explicitly fail-closed rather than a
  supported successful clone mode.
- [executed] Current-HEAD clone recovery pilot
  `output/phase95-current-head-clone-api-pilot-20260531-2019` now verifies
  1/1 turn after pending narration resume: `ok: true`, `hardFailureCount: 0`,
  `warningCount: 0`.
- [executed] The recovery pilot exposed a same-millisecond authority lifecycle
  ordering defect: `receipts_accepted` and `canonical_state_committed` can share
  `createdAt`, so completeness checks now use the persisted lifecycle ordinal as
  the timestamp tie-breaker.

### A3 Existing Patterns
Status: complete
Owner: A3
Scope: Identify local authority patterns to reuse.
Output:

- [inspected] Reuse `TurnAuthorityStageContract`,
  `GAMEPLAY_STATE_OWNER_REGISTRY`, runtime descriptors, GM mutation boundary,
  `commitAuthorityTrace`, quick-action capability receipts, and proposal-only
  quarantine tests.
- [rejected] Do not create a parallel authority manager or receipt router for
  a slice that existing owner registries can express.

### A4 Architecture/Protocol
Status: complete
Owner: A4
Scope: Find active mutation planes bypassing owners.
Output:

- [inspected] `POST /api/campaigns/:id/npcs/:npcId/promote` directly updated
  `npcs.tier` even though the owner registry assigns `actor_lifecycle` to
  `promote_npc`.
- [executed] `POST /api/campaigns/:id/npcs/:npcId/promote` now routes through
  runtime `promote_npc` authority instead of directly updating `npcs.tier`.
- [executed] Transient scene cleanup now has an explicit
  `transient_scene_lifecycle_service` owner lane, deterministic service
  contract, authority receipt kind, and `commitAuthorityTrace` output for
  retired temporary NPC / archived ephemeral scene state deltas.

### A5 Verification/Proof
Status: complete
Owner: A5
Scope: Identify executable evidence strength and weakest next gate.
Output:

- [inspected] Source contracts are strong for clone/replay/rollback/recovery,
  narration grounding, projection, and NPC/reflection proposal-only authority.
- [blocked] 600+ is not proven by current artifacts.
- [inferred] Long-run verifier evidence should eventually require cross-plane
  fields: turn ids, clock/version continuity, accepted receipts, due-world
  reasons, actor backlog, vector counts, recovery outcomes, terminal events,
  retry counts, and clone lineage.

### A6 Cleanup/Migration/Risk
Status: complete
Owner: A6
Scope: Find stale artifact and dirty-tree risks.
Output:

- [inspected] Git release tree started clean and GitNexus metadata matched
  current HEAD.
- [inspected] Ignored Phase 95 output is very large; release-candidate audits
  must avoid treating stale output/oracle artifacts as current evidence.
- [inspected] Current live fresh-pilot attempt timed out in worldgen locations,
  making acceptance evidence still open rather than failed on a completed turn.
- [executed] Clone recovery live resume now emits `scene-settling`,
  `narrative`, and `done` with no `error`; adaptive verifier passes for the
  artifact root above.

## Integration Notes

- +1 decision: close the active `actor_lifecycle` bypass first. The route can
  resolve public handles and reject stale/raw requests, but it must request
  mutation through `executeToolCall("promote_npc", ...)` with authority context
  so `commitAuthorityTrace` owns the truth transition.
- +1 decision: close the deterministic transient scene lifecycle gap as a
  backend-only service contract rather than a model/runtime tool. Expired
  ephemeral scene archival and temporary NPC retirement remain hidden
  projection cleanup, but non-empty state deltas now emit
  `transient_scene_cleanup` authority.
- Discarded alternative: leaving the route direct update in place because it is
  user/admin initiated. That preserves a second writer for actor lifecycle and
  contradicts the owner registry.

# Phase 41: Checkpoint-Complete Simulation Restore - Research

**Researched:** 2026-04-11
**Domain:** Campaign checkpoint restore fidelity and runtime-state invalidation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Restore Contract
- **D-01:** Checkpoint save/load must restore one coherent authoritative bundle: `state.db`, `config.json`, `chat_history.json`, and the campaign vector store used by runtime retrieval.
- **D-02:** `config.json` is part of authoritative runtime state for this phase, not optional side metadata. Tick and other campaign runtime metadata must round-trip through checkpoint restore.
- **D-03:** Later turns after checkpoint load must read restored state only; mutations from the discarded timeline must not leak through singleton handles or stale runtime pointers.

### Restore Semantics
- **D-04:** Phase 41 should align checkpoint restore semantics with the Phase 39 turn-boundary restore contract instead of inventing a second restore model with different guarantees.
- **D-05:** Restore must explicitly invalidate and reopen DB/vector connections so no stale handles survive after bundle replacement.
- **D-06:** Retry, undo, and checkpoint load should end on the same campaign boundary contract for NPC autonomy, reflection, and faction/world simulation inputs.
- **D-07:** Checkpoint restore must also clear per-campaign in-memory runtime state from the discarded branch, including live turn snapshots, active-turn guards, and same-turn reflection evidence queues.

### Scope Guardrails
- **D-08:** This phase repairs restore fidelity only. It does not redesign inventory authority, target-aware oracle logic, start-condition mechanics, travel semantics, or gameplay docs.
- **D-09:** Asynchronous best-effort artifacts that are not part of the authoritative campaign boundary stay out of scope unless they are already promised by the live restore contract.

### the agent's Discretion
- Exact helper factoring between checkpoint restore and turn-boundary restore.
- Whether checkpoint and turn-boundary flows share one lower-level bundle-restore utility or coordinated wrappers over shared primitives.
- Exact file-layout details for checkpoint bundles, as long as the restore contract above stays intact.

### Deferred Ideas (OUT OF SCOPE)
### Reviewed Todos (not folded)
- `2026-03-29-add-reusable-multi-worldbook-library.md` — keyword-matched on `campaign`, but unrelated to restore fidelity and left out of Phase 41.
- `2026-03-30-add-lore-card-editing-and-deletion.md` — weak keyword match only; unrelated to checkpoint/runtime restore scope.

None beyond these false-positive todo matches — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RINT-03 | Checkpoint save/load restores all campaign-authoritative runtime state, including `config.json`-backed values such as current tick and related campaign runtime metadata. | Defines the exact bundle as `state.db`, `config.json`, `chat_history.json`, and full `vectors/`, plus a shared restore primitive that refreshes manager/runtime state after file replacement. |
| SIMF-03 | World-state mutations from NPC autonomy, reflection, and faction simulation remain coherent with rollback, retry, and checkpoint restore behavior. | Requires clearing stale runtime state (`lastTurnSnapshots`, active-turn guards, pending same-turn evidence, stale DB/vector handles) so post-restore turns only consume restored branch data. |
</phase_requirements>

## Summary

Phase 41 does not need a new restore model. The repo already has two partial models: checkpoint restore in [backend/src/campaign/checkpoints.ts](/R:/Projects/WorldForge/backend/src/campaign/checkpoints.ts:31) copies `state.db`, `vectors/`, and `chat_history.json` but omits `config.json`, while Phase 39 snapshot restore in [backend/src/engine/state-snapshot.ts](/R:/Projects/WorldForge/backend/src/engine/state-snapshot.ts:19) captures and restores `state.db`, `config.json`, and `chat_history.json` but intentionally excludes vectors. The safest Phase 41 move is to converge their restore semantics, not their artifact scopes.

The authoritative checkpoint-complete bundle is exact and small: `state.db`, `config.json`, `chat_history.json`, and the full `vectors/` directory. `docs/memory.md` confirms campaign state is split across SQLite, campaign config, and the vector store, and also shows lore and episodic memory share the vector persist directory. `meta.json` is checkpoint bookkeeping, not runtime authority. Best-effort artifacts such as generated images stay out of the restore contract.

The current main correctness gap is stale runtime state after file replacement. `loadCheckpoint()` closes DB/vector handles, but it does not refresh `activeCampaign`, clear Phase 39's in-memory last-turn state, or clear Phase 40's same-turn evidence queue. A restored checkpoint can therefore continue with stale singleton/runtime pointers unless restore explicitly invalidates them before reopening the campaign.

**Primary recommendation:** Implement one shared campaign-bundle restore primitive used by checkpoint load and Phase 39 snapshot restore, with checkpoint bundles adding `vectors/` while both flows share the same invalidate-copy-reopen contract.

## Standard Stack

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| `state.db` via SQLite backup/copy | repo-local | Authoritative structured game state | Already the mechanical source of truth for player, NPC, faction, relationship, and chronicle state. |
| `config.json` file copy | repo-local | Campaign runtime metadata such as `currentTick`, IP context, divergence, worldbook selection, and persona templates | `readCampaignConfig()` and `incrementTick()` already treat this as live runtime state. |
| `vectors/` persist directory | repo-local | Campaign retrieval store for episodic events and lore | Runtime retrieval and reflection depend on the persisted vector DB, and docs place both episodic and lore data in the same persist tree. |
| `chat_history.json` file copy | repo-local | Visible turn history and retry/undo continuity | Phase 39 already treats chat history as part of the restored turn boundary. |

### Supporting
| Component | Version | Purpose | When to Use |
|-----------|---------|---------|-------------|
| `loadCampaign()` | repo-local | Reopen campaign and refresh manager-owned singleton state | Use after copying authoritative artifacts back into the campaign directory. |
| `closeDb()` / `closeVectorDb()` | repo-local | Invalidate stale file handles before replacement | Always run before overwriting `state.db` or `vectors/`. |
| `lastTurnSnapshots` / `campaignsWithActiveTurn` | repo-local | Phase 39 per-campaign in-memory turn boundary state | Clear on checkpoint restore so the discarded branch cannot be retried or reported as live. |
| `pendingCommittedEvents` | repo-local | Phase 40 same-turn reflection/embedding queue | Clear on restore so same-turn evidence from the abandoned branch cannot leak forward. |

## Architecture Patterns

### Recommended Restore Structure
```text
checkpoint source/
├── state.db
├── config.json
├── chat_history.json
├── vectors/
└── meta.json          # bookkeeping only, not restored into runtime
```

### Pattern 1: Treat Checkpoint Restore As Authoritative Bundle Replacement
**What:** Restore by replacing every authoritative runtime artifact for the target campaign in one operation.
**When to use:** Any checkpoint load that promises full simulation restore.
**Evidence:** [backend/src/campaign/checkpoints.ts](/R:/Projects/WorldForge/backend/src/campaign/checkpoints.ts:141), [backend/src/engine/state-snapshot.ts](/R:/Projects/WorldForge/backend/src/engine/state-snapshot.ts:70), [docs/memory.md](/R:/Projects/WorldForge/docs/memory.md:192)

**Exact authoritative bundle**

| Artifact | Required | Why |
|----------|----------|-----|
| `state.db` | Yes | Holds structured world state and post-turn simulation outputs. |
| `config.json` | Yes | Holds `currentTick` and other campaign runtime metadata consumed during play. |
| `chat_history.json` | Yes | Keeps visible turn history aligned with restored state and retry/undo expectations. |
| `vectors/` | Yes | Restores episodic + lore retrieval corpus used by later turns. |
| `meta.json` | No | Checkpoint catalog metadata only; not part of gameplay runtime state. |
| Images / other best-effort caches | No | Not part of the promised authoritative campaign boundary for this phase. |

### Pattern 2: Share Restore Semantics With Phase 39, Not Artifact Scope
**What:** Reuse one lower-level restore contract for invalidation and reopening, but keep different capture scopes for different features.
**When to use:** Converging checkpoint restore with retry/undo without expanding Phase 39.

**Safe convergence**
- Keep Phase 39 snapshot capture limited to `state.db`, `config.json`, and `chat_history.json`.
- Keep Phase 41 checkpoint capture/load as the same bundle plus full `vectors/`.
- Share a lower-level helper that does:
  1. invalidate per-campaign runtime state
  2. close DB/vector handles
  3. copy requested artifacts
  4. reopen through the campaign manager path

**Why this is safest:** It preserves Phase 39's narrow rollback scope while giving checkpoint load the stronger artifact set it already promised in context and roadmap.

### Pattern 3: Reopen Through Campaign Manager State, Not Ad-Hoc Reconnect
**What:** After copying artifacts, reopen through [backend/src/campaign/manager.ts](/R:/Projects/WorldForge/backend/src/campaign/manager.ts:222) so `activeCampaign` is refreshed from restored disk state.
**When to use:** Every restore path that replaces `config.json` or `state.db`.

**Reasoning:** `loadCheckpoint()` currently reconnects DB/vector directly, while `restoreSnapshot()` calls `loadCampaign()`. The direct reconnect path leaves the manager singleton untouched, which is the wrong seam for a full-campaign restore.

### Anti-Patterns to Avoid
- **Partial bundle restore:** Copying only `state.db` and `vectors/` leaves `currentTick` and other config-backed metadata on the wrong branch.
- **Separate restore semantics per feature:** A checkpoint-specific reconnect path and a retry-specific reconnect path will drift again.
- **Restoring files without clearing runtime memory:** Old turn snapshots or pending evidence will make the restored branch behave like a hybrid timeline.
- **Selective vector table restore:** The docs place episodic and lore retrieval in the same persist directory; copying partial tables is unnecessary risk.

## Concrete Code Seams and Test Anchors

### Code Seams
| Seam | Why it matters | Recommended role in Phase 41 |
|------|----------------|-------------------------------|
| [backend/src/campaign/checkpoints.ts](/R:/Projects/WorldForge/backend/src/campaign/checkpoints.ts:31) | Checkpoint create/load already owns bundle capture and file replacement | Add `config.json` capture, stop reconnecting ad hoc, and call the shared restore helper. |
| [backend/src/engine/state-snapshot.ts](/R:/Projects/WorldForge/backend/src/engine/state-snapshot.ts:19) | Phase 39 already defines the honest restore contract for `state.db` + `config.json` + `chat_history.json` | Reuse its semantics as the baseline contract; do not widen its capture scope to vectors. |
| [backend/src/campaign/manager.ts](/R:/Projects/WorldForge/backend/src/campaign/manager.ts:222) | Only seam in the allowed source set that refreshes `activeCampaign` from restored files | Make this the reopen path after any authoritative restore. |
| [backend/src/routes/chat.ts](/R:/Projects/WorldForge/backend/src/routes/chat.ts:57) | Holds per-campaign last-turn and active-turn runtime state introduced in Phase 39 | Expose a campaign-scoped invalidation seam for restore callers. |
| [backend/src/vectors/episodic-events.ts](/R:/Projects/WorldForge/backend/src/vectors/episodic-events.ts:32) | Holds per-campaign same-turn evidence queue introduced in Phase 40 | Add a campaign-scoped queue clear/invalidate helper and call it during restore. |

### Test Anchors
| Anchor | Behavior to lock | Confidence |
|--------|------------------|------------|
| Existing chat route tests referenced by Phase 39: `backend/src/routes/__tests__/chat.test.ts` | After checkpoint restore, stale retry/undo state is gone and later turns operate from the restored branch only. | MEDIUM |
| New checkpoint-focused tests adjacent to [backend/src/campaign/checkpoints.ts](/R:/Projects/WorldForge/backend/src/campaign/checkpoints.ts:31) | Create/load round-trip restores `config.json`, `state.db`, `chat_history.json`, and `vectors/` together. | HIGH |
| Existing reflection tests referenced by Phase 40: `backend/src/engine/__tests__/reflection-agent.test.ts` | Restored campaigns do not consume discarded-branch same-turn evidence after load. | MEDIUM |

**Minimum test cases**
1. Create checkpoint after mutating `currentTick`, `ipContext`, `premiseDivergence`, `worldbookSelection`, and `personaTemplates`; load it and assert those restored values are visible from `readCampaignConfig()`.
2. Write distinct vector-backed events before and after a checkpoint; after load, retrieval must align with the restored vector corpus, not the discarded branch.
3. Create a live turn snapshot and queued pending committed event, then load a checkpoint; assert both campaign-scoped in-memory stores are cleared.
4. After checkpoint restore, take a new turn and verify NPC/reflection/faction post-turn work runs from restored state without stale-turn errors.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Restore reopening | A checkpoint-only reconnect sequence | One shared invalidate-copy-reopen helper reused by checkpoint and snapshot restore | Prevents restore semantics from drifting. |
| Vector fidelity | Table-by-table or event-by-event rehydration | Full `vectors/` directory replacement | The persist directory is already the runtime unit of storage. |
| Runtime invalidation | Scattered inline deletes in route code | One campaign-scoped runtime reset seam | Makes restore correctness testable and reusable. |

**Key insight:** The risk here is not copying files; it is forgetting which runtime pointers survive file replacement.

## Common Pitfalls

### Pitfall 1: Restoring Files But Keeping Stale Manager State
**What goes wrong:** The filesystem reflects the checkpoint, but the manager singleton still represents the discarded timeline.
**Why it happens:** `loadCheckpoint()` reconnects DB/vector directly instead of reopening through `loadCampaign()`.
**How to avoid:** Funnel all authoritative restores through a shared reopen path that refreshes `activeCampaign`.
**Warning signs:** Post-restore premise or updated metadata do not match restored `config.json`.

### Pitfall 2: Clearing Handles But Not Per-Campaign Runtime Queues
**What goes wrong:** Later turns see stale retry/undo or same-turn evidence from the abandoned branch.
**Why it happens:** `lastTurnSnapshots`, `campaignsWithActiveTurn`, and `pendingCommittedEvents` are module-level maps/sets, not on-disk state.
**How to avoid:** Add explicit campaign-scoped invalidation before reopening.
**Warning signs:** History still reports a live turn snapshot after checkpoint load, or reflection reads evidence that no longer exists in restored state.

### Pitfall 3: Over-Converging With Phase 39
**What goes wrong:** The implementation widens retry/undo to restore vectors too, dragging Phase 41 into broader rollback redesign.
**Why it happens:** Conflating "shared restore semantics" with "shared artifact list."
**How to avoid:** Share only the lower-level restore contract; keep Phase 39 capture scope unchanged.
**Warning signs:** Phase 41 planning starts discussing multi-step rollback, embedding durability, or broader transport/UI changes.

### Pitfall 4: Letting Auxiliary Post-Turn Work Cross the Restore Boundary
**What goes wrong:** A background embedding or other best-effort callback from the discarded branch mutates the restored campaign.
**Why it happens:** `queueAuxiliaryPostTurnWork()` is fire-and-forget and `pendingCommittedEvents` survives until drained.
**How to avoid:** Clear the pending queue on restore and gate any long-lived async completion against a restore epoch if needed.
**Warning signs:** Restored campaigns receive vector/image side effects tied to events that no longer exist in restored chat/db state.

## Code Examples

Verified patterns from local source:

### Shared Restore Contract
```typescript
// Source baseline:
// - backend/src/engine/state-snapshot.ts
// - backend/src/campaign/checkpoints.ts
async function restoreCampaignBundle(campaignId: string, sourceDir: string, opts: {
  includeVectors: boolean;
  clearRuntimeState: (campaignId: string) => Promise<void> | void;
}) {
  await opts.clearRuntimeState(campaignId);
  closeDb();
  await closeVectorDb();

  copyFile(`${sourceDir}/state.db`, `${campaignDir(campaignId)}/state.db`);
  copyFile(`${sourceDir}/config.json`, `${campaignDir(campaignId)}/config.json`);
  copyFileOrDefault(`${sourceDir}/chat_history.json`, `${campaignDir(campaignId)}/chat_history.json`, "[]");

  if (opts.includeVectors) {
    replaceDirectory(`${sourceDir}/vectors`, `${campaignDir(campaignId)}/vectors`);
  }

  await loadCampaign(campaignId);
}
```

### Campaign Runtime Invalidation
```typescript
// Source baseline:
// - backend/src/routes/chat.ts
// - backend/src/vectors/episodic-events.ts
function clearCampaignRuntimeState(campaignId: string) {
  clearLastTurnSnapshot(campaignId);
  clearActiveTurnGuard(campaignId);
  clearPendingCommittedEvents(campaignId);
}
```

## Open Questions

1. **Where checkpoint load is invoked**
   - What we know: The restore core is in [backend/src/campaign/checkpoints.ts](/R:/Projects/WorldForge/backend/src/campaign/checkpoints.ts:116).
   - What's unclear: The allowed read scope did not include the route/controller that triggers checkpoint load.
   - Recommendation: Keep invalidation inside the checkpoint restore helper itself so callers cannot forget it.

2. **How far auxiliary cancellation must go**
   - What we know: Pending same-turn evidence definitely needs clearing, and auxiliary post-turn work is explicitly best-effort.
   - What's unclear: The allowed read scope did not include image/vector connection internals beyond the queue seam.
   - Recommendation: Phase 41 should at minimum clear pending committed events; add restore-epoch gating only if tests show stale async completions still mutate restored campaigns.

## Sources

### Primary (HIGH confidence)
- [backend/src/campaign/checkpoints.ts](/R:/Projects/WorldForge/backend/src/campaign/checkpoints.ts:31) - current checkpoint capture/load artifact set and reconnect behavior
- [backend/src/engine/state-snapshot.ts](/R:/Projects/WorldForge/backend/src/engine/state-snapshot.ts:19) - Phase 39 snapshot capture/restore contract
- [backend/src/campaign/manager.ts](/R:/Projects/WorldForge/backend/src/campaign/manager.ts:47) - `config.json` runtime fields and `loadCampaign()` reopen path
- [backend/src/routes/chat.ts](/R:/Projects/WorldForge/backend/src/routes/chat.ts:57) - campaign-scoped in-memory turn state and post-turn auxiliary queue entrypoint
- [backend/src/vectors/episodic-events.ts](/R:/Projects/WorldForge/backend/src/vectors/episodic-events.ts:31) - campaign-scoped same-turn evidence queue
- [docs/memory.md](/R:/Projects/WorldForge/docs/memory.md:192) - documented campaign artifact layout and storage split
- [R:/Projects/WorldForge/.planning/phases/41-checkpoint-complete-simulation-restore/41-CONTEXT.md](/R:/Projects/WorldForge/.planning/phases/41-checkpoint-complete-simulation-restore/41-CONTEXT.md) - locked phase decisions and scope guardrails
- [R:/Projects/WorldForge/.planning/phases/39-honest-turn-boundary-retry-undo/39-CONTEXT.md](/R:/Projects/WorldForge/.planning/phases/39-honest-turn-boundary-retry-undo/39-CONTEXT.md) - Phase 39 restore contract baseline
- [R:/Projects/WorldForge/.planning/phases/40-live-reflection-progression-triggers/40-CONTEXT.md](/R:/Projects/WorldForge/.planning/phases/40-live-reflection-progression-triggers/40-CONTEXT.md) - same-turn evidence and reflection expectations

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - derived directly from the current campaign file layout and runtime code.
- Architecture: HIGH - based on direct comparison of the two existing restore implementations.
- Pitfalls: MEDIUM - queue invalidation and auxiliary async bleed are strongly indicated by the allowed source set, but some deeper cancellation details sit outside the requested read scope.

**Research date:** 2026-04-11
**Valid until:** 2026-05-11

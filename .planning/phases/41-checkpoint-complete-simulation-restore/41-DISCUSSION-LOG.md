# Phase 41: Checkpoint-Complete Simulation Restore - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 41-Checkpoint-Complete Simulation Restore
**Mode:** Auto (`--auto`)
**Areas discussed:** Restore contract, restore semantics, scope boundaries

---

## Restore Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal checkpoint restore | Restore `state.db` only and leave config/runtime metadata to reload defaults. | |
| Coherent authoritative bundle | Restore `state.db`, `config.json`, `chat_history.json`, and runtime retrieval storage as one restore unit. | ✓ |
| Over-broad artifact restore | Treat every campaign artifact as checkpoint-critical, including best-effort async artifacts. | |

**Auto choice:** Coherent authoritative bundle  
**Notes:** Phase 41 exists to close `RINT-03` and `SIMF-03`, so `config.json` cannot remain outside the restore contract. The chosen contract is broad enough to keep later turns coherent without overpromising unrelated async artifacts.

---

## Restore Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Separate checkpoint semantics | Let checkpoint load use a different restore model than retry/undo. | |
| Align with Phase 39 boundary | Reuse the same restored-boundary semantics already established for turn rollback, then extend them to checkpoints. | ✓ |
| Rebuild everything ad hoc | Recompute runtime state after restore instead of restoring a coherent boundary. | |

**Auto choice:** Align with Phase 39 boundary  
**Notes:** Phase 39 already defined the honest rollback boundary. Phase 41 should extend that contract to checkpoint load rather than introducing a competing restore model.

---

## Connection Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Best-effort reconnect | Swap files and hope existing DB/vector handles rebind correctly. | |
| Explicit invalidation and reopen | Close old DB/vector connections, replace bundle artifacts, then reopen/reload against restored files. | ✓ |
| Process-restart requirement | Treat restore as valid only after a backend restart. | |

**Auto choice:** Explicit invalidation and reopen  
**Notes:** Singleton DB/vector connections already exist in runtime code. Restore fidelity requires explicit teardown/reopen instead of assuming file replacement is enough.

---

## Scope Boundaries

| Option | Description | Selected |
|--------|-------------|----------|
| Expand into adjacent fidelity work | Fold inventory authority, target-aware oracle, travel, and docs cleanup into this phase. | |
| Keep restore-only scope | Limit Phase 41 to restore fidelity for existing runtime state and simulation coherence. | ✓ |
| Narrow to config.json only | Only add `config.json` restore and leave simulation coherence for later. | |

**Auto choice:** Keep restore-only scope  
**Notes:** Adjacent work already has dedicated phases (`38`, `42`, `43`, `44`). A too-narrow fix would miss the actual requirement that later turns and simulation remain coherent after restore.

---

## Reviewed Todos

- `Add reusable multi-worldbook library` — auto-reviewed due weak keyword match, not folded because it is unrelated to restore fidelity.
- `Add lore card editing and deletion` — auto-reviewed due weak keyword match, not folded because it is unrelated to checkpoint/simulation restore.

## the agent's Discretion

- Exact helper factoring between checkpoint restore and turn-boundary restore.
- Exact bundle layout details, provided they preserve the selected restore contract.

## Deferred Ideas

- None beyond the reviewed false-positive todo matches.

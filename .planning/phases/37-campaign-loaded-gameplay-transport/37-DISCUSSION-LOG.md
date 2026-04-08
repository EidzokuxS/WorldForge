# Phase 37: Campaign-Loaded Gameplay Transport - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `37-CONTEXT.md`; this log preserves the alternatives considered.

**Date:** 2026-04-08
**Phase:** 37-campaign-loaded-gameplay-transport
**Areas discussed:** gameplay API contract, game route identity, snapshot scoping, compatibility boundary

---

## Gameplay API Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Keep hidden active-session contract | Leave gameplay routes bound to `getActiveCampaign()` and keep requests free of `campaignId`. | |
| Keep `/api/chat/*` endpoints but make campaign identity explicit | Add `campaignId` to the existing gameplay request contract and resolve through `requireLoadedCampaign()`. | ✓ |
| Move everything to `/api/campaigns/:id/chat/*` immediately | Fully REST-nest gameplay transport under campaign-scoped paths in this phase. | |

**User's choice:** Agent discretion.
**Notes:** Selected the middle path. It fixes the real transport seam without adding a broad endpoint rename in the same phase. Critique: this leaves endpoint naming slightly inconsistent with other campaign-scoped routes, but that inconsistency is cheaper than mixing transport repair with route-tree churn.

---

## Game Route Identity

| Option | Description | Selected |
|--------|-------------|----------|
| Keep `/game` for Phase 37 | Preserve the current gameplay page and tighten only the transport contract behind it. | ✓ |
| Introduce `/campaign/[id]/game` now | Make campaign identity explicit in the URL and retarget navigation in the same phase. | |

**User's choice:** Agent discretion.
**Notes:** Chose to keep `/game`. This isolates the phase to transport and request identity. Critique: URL-level campaign identity remains unresolved, so deep-link semantics are still weaker than they could be.

---

## Snapshot Scoping

| Option | Description | Selected |
|--------|-------------|----------|
| Keep one global `lastTurnSnapshot` | Preserve current behavior even after campaign-addressable gameplay requests. | |
| Use campaign-keyed in-memory snapshots | Scope retry/undo snapshot state by `campaignId` but keep the mechanism in memory for now. | ✓ |
| Persist snapshots to disk now | Turn snapshot storage into durable campaign state during the transport phase. | |

**User's choice:** Agent discretion.
**Notes:** Selected campaign-keyed in-memory snapshots. That is the minimum coherent change once requests become campaign-addressable. Critique: it still does not solve restart durability or multi-step undo; those remain later-phase work.

---

## Compatibility Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Maintain silent active-session fallback for targeted gameplay routes | Accept requests without `campaignId` and fall back to the active campaign. | |
| Require explicit `campaignId` for the targeted first-party gameplay routes | Break the hidden fallback for `history`, `action`, `retry`, `undo`, and `edit`. | ✓ |
| Broaden the phase to every adjacent campaign/gameplay route immediately | Sweep checkpoints and all other route families into the same migration. | |

**User's choice:** Agent discretion.
**Notes:** Selected explicit `campaignId` as the new first-party contract. Critique: this is a breaking contract change for any ad-hoc callers, but the local app owns all first-party callers and the stronger invariant is worth it.

---

## Self-Critique Summary

- The chosen design intentionally optimizes for transport correctness over architectural purity.
- `activeCampaign` is not being abolished in Phase 37; it is being demoted from authority to side effect.
- `/game` remains a weak spot for URL-authored identity, but changing that now would blur the phase boundary.
- The decisions are coherent only if planners keep checkpoint fidelity, durable undo history, and turn-boundary honesty out of this phase.

## Deferred Ideas

- Promote gameplay navigation to `/campaign/[id]/game`.
- Remove the legacy plain-text `/api/chat` route.
- Persist retry/undo snapshots to disk or replace them with a durable history stack.
- Opportunistically migrate checkpoint routes to `requireLoadedCampaign()` in a later integrity phase if that reduces adjacent reload bugs.

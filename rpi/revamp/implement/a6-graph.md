# A6 graph

## objective

Build the first WorldGraph composition step: take the proven location graph and cast registry, then produce one graph with character nodes and placement edges.

## operating contract

- Keep A6 pure. It accepts data and returns data.
- Preserve the base graph exactly at the front of the returned node and edge arrays.
- Add one `Character` node for each player, imported NPC, and generated NPC in the cast registry.
- Emit characters in stable order: player first, then `importedCast`, then `generatedCast`, preserving each array order.
- Add one `located_at` edge when a cast member has `sceneLocationId` or `locationId`.
- Prefer `sceneLocationId` over `locationId` when both exist.
- Use `located_at` for both scene-to-parent containment and character-to-location placement.
- Read placement ids as base graph node ids. A6 does no name resolution.
- Fail when placement points to a missing base graph node.
- Fail when a generated character node id or placement edge id collides with the base graph.
- Leave kernel persistence and phase movement for a later slice.
- Do not call old `/api/worldgen/*`, old character routes, or scaffold generator code.

## agent lanes

### A1 source lock
Status: complete
Owner: A1
Scope: lock A6 to `REVAMP_ARCHITECTURE.md` and completed A4/A5a/A5b outputs.
Output:

- [sourced] A6 follows the architecture item "WorldGraph builder".
- [sourced] A4 owns location nodes and spatial edges.
- [sourced] A5a owns cast registry shape and cast member ids.
- [rejected] A6 does not introduce starting setup, GM opening, chat, or state writer behavior.

### A2 current-state map
Status: complete
Owner: A2
Scope: inspect existing revamp types and adapters.
Output:

- [inspected] `RevampWorldGraph`, `RevampWorldNode`, and `RevampWorldEdge` already support `Character` and `located_at`.
- [inspected] `RevampCastMember.id` can serve as the graph character node id.
- [inspected] `RevampCastPlacement` carries `locationId`, `sceneLocationId`, and notes.
- [inferred] A6 can avoid `shared` type changes.

### A3 reference extraction
Status: complete
Owner: A3
Scope: use old code only as reference.
Output:

- [rejected] A6 does not need old route handlers or generator imports.
- [rejected] A6 does not translate old players table persistence.

### A4 graph protocol
Status: complete
Owner: A4
Scope: define node and edge rules.
Output:

- [proposed] Character node id equals `RevampCastMember.id`.
- [proposed] Character node data stores `castMemberId`, source, role, importance, placement, identity, and draft.
- [proposed] Placement edge id is `edge:located_at:<castId>:<targetId>`.
- [proposed] Placement target must already exist in the base graph.
- [proposed] Placement ids are already graph ids. Callers align names to graph ids before A6.

### A5 proof harness
Status: complete
Owner: A5
Scope: define focused verification.
Output:

- [proposed] Prove base graph preservation.
- [proposed] Prove player, imported NPC, and generated NPC character nodes.
- [proposed] Prove scene placement wins over location placement.
- [proposed] Prove missing placement target, node id collision, and edge id collision failures.
- [proposed] Prove no old worldgen or character route imports.

### A6 cleanup and risk
Status: complete
Owner: A6
Scope: keep the slice narrow.
Output:

- [rejected] Kernel persistence remains outside A6.
- [rejected] UI debug view remains outside A6.
- [rejected] relationship edges remain outside A6 until a separate relation source exists.

## integration notes

A6 is a pure builder. The next persistence step can call it from kernel code after the graph composition proof is stable.

## A6b kernel connector

A6b writes the composed graph into `kernel.json`.

- Require kernel phase `cast_ready`.
- Require a player cast member.
- Call `buildRevampWorldGraph` with the existing kernel graph and cast registry.
- Persist the returned graph.
- Keep the phase unchanged.
- Expose the connector through `POST /api/revamp/campaigns/:id/graph/compose`.

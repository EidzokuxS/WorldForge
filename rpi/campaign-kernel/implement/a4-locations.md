# A4 Locations Adapter Canvas

## Objective

Build a pure adapter from current `ScaffoldLocation[]` data into campaign kernel `CampaignWorldGraph` location nodes and spatial edges.

## Operating Contract

- Use current worldgen location shape only as input data shape.
- Do not call `/api/worldgen/generate`, scaffold generators, or LLM roles.
- Do not persist kernel state in A4.
- Leave PowerMap, Cast Registry, Starting Setup, Opening, and Chat Loop for later slices.
- Fail with an error when a location name is empty, duplicated, or referenced by `connectedTo` or `parentLocationName` without a matching location.

## Lanes

### L1 Source Lock
Status: complete
Owner: L1
Scope: Bind A4 to the Campaign Kernel architecture.
Output:

- [sourced] Development order says A4 is `Locations adapter from current worldgen`.
- [sourced] Campaign Kernel graph supports `Location`, `SceneLocation`, `route_to`, and `located_at`.

### L2 Current-State Map
Status: complete
Owner: L2
Scope: Identify the current input shape.
Output:

- [inspected] `backend/src/worldgen/types.ts` defines `ScaffoldLocation` with `name`, `description`, `tags`, `isStarting`, `connectedTo`, `kind`, and `parentLocationName`.

### L3 Mapping
Status: complete
Owner: L3
Scope: Define location-to-graph conversion.
Output:

- [proposed] `kind: "persistent_sublocation"` maps to `SceneLocation`.
- [proposed] `kind: "macro"` and missing `kind` map to `Location`; current `ScaffoldLocation` input does not include `ephemeral_scene`.
- [proposed] `description`, normalized `tags`, `isStarting`, `kind`, and `parentLocationName` land in `CampaignWorldNode.data`.
- [proposed] Node IDs are deterministic strings derived from the location name plus a stable hash.
- [proposed] `connectedTo` emits one directed `route_to` edge per listed target and does not synthesize reverse routes.
- [proposed] `parentLocationName` maps to `located_at` from scene location to parent location.
- [proposed] `located_at` is overloaded here for scene-to-parent containment until A6 decides whether graph edges need a dedicated containment type.

### L4 Boundaries
Status: complete
Owner: L4
Scope: Keep A4 out of generation and persistence.
Output:

- [proposed] A4 returns a graph object only.
- [proposed] A6 owns later graph composition with powers, cast, pressures, items, and hooks.

### L5 Proof
Status: pending
Owner: L5
Scope: Prove graph output and fail-closed behavior.
Output:

- [pending] Add focused tests for macro location nodes, scene location nodes, route edges, parent edges, duplicate names, and missing references.

### L6 Risk
Status: complete
Owner: L6
Scope: Inspect for accidental old generation imports.
Output:

- [inspected] A4 imports `ScaffoldLocation` with `import type` only.
- [inspected] A4 has no runtime imports from `worldgen/`.
- [inspected] A4 module source contains no `/api/worldgen/generate`, `scaffold-generator`, or `generateScaffold`.

## Integration Notes

- +1 decision: A4 is a pure adapter and produces no player-facing UI.
- +1 proof target: given a small location list, produce stable graph nodes and edges; given invalid references, throw before graph output.
- +1 GLM note: GLM-5.2 requested explicit destinations for `description`, `tags`, and `isStarting`, explicit ID derivation, directed route semantics, and a type-only import boundary. Those revisions are applied here.

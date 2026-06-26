# Revamp Request

## Mission

Audit and rebuild the playable mechanics path from pressing `Create Campaign` through sustained longplay at turn 600.

The target is not a narrow runtime smoke test. The target is a player-visible game that stays coherent, inspectable, grounded, and mechanically truthful across setup, opening, ordinary play, travel, dialogue, inventory, NPC/world state, and long-run persistence.

## Source Request

- Create a dedicated branch: `feat/revamp`.
- Move the current `develop` state into `main`.
- Resync `main` and `develop` so both branches share the same baseline.
- Begin a full mechanics inquisition from campaign creation through the 600th turn.

## Scope

- Campaign creation entrypoint and frontend flow.
- World generation, review, save, and public DTO boundaries.
- Character creation, character review, start placement, and persisted player state.
- Opening page generation and first-screen playability.
- Game UI state: scene, routes, NPC presence, inventory, status, choices, history.
- `/chat/opening`, `/chat/action`, `/world`, and adjacent persistence routes.
- Clean gameplay runtime stages: SceneFrame, GM Read, Judge/Uncertainty, checklist, Stage 4 execution, Settlement, Stage 6 narration, commit.
- Longplay durability: turn records, world clocks, scene/location state, NPC/materialized actor state, item custody, route discovery, retries/errors, and stale-store absence.
- Verification harnesses needed to prove turn 0 through turn 600 without false-green acceptance.

## Non-Goals

- Legacy compatibility restoration.
- Fallback runtime paths.
- Cosmetic-only prose polish before loop correctness.
- Acceptance based only on unit tests, one-turn smoke tests, or generated action batches.

## Acceptance Bar

- A documented flow map exists from `Create Campaign` click to post-turn 600 state.
- Every critical boundary has an owner, input contract, output contract, failure mode, and proof method.
- Every discovered blocker has a root-cause fix or a documented implementation slice.
- Longplay proof distinguishes diagnostic lanes from pristine acceptance lanes.
- Final acceptance includes clean continuous lanes from turn 0 to turn 600, with no failed, replayed, restored, or contradicted player-facing turns.
- Verification artifacts include player-facing transcript, state deltas, test commands, GitNexus scope, and residual risk.

## First Pass

1. Research: build the executable flow map and identify choke points.
2. Plan: write phased implementation slices with verification gates.
3. Implement: fix one owner boundary at a time, verify each before moving on.
4. Prove: run sustained launch-to-longplay lanes and record evidence.

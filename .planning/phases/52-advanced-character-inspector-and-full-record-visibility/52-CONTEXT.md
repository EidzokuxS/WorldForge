# Phase 52 Context — Advanced Character Inspector & Full Record Visibility

## Problem

Phase 48 and Phase 49 added richer character data to the shared `CharacterRecord`:
- identity layers
- grounding
- `powerProfile`
- `sourceBundle`
- `continuity`
- provenance and start/runtime state

That data is persisted and returned by world payloads, but World Review still projects NPCs down to the old shallow card surface (`persona`, tags, goals, location, faction). Inspecting richer NPC state currently requires manual database inspection.

## Decision

Build an additive, read-only advanced inspector on NPC review cards.

Constraints:
- no new backend storage model
- no parallel frontend truth model
- no save-flow regression from extra frontend-only metadata

## Required Outcome

World Review must expose the already-stored record deeply enough that users can inspect:
- identity core
- grounding summary and sources
- power profile
- continuity policy
- provenance / start-state / runtime slices
- raw structured payload when needed

## Notes

- `WorldData.npcs[*]` already includes `draft` and `characterRecord`.
- `EditableScaffold` currently drops `characterRecord`, so the review surface loses access to `grounding.powerProfile`.
- The inspector should remain visually subordinate to the normal authoring card.

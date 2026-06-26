# Revamp Coverage Map

## Flow Spine

1. `Create Campaign` UI action starts a campaign setup path.
2. Backend creates or updates campaign/world draft state.
3. World generation produces locations, factions, NPCs, routes, objects, and starting constraints.
4. Review surfaces expose only public-safe world and character data.
5. Save path persists authoritative world, character, starting placement, clocks, inventory, and route state.
6. Game page loads campaign state and renders player-visible UI.
7. Opening route creates the first playable page without backend receipt prose.
8. Player action enters `/chat/action`.
9. SceneFrame assembles public citable refs and private runtime context.
10. GM Read interprets player intent without settlement authority.
11. Judge/Uncertainty admits deterministic, impossible, or Oracle-owned branches.
12. Checklist plans deterministic backend steps for admitted action plans.
13. Stage 4 executes typed receipts and state changes.
14. Settlement freezes authoritative turn outcome.
15. Stage 6 renders player-facing narration from accepted evidence.
16. Commit writes history, turn packets, clocks, world state, and done payload.
17. UI reloads/render updates and presents next action handles.
18. Repeat through turn 600.

## Audit Lanes

- Setup lane: campaign creation, worldgen, review, save, first load.
- Opening lane: start placement, visible actors, route handles, first page, first custom action.
- Core action lane: look, listen, wait, posture, local prop use, hidden/property checks.
- Route lane: route options, route status, legal movement, blocked movement, discovery boundaries.
- Dialogue lane: visible actor answers, unavailable answers, multi-actor address, NPC knowledge boundaries.
- Inventory lane: item checks, handoff, return, equip/unequip, custody narration matching state.
- NPC/world lane: support actor materialization, minor POI creation, NPC movement/visibility, faction/world facts.
- Persistence lane: world clocks, chat history, settled packets, stale store absence, reload continuity.
- Error lane: impossible actions, clarifications, validation failures, transport failures, restore boundaries.
- Longplay lane: continuous turn 0 to 600 transcript and state-delta evidence.

## Immediate Research Questions

- Which UI components and API calls own the campaign creation button path?
- Which backend route first creates campaign/world records?
- Where does draft data become authoritative saved game state?
- Which DTO surfaces still carry private refs or legacy fallback shapes?
- Which clean-runtime primitives can mutate state, and which only observe/report?
- Which stores must remain empty after clean-runtime turns?
- What harness can drive turn 0 to 600 while preserving adaptive, inspected action choice?
- What minimum player-facing evidence makes a 600-turn lane acceptable instead of merely green?

## Proof Gates

- Static: typecheck, focused runtime suites, relevant frontend suites, `git diff --check`.
- Graph: GitNexus impact before symbol edits; GitNexus `detect_changes` before every commit.
- Live setup: fresh campaign creation through first game page.
- Live short: opening plus 10 inspected turns.
- Live medium: 60 inspected turns from a pristine zero-turn clone.
- Live long: 600 inspected/adaptive turns with transcript and post-turn state deltas.

## Open Risks

- Existing tests can pass while player-facing first page remains unplayable.
- Generated action batches can hide adaptive-choice failures.
- Old stores or fallback paths can create false acceptance.
- Route labels can leak hidden knowledge through prose while UI correctly owns handles.
- Narration can claim custody, movement, or discovery that typed receipts did not commit.

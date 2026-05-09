# Wave 3 Detached Worker Audit

Date: 2026-05-07

## Boundary Being Closed

Before Wave 3, `/chat/action` could finish visible narration, emit `done`, and then run state-bearing work in a detached timer. That meant the next player action could start from a world version that was not the version the player had just seen.

Wave 3 changes the route boundary to:

1. Finish the current player-facing GM/narrator turn.
2. Run rollback-critical route work before `done`.
3. Queue state-bearing off-screen work as versioned simulation proposals.
4. Emit `done` with `worldVersion` and `worldTimeMinutes`.
5. Allow only non-authoritative auxiliary work after `done`.

## State-Bearing Detached Calls Found

| Old call surface | Former risk | Wave 3 migration |
| --- | --- | --- |
| `simulateOffscreenNpcs(...)` from `backend/src/routes/chat.ts` | Could call `applyOffscreenUpdate` and persist off-screen NPC state/events after `done`. | No longer called from chat detached work. Replaced by `npc_offscreen_tick` job plus `npc_offscreen_updates` proposal on interval ticks. |
| `checkAndTriggerReflections(...)` from `backend/src/routes/chat.ts` | Could run reflection tools and write beliefs/goals/relationships after `done`. | No longer called from chat detached work. Replaced by `npc_reflection_scan` job plus `npc_reflection_updates` proposal every turn. |
| `tickFactions(...)` from `backend/src/routes/chat.ts` | Could run faction tools and write world/faction/location state after `done`. | No longer called from chat detached work. Replaced by `faction_world_tick` job plus `faction_world_updates` proposal on interval ticks. |

## Auxiliary Work Still Allowed After Done

| Work | Why it can remain detached |
| --- | --- |
| `drainPendingCommittedEvents` + `embedAndUpdateEvent` | Embeds events that have already committed through the turn boundary; it does not invent new authoritative state. |
| optional image cache generation | Caches media artifacts and does not redefine world truth. |

## Verification Hooks

- `backend/src/routes/chat.ts:123` queues proposals in rollback-critical post-turn work.
- `backend/src/routes/chat.ts:159` keeps auxiliary work detached but without direct world-simulation writers.
- `backend/src/routes/chat.ts:350` adds world clock metadata to `done`.
- `backend/src/routes/chat.ts:692` and `backend/src/routes/chat.ts:943` store undo snapshots before emitting `done`.
- `backend/src/routes/__tests__/chat.test.ts` asserts direct detached `simulateOffscreenNpcs`, `checkAndTriggerReflections`, and `tickFactions` are not called.

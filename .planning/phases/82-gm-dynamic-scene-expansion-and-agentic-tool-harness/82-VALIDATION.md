# Phase 82 Validation

## Deterministic Tests

- `reveal_location` creates anchored ephemeral scenes under the current legal parent and rejects remote/offscreen anchors in player turns.
- Ephemeral scenes receive lifetime metadata and are excluded from traversal/presence after expiry/archive.
- Durable events from archived ephemeral scenes spill to the persistent anchor; scene-local events do not become durable memory.
- `spawn_npc` places support NPCs with correct broad/current-scene ids for macro, persistent sublocation, and ephemeral scene targets.
- Temporary/support NPC cleanup retires non-promoted scene actors without deleting canonical NPCs.
- Promotion preserves selected support NPC state and removes cleanup eligibility.
- Tool observations expose authoritative refs/results and failed/skipped steps do not leak as completed narration.
- Budget guards block repeated equivalent dynamic creation in one turn using `toolName + normalized anchor/current-scene ref + normalized role/name/kind + lifetime category`, and cap revisions without timeouts.
- Rollback resets per-turn dynamic budgets, while one validation-failure revision remains allowed.
- SSE/UI stage mapping covers `creating-local-scene`, `spawning-support-npc`, `settling-tool-observation`, and `cleaning-transient-scene`.
- Prompt-contract tests prove GM Action Checklist, GM tool-step, and tool-schema descriptions all carry reuse/create/retire/promote affordance rules.

## Live Gate

Use a fresh generated campaign, not Naruto/JJK/GDKX or the previous Phase 81 campaign.

Required play sequence:

1. Reach opening scene.
2. Ask for a local affordance that probably does not exist yet, such as a desk, checkpoint booth, side corridor, service counter, alley, shrine alcove, or maintenance access.
3. Verify GM either uses an existing appropriate sublocation or creates one anchored locally.
4. Ask for or naturally encounter a minor support NPC.
5. Verify support NPC appears in current scene and is not globally visible elsewhere.
6. Continue normal play for several turns where no dynamic creation is needed.
7. Verify no spam of ephemeral scenes/NPCs: in 10 turns with at most two scene changes, at most two dynamic creations occur, and ordinary follow-up turns with no new scene fiction create zero dynamic objects.
8. Move away or close the scene; verify cleanup/archive or promotion is correct.
9. Ask for a similar local affordance again and verify the GM reuses an existing suitable local scene/support NPC before creating another one.
10. Scan committed events, tags, currentScene, and narration for false settled claims.
11. Record screenshots/logs and exact turn stages.

## Failure Conditions

- A dynamic tool creates a remote/offscreen target from a local player turn.
- A temporary NPC remains forever in normal scene rosters without promotion.
- An expired ephemeral scene stays traversable/present.
- The GM creates new rooms/NPCs every turn despite existing local affordances.
- The GM creates temporary props/items as a Phase 82 dynamic tool affordance.
- Final narration claims a failed/skipped dynamic tool as completed truth.
- Any fix adds turn-duration caps.

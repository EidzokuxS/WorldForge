# Phase 88 Fresh Live Smoke

Date: 2026-05-08

## Command Shape

- Backend/frontend were restarted from the current workspace before the run.
- Artifact directory: `R:\Projects\WorldForge\output\playwright\phase-88-living-world\live-smoke-20260508-tourist-pressure-fresh`
- Mode/profile: `PHASE88_MODE=live`, `PHASE88_PROFILE=smoke`
- Character-card directory env: `PHASE88_CHARS_DIR=X:\Models\Chars`
- Existing campaign reuse was not enabled.

## Fresh Campaigns

- `lacquer-signal`: `142cf3f0-e6da-4f6b-8467-5721da7d963f`
  - Artifact source: `fresh`
  - Provisioning log: `reuseExisting:false`
  - Player source: `parse-concept`
  - Generated scope: 12 locations, 10 NPCs, 5 factions, 54 lore cards.
- `urban-occult-crossover`: `99be2c59-85c7-4546-8da5-38af81fa4169`
  - Artifact source: `fresh`
  - Provisioning log: `reuseExisting:false`
  - Player source: `parse-concept`
  - Generated scope: 19 locations, 13 NPCs, 5 factions, 52 lore cards.

Old fixed IDs appear only in `existingCampaignId` metadata for comparison; the live run used the fresh campaign IDs above.

## Result

- Summary: `status=passed`
- Totals: 2 routes, 2 turns, 0 hard failures, 2 soft review samples queued.
- Summary file: `R:\Projects\WorldForge\output\playwright\phase-88-living-world\live-smoke-20260508-tourist-pressure-fresh\summary.json`
- Provisioning file: `R:\Projects\WorldForge\output\playwright\phase-88-living-world\live-smoke-20260508-tourist-pressure-fresh\campaign-provisioning.jsonl`

## Route Evidence

### Tourist Pressure

- Route artifact: `routes\lacquer-signal\tourist-pressure\turns.jsonl`
- World changed: `true`
- GM Read path: `tool_plan`
- Tool execution: `log_event`, `add_tag`
- Backend turn log: `backend\campaigns\142cf3f0-e6da-4f6b-8467-5721da7d963f\logs\turn-0-f40b7378.jsonl`
- Outcome: passive/tourist play now receives local pressure and state mutation without making the player the center of the whole plot.

### False Claim Boundary

- Route artifact: `routes\urban-occult-crossover\false-claim-boundary\turns.jsonl`
- World changed: `true`
- GM Read path: `roll_oracle`
- Oracle result: `miss`
- Tool execution included: temporary `spawn_npc`, scene-local `log_event`, player/NPC tags, durable `log_event`.
- Backend turn log: `backend\campaigns\99be2c59-85c7-4546-8da5-38af81fa4169\logs\turn-0-b8d8ce0c.jsonl`
- Outcome: the player claim stayed a claim/provocation; it did not become durable Gojo authorization.

## Notes

- This run does not enforce arbitrary model-turn duration caps.
- Assistant text is preserved in full in `turns.jsonl`; the harness does not clip model output.
- Soft prose/playfeel remains queued for LLM/human review, not lexical scoring.
- `PHASE88_CHARS_DIR` was supplied, but this smoke profile still created player characters from concept text. Expanded live coverage should import at least one actual V2 character card from `X:\Models\Chars`.

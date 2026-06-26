# Phase 95 Actual Play Verification Summary

## Fresh World Run

- Campaign: `6712d1bb-7bda-460f-b4df-dc9b88c16535`
- World: `Glass Tides of Moth-Court`
- Player: `Nyx Arlen`
- Worldgen produced 11 locations, 5 factions, 12 NPCs, 51 lore cards.
- Actual player run now covers opening plus 40 logged turns in `output/phase95-actual-play/transcript.md`.
- The extended segment is turns 12-40, all completed with `status=done`.
- The full transcript is not a clean 40/40 run because the original probe still contains the historical turn 4-5 failures that were later fixed. The clean distance claim is the 29-turn continuation segment.

## Edge Cases Played

- Procedure learning without revealing sealed proof contents.
- Minimum-field exception form and contradictory office guidance.
- Pending narration recovery after final narration guard failure.
- Signed sworn attestation without opening the proof.
- Asked for recipient/contents metadata without providing facts; game refused to reveal sealed contents.
- Tried to misuse `Cheap Legal Stamp`; game noticed wrong stamp and preserved consequence pressure.
- Explicit route travel to `The Shifting Notice Door`; authoritative location changed and new routes/NPCs appeared.
- Read dynamic public notice without assuming hidden recipient/contents.
- Extended run reached `Bridge Ward of Oath-Locks`, `Flooded Stairwell Registry`, `Coral Archive Vaults`, and `Central Shaft Watchpost`.
- Tried a bad paperwork shortcut with `Cheap Legal Stamp`; the world logged a durable bridge warning and later referenced it.
- Followed a sealed-proof refusal path into a real dead end, then authorized official archive unsealing and received docket `9-DRIFT-VEY`.
- Tested unsafe/off-path descent during high tide; the world refused the shortcut and explained the risk.
- Waited through a tide gate; world time jumped from 138 to 379 minutes and low water made authorization available.
- Reached the chamber approach, but entry remained blocked by a red-ink validation requirement.

## Bugs Fixed From Play

- `restoreCampaignBundle` now removes SQLite `state.db-wal`, `state.db-shm`, and `state.db-journal` sidecars around bundle restore. The live bug was a failed turn appearing rolled back in chat/config while SQLite WAL replayed the failed world tick/version.
- Player-facing prompt safety now allows a forbidden actor label only when that exact actor was committed as a same-turn visible `spawn_npc` / `create_scene_extra`.
- Final visible narration output guard now has the same narrow same-turn visible actor creation allowance, so a newly visible clerk can be named in final narration without weakening hidden actor redaction.
- Oracle flagged the first same-turn actor allowance as too broad; it is now restricted to forbidden actor-name checks only, with strict normalized label equality. Substring matches and private/fact terms embedded in actor labels fail closed.

## Verification

- `npm --prefix backend run test -- --run --reporter dot`: passed, 207 files / 2523 tests.
- `npm --prefix frontend run test -- --run --reporter dot`: passed, 64 files / 507 tests.
- `npm run typecheck`: passed.
- `npm --prefix backend run typecheck`: passed.
- `npm --prefix frontend run lint`: passed.
- `npm --prefix frontend run typecheck`: passed.
- Focused replay after guard fix resumed pending narration successfully and finalized with `done.resumed=true`.
- Oracle browser review successfully delivered 9 file attachments and saved `output/phase95-actual-play/oracle-review.md`; the reported blocker was fixed before this summary was updated.
- Oracle extended-distance review delivered 5 file attachments and saved `output/phase95-actual-play/oracle-extended-review.md`; verdict: turns 12-40 are meaningful distance evidence, but robust Phase 95 playability is still blocked by typed document/state gaps.
- Extended actual-play continuation: turns 12-40 completed live against backend `http://127.0.0.1:3001`, ending at tick 387 / worldVersion 63.
- GitNexus impact before editing:
  - `restoreCampaignBundle`: LOW.
  - `assertPlayerFacingPacketPromptSafe`: LOW.
  - `validateVisibleNarrationAgainstPacket`: LOW.
- GitNexus `detect_changes(scope=all)`: CRITICAL due the full existing Phase 95 branch scope, 99 changed files / 319 changed symbols.

## Remaining Playtest Findings Not Fixed Here

- Scene-extra NPC duplication still occurs in the live run (`Exchange Validation Clerk` appears multiple times after repeated interactions).
- Stamped exception form is represented in narration, but inventory summary still only shows initial signature items; form/stamp status may need a dedicated inventory/document-state representation.
- Extended run strengthened this concern: docket receipt `9-DRIFT-VEY`, bridge warning rider, tide-crossing stamp, and authorized review receipt were all carried in narration, but the final inventory still only listed the five initial items.
- Authorized archive review did not mutate `Anonymous Sealed Proof` into an opened/reviewed document in the inventory summary, even after the story treated it as unsealed and reviewed.
- Oracle also flagged player-premise smuggling: turn 26 began with "After the official unsealing" before the transcript had visibly or typed-state committed the unsealing transition.
- Route state lagged behind authorization at Central Shaft Watchpost: after the tide-crossing stamp, the watchpost still did not expose a direct Hearing Chamber route until the player traveled back down into the registry.
- `Archive Review Clerk` appears twice in visible NPCs after repeated archive interactions; bridge clerk naming also drifted between similar clerk identities.

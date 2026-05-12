# Phase 95 Actual Play Verification Summary

## Fresh World Run

- Campaign: `6712d1bb-7bda-460f-b4df-dc9b88c16535`
- World: `Glass Tides of Moth-Court`
- Player: `Nyx Arlen`
- Worldgen produced 11 locations, 5 factions, 12 NPCs, 51 lore cards.
- Actual player run covered opening plus 11 logged turns in `output/phase95-actual-play/transcript.md`.

## Edge Cases Played

- Procedure learning without revealing sealed proof contents.
- Minimum-field exception form and contradictory office guidance.
- Pending narration recovery after final narration guard failure.
- Signed sworn attestation without opening the proof.
- Asked for recipient/contents metadata without providing facts; game refused to reveal sealed contents.
- Tried to misuse `Cheap Legal Stamp`; game noticed wrong stamp and preserved consequence pressure.
- Explicit route travel to `The Shifting Notice Door`; authoritative location changed and new routes/NPCs appeared.
- Read dynamic public notice without assuming hidden recipient/contents.

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
- GitNexus impact before editing:
  - `restoreCampaignBundle`: LOW.
  - `assertPlayerFacingPacketPromptSafe`: LOW.
  - `validateVisibleNarrationAgainstPacket`: LOW.
- GitNexus `detect_changes(scope=all)`: CRITICAL due the full existing Phase 95 branch scope, 99 changed files / 319 changed symbols.

## Remaining Playtest Findings Not Fixed Here

- Scene-extra NPC duplication still occurs in the live run (`Exchange Validation Clerk` appears multiple times after repeated interactions).
- Stamped exception form is represented in narration, but inventory summary still only shows initial signature items; form/stamp status may need a dedicated inventory/document-state representation.

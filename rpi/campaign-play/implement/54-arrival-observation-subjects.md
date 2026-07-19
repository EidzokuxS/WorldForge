# Arrival observation subjects

## Outcome

Arriving in an occupied exact scene no longer deadlocks Narrator between a valid visible actor and an unbound movement observation. Future visibility packets explicitly bind a canonically named person only when code independently confirms that person in the current exact scene. An already frozen packet remains immutable; Narrator instead separates its travel consequence from unbound destination orientation.

## Field evidence

Diagnostic campaign `b4163989-7ed6-48cf-9dbc-f4e1d45c3a66`, player action 26:

`Leave the chapel business behind and go to Cinderwatch Beacon Terrace.`

Rulebook advanced time by two minutes, moved Mara from Cinderwatch Undercity to Cinderwatch Beacon Terrace, and recorded one public arrival event. The public projection correctly removed Renzo Malfatti and Lucia Cordeglio, showed Aldo Zecchini under `Present here`, and exposed three routes from the terrace. The movement observation also named Aldo, but `observationSubjects` was empty because the Game Master event affected only the player and destination location. Two GLM 5.2 narration proposals attached Aldo to the travel observation and were correctly rejected as `narration_invalid`.

Turn `turn-player-action:ec9f975af8db505c02fe6ec7e53645b74ab625b8`, base world version 42.

## Contract

- A directly perceived observation keeps the existing affected-reference subjects.
- Visibility also intersects exact canonical full names in that observation with the code-owned `visibleActors` for the current exact scene.
- The intersected actor becomes an observation subject only for identity and presence. The text cannot create an actor, move one, or grant performer authority.
- The performing actor remains separate and is never duplicated as an observation subject.
- An unbound visible actor may appear only in a separate orientation beat with no current observation indexes. Movement consequences and destination orientation remain separately inspectable.
- Frozen narrator packets are not rewritten during recovery.

## Validation

- Visibility regression removes Oren Tide from both the event read scope and affected references, names him exactly in the direct observation, and confirms that exact-scene `visibleActors` produces the Oren subject binding.
- Narrator prompt regression requires unbound destination actors to appear in a separate empty-index orientation beat.
- Visibility tests passed: 6. Narrator tests passed: 17. Backend typecheck passed.

After a controlled backend restart, explicit `Resume` used the unchanged action-26 packet and reran only Narrator. Worker epoch 9 accepted one GLM 5.2 narration after the two earlier rejected proposals. The completed ledger contains exactly one `advance_world_time`, one `move_actor`, and one `record_world_event`; world version advanced once from 42 to 44. Reload restored the terrace, Aldo, routes, two narration beats, and the available actions.

## Playtest reading

The scene respects the player's decision to leave the chapel thread. It does not pull Mara back toward Lucia, Renzo, or the Schedule of Borrowed Shadows. The first beat gives a coherent climb, beacon, rain, cliff, and road patrol; the choices stay local to Aldo, the strange shadows, or onward travel.

The second beat, `Aldo Zecchini is on the terrace.`, is mechanically honest but too dry to carry its own card. This is prose-quality evidence for later beat-shaping work, not a reason to weaken identity authority or add backend-authored prose.

## Semantic review

`humanizer` and `deslop` review kept the new Narrator instruction direct: bind the travel observation to travel, and place an unbound destination person in a separate orientation beat. No case-specific name, hidden retry, provider switch, fallback, or code-authored scene prose was added.

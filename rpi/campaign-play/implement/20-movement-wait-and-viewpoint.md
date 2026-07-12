# Task 20: movement, waiting, and narrative viewpoint

Status: fixed and verified through three additional rendered player actions.

## Manual play sequence

The diagnostic campaign `44b6e2f0-4f79-4d63-a689-709ca0852586` continued from two completed actions:

1. `Go to Belfry Spire: the spire's silhouette through raft-mist` moved Wren from `tidal-platforms` to `belfry-spire`. Mara did not follow, no replacement NPC was inserted, and the available actions correctly dropped the contact option. World version advanced 11 -> 13.
2. `Wait and listen for the next bell sequence` advanced the clock from shortly after midnight to Day 1 02:30. Eight autonomous actor jobs were settled across the campaign by the end of this lane. The player perceived only the local bell sequence: three deep tones followed by a rising fifth at shrinking intervals. World version advanced 13 -> 14.
3. `Examine rain-dark stone and open arches above the streets` exposed geometric keystone carvings, sightlines toward `signal-keep` and `great-bell-chamber`, and the contrast between salvager scratches below and untouched weathered stone above. World version advanced 14 -> 15 and time reached 02:35.

All three actions completed. The lane remains diagnostic because the wait action was resumed after a pre-fix Judge contract failure.

## Defects found and fixed

Judge accepted a schema-valid wait proposal but failed the final ruling invariants. The prompt now states every cross-field rule that code enforces:

- actionable result bounds cannot contain `no_effect`;
- impossible and clarification rulings use `no_effect` for both bounds;
- `clarificationQuestion` is non-null only for `clarification_required`;
- an uncertain modifier range must contain zero.

Resume then completed the same frozen wait action through Judge, Game Master, Rulebook, actor settlement, visibility, and Narrator.

The resulting scene revealed a prose defect: the journal correctly named Wren in a factual record, but the lived moment switched to `Wren holds still`. Narrator now requires every beat to address the player as `you`. The next live observation began `You run your eyes along the rain-darkened stonework...`, while the journal remained a third-person factual summary.

Humanizer/deslop verdict: both prompt revisions are direct contract language. The live scene is concrete and readable; it maintains second-person viewpoint, limits itself to local perception, and connects the observed stone patterns to the already heard bells without exposing hidden actor state.

## Living-world verdict

The player moved into an empty location without attracting the cast. Waiting advanced world time by more than two hours and let background schedules settle while exposing only a locally audible event. The next observation remained grounded in that audible sequence. This is meaningful living-world behavior, though the recovered wait keeps the campaign diagnostic rather than pristine acceptance.

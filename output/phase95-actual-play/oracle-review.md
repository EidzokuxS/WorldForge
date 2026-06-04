## Verdict

**Conditional no-go for the safety fix as claimed.** The SQLite sidecar restore looks sufficient for the observed rollback/WAL replay bug, and the transcript is credible real adaptive play with meaningful edge cases. The remaining blocker is that the **same-turn visible actor allowance is not quite narrow enough** to support the “exact actor only” claim.

## Blocker

**Same-turn visible actor allowance is broader than advertised.**

The good part: the allowance is tied to committed, perceivable, successful same-turn actor creation via `spawn_npc` / `create_scene_extra`, and the player-facing visible-actor label path requires exact normalized equality.

The problem: the actor matching helper also allows multi-token substring containment. That means a forbidden actor name can be allowed when it is only part of a newly created visible actor label. More concerning, `assertPlayerFacingPacketPromptSafe` applies the committed-actor allowance while iterating over the combined `forbiddenTerms` list, not only `forbiddenActorNames`. So a forbidden private term that appears inside a same-turn created actor label could potentially bypass prompt safety.

I would fix before accepting the claim:

```ts
// Apply same-turn creation allowance only for forbiddenActorNames,
// never forbiddenFactMarkers or forbiddenPrivateTerms.
```

And make the actor match strict unless there is an explicit alias/equivalence mechanism:

```ts
normalizedForbiddenName === normalizedCommittedLabel
```

Add negative tests for partial/substring matches, stale previous-turn visible actors, failed/unreferenced actor creation results, and forbidden private terms embedded in created actor labels.

## Non-blocking risks

**SQLite restore:** The implementation closes DB/vector handles, removes `state.db-wal`, `state.db-shm`, and `state.db-journal` before copying the restored DB, removes them again after copying, then reloads the campaign. That is enough for the bug described: failed turn rolled back in chat/config while WAL replayed stale SQLite state. The remaining risk is test depth: the focused test mostly asserts `rmSync` call order via mocks. A real temp SQLite regression test in WAL mode would give stronger confidence.

**Transcript:** The transcript looks like real adaptive play, not a static happy-path script. It includes fresh campaign/world IDs, changing ticks/world versions, failed guarded turns, pending narration recovery with `resumed=true`, procedural contradiction handling, refusal to reveal sealed proof recipient/contents, bad-stamp consequence pressure, route travel, and new public notice reading. The duplicate `Exchange Validation Clerk` accumulation is visible and correctly listed as unfixed.

**Document/inventory state:** The form/stamp/signature status is represented narratively but not reflected in inventory/document state. That is not a blocker for these fixes, but it will matter for later continuity and mechanical enforcement.

## Follow-ups

1. Tighten the same-turn actor allowance to actor-name terms only and strict label equality.
2. Add negative tests for substring/private-term bypass cases.
3. Add an integration test using an actual SQLite DB in WAL mode to prove restored `state.db` is authoritative after sidecar cleanup.
4. Track document/form state explicitly so stamped/attested/tainted forms are not only remembered through narration.
5. Fix scene-extra/NPC duplication before longer actual-play validation.

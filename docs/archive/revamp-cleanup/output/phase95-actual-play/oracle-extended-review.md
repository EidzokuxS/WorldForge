## Verdict

Yes: this is **meaningful distance evidence**, not merely an 11-turn smoke run. The extended segment has **turns 12–40 all `status=done`**, reaches multiple new locations, handles off-path actions, preserves some consequences narratively, and advances time from **tick 42 / worldVersion 23** at turn 12 to **tick 387 / worldVersion 63** at turn 40.

But it is **not yet robust Phase 95 playability evidence**. The strongest blocker is that core gameplay documents remain mostly **narrative assertions**, not reliable typed state. The run proves the live runtime can continue and improvise coherently for distance; it also exposes exactly why Phase 95 needs document-state hardening.

Also note: the full 40-turn log is not clean 40/40. Turns **4–5** are `status=error` with no visible narration. The clean distance claim is specifically **turns 12–40**, plus recovery/fix evidence in the summaries.

## Coherence of blockers and consequences

Mostly coherent at the narrative level.

The good evidence:

* The sealed proof does **not** leak recipient or accusation before authorized review. Turn 8 explicitly refuses that request.
* The bad `Cheap Legal Stamp` shortcut is caught twice: first at the Exchange in turn 9, then formally at the bridge in turn 16.
* The bridge warning persists narratively: turns 19–20 discuss it, and later turns treat it as attached to the file/rider.
* The refusal path is real: turns 18–22 repeatedly block sealed-document bypass at the registry.
* High tide is a real gate: turns 30–34 deny crossing and unsafe descent; turns 35–37 advance to low-water authorization.
* Turn 40 correctly does not hand-wave chamber entry; it blocks on missing red-ink validation.

The weak evidence:

* The official unsealing/review transition is under-specified. Turn 25 says official review requires seal breach and chain-of-custody logging, then waits. Turn 26 begins with the player premise “After the official unsealing,” and the runtime accepts it. From the provided evidence, the actual seal breach / registry record was not visibly or typed-state committed before that.
* The docket `9-DRIFT-VEY` is not visibly stated in turn 26 or turn 27. It first appears in turn 28 as already-carried “docket acknowledgment receipt for 9-DRIFT-VEY.” That is after official review, so not a sealed-content leak, but it is weak provenance.
* The warning/remediation rules drift: turns 20–23 variously say remediation is at the Court, that Archive review may allow sealed validation, and that remediation documentation is needed “from the registry.” Turn 25 then proceeds without visibly resolving that remediation-documentation requirement.

## Evidence-grounded blockers

1. **Document/inventory state is not durable enough.**
   Across all after-snapshots, inventory remains exactly: `Blank Tide-Map`, `Chalk`, `Wax Seal`, `Cheap Legal Stamp`, `Anonymous Sealed Proof`. It never adds or mutates the Transit Notarization Exception form, bridge warning entry/card, warning rider, archive review receipt, docket acknowledgment receipt, `9-DRIFT-VEY`, or tide-crossing authorization stamp.

2. **`Anonymous Sealed Proof` does not mutate after official review.**
   Turn 26 treats the proof as unsealed/reviewed. Turns 28 and 39 refer to a reviewed proof or reviewed file. But state still lists only `Anonymous Sealed Proof`, with no visible typed status like `sealed=false`, `reviewed=true`, `docketId=9-DRIFT-VEY`, `contentsVisibility=official-only`, or `chainOfCustody`.

3. **Docket `9-DRIFT-VEY` lacks clear typed provenance.**
   The summaries claim turn 26 reveals docket `9-DRIFT-VEY`, but the transcript’s turn 26 visible text only says the document is logged under a docket at the Office of the Tide-Magistrate. The exact docket id first appears in turn 28. That should be impossible unless a typed document fact was created by the review event and exposed to the player.

4. **Review receipt is created in narration only.**
   Turn 27 explicitly asks for durable proof “instead of relying on narration,” and the narration grants a durable receipt. The inventory/state summary still does not include it. This directly blocks the stated Phase 95 goal.

5. **Warning rider is narratively persistent but not typed.**
   Turn 16 logs a formal warning; turns 19–20 confirm it is durable; turn 26 says a bridge warning rider is attached to the file; turns 28, 32, 34, 37, and 39 continue referencing it. But there is no inventory/document-state representation showing warning id, source, severity, rider attachment, remediation status, or compounding penalty.

6. **Tide-crossing authorization does not update route state.**
   Turn 37 stamps the docket receipt and says the drained passage is open. Turn 38 immediately says no established crossing route exists to mark. The Watchpost routes remain only `Coral Archive Vaults` and `Flooded Stairwell Registry`; no direct `Moth-Lit Hearing Chamber` route appears. Turn 39 then accepts travel “through the newly authorized route” but lands the player back at the Registry.

7. **Player action can smuggle uncommitted document transitions.**
   The clearest case is turn 26’s “After the official unsealing.” The previous turn did not visibly complete unsealing or logging. Robust play needs the runtime to reject, clarify, or explicitly perform the missing step, not silently adopt the player’s premise.

8. **The evidence is not a clean 40-turn done run.**
   Turns 4–5 are errors: one `PlayerFacingPacket unsafe` failure and one visible-narration grounding failure. The verification summary says fixes were applied, but the transcript still contains the failures. The distance evidence should be framed as “29 consecutive completed continuation turns after the original probe,” not “40 clean turns.”

## Non-blocking risks

* **NPC duplication/identity drift remains visible.** `Exchange Validation Clerk` duplicates repeatedly in early turns; `Archive Review Clerk` appears twice after turn 27; bridge clerk labels vary between `Bridge Ward Passage Clerk`, `Bridge Passage Clerk`, and `Bridge Authority Duty Clerk`.
* **Quick actions sometimes drift from routes.** Turn 40 offers “Travel to Court of Tidal Motions,” but the final route list does not include the Court from the Registry.
* **Option narration can be generic.** Turn 32 says “four visible options before you,” but `quickActions` is empty for that turn.
* **Time gating works, but time advancement is language-sensitive.** Turn 35’s explicit wait advances only from 137 to 138, while turn 36’s “After waiting” jumps to 379. That may be acceptable, but should be made explicit/tested.
* **The actual-player evidence summary is lossy.** The script’s `worldSummary()` reports item names only and truncates some world lists, so it may hide full backend state. But based on the uploaded files, the provided evidence does not demonstrate typed document durability.

## Recommended next fixes/tests

1. Add a typed `documents` or `caseFile` state model with stable ids and statuses for:
   `Anonymous Sealed Proof`, Transit Notarization Exception form, bridge warning entry/rider, archive review receipt, docket `9-DRIFT-VEY`, tide-crossing authorization, and red-ink validation.

2. Make official review an explicit atomic transition:
   `sealed -> officially_unsealed -> reviewed -> docketed`, with visible text and typed state agreeing. The player should not be able to assert “after official unsealing” unless that transition exists.

3. Add provenance checks for generated document facts.
   `9-DRIFT-VEY` should only appear if a prior event created it and exposed it. Same for warning rider and authorization stamp.

4. Couple document stamps to route gates.
   After tide-crossing authorization is attached, either expose a typed route/gate to the Hearing Chamber or clearly state that the authorized route still goes through the Registry checkpoint.

5. Add regression tests for document mutation across 20+ turns:
   acquire receipt, leave location, ask another NPC to inspect it, wait through a tide gate, travel, then verify inventory/document state still contains the same ids and statuses.

6. Add a negative test for player-premise smuggling:
   player says “after the proof is unsealed” before unsealing occurred; runtime must refuse or perform the missing official step visibly.

7. Add a final-state verifier that compares narration claims against typed state:
   every carried document named in visible narration must exist in model-readable state, and every gate decision must cite a typed requirement or missing typed requirement.

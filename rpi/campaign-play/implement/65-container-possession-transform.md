# Container possession transform

## Outcome

A player action that fills or seals a container inside a quantity-one plural stack now remains one authoritative possession. Judge requires a transform of the exact source handle. Game Master must author a different result name for the complete retained set, and the existing Mechanical Authority Reviewer independently checks that the name carries the material new contents or state before Rulebook execution.

Code still owns the atomic source decrement, result increment, order, scopes, receipts, events, and persistence. It does not split a stack, invent a result name, rewrite an invalid proposal, or retry invisibly.

## Reproduced failures

Black Rain run `black-rain-passage-pristine-60-r18` exposed two boundaries while Marta collected an already-loose corrosion flake with `Specimen jars ×1`.

1. The original player action authorized `acquire` and left `Specimen jars ×1` beside a new `Sealed corrosion flake sample ×1`. That created a filled jar without consuming or transforming the container stack.
2. After Judge was corrected on a diagnostic clone, Game Master proposed `transform` but reused `Specimen jars` as the result name. The deterministic compiler rejected the proposal before Rulebook execution because source and result derived to the same possession key.
3. A first prompt-only rerun produced one atomic result, `Specimen jar set with remaining empty jars ×1`, but omitted the sealed sample from durable identity. The summary and narration still mentioned the sample, while the inventory card after reload did not.

The third result proved atomic quantity but not durable possession semantics. It remains diagnostic evidence and is not accepted as a clean action.

## Repair

- Judge treats putting new contents into a visible container, filling it, or sealing it as a required transform of the exact source possession. A quantity-one plural or kit-like stack cannot become a used member, an implied remainder, and a separate acquisition.
- Game Master requires a post-transform name different from the source name. For a quantity-one plural container or kit, the name describes the complete retained set and its material new contents or state; summary cannot substitute for that identity.
- Pure transforms now enter the existing independent Mechanical Authority Review even when the proposal has no `record_world_event`.
- The reviewer receives the normalized intent, visible source possession, typed transform, and authored name and summary. It accepts or rejects only. It cannot rename, repair, retry, or mutate.

Prompt-craft review diagnosed two missing contracts: the author prompt did not state that summary could not substitute for a changed identity, and pure transforms bypassed semantic review. The patch keeps the deterministic compiler and uses the existing reviewer boundary. Humanizer and deslop review kept the instructions concrete, removed no authority rule, and found no ornamental or duplicated prose worth retaining. Verdict: land the narrow author-plus-reviewer contract.

## Validation

- GitNexus impact for Judge `prompt`: `LOW`, one direct caller and two Campaign Play processes.
- GitNexus impact for Game Master `prompt`, `mechanicalAuthorityReviewInput`, and `mechanicalAuthorityReviewPrompt`: `LOW`, one direct caller each and the Game Master `plan` process.
- Focused Judge tests: `33/33` passed.
- Focused Game Master tests: `45/45` passed, including a pure transform that must invoke a second strict semantic review.
- Backend typecheck: passed.
- Source clone hash before the accepted diagnostic: `F6435DC13BBA1DA39FF8EABAD43E1F9C8F4D1E25FE0C47A68F8DCA8F9E16D4DC` for both r18 and `black-rain-passage-action3-stack-transform-review-copy`.
- Live turn `turn-player-action:237c000570c32e96d173cab4fbae6e1ed2ecce2a` completed on Z.AI `glm-5.2`: Judge attempt 1, Game Master proposal plus authority review attempt 1, and Narrator attempt 1 all used strict native objects. No repair, text fallback, provider switch, model switch, or hidden retry occurred.
- Accepted review hash: `8dacc3dc7426fd86638afc18f6d4d9f1c4b6117d0e5957bf618d73e0db99b4a5`.
- Rulebook atomically decremented `Specimen jars` at expected world version 20 and incremented `Specimen jars with sealed corrosion flake` at expected world version 21. Final world version is 22.
- Public packet hash: `f1fceabb19279c012bc80186f4958cf1428c9b8e43038eb98c4a9fe3b2d1578e`.
- Rendered UI showed exactly one transformed jar-set possession at quantity one and no additional newly acquired sample. The same inventory and narration survived reload.
- Accepted diagnostic database SHA-256: `A96AA69A16B08153738A42634B0CD74805BF2EB4A324E2F30B5B80A9AD4F7FA3`.

The diagnostic clone still contains the separate `Sealed corrosion flake sample ×1` created by the earlier bad r18 action. It proves the repaired transition on the same contaminated base, not a pristine campaign. The next formal lane must start from a fresh pre-play world.

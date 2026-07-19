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

## Clean r19 product proof

Run `black-rain-passage-pristine-60-r19` materialized immutable template `black-rain-passage-54df81f3-20260719` at `character_required`, world/runtime version `1/1`, with zero characters and zero turns. Marta Riva was rebuilt through the rendered Character UI as an ordinary outsider, then entered through `Vesper Quay / Outsider / Just arrived / Following a lead`.

Opening Planner and Narrator both accepted GLM 5.2 attempt 1. The planner ran for `440449 ms` and returned `45418` output tokens without repair, fallback, provider switch, model switch, or hidden retry. The opening placed Marta with Pia Servadio at Vesper Quay Beacon Terrace, exposed Pia's independent bracket-scraping work and loose corrosion debris, and did not make Marta the cause or designated solution of the city's pressures.

Player action 1 used the rendered observation choice for fresh bracket scrape-marks. Judge, Game Master, and Narrator accepted attempt 1. The result preserved unknown causation, changed no possession or placement, and advanced one world minute.

Player action 2 was freeform: Marta sealed one already-loose orange corrosion flake from the stone in her specimen jars without touching the bracket or Pia's tool. Judge, Game Master, the independent transform reviewer, and Narrator accepted attempt 1. Rulebook changed `Specimen jars ×1` into `Specimen jars with sealed orange corrosion flake ×1`; no separate sample or remainder possession exists. Review hash is `d18038e5fb088d316b5ac4e394921c2228333a7061dfc2fd9fd437a7889dffd5`. The completed turn is `turn-player-action:d12dba5669d8d9e6dae58dc16d1b34da232000d0`, final world version `17`, public packet hash `03fa713e8b36438cb7f76b1f228354e004c26e7748cafb88223980f3dae76cb5`.

Rendered inventory and narration were byte-identical before and after browser reload. SQLite integrity is `ok`, foreign-key check returns no rows, and all eight Opening/action model stages are accepted strict-object attempt 1 on Z.AI GLM 5.2.

Manual prose verdict is `PASS_WITH_ADVISORY`. The observation preserves evidence limits and the collection beat is readable. The collection summary and narration replace Opening's established `scraper` with newly named `pumice stone and wire brush`; this is a non-mechanical continuity invention. It does not invalidate the possession transition, but it remains a prose-quality finding for later scene-continuity work. r19 is a clean targeted product proof, not a formal sixty-action lane because its evidence bundle and signed-action ledger were not frozen before Opening.

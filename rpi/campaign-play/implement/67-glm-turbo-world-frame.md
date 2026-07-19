# GLM turbo World Frame contract

## Outcome

Campaign World can now build the Lowwater Ledger source with `glm-5-turbo` while preserving strict reference syntax and the player-visible location boundary. The model still authors the world. Code validates the supplied object and does not add prefixes, redact descriptions, repair a failed response, retry, or switch provider or model.

## Reproduced failures

The first turbo World Frame response used bare slugs in eight `locationRef` or `parentLocationRef` fields. Strict validation rejected the response before any world commit because every reference must use the full `location:<lowercase-kebab-case>` form. Text fallback and retry were disabled.

After the reference instruction was made literal, a fresh world completed all three generation stages. Manual Review then found a hard visibility leak in `cable-bridge-span`: its player-facing description copied the saved wildcard's concealed bridge colonization and stated that the Wardens could not meter the light. That world was not accepted.

## Repair

The World Frame prompt now states two previously implicit boundaries.

- Every `locationRef` is a full `location:<lowercase-kebab-case>` identifier. Every non-null parent and route reference repeats one of those full identifiers exactly.
- Campaign source may contain protected truth. Location descriptions cannot copy, paraphrase, confirm, or imply it; they expose only the publicly perceivable surface. Cast goals, relations, and pressures retain ownership of the protected claim.

Prompt-craft review identified missing literal output and source-to-projection rules rather than a schema or parser defect. Humanizer and deslop review kept the instructions mechanical, removed no authority condition, and did not add setting-specific prose. Verdict: land the narrow prompt contract without compatibility handling.

## Product proof

A third campaign shell, `6b85a49e-fef5-4359-95e2-051383f6fb66`, was created through the rendered Campaign Forge from the saved Lowwater Ledger premise and six DNA fields. Research was disabled. World Frame, World Cast, and World Connections each accepted one native-JSON Z.AI Coding Plan `glm-5-turbo` response. No stage used repair, retry, text fallback, provider switch, or model switch.

The accepted world has three macro regions, seven persistent sublocations, sixteen directed routes, eight agent-controlled people, twenty directed relations, and five pressures. Manual Review inspected every location surface. `cable-bridge-south` now contains only salt-crusted cables, wind, brine, height, waves, and the narrow deck. The bridge-colonization discovery remains protected in Yara Nii's goals and relations and in the `Bridge Colonization Secret` pressure.

After acceptance, Campaign Play is at `character_required`, world/runtime version `1/1`, with zero characters and zero turns. SQLite integrity is `ok` and foreign-key check returns no rows. The accepted content hash is `93a09e46b8f5adfc96db1f184c20f0a426ff6428223cb312c427a716bbeeb717`.

Focused Campaign World prompt tests pass `3/3`. The clean template snapshot and formal pristine-60 session are recorded separately after this prompt contract is committed, so their source revision names the exact generation code.

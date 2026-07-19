# Depleted-possession authority playtest

## Outcome

Judge now receives the names of the human player's exact zero-quantity possession stacks as code-owned mechanical facts. A zero stack remains absent from the positive visible inventory and exposes no usable handle, but the model no longer has to infer depletion from omission alone.

The clean support-actor campaign first reproduced a false repair that consumed already depleted wax and leather scraps only in prose. After the correction, a manual freeform attempt to use the same materials was classified as impossible. Game Master did not run, no Rulebook batch existed, the world version did not advance, and reload restored the same refusal.

## Reproduced defect

- Campaign: `cde67b5c-e6da-49b0-86d1-ffc7ec64786d`.
- Player: Nera Voss.
- Depleted stack: `Wax and leather scraps`, quantity `0`, last changed at world version `19`.
- Defect turn: `turn-player-action:b4c09bd573b7508d6ea23101d0ddf016bd69a11c`.
- The accepted Judge method named fresh waxed thread and a leather patch but returned `possessionEffectAuthority: { kind: "none" }`.
- Game Master committed only time and world-event commands. No possession command or receipt existed.
- Narration nevertheless cut a patch "from your scraps", completed the repair, and described Dario counting six copper onto the stair.
- The turn advanced world version `25 -> 26` without material or currency authority.

Screenshot: `output/playtests/campaign-play/diagnostic-clean-cinderwatch-r38/screenshots/repair-without-material-authority.png`, SHA-256 `4BBA3B0F8388F7C9F9C89E2E116B414B821690937DCC0D2438B61E73F1818398`.

## Root cause and correction

The positive visible frame already excluded zero stacks and stated that direct use of a missing consumable is impossible. That made possession handles safe, but it left the model to infer a known depleted resource from its absence among many possible inventory facts. In the reproduced turn, GLM 5.2 ignored that implicit negative fact.

The turn runtime now derives `depletedPlayerPossessions` from persisted Rulebook possession rows belonging to the human player with exact quantity zero. Judge receives that bounded list alongside the positive visible frame. The prompt states that these names are unavailable stacks with no usable handle and that direct use of either a depleted or missing resource is impossible.

This is mechanical evidence, not a prose repair. Code does not decide what the action means, rename an item, invent a replacement material, or coerce a successful proposal. Judge still authors the semantic ruling. A valid impossible ruling follows the existing zero-effect path; an invalid proposal remains a model contract failure.

## Manual negative journey

- Player input: `I take wax and leather scraps from my supplies and patch a fresh tear in my oiled travel cloak.`
- Turn: `turn-player-action:ac9f4d13ebb6d35ac975db3b3851f7ea58db847e`.
- Judge: GLM 5.2, attempt `1`, accepted in `86,889 ms`, strict schema valid.
- Ruling: `impossible`, zero elapsed minutes, no possession authority.
- Grounded reason: no available wax or leather scraps and no established tear in the cloak.
- Game Master stages: `0`.
- Commands, receipts, and causal world events: `0`, `0`, and `0`.
- World version: `26 -> 26`.
- Narrator: GLM 5.2, attempt `1`, accepted in `129,388 ms`, strict schema valid.
- Visible result: the toolkit remains usable, but the wax and leather consumed by Dario's earlier repairs are spent.
- Suggested recovery: ask Dario where to buy fresh materials, investigate another local lead, speak to Lucia, or travel.
- Reload restored the same narration, suggestions, inventory, location, actors, and world version.

Screenshot: `output/playtests/campaign-play/diagnostic-clean-cinderwatch-r38/depleted-repair-refused.png`, SHA-256 `83DDE911E1875B5094A09AB30E28D60363485BCE120E452FE567435FD9DCD771`.

## Validation

- Focused runtime regression spends the last `Repair roll` through Judge, Game Master, Rulebook, command, receipt, and event authority before verifying that the next Judge frame names it as depleted.
- Focused regression: `1 passed`.
- Backend typecheck passed.
- `git diff --check` passed apart from existing line-ending warnings.
- Real UI negative action, terminal narration, screenshot, reload, and SQLite ledger inspection passed.

## Semantic review

`humanizer` and `deslop` review kept the new instruction literal and compact. It adds one code-owned fact block and one exact decision rule. It contains no setting example, canned refusal prose, keyword parser, retry, fallback, model switch, timeout change, compatibility adapter, or backend-authored narration.

The correction applies `pgg:guide:practical-rule-check-decision-interface-and-consequence`: code exposes the deterministic resource fact, Judge authors the semantic ruling, Rulebook remains the only mutation authority, and presentation is checked separately against the accepted result and reload state.

## Limits

This proves one depleted-material boundary in one clean campaign with the configured GLM 5.2 provider. It does not establish universal model compliance, general inventory completeness, player comprehension, narrative quality across settings, or long-horizon reliability. Further resource surfaces should expose exact authority facts rather than relying on prompt-only inference from omission.

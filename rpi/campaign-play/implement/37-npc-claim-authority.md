# NPC claim authority

## Outcome

Keep NPCs free to assert, misremember, speculate, or lie without letting Narrator turn their statements into objective UI facts.

## Reproduced evidence

In the saved Black Rain Passage r04 campaign, Poldo stated that `the shelter ledgers in the undercity, the port logs at Vesper Quay—those are where someone writes down who walked through the door`. The accepted Vesper Quay Tollhouse location description established a passage office, contracts, and ledger-binding, but no port logs or traveler-name register. Narrator then offered `Go to Vesper Quay Tollhouse: where port logs record traveler names`, removing Poldo's attribution and presenting the claim as known destination content.

Evidence: `output/playtests/campaign-play/pristine-60-black-rain-54df81f3-r04-player-history.session/screenshots/player-owned-value-options.png`, turn `turn-player-action:4fd7074f7918b73980585ef1c981f5725483c361`, packet `1c0d01a07a12deb87625aff6434ea2b2265bedd97947e62f521e698266a99b07`.

## Decision

- A claim supported only by NPC speech proves that the NPC made the claim, including when the NPC states it categorically.
- Narrator preserves attribution or presents an investigative action until another packet source independently corroborates the claim.
- NPC dialogue remains fallible world content. Game Master is not forbidden from producing categorical statements, and code does not decide whether an NPC is truthful.
- This changes model instructions only. It adds no lexical validator, backend rewrite, retry, repair, fallback, provider switch, compatibility path, or timeout.

## Validation

- `npm --prefix backend test -- src/campaign-play/narrator.test.ts`: 15/15 passed.
- `npm --prefix backend run typecheck`: passed.
- Saved r04 real-UI pass at world minute 6: Elena asked whether Poldo knew the Vesper Quay claim firsthand. Poldo explicitly identified it as secondhand and separated it from the requisition facts in front of him. Narrator kept one coherent beat, preserved that distinction, and offered `ask who confirmed the Quay keeps arrival logs` plus `the Quay tollhouse to verify firsthand`; it did not restate the port-log claim as objective destination content.
- Product evidence: `output/playtests/campaign-play/pristine-60-black-rain-54df81f3-r04-player-history.session/screenshots/npc-claim-attribution.png`, turn `turn-player-action:badee38226092ec0c72091fe7c005877ae7a7a3f`, packet `d6154fb9d7d237eeac0132b788eaa4f2817e3556845bb2e59d08c1ad49894469`, final world version 19.
- Product verdict: passed for categorical NPC-claim attribution. The prose remained readable and scene-bound, the four choices were legible and actionable, and no hidden fact or distant event appeared on the player surface.
- `prompt-craft`: the rule is one general source-authority boundary rather than a list of forbidden phrases.
- `humanizer`: no rewrite required; the instruction uses direct concrete language and keeps NPC fallibility explicit.
- `deslop`: accepted; no decorative framing, fake quotation, recap, or rhetorical contrast was added.
- Main-agent semantic verdict: the contract limits Narrator certainty without moving truth judgment into code or making NPC dialogue mechanically authoritative.

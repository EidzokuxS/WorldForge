# World-centered opportunity authority

## Outcome

Let players pursue ordinary motives without making the world tailor its central pressure, the player's profession, or visible choices around them.

## Reproduced evidence

The Black Rain r06 control used the same accepted world as the earlier family-search campaign but replaced that motivation with Tomas Venn, an itinerant mender of umbrellas and rain capes seeking ordinary repair income and a dry room. The CharacterRecord explicitly excluded notable contacts, secret history, prophecy, missing relatives, and prior connection to the setting's mysteries.

Opening immediately asked Tomas to repair a metal beacon housing so the central lighthouse would keep burning. After Tomas refused because he repaired cloth rather than beacon fittings, Pia accepted the refusal. Travel to the suggested tollhouse displaced his ordinary-work purpose with charred red-marked contracts and glass vaults. After a plausible failed attempt to find a paying cloth-repair client, Narrator returned `Pia's paid metalwork repair offer`, Game Master changed a generic approach into `metalwork mending`, and all four visible suggestions collapsed back into beacon or ledger pressure.

The same one-hour peripheral wait advanced Renzo Malfatti, Lucia Cordeglio, and Pia Servadio from their own plans without exposing their distant actions to Tomas. This separates the defect from world simulation: actor autonomy worked, while opening and visible opportunity selection centered world content on the player.

Evidence: `output/playtests/campaign-play/mundane-motivation-black-rain-r06.session/human-notes.md` and its five retained screenshots. Campaign `711f8e77-36e0-4c4c-b36f-19a5a4fa3952`, accepted content hash `54df81f36c0f88bed68aff192b5c635e43f749a3bf97e346aafd990a2f397656`.

## Decision

- Opening treats motivation as player decision pressure, not world-authoring authority.
- An NPC need must follow independently from supplied profile, active goal, placement, and first plan step. Player similarity cannot invent the need or choose the pressure merely for thematic fit.
- Literal trades, tools, materials, and exclusions remain narrow. A tool roll does not make a cloth mender a metalworker.
- Game Master resolves only the admitted method and scope. Generic approach, observation, or waiting cannot add a transaction, profession, repair method, promise, or commitment from earlier prose.
- Narrator prioritizes the player's supported chosen direction rather than central stakes. Explicit refusal resolves an offer until a later accepted change materially renews it.
- Refusal authority survives later turns as bounded typed `playerHistory` projected from completed admissions and accepted Judge results; it is not inferred from prose or stored as model-written memory.
- This changes the existing Narrator packet projection and model instructions only. It adds no persistence store, backend writer, lexical validator, retry, repair, fallback, provider switch, compatibility path, or timeout.

## Validation

- Focused Opening Planner, Game Master, Narrator, contracts, persistence, and turn-runtime checks passed. Backend typecheck and shared build passed. The broader eight-file run passed 214 of 215 checks; the unchanged `renders a visible actor acquisition from its persisted summary` visibility fixture failed before reaching projection and failed again alone. The changed two-turn player-history path passed in `turn-runtime.test.ts`; the unrelated actor-possession fixture was not repaired in this task.
- R07 proved the prompt-only rule insufficient: the next turn no longer carried the prior refusal and Narrator resurrected `Gravelle's lamplighter piecework lead`. This changed the route from another prompt clause to typed packet evidence.
- `CampaignPlayNarratorPacket.playerHistory` now carries up to the existing continuity bound of completed prior player actions in chronological order. Visibility reconstructs each entry from the durable frozen admission and accepted Judge artifact. It adds no persistence store and no model-authored summary.
- R08 used a new clean-start clone of the same accepted Black Rain world and the accepted Tomas Venn record. Through the real UI, opening plus two completed player actions preserved the exact craft, accepted an institutional refusal, retained the refusal in the next Narrator packet, and did not return the rejected undercity-work lead in any visible suggestion.
- Product evidence: `output/playtests/campaign-play/mundane-motivation-black-rain-r08.session/human-notes.md` and its three retained screenshots. Campaign `ca6e8859-0d2e-4d84-90d9-c3192fc7e020`.
- `prompt-craft`: the stage clauses assign one authority boundary to each existing stage. The later `playerHistory` clause names its code-owned source, chronological order, closed-thread rule, and only two renewal conditions without adding an agent, reviewer, or model-memory process.
- `humanizer`: no rewrite required; the instructions use concrete player actions and consequences rather than abstract alignment language.
- `deslop`: accepted; the prompt text contains no decorative framing, fake quotation, recap, or rhetorical filler.
- Main-agent semantic verdict: the rules preserve earned intersections when world evidence supports them while removing motivation-authored world needs and automatic central-stakes priority.

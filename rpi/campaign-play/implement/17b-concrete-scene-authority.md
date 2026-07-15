# Task 17B: concrete scene authority

Status: complete; implementation, focused verification, fresh-world generation, and the manual two-establishment diagnostic passed.

## Provenance and failure evidence

The required outcome comes from the living-world playtest criterion: the player may perceive only the exact scene they occupy unless an executable exposure channel reveals something elsewhere. In pristine campaign `600bb10e-5497-4eba-949f-7a289ae2227e`, the player stood inside the ferry office while an event in the tally house appeared as direct perception and as an actionable suggestion. The accepted world used one macro location as both a region and the player's physical location, so sibling establishments had no mechanical boundary.

The frozen repair contract is:

- exactly three macro regions and six or seven persistent sublocations, with at least two direct scenes per macro;
- macro regions remain public opening choices, but never become route endpoints, placements, pressure anchors, current locations, or perception anchors;
- persistent sublocations are the only occupiable scenes and form one strongly connected directed route graph;
- opening stores the chosen macro separately, resolves one exact child scene, and bootstraps the player into that scene;
- old macro-occupied worlds become ineligible; no compatibility or fallback path is added.

## Architecture delta

Campaign World remains the spatial truth owner. Its frame, cast, connection contracts, prompts, and final validator now enforce the concrete-scene topology. Campaign Play projects eligibility and opening candidates from exact scenes, while the Rulebook rejects macro bootstrap and movement endpoints. Visibility continues to compare exact location IDs; it now receives scene IDs rather than overloaded region IDs.

The displaced path was macro-as-location routing and ancestor-based opening presence. Macro regions now group and select scenes only. The canonical architecture record is updated in `rpi/campaign-play/research/selected-architecture.md`.

GitNexus impact was LOW for the changed Campaign World and Campaign Play symbols. Direct opening compilation and test dependents were included in the focused verification. No HIGH or CRITICAL impact was accepted.

## Verification

- Campaign World restored contract coverage: 70 tests passed across `contracts.test.ts`, `world-prompts.test.ts`, and `world-validator.test.ts`.
- Campaign World and opening focused verification previously passed 71 tests across frame contracts, validation, eligibility, opening options, and opening planning.
- Rulebook verification passed 25 tests; opening runtime passed 13 tests; actor scheduling passed its concrete-route regression.
- Exact-scene visibility regression proves that direct perception and local aftermath from a sibling establishment remain hidden while the player stays in the current scene.
- Targeted stale-fixture repairs passed six affected state, Game Master, turn-runtime, and mounted-route scenarios. The compound travel scenario reaches `North Harbor Docks`, not the sibling archive.
- Backend and frontend typechecks pass. `CampaignPlayStage.test.tsx` passes 4/4.
- `git diff --check` is clean apart from line-ending notices.

No production UI surface changed, so comparison against `docs/UI Concept.html` is not applicable to this slice.

## Prompt and copy review

Humanizer verdict: the changed world and opening prompts use direct domain language, distinguish region selection from physical presence, and avoid ornamental or conversational filler.

Deslop verdict: no canned framing, fake quotations, generic hype, repetitive conclusion, or vague abstraction remains. Repetition of `persistent sublocation` is intentional contract terminology needed to constrain structured generation.

## Fresh-world evidence

`Rainmarket Ledger` was generated once through the rendered Forge UI with Z.AI Coding Plan `glm-5.2`, research disabled, and no provider switch, model timeout, retry, repair, or text fallback. Campaign `87acda0d-755a-4dbf-adc5-d943ac2f4aac` accepted World version `1` with content hash `4b2b5bf438a6bedbf2cd5fd328a509df0e10800961ce0002594381c594214067`.

The accepted topology contains three macro regions, seven persistent sublocations, and seventeen directed concrete routes. Each macro owns at least two scenes, every route endpoint is a persistent sublocation, and the concrete graph is strongly connected. Actor cards use exact-scene placements and all five opening-relevant pressures carry exact scene anchors.

Before character bootstrap, clean-start clone `509db3a1-49e3-494b-9128-a89e315ab0e9` was created from the accepted source. The clone operation rewrote eleven source tables, purged five play-state tables, retained the accepted source digest and content hash, and left the child at the zero-turn `character_required` boundary. The source world was generated once; the clone remains the reusable pristine boundary for later lanes.

## Signed manual diagnostic

Tamsin Reed was created through the rendered character flow as an itinerant umbrella, oilskin, and canvas repairer with no local contacts, official access, or protected knowledge. The player selected the `siltmarket` macro. Opening resolved and persisted `silt-market-arcades`, showed only Bril Hatcher and Magda Renne, and exposed only the two concrete routes leaving that scene.

Five actions were chosen from player-visible information and signed before submission:

1. Tamsin inspected three damp ration-chit stamps without touching them. The result described only ink, cut edges, overlapping strikes, and water damage, and explicitly withheld the issuing authority.
2. Tamsin asked Bril for the public route to the ferry office and for ordinary repair work. Bril knew the route, did not claim knowledge of current work inside the office, and offered a torn market awning instead of disclosing protected plot state.
3. Tamsin followed the visible one-unit route to `silt-ferry-office`. Rulebook applied one `move_actor` receipt and advanced world time from minute 6 to minute 7. The public current place changed to the ferry office; Bril and Magda disappeared from presence, Aldo Suttmer appeared, and the route list changed to the ferry office's two concrete exits.
4. Tamsin inspected only the public side of the ferry office. She found a split canvas seam and cracked oilskin without reading dispatch papers, private messages, or the lime-wash network's meaning.
5. Tamsin waited twenty minutes. World time reached minute 30. A wet chalk trace created by local actor work became direct perception in the ferry office, while actor work in the market arcades and Water Clerk's Office remained absent from her observations and narration.

All five player actions and Opening reached terminal results. Every Judge, Game Master, Narrator, Opening planner, and actor-replanner model stage used `glm-5.2` and accepted attempt one. Opening produced one exact local actor consequence and one remote protected consequence before narration. The five actions produced five world-time receipts, one exact movement receipt, scene-event receipts, causal events, runtime revisions, sanitized turn events, and observations anchored to the occupied scene.

At minute 30, Aldo, Bril, and Magda had settled autonomous jobs. Petr Vorkel's earlier patrol preparation remained local aftermath in `water-clerk-office`. Five other due actors were deferred by the bounded scheduler and gained agency debt rather than being dropped. Their persisted plans and next wake times remained intact. No market-arcade or Water Clerk observation entered Tamsin's ferry-office packet.

## Human verdict

Task 17B is a live `PASS`. The player occupied one exact establishment, travelled through one accepted concrete route, and received only exact-scene perception before and after movement. The run did not encounter a macro current location, sibling-scene direct-perception leak, sibling local-aftermath leak, prose-only relocation, recovery requirement, or reload divergence.

The prose was readable, causal, and knowledge-bounded. Bril's response was the strongest beat: it connected repair work, spoiled eel, and water scarcity without turning the player into the center of the dispute. Material inspection also produced useful craft-specific detail while preserving uncertainty. Later handoff lines repeated the dispatch bell and the absence of a gap at the counter; this remains a composition advisory rather than a spatial or causal failure.

Other non-blocking findings are recorded for the next appropriate scope: the generated Cultural Flavor DNA card was a reference list rather than a world law; character inventory duplicated into signature items; one post-conversation suggestion omitted the ferry-office route even though the route remained available in the scene panel and freeform input; player-facing scene labels remain slugs; and all five pressure clocks were still at zero after thirty minutes despite autonomous preparatory events. The Task 18 long lanes must prove that pressure state eventually advances rather than merely accumulating scene traces.

Humanizer review kept the note concrete and separated the passing spatial contract from prose and progression advisories. Deslop review found no canned framing, generic hype, fake quotation, or repetitive conclusion; repeated scene names are evidence-bearing contract terms.

# Task 17B: concrete scene authority

Status: implemented and locally verified; fresh GLM 5.2 world and manual two-establishment diagnostic remain.

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

## Remaining live evidence

Generate one fresh accepted world with GLM 5.2 under the new contract, preserve a clean snapshot before character bootstrap, and manually play a signed sequence that crosses between two establishments in one macro region. Freeze the lane immediately if a sibling-scene fact appears through direct perception or local aftermath before movement or another valid exposure channel.

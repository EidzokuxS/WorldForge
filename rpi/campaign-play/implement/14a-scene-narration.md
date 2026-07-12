# Campaign Play Task 14A: Scene and Narration

Date: 2026-07-12

## Result

`/campaign/[id]/play` now renders the mechanics-owned campaign projection as a full-screen play surface. A campaign awaiting its opening offers grounded location, role, arrival, and situation choices or delegates the decision to the world. A ready campaign presents the player identity, current location, visible actors, routes, pressures, progressive narration beats, and bounded stage effects.

Task 14B retains ownership of suggested actions, freeform admission polish, consequences, Journal, interruption, and recovery interaction.

## Public field inventory

The surface reads `CampaignPlayState` through `frontend/lib/campaign-play-api.ts`. Task 14A renders these public fields:

- `character.name` and `character.descriptor`
- opening option location name and description plus role, arrival, and situation labels
- `currentLocation.name` and `currentLocation.description`
- visible actor name, monogram, descriptor, and accent
- visible route destination name, travel-time label, and state
- visible pressure label and summary
- narration beat text and approved effect kind

Phase selects the approved surface. Opaque handles drive selection and state transitions. Narration and beat IDs provide artifact and effect identity. These control fields stay out of player-rendered text together with world/runtime revisions, projection hashes, provider/model data, hidden actor state, raw reasoning, event counts, and debug payloads.

## Real campaign proof

Two persisted campaigns exercised the mounted backend and frontend:

- ready campaign: `4f52a9b9-3f7e-4f17-8c5e-6934b72bd731`
- opening-required campaign: `c12683d6-c817-4c3c-9bc2-6b2a3e40f172`

Playwright drove Microsoft Edge at 1440x900 and 390x844. Both routes returned HTTP 200. Console warnings/errors, failed requests, responses at or above 400, and player-visible private tokens were all empty. Both opening captures select North Harbor, expose all three selectors, and prove an enabled Begin action. Reduced-motion emulation exposed the complete narration without animation, disabled automatic beat progression, and translated the artifact's public `flash` effect into a static gold inset border.

A settled reload correctly suppresses its effect. The reduced-motion capture activates the already loaded narration's actual public `flash` presentation state in the browser; component tests separately prove that accepted artifacts activate effects only when their bound beat appears, including consecutive effects of the same kind.

The ready fixture intentionally retains the deterministic Task 11 narration sentence. Narrative-quality evaluation belongs to the real multi-turn playtests in Tasks 17 through 19; this task verifies faithful presentation of the committed public artifact.

## Visual evidence

- `evidence/task14a/opening-required-desktop.png` (1440x900), SHA-256 `8C5CA434BFF4C522AF9E3B1CDC15031FDF0B9D7321FBE17E38DA2905B2CCD59F`
- `evidence/task14a/opening-required-narrow.png` (390x844), SHA-256 `861AAF5CB30647C9CEF81BE84039A1F4C77851261081CFA3C7A8DC610609713E`
- `evidence/task14a/ready-scene-desktop.png` (1440x900), SHA-256 `AB081ABACF0B4291ABF07CCE79205AEEB84F79676AB271139EC0F75FB522A5E0`
- `evidence/task14a/ready-scene-narrow.png` (390x844), SHA-256 `B9E4D97BAE43507F00F2D1420DE13178344EAEC86C41E825F1DAA7F51DEEB137`
- `evidence/task14a/reduced-motion.png` (1440x900), SHA-256 `E9FB1712B4A5AB9ADEA705C02D14446864B3B1B1E8290820F3DF2B38FD1BF61A`

Each file has a valid PNG signature. The scene follows `docs/UI Concept.html`: restrained black/ember atmosphere, serif display hierarchy, mono state labels, bordered cards, and world-first composition. No dynamic illustration was invented for data the public projection does not own.

## Verification

- focused Task 14A tests: 5 files, 29 tests passed
- full frontend regression: 70 files, 525 tests passed
- frontend typecheck: passed
- targeted ESLint for every Task 14A TypeScript file: passed
- root build for shared, frontend, and backend: passed on retry
- `git diff --check`: passed
- humanizer/deslop semantic pass: direct product copy retained; no synthetic metaphor, inflated claim, rhetorical filler, or dash-heavy construction found
- standalone smoke tests added: 0

The repository-wide ESLint command still reports the pre-existing `react-hooks/set-state-in-effect` error at `frontend/app/(non-game)/campaign/[id]/forge/page.tsx:105` plus three existing warnings. Task 14A introduces no lint finding. The first build attempt lost the Google Fonts connection; the immediate retry completed all three packages.

## Review

Three independent Sol gates passed after their findings were corrected:

- Krypton POST: `ALIGNED`, P0/P1/P2 `0/0/0`
- correctness and scene surface: `PASS`, P0/P1/P2 `0/0/0`
- maintainability: `MAINTAINABLE`, P0/P1 `0/0`; opening presentation extraction remains scheduled at the start of Task 14B

Review fixes removed internal cursor and phase attributes, bound every effect to its accepted artifact and beat, covered simultaneous and same-kind effects, made reduced-motion hydration deterministic, narrowed live announcements to the current beat, replaced positional responsive targeting, and recaptured the chosen opening plus static reduced-motion state.

# Task 9 — Active-path cutover

## Outcome

Campaign World is now the sole mounted post-creation world builder and World DNA writer.

- `/api/worldgen` retains intake-only operations: random and model-assisted DNA drafts, research, reusable worldbooks, parsing, and campaign import.
- `/api/worldgen/generate`, `/api/worldgen/regenerate-section`, and `/api/worldgen/save-edits` have no handler and return `404`.
- Campaign Kernel retains its read/debug/player/cast/graph/setup/opening/chat/state donor surface.
- Campaign Kernel DNA apply, full suggestion, and category suggestion handlers have no route and return `404`.
- Forge and Review call Campaign World source, build, state, event, and acceptance APIs exclusively.

## Removed production surface

- Frontend `generateWorld`, `regenerateSection`, and `saveWorldEdits` helpers.
- Frontend `EditableScaffold` and `RegenerateSectionRequest` write DTOs.
- Campaign Kernel `applyWorldDna`, `suggestCampaignWorldDna`, and `suggestCampaignWorldDnaCategory` helpers and response DTOs.
- The final Review scaffold adapter `world-data-helpers.ts` and its displaced test suite.
- Exclusive writer imports, normalization helpers, generation stream code, and lore rewrite code from the mounted worldgen route.

`ScaffoldNpc` remains because current character ingestion adapters consume it. Intake worldgen source remains available as donor code and has no import path into Campaign World production files.

## Caller proof

Fixed-string searches returned zero active Forge/Review references to:

- `generateWorld`
- `regenerateSection`
- `saveWorldEdits`
- `generationComplete`
- `/api/kernel`

They also returned zero production frontend references to the three displaced Campaign Kernel DNA functions, `EditableScaffold`, `RegenerateSectionRequest`, or `world-data-helpers`.

`saveWorldSeeds` has one mounted post-creation caller: `campaign-world/world-source.ts`. Other matches are its campaign manager definition/export and Campaign World tests. Campaign World production files contain no `../worldgen` import.

## Verification

- Worldgen intake and displaced-route contract: 13 tests passed, including explicit `404` checks for all three removed worldgen writers.
- Campaign Kernel route contract: 16 tests passed, including explicit `404` checks for all three removed DNA writers.
- Campaign Kernel frontend client: 5 tests passed.
- Backend typecheck passed.
- Frontend typecheck passed.
- `git diff --check` passed; Git reported only repository line-ending notices.

The worldgen route test was reduced from a mixed intake/writer suite to intake contracts plus cutover assertions. No standalone smoke suite was added.

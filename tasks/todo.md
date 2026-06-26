# WorldForge Active Tasks

## Current Focus: Mechanics Revamp A7

Goal:
- Build the early Campaign Kernel substrate through the first playable setup. A3 maps saved campaign data into `world_ready` DNA, A4 maps current location data into graph nodes and spatial edges, A5a maps cast inputs, A5b saves the player cast into `kernel.json`, A6 adds character nodes with placement edges, and A7 persists starting setup.

Source:
- `rpi/revamp/REQUEST.md`
- `rpi/revamp/REVAMP_ARCHITECTURE.md`
- `rpi/revamp/research/COVERAGE-MAP.md`
- `rpi/revamp/implement/a3-dna.md`
- `rpi/revamp/implement/a4-locations.md`
- `rpi/revamp/implement/a5-cast.md`
- `rpi/revamp/implement/a5b-character.md`
- `rpi/revamp/implement/a6-graph.md`
- `rpi/revamp/implement/a7-setup.md`

Plan:
- [x] Lock A0 revamp architecture contract.
- [x] A1 define Campaign Kernel contract and phase model.
- [x] A2 route `Create Campaign` into a revamp campaign shell.
- [x] Prove A2 with a focused playtest: create campaign -> revamp shell -> visible draft kernel -> old full worldgen path stays outside this route.
- [x] A3 map current saved seeds and research artifact to the revamp DNA contract.
- [x] A3 implement a pure saved-seeds DNA adapter and kernel phase transition.
- [x] A3 prove draft -> world_ready without calling old full worldgen.
- [x] A4 map current `ScaffoldLocation[]` shape to revamp `RevampWorldGraph`.
- [x] A4 implement a pure locations adapter without old generator imports.
- [x] A4 prove nodes, route edges, parent edges, and fail-closed invalid references.
- [x] A5a split Cast Registry adapter from revamp import/create character wiring.
- [x] A5a implement pure cast registry mapping without route/generator imports.
- [x] A5a prove player, imported NPC, generated NPC, role/importance defaults, placement notes, and fail-closed duplicate/empty names.
- [x] A5b add a revamp API boundary under `/api/revamp`.
- [x] A5b persist player cast to `kernel.json` without writing the old `players` table.
- [x] A5b render a small revamp player cast panel on `/campaign/:id/revamp`.
- [x] A5b prove revamp player parse/save uses revamp helpers and stays off old frontend character helpers.
- [x] A6 implement pure WorldGraph composition from base graph plus cast registry.
- [x] A6 prove character nodes, placement edges, ordering, and fail-closed missing/collision cases.
- [x] A6b persist composed graph into `kernel.json` through the revamp API boundary.
- [x] A7 implement deterministic starting setup from composed graph and cast registry.
- [x] A7 persist `startingSetup`, advance to `setup_ready`, and expose `/api/revamp/campaigns/:id/setup/start`.
- [x] A7 prove anchor scene selection, present/nearby cast, user-guided setup, and fail-closed ambiguous/missing setup cases.

6+1 Lanes:
- L1 Source Lock: keep attachment architecture, `REQUEST.md`, and coverage map as source hierarchy.
- L2 Current-State Map: identify the revamp create-campaign data, current location input shape, character draft/scaffold NPC input shape, player cast API seam, cast-to-graph placement contract, and setup anchor contract.
- L3 Reference Extraction: use old DNA seed and location shapes only as reference.
- L4 Kernel Protocol: write A3 and A5b kernel state to campaign `kernel.json`; keep A4/A5a/A6 as pure graph/cast outputs.
- L5 Proof Harness: prove draft -> world_ready, location graph adaptation, cast registry adaptation, revamp player cast persistence, graph composition, and setup persistence.
- L6 Risk Cleanup: inspect stale worldgen ownership assumptions without widening A3/A4/A5a/A5b/A6/A7.
- +1 Integrator: choose the smallest vertical slice and reject scope creep.

Review:
- A0 created `rpi/revamp/REVAMP_ARCHITECTURE.md` from the supplied architecture.
- Droid GLM-5.2 Coding Plan reviewed A2 UI shell and returned: `Plan is up-to-date.`
- A1 added the typed Campaign Kernel draft contract in `shared`.
- A2 sends `Create Campaign` to `/campaign/:id/revamp`, loads a draft kernel shell, and keeps the old full worldgen call outside this route.
- Proof: `npm --prefix shared run build`; backend focused vitest `84 passed`; full backend vitest `3417 passed`; frontend focused vitest `33 passed`; full frontend vitest `536 passed`; `npm --prefix frontend run typecheck`; `npm --prefix backend run typecheck`.
- Cleanup: removed old campaign-new full-worldgen progress UI/state from the revamp entrypoint path.
- Cleanup: removed the unused frontend `generateWorld` API helper, its progress/result types, and the tests that kept the old generator hook visible.
- Cleanup: replaced stale `.planning` Phase 73/74 test dependencies with source-level structured-output contract checks.
- Project rule added: prompts, model instructions, visible copy, and substantial prose go through GLM review with `humanizer` and `deslop`.
- Latest focused proof after frontend generator API cleanup: `vitest lib/__tests__/api.test.ts components/title/__tests__/use-new-campaign-wizard.test.tsx` -> `66 passed`.
- GitNexus final scope: HIGH due campaign-new entrypoint flow changes; reviewed as expected for A2. Live source search confirms old frontend `generateWorld` symbols and progress markers are gone.
- A3 started with a 6+1 canvas. Scope is DNA mapping, kernel phase transition, persistence, and proof only.
- GLM-5.2 reviewed the A3 planning text and returned `Revise (light revise)`. Required fixes applied: L1-L6 lane names, explicit `kernel.json` persistence, explicit seed-to-DNA mapping, and clearer research-artifact wording.
- A3 added `backend/src/revamp/dna-adapter.ts` and `backend/src/revamp/index.ts`.
- A3 proof: focused vitest `src/revamp/__tests__/dna-adapter.test.ts` -> `5 passed`; `npm --prefix backend run typecheck` passed.
- A3 static checks: no frontend old-generator markers; A3 revamp module does not import old worldgen route, scaffold generator, or `generateWorld`. GitNexus `detect_changes` remains HIGH from A2 campaign-new flow and does not list untracked A3 files before indexing.
- A4 added `backend/src/revamp/locations-adapter.ts` and focused tests.
- GLM-5.2 reviewed the A4 planning text and returned `Revise`. Required fixes applied: explicit `description`/`tags`/`isStarting` mapping, deterministic ID scheme, directed route semantics, type-only worldgen import boundary, and `located_at` containment note.
- A4 proof: revamp focused vitest `src/revamp/__tests__/dna-adapter.test.ts src/revamp/__tests__/locations-adapter.test.ts` -> `10 passed`; `npm --prefix backend run typecheck` passed.
- A5 architecture split: `A5a Cast Registry adapter`; `A5b Revamp import/create character wiring`.
- A5a added `backend/src/revamp/cast-registry-adapter.ts` and focused tests.
- GLM-5.2 reviewed the A5a planning text and returned `Revise`. Required fixes applied: explicit A5a/A5b split, source tags stay caller-owned, `reconcileDraftBackedScaffoldNpc` vs `fromLegacyScaffoldNpc` branches, stable cast ID scheme, role/importance default rules, and `sceneLocationName` placement preservation.
- A5a proof: revamp focused vitest `src/revamp/__tests__/dna-adapter.test.ts src/revamp/__tests__/locations-adapter.test.ts src/revamp/__tests__/cast-registry-adapter.test.ts` -> `16 passed`; `npm --prefix backend run typecheck` passed.
- Cleanup: shortened revamp implementation doc filenames to `a3-dna.md`, `a4-locations.md`, `a5-cast.md`, `a5b-character.md`, and matching `*-glm.md` files.
- GLM-5.2 reviewed the A5b UX plan and returned `Plan is up-to-date.`
- A5b added `backend/src/revamp/cast-kernel.ts`, `backend/src/routes/revamp.ts`, `frontend/lib/revamp-api.ts`, and a player cast panel on the revamp page.
- GLM-5.2 reviewed A5b visible copy with humanizer/deslop rules and returned `Revise`; 3 replacement strings were applied.
- A5b backend proof: revamp focused vitest `src/revamp/__tests__/dna-adapter.test.ts src/revamp/__tests__/locations-adapter.test.ts src/revamp/__tests__/cast-registry-adapter.test.ts src/revamp/__tests__/cast-kernel.test.ts src/routes/__tests__/revamp.test.ts` -> `26 passed`; `npm --prefix backend run typecheck` passed.
- A5b frontend proof: focused vitest `app/(non-game)/campaign/[id]/revamp/__tests__/page.test.tsx lib/__tests__/revamp-api.test.ts` -> `6 passed`; `npm --prefix frontend run typecheck` passed.
- A5b static check: revamp page and `frontend/lib/revamp-api.ts` do not import old frontend `parseCharacter`, `generateCharacter`, `researchCharacter`, `importV2Card`, `saveCharacter`, or `/api/worldgen`.
- GLM-5.2 reviewed the A6 plan and returned `Revise`. Required fixes applied: character node id scheme, placement edge id scheme, shared `located_at` semantics, placement id rule, and stable emit order.
- A6 added `backend/src/revamp/world-graph-builder.ts` and focused tests.
- A6 proof: revamp focused vitest `src/revamp/__tests__/dna-adapter.test.ts src/revamp/__tests__/locations-adapter.test.ts src/revamp/__tests__/cast-registry-adapter.test.ts src/revamp/__tests__/cast-kernel.test.ts src/revamp/__tests__/world-graph-builder.test.ts src/routes/__tests__/revamp.test.ts` -> `32 passed`; `npm --prefix backend run typecheck` passed.
- A6 static check: production `world-graph-builder.ts` has no old worldgen or character route imports.
- A6b added `backend/src/revamp/graph-kernel.ts` and `POST /api/revamp/campaigns/:id/graph/compose`.
- A6b proof: revamp focused vitest `src/revamp/__tests__/dna-adapter.test.ts src/revamp/__tests__/locations-adapter.test.ts src/revamp/__tests__/cast-registry-adapter.test.ts src/revamp/__tests__/cast-kernel.test.ts src/revamp/__tests__/world-graph-builder.test.ts src/revamp/__tests__/graph-kernel.test.ts src/routes/__tests__/revamp.test.ts` -> `37 passed`; `npm --prefix backend run typecheck` passed.
- GitNexus final scope remains `HIGH` from the A2 create-campaign/wizard route changes; new A3-A6b revamp files remain outside the index until `npx gitnexus analyze` runs.
- A7 added `backend/src/revamp/starting-setup.ts`, `backend/src/revamp/setup-kernel.ts`, and `POST /api/revamp/campaigns/:id/setup/start`.
- GLM-5.2 reviewed the A7 setup plan and returned `Revise`. Required fixes applied: stable `presentCastIds`/`nearbyCastIds` graph-node ordering and a fail-closed non-location placement target case.
- A7 proof: revamp focused vitest `src/revamp/__tests__/dna-adapter.test.ts src/revamp/__tests__/locations-adapter.test.ts src/revamp/__tests__/cast-registry-adapter.test.ts src/revamp/__tests__/cast-kernel.test.ts src/revamp/__tests__/world-graph-builder.test.ts src/revamp/__tests__/graph-kernel.test.ts src/revamp/__tests__/starting-setup.test.ts src/revamp/__tests__/setup-kernel.test.ts src/routes/__tests__/revamp.test.ts` -> `50 passed`; `npm --prefix backend run typecheck` passed.

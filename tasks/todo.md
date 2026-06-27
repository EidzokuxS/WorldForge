# WorldForge Active Tasks

## Current Focus: Mechanics Revamp A11

Goal:
- Build the early Campaign Kernel substrate through the first StateWriter mutation. A3 maps saved campaign data into `world_ready` DNA, A4 maps current location data into graph nodes and spatial edges, A5a maps cast inputs, A5b saves the player cast into `kernel.json`, A6 adds character nodes with placement edges, A7 persists starting setup, A8 persists the opening assistant turn, A9 persists the first user plus assistant turn pair, A10 exposes a debug snapshot for playtest inspection, and A11 applies route movement from pending soft hints.

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
- `rpi/revamp/implement/a8-opening.md`
- `rpi/revamp/implement/a9-chat.md`
- `rpi/revamp/implement/a10-debug.md`
- `rpi/revamp/implement/a11-state.md`

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
- [x] A8 implement deterministic opening result from setup, active scene, present cast, and routes.
- [x] A8 persist the opening as the first assistant turn, advance to `active`, and expose `/api/revamp/campaigns/:id/opening`.
- [x] A8 prove suggested actions, first assistant turn persistence, active phase, and fail-closed invalid opening cases.
- [x] A9 implement deterministic chat response from active kernel context and one user message.
- [x] A9 persist the user turn plus assistant turn and expose `/api/revamp/campaigns/:id/chat/message`.
- [x] A9 prove intent classification, turn persistence, route boundary, typechecks, and old chat/worldgen/provider exclusion.
- [x] A10 persist pending soft state hints for the last GM response.
- [x] A10 expose backend debug snapshot through `/api/revamp/campaigns/:id/debug`.
- [x] A10 prove draft/active snapshots, pending hints, recent turns, route boundary, typechecks, and old chat/worldgen/provider exclusion.
- [x] A11 add `runtimeState.currentSceneId` to the Campaign Kernel.
- [x] A11 apply `route_intent` as a `MoveCharacter` state change.
- [x] A11 expose `/api/revamp/campaigns/:id/state/apply`.
- [x] A11 prove player `located_at` movement, runtime current scene update, pending hint clearing, route boundary, typechecks, and old chat/worldgen/provider exclusion.

6+1 Lanes:
- L1 Source Lock: keep attachment architecture, `REQUEST.md`, and coverage map as source hierarchy.
- L2 Current-State Map: identify the revamp create-campaign data, current location input shape, character draft/scaffold NPC input shape, player cast API seam, cast-to-graph placement contract, setup anchor contract, opening turn contract, first chat turn contract, debug snapshot contract, and route movement contract.
- L3 Reference Extraction: use old DNA seed and location shapes only as reference.
- L4 Kernel Protocol: write A3 and A5b kernel state to campaign `kernel.json`; keep A4/A5a/A6 as pure graph/cast outputs.
- L5 Proof Harness: prove draft -> world_ready, location graph adaptation, cast registry adaptation, revamp player cast persistence, graph composition, setup persistence, opening persistence, chat turn persistence, debug snapshot output, and first StateWriter movement.
- L6 Risk Cleanup: inspect stale worldgen ownership assumptions without widening A3/A4/A5a/A5b/A6/A7/A8/A9/A10/A11.
- +1 Integrator: choose the smallest vertical slice and reject scope creep.

Review:
- A0 created `rpi/revamp/REVAMP_ARCHITECTURE.md` from the supplied architecture.
- Droid GLM-5.2 Coding Plan reviewed A2 UI shell and returned: `Plan is up-to-date.`
- A1 added the typed Campaign Kernel draft contract in `shared`.
- A2 sends `Create Campaign` to `/campaign/:id/revamp`, loads a draft kernel shell, and keeps the old full worldgen call outside this route.
- A2 manual in-app browser proof on 2026-06-27: ran `npm run dev:playtest`, opened `http://localhost:3000`, clicked the main `New campaign` entry, filled `Campaign Name` and `Premise`, clicked `Create Campaign`, and landed on `/campaign/15a389b0-4baa-42e5-ac3f-e268fb7f685d/revamp`.
- A2 observed revamp shell proof: nav showed `Revamp Smoke Company` as `Campaign draft`; main showed `WorldForge Revamp`, phase `draft`, `turn index` 0, `graph nodes` 0, `cast` 0, a draft Campaign Kernel payload, and the boundary note `Player cast writes to the Campaign Kernel. Full worldgen is parked on legacy routes.`
- A2 proof artifact: `output/playtests/revamp-create-campaign-shell-20260627.png`; browser console errors were empty, dev logs showed page GETs for `/`, `/campaign/new`, and `/campaign/.../revamp` only, and the playtest campaign was removed afterward through `DELETE /api/campaigns/15a389b0-4baa-42e5-ac3f-e268fb7f685d` -> `{ ok: true }`.
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
- GLM-5.2 reviewed the A8 opening plan and returned `Plan is up-to-date.`
- A8 added `backend/src/revamp/opening-gm.ts`, `backend/src/revamp/opening-kernel.ts`, `RevampOpeningResult`, and `POST /api/revamp/campaigns/:id/opening`.
- A8 proof: revamp focused vitest `src/revamp/__tests__/dna-adapter.test.ts src/revamp/__tests__/locations-adapter.test.ts src/revamp/__tests__/cast-registry-adapter.test.ts src/revamp/__tests__/cast-kernel.test.ts src/revamp/__tests__/world-graph-builder.test.ts src/revamp/__tests__/graph-kernel.test.ts src/revamp/__tests__/starting-setup.test.ts src/revamp/__tests__/setup-kernel.test.ts src/revamp/__tests__/opening-gm.test.ts src/revamp/__tests__/opening-kernel.test.ts src/routes/__tests__/revamp.test.ts` -> `58 passed`; `npm --prefix shared run build` passed; `npm --prefix backend run typecheck` passed.
- Droid GLM-5.2 custom model alias verified with `droid exec --model custom:GLM-5.2-(Z.AI-Coding)-0 --list-tools`; the CLI listed tools for `GLM-5.2 (Z.AI Coding)`.
- Droid GLM-5.2 A9 review log `.codex/agent-logs/droid-a9-chat-loop-plan-20260627-095444.out.log` returned `Revise`: scene source field, soft state hint persistence, freeform copy, and Look copy multiline format. Current A9 code was checked against those items and already uses `runtimeState.currentSceneId`, persists `pendingSoftStateHints`, uses revised freeform copy, and formats Look output as separated scene/present/routes lines.
- A9 added `backend/src/revamp/chat-gm.ts`, `backend/src/revamp/chat-kernel.ts`, `RevampGmResponse`, `RevampSoftStateHint`, and `POST /api/revamp/campaigns/:id/chat/message`.
- A9 proof: revamp focused vitest `src/revamp/__tests__/dna-adapter.test.ts src/revamp/__tests__/locations-adapter.test.ts src/revamp/__tests__/cast-registry-adapter.test.ts src/revamp/__tests__/cast-kernel.test.ts src/revamp/__tests__/world-graph-builder.test.ts src/revamp/__tests__/graph-kernel.test.ts src/revamp/__tests__/starting-setup.test.ts src/revamp/__tests__/setup-kernel.test.ts src/revamp/__tests__/opening-gm.test.ts src/revamp/__tests__/opening-kernel.test.ts src/revamp/__tests__/chat-gm.test.ts src/revamp/__tests__/chat-kernel.test.ts src/routes/__tests__/revamp.test.ts` -> `69 passed`; `npm --prefix shared run build` passed; `npm --prefix backend run typecheck` passed; `npm --prefix frontend run typecheck` passed.
- A10 added `chatSession.pendingSoftStateHints`, `backend/src/revamp/debug-snapshot.ts`, `RevampDebugSnapshot`, and `GET /api/revamp/campaigns/:id/debug`.
- A10 proof: revamp focused vitest `src/revamp/__tests__/dna-adapter.test.ts src/revamp/__tests__/locations-adapter.test.ts src/revamp/__tests__/cast-registry-adapter.test.ts src/revamp/__tests__/cast-kernel.test.ts src/revamp/__tests__/world-graph-builder.test.ts src/revamp/__tests__/graph-kernel.test.ts src/revamp/__tests__/starting-setup.test.ts src/revamp/__tests__/setup-kernel.test.ts src/revamp/__tests__/opening-gm.test.ts src/revamp/__tests__/opening-kernel.test.ts src/revamp/__tests__/chat-gm.test.ts src/revamp/__tests__/chat-kernel.test.ts src/revamp/__tests__/debug-snapshot.test.ts src/routes/__tests__/revamp.test.ts` -> `73 passed`; `npm --prefix shared run build` passed; `npm --prefix backend run typecheck` passed; `npm --prefix frontend run typecheck` passed.
- A11 added `runtimeState.currentSceneId`, `backend/src/revamp/state-writer.ts`, `RevampStateWriterResult`, and `POST /api/revamp/campaigns/:id/state/apply`.
- A11 proof: revamp focused vitest `src/revamp/__tests__/dna-adapter.test.ts src/revamp/__tests__/locations-adapter.test.ts src/revamp/__tests__/cast-registry-adapter.test.ts src/revamp/__tests__/cast-kernel.test.ts src/revamp/__tests__/world-graph-builder.test.ts src/revamp/__tests__/graph-kernel.test.ts src/revamp/__tests__/starting-setup.test.ts src/revamp/__tests__/setup-kernel.test.ts src/revamp/__tests__/opening-gm.test.ts src/revamp/__tests__/opening-kernel.test.ts src/revamp/__tests__/chat-gm.test.ts src/revamp/__tests__/chat-kernel.test.ts src/revamp/__tests__/debug-snapshot.test.ts src/revamp/__tests__/state-writer.test.ts src/routes/__tests__/revamp.test.ts` -> `78 passed`; `npm --prefix shared run build` passed; `npm --prefix backend run typecheck` passed; `npm --prefix frontend run typecheck` passed.

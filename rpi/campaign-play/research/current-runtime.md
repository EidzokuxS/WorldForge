# Current gameplay runtime map

Date: 2026-07-10

This map records the mounted player flow, its state authorities, and the gap between an accepted Campaign World and a playable campaign. It evaluates reuse boundaries without choosing the Campaign Play architecture. Planning owns the final route, repository, clock, player, actor, commit, and recovery decisions.

## Mounted player flow

### Browser entry and restore

1. `frontend/app/game/page.tsx` mounts the global `/game` route.
2. `initGame` resolves the active campaign, then falls back to the remembered campaign id.
3. `restoreGameplayState` requests chat history and `GET /api/campaigns/:id/world` in parallel.
4. A pending narration saga sends the browser to `POST /api/chat/resume`.
5. An empty narrated history sends the browser to `POST /api/chat/opening`.
6. The page renders `WorldData` through the existing game panels and `frontend/components/game/play-surface/*`.

Campaign identity comes from active or remembered campaign state. The route has no campaign id segment. `WorldData` projects shared locations plus `npcs`, `players`, `items`, factions, relationships, and the world clock. Campaign World `actors`, goals, placements, relations, and pressures stay outside this projection.

### Player action and stream

1. `submitAction` routes lookup intents through `chatLookup` and player-facing actions through `chatAction`.
2. `chatAction` posts to `POST /api/chat/action`.
3. The page adds an optimistic user message after the server accepts the stream.
4. `parseTurnSSE` processes `scene-settling`, `narrative`, `oracle`, `state_update`, `quick_actions`, `done`, and `error` events.
5. A `state_update` can refresh location, time, or condition presentation during the stream.
6. A `done` event triggers a final world reload and a boundary freshness assertion, then exposes buffered quick actions.
7. An error restores the prior history or removes the optimistic message.

`parseTurnSSE` requires durable boundary metadata for narrated turns. The clean runtime event union has no `quick_actions` producer, so the current clean action path leaves the browser's buffering support unused.

### Mounted backend action path

`backend/src/index.ts` mounts both `campaigns` and `campaignWorld` under `/api/campaigns`, `campaignKernel` under `/api/kernel`, and the current gameplay route under `/api/chat`.

`POST /api/chat/action` in `backend/src/routes/chat.ts` performs this sequence:

1. Validate the request and resolve the loaded campaign.
2. Acquire the process-local turn lease through `tryBeginTurn`.
3. Reject a turn while a narration saga awaits recovery.
4. Capture the pre-turn runtime snapshot and any low-health checkpoint.
5. Resolve the selected quick-action handle when present.
6. Call `processCleanGameplayTurn`.
7. Forward clean runtime events to the SSE response.
8. Run post-turn hooks and retain the undo snapshot in process memory.
9. Restore the snapshot after a pre-settlement failure.

The route returns `409` for clean-turn retry. Undo state and the turn lease live in process memory, so a process restart discards them.

### Clean gameplay cycle

`backend/src/engine/gameplay-cycle-runtime/runtime.ts` owns the mounted clean cycle:

```text
legacy world clock and chat length
  -> SceneFrame
  -> GM Read
  -> Judge and Uncertainty
  -> Oracle branch or deterministic action checklist
  -> Stage 4 typed execution
  -> in-memory settlement packet
  -> narrator view
  -> narration
  -> clean turn persistence
  -> done boundary
```

The runtime contract names `/api/chat/action`. `frame.ts` and `scene-frame.ts` read `players`, `npcs`, `items`, shared `locations`, `location_edges`, local events, and `world_clocks`. `readPlayer` requires a `players` row. Campaign World `actors` have no reader in this cycle.

GM Read and the model-backed Judge use strict structured generation. The adapter allows one model attempt and rejects repair or text fallback. The Oracle branch calls the Oracle adapter. The action checklist is deterministic. Dialogue and support-actor execution may call the storyteller model. Final narration uses an authority-grounded deterministic render or a strict storyteller call.

Stage 4 supports these capability kinds:

- `observe_visible`
- `local_observation`
- `device_surface_observation`
- `route_options`
- `route_check`
- `movement`
- `dialogue_record`
- `support_actor_create`
- `condition_set`
- `item_transfer`
- `minor_poi_create`
- `time_advance`
- `scene_beat_record`

Each mutating Stage 4 step opens its own SQLite transaction and records a typed receipt. Movement writes the current location and scene to `players` and advances the clock. Support-actor creation writes `npcs`. Item transfer writes `items`. The runtime lacks one transaction spanning every step in a turn.

The runtime emits public `state_update` events for location changes, time advances, and conditions. Item transfer belongs to the public union, while the Stage 4 event loop omits its emission. The final `GET /api/campaigns/:id/world` reload exposes committed inventory state.

### Settlement, narration, and persistence

The settlement packet chooses the highest Stage 4 receipt clock. The route keeps that packet in memory through narration. `commitCleanPlayerFacingTurn` then:

1. Appends the user and assistant messages to `chat_history.json`.
2. Inserts the clean runtime record into `clean_gameplay_turn_records` under a SQLite write lock.

The file append and SQLite insert have separate commit boundaries. The runtime emits narrative SSE before this final persistence step.

`turn-persistence.ts` builds the `done` boundary from the input turn base clock. A mutating turn can therefore return the pre-turn tick, world version, and world time even when the settlement packet contains a later result clock. The browser freshness check uses `>=`, so a lower boundary can pass after the final world reload.

The clean action path embeds the settlement packet, narrator view, narration proof, and receipt references in the clean runtime record. It does not create the durable `turn_sagas`, `settled_turn_packets`, or `narrator_attempts` sequence used by the older opening and narration recovery path. `backend/src/engine/gameplay-control-plane-contract.ts` declares a ten-stage lifecycle, while the mounted clean route reaches a smaller subset of those durable stages.

### Opening and recovery path

`POST /api/chat/opening` calls `processOpeningScene` in `backend/src/engine/turn-processor.ts`. That path builds the scene, requests world direction, persists a saga and settled packet, records narrator attempts, appends narration, and finalizes the saga. `POST /api/chat/resume` recovers pending narration from this durable saga model.

Clean player actions use snapshot restoration for pre-settlement failures and a clean runtime record after narration. Opening and action therefore use different persistence and recovery models.

## Current truth and read-write map

| Domain | Mounted reader | Mounted writer | Durable boundary | Campaign World handoff status |
|---|---|---|---|---|
| Campaign selection | active campaign API and remembered browser id | campaign activation flow | campaign config and browser state | Accepted review adds no play navigation or active-campaign transition |
| Play readiness | `requireGeneratedCampaign` reads `config.generationComplete` | world generation flow | campaign config | `acceptWorld` changes Campaign World status; generation readiness stays unchanged |
| Locations and routes | `scene-frame.ts` and `GET /api/campaigns/:id/world` read shared `locations` and `location_edges` | Campaign World `completeBuild` and existing gameplay writers | SQLite | Shared tables provide the current overlap |
| Player | `readPlayer`, world projection, character page | `/api/worldgen/save-character`, movement, conditions | `players` table | Campaign World models people as `actors`; its build and acceptance pipeline creates no `players` row |
| NPC and support cast | SceneFrame and world projection | Stage 4 support-actor creation and existing gameplay writers | `npcs` table | Accepted `actors` stay outside runtime reads and writes |
| Items | SceneFrame and world projection | Stage 4 item transfer and existing gameplay writers | `items` table | The Campaign World build and acceptance pipeline creates no item authority for play |
| Clock | runtime input, SceneFrame, world projection | Stage 4 clock ledger and movement/time steps | `world_clocks` plus receipts | The Campaign World build and acceptance pipeline creates no world clock |
| Campaign World actors | review and Campaign World APIs | Campaign World build acceptance | `actors` table | Gameplay runtime has no adapter or direct reader |
| Goals, relations, placements, pressures | Campaign World review and state APIs | Campaign World `completeBuild` | Campaign World tables | Gameplay runtime has no reader for these authorities |
| Chat history | `/api/chat/history` and GamePage restore | chat actions, opening, recovery | `chat_history.json` | Separate from Campaign World and SQLite transaction scope |
| Action authority | GM Read, Judge, checklist, Stage 4 contracts | typed Stage 4 executors | receipts and clean runtime record | Bound to old player, NPC, item, and clock tables |
| Settled turn | in-memory clean packet, embedded record after narration | clean runtime settlement and persistence | `clean_gameplay_turn_records` | Campaign World state has no turn-settlement integration |
| Opening recovery | pending saga readers | opening processor and narrator recovery | saga, settled packet, narrator attempt tables | Separate from the clean action record model |
| Undo and lease | `/api/chat/action` process state | chat route runtime state | process memory | Restart clears this state |
| Campaign Kernel | `/api/kernel/campaigns/:id/*` | kernel graph, cast, setup, opening, and state writers | `kernel.json` and kernel files | Separate donor model with no Campaign World projection |

## Accepted Campaign World handoff blockers

An accepted Campaign World supplies shared locations and routes plus Campaign World records. The mounted play flow requires additional state and readiness signals.

| Blocker | Current evidence | Result at handoff |
|---|---|---|
| Generation readiness | `requireGeneratedCampaign` checks `config.generationComplete` | World and character APIs reject an accepted build when this flag remains false |
| Player authority | Campaign World `completeBuild` writes `actors`; `readPlayer` requires `players` | SceneFrame construction fails until another flow creates a player row |
| Cast authority | `completeBuild` writes person and collective actors; SceneFrame reads optional `npcs` rows | Accepted actors stay outside the NPC projection during play |
| Clock authority | Runtime input reads `world_clocks` | The first action lacks a required turn clock |
| World projection | `GET /api/campaigns/:id/world` selects legacy play tables | Campaign World goals, actors, placements, relations, and pressures stay absent from `WorldData` |
| Character route | `frontend/app/(non-game)/campaign/[id]/character/page.tsx` checks generation readiness and saves through `/api/worldgen/save-character` | Character creation continues through the worldgen-owned contract |
| Review exit | Campaign World review provides Forge and Review states | Acceptance exposes no Player Character or Begin Session transition |
| Opening | Current opening builds from the legacy SceneFrame and saga path | Accepted Campaign World data cannot supply the required player and clock inputs, while its cast stays outside the NPC query |
| Kernel projection | Campaign Kernel persists `kernel.json` and separate graph and cast data | Campaign World acceptance creates no kernel projection |

## Desired stage gap map

This table compares the expected Campaign Play stages with mounted behavior. It records implementation gaps without prescribing the replacement design.

| Desired stage | Mounted behavior | Gap for Campaign Play planning |
|---|---|---|
| Player action | `/game` posts to `/api/chat/action` using active or remembered campaign state | Mechanics-owned campaign route and API boundary remain undecided |
| Intent normalization | Chat route validates input and resolves a quick-action handle | Campaign World player and actor ids have no normalization adapter |
| Lease and snapshot | Process-local lease plus full pre-turn snapshot | Restart-safe ownership and recovery need a planning decision |
| Scene truth | SceneFrame reads legacy player, NPC, item, location, event, and clock tables | Accepted actors, goals, relations, placements, and pressures stay outside the frame |
| GM Read | Strict structured GM Read runs before judgment | Input contract assumes the legacy SceneFrame |
| Judge and uncertainty | Strict model-backed or receipt-backed judgment runs | Authority references identify legacy runtime state |
| GM plan | Deterministic action checklist creates ordered requirements | Campaign World capability mapping remains unspecified |
| Tool commits | Stage 4 executes typed capabilities and writes receipts | Each step owns a transaction; whole-turn atomicity and Campaign World repositories remain open decisions |
| Visibility refresh | The runtime refreshes selected dependencies and the browser reloads world state at `done` | General post-commit visibility and accepted actor projection remain implicit |
| Settled truth | The runtime creates a packet in memory and embeds it in the record after narration | A durable pre-narration settled boundary is absent from clean actions |
| Narration | Deterministic or strict model narration receives an authority-grounded view | Narrative SSE precedes final clean record and chat persistence |
| Public state updates | SSE covers location, time, and condition; final reload covers the rest | Item update emission and Campaign World projections are incomplete |
| Next choice | Browser and SSE contracts accept `quick_actions` | Clean runtime has no quick-action producer |
| Done boundary | `turn-persistence.ts` uses the input base clock | Mutating turns can report stale boundary metadata |
| Recovery | Opening uses durable saga recovery; clean actions use snapshot restoration and reject retry | One recovery contract across opening and action remains undefined |
| Control plane | A ten-stage contract exists in `gameplay-control-plane-contract.ts` | Mounted clean execution bypasses several declared durable stages |

## Unsafe or displaced paths

These paths carry current behavior and can act as donors. A Campaign Play implementation that adopts them without an ownership decision also adopts their current truth model.

| Path | Current role | Constraint for Campaign Play |
|---|---|---|
| `/game` and `frontend/app/game/page.tsx` | Mounted play UI | Global route and active-campaign selection sit outside a campaign-owned player route |
| `/api/chat/*` and `backend/src/routes/chat.ts` | Mounted opening, action, history, recovery, lookup, and undo API | Route combines clean runtime, older saga recovery, JSON history, and process memory |
| `/api/campaigns/:id/world` | Browser play projection | Reads legacy play tables and omits Campaign World actor authority |
| `/api/worldgen/save-character` | Current character writer | Worldgen owns player creation and readiness checks |
| `/api/kernel/*` | Campaign Kernel prototype APIs | Separate JSON graph, cast, setup, and deterministic chat state form a donor rather than a mounted replacement |
| `chat_history.json` | User and assistant history | File persistence cannot join the SQLite clean record transaction |
| `backend/src/campaign/runtime-state.ts` | Turn lease and undo snapshot | Process restart clears active state |
| Phase 84, 88, and 94 playtest harnesses | Existing runtime acceptance and telemetry | Baseline pools use old generated or cloned campaigns instead of a fresh accepted Campaign World |

## Evaluated integration option

Evaluated recommendation: treat `backend/src/engine/gameplay-cycle-runtime/` as a donor of validated contracts and execution units, exposed through mechanics-owned Campaign Play routes and explicit repositories if planning selects runtime reuse. This option retains strict GM Read and Judge contracts, the deterministic checklist, typed Stage 4 receipts, settlement checks, authority-grounded narration, and a substantial test suite.

The directory contains 25,489 TypeScript source lines across 11 files. Its defaults read and write `players`, `npcs`, `items`, and `world_clocks`; its route contract names `/api/chat/action`; its final commit appends `chat_history.json`; and several Stage 4 executors write the old gameplay tables. Importing or adapting the runtime without repository-level changes would retain the old `players`, `npcs`, and `world_clocks` truth model. Any reuse needs an explicit planning decision for player identity, actor projection, clock ownership, repository injection, settlement persistence, and restart recovery.

A narrower loop built around Campaign World repositories is another option. It would trade existing runtime reuse for a smaller authority surface. This research map leaves the choice, migration boundary, and cutover sequence to the Campaign Play plan.

## Source inventory

### Mounted frontend

```text
frontend/app/game/page.tsx
frontend/app/game/use-game-play-surface-state.ts
frontend/lib/api.ts
frontend/lib/api-types.ts
frontend/lib/gameplay-text.ts
frontend/components/game/action-bar.tsx
frontend/components/game/character-panel.tsx
frontend/components/game/checkpoint-panel.tsx
frontend/components/game/location-panel.tsx
frontend/components/game/lore-panel.tsx
frontend/components/game/narrative-log.tsx
frontend/components/game/oracle-panel.tsx
frontend/components/game/quick-actions.tsx
frontend/components/game/rich-text-message.tsx
frontend/components/game/special-message-block.tsx
frontend/components/game/play-surface/action-dock.tsx
frontend/components/game/play-surface/drawer-host.tsx
frontend/components/game/play-surface/game-scene-shell.tsx
frontend/components/game/play-surface/inspect-drawer.tsx
frontend/components/game/play-surface/narration-dock.tsx
frontend/components/game/play-surface/presence-layer.tsx
frontend/components/game/play-surface/scene-backdrop.tsx
frontend/components/game/play-surface/scene-hud.tsx
frontend/components/game/play-surface/stage-overlay.tsx
frontend/components/game/play-surface/types.ts
frontend/components/game/play-surface/widget-rail.tsx
```

### Campaign handoff frontend

```text
frontend/app/(non-game)/campaign/[id]/character/page.tsx
frontend/app/(non-game)/campaign/[id]/forge/page.tsx
frontend/app/(non-game)/campaign/[id]/review/page.tsx
frontend/lib/campaign-world-api.ts
frontend/lib/campaign-world-research.ts
frontend/lib/campaign-kernel-api.ts
```

### Mounted routes and support

```text
backend/src/index.ts
backend/src/routes/chat.ts
backend/src/routes/campaigns.ts
backend/src/routes/helpers.ts
backend/src/routes/character.ts
backend/src/routes/campaign-world.ts
backend/src/routes/campaign-kernel.ts
backend/src/campaign/chat-history.ts
backend/src/campaign/runtime-state.ts
backend/src/campaign/manager.ts
backend/src/db/schema.ts
backend/src/engine/scene-frame.ts
backend/src/engine/turn-processor.ts
backend/src/engine/gameplay-control-plane-contract.ts
backend/src/engine/living-world-authority.ts
backend/src/engine/quick-action-offers.ts
```

### Clean gameplay cycle

```text
backend/src/engine/gameplay-cycle-runtime/contracts.ts
backend/src/engine/gameplay-cycle-runtime/runtime.ts
backend/src/engine/gameplay-cycle-runtime/frame.ts
backend/src/engine/gameplay-cycle-runtime/gm-read.ts
backend/src/engine/gameplay-cycle-runtime/judge-uncertainty.ts
backend/src/engine/gameplay-cycle-runtime/oracle-settlement.ts
backend/src/engine/gameplay-cycle-runtime/action-checklist.ts
backend/src/engine/gameplay-cycle-runtime/stage4-execution.ts
backend/src/engine/gameplay-cycle-runtime/settlement.ts
backend/src/engine/gameplay-cycle-runtime/narration.ts
backend/src/engine/gameplay-cycle-runtime/turn-persistence.ts
```

### Campaign World authority

```text
shared/src/campaign-world.ts
backend/src/campaign-world/contracts.ts
backend/src/campaign-world/world-database.ts
backend/src/campaign-world/world-source.ts
backend/src/campaign-world/world-source-lock.ts
backend/src/campaign-world/world-builder.ts
backend/src/campaign-world/world-build-service.ts
backend/src/campaign-world/world-repository.ts
backend/src/campaign-world/world-snapshot.ts
backend/src/campaign-world/world-validator.ts
```

### Campaign Kernel donor

```text
backend/src/campaign-kernel/chat-kernel.ts
backend/src/campaign-kernel/chat-gm.ts
backend/src/campaign-kernel/opening-kernel.ts
backend/src/campaign-kernel/opening-gm.ts
backend/src/campaign-kernel/state-writer.ts
backend/src/campaign-kernel/dna-adapter.ts
backend/src/campaign-kernel/locations-adapter.ts
backend/src/campaign-kernel/cast-kernel.ts
backend/src/campaign-kernel/cast-registry-adapter.ts
backend/src/campaign-kernel/graph-kernel.ts
backend/src/campaign-kernel/setup-kernel.ts
backend/src/campaign-kernel/starting-setup.ts
backend/src/campaign-kernel/world-graph-builder.ts
```

## Test inventory

### Backend runtime and route tests

```text
backend/src/engine/__tests__/gameplay-cycle-runtime-contracts.test.ts
backend/src/engine/__tests__/gameplay-cycle-runtime-stage4.test.ts
backend/src/engine/__tests__/gameplay-cycle-runtime-settlement.test.ts
backend/src/engine/__tests__/gameplay-cycle-runtime-narration.test.ts
backend/src/engine/__tests__/gameplay-control-plane-contract.test.ts
backend/src/engine/__tests__/living-world-authority.test.ts
backend/src/engine/__tests__/living-world-metrics.test.ts
backend/src/engine/__tests__/phase-94-runtime-invariants.test.ts
backend/src/routes/__tests__/chat.test.ts
backend/src/routes/__tests__/chat.resilience.test.ts
backend/src/routes/__tests__/chat.scene-plan.test.ts
backend/src/routes/__tests__/chat.inventory-authority.test.ts
backend/src/routes/__tests__/chat-turn-context.test.ts
backend/src/routes/__tests__/chat.observability-concurrency.test.ts
backend/src/routes/__tests__/chat.observability-stream-safety.test.ts
backend/src/routes/__tests__/campaigns.test.ts
backend/src/routes/__tests__/campaigns.inventory-authority.test.ts
backend/src/routes/__tests__/character.test.ts
backend/src/routes/__tests__/helpers.test.ts
```

### Campaign World tests

```text
backend/src/routes/campaign-world.test.ts
backend/src/campaign-world/contracts.test.ts
backend/src/campaign-world/world-database.test.ts
backend/src/campaign-world/world-source.test.ts
backend/src/campaign-world/world-source-lock.test.ts
backend/src/campaign-world/world-builder.test.ts
backend/src/campaign-world/world-build-service.test.ts
backend/src/campaign-world/world-repository.test.ts
backend/src/campaign-world/world-snapshot.test.ts
backend/src/campaign-world/world-validator.test.ts
frontend/lib/campaign-world-api.test.ts
frontend/lib/campaign-world-research.test.ts
frontend/app/(non-game)/campaign/[id]/forge/page.test.tsx
frontend/app/(non-game)/campaign/[id]/review/page.test.tsx
```

### Campaign Kernel tests

```text
backend/src/routes/__tests__/campaign-kernel.test.ts
backend/src/campaign-kernel/__tests__/cast-kernel.test.ts
backend/src/campaign-kernel/__tests__/cast-registry-adapter.test.ts
backend/src/campaign-kernel/__tests__/chat-gm.test.ts
backend/src/campaign-kernel/__tests__/chat-kernel.test.ts
backend/src/campaign-kernel/__tests__/debug-snapshot.test.ts
backend/src/campaign-kernel/__tests__/dna-adapter.test.ts
backend/src/campaign-kernel/__tests__/graph-kernel.test.ts
backend/src/campaign-kernel/__tests__/locations-adapter.test.ts
backend/src/campaign-kernel/__tests__/opening-gm.test.ts
backend/src/campaign-kernel/__tests__/opening-kernel.test.ts
backend/src/campaign-kernel/__tests__/setup-kernel.test.ts
backend/src/campaign-kernel/__tests__/starting-setup.test.ts
backend/src/campaign-kernel/__tests__/state-writer.test.ts
backend/src/campaign-kernel/__tests__/world-graph-builder.test.ts
frontend/lib/__tests__/campaign-kernel-api.test.ts
```

### Mounted frontend play tests

```text
frontend/app/game/__tests__/page.test.tsx
frontend/lib/__tests__/api.test.ts
frontend/lib/__tests__/api.inventory-authority.test.ts
frontend/components/game/__tests__/action-bar.test.tsx
frontend/components/game/__tests__/character-panel.test.tsx
frontend/components/game/__tests__/checkpoint-panel.test.tsx
frontend/components/game/__tests__/location-panel.test.tsx
frontend/components/game/__tests__/lore-panel.test.tsx
frontend/components/game/__tests__/lore-panel.layout.test.tsx
frontend/components/game/__tests__/narrative-log.test.tsx
frontend/components/game/__tests__/oracle-panel.test.tsx
frontend/components/game/__tests__/quick-actions.test.tsx
frontend/components/game/__tests__/rich-text-message.test.tsx
frontend/components/game/play-surface/__tests__/action-dock.test.tsx
frontend/components/game/play-surface/__tests__/drawer-host.test.tsx
frontend/components/game/play-surface/__tests__/game-scene-shell.test.tsx
frontend/components/game/play-surface/__tests__/inspect-drawer.test.tsx
frontend/components/game/play-surface/__tests__/narration-dock.test.tsx
frontend/components/game/play-surface/__tests__/presence-layer.test.tsx
frontend/app/(non-game)/campaign/[id]/character/__tests__/page.test.tsx
```

### Runtime playtest harnesses

```text
e2e/84-rp-prompt-branchy-playtest.ts
e2e/88-living-world-playtest.ts
e2e/94-focused-living-world-playtest.ts
e2e/phase-94/acceptance-report.ts
e2e/phase-94/artifact-schema.ts
e2e/phase-94/baseline-pool.ts
e2e/phase-94/live-runner.ts
e2e/phase-94/report-validation.ts
e2e/phase-94/route-assertions.ts
e2e/phase-94/route-manifest.ts
e2e/phase-94/trace-collector.ts
```

The Phase 94 baseline pool clones fixed generated campaigns. It does not prove the acceptance path from a fresh Campaign World build into player creation, opening, action, reload, and restart.

## Verification commands

The existing mounted runtime can be checked with the focused suites before a full repository pass:

```powershell
npm --prefix shared run build
npm --prefix backend test -- src/engine/__tests__/gameplay-cycle-runtime-contracts.test.ts src/engine/__tests__/gameplay-cycle-runtime-stage4.test.ts src/engine/__tests__/gameplay-cycle-runtime-settlement.test.ts src/engine/__tests__/gameplay-cycle-runtime-narration.test.ts src/engine/__tests__/gameplay-control-plane-contract.test.ts src/routes/__tests__/chat.test.ts src/routes/__tests__/chat.resilience.test.ts src/routes/campaign-world.test.ts
npm --prefix frontend test -- --run app/game components/game lib/__tests__/api.test.ts
npm --prefix backend run typecheck
npm --prefix frontend run typecheck
```

The repository-level pass is:

```powershell
npm --prefix backend test
npm --prefix frontend test -- --run
npm run build
git diff --check
```

The existing Phase 94 harness can validate its manifest and current old-campaign baseline:

```powershell
node --import tsx e2e/94-focused-living-world-playtest.ts --manifest-only
node --import tsx e2e/94-focused-living-world-playtest.ts --dry-run --turns 3
```

A later Campaign Play acceptance suite needs to prove this concrete path against a fresh campaign database:

```text
Concept -> Forge -> Review -> Accept -> Player Character -> Opening -> Action -> Reload -> Process Restart -> Resume Play
```

The proof must assert one authoritative actor model, one player identity, monotonic tick and world-version boundaries, durable settlement before narration exposure, restart-safe recovery, and next-choice production. Planning must select the repositories and transaction boundary before that suite can become authoritative.

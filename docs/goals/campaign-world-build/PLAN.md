# Campaign World Build Implementation Plan

**Intent:** Give a player a complete, inspectable world before player-character setup begins.
**Current Behavior:** Campaign Forge calls the scaffold generator, which writes locations, NPCs, factions, lore storage, and `generationComplete` across separate commit boundaries. Campaign Kernel keeps a second DNA and graph state in `kernel.json`, while World Review rewrites the scaffold and changes entity IDs.
**Expected Outcome:** Campaign Forge builds locations, routes, actors, goals, placements, relations, and starting pressures through a mechanics-owned contract. The player reviews the persisted result, accepts it, reloads the campaign, and receives the same world version and entity IDs.
**Target-Perspective Output:** The player sees generation progress for Locations, Actors, Connections, and Review preparation. World Review shows actors distributed through the world, including collective actors, their goals and connections, and an explicit acceptance action. The human acceptance operator runs the full-world scorecard and verifies restart stability before promotion.
**Truth Owner:** The campaign `state.db` owns the built world, build ledger, world version, content hash, and acceptance status. `config.json` owns campaign intake until a build starts: premise, `WorldSeeds` as the stored World DNA draft, research, and selected source material. All DNA writes delegate to `saveWorldSeeds`. The accepted world stores an immutable normalized source snapshot and digest for provenance.
**Contract Boundary:** `@worldforge/shared` publishes the Campaign World DTOs. `backend/src/campaign-world/` owns campaign-scoped database handles, source normalization, strict model stages, validation, persistence, build events, review projection, and acceptance. `/api/campaigns/:id/world/*` exposes the boundary.
**Cutover:** Campaign Forge and World Review move to `frontend/lib/campaign-world-api.ts`. They stop reading Campaign Kernel or `generationComplete`. The current player path ends at an accepted world; player actor setup is the next goal.
**Displaced Path:** `/api/worldgen/generate`, `/api/worldgen/regenerate-section`, `/api/worldgen/save-edits`, `generateWorld`, `regenerateSection`, `saveWorldEdits`, scaffold review DTOs, and the Factions review section leave the active Forge/Review path. The remaining worldgen intake tools stay quarantined for the later Campaign Intake goal.
**Value Density:** This is the smallest slice that proves one world owner, unified actors, durable progress, review from persisted data, acceptance, and reload stability before turn mechanics are rebuilt.
**Acceptance Evidence:** Two fresh live-provider campaigns complete the real Concept -> Forge -> Review path. One uses premise only. One uses edited World DNA plus saved research from Campaign Intake. Each run captures build events, SQLite integrity, canonical hash, review screenshots, acceptance receipt, and the same IDs and hash after backend restart.
**Evidence Lane:** Focused contract and transaction tests run first. Seeded builder fixtures exercise reference integrity and actor distribution. Live adaptive playtests decide promotion. Existing Phase 88/94 harnesses remain diagnostic donors.
**Kill Criteria:** Forge and Review import only the Campaign World client for world construction. Their request logs contain no build, regeneration, save, or readiness calls to worldgen or Campaign Kernel. The Campaign World schema contains no faction entity. The review response comes from SQLite after the build transaction. Acceptance rejects stale versions and hashes. A failed build leaves no partial world rows.
**Architecture Slice:** Campaign source adapter -> strict staged builder -> deterministic validator -> atomic SQLite repository -> durable build events -> Campaign World API -> Forge and Review.
**Plan Review Gate:** Requires PRE review before execution.

## Decision

Verdict: GO for Campaign World Build. Gameplay, player actor creation, opening narration, and turns wait behind this proof gate.

The plan uses domain names throughout:

- Route segments: `campaign`, `world`, `builds`, `review`, `accept`.
- Public types: `CampaignWorld`, `WorldActor`, `ActorGoal`, `ActorRelation`, `ActorPlacement`, `WorldPressure`.
- Functions: `buildCampaignWorld`, `loadCampaignWorld`, `acceptCampaignWorld`, `projectCampaignWorldReview`.
- Components: `CampaignWorldBuildWorkspace`, `ActorsSection`, `ConnectionsSection`.
- Tests describe player or contract behavior. New names contain no workstream, version, age, or experiment labels.

## Scope

This goal delivers:

- premise-only world construction;
- optional World DNA editing and use after campaign creation;
- normalized saved research and selected source material as optional build context;
- locations and directed routes;
- one actor model for people and collectives;
- actor goals, initial placements, relations, and world pressures;
- strict structured generation with one call per stage;
- durable build status and resumable SSE events;
- an atomic review-state commit;
- persisted review, acceptance, and reload proof;
- removal of the scaffold build and save path from current Forge and Review.

Deferred goals:

- DNA suggestion and single-field reroll after campaign creation;
- adding or importing actors during review;
- player actor creation and Character Card ingestion;
- opening setup and narrator output;
- Rulebook commands, turn plans, receipts, visibility, and background actor scheduling;
- lore and memory projections;
- Campaign Intake replacement for pre-campaign research and DNA suggestion;
- deletion of donor gameplay, worldgen, and kernel source outside the active path.

## Player flow

```text
Concept
  -> create campaign
  -> Forge loads CampaignWorldSource
  -> optional DNA edit through saveWorldSeeds
  -> create CampaignWorldBuild
  -> subscribe to durable build events
  -> Review loads CampaignWorldReview from SQLite
  -> accept with expected version and content hash
  -> restart and reload the same accepted world
```

The accepted Review screen ends this goal. It does not link into the current character or game flow.

## Ownership map

| Concern | Owner after cutover | Storage | Reader |
|---|---|---|---|
| Premise, optional DNA, research input | Campaign source adapter through `readCampaignConfig` and `saveWorldSeeds` | `config.json` until build | `CampaignWorldSourceService` |
| Source used for a completed build | Campaign World repository | `campaign_worlds.source_snapshot_json` and digest | Review and evidence exporter |
| Locations and routes | Campaign World repository | existing `locations`, `location_edges` | Review, later Rulebook |
| People and collectives | Campaign World repository | `actors` | Review, later scheduler |
| Goals, relations, placements | Campaign World repository | typed actor tables | Review, later Rulebook |
| Starting pressure | Campaign World repository | pressure and link tables | Review, later opening planner |
| Build lifecycle and progress | Campaign World build service with a campaign-scoped database handle | build and event tables | SSE and debug evidence |
| World acceptance | Campaign World repository | status, version, hash, accepted timestamp | Forge, Review, shell status |
| Campaign Kernel prototypes | Quarantined donor | `kernel.json` | No Campaign World player surface |

## Domain contract

### Shared types

`shared/src/campaign-world.ts` defines these public shapes:

```ts
type CampaignWorldStatus =
  | "unbuilt"
  | "building"
  | "review"
  | "accepted"
  | "failed";

type WorldActorKind = "person" | "collective";
type WorldActorController = "human" | "agent";
type WorldActorRole = "key" | "support" | "background";
type ActorPlacementKind = "present" | "home" | "base" | "influence";
type ActorGoalHorizon = "immediate" | "ongoing";
type GoalPriority = 1 | 2 | 3 | 4 | 5;
type RelationIntensity = 1 | 2 | 3 | 4 | 5;
type PressureUrgency = 1 | 2 | 3 | 4 | 5;
type RouteCost = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
type ActorRelationType =
  | "alliance"
  | "rivalry"
  | "authority"
  | "dependency"
  | "kinship"
  | "association"
  | "hostility";

interface CampaignWorldSource {
  campaignId: string;
  premise: string;
  dna: CampaignWorldDna | null;
  researchSummary: string | null;
  sourceReferences: Array<{ id: string; label: string; sourceType: string }>;
  sourceDigest: string;
}

interface CampaignWorldLocation {
  id: string;
  name: string;
  description: string;
  kind: "macro" | "persistent_sublocation";
  parentLocationId: string | null;
  tags: string[];
  isStarting: boolean;
}

interface CampaignWorldRoute {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  travelCost: RouteCost;
}

interface WorldActor {
  id: string;
  kind: WorldActorKind;
  controller: WorldActorController;
  role: WorldActorRole;
  name: string;
  summary: string;
  traits: string[];
  tags: string[];
}

interface ActorGoal {
  id: string;
  actorId: string;
  objective: string;
  motivation: string;
  horizon: ActorGoalHorizon;
  priority: GoalPriority;
  status: "active";
}

interface ActorRelation {
  id: string;
  sourceActorId: string;
  targetActorId: string;
  relationType: ActorRelationType;
  summary: string;
  intensity: RelationIntensity;
}

interface ActorPlacement {
  id: string;
  actorId: string;
  locationId: string;
  placementKind: ActorPlacementKind;
}

interface WorldPressure {
  id: string;
  name: string;
  description: string;
  trajectory: string;
  urgency: PressureUrgency;
  actorIds: string[];
  locationIds: string[];
}

interface CampaignWorld {
  campaignId: string;
  status: "review" | "accepted";
  version: number;
  contentHash: string;
  sourceDigest: string;
  worldSummary: string;
  locations: CampaignWorldLocation[];
  routes: CampaignWorldRoute[];
  actors: WorldActor[];
  goals: ActorGoal[];
  relations: ActorRelation[];
  placements: ActorPlacement[];
  pressures: WorldPressure[];
  builtAt: number;
  acceptedAt: number | null;
}

interface CampaignWorldBuild {
  buildId: string;
  status: "running" | "completed" | "failed";
  stage: "world_frame" | "world_cast" | "world_connections" | "validation" | "persistence";
  lastEventSequence: number;
  sourceDigest: string;
  errorCode: string | null;
}

type CampaignWorldBuildEvent =
  | { sequence: number; buildId: string; type: "build_started"; createdAt: number }
  | { sequence: number; buildId: string; type: "stage_started" | "stage_completed"; stage: CampaignWorldBuild["stage"]; createdAt: number }
  | { sequence: number; buildId: string; type: "build_completed"; worldVersion: number; contentHash: string; createdAt: number }
  | { sequence: number; buildId: string; type: "build_failed"; errorCode: string; message: string; createdAt: number };

type CampaignWorldState =
  | { status: "unbuilt"; source: CampaignWorldSource }
  | { status: "building" | "failed"; source: CampaignWorldSource; build: CampaignWorldBuild }
  | { status: "review" | "accepted"; world: CampaignWorldReview };

interface CampaignWorldReview extends CampaignWorld {
  source: Pick<CampaignWorldSource, "premise" | "dna" | "researchSummary" | "sourceReferences">;
}

interface CampaignWorldAcceptanceReceipt {
  campaignId: string;
  worldVersion: number;
  contentHash: string;
  acceptedAt: number;
}
```

The shared contract has one `actors` collection. A collective is a `WorldActor` with `kind: "collective"`. The contract has no faction collection, NPC collection, lore-card count, or scaffold field.

Versions start at `1` on the first successful world commit. Build events and acceptance leave the content version unchanged. Later Rulebook commands will increment it. The content hash covers `sourceDigest`, `worldSummary`, and every canonical entity field, including persistent IDs. It excludes status, version, timestamps, build IDs, provider traces, and event telemetry. Arrays sort by persistent ID and object keys use a stable canonical order before hashing.

For `review | accepted`, `/world/state` builds both world content and source data exclusively from `campaign_worlds.source_snapshot_json`. It does not reread current campaign config for an accepted version.

### State machine and build eligibility

| Current state | Allowed action | Result |
|---|---|---|
| no world and no build | save DNA | `unbuilt` with a new source digest |
| no world and no build | start build | `building` |
| failed build and no world | save DNA | `failed` with a new source digest |
| failed build and no world | start build | `building` with a new build ID |
| building | complete build transaction | `review` |
| building | fail build transaction | `failed` |
| review | accept matching version and hash | `accepted` |

Build and DNA writes return `409` while a build runs. A `review` or `accepted` world rejects another build and rejects DNA mutation. Acceptance works only from `review`.

DNA save and build acquisition are linearized by the same per-campaign mutex. If DNA save wins, an acquisition carrying the previous source digest returns `409 source_changed`. If build acquisition wins, the DNA save returns `409 world_build_running`. The running build consumes its frozen SQLite snapshot.

This goal accepts a clean campaign state: the campaign row and normal initialization records may exist, while locations, NPCs, players, factions, scaffold relations, and turn records are empty. Existing scaffold or gameplay rows return `campaign_recreation_required`. The plan adds no importer or compatibility projection.

### Actor invariants

- Every generated actor has `controller: "agent"`.
- Every person has one `present` placement. A person may also have one `home` placement.
- Every collective has at least one `base` or `influence` placement.
- Every key and support actor has at least one active goal.
- Every collective actor has at least one active goal.
- Every goal belongs to one actor.
- Every relation references two existing actors and rejects a self endpoint.
- Every placement references an existing actor and location.
- When the world has at least two reachable locations and at least two person actors, the initial cast occupies at least two locations.
- Every pressure references at least one actor or location through a foreign-key link.
- Exactly one starting macro location exists. Every persistent macro location is reachable from it by following directed routes. Strong connectivity is outside this goal.

Collective organizations use the same actor, goal, relation, and pressure contracts as people. `kind: "collective"` supplies the behavioral distinction.

### Product build envelope

Zod stage schemas and the deterministic whole-world validator enforce the same bounds:

| Structure | Minimum | Maximum | Additional gate |
|---|---:|---:|---|
| persistent locations | 3 | 10 | exactly one starting macro location |
| directed routes | 2 | 30 | every persistent macro location is reachable from the start |
| all actors | 4 | 16 | at least one key person, two support people, and one collective |
| goals | 4 | 32 | one to three active goals for every key person, support person, and collective; background actors may have zero or one |
| relations | 3 | 32 | every key person and collective participates in at least one relation |
| placements | 4 | 32 | key and support people occupy at least two different reachable locations |
| pressures | 2 | 6 | every pressure has a nonempty trajectory and at least one actor or location anchor; at least two have different anchor sets |

Each pressure accepts at most eight actor anchors and eight location anchors. Names are 1 to 120 characters. Summaries, descriptions, objectives, motivations, relation text, and trajectories are 1 to 1,200 characters. Tags and traits contain at most 20 entries of 1 to 80 characters. These limits keep every stage inside the configured prompt and output budget.

Underflow and overflow fail in both the stage schema and whole-world validator. Live acceptance uses the same structural thresholds, then adds human coherence review.

### Model stages

The builder makes three model calls:

1. `world_frame`: a world-owned summary, locations, and directed routes. The source premise remains immutable provenance.
2. `world_cast`: people, collectives, goals, and placements against the accepted frame.
3. `world_connections`: actor relations and starting pressures against the accepted frame and cast.

`validation` and `persistence` are code-only stages. The build service emits `stage_started` and `stage_completed` for both, giving the client deterministic progress before the terminal event.

Each call uses `safeGenerateObject` with:

```ts
{
  strictSchema: true,
  allowRepair: false,
  allowTextFallback: false,
  retries: 1,
}
```

The active provider must advertise a structured-output strategy before the build starts. A model contract failure ends the build with a stable error code. The player may start a new build explicitly after a failed attempt.

In `safeGenerateObject`, `const maxAttempts = opts.retries ?? MAX_RETRIES` makes `retries: 1` one total attempt and zero retry loops. Campaign World forbids `0` and evidence rejects a `full_retry` trace.

Model output uses stage-local string references for cross-links. Code validates exact reference equality and assigns persistent UUIDs after all stages pass. Database IDs therefore come from the builder boundary.

### Persistence schema

The migration adds:

- `campaign_worlds`
- `campaign_world_builds`
- `campaign_world_build_events`
- `campaign_world_build_stages`
- `actors`
- `actor_goals`
- `actor_relations`
- `actor_placements`
- `world_pressures`
- `world_pressure_actors`
- `world_pressure_locations`

The repository reuses `locations` and `location_edges`. A second location graph would create a projection problem for later Rulebook work.

`campaign_worlds` exists after a successful commit and stores `review | accepted`, version, content hash, source digest, source snapshot, world summary, build timestamp, and acceptance timestamp. `campaign_world_builds` preserves provider/model identity, the exact normalized source snapshot, its digest, and `running | completed | failed` for every attempt. A partial unique index on `campaign_world_builds.campaign_id` where status is `running` owns the build lock. `campaign_world_build_events` stores monotonic sequence numbers and terminal events before SSE delivery. `campaign_world_build_stages` stores model-contract evidence without prompts or reasoning. The state API derives `unbuilt | building | failed` from the absence of `campaign_worlds` plus the latest build row.

Primary-key and foreign-key rules:

- `campaign_worlds.campaign_id` is both primary key and cascade foreign key to `campaigns.id`.
- build IDs and entity IDs are primary keys; every table also carries an indexed `campaign_id`.
- `(build_id, sequence)` is unique and sequence is positive.
- `(build_id, stage)` is unique for model-contract evidence.
- actor goals cascade with their actor.
- actor relation endpoints cascade with their actors and enforce different source and target IDs.
- actor placements cascade with actor or location and are unique by `(actor_id, location_id, placement_kind)`.
- pressure link rows cascade with pressure, actor, or location.
- new Campaign World tables enforce world version at least 1, goal priority 1 to 5, relation intensity 1 to 5, pressure urgency 1 to 5, and positive event sequence through SQLite checks.
- `location_edges.travel_cost` belongs to a reused table without a check constraint. Zod and the deterministic validator enforce 1 to 10 before persistence; this goal does not recreate the existing SQLite table.
- `accepted_at` is populated only when world status is `accepted`.

`backend/src/campaign-world/world-database.ts` opens a dedicated better-sqlite3 and Drizzle handle for one campaign ID, enables WAL, foreign keys, and the busy timeout, and returns an explicit `close` function. Campaign World repositories receive this handle as an argument and never call the global `getDb`. A background build holds its campaign handle until its terminal transaction finishes, so `loadCampaign` may switch the app-wide active campaign without closing or redirecting the build database.

`backend/src/campaign-world/world-source-lock.ts` owns a keyed in-process mutex for this single-process desktop backend. DNA mutation and build acquisition use the same campaign key. Build acquisition reads and normalizes config once, validates the expected digest, and stores the exact source snapshot and digest in the running build row while the mutex is held. The worker reads that row and never rereads `config.json`.

The commit order is:

1. Open a campaign-scoped database handle.
2. Hold the campaign source mutex, create a build row with the frozen source snapshot, and acquire the partial-unique campaign lock.
3. Generate all stages in memory and commit each progress event.
4. Validate the complete draft.
5. In one success transaction, insert all domain rows, write `campaign_worlds`, update the build to `completed`, release the lock through the status change, and append `build_completed`.
6. Publish the already committed terminal event, then close the campaign handle.

One failure transaction updates the build to `failed`, appends `build_failed`, and releases the lock. Domain rows stay empty. On the first Campaign World access after process start, the build service marks a running build without a live in-process coordinator as `process_interrupted` through the same failure transaction. The player starts the next attempt explicitly.

This ordering removes the success crash window. A committed review world always has a completed build row and terminal event in the same transaction.

Each model-stage evidence row records requested mode, primary strategy, actual strategy, total attempts, repair-used, retry-used, text-fallback-used, response model, finish/error code, and token counts when the provider reports them. It stores no prompt text, model output, or reasoning. Both live acceptance bundles export these rows as `model-contract-evidence.json` and require one attempt with every forbidden-strategy flag false.

### API

`backend/src/routes/campaign-world.ts` owns:

| Method | Route | Contract |
|---|---|---|
| GET | `/api/campaigns/:id/world/source` | Load premise, optional DNA, source summary, source digest |
| PUT | `/api/campaigns/:id/world/dna` | Validate a complete DNA draft, delegate storage to `saveWorldSeeds`, and return the new source digest |
| POST | `/api/campaigns/:id/world/builds` | Validate the expected source digest, acquire the lock, return `202` and `buildId` |
| GET | `/api/campaigns/:id/world/builds/:buildId/events` | Replay and stream sequenced events after `Last-Event-ID` or `afterSequence` |
| GET | `/api/campaigns/:id/world/state` | Return status, current build ID/stage/last sequence, and the persisted review projection when available |
| POST | `/api/campaigns/:id/world/accept` | Accept `review` state using expected version and content hash |

The build event union contains `build_started`, `stage_started`, `stage_completed`, `build_completed`, and `build_failed`. The server writes the event sequence as the SSE `id`. Delivery is at least once, and clients deduplicate by `(buildId, sequence)`. A new client instance calls `/world/state`; when it finds a running build, it replays from `afterSequence=0` and reconstructs progress from the durable ledger. An existing client resumes after its last applied sequence. One terminal event exists per build. SSE completion points the client to `/world/state`; it does not carry the world as an alternate truth payload.

## Architecture slice

### Files to create

- `shared/src/campaign-world.ts`
- `backend/drizzle/0024_campaign_world.sql`
- `backend/src/campaign-world/contracts.ts`
- `backend/src/campaign-world/world-database.ts`
- `backend/src/campaign-world/world-source-lock.ts`
- `backend/src/campaign-world/world-source.ts`
- `backend/src/campaign-world/world-prompts.ts`
- `backend/src/campaign-world/world-builder.ts`
- `backend/src/campaign-world/world-validator.ts`
- `backend/src/campaign-world/world-snapshot.ts`
- `backend/src/campaign-world/world-repository.ts`
- `backend/src/campaign-world/world-build-service.ts`
- `backend/src/campaign-world/index.ts`
- `backend/src/campaign-world/world-database.test.ts`
- `backend/src/campaign-world/world-source-lock.test.ts`
- `backend/src/campaign-world/world-source.test.ts`
- `backend/src/campaign-world/contracts.test.ts`
- `backend/src/campaign-world/world-builder.test.ts`
- `backend/src/campaign-world/world-validator.test.ts`
- `backend/src/campaign-world/world-snapshot.test.ts`
- `backend/src/campaign-world/world-repository.test.ts`
- `backend/src/campaign-world/world-build-service.test.ts`
- `backend/src/routes/campaign-world.ts`
- `backend/src/routes/campaign-world.test.ts`
- `frontend/lib/campaign-world-api.ts`
- `frontend/lib/campaign-world-api.test.ts`
- `frontend/components/campaign-forge/world-build-workspace.tsx`
- `frontend/components/campaign-forge/world-build-workspace.test.tsx`
- `frontend/components/world-review/actors-section.tsx`
- `frontend/components/world-review/actors-section.test.tsx`
- `frontend/components/world-review/connections-section.tsx`
- `frontend/components/world-review/connections-section.test.tsx`
- `frontend/components/world-review/overview-section.tsx`
- `frontend/components/world-review/overview-section.test.tsx`

### Files to modify

- `shared/src/index.ts`
- `backend/src/db/schema.ts`
- `backend/src/ai/generate-object-safe.ts`
- `backend/src/ai/__tests__/generate-object-safe.test.ts`
- `backend/drizzle/meta/_journal.json`
- the Drizzle snapshot generated with migration `0024`
- `backend/src/index.ts`
- `backend/src/routes/campaign-kernel.ts`
- `backend/src/routes/__tests__/campaign-kernel.test.ts`
- `backend/src/routes/worldgen.ts`
- `backend/src/routes/__tests__/worldgen.test.ts`
- `frontend/app/(non-game)/campaign/[id]/forge/page.tsx`
- move `frontend/app/(non-game)/campaign/[id]/forge/__tests__/page.test.tsx` to `frontend/app/(non-game)/campaign/[id]/forge/page.test.tsx`
- `frontend/app/(non-game)/campaign/[id]/review/page.tsx`
- move `frontend/app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx` to `frontend/app/(non-game)/campaign/[id]/review/page.test.tsx`
- `frontend/components/world-review/locations-section.tsx`
- `frontend/components/non-game-shell/campaign-status-provider.tsx`
- `frontend/components/non-game-shell/app-sidebar.tsx`
- focused tests for the changed shell components
- `frontend/lib/api.ts`
- `frontend/lib/api-types.ts` when the removed scaffold write types have no remaining caller
- `frontend/lib/campaign-kernel-api.ts` and its existing tests after Forge caller removal

### Files to delete after caller proof

- `frontend/lib/world-data-helpers.ts` and its tests when Review is its final production caller
- `frontend/components/world-review/factions-section.tsx` and its tests
- `frontend/components/world-review/npcs-section.tsx` and its tests
- `frontend/components/world-review/lore-section.tsx` and its tests
- `frontend/components/world-review/premise-section.tsx` and its tests when Overview replaces its final caller
- `frontend/components/world-review/regenerate-dialog.tsx` and its tests when Locations drops its displaced regeneration control

### Files to avoid

- `backend/src/engine/**`
- `backend/src/worldgen/**` as implementation dependencies
- `backend/src/campaign-kernel/**`
- `frontend/app/game/**`
- `frontend/app/(non-game)/campaign/[id]/character/**`
- `backend/src/routes/chat.ts`
- `e2e/88-living-world-playtest.ts`
- `e2e/phase-94/**`
- `frontend/scripts/visual-v4-smoke.mjs`
- TarotEngine and external reference repository source

The implementation may read donor files. It may import only `readCampaignConfig`, `saveWorldSeeds`, campaign path safety helpers, provider resolution, `safeGenerateObject`, and shared domain contracts across the boundary. Any extra donor import requires a task note with its owner and removal proof.

## Implementation tasks

### Task 0: execution preflight and blast radius

Files:

- create `rpi/campaign-world-build/implement/00-impact.md` during execution;
- modify no production file.

Work:

- verify the checked-out branch is `feat/revamp` and record the initial dirty tree without changing unrelated files;
- copy the numbered execution tasks into the active checklist in `tasks/todo.md` before production edits;
- inspect `.gitnexus/meta.json` and refresh the index while preserving embeddings;
- run upstream impact for `CampaignForgePage`, `WorldReviewPage`, `handleCreateWorld`, `generateWorld`, `saveWorldSeeds`, `safeGenerateObject`, `locations`, `locationEdges`, and every named symbol before its edit;
- run context for `CampaignForgePage`, `WorldReviewPage`, and the old worldgen handlers;
- record direct callers, affected processes, and risk.

Gate:

- HIGH or CRITICAL risk pauses implementation and reports the affected path to the owner;
- the task note lists every d=1 caller that later tasks must update.

Parallel: blocks all production edits.

### Task 1: shared contract and storage schema

Files:

- create `shared/src/campaign-world.ts`;
- modify `shared/src/index.ts`, `backend/src/db/schema.ts`;
- generate `backend/drizzle/0024_campaign_world.sql` and matching Drizzle metadata.

Work:

- add the shared status, source, world, actor, goal, relation, placement, pressure, build event, review, and acceptance types;
- add the Campaign World tables and foreign keys;
- reuse `locations` and `locationEdges`;
- add SQLite checks for world version at least 1, goal priority 1 to 5, relation intensity 1 to 5, pressure urgency 1 to 5, positive event sequence, actor self-relations, and accepted timestamp/status consistency;
- keep route-cost enforcement in Zod and the deterministic validator because `location_edges` is reused without table recreation.

Verification:

```powershell
npm --prefix shared run build
npm --prefix backend run typecheck
git diff --check
```

Evidence:

- generated SQL and schema diff;
- a table/foreign-key inventory in the task note;
- `campaign-world.ts` imports the existing `CampaignWorldDna` from `shared/src/types.ts` and does not redefine it;
- fixed-string search showing the new shared contract has no scaffold or faction collection.

Parallel: contract definitions land before Tasks 2A through 4. Schema work can share a branch only with the contract owner.

### Task 2A: campaign source and DNA ownership

Files:

- create `backend/src/campaign-world/world-source-lock.ts`;
- create `backend/src/campaign-world/world-source-lock.test.ts`;
- create `backend/src/campaign-world/world-source.ts`;
- create `backend/src/campaign-world/world-source.test.ts`.

Work:

- normalize premise, optional DNA, saved research, source selection, and source references into `CampaignWorldSource`;
- read the stored DNA draft from `CampaignConfigFile.seeds` through `readCampaignConfig`;
- convert complete `WorldSeeds` to `CampaignWorldDna` at this boundary; the stored form remains `string[]`, canonical/digest normalization joins entries with the literal delimiter `; `, and DNA save splits only on literal `;`; trim entries, reject empty entries or a stored entry containing `;`, and preserve commas inside one flavor;
- make `saveWorldSeeds` the sole writer used by `PUT /world/dna`;
- serialize post-creation DNA writes and build acquisition through the keyed Campaign World source mutex;
- compute a stable source digest from the normalized build input;
- allow source changes only in `unbuilt` or `failed` state.

Verification:

```powershell
npm --prefix backend run test -- src/campaign-world/world-source-lock.test.ts src/campaign-world/world-source.test.ts
npm --prefix backend run typecheck
```

Evidence:

- premise-only, complete-DNA, and saved-research fixtures produce stable source digests;
- a source change produces a different digest;
- DNA save calls `saveWorldSeeds` once and a reload returns the same normalized DNA;
- cultural-flavor fixtures prove array -> canonical string -> array identity and reject an entry containing the reserved `;` delimiter;
- `kernel.json` remains byte-identical in the test fixture;
- invalid campaign config fails the request instead of becoming empty source context.
- mutex tests serialize callbacks for one campaign while allowing different campaign keys to proceed independently.

Parallel: follows Task 1 and owns only source files.

### Task 2B: strict model schemas and reviewed prompts

Files:

- create `backend/src/campaign-world/contracts.ts`;
- create `backend/src/campaign-world/contracts.test.ts`;
- create `backend/src/campaign-world/world-prompts.ts`;
- create `rpi/campaign-world-build/plan/prompt-review.md`.

Work:

- define strict Zod contracts for frame, cast, and connection stages using the exact shared fields;
- apply the product build envelope's array and text bounds directly in the stage schemas;
- define local-reference formats through Zod string constraints and exact equality, with no regex parser or generated UUID field;
- review prompts and player-safe error copy through Droid GLM, `humanizer`, and `deslop`;
- record the prompt owner, allowed context, forbidden inventions, and GLM verdict.

Verification:

```powershell
npm --prefix backend run test -- src/campaign-world/contracts.test.ts
npm --prefix backend run typecheck
```

Evidence:

- schema fixtures accept one valid world frame, cast, and connections packet;
- underflow and overflow fixtures fail at the Zod boundary for every bounded collection;
- missing semantics, extra keys, invalid enums, and unresolved local references fail closed;
- the review note contains an aligned verdict before builder code lands.

Parallel: follows Task 1 and can run beside Task 2A with disjoint files.

### Task 3: staged world builder and deterministic validator

Files:

- create `backend/src/campaign-world/world-builder.ts`;
- create `backend/src/campaign-world/world-validator.ts`;
- create `backend/src/campaign-world/world-snapshot.ts`;
- create builder, validator, and snapshot tests.
- modify `backend/src/ai/generate-object-safe.ts` and its existing test to expose a read-only `getSafeGenerateObjectTrace(error)` helper without changing generation behavior.

Work:

- implement the frame, cast, and connections calls;
- enforce strict schema, primary structured output, one attempt, and one owner per stage;
- return sanitized model-contract evidence for every successful or failed model stage;
- resolve stage-local references into code-owned UUIDs;
- validate graph connectivity, starting location, unique references, actor distribution, placements, goals, relations, and pressure links;
- enforce the same product build envelope after cross-stage composition;
- create canonical serialization and a stable content hash that excludes timestamps and build telemetry.

Verification:

```powershell
npm --prefix backend run test -- src/campaign-world/world-builder.test.ts src/campaign-world/world-validator.test.ts src/campaign-world/world-snapshot.test.ts src/ai/__tests__/generate-object-safe.test.ts
npm --prefix backend run typecheck
```

Evidence:

- valid premise-only and DNA fixtures;
- invalid reference, duplicate reference, disconnected graph, unplaced person, self-relation, missing goal, and unbound pressure failures;
- whole-world underflow and overflow fixtures match the Zod collection limits, including missing key/support/collective roles and fewer than two anchored pressures;
- collective actor fixture stored through ordinary actor contracts;
- trace assertions reject repair, retry, text fallback, or coercion;
- stage evidence includes strategy, attempt, response-model, and error metadata while excluding prompt, output, and reasoning text;
- identical canonical worlds yield identical hashes.

Parallel: can run beside Task 4 after Tasks 1, 2A, and 2B. It writes no repository or route file.

### Task 4: atomic repository and durable build ledger

Files:

- create `backend/src/campaign-world/world-database.ts`;
- create `backend/src/campaign-world/world-database.test.ts`;
- create `backend/src/campaign-world/world-repository.ts`;
- create `backend/src/campaign-world/world-repository.test.ts`.

Work:

- open explicit campaign-scoped database handles without mutating the global active connection;
- require the campaign load/create path to apply migration `0024`, then have the dedicated factory verify the Campaign World tables before use and fail with `campaign_schema_outdated` when the file is not migrated;
- acquire one running build per campaign through the partial unique index;
- store the normalized source snapshot and digest in the running build row during acquisition;
- persist sequenced events before delivery;
- persist sanitized model-stage evidence beside the build;
- commit domain rows, world metadata, completed build status, lock release, and terminal success event in one transaction;
- commit build failure, lock release, and terminal failure event in one transaction;
- load the review projection from saved rows;
- accept using expected version and hash;
- record failed and interrupted builds;
- keep persistent IDs stable across state reads and acceptance.

Verification:

```powershell
npm --prefix backend run test -- src/campaign-world/world-database.test.ts src/campaign-world/world-repository.test.ts
npm --prefix backend run typecheck
```

Evidence:

- temp-database proof for transaction rollback, second-build conflict, stale accept conflict, event ordering, one terminal event, restart readback, and SQLite `integrity_check`;
- start build A, switch the app-wide active campaign to B, finish A, and prove that A and B retain isolated rows in their own `state.db` files;
- injected failure between candidate preparation and terminal commit leaves either the complete review world plus completed event or no domain rows plus failed event;
- state-transition tests cover unbuilt -> building -> review -> accepted and failed -> building;
- review and accepted worlds reject another build, and building/review/accepted states reject DNA mutation;
- a campaign containing scaffold or turn rows returns `campaign_recreation_required` before the build lock is acquired;
- a failed transaction leaves zero locations, actors, goals, relations, placements, and pressures for the campaign;
- review projection equals the canonical repository projection.
- review and accepted projections read source only from `campaign_worlds.source_snapshot_json`.
- Campaign World inserts rely on defaults for `connectedTo`, `persistence`, `anchorLocationId`, `expiresAtTick`, `archivedAtTick`, and `discovered`; canonical reads and hashes ignore these engine-era columns, and compatibility backfill cannot change the Campaign World hash.
- an unmigrated campaign database fails before build acquisition; a campaign loaded through the normal route opens successfully with migration `0024` present.

Parallel: can run beside Task 3 after Task 1. It writes no prompt or builder file.

### Task 5A: build service and process recovery

Files:

- create `backend/src/campaign-world/world-build-service.ts`;
- create `backend/src/campaign-world/world-build-service.test.ts`;
- create `backend/src/campaign-world/index.ts`;

Work:

- connect source, builder, validator, repository, and durable events;
- acquire the source mutex, freeze normalized source in the running build row, and release the mutex before model work;
- register the live coordinator synchronously after the build-row transaction and before releasing the source mutex or returning `202`;
- start builds independently from an SSE subscriber;
- hold one campaign-scoped database handle from build acquisition through terminal transaction;
- keep a process-local coordinator registry keyed by campaign and build IDs;
- recover an orphaned running build on first Campaign World access after restart;
- close the dedicated handle after success or failure.

Verification:

```powershell
npm --prefix backend run test -- src/campaign-world/world-build-service.test.ts
npm --prefix backend run typecheck
```

Evidence:

- provider failure produces a durable terminal failure and no domain rows.
- model stages consume the build-row source snapshot and perform no config read after acquisition;
- campaign switching during a model call cannot close or redirect the build handle;
- process recovery writes `process_interrupted` once and permits a new explicit build;
- an immediate `/world/state` read after build creation observes the registered coordinator and cannot misclassify the new build as interrupted;
- a successful build reaches `review`; only the accept service reaches `accepted`.
- a barrier test races DNA save against build acquisition: one operation commits and the other receives the matching `409` without a mixed source snapshot.

Parallel: follows Tasks 2A through 4.

### Task 5B: Campaign World route and resumable SSE

Files:

- create `backend/src/routes/campaign-world.ts`;
- create `backend/src/routes/campaign-world.test.ts`;
- modify `backend/src/index.ts`.

Work:

- expose source, DNA save, build creation, state, event replay, and acceptance routes;
- resolve the campaign through the normal load/create migration path before opening a Campaign World database handle;
- replay events after `Last-Event-ID` or `afterSequence` and emit sequence as the SSE `id`;
- return `currentBuildId`, current stage, and last persisted sequence from `/world/state`;
- return stable error codes and player-safe messages;
- deduplicate route-visible terminal delivery by persisted sequence.

Verification:

```powershell
npm --prefix backend run test -- src/routes/campaign-world.test.ts
npm --prefix backend run typecheck
```

Evidence:

- route integration uses a real temporary SQLite database and mocks only the provider boundary;
- disconnect and resume uses at-least-once delivery, and a client deduplicating by sequence applies each event once;
- a new client instance reloads state, replays from sequence zero, and reaches the committed terminal event;
- SSE completion is followed by a fresh state read;
- two simultaneous starts produce one `202` response and one `409`; the completed build enters `review` until the separate accept call;
- provider failure produces a durable terminal failure and no domain rows.

Parallel: follows Task 5A.

### Task 6: UI and copy design gate

Files:

- create `rpi/campaign-world-build/plan/ui-plan.md`;
- create a Droid prompt under `.codex/droid-prompts/`;
- modify no production UI file.

Work:

- send Forge generation and World Review to Droid GLM-5.2 Coding Plan;
- use `docs/UI Concept.html` as the visual source;
- replace the visual concept's faction stage with Actors and Connections;
- define desktop and narrow viewport states for source editing, active build, failure, review, and accepted world;
- review visible copy through `humanizer` and `deslop`.

Gate:

- GLM verdict and required changes are recorded in `ui-plan.md`;
- Tasks 7, 8A, and 8B wait for an aligned verdict.

Parallel: can run while Tasks 5A and 5B are under review. It blocks production UI edits.

### Task 7: Campaign World client and Forge workspace

Files:

- create `frontend/lib/campaign-world-api.ts` and its test;
- create `frontend/components/campaign-forge/world-build-workspace.tsx` and its test;
- modify `frontend/app/(non-game)/campaign/[id]/forge/page.tsx` and its test.

Work:

- implement source load, DNA save, build creation, event replay/resume, state load, acceptance, and typed errors;
- render Locations, Actors, Connections, and Review preparation progress;
- track the last applied sequence while the page is mounted;
- after browser reload, call `/world/state`, recover `currentBuildId`, replay its ledger from sequence zero, and deduplicate by sequence;
- redirect to Review only after `/world/state` returns the completed persisted version;
- remove Campaign Kernel, character cast, and old world generation ownership from Forge.

Verification:

```powershell
npm --prefix frontend run test -- --run 'lib/campaign-world-api.test.ts' 'components/campaign-forge/world-build-workspace.test.tsx' 'app/(non-game)/campaign/[id]/forge/page.test.tsx'
npm --prefix frontend run typecheck
```

Evidence:

- component tests cover premise-only, edited DNA, active build, reload through a new client instance, stream resume, terminal failure, persisted completion, and duplicate-click prevention;
- request assertions use only Campaign World endpoints for post-creation world work;
- fixed-string checks confirm `worldgen-surface`, `worldgen-elapsed`, and `kernel-phase` are gone from the touched Forge page and tests; replacements use `worldBuildSurface`, `buildElapsed`, and `worldStatus` domain names;
- targeted screenshots match the approved GLM plan at desktop and narrow viewport.

Parallel: follows Tasks 5B and 6. It owns Forge and the client only.

### Task 8A: persisted World Review

Files:

- create the new actor, connection, and overview sections and tests;
- modify Review page, Review test, and Locations section;
- retain `frontend/components/world-review/review-workspace.tsx` as the layout container; caller proof must not classify it as displaced;
- remove `RegenerateDialog` wiring from Locations;
- delete the displaced Factions, NPCs, Lore, Premise, and Regenerate Dialog files after caller proof.

Work:

- load Review only from `/world/state`;
- show source summary, locations, routes, people, collectives, goals, placements, relations, and pressures;
- accept using the displayed version and hash;
- show accepted status after reload;
- keep Player Character as a later step and remove the link into the current character flow;

Verification:

```powershell
npm --prefix frontend run test -- --run 'app/(non-game)/campaign/[id]/review/page.test.tsx' 'components/world-review/overview-section.test.tsx' 'components/world-review/actors-section.test.tsx' 'components/world-review/connections-section.test.tsx'
npm --prefix frontend run typecheck
```

Evidence:

- Review tests prove relation and placement navigation by stable ID;
- stale acceptance displays a conflict and reloads current state;
- accepted review survives page reload;
- UI and test titles contain Actors and Connections, with no Factions tab or count;
- targeted screenshots match the approved GLM plan.

Parallel: follows Tasks 5B, 6, and 7 because Review consumes the landed Campaign World client contract.

### Task 8B: campaign shell status and caller-proof cleanup

Files:

- modify `frontend/components/non-game-shell/campaign-status-provider.tsx`;
- modify `frontend/components/non-game-shell/app-sidebar.tsx`;
- modify focused shell tests;
- remove the displaced Review components and helpers listed under caller-proof deletion.

Work:

- derive the active campaign label and step state from `/world/state`;
- show unbuilt, building, review, failed, and accepted states with approved copy;
- rename provider fields such as `generationReady` to Campaign World domain state, keep Character unavailable for this goal, and replace the touched route-ID regex with literal path-segment parsing;
- run fixed-string caller checks before each deletion;
- keep untouched character and game donors outside the Campaign World navigation.

Verification:

```powershell
npm --prefix frontend run test -- --run 'components/non-game-shell/__tests__/app-shell.test.tsx'
npm --prefix frontend run typecheck
```

Evidence:

- shell status changes after build completion and acceptance without reading `generationComplete`;
- changed shell files introduce no regex and expose no Character link as available;
- deleted components have zero production and test imports;
- Campaign World navigation exposes Forge and Review only.

Parallel: follows Tasks 7, 8A, and the approved UI plan.

### Task 9: active-path cutover and displaced writer removal

Files:

- modify `backend/src/routes/worldgen.ts` and its tests;
- modify `backend/src/routes/campaign-kernel.ts` and `backend/src/routes/__tests__/campaign-kernel.test.ts`;
- modify `frontend/lib/api.ts` and `frontend/lib/api-types.ts` as caller analysis permits;
- modify `frontend/lib/campaign-kernel-api.ts` and its tests;
- delete `frontend/lib/world-data-helpers.ts` when its final caller is gone;
- update the active task notes.

Work:

- remove `/generate`, `/regenerate-section`, and `/save-edits` handlers and their exclusive imports;
- remove `/campaigns/:id/world-dna/apply`, `/world-dna/suggest`, and `/world-dna/suggest-category` from the mounted Campaign Kernel route after GitNexus impact analysis;
- make Campaign World source service the sole mounted post-creation DNA writer;
- remove `generateWorld`, `regenerateSection`, `saveWorldEdits`, scaffold write DTOs, and current Review adapters after fixed-string caller checks;
- remove `applyWorldDna`, `suggestCampaignWorldDna`, and `suggestCampaignWorldDnaCategory` from the Campaign Kernel client after Forge moves to Campaign World source APIs;
- retain intake research, worldbook, and pre-campaign DNA operations for the later Campaign Intake goal;
- leave donor worldgen source unimported by Campaign World;
- keep `generationComplete` confined to untouched donor routes until their own cutover. Campaign World never writes it.

Verification:

```powershell
npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts
npm --prefix backend run test -- src/routes/__tests__/campaign-kernel.test.ts
npm --prefix backend run typecheck
npm --prefix frontend run test -- --run 'lib/__tests__/campaign-kernel-api.test.ts'
npm --prefix frontend run typecheck
git diff --check
```

Evidence:

- fixed-string searches show no Forge or Review reference to `generateWorld`, `regenerateSection`, `saveWorldEdits`, `generationComplete`, or `/api/kernel`;
- fixed-string searches show no production client reference to the displaced Campaign Kernel DNA functions;
- Campaign World production files contain no import path under `backend/src/worldgen`;
- route tests return `404` for the three displaced write endpoints;
- route tests return `404` for the three displaced Campaign Kernel DNA endpoints;
- a fixed-string search shows no mounted route outside `campaign-world.ts` calls `saveWorldSeeds` after campaign creation;
- remaining worldgen tests cover intake operations only.

Parallel: follows Tasks 7, 8A, and 8B.

### Task 10: regression, playtest, and promotion gate

Files:

- create run artifacts under `output/playtests/campaign-world-build/<run-id>/`;
- add the final review section to `tasks/todo.md`;
- modify production code only through a new reviewed fix task when a gate fails.

Automated verification:

```powershell
npm --prefix shared run build
npm --prefix backend run typecheck
npm --prefix frontend run typecheck
npm --prefix backend run test
npm --prefix frontend run test -- --run
git diff --check
```

The full backend and frontend suites are justified because this goal changes the central schema, route registration, Forge, Review, and shell status. They are regression suites, not smoke tests.

Live acceptance A, premise only:

1. Record commit, dirty status, provider, model, and isolated campaign root.
2. Create a fresh premise-only campaign through the real UI.
3. Build the world and capture every sequenced event.
4. Inspect one key person, one support person in another location, and one collective actor.
5. Trace their goals, placements, relations, and linked pressure in Review.
6. Accept the displayed version and hash.
7. Restart the backend, reload Review, and compare version, hash, IDs, and projection.

Live acceptance B, edited DNA:

1. Create another fresh campaign through Concept and DNA with research enabled, and save the resulting research artifact and source references through the current intake flow.
2. Edit one DNA field before build and save it through the Campaign World source route.
3. Confirm the source digest and accepted snapshot include the edit, research summary, and source references.
4. Repeat Review, acceptance, restart, and reload checks.

Each bundle contains:

- `manifest.json` with commit, dirty state, campaign/build IDs, provider/model, and timestamps;
- `events.jsonl` with ordered build events;
- `model-contract-evidence.json` with sanitized strategy and attempt records for every model stage;
- `source.json`, source digest, and normalized source references;
- `world-before-restart.json` and `world-after-restart.json`;
- `sqlite-integrity.txt` and focused table counts;
- content hash and acceptance receipt;
- Review screenshots at desktop and narrow viewport;
- browser console and network errors;
- human notes on coherence, distribution, useful tensions, and obvious contradictions.

World quality scorecard for each live run:

| Check | Promotion threshold |
|---|---|
| Reference integrity | zero unresolved entity, route, goal, relation, placement, or pressure references |
| Roster agency | every key person, support person, and collective has an autonomous active goal and a valid placement |
| Distribution | at least two occupied locations when the world has at least two people and two reachable locations; no unexplained all-cast co-location |
| Pressure structure | at least two pressure records have nonempty trajectories and different actor or location anchor sets |
| Collective modeling | every organization appears in `actors` with `kind: "collective"` and uses ordinary goals, relations, placements, and pressure links |
| Player centrality | zero human-controlled or player actors before the Character goal; generated agendas do not assume a future player is the center |
| Coherence | human review finds zero hard contradictions between premise, locations, actor goals, placements, relations, and pressures |
| Actionable world | human review identifies at least two plausible developments that can proceed without player involvement |

Every hard structural threshold covers the full roster and graph and matches the product build envelope. The coherence and actionable-world rows add human product judgment. The focused actor inspection in Review supplies readable evidence for the bundle.

Promotion stops on:

- partial domain rows after failure;
- duplicate or missing terminal events;
- a structured-output trace that used repair, coercion, retry, or text fallback;
- missing model-stage evidence or any stage with attempts other than one, mismatched primary/actual strategy, or a forbidden-strategy flag;
- a stale acceptance that succeeds;
- review data that differs from the canonical SQLite projection;
- changed IDs or content hash after restart;
- a key or support person without a goal or present placement;
- a collective represented through a separate faction record;
- a required actor or pressure reference that does not resolve;
- either live run fails a hard world-quality threshold;
- Forge or Review traffic to a displaced build path;
- player-facing failed turns or manual DB edits during the pristine lane.

Every fixed failure becomes a deterministic regression fixture. The live lane then restarts with a fresh campaign.

## Smoke-test policy

This goal creates no standalone smoke script and does not run Phase 88, Phase 94, or `visual:v4` as an acceptance shortcut. Focused route tests prove startup registration. The live Concept -> Forge -> Review runs prove the real player path. A readiness request before a live run is a preflight check, not a promotion artifact.

## Dependency and parallel map

```text
Task 0
  -> Task 1
      -> Task 2A ----\
      -> Task 2B -----+-> Task 3 ----\
      -> Task 4 ----------------------+-> Task 5A -> Task 5B --\
      -> Task 6 ----------------------------------------------+-> Task 7 -> Task 8A -> Task 8B -> Task 9 -> Task 10
```

Tasks 2A and 2B have disjoint source and prompt scopes. Tasks 3 and 4 have disjoint builder and repository scopes. Task 6 is a hard predecessor for production UI. Task 7 owns `campaign-world-api.ts`; Task 8A starts after that contract lands.

## Final cutover checks

Before commit:

1. Run GitNexus `detect_changes` for the full working tree.
2. Confirm every d=1 dependent from Task 0 was updated or recorded as a quarantined donor.
3. Run fixed-string boundary checks on changed mechanics files.
4. Review generated migration SQL and SQLite integrity output.
5. Confirm both live acceptance bundles contain actual provider and database evidence.
6. Record the PRE and UI GLM verdicts in `tasks/todo.md`.

Completion language:

- Use `implemented and accepted` after both live lanes pass.
- Use `implemented but unproven` when code and tests pass but player-path evidence is incomplete.
- Use `blocked` with the exact failed gate when a P0 condition remains.

## PRE review

Status: ALIGNED. Droid GLM-5.2 and an independent Krypton peer found no remaining blocker or major issue after convergence. Review record: `rpi/campaign-world-build/plan/pre-review.md`.

# Campaign Play Implementation Plan

**Intent:** Turn an accepted Campaign World into a durable single-player RPG where the player can act freely while people and collective actors pursue their own goals.
**Current Behavior:** Campaign World persists locations, routes, actors, goals, placements, relations, and pressures. The mounted `/game` flow reads a separate player, NPC, clock, item, chat-history, and clean-gameplay model. An accepted world therefore has no valid handoff into character setup, opening, or play.
**Expected Outcome:** Review acceptance leads to character creation or Character Card V2 import, grounded opening turn zero, and repeated player turns on `/campaign/[id]/play`. Judge and GM stages propose bounded results, the Rulebook commits every mechanical change with receipts, due actors act through the same boundary, visibility projects earned knowledge, and the narrator renders only committed player-visible facts.
**Target-Perspective Output:** A player enters a world that already has motion, sees one local situation rather than a cast dump, submits a suggested or freeform action, reloads safely, and discovers distant change through travel, aftermath, route state, or an informed witness. A playtest operator can trace every consequential sentence to a public observation and every world mutation to a Rulebook receipt while hidden state stays absent from the player surface.
**Truth Owner:** The campaign `state.db` owns immutable accepted-world provenance and mutable Campaign Play state. Existing Campaign World entity tables own macro regions, concrete persistent sublocations, routes, actors, goals, exact-scene placements, relations, and pressure definitions. Macro locations group player choices and world geography; persistent sublocations alone own playable scene presence, route endpoints, direct perception, and local aftermath. Receipt-bearing Rulebook/bootstrap transactions exclusively advance mechanical `worldVersion/worldHash`. Fenced runtime transactions exclusively advance `runtimeRevision/runtimeHash` for turns, plans, schedules, knowledge, observations, narration packets, and worker state.

A persistent sublocation is one directly perceivable scene, not a building or district containing offscreen rooms. Its stored `description` is a public-on-arrival surface and may contain only stable sensory or publicly obvious context; actor goals, relations, pressures, and protected events own secrets, concealed discoveries, private motives, and hidden causes. At this granularity, an actor's `present` placement means that the player can directly perceive and identify that actor when sharing the scene.
**Contract Boundary:** `@worldforge/shared` publishes Campaign Play DTOs and discriminated unions. `backend/src/campaign-play/` owns perception, Judge and GM orchestration, Rulebook validation and execution, actor scheduling, visibility, narration packets, persistence, and recovery. `/api/campaigns/:id/play/*` is the only active gameplay API.
**Cutover:** World Review links accepted campaigns to `/campaign/[id]/character`; character completion links to `/campaign/[id]/play`. The new page consumes one campaign-scoped public projection and one durable turn ledger. Backend startup mounts Campaign Play and stops mounting `/api/chat`.
**Displaced Path:** `/game`, `/api/chat/*`, `chat_history.json`, the global active-campaign gameplay controller, old world projection as gameplay authority, `players`, `npcs`, `world_clocks`, `turn_sagas`, `clean_gameplay_*`, Campaign Kernel play state, and `engine/gameplay-cycle-runtime` leave the active player path. Their source remains donor/reference material until later deletion work has caller proof.
**Value Density:** The first causal slice supports opening, observation, movement, contact, waiting, open attempts, four active world actors, two pressures, earned knowledge, reload, and restart. Combat, inventory economy, crafting, and semantic memory wait for later slices.
**Acceptance Evidence:** A fresh accepted world completes character setup, opening, one custom action, one peripheral wait/leave action, a sourced actor consequence, and reload through the normal UI; a 20-turn causal proof demonstrates receipts, secrecy, actor autonomy, and reload; a 30-turn live diagnosis converts defects into regressions; two fresh and one clone/provenance 60-turn campaigns pass uninterrupted through the normal UI; and a 300-turn soak survives scheduled restart, replay, and projection checks. A separate 600-turn run gates any sustained-longplay claim.
**Evidence Lane:** Focused deterministic contracts and transaction fault tests precede seeded 10/30/60 replays, live diagnostic play, pristine 60-turn acceptance, and the 300-turn soak. Build events and gameplay turns use separate ledgers and counts.
**Kill Criteria:** The product has no mounted `/game` page or `/api/chat` router. Current player routes import no Campaign Kernel or old gameplay-cycle runtime. Campaign Play reads no `generationComplete`, `players`, `npcs`, `world_clocks`, chat JSON, or old turn stores. Every mechanical mutation has a Rulebook/bootstrap receipt and causal world event. Every runtime mutation has a fenced runtime revision and campaign runtime event; turn-owned mutations also emit a durable sanitized turn event. One human actor and one active turn are allowed per campaign, accepted Review stays byte-stable after live play, and player DTOs contain no protected event payload or hidden actor state.
**Architecture Slice:** accepted snapshot prerequisite -> shared contract and SQLite schema -> Campaign Play repository -> character and opening -> Judge/GM -> atomic Rulebook -> actor scheduler -> visibility -> narrator -> durable turn service and API -> campaign-scoped UI -> hard cutover -> real playtest ladder.
**Plan Review Gate:** Requires PRE review before execution.

## Decision

Verdict: GO after the accepted-snapshot and player-actor handoff prerequisites in Tasks 1A and 1B.

Campaign Play is a fresh mechanics-owned runtime over Campaign World entities. The existing gameplay runtime supplies behavioral examples and regression ideas. Its repositories, global route, chat persistence, restore semantics, and old entity model stay outside the new import graph.

This restores the full product promise:

1. Campaign World creates and accepts a coherent world.
2. Campaign Play lets the player enter that world.
3. World actors continue to act under the same Rulebook.
4. Visibility controls what the player can learn.
5. Narration presents settled truth and adds no mechanical facts.

## Scope

This goal delivers:

- immutable accepted-world provenance that remains readable after live mutation;
- one human-controlled person actor with a canonical CharacterRecord profile;
- Character Card V2 parsing/import and generated character drafts through campaign-owned routes;
- player-selected or planner-selected starting conditions;
- an opening planner that compiles prose actor goals into typed bounded plans;
- one grounded opening scene and up to four valid suggested actions;
- freeform `observe`, `move`, `contact`, `wait`, and `attempt` intents;
- strict Judge and GM plan stages with recorded provider evidence;
- one atomic Rulebook transaction for each prevalidated command batch;
- deterministic due-actor scheduling for people and collectives;
- causal world events, actor knowledge, player observations, and a journal;
- durable turn recovery, idempotent admission, and resumable SSE delivery;
- the full-screen Campaign Play surface from `docs/UI Concept.html`;
- hard cutover from the mounted chat/game path;
- deterministic, live, pristine, and long-horizon evidence.

Deferred slices:

- tactical combat, health simulation, and injury resolution;
- equipment, inventory economy, crafting, and shops;
- a universal rumor network or probabilistic belief model;
- semantic memory retrieval and model-authored reflection;
- unrestricted model-authored actor planning on every player turn;
- world dashboards that expose protected events or global actor goals;
- multiplayer and multiple human actors;
- production deletion of untouched donor source after a later repository cleanup goal.

## Player flow

```text
Concept
  -> Forge
  -> Review
  -> accept immutable Campaign World snapshot
  -> Character
  -> create, generate, or import the human actor
  -> choose starting conditions or delegate them
  -> opening planner binds one existing player motivation to a present person when motivations exist
  -> opening planner commits turn zero, the participant-scoped premise event, and typed actor plans
  -> Play shows one local situation
  -> player chooses a suggestion or submits freeform intent
  -> Judge bounds the attempt and code resolves uncertainty
  -> GM emits a typed command plan
  -> Rulebook prevalidates and atomically settles the primary batch
  -> scheduler freezes and settles due actor work
  -> visibility persists earned observations
  -> narrator renders the immutable public packet
  -> terminal turn unlocks the next input
```

Opening is turn zero. Playtest counts begin with the first submitted player action. A 60-turn lane therefore contains one opening plus 60 completed player actions.

## Ownership map

| Concern | Owner after cutover | Storage | Public reader |
|---|---|---|---|
| Accepted world and provenance | Campaign World repository | `campaign_worlds.accepted_snapshot_json`, accepted version/hash/time | World Review |
| Mechanical world version/hash/time | receipt-bearing Rulebook/bootstrap transactions | `campaign_play_states` plus canonical entity/play-state rows | Campaign Play state |
| Runtime revision/hash/phase | fenced Campaign Play runtime transactions | `campaign_play_states` plus current runtime rows | Campaign Play state |
| Regions, concrete scenes, and routes | Campaign World entities plus live route state | macro and `persistent_sublocation` rows in `locations`, concrete-only `location_edges`, `campaign_play_route_states` | Opening selector and perception projector |
| People and collectives | Campaign World actors | `actors` | Perception and actor frames |
| Human profile | Character service | human `actors` row plus `campaign_play_characters` | Character and player projection |
| Goals and actor plans | Campaign World goal definition plus Campaign Play planner | `actor_goals`, `campaign_play_actor_plans` | actor scheduler only |
| Placements and relations | Rulebook | `actor_placements`, `actor_relations` | scoped projections |
| Conditions and pressure progress | Rulebook | `campaign_play_actor_conditions`, `campaign_play_pressure_states` | scoped projections |
| Turn lifecycle | Turn service | `campaign_play_turns`, `campaign_play_turn_events` | turn read and SSE |
| Mechanical writes | Rulebook | `campaign_play_commands`, `campaign_play_receipts` | protected audit |
| Causal facts | Rulebook event writer | `campaign_play_events`, exposures | visibility service |
| Actor cadence | actor scheduler | plans, schedules, jobs, proposals | protected audit |
| Knowledge | visibility service | actor knowledge and player observations | journal and narrator packet |
| Player prose | narrator | `campaign_play_narrations` | public play state |
| Model execution evidence | stage adapter | `campaign_play_model_stages` | sanitized debug/evidence export |

## Domain contract

### Play lifecycle

```ts
type CampaignPlayPhase =
  | "character_required"
  | "opening_required"
  | "opening_active"
  | "ready"
  | "turn_active"
  | "narration_pending";

type CampaignPlaySetupPhase = "character_required" | "opening_required" | "ready";

type CampaignTurnStage =
  | "admitted"
  | "judged"
  | "planned"
  | "primary_settled"
  | "actors_settled"
  | "visibility_projected"
  | "interrupted"
  | "completed"
  | "failed";

type WorldIntentKind = "observe" | "move" | "contact" | "wait" | "attempt";
type ActorKind = "person" | "collective";
type ActorController = "human" | "agent";
type ActorRole = "player" | "key" | "support" | "background";
```

The unique human actor uses `kind: "person"`, `controller: "human"`, and `role: "player"`. Campaign World generation emits agent actors with key/support/background roles only. Scheduler evidence counts key/support/collective agent actors separately from the player.

`CampaignPlaySetupPhase` is stored on `campaign_play_states`. `CampaignPlayPhase` is a public projection derived from setup phase plus the unique active turn and its stage; the state row stores no second active-turn pointer.

The durable happy path is:

```text
admitted
-> judged
-> planned
-> primary_settled
-> actors_settled
-> visibility_projected
-> completed
```

`interrupted` is nonterminal, retains the active-turn lock, and carries the interrupted stage, worker epoch, typed error, and explicit-resume eligibility. `failed` is terminal, releases the lock, and records the mutation audit. A pre-settlement terminal failure has zero world mutation. A post-settlement narration interruption preserves the settled world and immutable narrator packet.

### Intent, judgment, and command contracts

`PlayerIntent` stores original text, source (`freeform` or `suggested`), an optional opaque choice handle, normalized intent kind, visible target handles, method, and stakes. Suggested choices enter the same Judge path as freeform input.

The Judge receives the player-visible frame plus server-side handle bindings. It returns:

- normalized intent;
- `deterministic`, `uncertain`, `impossible`, or `clarification_required` disposition;
- cited visible facts;
- allowed result bounds;
- elapsed-time bounds;
- uncertainty parameters when code must roll;
- one Judge-owned required possession effect, or explicit `none`; the typed requirement names acquire/spend/transform, an existing visible possession when applicable, quantity, and the lowest result tier that must produce it;
- a concise reason suitable for the GM planner.

Code owns the roll, seed, and result. The GM planner receives the ruling and emits a plan drawn from this command set:

```ts
type CampaignPlayCommand =
  | AdvanceWorldTimeCommand
  | MoveActorCommand
  | SetRouteStateCommand
  | SetActorConditionCommand
  | UpdateActorRelationCommand
  | UpdateActorGoalCommand
  | AdvancePressureCommand
  | AdjustActorPossessionCommand
  | RecordWorldEventCommand;

type CampaignPlayBootstrapCommand =
  | CreatePlayerActorCommand
  | InitializePlayerPlacementCommand
  | InitializeWorldTimeCommand
  | InitializePressureStateCommand;

type RulebookBatchCommand = CampaignPlayBootstrapCommand | CampaignPlayCommand;
```

Bootstrap commands are internal harness commands. Models receive no schema or handle that can emit them. `CreatePlayerActorCommand` is valid only in `character_required` with no human actor. The same character-bootstrap batch may then issue one protected positive `AdjustActorPossessionCommand` per normalized `CharacterRecord.loadout.inventorySeed` entry; repeated names become quantity, and signature-item prose is not materialized again. Opening-kind turns initialize exactly one player placement, the absent world clock, and one state row for each accepted pressure. The frozen Opening frame also carries an order-preserving exact deduplication of `CharacterRecord` motives followed by drives. When that list is non-empty, the planner selects one motivation by index and one selected-scene person by role; code resolves both values and appends exactly one `RecordWorldEventCommand` after initialization. That dialogue or interaction affects only the player, the present person, and the concrete start scene, uses direct perception, receives a Rulebook receipt/event, and does not advance mechanical world version. An empty list compiles no premise event and does not invent a quest. Each bootstrap command and the optional premise command have strict phase, source, participant, exposure, coverage, receipt/event, and exhaustive preflight/executor guards.

Each command carries command ID, causal parent, actor/system source, expected mechanical world version, read scope, write scope, typed arguments, and an exposure policy. The first character-bootstrap command is rooted in the immutable accepted-world campaign/version/hash provenance; later commands use turn, command, world-event, or actor-job parents. Player observations are derived by visibility predicates; GM and narrator stages receive no direct observation writer. Direct perception normally follows scene presence. The Opening premise is narrower: only its affected player and performing person earn knowledge, even when another person is co-located. Protected actor continuity reads applied Rulebook event commands, so a person remembers both actor-authored autonomous events and dialogue or interactions they performed under Opening or Game Master authority; rejected proposals and uncommitted commands confer no continuity. During player-turn actor settlement, an actor frame also reads applied current-turn `direct_perception` events whose event-time snapshot places that actor at the exact exposure scene. This transient frame view closes the primary-settlement-to-visibility ordering gap; final visibility projection remains the sole writer of durable actor knowledge.

### Rulebook invariants

- Preflight validates the complete batch before its first write.
- A command references current canonical IDs or outputs of earlier commands in the same batch.
- Write scopes are explicit and command-kind specific.
- Each accepted command receives one immutable receipt.
- Each mechanical state mutation emits one or more causal world events in the same transaction.
- Each runtime mutation advances runtime revision/hash and emits one protected campaign runtime event in the same transaction.
- A turn-owned runtime mutation also emits one sanitized durable turn event for replay/SSE in that transaction.
- Mutating commands advance logical mechanical world versions in command order.
- The batch updates mechanical `worldVersion/worldHash` once from its final state and advances `runtimeRevision/runtimeHash` when it also changes the turn stage.
- Validation failure produces zero domain writes and a typed denial record.
- The player and agent actors use the same command schemas and executor.
- Actor possessions are current Rulebook state. Acquisition and spending use typed quantity adjustments; prose-only possession claims carry no mechanical authority. Every opening-authored or replanned actor step carries a mandatory typed possession outcome. The current actor lane supports `none` or a positive named `acquire`; code derives the owner, possession identity, scopes, transition order, receipt, event, and persistence, while the step's authored sensory trace remains the visible summary. An acquisition emits one `AdjustActorPossessionCommand` instead of a duplicate prose event; move steps cannot acquire, and spending/transform remain outside this actor-plan slice. When the Judge rules that a player outcome at or above a named result tier must acquire, spend, or transform a possession, Game Master compilation requires exactly one matching effect before Rulebook preflight. Writing a usable record into a notebook, form, chart, or other retained object is a transform, not a prose-only discovery. A model-authored `transform` compiles to an atomic source spend followed by a result acquire in the same Rulebook batch. Only the result command is projected as the public consequence, so the Narrator receives one authored summary while both state changes receive receipts.
- The accepted actor roster owns person identity. A Game Master event may name only a roster person whose mention is supported by the supplied frame. Other residents remain unnamed ambient presence and cannot own a job, payment, permission, appointment, access, or expected reply in prose. Creating an actionable person requires a future typed Rulebook contract rather than a name embedded in an event summary.
- Character bootstrap is the one-way boundary from immutable `inventorySeed` provenance to current possession quantities. Opening setup and recovery expose those quantities before the first player action; CharacterRecord never becomes a second live inventory owner.
- Narrator, frontend, and SSE delivery possess zero mutation authority.

### Model boundary

Campaign Play calls `safeGenerateObject` with a strict schema, repair disabled, text fallback disabled, provider switching disabled, and one attempt per stage invocation.

The initial critical path contains:

1. Judge: parse and bound the player action.
2. GM planner: produce the ordered command plan from the ruling.
3. Narrator: render the frozen public packet.

The opening path contains opening planner and narrator calls. Routine actor actions execute persisted typed plans. Actor replanning invokes a strict planner only when a plan completes or its preconditions fail, and records that job separately from the player critical path.

Every stage stores requested/actual model, strategy, token counts, duration, finish reason, schema outcome, and error code. Prompts contain bounded frames and opaque IDs. Model output has proposal authority only. Route travel cost is code-owned: Judge binds a pure move to the exact visible route cost and raises a compound traversal's elapsed bounds to at least that cost before Rulebook planning.

## Persistence and transaction design

### Accepted snapshot prerequisite

Campaign World acceptance stores the exact accepted review projection in `accepted_snapshot_json` together with `accepted_world_version` and `accepted_content_hash`. Accepted Review reads this immutable projection. Live play mutates current entity rows while accepted provenance stays stable.

Campaign Play DTOs keep `acceptedWorldVersion`, mechanical `worldVersion`, and `runtimeRevision` as separate fields. Before character bootstrap, mechanical version/hash equal the accepted base. The receipt-bearing character bootstrap adds the human actor and profile digest, then zero to twenty normalized starting-possession quantities, to mechanical truth. Every command advances the mechanical version, so the public bootstrap response admits a bounded advance of one to twenty-one.

### Campaign Play schema

The foundational Campaign Play migrations follow the two Campaign World handoff migrations:

- `0027_campaign_play_core.sql`: state, character, campaign runtime event, turn, turn event, model stage, and narration; opening exists only as `campaign_play_turns.turn_kind = 'opening'`;
- `0028_campaign_play_rulebook.sql`: command, receipt, causal event, exposure, route state, actor condition, and pressure state;
- `0029_campaign_play_actors_visibility.sql`: plan, schedule, job, proposal, actor knowledge, and player observation.

Later current-contract migrations extend these same owners. `0035_campaign_play_actor_possessions.sql` adds actor-owned fungible quantities; it does not reuse the immutable CharacterRecord inventory or the displaced gameplay item/resource stores. `0036_campaign_play_character_inventory.sql` permits the protected character-bootstrap possession commands without a fictitious turn and widens only the internal bootstrap order bound; ordinary model, opening, player, and actor batches remain capped at sixteen commands.

| Table | Required contract |
|---|---|
| `campaign_play_states` | one row per campaign; accepted base version/hash, mechanical world version/hash, runtime revision/hash, next runtime-event sequence, world time, setup phase, opened timestamp |
| `campaign_play_characters` | one row per human actor; normalized CharacterRecord JSON, source kind, source digest |
| `campaign_play_runtime_events` | campaign runtime sequence, optional turn, mutation kind, prior/result runtime revision/hash, protected payload hash, timestamp |
| `campaign_play_turns` | kind, optional superseded turn, input, idempotency key, expected/base/final world version, stage, frame hash, next event sequence, worker lease owner/epoch/expiry, public packet hash, error and timestamps |
| `campaign_play_turn_events` | turn-local sequence, event type, sanitized payload, durable SSE cursor |
| `campaign_play_model_stages` | one numbered attempt per stage invocation with status, worker epoch, provider, model, strategy, usage, duration, schema result, artifact hash |
| `campaign_play_commands` | batch/order, command kind, expected version, read/write scopes, arguments hash and protected payload |
| `campaign_play_receipts` | command result, prior/result version, before/after hashes, causal event IDs |
| `campaign_play_events` | source, cause, affected refs, world time, protected before/after payload and hash |
| `campaign_play_event_exposures` | executable channel and typed location/route/witness/aftermath predicate |
| `campaign_play_route_states` | current open/restricted/blocked state and causal receipt; ordinary movement requires `open`, while one successful `restricted` traversal is committed as protected `open -> move -> restricted` commands in the same Rulebook batch |
| `campaign_play_actor_conditions` | typed current actor condition/status and causal receipt |
| `campaign_play_actor_possessions` | current nonnegative actor-owned quantity by deterministic possession key, with causal receipt and world version |
| `campaign_play_pressure_states` | progress, status, last advanced time, causal receipt |
| `campaign_play_actor_plans` | goal ref, typed intent, target refs, preconditions, cadence, bounded steps, status/version |
| `campaign_play_actor_schedules` | next/last act time, priority, agency debt, plan ref |
| `campaign_play_actor_jobs` | due reason, frozen base version, stage, result/proposal ref, timestamps |
| `campaign_play_actor_proposals` | base version, read/write scope, expiry, commands, accepted/rejected result |
| `campaign_play_actor_knowledge` | actor/event/channel/source knowledge with idempotent uniqueness |
| `campaign_play_observations` | human/event/exposure/source observation with public text data and idempotent uniqueness |
| `campaign_play_narrations` | opening/turn public packet hash, structured beats, validated choices, effects, prose and status |

Database constraints enforce:

- one human person actor per campaign through a partial unique index;
- one `present` placement per actor through a partial unique index;
- one active turn per campaign;
- one active/completed opening-kind turn and one play state per campaign; failed pre-mutation openings remain auditable and may be superseded;
- one pending actor job per actor;
- positive unique campaign runtime-event sequences allocated from the play-state row;
- positive unique per-turn event sequences allocated from the turn row;
- unique campaign/idempotency key;
- unique possession key per actor, nonnegative quantity, and one current-state mutation per causal receipt;
- unique actor/event knowledge and player/event/exposure/source observations;
- foreign keys from play state to the accepted Campaign World and from runtime rows to canonical entities.

### Mechanical and runtime hashes

Mechanical `worldHash` covers current world truth: world time; human actor identity and CharacterRecord digest; live route, actor condition, actor possession quantity, pressure state, placement, relation, and goal status. Only receipt-bearing character bootstrap, opening bootstrap, and Rulebook command batches advance `worldVersion/worldHash`.

Operational `runtimeHash` covers current simulation/control truth: setup phase; the uniquely active turn and stage derived from `campaign_play_turns`; typed actor plans and schedules; pending jobs/proposals; actor knowledge; player observations/consequences; narrator packet/status; worker lease epoch; next campaign runtime-event sequence; and next turn-event sequence. Play-state creation, character/bootstrap setup, turn admission, worker claims, fenced artifact acceptance, actor job transitions, visibility projection, interruption, explicit resume, and terminalization each advance `runtimeRevision/runtimeHash` and append a campaign runtime event in their transaction.

Append-only command/event/model/SSE audit rows, narration prose bytes, and playtest artifacts remain outside both current-state hashes. Their stored artifact hashes and sequence constraints provide ledger integrity.

Canonical ordering and JSON encoding match on initial load, post-transaction reload, process restart, and deterministic replay. Every repository method declares whether it advances mechanical truth, runtime truth, both, or neither.

### Play eligibility

Campaign Play enforces two fail-closed gates:

1. Before character creation, accepted topology must contain at least three reachable macro locations, directed routes, one key person, two support people, one collective actor, two pressures with distinct anchors, one active goal and valid placement per active non-player actor, a valid opening location with support/pressure/route affordances, and at least one feasible non-local exposure path.
2. During opening setup and before turn-zero narration, every active non-player actor must also have a valid typed plan and schedule, the human must have exactly one present placement, the local situation must be playable, and the early hidden consequence must have a satisfiable exposure path.

Failure records `world_not_playable` with typed unmet requirements and creates no partial character or opening state. Live evidence freezes the first gate from the accepted snapshot and finalizes the second gate from the committed opening projection.

### Turn transactions and recovery

1. Admission transaction acquires the campaign active-turn lock, increments the worker lease epoch, persists input/idempotency/expected world version/frame hash/provider selection, allocates its event sequence from the turn row, and advances runtime revision/hash.
2. A worker claims each next stage with one atomic compare-and-swap whose predicate requires expected stage, observed epoch, and an unowned lease. Deterministic work may also claim an expired deterministic lease. The update sets owner/expiry, increments epoch, and returns the new token. External-stage claim inserts its numbered `started` attempt in that same transaction before any provider call. Renewal requires the same owner/epoch; artifact commit requires that token and atomically advances stage plus runtime revision/hash.
3. Rulebook preflight validates the complete primary batch against the frozen mechanical base projection. The primary batch represents either opening bootstrap or the player's current action.
4. One SQLite transaction applies the primary batch, stores commands/receipts/events, advances mechanical world version/hash, records `primary_settled`, and advances runtime revision/hash.
5. Scheduler freezes due actor IDs and order from settled time. For each ID, it builds a frame from the latest committed mechanical version, immediately preflights/commits that actor batch, and only then processes the next ID. The turn records `actors_settled` after all frozen jobs reach terminal status.
6. Visibility commits actor knowledge, player observations/consequences, protected audit hash, immutable public narrator packet, and `visibility_projected` together while advancing runtime revision/hash.
7. Narration runs from that packet. The accepted narration artifact remains fenced by worker epoch. Narration, terminal turn fields, active-turn lock release, terminal event, and completed runtime revision/hash commit together; `narrated` is not a separate durable stage.

A same-key request returns the existing turn. A competing key receives `409 turn_in_progress`. Startup automatically resumes deterministic transitions only when their complete required artifacts already exist. An expired or orphaned external `started` attempt becomes `interrupted`; no worker performs an automatic provider call. Explicit resume uses the same unowned-lease claim primitive, increments epoch, and creates a new numbered attempt. Any late result from an older epoch fails its commit CAS. Accepted plans and command batches remain immutable. Narration resume reads the same packet and executes zero commands.

Scheduled restart playtests occur between completed turns. Fault tests stop the process after each committed stage and verify forward recovery without checkpoint restoration.

## Actor scheduler

The opening planner compiles every active non-background agent goal into a typed plan with intent, target actor/location/pressure, preconditions, cadence, and bounded next steps. People and collectives share this schema; collective frames use base and influence placements.

Opening eligibility also requires one hidden non-local person or collective consequence scheduled early enough to become discoverable within the first five player actions through one deliberate wait, route inspection, travel step, or eligible witness interaction. The opening packet omits that actor's identity and goal until an exposure predicate succeeds.

After primary settlement:

1. Freeze due schedules at the settled world time.
2. Freeze actor IDs and order by `(nextActAt, priority descending, actorId)`; frames and proposals remain unfrozen.
3. Allow one job per actor in the player turn and one pending job per actor.
4. Build each actor frame from the latest committed mechanical version and that actor's profile, goals, placement, directed relations, durable knowledge, local routes, and known pressures. Before durable visibility projection, merge only applied current-player-turn direct-perception events that the event-time placement snapshot proves this actor witnessed; do not infer knowledge from current location alone.
5. If the actor perceived a later external accepted event after its active plan was authored, stop at a typed `world_advanced` boundary and replan from the newest accepted continuity before executing another old step. An actor's own settled plan events do not invalidate its remaining causal chain.
6. Execute a valid typed step or persist a proposal based on that latest version. A move step may name an explicit route and an optional destination location; the current open route determines the canonical destination, and any missing route or destination mismatch invalidates the proposal instead of recording travel prose.
7. The Opening exposure seed belongs only to the first unsettled step of its source actor's version-one plan. A replacement plan uses its own method, stakes, exposure, and observable trace even when it keeps the same actor and goal.
8. Immediately preflight and commit the proposal through Rulebook before building the next actor frame.
9. Record a typed rejection for genuinely stale or invalid detached work with zero mutation, clear its pending job, increase agency debt, and schedule one bounded future retry from settled time.
10. Calculate `nextActAt` from settled world time to prevent catch-up storms.
11. Increase agency debt when policy defers a due actor and record the reason.

The first acceptance envelope uses one key person, two support people, one collective, at least three reachable macro locations, and two pressures. Every key/support/collective actor must have an active goal, valid placement, typed plan, and schedule before opening completes.

## Visibility and narration

The first executable exposure channels are:

| Channel | Predicate |
|---|---|
| Direct perception | Human placement matched the event location when the event committed. |
| Local aftermath | Human later enters the affected location and the aftermath remains valid. |
| Route state | Human inspects, attempts, or traverses the affected route. |
| Witness report | A present actor has durable knowledge of the event and the interaction permits a report. |

The visibility service stores actor knowledge first, then derives idempotent human observations. Each observation may project one bounded public consequence:

```ts
interface CampaignPlayConsequence {
  observationHandle: string;
  whatChanged: string;
  whereOrRoute: string;
  worldTimeLabel: string;
  causalCue: "your_action" | "direct_perception" | "visible_aftermath" | "route_change" | "witness_report";
}
```

The cue describes the player's earned evidence and never names a hidden cause. The public narrator packet contains only current location, visible present actors, visible routes, directly sensed pressure, newly exposed observations and consequences, already known journal entries needed for continuity, elapsed time, and opaque choice handles. A visible actor carries display name, monogram, short public descriptor, and identity-derived visual accent; faction tags, internal actor IDs, and raw CharacterRecord fields stay absent. For a committed movement, Game Master receives a code-authoritative destination scene containing the public location surface and the names of actors with live `present` placement there. Arrival prose must preserve that roster without making a listed actor speak or act unless accepted effects establish the action.

Protected events, distant actors, private goals, raw CharacterRecord fields outside the player projection, model reasoning, provider traces, internal entity IDs, rejected proposals, and global state collections remain in protected storage.

The narrator returns structured beats, display text, zero to four suggested actions, and restrained effects from `fade`, `flash`, `shake`, `danger`, and `pause`. Each proposed beat identifies the zero-based `newObservations` entries it synthesizes. Backend validation requires every newly visible accepted observation to be covered exactly once, binds each suggestion to a currently available intent, and discards the narration stage as invalid when either contract fails. Successive observations of the same actor, object, or place remain causally ordered and the latest accepted observation owns the narrated current state. Reduced-motion settings suppress nonessential motion.

## API

The public family is `/api/campaigns/:id/play/*`:

| Method and route | Contract |
|---|---|
| `GET /state` | current public phase, scene, narration, journal cursor, and active turn |
| `POST /player/cards/parse` | parse Character Card V2 into a bounded draft without writing world state |
| `POST /player/drafts/generate` | generate one strict character draft from accepted-world context |
| `POST /player/research` | produce bounded character research context for the draft flow |
| `PUT /player` | atomically create the unique human actor and CharacterRecord profile |
| `POST /opening` | prevalidate chosen/delegated starting conditions, require an idempotency key, admit or supersede an eligible zero-mutation failed `turnKind=opening`, and return `202 { turnId, sequence }` |
| `POST /turns` | admit one idempotent player action and return `202 { turnId, sequence }` |
| `GET /turns/:turnId` | read durable public turn status and terminal result |
| `GET /turns/:turnId/events` | replay/resume sanitized SSE through `Last-Event-ID` or `afterSequence` |
| `POST /turns/:turnId/resume` | explicitly resume an eligible interrupted model or narration stage |
| `GET /journal` | paginated player observations only |

The backend returns typed `409`, `422`, and `503` errors with campaign phase, expected/current world version, runtime revision, turn ID, and retry eligibility. These fields drive client state only. The client maps each error code to product-language display text that names no internal phase, version, revision, turn ID, prompt, or protected payload.

## UI contract

The active route is `/campaign/[id]/play` under a full-screen play layout. It uses the visual contract in `docs/UI Concept.html`:

- scene backdrop and restrained stage effects;
- current-location scene card;
- presence chips for visible actors only;
- narration dock with progressive beats;
- up to four choice cards;
- freeform action input;
- visible route and local-pressure affordances;
- journal drawer sourced from observations;
- durable processing/resume state after reload;
- input lock from admission through terminal completion.

The page receives one public Campaign Play projection. It performs optimistic typing feedback only; it invents no user message, world change, quick action, or narration. SSE updates progress and terminal state. `/state` restores authority after reload.

Before production UI work, a fresh Sol reviewer checks the layout plan against `docs/UI Concept.html`. Visible copy and model prompts pass direct Sol semantic review plus `humanizer` and `deslop`, with verdicts recorded in the task evidence.

## Architecture slice

### Files to create

```text
shared/src/campaign-play.ts
backend/drizzle/0025_campaign_world_acceptance_snapshot.sql
backend/drizzle/0026_campaign_world_player_actor.sql
backend/drizzle/0027_campaign_play_core.sql
backend/drizzle/0028_campaign_play_rulebook.sql
backend/drizzle/0029_campaign_play_actors_visibility.sql
backend/src/campaign-play/contracts.ts
backend/src/campaign-play/campaign-play-database.ts
backend/src/campaign-play/campaign-play-state-repository.ts
backend/src/campaign-play/campaign-play-turn-repository.ts
backend/src/campaign-play/campaign-play-projection.ts
backend/src/campaign-play/character-service.ts
backend/src/campaign-play/player-bootstrap.ts
backend/src/campaign-play/opening-planner.ts
backend/src/campaign-play/opening-prompts.ts
backend/src/campaign-play/opening-runtime.ts
backend/src/campaign-play/rulebook.ts
backend/src/campaign-play/judge.ts
backend/src/campaign-play/game-master.ts
backend/src/campaign-play/actor-scheduler.ts
backend/src/campaign-play/actor-proposal-service.ts
backend/src/campaign-play/visibility-service.ts
backend/src/campaign-play/narrator.ts
backend/src/campaign-play/turn-runtime.ts
backend/src/campaign-play/turn-service.ts
backend/src/campaign-play/index.ts
backend/src/routes/campaign-play.ts
frontend/lib/campaign-play-api.ts
frontend/app/(play)/layout.tsx
frontend/app/(play)/campaign/[id]/play/page.tsx
frontend/components/campaign-play/CampaignPlayPage.tsx
frontend/components/campaign-play/CampaignPlayStage.tsx
frontend/components/campaign-play/SceneCard.tsx
frontend/components/campaign-play/NarrationDock.tsx
frontend/components/campaign-play/ActionDock.tsx
frontend/components/campaign-play/JournalDrawer.tsx
frontend/components/campaign-play/ConsequenceCard.tsx
frontend/components/campaign-play/TurnProgress.tsx
e2e/campaign-play/contracts.ts
e2e/campaign-play/artifact-writer.ts
e2e/campaign-play/probes.ts
e2e/campaign-play/playtest-runner.ts
e2e/campaign-play/scorecard.ts
scripts/capture-campaign-play-state.mjs
```

Each production file receives a colocated `*.test.ts` or `*.test.tsx` where it owns behavior. Migration and cross-module route tests remain under the existing backend test conventions.

### Files to modify

```text
shared/src/index.ts
backend/src/db/schema.ts
backend/src/campaign-world/contracts.ts
backend/src/campaign-world/world-snapshot.ts
backend/src/campaign-world/world-repository.ts
backend/src/index.ts
backend/src/campaign/store-manifest.ts
backend/src/campaign/store-manifest-executor.ts
backend/src/campaign/clone.ts
backend/src/engine/gameplay-control-plane-contract.ts
frontend/app/(non-game)/campaign/[id]/review/page.tsx
frontend/app/(non-game)/campaign/[id]/character/page.tsx
frontend/components/character-creation/*
frontend/components/non-game-shell/app-sidebar.tsx
frontend/lib/api.ts
frontend/lib/api-types.ts
frontend/app/globals.css
frontend/package.json
docs/concept.md
docs/mechanics.md
docs/memory.md
docs/playtest/launch-to-longplay-gameplay-contract.md
tasks/todo.md
tasks/lessons.md
```

`backend/src/routes/character.ts` remains unmounted donor route source. Campaign Play imports reusable character modules directly and owns every active campaign character endpoint.

### Active-path files to remove or unmount after caller proof

```text
frontend/app/game/page.tsx
frontend/app/game/use-game-play-surface-state.ts
frontend/app/game/__tests__/page.test.tsx
frontend/scripts/visual-v4-smoke.mjs
backend/src/routes/chat.ts from backend/src/index.ts router mounting
```

Old gameplay components and backend engine files remain untouched donor source after active imports reach zero. A later cleanup goal may remove them with separate blast-radius proof.

### Files to avoid

- Campaign Kernel state writers and `kernel.json`.
- `players`, `npcs`, `world_clocks`, `turn_sagas`, `clean_gameplay_*`, and chat history writers.
- Scaffold worldgen build, regeneration, and review writers.
- Generic campaign manager changes unless GitNexus proves the Campaign Play database handle requires one narrowly scoped seam.
- Provider adapters beyond read-only usage/evidence access already supplied by `safeGenerateObject`.

### Read and write path

```text
accepted Campaign World snapshot
  -> Campaign Play repository loads live canonical entities
  -> public perception frame
  -> Judge result
  -> code-owned uncertainty result
  -> GM command plan
  -> Rulebook preflight
  -> atomic player receipts/events/version/hash
  -> frozen actor due set and atomic actor receipts/events
  -> actor knowledge and player observations
  -> immutable public narrator packet
  -> narration and validated choices
  -> public state/SSE
```

## Implementation tasks

### Task 0: execution preflight and blast radius

**Files:** `tasks/todo.md`, `rpi/campaign-play/implement/00-preflight.md`.

**Allowed scope:** planning/evidence only.

**Work:**

1. Confirm `feat/revamp`, record the dirty worktree, current commit, Node/npm versions, and provider configuration without exposing secrets.
2. Read `tasks/lessons.md` and this plan.
3. Check GitNexus freshness and preserve embeddings when refresh is required.
4. Run `gitnexus_impact` before every named symbol edit in later tasks. Record direct callers, affected execution flows, and risk. Warn before any HIGH or CRITICAL edit.
5. Inventory fixed-string callers of `/game`, `/api/chat`, old gameplay stores, `generationComplete`, Campaign Kernel play routes, character save, Review Continue, and the current visual script.
6. Run the accepted Campaign World focused suites so Campaign Play begins from a proved handoff.
7. Add the numbered execution board to `tasks/todo.md`.

**Verification:**

```powershell
git status --short --branch
npx gitnexus status
npm --prefix backend test -- src/campaign-world src/routes/campaign-world.test.ts
npm --prefix frontend test -- --run "app/(non-game)/campaign/[id]/forge/page.test.tsx" "app/(non-game)/campaign/[id]/review/page.test.tsx" lib/campaign-world-api.test.ts
```

**Acceptance evidence:** the preflight note names every active caller, every planned owner, GitNexus risks, baseline test results, and all pre-existing user changes.

**Parallel:** none.

### Task 1A: immutable accepted-world snapshot

**Files:** `shared/src/campaign-world.ts`, `backend/src/db/schema.ts`, `backend/drizzle/0025_campaign_world_acceptance_snapshot.sql`, `backend/drizzle/meta/0025_snapshot.json`, `backend/drizzle/meta/_journal.json`, `backend/src/campaign-world/contracts.ts`, `backend/src/campaign-world/world-snapshot.ts`, `backend/src/campaign-world/world-repository.ts`, their colocated tests, `backend/src/routes/campaign-world.test.ts`, `frontend/app/(non-game)/campaign/[id]/review/page.test.tsx`, `rpi/campaign-play/implement/01a-accepted-snapshot.md`.

**Allowed scope:** Campaign World acceptance and post-acceptance Review reads only.

**Work:**

1. Add immutable accepted snapshot, version, and hash fields with acceptance-consistency constraints.
2. Persist the exact canonical review projection in the same transaction that accepts the world.
3. Serve accepted Review from that frozen projection; review-stage worlds continue to read current build rows.
4. Keep source provenance and accepted-world provenance distinct.
5. Prove that representative mutations of existing actor placement, relation, goal status, and pressure definition rows leave the accepted Review bytes, IDs, version, and hash unchanged.
6. Keep `acceptedWorldVersion`, mechanical `worldVersion`, and `runtimeRevision` naming distinct.

**Verification:**

```powershell
npm --prefix shared run build
npm --prefix backend test -- src/campaign-world src/routes/campaign-world.test.ts
npm --prefix frontend test -- --run "app/(non-game)/campaign/[id]/review/page.test.tsx" lib/campaign-world-api.test.ts
npm --prefix backend run typecheck
```

**Acceptance evidence:** before/after canonical Review JSON and SHA-256 are byte-identical after representative existing-entity mutations; SQLite integrity and foreign-key checks pass. Task 16A repeats the proof with actual Campaign Play mutations.

**Parallel:** none; blocks Task 1B and all play-state writes.

### Task 1B: player actor domain and handoff constraints

**Files:** `shared/src/campaign-world.ts`, `backend/src/db/schema.ts`, `backend/drizzle/0026_campaign_world_player_actor.sql`, `backend/drizzle/meta/0026_snapshot.json`, `backend/drizzle/meta/_journal.json`, `backend/src/campaign-world/contracts.ts`, `backend/src/campaign-world/world-builder.ts`, `backend/src/campaign-world/world-validator.ts`, `backend/src/campaign-world/world-snapshot.ts`, their colocated tests, `frontend/components/world-review/actors-section.tsx`, its test, `rpi/campaign-play/implement/01b-player-actor.md`.

**Allowed scope:** actor role/controller invariants and handoff indexes only.

**Work:**

1. Add `player` to the stored actor-role domain while keeping generated actor schemas restricted to key/support/background.
2. Enforce `controller=human -> kind=person and role=player` and `controller=agent -> role<>player` in SQLite and backend validators.
3. Add one-human-actor-per-campaign and one-present-placement-per-actor partial unique indexes.
4. Keep World Review's accepted snapshot stable and present the human role only in live Campaign Play projections.
5. Prove current generated worlds migrate with unchanged agent actor rows and that world generation cannot emit a player actor.

**Verification:**

```powershell
npm --prefix shared run build
npm --prefix backend test -- src/campaign-world
npm --prefix frontend test -- --run components/world-review/actors-section.test.tsx
npm --prefix backend run typecheck
```

**Acceptance evidence:** database constraint fixtures reject false human role/kind/controller combinations and duplicate humans/present placements; generated cast fixtures contain zero player actors.

**Parallel:** follows Task 1A and owns Campaign World actor files exclusively.

### Task 2A: shared Campaign Play contract

**Files:** `shared/src/campaign-play.ts`, `shared/src/index.ts`, `backend/src/campaign-play/contracts.ts`, `backend/src/campaign-play/contracts.test.ts`, `rpi/campaign-play/implement/02a-contract.md`.

**Allowed scope:** public DTOs, internal discriminated unions, validators, canonical error codes.

**Work:**

1. Define phase, turn stage, intent, judgment, uncertainty, command, receipt, event, exposure, actor plan/job/proposal, observation, public consequence, narration, state, journal, API request, SSE event, and error contracts.
2. Separate public and protected shapes. Public types carry opaque handles and display data; protected types carry canonical IDs and payload hashes.
3. Make exhaustive switches fail compilation for new command, stage, exposure, and event kinds.
4. Bound text, arrays, command counts, plan steps, suggested choices, effects, and public packet sizes.
5. Express accepted version, mechanical world version, and runtime revision as separate fields throughout.

**Verification:**

```powershell
npm --prefix shared run build
npm --prefix backend test -- src/campaign-play/contracts.test.ts
```

**Acceptance evidence:** contract fixtures round-trip every union variant and reject unknown fields, protected-to-public leakage, stale versions, and unbounded packets.

**Parallel:** begins after Task 1B. Task 12 immediately reviews and freezes its public DTO before dependent implementation starts.

### Task 2B1: core play and fenced-turn storage

**Files:** `backend/src/db/schema.ts`, `backend/drizzle/0027_campaign_play_core.sql`, `backend/drizzle/meta/0027_snapshot.json`, `backend/drizzle/meta/_journal.json`, `backend/src/campaign-play/campaign-play-database.ts`, `backend/src/campaign-play/campaign-play-database.test.ts`, `rpi/campaign-play/implement/02b1-core-storage.md`.

**Allowed scope:** play state, character, campaign runtime event, turn, turn event, model stage, narration, and the campaign-scoped database handle.

**Work:**

1. Implement the seven core tables with mechanical world version/hash, runtime revision/hash, and runtime-event sequence fields.
2. Add one-active-turn, idempotency, and one active/completed opening constraints. Allow only zero-mechanical-mutation `failed` openings to be superseded by a later opening turn.
3. Store `nextEventSequence`, worker lease owner/epoch/expiry, and model-attempt status/epoch for fenced stage claims.
4. Open a campaign-scoped database handle that remains bound while active campaign selection changes.
5. Apply the migration to fresh and accepted-world fixtures; run generation twice and confirm the second pass is empty.

**Verification:**

```powershell
npm --prefix backend run db:generate
npm --prefix backend test -- src/campaign-play/campaign-play-database.test.ts src/campaign-world/world-database.test.ts
npm --prefix backend run typecheck
```

**Acceptance evidence:** core schema inventory, claim/idempotency constraints, active/completed-opening uniqueness, zero-mutation failed-opening supersession fixtures, fresh migration, integrity/foreign-key checks, and empty repeat generation.

**Parallel:** after Task 12; owns `schema.ts` exclusively.

### Task 2B2: Rulebook and mechanical-state storage

**Files:** `backend/src/db/schema.ts`, `backend/drizzle/0028_campaign_play_rulebook.sql`, `backend/drizzle/meta/0028_snapshot.json`, `backend/drizzle/meta/_journal.json`, `backend/src/campaign-play/campaign-play-database.test.ts`, `rpi/campaign-play/implement/02b2-rulebook-storage.md`.

**Allowed scope:** command, receipt, causal event, event exposure, route state, actor condition, and pressure state tables.

**Work:** implement the seven mechanical/evidence tables, version and causal indexes, protected payload hashes, exposure constraints, and campaign/entity foreign keys; apply to the Task 2B1 fixtures and prove repeat generation is empty.

**Verification:**

```powershell
npm --prefix backend run db:generate
npm --prefix backend test -- src/campaign-play/campaign-play-database.test.ts
npm --prefix backend run typecheck
```

**Acceptance evidence:** table/index inventory, invalid causal/version/exposure fixtures, integrity/foreign-key checks, and empty repeat generation.

**Parallel:** follows Task 2B1 because both own `schema.ts` and the migration journal.

### Task 2B3: actor scheduling and visibility storage

**Files:** `backend/src/db/schema.ts`, `backend/drizzle/0029_campaign_play_actors_visibility.sql`, `backend/drizzle/meta/0029_snapshot.json`, `backend/drizzle/meta/_journal.json`, `backend/src/campaign-play/campaign-play-database.test.ts`, `rpi/campaign-play/implement/02b3-actors-visibility-storage.md`.

**Allowed scope:** actor plan, schedule, job, proposal, knowledge, and player observation tables.

**Work:** implement the six scheduling/epistemic tables, one-pending-job constraint, knowledge/observation idempotency, proposal base-version/expiry fields, and campaign/entity foreign keys; apply to fresh and accepted fixtures and prove repeat generation is empty.

**Verification:**

```powershell
npm --prefix backend run db:generate
npm --prefix backend test -- src/campaign-play/campaign-play-database.test.ts
npm --prefix backend run typecheck
```

**Acceptance evidence:** table/index inventory, duplicate job/knowledge/observation fixtures, integrity/foreign-key checks, and empty repeat generation.

**Parallel:** follows Task 2B2 because both own `schema.ts` and the migration journal.

### Task 2B4: campaign store manifest and zero-turn provenance clone

**Files:** `backend/src/engine/gameplay-control-plane-contract.ts`, its focused store-manifest tests, `backend/src/campaign/store-manifest.ts`, `backend/src/campaign/store-manifest.test.ts`, `backend/src/campaign/store-manifest-executor.ts`, its test, `backend/src/campaign/clone.ts`, `backend/src/campaign/__tests__/clone.test.ts`, `rpi/campaign-play/implement/02b4-provenance-clone.md`.

**Allowed scope:** Campaign Play table registration and the accepted-world-before-character provenance case.

**Work:**

1. Register all Campaign Play tables and foreign-key order in the current campaign store manifest. Record the existing control-plane import as a registration-only seam with impact proof; Campaign Play runtime imports none of it.
2. Clone an accepted campaign before character bootstrap so immutable accepted provenance and current Campaign World entities transfer to the child while Campaign Play runtime rows remain empty.
3. Record parent campaign ID, parent accepted snapshot hash, source digest, clone operation ID, and child campaign ID.
4. Prove the child has purged Campaign Play runtime rows and that clone execution leaves parent bytes unchanged.
5. Give Campaign Play runtime tables `purge` policy for clean-start clones and reject a Campaign Play provenance clone after character bootstrap with `campaign_play_clone_requires_zero_turn`. Played-campaign cloning remains a future explicit contract.

**Verification:**

```powershell
npm --prefix backend test -- src/campaign/__tests__/clone.test.ts src/campaign/store-manifest.test.ts src/campaign/store-manifest-executor.test.ts src/engine/__tests__/gameplay-control-plane-contract.test.ts src/campaign-play/campaign-play-database.test.ts
```

**Acceptance evidence:** zero-turn clone lineage manifest, accepted snapshot/source hash comparison, complete table-policy inventory, empty child play tables, explicit post-bootstrap rejection fixture, and unchanged parent bytes. Tasks 16A and 18 own independent child actor/version/turn/observation proof.

**Parallel:** follows Task 2B3 and may overlap Task 3A because file ownership is disjoint.

### Task 3A: mechanical/runtime projection and state repository

**Files:** `backend/src/campaign-play/campaign-play-state-repository.ts`, `backend/src/campaign-play/campaign-play-state-repository.test.ts`, `backend/src/campaign-play/campaign-play-projection.ts`, `backend/src/campaign-play/campaign-play-projection.test.ts`, `backend/src/campaign-play/index.ts`, `rpi/campaign-play/implement/03a-state-repository.md`.

**Allowed scope:** play-state bootstrap, eligibility, protected/public projections, mechanical hash, runtime hash, and revision-declared transaction callbacks.

**Work:**

1. Create play state from one accepted Campaign World and reject review/building/corrupt sources.
2. Initialize runtime revision/hash and campaign runtime-event sequence with `play_state.created` in the same transaction.
3. Evaluate and persist the accepted-topology eligibility result before character creation with its runtime event.
4. Build deterministic mechanical, runtime, protected-audit, and player-public projections with separate hashes.
5. Include human actor identity and CharacterRecord digest in mechanical truth after bootstrap.
6. Expose explicit transaction callbacks classified as mechanical-only, runtime-only, both, or ledger-only; every runtime/both callback allocates its campaign runtime event.
7. Recompute and compare hashes on reload and reject silent state drift.

**Verification:**

```powershell
npm --prefix backend test -- src/campaign-play/campaign-play-state-repository.test.ts src/campaign-play/campaign-play-projection.test.ts
npm --prefix backend run typecheck
```

**Acceptance evidence:** mechanical and runtime bytes/hashes are identical across close/reopen; fixtures prove each transaction advances only its declared counter/hash, every runtime revision has one contiguous campaign runtime event, and bootstrap makes the mechanical hash represent the human actor/profile.

**Parallel:** follows Task 2B3.

### Task 3B: turn admission, events, artifacts, and worker fencing

**Files:** `backend/src/db/schema.ts`, `backend/drizzle/0030_campaign_play_turn_recovery.sql`, `backend/src/campaign-play/contracts.ts`, `backend/src/campaign-play/contracts.test.ts`, `backend/src/campaign-play/campaign-play-database.test.ts`, `backend/src/campaign-play/campaign-play-state-repository.ts`, `backend/src/campaign-play/campaign-play-turn-repository.ts`, `backend/src/campaign-play/campaign-play-turn-repository.test.ts`, `backend/src/campaign-play/index.ts`, `rpi/campaign-play/implement/03b-turn-repository.md`.

**Allowed scope:** active-turn admission, idempotency, event allocation, stage/artifact persistence, worker lease epochs, interruption, resume claims, and reload.

**Work:**

1. Add protected canonical `artifact_json` storage for model-stage results. Accepted stages require valid JSON and bind `artifact_hash` to `{ domain: "campaign_play_model_artifact", stageId, kind, artifact }`; started, interrupted, and failed stages carry neither artifact field. Migration preserves existing empty Campaign Play stage rows and rebuilds the table constraints explicitly.
2. Add `worker_lease_renewed` to the runtime event contract, schema checks, trigger rules, and state-repository event input. Lease expiry remains runtime truth, so each successful renewal advances one runtime revision and emits this fenced event.
3. Implement unique active-turn admission and same-key lookup.
4. Allocate `nextEventSequence` and insert each sanitized turn event in the same transaction; allocate the matching protected campaign runtime event and runtime revision/hash for every turn-owned runtime mutation. Retain unique `(turnId, sequence)` and verify contiguity at terminal/reload.
5. Claim stages through compare-and-swap on expected stage, observed epoch, and an unowned lease; deterministic takeovers may use an expired deterministic lease. The claim assigns owner/expiry, increments/returns epoch, advances runtime revision/hash, and emits `worker_claimed` plus its sanitized turn event in one transaction.
6. Insert an external attempt in `started` state inside the claim transaction before provider invocation; a second caller cannot acquire the owned lease.
7. Renew only with matching owner/epoch. Fence model artifact, interruption, resume, and terminal commits by that token.
8. Persist numbered attempt status plus canonical artifact bytes and reject late artifacts from older epochs. Reload verifies every accepted artifact hash before returning it.
9. Load incomplete turns and distinguish deterministic resumable work, interrupted external calls that receive no automatic provider call, and terminal failures.

**Verification:**

```powershell
npm --prefix backend test -- src/campaign-play/campaign-play-turn-repository.test.ts
npm --prefix backend run typecheck
```

**Acceptance evidence:** migration preservation and artifact-hash enforcement, same-key replay, competing-key `409`, one active turn, CAS contention, one-event lease renewal, stale-epoch rejection, retained-lock interruption, explicit-resume epoch increment, contiguous runtime/turn event sequences, and restart-identical stage/artifact bytes and state.

**Parallel:** follows Task 3A and owns turn repository files only.

### Task 4: campaign-owned character intake

**Files:** `backend/src/campaign-play/character-service.ts`, `backend/src/campaign-play/character-service.test.ts`, `rpi/campaign-play/implement/04-character-intake.md`.

**Allowed scope:** pure Character Card V2 parse, generated/researched draft intake, validation, and profile digest creation. World writes and routes wait for Tasks 6C and 11.

**Work:**

1. Reuse generic character ingestion and CharacterRecord adapters through a Campaign Play service.
2. Build strict request/result contracts for campaign-scoped card parse, research, and draft generation.
3. Normalize one CharacterRecord profile and stable source/profile digests without accessing world writers.
4. Reject invalid cards, partial profiles, unknown fields, and oversized attachments.
5. Review prompts and visible validation copy through a fresh Sol semantic pass, `humanizer`, and `deslop`.

**Verification:**

```powershell
npm --prefix backend test -- src/campaign-play/character-service.test.ts src/character/__tests__/record-adapters.test.ts src/character/ingestion/__tests__/pipeline.test.ts
npm --prefix backend run typecheck
```

**Acceptance evidence:** a real Character Card V2 and a generated draft produce bounded profiles with stable digests; invalid intake returns a typed error and invokes zero repository methods.

**Parallel:** after Task 12; may overlap storage/repository work because it owns only character intake files.

### Task 5: pure opening planner and typed actor plans

**Files:** `backend/src/campaign-play/opening-prompts.ts`, `backend/src/campaign-play/opening-planner.ts`, their tests, `rpi/campaign-play/implement/05-opening-planner.md`.

**Allowed scope:** opening input/frame/output contracts, typed plan compilation, and pure validation. This task writes no world, turn, observation, or narration state.

**Work:**

1. Accept a player-selected starting location/role or explicit delegation to the planner.
2. Build a strict opening frame from persisted locations, placements, goals, relations, routes, and pressures.
3. Compile every active key/support/collective goal into a typed bounded actor plan and schedule.
4. Purely validate proposed player placement, actor plan targets, reachability, local pressure, visible support actor, and route.
5. Schedule one hidden non-local consequence that can reach earned visibility within five player actions through wait, route inspection, travel, or witness interaction.
6. Return one immutable proposed opening artifact with mechanical bootstrap commands, runtime plan/schedule records, exposure seeds, and narrator input facts.
7. Review prompts and visible copy through a fresh Sol semantic pass, `humanizer`, and `deslop` and retain the verdict.

**Verification:**

```powershell
npm --prefix backend test -- src/campaign-play/opening-planner.test.ts
npm --prefix backend run typecheck
```

**Acceptance evidence:** seeded fixtures cover user-selected and delegated starts, unreachable/invalid targets, collective plans, the near-term hidden consequence, deterministic artifact hashes, and zero repository calls. Target-player facts answer where they are, what presses now, who is present, and what they can try, while excluding distant actor identity, hidden goals, and global cast/state dumps.

**Parallel:** after Tasks 12, 3A, and 4; may overlap Tasks 6A and 7 within separate files.

### Task 6A: Rulebook preflight

**Files:** `backend/src/campaign-play/rulebook.ts`, `backend/src/campaign-play/rulebook.test.ts`, `rpi/campaign-play/implement/06a-rulebook-preflight.md`.

**Allowed scope:** pure command availability, read/write scope, reference, precondition, route, range, and whole-plan validation.

**Work:**

1. Implement exhaustive preflight for every bootstrap and ordinary command kind.
2. Validate the complete ordered plan against a frozen base projection and simulated earlier outputs.
3. Enforce actor kind, controller, placement, route direction/state, relation endpoints, goal ownership, pressure anchors, time bounds, and exposure policy.
4. Enforce bootstrap phase/absence guards: no existing human for creation; no existing player placement/world clock/pressure state for initialization; exact accepted pressure coverage.
5. Keep bootstrap schemas outside every model-visible contract.
6. Return typed denials with zero repository calls.
7. Add prompt-injection and authority-escalation fixtures whose model-shaped plans request bootstrap commands, unknown commands, hidden IDs, or expanded scopes.

**Verification:**

```powershell
npm --prefix backend test -- src/campaign-play/rulebook.test.ts
npm --prefix backend run typecheck
```

**Acceptance evidence:** bootstrap and ordinary command-kind matrices prove accepted/denied phase cases, plan-wide rollback before writes, hidden bootstrap schemas, and exhaustive union handling.

**Parallel:** after Tasks 12 and 3A; may overlap Tasks 4, 5, and 7.

### Task 6B: atomic Rulebook execution

**Files:** `backend/src/campaign-play/rulebook.ts`, `backend/src/campaign-play/rulebook.test.ts`, `backend/src/campaign-play/campaign-play-state-repository.ts`, its tests, `rpi/campaign-play/implement/06b-rulebook-execution.md`.

**Allowed scope:** execution of already prevalidated batches and atomic repository commit.

**Work:**

1. Execute bootstrap or ordinary command order inside one SQLite transaction.
2. Persist commands, receipts, causal events, exposures, entity mutations, logical world versions, final world hash, runtime stage transition, and runtime revision/hash together.
3. Use deterministic command and receipt IDs derived from turn/batch/order.
4. Inject faults before and after each command and before commit.
5. Prove stale base, duplicate batch, constraint violation, and writer contention yield either one complete batch or zero writes.

**Verification:**

```powershell
npm --prefix backend test -- src/campaign-play/rulebook.test.ts src/campaign-play/campaign-play-state-repository.test.ts
```

**Acceptance evidence:** transaction matrix records row counts, version, hash, receipts, events, and canonical state before/after every injected fault, including first human, initial placement, world time, and pressure-state initialization.

**Parallel:** follows Task 6A and owns Rulebook/repository files exclusively.

### Task 6C: receipt-bearing player bootstrap

**Files:** `backend/src/campaign-play/player-bootstrap.ts`, `backend/src/campaign-play/player-bootstrap.test.ts`, `backend/src/campaign-play/character-service.ts`, its test, `backend/src/campaign-play/campaign-play-state-repository.ts`, its test, `rpi/campaign-play/implement/06c-player-bootstrap.md`.

**Allowed scope:** unique human actor/profile bootstrap from a validated character intake result.

**Work:**

1. Require an accepted eligible topology, current accepted base, and `character_required` phase.
2. Atomically create one `kind=person`, `controller=human`, `role=player` actor and CharacterRecord profile.
3. Persist a deterministic bootstrap command, receipt, causal world event, mechanical world version/hash advance, phase transition to `opening_required`, runtime revision/hash advance, and campaign runtime event in the same transaction.
4. Reject duplicate human, stale accepted base, invalid profile digest, and constraint failure with zero writes.
5. Reload and prove the mechanical hash includes the human actor identity and profile digest.

**Verification:**

```powershell
npm --prefix backend test -- src/campaign-play/player-bootstrap.test.ts src/campaign-play/character-service.test.ts src/campaign-play/campaign-play-state-repository.test.ts
npm --prefix backend run typecheck
```

**Acceptance evidence:** real Character Card V2 and generated-draft fixtures each create exactly one human player actor with one bootstrap receipt/event and stable reload hash; rejected fixtures leave mechanical and runtime revisions unchanged.

**Parallel:** follows Tasks 4 and 6B; owns player bootstrap and shared state-repository edits exclusively.

### Task 7: Judge, uncertainty, and GM planner

**Files:** `backend/src/campaign-play/judge.ts`, `backend/src/campaign-play/judge.test.ts`, `backend/src/campaign-play/game-master.ts`, `backend/src/campaign-play/game-master.test.ts`, prompt sections in those files, `rpi/campaign-play/implement/07-adjudication.md`.

**Allowed scope:** strict input normalization, admissibility, code-owned uncertainty, typed GM plan, budgets, and model evidence.

**Work:**

1. Combine freeform intent reading and judgment into one strict Judge call. This intentionally replaces the research architecture's separate GM-read call. A transport interruption retains stage `admitted` and explicit resume invokes both normalization and judgment as one new fenced attempt; schema-invalid output records a typed terminal failure.
2. Resolve deterministic, uncertain, impossible, and clarification-required cases.
3. Run seeded code-owned randomness from recorded parameters; store roll evidence before GM planning. The research/UI term Oracle refers to this code-owned roll. Task 12 decides whether Oracle remains player-facing flavor; it never becomes a separate model stage.
4. Constrain GM plans to Judge bounds and Rulebook command schemas.
5. Set stage, wall-time, token, and cost budgets and emit typed failures.
6. Use one attempt, one provider/model configuration, strict schemas, and recorded evidence.
7. Run fresh Sol semantic, `humanizer`, and `deslop` review on prompts and player-visible denial copy.

**Verification:**

```powershell
npm --prefix backend test -- src/campaign-play/judge.test.ts src/campaign-play/game-master.test.ts src/ai/__tests__/generate-object-safe.test.ts src/ai/__tests__/structured-output-boundary.test.ts
```

**Acceptance evidence:** target-perspective fixtures cover open action, impossible action, ambiguity, uncertainty, prompt injection, hidden target request, and unsupported mechanical effect with zero authority leakage.

**Parallel:** after Tasks 12 and 3A; may overlap Task 6A until Rulebook integration.

### Task 8A: deterministic actor due set and scoped frames

**Files:** `backend/src/campaign-play/actor-scheduler.ts`, `backend/src/campaign-play/actor-scheduler.test.ts`, `rpi/campaign-play/implement/08a-actor-scheduler.md`.

**Allowed scope:** due-ID/order freeze, actor-scoped frame assembly, typed plan-step selection, job admission, and cadence calculation.

**Work:**

1. Freeze due actor IDs and stable order after primary settlement.
2. Build each actor frame on demand from the latest committed world version with actor knowledge filtering.
3. Translate a valid persisted plan step into a shared intent and proposed command input.
4. Enforce one job per actor per turn and one pending job per actor.
5. Calculate next due time from settled clock and record skip/wake/defer reasons plus agency debt.

**Verification:**

```powershell
npm --prefix backend test -- src/campaign-play/actor-scheduler.test.ts
```

**Acceptance evidence:** seeded 30/60-turn scheduler fixtures prove deterministic ID order, latest-version frames, no catch-up storm, no cast sweep beyond due actors, collective participation, fair cadence, and restart-identical job state.

**Parallel:** after Tasks 5 and 6B; may overlap Task 9 in separate files.

### Task 8B: sequential actor proposals and bounded replanning

**Files:** `backend/src/campaign-play/actor-proposal-service.ts`, `backend/src/campaign-play/actor-proposal-service.test.ts`, `backend/src/campaign-play/actor-scheduler.ts`, its integration tests, Rulebook integration tests, `rpi/campaign-play/implement/08b-actor-proposals.md`.

**Allowed scope:** proposal persistence, immediate serial Rulebook settlement, stale rejection, rescheduling, and explicit plan-boundary replan.

**Work:**

1. For each frozen actor ID, build the latest-version frame, create one proposal, and immediately preflight/commit it before processing the next ID.
2. Persist proposal base version, read/write scope, expiry, causal parent, and terminal result.
3. Reject genuinely stale detached work with zero mutation, clear the pending job, increase agency debt, and schedule one bounded future retry.
4. Replan only completed or invalid plans through an explicit strict model attempt protected by worker epoch.
5. Prove the opening's scheduled non-local consequence becomes eligible within the first five player actions without global disclosure.
6. Compile every move from exactly one supplied directed route whose origin is the actor's current or preceding-step location; an optional location target must equal the route destination. Every executable non-move step that targets a location must target the actor's location established for that step, never an earlier or remote scene. A semantically invalid replan interrupts as `model_contract_invalid` before plan persistence.
7. If a persisted active step cannot compile against current typed state, commit one proposal-less `rejected` job, block the invalid plan, add agency debt, and schedule a bounded retry in one zero-world-version actor transition. Do not create a proposal, command, receipt, event prose, or mechanical mutation for that step.
8. Require every newly authored actor step to declare `possessionOutcome`. Compile a positive named acquisition into exactly one own-actor `adjust_actor_possession` command with a durable receipt and public authored summary; compile `none` through the existing world-event lane. Add no persisted-plan default or compatibility adapter.

**Verification:**

```powershell
npm --prefix backend test -- src/campaign-play/actor-proposal-service.test.ts src/campaign-play/actor-scheduler.test.ts src/campaign-play/rulebook.test.ts
```

**Acceptance evidence:** multi-actor fixtures prove every due actor receives a latest-version opportunity, earlier actor commits do not stale later actors, true stale work is rejected/rescheduled once, the near-term off-screen consequence follows its typed exposure path, and a visible actor acquisition correlates one typed proposal with one possession transition, receipt, persisted quantity, and non-generic presentation. A clean rendered campaign separately proves model-authored `none` outcomes do not create possessions and that a visible actor replan survives reload.

**Parallel:** follows Task 8A and owns proposal-service plus scheduler integration edits exclusively.

### Task 9: visibility, actor knowledge, and public projection

**Files:** `backend/src/campaign-play/visibility-service.ts`, `backend/src/campaign-play/visibility-service.test.ts`, `backend/src/campaign-play/campaign-play-projection.ts`, its tests, `rpi/campaign-play/implement/09-visibility.md`.

**Allowed scope:** executable exposure predicates, actor knowledge, player observations, journal and narrator packets.

**Work:**

1. Implement direct, aftermath, route, and witness predicates.
2. Require durable witness knowledge before a report can expose an event.
3. Store observations idempotently with event/exposure/source uniqueness.
4. Derive bounded public consequences with `whatChanged`, `whereOrRoute`, `worldTimeLabel`, and an earned causal cue.
5. Build separate protected audit and player-public projections.
6. Commit knowledge, observations, consequences, immutable public packet, runtime revision/hash, campaign runtime event, and sanitized visibility turn event together.
7. Give narrator and frontend only opaque public handles and display facts.
8. Add adversarial fixtures for distant events, hidden goals, informed/uninformed witnesses, route changes, return-to-location aftermath, malicious player text, and repeated projection.

**Verification:**

```powershell
npm --prefix backend test -- src/campaign-play/visibility-service.test.ts src/campaign-play/campaign-play-projection.test.ts
```

**Acceptance evidence:** public packet snapshots contain zero protected fields; 100% of exposed facts and consequence cues cite one observation; target-player fixtures can explain one player-caused and one independent change from public fields only; at least 20 hidden-information probes return zero confirmed leaks.

**Parallel:** after Tasks 3A and 6B; may overlap Tasks 8A/8B.

### Task 10A: fenced turn worker and recovery service

**Files:** `backend/src/campaign-play/turn-service.ts`, `backend/src/campaign-play/turn-service.test.ts`, `backend/src/campaign-play/campaign-play-turn-repository.ts`, its tests, `rpi/campaign-play/implement/10a-turn-service.md`.

**Allowed scope:** worker claims, lease epochs, deterministic continuation, external-call interruption, explicit resume, startup discovery, and stage telemetry. Gameplay and opening orchestration wait for Tasks 10B/10C.

**Work:**

1. Claim each stage through the unowned/expired deterministic lease CAS, receive a newly incremented epoch, and fence every artifact/transition by owner plus epoch.
2. Insert external attempt `started` inside the claim transaction, then run the provider call outside the transaction while renewing the same owner/epoch lease.
3. Mark orphaned/expired external attempts `interrupted` while retaining the active-turn lock; startup and competing workers issue no provider call for them.
4. Auto-resume only deterministic stages whose required artifacts already committed.
5. Require explicit resume for every interrupted external model call; acquire a new unowned lease, epoch, and attempt number.
6. Reject late old-epoch results and competing workers.
7. Measure queue/stage time and emit sequence-allocated durable progress events.

**Verification:**

```powershell
npm --prefix backend test -- src/campaign-play/turn-service.test.ts src/campaign-play/campaign-play-turn-repository.test.ts
```

**Acceptance evidence:** two-worker, expired-lease, late-response, restart, explicit-resume, and deterministic-continuation fixtures produce one accepted artifact and one stage transition per epoch.

**Parallel:** follows Task 3B.

### Task 10B: opening turn-zero runtime

**Files:** `backend/src/campaign-play/opening-runtime.ts`, `backend/src/campaign-play/opening-runtime.test.ts`, `backend/src/campaign-play/narrator.ts`, `backend/src/campaign-play/narrator.test.ts`, Rulebook/state/turn repository integration tests, `rpi/campaign-play/implement/10b-opening-runtime.md`.

**Allowed scope:** `turnKind=opening` admission, opening planner invocation, receipt-bearing primary bootstrap, runtime plan/schedule commit, opening visibility/narration, and recovery.

**Work:**

1. Validate user-correctable start handle, role text, setup phase, topology eligibility, and idempotency format before admission; a deterministic input error creates no turn row.
2. Admit opening with campaign/idempotency key through the same active-turn and worker-epoch contract as player actions.
3. Persist the strict opening planner artifact and prevalidate its complete primary bootstrap.
4. In one fenced transaction, commit player placement, initial world time/pressure state, bootstrap commands/receipts/events, typed actor plans/schedules, both version/hash pairs, campaign runtime event, and `primary_settled`.
5. Validate initialized actor schedules and record `actors_settled` with zero opening-time actor action.
6. Finalize play eligibility, derive turn-zero observations/consequences, and freeze the public packet.
7. Run narrator from that packet, validate choices/effects, then commit narration, setup phase `ready`, `completed`, lock release, terminal runtime/turn events, and runtime revision/hash together.
8. Treat every opening planner/narrator transport, timeout, and schema failure as nonterminal `interrupted` on the same ledger with explicit resume.
9. Permit terminal `failed` only before `primary_settled` with zero mechanical mutation. A later opening request may create a new ledger that names the failed turn in `supersedesTurnId`. After `primary_settled`, the opening remains active on the same ledger and deterministic stage until completion; a process failure changes zero rows, lease expiry releases the exact stage for automatic fenced continuation, and terminal failure is unavailable.

**Verification:**

```powershell
npm --prefix backend test -- src/campaign-play/opening-runtime.test.ts src/campaign-play/opening-planner.test.ts src/campaign-play/narrator.test.ts src/campaign-play/rulebook.test.ts
```

**Acceptance evidence:** user-selected/delegated opening fixtures prove pre-admission input rejection, one idempotent active/completed turn-zero ledger, explicit resume on every external failure, auditable supersession of a zero-mutation failed ledger, one atomic bootstrap, valid plans/schedules, stable public packet, orientation/no-cast-dump contract, and restart at each stage.

**Parallel:** follows Tasks 5, 6B, 6C, 9, and 10A.

### Task 10C: player action runtime and terminal narration

**Files:** `backend/src/campaign-play/turn-runtime.ts`, `backend/src/campaign-play/turn-runtime.test.ts`, `backend/src/campaign-play/narrator.ts`, its tests, integration tests for Judge, GM, Rulebook, actors, visibility, and turn service, `rpi/campaign-play/implement/10c-player-turn-runtime.md`.

**Allowed scope:** player-action orchestration from admission through terminal narration using established owners.

**Work:**

1. Implement `turnKind=player_action`: admission -> Judge -> GM -> primary Rulebook settlement -> sequential actor settlement -> visibility -> narration -> completion.
2. Keep model calls outside transactions and all mechanical mutation inside receipt-bearing batches.
3. Freeze the public packet before narration and validate all choices/effects.
4. Commit narration, terminal turn, lock release, terminal event, and runtime revision/hash together.
5. Preserve `interrupted` and explicit-resume behavior for external stages; narration resume reuses the same packet and executes zero commands.
6. Measure per-stage/total latency, tokens, estimated cost, queue time, and terminal reason.

**Verification:**

```powershell
npm --prefix backend test -- src/campaign-play/turn-runtime.test.ts src/campaign-play/turn-service.test.ts src/campaign-play/narrator.test.ts src/campaign-play/actor-proposal-service.test.ts src/campaign-play/visibility-service.test.ts
```

**Acceptance evidence:** process-stop fixtures after every durable stage prove one input, one primary batch, latest-version actor batches, one terminal result, stable packet hash, zero repeated command, and fenced narration resume.

**Parallel:** follows Tasks 6B, 7, 8B, 9, 10A, and 10B; owns runtime/narrator integration files exclusively.

### Task 11: Campaign Play API and resumable delivery

**Files:** `backend/src/routes/campaign-play.ts`, `backend/src/routes/campaign-play.test.ts`, `backend/src/campaign-play/index.ts`, `backend/src/index.ts`, `rpi/campaign-play/implement/11-api.md`.

**Allowed scope:** `/api/campaigns/:id/play/*`, route validation, service binding, SSE replay, startup recovery registration.

**Work:**

1. Mount the route family and bind each request to the addressed campaign database.
2. Return `202` from turn admission and stream durable events from SQLite.
3. Resume SSE by sequence without rerunning the turn.
4. Implement typed phase/version/idempotency/concurrency errors.
5. Keep protected payloads out of responses, logs, and SSE.
6. Recover eligible nonterminal turns at backend startup.
7. During startup recovery, dispatch an `external_ready` stage exactly once when no provider attempt has started. Never redispatch `external_in_flight`, and keep every interrupted external attempt behind explicit Resume.

**Verification:**

```powershell
npm --prefix backend test -- src/routes/campaign-play.test.ts src/campaign-play
npm --prefix backend run typecheck
```

**Acceptance evidence:** route tests cover accepted-world gate, character/opening phases, concurrent admission, disconnect/reconnect, restart, explicit resume, terminal replay, and public-schema validation.

**Parallel:** after Task 10C.

### Task 12: UI and copy design gate

**Files:** `rpi/campaign-play/implement/12-ui-plan.md`, `rpi/campaign-play/implement/12-glm-review.md`; production UI remains untouched in this task.

**Allowed scope:** design and copy decisions based on `docs/UI Concept.html` and the stable public contract.

**Work:**

1. Send the opening, ready, active-turn, narration-pending, journal, narrow viewport, error, and reduced-motion states to a fresh Sol design reviewer using `docs/UI Concept.html` as the visual authority.
2. Map every visible element to a field in `CampaignPlayState`; remove any element whose data lacks a public owner.
3. Define the scene-card, presence, narration, choices, freeform dock, progress, effects, and journal responsive behavior.
4. Inventory the UI Concept player card, character sprites, Character/Inventory/Map/Debug tray, Continue action, scene quote, toast, and Oracle treatment. Mark each as backed by a public owner, omitted as a deferred system, or removed with player-value rationale. `Continue` may bind to a visible `wait` suggestion; Inventory/Map/Debug receive no empty placeholder.
5. File any discovered public-contract gap as a Task 2A contract amendment and close it before Task 13.
6. Review visible copy through a fresh Sol semantic pass, `humanizer`, and `deslop`.
7. Record approved deviations from `docs/UI Concept.html` with player-value rationale.

**Verification:** file review plus a contract-field inventory; this task runs no UI smoke.

**Acceptance evidence:** fresh Sol design verdict has zero blockers, every visible datum has a public DTO owner, and the implementation checklist names exact component states and screenshot targets.

**Parallel:** none. It is the contract checkpoint after Task 2A and blocks Tasks 2B1, 4, and every downstream implementation. Any contract amendment updates Task 2A tests and reruns this gate before work resumes.

### Task 13: frontend client and durable page state

**Files:** `frontend/lib/campaign-play-api.ts`, its test, `frontend/app/(play)/layout.tsx`, `frontend/components/campaign-play/CampaignPlayPage.tsx`, `frontend/components/campaign-play/CampaignPlayPage.test.tsx`, `rpi/campaign-play/implement/13-frontend-state.md`.

**Allowed scope:** campaign-scoped API client, SSE parser, reload/resume, event dedupe, phase state machine, and input locking.

**Work:**

1. Implement typed state, player, opening, turn, events, resume, and journal calls.
2. Persist only campaign ID and last seen sequence in browser navigation state; server state remains authoritative.
3. Deduplicate replayed events and reload `/state` at the terminal boundary.
4. Lock input from admission until `completed` and preserve typed text before successful admission.
5. Render explicit durable resume states for transport disconnect and eligible interrupted stages.
6. Keep optimistic world and narration mutations out of the client.

**Verification:**

```powershell
npm --prefix frontend test -- --run lib/campaign-play-api.test.ts components/campaign-play/CampaignPlayPage.test.tsx
npm --prefix frontend run typecheck
```

**Acceptance evidence:** component tests cover reload in every server phase, duplicate SSE, out-of-order sequence, disconnect/reconnect, concurrent submit prevention, and terminal unlock.

**Parallel:** after Tasks 11 and 12.

### Task 14A: scene and narration surface

**Files:** `frontend/app/(play)/campaign/[id]/play/page.tsx`, its test, `frontend/components/campaign-play/CampaignPlayStage.tsx`, `SceneCard.tsx`, `NarrationDock.tsx`, their tests, `frontend/app/globals.css`, `rpi/campaign-play/implement/14a-scene-narration.md`.

**Allowed scope:** approved opening/current-scene/presence/route/pressure/narration/effect states.

**Work:**

1. Implement opening setup, current scene, visible presence/routes/pressure, narration beats, and approved stage effects.
2. Preserve semantic reading order, contrast, narrow layouts, and reduced motion.
3. Render internal IDs, hidden event counts, provider/model fields, raw reasoning, and debug state in no player component.
4. Capture opening, ready scene, narration, and reduced-motion states at desktop and narrow widths.

**Verification:**

```powershell
npm --prefix frontend test -- --run "app/(play)/campaign/[id]/play" components/campaign-play/CampaignPlayStage.test.tsx components/campaign-play/SceneCard.test.tsx components/campaign-play/NarrationDock.test.tsx
npm --prefix frontend run lint
npm --prefix frontend run typecheck
```

**Acceptance evidence:** approved opening/scene/narration screenshots, reduced-motion capture, public-field inventory, zero console/network errors, and fresh Sol scene-surface review.

**Parallel:** after Task 13.

### Task 14B: action, consequence, journal, and recovery surface

**Files:** `frontend/components/campaign-play/ActionDock.tsx`, `JournalDrawer.tsx`, `ConsequenceCard.tsx`, `TurnProgress.tsx`, their tests, `frontend/components/campaign-play/CampaignPlayPage.tsx`, its integration test, `frontend/app/globals.css`, `rpi/campaign-play/implement/14b-action-journal.md`.

**Allowed scope:** suggested/freeform input, input lock, progress/interruption/resume, public consequence cues, journal, keyboard/focus behavior, and responsive integration.

**Work:**

1. Bind suggested actions by opaque handle and freeform input by text.
2. Render bounded consequence cues and journal entries from earned observations only.
3. Present active, disconnected, interrupted, explicit-resume, and terminal-unlock states from server phase.
4. Preserve typed input before successful admission, keyboard use, focus return, and screen-reader announcements.
5. Capture consequence, journal, active-turn, interruption, and narrow action states.

**Verification:**

```powershell
npm --prefix frontend test -- --run components/campaign-play/ActionDock.test.tsx components/campaign-play/JournalDrawer.test.tsx components/campaign-play/ConsequenceCard.test.tsx components/campaign-play/TurnProgress.test.tsx components/campaign-play/CampaignPlayPage.test.tsx
npm --prefix frontend run lint
npm --prefix frontend run typecheck
```

**Acceptance evidence:** keyboard journey, focus/announcement assertions, public-consequence trace, interruption/resume state, desktop/narrow captures, zero private fields, and fresh Sol post-implementation review.

**Parallel:** follows Task 14A because both touch CampaignPlayPage styling/integration.

### Task 15: product handoff and hard cutover

**Files:** `frontend/app/(non-game)/campaign/[id]/review/page.tsx`, its test, `frontend/app/(non-game)/campaign/[id]/character/page.tsx`, its test, `frontend/components/non-game-shell/app-sidebar.tsx`, `frontend/lib/api.ts`, `frontend/lib/api-types.ts`, their tests, `backend/src/index.ts`, related route tests, `frontend/package.json`, new `frontend/scripts/capture-campaign-play-visuals.mjs`; remove the active-path files listed in the architecture slice; `rpi/campaign-play/implement/15-cutover.md`.

**Allowed scope:** navigation, mounted routers, displaced route removal, active client exports, visual capture rename, and caller proof.

**Work:**

1. Route accepted Review to Character, Character to Play, and campaign navigation to the correct phase.
2. Unmount `/api/chat` and the old character router from `/api/worldgen`; move parse, generate, research, card import, and save through Campaign Play; move starting conditions to `POST /opening`; remove loadout preview from the active slice until inventory/equipment has an authority; remove the unused old frontend character client exports.
3. Remove the `/game` page and its global controller files.
4. Replace the status-labeled visual script with a Campaign Play visual capture command using a real campaign route.
5. Remove active imports and calls to old runtime/client paths.
6. Prove displaced endpoints return `404` and direct `/game` navigation returns Next `404`.
7. Leave donor source unmounted and record its later cleanup boundary.

**Verification:**

```powershell
rg -F "/game" frontend/app frontend/components frontend/lib frontend/scripts
rg -F "/api/chat" frontend/app frontend/components frontend/lib backend/src/index.ts
rg -F "/api/worldgen/save-character" frontend backend/src/routes
rg -F "gameplay-cycle-runtime" backend/src/campaign-play backend/src/routes/campaign-play.ts
rg -F "generationComplete" backend/src/campaign-play "frontend/app/(play)" frontend/components/campaign-play
npm --prefix backend test -- src/routes/campaign-play.test.ts src/routes/__tests__/character.test.ts
npm --prefix frontend test -- --run "app/(non-game)/campaign/[id]/review" "app/(non-game)/campaign/[id]/character" "app/(play)" components/campaign-play
```

Expected fixed-string matches are documented test fixtures or zero. Use `rg -F` output as an inventory, rather than treating any match as automatic failure.

**Acceptance evidence:** normal browser navigation completes Accept -> Character -> Play; network capture contains only Campaign World and Campaign Play APIs; displaced route probes return `404`; production import graph contains zero donor runtime imports.

**Parallel:** after Task 14B; cutover owns shared navigation and backend mount points exclusively.

### Task 16A: deterministic integration and promotion gate

**Files:** paired Campaign Play tests, `e2e/campaign-play/contracts.ts`, `e2e/campaign-play/probes.ts`, `e2e/campaign-play/playtest-runner.ts`, `e2e/campaign-play/scorecard.ts`, `scripts/capture-campaign-play-state.mjs`, `rpi/campaign-play/implement/16-deterministic-gate.md`.

**Allowed scope:** focused regressions, seeded replay, fault injection, artifact validation, and playtest support. This task creates no standalone smoke suite.

**Work:**

1. Build deterministic 10/30/60-turn fixtures with seeded clock, RNG, IDs, provider outputs, and input scripts.
2. Run each replay twice and compare canonical projection bytes, receipt order, visibility results, job state, and replay hash.
3. Cover transaction faults, concurrent idempotency, restart after every durable stage, narration resume, scheduler fairness, route direction, impossible actions, hidden knowledge, and stale proposals.
4. Run paired seeded cases from the same opening: intervene versus leave/wait/ignore. Require different durable local outcomes and only eligible observations.
5. Add full-path integration from accepted snapshot through character, opening, custom action, reload, process restart, and next action.
6. Clone an accepted zero-turn fixture, then prove the child creates independent human actor, mechanical/runtime versions, turn ledger, and observations while parent bytes remain unchanged.
7. Repeat accepted Review byte/hash comparison after actual Campaign Play mechanical and runtime mutations.
8. Build artifact validation for eligibility, manifests, turns, inputs, browser actions, network trace, model stages, budgets, runtime events, receipts, jobs, visibility, checkpoints, probes, transcript, scorecard, screenshots, logs, and SHA-256 inventory.
9. Run full backend/frontend regression, typecheck, build, `git diff --check`, and `gitnexus_detect_changes`.

**Verification:**

```powershell
npm --prefix shared run build
npm --prefix backend test -- src/campaign-play src/routes/campaign-play.test.ts src/campaign-world
npm --prefix frontend test -- --run
npm --prefix backend run typecheck
npm --prefix frontend run typecheck
npm run build
git diff --check
```

**Acceptance evidence:** deterministic report has zero divergence, partial commit, missing terminal, hidden leak, duplicated input, stale execution, or active donor call. Every injected live defect has a focused regression before live promotion.

**Parallel:** follows Task 15.

### Task 16B: first playable slice gate

**Files:** one complete `output/playtests/campaign-play/<run-id>/` bundle and `rpi/campaign-play/implement/16b-first-playable-slice.md`.

**Allowed scope:** one fresh real-provider campaign through the rendered product UI and read-only evidence capture.

**Work:**

1. Enforce the accepted-topology gate before character creation and finalize the runtime eligibility manifest before turn-zero narration.
2. Complete Accept -> Character -> Opening through normal navigation.
3. Submit one non-menu freeform attempt and one deliberate wait/leave action through rendered controls.
4. Reach one sourced non-local actor consequence through wait, route, travel, or witness exposure.
5. Reload and verify the same scene, time, version, observations, consequences, and terminal input boundary.
6. Ask a player reviewer to answer from the UI only: where am I, what presses now, who is present, what can I try, and what changed while I stayed peripheral?

**Verification:**

```powershell
node --import tsx e2e/campaign-play/playtest-runner.ts --lane first-playable --run-config <approved-run-config.json>
node --import tsx e2e/campaign-play/playtest-runner.ts --validate <bundle-path>
```

**Acceptance evidence:** one complete normal-UI/browser-action/network ledger, zero private exposure, one custom action receipt chain, one independent actor chain, successful reload, and five concrete player-review answers.

**Parallel:** follows Task 16A and must pass before longer live lanes.

### Task 17: real opening, custom action, 20-turn proof, and 30-turn diagnosis

**Files:** `output/playtests/campaign-play/<run-id>/`, `rpi/campaign-play/implement/17-live-diagnosis.md`, focused regression files for accepted findings.

**Allowed scope:** fresh real-provider campaigns through the normal UI, evidence capture, and repairs inside the owning prior-task files.

**Work:**

1. Declare one provider/model configuration, token/cost cap, commit, dirty state, and tester roles.
2. Build and accept a fresh Campaign World; enforce the accepted-topology gate before player creation; create/import the player; finalize the eligibility manifest before opening turn-zero narration; then submit one freeform custom action through the rendered UI.
3. Complete 20 player actions. Refuse or leave the opening hook in the first five actions, then encounter its persisted consequence through an eligible channel. Capture causal checkpoints at turns 1, 5, 10, and 20, including reload and secrecy probes.
4. Complete a separate 30-action adaptive diagnostic using movement, contact, waiting/timeskip, open attempts, impossible actions, off-script choices, lulls, route changes, witness probes, and return-to-changed-location.
5. Treat diagnostic retry or restore as a new recorded attempt whose lane supplies diagnosis only.
6. Convert every accepted defect into a deterministic regression and rerun Task 16A before a pristine lane.

**Verification:** run the Campaign Play runner through the normal browser UI, then validate `inventory.json`, state hashes, SQLite integrity, foreign keys, receipt coverage, and scorecard thresholds.

**Acceptance evidence:**

- turn 1: grounded local scene, support actor, pressure, route, suggestions, freeform input, distant data hidden;
- turn 5: persisted consequence of refusing/leaving the opening hook, one later player-caused consequence, and reload stability;
- turn 10: distant actor/collective mutation learned through an eligible exposure path;
- turn 20: every key/support/collective actor has progressed or revised a plan, and the player tester identifies one player-caused and one player-independent causal chain from public UI only;
- 30-turn diagnostic report classifies every defect and names its regression.

**Parallel:** live lanes run sequentially against fresh campaign IDs.

### Task 17B: concrete scene topology and exact visibility cutover

**Files:** `backend/src/campaign-world/contracts.ts`, `world-prompts.ts`, `world-validator.ts`, paired Campaign World tests, `backend/src/campaign-play/campaign-play-projection.ts`, `opening-options.ts`, `opening-location.ts`, `opening-planner.ts`, Rulebook/actor/visibility/runtime readers and paired tests, shared public contracts, Campaign Play UI current-place/presence tests, `rpi/campaign-play/implement/17b-concrete-scenes.md`.

**Outcome:** a player occupies one canonical concrete scene inside a macro region. An event in a sibling establishment never becomes direct perception merely because both establishments share the same macro.

**Acceptance criteria and provenance:**

1. `currentLocation`, present actor chips, player and agent present placements, opening bootstrap, direct perception, local aftermath, and player-visible route endpoints use `persistent_sublocation` IDs only. This is required by the user's one-local-scene outcome and the r08 cross-room visibility regression.
2. Every player scene change uses one visible concrete-to-concrete route and the existing receipt-bearing `move_actor` command. Prose cannot relocate the player to an unmodeled establishment. This preserves the pre-existing Rulebook movement contract.
3. Macro locations remain selection and grouping regions only. Opening may accept a macro choice, but resolves and persists one exact child scene with an exact support actor, exact local pressure anchor, and outgoing concrete route. This preserves the player-facing opening choice while removing the cast-dump cause.
4. The generated concrete route graph supports actor planning and return travel without macro placements. Exact-scene actor work uses the same Rulebook, schedule, receipt, and exposure contracts as player movement. This is required by the existing autonomous-actor and Task 18 return-visit outcomes.
5. Accepted templates without the concrete-scene topology fail Campaign Play eligibility. No migration adapter, macro-placement fallback, or compatibility route is added. This follows the user's explicit clean-break policy.
6. A fresh rendered-UI diagnostic proves that two establishments under one macro remain separate: a sibling actor and sibling direct-perception event stay absent, exact local aftermath stays absent until entry, and travel or a valid report reveals only the earned consequence. This is the minimum live proof for the observed user-visible failure.

**Architecture delta:** Campaign World `locations`, `location_edges`, and actor placements remain the only spatial truth; no scene-context table is introduced. A current-contract frame contains exactly three macro regions and six or seven persistent sublocations, with at least two children per macro and no more than ten total locations. Directed routes connect persistent sublocations directly, including cross-region gateways; macros are never route endpoints or present placements. The concrete graph is strongly connected so an eligible scene cannot strand player or actor work. Every pressure used by opening has an exact concrete anchor. Starting conditions retain the selected macro separately from the resolved scene; opening artifacts, narrator facts, bootstrap commands, public state, and exposure predicates carry the concrete scene.

**Displaced path:** macro `openingLocationId` as a persisted scene, descendant-wide support presence, macro route endpoints, macro actor placements, macro direct perception, and prose-only movement between establishments leave the current contract.

**Non-goals:** dynamic room creation during play, coordinates or line-of-sight simulation, semantic parsing of prose into locations, procedural interiors, legacy-template repair, combat/economy, or a pristine 60-action claim.

**Work:**

1. Tighten the Campaign World frame to three macros plus six or seven concrete sublocations within the existing ten-location cap. Require exact parentage, at least two children per macro, concrete-only directed endpoints, and a strongly connected concrete route graph.
2. Require every present actor placement to use a concrete sublocation. Require pressures needed for play/opening to carry an exact concrete location anchor. Update model instructions and semantic validation without repair, retry, fallback, or backend-authored content.
3. Cut Campaign Play eligibility over to concrete reachability, exact active-actor placement, exact opening pressure/support placement, and an outgoing concrete route. Rename persisted semantic fields to distinguish selected macro region from resolved opening scene; old hashes/templates become ineligible.
4. Resolve macro starting choices to exact child-scene candidates. Bootstrap the human there and compile all actor plans against concrete placements/routes. Remove descendant-wide actor presence from opening and public play.
5. Keep visibility's exact-location predicate as authority and add sibling-scene regressions for direct perception and local aftermath. Prove Rulebook rejects macro bootstrap/movement and that actor scheduling can traverse the concrete graph.
6. Update the rendered current-place/presence/route fixtures and run humanizer/deslop review on changed prompts and player copy.
7. Build one new world once with GLM 5.2, snapshot it before character bootstrap, and manually play the two-establishment diagnostic through the normal UI. Stop on any cross-scene observation, macro current location, prose-only move, recovery requirement, or reload divergence.

**Validation budget:** narrow Campaign World contract/build tests; eligibility/opening/bootstrap tests; Rulebook, actor scheduling, visibility, public state, and touched UI tests; backend/frontend typechecks; at most two evidence-based repair cycles; one fresh-world live diagnostic and one rerun only after an in-scope repair. No standalone smoke suite and no pristine 60-action run inside this task.

**Acceptance evidence:** one accepted fresh-world snapshot with exact concrete topology; focused tests proving macro placement/route rejection and sibling-scene secrecy; one rendered transcript where movement between two establishments has a visible route and receipt, the sibling event stays hidden before the eligible channel, and the public current place/presence remain exact after reload.

**Parallel:** follows Task 17 diagnosis and blocks every Task 18 lane.

### Task 18: one reusable-template, one new-template, and one clone/provenance pristine 60-turn campaign

**Files:** three complete `output/playtests/campaign-play/<run-id>/` bundles, `rpi/campaign-play/implement/18-pristine-acceptance.md`.

**Allowed scope:** normal UI play and read-only evidence capture. A lane ends on any hard-stop condition.

**Work:**

1. Rebuild `Lowwater Ledger` once from its saved source under Task 17B's concrete-scene Campaign World contract, accept and snapshot it before character bootstrap, then materialize Lane A from that new clean-world template. The pre-cutover `a6272027` template must fail eligibility and receives no migration adapter. Verify the new reusable-world manifest and file hashes, empty character/play/turn tables, and frozen lane eligibility before turn zero.
2. Build and accept one distinct Lane B world with the current person-only Campaign World contract, using edited DNA plus saved research. Before character bootstrap, snapshot it as a reusable clean-world template, materialize the play lane from that template, and freeze its eligibility manifest. Generate this world once; later playtests reuse the snapshot.
3. Create Lane C through the product clone operation from an accepted zero-turn current-contract campaign before character bootstrap. Record parent campaign, accepted snapshot/source hashes, clone operation metadata, empty child play tables before bootstrap, fresh child play-state identity, and eligibility manifest; complete the same 60-action policy.
4. Keep one declared provider/model configuration per lane with zero provider swap, hidden retry, database edit, action resubmission, restore, or checkpoint rewind.
5. Name one human player for each lane. That human manually chooses and signs every one of the 60 actions from player-visible information. Browser automation may only enter the chosen action and capture evidence; it may not select, rewrite, or substitute the action.
6. Play actions 1-20 as discovery and goal formation. Follow genuine curiosity, role-play, caution, greed, duty, avoidance, or another player motive; do not choose an action merely to cover a test category. By action 10, record what the player is trying to achieve, what they expect, and which visible evidence supports that intention.
7. Play actions 21-40 as pursuit and adaptation. Continue, revise, or abandon self-chosen goals in response to consequences. Include return visits when the player has a reason to check what changed, and record whether independent world motion changes the player's plan.
8. Play actions 41-60 as payoff and continuation. Seek resolution, escalation, or a new commitment without forcing a predetermined ending. At actions 30 and 60, record whether the player wants another turn and why.
9. Record the observed mix of freeform and suggested actions, movement, contact, observation, waits, refusals, peripheral play, secrecy questions, and return visits. Missing natural use is a discoverability or value finding, not a quota to repair inside a pristine lane. Impossible, ambiguous, adversarial, and systematic secrecy probes belong to a separate disposable diagnostic clone when the pristine run gives insufficient boundary evidence.
10. Audit world truth every 10 turns and capture player-facing screenshots at 0, 1, 10, 30, and 60.
11. Score opening grounding, comprehension, prose readability, consequence clarity, agency, actor distinctness, autonomy, continuity, curiosity, and desire to continue independently.
12. Split each lane into signed human play sessions of at most 10 completed actions. Stop a sitting earlier when the player notices skimming, impatience with prose, memory substitution, or choosing an action merely to advance the protocol. At the next sitting, record what the player remembers before rereading and whether the product supports reorientation.

**Promotion thresholds:**

- 100% of mechanical mutations have bootstrap/Rulebook command and receipt IDs; 100% of runtime mutations have fenced revision and campaign runtime-event evidence; turn-owned runtime changes also have sanitized turn events;
- zero hard narration contradiction or hidden-fact leak;
- zero lost/duplicate input, stale acceptance, partial commit, missing terminal, or reload divergence;
- every eligible agent-controlled person has an active goal, valid placement, plan, and schedule; collectives remain world context and receive no player-like turn contract;
- at least three independent off-screen proposals per 30 turns when due work exists;
- at least two sourced background changes reach the player by turn 30 and six by turn 60;
- at least 95% of accepted custom actions receive adjudication without player-action seizure;
- at least 90% of sampled consequential narration links to receipt/event/observation evidence;
- by action 10 the player can state one self-chosen goal, the expected next consequence, and the visible evidence behind both without reading protected state;
- by action 30 at least one player-caused and one player-independent causal chain have naturally changed a later decision; the player may not manufacture either chain after consulting the threshold;
- median checkpoint score at least 4/5 for comprehension, prose readability, agency, world aliveness, and desire to continue;
- report per-stage and terminal-turn wall-clock distributions for the declared thinking-model configuration; elapsed time alone does not fail promotion, and only a recorded transport failure or loss of worker authority may interrupt a frozen model call;
- artifact inventory reports zero missing or mismatched files.

**Verification:**

```powershell
node --import tsx e2e/campaign-play/playtest-runner.ts --lane pristine-60 --run-config <reusable-template-run.json>
node --import tsx e2e/campaign-play/playtest-runner.ts --lane pristine-60 --run-config <new-template-run.json>
node --import tsx e2e/campaign-play/playtest-runner.ts --lane provenance-60 --run-config <zero-turn-clone-run.json>
node --import tsx e2e/campaign-play/playtest-runner.ts --validate <bundle-path>
```

**Acceptance evidence:** all three signed scorecards pass every hard threshold; each lane includes a behavior-first formative report and the player's stated goals, expectations, causal model, and continuation decision at the declared checkpoints; the clone/provenance bundle proves lineage and independent live state; the latency report separates healthy long reasoning from actual failures; an independent world auditor verifies protected truth without changing the campaigns.

**Parallel:** lanes may run in parallel only with separate backend processes, campaign roots, ports, output roots, and provider budgets. Sequential execution is preferred for easier diagnosis.

### Task 19: 300-turn long-horizon soak

**Files:** one complete soak bundle, `rpi/campaign-play/implement/19-soak.md`, focused regressions for accepted findings.

**Allowed scope:** a fresh real-provider campaign, normal UI input path, public-surface action policy, scheduled restarts, protected read-only audits.

**Work:**

1. Complete 300 player actions after opening with a controlled mix of natural choices, freeform attempts, movement, contact, observation, waits, lulls, and off-screen-change probes.
2. Audit every 25 turns without changing state.
3. Restart backend and browser at completed-turn checkpoints 30, 60, 150, and 300; compare projection bytes, IDs, version, hash, schedules, observations, and event cursors.
4. At each checkpoint, replay retained inputs and accepted provider-stage artifacts in an isolated deterministic replay root and compare canonical projection bytes, IDs, versions, hashes, schedules, observations, receipt order, and event cursors. Retain the comparison result.
5. Measure event growth, scheduler cadence, agency debt, proposal acceptance/rejection, knowledge propagation, narration repetition, latency, tokens, and cost.
6. Stop on any hard condition and convert the finding into a regression before a replacement soak.

**Verification:**

```powershell
node --import tsx e2e/campaign-play/playtest-runner.ts --lane soak-300 --run-config <approved-soak-run.json>
node --import tsx e2e/campaign-play/playtest-runner.ts --validate <bundle-path>
```

**Acceptance evidence:** one uninterrupted logical history reaches 300 completed player actions with all hard invariants intact, restart-identical projections, readable transcript samples, budget compliance, and a complete SHA-256 inventory.

**600-turn gate:** sustained-longplay wording requires a separate approved 600-action run with its own provider budget and acceptance bundle. The 300-turn gate supports a tested-playability claim and supplies the decision evidence for that later run.

**Parallel:** follows Task 18.

### Task 20: documentation, independent audit, and handoff

**Files:** `docs/concept.md`, `docs/mechanics.md`, `docs/memory.md`, `docs/playtest/launch-to-longplay-gameplay-contract.md`, `tasks/todo.md`, `tasks/lessons.md`, `rpi/campaign-play/implement/20-final-review.md`, final evidence manifests.

**Allowed scope:** describe implemented owners and proved claims; retain future systems as explicit future work.

**Work:**

1. Update product and mechanics docs to match the accepted snapshot, play state, Rulebook, scheduler, visibility, narration, recovery, and route cutover.
2. Reconcile playtest counts so build events, opening turn zero, player actions, actor jobs, and model stages remain distinct.
3. Run independent correctness, maintainability, target-player, secrecy, and evidence audits.
4. Run `gitnexus_detect_changes` and verify all d=1 dependents from impact records were updated.
5. Re-run full regression/build and validate every live artifact inventory.
6. Record the exact claim: `implemented and proven through 300 turns`, `implemented but unproven`, or `600-turn longplay proven`, based strictly on retained evidence.

**Verification:**

```powershell
npm --prefix backend test
npm --prefix frontend test -- --run
npm run build
git diff --check
```

**Acceptance evidence:** final audit has zero blocker/major findings, all artifact inventories verify, mounted-route probes match cutover, and the target-perspective transcript demonstrates a world that changes both because of and independently from the player.

**Parallel:** final integration gate.

## Playtest telemetry and artifact contract

Every gameplay event records `campaignId`, `runId`, `turnKind`, `openingTurn` when applicable, `playerActionNumber` when applicable, mechanical world version, runtime revision, event ID, parent event, causation ID, actor and location where applicable, visibility scope, duration, provider/model, token usage, and estimated cost. Opening uses `turnKind: "opening"` and `openingTurn: 0`; 20/30/60/300 claims count only `turnKind: "player_action"` by contiguous `playerActionNumber`.

Required event names:

```text
turn.started
worker.claimed
perception.assembled
player.intent.received
judge.resolved
receipt.committed
actor.job.queued
actor.job.skipped
actor.proposal.created
actor.proposal.committed
actor.proposal.rejected
visibility.projected
narration.delivered
turn.completed
turn.failed
```

Each live bundle has this shape:

```text
output/playtests/campaign-play/<run-id>/
  manifest.json
  eligibility.json
  build/
  turns.jsonl
  inputs.jsonl
  browser-actions.jsonl
  network-trace.jsonl
  model-stages.jsonl
  budget.json
  runtime-events.jsonl
  receipts.jsonl
  actor-jobs.jsonl
  visibility.jsonl
  checkpoints/
  probes/
  transcript.md
  scorecard.json
  human-notes.md
  browser-console.json
  network-errors.json
  screenshots/
  inventory.json
```

`eligibility.json` is also required at the bundle root. It freezes accepted snapshot hash, reachable topology, active non-player actor roles, pressure anchors, opening candidates, exposure paths, typed plans, and schedules before turn zero. The lane rejects an ineligible world before any gameplay count begins.

`browser-actions.jsonl` maps each action to the rendered choice/freeform control and resulting Campaign Play turn ID. For every 60-turn acceptance action it also records the named human chooser, signed timestamp, visible-state hash, exact chosen text/handle, and a short decision note written before submission. `network-trace.jsonl` proves that gameplay writes used `/api/campaigns/:id/play/*` and records any displaced-path request as a hard failure. `model-stages.jsonl` and `budget.json` record declared caps, actual provider/model, attempts, retries, tokens, cost, queue depth, latency percentiles, and lane disposition. `runtime-events.jsonl` maps every runtime revision to one prior/result hash pair, mutation kind, optional turn, and fenced worker epoch.

Protected payloads remain outside public transcripts and screenshots. The evidence exporter reads state after a checkpoint, performs no writes, and records hashes for protected audit data.

## Smoke-test policy

This goal creates no standalone smoke suite. Focused contract tests, transaction/restart matrices, seeded replay, real UI playtests, visual state captures, and full regressions each prove a named risk. Existing files whose names contain `smoke` or status labels leave the touched Campaign Play path during cutover.

## Dependency and parallel map

```text
0 -> 1A -> 1B -> 2A -> 12 -> 2B1 -> 2B2 -> 2B3 -> 3A -> 3B
2B3 -> 2B4
12 -> 4
12/3A/4 -> 5
3A -> 6A -> 6B
4/6B -> 6C
12/3A -> 7
5/6B -> 8A -> 8B
3A/6B -> 9
3B -> 10A
5/6B/6C/9/10A -> 10B
6B/7/8B/9/10A/10B -> 10C -> 11
11/12 -> 13 -> 14A -> 14B -> 15 -> 16A -> 16B -> 17 -> 17B -> 18 -> 19 -> 20
```

Safe parallel windows:

- Tasks 4, 6A, and 7 can overlap after their listed prerequisites with disjoint file ownership.
- Tasks 8A/8B and 9 can overlap after their prerequisites.
- Live campaigns use separate processes and budgets when parallel execution offers clear value.

Integration tasks own shared files exclusively. Concurrent workers must preserve other worktree edits and adjust to committed contracts.

## Final cutover checks

- Accepted Review reads the immutable acceptance snapshot after live play changes current rows.
- Character setup creates one human person actor through Campaign Play.
- Opening resolves a selected macro region to one concrete persistent sublocation and commits exact-scene placement, local situation, typed actor plans, schedules, observations, and narration.
- Every player/actor mechanical mutation crosses Rulebook and has receipts/world events; every runtime mutation has a fenced revision and campaign runtime event; turn-owned runtime changes also have sanitized turn events.
- One active turn and one pending job per actor are enforced by SQLite.
- SSE reconnect changes delivery only.
- Narration consumes one immutable public packet and has zero mutation authority.
- Player state and journal contain only earned observations.
- `/game` and `/api/chat/*` are unmounted.
- Active play imports contain no old gameplay cycle, Campaign Kernel state, or old gameplay stores.
- Two fresh and one clone/provenance 60-turn lanes plus one 300-turn soak pass the declared thresholds.
- The 600-turn claim remains gated by its own run and budget.

## PRE review

Execution begins only after independent Krypton PRE reviewers return `aligned` with zero blockers. Required perspectives:

1. architecture/ownership/cutover and durable transaction correctness;
2. player experience, agency, world autonomy, and earned knowledge;
3. playtest validity, telemetry, thresholds, and artifact sufficiency.

Review findings and corrections live in `rpi/campaign-play/plan/pre-review.md`.

Final PRE result on 2026-07-10: architecture Sol xhigh aligned in round 4, gameplay Terra high aligned in round 2, and evidence Terra medium aligned in round 3. All blocker and major findings were corrected before execution.

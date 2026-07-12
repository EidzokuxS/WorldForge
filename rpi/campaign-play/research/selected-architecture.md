# Campaign play selected architecture

## Decision

Create a mechanics-owned Campaign Play runtime on top of the accepted Campaign World entities. Treat the current `/game`, `/api/chat/*`, `players`, `npcs`, `world_clocks`, `turn_sagas`, `clean_gameplay_*`, and `engine/gameplay-cycle-runtime` implementation as donor material only.

The new runtime may reuse provider resolution, `safeGenerateObject`, character ingestion and `CharacterRecord`, the Campaign World database handle, stable canonical JSON helpers, and generic UI primitives. It does not import the old turn coordinator, frame builder, Stage 4 executor, chat history, restore path, or gameplay stores.

## Options considered

| Option | Benefit | Cost | Decision |
|---|---|---|---|
| Adapt the mounted gameplay runtime to Campaign World | Reuses many existing contracts and UI handlers. | Keeps about 25,000 lines of runtime code, old player and NPC stores, pre-turn clock ownership, chat JSON, mixed opening recovery, and the stale done-boundary defect. Adapters would preserve two world models. | Reject. Use as behavioral and test donor only. |
| Resume Campaign Kernel as the runtime | Reuses player, setup, opening, and graph prototypes. | Restores `kernel.json` as another truth store and still lacks the complete Judge, Rulebook, visibility, narrator, and turn persistence loop. | Reject. Use its plan artifacts as design evidence only. |
| Build Campaign Play over Campaign World | Keeps locations, routes, actors, goals, placements, relations, and pressures as one entity model. Allows a small typed runtime and direct cutover. | Requires new turn, command, receipt, actor work, visibility, narration, and UI boundaries. | Select. |

## Ownership

Campaign `state.db` remains the only runtime truth store.

| Concern | Owner |
|---|---|
| Accepted initial world and provenance | `campaign_worlds` plus an immutable accepted snapshot recorded by Campaign World acceptance |
| Current world entities | existing `locations`, `location_edges`, `actors`, `actor_goals`, `actor_relations`, `actor_placements`, and `world_pressures` rows |
| Human character profile | one `actors` row with `kind = person`, `controller = human`, `role = player` plus one actor profile record using `CharacterRecord` |
| Current mechanical world time, version, and hash | receipt-bearing Rulebook/bootstrap transactions |
| Runtime revision and hash | fenced Campaign Play runtime transactions |
| Player and agent actions | shared world intent contract |
| Mechanical mutation | Rulebook command executor |
| Causal evidence | command receipts and world events |
| Actor cadence | actor state, actor jobs, and versioned proposals |
| Knowledge and visibility | actor observations and exposure rules |
| Player-facing prose and choices | narration records derived from a player-visible settled packet |
| Runtime audit and operational progress | protected campaign runtime events, sanitized turn events, and model-stage evidence |

The accepted build hash remains immutable provenance. Before live mutation exists, Campaign World acceptance freezes `accepted_snapshot_json`, accepted version, and accepted hash in `campaign_worlds`. World Review reads that immutable snapshot after acceptance. Campaign Play records that base, then maintains mechanical `worldVersion/worldHash` separately from operational `runtimeRevision/runtimeHash`. Only receipt-bearing bootstrap/Rulebook batches advance mechanical truth. Fenced admission, artifacts, plans, schedules, knowledge, observations, and terminalization advance runtime truth. The accepted snapshot is audit evidence rather than a second writable world.

## Product path

```text
accepted Campaign World
  -> /campaign/:id/character
  -> create human actor and Campaign Play session
  -> /campaign/:id/play
  -> grounded opening turn zero
  -> player intent
  -> Judge intent and admissibility
  -> code-owned seeded uncertainty when required
  -> GM command plan
  -> Rulebook preflight
  -> atomic primary command batch and receipts
  -> frozen due-actor set
  -> current-scene and detached actor proposals
  -> atomic actor command batches and receipts
  -> visibility projection
  -> settled player-visible packet
  -> narrator beats and grounded choices
  -> durable done boundary
  -> next player intent
```

## Harness boundary

The harness, rather than a model, owns the loop.

1. The Judge maps freeform input to one typed world intent, cites visible frame references, and classifies the attempt as deterministic, uncertain, impossible, or clarification-required.
2. Code performs any required seeded roll and records it. Oracle is optional player-facing flavor for this code-owned resolution, rather than a separate model stage.
3. The GM planner emits an ordered command plan constrained to the admitted result and current write scope.
4. Rulebook code validates the full plan before the first mutation.
5. The Rulebook applies the prevalidated command batch under the campaign mutation mutex. Commands execute in order and produce per-step receipts, events, and logical versions inside one atomic transaction.
6. Current-scene and detached actor jobs consume persisted typed actor plans. The same Rulebook boundary resolves their intent steps.
7. The visibility service builds a packet from receipts, events, actor observations, and the player's current scene. Hidden facts remain outside the narrator context.
8. The narrator returns presentation beats and up to four suggested actions. The server validates every suggested action against the visible frame before storage.
9. The turn reaches `done` only after narration and the final public projection are stored.

Every model tool or stage receives a structured result. Model failures, validation failures, denied commands, timeouts, and aborts become recorded telemetry events with typed error codes. The runtime has explicit model, tool-call, wall-time, token, and cost budgets.

## Intent and command boundary

The shared intent classes are:

- `observe`
- `move`
- `contact`
- `wait`
- `attempt`

`attempt` preserves the open sandbox. It carries the actor's intent, method, visible targets, and stakes. It receives no generic write capability.

The first Rulebook command set is:

- advance world time;
- move one actor over a valid route;
- set route state;
- set actor condition or status;
- update one directed actor relation;
- update or advance one actor goal;
- advance one pressure state;
- record one receipt-bearing dialogue or scene event.

A separate internal bootstrap union creates the unique human actor/profile and initializes player placement, world time, and pressure state. Character/opening services can emit it only under phase and absence guards. Model schemas omit every bootstrap command.

The visibility service derives actor knowledge and player observations from committed events. GM, actor planner, and narrator stages receive no direct observation writer.

Every state-changing command emits a world event automatically. A command plan may reference only frame IDs, current entity IDs, and command outputs from earlier accepted steps in the same plan. Unknown references, write-scope expansion, stale versions, and unavailable effect kinds fail preflight before mutation.

## Turn durability and recovery

One unique active turn exists per campaign. Turn acquisition records the original input, normalized input, source, expected mechanical world version, runtime revision, idempotency key, provider/model selection, initial perception hash, and worker lease epoch. A matching idempotency key returns the existing turn. A competing key receives `409 turn_in_progress`.

Every stage claim uses an atomic compare-and-swap on expected stage, observed epoch, and an unowned lease. A successful claim assigns the owner/expiry, increments epoch, and returns that token. External-stage claims insert the numbered `started` attempt before the provider call. Expired external attempts become `interrupted` and receive no automatic provider call; explicit resume acquires a new epoch. Renewals and artifact commits require matching owner/epoch.

Every runtime mutation advances runtime revision/hash and appends one campaign runtime event. Turn-owned changes also append a sanitized turn event for SSE. This covers play-state creation and character bootstrap before opening turn zero exists.

The durable state machine is:

```text
admitted
-> judged
-> planned
-> primary_settled
-> actors_settled
-> visibility_projected
-> completed
```

Each accepted model artifact is persisted between stages without holding a database transaction open. Before mechanical settlement, Rulebook code prevalidates the complete primary command batch for opening bootstrap or the player's current action. One SQLite transaction then applies the ordered batch, inserts commands, receipts, and causal events, advances mechanical world version/hash, and records `primary_settled`. Actor batches use the same contract after the scheduler freezes the due set. Accepted commands are never replayed individually or compensated by restoring a checkpoint.

The campaign mutation mutex prevents primary and actor batches from interleaving. The scheduler freezes due actor IDs and order only. For each actor, it builds a frame from the latest committed world version, creates a proposal from that version, and immediately settles that proposal before building the next frame. Truly stale detached work records a rejection with zero mutation, clears the pending job, adds agency debt, and receives one bounded future due time.

Visibility projection persists observations and an immutable narrator packet. Narration runs from that packet after mechanical settlement. If the storyteller call is interrupted, the turn retains its lock in a nonterminal `interrupted` state. Explicit resume increments the worker epoch and reads the same packet; late older-epoch results fail compare-and-swap and no world command runs again. Narration, terminal turn status, active-turn lock release, and the terminal event commit together. The runtime does not switch provider, downgrade the contract, regenerate an accepted plan, restore a checkpoint, or resubmit the player action automatically.

Opening validates user-correctable inputs before admission. Opening planner and narrator failures remain `interrupted` on the same ledger. A terminal failed opening is allowed only before mechanical bootstrap with zero mechanical mutation; a later opening may supersede that failed ledger. Active or completed opening turns remain unique per campaign.

The transcript lives in SQLite narration and input records. The active play path does not use `chat_history.json`.

## Actor cadence

Every agent-controlled actor has a next-action time, last-action time, agency debt, active-goal reference, persisted typed plan, and optional pending job. The opening planner compiles prose goals into bounded plans with intent, target refs, preconditions, cadence, and next steps. A model-authored replan occurs when a plan finishes or its preconditions fail; routine turns execute the stored plan without another actor model call.

After primary settlement, the scheduler freezes due actor IDs and order by next-action time, descending priority, and actor ID. It builds each actor frame from the latest committed version, immediately settles that proposal, and then advances to the next actor. It allows one job per actor in one player turn and one pending job per actor. Current-scene and detached consequences settle before the final visibility projection. The scheduler records why an actor slept or woke and increases agency debt when a due actor is deferred. Each settled job calculates its next due time from the settled clock, preventing catch-up storms after long travel or waiting.

Actor frames include only the actor's own profile, goals, placement, relations, observations, local route state, and known pressure or event facts. They exclude global hidden state and the player's private information. People and collectives share the same scheduling, intent, command, receipt, and event contracts. Collective frames expose base and influence placements instead of person-only presence assumptions.

## Visibility and knowledge

Every durable world event records a causal actor or system source, affected entities, before and after facts, location anchors, world time, and executable exposure predicates.

The first exposure channels are direct perception, local aftermath, route state, and witness report. Witness delivery requires a durable actor-knowledge record for that event. When an actor perceives an event, the runtime stores actor knowledge. A human-facing observation records the event, exposure channel, and source actor or location idempotently. Human observations feed the journal and narrator. Agent knowledge feeds later plans and replans.

The public play projection contains current location, visible present actors, visible routes, directly sensed pressure, known observations, recent narration, and grounded suggested actions. Global events, hidden causes, distant actors, private goals, model reasoning, provider traces, internal IDs, and rejected proposals stay outside the player DTO.

## State and API boundary

The public route family is `/api/campaigns/:id/play/*`:

- `GET /state`
- `PUT /player`
- `POST /opening`
- `POST /turns`
- `GET /turns/:turnId`
- `GET /turns/:turnId/events`
- `POST /turns/:turnId/resume`
- `GET /journal`

Turn creation returns `202` with a turn ID and persisted sequence. Event delivery replays from a persisted sequence and resumes through `Last-Event-ID` or `afterSequence`. A reload begins with `/state`; it never reconstructs authority from streamed text.

## UI cutover

The active route becomes `/campaign/[id]/play`. It uses a campaign-scoped client and reads one Campaign Play state projection. It keeps useful visual components from the current play surface while replacing the global active-campaign controller, legacy world DTO, optimistic chat mutations, retry, undo, edit, raw reasoning, and implicit restore behavior.

World Review links to Character after acceptance. Character authoring retains parse, generate, research, and card import capabilities through campaign-owned routes, then writes the human actor and play session in one transaction. Character save routes directly to Campaign Play.

## Evidence ladder

1. Deterministic contracts and transaction failures.
2. Accepted world to character, opening, one custom action, one peripheral wait/leave action, one sourced non-local consequence, and reload through the normal UI.
3. Twenty-turn causal proof with reload, secrecy, autonomy, and receipt checks.
4. Thirty-turn live diagnosis whose defects become deterministic regressions.
5. Two fresh and one zero-turn clone/provenance pristine sixty-turn campaigns.
6. One three-hundred-turn soak with isolated deterministic replay and restart checks at turns 30, 60, 150, and 300.
7. A separate six-hundred-turn run before claiming sustained longplay.

Build ledgers and gameplay-turn ledgers remain separate artifacts. A completed world build never counts as a gameplay turn.

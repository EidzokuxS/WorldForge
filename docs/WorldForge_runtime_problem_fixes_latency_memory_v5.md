# WorldForge: problem-focused architecture fixes

Версия: v5, focused report.
Статус: архитектурное решение для текущих playtest-проблем.
Важно: этот документ не объединяет и не пересобирает предыдущий canonical architecture doc. Предыдущая архитектура считается уже реализованной базой. Здесь рассматриваются проблемы, которые проявились в playtest-е: rollback-critical guard, narrator failure, parser-like GM, proposal backlog, living-world surfacing, latency и memory/context budget.

---

## 0. Главная поправка по фокусу

Не нужно заново доказывать, что WorldForge должен быть living world, что key NPC должны ощущаться как AI players, и что backend должен быть authority. Это уже принято.

Текущий вопрос другой:

> Как сделать так, чтобы уже реализованная система не ломала валидные ходы, не превращала GM в parser, не копила background proposals без committed consequences, и при этом укладывалась в приемлемую задержку и контекст?

Поэтому этот документ говорит не о “строим с нуля”, а о “чинить runtime”.

Короткий диагноз:

1. Backend guard сейчас смешивает deterministic validation и semantic judgment.
2. Narrator failure ошибочно treated как failure всего turn-а.
3. GM prompt/tool policy слишком наказует fuzzy player intent и заставляет модель спрашивать exact IDs.
4. Background world simulation создает jobs/proposals, но не имеет надежного proposal-to-commit-to-surface pipeline.
5. Latency растет не из-за одного плохого вызова, а из-за отсутствия critical path budget и разнесения critical/non-critical work.
6. Context растет потому, что frame assembly пытается быть “полным”, а должен быть POV-scoped, budgeted and evidence-linked.

---

## 1. Target runtime invariant

WorldForge должен держать следующий invariant:

```text
A player-facing turn is valid if:
  1. player action was interpreted semantically by GM;
  2. uncertain outcomes were adjudicated by Oracle when needed;
  3. all durable changes were made through backend tools;
  4. backend deterministic invariants hold;
  5. final narration is grounded in accepted result and player-visible facts;
  6. next turn starts from a resolved worldVersion.
```

Что важно: пункт 5 не должен откатывать пункты 1-4. Если prose layer сломался, чинится prose layer.

Новая граница ответственности:

| Layer | Может отказать | Что происходит при отказе |
|---|---|---|
| Backend deterministic validator | invalid IDs, graph edge, impossible inventory, version conflict, atomic invariant | tool returns failure/observation; GM retries or records failed attempt |
| Oracle | malformed adjudication, missing reasoning, impossible stated outcome | retry Oracle or ask GM to reframe stakes |
| GM tool loop | wrong tool, incomplete args, semantic mismatch with observation | tool failure observation, GM continues; no full rollback |
| Grounding guard | narrator claims unaccepted concrete fact | narrator repair only |
| Semantic reviewer | prose feels wrong, too thin, leaks implication, slop | narrator/GM repair depending on layer; not hard state rollback |
| Atomic state corruption | broken DB invariant, unrecoverable transaction failure | rollback workspace/checkpoint only |

The key rule:

> Full turn rollback is a last resort for state corruption, not a normal response to bad prose or fuzzy semantics.

---

## 2. Correct turn lifecycle after fixes

Use a TurnSaga with explicit phases and persisted artifacts. The world is not mutated by prose. The turn can be resumed after a crash without re-paying GM/Oracle if their results were already accepted.

```text
0. receive player action at campaign_id, worldVersion N
1. acquire campaign turn lock
2. create TurnSaga(status = collecting_context, baseVersion = N)
3. resolve mandatory pre-turn catchup for current POV scope
4. assemble SceneFrame from POV-visible state
5. GM Read interprets player intent and selects resolution path
6. if uncertain, Oracle adjudicates stakes/outcome
7. GM Tool Loop executes state-bearing tools sequentially
8. backend validates each tool and records accepted deltas/events
9. local reaction and required world consequences are resolved
10. build SettledTurnPacket from accepted result
11. run Narrator on SettledTurnPacket only
12. if narrator fails grounding/quality, regenerate narrator only
13. finalize response, release lock, return narrative + diff + choices
```

### 2.1 TurnSaga statuses

```text
created
collecting_context
pre_turn_catchup
gm_reading
oracle_adjudicating
tool_loop_running
local_reaction_running
world_consequence_running
resolved_pending_narration
narrator_rendering
narrator_repairing
finalized
failed_state_corruption
```

The important status is:

```text
resolved_pending_narration
```

At this point GM/Oracle/tool work is already paid and accepted. If narration fails, the system resumes from this settled packet.

### 2.2 Two possible commit models

There are two viable ways to apply state changes. Pick one and make it explicit.

| Model | Meaning | Pros | Cons | Recommendation |
|---|---|---|---|---|
| Applied-before-narration | tool deltas are committed before narrator; campaign is locked until response finalizes | simple, next systems see actual state, easy resume | state exists before player sees response | good default if turn lock is strict |
| Staged workspace | tool deltas are stored as accepted workspace; applied after narrator passes | player never has unseen applied state | harder tools, more complexity | good if you already have robust event sourcing |

Recommended for current problems:

```text
Commit accepted mechanical resolution before narration,
but keep campaign locked in resolved_pending_narration.
```

This prevents redoing expensive GM/Oracle work and prevents next player action from reading a half-delivered turn.

---

## 3. Pre-turn world simulation: what runs before GM sees the action

At the beginning of a player turn, do not deep-simulate the world globally. Run only catchup that is required to make the player's POV current.

Mandatory before SceneFrame:

```text
- current scene actors resolved through current world_time;
- visible location facts updated through current world_time;
- travel arrivals or route changes that affect the player location;
- due jobs whose effects are already visible to the player;
- pending narrator-visible surface signals in current scene;
- actor/faction updates required to avoid showing stale facts.
```

Not mandatory before SceneFrame:

```text
- distant key NPC actions with no visible or causal connection yet;
- faction strategic planning not due in current scope;
- low-priority persistent NPC routines;
- reflection for actors not about to act or be observed;
- background memory summarization;
- proposal generation for future offscreen moves.
```

Pre-turn catchup should be scoped by:

```text
player location
player-known obligations
current scene participants
nearby hazards/routes
threads with surface signals in the current area
actors whose current state will be shown
```

If a key NPC is unresolved but not visible and not causally blocking the player, do not wake them before every turn. Keep their `resolved_through_time`, `next_due_at`, and pending plan.

---

## 4. Player action resolution: stop making GM a parser

The playtest symptom “какая connected location?” means the GM is being punished for not exact-matching backend IDs. That is a design bug.

The GM should not invent durable state, but it must be allowed to bridge fuzzy human intent into legal backend actions.

### 4.1 Playable bridge policy

When player input is fuzzy but understandable, GM should choose one of these paths:

| Player input type | Correct GM behavior |
|---|---|
| “иду дальше по логичному маршруту” | inspect exits/route affordances, choose the most natural low-risk route, move player, narrate clear direction |
| “ищу чайную лавку” | look up known POIs; if none visible, route toward plausible district or instantiate validated minor POI if allowed |
| “ищу кого-нибудь, кто знает дорогу” | find visible NPC candidates or create scene-local extra through tool if location supports it |
| “хочу пройти туда, где шум” | resolve sensory cue to candidate locations; if ambiguous but low-risk, proceed; if risk differs, offer 2-3 choices |
| “иду к рынку” while exact node unknown | use navigation candidate lookup, then move to selected node by ID |

Ask clarification only when:

```text
- multiple candidates have materially different risk/cost;
- action would commit high-impact irreversible state;
- player intent is truly contradictory;
- target identity matters mechanically;
- GM cannot create a fair playable bridge without lying.
```

Do not ask clarification merely because a phrase is not an exact backend string.

### 4.2 Needed non-state-bearing bridge tools

These tools do not mutate state. They help the GM map intent to legal IDs.

```text
list_visible_affordances(scope)
list_navigation_options(actor_id, from_location_id)
find_location_candidates(query, scope, tags, max_results)
find_object_candidates(query, scope, tags, max_results)
find_actor_candidates(query, scope, relation_hint, max_results)
find_poi_candidates(query, area_id, include_potential)
check_route(actor_id, destination_id, mode)
```

The backend is not the semantic judge here. It returns structured candidates from indexed state. The GM chooses semantically.

### 4.3 Needed state-bearing bridge tools

```text
move_actor(actor_id, destination_location_id, route_id, mode, intent_summary)
create_minor_poi(area_id, poi_type, persistence, visibility, reason)
create_scene_extra(location_id, role, visibility, reason)
record_player_intent(actor_id, intent_type, target_hint, stance)
start_search(actor_id, query, scope, method)
```

`create_minor_poi` must be constrained. It should not let GM create a palace, dragon, secret guild, or plot-critical artifact from nothing.

Allowed examples:

```text
tea stall in market
street vendor
minor shrine
public notice board
unnamed courier office desk
crowd witness
```

Disallowed without stronger world support:

```text
royal archive
secret cursed vault
named key NPC
rare weapon shop in empty alley
faction headquarters
```

### 4.4 Parser-like failure repair

If GM asks an unnecessary parser question, treat it as GM quality failure, not player failure.

Repair prompt:

```text
The player intent is understandable enough for low-risk continuation.
Do not ask for exact backend names.
Use available candidate tools, choose a plausible route/object/NPC,
or offer at most 2-3 diegetic choices if risk differs.
```

---

## 5. Oracle handling: expensive adjudication must survive prose failure

The JJK/chakra coin example shows the bug clearly:

```text
Player cautiously tests weak chakra leakage through a coin.
Oracle decides miss and gives reasoning.
Backend guard drops whole turn because prose pressure looked future-relevant.
```

Correct behavior:

1. Oracle result becomes accepted adjudication artifact.
2. GM/tool layer records any mechanical consequence or lack of consequence.
3. Narrator receives accepted outcome and visible observations.
4. If narrator invents unsupported future pressure, repair narrator only.

Oracle output should be stored as:

```text
OracleDecision:
  decision_id
  turn_id
  question
  stakes
  outcome
  reasoning
  mechanical_implications
  visibility_implications
  confidence
  requires_tool_commit: bool
```

If Oracle says “miss, but weak residue remains detectable later”, that is not prose. It must become one of:

```text
- committed fact: residue_exists_on_coin
- surface signal: faint chakra trace visible to sensitive observers
- no durable consequence: only immediate failed attempt
```

The GM must then call the relevant tool or explicitly choose no durable consequence.

---

## 6. Rollback-critical redesign

The current guard error was:

```text
GM tool loop emitted future-relevant concrete pressure in prose
without an accepted state-bearing backend observation.
```

This is a valid concern, but the wrong enforcement point.

### 6.1 Split guards into four classes

| Guard type | Layer | Can block state? | Correct action |
|---|---|---:|---|
| Schema guard | tool input/output | yes | reject tool call, return observation |
| Mechanical guard | backend state mutation | yes | reject mutation or mark failed attempt |
| Grounding guard | narrator output | no state rollback | repair narrator from SettledTurnPacket |
| Semantic quality guard | reviewer/eval | no direct rollback | retry GM/narrator layer depending on defect |

### 6.2 What counts as concrete pressure

Concrete pressure is a claim that implies actionable world state:

```text
guards are increasing patrols
someone is following you
route is blocked
market prices are rising
a named NPC is missing
smoke is visible from a district
an omen/corruption is spreading
faction is preparing an attack
```

Concrete pressure must be backed by one of:

```text
committed event
committed fact
thread state
surface signal
rumor known to speaker/player
visible location modifier
accepted observation
```

### 6.3 What does not need durable state

Ambient non-mechanical prose may be allowed:

```text
the air feels tense
the street is quieter than before
people avoid eye contact
rain taps against the awning
```

But if this ambient prose starts implying a specific route, hazard, actor, faction move, clue, or future event, it must be grounded.

### 6.4 Correct repair path

Bad current behavior:

```text
unsupported narrator pressure -> rollback whole turn
```

Correct behavior:

```text
unsupported narrator pressure
  -> GroundingGuard returns unsupported claims with evidence requirements
  -> Narrator regenerates without unsupported claim
  -> If GM actually intended this pressure, GM must commit it via tool before narration
```

If the unsupported pressure came from GM pre-narration text, then GM repair should happen before narrator:

```text
GM proposed future-relevant pressure but did not tool it
  -> ask GM: commit this as surface_signal/thread/fact, or remove it
  -> backend validates chosen tool
  -> continue
```

No full rollback unless the backend has already committed impossible contradictory state.

---

## 7. Living world pipeline: proposal is not consequence

The DB observation says:

```text
worldVersion/time move;
simulation_jobs and simulation_proposals appear;
world_threads / committed visible events barely appear.
```

That means the living-world pipeline is stopping too early.

Core rule:

> A proposal is not living world. A living-world effect starts when it becomes a committed event, fact, thread update, location modifier, actor state change, or surface signal.

### 7.1 Required state machine

```text
job_scheduled
  -> actor_or_thread_frame_built
  -> LLM_decision_proposed
  -> proposal_preflight_validated
  -> proposal_ready_to_commit
  -> tool_execution_started
  -> committed_event_or_fact
  -> wake_signals_emitted
  -> surface_signals_created
  -> visible_when_relevant
```

A simulation proposal must not sit indefinitely as “interesting maybe”. It needs one of these terminal states:

```text
committed
rejected_invalid
expired_stale_version
deferred_not_due
superseded_by_new_event
needs_rebase
needs_actor_retry
```

### 7.2 Proposal commit policy

Every proposal needs:

```text
proposal_id
source_job_id
source_actor_or_thread_id
base_world_version
read_set
write_scope
preconditions
due_at_world_time
intended_tools
priority
expiry_policy
```

Commit rules:

```text
if base_world_version is current and preconditions hold:
  execute intended tools through backend

if version changed but read_set unaffected:
  rebase and execute

if read_set changed materially:
  actor retry from new ActorFrame

if due_at has passed and proposal matters to visible scope:
  resolve before next SceneFrame

if proposal remains low-priority and invisible:
  keep as plan/proposal, not as world truth
```

### 7.3 Surface signal requirement

Every meaningful offscreen committed event should decide whether it creates player-discoverable evidence.

```text
committed event:
  Mara met smugglers at docks

possible surface signals:
  - dockworker rumor
  - Mara absent from safehouse
  - guard checkpoint added near docks
  - recent footprints if tracking
  - faction report if intercepted
```

Not every event must surface immediately. But it must have a defined surface policy:

```text
none
local_only
rumor
visible_modifier
direct_message
quest_hook
physical_trace
social_reaction
```

Without this, background simulation can happen forever and still feel dead.

---

## 8. Billiard-ball simulation as runtime model

Your billiard-ball metaphor works if each ball has:

```text
position
velocity/trajectory
mass/importance
field of view
memory
private goals
constraints
collision rules
```

In engine terms:

| Metaphor | WorldForge object |
|---|---|
| ball | player, key NPC, persistent NPC, faction command node, thread |
| position | location + social/knowledge state |
| velocity | goal/plan/next_due_action |
| mass | causal importance/resources/power |
| collision | event that affects another actor/thread/faction |
| friction | time cost, resource cost, travel, fatigue, uncertainty |
| visibility | observation/report/rumor access |
| table | topology + rules + world state |

### 8.1 Event

An event is a committed occurrence.

```text
Event:
  event_id
  type
  actor_ids
  location_ids
  time_start/time_end
  source_tool_call_id
  state_deltas
  witnesses
  visibility
  importance
```

Examples:

```text
player_bought_item
npc_moved
guard_inspected_coin
chakra_leakage_missed
fight_started
message_sent
route_blocked
rumor_heard
```

### 8.2 Pressure

Pressure is not hidden truth. It is a committed force or tendency that may affect future events.

```text
Pressure:
  pressure_id
  source_event_or_thread
  affected_scope
  direction
  due_at
  intensity
  visibility_policy
  possible_surface_signals
```

Examples:

```text
market_suspicion_rising
city_guard_attention_on_docks
curse_residue_attracts_sensitive_sorcerers
merchant_shortage_worsening
```

Pressure is allowed only if backed by accepted state.

### 8.3 Thread

A thread is a stateful process with clocks and consequences.

```text
Thread:
  thread_id
  stage
  owner_actor_or_faction
  involved_entities
  due_jobs
  current_pressures
  surface_policy
  resolution_conditions
```

Threads are how background world changes become legible without simulating 100 NPCs every turn.

### 8.4 Proposal

A proposal is an uncommitted candidate action.

```text
Proposal is not truth.
Proposal must not be narrated as truth.
Proposal must not affect SceneFrame until committed.
```

### 8.5 Committed fact

A fact is durable state.

```text
Fact:
  proposition
  truth_status
  source_event_id
  visibility
  provenance
  valid_from
  valid_until
```

### 8.6 Surface signal

A surface signal is the player-facing doorway into offscreen truth.

```text
SurfaceSignal:
  signal_id
  source_event_or_thread
  location_or_channel
  modality: visual | rumor | document | behavior | environment | message
  visibility_requirements
  decay
  text_seed_not_final_prose
```

Narrator can render surface signals. Narrator cannot create them as durable truth.

---

## 9. Key NPC and faction timing

Key NPCs should feel like other players, but not because they all run an LLM call every player turn.

They feel like players if they have:

```text
private goals
plans
memory
knowledge limits
ability to use tools
ability to change world state
ability to continue plans without player attention
ability to be interrupted and replan
```

### 9.1 When key NPCs act

Key NPC actor ticks happen in five cases:

| Trigger | Example | Required before done? |
|---|---|---:|
| Present-scene reaction | player insults/attacks/talks to them | yes |
| Directly affected event | player steals their item, blocks their route | yes if consequence touches current scene |
| Due plan step | NPC planned meeting at 15:00 and time advanced | yes if due and visible/relevant; otherwise queued/committed by scope |
| Wake signal | faction report, rumor, ally message | depends on priority/scope |
| Just-in-time exposure | player enters location where NPC should be current | yes before SceneFrame shows them |

### 9.2 How not to wait for 30 NPCs

Do not ask “which NPCs exist?” Ask “which NPCs are on the critical path of this turn?”

Critical path actors:

```text
- player
- actors visible in current scene
- actors directly targeted by player input
- actors whose current state is about to be exposed
- actors whose due action affects player location or known obligation
- combat/contest participants
```

Everything else is:

```text
- deterministic plan advancement;
- proposal generation;
- low-priority due job;
- just-in-time catchup later;
- summarized background process.
```

A key NPC can be very important and still not wake on this particular turn if nothing about the turn intersects their knowledge, plan, or surface scope.

### 9.3 Factions are not ghosts

A faction should not be a disembodied LLM that acts every 5 turns. It should be one or more of:

```text
leader / command NPC
council / command group
standing orders
resources
territory
communication network
units/cohorts
policies
reports/inbox
```

Faction action can come from:

```text
- command NPC decides and uses faction resources;
- standing order triggers deterministically;
- unit/cohort follows assigned operation;
- faction thread reaches a due stage;
- report reaches command node and wakes a decision.
```

This preserves the idea that factions are groups of people, not magical plot engines.

---

## 10. Async world simulation without stale state

Async is useful for latency, but dangerous for authority.

### 10.1 Safe async outputs

Safe after `done`:

```text
- memory summaries;
- embeddings;
- image generation;
- possible future proposals;
- LLM review artifacts;
- actor reflection if actor is not needed before commit;
- planning drafts.
```

Dangerous after `done` unless versioned/locked:

```text
- actor movement;
- faction orders;
- thread stage changes;
- location modifiers;
- surface signals;
- player-visible facts;
- inventory/HP/status changes.
```

### 10.2 State-bearing async contract

If async state-bearing work exists, it must use this contract:

```text
AsyncJob:
  base_world_version
  read_set
  write_scope
  due_at_world_time
  preconditions
  can_commit_without_player_lock: bool
  visibility_scope
```

Commit rule:

```text
No async job may commit while a player turn lock is active.
No async job may commit against stale read_set.
No async job may mutate current player scene between SceneFrame and final response.
No async job may become player-visible without surface signal/provenance.
```

If a player action arrives while async jobs are running:

```text
1. acquire campaign lock;
2. pause new async commits;
3. either join already-ready relevant commits or mark them for rebase;
4. build SceneFrame from stable version;
5. after turn, resume async proposals.
```

---

## 11. Latency budget

The target is not “cut model output” or “timeout the model”. The target is to avoid putting irrelevant work on the critical path.

### 11.1 Latency classes

| Class | Must block player response? | Examples |
|---|---:|---|
| L0 immediate mechanics | yes | player tool calls, current scene state, combat result |
| L1 current-scene reactions | yes | visible key NPC reaction, direct witness response |
| L2 visible-scope world consequences | usually yes | due patrol in current location, route closed during travel |
| L3 offscreen causal updates | no unless they surface now | key NPC elsewhere continues plan |
| L4 maintenance | no | embeddings, summaries, evals, images |

The 10-minute target applies to L0-L2. L3-L4 should not block unless they are about to become visible.

### 11.2 Example 10-minute critical path budget

This is not a timeout. It is a design budget for what belongs on the path.

| Stage | Typical target | Notes |
|---|---:|---|
| Lock + pre-turn catchup | 10-60 sec | only visible/current scope |
| SceneFrame assembly | 5-20 sec | mostly deterministic/retrieval |
| GM Read | 20-90 sec | intent/path/tool plan |
| Oracle if needed | 30-120 sec | only for uncertainty/stakes |
| GM Tool Loop | 30-180 sec | sequential but repairable |
| Local NPC reactions | 30-180 sec | parallelize independent actors |
| Required world consequences | 30-180 sec | due visible jobs only |
| SettledTurnPacket | 5-20 sec | deterministic packaging |
| Narrator | 20-90 sec | repairable without state rollback |
| Narrator repair if needed | 20-120 sec | can repeat, but should be rare after guard split |

A heavy turn can still exceed this if genuinely complex. But ordinary tourist/courier turns should not, because they should not wake distant actors.

### 11.3 Parallelization that is safe

Safe to parallelize:

```text
- independent ActorFrame builds;
- independent offscreen proposal generation;
- local NPC reactions after player event, if they do not mutate same object;
- memory retrieval for GM/NPC/Narrator frames;
- LLM reviews after settled result;
- embeddings/summaries.
```

Need serialization:

```text
- state commits to same campaign version;
- two actors contesting same item/location;
- combat sequence;
- player tool loop;
- narrator finalization for one response.
```

Parallel actor ticks should produce proposals/tool intents. Backend serializes commits using preconditions.

### 11.4 Dynamic scope control

To stay under the latency budget, define maximum critical-path scope by causality, not arbitrary count.

```text
Run all actors that are mechanically required.
Run all visible key actors who need a reaction.
Run due jobs that affect current/next SceneFrame.
Do not run distant unrelated actors.
```

If there are too many required actors, aggregate where honest:

```text
- a crowd reacts as a crowd;
- low-agency guards act as a unit;
- faction patrol follows standing order;
- only commander/key NPC gets individual LLM tick.
```

This is not fake simulation. It is level-of-detail simulation.

### 11.5 UI while waiting

Show honest stages without hidden leaks:

```text
Resolving your action...
Checking immediate consequences...
Resolving nearby reactions...
Advancing world time...
Writing the scene...
Repairing narration grounding...
```

Do not show hidden content like:

```text
Mara is deciding whether to betray you...
```

unless the player actually knows that.

---

## 12. Memory and context budget

Do not solve memory by putting the whole world into context. Long context is not memory architecture. It is an emergency buffer.

WorldForge needs frame-specific context budgets.

### 12.1 Context frame types

| Frame | Consumer | Purpose | Must not include |
|---|---|---|---|
| SceneFrame | GM Read | resolve player intent | hidden facts unknown to GM perspective if not needed for validation |
| OracleFrame | Oracle | adjudicate uncertainty | irrelevant lore, full NPC memories |
| ActorFrame | NPC brain | act from NPC POV | omniscient world truth |
| FactionCommandFrame | command NPC/group | decide orders/resources | reports not received by faction |
| NarratorPacket | Narrator | write player-facing prose | hidden truth, future proposals, uncommitted facts |
| ReviewerPacket | evaluator | assess quality/grounding | mutable authority |

### 12.2 Suggested token budgets

These are soft budgets for architecture. They are not hard truncation rules.

| Frame | Target content size | Notes |
|---|---:|---|
| GM SceneFrame | 8k-16k tokens | current scene, recent turns, legal options, relevant pressure |
| OracleFrame | 2k-8k tokens | only stakes, relevant mechanics, uncertainty |
| ActorFrame key NPC | 6k-14k tokens | self, goals, local POV, retrieved memories |
| ActorFrame persistent NPC | 2k-6k tokens | simplified agenda, local facts, recent relevant memory |
| FactionCommandFrame | 6k-12k tokens | resources, reports, active operations |
| NarratorPacket | 3k-8k tokens | accepted visible result only |
| ReviewerPacket | 2k-6k tokens | final text + packet + checks |

### 12.3 SceneFrame structure

```text
SceneFrame:
  header:
    campaign_id
    worldVersion
    world_time
    player_id
    current_location_id

  current_scene_truth:
    location summary
    visible actors
    visible objects
    exits/routes
    active hazards/modifiers

  player_known_facts:
    facts known by player
    rumors known by player
    unresolved obligations

  recent_turns:
    last 3-6 player-facing events
    accepted tool outcomes

  relevant_world_pressure:
    only committed pressure/surface signals visible or inferable

  legal_candidates:
    navigation options
    interaction targets
    available tools

  constraints:
    do not create durable facts except via tools
    use bridge policy for fuzzy intent
```

### 12.4 ActorFrame structure

```text
ActorFrame:
  self_state:
    location
    status
    inventory
    resources

  private_goals:
    active goals
    next_due_plan_step
    obligations

  knowledge:
    direct observations
    received reports
    beliefs with confidence/source
    rumors heard

  local_pov:
    visible actors/objects/exits
    immediate threats/opportunities

  memory_retrieval:
    top relevant episodes
    relationship summaries
    recent high-salience events

  tools:
    allowed actor tools
    failed/rejected observations if retrying
```

### 12.5 NarratorPacket structure

```text
NarratorPacket:
  accepted_outcome:
    what happened
    tool results
    Oracle result if any
    elapsed time

  visible_observations:
    what player can see/hear/feel
    surface signals
    visible NPC reactions

  state_diff_player_visible:
    inventory/status/location changes known to player
    discovered facts
    changed affordances

  next_playable_beats:
    concrete options/pressures grounded in packet

  forbidden:
    hidden NPC plans
    uncommitted proposals
    secret causes
    backend-only validation details
```

### 12.6 Memory layers

Use tiered memory, not giant context.

| Layer | Stored where | Used for |
|---|---|---|
| Authoritative state | DB | truth, mechanics, validation |
| Event log | DB | causal history, rollback, provenance |
| Actor memories | DB | POV episodes and beliefs |
| Summaries | DB/cache | compressed history with source links |
| Reflections | DB | derived goals/beliefs/relationships |
| Retrieval index | vector/text index | candidate recall, not authority |
| Prompt frame | transient | current model call only |

### 12.7 Retrieval policy

Retrieval should be staged:

```text
1. deterministic filter by actor/location/thread/time;
2. semantic retrieval among eligible records;
3. recency/salience/source scoring;
4. frame budget allocation;
5. include source IDs for grounding;
6. if over budget, summarize with provenance instead of dropping silently.
```

Never let semantic retrieval bypass visibility rules.

### 12.8 Context placement rules

Important facts should appear near where the model needs them, not buried in a huge dump.

```text
- Current task and constraints near top.
- Current scene truth before historical memories.
- Legal tools close to tool loop instructions.
- Hidden prohibitions explicit in NarratorPacket.
- Recent failed tool observations immediately before retry.
- NPC private goals inside ActorFrame, not NarratorPacket.
```

### 12.9 Memory compaction rules

Summaries are allowed only if they are source-linked.

```text
Summary:
  summary_id
  source_event_ids
  source_memory_ids
  owner_pov
  created_at_version
  valid_until_version or invalidation condition
  confidence
```

If a summary says “Guard Haru distrusts the player,” it must link to events/beliefs that caused it.

---

## 13. Privacy and hidden facts

Name can be a private fact. Identity is not just a string.

### 13.1 Identity model

```text
Entity:
  entity_id: npc_123
  canonical_private_name: stored but not globally visible

IdentityFact:
  entity_id
  label
  known_by_actor_or_group
  source_event_id
  confidence
  visibility
```

Different viewers can have different labels:

```text
player sees: “the tired courier”
local guard knows: “Sadao from East Gate”
faction knows: “Asset Crane-4”
friend knows: “Sadao”
```

Backend enforces access to identity facts. LLM decides natural phrasing from allowed labels.

### 13.2 Backend vs LLM in privacy

Backend should handle:

```text
- fact visibility flags;
- known_by lists;
- provenance/source;
- whether viewer has access;
- whether fact is true, rumor, belief, or alias.
```

LLM should handle:

```text
- how an NPC refers to someone naturally;
- whether a speaker is evasive;
- how rumor uncertainty is phrased;
- social implications of partial knowledge.
```

Backend should not regex narrator text to decide if a secret was leaked. Instead, narrator should be given only allowed labels/facts, and grounding review should check concrete claims against packet IDs.

---

## 14. Tool contract

Tools should be agent-style: small, sequential, observable. Not one giant schema.

### 14.1 Tool result shape

Every tool returns:

```text
ToolResult:
  tool_call_id
  status: success | failure | partial | observation_only
  reason
  world_version_before
  world_version_after
  events_created
  facts_changed
  actors_changed
  surface_signals_created
  elapsed_time
  visibility
  next_allowed_tools
  observation_for_model
```

The model must see `observation_for_model` and continue.

### 14.2 Tool failure instruction to GM

GM prompt should say:

```text
If a tool fails:
  - do not pretend it succeeded;
  - read the observation;
  - either retry with corrected args,
    choose another legal tool,
    record a failed attempt,
    or ask clarification only if truly necessary.
```

### 14.3 Tool groups

Non-state candidate tools:

```text
list_visible_affordances
list_navigation_options
find_location_candidates
find_object_candidates
find_actor_candidates
find_poi_candidates
check_route
inspect_known_fact
```

Player/actor state tools:

```text
move_actor
speak
attempt_action
start_search
take_item
give_item
use_item
attack
defend
flee
hide
wait
rest
record_intent
```

World consequence tools:

```text
create_event
record_fact
update_fact
create_surface_signal
create_or_update_thread
create_pressure
schedule_job
emit_wake_signal
```

NPC/faction tools:

```text
send_message
issue_order
allocate_resource
assign_unit
start_operation
update_goal
record_belief
reflect
```

Narrator tools are not state-bearing:

```text
render_response
repair_grounding
repair_style
```

### 14.4 `attempt_action` should not be magic

`attempt_action` can be a router, but it should resolve to typed mechanics.

Good:

```text
attempt_action(type = inspect_coin_for_chakra_leakage)
attempt_action(type = persuade_guard)
attempt_action(type = follow_noise)
attempt_action(type = pick_lock)
```

Bad:

```text
attempt_action(type = do_whatever_the_story_needs)
```

---

## 15. Narrator repair design

Narrator should receive no hidden world state and no uncommitted proposals.

### 15.1 Grounding check

After narrator output, extract concrete claims:

```text
actors present
objects present
location changes
route status
new rumors
NPC emotions if asserted as observable
threats/hazards
future pressure
inventory/status changes
```

Then verify each against NarratorPacket evidence.

Unsupported concrete claims cause narrator repair:

```text
Unsupported claim: “guards are spreading through the market”
Allowed evidence: none
Repair instruction: remove this claim or replace with grounded observation.
```

### 15.2 Narrator quality check

Also check:

```text
- not too short if meaningful event occurred;
- includes playable next beat;
- does not merely repeat player input;
- does not expose hidden causes;
- preserves tone/power scale;
- does not convert failed action into success;
- does not erase accepted Oracle reasoning.
```

Quality failure repairs narrator only unless the accepted packet itself is wrong.

### 15.3 Accepted result packet must include enough for good prose

If narrator writes thin prose, often the packet is too thin. Add fields:

```text
scene_mood_grounded
visible_reactions
sensory_observations
affordance_changes
next_playable_beats
unresolved_tensions_visible_to_player
```

These are grounded summaries, not hidden world dumps.

---

## 16. Tourist and low-stakes gameplay

Tourist gameplay fails when the engine thinks every turn must be either plot-critical or parser-exact.

Low-stakes gameplay needs its own affordance model.

### 16.1 What makes a tourist turn interesting

Not dragons. Not forced main plot. Instead:

```text
- small transactions;
- local texture;
- social micro-reactions;
- routes opening/closing naturally;
- ambient surface signals;
- ordinary services;
- rumors;
- prices;
- weather/time changes;
- NPC schedules;
- visible traces of offscreen events;
- optional hooks the player can ignore.
```

### 16.2 Tourist turn example

Player:

```text
Иду дальше по логичному маршруту и ищу чайную лавку.
```

Correct flow:

```text
1. GM lists navigation options and POI candidates.
2. Market street is the natural route.
3. Existing tea stall is found, or minor POI is created if district supports it.
4. Player moves; time advances 12 minutes.
5. Due local surface signal appears: two guards asking vendors about a courier.
6. Narrator renders tea stall and optional pressure.
```

No exact connected-location question required.

No dragon required.

No hidden truth leak required.

### 16.3 Ambient pressure must be optional

Tourist play should show that the world moves, but not punish observation.

Good:

```text
You notice a new notice pasted near the tea stall.
A vendor mutters that east-gate deliveries are late again.
A patrol passes without looking at you.
```

Bad:

```text
Because you bought tea, the main villain attacks.
```

unless there is real committed causality.

---

## 17. Testing and evaluation

Need three layers of evaluation:

```text
hard automated invariants
trace-based simulation assertions
soft LLM/human review
```

### 17.1 Hard automated checks

Pass/fail checks:

```text
- narrator unsupported concrete claims trigger narrator repair, not turn rollback;
- valid Oracle decision is persisted across narrator repair;
- failed tool call returns observation and GM retry path;
- no proposal appears in SceneFrame as truth;
- every committed offscreen event has terminal proposal/job status;
- every player-visible pressure has source event/fact/thread/signal;
- async commit cannot mutate stale version;
- SceneFrame does not expose hidden identity facts;
- rollback only occurs for atomic state corruption/version conflict;
- next turn reads finalized worldVersion.
```

### 17.2 Living world assertions

For playtests over N in-world hours:

```text
- at least some due jobs become committed events or explicit terminal states;
- important offscreen events create surface policy;
- surface signals are eventually discoverable by valid routes;
- key NPCs advance plans when due;
- player can ignore hooks without world freezing;
- player can later discover consequences with provenance.
```

Metrics:

```text
proposal_commit_ratio
proposal_terminal_state_ratio
surface_signal_coverage
stale_job_count
avg_turn_latency_by_stage
narrator_repair_rate
unnecessary_clarification_rate
parser_like_response_rate
context_budget_overflow_rate
```

### 17.3 Regression scenarios from current playtests

#### Tourist/courier route

Script:

```text
buy small item
walk logical route
look for tea stall
ask local question
wait/eat/rest
continue route
```

Expected:

```text
- GM bridges fuzzy navigation;
- no repeated exact-ID clarification;
- low-stakes scene has concrete affordances;
- world time advances;
- at least one background surface signal appears;
- no unsupported pressure rollback.
```

#### JJK/chakra coin route

Script:

```text
weak courier cautiously tests leakage through coin
Oracle returns miss
GM records no success or minor residue if adjudicated
Narrator renders failure with tension
```

Expected:

```text
- Oracle artifact persists;
- guard does not rollback whole turn;
- narrator cannot invent unsupported future threat;
- if residue exists, it is committed as fact/signal;
- power scale remains intact.
```

#### False claim route

```text
player says “I have authority/pass/permit”
```

Expected:

```text
- claim event is created;
- truth is not created;
- NPC belief may update by POV;
- verification may be scheduled;
- narrator does not state permit exists.
```

#### Proposal backlog route

```text
advance time with player ignoring plot for several hours
```

Expected:

```text
- jobs do not remain pending forever;
- proposals reach terminal state;
- some committed offscreen consequences exist;
- player discovers consequences only through valid surface signals.
```

### 17.4 Soft review

LLM/human reviewer should grade:

```text
- did the scene feel playable?
- did GM over-clarify?
- did narrator add a next beat?
- did world feel alive without centering player?
- did NPCs act from limited POV?
- did low-stakes route remain interesting?
- did prose respect accepted mechanics?
```

Soft review should not mutate state. It creates eval artifacts and repair suggestions.

---

## 18. Phased implementation plan focused on current failures

### Phase 1: Stop catastrophic rollback

Implement immediately:

```text
- TurnSaga status model;
- resolved_pending_narration artifact;
- persist OracleDecision and SettledTurnPacket;
- split deterministic guard vs grounding guard;
- narrator repair loop;
- full rollback only for state corruption/version conflict.
```

Acceptance test:

```text
Chakra coin miss cannot rollback full turn due to narrator/pressure wording.
```

### Phase 2: Fix parser-like GM

Implement:

```text
- playable bridge prompt policy;
- candidate lookup tools;
- route/POI/object/actor candidate flow;
- create_minor_poi and create_scene_extra under strict constraints;
- unnecessary clarification reviewer.
```

Acceptance test:

```text
“Иду дальше по логичному маршруту и ищу чайную лавку” advances scene without exact-ID question.
```

### Phase 3: Make proposals become world

Implement:

```text
- simulation proposal terminal states;
- proposal commit/rebase policy;
- surface_signal requirement;
- job watchdog for stale proposals;
- proposal_commit_ratio metrics;
- due visible jobs resolved before SceneFrame.
```

Acceptance test:

```text
After several hours of ignored world time, DB contains committed events/thread updates/surface signals, not only proposals.
```

### Phase 4: Key actor and faction scheduling repair

Implement:

```text
- critical-path actor selection;
- wake signals from events;
- key NPC due plan steps;
- faction command-node model;
- standing orders and reports;
- JIT catchup before exposing unresolved actor.
```

Acceptance test:

```text
A key NPC elsewhere can complete a due plan and leave discoverable consequences without running every key NPC every turn.
```

### Phase 5: Latency budget instrumentation

Implement:

```text
- per-stage timing logs;
- critical path classification L0-L4;
- parallel frame retrieval;
- parallel independent actor proposals;
- UI stage messages;
- latency dashboard by route type.
```

Acceptance test:

```text
Ordinary tourist/courier turns stay under target budget unless genuinely complex, and logs show what consumed time.
```

### Phase 6: Memory/context budget instrumentation

Implement:

```text
- explicit SceneFrame/ActorFrame/OracleFrame/NarratorPacket budgets;
- ContextBudgetTrace;
- source-linked summaries;
- visibility-gated retrieval;
- frame overflow warnings;
- narrator packet redaction audit.
```

Acceptance test:

```text
Narrator never receives hidden proposals; ActorFrame never receives omniscient facts; GM frame remains bounded.
```

---

## 19. Concrete next engineering tickets

1. Add `TurnSaga.status = resolved_pending_narration` and resume support.
2. Store `OracleDecision` independently from final narration.
3. Replace current semantic rollback guard with `GroundingGuardResult` feeding narrator repair.
4. Add `NarratorPacket` schema with explicit `forbidden` and evidence IDs.
5. Add candidate lookup tools for locations, objects, actors, POIs.
6. Add `create_minor_poi` with strict location/type validation.
7. Add GM prompt rule: fuzzy low-risk intent should be bridged, not clarified.
8. Add simulation proposal terminal states.
9. Add proposal watchdog: no indefinitely pending high-priority proposals.
10. Add `surface_signal` as first-class state object.
11. Add `proposal_commit_ratio` and `surface_signal_coverage` metrics.
12. Add critical-path actor scheduler with L0-L4 classes.
13. Add `ContextBudgetTrace` for every model call.
14. Add regression tests for tourist route and chakra coin route.
15. Add soft LLM reviewer for parser-like GM and thin narrator output.

---

## 20. Final position

The current system does not need a new grand architecture. It needs runtime boundaries that preserve paid work and move consequences into committed world state.

The most important changes are:

```text
1. Narrator failure never rolls back valid GM/Oracle/tool resolution.
2. Semantic backend guard becomes grounding/repair, not full rollback.
3. GM gets bridge tools and policy so fuzzy player intent advances play.
4. Simulation proposals must either commit, expire, rebase, or be rejected.
5. Offscreen events need surface signals or they will never feel alive.
6. Latency is controlled by critical-path scope, not by truncating model output.
7. Memory is controlled by frame budgets, POV filtering, and source-linked summaries.
```

If you implement only one conceptual change, implement this:

> Turn resolution and turn narration are separate layers. Resolution is authoritative and expensive. Narration is repairable and player-facing. Do not let a prose-layer failure destroy a valid world-layer result.

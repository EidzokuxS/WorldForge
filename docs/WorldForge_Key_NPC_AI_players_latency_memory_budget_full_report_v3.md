# WorldForge: key NPC как AI players

**Полный архитектурный отчет: living world, co-player NPC, latency budget, memory/context budget**

Версия: v3, с фокусом на два новых вопроса: **как не умереть от ожидания** и **как не засрать контекст, сохранив нормальную память**.

---

## 0. Executive summary

Я не буду трактовать твои предложения как уже утвержденные правки. Это гипотезы, которые надо проверить как architecture choices.

Главная гипотеза звучит так:

> Несколько key NPC должны ощущаться как другие игроки: у них есть собственные цели, память, приватный POV, ограничения, ресурсы, действия, ошибки, планы, способность тратить world-time и способность менять мир через backend-validated tools.

Оценка: **да, это рабочая и правильная core-идея проекта**. Но ее нельзя реализовывать как “каждый key NPC получает полный LLM-turn после каждого player turn”. Это почти гарантированно убьет latency, память и дебаггируемость.

Правильное понимание:

```text
Key NPC как AI player = равная причинная сила во времени мира,
а не равная частота LLM-вызовов.
```

Goku может слетать к Kai, потренироваться, победить Frieza и оставить руины в соседнем городе, пока player ел мороженое. Но это должно произойти не потому, что Narrator придумал красивую фразу, а потому что:

```text
Goku had goal/plan/time/resources -> backend validated actions -> event log committed consequences -> memories/knowledge updated -> player later observes ruins/rumors/NPC testimony.
```

Три главных вывода:

1. **Живые NPC делаются не polling-ом каждого NPC, а process model:** `goal -> plan -> next decision point -> tools -> event log -> memory -> wakeups`.
2. **10 минут на ход достижимы только если критический путь ограничен 3-5 последовательными LLM-группами.** Количество LLM calls само по себе не смертельно; смертельны последовательные hops, огромные prompts, постоянные retries и отсутствие plan executor.
3. **Context - это RAM/cache, не база данных.** Вся память живет в backend/event store/belief store/vector+lexical index. В prompt попадает только маленький working set, собранный под конкретное решение.

Самая важная поправка к фразе “нарратор должен знать все поле”: нужно разделить компоненты.

```text
World Auditor / Simulation Authority может знать все поле.
Player-facing Narrator не должен знать hidden truth.
```

Если player-facing Narrator видит весь hidden world, он рано или поздно будет сливать truth через атмосферу, метафоры, интонацию, foreshadowing или неверные affordances.

---

## 1. Что именно проверяем

### 1.1. Гипотеза “NPC как другие игроки”

Гипотеза хорошая, если означает:

```text
NPC has private POV.
NPC has goals and plans.
NPC spends world-time.
NPC acts through validated tools.
NPC can alter state durably.
NPC remembers outcomes.
NPC can be wrong.
NPC can be interrupted.
NPC can later explain what happened from its own POV.
```

Гипотеза плохая, если превращается в:

```text
After every player turn, call every key NPC LLM with giant world context.
```

Это не “финальное качество”. Это brute force, который даст:

```text
- 20+ минут latency на сложных ходах;
- NPC omniscience;
- context bloat;
- hallucinated consequences;
- гонки между async jobs;
- невозможность объяснить, почему NPC сделал именно это.
```

### 1.2. Гипотеза “фракция не отдельный разум”

В целом верно. Фракция не должна быть абстрактным духом, который раз в N ходов просыпается и “делает сюжет”.

Но полное “у фракции нет brain” тоже неправильно. Фракция должна быть **institutional substrate**:

```text
Faction = members + units + resources + territory + doctrine + laws + reputation + standing orders + communication channels + command nodes.
```

Думать должны не “фракции”, а:

```text
- глава;
- совет;
- штаб;
- капитан стражи;
- дежурный офицер;
- командный AI;
- hive mind, если lore это поддерживает;
- агрегированный UnitActor, если отдельные солдаты не важны.
```

То есть faction-level cognition допустима только как explicit command node with POV, reports, authority, resources and latency. Не как omniscient faction-GM.

### 1.3. Гипотеза “если результат неотличим, способ неважен”

Да, но с важным ограничением:

> В sandbox можно аппроксимировать процесс, но нельзя имитировать причинность там, где игрок может ее проверить.

Допустимая аппроксимация:

```text
NPC не получает 36 LLM calls для 6 часов тренировки.
Вместо этого он имеет committed training plan.
Backend валидирует доступ к месту/учителю/ресурсам.
В конце создается training_completed event, skill_delta, fatigue, witnesses.
```

Недопустимая аппроксимация:

```text
Narrator говорит: “город будто недавно пережил битву”,
но в state нет battle event, damage, witnesses, missing people, faction reports.
```

Критерий:

```text
Approximation is valid if it creates the same observable, queryable, rollbackable artifacts.
```

---

## 2. Target mental model

Бильярд полезен как образ столкновений, но плох как архитектура: шары не имеют POV, памяти, планов, knowledge latency, rumors, obligations, lies, beliefs.

Более точная модель:

> **WorldForge - операционная система мира.** Backend - kernel. Player и key NPC - user-space processes. Tools - syscalls. Event log - causal filesystem. Memory system - hierarchy/cache. Scheduler - диспетчер процессов. Player-facing Narrator - renderer committed visible truth.

Отсюда:

```text
Player action = syscall через GM/tool loop.
NPC action = syscall через actor brain/tool loop.
Faction action = command node или standing order использует faction resources.
World thread = long-running process ledger with clocks/stages/surface routes.
Narrator = renderer, not authority.
```

### 2.1. Что значит “как другой игрок”

| Player property | Key NPC equivalent |
| --- | --- |
| Может выбрать цель | Goal stack, desires, obligations, fears, deadlines |
| Может выбрать способ | LLM actor brain формирует intent из private POV |
| Может действовать | Actor tools с backend validation |
| Тратит время | Action duration, travel cost, prep, recovery |
| Меняет мир | Committed state deltas and events |
| Ошибается | Failure/partial tool results, replanning |
| Помнит | Episodic memory, beliefs, reflections |
| Не знает всего | ActorFrame with observations/reports/rumors |
| Может быть неважен для player | Продолжает жить offscreen через plans/threads |

Главная формула:

```text
Living NPC = private POV + durable goals + world-time plans + validated actions + memory + consequences.
```

### 2.2. Равенство не по turn count, а по world-time agency

Player turn - не единица времени. Player может написать “киваю” - 2 секунды. Может написать “тренируюсь неделю” - 7 дней.

Если key NPC ticks привязаны к player turns, мир ломается:

```text
5 коротких реплик player -> за 10 секунд Goku сделал 5 major decisions. Слишком много.
1 time skip на неделю -> Goku сделал 1 decision. Слишком мало.
```

Правильный критерий:

```text
За одинаковый отрезок world_time key NPC должен иметь шанс совершить сопоставимый масштаб действий,
если у него есть цель, знания, ресурсы, путь и время.
```

---

## 3. Key NPC как co-player process

Key NPC должен иметь durable runtime-состояние, а не только bio/personality.

```text
ActorPlayerState {
  actor_id
  tier: key

  body_state: location, HP, stamina/ki/mana, wounds, statuses
  possessions: inventory, money, vehicles, artifacts
  authorities: faction_roles, command_rights, legal_access

  private_identity: values, temperament, fears, taboos, style
  beliefs: propositions with confidence, source, timestamp
  memories: episodic memory stream + indexed retrieval
  relationships: actor_id -> trust/fear/love/rivalry/debt

  goals: active goals with priority, deadline, success criteria
  active_plan: plan steps, preconditions, expected duration, next step
  commitments: meetings, promises, orders, obligations
  inbox: reports, messages, rumors, observations not yet processed

  resolved_through_time
  next_decision_at
  interrupt_conditions
  simulation_debt
}
```

Критичное поле - `next_decision_at`. Оно означает: NPC уже решил, что делает дальше. Пока ничего не прервало план, backend может исполнять план или ждать due time без LLM.

### 3.1. ActorTurn как скрытый player turn

```text
ActorTurn(actor, interval_or_trigger):
  1. Build ActorFrame from actor POV, not global truth.
  2. LLM actor brain chooses intent/plan/tool calls.
  3. Backend validates tools against rules/resources/time/location.
  4. Backend commits events and state deltas.
  5. Observers receive knowledge entries.
  6. Actor memory receives outcome.
  7. Actor schedules next_decision_at or waits for interrupt.
```

ActorTurn не обязан быть видимым игроку, но должен быть архитектурно похож на player turn.

### 3.2. ActorDecisionPacket

LLM actor brain должен возвращать не prose, а bounded structured decision packet.

```json
{
  "actor_id": "goku",
  "decision_summary": "Continue training until Bulma's confirmed report arrives.",
  "known_facts_used": ["memory_118", "report_442"],
  "selected_goal_id": "prepare_for_frieza",
  "intent": "Finish advanced Kamehameha drills and remain reachable.",
  "tool_calls": [
    {"tool": "train", "args": {"skill": "advanced_kamehameha", "duration": "3h"}},
    {"tool": "schedule_plan_step", "args": {"due_at": "after_training", "hint": "check messages"}}
  ],
  "belief_updates": [],
  "plan_updates": [],
  "next_decision_trigger": "training_complete_or_urgent_message",
  "no_action_reason": null
}
```

### 3.3. Action granularity ladder

| Уровень | Пример | Как исполняется |
| --- | --- | --- |
| Atomic | ударить, сказать фразу, взять предмет | Immediate validation in scene |
| Scene task | обыскать комнату, пообедать, уговорить guard | Minutes; local observations |
| Travel task | добраться до Kai planet / доков / башни | Route + travel cost + interruptions |
| Project step | тренироваться день, чинить корабль | Progress meter, resources, risks |
| Operation | спасти пленника, устроить рейд | Multi-step plan, units/resources |
| Arc | найти Dragon Balls, победить Frieza | Decomposed into projects/operations |

LLM нужен на выбор intent/plan, social/moral/uncertain branches, interruption, failure. Backend исполняет deterministic chunks.

---

## 4. Фракции: не ghost mind, а institutional substrate

Фракция должна быть влиятельной, но не должна быть всеведущим “разумом”.

```text
FactionState {
  resources
  territory
  doctrine/laws
  reputation
  members/units
  command_nodes
  standing_orders
  active_operations
  reports/inbox
  communication_latency
}
```

### 4.1. Кто принимает решения

| Layer | Что это | Кто думает |
| --- | --- | --- |
| Faction state | ресурсы, территория, законы, reputation | Никто. Это state. |
| Command actors | лидер, совет, штаб, капитан | ActorTurn / CommandNodeTurn |
| Units/offices | патрули, армия, бюро, храм | UnitActor или standing order executor |
| Standing orders | рутина: патрули, сбор налогов, доклады | Backend rules, LLM only at conflicts |

Если Jade Army действует, это может быть:

```text
- GeneralActor отдает приказ;
- CommandStaffActor allocates units;
- UnitActor executes operation;
- StandingOrder triggers patrol.
```

Не “фракция каждые пять ходов сама придумывает событие”.

### 4.2. CommandNodeFrame

```text
CommandNodeFrame {
  node_id
  faction_id
  known_reports
  available_resources
  doctrine_and_constraints
  active_operations
  command_authority
  communication_delays
  risk_tolerance
  legal_tools
}
```

Фракция может быть мощной, но знание фракции не мгновенное. Если guard увидел преступление, faction knows only after observation/report path.

---

## 5. World Threads как compression for long-running change

World Thread - это не сюжетная рельса и не fake fallback. Это durable ledger долгого процесса, который слишком дорого выводить из micro-actions каждый ход.

```text
WorldThread {
  thread_id
  name
  stage
  clocks
  involved_actors
  involved_factions
  source_events
  next_due_at
  possible_branches
  surface_routes
  resolved_state_changes
}
```

Примеры:

```text
Frieza searches for Dragon Balls.
Goku trains with Kai.
City Guard investigates ruined district.
Tournament registration period.
Plague spreads through lower city.
Merchant shortage raises prices.
Cult prepares ritual.
```

World Threads - главный способ дать ощущение мира вокруг tourist player:

```text
Player: eats ice cream for 30 minutes.
Thread: Frieza pursuit advances by 30 minutes.
Goku plan: training continues.
Bulma report: message enters communication latency.
City thread: rumor/report moves through channels.
Player-visible result: maybe distant explosion, maybe rumor, maybe nothing yet.
```

---

## 6. Concrete runtime loop

```text
BEGIN TURN
  acquire campaign turn lock
  load committed WorldState(version=N, world_time=T)
  resolve required due jobs for player-exposed scope
  just-in-time catch up exposed actors/threads
  build SceneFrame from committed truth and player-known facts

PLAYER RESOLUTION
  GM Read interprets player text
  Oracle only if GM asks uncertainty
  GM Tool Loop executes player-facing tools via backend validation
  commit player events and state deltas

LOCAL REACTION
  wake present key NPCs and relevant persistent NPCs
  build ActorFrame for each
  run actor brains in parallel where independent
  execute actor tools through backend
  commit local reactions

WORLD-TIME ADVANCEMENT
  compute elapsed duration DeltaT
  advance world_time to T + DeltaT
  process due deterministic timers and plan steps
  enqueue event-triggered jobs
  run mandatory jobs affecting exposed or soon-exposed scope
  run budgeted optional jobs or store proposals

MEMORY/KNOWLEDGE
  write observations to witness memories
  propagate reports/rumors with latency
  run required reflection before actor use
  schedule non-critical compaction asynchronously

NARRATION
  build PlayerFacingPacket from visible committed truth only
  narrator renders final text
  grounding check
  emit done(version=N+k, world_time=T+DeltaT)
  release lock
```

Invariant:

```text
After done, no detached job may mutate state that the next GM Read could read without versioned commit/rebase.
```

---

## 7. Scheduling key NPC as co-player processes

Fixed “every N player turns” - плохой primary scheduler. Player turns do not map to time.

Use hybrid scheduling:

```text
world-time due points
+ event-triggered wakeups
+ urgency/deadline priority
+ agency debt over world-time
+ just-in-time catchup for exposed scope
+ proposals during player think-time
```

### 7.1. KeyActorProcess

```text
KeyActorProcess {
  actor_id
  resolved_through_time
  current_goal_stack
  active_plan
  next_decision_at
  next_decision_reason
  pending_interrupts
  inbox
  private_beliefs
  memory_cursor
  write_scope_reservations
}
```

### 7.2. Decision point loop

```text
while actor.resolved_through_time < target_world_time:
  if active_plan step can execute deterministically:
    backend executes/validates step
    actor.resolved_through_time += duration
  elif decision point reached:
    build ActorFrame
    actor brain chooses bounded action/plan
    backend validates tools
    commit events
  elif interruption exists:
    build ActorFrame with interruption
    actor replans
  else:
    actor sleeps until next_due_at
```

### 7.3. WakeSignal

```text
WakeSignal {
  entity_id
  reason
  source_event_id
  urgency
  due_at_world_time
  knowledge_route: observed | report | rumor | inferred | global_clock
  required_before_done
  scope
}
```

Examples:

```text
Player eats ice cream:
  local waiter may observe.
  Most key NPCs not woken.

Frieza destroys city:
  witnesses wake.
  nearby fighters wake if sensory range/report path exists.
  news/rumor thread wakes.
  Goku wakes only if he observes, senses, or receives report.

Player lies about permit:
  listening guard wakes.
  bureaucracy wakes only if guard reports or checks.
```

### 7.4. Priority and agency debt

```text
priority = tier_weight
         + urgency_to_deadline
         + event_importance
         + proximity_to_player_or_exposed_scope
         + relation_to_key_threads
         + actor_motivation
         + staleness
         + visibility_debt
         + agency_debt
         - recently_simulated_penalty
```

Agency debt prevents a key NPC from sleeping forever just because player avoids them:

```text
agency_debt = expected_decision_opportunities(world_time_elapsed, actor_activity_level)
              - actual_decision_opportunities
```

Important: agency debt does not force drama near player. It forces offscreen key NPCs to keep pursuing their own goals in world-time.

---

## 8. Latency budget: как не умереть от ожидания

### 8.1. 10 минут - это SLO, не timeout

Do not fix latency by hard timeouts, truncation, fake no-op, disabling mechanics or skipping required NPC reactions.

Correct framing:

```text
10 minutes = service level objective for authoritative turn completion.
```

Достигать его надо архитектурой:

```text
- ограничить обязательную область симуляции;
- держать критический путь коротким;
- параллелить независимые actor/world jobs;
- заранее готовить versioned proposals;
- использовать persisted plans вместо constant replanning;
- держать context маленьким;
- использовать structured outputs;
- кэшировать static prompt prefixes;
- использовать model cascade для простых задач.
```

### 8.2. Main latency formula

```text
wall_clock_turn_time = backend_time
                     + sum(serial_llm_group_times)
                     + max(parallel_actor_group_times)
                     + retry/replan_time
                     + render/check_time
```

Самый опасный враг - не количество LLM calls вообще, а количество **последовательных LLM hops**.

Если один slow model call занимает 90-120 секунд:

```text
3 serial hops = 4.5-6 минут
4 serial hops = 6-8 минут
5 serial hops = 7.5-10 минут
6+ serial hops = almost guaranteed failure
```

Следовательно, normal interactive turn должен иметь не больше 4 sequential LLM decision groups; heavy turn - не больше 5.

### 8.3. Recommended critical path budget

| Phase | Target wall time | Serial? | Notes |
| --- | ---: | --- | --- |
| Turn lock + state/frame load | 2-15 sec | yes | Backend only |
| Required JIT catchup for exposed scope | 0-90 sec | maybe | Only if exposed actor/thread unresolved |
| GM Read / player intent | 30-90 sec | yes | One structured call |
| Backend tool execution | 1-20 sec | yes | Validation, event commit |
| Oracle | 0-45 sec | conditional | Only for uncertainty |
| Present actor reaction group | 45-180 sec | parallel group | Key NPCs in scene concurrently if independent |
| Mandatory offscreen/world group | 0-180 sec | parallel group | Only exposed/known/urgent scope |
| Reflection before use | 0-90 sec | parallel/merged | Merge into actor call if safe |
| Narrator | 45-120 sec | yes | Redacted packet only |
| Grounding/schema check | 3-20 sec | yes | Mostly deterministic |

Typical normal turn target:

```text
GM Read 60s
+ parallel actor/world group 120s
+ Narrator 90s
+ backend/checks 30s
= about 5 minutes
```

Heavy turn target:

```text
GM Read 90s
+ local actor group 180s
+ mandatory world group 180s, parallel where possible
+ Narrator 120s
+ one replan 90s
= about 8-10 minutes
```

### 8.4. Turn classes

| Turn class | Example | Target | Simulation policy |
| --- | --- | ---: | --- |
| Micro/social | “киваю”, “спрашиваю цену” | 1-3 min | Current scene only, present NPCs |
| Normal action | search, negotiate, short travel | 3-6 min | Local reactions + due exposed jobs |
| Heavy action | combat, infiltration, major social conflict | 5-10 min | Multiple actors, oracle possible |
| Time skip | rest hours/days, training, long travel | 6-10 min target, sometimes staged | Macro advancement by plans/threads |
| Deep sim / author mode | simulate weeks/months | outside interactive SLO | explicit staged mode |

No arbitrary output truncation. The degradation path is:

```text
reduce optional simulation scope, not truth quality.
```

### 8.5. Four-hop rule

For normal interactive mode:

```text
A normal turn may use at most four serialized LLM decision groups:
1. GM Read / intent interpretation.
2. Actor/world decision group, parallelized.
3. Replan/repair group only if validation failed or conflict emerged.
4. Narrator.
```

Reflection, embeddings, proposal generation, memory compaction, LLM quality review should be backend/cheap, parallel, or precomputed.

### 8.6. How key NPC stay alive without serial explosion

Bad:

```text
for each key_npc:
  call LLM
  execute one action
  call LLM again if result changed
```

Good:

```text
for each due key_npc in parallel:
  build ActorFrame
  ask for bounded plan/update/action batch
  validate tools
  commit valid results
  if partial failure:
    enqueue replan only if consequential and still due
```

Actor brain outputs a bounded action batch and next decision trigger. Backend executes travel, waits, training progress and schedules without LLM until branch/interruption.

### 8.7. Parallelism policy

Safe parallel:

```text
- offscreen NPCs in different locations with disjoint write scopes;
- independent reflections;
- memory retrieval;
- proposal generation;
- different command nodes without shared resources;
- deterministic plan execution.
```

Unsafe parallel without locks/rebase:

```text
- two actors attempt to take same item;
- faction spends same resource pool twice;
- NPC and player affect same door/route/item;
- hidden job commits while player turn is reading state;
- two actors enter same contested scene and fight.
```

Use write scopes:

```text
write_scope = actors + locations + items + faction_resources + threads
```

Parallel jobs can execute if scopes do not conflict. If they conflict: serialize, or run proposals and rebase.

### 8.8. Async work after done

After `done`, do not mutate authoritative state secretly. But use the time while player reads/thinks/types.

Allowed async outputs:

```text
- actor proposal for next due decision;
- command node proposal;
- thread advancement proposal;
- reflection draft;
- memory compaction;
- embeddings/vector indexes;
- retrieval cache;
- LLM review artifact.
```

Each proposal carries:

```text
base_version
read_set
write_scope
preconditions
due_world_time
entity_id
provenance
expiration
```

At next authoritative boundary:

```text
if base_version still valid and preconditions hold:
  validate and commit
else:
  discard or rebase
```

This gives real latency reduction without stale-state bugs.

### 8.9. Prompt caching and static prefix discipline

Prompt caching helps only if repeated prompts keep stable prefixes. OpenAI’s prompt caching documentation explicitly recommends keeping static content early and variable content later; structured schemas and tool definitions can be part of cached prefixes [S9].

Prompt layout:

```text
STATIC CACHED PREFIX
  engine policy
  tool schemas
  output schemas
  role contract
  grounding rules
  stable style guide

DYNAMIC SUFFIX
  current SceneFrame / ActorFrame
  retrieved memories
  player input
  legal candidates
```

Do not reorder schemas, examples or system policy casually. Exact prefix stability matters.

### 8.10. Model cascade

| Task | Model class | Reason |
| --- | --- | --- |
| Player-facing narration | strongest prose model | Quality-critical |
| Key NPC branch decision | strong reasoning model | Agency-critical |
| GM Read | strong/mid depending complexity | Must interpret intent |
| Reflection | mid/strong depending importance | Often async |
| Memory retrieval query generation | small/mid | Structured task |
| Grounding/schema lint | deterministic/small | Mostly mechanical |
| Rumor distortion | small/mid | Not core reasoning unless sensitive |
| Plan continuation | backend only | Already committed plan |

Small model may propose. Backend always validates.

### 8.11. UI stages for long turns

Do not hide long thinking behind a spinner. Show honest stages without leaking hidden truth:

```text
Resolving your action...
Checking local reactions...
Advancing world time...
Resolving consequences outside your immediate view...
Updating memories and reports...
Writing scene...
```

Never show:

```text
Goku is fighting Frieza right now...
```

unless player actually knows that.

---

## 9. Memory/context budget: как не засрать контекст

### 9.1. Core principle

The memory problem is not “how do we fit everything into context”. The answer is: we do not.

```text
Context is RAM/cache, not database.
```

The model gets only a working set. Authoritative memory lives outside prompt.

Research direction supports this: Generative Agents used memory stream, retrieval, reflection and planning to produce believable behavior [S1]. MemGPT frames long-term interaction as virtual context management with memory tiers [S3]. RAG formalizes separation between model parameters and external non-parametric memory [S4]. Long context alone is not enough: Lost in the Middle found that models can fail to robustly use information in long inputs, especially when relevant facts are in the middle [S2].

### 9.2. Memory tiers

| Tier | Name | Stored where | Enters prompt? | Purpose |
| --- | --- | --- | --- | --- |
| M0 | Authoritative state | DB/state store | selected fields | HP, location, inventory, status, world_time |
| M1 | Event log | append-only event store | selected snippets | causality, rollback, provenance |
| M2 | Actor belief store | structured DB | filtered | what actor believes, with confidence/source |
| M3 | Episodic memory | per-actor stream/index | retrieved subset | observations, conversations, failures, promises |
| M4 | Reflections | per-actor summaries | small subset | higher-level beliefs/goals/relationships |
| M5 | Thread/location digests | summaries with provenance | if relevant | long events and place continuity |
| M6 | Archive/vector+lexical index | search system | no, only results | long tail |
| M7 | Prompt cache prefix | provider/cache | always prefix | stable rules/tools/schema |

Never put raw M1-M6 wholesale into prompt.

### 9.3. Canonical memory record

```text
MemoryRecord {
  memory_id
  owner_id                  // actor/faction/player/global
  source_event_ids
  world_time
  location_ids
  involved_actor_ids
  type: observation | conversation | report | rumor | reflection | plan | promise | failure
  salience
  emotional_valence
  confidence
  privacy: private | faction | public | player_known
  text_summary
  structured_tags
  embedding_id
  superseded_by
}
```

Beliefs are separate from truth:

```text
Belief {
  owner_id
  proposition
  confidence
  source_memory_ids
  source_event_ids
  last_updated
  contradicted_by
}
```

This lets a guard believe “player may have a permit” without creating `player.has_permit = true`.

### 9.4. Context budgets by call type

These are target dynamic budgets. Static cached prefix is separate, but still must be kept sane.

| Call type | Dynamic target | Hard warning | Content |
| --- | ---: | ---: | --- |
| GM Read | 8k-20k | 30k | Current scene truth, player-known facts, legal candidates, local recent events |
| GM Tool Planner | 6k-18k | 25k | GM Read + tool result observations |
| Key NPC Actor Brain | 8k-24k | 35k | Actor state, goals, beliefs, affordances, memories, inbox |
| Present social NPC reaction | 4k-12k | 20k | Scene, relationship, relevant memories |
| Combat actor decision | 4k-10k | 16k | Tactical state, abilities, threat, objective |
| Command node | 10k-30k | 45k | Reports, resources, policies, operations, commander POV |
| World thread advancement | 6k-18k | 30k | Thread state, stage, attached entities, surface routes |
| Reflection | 10k-35k | 60k | Recent memories, contradictions, importance |
| Narrator | 5k-18k | 25k | PlayerFacingPacket only |
| LLM reviewer/eval | 10k-40k | 80k | Logs/artifacts, not runtime-critical |

Normal interactive target:

```text
GM Read dynamic <= 15k
Actor dynamic <= 20k each
Narrator dynamic <= 12k
```

### 9.5. Per-key-NPC ActorFrame budget

```text
ActorFrame budget target: 10k-22k dynamic tokens
```

| Section | Target | Notes |
| --- | ---: | --- |
| Actor identity capsule | 500-1,000 | Stable values, taboos, style; cache if possible |
| Current body/state/resources | 300-800 | Location, HP, powers, inventory, fatigue |
| Current goals and active plan | 700-1,500 | Goal stack, next step, deadlines |
| Beliefs relevant to decision | 1,000-3,000 | Confidence/source, not global truth |
| Relationships relevant now | 500-1,500 | Only involved actors/factions |
| Direct observations/inbox | 1,000-3,000 | Since last decision |
| Local affordances | 1,000-3,000 | People, exits, objects, hazards, legal tools |
| Retrieved episodic memories | 2,000-8,000 | 6-15 memories, not entire history |
| Constraints and output schema | 1,000-2,000 | Tool contract, no-omniscience rules |

### 9.6. Narrator budget

Player-facing Narrator should be one of the smallest prompts because it must not know hidden truth.

```text
Narrator dynamic target: 5k-12k
```

It receives:

```text
visible location facts
visible actors and states
player-known facts
sensory events
heard rumors as rumors
legal affordances
final committed tool outcomes
style constraints
```

It does not receive:

```text
secret plans
unobserved offscreen battles
NPC private beliefs
true cause of unknown events
future scheduled events
unresolved proposals
full world map unless player knows it
```

### 9.7. Retrieval must be hybrid

Vector-only retrieval will fail because RPG memory needs exact names, promises, dates, items, permits, oaths and source events.

Use hybrid candidate generation:

```text
candidate_set = semantic_vector(query)
              + lexical/BM25(entity names, items, places)
              + structured filters(actor_id, location_id, thread_id, time range)
              + graph neighbors(relationships, source events)
```

Then rerank:

```text
score = relevance_to_current_decision
      + recency
      + salience/importance
      + relationship weight
      + unresolved promise/obligation weight
      + contradiction risk
      + source reliability
```

Generative Agents used relevance, recency and importance as key retrieval dimensions [S1]. WorldForge should add provenance, legal relevance and contradiction risk.

### 9.8. Retrieval query generation

Do not retrieve with one vague query:

```text
"memories relevant to current scene"
```

Generate multiple retrieval intents:

```text
1. Self continuity:
   What was I trying to do recently and why?

2. Relationship:
   What do I know about this player / NPC / faction?

3. Current objective:
   What past events affect my plan?

4. Location:
   What do I know about this place and its dangers?

5. Promises and obligations:
   What commitments constrain my action now?

6. Contradictions:
   What memories disagree with the new report?
```

Retrieve many candidates cheaply, then rerank down to a small packet.

### 9.9. Memory write policy

A memory system dies if every sentence becomes durable memory.

Write memory when:

```text
actor directly observed an event
actor received a message/report/rumor
promise/threat/order was made
relationship changed
goal changed
tool failed or succeeded consequentially
hidden info was revealed to that actor
location/item/faction state relevant to actor changed
player made a false claim that someone heard
```

Do not write memory for:

```text
every atmospheric sentence
every generic greeting
every unchanged room description
narrator flavor not tied to state
internal model reasoning
uncommitted proposals
```

### 9.10. Compaction without losing truth

Raw event log remains authoritative. Summaries are indexes, not truth replacements.

Use layered compaction:

```text
Turn digest:
  5-10 event bullets, source IDs.

Scene digest:
  what changed here, who knows, open hooks.

Actor daily digest:
  observations, emotional changes, promises, unresolved goals.

Thread digest:
  stage changes, involved actors, surface signals, next due.

Arc digest:
  high-level history with provenance.
```

Bad summary:

```text
Mara hates the player.
```

Good summary:

```text
Mara distrusts the player (confidence 0.72) because event_184: player lied about the permit, and event_201: guard report contradicted him.
```

### 9.11. Context placement

Because long contexts may be unreliable when critical information is buried in the middle [S2], place highest-priority facts in high-salience positions.

Recommended prompt order:

```text
BEGINNING
  role contract
  non-negotiable constraints
  current objective
  current state summary

MIDDLE
  retrieved memories
  detailed local facts
  legal tools

END
  immediate task
  latest observations
  required output schema
  no-hidden-truth reminder
```

Do not bury immediate constraints in the middle of 80k tokens.

### 9.12. ContextBudgetTrace

Every LLM call should produce/record:

```text
ContextBudgetTrace {
  call_id
  call_type
  total_tokens
  static_prefix_tokens
  dynamic_tokens
  retrieved_memory_count
  dropped_candidate_count
  top_retrieval_reasons
  hidden_truth_excluded_count
  budget_status: ok | warning | fail
}
```

Hard fail if:

```text
player-facing narrator receives hidden truth
ActorFrame includes facts actor cannot know
context includes full campaign history without retrieval reason
retrieved memories lack source IDs
summaries overwrite authoritative state
```

---

## 10. NPC POV and knowledge model

NPC actor brain receives ActorFrame, not WorldState.

```text
ActorFrame {
  actor_id
  self_state
  known_facts / beliefs
  direct_observations
  inbox: messages, rumors, reports
  retrieved_memories
  relationships_as_believed
  active_goals
  active_plan
  local_affordances
  legal_tools
  constraints
}
```

Prompt contract:

```text
You are this actor, not the GM.
You only know what is in this frame.
Do not react to hidden truth.
If you suspect something, record a belief or investigate.
Act through tools only.
```

### 10.1. Truth vs belief

Player says:

```text
"I have a royal permit."
```

Backend creates:

```text
Event: claim_made(player, content="I have a royal permit")
```

Listening guard may create:

```text
Belief: player_may_have_permit, confidence=0.35, source_event=claim_made
```

Backend must not create:

```text
player.has_permit = true
```

### 10.2. Knowledge propagation

Use bounded propagation, not full epistemic logic.

Mechanisms:

```text
Direct observation:
  same scene / sensory range / stealth rules.

Reports/messages:
  source, recipient, channel, latency, reliability.

Rumors:
  origin_event_id, distortion, confidence, channels, spread rate.

Inference:
  writes belief, not truth.
```

---

## 11. Tool design proposal

Offscreen NPCs should not use GM tools. They use actor tools. Command nodes use faction/unit tools. World threads use thread tools. All hit backend validators.

### 11.1. Actor tools

```text
observe(scope)
move_to(destination, route, pace)
speak(targets, utterance, intent)
send_message(target, channel, content)
attempt_action(action_type, target, method, stakes)
attack(target, method)
defend(method)
flee(destination_hint)
hide(method)
train(skill, teacher_or_method, duration)
search(target_or_area, method)
use_item(item_id, target)
give_item(target, item_id)
request_help(target, ask, offered_terms)
update_own_goal(goal_id, status, reason)
schedule_plan_step(goal_id, action_hint, due_at, preconditions)
record_belief(proposition, confidence, source_event_ids)
```

### 11.2. Command node / faction tools

```text
review_reports(scope)
issue_order(unit_or_actor, objective, constraints)
allocate_resource(resource, amount, objective)
launch_operation(operation_type, target, resources)
change_patrol_pattern(location, intensity, duration)
investigate(report_or_location)
spread_notice(content, channel)
negotiate(target, proposal)
sanction_member(actor, reason)
change_policy(policy, new_state, reason)
```

Bad:

```text
set_security_high(city)
```

Good:

```text
issue_order(west_gate_patrol, objective="double patrols", duration="6h")
allocate_resource(guards, 6, objective="West District response")
```

### 11.3. ToolResult schema

```text
ToolResult {
  tool_call_id
  source_entity
  base_version
  success: true | false | partial
  elapsed_time
  state_deltas
  events_created
  resources_spent
  witnesses
  knowledge_outputs
  visibility_outputs
  failure_reason
  next_decision_suggestions
}
```

No fake successful no-op.

---

## 12. Ordering, simultaneity, rollback

### 12.1. Recommended order

```text
1. Resolve overdue required simulation before current SceneFrame.
2. Player observes and acts at world_time T.
3. Resolve player action and local contest.
4. Advance world by elapsed duration DeltaT.
5. Resolve due independent processes in [T, T + DeltaT].
6. Commit required consequences.
7. Narrate from visible committed truth.
```

### 12.2. Simultaneous conflicts

If player and NPC act during same window:

```text
player tries to grab sword
NPC tries to grab same sword
```

Use:

```text
event timestamps
initiative/readiness/distance
predeclared plan
oracle only if uncertainty remains
backend precondition validation
```

Only one state can own the sword. The other gets failed/partial result.

### 12.3. Travel as simulation driver

Travel is one of the best living-world mechanisms.

```text
Player moves Cafe -> Docks.
Graph says 35 minutes.
World advances 35 minutes.
Due events occur.
Destination may have changed.
```

This lets tourist route remain valid without making player the center.

### 12.4. Rollback

Use event sourcing + snapshots.

```text
TurnCheckpoint {
  checkpoint_id
  world_version
  world_time
  simulation_queue_state
}
```

Undo should:

```text
revert to checkpoint
mark later events superseded
cancel jobs based on reverted versions
invalidate async proposals
clear narrator cache
```

---

## 13. Turn boundary and async policy

Before `done`, complete everything that can affect the next SceneFrame or current narration.

Must be before `done`:

```text
player tool execution
present NPC reactions
combat state
current scene mutations
travel arrival consequences
due exposed timers
world threads touching current/known scope
reflection for actors about to act/be read
knowledge propagation to present witnesses
```

Can be async after `done`:

```text
embeddings
image generation
long-term compaction
LLM quality review
forecast/advisory
future proposals
low-priority reflection drafts
```

`done(version=N)` means:

```text
Final narration came from committed visible truth at version N.
Current scene is resolved through current world_time.
No hidden job can later mutate version <= N.
Next GM Read will not silently read stale state.
```

---

## 14. Dragon Ball-style example

Initial state:

```text
Goku:
  goal: prepare for Frieza rematch
  plan: travel to Kai -> train advanced Kamehameha -> return if Frieza signal appears
  next_decision_at: arrival at Kai planet or urgent report

Frieza:
  goal: find Dragon Balls
  plan: interrogate scouts -> raid nearby city -> move toward capsule lab

Bulma:
  goal: track Dragon Ball energy signatures
  plan: repair scanner -> send report to Goku if Frieza signature confirmed

Player:
  location: cafe
  status: unknown civilian
```

Player turn:

```text
Player: "Я беру мороженое и сижу в кафе полчаса."
```

Backend:

```text
DeltaT = 30 minutes
player event: ate_ice_cream at cafe
local witnesses: waiter, cafe patrons
```

World-time advancement:

```text
Goku plan step: training continues, no decision point yet.
Frieza plan step: raid starts in neighboring district, validated by power/resources.
Bulma sensor step: detects anomaly, sends message to Goku with latency.
World thread: city destruction event created.
Rumor seed: "something exploded in West District" begins spreading.
```

Player-facing narration:

```text
Ты доедаешь мороженое. Кафе живет своей жизнью. Через двадцать минут где-то далеко за окнами дрожит стекло. Несколько посетителей замолкают и смотрят на запад, но никто здесь еще не знает, что именно произошло.
```

This narration is allowed because there is a committed distant explosion event and the cafe is in sensory range. It cannot say “Frieza destroyed West District” unless player knows that.

Later:

```text
Player travels west.
Backend catches up location.
Ruins exist because event committed.
Survivors have memories.
Frieza remembers battle.
Goku remembers receiving Bulma's report and maybe arriving late.
```

That is the target feeling.

---

## 15. Testing and evaluation plan with latency/memory

### 15.1. Hard pass/fail tests

Fail if:

```text
Player-facing narration mentions durable state absent from PlayerFacingPacket.
NPC reacts to hidden truth not in ActorFrame.
False player claim creates backend truth.
Present NPC state changes after done before next turn without versioned commit.
Async job commits against obsolete base_version.
ActorFrame exceeds hard context budget without override.
Narrator receives hidden truth.
Tool success has no state/event/observation when one was required.
Rollback leaves future memories/events/jobs alive.
Faction command node acts on report that never arrived.
```

### 15.2. Latency metrics

```text
TurnLatencyTrace {
  turn_id
  turn_class
  wall_clock_total
  backend_time
  llm_call_count
  serialized_llm_group_count
  parallel_group_count
  max_parallel_group_time
  retry_count
  prompt_tokens_by_call
  output_tokens_by_call
  cache_hit_estimate
  blocked_on_reflection_time
  blocked_on_actor_time
  blocked_on_narrator_time
}
```

Targets:

```text
p50 normal turn <= 5 min
p90 normal turn <= 8 min
p95 normal/heavy interactive turn <= 10 min
serialized LLM groups <= 4 normal, <= 5 heavy
ActorFrame dynamic tokens <= 24k target
Narrator hidden facts = 0
```

### 15.3. Memory metrics

```text
ContextBudgetTrace:
  total dynamic tokens
  retrieved memories included
  retrieved memories dropped
  unsupported inclusions
  source ID coverage
  hidden truth exclusions
  budget overflow reason

MemoryQualityTrace:
  relevant memory recall rate
  irrelevant memory pollution rate
  duplicate memory rate
  stale belief rate
  contradiction detection rate
  source provenance coverage
```

### 15.4. Required playtest routes

Tourist route:

```text
Player eats, walks, watches, sleeps, asks rumors.
Expected: world advances; no forced protagonist drama; offscreen events surface through valid channels.
```

Key NPC route:

```text
Player ignores Goku for days, then meets him.
Expected: Goku has committed events, memories, changed status/skills/location.
```

Follow route:

```text
Player shadows key NPC.
Expected: NPC had plan before player arrived; interruptions cause replan.
```

False claim route:

```text
Player claims authority/item/permit.
Expected: claim event and beliefs, no truth mutation.
```

Faction route:

```text
Player causes trouble; guard report latency tested.
Expected: faction response only after observation/report path.
```

Memory stress route:

```text
100+ turns with repeated NPC contacts.
Expected: context remains under budget; relevant old memories still retrieved.
```

Latency stress route:

```text
Player enters scene with 3 key NPCs and one due world thread.
Expected: parallel actor group; total <= 10 min target; no skipped required reactions.
```

---

## 16. Final-product implementation order

This is not “fake MVP”. It is construction order for final quality. Building everything at once makes correctness impossible.

### Phase 1. Authority spine

Build/fix:

```text
WorldVersion
WorldTime
EventLog
ToolResult schema
PlayerFacingPacket
ActorFrame
BeliefStore
SimulationQueue
Turn lock
Rollback checkpoint
```

Success:

```text
No state-bearing mutation outside authoritative commit.
Narrator only sees redacted packet.
Actor brain only sees ActorFrame.
```

### Phase 2. Key NPC co-player loop

Build:

```text
KeyActorProcess
active_plan
next_decision_at
pending_interrupts
actor tools
actor tool validation
parallel present actor reactions
```

Success:

```text
A key NPC can pursue a goal offscreen, move, fail, replan, remember, and later explain/reflect based on committed events.
```

### Phase 3. Latency control

Build:

```text
TurnLatencyTrace
serialized LLM group counter
parallel job runner with write scopes
proposal cache
prompt prefix cache discipline
model cascade config
context token counters
```

Success:

```text
Normal turns have <= 4 serialized LLM groups.
Heavy turns have <= 5.
p90 normal <= 8 min.
p95 heavy <= 10 min target.
```

### Phase 4. Memory hierarchy

Build:

```text
MemoryRecord schema
hybrid retrieval
reranker
reflection records
turn/scene/actor/thread digests
ContextBudgetTrace
source provenance
```

Success:

```text
No full-history prompts.
Relevant old memories can be retrieved.
Actor ignorance and beliefs remain coherent.
```

### Phase 5. Factions as command networks

Build:

```text
FactionState
command nodes
standing orders
report channels
latency/reliability
resource validation
operation ledger
```

Success:

```text
Faction responds through known reports, leaders, units and resources; not through omniscient abstract ticks.
```

### Phase 6. World threads and surfacing

Build:

```text
WorldThread state
stage/clocks
surface_routes
rumor objects
location consequences
thread digests
```

Success:

```text
Player can be a tourist while the world advances, and consequences later surface through valid diegetic routes.
```

### Phase 7. Evaluation harness

Build:

```text
scripted playtest routes
latency dashboard
memory dashboard
grounding checker
knowledge leak checker
LLM/human review packets
rollback tests
```

Success:

```text
You can prove with logs that NPC autonomy, latency and memory budgets work.
```

---

## 17. Risks and tradeoffs

### 17.1. Autonomy can produce boring offscreen actions

Real autonomy means NPCs sometimes do mundane things. That is okay. But key NPCs need goals with dramatic potential and world stakes.

Mitigation:

```text
Give key NPCs meaningful long-term goals, rivals, constraints, scarcity and deadlines.
```

### 17.2. Offscreen consequences can feel unfair

If Frieza destroys a city without prior signal, player may feel cheated.

Mitigation:

```text
surface consequences gradually;
leave clues;
use rumors/reports/sensory signs;
allow investigation after the fact.
```

### 17.3. Memory compression can distort personality

Summaries can oversimplify relationships.

Mitigation:

```text
source IDs, confidence, contradictions, raw event log retrieval for high-stakes scenes.
```

### 17.4. Latency pressure creates temptation for fake shortcuts

Dangerous shortcut:

```text
prose without state
```

Mitigation:

```text
grounding checks;
event/state-backed narration only;
optional scope reduction, not truth reduction.
```

### 17.5. Async proposals can become hidden mutation

If proposals are treated as truth, stale-state bugs return.

Mitigation:

```text
Proposal != state.
Commit only at authoritative boundary after validation/rebase.
```

---

## 18. Research and references

These are not templates to copy literally; they are donor ideas.

[S1] Park et al., “Generative Agents: Interactive Simulacra of Human Behavior”. Useful for memory stream, retrieval by relevance/recency/importance, reflection and planning. https://arxiv.org/abs/2304.03442

[S2] Liu et al., “Lost in the Middle: How Language Models Use Long Contexts”. Useful warning: long context does not guarantee reliable use of facts, especially when facts sit in the middle. https://arxiv.org/abs/2307.03172

[S3] Packer et al., “MemGPT: Towards LLMs as Operating Systems”. Useful for virtual context management and memory tiers. https://arxiv.org/abs/2310.08560

[S4] Lewis et al., “Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks”. Useful for separating model knowledge from external non-parametric memory and retrieval provenance. https://arxiv.org/abs/2005.11401

[S5] Yao et al., “ReAct: Synergizing Reasoning and Acting in Language Models”. Useful for interleaving reasoning and environment/tool actions, but WorldForge must keep backend authority. https://arxiv.org/abs/2210.03629

[S6] Orkin, “Three States and a Plan: The A.I. of F.E.A.R.”. Useful for goals/actions/preconditions/effects and replanning after failures. https://www.gamedevs.org/uploads/three-states-plan-ai-of-fear.pdf

[S7] Bay 12 Games, Dwarf Fortress features. Useful as precedent for persistent generated worlds and history emerging from simulation. https://www.bay12games.com/dwarves/features.html

[S8] Dwarf Fortress Wiki, World generation/history. Useful for event/history generation as inspectable world record. https://dwarffortresswiki.org/index.php/World_generation

[S9] OpenAI API Prompt Caching documentation. Useful for static prefix discipline and latency/cost reduction when prompts share repeated prefixes. https://developers.openai.com/api/docs/guides/prompt-caching

[S10] OpenAI API Structured Outputs documentation. Useful for schema adherence and tool/function-calling patterns. https://developers.openai.com/api/docs/guides/structured-outputs

---

## 19. Final position

Твоя core-идея хорошая:

```text
WorldForge должен иметь key NPC, которые ощущаются как другие игроки.
```

Но правильная реализация не такая:

```text
call every NPC every player turn with huge context
```

А такая:

```text
Key NPC = co-player process.
Equality = equal causal agency over world_time.
LLM = decision at branch points.
Backend = authority and state mutation.
Memory = external hierarchy, not giant prompt.
Latency = bounded critical path and parallel actor groups.
Narration = committed visible truth only.
```

Это дает именно нужный эффект: player может быть туристом в Dragon Ball-like мире, а Goku, Frieza, Bulma, Vegeta и другие key NPC будут жить, ошибаться, тренироваться, воевать, помнить и оставлять последствия независимо от того, смотрит player на них или нет.

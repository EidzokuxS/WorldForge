# Phase 70 Consensus: World Simulation Data Flow and Minimal Runtime Authority

**Status:** research synthesis / planning input  
**Date:** 2026-04-25  
**Scope:** post-Phase-69 WorldForge gameplay runtime  
**Do not treat as implementation plan yet.** This is the decision document that should feed the next GSD discussion/plan cycle.

## Inputs

- Local handoff: [70-HANDOFF-WORLD-SIMULATION-AUDIT.md](/R:/Projects/WorldForge/.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-HANDOFF-WORLD-SIMULATION-AUDIT.md)
- Local draft: [70-CONTEXT-DRAFT.md](/R:/Projects/WorldForge/.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-CONTEXT-DRAFT.md)
- Local discussion log: [70-DISCUSSION-LOG.md](/R:/Projects/WorldForge/.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-DISCUSSION-LOG.md)
- Code audit: `chat.ts`, `turn-processor.ts`, `world-brain.ts`, `hidden-adjudication.ts`, `scene-assembly.ts`, `npc-agent.ts`, `scene-presence.ts`, `prompt-assembler.ts`
- GitNexus freshness: `npx gitnexus status` reported indexed commit `9e3cb4b` equals current commit `9e3cb4b`
- External reviewers:
  - Claude CLI architecture review
  - Gemini CLI devil's-advocate review
- External references listed at the end of this document

## Executive Decision

The next architecture should not build a larger multi-agent simulation loop.

The next architecture should introduce one **Scene Planner of Record** for the local visible turn.

The conservative Phase 70 path:

1. Keep the current Oracle as a separate bounded outcome call for now.
2. Replace `WorldBrainSceneDirection + HiddenAdjudicationPlan + tickPresentNpcs` on the visible-turn critical path with one structured `ScenePlan`.
3. Keep backend deterministic ownership over state, validation, visibility, tool execution, persistence, rollback, retry, and tick boundaries.
4. Let LLMs judge freeform meaning, likely actor response, scene stopping point, and final prose.
5. Move autonomous NPC/world/faction drift out of the visible-turn critical path unless its result is explicitly selected by the Scene Planner as part of the local visible scene.

The goal is simple:

> Player writes one message. Backend builds the factual situation. Judge decides one coherent local scene step. Backend validates and commits it. Storyteller renders only the player-perceivable committed packet.

## Current Pipeline Finding

Phase 69 fixed storyteller ownership. The storyteller no longer directly decides hidden world mutations during the normal player turn.

The remaining problem is temporal fragmentation.

Current `POST /api/chat/action` shape:

1. Route starts a turn lock, resolves Judge/Storyteller providers, captures pre-turn snapshot.
2. `processTurn()` loads state and player record.
3. `detectMovement()` may use Judge LLM to parse movement.
4. `resolveActionTargetContext()` resolves target context, with LLM involvement in ambiguous target interpretation.
5. `callOracle()` returns the action outcome.
6. `runWorldBrainSceneDirection()` asks Judge LLM for focal actors, background actors, causal beats, and narration guardrails.
7. `assembleJudgeAdjudicationPrompt()` builds the hidden adjudication prompt.
8. `runHiddenAdjudicationPlan()` asks Judge LLM for ordered backend tool actions.
9. `executeAdjudicationPlan()` runs those tools deterministically.
10. `onBeforeVisibleNarration()` runs `tickPresentNpcs()` for key NPCs in the current scene before final prose.
11. `assembleAuthoritativeScene()` gathers effects, committed events, recent local context, present actors, and player-perceivable consequences.
12. `assembleFinalNarrationPrompt()` builds the final storyteller prompt.
13. `runVisibleNarrationWithGuard()` asks Storyteller LLM for visible prose.
14. Chat history is appended, tick advances, rollback-critical post-turn work runs, then `done` is emitted.

The critical smell is step 10.

`tickPresentNpcs()` runs autonomous key NPC ticks inside the player-visible turn after the judge-owned plan has already executed. Each key NPC gets its own LLM decision and tools. Those NPC ticks are not coordinated as one local scene step. Final narration then receives a pile of facts and must make them read like one coherent event.

This is exactly the player-facing failure:

- neutral player input can be followed by abrupt escalation
- several NPCs can act as if each owns a separate turn
- the player receives aftermath instead of readable cause and effect
- narrator is forced to reconstruct sequence from final state

## Reviewer Consensus

Claude and Gemini independently agreed on the central diagnosis:

- The problem is not storyteller prose quality.
- The problem is not that NPCs act.
- The problem is that local scene action is authorized by multiple uncoordinated decision makers.
- Key NPC autonomy should not run as a free mini-round in the visible turn.
- A local player-visible turn needs one planner of record before final narration.

Main difference:

- Claude recommended a bolder two-call critical path: one Judge planner plus one Storyteller.
- Gemini recommended the same simplification, but emphasized keeping it minimal.
- This synthesis keeps Oracle separate for the first migration because Phases 66-67 already use Oracle outcome as a tested combat/narrative authority. Fusing Oracle into planner can come later after evaluation.

## Design Principles

### 1. Situation first, not plot first

WorldForge should maintain a living situation, not write a hidden plot and force the player through it.

The Alexandrian's "Don't Prep Plots" framing is directly relevant: prepare situations that react to player action rather than pre-baked sequences. WorldForge's equivalent is storing state, actors, tensions, channels, and recent events, then resolving the next local step from those facts.

### 2. Declare, determine, describe

D&D's official rhythm is: the GM describes a scene, players describe what characters do, the GM determines results, then narrates the results. The important architecture lesson is ordering:

1. input
2. determination
3. committed result
4. narration

Narration is last. It must not invent what determination skipped.

### 3. LLMs can reason and act, but the action space must be bounded

ReAct-style systems show why interleaving reasoning and actions can work: the model can track plans and interact with tools or environments. WorldForge should use that strength only behind strict schemas, allow-lists, and deterministic execution.

The mistake is not "LLM chooses actions." The mistake is "several LLM actors choose actions independently for one visible scene and then prose tries to reconcile them."

### 4. Believable agents need observation, planning, and reflection, but not all inside one visible turn

The Generative Agents paper supports the value of observation, planning, and reflection for believable behavior. It does not imply every present NPC must run an independent full agent loop during the player's response.

WorldForge should keep:

- observation as committed events and scene perception
- planning as the Scene Planner of Record for local visible turns
- reflection as slower background state update

### 5. Structured output is necessary but not sufficient

Structured output and schema-constrained generation help make model output parseable. They do not make the output true. Backend must still validate actor eligibility, visibility, tool arguments, state constraints, and persistence.

## Engine vs LLM Boundary

Rule:

> LLM decides meaning and likely intent. Engine decides legality, persistence, visibility, and what actually becomes canonical.

| Concern | Owner | Reason |
| --- | --- | --- |
| Campaign state, DB rows, HP, inventory, relationships, tags, known locations | Engine | Must be reproducible, rollback-safe, and inspectable |
| Scene scope, broad location, present actor IDs | Engine | Derivable from stored state |
| Awareness bands (`clear`, `hint`, `none`) | Engine | Existing `scene-presence.ts` already models this deterministically |
| Actor allow-list for a turn | Engine | Prevents invented actors and broad-location bleed |
| Remote involvement channels | Engine first, LLM may interpret | Channel existence must be stored; meaning of channel use can be judged |
| Combat envelope, power mismatch, hard prohibitions | Engine | Deterministic from `powerStats` and action type |
| Oracle outcome | LLM for now, bounded by engine constraints | Semantic judgment, but output is small and validated |
| Player action interpretation | LLM | Freeform natural language |
| Local primary response choice | Scene Planner LLM | Human-like judgment over motives, tension, and opportunity |
| Support beats | Scene Planner LLM | Literary/semantic selection |
| Tool execution | Engine | Already Phase 69 strength |
| Deferred hooks | LLM proposes, Engine stores/TTL | Hooks are semantic, lifecycle is deterministic |
| Narrator packet | Engine | Must filter hidden facts |
| Final prose | Storyteller LLM | Literary rendering |
| Reflection, off-screen drift, faction activity | Background LLM workers with engine validation | Believability over time, not local visible turn authority |

## What LLMs Should Not Own

LLMs should not own:

- whether an actor exists
- whether an actor is physically present
- whether an actor can perceive the scene
- whether a movement path is connected
- whether a tool argument is valid
- whether HP/inventory/location changed
- whether a hidden fact can appear in player-facing narration
- whether retry/undo state is safe
- whether a long-running async step blocks player response

If the answer can be computed from DB state and stable rules, it belongs in backend code.

## What Backend Should Not Own

Backend code should not try to hard-code:

- what a vague player sentence "means" socially
- whether an insult, silence, smile, or hesitation matters in context
- which NPC response is dramatically natural
- how much of a complex moment is enough before returning control
- the final prose voice
- literary pacing

These are semantic and aesthetic judgments. LLMs are the right tool, but only inside bounded packets.

## Proposed Turn Model

### Step 0: Turn lock and rollback boundary

Keep current `tryBeginTurn()`, pre-turn snapshot, failure restore, and last-turn snapshot behavior.

No change.

### Step 1: Engine builds `SceneFrame`

One deterministic builder should gather:

- campaign id and current tick
- player id, label, current location, current scene scope
- current scene row
- present actors in scene scope
- actors in broad location but outside scene scope
- player awareness of each actor
- each present actor's awareness of the player and other present actors
- known remote channels, if any
- recent local events
- pending deferred hooks
- target candidates
- movement candidates
- combat envelope candidate, if action appears hostile
- allowed runtime tools for this turn

This replaces the current loose spread across `processTurn()`, `assembleAuthoritativeScene()`, `world-brain.ts`, and `npc-agent.ts`.

Suggested type:

```ts
interface SceneFrame {
  campaignId: string;
  tick: number;
  player: SceneActor;
  scene: {
    broadLocationId: string | null;
    sceneScopeId: string | null;
    name: string | null;
    description: string | null;
    tags: string[];
  };
  roster: {
    active: SceneActor[];
    support: SceneActor[];
    background: SceneActor[];
  };
  perception: {
    byObserverId: Record<string, Record<string, "clear" | "hint" | "none">>;
    knowledgeBasisByObserverId: Record<string, Record<string, KnowledgeBasis>>;
    playerHints: string[];
  };
  channels: SceneChannel[];
  recentEvents: SceneEventSummary[];
  deferredHooks: DeferredSceneHook[];
  targetCandidates: TargetCandidate[];
  movementCandidates: MovementCandidate[];
  combatEnvelope: CombatEnvelope | null;
  allowedTools: RuntimeToolName[];
}
```

### Step 2: Oracle stays bounded for Phase 70A

Keep current Oracle as a separate bounded call in the first migration.

Reason:

- Phases 66-67 already attach combat envelope and outcome bounds to Oracle result.
- Oracle is smaller and easier to test separately.
- The Scene Planner should not be tempted to pick outcome tier just because it wants a prettier scene plan.

Later, after real evals, Oracle can be folded into Scene Planner if the extra call is proven wasteful.

### Step 3: Scene Planner LLM returns `ScenePlan`

This is the central replacement for:

- `runWorldBrainSceneDirection()`
- `runHiddenAdjudicationPlan()`
- visible-turn `tickPresentNpcs()`

The planner receives:

- player input
- `SceneFrame`
- Oracle result
- outcome bounds
- recent conversation excerpt
- allowed actors and tools

It returns a strict object.

Suggested schema:

```ts
interface ScenePlan {
  actionInterpretation: {
    summary: string;
    kind:
      | "movement"
      | "speech"
      | "social"
      | "physical"
      | "combat"
      | "investigation"
      | "supernatural"
      | "wait"
      | "other";
    targetActorIds: string[];
    targetObjectIds: string[];
    ambiguity: string | null;
    perceivableSignals: string[];
  };
  anchorEvent: {
    summary: string;
    actorId: string;
    targetIds: string[];
    perceivable: true;
    opensReactionWindow: boolean;
  };
  primaryResponse: SceneResponse | null;
  supportResponses: SceneResponse[];
  plannedActions: PlannedRuntimeAction[];
  deferredHooks: DeferredSceneHook[];
  narratorFacts: {
    perceivableEvents: string[];
    tensionDelta: "down" | "same" | "up";
    sceneFocusAfter: string;
    controlReturnReason: string;
  };
  hiddenRationale: string;
}

interface SceneResponse {
  actorId: string;
  responseType: "speak" | "act" | "react" | "notice" | "ignore" | "defer";
  summary: string;
  perceivable: boolean;
  plannedActionIndexes: number[];
}
```

Caps:

- `primaryResponse`: max 1
- `supportResponses`: max 2 in normal scenes
- `plannedActions`: max 8, matching current `ADJUDICATION_PLAN_ACTION_LIMIT`
- `deferredHooks`: max 4, TTL-bound
- `hiddenRationale`: max 280 chars, current precedent

Important nuance:

The cap is not "only one NPC may matter." It is "only one scene-changing response is primary." Support beats can show other actors noticing, hesitating, speaking briefly, repositioning, or becoming a future hook, but they cannot independently rewrite the whole scene.

### Step 4: Engine validates `ScenePlan`

Validation must be boring and strict.

Required checks:

- every actor id exists in `SceneFrame`
- primary actor is in `roster.active` or justified by a channel
- support actors are in `roster.active` or `roster.support`
- background actors cannot take visible scene-changing actions
- hidden actors cannot be named in player-perceivable facts
- all planned tools are in `allowedTools`
- all planned tool inputs pass `runtimeToolInputSchemas`
- combat outcome bounds are not violated
- movement uses connected location graph
- `set_condition` only targets valid player condition model unless future schema changes
- no new location/NPC/item appears unless the selected tool can create it
- no more than one primary scene-changing response
- narrator facts contain only perceivable facts

Failure policy:

1. One repair pass with validation errors.
2. If repair fails, restore snapshot and emit explicit error.
3. No silent fallback narration.

### Step 5: Engine executes planned actions

Keep and generalize current `executeAdjudicationPlan()`.

The planner should not execute tools. It only proposes structured actions. Backend executes in order and records results.

### Step 6: Engine commits canonical event packet

Current state has tool calls, pending committed events, location events, chronicle entries, and chat history. Phase 70A can start by projecting into existing storage, but it should introduce one in-memory packet shape before final narration:

```ts
interface CanonicalTurnPacket {
  tickBefore: number;
  tickAfter: number;
  playerAction: string;
  oracleOutcome: string;
  actionInterpretation: ScenePlan["actionInterpretation"];
  anchorEvent: ScenePlan["anchorEvent"];
  executedActions: ExecutedAdjudication["toolCallResults"];
  primaryResponse: ScenePlan["primaryResponse"];
  supportResponses: ScenePlan["supportResponses"];
  committedEvents: SceneEffect[];
  deferredHooks: DeferredSceneHook[];
  visibility: PlayerVisibilityMap;
}
```

This packet is the one thing final narration consumes.

### Step 7: Engine builds `NarratorPacket`

The narrator receives only:

- player input as spoken/action text
- Oracle outcome if useful
- anchor event
- executed perceivable effects
- primary response
- support responses that are player-perceivable
- visible actors and their relation to the moment
- recent local context needed for continuity
- guardrails derived from validation
- control return reason

The narrator must not receive:

- hidden rationale
- non-perceivable hooks
- hidden actors by name
- full DB rows
- unused broad-location actors
- raw tool plans that failed or were rejected

### Step 8: Storyteller writes final prose

Keep `runVisibleNarrationWithGuard()` and current anti-leak filters.

Add one detector:

- if final prose names an actor not present in `NarratorPacket.allowedVisibleActorNames`, retry once

### Step 9: Persist visible response and advance tick

Keep current chat append, tick advance, snapshot, and done event behavior.

### Step 10: Background world work

Move these out of the player-visible critical path unless a later design proves they must block:

- `simulateOffscreenNpcs()`
- `tickFactions()`
- reflection checks, except tiny threshold bookkeeping
- image generation
- vector embedding, except the minimal event commit needed for retry/undo consistency

Background workers may influence the next turn, not the already-streamed visible response.

## Critical Path Budget

Phase 70A target:

| Item | Target |
| --- | --- |
| Critical LLM calls in normal turn | 3: Oracle, Scene Planner, Storyteller |
| Critical LLM calls with one repair/retry | 4 |
| Rejection threshold | More than 4 regular critical-path LLM calls |
| Autonomous local NPC LLM ticks before final prose | 0 |
| Scene-changing primary responses | 0 or 1 |
| Support responses | 0 to 2 |
| Planned runtime actions | Max 8 |
| Background LLM work | Does not block visible `done` |

Future target after evals:

- 2 critical calls if Oracle can safely fold into Scene Planner.

## What To Keep

Keep:

- turn lock and snapshot/restore behavior
- `executeAdjudicationPlan()` concept
- `runtimeToolInputSchemas`
- combat envelope and narrative outcome bounds
- `scene-presence.ts` awareness bands
- final visible storyteller contract
- narration leak/quality guard
- observability from Phase 58
- opening scene path for now, but later align it with Scene Planner

## What To Demote

Demote:

- `tickPresentNpcs()` from visible-turn authority to background/autonomy or later specialized local scene helper
- `WorldBrainSceneDirection` from separate LLM stage to either:
  - fields inside `ScenePlan`, or
  - deterministic formatting of `SceneFrame`
- `reconcileSceneDirection()` from necessary safety net to transitional compatibility
- LLM movement detection to deterministic path matching plus optional planner interpretation

## What To Remove Later

Do not delete immediately, but plan retirement for:

- independent key-NPC local tool ticks before final narration
- separate world-brain repair loop on every normal turn
- broad-location actor eligibility without scene-scope/channel justification
- rollback-critical off-screen/faction work that blocks response

## Proposed Phase Split

### Phase 70A: Local Scene Planner of Record

Goal:

Replace `WorldBrain + HiddenAdjudication + present NPC mini-round` with one structured local `ScenePlan` on normal player turns.

Deliverables:

- `SceneFrame` builder from current DB and scene presence
- `ScenePlan` Zod schema
- `runScenePlanner()` using Judge provider
- `validateScenePlan()`
- execution bridge from `ScenePlan.plannedActions` into existing deterministic tool executor
- narrator packet builder
- route/turn observability: `scene.frame`, `judge.scene-plan`, `scene.plan.validation`, `scene.packet`
- tests proving no `tickPresentNpcs()` runs before final narration on normal turns

Non-goals:

- no global world simulation rewrite
- no new full DB migration unless unavoidable
- no all-actor initiative system
- no final removal of current world-brain code
- no off-screen/faction rewrite yet

### Phase 70B: Scene Roster and Channel Model

Goal:

Make actor eligibility explicit and engine-owned.

Deliverables:

- active/support/background roster classification
- remote channel model for phone, senses, surveillance, magic, long-range power, messengers
- validator rules for actor participation
- fixtures for hidden, hinted, remote, and broad-location actors

### Phase 70C: Deferred Hooks and Background Drift

Goal:

Preserve living-world autonomy without blocking the local visible turn.

Deliverables:

- persistent `DeferredSceneHook` queue with TTL
- background NPC/faction scheduling policy
- async worker observability
- race policy with campaign turn lock

### Phase 70D: Oracle Fusion Evaluation

Goal:

Decide whether Oracle can fold into Scene Planner.

Deliverables:

- A/B eval: separate Oracle vs planner-owned outcome
- combat/power regression suite
- latency/cost comparison
- decision to keep 3-call or move to 2-call normal path

## Test and Eval Matrix

### 1. Crowded Room

Setup:

- five key NPCs clear-present in one scene
- player insults one of them

Pass:

- one primary response at most
- up to two support beats
- no independent five-NPC action pile
- narrator output reads as one ordered moment

### 2. Neutral Utterance

Setup:

- player says something mild or ambiguous
- tense NPCs are present

Pass:

- planner may raise tension, ignore, ask a question, or defer
- no unjustified combat escalation unless prior state supports it

### 3. Hidden Observer

Setup:

- hidden NPC in scene scope with hint visibility

Pass:

- judge may account for hidden presence
- narrator does not name hidden NPC unless player has clear awareness
- output may include only hint signal

### 4. Remote Channel

Setup:

- remote actor has explicit communication/sensing channel

Pass:

- actor can influence scene only through that channel
- narrator names channel evidence, not teleport-like arbitrary presence

### 5. Combat Mismatch

Setup:

- player attacks much stronger/weaker target

Pass:

- combat envelope limits outcome
- planner cannot narrate impossible defeat/win
- storyteller follows bounds

### 6. Travel

Setup:

- player requests movement to connected and unconnected locations

Pass:

- connected movement resolves deterministically
- unconnected movement does not hallucinate path
- if LLM interprets intent, backend still owns path legality

### 7. No-Op

Setup:

- player waits, breathes, or watches

Pass:

- anchor event records a meaningful wait/watch if scene tension exists
- no mutation if nothing should change
- background hooks may be deferred

### 8. Replay Boundary

Setup:

- same snapshot, same player action, mocked LLM output

Pass:

- engine validation/execution/narrator packet are deterministic
- retry/undo remains coherent

## Decision Rules

Use these rules when planning implementation:

1. If a stage can produce a different interpretation of the same moment, merge it or make it consume the previous canonical packet.
2. If an LLM call does not directly improve player-visible causality, move it off the critical path.
3. If a hidden fact reaches storyteller, treat it as a validator bug.
4. If a present NPC needs to act in the visible response, the Scene Planner decides that action as part of the local plan.
5. If an off-screen NPC acts independently, that result affects future state, not the already-rendered local response.
6. If the system needs more than one primary scene-changing response, either the scene is genuinely complex and should return control later, or the planner is trying to simulate a whole round and should defer.
7. If a field is not read by a later decision, do not store it.
8. If a behavior cannot be explained in one paragraph to a player, it is probably too complex for Phase 70A.

## Concrete Next GSD Move

Do not execute implementation from this document directly.

Next command should be a formal planning/discussion cycle for:

**Phase 70A: Local Scene Planner of Record**

Required planning artifacts:

1. `70A-SCENE-FRAME-SPEC.md`
2. `70A-SCENE-PLAN-SCHEMA.md`
3. `70A-NARRATOR-PACKET-SPEC.md`
4. `70A-VALIDATION-MATRIX.md`
5. `70A-MIGRATION-PLAN.md`

The plan should be blocked until it answers:

- exact `ScenePlan` schema
- exact actor eligibility validator
- exact replacement point for `tickPresentNpcs()`
- whether `WorldBrainSceneDirection` code is reused or bypassed
- how final narration gets only committed perceivable facts
- how tests prove no independent local NPC mini-round remains

## References

- D&D Beyond, "Playing the Game" - official rhythm of play: scene, player action, result narration.  
  https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game

- Justin Alexander, "Don't Prep Plots" - situation-first tabletop structure.  
  https://thealexandrian.net/wordpress/4147/roleplaying-games/dont-prep-plots

- Yao et al., "ReAct: Synergizing Reasoning and Acting in Language Models" - reasoning/action loops and tool interaction.  
  https://arxiv.org/abs/2210.03629

- Park et al., "Generative Agents: Interactive Simulacra of Human Behavior" - observation, planning, reflection architecture for believable agents.  
  https://research.google/pubs/generative-agents-interactive-simulacra-of-human-behavior/

- OpenAI, "Introducing Structured Outputs in the API" - structured schema-following and constrained decoding as reliability technique.  
  https://openai.com/index/introducing-structured-outputs-in-the-api/

- Kybartas et al., "Tension Space Analysis for Emergent Narrative" - emergent narrative complexity and design-time analysis.  
  https://arxiv.org/abs/2004.10808

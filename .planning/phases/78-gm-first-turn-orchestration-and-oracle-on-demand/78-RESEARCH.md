# Phase 78: GM-First Turn Orchestration And Oracle-On-Demand - Research

**Researched:** 2026-05-03 [VERIFIED: system date]
**Domain:** WorldForge gameplay turn orchestration, `/api/chat/action`, SceneFrame/ScenePlan/Oracle authority boundary [VERIFIED: codebase grep]
**Confidence:** HIGH for current flow and local implementation strategy; MEDIUM for exact final plan slicing until execution-time GitNexus impact is rerun [VERIFIED: codebase grep; VERIFIED: GitNexus]

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
No explicit `## Decisions` section exists in `78-CONTEXT.md`; the phase goal, requirements, anti-goals, and target turn flow below are the controlling constraints. [VERIFIED: `.planning/phases/78-gm-first-turn-orchestration-and-oracle-on-demand/78-CONTEXT.md`]

Goal: "Replace backend semantic pre-interpretation of `/action` turns with a GM-first orchestration loop." [VERIFIED: `78-CONTEXT.md`]

Backend must not "understand" freeform player text as product truth. It must not authoritatively decide intent, target, hostility, combat mode, canon meaning, or whether a scene beat is an action. [VERIFIED: `78-CONTEXT.md`]

Backend should own deterministic and auditable work: snapshots and rollback; persistence; IDs and references; neutral scene/state retrieval; candidate lists and visibility facts; allowed tool surfaces; schema validation; deterministic math; random rolls when requested; tool execution; invariant enforcement; logs and receipts. [VERIFIED: `78-CONTEXT.md`]

GM/Judge chooses whether the turn resolves directly, needs a roll/Oracle, calls a tool, transitions into combat, asks clarification, or simply continues the scene. [VERIFIED: `78-CONTEXT.md`; VERIFIED: `.planning/REQUIREMENTS.md` P78-R3]

Legacy `intent` and `method` fields are deprecated as product semantics; during migration they may mirror raw player text/empty method for route compatibility only. [VERIFIED: `78-CONTEXT.md`; VERIFIED: `.planning/REQUIREMENTS.md` P78-R6]

### Claude's Discretion
No explicit `## Claude's Discretion` section exists in `78-CONTEXT.md`; implementation staging is left to planning as long as it preserves the locked authority boundary, rollback, ScenePlan validation, Phase 77 `/game` raw input/Continue, and backend-as-rulebook authority. [VERIFIED: user prompt; VERIFIED: `78-CONTEXT.md`]

### Deferred Ideas (OUT OF SCOPE)
Do not copy Marinara Engine as product architecture or UI. [VERIFIED: `78-CONTEXT.md`]
Do not add backend regex/classifier authority for hostile actions. [VERIFIED: `78-CONTEXT.md`]
Do not run Oracle automatically for every turn. [VERIFIED: `78-CONTEXT.md`]
Do not trust LLM-authored time, stats, inventory, location, or persisted state without backend validation. [VERIFIED: `78-CONTEXT.md`]
Do not introduce required `Act` / `Speak` / `Observe` command modes. [VERIFIED: `78-CONTEXT.md`]
Do not select targets in backend from prose except to validate GM-supplied concrete IDs/names against candidates. [VERIFIED: `78-CONTEXT.md`]
Do not let broad location membership imply direct interaction eligibility. [VERIFIED: `78-CONTEXT.md`]
Do not regress Phase 77 `Continue`, raw input, staged beats, or Inspect-hidden mechanics. [VERIFIED: `78-CONTEXT.md`; VERIFIED: `.planning/REQUIREMENTS.md` P77-R2/P77-R5/P77-R6]
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| P78-R1 | Turn orchestration treats player input as raw scene text; backend does not authoritatively infer intent, target, hostility, combat mode, or action category before the GM/Judge interprets it. [VERIFIED: `.planning/REQUIREMENTS.md`] | Current code still uses route `intent`/`method`, SceneFrame deterministic target matching, regex hostile detection, and unconditional Oracle before ScenePlanner. [VERIFIED: `backend/src/routes/chat.ts:496`; VERIFIED: `backend/src/engine/scene-frame.ts:719`; VERIFIED: `backend/src/engine/combat-envelope.ts:345`; VERIFIED: `backend/src/engine/turn-processor.ts:994`] |
| P78-R2 | Backend provides a neutral scene packet with current state, candidate IDs/names, visibility bands, recent events, memory hints, and allowed tools; these are evidence and affordances, not semantic conclusions. [VERIFIED: `.planning/REQUIREMENTS.md`] | `buildSceneFrame` already gathers roster/perception, movement candidates, target candidates, recent events, and allowed tools, but it also currently derives `oracleContext` and `combatEnvelope`. [VERIFIED: `backend/src/engine/scene-frame.ts:843`; VERIFIED: `backend/src/engine/scene-frame.ts:850`; VERIFIED: `backend/src/engine/scene-frame.ts:856`; VERIFIED: `backend/src/engine/scene-frame.ts:879`; VERIFIED: `backend/src/engine/scene-frame.ts:863`; VERIFIED: `backend/src/engine/scene-frame.ts:870`] |
| P78-R3 | GM/Judge chooses whether the turn resolves directly, needs a roll/Oracle, calls a tool, transitions into combat, asks clarification, or simply continues the scene. [VERIFIED: `.planning/REQUIREMENTS.md`] | `runScenePlanner` is the closest existing GM/Judge seam, but its required input includes a precomputed `oracleResult`, so it cannot currently choose no-roll vs roll. [VERIFIED: `backend/src/engine/scene-planner.ts:38`; VERIFIED: `backend/src/engine/scene-planner.ts:103`; VERIFIED: `backend/src/engine/turn-processor.ts:994`; VERIFIED: `backend/src/engine/turn-processor.ts:1046`] |
| P78-R4 | Oracle/rolls run only when requested for meaningful uncertainty or resistance. [VERIFIED: `.planning/REQUIREMENTS.md`] | The default ScenePlan path calls `callOracle` unconditionally after frame construction and before `runScenePlanner`. [VERIFIED: `backend/src/engine/turn-processor.ts:994`; VERIFIED: `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts:57`] |
| P78-R5 | Backend validates and executes only GM-supplied concrete tools/IDs, performs deterministic math/random rolls, persists receipts, and rolls back on failure. [VERIFIED: `.planning/REQUIREMENTS.md`] | Existing validation/execution and route rollback are reusable: `validateScenePlan` precedes `executeScenePlan`; `/action` restores the pre-turn snapshot on processing failure. [VERIFIED: `backend/src/engine/turn-processor.ts:1062`; VERIFIED: `backend/src/engine/turn-processor.ts:1079`; VERIFIED: `backend/src/routes/chat.ts:549`; VERIFIED: `backend/src/routes/chat.ts:627`] |
| P78-R6 | Legacy `intent` and `method` fields are deprecated as product semantics; during migration they may mirror raw player text/empty method for route compatibility only. [VERIFIED: `.planning/REQUIREMENTS.md`] | Frontend currently sends `chatAction(activeCampaign.id, actionText, actionText, "")`, and Continue mirrors `"Continue scene."` into both `playerAction` and `intent`. [VERIFIED: `frontend/app/game/page.tsx:744`; VERIFIED: `frontend/app/game/__tests__/page.test.tsx:807`; VERIFIED: `frontend/app/game/__tests__/page.test.tsx:818`] |
| P78-R7 | Backend remains the rulebook and final world truth for time, locations, stats, inventory, conditions, resources, relationships, clocks, persisted facts, and legal state transitions. [VERIFIED: `.planning/REQUIREMENTS.md`] | Current deterministic seams for ScenePlan validation/execution, snapshots, and rollback-critical post-turn work should be preserved and tightened rather than bypassed. [VERIFIED: `backend/src/engine/turn-processor.ts:1062`; VERIFIED: `backend/src/engine/turn-processor.ts:1079`; VERIFIED: `backend/src/engine/turn-processor.ts:1306`; VERIFIED: `backend/src/routes/chat.ts:91`] |
</phase_requirements>

## Summary

Phase 78 should be implemented as an orchestration-order migration, not a new gameplay feature stack. [VERIFIED: `78-CONTEXT.md`; VERIFIED: codebase grep] The current default path is already `SceneFrame -> Oracle -> ScenePlan -> validate -> execute -> narrator packet -> final narration`, and tests explicitly pin that order. [VERIFIED: `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts:57`; VERIFIED: `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts:113`] This order is now the main defect because Oracle, target context, and hostile/combat envelope are produced before the GM/Judge has selected the honest turn path. [VERIFIED: `backend/src/engine/turn-processor.ts:953`; VERIFIED: `backend/src/engine/turn-processor.ts:970`; VERIFIED: `backend/src/engine/turn-processor.ts:994`; VERIFIED: `backend/src/engine/turn-processor.ts:1046`]

The safest strategy is to preserve `/action` transport, rollback, finalization, ScenePlan validation/execution, final narration, and Phase 77 `/game` raw input/Continue behavior while splitting the judge lane into two stages: first a GM turn-decision over a neutral packet, then optional Oracle/roll/tool planning only when that decision asks for it. [VERIFIED: `backend/src/routes/chat.ts:549`; VERIFIED: `backend/src/routes/chat.ts:627`; VERIFIED: `backend/src/engine/turn-processor.ts:1062`; VERIFIED: `frontend/components/game/play-surface/action-dock.tsx:91`; VERIFIED: `frontend/components/game/play-surface/action-dock.tsx:125`]

**Primary recommendation:** Stage the migration as `neutral SceneFrame -> GM turn decision -> optional Oracle/roll -> ScenePlan/tool validation/execution -> settled narrator packet`, keeping `intent`/`method` as compatibility mirrors only until route consumers are migrated. [VERIFIED: `.planning/REQUIREMENTS.md` P78-R1..P78-R7; VERIFIED: `78-CONTEXT.md`]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Raw player input transport and Continue | Browser / Client | API / Backend | `/game` owns freeform action dock and Continue click behavior; backend receives route-compatible fields. [VERIFIED: `frontend/components/game/play-surface/action-dock.tsx:81`; VERIFIED: `frontend/app/game/page.tsx:971`; VERIFIED: `frontend/lib/api.ts:1232`] |
| Turn boundary, rollback, retry | API / Backend | Database / Storage | `/action` captures snapshots before processing and restores them on turn failure; retry reuses saved snapshots. [VERIFIED: `backend/src/routes/chat.ts:549`; VERIFIED: `backend/src/routes/chat.ts:627`; VERIFIED: `backend/src/routes/chat.ts:812`] |
| Neutral scene packet and legal affordances | API / Backend | Database / Storage | `buildSceneFrame` reads campaign/player/NPC/location/item rows and assembles roster, perception, movement candidates, target candidates, recent events, and allowed tools. [VERIFIED: `backend/src/engine/scene-frame.ts:834`; VERIFIED: `backend/src/engine/scene-frame.ts:843`; VERIFIED: `backend/src/engine/scene-frame.ts:850`; VERIFIED: `backend/src/engine/scene-frame.ts:856`] |
| Fictional interpretation and path choice | GM/Judge LLM | API / Backend validation | The phase requires GM/Judge to choose direct resolution, roll/Oracle, tool call, combat transition, clarification, or Continue while backend validates legal outputs. [VERIFIED: `78-CONTEXT.md`; VERIFIED: `.planning/REQUIREMENTS.md` P78-R3/P78-R5] |
| Oracle probability and dice receipt | API / Backend with LLM probability seam | GM/Judge request | `callOracle` asks an Oracle/Judge model for chance, then backend rolls `crypto.randomInt` and derives outcome. [VERIFIED: `backend/src/engine/oracle.ts:51`; VERIFIED: `backend/src/engine/oracle.ts:141`; VERIFIED: `backend/src/engine/oracle.ts:160`] |
| State mutation | API / Backend | Database / Storage | ScenePlan validation and executor are the existing deterministic mutation gate and should remain final authority. [VERIFIED: `backend/src/engine/turn-processor.ts:1062`; VERIFIED: `backend/src/engine/turn-processor.ts:1079`] |
| Player-facing prose | Storyteller LLM | API / Backend packet | Existing final narration happens after execution and should continue to consume settled backend facts, not raw LLM state writes. [VERIFIED: `backend/src/engine/turn-processor.ts:1079`; VERIFIED: `backend/src/engine/turn-processor.ts:1165`] |

## Current Flow Evidence

1. `/api/chat/action` parses `campaignId`, `playerAction`, `intent`, and `method`, requires a loaded campaign, begins the turn lock, resolves Judge/Storyteller providers, captures a pre-turn snapshot, and streams `processTurn` events. [VERIFIED: `backend/src/routes/chat.ts:490`; VERIFIED: `backend/src/routes/chat.ts:496`; VERIFIED: `backend/src/routes/chat.ts:499`; VERIFIED: `backend/src/routes/chat.ts:506`; VERIFIED: `backend/src/routes/chat.ts:514`; VERIFIED: `backend/src/routes/chat.ts:549`; VERIFIED: `backend/src/routes/chat.ts:582`]
2. The route schema still requires `intent` and accepts `method`, so transport compatibility cannot be removed in one source edit without frontend and tests changing together. [VERIFIED: `backend/src/routes/schemas.ts:188`; VERIFIED: `frontend/lib/api.ts:1232`; VERIFIED: `frontend/app/game/page.tsx:744`]
3. Default `processTurn` uses `processTurnScenePlan` unless `SCENE_PLAN_ENABLED === "false"`, so the legacy path is still reachable but non-default. [VERIFIED: `backend/src/engine/turn-processor.ts:699`; VERIFIED: `backend/src/engine/turn-processor.ts:846`]
4. `processTurnScenePlan` builds deterministic state first and intentionally bypasses legacy `detectMovement` and `resolveActionTargetContext`, but it still calls `buildSceneFrame` with raw `playerAction`, `intent`, and `method`. [VERIFIED: `backend/src/engine/turn-processor.ts:874`; VERIFIED: `backend/src/engine/turn-processor.ts:941`; VERIFIED: `backend/src/engine/turn-processor.ts:947`; VERIFIED: `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts:149`]
5. `buildSceneFrame` collects candidates but also performs deterministic target matching by checking whether normalized action text includes a candidate label, then stores `oracleContext`. [VERIFIED: `backend/src/engine/scene-frame.ts:632`; VERIFIED: `backend/src/engine/scene-frame.ts:705`; VERIFIED: `backend/src/engine/scene-frame.ts:719`; VERIFIED: `backend/src/engine/scene-frame.ts:724`; VERIFIED: `backend/src/engine/scene-frame.ts:863`]
6. `buildSceneFrame` also calls `deriveCombatEnvelope`, which calls `isHostileCombatAction` before GM/Judge path selection. [VERIFIED: `backend/src/engine/scene-frame.ts:753`; VERIFIED: `backend/src/engine/scene-frame.ts:768`; VERIFIED: `backend/src/engine/scene-frame.ts:870`]
7. `isHostileCombatAction` is regex-pattern based over `actionText`, `intent`, and `method`; this is useful as deterministic evidence after a GM request but violates Phase 78 if used as authoritative pre-interpretation. [VERIFIED: `backend/src/engine/combat-envelope.ts:80`; VERIFIED: `backend/src/engine/combat-envelope.ts:345`; VERIFIED: `78-CONTEXT.md` anti-goals]
8. `processTurnScenePlan` logs target context and combat envelope before calling Oracle, then calls Oracle unconditionally. [VERIFIED: `backend/src/engine/turn-processor.ts:953`; VERIFIED: `backend/src/engine/turn-processor.ts:961`; VERIFIED: `backend/src/engine/turn-processor.ts:970`; VERIFIED: `backend/src/engine/turn-processor.ts:982`; VERIFIED: `backend/src/engine/turn-processor.ts:994`]
9. `runScenePlanner` receives both `frameWithOracle` and `oracleResult`, and the prompt tells the planner the Oracle result is binding, so the planner cannot decide "no roll" under the current contract. [VERIFIED: `backend/src/engine/scene-planner.ts:38`; VERIFIED: `backend/src/engine/scene-planner.ts:52`; VERIFIED: `backend/src/engine/scene-planner.ts:103`; VERIFIED: `backend/src/engine/turn-processor.ts:1046`]
10. Existing rollback behavior is strong and should be preserved: on failure after turn processing starts, `/action` restores the pre-turn snapshot and clears last-turn snapshot state. [VERIFIED: `backend/src/routes/chat.ts:621`; VERIFIED: `backend/src/routes/chat.ts:623`; VERIFIED: `backend/src/routes/chat.ts:627`; VERIFIED: `backend/src/routes/chat.ts:632`]
11. Phase 77 `/game` uses one raw action text box and a first-class Continue button; sending raw text calls `chatAction(activeCampaign.id, actionText, actionText, "")`, and Continue submits `CONTINUE_ACTION_PAYLOAD`. [VERIFIED: `frontend/components/game/play-surface/action-dock.tsx:81`; VERIFIED: `frontend/app/game/page.tsx:744`; VERIFIED: `frontend/app/game/page.tsx:971`; VERIFIED: `frontend/lib/display-beats.ts:18`]

## Standard Stack

### Core

| Library / Local Seam | Version | Purpose | Why Standard |
|---|---:|---|---|
| TypeScript | 5.9.3 declared | Backend/frontend implementation language and compile-time validation. [VERIFIED: `backend/package.json`; VERIFIED: `frontend/package.json`] | Existing repo standard; do not introduce another language for Phase 78. [VERIFIED: package manifests] |
| Hono | 4.12.3 declared; 4.12.16 current registry, modified 2026-04-30 | Backend HTTP/SSE route layer. [VERIFIED: `backend/package.json`; VERIFIED: npm registry] | `/api/chat/action` is already implemented in Hono route module; preserve route shape during migration. [VERIFIED: `backend/src/routes/chat.ts:490`] |
| Zod | 4.3.6 declared; 4.4.2 current registry, modified 2026-05-01 | Runtime schema validation for route bodies and structured outputs. [VERIFIED: `backend/package.json`; VERIFIED: npm registry] | Existing schemas validate route payloads and model contracts; Phase 78 should add or adapt schemas rather than parse ad hoc. [VERIFIED: `backend/src/routes/schemas.ts:188`; VERIFIED: `backend/src/engine/scene-planner.ts:188`] |
| AI SDK `ai` | 6.0.106 declared; 6.0.174 current registry, modified 2026-05-01 | `safeGenerateObject` model calls for judge/oracle structured output. [VERIFIED: `backend/package.json`; VERIFIED: npm registry; VERIFIED: `backend/src/engine/oracle.ts:150`; VERIFIED: `backend/src/engine/scene-planner.ts:185`] | Existing structured-output hardening from Phases 73-74 depends on `safeGenerateObject`; reuse it for GM turn decision. [VERIFIED: `.planning/REQUIREMENTS.md` P73/P74; VERIFIED: `backend/src/ai/generate-object-safe.ts:659`] |
| Vitest | 3.2.4 declared; 4.1.5 current registry, modified 2026-04-23 | Backend and frontend automated tests. [VERIFIED: `backend/package.json`; VERIFIED: `frontend/package.json`; VERIFIED: npm registry] | Existing tests already lock ScenePlan ordering, route rollback, and `/game` Continue behavior; extend those tests. [VERIFIED: `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts:55`; VERIFIED: `frontend/app/game/__tests__/page.test.tsx:797`] |

### Supporting

| Library / Local Seam | Version | Purpose | When to Use |
|---|---:|---|---|
| Next.js | 16.1.6 declared; 16.2.4 current registry, modified 2026-05-03 | `/game` frontend route. [VERIFIED: `frontend/package.json`; VERIFIED: npm registry] | Only for compatibility tests if transport shape changes; Phase 78 should avoid a UI redesign. [VERIFIED: user prompt; VERIFIED: Phase 77 requirements] |
| React | 19.2.3 declared; 19.2.5 current registry, modified 2026-04-30 | `/game` component state and action dock. [VERIFIED: `frontend/package.json`; VERIFIED: npm registry] | Preserve `ActionDock` raw text and Continue semantics. [VERIFIED: `frontend/components/game/play-surface/action-dock.tsx:9`] |
| GitNexus | indexed 2026-05-03, 2787 symbols, 7810 relationships, 224 flows | Impact analysis before Phase 78 source edits. [VERIFIED: GitNexus `list_repos`] | Required by `AGENTS.md` before editing functions/classes/methods. [VERIFIED: `AGENTS.md`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| New command taxonomy | Required Act/Speak/Observe modes | Rejected by Phase 77 and Phase 78 anti-goals; raw scene text remains the product contract. [VERIFIED: `.planning/REQUIREMENTS.md` P77-R5; VERIFIED: `78-CONTEXT.md`] |
| Backend target/hostility classifiers | Regex or model classifier as pre-pass | Rejected because it makes backend fictional meaning authority; keep candidate retrieval and validate GM-supplied IDs only. [VERIFIED: `78-CONTEXT.md`; VERIFIED: `backend/src/engine/target-context.ts:160`; VERIFIED: `backend/src/engine/combat-envelope.ts:345`] |
| Oracle-first turn order | Current `Frame -> Oracle -> ScenePlan` | Rejected because it forces rolls even for conversation, observation, guaranteed actions, and Continue. [VERIFIED: `.planning/REQUIREMENTS.md` P78-R4; VERIFIED: `backend/src/engine/turn-processor.ts:994`] |

**Installation:** no new packages are recommended for Phase 78. [VERIFIED: package manifests; VERIFIED: codebase grep]

## Architecture Patterns

### System Architecture Diagram

```text
Browser /game
  raw text or Continue
  [VERIFIED: frontend/app/game/page.tsx:726,971]
    |
    v
POST /api/chat/action
  compatibility body: campaignId, playerAction, intent mirror, method ""
  rollback snapshot + turn lock
  [VERIFIED: backend/src/routes/chat.ts:490,496,549]
    |
    v
Neutral Scene Packet Builder
  state rows -> roster/perception/recent events/candidate IDs/allowed tools
  no target/hostility/combat/Oracle conclusion
  [VERIFIED current candidate builder: backend/src/engine/scene-frame.ts:843-879]
    |
    v
GM Turn Decision (new/modified judge seam)
  chooses: direct | roll/oracle | tool plan | combat transition | clarification | continue
  [VERIFIED requirement: .planning/REQUIREMENTS.md P78-R3]
    |-------------------- no-roll/direct/continue/clarify --------------------|
    |                                                                         v
    |                                                                  ScenePlan/direct packet
    |                                                                         |
    | roll/oracle requested                                                   |
    v                                                                         |
Oracle/Roll Tool                                                               |
  chance from evidence + backend roll receipt                                  |
  [VERIFIED current roll: backend/src/engine/oracle.ts:51,160]                 |
    |                                                                         |
    v                                                                         v
ScenePlan Validation -> Deterministic Execution -> Narrator Packet -> Storyteller prose
  [VERIFIED: backend/src/engine/turn-processor.ts:1062,1079,1165]
    |
    v
SSE events -> /game staged beats + Inspect mechanics
  [VERIFIED: frontend/app/game/page.tsx:756; frontend/app/game/page.tsx:765]
```

### Recommended Project Structure

```text
backend/src/engine/
├── scene-frame.ts              # keep neutral packet builder; remove pre-GM oracle/combat conclusions from default path [VERIFIED: codebase]
├── scene-planner.ts            # adapt or wrap judge planning after GM turn decision [VERIFIED: codebase]
├── turn-processor.ts           # own orchestration order and SSE event sequencing [VERIFIED: codebase]
├── oracle.ts                   # keep as requested adjudication/roll seam, not mandatory pre-pass [VERIFIED: codebase]
├── scene-plan-validator.ts     # preserve final validation authority [VERIFIED: codebase grep]
└── scene-plan-executor.ts      # preserve deterministic mutation authority [VERIFIED: codebase grep]

backend/src/routes/
└── chat.ts                     # preserve rollback, retry, SSE route compatibility [VERIFIED: codebase]

frontend/
├── lib/api.ts                  # keep route compatibility until schema migration [VERIFIED: codebase]
└── app/game/page.tsx           # preserve raw action and Continue behavior [VERIFIED: codebase]
```

### Pattern 1: Neutral Packet Before GM Decision

**What:** Build a scene packet that contains factual rows, scoped actors, candidate IDs/names, visibility/awareness bands, movement affordances, recent events, allowed tools, and rulebook constraints, but no `oracleContext`, no chosen target, no hostility flag, and no combat envelope in the default pre-GM path. [VERIFIED: `78-CONTEXT.md`; VERIFIED: current `backend/src/engine/scene-frame.ts:856`; VERIFIED: current `backend/src/engine/scene-frame.ts:863`; VERIFIED: current `backend/src/engine/scene-frame.ts:870`]

**When to use:** Always at the start of `/action` and retry turn processing before any model interprets player prose. [VERIFIED: `backend/src/engine/turn-processor.ts:941`; VERIFIED: `backend/src/routes/chat.ts:812`]

**Implementation note:** Make the existing `oracleContext`/`combatEnvelope` fields either absent/null by default or explicitly post-decision fields; do not let compatibility normalization silently rederive them. [VERIFIED: `backend/src/engine/scene-frame.ts:343`; VERIFIED: `backend/src/engine/scene-frame.ts:887`]

### Pattern 2: GM Turn Decision As First Judge Call

**What:** Introduce a bounded structured judge output such as `TurnDecision` with `path`, `needsOracle`, `rollRequest`, `selectedCandidateRefs`, `plannedToolIntent`, `clarificationPrompt`, and `directResolutionNotes`. [ASSUMED]

**When to use:** Immediately after neutral SceneFrame and before Oracle. [VERIFIED: `.planning/REQUIREMENTS.md` P78-R3/P78-R4]

**Guardrail:** The decision may choose candidate refs from supplied candidates, but backend validates refs and legal tool names; the decision must not directly persist state. [VERIFIED: `.planning/REQUIREMENTS.md` P78-R5/P78-R7]

### Pattern 3: Oracle/Roll As Backend Tool Requested By GM

**What:** Keep `callOracle` for probabilistic adjudication and `rollD100` for backend random receipt, but call it only when the GM decision asks for meaningful uncertainty/resistance. [VERIFIED: `backend/src/engine/oracle.ts:51`; VERIFIED: `backend/src/engine/oracle.ts:184`; VERIFIED: `.planning/REQUIREMENTS.md` P78-R4]

**When to use:** Combat, contested social pressure, deception, risky movement, uncertain observation, or other stakes-bearing uncertainty chosen by GM from evidence. [VERIFIED: `78-CONTEXT.md` acceptance scenarios]

**Compatibility note:** Existing SSE `oracle_result` should remain emitted only when Oracle actually runs; frontend already stores it opportunistically in Inspect state. [VERIFIED: `backend/src/engine/turn-processor.ts:1007`; VERIFIED: `frontend/app/game/page.tsx:765`]

### Pattern 4: Preserve Existing Backend Rulebook Gates

**What:** Reuse `validateScenePlan`, `executeScenePlan`, snapshot restore, and rollback-critical finalization; do not create LLM-write shortcuts. [VERIFIED: `backend/src/engine/turn-processor.ts:1062`; VERIFIED: `backend/src/engine/turn-processor.ts:1079`; VERIFIED: `backend/src/routes/chat.ts:627`; VERIFIED: `backend/src/engine/turn-processor.ts:1306`]

**When to use:** Every path that mutates or records canonical state. [VERIFIED: `.planning/REQUIREMENTS.md` P78-R5/P78-R7]

### Anti-Patterns to Avoid

- **Oracle-first planning:** Current pinned order requires Oracle before ScenePlanner; Phase 78 must replace that ordering. [VERIFIED: `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts:57`; VERIFIED: `.planning/REQUIREMENTS.md` P78-R4]
- **Regex hostility as authority:** `isHostileCombatAction` currently regex-matches action text; after Phase 78 it can support validation/evidence only after GM-selected combat/hostile path. [VERIFIED: `backend/src/engine/combat-envelope.ts:80`; VERIFIED: `backend/src/engine/combat-envelope.ts:345`; VERIFIED: `78-CONTEXT.md`]
- **Backend name-in-prose target selection:** `resolveOracleContext` currently finds candidate label substrings in action text; this must not decide product target before GM interpretation. [VERIFIED: `backend/src/engine/scene-frame.ts:719`; VERIFIED: `backend/src/engine/scene-frame.ts:724`; VERIFIED: `78-CONTEXT.md`]
- **LLM state writes:** Do not persist time/location/stats/inventory/facts directly from GM output; always validate/execute through backend tools. [VERIFIED: `.planning/REQUIREMENTS.md` P78-R7]
- **Frontend taxonomy regression:** Do not add required Act/Speak/Observe controls; existing tests explicitly forbid those labels in the action dock. [VERIFIED: `frontend/components/game/play-surface/__tests__/action-dock.test.tsx:147`]

## Proposed Implementation Strategy

### Stage 0 - Lock Current Compatibility Gates

Add failing tests before source edits for: raw `/game` Send and Continue still call `chatAction(id, text, text, "")`; no Oracle event for a pure conversation/direct/no-roll fixture; no pre-GM `target.context`/`combat.envelope` semantic conclusion in default turn path; rollback still restores on failed validation/execution. [VERIFIED: existing test locations `frontend/app/game/__tests__/page.test.tsx`; VERIFIED: existing test locations `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts`; VERIFIED: existing route rollback test `backend/src/routes/__tests__/chat.scene-plan.test.ts`]

### Stage 1 - Make SceneFrame Neutral By Default

Refactor `buildSceneFrame` so neutral construction still returns `targetCandidates`, `movementCandidates`, `roster`, `perception`, `recentEvents`, and `allowedTools`, but does not derive `oracleContext` or `combatEnvelope` unless explicitly requested by a post-decision path. [VERIFIED: `backend/src/engine/scene-frame.ts:856`; VERIFIED: `backend/src/engine/scene-frame.ts:863`; VERIFIED: `backend/src/engine/scene-frame.ts:870`]

Keep a compatibility path for tests or legacy fallback only if needed, but make the default `processTurnScenePlan` path neutral. [VERIFIED: `backend/src/engine/turn-processor.ts:941`; VERIFIED: `backend/src/engine/turn-processor.ts:699`]

### Stage 2 - Add GM Turn Decision Before Oracle

Add a structured judge call before `callOracle` that receives raw `playerAction`, neutral SceneFrame, candidates, recent events, rulebook constraints, and allowed tools. [VERIFIED: `.planning/REQUIREMENTS.md` P78-R2/P78-R3] This decision chooses `direct`, `oracle`, `tool_plan`, `combat_transition`, `clarification`, or `continue`. [VERIFIED: `78-CONTEXT.md` target turn flow]

Use existing `safeGenerateObject`/prompt-contract style because this project already hardened structured-output seams in Phases 73-74 and `runScenePlanner` uses `safeGenerateObject`. [VERIFIED: `.planning/REQUIREMENTS.md` P73/P74; VERIFIED: `backend/src/engine/scene-planner.ts:185`]

### Stage 3 - Move Oracle/Combat Derivation Behind Decision

If the GM decision requests Oracle/roll, build an Oracle payload from GM-selected concrete refs and backend evidence; then call `callOracle` and emit `oracle_result`. [VERIFIED: `backend/src/engine/oracle.ts:130`; VERIFIED: `backend/src/engine/turn-processor.ts:1007`] If the decision requests combat context, derive combat envelope only after the decision supplies a concrete actor candidate ref and backend validates that the candidate is interaction-eligible. [VERIFIED: `backend/src/engine/scene-frame.ts:753`; VERIFIED: `.planning/REQUIREMENTS.md` P78-R5]

### Stage 4 - Adapt ScenePlanner To Optional Oracle

Change `runScenePlanner` or add a companion planner so direct/no-roll/continue/clarification paths do not require `oracleResult`. [VERIFIED: current required arg `backend/src/engine/scene-planner.ts:42`] Keep existing strict mapping, validation, and executor for paths with tool actions. [VERIFIED: `backend/src/engine/scene-planner.ts:136`; VERIFIED: `backend/src/engine/turn-processor.ts:1062`; VERIFIED: `backend/src/engine/turn-processor.ts:1079`]

### Stage 5 - Deprecate Route Semantics Without Breaking Transport

Keep `chatActionBodySchema.intent` required for now or make it default from `playerAction` server-side only after frontend tests are updated. [VERIFIED: `backend/src/routes/schemas.ts:188`; VERIFIED: `frontend/lib/api.ts:1232`] Treat `intent` as route compatibility only; never feed it as separate product truth. [VERIFIED: `.planning/REQUIREMENTS.md` P78-R6]

### Stage 6 - Update Ordering Tests And Observability

Replace Phase 70 ordering proof with a new order: `buildNeutralSceneFrame -> runGmTurnDecision -> optional callOracle -> runScenePlanner/plan -> validateScenePlan -> executeScenePlan -> buildNarratorPacket -> final narration`. [VERIFIED: current test `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts:57`; VERIFIED: target flow `78-CONTEXT.md`]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Route body validation | Manual `JSON.parse`/field checks | Existing Zod route schemas | Current route schemas are centralized and tested. [VERIFIED: `backend/src/routes/schemas.ts:188`] |
| Structured judge decision | Freeform JSON parsing | Existing `safeGenerateObject` + Zod schema + prompt contract | Existing hardening forbids semantic invention during repair and supports structured seams. [VERIFIED: `backend/src/ai/generate-object-safe.ts:659`; VERIFIED: `backend/src/engine/scene-planner.ts:185`] |
| Random roll receipts | LLM-generated rolls | Backend `crypto.randomInt` via `rollD100` or similar bounded roll helper | Current Oracle rolls backend-side after chance generation. [VERIFIED: `backend/src/engine/oracle.ts:51`; VERIFIED: `backend/src/engine/oracle.ts:160`] |
| State mutation | LLM direct DB writes | `validateScenePlan` + `executeScenePlan` + tool schemas | Existing phase contract depends on backend validation and deterministic execution. [VERIFIED: `backend/src/engine/turn-processor.ts:1062`; VERIFIED: `backend/src/engine/turn-processor.ts:1079`] |
| Target matching from prose | Regex/name substring/classifier as final authority | GM-selected candidate refs validated against neutral candidates | Phase 78 explicitly rejects backend semantic target authority. [VERIFIED: `78-CONTEXT.md`; VERIFIED: `.planning/REQUIREMENTS.md` P78-R1/P78-R5] |
| Hostility/combat classification | Regex as product truth | GM combat/hostile path selection plus backend eligibility validation | Existing regex has HIGH GitNexus impact and is used by NPC and SceneFrame paths. [VERIFIED: GitNexus impact `isHostileCombatAction`; VERIFIED: `backend/src/engine/combat-envelope.ts:345`] |

**Key insight:** the hard part is not rolling dice or executing tools; it is preserving backend rulebook authority while moving fictional meaning from pre-GM backend code into a bounded GM decision. [VERIFIED: `78-CONTEXT.md`; VERIFIED: codebase current flow]

## Common Pitfalls

### Pitfall 1: "Neutral SceneFrame" Still Derives Semantics
**What goes wrong:** `buildSceneFrame` continues to populate `oracleContext` or `combatEnvelope`, and later code treats nullability as optional while default behavior still selects a target. [VERIFIED: `backend/src/engine/scene-frame.ts:863`; VERIFIED: `backend/src/engine/scene-frame.ts:870`]
**Why it happens:** Existing `normalizeFrame` and compatibility options carry `oracleContext`, `combatEnvelope`, and `oracle` fields. [VERIFIED: `backend/src/engine/scene-frame.ts:343`; VERIFIED: `backend/src/engine/scene-frame.ts:901`]
**How to avoid:** Add tests that neutral frame construction for `"I hit Iru"` includes candidate IDs but no selected `oracleContext` before GM decision. [VERIFIED: `.planning/REQUIREMENTS.md` P78-R1/P78-R2]
**Warning signs:** `target.context` or `combat.envelope` logs occur before GM decision logs. [VERIFIED: current `backend/src/engine/turn-processor.ts:961`; VERIFIED: current `backend/src/engine/turn-processor.ts:982`]

### Pitfall 2: Optional Oracle Breaks Frontend Mechanics Display
**What goes wrong:** Frontend assumes every turn has `oracle_result`; no-roll turns leave stale Inspect mechanics. [VERIFIED: current `frontend/app/game/page.tsx:737`; VERIFIED: current `frontend/app/game/page.tsx:765`]
**Why it happens:** Current backend emits `oracle_result` for every default ScenePlan turn. [VERIFIED: `backend/src/engine/turn-processor.ts:994`; VERIFIED: `backend/src/engine/turn-processor.ts:1007`]
**How to avoid:** Keep clearing `lastOracleResult` at turn start and add a no-roll frontend test that Inspect stays empty/stale-free. [VERIFIED: `frontend/app/game/page.tsx:737`; VERIFIED: `frontend/app/game/__tests__/page.test.tsx:827`]
**Warning signs:** Pure dialogue turn displays prior roll/chance in Inspect. [ASSUMED]

### Pitfall 3: Legacy `intent`/`method` Keeps Semantic Authority Alive
**What goes wrong:** Even after GM-first work, code still reads `intent` and `method` as product meaning. [VERIFIED: `backend/src/engine/oracle.ts:25`; VERIFIED: `backend/src/engine/target-context.ts:45`; VERIFIED: `backend/src/engine/combat-envelope.ts:345`]
**Why it happens:** The route schema requires `intent`, frontend mirrors action text, and many tests use these fields. [VERIFIED: `backend/src/routes/schemas.ts:188`; VERIFIED: `frontend/app/game/page.tsx:744`; VERIFIED: `backend/src/routes/__tests__/chat-turn-context.test.ts:297`]
**How to avoid:** Treat fields as compatibility aliases only and prefer `playerAction` plus GM decision outputs in new code. [VERIFIED: `.planning/REQUIREMENTS.md` P78-R6]
**Warning signs:** New prompts include `Intent:`/`Method:` as separate facts before GM decision. [VERIFIED: current `backend/src/engine/target-context.ts:187`; VERIFIED: current `backend/src/engine/oracle.ts:132`]

### Pitfall 4: Direct/Continue Path Bypasses Rollback Finalization
**What goes wrong:** No-roll or clarification paths return early without post-turn finalization, snapshot storage, or `done`. [VERIFIED: current route finalization `backend/src/routes/chat.ts:621`; VERIFIED: current processor finalization `backend/src/engine/turn-processor.ts:1306`]
**Why it happens:** Legacy movement no-op has an early return pattern, which is risky if copied. [VERIFIED: `backend/src/engine/turn-processor.ts:1416`; VERIFIED: `backend/src/engine/turn-processor.ts:1422`]
**How to avoid:** Route all paths through one finalization tail unless the plan explicitly proves a no-mutation early return is safe. [VERIFIED: `.planning/REQUIREMENTS.md` P78-R5]
**Warning signs:** tests show `done` without rollback-critical finalization or route snapshot update. [VERIFIED: `backend/src/routes/chat.ts:621`; VERIFIED: `backend/src/engine/turn-processor.ts:1319`]

### Pitfall 5: Breaking NPC Oracle Users
**What goes wrong:** Changing `callOracle` or `isHostileCombatAction` for player turns regresses NPC agent tools/posture. [VERIFIED: GitNexus impact `callOracle`; VERIFIED: GitNexus impact `isHostileCombatAction`]
**Why it happens:** GitNexus reports `callOracle` is used by `createNpcAgentTools`, and `isHostileCombatAction` has HIGH risk with `createNpcAgentTools`, `tickNpcAgentInternal`, and `buildSceneFrame` impact. [VERIFIED: GitNexus impact `callOracle`; VERIFIED: GitNexus impact `isHostileCombatAction`]
**How to avoid:** Prefer orchestration changes around when player turn calls these functions, not broad signature changes, unless impact is handled explicitly. [VERIFIED: GitNexus impact]
**Warning signs:** NPC tests around agent combat/posture or tools fail after player-turn refactor. [VERIFIED: test inventory `backend/src/engine/__tests__/npc-agent.test.ts`; VERIFIED: test inventory `backend/src/engine/__tests__/combat-posture.test.ts`]

## Code Examples

### Current Oracle-First Sequence To Replace

```typescript
// Source: backend/src/engine/turn-processor.ts:941-1050 [VERIFIED: codebase]
const sceneFrame = await buildSceneFrame({ playerAction, intent, method, ... });
const targetContext = sceneFrame.oracleContext ?? fallback;
const hostileAction = isHostileCombatAction({ actionText: playerAction, intent, method });
const oracleResult = await callOracle({ intent, method, targetTags: targetContext.targetTags, ... }, judgeProvider);
const scenePlan = await runScenePlanner({ frame: frameWithOracle, playerAction, oracleResult, ... });
```

### Target GM-First Shape For Planner

```typescript
// Proposed pattern for Phase 78 planning. [ASSUMED]
const neutralFrame = await buildSceneFrame({ playerAction, intent: playerAction, method: "", semanticMode: "neutral" });
const decision = await runGmTurnDecision({ frame: neutralFrame, playerAction, allowedTools: neutralFrame.allowedTools });

const oracleResult = decision.path === "oracle"
  ? await callOracle(buildOraclePayloadFromDecision(decision, neutralFrame), judgeProvider)
  : null;

const plan = await runScenePlanner({
  frame: attachDecisionAndOptionalOracle(neutralFrame, decision, oracleResult),
  playerAction,
  oracleResult,
});

const validation = validateScenePlan({ frame: planFrame, plan, oracleResult });
const executed = await executeScenePlan({ campaignId, tick: currentTick, plan: validation.plan, outcomeTier: oracleResult?.outcome });
```

### Existing Frontend Compatibility Call To Preserve

```typescript
// Source: frontend/app/game/page.tsx:744 [VERIFIED: codebase]
const response = await chatAction(activeCampaign.id, actionText, actionText, "");
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Storyteller hidden tool-driving | Judge-owned ScenePlan plus deterministic backend execution | Phase 69/70 [VERIFIED: `.planning/ROADMAP.md`] | Good foundation for Phase 78; keep validation/execution. [VERIFIED: `.planning/ROADMAP.md` Phase 69/70] |
| ScenePlan requiring backend-generated IDs from model | Semantic ScenePlan mapped to strict backend IDs | Phase 73 [VERIFIED: `.planning/REQUIREMENTS.md` P73-R4] | Continue using semantic refs and backend mapping; do not ask model to invent IDs. [VERIFIED: `backend/src/engine/scene-planner.ts:53`; VERIFIED: `backend/src/engine/scene-planner.ts:136`] |
| Oracle as bounded outcome authority before ScenePlan | GM-first Oracle-on-demand | Phase 78 target [VERIFIED: `.planning/REQUIREMENTS.md` P78-R3/P78-R4] | Requires rewriting ordering tests and optional Oracle handling. [VERIFIED: current ordering test `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts:57`] |

**Deprecated/outdated:**
- `intent`/`method` as product semantics: deprecated by P78-R6; keep only compatibility mirror during migration. [VERIFIED: `.planning/REQUIREMENTS.md` P78-R6]
- Backend target/hostile pre-interpretation of player prose: rejected by Phase 78 anti-goals. [VERIFIED: `78-CONTEXT.md`]
- Automatic Oracle for every turn: rejected by P78-R4. [VERIFIED: `.planning/REQUIREMENTS.md` P78-R4]

## Symbols Needing GitNexus Impact Before Source Edits

| Symbol / File | Why It Will Likely Be Touched | Impact Notes |
|---|---|---|
| `processTurn` / `processTurnScenePlan` in `backend/src/engine/turn-processor.ts` | Main orchestration order changes. [VERIFIED: codebase] | GitNexus did not resolve `processTurn` by symbol name in this session, so execution must run impact by file or disambiguated symbol before editing. [VERIFIED: GitNexus impact attempt] |
| `buildSceneFrame` in `backend/src/engine/scene-frame.ts` | Neutral packet boundary must stop deriving pre-GM `oracleContext`/`combatEnvelope`. [VERIFIED: `backend/src/engine/scene-frame.ts:863`; VERIFIED: `backend/src/engine/scene-frame.ts:870`] | GitNexus impact reported LOW/0 upstream, but this is likely under-indexed because `processTurnScenePlan` calls it; rerun with file context before editing. [VERIFIED: GitNexus impact `buildSceneFrame`; VERIFIED: `backend/src/engine/turn-processor.ts:941`] |
| `runScenePlanner` in `backend/src/engine/scene-planner.ts` | Current contract requires `oracleResult`; Phase 78 needs optional/no-roll path. [VERIFIED: `backend/src/engine/scene-planner.ts:42`] | GitNexus impact reported LOW/0 upstream; rerun before editing because tests and `turn-processor` use it. [VERIFIED: GitNexus impact `runScenePlanner`; VERIFIED: `backend/src/engine/turn-processor.ts:1046`] |
| `callOracle` in `backend/src/engine/oracle.ts` | Should remain requested adjudication; signature may not need change. [VERIFIED: codebase] | GitNexus impact LOW; direct affected symbol `createNpcAgentTools`, indirect `tickNpcAgentInternal`. [VERIFIED: GitNexus impact `callOracle`] |
| `isHostileCombatAction` in `backend/src/engine/combat-envelope.ts` | Must not be product-truth pre-pass for player turns. [VERIFIED: `backend/src/engine/combat-envelope.ts:345`] | GitNexus impact HIGH; direct affected `deriveCombatEnvelope` and `createNpcAgentTools`, indirect `buildSceneFrame` and `tickNpcAgentInternal`. Warn before edits. [VERIFIED: GitNexus impact `isHostileCombatAction`] |
| `chatActionBodySchema` in `backend/src/routes/schemas.ts` | Possible compatibility defaulting for `intent`/`method`. [VERIFIED: `backend/src/routes/schemas.ts:188`] | Must coordinate with `frontend/lib/api.ts:1232` and route tests. [VERIFIED: codebase grep] |
| `chatAction` in `frontend/lib/api.ts` | Transport simplification might be tempting, but should be deferred or compatibility-safe. [VERIFIED: `frontend/lib/api.ts:1232`] | GitNexus impact HIGH; direct `submitAction`, indirect `GamePage`, `handleContinueAction`, `handleMove`. [VERIFIED: GitNexus impact `chatAction`] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A new `TurnDecision`-style structured judge seam is the cleanest implementation shape. [ASSUMED] | Architecture Patterns / Proposed Strategy | Planner may choose to adapt `runScenePlanner` directly instead, but must still preserve GM-first ordering. |
| A2 | Stale Inspect roll display is a likely no-roll frontend risk. [ASSUMED] | Common Pitfalls | Verification may find existing state clearing already fully covers it. |
| A3 | Proposed pseudo-code uses possible helper names not present today. [ASSUMED] | Code Examples | Planner must translate into actual codebase naming and impact analysis. |

## Open Questions (Resolved For Phase 78)

These questions are no longer open for Phase 78 planning. They are recorded here as explicit implementation decisions so the executor does not re-litigate the architecture during source edits.

1. **Should the GM decision and ScenePlanner be one model call or two?**
   - What we know: current `runScenePlanner` already interprets action and plans tools, but only after Oracle. [VERIFIED: `backend/src/engine/scene-planner.ts:120`; VERIFIED: `backend/src/engine/turn-processor.ts:1046`]
   - Decision: Phase 78 uses two stages: first `runGmTurnDecision` over the neutral packet, then `runScenePlanner` only for paths that need a concrete plan/tool/combat continuation. [DECIDED: Phase 78 plan-check resolution]
   - Rationale: lower blast radius and clearer no-roll testing matter more than latency for this correction. Consolidation is deferred until after the weekend-playable slice proves the behavior. [DECIDED: Phase 78 plan-check resolution]

2. **What exact direct-resolution artifact should feed final narration when no tools run?**
   - What we know: final narration currently consumes a narrator packet built after ScenePlan execution. [VERIFIED: `backend/src/engine/turn-processor.ts:1165`]
   - Decision: direct/no-roll/continue turns use a validated no-mutation artifact that feeds the same finalization/narration tail as mutating plans. It may be implemented as a zero-action ScenePlan-compatible object or a small direct-resolution packet, but it must not bypass backend finalization. [DECIDED: Phase 78 plan-check resolution]
   - Rationale: backend persists only validated tool/state changes; a direct narrative beat is allowed, but not LLM-authored world mutation. [DECIDED: Phase 78 plan-check resolution]

3. **When should the temporary `SCENE_PLAN_ENABLED` legacy flag be removed?**
   - What we know: flag defaults true and exact `"false"` selects legacy path. [VERIFIED: `backend/src/engine/turn-processor.ts:699`]
   - Decision: keep `SCENE_PLAN_ENABLED=false` as the legacy fallback in Phase 78. Removing it is deferred unless execution proves the flag cannot coexist with the GM-first path. [DECIDED: Phase 78 plan-check resolution]
   - Rationale: Phase 78 already changes the default orchestration order; deleting the rollback lane in the same phase would increase blast radius without helping the user-facing correction. [DECIDED: Phase 78 plan-check resolution]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | npm scripts, backend/frontend tests | yes | v23.11.0 [VERIFIED: shell `node --version`] | none needed |
| npm | package scripts and registry checks | yes | 11.12.1 [VERIFIED: shell `npm --version`] | none needed |
| GitNexus MCP | impact analysis before source edits | yes | repo indexed 2026-05-03, 2787 symbols [VERIFIED: GitNexus `list_repos`] | CLI `npx gitnexus analyze` if stale [VERIFIED: `AGENTS.md`] |
| Backend Vitest | backend acceptance tests | package declared | 3.2.4 declared [VERIFIED: `backend/package.json`] | `npm --prefix backend run test -- <file>` |
| Frontend Vitest | `/game` compatibility tests | package declared | 3.2.4 declared [VERIFIED: `frontend/package.json`] | `npm --prefix frontend run test -- <file>` |
| TypeScript | typecheck gate | package declared | 5.9.3 backend declared [VERIFIED: `backend/package.json`] | `npm --prefix backend run typecheck` |

**Missing dependencies with no fallback:** none identified for research/planning. [VERIFIED: shell; VERIFIED: package manifests]

**Missing dependencies with fallback:** direct local `.bin` TypeScript/Vitest lookup was inconclusive because workspace binaries are not present at `backend/node_modules/.bin`; use npm scripts during execution. [VERIFIED: shell]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 declared for backend and frontend. [VERIFIED: `backend/package.json`; VERIFIED: `frontend/package.json`] |
| Config file | no dedicated vitest config found in `rg --files`; tests are run by package scripts. [VERIFIED: file inventory] |
| Quick backend command | `npm --prefix backend run test -- src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/scene-planner.test.ts src/routes/__tests__/chat.scene-plan.test.ts` [VERIFIED: test file inventory] |
| Quick frontend command | `npm --prefix frontend run test -- app/game/__tests__/page.test.tsx components/game/play-surface/__tests__/action-dock.test.tsx` [VERIFIED: test file inventory] |
| Full suite command | `npm --prefix backend run test && npm --prefix backend run typecheck && npm --prefix frontend run test -- --run && npm --prefix frontend run lint` [VERIFIED: package scripts] |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| P78-R1 | No backend pre-GM target/hostility/combat/action-category authority | unit/static + integration | `npm --prefix backend run test -- src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/scene-frame.test.ts` | Existing files yes; new assertions needed. [VERIFIED: test inventory] |
| P78-R2 | Neutral scene packet includes candidates/visibility/allowed tools but no semantic conclusions | unit | `npm --prefix backend run test -- src/engine/__tests__/scene-frame.test.ts` | Existing file yes; add neutral-mode cases. [VERIFIED: `backend/src/engine/__tests__/scene-frame.test.ts`] |
| P78-R3 | GM/Judge chooses direct/roll/tool/combat/clarify/continue path | unit/integration with mocked LLM | `npm --prefix backend run test -- src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/scene-planner.test.ts` | Existing files yes; likely add new GM decision tests. [VERIFIED: test inventory] |
| P78-R4 | Pure conversation/observation/Continue no longer emits Oracle | integration | `npm --prefix backend run test -- src/routes/__tests__/chat.scene-plan.test.ts` | Existing file yes; add no-Oracle SSE scenario. [VERIFIED: test inventory] |
| P78-R5 | Backend validates/executes concrete GM tools/IDs and rolls back on failure | integration | `npm --prefix backend run test -- src/routes/__tests__/chat.scene-plan.test.ts src/engine/__tests__/scene-plan-validator.test.ts` | Existing files yes. [VERIFIED: test inventory] |
| P78-R6 | `intent`/`method` compatibility mirrors only | frontend + route | `npm --prefix frontend run test -- app/game/__tests__/page.test.tsx && npm --prefix backend run test -- src/routes/__tests__/chat-turn-context.test.ts` | Existing files yes. [VERIFIED: test inventory] |
| P78-R7 | LLM outputs cannot overwrite backend world truth | unit/integration | `npm --prefix backend run test -- src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/tool-executor.test.ts` | Existing files yes; add malicious/proposed-state tests as needed. [VERIFIED: test inventory] |

### Acceptance Test Scenarios

- Talking to an NPC yields no `oracle_result` unless mocked GM decision requests resistance/uncertainty. [VERIFIED: `78-CONTEXT.md` acceptance scenario]
- `"I sniff around looking for the parfait shop"` reaches GM decision with candidates/evidence only; backend does not string-match a route as final target before decision. [VERIFIED: `78-CONTEXT.md` acceptance scenario]
- `"I hit Iru"` exposes Iru as a candidate if scoped/visible but does not build combat envelope until GM selects the combat/hostile path and candidate ID. [VERIFIED: `78-CONTEXT.md` acceptance scenario; VERIFIED: current prework `backend/src/engine/scene-frame.ts:870`]
- `Continue` submits `"Continue scene."`, GM can choose a continue/breathe path, no fake player action category is required, and no Oracle is emitted by default. [VERIFIED: `frontend/lib/display-beats.ts:18`; VERIFIED: `78-CONTEXT.md` acceptance scenario]
- Invalid GM-selected tool/ID fails validation and route restores snapshot. [VERIFIED: current rollback `backend/src/routes/chat.ts:627`; VERIFIED: current validation `backend/src/engine/turn-processor.ts:1076`]

### Sampling Rate

- **Per task commit:** targeted backend or frontend command matching touched surface. [VERIFIED: package scripts]
- **Per wave merge:** backend quick command + frontend `/game` compatibility command. [VERIFIED: test inventory]
- **Phase gate:** full backend suite, backend typecheck, frontend `/game` tests, frontend lint; live or deterministic UAT if planner includes `/game` smoke. [VERIFIED: package scripts; VERIFIED: Phase 77 acceptance pattern]

### Wave 0 Gaps

- [ ] `backend/src/engine/__tests__/gm-turn-decision.test.ts` or equivalent - covers new GM decision schema/prompt contract for P78-R3/P78-R4. [ASSUMED]
- [ ] New cases in `backend/src/engine/__tests__/scene-frame.test.ts` - neutral packet excludes `oracleContext`/`combatEnvelope` before GM decision. [VERIFIED: existing file]
- [ ] New cases in `backend/src/routes/__tests__/chat.scene-plan.test.ts` - no-roll SSE and rollback on invalid GM plan. [VERIFIED: existing file]
- [ ] New cases in `frontend/app/game/__tests__/page.test.tsx` - no stale Oracle display when a no-roll turn completes. [VERIFIED: existing file]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Local singleplayer route context; no auth feature in scope. [VERIFIED: roadmap out of scope states multiplayer/cloud/auth excluded] |
| V3 Session Management | no | Campaign-loaded local state, not user sessions. [VERIFIED: `.planning/ROADMAP.md` out of scope] |
| V4 Access Control | yes | Backend validates campaign ID and loaded campaign before `/action`. [VERIFIED: `backend/src/routes/chat.ts:496`; VERIFIED: `backend/src/routes/chat.ts:497`] |
| V5 Input Validation | yes | Zod schemas for route bodies and structured LLM outputs; no ad hoc parsing. [VERIFIED: `backend/src/routes/schemas.ts:188`; VERIFIED: `backend/src/engine/scene-planner.ts:188`] |
| V6 Cryptography | yes for randomness only | Use Node `crypto.randomInt`; never let LLM invent rolls. [VERIFIED: `backend/src/engine/oracle.ts:51`] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| LLM proposes illegal persisted state | Tampering | Validate all tools/IDs/state transitions through backend schemas/executor. [VERIFIED: `.planning/REQUIREMENTS.md` P78-R5/P78-R7; VERIFIED: `backend/src/engine/turn-processor.ts:1062`] |
| Prompt/model returns invented target IDs | Tampering | Supply candidate IDs, map/validate refs, reject unknown refs. [VERIFIED: `backend/src/engine/scene-planner.ts:53`; VERIFIED: `.planning/REQUIREMENTS.md` P78-R5] |
| Route compatibility fields smuggle semantic authority | Spoofing/Tampering | Treat `intent` and `method` as deprecated mirrors only; new logic should read GM decision outputs. [VERIFIED: `.planning/REQUIREMENTS.md` P78-R6] |
| Roll/result manipulation by model | Tampering | Backend generates random roll and derives outcome after model chance. [VERIFIED: `backend/src/engine/oracle.ts:160`; VERIFIED: `backend/src/engine/oracle.ts:163`] |
| Broad-location target abuse | Elevation of privilege in game rules | Candidate/eligibility validation must respect scene scope and practical interaction, not broad location membership. [VERIFIED: `78-CONTEXT.md`; VERIFIED: `.planning/REQUIREMENTS.md` P77-R4] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/78-gm-first-turn-orchestration-and-oracle-on-demand/78-CONTEXT.md` - phase goal, target flow, ownership boundary, anti-goals, acceptance scenarios. [VERIFIED: file read]
- `.planning/REQUIREMENTS.md` - P78-R1 through P78-R7 and Phase 77 compatibility requirements. [VERIFIED: file read]
- `.planning/ROADMAP.md` - Phase 78 goal and dependency on Phase 77; Phase 69/70/77 historical context. [VERIFIED: file read]
- `.planning/research/worldforge-gm-first-turn-orchestration.md` - GM-first correction and Marinara lesson. [VERIFIED: file read]
- `.planning/research/marinara-gm-flow-reference.md` - reference flow and anti-copying guidance. [VERIFIED: file read]
- `backend/src/routes/chat.ts` - `/action` route, rollback, retry, finalization. [VERIFIED: codebase grep/read]
- `backend/src/engine/turn-processor.ts` - default ScenePlan orchestration, Oracle-first order, validation/execution, finalization. [VERIFIED: codebase grep/read]
- `backend/src/engine/scene-frame.ts` - candidate collection, target matching, combat envelope derivation. [VERIFIED: codebase grep/read]
- `backend/src/engine/scene-planner.ts` - ScenePlan prompt contract and required Oracle result. [VERIFIED: codebase grep/read]
- `backend/src/engine/oracle.ts` - Oracle payload, backend roll, chance/outcome. [VERIFIED: codebase grep/read]
- `frontend/app/game/page.tsx`, `frontend/lib/api.ts`, `frontend/components/game/play-surface/action-dock.tsx` - raw input and Continue transport. [VERIFIED: codebase grep/read]
- `AGENTS.md` - GitNexus impact and detect_changes requirements before source edits/commits. [VERIFIED: file read]

### Secondary (MEDIUM confidence)

- GitNexus `list_repos`, `impact(callOracle)`, `impact(isHostileCombatAction)`, `impact(chatAction)`, `api_impact(chat.ts)` - impact notes. [VERIFIED: GitNexus]
- npm registry checks for Hono, Zod, AI SDK, Vitest, Next, React current versions and modified dates. [VERIFIED: npm registry]

### Tertiary (LOW confidence)

- None used for implementation-critical claims. [VERIFIED: source list]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - package manifests and npm registry checked. [VERIFIED: package manifests; VERIFIED: npm registry]
- Current `/action` flow: HIGH - direct file/function references gathered from backend and frontend code. [VERIFIED: codebase grep/read]
- Architecture recommendation: HIGH for direction, MEDIUM for exact helper names - target boundary is locked by requirements, while new seam naming is planner/executor discretion. [VERIFIED: `.planning/REQUIREMENTS.md`; ASSUMED]
- Pitfalls: HIGH for existing-flow risks, MEDIUM for no-roll frontend stale-display risk. [VERIFIED: codebase grep/read; ASSUMED]

**Research date:** 2026-05-03 [VERIFIED: system date]
**Valid until:** 2026-05-10 for current code flow because this is an active fast-moving gameplay orchestration area. [ASSUMED]

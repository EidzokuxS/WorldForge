# Phase 80: Forecast-Led GM Beat Planning - Research

**Researched:** 2026-05-03 [VERIFIED: system date]
**Domain:** WorldForge backend turn orchestration, advisory GM forecast, per-turn BeatPlan, ScenePlan/NarratorPacket boundary [VERIFIED: .planning/ROADMAP.md:702-705; 80-CONTEXT.md]
**Confidence:** HIGH for current code flow and insertion points; MEDIUM for exact persistence schema because Phase 80 has not been designed yet. [VERIFIED: backend/src/engine/turn-processor.ts:981-1341; ASSUMED]

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Backend owns deterministic truth:

- database state, IDs, refs, schema validation, rolls, persistence, rollback, legal tool execution, invariant enforcement;
- forecast storage/invalidation mechanics, but not semantic truth invention;
- prompt-safe scoping of what the GM may see.

LLM/GM owns semantic intent:

- interpreting raw player text;
- deciding whether the next beat needs no roll, a roll, a tool plan, clarification, or pure narration;
- maintaining an advisory forecast of likely pressures and trajectories;
- deriving a per-turn beat plan before asking backend tools to change state;
- giving the storyteller a settled, player-facing beat packet.

Forecasts and beat plans are advisory GM notes. They must never directly mutate state. Only validated backend tools do.

### Claude's Discretion

No separate discretion section exists in `80-CONTEXT.md`; implementation choices are open only where they preserve the locked responsibility split and required regression cases. [VERIFIED: 80-CONTEXT.md]

### Deferred Ideas (OUT OF SCOPE)

No deferred ideas section exists in `80-CONTEXT.md`. Anti-goals explicitly exclude direct forecast mutation, private forecast exposure to final narration, regex semantic classification, broader prompt dumps, forced ordinary rolls, and background simulation delays unless proven needed. [VERIFIED: 80-CONTEXT.md]
</user_constraints>

## Summary

Phase 80 should add a new advisory planning layer between `buildSceneFrame()` and state-changing `ScenePlan` execution. The current normal player-turn path already assembles a deterministic `SceneFrame`, asks `runGmTurnDecision()` for GM posture, optionally calls Oracle, asks `runScenePlanner()` for a semantic local plan, validates it with `validateScenePlan()`, executes it with `executeScenePlan()`, builds a `NarratorPacket`, and sends that settled packet to `assembleFinalNarrationPrompt()`. [VERIFIED: backend/src/engine/turn-processor.ts:1076-1341]

The recommended architecture is: `SceneFrame -> ForecastContext/WorldForecast -> GmTurnDecision -> BeatPlan -> optional Oracle -> ScenePlan -> validate -> execute -> BeatPacket/NarratorPacket -> final narration`. Forecast and BeatPlan are GM-owned advisory intent. Backend persistence, DB mutation, tool legality, rolls, rollback, and final player-facing narration packet remain deterministic backend-owned authority. [VERIFIED: 80-CONTEXT.md; VERIFIED: backend/src/engine/scene-planner.ts:29-38; VERIFIED: backend/src/engine/narrator-packet.ts:35-73]

**Primary recommendation:** implement `world-forecast.ts` and `gm-beat-plan.ts` as bounded Zod-validated advisory artifacts, pass only prompt-safe forecast slices into GM/BeatPlan prompts, require BeatPlan before any runtime tool execution or final narration, and make NarratorPacket formatting consume only a settled player-facing beat packet, never private forecast internals. [VERIFIED: backend/src/engine/model-facing-scene.ts:236-270; VERIFIED: backend/src/engine/prompt-assembler.ts:1401-1478; ASSUMED]

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| P80-R1 | Maintain or refresh a bounded world forecast of likely NPC/faction/thread pressure. [VERIFIED: .planning/ROADMAP.md:702-705; 80-CONTEXT.md] | Add `WorldForecast` schema/storage with caps and invalidation; do not treat it as truth. |
| P80-R2 | Derive a per-turn BeatPlan from local scene plus scoped forecast before tools/narration. [VERIFIED: 80-CONTEXT.md] | Add `runGmBeatPlan()` between `runGmTurnDecision()` and `runScenePlanner()`. |
| P80-R3 | Preserve backend authority for tools, rolls, DB writes, validation, persistence, and rollback. [VERIFIED: CLAUDE.md; 80-CONTEXT.md] | BeatPlan cannot contain direct deltas; ScenePlan validator/executor stay authoritative. |
| P80-R4 | Keep private/remote forecast details out of local prompts unless surfaced as local/player-known context. [VERIFIED: 80-CONTEXT.md; backend/src/engine/model-facing-scene.ts:236-270] | Build forecast scoping via model-facing packet safety and red-test remote leakage. |
| P80-R5 | Invalidate or refresh relevant forecasts after durable events or major committed state changes. [VERIFIED: 80-CONTEXT.md; backend/src/engine/tool-executor.ts:617-667] | Add forecast metadata keyed by durable event/tick/version; scene-local `log_event` does not invalidate. |
| P80-R6 | Give final narration a settled player-facing beat packet, not private forecast internals. [VERIFIED: 80-CONTEXT.md; backend/src/engine/prompt-assembler.ts:1401-1478] | Extend `NarratorPacket` or add `PlayerFacingBeatPacket` derived after execution. |

## Project Constraints (from CLAUDE.md)

- Backend is Hono + TypeScript strict; shared types/constants should come from `@worldforge/shared` when cross-package. [VERIFIED: CLAUDE.md]
- LLM is narrator/GM only; deterministic engine and backend validators own game state. [VERIFIED: CLAUDE.md]
- All AI structured outputs should use Zod schemas and AI SDK helpers such as `safeGenerateObject`/`generateText` rather than raw provider fetches. [VERIFIED: CLAUDE.md; backend/src/engine/gm-turn-decision.ts:1-9]
- Drizzle query builder is preferred over raw SQL for DB work. [VERIFIED: CLAUDE.md]
- Route handlers use outer try/catch and validation helpers; Phase 80 should avoid route rewrites unless rollback tests require route-level changes. [VERIFIED: CLAUDE.md; backend/src/routes/chat.ts:551-640]
- GitNexus impact analysis is required before editing symbols, but this research task did not edit production symbols. [VERIFIED: AGENTS.md]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Forecast semantic content | LLM/GM | Backend validation | GM proposes likely pressures and trajectories; backend only caps, scopes, stores, invalidates, and never treats forecast text as fact. [VERIFIED: 80-CONTEXT.md] |
| Forecast storage/invalidation | Backend | Database/Storage | Backend owns persistence mechanics and must invalidate on durable events or major committed state changes. [VERIFIED: 80-CONTEXT.md] |
| Forecast scoping | Backend | LLM/GM | Backend filters local/player-known slices before prompt assembly; GM may not receive remote private details in local prompts. [VERIFIED: backend/src/engine/model-facing-scene.ts:236-270] |
| BeatPlan semantic intent | LLM/GM | Backend validation | BeatPlan explains why this beat now, reveal intent, pressure, and tool justification; it cannot mutate state. [VERIFIED: 80-CONTEXT.md] |
| ScenePlan/tool execution | Backend | LLM/GM advisory input | ScenePlan is mapped, validated, and executed through existing deterministic validator/executor. [VERIFIED: backend/src/engine/scene-planner.ts:200-244; backend/src/engine/turn-processor.ts:1202-1227] |
| Final narration facts | Backend | Storyteller LLM | NarratorPacket already isolates final-visible prompt from broad world memory when supplied. [VERIFIED: backend/src/engine/prompt-assembler.ts:1412-1436] |

## Current Turn Flow

Current normal player-turn flow with `SCENE_PLAN_ENABLED` defaulting true: [VERIFIED: backend/src/engine/turn-processor.ts:709-713; backend/src/engine/turn-processor.ts:981-992]

1. `processTurn()` dispatches to `processTurnScenePlan()` unless `SCENE_PLAN_ENABLED=false`. [VERIFIED: backend/src/engine/turn-processor.ts:981-992]
2. Backend reads campaign config/player state, applies start-condition effects, syncs scene scope, derives runtime tags, and builds local scene context before LLM interpretation. [VERIFIED: backend/src/engine/turn-processor.ts:1006-1074]
3. `buildSceneFrame()` creates the neutral local frame with active/support/background actors, target candidates, movement candidates, recent events, and allowed tools. [VERIFIED: backend/src/engine/turn-processor.ts:1076-1086; backend/src/engine/scene-frame.ts:779]
4. `runGmTurnDecision()` receives raw player action plus model-facing scene packet/candidates and returns one validated GM posture path. [VERIFIED: backend/src/engine/gm-turn-decision.ts:271-358]
5. Oracle is called only when GM selected `roll_oracle`; combat envelope is built only when GM selected `combat_transition`. [VERIFIED: backend/src/engine/turn-processor.ts:1100-1153]
6. Direct/continue/clarification currently build `buildNoMutationScenePlan()`; other paths call `runScenePlanner()`. [VERIFIED: backend/src/engine/turn-processor.ts:1177-1191]
7. `validateScenePlan()` runs before `executeScenePlan()`, and validation failure throws before execution. [VERIFIED: backend/src/engine/turn-processor.ts:1202-1217]
8. `executeScenePlan()` applies approved runtime tool effects, then `assembleAuthoritativeScene()` assembles post-tool local truth. [VERIFIED: backend/src/engine/turn-processor.ts:1219-1320]
9. `buildNarratorPacket()` derives player-facing packet facts and forbidden prompt markers. [VERIFIED: backend/src/engine/turn-processor.ts:1329-1334; backend/src/engine/narrator-packet.ts:269-298]
10. `assembleFinalNarrationPrompt()` uses isolated NarratorPacket mode when `narratorPacket` is supplied. [VERIFIED: backend/src/engine/prompt-assembler.ts:1412-1436]

## Target Architecture

```text
Backend authoritative inputs
  -> buildSceneFrame()
  -> buildModelFacingScenePacket()
  -> scopeForecastForScene(frame, stored forecast)
  -> runGmTurnDecision(frame + scoped forecast summary)
  -> runGmBeatPlan(frame + gmDecision + scoped forecast summary)
       BeatPlan: advisory intent only, no direct deltas
  -> optional callOracle()
  -> runScenePlanner(frame + gmDecision + beatPlan + oracle)
  -> validateScenePlan()
  -> executeScenePlan()
  -> invalidate/refresh forecast from durable committed effects only
  -> buildPlayerFacingBeatPacket()/buildNarratorPacket()
  -> assembleFinalNarrationPrompt(narratorPacket/settled beat packet)
  -> visible narration
```

Recommended new modules: [ASSUMED]

| File | Symbols | Purpose |
|------|---------|---------|
| `backend/src/engine/world-forecast.ts` | `worldForecastSchema`, `scopedForecastSchema`, `loadWorldForecast`, `saveWorldForecast`, `scopeForecastForFrame`, `invalidateForecastForCommittedTurn` | Own bounded advisory forecast shape, storage adapter, prompt-safe slicing, invalidation metadata. [ASSUMED] |
| `backend/src/engine/gm-beat-plan.ts` | `gmBeatPlanSchema`, `runGmBeatPlan`, `validateBeatPlanForFrame`, `formatBeatPlanForScenePlanner`, `formatBeatPlanForNarrator` | Own per-turn advisory BeatPlan generation and enforcement that BeatPlan carries no state deltas. [ASSUMED] |
| `backend/src/engine/prompt-contracts.ts` | `buildWorldForecastPromptContract`, `buildGmBeatPlanPromptContract` | Keep Phase 74-style structured-output prompt contracts close to gameplay prompt helpers. [VERIFIED: backend/src/engine/prompt-contracts.ts:24-31; ASSUMED] |
| `backend/src/engine/narrator-packet.ts` | `PlayerFacingBeatPacket` or `beatPlanSummary` field on `NarratorPacket` | Carry settled, player-facing beat notes only after validation/execution; do not include private forecast. [VERIFIED: backend/src/engine/narrator-packet.ts:35-73; ASSUMED] |
| `backend/src/engine/turn-processor.ts` | `processTurnScenePlan` insertion around lines 1076-1191 | Require forecast/BeatPlan before ScenePlan, and update final packet after execution. [VERIFIED: backend/src/engine/turn-processor.ts:1076-1191; ASSUMED] |

Recommended data model: store forecast outside durable world truth or mark it explicitly advisory. Use a campaign-scoped JSON artifact with `forecastId`, `createdAtTick`, `validUntilTick`, `scopeRefs`, `invalidatedBy`, `entries[]`, and `privacy`/`surfacing` flags. This should be stored in campaign config or a small SQLite table only if existing config storage becomes unwieldy. [ASSUMED]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | `^5.9.3` in backend package; registry current `5.9.3` not checked via npm because no new TypeScript package is needed. [VERIFIED: backend/package.json] | Strict backend implementation. | Existing project standard. [VERIFIED: CLAUDE.md] |
| Zod | package has `^4.3.6`; npm current is `4.4.2`, modified 2026-05-01. [VERIFIED: backend/package.json; VERIFIED: npm registry] | Forecast/BeatPlan schemas and fail-closed validation. | Existing project standard for AI structured outputs and tool payloads. [VERIFIED: CLAUDE.md; backend/src/engine/gm-turn-decision.ts:1-77] |
| AI SDK `ai` | package has `^6.0.106`; npm current is `6.0.174`, modified 2026-05-01. [VERIFIED: backend/package.json; VERIFIED: npm registry] | Structured/text model calls through existing wrappers. | Current code uses `safeGenerateObject` and `createModel` for Judge calls. [VERIFIED: backend/src/engine/gm-turn-decision.ts:1-9] |
| Drizzle ORM | package has `^0.45.1`; npm current is `0.45.2`, modified 2026-05-01. [VERIFIED: backend/package.json; VERIFIED: npm registry] | Optional forecast persistence table if config JSON is insufficient. | Existing backend DB access pattern. [VERIFIED: CLAUDE.md; backend/src/engine/scene-assembly.ts:1-4] |
| Vitest | package has `^3.2.4`; npm current is `4.1.5`, modified 2026-04-23. [VERIFIED: backend/package.json; VERIFIED: npm registry] | Red tests and regression harness. | Existing backend test suite uses Vitest. [VERIFIED: backend/src/engine/__tests__/gm-turn-decision.test.ts] |

**Installation:** no new package should be introduced for Phase 80. [VERIFIED: backend/package.json; ASSUMED]

```bash
npm --prefix backend install
npm --prefix backend run typecheck
npm --prefix backend run test -- src/engine/__tests__/gm-beat-plan.test.ts src/engine/__tests__/world-forecast.test.ts
```

## Architecture Patterns

### Pattern 1: Bounded Structured Advisory Artifact

**What:** define `worldForecastSchema` and `gmBeatPlanSchema` with strict objects, max strings/arrays, and no passthrough keys. [VERIFIED: backend/src/engine/world-brain.ts:8-50; backend/src/engine/gm-turn-decision.ts:21-77]

**When to use:** all GM-authored forecast/BeatPlan JSON. [VERIFIED: CLAUDE.md; 80-CONTEXT.md]

**Example:**

```typescript
// Source pattern: backend/src/engine/world-brain.ts and gm-turn-decision.ts
export const gmBeatPlanSchema = z.object({
  beatIntent: z.string().trim().min(1).max(220),
  whyNow: z.string().trim().min(1).max(220),
  forecastRefs: z.array(z.string().trim().min(1).max(120)).max(4),
  revealIntent: z.array(z.object({
    kind: z.enum(["none", "hint", "confirm", "withhold"]),
    playerFacingSummary: z.string().trim().min(1).max(180),
  }).strict()).max(3),
  toolJustifications: z.array(z.object({
    toolName: z.enum(runtimeToolNames),
    reason: z.string().trim().min(1).max(180),
  }).strict()).max(6),
  privateRationale: z.string().trim().min(1).max(360),
}).strict();
```

### Pattern 2: Model-Facing Safety Gate Before Prompt Use

**What:** build prompt inputs from `buildModelFacingScenePacket(frame)` and filter/redact forecast text with the same safety terms before prompts. [VERIFIED: backend/src/engine/model-facing-scene.ts:236-270; backend/src/engine/scene-planner.ts:77-132]

**When to use:** GM decision prompt, BeatPlan prompt, ScenePlanner prompt, repair prompt, and final-visible prompt. [VERIFIED: backend/src/engine/gm-turn-decision.ts:271-310; backend/src/engine/scene-planner.ts:77-132]

**Implementation note:** remote/private forecast entries should not be present in local prompt JSON at all; redaction is a backup, not the primary scoping mechanism. [VERIFIED: 80-CONTEXT.md; ASSUMED]

### Pattern 3: Advisory-to-Authoritative Conversion

**What:** BeatPlan can justify a future `ScenePlan`, but only ScenePlan validation/execution may create DB/tool effects. [VERIFIED: 80-CONTEXT.md; backend/src/engine/turn-processor.ts:1202-1227]

**When to use:** pass BeatPlan into `runScenePlanner()` as context, then validate the resulting ScenePlan against frame/tool refs. [VERIFIED: backend/src/engine/scene-planner.ts:39-48; ASSUMED]

### Anti-Patterns to Avoid

- **Forecast as state delta:** forecast entries must not include direct HP/location/inventory/tag/relationship DB mutations. [VERIFIED: 80-CONTEXT.md]
- **BeatPlan as ScenePlan clone:** BeatPlan should not contain `plannedActions.input` payloads or narratorFacts IDs; those belong to ScenePlan mapping/validation. [VERIFIED: backend/src/engine/scene-planner.ts:50-58; backend/src/engine/scene-plan-schema.ts:110-160]
- **Final narration from private forecast:** final narration should consume NarratorPacket/settled beat packet, not forecast internals. [VERIFIED: backend/src/engine/prompt-assembler.ts:1412-1436; 80-CONTEXT.md]
- **Global prompt dump rollback:** Phase 79 closed the offscreen leak by narrowing prompts; Phase 80 must preserve that boundary. [VERIFIED: 79-SUMMARY.md; backend/src/engine/model-facing-scene.ts:236-270]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured LLM output parsing | JSON substring parsing or regex repair | `safeGenerateObject` + strict/loose Zod schema + bounded repair pattern | Existing code standard already uses this for GM, ScenePlanner, and WorldBrain. [VERIFIED: backend/src/engine/gm-turn-decision.ts:321-358; backend/src/engine/scene-planner.ts:200-244; backend/src/engine/world-brain.ts:329-390] |
| Prompt leak filtering | Manual string allow/block checks per prompt | `buildModelFacingScenePacket`, `redactModelFacingJson`, `shouldDropModelFacingText` | Existing Phase 79 safety functions filter hidden/offscreen terms. [VERIFIED: backend/src/engine/model-facing-scene.ts:236-310] |
| Tool legality | BeatPlan-internal legality rules | `validateScenePlan` + runtime tool schemas + `executeScenePlan` | Backend already validates ScenePlan before execution. [VERIFIED: backend/src/engine/turn-processor.ts:1202-1227] |
| Final-visible safety | Storyteller instructions alone | `NarratorPacket`, `assertNarratorPacketPromptSafe`, `runVisibleNarrationWithPacketGuard` | Existing final prompt path isolates packet facts and throws on forbidden terms. [VERIFIED: backend/src/engine/narrator-packet.ts:300-362; backend/src/engine/prompt-assembler.ts:1412-1436; backend/src/engine/turn-processor.ts:1337-1362] |
| Rollback safety | Best-effort cleanup in forecast module only | Route snapshot restore + pending committed event drain | Existing `/action` and `/retry` restore snapshot and drain failed-tick pending committed events. [VERIFIED: backend/src/routes/chat.ts:551-640; backend/src/routes/chat.ts:826-879] |

## Common Pitfalls

### Pitfall 1: Remote Forecast Leak Into Local Prompts

**What goes wrong:** a forecast entry about an offscreen actor/location is included in a local Shibuya GM/BeatPlan prompt. [VERIFIED: 80-CONTEXT.md]
**Why it happens:** forecast storage is broader than player-local model-facing context. [VERIFIED: 79-SUMMARY.md; ASSUMED]
**How to avoid:** scope forecast entries by scene/player-known refs before prompt formatting, then apply model-facing redaction as defense in depth. [VERIFIED: backend/src/engine/model-facing-scene.ts:236-310; ASSUMED]
**Warning signs:** prompt dump contains remote location names, hidden actor labels, or forecast entries whose refs are absent from model-facing candidates. [VERIFIED: backend/src/engine/gm-turn-decision.ts:286-310; backend/src/engine/scene-planner.ts:77-132]

### Pitfall 2: BeatPlan Carries Direct State Deltas

**What goes wrong:** BeatPlan includes `hpDelta`, `newLocationId`, `inventoryAdd`, durable event text, or tool input payloads. [VERIFIED: 80-CONTEXT.md]
**Why it happens:** ScenePlan and BeatPlan responsibilities blur. [VERIFIED: 80-CONTEXT.md]
**How to avoid:** BeatPlan schema should reject backend-owned mutation fields with `.strict()` and tests should fuzz forbidden keys. [VERIFIED: backend/src/engine/gm-turn-decision.ts:195-227; ASSUMED]

### Pitfall 3: Failed Turn Persists Forecast

**What goes wrong:** a forecast refresh is saved before a later validation/execution/narration failure, so retry sees a future that never happened. [VERIFIED: 80-CONTEXT.md]
**Why it happens:** forecast write happens before route snapshot boundary succeeds. [VERIFIED: backend/src/routes/chat.ts:551-640; ASSUMED]
**How to avoid:** either write forecasts inside the same snapshot-covered storage, or stage forecast updates until rollback-critical post-turn finalization succeeds. [VERIFIED: backend/src/engine/turn-processor.ts:1463-1474; ASSUMED]

### Pitfall 4: Durable Event Does Not Invalidate Forecast

**What goes wrong:** a durable `log_event`, movement, spawn, relationship, condition, or chronicle entry makes an old forecast stale but the next turn reuses it. [VERIFIED: 80-CONTEXT.md; backend/src/engine/tool-executor.ts:617-667]
**How to avoid:** attach `baseTick`, `baseEventIds`, `scopeRefs`, and `invalidatedBy` metadata; invalidate only on durable/future-relevant committed effects, not scene-local transient events. [VERIFIED: backend/src/engine/tool-executor.ts:617-667; ASSUMED]

### Pitfall 5: Final Narration Sees Private Forecast

**What goes wrong:** storyteller prompt includes private forecast rationale and narrates offscreen truth. [VERIFIED: 80-CONTEXT.md]
**How to avoid:** final prompt receives `NarratorPacket` plus a player-facing beat packet derived after execution; private forecast/BeatPlan fields remain absent. [VERIFIED: backend/src/engine/prompt-assembler.ts:1412-1436; ASSUMED]

## Red-Test Recommendations

| Test | Target File | Expected Assertion |
|------|-------------|-------------------|
| No remote forecast leak into local prompt | `backend/src/engine/__tests__/gm-beat-plan.test.ts`, `gm-turn-decision.test.ts`, `scene-planner.test.ts` | Forecast contains `Forest Outpost`/hidden actor; GM decision, BeatPlan, and ScenePlanner prompt strings do not contain those terms when local frame is Shibuya. [VERIFIED: backend/src/engine/__tests__/gm-turn-decision.test.ts:364-462; backend/src/engine/__tests__/scene-planner.test.ts:1021-1182] |
| BeatPlan cannot carry direct state deltas | `backend/src/engine/__tests__/gm-beat-plan.test.ts` | Schema rejects `hpDelta`, `locationId`, `inventory`, `relationshipDelta`, `durableEvent`, `plannedActions`, `toolInput`, and `narratorFacts`. [VERIFIED: 80-CONTEXT.md; ASSUMED] |
| Failed turn does not persist forecast | `backend/src/routes/__tests__/chat.scene-plan.test.ts` plus `world-forecast.test.ts` | If execution fails after forecast/BeatPlan generation, route restores snapshot and forecast store has no new committed forecast revision. [VERIFIED: backend/src/routes/__tests__/chat.scene-plan.test.ts:333-537; ASSUMED] |
| Durable event invalidates forecast | `backend/src/engine/__tests__/world-forecast.test.ts`, `tool-executor.test.ts` | Durable `log_event` or committed tool effect marks relevant forecast entries invalid; scene-local `log_event` does not. [VERIFIED: backend/src/engine/tool-executor.ts:617-667; backend/src/engine/__tests__/tool-executor.test.ts:373-502] |
| Final narration gets settled player-facing beat packet, not private forecast | `backend/src/engine/__tests__/prompt-assembler.test.ts`, `scene-turn-packet.test.ts` | `assembleFinalNarrationPrompt()` includes player-facing beat summary and excludes private forecast fields/remote actor names. [VERIFIED: backend/src/engine/__tests__/prompt-assembler.test.ts:1436-1548; ASSUMED] |

## Concrete File/Symbol Candidates

| Existing File/Symbol | Change Candidate | Risk |
|----------------------|------------------|------|
| `processTurnScenePlan()` in `turn-processor.ts` | Insert forecast load/scope before `runGmTurnDecision()`, run BeatPlan before `runScenePlanner()`, stage forecast persistence until success. [VERIFIED: backend/src/engine/turn-processor.ts:992-1341] | HIGH blast radius because it owns the normal player turn critical path. [VERIFIED: GitNexus query; backend/src/engine/turn-processor.ts] |
| `SCENE_PLAN_TURN_ORDER` in `scene-planner.ts` | Update order to include `scopeForecastForFrame` and `runGmBeatPlan` before `optional runScenePlanner`. [VERIFIED: backend/src/engine/scene-planner.ts:29-38] | LOW code change but important test contract. [ASSUMED] |
| `RunScenePlannerArgs` and prompt builder | Add optional `beatPlan` argument and prompt block after GM decision, before Oracle/tool task. [VERIFIED: backend/src/engine/scene-planner.ts:39-132] | MEDIUM because prompt leakage/repair tests must update. [VERIFIED: backend/src/engine/__tests__/scene-planner.test.ts:1021-1182] |
| `NarratorPacket` in `narrator-packet.ts` | Add settled player-facing beat notes or companion packet; keep private forecast excluded from `promptVisibleText()`. [VERIFIED: backend/src/engine/narrator-packet.ts:35-73; backend/src/engine/narrator-packet.ts:300-362] | MEDIUM because final prompt safety relies on this packet. [VERIFIED: backend/src/engine/__tests__/prompt-assembler.test.ts:1436-1548] |
| `prompt-contracts.ts` | Add forecast/BeatPlan contracts with backend authority text and explicit forbidden direct-delta examples. [VERIFIED: backend/src/engine/prompt-contracts.ts:212-232] | LOW; pattern is established. [VERIFIED: backend/src/engine/__tests__/scene-planner.test.ts:232-269] |
| `model-facing-scene.ts` | Possibly add forecast-specific filtering helpers that reuse `ModelFacingPromptSafety`. [VERIFIED: backend/src/engine/model-facing-scene.ts:236-310] | MEDIUM because private term collection is leak-critical. [VERIFIED: 79-SUMMARY.md] |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest declared as `^3.2.4` in backend package. [VERIFIED: backend/package.json] |
| Config file | `backend/vitest.config.ts` exists. [VERIFIED: backend directory listing] |
| Quick run command | `npm --prefix backend run test -- src/engine/__tests__/world-forecast.test.ts src/engine/__tests__/gm-beat-plan.test.ts` [ASSUMED] |
| Full phase command | `npm --prefix backend run test -- src/engine/__tests__/model-facing-scene.test.ts src/engine/__tests__/gm-turn-decision.test.ts src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/scene-plan-executor.test.ts src/engine/__tests__/scene-turn-packet.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/prompt-assembler.test.ts src/routes/__tests__/chat.scene-plan.test.ts src/vectors/__tests__/episodic-events.test.ts` [VERIFIED: 79-VERIFICATION.md; ASSUMED] |
| Typecheck | `npm --prefix backend run typecheck` [VERIFIED: backend/package.json] |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| P80-R1 | Forecast schema caps, privacy flags, advisory-only metadata | unit | `npm --prefix backend run test -- src/engine/__tests__/world-forecast.test.ts` | No - Wave 0 [ASSUMED] |
| P80-R2 | BeatPlan required before ScenePlanner/final narration | unit/integration | `npm --prefix backend run test -- src/engine/__tests__/turn-processor.scene-plan.test.ts` | Exists; add tests [VERIFIED: backend/src/engine/__tests__/turn-processor.scene-plan.test.ts] |
| P80-R3 | BeatPlan rejects direct deltas and tool payloads | unit | `npm --prefix backend run test -- src/engine/__tests__/gm-beat-plan.test.ts` | No - Wave 0 [ASSUMED] |
| P80-R4 | Remote forecast does not leak into local prompts | unit | `npm --prefix backend run test -- src/engine/__tests__/gm-beat-plan.test.ts src/engine/__tests__/scene-planner.test.ts` | Partial existing leak harness [VERIFIED: backend/src/engine/__tests__/gm-turn-decision.test.ts:364-462; backend/src/engine/__tests__/scene-planner.test.ts:1021-1182] |
| P80-R5 | Durable committed event invalidates forecast; scene-local event does not | unit | `npm --prefix backend run test -- src/engine/__tests__/world-forecast.test.ts src/engine/__tests__/tool-executor.test.ts` | Partial durable tests exist [VERIFIED: backend/src/engine/__tests__/tool-executor.test.ts:373-502] |
| P80-R6 | Final narration sees settled player-facing beat packet only | unit/integration | `npm --prefix backend run test -- src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/scene-turn-packet.test.ts` | Exists; add tests [VERIFIED: backend/src/engine/__tests__/prompt-assembler.test.ts; backend/src/engine/__tests__/scene-turn-packet.test.ts] |

### Wave 0 Gaps

- [ ] `backend/src/engine/__tests__/world-forecast.test.ts` - forecast schema, storage adapter, scoping, invalidation, rollback staging. [ASSUMED]
- [ ] `backend/src/engine/__tests__/gm-beat-plan.test.ts` - BeatPlan schema, prompt safety, direct-delta rejection, settled public formatter. [ASSUMED]
- [ ] Extend `turn-processor.scene-plan.test.ts` to pin new turn order and require BeatPlan before ScenePlanner/final narration. [VERIFIED: backend/src/engine/__tests__/turn-processor.scene-plan.test.ts:183-386]
- [ ] Extend `chat.scene-plan.test.ts` for forecast rollback after failed turn. [VERIFIED: backend/src/routes/__tests__/chat.scene-plan.test.ts:333-537]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | backend scripts | Yes | `v23.11.0` [VERIFIED: shell `node --version`] | None needed |
| npm | package scripts | Yes | `11.12.1` [VERIFIED: shell `npm --version`] | None needed |
| backend package deps | Vitest/typecheck execution | Partial | `node_modules` exists but `npm ls vitest --depth=0` and `npm ls typescript --depth=0` returned empty. [VERIFIED: shell] | Run `npm --prefix backend install` before verification. |
| GitNexus | code intelligence | Yes | WorldForge indexed 2026-05-03 with 2822 symbols, 7889 relationships, 227 flows. [VERIFIED: GitNexus MCP `list_repos`] | Use `rg` plus source reads if needed. |

**Missing dependencies with no fallback:** none for research. [VERIFIED: shell]

**Missing dependencies with fallback:** backend dev dependencies appear not fully installed in `backend/node_modules`; planner should include dependency install before test execution. [VERIFIED: shell]

## Security Domain

Security enforcement is enabled because `.planning/config.json` does not disable it. [VERIFIED: .planning/config.json]

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | No | Phase 80 is internal turn orchestration, not auth. [VERIFIED: 80-CONTEXT.md] |
| V3 Session Management | No | No session behavior is in scope. [VERIFIED: 80-CONTEXT.md] |
| V4 Access Control | Yes, intra-prompt authority | Backend-scoped model-facing packet and candidate refs are the control boundary. [VERIFIED: backend/src/engine/model-facing-scene.ts:236-270] |
| V5 Input Validation | Yes | Zod schemas for forecast and BeatPlan structured outputs. [VERIFIED: CLAUDE.md; ASSUMED] |
| V6 Cryptography | No | No crypto is in scope. [VERIFIED: 80-CONTEXT.md] |
| V8 Data Protection | Yes | Private forecast and hidden/offscreen terms must not reach final-visible prompt. [VERIFIED: 80-CONTEXT.md; backend/src/engine/narrator-packet.ts:300-362] |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt information disclosure through forecast | Information Disclosure | Scope forecast by frame/player-known refs, then redact with model-facing safety. [VERIFIED: backend/src/engine/model-facing-scene.ts:236-310] |
| LLM attempts unauthorized mutation through BeatPlan | Tampering | BeatPlan schema rejects deltas; ScenePlan validator/executor remain only mutation path. [VERIFIED: backend/src/engine/turn-processor.ts:1202-1227; ASSUMED] |
| Stale forecast after durable state change | Tampering/Integrity | Invalidate relevant forecast entries on durable committed effects. [VERIFIED: 80-CONTEXT.md; ASSUMED] |
| Failed turn commits forecast | Integrity/Repudiation | Stage or snapshot forecast writes with route rollback boundary. [VERIFIED: backend/src/routes/chat.ts:551-640; ASSUMED] |

## Open Questions

1. **Where should forecast persistence live?**
   - What we know: backend owns storage/invalidation mechanics, but forecast is advisory and not world truth. [VERIFIED: 80-CONTEXT.md]
   - What's unclear: campaign config JSON vs new SQLite table vs sidecar JSON has not been decided. [ASSUMED]
   - Recommendation: start with a small campaign-scoped JSON artifact if rollback snapshot covers it; choose SQLite only if query/update semantics require it. [ASSUMED]

2. **Should forecast refresh happen every turn or lazily?**
   - What we know: Phase 80 requires bounded forecasts and invalidation/refresh when needed. [VERIFIED: 80-CONTEXT.md]
   - What's unclear: cadence and token budget targets are not specified. [ASSUMED]
   - Recommendation: refresh lazily when absent, invalidated, expired, or major durable event changed relevant scope. [ASSUMED]

3. **Should BeatPlan be embedded into NarratorPacket or remain a companion packet?**
   - What we know: final narration must receive settled player-facing beat packet, not private forecast. [VERIFIED: 80-CONTEXT.md]
   - What's unclear: exact type boundary is open. [ASSUMED]
   - Recommendation: add a `playerFacingBeat` field to `NarratorPacket` only after `assertNarratorPacketPromptSafe` covers it. [ASSUMED]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | New files should be `world-forecast.ts` and `gm-beat-plan.ts`. | Target Architecture | Planner may choose different names; low implementation risk. |
| A2 | Forecast can initially be campaign-scoped JSON if snapshot-covered. | Target Architecture/Open Questions | If snapshots exclude the chosen storage, rollback safety breaks. |
| A3 | BeatPlan should be inserted after GM decision and before ScenePlanner. | Target Architecture | If GM decision should consume BeatPlan instead, prompt responsibilities need rework. |
| A4 | Durable event invalidation should be lazy/scope-based. | Common Pitfalls/Open Questions | Too broad invalidation wastes tokens; too narrow reuses stale pressure. |
| A5 | Backend dev dependencies need install before tests. | Environment Availability | If local environment is intentionally sparse, planner must account for install time. |

## Sources

### Primary (HIGH confidence)

- `.planning/ROADMAP.md:689-705` - Phase 79/80 goals and dependency. [VERIFIED: file read]
- `.planning/phases/80-forecast-led-gm-beat-planning/80-CONTEXT.md` - locked responsibility split, target outcome, anti-goals, red cases, exit gate. [VERIFIED: file read]
- `.planning/phases/79-gm-epistemic-context-and-tool-grounding/79-SUMMARY.md` - Phase 79 closure and remaining Phase 80 gap. [VERIFIED: file read]
- `.planning/phases/79-gm-epistemic-context-and-tool-grounding/79-VERIFICATION.md` - focused verification suite and leak/rollback evidence. [VERIFIED: file read]
- `backend/src/engine/turn-processor.ts` - current turn flow and insertion points. [VERIFIED: file read]
- `backend/src/engine/gm-turn-decision.ts` - GM decision schema, prompt, frame validation. [VERIFIED: file read]
- `backend/src/engine/scene-planner.ts` - ScenePlan prompt/mapping and turn-order constants. [VERIFIED: file read]
- `backend/src/engine/model-facing-scene.ts` - model-facing scene packet safety and redaction. [VERIFIED: file read]
- `backend/src/engine/scene-assembly.ts` - post-tool authoritative scene assembly. [VERIFIED: file read]
- `backend/src/engine/prompt-assembler.ts` - final narration prompt isolation and NarratorPacket path. [VERIFIED: file read]
- `backend/src/engine/narrator-packet.ts` and `backend/src/engine/world-brain.ts` - packet safety and bounded structured direction patterns. [VERIFIED: file read]
- GitNexus MCP `list_repos`, `query`, and `context` for WorldForge - indexed code intelligence and symbol context. [VERIFIED: GitNexus MCP]
- npm registry checks for `zod`, `ai`, `vitest`, `drizzle-orm`. [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)

- `.planning/STATE.md` - current project focus and recent Phase 79/80 status. [VERIFIED: file read]

### Tertiary (LOW confidence)

- None. Low-confidence design claims are listed as `[ASSUMED]` in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Current flow: HIGH - required source files and tests were read directly. [VERIFIED: file read]
- Insertion points: HIGH - `processTurnScenePlan()` line-level order is explicit. [VERIFIED: backend/src/engine/turn-processor.ts:1076-1341]
- Forecast schema/storage: MEDIUM - responsibility and red tests are locked, but storage form is not. [VERIFIED: 80-CONTEXT.md; ASSUMED]
- Test strategy: HIGH for target files; MEDIUM for exact new test filenames. [VERIFIED: backend/src/engine/__tests__; ASSUMED]

**Research date:** 2026-05-03 [VERIFIED: system date]
**Valid until:** 2026-05-10 because active turn orchestration has changed rapidly across Phases 78-80. [VERIFIED: .planning/STATE.md; ASSUMED]

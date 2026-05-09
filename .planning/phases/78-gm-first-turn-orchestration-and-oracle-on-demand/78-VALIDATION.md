# Phase 78 Validation: GM-First Turn Orchestration And Oracle-On-Demand

## Scope

Phase 78 succeeds when `/api/chat/action` stops treating raw player text as backend-owned product semantics and instead runs a GM/Judge-first decision loop over a neutral scene packet. Backend remains authoritative for IDs, visibility facts, allowed tools, deterministic validation, random roll receipts, persistence, snapshots, rollback, and final world truth.

This phase must preserve Phase 77 `/game` behavior: one raw input, first-class `Continue`, staged beats, Inspect-hidden mechanics, and no required Act/Speak/Observe command modes.

## Assumptions

- A new GM decision schema/module is acceptable if it uses the existing `safeGenerateObject` structured-output and repair patterns.
- Direct/no-roll turns may still produce a validated zero-action or narration-only ScenePlan-shaped artifact as long as backend does not invent target/tool semantics to satisfy validation.
- The legacy `intent` and `method` request fields stay route-compatible during this phase; product logic treats them as raw-text mirror and empty method only.
- `SCENE_PLAN_ENABLED=false` legacy fallback is not removed unless an executor finds it impossible to preserve while satisfying the requirements.

## Requirement-To-Test Mapping

| Requirement | Required Proof | Primary Tests | Acceptance Gate |
|---|---|---|---|
| P78-R1 | Backend no longer infers intent, target, hostility, combat mode, or action category from raw text before GM/Judge. | `backend/src/engine/__tests__/scene-frame.test.ts`; `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts`; negative grep for pre-GM `isHostileCombatAction` and text target matching in turn path. | `"I hit Iru"` exposes candidates/evidence but no pre-GM target/combat envelope is authoritative. |
| P78-R2 | Neutral scene packet contains state, candidates, visibility bands, recent events, memory hints when available, and allowed tools without semantic conclusions. | `backend/src/engine/__tests__/scene-frame.test.ts`; contract assertions on `SceneFrame`. | Same broad location does not make an actor directly interactable unless scene presence/visibility says so. |
| P78-R3 | GM/Judge chooses direct, roll/Oracle, tool call, combat transition, clarification, or Continue. | `backend/src/engine/__tests__/gm-turn-decision.test.ts`; `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts`. | Mocked GM decision controls the path; backend does not override path from raw text. |
| P78-R4 | Oracle/rolls run only when GM/Judge requests uncertainty/resistance. | `backend/src/routes/__tests__/chat.scene-plan.test.ts`; `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts`. | Pure speech, obvious observation, and `Continue` emit no `oracle_result`; requested roll emits exactly one receipt. |
| P78-R5 | Backend validates and executes only GM-supplied concrete tools/IDs; rollback survives invalid plan/tool failure. | `backend/src/engine/__tests__/scene-plan-validator.test.ts`; `backend/src/engine/__tests__/semantic-scene-plan-schema.test.ts`; `backend/src/routes/__tests__/chat.scene-plan.test.ts`. | Invalid GM target/tool fails closed and route restores the pre-turn snapshot. |
| P78-R6 | Legacy `intent`/`method` are compatibility fields only. | `backend/src/routes/__tests__/chat-turn-context.test.ts`; `frontend/app/game/__tests__/page.test.tsx`; `frontend/components/game/play-surface/__tests__/action-dock.test.tsx`. | Send and Continue still call the route with raw text mirror and empty method; no code consumes `intent`/`method` as product semantics in the GM-first path. |
| P78-R7 | Backend remains final world truth for state, time, resources, IDs, legal transitions, roll receipts, and persistence. | `backend/src/engine/__tests__/scene-plan-validator.test.ts`; `backend/src/engine/__tests__/scene-plan-executor.test.ts`; `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts`. | LLM-authored illegal time/stat/location/inventory changes are rejected or ignored unless represented as validated legal tools. |

## Acceptance Scenarios

1. Talking to an NPC resolves directly without Oracle unless the mocked GM/Judge decision requests uncertainty, deception, pressure, or resistance.
2. `I sniff around looking for the parfait shop` reaches GM/Judge with neutral candidates/evidence only. Backend does not string-match a target or movement outcome from the phrase.
3. `I hit Iru` lets GM/Judge choose hostile/combat framing and target from candidates. Backend builds combat math only after that concrete choice and validates it.
4. `Continue scene.` lets the scene breathe without creating a fake action category or automatic Oracle.
5. Broad-location actors remain background/sensed unless scene scope and visibility make them practically available.
6. Invalid GM-selected target/tool rolls back the turn boundary and does not persist partial world changes.
7. Clarification renders as a player-facing prompt through the existing backend `narrative` SSE event and frontend `parseTurnSSE` / `onNarrative` narration beat lane, then the normal `finalizing_turn`/`done` tail, without Oracle, `oracle_result`, `state_update`, `quick_actions`, tool execution, stale dice, or backend-invented action semantics.
8. NPC/internal consumers that legitimately use Oracle/combat helpers still work after player-turn neutralization.

## Automated Gates

Run after each relevant plan:

```bash
npm --prefix backend run test -- src/engine/__tests__/scene-frame.test.ts
npm --prefix backend run test -- src/engine/__tests__/gm-turn-decision.test.ts
npm --prefix backend run test -- src/engine/__tests__/turn-processor.scene-plan.test.ts
npm --prefix backend run test -- src/routes/__tests__/chat.scene-plan.test.ts
npm --prefix frontend run test -- app/game/__tests__/page.test.tsx components/game/play-surface/__tests__/action-dock.test.tsx
```

Final phase gate:

```bash
npm --prefix backend run test
npm --prefix backend run typecheck
npm --prefix frontend run test -- --run
npm --prefix frontend run lint
MCP: gitnexus_detect_changes({ scope: "all" })
```

Live play smoke:

```bash
# Start local backend/frontend, then use browser automation or PinchTab against /game.
# Record evidence for: speech no oracle_result; Continue no oracle_result; clarification narrative without stale dice; hostile action GM-first; invalid tool rollback.
```

## Static Negative Gates

These searches must not show Phase 78 GM-first path violations:

```bash
rg "isHostileCombatAction\\(|resolveOracleContext\\(|deriveCombatEnvelope\\(" backend/src/engine/turn-processor.ts backend/src/engine/scene-frame.ts
rg -n "Intent:|Method:" backend/src/engine backend/src/routes
rg "oracle_result" backend/src/engine/__tests__/turn-processor.scene-plan.test.ts backend/src/routes/__tests__/chat.scene-plan.test.ts
rg -P "\\b(Act|Speak|Observe)\\b" frontend/app/game frontend/components/game/play-surface backend/src/routes backend/src/engine
```

Allowed exceptions:

- `isHostileCombatAction` may remain for NPC or explicitly GM-selected combat helper paths, not as pre-GM raw player text authority.
- `oracle_result` may appear in tests that assert it is absent for no-roll turns or present only when GM/Judge requests a roll.
- `Act`, `Speak`, and `Observe` may appear only in unrelated historical docs/tests, not as required runtime command modes.
- `Intent:` and `Method:` may not appear in active GM/Oracle/ScenePlanner prompt builders for player-turn semantics.
- `playerAction` may appear only as raw GM input or transport/log context, not as a backend-derived target/hostility/category source.

## Source Coverage Audit

| Source | Item | Covered By |
|---|---|---|
| GOAL | GM-first orchestration over raw player text | 78-03, 78-04 |
| GOAL | Backend as deterministic rulebook/world-truth validator | 78-05 |
| REQ | P78-R1 | 78-01, 78-02, 78-04 |
| REQ | P78-R2 | 78-01, 78-02 |
| REQ | P78-R3 | 78-01, 78-03, 78-04 |
| REQ | P78-R4 | 78-01, 78-04, 78-06 |
| REQ | P78-R5 | 78-01, 78-05 |
| REQ | P78-R6 | 78-01, 78-06 |
| REQ | P78-R7 | 78-01, 78-05 |
| RESEARCH | Neutral SceneFrame, optional Oracle, ScenePlan validation/execution preservation | 78-02, 78-04, 78-05 |
| RESEARCH | Use `safeGenerateObject` structured-output seam | 78-03 |
| RESEARCH | Preserve rollback/SSE/finalization | 78-04, 78-05 |
| PATTERNS | Do not copy Marinara or add command modes | 78-03, 78-06 |
| CONTEXT | No backend target/hostility/action-category authority | 78-02, 78-04 |
| CONTEXT | Oracle on demand only | 78-04 |
| CONTEXT | Phase 77 `/game` intact | 78-06 |

No source item is intentionally omitted.

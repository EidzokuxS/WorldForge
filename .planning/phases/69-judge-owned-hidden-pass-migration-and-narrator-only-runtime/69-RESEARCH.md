# Phase 69: Judge-Owned Hidden Pass Migration and Narrator-Only Runtime - Research

**Researched:** 2026-04-20  
**Status:** GO  
**Research source:** Phase 68 implementation review, Claude Code, Gemini CLI, internet references, local runtime inspection

## Verdict

GO.

Phase 68 established the missing world-brain scene-direction seam, but the player turn runtime still contains a storyteller-owned hidden tool-driving loop. That means prose infrastructure is still deciding state mutations. Phase 69 can now complete the architectural split without changing routes, SSE contracts, DB schema, or opening-scene behavior.

## Current Architecture

### Normal player turn

1. Oracle resolves intent
2. world-brain emits bounded `sceneDirection`
3. storyteller hidden pass streams tool calls
4. backend assembles authoritative scene
5. storyteller final-visible pass narrates settled state

### Opening scene

1. world-brain emits bounded `sceneDirection`
2. backend assembles authoritative scene
3. storyteller final-visible pass narrates settled state

### Why this is still wrong

- the hidden player-turn pass still belongs to storyteller runtime
- the hidden pass still binds tools directly to the model
- the storyteller stack therefore still owns part of world mutation

## Recommended Implementation Shape

### 1. Replace hidden tool-driving with a structured judge plan

Recommended choice: **judge `safeGenerateObject` -> deterministic backend executor**

Shape:
- judge receives world state, action result, world-brain direction, and hidden-context sections
- judge returns bounded `AdjudicationPlan`
- backend executes `AdjudicationPlan.actions` in order

Why:
- deterministic mutation path
- testable artifact before execution
- no hidden prose leakage
- clean separation between adjudication and narration

### 2. Reuse tool input schemas instead of inventing a second contract family

Recommended choice: **export input schemas from `tool-schemas.ts` and build the adjudication action union from them**

Why:
- avoids schema drift between plan generation and actual executor expectations
- preserves the current tool executor as the single mutation boundary

### 3. Keep opening scenes out of scope

Recommended choice: **leave opening scenes unchanged in Phase 69**

Why:
- no player action exists there to adjudicate
- Phase 68 already fixed the opening-scene causality problem through world-brain + authoritative scene assembly
- expanding Phase 69 to openings adds no value and widens regression surface

### 4. Keep final narration on storyteller and remove tool ownership from that path

Recommended choice: **storyteller remains prose-only final pass**

Why:
- matches the user’s explicit architecture goal
- final narration already consumes authoritative scene assembly
- no tool bindings or hidden action planning are needed on the visible pass

### 5. Preserve route/SSE shape by replaying the same event semantics from deterministic execution

Recommended choice: **turn processor emits the same `state_update` / `quick_actions` events from executed plan actions**

Why:
- keeps frontend behavior stable
- limits the phase to runtime ownership migration instead of transport redesign

## Risks

### Risk 1: single-shot plan misses multi-step contingencies

Mitigation:
- keep ordered action list
- permit no-op / partial plans
- do not attempt branching v1

### Risk 2: adjudication plan schema drifts away from tool executor

Mitigation:
- build plan action union from exported tool input schemas
- do not duplicate per-tool field definitions in a second place

### Risk 3: losing hidden-pass parity breaks existing tests or quick-actions flow

Mitigation:
- preserve event mapping in `turn-processor.ts`
- keep `offer_quick_actions` as an explicit adjudication action
- add focused regression coverage before cutover

### Risk 4: invalid or partially failing plans create silent desync

Mitigation:
- bounded `rationale + actions` schema
- fail loud on plan parse failure
- stop execution on the first failed planned action instead of silently continuing

### Risk 5: accidental widening into NPC-agent or opening-path migration

Mitigation:
- scope player turn hidden pass only
- keep NPC agent and opening scene untouched in Phase 69

## Recommended Plan Split

### Plan 69-01
- define `AdjudicationPlan` contract and deterministic execution bridge
- export tool input schemas for plan reuse

### Plan 69-02
- replace player hidden storyteller tool-driving with judge plan generation plus backend execution
- preserve existing emitted turn events

### Plan 69-03
- add dedicated judge adjudication prompt builder
- keep storyteller final-visible only
- ensure opening scenes stay on Phase 68 path

### Plan 69-04
- observability, focused regressions, full backend verification, closeout artifacts

---

*Phase: 69-judge-owned-hidden-pass-migration-and-narrator-only-runtime*  
*Research completed: 2026-04-20*

# Phase 36: Gameplay docs-to-runtime reconciliation audit - Research

**Researched:** 2026-04-08
**Domain:** Gameplay specification reconciliation across docs, roadmap history, and live runtime
**Confidence:** HIGH

## Summary

This phase should not implement mechanics. It should produce an authoritative gameplay truth map by reconciling the entire `docs/` specification surface against the code that actually runs today.

The current codebase already has enough evidence to avoid a vague "research phase." The live gameplay route, prompt assembly, key-NPC scheduling, faction ticks, storyteller tools, character handoff, start-condition resolution, and canonical loadout derivation are all real. The real gaps are different: reflection/progression likely does not self-trigger, post-turn simulation is not atomically part of the visible turn contract, rollback/checkpoint fidelity is incomplete, inventory/equipment authority is split, and the rich character ontology is only partially consumed by runtime mechanics.

That means the correct shape of Phase 36 is:
1. build a normalized claim register from `docs/`,
2. classify each claim against runtime evidence,
3. convert the result into an execution-grade handoff for the next milestone.

## Primary Inputs

### Spec / design intent
- `docs/concept.md`
- `docs/mechanics.md`
- `docs/memory.md`
- `docs/plans/2026-03-05-research-agent.md`
- `docs/plans/2026-03-06-player-character-creation.md`

### Historical promises and closeout artifacts
- `.planning/ROADMAP.md`
- `.planning/PROJECT.md`
- `.planning/v1.0-v1.0-MILESTONE-AUDIT.md`
- `.planning/v1.0-MILESTONE-CLOSEOUT-CHECKLIST.md`

### Current runtime evidence
- `backend/src/routes/chat.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/prompt-assembler.ts`
- `backend/src/engine/oracle.ts`
- `backend/src/engine/tool-executor.ts`
- `backend/src/engine/npc-agent.ts`
- `backend/src/engine/npc-offscreen.ts`
- `backend/src/engine/reflection-agent.ts`
- `backend/src/engine/world-engine.ts`
- `backend/src/engine/faction-tools.ts`
- `backend/src/engine/state-snapshot.ts`
- `backend/src/campaign/checkpoints.ts`
- `backend/src/routes/character.ts`
- `backend/src/character/record-adapters.ts`
- `backend/src/character/runtime-tags.ts`
- `backend/src/vectors/episodic-events.ts`
- `frontend/app/game/page.tsx`

## Existing Findings That Should Be Reused

### Confirmed live
- core turn runtime via `/api/chat/action`
- prompt assembly with lore, memory, relationships, world state, and start-condition context
- key-NPC present/off-screen hooks
- faction macro-sim
- tool-driven state mutation
- character save -> `/game` handoff
- start-condition resolution and canonical loadout derivation

### Confirmed partial / fragile
- post-turn sim outside the visible atomic turn loop
- undo/retry not trustworthy for whole-world changes
- checkpoints omit `config.json`
- inventory/equipment source of truth is ambiguous
- active-session coupling still exists in gameplay routes
- runtime mainly consumes flattened tags despite richer ontology

### Confirmed likely inert / underwired
- reflection trigger loop via `unprocessedImportance`
- Oracle `targetTags`
- `inactiveTicks`
- stronger NPC information-flow model implied by docs

## Recommended Phase Shape

### Plan 36-01: Claim register
Extract all gameplay-relevant claims from docs into one canonical register with provenance, subsystem grouping, and normalized language.

### Plan 36-02: Runtime classification matrix
Map the register to runtime code and classify each claim as implemented/wired, partial, missing, or outdated.

### Plan 36-03: Next-milestone handoff
Translate the matrix into:
- authoritative gameplay baseline
- explicit deprecation list
- prioritized next-milestone scope
- integrity/seam blockers that must be solved first

## What This Phase Must Avoid

- No fake completeness based on old roadmap claims alone
- No hand-wavy "seems implemented" statements without code evidence
- No mixing new feature ideation into the reconciliation deliverables
- No rewriting docs during the audit except where needed to mark something deprecated/outdated in the output artifacts

## Deliverable Standard

The phase output should let the next milestone start with zero ambiguity about:
- what gameplay behavior is truly live,
- what behavior only exists on paper,
- what behavior exists architecturally but is operationally dead,
- and which mismatches are user-visible enough to be first-class milestone scope.

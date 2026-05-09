# Phase 66: Combat Envelope and Oracle Context - Research

**Researched:** 2026-04-19
**Status:** GO
**Research source:** local code inspection, external Claude/Gemini consultation, explorer-agent synthesis

## Verdict

GO. The codebase already has the pieces needed for a narrow engine-side integration:

- structured `PowerStats`
- deterministic tier/bypass helpers
- a single authoritative Oracle seam for player actions
- a parallel Oracle seam for NPC hostile actions
- strong observability and engine test coverage

The clean implementation path is to add a **backend-owned, ephemeral `CombatEnvelope`** and thread it into Oracle adjudication only. Storyteller and NPC posture consumers should wait for Phase 67.

## Current Architecture

### Player hostile-action flow

1. `/api/chat/action` enters at `backend/src/routes/chat.ts`
2. `processTurn(...)` in `backend/src/engine/turn-processor.ts`
3. `resolveActionTargetContext(...)` in `backend/src/engine/target-context.ts`
4. `callOracle(...)` in `backend/src/engine/oracle.ts`
5. hidden storyteller/tool pass
6. present-scene NPC settlement
7. final visible storyteller pass

### NPC hostile-action flow

1. present NPCs settle through `tickNpcAgentInternal(...)`
2. `createNpcAgentTools(...).act.execute(...)` in `backend/src/engine/npc-tools.ts`
3. builds `OraclePayload`
4. calls `callOracle(...)`

### Important asymmetry today

- Player path resolves a concrete target before Oracle.
- NPC `act` path still sends weak target context and currently misses combat-aware target data.

## What Already Exists

### Relevant reusable assets

- `compareCharacterPower(...)` in `backend/src/engine/grounded-lookup.ts`
- `canHaxBypass(...)` and tier helpers in `shared/src/power-tiers.ts`
- `PowerStats` types in `shared/src/types.ts`
- bounded engine observability pattern from Phase 58

### What is missing

- No turn-scoped matchup artifact between actor and target
- No Oracle contract for power-aware adjudication
- No target-context surface for target-side combat data
- No NPC hostile-action reuse of the same combat comparison seam

## Recommended Implementation Shape

### 1. Add a pure backend-local `CombatEnvelope` helper

Recommended file:
- `backend/src/engine/combat-envelope.ts`

Properties:
- pure, deterministic, no LLM calls
- backend-local for Phase 66
- ephemeral per action, not persisted
- does not modify runtime tags

Recommended v1 envelope contents:
- `matchup`
- `apVsDurability`
- `speed`
- optional `intelligence`
- `actorBypassesTarget`
- `relevantTargetVulnerabilities`
- `summaryLines`

The envelope must stay **qualitative**, not numeric combat math.

### 2. Compute envelope only at narrow hostile-action seams

#### Player path
- after target resolution in `backend/src/engine/turn-processor.ts`
- before `callOracle(...)`

#### NPC path
- inside `backend/src/engine/npc-tools.ts` `act.execute`
- reuse target resolution instead of inventing an NPC-only target parser

### 3. Extend target context additively

Recommended:
- `backend/src/engine/target-context.ts` returns optional target-side combat data for character targets
- keep new fields optional to avoid breaking existing mocks and non-character target flows

Minimal target-side data to surface:
- `targetPowerStats`
- enough identity/typing to know whether envelope is valid

### 4. Extend Oracle contract additively

Recommended:
- add optional `combatEnvelope?: CombatEnvelope` to `OraclePayload`
- extend `buildOraclePrompt(...)` with compact envelope block
- add one bounded clamp rule for obvious `no bypass + large AP-vs-durability gap`
- absence of envelope preserves current behavior exactly

## Explicit Non-Recommendations

### Do not put this into runtime tags

Rejected:
- adding AP/speed/durability tier tags to `deriveRuntimeCharacterTags(...)`

Why:
- runtime tags are broad compatibility shorthand used across many consumers
- power semantics would be flattened into strings
- blast radius would expand across prompt assembly, reflection, and compatibility surfaces

### Do not touch storyteller in Phase 66

Rejected for this phase:
- prompt-assembler envelope sections
- narrative ceilings/floors
- storyteller hard guards based on envelope

Why:
- mixes mechanics and narration in one phase
- makes verification ambiguous
- cleanly belongs to Phase 67

### Do not persist posture or envelope state

Rejected:
- schema additions
- DB persistence
- durable NPC tactical state

Why:
- widens scope too early
- adds adapter/schema/storage risk before the envelope contract is stable

## Risks

### Risk 1: required target-context fields break existing tests

Mitigation:
- additive optional fields only

### Risk 2: envelope computed for non-combat actions distorts Oracle odds

Mitigation:
- gate envelope creation to hostile/combat-relevant targeted actions only

### Risk 3: duplicated target logic between player and NPC flows

Mitigation:
- reuse `resolveActionTargetContext(...)` or a shared helper called by both seams

### Risk 4: raw `powerStats` logging bloats observability

Mitigation:
- log compact envelope summaries only

## Recommended Plan Decomposition

### Plan 66-01
- contract + builder
- `combat-envelope.ts`
- hostile-action gating
- pure unit tests

### Plan 66-02
- target-context additive enrichment
- player-path envelope computation in `turn-processor.ts`
- observability hook

### Plan 66-03
- NPC hostile-action reuse in `npc-tools.ts`
- Oracle payload/prompt support
- no-bypass clamp tests

### Plan 66-04
- verification gate
- engine regression sweep
- roadmap/requirements closeout artifacts

## Phase Boundary Recommendation

### Phase 66
Define and compute `CombatEnvelope`, surface it to Oracle/Judge, and make adjudication power-aware without changing storyteller or runtime-tags.

### Phase 67
Consume the same envelope in storyteller and NPC behavior to enforce narrative ceilings/floors and combat posture.

---

*Phase: 66-combat-envelope-and-oracle-context*
*Research completed: 2026-04-19*

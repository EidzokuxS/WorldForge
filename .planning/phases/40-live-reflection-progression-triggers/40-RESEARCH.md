# Phase 40: Live Reflection & Progression Triggers - Research

**Researched:** 2026-04-09
**Domain:** Runtime reflection triggering, NPC state mutation, and post-turn simulation wiring
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Reflection Signal Source
- **D-01:** Reflection trigger accumulation must come from live runtime event flow, not from manual repair scripts, dev-only tooling, or one-off backfills.
- **D-02:** The signal source should piggyback on already-committed episodic events and post-turn simulation outputs instead of inventing a second parallel event pipeline just for reflection.
- **D-03:** Phase 40 should make normal gameplay, NPC actions, and off-screen NPC updates capable of contributing reflection signal when they create meaningful events involving a given NPC.

### Cadence And Threshold Semantics
- **D-04:** Reflection should become reachable through ordinary short arcs of notable interaction, not only through rare dramatic spikes and not through trivial every-turn noise.
- **D-05:** “Live” for this phase means a player can realistically trigger reflection by repeatedly dealing with the same NPC across normal play, without admin intervention or bespoke testing hooks.
- **D-06:** Reflection/progression should not be tuned around target frequency as a product goal. It should fire when the accumulated evidence makes sense in-world. Exact numeric thresholds, weighting, and accumulation math stay flexible for planning and implementation.

### Consequence Priority
- **D-07:** The first-class reflection outcomes for Phase 40 are belief changes, goal changes, and relationship drift, because those are the most legible downstream behavior drivers.
- **D-08:** Wealth-tier and skill-tier progression remain in scope, but they are secondary outcomes and should require materially stronger evidence than ordinary belief/goal/relationship updates.
- **D-09:** Phase 40 must favor durable structured-state changes that later prompts and runtime systems can consume, not one-off flavor text or debug-only counters.

### Player-Facing Visibility
- **D-10:** Reflection should be primarily visible through changed NPC behavior, changed goals, changed relationships, and changed follow-up scene consequences rather than through loud meta-system popups.
- **D-11:** A secondary low-prominence inspection/debug surface is acceptable from a character/NPC card via an extra modal or drill-down, but it must remain subordinate to diegetic gameplay signaling.
- **D-12:** Reflection/progression must happen inside the normal gameplay loop established by Phase 39, so players observe its consequences through standard turn flow rather than through manual repair steps or offline scripts.

### Scope Guardrails
- **D-13:** Phase 40 should make reflection operational before trying to make it “smart.” Reliability of triggering outranks prompt polish or balancing.
- **D-14:** This phase should not reopen checkpoint fidelity, route transport, or inventory authority except where existing contracts are directly required to make reflection visible in normal play.
- **D-15:** Player-character progression systems beyond the already documented tag-tier model are out of scope; Phase 40 is about NPC reflection/progression becoming live first.

### Claude's Discretion
- Exact accumulation algorithm from committed events to `unprocessedImportance`
- Exact threshold value after live runtime wiring exists
- Exact shape of the low-prominence debug/inspection surface
- Exact evidence rules for when wealth/skill upgrades are strong enough to fire

### Deferred Ideas (OUT OF SCOPE)
- Richer explicit UI surfacing for reflection/progression outcomes if later testing shows the diegetic-only signal is too subtle.
- A formal NPC/world knowledge-propagation model beyond current prompt-context inference.
- Broader player-character progression redesigns or XP-like systems.
- Checkpoint/restart durability for reflection-related state beyond the current Phase 41 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SIMF-01 | Reflection trigger accumulation occurs in live runtime so NPC beliefs, goals, relationship drift, and progression can actually fire under normal play. | Wire accumulation onto committed episodic-event writers, keep triggering in the Phase 39 post-turn boundary, reuse existing reflection tools for structured NPC mutations, and add end-to-end tests that prove ordinary play can cross the threshold. |
</phase_requirements>

## Summary

Phase 40 is mostly a runtime-wiring phase, not a new systems phase. The project already has a working reflection executor, reflection mutation tools, episodic-event storage, and a rollback-critical post-turn hook that invokes reflection before the turn is considered complete. What is missing is the live accumulation seam: committed gameplay events are stored in episodic memory, but they do not currently increment `npcs.unprocessedImportance`, so the reflection threshold is rarely or never reached in ordinary play.

The lowest-risk implementation is to add one campaign-scoped accumulation helper and call it from every authoritative episodic-event write path that already exists in normal play: Storyteller `log_event`, present-NPC event generation, and off-screen NPC updates. That satisfies the locked decision to piggyback on committed events, keeps reflection inside the honest turn boundary added in Phase 39, and avoids inventing a second replay or analytics pipeline.

Downstream visibility already exists. Prompt assembly includes beliefs, goals, and relationships in the NPC state context, and reflection tools already persist those fields structurally. If Phase 40 makes the trigger live, later turns can surface the result through changed NPC behavior with no large new UI. A tiny debug surface can be added later or optionally in-phase by reusing the existing world/NPC data route.

**Primary recommendation:** Implement immediate `unprocessedImportance` accumulation on committed episodic-event writes, keep reflection execution in the existing post-turn finalization path, and prioritize belief/goal/relationship outcomes over wealth/skill upgrades.

## Project Constraints (from CLAUDE.md)

- TypeScript strict mode and ES modules.
- Use Drizzle query builder, not raw SQL.
- Use Zod schemas for all AI tool definitions and API payloads.
- Prefer `ai` SDK functions over raw LLM fetch calls.
- Route handlers should use outer `try/catch`, `parseBody()`, and `getErrorStatus(error)`.
- Shared types and constants belong in `@worldforge/shared`.
- SQLite is the source of truth; LanceDB is semantic memory only.
- LLMs do not modify game state directly; all state changes go through validated tools and engine code.
- User-facing responses in this repo are expected in Russian, but planner artifacts can stay English.

## Standard Stack

No new dependency is required for Phase 40. Use the existing backend stack and runtime contracts already in the repo.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | repo `^0.45.1`; latest verified `0.45.2` (2026-03-27) | Campaign-scoped SQLite reads/writes for NPC state | Reflection budgets and structured NPC mutations should stay in authoritative SQLite state. |
| `better-sqlite3` | repo `^12.6.2` | SQLite driver under Drizzle | Existing campaign state path already depends on it; no new persistence layer is justified. |
| `@lancedb/lancedb` | repo `^0.26.2`; latest verified `0.27.2` (2026-03-31) | Episodic event storage and retrieval for reflection evidence | Reflection retrieval already depends on episodic memory; Phase 40 should reuse it rather than replace it. |
| `ai` | repo `^6.0.106`; latest verified `6.0.154` (2026-04-08) | Judge-driven reflection call execution | Existing reflection agent already uses the project’s standard AI layer. |
| `zod` | repo `^4.3.6`; latest verified `4.3.6` (2026-01-22) | Tool schema validation | Reflection and storyteller tool contracts already rely on validated structured inputs. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `hono` | repo `^4.12.3`; latest verified `4.12.12` (2026-04-07) | Route-level turn orchestration | Use the existing `/api/chat` post-turn flow; do not create a parallel runtime entrypoint. |
| `vitest` | repo `^3.2.4`; latest verified `4.1.3` (2026-04-07) | Unit and integration coverage for trigger wiring | Use targeted backend tests to prove ordinary play now accumulates and triggers reflection. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Accumulation on committed event writes | Post-turn replay scan over episodic memory | Replay is less reliable, adds duplicate logic, and fights the phase’s locked decision to piggyback on existing committed events. |
| Existing reflection tools and prompt visibility | New reflection-specific UI and state model | Extra UI does not solve the inert trigger seam and would increase scope without improving reliability. |
| Existing SQLite + LanceDB split | New analytics/progression store | Adds migration and coherence risk for no phase-level benefit. |

**Installation:**
```bash
# No new packages required for Phase 40.
```

**Version verification:** Verified against the npm registry on 2026-04-09 with `npm view <package> version` and `npm view <package> time --json`.

## Architecture Patterns

### Recommended Project Structure
```text
backend/src/engine/
├── reflection-agent.ts        # Existing threshold check + execution
├── reflection-tools.ts        # Existing belief/goal/relationship/progression mutations
├── reflection-budget.ts       # New helper: participant resolution + budget accumulation
├── tool-executor.ts           # Storyteller log_event writes
├── npc-tools.ts               # Present NPC event writes
└── npc-offscreen.ts           # Off-screen NPC event writes
backend/src/routes/
└── chat.ts                    # Existing honest post-turn finalization
backend/src/engine/__tests__/
├── tool-executor.test.ts
├── npc-agent.test.ts
├── npc-offscreen.test.ts
└── reflection-agent.test.ts
```

### Pattern 1: Accumulate On Authoritative Event Writes
**What:** Every committed episodic-event write that involves NPC participants should immediately increment those NPCs’ `unprocessedImportance` in SQLite.
**When to use:** Any runtime path that already writes an episodic event during normal play.
**Example:**
```typescript
// Source: local runtime pattern derived from tool-executor.ts, npc-tools.ts, npc-offscreen.ts
await storeEpisodicEvent(campaignId, event);
await accumulateReflectionBudgetForParticipants(db, campaignId, event);
```

### Pattern 2: Resolve Participants To NPC Rows Before Mutating Budgets
**What:** Event payloads often carry participant names, not NPC IDs. Resolve those names against campaign NPC rows before applying increments.
**When to use:** Storyteller `log_event` and any path where participants arrive as strings.
**Example:**
```typescript
// Source: recommended Phase 40 seam based on current event payload shapes
const participants = await findNpcParticipantsByName(db, campaignId, event.participants);
for (const npc of participants) {
  await incrementUnprocessedImportance(db, npc.id, event.importance);
}
```

### Pattern 3: Let Structured NPC State Drive Visibility
**What:** Reflection should update beliefs, goals, and relationships, then rely on prompt assembly and later turns to surface the consequences.
**When to use:** All reflection outcomes except optional low-prominence inspection UX.
**Example:**
```typescript
// Source: reflection-tools.ts + prompt-assembler.ts
await setBelief(...);
await setGoal(...);
await setRelationship(...);
// Later turns pick this up through NPC state in prompt assembly.
```

### Anti-Patterns to Avoid
- **Replay-based accumulation:** Scanning LanceDB after the turn to infer budgets duplicates logic and weakens rollback/retry behavior.
- **Debug-only counters:** Phase 40 needs durable structured NPC state changes, not telemetry that never affects play.
- **UI-first implementation:** Loud popups or new meta panels do not solve the core inert-runtime problem.
- **Threshold-only tuning without wiring:** Lowering the threshold will not help if normal event flow still never increments `unprocessedImportance`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reflection execution | A new reflection agent or second LLM pipeline | `backend/src/engine/reflection-agent.ts` | The executor, evidence retrieval, and reset semantics already exist. |
| NPC state mutation | Ad hoc JSON blobs or free-form prompt-only output | `backend/src/engine/reflection-tools.ts` | These tools already persist structured beliefs, goals, relationships, wealth, and skills. |
| Player visibility | New progression UI framework | Existing prompt assembly + world/NPC data route | The current runtime already exposes beliefs/goals/relationships to later turns and inspector surfaces. |
| Event evidence storage | New event journal or analytics queue | `backend/src/vectors/episodic-events.ts` | Importance-tagged episodic memory already exists and is what reflection retrieval uses. |

**Key insight:** The missing piece is not “reflection intelligence.” It is the live budget increment on authoritative runtime writes.

## Common Pitfalls

### Pitfall 1: Double-Counting The Same Event
**What goes wrong:** A single event increments `unprocessedImportance` more than once because accumulation happens in both the writer and a later replay/finalization pass.
**Why it happens:** Multiple layers try to “help” reflection become live.
**How to avoid:** Put accumulation in the committed write path once and keep later reflection logic read-only except for the post-reflection reset.
**Warning signs:** Threshold crossings that happen too quickly or differ between retries and clean runs.

### Pitfall 2: Resolving The Wrong Participants
**What goes wrong:** Player names, duplicate names, or non-NPC participants receive budget updates or block valid updates.
**Why it happens:** Story events carry participant names, not stable IDs.
**How to avoid:** Scope resolution by `campaignId`, update only rows in `npcs`, and ignore unmatched participants rather than creating shadow state.
**Warning signs:** Reflection firing for the wrong NPC or never firing for NPCs involved in obvious scenes.

### Pitfall 3: Making Wealth/Skill Upgrades Too Easy
**What goes wrong:** Ordinary social scenes produce wealth-tier or skill-tier jumps that feel arbitrary.
**Why it happens:** All outcomes use the same evidence threshold.
**How to avoid:** Keep belief/goal/relationship updates as the default outcome and require materially stronger evidence before calling `upgrade_wealth` or `upgrade_skill`.
**Warning signs:** Tier upgrades appearing after generic dialogue without a concrete causal event.

### Pitfall 4: Breaking Honest Turn Semantics
**What goes wrong:** Reflection state is written after the turn is presented as done, or only partially participates in rollback/retry behavior.
**Why it happens:** Accumulation or trigger execution is moved outside the Phase 39 completion boundary.
**How to avoid:** Keep all accumulation writes and trigger checks inside the existing rollback-critical `/api/chat` finalization flow.
**Warning signs:** NPC state differs between retries, or reflection effects appear one turn “late.”

## Code Examples

Verified patterns from current local sources:

### Trigger Check Already Exists
```typescript
// Source: backend/src/engine/reflection-agent.ts
const REFLECTION_THRESHOLD = 10;

export async function checkAndTriggerReflections(campaignId: string) {
  const db = getCampaignDb(campaignId);
  const eligible = db
    .select()
    .from(npcs)
    .where(gte(npcs.unprocessedImportance, REFLECTION_THRESHOLD))
    .all();
  // ...
}
```

### Post-Turn Hook Already Invokes Reflection
```typescript
// Source: backend/src/routes/chat.ts
await processPendingNpcTurns(campaignId);
await runOffscreenNpcUpdates(campaignId);
await updateFactions(campaignId);
await checkAndTriggerReflections(campaignId);
```

### Story Events Already Carry Importance And Participants
```typescript
// Source: backend/src/engine/tool-executor.ts
await storeEpisodicEvent(campaignId, {
  summary: args.summary,
  participants: args.participants,
  importance: args.importance,
  locationId: args.locationId ?? undefined,
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Reflection described in docs and tested in isolation | Reflection executor is live, but runtime accumulation is still missing | Verified in repo on 2026-04-09 | Phase 40 should wire the trigger seam, not redesign the system. |
| Reflection treated as an eventually-consistent background concern | Reflection now runs inside rollback-critical post-turn finalization | Phase 39 | Phase 40 can safely rely on honest turn completion semantics. |
| Threshold documented around `>= 15` in older docs | Runtime currently checks `>= 10` in code | Existing code as of 2026-04-09 | Plan around a tunable threshold, not the old doc number. |

**Deprecated/outdated:**
- Docs-only trigger assumptions: the runtime matrix from Phase 36 already identified trigger viability as missing, so planning should treat documentation alone as stale evidence.

## Open Questions

1. **What exact accumulation formula should Phase 40 use?**
   - What we know: Every committed event already has an `importance` value, and reliability matters more than “smartness.”
   - What's unclear: Whether to use raw importance, a capped weight, participant-role weighting, or per-source modifiers.
   - Recommendation: Start with raw importance added once per participating NPC, then tune only if tests or playtest evidence show obvious over/under-triggering.

2. **Should Phase 40 ship the optional inspection surface now or leave it dormant?**
   - What we know: Diegetic behavior change is the primary visibility goal, and a low-prominence debug surface is allowed.
   - What's unclear: Whether planner should allocate UI work inside this phase or keep it backend-only.
   - Recommendation: Treat the inspection surface as optional and subordinate. Backend should expose enough data so it can be added cheaply, but do not let UI work block trigger wiring.

3. **How strict should progression evidence be for wealth/skill upgrades?**
   - What we know: Wealth and skill are in scope but secondary to belief/goal/relationship drift.
   - What's unclear: The exact evidence threshold or event patterns that justify an upgrade.
   - Recommendation: Gate these behind stronger conditions than ordinary social or narrative events and prefer “no upgrade” over noisy upgrades in the first live version.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend runtime and tests | ✓ | `v23.11.0` | — |
| npm | Package scripts and targeted verification | ✓ | `11.12.1` | — |
| Vitest | Automated verification for Phase 40 | ✓ | local `3.2.4` | `npm --prefix backend test` uses the same runner |

**Missing dependencies with no fallback:**
- None.

**Missing dependencies with fallback:**
- None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `3.2.4` |
| Config file | `vitest.config.ts` |
| Quick run command | `npm --prefix backend exec vitest run src/engine/__tests__/reflection-agent.test.ts src/engine/__tests__/reflection-progression.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/npc-offscreen.test.ts src/routes/__tests__/chat.test.ts` |
| Full suite command | `npm --prefix backend test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SIMF-01 | Story `log_event` increments `unprocessedImportance` for participating NPCs | unit | `npm --prefix backend exec vitest run src/engine/__tests__/tool-executor.test.ts -t "accumulates reflection budget"` | ❌ Wave 0 |
| SIMF-01 | Present-NPC action/dialogue events increment `unprocessedImportance` | integration | `npm --prefix backend exec vitest run src/engine/__tests__/npc-agent.test.ts -t "increments reflection budget"` | ❌ Wave 0 |
| SIMF-01 | Off-screen NPC updates increment `unprocessedImportance` | integration | `npm --prefix backend exec vitest run src/engine/__tests__/npc-offscreen.test.ts -t "increments reflection budget"` | ❌ Wave 0 |
| SIMF-01 | Crossing the threshold during ordinary play triggers reflection before turn completion | integration | `npm --prefix backend exec vitest run src/routes/__tests__/chat.test.ts -t "triggers reflection during post-turn finalization"` | ❌ Wave 0 |
| SIMF-01 | Reflection changes later NPC-visible state (beliefs/goals/relationships) | unit/integration | `npm --prefix backend exec vitest run src/engine/__tests__/reflection-agent.test.ts -t "persists structured state changes"` | ✅ |

### Sampling Rate
- **Per task commit:** Run the targeted Phase 40 backend Vitest command above.
- **Per wave merge:** `npm --prefix backend test`
- **Phase gate:** Full backend suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/engine/__tests__/tool-executor.test.ts` needs a case that asserts `log_event` increments the correct NPC rows.
- [ ] `backend/src/engine/__tests__/npc-agent.test.ts` needs a case that present-NPC actions or speech increment reflection budgets.
- [ ] `backend/src/engine/__tests__/npc-offscreen.test.ts` needs a case that off-screen updates increment reflection budgets.
- [ ] `backend/src/routes/__tests__/chat.test.ts` needs an end-to-end case that ordinary play can cross the threshold and trigger reflection inside post-turn finalization.
- [ ] Optional: add a tiny helper-level test for participant name resolution to avoid regressions around player-vs-NPC names.

## Sources

### Primary (HIGH confidence)
- Local source: `backend/src/engine/reflection-agent.ts` - threshold check, NPC qualification, reflection execution, budget reset.
- Local source: `backend/src/engine/reflection-tools.ts` - structured belief/goal/relationship/wealth/skill mutations.
- Local source: `backend/src/engine/tool-executor.ts` - authoritative `log_event` write path and current missing accumulation seam.
- Local source: `backend/src/engine/npc-tools.ts` - present-NPC event writes.
- Local source: `backend/src/engine/npc-offscreen.ts` - off-screen event writes.
- Local source: `backend/src/routes/chat.ts` - rollback-critical post-turn finalization order.
- Local source: `backend/src/vectors/episodic-events.ts` - episodic memory write and retrieval contract.
- Local tests: `backend/src/engine/__tests__/reflection-agent.test.ts`, `backend/src/engine/__tests__/reflection-progression.test.ts`, `backend/src/engine/__tests__/tool-executor.test.ts`, `backend/src/engine/__tests__/npc-agent.test.ts`, `backend/src/engine/__tests__/npc-offscreen.test.ts`, `backend/src/routes/__tests__/chat.test.ts`.
- Planning artifacts: `.planning/phases/40-live-reflection-progression-triggers/40-CONTEXT.md`, `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-RUNTIME-MATRIX.md`, `.planning/phases/39-honest-turn-boundary-retry-undo/39-VERIFICATION.md`.
- npm registry via CLI on 2026-04-09: `npm view ai`, `npm view drizzle-orm`, `npm view @lancedb/lancedb`, `npm view hono`, `npm view zod`, `npm view vitest`.

### Secondary (MEDIUM confidence)
- `docs/mechanics.md` - historical intended reflection/progression behavior and visibility model.
- `docs/memory.md` - episodic memory, importance scoring, and prompt-assembly framing.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Phase 40 can stay on the existing backend stack with no new dependency or platform decision.
- Architecture: HIGH - The missing seam is directly visible in local runtime code, and the correct insertion points are explicit.
- Pitfalls: HIGH - The main failure modes are concrete consequences of current event shapes, rollback boundaries, and threshold semantics.

**Research date:** 2026-04-09
**Valid until:** 2026-05-09

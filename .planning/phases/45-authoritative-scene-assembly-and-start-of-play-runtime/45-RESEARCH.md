# Phase 45: Authoritative Scene Assembly & Start-of-Play Runtime - Research

**Researched:** 2026-04-12
**Domain:** Turn-output assembly, opening-scene grounding, duplicate-output suppression, and runtime scene authority
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md / discussion)

### Locked Decisions

- **D-01:** Player-visible turn narration must happen after the player action and all locally relevant scene changes are settled.
- **D-02:** The first playable text must come from runtime opening state (`startLocation`, `immediateSituation`, `entryPressure`, visible actors/events), not from a raw premise dump.
- **D-03:** Narration is bounded by player-perceivable consequences, not merely same-location happenings and not arbitrary off-screen state.
- **D-04:** Storyteller output should be assembled from authoritative simulation output, not free invention of material world events.
- **D-05:** Present-scene and off-screen simulation remain one causal world; they differ only in depth and player perception, not in ontology.

### Deferred To Later Phases

- Full encounter-scope reform for macro locations and sublocations belongs to Phase 46.
- Prompt-quality / anti-slop writing overhaul belongs to Phase 47.
- Rich text, typography, and readability belong to Phase 50.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCEN-01 | Player-visible turn text is a single-pass scene assembled from authoritative runtime state, without repeated output blocks or raw-premise opening dumps. | Split hidden tool-driving resolution from final visible narration, move local-scene settlement ahead of final narration, and stop frontend from rendering premise as the opening scene. |
</phase_requirements>

## Summary

Phase 45 is not a prompt-tuning phase. It is a runtime sequencing phase.

The current turn pipeline in [`turn-processor.ts`](R:\Projects\WorldForge\backend\src\engine\turn-processor.ts) streams user-visible `text-delta` chunks from the same Storyteller pass that is still issuing tools. That means the user can see narration before:

- tool-driven state mutations have fully landed
- present-scene NPC reactions have been simulated
- same-turn player-perceivable consequences have been assembled

Separately, the frontend in [`narrative-log.tsx`](R:\Projects\WorldForge\frontend\components\game\narrative-log.tsx) renders `premise` directly when there are no messages, which creates the exact “premise as opening message” behavior the user rejected.

The lowest-risk architecture is a two-stage storyteller model:

1. **Hidden action-resolution pass**
   - Oracle already decides the mechanical outcome.
   - A hidden Storyteller/tool pass applies player-driven tools and yields state updates, but does not stream prose to the user.

2. **Authoritative scene settlement**
   - Local same-turn scene effects are gathered after tool execution.
   - Present NPCs at the player location react before the final message.
   - Player-perceivable consequences are derived from committed same-turn events rather than invented later.

3. **Final visible narration pass**
   - A second, narrative-only pass writes the player-visible message from authoritative settled state.
   - This is the only text the player sees and the only assistant message persisted for that turn.

This directly fixes all Phase 45 seams:

- no premise dump as opening surface
- no text racing ahead of local state
- one visible narration pass
- duplicate/restarted visible narration no longer rides on the tool-driving stream

## Live Runtime Findings

### 1. Current turn narration races ahead of state settlement

[`turn-processor.ts`](R:\Projects\WorldForge\backend\src\engine\turn-processor.ts) currently:

- calls `streamText(...)` once with tools enabled
- forwards `text-delta` directly as `narrative`
- only later persists the assistant message
- only after that runs `onPostTurn`

That means the visible scene is authored before rollback-critical scene consequences outside the initial tool call are fully settled.

### 2. Present-scene NPCs are post-turn, not pre-narration

[`chat.ts`](R:\Projects\WorldForge\backend\src\routes\chat.ts) runs:

- `tickPresentNpcs(...)`
- `simulateOffscreenNpcs(...)`
- `checkAndTriggerReflections(...)`
- `tickFactions(...)`

inside `runRollbackCriticalPostTurn(...)`, after the visible narration has already been produced. This is incompatible with D-01 for any NPC reactions that should affect the current scene text.

### 3. Frontend prints premise as opening text

[`narrative-log.tsx`](R:\Projects\WorldForge\frontend\components\game\narrative-log.tsx) shows:

```tsx
{premise || "Begin your adventure..."}
```

when `messages.length === 0`.

This is a direct Phase 45 violation and must be removed from the live opening surface.

### 4. The repo already has the right raw materials

The repo already contains the pieces needed for a cleaner scene-assembly contract:

- opening-state derivation in [`start-condition-runtime.ts`](R:\Projects\WorldForge\backend\src\engine\start-condition-runtime.ts)
- location-local recent happenings in [`location-events.ts`](R:\Projects\WorldForge\backend\src\engine\location-events.ts)
- same-turn committed event queue in [`episodic-events.ts`](R:\Projects\WorldForge\backend\src\vectors\episodic-events.ts)
- target-aware Oracle from Phase 42
- honest turn/finalization boundaries from Phase 39

So the work is primarily orchestration and contract reshaping, not greenfield system invention.

## Recommended Architecture

### Pattern 1: Hidden tool-driving storyteller pass

Use the existing Storyteller/tool seam to perform tool execution, but do not expose its prose to the user.

The visible narrative should come from a second pass after state settles.

### Pattern 2: Explicit same-turn scene-effects assembly

Build a small authoritative scene-effects payload from:

- player-driven state updates
- locally committed same-turn events
- present NPC reactions
- location changes / scene transitions
- immediate perceivable spillover

This should be a structured runtime input to the final narration pass, not something the final narrator has to hallucinate.

### Pattern 3: Split local scene settlement from global post-turn finalization

Phase 45 should distinguish:

- **pre-narration local settlement**: current-scene visible consequences
- **post-narration rollback-critical finalization**: off-screen NPCs, reflections, factions, auxiliary world work that should affect future state but not necessarily the current visible scene

This keeps the causal world unified while still honoring the player-perception boundary.

### Pattern 4: Frontend opening surface stays neutral until runtime text exists

If there is no assistant message yet, `/game` should show neutral waiting copy or a loading/opening-state message, not the campaign premise as if it were narration.

## Proposed Project Structure

```text
backend/src/engine/
├── turn-processor.ts
├── scene-assembly.ts           # new: build player-visible settled scene facts/effects
├── storyteller-contract.ts
├── npc-agent.ts
└── start-condition-runtime.ts

backend/src/routes/
└── chat.ts

frontend/components/game/
├── narrative-log.tsx
└── __tests__/narrative-log.test.tsx

frontend/app/game/
└── __tests__/page.test.tsx
```

## Anti-Patterns To Avoid

- **Prompt-only fix:** Telling the model “don’t repeat yourself” is not enough when the runtime still streams text from the tool-driving pass.
- **Premise-as-fallback UI:** Any frontend fallback that prints premise text before runtime scene output recreates the bug even if backend improves.
- **Second fake world branch:** The final narrator cannot invent scene facts that bypass authoritative state or locally committed events.
- **All post-turn work pushed before narration:** Only local player-perceivable settlement belongs before visible narration; global/off-screen simulation should not bloat the immediate scene path.

## Code Examples

### Current race condition seam
From [`turn-processor.ts`](R:\Projects\WorldForge\backend\src\engine\turn-processor.ts):

```ts
for await (const part of result.fullStream) {
  const events = processStreamPart(part as { type: string });
  for (const event of events) {
    yield event;
  }
}
```

`processStreamPart()` currently forwards `text-delta` directly to the client, which is too early for D-01.

### Current premise fallback seam
From [`narrative-log.tsx`](R:\Projects\WorldForge\frontend\components\game\narrative-log.tsx):

```tsx
{premise || "Begin your adventure..."}
```

This is the product-level opening-dump bug.

### Existing same-turn committed-event queue
From [`episodic-events.ts`](R:\Projects\WorldForge\backend\src\vectors\episodic-events.ts):

```ts
export function readPendingCommittedEvents(
  campaignId: string,
  tick: number,
): PendingCommittedEvent[]
```

This is a good existing seam for same-turn player-perceivable event assembly.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Backend config | `vitest.config.ts` |
| Frontend config | `frontend/vitest.config.ts` |
| Quick run command | `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/prompt-assembler.test.ts && npm --prefix frontend exec vitest run components/game/__tests__/narrative-log.test.tsx app/game/__tests__/page.test.tsx` |

### Phase Requirement → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists |
|--------|----------|-----------|-------------------|-------------|
| SCEN-01 | Visible turn text is not streamed from the tool-driving pass | backend regression | `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.test.ts -t "defers visible narration until scene settlement"` | ❌ Wave 0 |
| SCEN-01 | Duplicate consecutive output blocks are suppressed in final visible narration | backend regression | `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.test.ts -t "suppresses repeated narration blocks"` | ❌ Wave 0 |
| SCEN-01 | Opening `/game` surface does not render raw premise as the first scene text | frontend regression | `npm --prefix frontend exec vitest run components/game/__tests__/narrative-log.test.tsx app/game/__tests__/page.test.tsx -t "does not render premise as opening narration"` | ❌ Wave 0 |
| SCEN-01 | Final narration prompt uses authoritative settled scene facts/effects rather than free-form premise-only text | backend integration | `npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts` | ⚠ existing suites, new cases needed |

## Open Questions

1. **Should present-NPC local settlement happen inside `processTurn()` or via a new route callback before final narration?**
   - Recommendation: keep it in `processTurn()` or a helper it owns, because D-01 is a turn-assembly concern, not a route concern.

2. **Should the final narration pass reuse `assemblePrompt()` or build a smaller dedicated scene-assembly prompt?**
   - Recommendation: add a dedicated scene-assembly helper so final narration can be tightly bounded to settled scene facts/effects instead of the whole tool-driving prompt.

3. **How much perceivable off-screen spillover belongs in Phase 45?**
   - Recommendation: bounded only. Include immediate perceivable effects already evidenced by same-turn committed events; leave deeper encounter-scope and knowledge-boundary work to Phase 46.

## Sources

### Primary
- [`backend/src/engine/turn-processor.ts`](R:\Projects\WorldForge\backend\src\engine\turn-processor.ts)
- [`backend/src/routes/chat.ts`](R:\Projects\WorldForge\backend\src\routes\chat.ts)
- [`backend/src/engine/prompt-assembler.ts`](R:\Projects\WorldForge\backend\src\engine\prompt-assembler.ts)
- [`backend/src/engine/storyteller-contract.ts`](R:\Projects\WorldForge\backend\src\engine\storyteller-contract.ts)
- [`backend/src/vectors/episodic-events.ts`](R:\Projects\WorldForge\backend\src\vectors\episodic-events.ts)
- [`frontend/components/game/narrative-log.tsx`](R:\Projects\WorldForge\frontend\components\game\narrative-log.tsx)
- [`frontend/app/game/page.tsx`](R:\Projects\WorldForge\frontend\app\game\page.tsx)
- [`frontend/lib/api.ts`](R:\Projects\WorldForge\frontend\lib\api.ts)

### Planning artifacts
- [`45-CONTEXT.md`](R:\Projects\WorldForge\.planning\phases\45-authoritative-scene-assembly-and-start-of-play-runtime\45-CONTEXT.md)
- [`ROADMAP.md`](R:\Projects\WorldForge\.planning\ROADMAP.md)
- [`REQUIREMENTS.md`](R:\Projects\WorldForge\.planning\REQUIREMENTS.md)
- [`STATE.md`](R:\Projects\WorldForge\.planning\STATE.md)

## Metadata

**Research date:** 2026-04-12
**Valid until:** 2026-05-12

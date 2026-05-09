# Phase 68: World Brain Hidden Adjudication and Scene Direction - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning
**Source:** User direction, Claude CLI, Gemini CLI, internet references, local runtime inspection, explorer-agent synthesis, adversarial critique

<domain>
## Phase Boundary

Introduce a bounded backend-owned `world-brain` scene-direction pass for opening scenes and player turns.

This pass exists to answer, before visible narration:
- why this scene is happening
- which actors are actually focal right now
- why those actors are present
- what causal beats are in play
- which of those beats are player-perceivable

Phase 68 does **not** yet fully migrate hidden tool-driving ownership out of the current storyteller seam. Instead, it adds the contract that later migration can rely on and makes final visible narration consume authoritative scene-direction facts instead of inventing them from raw presence lists.

**Out of scope**
- route or SSE transport redesign
- DB schema changes
- chronicle/storage redesign
- Oracle probability redesign
- NPC-agent, offscreen, reflection, faction, or image pipelines
- full hidden-pass ownership migration (reserved for Phase 69)
- post-generation prose rewriting

</domain>

<decisions>
## Implementation Decisions

### GA-1: World-brain pass exists before visible narration - **Yes**
- **D-01:** Add a hidden `world-brain` adjudication step in `turn-processor.ts` before final visible narration.
- **D-02:** The pass runs for:
  - opening scene generation
  - normal player turns
- **D-03:** The pass uses the `judge` role and structured output (`safeGenerateObject` + Zod), not freeform prose generation.
- **Reason:** visible narration should consume world-decided scene facts, not infer why the scene exists from raw context.

### GA-2: World-brain output stays bounded - **Tight contract**
- **D-04:** The Phase 68 structured output is a compact `WorldBrainSceneDirection` contract with only bounded scene-direction fields.
- **D-05:** v1 fields:
  - `situationSummary`
  - `sceneQuestion`
  - `focalActorNames`
  - `backgroundActorNames`
  - `presenceReasons`
  - `causalBeats`
  - `narrationGuardrails`
- **D-06:** Every collection is capped in schema and prompt. This is not a second lore dump.
- **Reason:** the world-brain must decide scene causality without becoming a second sprawling storyteller.

### GA-3: State authority remains backend-owned - **No narrator writes**
- **D-07:** Phase 68 world-brain output is not canon by itself; it becomes authoritative only when threaded through settled scene assembly and committed tool/state effects.
- **D-08:** Final storyteller receives only player-perceivable, authoritative scene-direction facts and settled scene effects.
- **D-09:** Visible narration still cannot mutate state.
- **Reason:** avoid state drift and keep runtime truth outside prose.

### GA-4: Current hidden pass remains execution-only in spirit - **Bridge, not full migration**
- **D-10:** In Phase 68 the existing hidden tool-driving pass stays in place, but it must consume world-brain direction instead of inventing co-presence, responder order, or scene purpose on its own.
- **D-11:** Full tool-driving ownership migration out of storyteller is deferred to Phase 69.
- **Reason:** this keeps Phase 68 additive and lowers regression risk.

### GA-5: Opening scenes must stop free-inventing group encounters - **Yes**
- **D-12:** `processOpeningScene(...)` must use the same world-brain scene-direction seam as normal turns.
- **D-13:** Opening narration may no longer describe a pile of present NPCs without explicit world-brain framing for:
  - why they are here
  - who is focal
  - what the immediate situation is
- **Reason:** the worst readability failures are happening at scene entry and must be fixed at the same seam.

### GA-6: Scene assembly becomes the causal handoff - **Preferred**
- **D-14:** `scene-assembly.ts` extends its `SceneAssembly` / `SceneEffect` output with world-brain causal metadata and prefers that metadata over loose inference from tool summaries where available.
- **D-15:** Final visible narration consumes the assembled authoritative scene plus world-brain direction; it does not read hidden scratch reasoning.
- **Reason:** `scene-assembly.ts` is already the authoritative final-pass handoff seam, so it should own the player-facing causal packet.

### GA-7: Traceability is required in Phase 68 - **Yes**
- **D-16:** Add bounded observability for the world-brain seam so we can inspect:
  - focal actor count
  - causal-beat count
  - whether the pass ran for opening/player turn
  - high-level scene question / summary lengths
- **D-17:** Observability payloads must be compact Phase 58-style metadata, not raw giant prompt dumps.
- **Reason:** if this seam goes wrong, we need to audit it without drowning logs.

### Claude's Discretion
- exact type name for the structured output (`WorldBrainSceneDirection` / `SceneDirection` / similar)
- exact field caps and enum labels
- whether `assemblePrompt(...)` gets a new helper or a prompt-role branch for world-brain assembly
- exact observability event name

</decisions>

<canonical_refs>
## Canonical References

### Project framing
- `.planning/PROJECT.md`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`

### Prior phase substrate
- `.planning/phases/66-combat-envelope-and-oracle-context/66-CONTEXT.md`
- `.planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-CONTEXT.md`
- `.planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-RESEARCH.md`

### Phase 68 discussion input
- `.planning/phases/68-world-brain-hidden-adjudication-and-scene-direction/68-DISCUSSION-LOG.md`

### Core runtime seams
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/prompt-assembler.ts`
- `backend/src/engine/scene-assembly.ts`
- `backend/src/engine/storyteller-contract.ts`
- `backend/src/engine/tool-schemas.ts`
- `backend/src/engine/oracle.ts`
- `backend/src/engine/npc-agent.ts`

### Tests likely affected
- `backend/src/engine/__tests__/turn-processor.test.ts`
- `backend/src/engine/__tests__/turn-processor.observability.test.ts`
- `backend/src/engine/__tests__/prompt-assembler.test.ts`
- `backend/src/engine/__tests__/storyteller-contract.test.ts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `turn-processor.ts` already separates:
  - Oracle
  - hidden tool-driving pass
  - scene assembly
  - final visible narration
- `scene-assembly.ts` already builds an authoritative packet from settled tool calls, presence, location events, and committed episodic events.
- `assembleFinalNarrationPrompt(...)` already forbids inventing material events outside assembled authoritative inputs.
- `oracle.ts` already stays a bounded judge for chance/outcome and should remain untouched.
- `npc-agent.ts` already has its own decision/runtime loop; adopting world-brain into NPC-agent/offscreen/reflection paths is explicitly deferred to Phase 69 so Phase 68 stays focused on opening/player-turn scene causality.

### Established Patterns
- backend-owned mechanics are passed into LLMs as bounded context
- final narrator is already constrained to settled scene effects
- structured LLM calls use `safeGenerateObject`
- observability prefers compact event payloads over verbose dumps

### Current Gap
- there is no dedicated scene-causality seam between raw state and final narration
- opening/final narration still infer too much from raw presence and generalized scene context
- hidden tool-driving still sits under storyteller framing, which encourages mixed ownership of causality and prose

### Integration Points
- `processTurn(...)` after Oracle and before final visible narration
- `processOpeningScene(...)` before opening visible narration
- `assembleFinalNarrationPrompt(...)`
- `scene-assembly.ts` as final authoritative causal packet builder

### Risks
- adding a world-brain pass that is too wide becomes a second hidden storyteller
- duplicating causality in both world-brain and scene-assembly will create contradictions
- contradictory committed tool/state effects must outrank world-brain causal suggestions; contradictions should be logged as compact mismatch telemetry instead of silently blended
- prompt-count / observability regressions can break Phase 58 seam expectations

</code_context>

<specifics>
## Specific Ideas

- The world-brain should answer:
  - `what situation is this`
  - `who is actually central right now`
  - `why are they here`
  - `what changed because of the last action`
- It should **not**:
  - write prose
  - invent long lore
  - decide persistent state outside existing tool/state seams
  - dump giant multi-NPC summaries into the narrator

</specifics>

<deferred>
## Deferred Ideas

- migrating hidden tool-driving ownership fully out of storyteller (Phase 69)
- chronicle redesign or mandatory canonical trail writes
- NPC/offscreen/reflection adoption of world-brain outputs
- scene-to-scene long-range director AI
- post-generation prose repair

</deferred>

---

*Phase: 68-world-brain-hidden-adjudication-and-scene-direction*
*Context gathered: 2026-04-20 via autonomous discuss-phase with user truth, Claude/Gemini, internet, and local code inspection*

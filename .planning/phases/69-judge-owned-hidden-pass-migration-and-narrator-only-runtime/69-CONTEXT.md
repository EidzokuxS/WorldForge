# Phase 69: Judge-Owned Hidden Pass Migration and Narrator-Only Runtime - Context

**Gathered:** 2026-04-20  
**Status:** Ready for planning  
**Source:** user direction, Phase 68 implementation, Claude Code, Gemini CLI, internet references, local runtime inspection

<domain>
## Phase Boundary

Phase 69 finishes the runtime ownership split for normal player turns.

After Phase 69:
- the judge decides hidden adjudication as structured data
- backend executes state mutations deterministically
- storyteller performs visible prose only

Phase 69 does **not** redesign routes, SSE transport, Oracle math, DB schema, opening-scene flow, NPC-agent flow, or reflection/offscreen pipelines.

</domain>

<decisions>
## Implementation Decisions

### GA-1: Hidden player-turn adjudication becomes structured judge output - **Yes**
- **D-01:** Replace the player-turn hidden `streamText + tools` storyteller pass with a judge-owned `safeGenerateObject` adjudication plan.
- **D-02:** The adjudication plan is bounded structured data, not hidden prose.
- **Reason:** the storyteller must stop owning mutation decisions.

### GA-2: Backend, not the model, executes tool actions - **Yes**
- **D-03:** The adjudication plan contains ordered tool actions only.
- **D-04:** Backend executes those actions through the existing `executeToolCall(...)` mutation boundary.
- **D-04a:** The adjudication plan also carries a bounded `rationale` field for audit/debug, but that rationale is not narrator-facing.
- **Reason:** world mutations need one deterministic executor path.

### GA-3: Tool schemas stay single-sourced - **Yes**
- **D-05:** Export or centralize per-tool input schemas so the adjudication plan reuses the same shapes the executor already expects.
- **Reason:** avoid schema drift between planning and execution.

### GA-4: Storyteller remains visible-only - **Yes**
- **D-06:** Final visible narration keeps using the storyteller model.
- **D-07:** No hidden tool-driving call remains in the default normal player turn runtime after cutover.
- **D-07a:** A temporary explicit env-gated legacy fallback is acceptable for bisecting regressions during the migration window, but it is not the default path.
- **Reason:** this is the actual architecture target the user asked for.

### GA-5: Opening scenes remain on the Phase 68 path - **Yes**
- **D-08:** `processOpeningScene(...)` stays `world-brain -> scene assembly -> final visible narration`.
- **Reason:** openings have no player action adjudication problem left to solve here.

### GA-6: Phase 69 stays bounded - **Yes**
- **D-09:** No route/SSE redesign.
- **D-10:** No DB schema changes.
- **D-11:** No NPC-agent migration.
- **D-12:** No Oracle probability redesign.
- **Reason:** this phase is ownership migration, not another runtime rewrite.

### GA-7: Observability must reflect the new authority - **Yes**
- **D-13:** Add compact observability for:
  - adjudication plan generation
  - planned action count
  - executed action count
  - judge-plan latency
- **Reason:** after cutover we need to see the new causal path clearly in logs.

### GA-8: Failure policy must be explicit - **Yes**
- **D-14:** Invalid adjudication plan parse aborts the turn loudly before visible narration.
- **D-15:** Executed action failure aborts the remaining action list instead of silently continuing.
- **Reason:** hidden failures must not be converted into fake narrative confidence.

### Claude's Discretion
- exact type and file names for the adjudication-plan module
- whether prompt assembly gets a new dedicated helper or a shared internal refactor
- exact caps for ordered planned actions
- whether legacy hidden storyteller helpers remain as dead compatibility code or are removed now

</decisions>

<canonical_refs>
## Canonical References

- `.planning/PROJECT.md`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/phases/68-world-brain-hidden-adjudication-and-scene-direction/68-SUMMARY.md`
- `.planning/phases/69-judge-owned-hidden-pass-migration-and-narrator-only-runtime/69-DISCUSSION-LOG.md`
- `.planning/phases/69-judge-owned-hidden-pass-migration-and-narrator-only-runtime/69-RESEARCH.md`

### Core runtime seams
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/prompt-assembler.ts`
- `backend/src/engine/tool-schemas.ts`
- `backend/src/engine/tool-executor.ts`
- `backend/src/engine/storyteller-contract.ts`
- `backend/src/engine/world-brain.ts`

### Likely tests
- `backend/src/engine/__tests__/turn-processor.test.ts`
- `backend/src/engine/__tests__/turn-processor.observability.test.ts`
- `backend/src/engine/__tests__/prompt-assembler.test.ts`
- `backend/src/engine/__tests__/storyteller-contract.test.ts`
- `backend/src/engine/__tests__/fixtures/mock-llm.ts`

</canonical_refs>

<code_context>
## Existing Code Insights

- `turn-processor.ts` already has a clean seam between:
  - Oracle
  - hidden adjudication path
  - authoritative scene assembly
  - final visible narration
- `tool-executor.ts` already gives a deterministic mutation boundary for every player hidden-pass tool.
- `executeToolCall(...)` already logs `tool.call`, so execution observability can remain anchored there.
- `scene-assembly.ts` already converts executed tool results plus runtime state into the authoritative packet consumed by visible narration.
- `processOpeningScene(...)` already has the correct narrator-only shape after Phase 68.

</code_context>

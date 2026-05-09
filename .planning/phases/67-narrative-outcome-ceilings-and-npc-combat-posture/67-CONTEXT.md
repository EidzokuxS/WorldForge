# Phase 67: Narrative Outcome Ceilings and NPC Combat Posture - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning
**Source:** Autonomous discuss-phase with external Claude/Gemini consultation, local explorer analysis, and live Phase 66 code inspection

<domain>
## Phase Boundary

Consume the Phase 66 `CombatEnvelope` in two additional runtime seams so combat stats become meaningful for story direction, not just Oracle chance calibration:

1. **Narrative outcome ceilings/floors**
   - derive deterministic backend-authored narrative bounds from `combatEnvelope + oracleResult.outcome`
   - feed those bounds into storyteller prompts so the narration respects matchup plausibility

2. **NPC combat posture**
   - derive an ephemeral posture for an NPC before it chooses tools/actions
   - let the NPC's prompt reason differently when it is dominant, favored, contested, pressured, or should disengage

This phase is still **not** hard combat math. It is narrative direction and tactical posture based on the already-computed envelope.

**Out of scope**
- persistence or schema changes
- runtime-tag expansion
- UI surfaces for posture/bounds
- offscreen/reflection consumers
- HP formulas or damage math
- post-hoc prose rewriting after storyteller output
- multi-target posture fusion beyond a single primary target in v1

</domain>

<decisions>
## Implementation Decisions

### GA-1: Where narrative ceilings/floors live - **Option C (hybrid)**
- **D-01:** Phase 67 uses a hybrid model: backend deterministically derives `NarrativeOutcomeBounds`, but storyteller remains the bounded interpreter that turns those bounds into prose.
- **D-02:** Bounds are derived from `(combatEnvelope, oracleResult.outcome)`, not from raw `powerStats`.
- **D-03:** Bounds must be injected into **both** storyteller passes that matter for player-facing combat meaning:
  - hidden/action-driving prompt in `turn-processor.ts`
  - final visible narration prompt in `prompt-assembler.ts`
- **D-04:** Phase 67 does **not** do post-generation prose rewriting; that is a much wider and riskier seam.
- **Reason:** prompt-only would drift model-to-model, while post-hoc rewriting is too invasive. Deterministic backend bounds plus prompt injection is the smallest coherent design.

### GA-2: Where NPC combat posture is derived - **Option A (npc-agent pre-decision)**
- **D-05:** NPC combat posture is derived in `tickNpcAgentInternal(...)` before `generateText(...)` chooses tools/actions.
- **D-06:** `npc-tools.ts` remains the hostile-adjudication seam, but posture is **not** owned there because `act.execute(...)` is too late to influence tool selection.
- **D-07:** v1 target selection for posture is the single primary clear-awareness target in the NPC's current presence snapshot; if none exists, posture is omitted.
- **Reason:** posture is about decision bias, not only hostile adjudication.

### GA-3: Minimal posture contract - **Exact v1 shape**
- **D-08:** Minimal posture enum:
  - `aggress`
  - `press`
  - `trade`
  - `probe`
  - `withdraw`
  - `disengage`
- **D-09:** Minimal `NpcCombatPosture` fields:
  - `posture`
  - `vsLabel`
  - `matchup`
  - `canWin`
  - `mustAvoid`
  - `exposedTargetVulnerabilities` (capped)
  - `guidanceLines` (backend-authored, capped)
- **D-10:** Minimal `NarrativeOutcomeBounds` fields:
  - `ceilings`
  - `floors`
  - `prohibitions`
  - `summary`
- **Reason:** enough to shape narration and NPC choice without becoming a second combat system.

### GA-4: Shared helper ownership - **Option A (extend combat-envelope.ts)**
- **D-11:** Pure helpers for `deriveCombatPosture(...)` and `buildNarrativeOutcomeBounds(...)` live beside `buildCombatEnvelope(...)` in `backend/src/engine/combat-envelope.ts`.
- **D-12:** These helpers stay backend-local and ephemeral. They are not stored on `CharacterRecord`, campaign state, or DB rows.
- **Reason:** one engine-owned source of truth for envelope-derived semantics keeps Phase 67 additive and testable.

### GA-5: Phrase design / instruction-echo safety - **Constraint style, not imperative style**
- **D-13:** Backend-authored bounds/posture prompt lines must be phrased as short constraint facts, not imperative "Do not ..." instructions, to avoid the visible narration instruction-echo detector.
- **D-14:** Prompt additions must stay bounded:
  - `NarrativeOutcomeBounds`: short lists, capped
  - `NpcCombatPosture.guidanceLines`: <= 3 short lines
- **Reason:** reduces prompt bloat and avoids regressions in `detectVisibleNarrationFailures(...)`.

### Claude's Discretion
- Exact field names and enum labels if a clearer naming scheme emerges during planning
- Exact mapping rules from matchup/bypass state to posture
- Exact mapping rules from matchup + Oracle outcome to narrative ceilings/floors/prohibitions
- Whether bounds are rendered as one prompt block or two compact subsections
- Exact observability payload shape for `combat.bounds.derived` and `combat.posture.derived`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project / phase framing
- `.planning/PROJECT.md`
- `.planning/ROADMAP.md` - Phase 66 and Phase 67 sections
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`

### Phase 66 artifacts
- `.planning/phases/66-combat-envelope-and-oracle-context/66-CONTEXT.md`
- `.planning/phases/66-combat-envelope-and-oracle-context/66-RESEARCH.md`
- `.planning/phases/66-combat-envelope-and-oracle-context/66-REVIEWS.md`
- `.planning/phases/66-combat-envelope-and-oracle-context/66-SUMMARY.md`

### Core runtime seams
- `backend/src/engine/combat-envelope.ts`
- `backend/src/engine/oracle.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/prompt-assembler.ts`
- `backend/src/engine/storyteller-contract.ts`
- `backend/src/engine/npc-agent.ts`
- `backend/src/engine/npc-tools.ts`
- `backend/src/engine/target-context.ts`
- `backend/src/engine/scene-assembly.ts`

### Tests that must stay aligned
- `backend/src/engine/__tests__/oracle.test.ts`
- `backend/src/engine/__tests__/turn-processor.test.ts`
- `backend/src/engine/__tests__/turn-processor.observability.test.ts`
- `backend/src/engine/__tests__/npc-agent.test.ts`
- `backend/src/engine/__tests__/prompt-assembler.character-identity.test.ts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 66 already centralizes deterministic combat reasoning in `combat-envelope.ts`.
- `turn-processor.ts` already owns both the hidden storyteller system prompt seam and the final visible narration seam.
- `assembleFinalNarrationPrompt(...)` in `prompt-assembler.ts` is the smallest visible-pass insertion point for outcome bounds.
- `tickNpcAgentInternal(...)` in `npc-agent.ts` already builds an NPC-local system prompt before tool choice, making it the right pre-decision posture seam.

### Established Patterns
- Mechanics are backend-authored and passed into LLM prompts as bounded context, not inferred back from prose.
- Additive optional prompt/context blocks are preferred over broad schema changes.
- Observability events should be bounded, named, and Phase 58-style rather than dumping large prose payloads.

### Integration Points
- Player path: `processTurn(...)` after Oracle result exists and before storyteller prompts are assembled.
- Visible narration path: `assembleFinalNarrationPrompt(...)`.
- NPC choice path: `tickNpcAgentInternal(...)` before `generateText(...)`.
- Adjudication path: `npc-tools.ts` stays focused on action execution, not pre-choice posture.

### Risks
- If outcome bounds are injected only into the hidden pass, the final visible pass loses them and Phase 67 becomes cosmetically incomplete.
- If posture is derived in `npc-tools.ts`, it cannot influence tool selection and becomes mostly redundant.
- If prompt lines are phrased as imperative instructions, the visible narration echo detector may flag them.

</code_context>

<specifics>
## Specific Ideas

- `NarrativeOutcomeBounds` should constrain *scale* and *kind* of narrated effect, not chance or Oracle result.
- Bounds should be authored as short factual constraints like:
  - "This beat cannot read as decisive bodily defeat."
  - "A strong hit must cost the target a concrete position or asset."
- NPC posture should bias:
  - whether to attack at all
  - whether to test, trade, press, withdraw, or disengage
  - but it should not become persisted personality or long-term memory

</specifics>

<deferred>
## Deferred Ideas

- posture consumption in `npc-offscreen.ts` or `reflection-agent.ts`
- multi-target or squad-level posture synthesis
- UI inspection/debug surfaces for posture or bounds
- post-generation prose normalization passes
- combat memory persistence

</deferred>

---

*Phase: 67-narrative-outcome-ceilings-and-npc-combat-posture*
*Context gathered: 2026-04-19 via autonomous discuss-phase with external Claude/Gemini input*

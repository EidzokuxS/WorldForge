# Phase 66: Combat Envelope and Oracle Context - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning
**Source:** Autonomous discuss-phase with delegated technical decisions, plus external Claude/Gemini review and local explorer analysis

<domain>
## Phase Boundary

Make `powerStats`, `hax`, and `vulnerabilities` mechanically meaningful for combat adjudication without turning WorldForge into hard numerical combat math.

Today:
- `personality` and goals already influence prompts, `npc-agent`, offscreen simulation, and reflection.
- `powerStats` already influence prompt context and `/lookup`.
- Oracle adjudication still only sees `actorTags`, `targetTags`, `environmentTags`, and `sceneContext`.

**Phase 66 scope is narrow and engine-side only:**
- Add a deterministic, backend-owned `CombatEnvelope` derived from actor/target power data.
- Compute it before Oracle adjudication for player and NPC hostile actions.
- Pass the envelope into Oracle as structured context.
- Keep runtime tags unchanged.
- Keep storyteller, NPC posture, offscreen posture, and reflection consumers out of scope.

**Out of scope:**
- Storyteller prompt changes or narrative ceilings/floors
- NPC combat posture or tactical state
- Any persistence/schema expansion for posture or combat memory
- Reflection writes based on combat envelopes
- Encoding combat deltas into runtime tags
- HP damage formulas or hard combat math

</domain>

<decisions>
## Implementation Decisions

### GA-1: Where CombatEnvelope is computed - **Option A (outside Oracle, before callOracle)**
- **D-01:** `CombatEnvelope` is computed in backend code outside Oracle, never by the Judge LLM.
- **D-02:** Player action compute seam: `backend/src/engine/turn-processor.ts` after `resolveActionTargetContext(...)` and before `callOracle(...)`.
- **D-03:** NPC action compute seam: `backend/src/engine/npc-tools.ts` inside `act.execute`, before `callOracle(...)`.
- **Reason:** preserves the invariant `LLM is narrator, backend is engine`; keeps mechanical comparison deterministic and testable.

### GA-2: What Oracle receives - **Option B (pre-digested structured envelope, not raw power stats)**
- **D-04:** Oracle receives a compact structured `combatEnvelope`, not raw `powerStats` objects.
- **D-05:** Envelope is qualitative and adjudication-oriented, not a damage calculator.
- **D-06:** Expected envelope contents:
  - matchup / relative-advantage band
  - AP-vs-durability delta
  - speed delta
  - intelligence delta when relevant
  - bypass flags from hax interaction
  - exposed vulnerabilities relevant to the action/method
  - bounded summary lines for prompt consumption
- **Reason:** the Judge LLM is better at consuming pre-digested deltas than raw tier/rank objects, and this avoids turning Oracle prompts into stat dumps.

### GA-3: Runtime tags - **Option A (leave unchanged)**
- **D-07:** `deriveRuntimeCharacterTags(...)` stays unchanged in Phase 66.
- **D-08:** No power-axis tags, no hax tags, no vulnerability tags are added to runtime-tags in this phase.
- **Reason:** runtime-tags are a broad compatibility shorthand used in many consumers. Flattening power semantics into string tags would pollute the namespace and expand blast radius for no gain.

### GA-4: Oracle integration scope - **Option A (Oracle-only)**
- **D-09:** Phase 66 stops at Oracle/Judge integration. Storyteller prompt assembly does **not** consume `CombatEnvelope` yet.
- **D-10:** `OraclePayload` grows an optional `combatEnvelope` field. Missing envelope preserves current behavior byte-for-byte.
- **D-11:** Oracle prompt gets bounded envelope instructions and one explicit clamp for obvious no-bypass tier mismatches, but still returns `1..99` chance and existing `strong_hit / weak_hit / miss` flow remains unchanged.
- **Reason:** this keeps Phase 66 coherent and mechanical. Narrative ceilings and combat-directed prose belong to Phase 67.

### GA-5: Envelope type / shape ownership - **Option A (shared typed artifact)**
- **D-12:** `CombatEnvelope` should be a stable typed artifact consumable later by Phase 67 without refactor.
- **D-13:** Preferred design is a pure builder module (working name `backend/src/engine/combat-envelope.ts`) plus a shared exported type if needed for tests/consumers.
- **D-14:** Envelope should be ephemeral for now: computed on demand per action/adjudication, not persisted to DB and not stored in `CharacterRecord`.
- **Reason:** posture/narrative consumers can reuse the same envelope contract later, but persistence would widen scope prematurely.

### GA-6: Target data contract - **Option A (extend target-resolution seam)**
- **D-15:** `resolveActionTargetContext(...)` is allowed to surface richer target-side combat data needed to build `CombatEnvelope` cleanly.
- **D-16:** This may include target-side `powerStats`, hax, vulnerabilities, or enough normalized combat input for the envelope builder.
- **Reason:** current target context only exposes label/type/tags, which is insufficient for deterministic power comparison.

### GA-7: Logging / verification - **Option A (observability + unit/integration lock)**
- **D-17:** Envelope creation/adjudication should log through the Phase 58 observability pattern with bounded payload size.
- **D-18:** Required verification surfaces:
  - unit tests for envelope derivation and bypass/vulnerability logic
  - oracle tests for optional envelope handling + clamp behavior
  - `turn-processor` tests for player-path envelope build and pass-through
  - NPC hostile-action tests for `npc-tools` envelope build and pass-through
- **D-19:** No browser/UAT requirement for Phase 66. This is backend contract work.

### Claude's Discretion
- Exact envelope field names and enum labels
- Whether the type lives only in backend or is exported from `@worldforge/shared`
- Whether target-resolution returns raw target combat fields or a normalized helper input
- Exact clamp semantics in Oracle prompt for `no-bypass + large durability gap`
- Exact event name for observability (`oracle.envelope`, `combat-envelope.built`, etc.)
- Whether intelligence delta belongs in v1 of the envelope or should remain optional

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project / Phase framing
- `.planning/PROJECT.md`
- `.planning/ROADMAP.md` - Phase 66 and Phase 67 sections
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`

### Prior phases that define the relevant contracts
- `.planning/phases/57-power-scaling-character-profile-redesign/`
- `.planning/phases/58-pipeline-observability-logging/`
- `.planning/phases/63-personality-interiority-model/63-CONTEXT.md`
- `.planning/phases/64-npc-personality-regeneration-parity/64-CONTEXT.md`
- `.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-CONTEXT.md`

### Core runtime seams
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/oracle.ts`
- `backend/src/engine/target-context.ts`
- `backend/src/engine/npc-tools.ts`
- `backend/src/engine/prompt-assembler.ts`
- `backend/src/engine/npc-agent.ts`
- `backend/src/engine/npc-offscreen.ts`
- `backend/src/engine/reflection-agent.ts`
- `backend/src/engine/storyteller-contract.ts`

### Power data / lookup seams
- `backend/src/engine/grounded-lookup.ts`
- `backend/src/character/runtime-tags.ts`
- `backend/src/character/record-adapters.ts`
- `shared/src/power-tiers.ts`
- `shared/src/types.ts`

### Tests that must stay aligned
- `backend/src/engine/__tests__/oracle.test.ts`
- `backend/src/engine/__tests__/turn-processor.test.ts`
- `backend/src/engine/__tests__/npc-agent.test.ts`
- `backend/src/engine/__tests__/prompt-assembler.character-identity.test.ts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `compareCharacterPower(...)` in `backend/src/engine/grounded-lookup.ts` already embodies comparative power reasoning that can inform envelope design.
- `canHaxBypass(...)` and tier helpers in `shared/src/power-tiers.ts` are existing deterministic building blocks.
- `buildPowerStatsLine(...)` in `prompt-assembler.ts` already produces bounded prose for power data, but it is prompt-only and not adjudication-aware.
- Phase 58 observability conventions already exist for adding bounded structured logs around new engine seams.

### Established Patterns
- Oracle remains a bounded Judge LLM call with typed schema and deterministic temperature.
- Player and NPC hostile actions both eventually call `callOracle(...)`, but from different seams (`turn-processor` and `npc-tools`).
- Engine-side truth should be computed before narration, not recovered from narrator prose.
- Shared helper modules are preferred when the same logic is used by multiple pipelines (see Phase 64/65 helper patterns).

### Integration Points
- `turn-processor.ts` is the authoritative player-action adjudication seam.
- `npc-tools.ts` is the authoritative NPC hostile-action adjudication seam.
- `target-context.ts` is the natural place to enrich target combat input.
- `oracle.ts` is where the new context becomes meaningful for chance calibration.

### Risks
- Expanding Phase 66 into storyteller or posture consumers would blur the boundary between mechanics and narrative and make verification ambiguous.
- Injecting power-derived tags into runtime-tags would create a high-blast-radius regression surface across prompt assembly, reflection, and compatibility surfaces.
- Persisting posture or envelope state now would widen schemas, adapters, and DB/storage behavior before the mechanics contract is stable.

</code_context>

<specifics>
## Specific Ideas

- Default envelope should stay compact. A recommended v1 shape is:
  - `matchup`
  - `axisDeltas`
  - `bypasses`
  - `exposedVulnerabilities`
  - `summaryLines`
- `summaryLines` should be authored by backend code, not by an LLM.
- Oracle prompt wording should treat the envelope as a qualitative modifier and bound impossible-feeling outcomes without collapsing into exact combat math.
- If the target cannot be resolved to a character with power data, `combatEnvelope` should be omitted entirely instead of faking one.

</specifics>

<deferred>
## Deferred Ideas

- Storyteller narrative ceilings/floors
- Prompt-assembler envelope sections
- NPC combat posture and tactical stance
- Offscreen posture usage
- Reflection updates based on matchup/outclassing
- HP damage caps tied to envelope
- Any UI surfacing of envelope internals
- Any persistence of posture/envelope state

</deferred>

---

*Phase: 66-combat-envelope-and-oracle-context*
*Context gathered: 2026-04-19 via autonomous discuss-phase with external Claude/Gemini input*

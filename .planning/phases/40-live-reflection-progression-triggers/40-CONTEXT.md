# Phase 40: Live Reflection & Progression Triggers - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn dormant reflection/progression scaffolding into live gameplay behavior that can trigger during ordinary play and produce observable downstream changes in NPC state.

This phase covers:
- how reflection signal enters runtime from normal play
- what kinds of NPC changes Phase 40 must make operational first
- how often reflection/progression should be allowed to surface in normal play
- how visible those changes should be to the player through the ordinary gameplay loop

This phase does **not** cover:
- checkpoint-complete restore or cross-restart durability
- new economy systems, XP systems, or travel systems
- a new explicit knowledge-propagation engine
- docs cleanup beyond what planning needs to stay aligned with the phase boundary

</domain>

<decisions>
## Implementation Decisions

### Reflection Signal Source
- **D-01:** Reflection trigger accumulation must come from live runtime event flow, not from manual repair scripts, dev-only tooling, or one-off backfills.
- **D-02:** The signal source should piggyback on already-committed episodic events and post-turn simulation outputs instead of inventing a second parallel event pipeline just for reflection.
- **D-03:** Phase 40 should make normal gameplay, NPC actions, and off-screen NPC updates capable of contributing reflection signal when they create meaningful events involving a given NPC.

### Cadence And Threshold Semantics
- **D-04:** Reflection should become reachable through ordinary short arcs of notable interaction, not only through rare dramatic spikes and not through trivial every-turn noise.
- **D-05:** “Live” for this phase means a player can realistically trigger reflection by repeatedly dealing with the same NPC across normal play, without admin intervention or bespoke testing hooks.
- **D-06:** Exact numeric thresholds, weighting, and accumulation math stay flexible for planning and implementation; the locked product contract is cadence, not a hard legacy constant.

### Consequence Priority
- **D-07:** The first-class reflection outcomes for Phase 40 are belief changes, goal changes, and relationship drift, because those are the most legible downstream behavior drivers.
- **D-08:** Wealth-tier and skill-tier progression remain in scope, but they are secondary outcomes and should require stronger evidence than ordinary belief/goal updates.
- **D-09:** Phase 40 must favor durable structured-state changes that later prompts and runtime systems can consume, not one-off flavor text or debug-only counters.

### Player-Facing Visibility
- **D-10:** Reflection should be primarily visible through changed NPC behavior, changed goals, changed relationships, and changed follow-up scene consequences rather than through loud meta-system popups.
- **D-11:** The UI/runtime may expose subtle confirmation that the world has advanced, but the player should infer most reflection results diegetically from later turns.
- **D-12:** Reflection/progression must happen inside the normal gameplay loop established by Phase 39, so players observe its consequences through standard turn flow rather than through manual repair steps or offline scripts.

### Scope Guardrails
- **D-13:** Phase 40 should make reflection operational before trying to make it “smart.” Reliability of triggering outranks prompt polish or balancing.
- **D-14:** This phase should not reopen checkpoint fidelity, route transport, or inventory authority except where existing contracts are directly required to make reflection visible in normal play.
- **D-15:** Player-character progression systems beyond the already documented tag-tier model are out of scope; Phase 40 is about NPC reflection/progression becoming live first.

### Codex's Discretion
- Exact accumulation algorithm from committed events to `unprocessedImportance`
- Exact threshold value after live runtime wiring exists
- Whether reflection changes are surfaced through scene copy only or through a small supporting UI hint
- Exact evidence rules for when wealth/skill upgrades are strong enough to fire

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone baseline
- `.planning/ROADMAP.md` — Phase 40 goal, dependency on Phase 39, success criteria.
- `.planning/REQUIREMENTS.md` — `SIMF-01` defines the milestone requirement for live reflection/progression.
- `.planning/STATE.md` — current milestone state and recent integrity decisions.

### Prior phase intent and reconciled baseline
- `.planning/phases/07-reflection-progression/07-CONTEXT.md` — original reflection/progression design intent, including trigger and tool scope.
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-CONTEXT.md` — audit decision that reflection is likely inert and must be treated as an integrity seam.
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-HANDOFF.md` — Group A1 handoff item and milestone entry rationale for live reflection.
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-CLAIMS.md` — `REFL-01` through `REFL-09` claim set and related NPC/world claims.
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-RUNTIME-MATRIX.md` — evidence that trigger viability is currently missing while reflection tooling itself exists.
- `.planning/phases/39-honest-turn-boundary-retry-undo/39-CONTEXT.md` — honest turn boundary contract that Phase 40 must live inside.

### Gameplay docs
- `docs/mechanics.md` — `Minimal Numerics`, `Character System (3 Tiers)`, `World Engine (Macro-Simulation)`, `AI Agent Tool System / Reflection context`.
- `docs/memory.md` — `Episodic Memory`, `Importance Scoring`, `NPC Reflections`, `Prompt Assembly`.

### Runtime code
- `backend/src/engine/reflection-agent.ts` — live reflection trigger and execution entrypoint.
- `backend/src/engine/reflection-tools.ts` — belief/goal/relationship/wealth/skill mutation tools.
- `backend/src/engine/tool-executor.ts` — normal gameplay `log_event` path and structured state mutation seam.
- `backend/src/engine/npc-tools.ts` — present-NPC event generation during NPC actions and dialogue.
- `backend/src/engine/npc-offscreen.ts` — off-screen NPC updates and event writes.
- `backend/src/routes/chat.ts` — post-turn orchestration path that currently invokes reflections after other simulation steps.
- `backend/src/engine/turn-processor.ts` — authoritative completion boundary that now includes rollback-critical post-turn work.
- `backend/src/vectors/episodic-events.ts` — episodic event storage, scoring, and retrieval contract.

### Current verification anchors
- `backend/src/engine/__tests__/reflection-agent.test.ts` — current tested reflection behavior and threshold expectations.
- `backend/src/engine/__tests__/reflection-progression.test.ts` — current progression-tool coverage.
- `.planning/phases/39-honest-turn-boundary-retry-undo/39-VERIFICATION.md` — confirms Phase 40 can now rely on an honest post-turn boundary.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/engine/reflection-agent.ts`: already performs qualification, evidence retrieval, tool-called reflection, and `unprocessedImportance` reset.
- `backend/src/engine/reflection-tools.ts`: already persists belief, goal, relationship, wealth-tier, and skill-tier updates into structured state.
- `backend/src/vectors/episodic-events.ts`: already stores importance-tagged episodic events and retrieves them for reflection prompts.
- `backend/src/engine/npc-tools.ts` and `backend/src/engine/npc-offscreen.ts`: already emit episodic events from present-NPC and off-screen-NPC activity.
- `backend/src/routes/chat.ts`: already runs reflection in rollback-critical post-turn finalization after Phase 39.

### Established Patterns
- Rollback-critical post-turn work now completes before `done`, so Phase 40 can rely on reflection being part of the honest turn contract.
- Structured NPC state now lives in canonical character records with derived runtime tags as shorthand, so reflection should mutate structured fields first.
- Event importance already exists on episodic entries, but no live accumulation path currently feeds that importance into NPC reflection budgets.

### Integration Points
- Reflection budget accumulation likely belongs on committed event-write paths rather than in a separate replay pass.
- Reflection-trigger visibility will be read back through normal prompt assembly and subsequent NPC/world behavior, not through a dedicated reflection UI.
- Tests already exist around reflection tools and agent behavior; the missing seam is runtime accumulation and live end-to-end triggering.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly delegated the technical seam decisions here; this context locks pragmatic defaults instead of reopening low-value implementation debates.
- The phase should optimize for “this actually starts happening in play” before “this is perfectly balanced.”
- Reflection should feel like the world quietly changing its mind, not like a progression system shouting at the player every few turns.

</specifics>

<deferred>
## Deferred Ideas

- Richer explicit UI surfacing for reflection/progression outcomes if later testing shows the diegetic-only signal is too subtle.
- A formal NPC/world knowledge-propagation model beyond current prompt-context inference.
- Broader player-character progression redesigns or XP-like systems.
- Checkpoint/restart durability for reflection-related state beyond the current Phase 41 scope.

</deferred>

---

*Phase: 40-live-reflection-progression-triggers*
*Context gathered: 2026-04-09*

# Phase 44: Gameplay Docs Baseline Alignment - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Rewrite the gameplay documentation into an honest planning baseline for the repaired runtime delivered across v1.1.

This phase covers:
- reconciling Phase 36 Group B and Group C gameplay claims into either live documented behavior or explicit deprecation
- rewriting gameplay-facing docs so they describe the current structured character/runtime model truthfully
- aligning docs with the real retrieval, memory, prompt, travel, and start-condition contracts established by recent phases
- making the docs safe to use as the next planning baseline without another reconciliation pass

This phase does **not** cover:
- inventing new gameplay mechanics to save old prose
- silently documenting unresolved seams as if they were complete
- broad non-game UX documentation cleanup unrelated to gameplay truth
- finishing Phase 38 by documentation alone

</domain>

<decisions>
## Implementation Decisions

### Docs Authority Model
- **D-01:** `docs/concept.md` should become the high-level product/system contract, not the single source of detailed gameplay truth.
- **D-02:** `docs/mechanics.md` and `docs/memory.md` should become the normative gameplay/runtime baseline documents for future planning.
- **D-03:** `docs/tech_stack.md` should be treated as technical reference only, not as a source of gameplay truth when it conflicts with live runtime behavior.

### Deprecation Policy
- **D-04:** Stale gameplay claims must not be removed silently. Phase 44 should add explicit deprecation or replacement notes where claims were removed, narrowed, or superseded.
- **D-05:** Explicit deprecation is especially required for already-known drift areas such as wiki/Fandom ingest promises, old `Solid Slate` layout wording, old scaffold counts, `[RETRIEVED MEMORIES]`, reflection-threshold wording, and stale transport descriptions.
- **D-06:** If a claim is no longer part of the active product contract, the docs should say so directly rather than hiding the change inside rewritten prose.

### Audience And Depth
- **D-07:** The rewritten docs should be planning-grade and runtime-honest, not aspirational product copy and not a code dump.
- **D-08:** The docs should state what the system guarantees, where the contract boundaries are, and which layers are shorthand or compatibility views.
- **D-09:** Implementation-significant details must be documented when omitting them would make the docs materially false or misleading. Examples include SSE vs WebSocket, vector-only lore retrieval, caller-supplied event importance, and canonical structured records vs derived tags.

### Gameplay Docs Boundary
- **D-10:** Phase 44 must rewrite gameplay-relevant contracts, not only the turn loop in isolation. The baseline includes turn processing, Oracle, memory/retrieval, prompt assembly, target-aware rulings, start-condition carry-through, and travel/location-state semantics.
- **D-11:** Phase 44 also includes setup/handoff documentation where it directly shapes gameplay semantics: world sources, DNA, starting-location/start-condition contract, and loadout/start-state wording.
- **D-12:** Phase 44 must not expand into a full rewrite of non-game UX documentation, desktop-shell flows, or unrelated authoring surfaces unless they directly affect gameplay planning truth.

### Pending / Unfinished Truth Handling
- **D-13:** Phase 44 may document only implemented behavior, explicit deprecations, and explicit pending/deferred notes. It must not use optimistic wording for unresolved seams.
- **D-14:** Because Phase 38 is still open, Phase 44 must not present inventory/equipment authority as fully solved if the live runtime still has transitional or partial truth.
- **D-15:** Where the product is intentionally carrying a bounded partial contract, the docs should describe that partial contract honestly instead of implying the final intended end state.

### Carry-Forward Runtime Truth
- **D-16:** The docs must carry forward the canonical-record-first interpretation from Phases 29, 30, and 42: structured character/runtime data is authoritative; derived tags are shorthand and compatibility output.
- **D-17:** The docs must carry forward the Phase 42 contract that target-aware Oracle support is live for supported `character`, `item`, and `location/object` targets with honest fallback elsewhere.
- **D-18:** The docs must carry forward the Phase 42 contract that structured start conditions are bounded runtime mechanics, not narration-only flavor.
- **D-19:** The docs must carry forward the Phase 43 decision that travel time and per-location recent happenings remain part of the live product contract.
- **D-20:** The docs must carry forward the Phase 43 location model clarification: macro locations, persistent sublocations, and ephemeral scene locations can differ in lifetime, but ephemeral consequences persist.

### the agent's Discretion
- Exact chapter structure and whether contract clarifications live inline, as callouts, or as dedicated “Deprecated / Replaced” subsections
- Exact amount of low-level implementation detail to include in each document, as long as the resulting docs stay truthful and planning-grade
- Exact cross-linking strategy between `concept.md`, `mechanics.md`, `memory.md`, and `tech_stack.md`
- Exact wording for unresolved Phase 38 inventory/equipment truth, as long as it stays explicitly honest

### Reviewed Todos (not folded)
- `Add reusable multi-worldbook library` — deferred. It affects world-source capability and reuse, but it is not necessary to define the gameplay-doc baseline for Phase 44.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone planning baseline
- `.planning/ROADMAP.md` — Phase 44 goal, dependencies, and success criteria.
- `.planning/REQUIREMENTS.md` — `DOCA-01`, `DOCA-02`, and `DOCA-03`.
- `.planning/STATE.md` — current milestone state and carried-forward runtime decisions from Phases 37-43.
- `.planning/PROJECT.md` — milestone intent and the rule that gameplay docs must become trusted baseline again.

### Reconciliation source of truth
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-HANDOFF.md` — authoritative split of Group B / Group C claims and deprecation tracker.
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-RUNTIME-MATRIX.md` — row-level evidence for what was live, partial, missing, or contradicted at the audit baseline.

### Prior phase decisions that define the new baseline
- `.planning/phases/29-unified-character-ontology-and-tag-system/29-CONTEXT.md` — structured character model became canonical, tags became derived runtime output.
- `.planning/phases/30-start-conditions-canonical-loadouts-and-persona-templates/30-CONTEXT.md` — persisted start conditions and canonical loadout direction.
- `.planning/phases/42-targeted-oracle-and-start-condition-runtime-effects/42-CONTEXT.md` — target-aware Oracle and mechanically binding start-condition contract.
- `.planning/phases/43-travel-and-location-state-contract-resolution/43-CONTEXT.md` — location/travel/local-history contract and the three-class location model.

### Gameplay docs to align
- `docs/concept.md` — high-level product/system promises, world generation, world structure, and legacy UI wording.
- `docs/mechanics.md` — gameplay semantics, tag system framing, Oracle, reflection, NPC/faction simulation, and tool contracts.
- `docs/memory.md` — SQLite/vector truth, retrieval semantics, prompt blocks, save/load, and checkpoint contract.
- `docs/tech_stack.md` — technical reference doc containing gameplay-adjacent claims that can drift into false product truth.
- `docs/plans/2026-03-06-player-character-creation.md` — setup/handoff behavior that still informs gameplay-facing start-state wording.

### Runtime code anchors for doc truth
- `backend/src/character/record-adapters.ts` — canonical structured record projection into runtime compatibility fields.
- `backend/src/character/runtime-tags.ts` — derived-tag model and its non-authoritative role.
- `backend/src/engine/target-context.ts` — real target-aware Oracle input resolution.
- `backend/src/engine/start-condition-runtime.ts` — bounded opening-state mechanics and expiry rules.
- `backend/src/engine/location-graph.ts` — authoritative location graph and travel-path semantics.
- `backend/src/engine/location-events.ts` — location-local recent-happenings storage/read path.
- `backend/src/engine/prompt-assembler.ts` — real prompt blocks, retrieval behavior, and runtime state surfacing.
- `backend/src/routes/campaigns.ts` — world payload surfaces that expose repaired location/runtime state.
- `frontend/lib/api.ts` — authoritative frontend transport/SSE contract.
- `frontend/app/game/page.tsx` — gameplay client behavior that should match documented runtime expectations.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The live documentation surface is already concentrated in four files: `docs/concept.md`, `docs/mechanics.md`, `docs/memory.md`, and `docs/tech_stack.md`.
- Phase 36 already provides the claim inventory and classification baseline, so Phase 44 does not need to re-audit docs from scratch.
- Recent phase contexts (`29`, `30`, `42`, `43`) already capture the product decisions that the rewritten docs must now reflect.

### Established Patterns
- Runtime truth is carried by backend code and phase decisions, not by old prose. Docs must follow code-backed contracts, not the reverse.
- Structured character data is authoritative and derived tags are compatibility shorthand.
- Target-aware Oracle, bounded start conditions, travel-time semantics, and location-local history are now live gameplay contracts that docs should describe as such.
- Some legacy docs still describe outdated transport and retrieval details, so technical drift cleanup is part of gameplay docs alignment.

### Integration Points
- The rewrite will primarily touch `docs/concept.md`, `docs/mechanics.md`, `docs/memory.md`, and `docs/tech_stack.md`.
- Phase 44 planning should use Phase 36 handoff plus the runtime anchors above to decide what gets rewritten, deprecated, or explicitly marked pending.
- Any inventory/equipment wording must stay synchronized with the still-open Phase 38 boundary rather than getting ahead of it.

</code_context>

<specifics>
## Specific Ideas

- The docs hierarchy should be explicit enough that future planning does not have to guess whether `concept.md` or `mechanics.md` wins when they diverge.
- The rewrite should not leave another “half-fixed” documentation subsystem that forces a third reconciliation pass later.
- Explicit pending notes are preferable to elegant lies; this is especially important for unresolved inventory/equipment truth while Phase 38 remains open.
- Historical design language can remain only if it is clearly marked as historical or superseded, not if it masquerades as the active contract.

</specifics>

<deferred>
## Deferred Ideas

- Non-game UX documentation overhaul outside gameplay-baseline truth.
- Broader world-source/library product documentation beyond what directly shapes gameplay semantics.
- Milestone-level exploratory playtest writeups; those belong to closeout/verification artifacts, not to the gameplay baseline itself.

</deferred>

---

*Phase: 44-gameplay-docs-baseline-alignment*
*Context gathered: 2026-04-11*

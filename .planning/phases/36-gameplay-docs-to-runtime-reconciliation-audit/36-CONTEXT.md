# Phase 36: Gameplay docs-to-runtime reconciliation audit - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Audit the entire gameplay-facing specification surface under `docs/` against the live runtime and planning artifacts, then produce an authoritative truth map for what is truly implemented, partially wired, missing, contradicted, or outdated.

This phase is a reconciliation phase inside the current `v1.0` milestone. It does **not** fix gameplay yet. It defines the honest baseline that the next gameplay milestone will execute against.

In scope:
- `docs/concept.md`
- `docs/mechanics.md`
- `docs/memory.md`
- gameplay-relevant notes under `docs/plans/`
- current runtime code under `backend/src/engine`, `backend/src/routes`, `backend/src/campaign`, `backend/src/character`, `backend/src/vectors`, `frontend/app/game`, and gameplay-facing frontend components
- relevant historical claims in `.planning/ROADMAP.md`

Out of scope:
- worldgen implementation changes
- non-game UI redesign work
- new gameplay mechanics not already claimed in docs
- direct bug fixing beyond tiny artifacts needed to complete the audit itself

</domain>

<decisions>
## Implementation Decisions

### D-01: `docs/` Is the Primary Intended-State Input
- The intended gameplay state for this phase comes from the whole `docs/` directory, not only old roadmap phases.
- `.planning/ROADMAP.md` is a secondary historical source used to catch drift and superseded promises.

### D-02: Code Is Evidence, Not Truth
- Runtime code is the fact source for what is currently wired.
- Code does not automatically override docs; the audit must classify mismatches explicitly.

### D-03: The Audit Must Classify, Not Hand-Wave
- Every gameplay claim reviewed by the audit must land in exactly one bucket:
  - implemented_and_wired
  - implemented_but_partial
  - documented_but_missing
  - outdated_or_contradicted
- “Looks okay” or “probably works” is not an acceptable classification.

### D-04: Deliverables Must Be Actionable for the Next Milestone
- The audit output must not be just a narrative report.
- It must identify:
  - what gameplay loops are already safe to trust
  - what loops are architecturally present but operationally dead
  - what state-authority seams break gameplay integrity
  - what items become mandatory scope for the next milestone

### D-05: Reconciliation Beats Retroactive Excuses
- If a documented behavior is superseded by newer architecture, the phase must say so explicitly and mark it deprecated/outdated instead of pretending it is still pending implementation.
- If a documented behavior is still intended, the phase must preserve it as a live requirement even if the current code does not honor it.

### D-06: Existing Gameplay Audit Findings Are Canonical Inputs
- The recent multi-agent gameplay audit already established several high-signal facts:
  - core turn runtime is live
  - post-turn simulation is not fully player-visible/atomic
  - reflection/progression loop is likely inert
  - rollback/checkpoint fidelity is incomplete
  - inventory/equipment authority is split
  - rich character ontology exists but runtime often consumes flattened tags
- Phase 36 should use these findings as starting evidence, not rediscover them from scratch.

### Claude's Discretion
- Exact artifact names for the audit outputs
- Whether to split the truth map by subsystem or by document
- Whether to emit one master report or a report plus a machine-readable checklist/table

</decisions>

<canonical_refs>
## Canonical References

### Primary Spec Sources
- `docs/concept.md`
- `docs/mechanics.md`
- `docs/memory.md`
- `docs/plans/2026-03-05-research-agent.md`
- `docs/plans/2026-03-06-player-character-creation.md`

### Historical / Planning Claims
- `.planning/ROADMAP.md`
- `.planning/PROJECT.md`
- `.planning/v1.0-v1.0-MILESTONE-AUDIT.md`
- `.planning/v1.0-MILESTONE-CLOSEOUT-CHECKLIST.md`

### Current Gameplay Runtime
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
- `backend/src/vectors/connection.ts`
- `frontend/app/game/page.tsx`
- `frontend/lib/api.ts`

### Recent Verification / Audit Anchors
- `.planning/phases/13-gameplay-playtest-ai-tuning/13-VERIFICATION.md`
- `.planning/phases/14-final-systems-verification-bug-fixing/14-VERIFICATION.md`
- `.planning/phases/29-unified-character-ontology-and-tag-system/29-VERIFICATION.md`
- `.planning/phases/30-start-conditions-canonical-loadouts-and-persona-templates/30-VERIFICATION.md`
- `.planning/phases/33-browser-e2e-verification-for-redesigned-creation-flows/33-VERIFICATION.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Already Confirmed as Live
- `/api/chat/action` drives the real gameplay path
- prompt assembly reads lore, episodic memory, world state, player state, NPC state, relationships, and start-condition context
- key-NPC present/off-screen simulation and faction ticks are post-turn hooks
- tool-based state mutation is real
- character save/handoff into `/game` is connected

### Already Confirmed as Partial or Risky
- post-turn sim runs outside the same visible turn contract
- undo/retry are not trustworthy for full world simulation
- checkpoints omit `config.json`
- runtime item mutations do not clearly sync all character loadout projections
- chat/gameplay routes still contain active-session coupling
- character ontology is richer than the runtime signals actually consumed

### Already Confirmed as Likely Inert or Underwired
- reflection trigger loop (`unprocessedImportance`) appears not to accumulate in live runtime
- Oracle `targetTags` contract exists but is not populated
- `inactiveTicks` appears mostly decorative
- NPC/world information flow is weaker than what docs imply

</code_context>

<specifics>
## Specific Ideas

- The user explicitly wants this phase kept inside the current milestone so the next milestone starts from a clean, honest gameplay baseline.
- The audit must answer “what was really implemented and connected, what was forgotten, what was simplified, and what drifted from docs.”
- The output should be suitable as the direct input to the next gameplay-focused milestone plan.

</specifics>

<deferred>
## Deferred Ideas

- Actual gameplay-fix implementation
- New feature requests that go beyond current docs/design intent
- Retroactive documentation rewrites beyond what is necessary to classify claims as outdated/deprecated

</deferred>

---

*Phase: 36-gameplay-docs-to-runtime-reconciliation-audit*
*Context gathered: 2026-04-08*

# Phase 71: Repair Worldgen Research Authority Boundary - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning
**Source:** Conversation-derived context from user correction after inspecting campaign `cc851187-f6fd-4e9e-9071-933cb056374b`

<domain>
## Phase Boundary

Phase 71 fixes the worldgen research authority boundary that caused a premise like "JJK world with Naruto power system" to become a Naruto-heavy crossover world. The phase should remove backend-owned semantic canon decisions from the research path and make premise interpretation an LLM-authored, inspectable artifact.

This phase is about worldgen/research architecture and regressions. It should not redesign gameplay turn processing, ScenePlan, combat, UI aesthetics, or the whole campaign creation wizard unless a small API/type change is needed to carry the corrected research artifact.

</domain>

<decisions>
## Implementation Decisions

### Backend Authority
- Backend code must not decide what a word, franchise, canon, primary subject, secondary subject, or "power system" means.
- Backend code may validate JSON shape, apply size limits, persist raw/user-approved/generated artifacts, run search providers, record provenance, and pass data between steps.
- Backend code must not convert an LLM interpretation into a deterministic backend-owned "canonical subject" that controls worldgen.
- Backend-owned normalization is allowed only for mechanical/structural concerns: trimming empty strings, de-duping exact lines, schema validation, caps, IDs, timestamps, storage paths, and similar reproducible operations.

### LLM Authority
- LLM owns semantic premise interpretation.
- LLM should receive the raw user premise and produce a research/source brief that says what to look up, why it is relevant, and how each source should be used.
- For mixed premises, LLM should distinguish the intended world basis from imported mechanics or thematic overlays when the premise implies that distinction.
- If the user's premise is ambiguous, the LLM research brief may preserve ambiguity explicitly instead of backend code resolving it.

### Required Example
- User premise: "JJK мир с системой сил из наруто" / "Jujutsu Kaisen world with Naruto power system."
- Expected interpretation: Jujutsu Kaisen is the primary world basis; Naruto is a power-system/mechanics overlay.
- Expected research behavior: gather JJK locations, institutions, factions, timeline, and characters for world structure; gather Naruto chakra/power-system mechanics only for ability-system integration.
- Forbidden behavior unless explicitly requested: importing Naruto geography, Hidden Villages, Five Great Nations, Naruto political factions, or Naruto cast into the generated world just because "Naruto power system" was mentioned.

### Existing Failure Evidence
- Campaign `cc851187-f6fd-4e9e-9071-933cb056374b` persisted `ipContext.franchise` as "Naruto and Jujutsu Kaisen".
- Its worldgen output imported Naruto-heavy structures: Five Great Nations, Land of Rivers, Hidden Mist Village, Hidden Cloud Village, Hidden Artisans Village, Mizukage/Raikage, Hashirama, and Tobirama.
- The bug is architectural: the backend accepted one LLM string as the canonical research subject, stored it, and later prompt assembly presented that string as authoritative context.

### Migration/Compatibility
- Preserve existing saved campaigns unless the phase explicitly adds an opt-in repair/regeneration path. Do not silently rewrite user campaign data.
- New data structures should read old `ipContext` fields compatibility-safely during a transition window.
- Existing worldbook and manual world knowledge flows should keep working; the repair targets automatic known-IP/franchise research and worldgen research framing.

### Testing Policy
- Add regression tests for both likely/search-verified and certain/direct model responses so the previous "certain -> use franchise directly" path cannot reintroduce the bug.
- Tests must prove that "JJK world with Naruto power system" does not feed Naruto locations/factions/cast as the primary world context.
- Tests should verify artifact boundary, not just string equality: source/search brief distinguishes primary world research from overlay mechanics research.

### the agent's Discretion
- Exact type names are open, but names should avoid claiming backend semantic authority. Prefer terms like `researchBrief`, `sourcePlan`, `researchPlan`, or `generationContext` over `canonicalSubject`.
- The planner may decide whether to replace `IpResearchContext` in one step or introduce an adapter layer first, as long as the plan keeps compatibility explicit.
- The planner may split this into multiple implementation plans if doing so keeps each plan under a clear context budget.

</decisions>

<canonical_refs>
## Canonical References

Downstream agents MUST read these before planning or implementing.

### Current Failure Path
- `backend/src/worldgen/ip-researcher.ts` - current `detectFranchise` and `researchKnownIP` path; direct `certain -> return object.franchise` is the known failure mode.
- `backend/src/worldgen/research-frame.ts` - current `WorldgenResearchFrame` and prompt block that says `Canonical subject: ${frame.franchise}`.
- `backend/src/routes/worldgen.ts` - route-level wiring that saves/loads IP context, premise divergence, and worldgen research frame.
- `backend/src/worldgen/scaffold-steps/prompt-utils.ts` - prompt utility surface that formats canonical names/IP context for scaffold steps.
- `backend/src/worldgen/scaffold-generator.ts` - scaffold orchestration that passes research/IP context into refined premise, locations, factions, and NPC generation.

### Regression Tests
- `backend/src/worldgen/__tests__/ip-researcher.test.ts` - existing mixed JJK/Naruto test only covers one path and must be expanded.
- `backend/src/routes/__tests__/worldgen.test.ts` - route-level worldgen request/response expectations.
- `backend/src/campaign/__tests__/manager.test.ts` - config persistence compatibility for IP/research artifacts.
- `backend/src/worldgen/__tests__/seed-suggester.test.ts` - seed suggestions and premise divergence use research context.
- `backend/src/worldgen/__tests__/scaffold-resilience.test.ts` - scaffold generation prompt resilience around known-IP context.

### Concrete Campaign Evidence
- `campaigns/cc851187-f6fd-4e9e-9071-933cb056374b/config.json` - persisted bad research framing and Naruto-heavy generated premise/seeds.
- `campaigns/cc851187-f6fd-4e9e-9071-933cb056374b/state.db` - generated locations/factions/NPCs showing Naruto-heavy world structure.

</canonical_refs>

<specifics>
## Specific Ideas

- Replace single-string `franchise` as the controlling worldgen research subject with an LLM-authored source/research brief.
- Treat raw premise as the durable user request; treat LLM interpretation as generated context with provenance, not backend truth.
- Have the LLM produce search jobs such as "Jujutsu Kaisen pre-Shibuya institutions and geography" and "Naruto chakra mechanics and chakra network rules" with usage intent for each job.
- Prompt downstream worldgen with source usage rules instead of `Canonical subject`.
- Preserve deterministic backend responsibilities: schema validation, exact de-dupe, persistence, search execution, provenance, and failure handling.

</specifics>

<deferred>
## Deferred Ideas

- Full UI redesign for reviewing/editing the research brief is out of scope unless required for a minimal verification/debug surface.
- Automatic repair of already-generated campaigns is out of scope by default; add only an explicit opt-in repair plan if planner finds it necessary.
- Gameplay turn narration quality is out of scope; Phase 71 stops at worldgen research/premise authority.

</deferred>

---

*Phase: 71-repair-worldgen-research-authority-boundary-so-llm-owns-prem*
*Context gathered: 2026-04-26 via conversation-derived planning context*

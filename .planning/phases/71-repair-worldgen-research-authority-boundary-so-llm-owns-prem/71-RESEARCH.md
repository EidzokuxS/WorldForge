# Phase 71: Repair Worldgen Research Authority Boundary - Research

**Researched:** 2026-04-26
**Domain:** Worldgen known-IP research authority boundary
**Confidence:** HIGH for listed code surfaces, MEDIUM for uninspected adjacent consumers

<user_constraints>
## User Constraints (from CONTEXT.md)

Source for copied constraints: [VERIFIED: .planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-CONTEXT.md]

### Locked Decisions

#### Backend Authority
- Backend code must not decide what a word, franchise, canon, primary subject, secondary subject, or "power system" means.
- Backend code may validate JSON shape, apply size limits, persist raw/user-approved/generated artifacts, run search providers, record provenance, and pass data between steps.
- Backend code must not convert an LLM interpretation into a deterministic backend-owned "canonical subject" that controls worldgen.
- Backend-owned normalization is allowed only for mechanical/structural concerns: trimming empty strings, de-duping exact lines, schema validation, caps, IDs, timestamps, storage paths, and similar reproducible operations.

#### LLM Authority
- LLM owns semantic premise interpretation.
- LLM should receive the raw user premise and produce a research/source brief that says what to look up, why it is relevant, and how each source should be used.
- For mixed premises, LLM should distinguish the intended world basis from imported mechanics or thematic overlays when the premise implies that distinction.
- If the user's premise is ambiguous, the LLM research brief may preserve ambiguity explicitly instead of backend code resolving it.

#### Required Example
- User premise: "JJK мир с системой сил из наруто" / "Jujutsu Kaisen world with Naruto power system."
- Expected interpretation: Jujutsu Kaisen is the primary world basis; Naruto is a power-system/mechanics overlay.
- Expected research behavior: gather JJK locations, institutions, factions, timeline, and characters for world structure; gather Naruto chakra/power-system mechanics only for ability-system integration.
- Forbidden behavior unless explicitly requested: importing Naruto geography, Hidden Villages, Five Great Nations, Naruto political factions, or Naruto cast into the generated world just because "Naruto power system" was mentioned.

#### Existing Failure Evidence
- Campaign `cc851187-f6fd-4e9e-9071-933cb056374b` persisted `ipContext.franchise` as "Naruto and Jujutsu Kaisen".
- Its worldgen output imported Naruto-heavy structures: Five Great Nations, Land of Rivers, Hidden Mist Village, Hidden Cloud Village, Hidden Artisans Village, Mizukage/Raikage, Hashirama, and Tobirama.
- The bug is architectural: the backend accepted one LLM string as the canonical research subject, stored it, and later prompt assembly presented that string as authoritative context.

#### Migration/Compatibility
- Preserve existing saved campaigns unless the phase explicitly adds an opt-in repair/regeneration path. Do not silently rewrite user campaign data.
- New data structures should read old `ipContext` fields compatibility-safely during a transition window.
- Existing worldbook and manual world knowledge flows should keep working; the repair targets automatic known-IP/franchise research and worldgen research framing.

#### Testing Policy
- Add regression tests for both likely/search-verified and certain/direct model responses so the previous "certain -> use franchise directly" path cannot reintroduce the bug.
- Tests must prove that "JJK world with Naruto power system" does not feed Naruto locations/factions/cast as the primary world context.
- Tests should verify artifact boundary, not just string equality: source/search brief distinguishes primary world research from overlay mechanics research.

### Claude's Discretion

#### the agent's Discretion
- Exact type names are open, but names should avoid claiming backend semantic authority. Prefer terms like `researchBrief`, `sourcePlan`, `researchPlan`, or `generationContext` over `canonicalSubject`.
- The planner may decide whether to replace `IpResearchContext` in one step or introduce an adapter layer first, as long as the plan keeps compatibility explicit.
- The planner may split this into multiple implementation plans if doing so keeps each plan under a clear context budget.

### Deferred Ideas (OUT OF SCOPE)

- Full UI redesign for reviewing/editing the research brief is out of scope unless required for a minimal verification/debug surface.
- Automatic repair of already-generated campaigns is out of scope by default; add only an explicit opt-in repair plan if planner finds it necessary.
- Gameplay turn narration quality is out of scope; Phase 71 stops at worldgen research/premise authority.
</user_constraints>

## Summary

Phase 71 should replace backend-owned `franchise` authority with an LLM-authored research artifact that keeps raw premise, source usage rules, search jobs, search results, and generated research context together. [VERIFIED: 71-CONTEXT.md; backend/src/worldgen/ip-researcher.ts:61-90; backend/src/worldgen/research-frame.ts:5-124]

Current failure path is direct: `detectFranchise` asks for a canonical franchise name, returns `object.franchise` immediately on `confidence === "certain"`, `researchViaWebSearch` builds all research jobs from that string, `resolveWorldgenResearchFrame` stores `ipContext.franchise` as the frame franchise, and prompt builders present it as `Canonical subject` / `FRANCHISE REFERENCE`. [VERIFIED: backend/src/worldgen/ip-researcher.ts:40-46,61-90,207-275; backend/src/routes/worldgen.ts:172-190,396-426; backend/src/worldgen/research-frame.ts:103-124; backend/src/worldgen/scaffold-steps/prompt-utils.ts:35-99]

**Primary recommendation:** introduce `WorldgenResearchArtifact` version 2 as the authority artifact, keep `IpResearchContext` as a legacy compatibility input, and rewrite prompt assembly to consume source usage rules instead of `franchise` as canon. [VERIFIED: 71-CONTEXT.md; shared/src/types.ts:111-140; backend/src/campaign/manager.ts:27-33,345-397]

## Project Constraints (from CLAUDE.md / AGENTS.md)

- Backend stack is Node.js/TypeScript strict with Hono, Vercel AI SDK, Drizzle, better-sqlite3, LanceDB, and Zod. [VERIFIED: CLAUDE.md; backend/package.json]
- All API payloads and AI tool/output schemas should use Zod validation. [VERIFIED: CLAUDE.md; backend/src/worldgen/ip-researcher.ts:1-3,40-51,169-186,328-335]
- Route handlers should keep outer try/catch and `parseBody()` validation style. [VERIFIED: CLAUDE.md; backend/src/routes/worldgen.ts:219-290,519-607]
- Shared types/constants belong in `@worldforge/shared` instead of duplicated backend-only type surfaces when they cross backend/frontend or persistence boundaries. [VERIFIED: CLAUDE.md; shared/src/types.ts:111-140]
- Before implementation edits, run GitNexus impact for changed symbols; `buildIpContextBlock` and `interpretPremiseDivergence` already show HIGH risk, so implementation should split those edits and verify direct consumers. [VERIFIED: AGENTS.md; GitNexus impact: buildIpContextBlock, interpretPremiseDivergence]
- Before committing implementation, run `gitnexus_detect_changes()`. [VERIFIED: AGENTS.md]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Raw premise capture | API / Backend | Database / Storage | Backend receives and persists the user's text without interpreting meaning. [VERIFIED: 71-CONTEXT.md; backend/src/campaign/manager.ts:148-165] |
| Premise interpretation | LLM / Generator role | API / Backend | LLM authors meaning and ambiguity; backend validates artifact shape only. [VERIFIED: 71-CONTEXT.md] |
| Search execution | API / Backend | External search provider | Backend can execute LLM-authored search jobs and record provenance without deciding canon. [VERIFIED: 71-CONTEXT.md; backend/src/worldgen/ip-researcher.ts:223-241] |
| Generated research context | LLM / Generator role | Database / Storage | LLM compiles facts from results; backend stores generated artifact and provenance. [VERIFIED: 71-CONTEXT.md; backend/src/worldgen/ip-researcher.ts:243-275] |
| Prompt consumption | API / Backend | LLM / Generator role | Backend formats approved/generated artifact into prompts, but source usage semantics come from the artifact. [VERIFIED: backend/src/worldgen/scaffold-steps/prompt-utils.ts:35-203] |
| Legacy campaign compatibility | API / Backend | Database / Storage | Existing config persists `ipContext`, `premiseDivergence`, and `worldgenResearchFrame`; reader path must remain tolerant. [VERIFIED: backend/src/campaign/manager.ts:27-33,345-397] |

## Standard Stack

### Core

| Library | Local Version | Registry Check | Purpose | Why Standard |
|---------|---------------|----------------|---------|--------------|
| `zod` | `^4.3.6` | `4.3.6`, modified 2026-01-25 | Validate LLM artifacts and route payloads. | Existing backend schema standard. [VERIFIED: backend/package.json; npm view zod] |
| `ai` | `^6.0.106` | `6.0.168`, modified 2026-04-20 | Structured LLM output via local `safeGenerateObject` wrapper. | Existing worldgen generation path uses it. [VERIFIED: backend/package.json; backend/src/worldgen/ip-researcher.ts:1,71-85] |
| `hono` | `^4.12.3` | `4.12.15`, modified 2026-04-24 | API routing. | Existing worldgen routes use Hono handlers. [VERIFIED: backend/package.json; backend/src/routes/worldgen.ts] |
| `typescript` | `^5.9.3` | `6.0.3`, modified 2026-04-16 | Static type boundary. | Existing backend typecheck command uses `tsc --noEmit`. [VERIFIED: backend/package.json] |

### Supporting

| Library | Local Version | Purpose | When to Use |
|---------|---------------|---------|-------------|
| `vitest` | `^3.2.4` | Regression tests. | Use for `ip-researcher`, `research-frame`/new artifact formatter, route persistence, and scaffold prompt tests. [VERIFIED: backend/package.json; backend/vitest.config.ts] |
| Existing `webSearch` wrapper | local | Search execution. | Execute search jobs authored by LLM artifact; keep provider/key selection deterministic. [VERIFIED: backend/src/worldgen/ip-researcher.ts:9,223-228; backend/src/routes/worldgen.ts:162-170] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Replace every `IpResearchContext` consumer immediately | Adapter from artifact v2 to legacy `IpResearchContext` during transition | Adapter lowers blast radius but must not synthesize semantic primary/overlay decisions. [VERIFIED: shared/src/types.ts:111-140; GitNexus impact: buildIpContextBlock HIGH] |
| Keep `WorldgenResearchFrame.version = 1` | Add `WorldgenResearchArtifact.version = 2` and deprecate frame v1 | New artifact avoids overloading `franchise`; old frame remains read-only compatibility. [VERIFIED: backend/src/worldgen/research-frame.ts:5-13; backend/src/campaign/manager.ts:380-397] |

**Installation:** no new dependency recommended. [VERIFIED: backend/package.json]

## Architecture Patterns

### System Architecture Diagram

```text
User premise + optional knownIP/worldbook
  -> API validates request shape
  -> LLM authors researchBrief/sourcePlan
       -> ambiguity preserved when needed
       -> source usage rules define world basis vs overlay
       -> searchJobs define query + purpose + useFor
  -> Backend validates artifact schema, caps, IDs
  -> Backend executes searchJobs
  -> Backend stores searchResults + provenance
  -> LLM compiles generatedContext from results under source usage rules
  -> Backend persists WorldgenResearchArtifact v2
  -> Prompt builders render APPROVED RESEARCH CONTEXT
  -> Scaffold/seed/regenerate steps consume artifact, not canonical subject string
```

### Recommended Project Structure

```text
backend/src/worldgen/
├── research-artifact.ts        # v2 artifact types, Zod schemas, formatter helpers
├── ip-researcher.ts            # orchestration: LLM brief -> search -> generated context
├── research-frame.ts           # legacy v1 adapter/read support only after migration
├── retrieval-intent.ts         # either retire deterministic topic classifier or limit to exact mechanical job caps
└── __tests__/
    ├── ip-researcher.test.ts   # direct/certain and likely/search regression paths
    └── research-artifact.test.ts
```

### Pattern 1: LLM-Authored Research Artifact

**What:** Store one inspectable artifact with raw premise, LLM interpretation, source usage rules, LLM-authored search jobs, search results, generated context, and provenance. [VERIFIED: 71-CONTEXT.md]

**When to use:** Automatic known-IP/franchise research and later worldgen prompt framing. [VERIFIED: 71-CONTEXT.md; backend/src/routes/worldgen.ts:219-290,340-456,519-595]

**Recommended shape:**

```ts
export interface WorldgenResearchArtifactV2 {
  version: 2;
  rawPremise: string;
  rawKnownIP?: string | null;
  researchBrief: {
    interpretationSummary: string;
    ambiguityNotes: string[];
    sourceUsageRules: Array<{
      sourceLabel: string;
      role: "world_basis" | "mechanics_overlay" | "tone_overlay" | "reference_only" | "ambiguous";
      useFor: Array<"locations" | "factions" | "npcs" | "timeline" | "power_system" | "tone" | "terminology">;
      avoidFor: Array<"locations" | "factions" | "npcs" | "timeline" | "power_system" | "tone" | "terminology">;
      rationale: string;
    }>;
    searchJobs: Array<{
      id: string;
      sourceLabel: string;
      query: string;
      purpose: string;
      useFor: Array<"locations" | "factions" | "npcs" | "timeline" | "power_system" | "tone" | "terminology">;
    }>;
  };
  searchResults: Array<{ jobId: string; title: string; description: string; url: string }>;
  generatedContext: {
    keyFacts: string[];
    tonalNotes: string[];
    canonicalNames?: { locations?: string[]; factions?: string[]; characters?: string[] };
  };
  provenance: { createdAt: string; model?: string; searchProvider?: string };
}
```

### Pattern 2: Legacy Compatibility Adapter

**What:** Read legacy `ipContext` and `worldgenResearchFrame` without rewriting saved campaigns; write v2 artifact for new research. [VERIFIED: 71-CONTEXT.md; backend/src/campaign/manager.ts:345-397]

**When to use:** Generate/regenerate path when old config has only `ipContext`, or request body still sends `_ipContext` from old frontend flow. [VERIFIED: backend/src/routes/worldgen.ts:366-376,535-549]

**Rule:** Adapter may expose old facts as "legacy approved research context"; it must not infer primary/overlay roles from old `franchise`. [VERIFIED: 71-CONTEXT.md]

### Anti-Patterns to Avoid

- **`certain -> return object.franchise`:** It turns one model string into backend-owned canon. [VERIFIED: backend/src/worldgen/ip-researcher.ts:87-90]
- **`Canonical subject: ${frame.franchise}`:** It tells downstream LLMs that backend has resolved the setting. [VERIFIED: backend/src/worldgen/research-frame.ts:113-124]
- **Search job prefix `${franchise} ...` for every topic:** It collapses mixed-source usage into one subject. [VERIFIED: backend/src/worldgen/retrieval-intent.ts:92-117]
- **Prompt rules saying "Build the canonical world from this FRANCHISE REFERENCE":** It overrides the raw premise and source usage distinctions. [VERIFIED: backend/src/worldgen/scaffold-steps/prompt-utils.ts:35-99]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Semantic primary/overlay detection | Regex/franchise classifier in backend | LLM-authored `researchBrief.sourceUsageRules` | User locked LLM authority for semantics. [VERIFIED: 71-CONTEXT.md] |
| JSON validation | Manual property checks | Zod schemas | Existing backend standard and current researcher pattern. [VERIFIED: CLAUDE.md; backend/src/worldgen/ip-researcher.ts] |
| Search job semantics | Deterministic topic classifier as authority | LLM-authored `searchJobs` plus deterministic caps/dedupe | Current classifier prefixes all jobs with one `franchise`. [VERIFIED: backend/src/worldgen/retrieval-intent.ts:92-149] |
| Campaign data migration | Silent rewrite of old config | Read-compatible adapter and explicit opt-in repair only | Context forbids silent saved campaign rewrite. [VERIFIED: 71-CONTEXT.md] |

**Key insight:** backend should enforce artifact integrity, not artifact meaning. [VERIFIED: 71-CONTEXT.md]

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `config.json` can store `ipContext`, `premiseDivergence`, and `worldgenResearchFrame`. [VERIFIED: backend/src/campaign/manager.ts:27-33,345-397] | Add v2 field read/write; keep old fields readable; do not silently mutate existing campaigns. [VERIFIED: 71-CONTEXT.md] |
| Live service config | No phase-specific live service config found in targeted files; search provider settings are loaded from app settings. [VERIFIED: backend/src/routes/worldgen.ts:162-170] | No live-service migration planned; tests should mock search. [VERIFIED: backend/src/worldgen/__tests__/ip-researcher.test.ts:21-32] |
| OS-registered state | None identified in targeted files. [VERIFIED: targeted code read] | None. |
| Secrets/env vars | Search provider API keys are passed through `settings.research` and not renamed by this phase. [VERIFIED: backend/src/routes/worldgen.ts:162-170; backend/src/worldgen/ip-researcher.ts:300-307] | Do not rename keys. |
| Build artifacts | No build artifact dependency found in targeted files. [VERIFIED: targeted code read] | Run typecheck/tests after implementation; no artifact cleanup needed for research. |

## Current Surfaces To Change

| Surface | Current Behavior | Required Planning Note |
|---------|------------------|------------------------|
| `franchiseDetectionSchema` | Requests `franchise` as canonical franchise name. [VERIFIED: backend/src/worldgen/ip-researcher.ts:40-46] | Replace with research brief/source plan schema; keep raw knownIP as input only. |
| `detectFranchise` | Returns `object.franchise` directly when certain. [VERIFIED: backend/src/worldgen/ip-researcher.ts:87-90] | Remove direct string authority path. |
| `researchViaWebSearch` | Builds retrieval jobs from one `franchise` string and compiles all facts for that subject. [VERIFIED: backend/src/worldgen/ip-researcher.ts:207-275] | Execute LLM-authored `searchJobs`; compile under source usage rules. |
| `evaluateResearchSufficiency` | Evaluates research about `ipContext.franchise` and asks for missing canon topics. [VERIFIED: backend/src/worldgen/ip-researcher.ts:342-439] | Evaluate generated context against artifact usage rules and current step. |
| `WorldgenResearchFrame` | Stores `franchise` and renders `Canonical subject`. [VERIFIED: backend/src/worldgen/research-frame.ts:5-124] | Replace or deprecate with artifact prompt block. |
| `resolveWorldgenResearchFrame` | Builds frame from `ipContext.franchise` in generate/regenerate. [VERIFIED: backend/src/routes/worldgen.ts:172-190,420-426,543-549] | Resolve artifact first; avoid rebuilding semantics from legacy context. |
| `suggest-seeds` wiring | Uses explicit `franchise` request field to trigger `researchKnownIP`; falls back premise to `A world based on ${ipContext.franchise}`. [VERIFIED: backend/src/routes/worldgen.ts:233-270] | Return/persist artifact; fallback wording must not claim canonical subject. |
| `generate` wiring | Saves body `ipContext`, loads cache, runs on-demand research, saves frame, passes `ipContext` and `researchFrame`. [VERIFIED: backend/src/routes/worldgen.ts:365-456] | Accept body artifact, load artifact, run v2 research on demand, pass artifact. |
| `regenerate-section` wiring | Loads `ipContext`, rebuilds frame, then enriches context by section. [VERIFIED: backend/src/routes/worldgen.ts:519-595] | Load artifact and use step-scoped source rules for enrichment. |
| `prompt-utils` | Emits canonical-world rules and canonical-name lists from `ipContext.franchise`. [VERIFIED: backend/src/worldgen/scaffold-steps/prompt-utils.ts:25-203] | Rename formatter to research context; render source usage rules; remove canonical-subject language. |

## Regression Tests

| Test | File | Assertion |
|------|------|-----------|
| Direct/certain path | `backend/src/worldgen/__tests__/ip-researcher.test.ts` | Model response that labels both "Naruto and Jujutsu Kaisen" as certain must still produce artifact rules: JJK `world_basis`, Naruto `mechanics_overlay`; no backend `franchise` string controls search. [VERIFIED: current direct path at backend/src/worldgen/ip-researcher.ts:87-90] |
| Likely/search path | `backend/src/worldgen/__tests__/ip-researcher.test.ts` | Likely detection plus search verification must not rewrite the brief into one canonical franchise; JJK searches cover locations/factions/timeline/NPCs; Naruto searches cover power system only. [VERIFIED: current likely test at backend/src/worldgen/__tests__/ip-researcher.test.ts:143-173] |
| Search job boundary | `backend/src/worldgen/__tests__/ip-researcher.test.ts` or new `research-artifact.test.ts` | No search query for Naruto locations, Hidden Villages, Five Great Nations, Hokage/Raikage/Mizukage, or Naruto cast unless LLM artifact marks Naruto for those `useFor` categories. [VERIFIED: 71-CONTEXT.md] |
| Prompt block | new `research-artifact.test.ts` | Rendered block contains no `Canonical subject` and no "Build the canonical world from this FRANCHISE REFERENCE" wording. [VERIFIED: backend/src/worldgen/research-frame.ts:113; backend/src/worldgen/scaffold-steps/prompt-utils.ts:45-52] |
| Route persistence | `backend/src/routes/__tests__/worldgen.test.ts` | `suggest-seeds` returns `_researchArtifact`; `generate` saves/loads artifact; `regenerate-section` passes artifact into sufficiency/enrichment. [VERIFIED: backend/src/routes/worldgen.ts:286-290,365-456,519-595] |
| Legacy compatibility | `backend/src/campaign/__tests__/manager.test.ts` | Existing `ipContext`/`worldgenResearchFrame` configs still load; new artifact persists beside old fields during transition. [VERIFIED: backend/src/campaign/manager.ts:27-33,345-397] |
| Shared prompt consumers | targeted tests around seed/scaffold/lore prompt helpers | High-risk `buildIpContextBlock` consumers still receive old worldbook/manual context, while auto-research uses new source rules. [VERIFIED: GitNexus impact: buildIpContextBlock HIGH] |

Quick commands:

```bash
npm --prefix backend run test -- src/worldgen/__tests__/ip-researcher.test.ts
npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts
npm --prefix backend run test -- src/campaign/__tests__/manager.test.ts
npm --prefix backend run typecheck
```

## Common Pitfalls

### Pitfall 1: Replacing `franchise` Name But Keeping Same Authority
**What goes wrong:** Code renames `franchise` to `subject` or `primarySource`, then still prefixes all jobs and prompt rules with that value. [VERIFIED: backend/src/worldgen/retrieval-intent.ts:92-117]
**How to avoid:** Search jobs must be authored by the LLM artifact with source-specific usage categories. [VERIFIED: 71-CONTEXT.md]

### Pitfall 2: Breaking Worldbook Flows
**What goes wrong:** `buildIpContextBlock` changes globally and breaks selected worldbook/manual context prompts. [VERIFIED: backend/src/routes/worldgen.ts:241-255,378-393; GitNexus impact: buildIpContextBlock HIGH]
**How to avoid:** Add a new formatter for v2 auto-research artifacts; keep legacy `IpResearchContext` formatter until consumers migrate. [VERIFIED: shared/src/types.ts:111-140]

### Pitfall 3: Testing Only String Equality
**What goes wrong:** A test passes because `result.franchise === "Jujutsu Kaisen"`, while generated context still includes Naruto geography. [VERIFIED: backend/src/worldgen/__tests__/ip-researcher.test.ts:143-173; 71-CONTEXT.md]
**How to avoid:** Assert source usage roles, search job topics, forbidden Naruto world-structure leakage, and prompt block wording. [VERIFIED: 71-CONTEXT.md]

### Pitfall 4: Silent Campaign Repair
**What goes wrong:** Implementation rewrites old campaign config or generated world state. [VERIFIED: 71-CONTEXT.md]
**How to avoid:** Only add read-compatible adapter by default; make repair explicit and opt-in if added. [VERIFIED: 71-CONTEXT.md]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Backend stores canonical `franchise` and uses it as world subject. [VERIFIED: shared/src/types.ts:111-130] | Store LLM-authored `researchBrief` with source usage rules and generated context. [VERIFIED: 71-CONTEXT.md] | Phase 71 | Prevents a mechanics overlay from becoming world canon. [VERIFIED: 71-CONTEXT.md] |
| Deterministic retrieval jobs derive from one franchise string. [VERIFIED: backend/src/worldgen/retrieval-intent.ts:92-149] | LLM emits search jobs with purpose/useFor/source label; backend executes mechanically. [VERIFIED: 71-CONTEXT.md] | Phase 71 | Preserves mixed-premise source boundaries. [VERIFIED: 71-CONTEXT.md] |
| Prompt block says `Canonical subject`. [VERIFIED: backend/src/worldgen/research-frame.ts:113] | Prompt block says approved/generated research context and usage rules. [VERIFIED: 71-CONTEXT.md] | Phase 71 | Removes backend semantic authority from downstream prompts. [VERIFIED: 71-CONTEXT.md] |

**Deprecated/outdated:**
- `WorldgenResearchFrame.franchise` as authoritative subject. [VERIFIED: backend/src/worldgen/research-frame.ts:5-13,113]
- `buildFlatIpContextBlock` rules that make the franchise reference the canonical baseline for every scaffold step. [VERIFIED: backend/src/worldgen/scaffold-steps/prompt-utils.ts:35-55]
- `buildWorldgenResearchPlan` as semantic source planner for mixed premises. [VERIFIED: backend/src/worldgen/retrieval-intent.ts:125-149]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No OS-registered state or build artifact migration is needed beyond targeted files. [ASSUMED] | Runtime State Inventory | Low; implementation can re-check if schema/type rename expands beyond campaign config. |

## Open Questions (RESOLVED)

1. **Should v2 artifact live in `@worldforge/shared` immediately?**
   - Resolution: yes. Plan 71-01 puts persistence/API-facing `WorldgenResearchArtifactV2` and supporting unions in `shared/src/types.ts` and exports them from `shared/src/index.ts`.
   - Rationale: the artifact is persisted in campaign config and passed through route contracts, so it crosses backend/storage/API boundaries. Keeping the type in `@worldforge/shared` follows project convention for shared persisted/API shapes. [VERIFIED: CLAUDE.md; shared/src/types.ts:111-140; backend/src/campaign/manager.ts:21,27-33]
   - Boundary: this does not add a UI redesign. Frontend inspection/editing remains deferred by 71-CONTEXT.md.

2. **Should legacy `premiseDivergence` remain separate?**
   - Resolution: yes, keep `premiseDivergence` separate during Phase 71.
   - Rationale: Phase 71 repairs the automatic known-IP/worldgen research authority boundary. Merging `premiseDivergence` into the v2 artifact would widen scope into high-risk existing consumers and is not required to remove backend-owned canonical subject behavior. [VERIFIED: shared/src/types.ts:86-97; backend/src/worldgen/premise-divergence.ts:94-130; GitNexus impact: interpretPremiseDivergence HIGH]
   - Boundary: Plans 71-05 and 71-07 keep legacy compatibility explicit and avoid touching `interpretPremiseDivergence` unless implementation discovers an unavoidable consumer update.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | backend tests/typecheck | yes | `v23.11.0` | none needed [VERIFIED: shell `node --version`] |
| npm | backend scripts | yes | `11.12.1` | none needed [VERIFIED: shell `npm --version`] |
| Vitest | regression tests | yes via backend package | local `^3.2.4`; registry `4.1.5` | keep local version; upgrade out of scope [VERIFIED: backend/package.json; npm view vitest] |
| Search provider keys | live research execution | not audited | settings-driven | mock in tests; live key setup out of scope [VERIFIED: backend/src/routes/worldgen.ts:162-170] |

**Missing dependencies with no fallback:** none found for planning/tests. [VERIFIED: backend/package.json]

**Missing dependencies with fallback:** live search keys not audited; tests use mocked `webSearch`. [VERIFIED: backend/src/worldgen/__tests__/ip-researcher.test.ts:21-32]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest, local `^3.2.4` [VERIFIED: backend/package.json] |
| Config file | `backend/vitest.config.ts` includes `src/**/*.test.ts` [VERIFIED: backend/vitest.config.ts] |
| Quick run command | `npm --prefix backend run test -- src/worldgen/__tests__/ip-researcher.test.ts` |
| Full backend suite command | `npm --prefix backend run test` |
| Typecheck command | `npm --prefix backend run typecheck` [VERIFIED: backend/package.json] |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| P71-R1 | direct/certain model response cannot become backend canonical subject | unit | `npm --prefix backend run test -- src/worldgen/__tests__/ip-researcher.test.ts` | yes, extend |
| P71-R2 | likely/search path preserves JJK world basis and Naruto power overlay | unit | `npm --prefix backend run test -- src/worldgen/__tests__/ip-researcher.test.ts` | yes, extend |
| P71-R3 | generated prompt block omits `Canonical subject` and canonical franchise rules | unit | `npm --prefix backend run test -- src/worldgen/__tests__/research-artifact.test.ts` | no, Wave 0 |
| P71-R4 | suggest/generate/regenerate persist and pass v2 artifact | route unit | `npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts` | yes, extend |
| P71-R5 | campaign config reads old fields and writes new artifact without silent repair | unit | `npm --prefix backend run test -- src/campaign/__tests__/manager.test.ts` | yes, extend |

### Sampling Rate

- **Per task commit:** relevant focused Vitest file plus `npm --prefix backend run typecheck`.
- **Per wave merge:** `npm --prefix backend run test` plus `npm --prefix backend run typecheck`.
- **Phase gate:** backend tests and typecheck green before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `backend/src/worldgen/__tests__/research-artifact.test.ts` - covers prompt formatting and artifact schema.
- [ ] route/campaign test fixture for `WorldgenResearchArtifactV2`.
- [ ] direct/certain and likely/search JJK/Naruto tests expanded beyond string equality.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | No auth/session behavior changes in targeted phase. [VERIFIED: targeted code read] |
| V3 Session Management | no | No session behavior changes in targeted phase. [VERIFIED: targeted code read] |
| V4 Access Control | no | No access-control behavior changes in targeted phase. [VERIFIED: targeted code read] |
| V5 Validation, Sanitization and Encoding | yes | Zod schemas, string caps, exact dedupe, and prompt rendering boundaries. [VERIFIED: OWASP ASVS page; backend/src/worldgen/ip-researcher.ts:169-186; backend/src/worldgen/research-frame.ts:21-63] |
| V6 Stored Cryptography | no | No secret/crypto storage changes planned. [VERIFIED: targeted code read] |
| V13 API and Web Service | yes | Route payloads continue through `parseBody()` schemas. [VERIFIED: OWASP ASVS page; backend/src/routes/worldgen.ts:219-225,519-522] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection through user premise/search snippets | Tampering | Treat premise/results as data inside structured prompts; validate artifact shape; do not let backend infer hidden semantics. [VERIFIED: 71-CONTEXT.md; backend/src/worldgen/ip-researcher.ts:243-275] |
| Oversized LLM artifact | Denial of Service | Zod max lengths, array caps, `clampTokens`, search job caps. [VERIFIED: backend/src/worldgen/ip-researcher.ts:328-335,382-383,419-421] |
| Data provenance loss | Repudiation | Store job IDs, result URLs, provider/model metadata in artifact. [VERIFIED: 71-CONTEXT.md; backend/src/worldgen/ip-researcher.ts:198-203,223-241] |

## Sources

### Primary (HIGH confidence)
- `.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-CONTEXT.md` - user decisions, required regression, scope.
- `backend/src/worldgen/ip-researcher.ts` - detection, research, sufficiency paths.
- `backend/src/worldgen/research-frame.ts` - current canonical subject frame.
- `backend/src/routes/worldgen.ts` - suggest/generate/regenerate wiring.
- `backend/src/worldgen/scaffold-steps/prompt-utils.ts` - prompt authority language.
- `backend/src/worldgen/__tests__/ip-researcher.test.ts` - current mixed-premise test coverage.
- `shared/src/types.ts` and `backend/src/campaign/manager.ts` - persisted context shapes.
- GitNexus impact reports - risk levels for `researchKnownIP`, `evaluateResearchSufficiency`, `buildWorldgenResearchFrame`, `buildIpContextBlock`, `interpretPremiseDivergence`.

### Secondary (MEDIUM confidence)
- `backend/src/worldgen/retrieval-intent.ts` - deterministic retrieval job construction.
- `backend/src/worldgen/premise-divergence.ts` and `backend/src/worldgen/scaffold-generator.ts` - adjacent consumers.
- `backend/package.json`, `backend/vitest.config.ts`, `npm view` checks - local and registry versions.
- OWASP ASVS project page - ASVS purpose/categories reference. [CITED: https://owasp.org/www-project-application-security-verification-standard/]

### Tertiary (LOW confidence)
- Runtime inventory categories outside campaign config, because strict context budget prevented broad runtime scans. [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - package and registry versions checked.
- Architecture: HIGH - direct failure path and user decision are explicit.
- Pitfalls: HIGH for listed files, MEDIUM for adjacent prompt consumers not fully read.
- Runtime inventory: MEDIUM - campaign config verified; OS/live service/build state limited by strict context budget.

**Research date:** 2026-04-26
**Valid until:** 2026-05-03 for implementation planning, because local branch is dirty and worldgen code may move.

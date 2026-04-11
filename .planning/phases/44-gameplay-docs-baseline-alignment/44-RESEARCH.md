# Phase 44: Gameplay Docs Baseline Alignment - Research

**Researched:** 2026-04-11
**Domain:** Gameplay documentation reconciliation against live runtime contracts
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Claude's Discretion
- Exact chapter structure and whether contract clarifications live inline, as callouts, or as dedicated “Deprecated / Replaced” subsections
- Exact amount of low-level implementation detail to include in each document, as long as the resulting docs stay truthful and planning-grade
- Exact cross-linking strategy between `concept.md`, `mechanics.md`, `memory.md`, and `tech_stack.md`
- Exact wording for unresolved Phase 38 inventory/equipment truth, as long as it stays explicitly honest

### Deferred Ideas (OUT OF SCOPE)
- Non-game UX documentation overhaul outside gameplay-baseline truth.
- Broader world-source/library product documentation beyond what directly shapes gameplay semantics.
- Milestone-level exploratory playtest writeups; those belong to closeout/verification artifacts, not to the gameplay baseline itself.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOCA-01 | Every gameplay claim elevated by Phase 36 Group B and Group C is resolved as either implemented behavior or an explicit deprecation in docs. | Authority model, Phase 36 claim groups, deprecation workflow, and stale-claim inventory below define how to resolve each claim without silent rewrites. |
| DOCA-02 | Gameplay docs describe the live structured character/runtime model accurately, including the role of derived tags versus canonical character data. | Character-record-first findings, adapter/runtime-tag examples, and pending Phase 38 wording guidance define the truthful character/state baseline. |
| DOCA-03 | Gameplay docs describe the real retrieval, memory, and prompt contracts accurately enough to serve as a planning baseline for later milestones. | Prompt-assembly, retrieval, reflection-budget, transport, and location-history findings define the exact memory/retrieval/prompt contract the docs must describe. |
</phase_requirements>

## Summary

Phase 44 should be planned as a claim-reconciliation rewrite, not as a documentation polish pass. The live runtime contract now exists across Phases 29, 30, 42, and 43, but the docs still mix repaired behavior with stale pre-repair assumptions. The main planning job is to assign clear authority: `docs/mechanics.md` and `docs/memory.md` become the normative gameplay baseline, `docs/concept.md` becomes the high-level product/system contract, and `docs/tech_stack.md` becomes technical reference only.

The biggest documentation risks are now well defined. The docs still overstate tag primacy, world-source wiki ingest, keyword+vector lore retrieval, reflection threshold semantics, WebSocket gameplay transport, and older scaffold/layout claims. At the same time, they understate or blur live contracts added in recent phases: canonical structured character records, bounded opening-state mechanics, target-aware Oracle resolution, `connectedPaths` plus travel cost, per-location `recentHappenings`, and SSE turn finalization.

**Primary recommendation:** Plan Phase 44 around a claim-by-claim rewrite backed by code anchors and regression tests, with explicit deprecation notes for every stale promise and an explicit pending note for the still-open Phase 38 inventory/equipment seam.

## Project Constraints (from CLAUDE.md)

- Treat the documented gameplay files as distinct surfaces: `docs/concept.md`, `docs/mechanics.md`, `docs/memory.md`, `docs/tech_stack.md`.
- Preserve the product principle that the LLM is the narrator only; backend code owns mechanics and state.
- Keep recommendations aligned with the actual stack: Hono backend, Next.js App Router frontend, Vercel AI SDK, Drizzle + SQLite, LanceDB, Zod.
- Assume TypeScript strict mode and ESM conventions.
- Use Drizzle query-builder patterns, not raw SQL, when citing or extending backend truth sources.
- Prefer `ai` SDK patterns over bespoke provider calls when referencing runtime behavior.
- Treat route conventions as stable project constraints: outer `try/catch`, `parseBody()`, `getErrorStatus(error)`.
- Import shared types/constants from `@worldforge/shared`; do not recommend duplicated gameplay truth models.
- GitNexus is the preferred exploration path for repo understanding, but MCP resources were unavailable during this run, so this research used direct repo sources instead.

## Standard Stack

### Core
| Library | In Repo | Latest Verified | Purpose | Why Standard |
|---------|---------|-----------------|---------|--------------|
| Markdown docs in `docs/` | repo files | n/a | Planning baseline artifacts | Phase 44 is a docs-rewrite phase, not a dependency phase. |
| `hono` | `4.12.3` | `4.12.12` (2026-04-07) | Backend gameplay/API contract source | Live gameplay truth is defined in Hono routes and engine seams, not in prose. |
| `next` | `16.1.6` | `16.2.3` (2026-04-08) | Frontend gameplay contract source | `/game` and client transport behavior are part of the docs baseline. |
| `ai` | `6.0.106` | `6.0.158` (2026-04-10) | Streaming/tool-calling runtime seams | Prompt and turn-stream contracts are implemented through this stack. |
| `drizzle-orm` | `0.45.1` | `0.45.2` (2026-03-27) | SQLite authority layer | Canonical state and doc truth flow from the schema and queries here. |
| `@lancedb/lancedb` | `0.26.2` | `0.27.2` (2026-03-31) | Vector memory/lore retrieval | Retrieval docs must match the current LanceDB-backed search reality. |
| `vitest` | `3.2.4` | `4.1.4` (2026-04-09) | Runtime regression verification | Existing tests already cover most Phase 44 truth anchors. |

### Supporting
| Library | In Repo | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@worldforge/shared` | `0.1.0` | Shared character/runtime types | Use when tracing canonical record shapes and compatibility projections. |
| `@hono/node-ws` | `1.3.0` | Optional WebSocket endpoint support | Mention only as non-authoritative gameplay transport; do not document it as the turn-stream contract. |
| Root `vitest.config.ts` | repo file | Cross-backend/frontend test config | Use for full runtime-truth regression runs. |
| `frontend/vitest.config.ts` | repo file | Frontend-focused jsdom tests | Use for `/game` and UI contract spot checks. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `mechanics.md` + `memory.md` as normative baseline | `concept.md` as single source of truth | Repeats the ambiguity that Phase 44 exists to remove. |
| Explicit deprecated/replaced notes | Silent prose rewrite | Violates locked deprecation policy and loses auditability against Phase 36. |
| Runtime/test-backed claim reconciliation | Narrative-only doc cleanup | Recreates another reconciliation pass later because there is no evidence trail. |

**Installation:**
```bash
# No new packages should be introduced for Phase 44.
# Use the existing workspace and current tests.
```

**Version verification:** Verified with `npm view` on 2026-04-11. The workspace is intentionally behind current upstream for several packages. Phase 44 should document the live repo/runtime, not silently normalize docs to latest upstream package behavior.

## Architecture Patterns

### Recommended Project Structure
```text
docs/
├── concept.md                # High-level product/system contract only
├── mechanics.md              # Normative gameplay mechanics baseline
├── memory.md                 # Normative runtime/retrieval/prompt baseline
├── tech_stack.md             # Technical reference; not gameplay authority
└── plans/
    └── 2026-03-06-player-character-creation.md  # Setup/handoff contract history
```

### Pattern 1: Documentation Authority Pyramid
**What:** Define an explicit precedence order for gameplay truth.
**When to use:** At the beginning of the phase, before any prose edits.
**Use:** Runtime code/tests > `mechanics.md` and `memory.md` > `concept.md` > `tech_stack.md`.
**Why:** This matches locked decisions D-01 through D-03 and prevents future drift.

### Pattern 2: Claim-by-Claim Reconciliation
**What:** Rewrite each elevated Phase 36 Group B/C claim into one of three states: implemented live behavior, explicit deprecation/replacement, or explicit pending note.
**When to use:** For every stale or partial gameplay-facing sentence in the target docs.
**Example:**
```ts
// Source: backend/src/engine/target-context.ts
export async function resolveActionTargetContext(
  options: ResolveActionTargetContextOptions,
): Promise<ActionTargetContext> {
  const candidate = await detectActionTargetCandidate(options);
  if (!candidate) {
    return {
      targetLabel: null,
      targetType: "none",
      targetTags: [],
      source: "fallback",
      fallbackReason: "No supported concrete target resolved",
    };
  }
}
```
This is the model to document for Oracle targeting: supported targets get real tags; unsupported targets fall back honestly.

### Pattern 3: Canonical Record First, Derived Tags Second
**What:** Describe structured `CharacterRecord` data as the source of truth and derived tags as shorthand/compatibility output.
**When to use:** Anywhere docs talk about character state, NPC state, player state, start conditions, or tags.
**Example:**
```ts
// Source: backend/src/character/record-adapters.ts
export function projectPlayerRecord(record: CharacterRecord): PlayerRecordProjection {
  const legacy = toLegacyPlayerCharacter(record);
  const derivedTags = deriveRuntimeCharacterTags(record);

  return {
    name: legacy.name,
    hp: legacy.hp,
    tags: JSON.stringify(legacy.tags),
    characterRecord: JSON.stringify(record),
    derivedTags: JSON.stringify(derivedTags),
  };
}
```

### Pattern 4: Prompt Contract From Real Sections
**What:** Document only the prompt blocks actually assembled today.
**When to use:** In `memory.md` and `mechanics.md` when describing retrieval/prompt assembly.
**Example:**
```ts
// Source: backend/src/engine/prompt-assembler.ts
const loreCards = await searchLoreCards(queryVector, 3);
const events = await searchEpisodicEvents(queryVector, currentTick, 5);
```
This means: top-3 lore, vector-only lore search, top-5 episodic memories, and no `[RETRIEVED MEMORIES]` block.

### Pattern 5: Normalized Location Read Model
**What:** Document player-facing location truth through `connectedPaths` and `recentHappenings`, while acknowledging `connectedTo` only as compatibility fallback.
**When to use:** In `concept.md`, `mechanics.md`, and any travel/location prose.
**Example:**
```ts
// Source: backend/src/routes/campaigns.ts
connectedPaths: listConnectedPaths({ ... }).map((path) => ({
  edgeId: path.edgeId,
  toLocationId: path.locationId,
  toLocationName: path.locationName,
  travelCost: path.travelCost,
})),
recentHappenings: recentEventsByLocationId[location.id] ?? [],
```

### Anti-Patterns to Avoid
- **`concept.md` as gameplay SSOT:** It is now the product/system overview, not the place for detailed live mechanics.
- **Silent drift cleanup:** Every removed or narrowed claim needs a visible deprecation or replacement note.
- **Derived tags as the ontology:** The runtime now projects tags from canonical records; the docs must not reverse that relationship.
- **Aspirational transport wording:** Gameplay uses REST + SSE streaming; the mere existence of `/ws` is not the gameplay contract.
- **Pretending Phase 38 is closed:** Inventory/equipment wording must stay explicitly bounded and honest.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Claim inventory | A new ad-hoc spreadsheet of stale claims | Phase 36 handoff + runtime matrix claim IDs | The claim taxonomy already exists and is the milestone baseline. |
| Docs authority rules | A new implicit "whichever file is newest wins" model | Explicit authority pyramid from D-01 to D-03 | Prevents future planner confusion. |
| Targeting semantics | Prose guesses about "target tags" | `target-context.ts` + `turn-processor.test.ts` | Supported targets and fallback behavior are already encoded and tested. |
| Memory/retrieval explanation | Legacy docs language about keyword search and LLM-scored importance | `prompt-assembler.ts`, `episodic-events.ts`, `reflection-budget.ts`, `reflection-agent.ts` | Current behavior differs materially from old prose. |
| Travel/location wording | Old `connectedTo`-only descriptions | `location-graph.ts`, `location-events.ts`, `campaigns.ts`, `/game` tests | The authoritative read model changed in Phase 43. |

**Key insight:** Phase 44 should not invent new explanatory abstractions. It should expose the abstractions the runtime already uses and mark old abstractions as historical or deprecated.

## Common Pitfalls

### Pitfall 1: Silent Deprecation By Rewrite
**What goes wrong:** Old promises disappear from the docs without any "replaced by" or "no longer supported" note.
**Why it happens:** Rewriters optimize for clean prose instead of auditability.
**How to avoid:** Keep a Phase 36 claim checklist and require an explicit note for every removed/narrowed promise.
**Warning signs:** Old terms vanish with no replacement language or migration note.

### Pitfall 2: Treating Tags As Canonical Again
**What goes wrong:** Docs say "everything is tags" even though live runtime stores canonical structured character records and derives tags from them.
**Why it happens:** Old `mechanics.md` language predates Phases 29 and 30.
**How to avoid:** Every state-model section should mention canonical records first and derived tags second.
**Warning signs:** Any sentence that implies tags are the sole source of character truth.

### Pitfall 3: Documenting Transport As WebSocket Gameplay
**What goes wrong:** `tech_stack.md` or `concept.md` keeps describing gameplay streaming as WebSocket.
**Why it happens:** `@hono/node-ws` still exists in the backend, so it is easy to over-generalize.
**How to avoid:** Document gameplay transport as REST + SSE for `/api/chat/*`; mention `/ws` only as a separate technical capability if needed.
**Warning signs:** "WebSocket" appears in turn-loop or `/game` transport prose.

### Pitfall 4: Overstating Retrieval And Reflection Semantics
**What goes wrong:** Docs keep claiming keyword+vector lore search, top-3-5 episodic flexibility, or LLM-scored event importance with a `>= 15` reflection threshold.
**Why it happens:** Those claims are inherited from older design language.
**How to avoid:** Use current code values: vector-only lore retrieval, top-3 lore, top-5 episodic memories, caller-supplied importance, reflection threshold `10`.
**Warning signs:** `[RETRIEVED MEMORIES]`, "keyword search", or "threshold 15" survives the rewrite.

### Pitfall 5: Hiding Phase 38 Behind Confident Inventory Wording
**What goes wrong:** Docs imply one fully solved inventory/equipment authority model even though `RINT-04` is still open.
**Why it happens:** The current runtime is more coherent than before, so it is tempting to overstate completeness.
**How to avoid:** Document the bounded partial truth: the `items` table and structured records drive live behavior, but the milestone still tracks a remaining authority seam.
**Warning signs:** Inventory language has no pending/deferred note anywhere.

### Pitfall 6: Forgetting That Setup/Handoff Shapes Gameplay Semantics
**What goes wrong:** Phase 44 updates only the turn loop and ignores world sources, DNA, start conditions, and loadout handoff wording.
**Why it happens:** Those topics live outside the main gameplay files.
**How to avoid:** Treat start-state/setup claims as in-scope where they change gameplay semantics.
**Warning signs:** `concept.md` still promises wiki ingest or optional DNA behavior that no longer matches the routed flow.

## Code Examples

Verified patterns from repo sources:

### Canonical Record Plus Derived Tags
```ts
// Source: backend/src/character/runtime-tags.ts
for (const value of record.state.conditions) pushUnique(tags, value);
for (const value of record.state.statusFlags) pushUnique(tags, value);
for (const value of record.socialContext.socialStatus) pushUnique(tags, value);
```

### Honest Target-Aware Oracle Resolution
```ts
// Source: backend/src/engine/target-context.ts
if (row) {
  return {
    targetLabel: row.name,
    targetType,
    targetTags: deriveTargetTags(targetType, row),
    source: "parsed",
    fallbackReason: null,
  };
}
```

### Bounded Opening-State Mechanics
```ts
// Source: backend/src/engine/start-condition-runtime.ts
const expiredByLocation = Boolean(canonicalLocationId && options.currentLocationId
  && canonicalLocationId !== options.currentLocationId);
const expiredByTick = options.currentTick >= OPENING_EFFECT_TICK_CEILING;
const expiredByResolution = actionResolvesOpeningState(...);
```

### Live Prompt Contract
```ts
// Source: backend/src/engine/prompt-assembler.ts
const loreCards = await searchLoreCards(queryVector, 3);
const events = await searchEpisodicEvents(queryVector, currentTick, 5);
```

### Normalized World Payload For Travel And Local History
```ts
// Source: backend/src/routes/campaigns.ts
return {
  ...worldLocation,
  connectedPaths: listConnectedPaths({ ... }),
  recentHappenings: recentEventsByLocationId[location.id] ?? [],
};
```

### Gameplay Streaming Contract
```ts
// Source: frontend/lib/api.ts
export function chatAction(...) {
  return apiStreamPost("/api/chat/action", { campaignId, playerAction, intent, method });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat tags as universal ontology | Canonical structured `CharacterRecord` plus derived runtime tags | Phase 29 (`2026-04-01`) | Docs must stop treating tags as the only character truth. |
| Start conditions as setup flavor | Bounded opening mechanics with status flags, scene context, and deterministic expiry | Phase 42 (`2026-04-11`) | Setup/handoff docs now affect live gameplay semantics. |
| Empty `targetTags` seam | Supported `character`, `item`, and `location/object` targets resolve real target tags; unsupported targets fall back honestly | Phase 42 (`2026-04-11`) | Oracle docs must describe real support boundaries. |
| Flat `connectedTo` movement promises | Authoritative location graph with `travelCost`, `connectedPaths`, and location-local `recentHappenings` | Phase 43 (`2026-04-11`) | Travel and revisit docs can now be live promises again. |
| `[RETRIEVED MEMORIES]` and looser memory wording | `[EPISODIC MEMORY]`, top-5 episodic retrieval, top-3 lore retrieval | Live as of 2026-04-11 | Memory docs need exact block names and bounded retrieval numbers. |
| LLM-scored event importance, threshold `15` | Caller-supplied importance plus accumulated reflection budget, threshold `10` | Inference from current code as of 2026-04-11 | Reflection docs are materially stale today. |
| WebSocket gameplay streaming wording | REST + SSE gameplay transport; `/ws` is not the live turn contract | Live as of 2026-04-11 | `tech_stack.md` and any gameplay transport prose must be corrected. |

**Deprecated/outdated:**
- Wiki/Fandom ingest as a live world-source or lore-ingest product contract: no user-facing runtime path exists.
- "Solid Slate" three-column UI as a normative gameplay surface: live `/game` includes a broader shell and lore/utility surfaces.
- Fixed old scaffold counts in `concept.md`: current generator ranges differ.
- `[RETRIEVED MEMORIES]`: replaced by `[EPISODIC MEMORY]`.

## Open Questions

1. **How explicit should the Phase 38 pending note be inside gameplay docs?**
   - What we know: live inventory reads/writes are more coherent than before, but `RINT-04` remains pending.
   - What's unclear: whether the pending note should live inline in `mechanics.md`, `memory.md`, or both.
   - Recommendation: plan one explicit "bounded partial contract" note in both `mechanics.md` and `memory.md`.

2. **Where should setup/handoff truth live when it affects gameplay semantics?**
   - What we know: world sources, DNA, starting location, and start conditions shape gameplay semantics and are in scope by D-11.
   - What's unclear: how much of that belongs in `concept.md` versus cross-links into `mechanics.md` and `memory.md`.
   - Recommendation: keep player-facing setup overview in `concept.md`, but move semantically binding details to normative docs with cross-links.

3. **Should the implementation keep a temporary claim-resolution appendix or checklist?**
   - What we know: DOCA-01 requires proof that every elevated claim was resolved.
   - What's unclear: whether that proof should remain in the shipped docs or only in planning artifacts/PR notes.
   - Recommendation: plan an implementation checklist keyed to Phase 36 claim IDs even if the final docs do not keep the checklist verbatim.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `3.2.4` in repo (`4.1.4` latest verified) |
| Config file | `vitest.config.ts`; `frontend/vitest.config.ts` |
| Quick run command | `npx vitest run backend/src/engine/__tests__/turn-processor.test.ts backend/src/engine/__tests__/prompt-assembler.test.ts backend/src/routes/__tests__/campaigns.test.ts frontend/app/game/__tests__/page.test.tsx` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOCA-01 | Group B/C claims documented as live or deprecated, with travel/location/targeting truth grounded in runtime | regression + manual doc audit | `npx vitest run backend/src/engine/__tests__/turn-processor.test.ts backend/src/routes/__tests__/campaigns.test.ts frontend/app/game/__tests__/page.test.tsx` | ✅ |
| DOCA-02 | Structured character records are canonical and derived tags are shorthand/compatibility output | unit + integration | `npx vitest run backend/src/character/__tests__/record-adapters.test.ts backend/src/routes/__tests__/character.test.ts backend/src/engine/__tests__/turn-processor.test.ts` | ✅ |
| DOCA-03 | Retrieval, prompt blocks, reflection budget, and memory semantics match live runtime | unit + integration | `npx vitest run backend/src/engine/__tests__/prompt-assembler.test.ts backend/src/vectors/__tests__/episodic-events.test.ts backend/src/engine/__tests__/reflection-budget.test.ts backend/src/engine/__tests__/reflection-agent.test.ts` | ✅ |

### Sampling Rate
- **Per task commit:** `npx vitest run backend/src/engine/__tests__/turn-processor.test.ts backend/src/engine/__tests__/prompt-assembler.test.ts backend/src/routes/__tests__/campaigns.test.ts frontend/app/game/__tests__/page.test.tsx`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- None for runtime-truth regression coverage.
- Manual docs review is still required because no current test asserts prose or deprecation-note presence directly.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/44-gameplay-docs-baseline-alignment/44-CONTEXT.md` - locked scope, authority model, deprecation policy, and runtime carry-forward decisions
- `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/PROJECT.md` - milestone baseline, requirement mapping, and current repaired runtime state
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-HANDOFF.md`, `36-RUNTIME-MATRIX.md` - claim inventory, Group B/C priorities, and deprecation tracker
- `docs/concept.md`, `docs/mechanics.md`, `docs/memory.md`, `docs/tech_stack.md`, `docs/plans/2026-03-06-player-character-creation.md` - current documentation surface and stale claims
- `backend/src/character/record-adapters.ts`, `backend/src/character/runtime-tags.ts` - canonical record and derived-tag truth
- `backend/src/engine/target-context.ts`, `backend/src/engine/start-condition-runtime.ts` - target-aware Oracle and bounded opening-state contracts
- `backend/src/engine/location-graph.ts`, `backend/src/engine/location-events.ts`, `backend/src/routes/campaigns.ts` - travel/local-history runtime and API truth
- `backend/src/engine/prompt-assembler.ts`, `backend/src/engine/reflection-budget.ts`, `backend/src/engine/reflection-agent.ts` - prompt/retrieval/memory/reflection truth
- `backend/src/routes/chat.ts`, `frontend/lib/api.ts`, `frontend/app/game/page.tsx`, `backend/src/index.ts` - gameplay transport and UI/runtime contract
- `backend/src/engine/__tests__/turn-processor.test.ts`, `backend/src/engine/__tests__/prompt-assembler.test.ts`, `backend/src/routes/__tests__/campaigns.test.ts`, `backend/src/routes/__tests__/character.test.ts`, `frontend/app/game/__tests__/page.test.tsx` - regression coverage of the live contract
- `backend/package.json`, `frontend/package.json`, `shared/package.json`, `package.json` - in-repo stack versions and scripts
- `npm view hono version time --json`, `npm view next version time --json`, `npm view ai version time --json`, `npm view drizzle-orm version time --json`, `npm view @lancedb/lancedb version time --json`, `npm view vitest version time --json` - latest package verification on 2026-04-11

### Secondary (MEDIUM confidence)
- `AGENTS.md` and `CLAUDE.md` - project-specific workflow and coding constraints

### Tertiary (LOW confidence)
- GitNexus MCP context was unavailable through MCP resources during this run, so no GitNexus resource reads could be verified.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified from repo manifests plus `npm view` on 2026-04-11
- Architecture: HIGH - backed by phase contexts, runtime anchors, and regression tests
- Pitfalls: HIGH - directly evidenced by stale docs versus current code/tests

**Research date:** 2026-04-11
**Valid until:** 2026-04-25 or until Phase 44 edits/runtimes change materially

# Phase 30: Start Conditions, Canonical Loadouts, and Persona Templates - Research

**Researched:** 2026-04-01
**Domain:** Character start-state persistence, draft enrichment, loadout materialization, and persona template reuse
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Build on the current Phase 29 worktree as the implementation baseline; do not plan against the last fully committed pre-29 state.
- Replace loose starting-location resolution with persisted `startConditions` rather than introducing another transient helper layer.
- Canonical loadout derivation must come from structured scenario/context state and end at real item materialization, not remain a detached equipped-string list.
- Persona templates must be reusable across player and NPC flows and must feed the shared draft pipeline rather than separate player-only or NPC-only models.
- Creation and review surfaces must expose the new fields through existing draft seams; do not create alternate frontend data models.

### Claude's Discretion
- Exact persistence shape for persona templates is open as long as templates are storable/selectable within a campaign and reusable by both player and NPC flows.
- Exact start-condition subfield granularity is open as long as Phase 30 persists the Phase 28 ontology fields needed for location, arrival circumstances, and prompt/runtime reuse.
- Loadout derivation can use deterministic rule composition with optional AI-assisted scenario resolution, but final persisted loadout and item rows must be deterministic and auditable.
- Compatibility strategy is open as long as existing saves, runtime readers, and the partially closed Phase 29 worktree remain functional during migration.

### Deferred Ideas (OUT OF SCOPE)
- Do not drift into Phase 31 prompt harmonization or broad prompt-family rewrites.
- Do not turn this into the Phase 32 desktop-first UI overhaul.
- Do not redesign memory/retrieval or unrelated gameplay balance systems.
- Do not require cross-campaign/global persona libraries in Phase 30 unless campaign-local storage proves insufficient.
</user_constraints>

<phase_requirements>
## Phase Requirements

Derived from `ROADMAP.md`, the Phase 28 handoff, and the user scope because `REQUIREMENTS.md` does not currently enumerate `P30-01` through `P30-06`.

| ID | Description | Research Support |
|----|-------------|------------------|
| P30-01 | Persist structured `startConditions` on canonical drafts/records and replace loose location-only resolution. | Start-condition service, route migration, DB/write-path recommendations, compatibility alias guidance. |
| P30-02 | Resolve start state as location plus arrival circumstances, not just a free-text narrative. | Recommended `startConditions` subfields, UI seam guidance, prompt/service flow, migration pitfalls. |
| P30-03 | Derive canonical loadout from scenario/context rules and materialize real item rows at save time. | Deterministic loadout rule stack, transactional persistence pattern, compatibility bridge strategy. |
| P30-04 | Support persona templates that can be created, stored, selected, and reused for both player and NPC generation. | Campaign-scoped template persistence recommendation, shared draft-patch model, creation/review wiring. |
| P30-05 | Feed structured start/loadout/template context into the shared draft pipeline and prompt/runtime readers. | Draft-first architecture, prompt assembler extension points, compact-view recommendations. |
| P30-06 | Preserve Phase 29 compatibility seams and current creation/review flows while introducing the new model. | Migration inventory, anti-patterns, test map, lazy-backfill guidance, no-parallel-model rule. |
</phase_requirements>

## Summary

Phase 29 has already done most of the dangerous work: `CharacterDraft` / `CharacterRecord` now exist in shared types, backend adapters hydrate canonical records, the player save path persists `characterRecord`, and both character pages plus the world-review NPC editor already manipulate grouped draft state. Phase 30 should not invent a second system. It should enrich the existing draft pipeline at three specific seams: start-state resolution, loadout derivation/materialization, and persona-template application.

The current codebase still carries the old behavior in exactly the places the handoff predicted. `startConditions` exists in types and schemas but is almost always `{}`. `/api/worldgen/resolve-starting-location` still returns only `{ locationId, locationName, narrative }`. `CharacterCard` still treats start state as one textarea plus a separate location selector, and loadout is still edited as loose `equippedItemRefs`. Runtime readers like `prompt-assembler.ts` ignore `startConditions` entirely and consume loadout mostly as a string list. That makes Phase 30 mostly a targeted extension of working seams, not a broad rewrite.

The critical planning insight is migration scope. Real campaign databases in `campaigns/*/state.db` are mixed-state: 28 campaign DBs exist locally, all still lack the Phase 29 `character_record` / `derived_tags` columns until a campaign is loaded and Drizzle migrations run. There are 266 persisted NPC rows on the old schema and no persisted players/items in the sampled DBs. Phase 30 therefore needs both code changes and explicit lazy-backfill behavior; planners should not assume the whole fleet is already on the canonical record schema.

**Primary recommendation:** Add one new internal draft-enrichment pipeline that resolves `startConditions`, applies persona-template patches, deterministically derives loadout specs, and materializes items transactionally at save time while preserving existing route/UI shells as compatibility aliases.

## Project Constraints (from CLAUDE.md)

- Use the existing stack: Hono backend, Next.js frontend, TypeScript strict mode, Drizzle ORM, better-sqlite3, Zod, and the Vercel AI SDK.
- The LLM remains narrator/generator only; engine state changes stay deterministic and validated in backend code.
- Use Drizzle query builder, not raw SQL.
- Use Zod schemas for all API payloads and AI tool definitions.
- Prefer `ai` SDK helpers such as `generateObject` / `streamText` over ad hoc provider fetch logic.
- Route handlers should keep the repo pattern: outer `try/catch`, `parseBody()` validation, `getErrorStatus(error)` for HTTP status.
- Shared character and settings contracts must live in `@worldforge/shared`, not duplicated backend/frontend types.
- SQLite remains the source of truth; LanceDB is additive and out of scope for this phase.

## Standard Stack

These are the project-pinned versions present in the workspace on 2026-04-01. They were read from `package.json` files and local CLI output, not checked against the public npm registry because Phase 30 does not require new dependency selection.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@worldforge/shared` | workspace | Canonical type surface | Already carries `CharacterDraft`, `CharacterRecord`, and should own any new template/start-condition contracts. |
| `hono` | `4.12.3` | API route layer | Existing backend routing and error-handling patterns are built around it. |
| `zod` | `4.3.6` | Request + AI schema validation | Current character routes and generation flows already depend on it. |
| `drizzle-orm` | `0.45.1` | SQLite schema + migrations | Existing campaign DB migrations already run through Drizzle on campaign load. |
| `better-sqlite3` | `12.6.2` | SQLite runtime | Source-of-truth persistence and local DB access already depend on it. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ai` | `6.0.106` | Structured LLM generation | Keep using `safeGenerateObject` for scenario resolution or template-aware generation prompts. |
| `next` | `16.1.6` | Frontend app shell | Existing character creation and review pages already live here. |
| `react` / `react-dom` | `19.2.3` | Draft editor UI | Minimal Phase 30 UI additions should stay within current page/component structure. |
| `vitest` | `3.2.4` | Unit/integration tests | Existing backend and frontend tests already use it with one root config. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Campaign-scoped template persistence in SQLite | File-backed JSON presets | Cheaper to ship, but harder to edit via existing campaign APIs and harder to keep in one save/load model. |
| Deterministic loadout derivation + item materialization | Manual free-form equipment editing only | Easier UI, but it does not satisfy canonical loadout or items-table consistency requirements. |
| New internal `resolveStartConditions()` service with route aliasing | Keep old `/resolve-starting-location` contract as the only implementation seam | Minimizes code churn now, but cements the wrong abstraction and keeps `startConditions` non-authoritative. |

**Installation:**
```bash
# No new packages recommended for Phase 30.
npm install
```

## Architecture Patterns

### Recommended Project Structure
```text
backend/src/
├── character/
│   ├── persona-templates.ts   # CRUD + draft-patch application helpers
│   ├── loadout-deriver.ts     # deterministic scenario -> loadout spec rules
│   └── record-adapters.ts     # keep compatibility projections here
├── worldgen/
│   └── start-conditions.ts    # richer scenario resolver replacing location-only logic
└── routes/
    ├── character.ts           # route shells / compatibility aliases
    └── campaigns.ts           # hydrate templates into world payload if needed

frontend/
├── components/character-creation/
│   └── character-card.tsx     # minimal extra editors for start/template/loadout preview
├── components/world-review/
│   └── npcs-section.tsx       # template selection + draft-backed NPC edits
└── lib/
    ├── api-types.ts           # template payloads in shared world data
    └── character-drafts.ts    # shared draft merge / projection helpers
```

### Pattern 1: Draft Enrichment Before Persistence
**What:** Treat every authoring path as producing or modifying one `CharacterDraft`, then enrich that draft with template, start-condition, and loadout logic before persistence.
**When to use:** Player parse/generate/import, NPC parse/generate/import, template selection, and world-review edits.
**Recommendation:** Add a single backend helper that takes `{ baseDraft, templatePatch, startConditionInput }` and returns a fully normalized draft plus warnings.

**Example:**
```typescript
const record = createCharacterRecordFromDraft(
  {
    ...draft,
    socialContext: {
      ...draft.socialContext,
      currentLocationId,
      currentLocationName,
    },
  },
  { id: playerId, campaignId },
);
```
Source: repo pattern from `backend/src/routes/character.ts` and `backend/src/character/record-adapters.ts`

### Pattern 2: Transactional Save With Compatibility Bridges
**What:** Persist canonical record JSON first, but keep legacy bridge columns (`tags`, `equippedItems`, `currentLocationId`) synchronized until all runtime readers fully migrate.
**When to use:** `save-character`, scaffold save, any NPC/player mutation that changes loadout or start state.
**Recommendation:** Save player row, materialize item rows, and update compatibility columns in one DB transaction. Do not let `characterRecord.loadout`, `players.equippedItems`, and `items.ownerId` drift.

### Pattern 3: Internal Service Upgrade, External Alias Compatibility
**What:** Introduce a richer internal `resolveStartConditions()` service, then keep `/resolve-starting-location` as a temporary alias or compatibility route while frontend callers migrate.
**When to use:** Start-condition resolution during character creation and NPC/worldgen flows.
**Recommendation:** Return a structured object that always includes `startLocationId`, `resolvedNarrative`, `arrivalMode`, `entryPressure`, and `startingVisibility`. Preserve `locationId` / `locationName` in the response only as a migration bridge.

### Pattern 4: Prompt Readers Consume Compact Views Derived From Canonical Fields
**What:** Keep prompt-facing sections compact, but derive them from canonical grouped fields instead of legacy flat tags or one-off strings.
**When to use:** `prompt-assembler.ts`, NPC agent prompts, future Phase 31 prompt cleanup.
**Recommendation:** Add a small formatter layer for `startConditions` and canonical loadout summaries rather than inlining prompt wording across modules.

### Anti-Patterns to Avoid
- **Parallel player/NPC template models:** one shared template patch format is enough.
- **React-only start logic:** if `CharacterCard` derives scenario state locally without backend normalization, save/load and prompt readers will drift.
- **String-only loadout persistence:** editing `equippedItemRefs` without materialized `items` rows breaks inventory truth.
- **Prompt text as source of truth:** `resolvedNarrative` is a convenience field, not the canonical start-state record.
- **Phase 31 creep:** do not turn this phase into a broad prompt rewrite just because new fields exist.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Runtime tag sync | New ad hoc tag mappers in routes/UI | `deriveRuntimeCharacterTags()` | Existing derivation seam already prevents field/tag drift. |
| Record hydration | New one-off player/NPC adapters | `hydrateStoredPlayerRecord()` / `hydrateStoredNpcRecord()` | These already reconcile canonical JSON with legacy columns. |
| DB evolution | Manual SQL sprinkled through services | Drizzle schema + migrations + load-time `runMigrations()` | Existing campaign lifecycle already assumes this path. |
| Request validation | Per-route manual parsing | Existing Zod schemas + `parseBody()` | Matches project constraint and current route style. |
| Template projection for review UI | Separate NPC/editor DTOs | Existing draft-backed scaffold projections in `frontend/lib/character-drafts.ts` | The world-review seam already knows how to round-trip a draft. |

**Key insight:** Phase 30 succeeds by enriching the canonical draft pipeline, not by replacing it with specialized start/loadout/template side channels.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 28 campaign `state.db` files exist locally. All 28 are still on the pre-Phase-29 schema until loaded: `players.character_record` and `npcs.character_record` columns are absent in the raw files. The audit found 266 persisted NPC rows, 0 persisted player rows, and 0 item rows across those DBs. | **Code edit + migration behavior.** Phase 30 plans must assume lazy migration on `loadCampaign()` is still required before any backfill. If Phase 30 adds new columns/tables for templates or loadout materialization, include both Drizzle migration files and a lazy backfill path for already-existing rows. |
| Live service config | None found. Start/loadout/template behavior is repo-local and campaign-local; no external service UI configuration surfaced in the current codebase. | None beyond code changes. |
| OS-registered state | None found. No scheduler/service registration appears tied to these phase concerns. | None. |
| Secrets/env vars | None found for `startConditions`, loadouts, or persona-template naming. Existing provider/image envs are unrelated to the persisted model. | None. |
| Build artifacts | `backend/drizzle/0004_illegal_hitman.sql` and meta snapshots already represent the current schema state; future schema changes will require new migration artifacts. No persisted compiled artifact stores start/loadout/template state. | **Code edit.** Generate a new Drizzle migration if schema/table changes are introduced. |

## Common Pitfalls

### Pitfall 1: Persisting `currentLocationName` But Not Canonical `startConditions.startLocationId`
**What goes wrong:** The player appears in the right location once, but prompt/runtime systems cannot reason about how or why they started there.
**Why it happens:** Current save flow resolves location by name and writes `currentLocationId`, while `startConditions` stays empty.
**How to avoid:** Make the start-condition resolver authoritative for both scenario fields and resolved location ids.
**Warning signs:** `characterRecord.startConditions` is `{}` after save, or prompt output can only mention inventory/location, not arrival context.

### Pitfall 2: Loadout Drift Between `characterRecord`, Legacy Columns, and `items`
**What goes wrong:** UI shows equipped items, but inventory endpoints or prompt inventory lines disagree.
**Why it happens:** Current save path writes `players.equippedItems` but does not materialize starting items into the `items` table.
**How to avoid:** Derive loadout specs once, then write player row and item rows transactionally.
**Warning signs:** `GET /campaigns/:id/inventory` returns empty while `loadout.equippedItemRefs` is non-empty.

### Pitfall 3: Templates Fork Into Player-Only and NPC-Only Shapes
**What goes wrong:** Reuse promise collapses and the planner inherits duplicate merge logic.
**Why it happens:** Existing generator prompts for players and NPCs still accept different legacy shapes.
**How to avoid:** Store one draft-patch template format and apply it before role-specific projection.
**Warning signs:** separate `PlayerPersonaTemplate` and `NpcPersonaTemplate` types appear in new code.

### Pitfall 4: Planning Against a Fully Migrated Phase 29 World That Does Not Exist Yet
**What goes wrong:** Phase 30 assumes `character_record` is already present in every campaign DB and skips migration/backfill work.
**Why it happens:** Current worktree has Phase 29 code, but old `state.db` files are only migrated lazily on load.
**How to avoid:** Make migration tasks explicit in the plan and test against a pre-migration DB fixture.
**Warning signs:** raw DB inspection fails on `character_record`, or tests only use freshly created campaigns.

### Pitfall 5: Solving Prompt Consistency Here Instead of In Phase 31
**What goes wrong:** Phase scope balloons into wording audits across the whole engine.
**Why it happens:** New fields invite broad prompt edits.
**How to avoid:** Add only minimal compact-view formatters and route existing prompts through them.
**Warning signs:** multiple prompt families are rewritten instead of consuming shared format helpers.

## Code Examples

Verified patterns from the current repo:

### Canonical Record Creation At The Save Boundary
```typescript
const record = createCharacterRecordFromDraft(
  {
    ...draft,
    socialContext: {
      ...draft.socialContext,
      currentLocationId,
      currentLocationName,
    },
  },
  { id: playerId, campaignId },
);
```
Source: `backend/src/routes/character.ts`, `backend/src/character/record-adapters.ts`

### World Review Keeps Draft As Source Of Truth
```typescript
function withNpcDraft(npc: ScaffoldNpc, draft: CharacterDraft): ScaffoldNpc {
  return {
    ...npc,
    ...characterDraftToScaffoldNpc(draft),
    _uid: npc._uid,
    draft,
  };
}
```
Source: `frontend/components/world-review/npcs-section.tsx`, `frontend/lib/character-drafts.ts`

### Prompt Assembler Already Compacts Canonical Player State
```typescript
const playerRecord = hydrateStoredPlayerRecord(player);
const tags = deriveRuntimeCharacterTags(playerRecord);
const equipped = playerRecord.loadout.equippedItemRefs;
```
Source: `backend/src/engine/prompt-assembler.ts`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Player and NPC creation/editing used different mental models | Phase 29 worktree routes both through `CharacterDraft` / `CharacterRecord` | 2026-04-01 worktree baseline | Phase 30 can add start/loadout/template logic once. |
| Start state = location pick + flavor narrative | `startConditions` exists in shared types and schemas but is not yet authoritative | Phase 29 types landed; Phase 30 must activate them | Minimal migration needed if new service uses existing field group. |
| Equipment is primarily loose strings | Canonical `loadout` group exists, but save/runtime still mostly bridge through `equippedItems` | Phase 29 bridge state | Phase 30 should finish materialization without breaking legacy readers. |

**Deprecated/outdated:**
- `/api/worldgen/resolve-starting-location` as a location-plus-narrative-only contract is now an underspecified compatibility seam, not the target model.
- Manual editing of `equippedItemRefs` as the only loadout source is a bridge, not the canonical end state.

## Open Questions

1. **Should persona templates be campaign-local only in Phase 30?**
   - What we know: existing creation/review pages are campaign-scoped, and `GET /api/campaigns/:id/world` is the shared hydration seam.
   - What's unclear: whether the user wants cross-campaign/global preset reuse immediately.
   - Recommendation: implement campaign-scoped templates now, keep schema flexible enough for a future global library.

2. **Should old campaigns be backfilled eagerly or lazily?**
   - What we know: raw DB audit shows pre-Phase-29 schema is still common until `loadCampaign()` runs migrations.
   - What's unclear: whether the planner should include a one-time sweep task.
   - Recommendation: require lazy-on-load repair in Phase 30 and only add a sweep script if manual testing exposes performance or correctness issues.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node` | Local scripts, tests, migrations | ✓ | `v23.11.0` | — |
| `npm` | Workspace commands, Vitest, Drizzle | ✓ | `11.12.1` | — |
| `vitest` | Unit/integration validation | ✓ | `3.2.4` via `npm --prefix backend exec vitest --version` | — |
| `drizzle-kit` | Schema migration generation | ✓ | `0.31.9` from `backend/package.json` / local exec | — |
| `sqlite3` CLI | Optional DB inspection | ✗ | — | Use project `better-sqlite3`/Drizzle and route-level tests instead. |

**Missing dependencies with no fallback:**
- None.

**Missing dependencies with fallback:**
- `sqlite3` CLI is absent, but repo-local `better-sqlite3` is sufficient for migrations, runtime code, and audit scripts.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `3.2.4` |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run backend/src/worldgen/__tests__/starting-location.test.ts backend/src/routes/__tests__/character.test.ts backend/src/character/__tests__/record-adapters.test.ts frontend/components/character-creation/__tests__/character-card.test.tsx frontend/components/world-review/__tests__/npcs-section.test.tsx` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P30-01 | Start-condition resolution persists structured fields and resolved location ids | backend integration | `npx vitest run backend/src/routes/__tests__/character.test.ts backend/src/worldgen/__tests__/starting-location.test.ts` | ✅ |
| P30-02 | Character creation/review editors round-trip richer start-condition fields | frontend component/page | `npx vitest run frontend/components/character-creation/__tests__/character-card.test.tsx frontend/app/character-creation/__tests__/page.test.tsx frontend/app/campaign/[id]/character/__tests__/page.test.tsx` | ✅ |
| P30-03 | Loadout derivation materializes canonical items and keeps compatibility fields synchronized | backend unit/integration | `npx vitest run backend/src/character/__tests__/record-adapters.test.ts backend/src/routes/__tests__/character.test.ts` | ⚠️ partial |
| P30-04 | Persona templates can be created, stored, selected, and applied to player/NPC drafts | backend + frontend | `npx vitest run backend/src/routes/__tests__/character.test.ts frontend/components/world-review/__tests__/npcs-section.test.tsx` | ⚠️ gaps |
| P30-05 | Prompt/runtime readers consume canonical start/loadout/template context without alternate models | backend unit | `npx vitest run backend/src/engine/__tests__/prompt-assembler.test.ts backend/src/engine/__tests__/state-snapshot.test.ts` | ✅ |
| P30-06 | Phase 29 compatibility remains intact for old saves and current worktree seams | backend integration | `npx vitest run backend/src/campaign/__tests__/manager.test.ts backend/src/routes/__tests__/campaigns.test.ts backend/src/routes/__tests__/character.test.ts` | ⚠️ partial |

### Sampling Rate
- **Per task commit:** targeted Vitest for touched backend/frontend files
- **Per wave merge:** `npx vitest run` on the affected backend + frontend slices
- **Phase gate:** full Vitest suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/character/__tests__/loadout-deriver.test.ts` — deterministic scenario/template/origin/loadout rule coverage for P30-03
- [ ] `backend/src/character/__tests__/persona-templates.test.ts` — template patch merge and storage contract for P30-04
- [ ] Extend `backend/src/routes/__tests__/character.test.ts` — richer start-condition response and save/materialization assertions for P30-01/P30-03/P30-06
- [ ] Extend `backend/src/routes/__tests__/campaigns.test.ts` — world payload/template hydration and lazy-migration assertions for P30-04/P30-06
- [ ] Extend `frontend/components/character-creation/__tests__/character-card.test.tsx` — start-condition field editing, template selection, and loadout preview behavior for P30-02/P30-04
- [ ] Extend `frontend/components/world-review/__tests__/npcs-section.test.tsx` — NPC template selection and draft merge behavior for P30-04/P30-05
- [ ] Validation note: current sandbox-only Vitest runs are known to hit `spawn EPERM` per `.planning/STATE.md`; unrestricted verification may still be required for final closeout.

## Sources

### Primary (HIGH confidence)
- Local repo instructions: `CLAUDE.md`
- Phase handoff: `.planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-phase-29-30-handoff.md`
- Ontology spec: `.planning/phases/28-research-design-synthesis-for-character-systems-prompts-ui-and-external-references/28-character-ontology-spec.md`
- Roadmap scope: `.planning/ROADMAP.md`
- Current shared model: `shared/src/types.ts`
- Backend save/load/runtime seams: `backend/src/routes/character.ts`, `backend/src/routes/campaigns.ts`, `backend/src/character/record-adapters.ts`, `backend/src/worldgen/starting-location.ts`, `backend/src/engine/prompt-assembler.ts`, `backend/src/engine/state-snapshot.ts`, `backend/src/campaign/manager.ts`
- Frontend draft seams: `frontend/app/character-creation/page.tsx`, `frontend/app/campaign/[id]/character/page.tsx`, `frontend/components/character-creation/character-card.tsx`, `frontend/components/world-review/npcs-section.tsx`, `frontend/lib/character-drafts.ts`, `frontend/lib/api.ts`, `frontend/lib/api-types.ts`
- Migration state: `backend/drizzle/0004_illegal_hitman.sql`, `backend/drizzle/meta/0004_snapshot.json`
- GitNexus local index metadata: `.gitnexus/meta.json`
- Local runtime inventory audit over `campaigns/*/state.db` using repo-installed `better-sqlite3`

### Secondary (MEDIUM confidence)
- `backend/package.json`, `frontend/package.json`, root `package.json`, and local CLI version checks for stack/version confirmation

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for project-pinned stack, MEDIUM for public-registry currency because no npm registry lookup was needed or performed
- Architecture: HIGH because the recommendations are derived directly from the current worktree seams and Phase 28 handoff
- Pitfalls: HIGH because they are confirmed by direct code inspection plus local DB audit

**Research date:** 2026-04-01
**Valid until:** 2026-04-08

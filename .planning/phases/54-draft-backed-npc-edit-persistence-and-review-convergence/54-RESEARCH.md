# Phase 54: Draft-Backed NPC Edit Persistence & Review Convergence - Research

**Researched:** 2026-04-13
**Domain:** World Review NPC authoring persistence, draft/scaffold convergence, save/load truth
**Confidence:** HIGH

## Summary

This phase is a backend truth-convergence fix, not a UI redesign. The current World Review UI edits shallow `ScaffoldNpc` fields (`name`, `persona`, `tags`, `goals`, `locationName`, `factionName`, `tier`) in local scaffold state, but reload and persistence both intentionally prefer the richer `draft` lane. On load, `toEditableScaffold()` prefers `draft`-derived values over legacy row fields. On save, `saveEditsSchema` and `normalizeSavedScaffold()` preserve an incoming `draft` and only normalize tier/location/faction around it. Then `saveScaffoldToDb()` persists from `npc.draft` when present and re-projects legacy NPC fields from the resulting `characterRecord`. That is the root cause of the audited defect: visible top-level edits can be discarded because stale draft data wins twice.

The safest implementation path is to keep the existing authority model and repair the convergence seam. For draft-backed NPCs, the save boundary must reconcile the editable shallow card slice back into the authoritative draft before `saveScaffoldToDb()` runs. After that, the existing load path should continue preferring `draft` values. That preserves Phase 48/49/52 decisions: one shared `CharacterDraft` / `CharacterRecord` lane, route-boundary normalization instead of widened types, and an additive read-only inspector.

The main planning risk is tags. A naive “copy the frontend helper” approach is insufficient because `scaffoldNpcToDraft()` does not fully remap edited top-level tags into the richer draft semantics; it mostly preserves them in provenance while derived tags still come from capabilities/state/motivation fields. Planning should therefore require an adapter-owned backend reconciliation helper that rebuilds the editable compatibility slice from the visible scaffold NPC fields, then preserves non-editable rich slices from the prior draft.

**Primary recommendation:** Add one backend-owned `ScaffoldNpc -> reconciled CharacterDraft` helper, call it in the `/api/worldgen/save-edits` normalization path for every draft-backed NPC, and lock save->reload round-trip regressions before touching the UI.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UX-02 | Authoring/review UI exposes the full structured character record for important actors, including grounding and power-profile data, without requiring direct database inspection. | Phase 52 already made the inspector additive/read-only; Phase 54 must keep that contract intact while making the editable scaffold trustworthy, so the record the user inspects and the fields they edit no longer diverge across save/load. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Backend work must stay on `Hono` route handlers with outer `try/catch`, `parseBody()` validation, and `getErrorStatus(error)` response handling.
- Use `Zod` for API/schema validation; do not loosen schemas just to make the phase easier.
- Use `Drizzle ORM` query builder, not raw SQL.
- Shared types and constants must stay in `@worldforge/shared`; do not fork parallel route-local type systems.
- SQLite remains the source of truth; LanceDB is auxiliary and not the persistence authority for this phase.
- The engine stays deterministic and backend-owned; the LLM is narrator only.
- Frontend work must stay within the existing Next.js App Router + Tailwind + shadcn stack.
- User-facing assistant responses should be in Russian.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `hono` | `4.12.3` in repo, `4.12.12` latest verified 2026-04-07 | Route boundary for `/worldgen/save-edits` and `/campaigns/:id/world` | Existing backend route contract and test seam |
| `zod` | `4.3.6` in repo and latest verified 2026-01-22 | Schema transforms and validation for draft-backed scaffold payloads | Existing route normalization authority |
| `@worldforge/shared` + backend `record-adapters.ts` | workspace | Canonical `CharacterDraft` / `CharacterRecord` lane | Phase 48+ already converged on this shared ontology |
| `drizzle-orm` | `0.45.1` in repo, `0.45.2` latest verified 2026-03-27 | Persistence projection and hydration around NPC rows | Existing SQLite persistence path |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `next` + `react` | `16.1.6` + `19.2.3` in repo, `16.2.3` + `19.2.5` latest verified 2026-04-08 | World Review page and local editable scaffold state | Frontend regression coverage and no-UI-redesign work |
| `vitest` | `3.2.4` in repo, `4.1.4` latest verified 2026-04-09 | Route/helper/component regression coverage | All phase verification should stay on existing Vitest suites |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shared draft/record convergence | A second “editable NPC review model” persisted separately | Reintroduces split truth and would directly violate Phase 48/52 convergence goals |
| Route-boundary reconciliation | Frontend-only mutation of `draft` before save | Leaves backend route unsafe for any other caller and does not protect the persistence authority seam |
| Adapter-owned tag mapping | Ad hoc field copies into `draft` | Loses visible tag edits because derived tags are not a first-class writable field in the rich draft model |

**Installation:**
```bash
# No new packages recommended for Phase 54.
# Use the existing workspace dependencies and extend tests.
```

**Version verification:** Latest package versions were checked with:
```bash
npm view hono version time --json
npm view zod version time --json
npm view drizzle-orm version time --json
npm view next version time --json
npm view react version time --json
npm view vitest version time --json
```

## Architecture Patterns

### Recommended Project Structure
```text
frontend/app/(non-game)/campaign/[id]/review/page.tsx   # Load/save editable scaffold
frontend/components/world-review/npcs-section.tsx       # Visible NPC editing surface
frontend/lib/world-data-helpers.ts                      # /world -> editable scaffold projection
backend/src/routes/worldgen.ts                          # save-edits normalization boundary
backend/src/character/record-adapters.ts                # authoritative draft/record conversion seam
backend/src/worldgen/scaffold-saver.ts                  # DB write + characterRecord projection
backend/src/routes/campaigns.ts                         # persisted world -> payload hydration
```

### Pattern 1: Reconcile the Editable Compatibility Slice Back Into Draft
**What:** The save path must treat visible World Review NPC fields as authoritative for the compatibility-editable slice, then rebuild or overwrite the draft slice before persistence.

**When to use:** Any draft-backed NPC that exposes editable shallow fields while reload prefers `draft`.

**Example:**
```typescript
// Source: local code patterns in frontend/lib/character-drafts.ts and
// backend/src/character/record-adapters.ts
function reconcileDraftBackedNpc(npc: ScaffoldNpc): WorldScaffold["npcs"][number] {
  const editableSlice = fromLegacyScaffoldNpc(
    {
      name: npc.name,
      persona: npc.persona,
      tags: npc.tags,
      goals: npc.goals,
      locationName: npc.locationName,
      factionName: npc.factionName,
      tier: npc.tier,
    },
    {
      currentLocationName: npc.locationName,
      factionName: npc.factionName,
      originMode: npc.draft?.socialContext.originMode ?? "resident",
      sourceKind: npc.draft?.provenance.sourceKind ?? "worldgen",
    },
  );

  return {
    ...npc,
    draft: preserveNonEditableRichFields(editableSlice, npc.draft),
  };
}
```

### Pattern 2: Preserve Rich, Non-Editable Slices While Replacing Editable Ones
**What:** Reconciliation should preserve grounding, source bundle, continuity, loadout, start conditions, relationships, and other non-card metadata from the previous draft while replacing the shallow editable compatibility slice.

**When to use:** Imported/researched/generated NPCs where Phase 52 surfaces rich metadata but the edit card only exposes shallow fields.

**Example:**
```typescript
// Source: local phase decisions from 48/49/52
const nextDraft = {
  ...editableSlice,
  grounding: previousDraft?.grounding,
  sourceBundle: previousDraft?.sourceBundle,
  continuity: previousDraft?.continuity,
  loadout: previousDraft?.loadout ?? editableSlice.loadout,
  startConditions: previousDraft?.startConditions ?? editableSlice.startConditions,
};
```

### Pattern 3: Keep Reload Draft-First After Save Convergence
**What:** `toEditableScaffold()` preferring `draft` over legacy row fields is correct. The bug is not the load preference; the bug is stale draft persistence.

**When to use:** All reload/read logic after the save path is fixed.

**Example:**
```typescript
// Source: frontend/lib/world-data-helpers.ts
return {
  name: draftNpc?.name ?? npc.name,
  persona: draftNpc?.persona ?? npc.persona,
  tags: draftNpc?.tags ?? npc.tags,
  goals: draftNpc?.goals ?? { shortTerm, longTerm },
};
```

### Anti-Patterns to Avoid

- **Frontend-only fix:** Do not patch only `NpcsSection` state handling. The authoritative loss happens on the backend save boundary.
- **Writable inspector model:** Do not make `characterRecord` or the advanced inspector editable. Phase 52 explicitly kept it additive and read-only.
- **Type widening as a “fix”:** Do not weaken `WorldScaffold` or the save-edits schema. Phase 49 already chose route-boundary normalization over looser types.
- **Legacy-row-only persistence:** Do not update only `name/persona/tags/goals` columns while leaving `characterRecord` stale; `/campaigns/:id/world` hydrates from `characterRecord` and then re-derives `draft` and `npc`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Draft-backed NPC reconciliation | A new parallel “review model” or extra persisted blob | One backend adapter-owned reconciliation helper in `record-adapters.ts` or adjacent backend character seam | Keeps one authority lane and preserves Phase 48/52 decisions |
| Manual tag persistence | Direct string-array copies into arbitrary draft fields | Existing legacy tag classification path (`fromLegacyScaffoldNpc` / `classifyLegacyTags`) plus targeted preserve/overlay of richer fields | Tag semantics are derived, not a simple writable draft field |
| Persisted NPC projection | Frontend-authored `characterRecord` JSON | Server-side `createCharacterRecordFromDraft()` + `toLegacyNpcDraft()` projection | Backend remains deterministic truth |
| Verification | Manual browser-only checks | Route/helper/component Vitest coverage plus one human smoke | This defect is a save->reload round-trip bug and needs automated proof |

**Key insight:** The phase should not invent a new model. It should repair the existing shared-lane contract so the shallow editable card becomes a compatibility view onto the same authoritative draft/record pipeline that Phase 48-52 already established.

## Common Pitfalls

### Pitfall 1: Fixing Only `name` / `persona` / `goals` But Not `tags`
**What goes wrong:** Name/persona may persist, but edited tags still disappear after reload because derived tags still come from stale rich draft fields.
**Why it happens:** In the current draft model, visible tags are compatibility output, not a first-class editable field.
**How to avoid:** Rebuild the editable compatibility slice from the visible scaffold NPC through legacy tag classification, then preserve richer non-editable fields from the old draft.
**Warning signs:** Save route tests pass for display name and goals, but `toEditableScaffold()` still reloads old draft-derived tags.

### Pitfall 2: Updating DB Legacy Columns Without Refreshing `characterRecord`
**What goes wrong:** Reload still shows stale values even though the `npcs` table row looks updated.
**Why it happens:** `/campaigns/:id/world` hydrates NPC payloads from stored `characterRecord`, then returns both `draft` and compatibility aliases from that record.
**How to avoid:** Make the reconciled draft the only input to `createCharacterRecordFromDraft()` / `saveScaffoldToDb()`.
**Warning signs:** SQL/row assertions pass, but `/campaigns/:id/world` and frontend reload assertions fail.

### Pitfall 3: Reopening Phase 52 Scope
**What goes wrong:** The phase turns into inspector editing or broader NPC UI redesign.
**Why it happens:** The visible defect lives on the same screen as the advanced inspector.
**How to avoid:** Keep the inspector read-only and subordinate; fix save/load trust only.
**Warning signs:** Proposed tasks mention editable grounding/power profile/source fields.

### Pitfall 4: Trying To Recover Already-Lost Historical Edits
**What goes wrong:** Planning expands into data recovery that the current persistence model cannot actually reconstruct.
**Why it happens:** Prior bad saves already overwrote persisted truth from stale draft data.
**How to avoid:** Treat Phase 54 as forward-looking trust repair. Only unsaved browser state can still contain the missing edits.
**Warning signs:** Plan includes migration scripts that assume the discarded top-level values still exist somewhere in SQLite.

## Code Examples

Verified local patterns to anchor implementation:

### Save-Boundary Reconciliation
```typescript
// Source: local code patterns in backend/src/routes/worldgen.ts,
// backend/src/character/record-adapters.ts, and backend/src/worldgen/scaffold-saver.ts
const scaffold = {
  ...result.data.scaffold,
  npcs: result.data.scaffold.npcs.map((npc) =>
    npc.draft ? reconcileDraftBackedNpc(npc) : materializeLegacyScaffoldNpc(npc),
  ),
};

saveScaffoldToDb(campaignId, scaffold);
```

### Round-Trip Regression Shape
```typescript
// Source: existing route test style in backend/src/routes/__tests__/worldgen.test.ts
await app.request("/api/worldgen/save-edits", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    campaignId,
    scaffold: editedScaffoldWithStaleDraft,
  }),
});

expect(mockedSaveScaffoldToDb).toHaveBeenCalledWith(
  campaignId,
  expect.objectContaining({
    npcs: [
      expect.objectContaining({
        name: "Edited Name",
        draft: expect.objectContaining({
          identity: expect.objectContaining({ displayName: "Edited Name" }),
        }),
      }),
    ],
  }),
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Shallow NPC fields could be edited separately from draft-backed persistence | Shared `CharacterDraft` / `CharacterRecord` lane is authoritative; shallow NPC fields are compatibility views | Phase 48 (2026-04-12) | Rich identity and compatibility aliases now intentionally coexist |
| `save-edits` route was only normalized to the existing `WorldScaffold` contract | `save-edits` must now also reconcile visible editable NPC fields back into draft for draft-backed rows | Phase 49 established the route-boundary seam on 2026-04-12; Phase 54 closes the remaining persistence gap | Route normalization becomes semantic, not only structural |
| Inspector work was intentionally non-persistent and read-only | Inspector stays additive/read-only while save/load trust is repaired underneath it | Phase 52 (2026-04-13) | Phase 54 must not reopen inspector scope |

**Deprecated/outdated:**

- “Trust the incoming `draft` as-is for draft-backed NPC save-edits.” This is exactly the stale behavior the milestone audit flagged.
- “Use top-level scaffold edits as merely temporary display state.” That is no longer acceptable for World Review save/load trust.

## Open Questions

1. **Where should the reconciliation helper live?**
   - What we know: The needed logic is backend-owned and adjacent to character adapters, not frontend-only.
   - What's unclear: Whether to place it in `record-adapters.ts`, a new backend helper, or `worldgen.ts`.
   - Recommendation: Put it in the backend character adapter seam so both route normalization and future NPC save flows can reuse it.

2. **Which draft slices should be preserved verbatim from the previous draft?**
   - What we know: Grounding, source bundle, continuity, loadout, start conditions, and other Phase 48/49/52 rich fields are not editable on the World Review NPC card.
   - What's unclear: Whether any additional shallow-adjacent fields such as `beliefs`, `drives`, or `frictions` should survive untouched.
   - Recommendation: Preserve all non-card rich slices unless they are directly derived from the editable compatibility fields; make this explicit in one adapter test matrix.

3. **Should the phase try to repair already-corrupted campaigns?**
   - What we know: Once a bad save has run, persisted truth has already been reprojected from stale draft data.
   - What's unclear: Whether there is any product requirement to recover lost historical edits.
   - Recommendation: Treat historical recovery as out of scope unless a concrete recoverable source is discovered. Phase 54 should prevent future loss and keep current review sessions trustworthy.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend/frontend tests and local scripts | ✓ | `v23.11.0` | — |
| npm | Workspace test/typecheck commands | ✓ | `11.12.1` | — |
| Vitest | Existing regression suite | ✓ | `3.2.4` via workspace install | — |

**Missing dependencies with no fallback:**

- None verified.

**Missing dependencies with fallback:**

- None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `Vitest 3.2.4` |
| Config file | Root [`vitest.config.ts`](/R:/Projects/WorldForge/vitest.config.ts), plus [`backend/vitest.config.ts`](/R:/Projects/WorldForge/backend/vitest.config.ts) and [`frontend/vitest.config.ts`](/R:/Projects/WorldForge/frontend/vitest.config.ts) |
| Quick run command | `npm --prefix backend exec vitest run src/routes/__tests__/worldgen.test.ts src/routes/__tests__/campaigns.test.ts src/worldgen/__tests__/scaffold-saver.test.ts && npm --prefix frontend exec vitest run lib/__tests__/world-data-helpers.test.ts components/world-review/__tests__/npcs-section.test.tsx components/world-review/__tests__/character-record-inspector.test.tsx` |
| Full suite command | `npm --prefix backend run test && npm --prefix frontend exec vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| `UX-02` | Draft-backed `name` / `persona` / `goals` / `location` / `faction` edits reconcile into persisted draft before save | route | `npm --prefix backend exec vitest run src/routes/__tests__/worldgen.test.ts -t "draft-backed NPC edit convergence"` | ✅ |
| `UX-02` | Edited tags survive save/load for draft-backed NPCs | adapter + route | `npm --prefix backend exec vitest run src/worldgen/__tests__/scaffold-saver.test.ts src/routes/__tests__/worldgen.test.ts -t "tag"` | ✅ |
| `UX-02` | Reloaded `/campaigns/:id/world` payload emits updated `characterRecord`, `draft`, and compatibility `npc` after save | route | `npm --prefix backend exec vitest run src/routes/__tests__/campaigns.test.ts -t "world route draft-backed npc round-trip"` | ✅ |
| `UX-02` | Frontend editable scaffold still prefers `draft`, now reflecting reconciled persisted truth | helper | `npm --prefix frontend exec vitest run lib/__tests__/world-data-helpers.test.ts -t "draft-backed npc reload"` | ✅ |
| `UX-02` | Advanced inspector remains additive/read-only and normal NPC card editing flow still works | component | `npm --prefix frontend exec vitest run components/world-review/__tests__/npcs-section.test.tsx components/world-review/__tests__/character-record-inspector.test.tsx` | ✅ |

### Sampling Rate

- **Per task commit:** run the quick targeted backend + frontend command above
- **Per wave merge:** `npm --prefix backend run test` and `npm --prefix frontend exec vitest run`
- **Phase gate:** targeted round-trip save/load regressions plus both suite commands green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `backend/src/routes/__tests__/worldgen.test.ts` additions — prove visible top-level edits overwrite stale draft-backed values before `saveScaffoldToDb()` is called.
- [ ] `backend/src/worldgen/__tests__/scaffold-saver.test.ts` additions — prove persisted `characterRecord` and projected legacy NPC fields reflect reconciled edits when `npc.draft` was present.
- [ ] `backend/src/routes/__tests__/campaigns.test.ts` additions — prove `/api/campaigns/:id/world` returns updated `draft` and `npc` for draft-backed NPCs after reload.
- [ ] `frontend/lib/__tests__/world-data-helpers.test.ts` additions — prove draft-first reload remains intentional and now shows the user’s saved edits because persisted draft truth changed.

## Sources

### Primary (HIGH confidence)

- [`/.planning/ROADMAP.md`](/R:/Projects/WorldForge/.planning/ROADMAP.md) - Phase 54 goal, scope, dependencies, success criteria
- [`/.planning/REQUIREMENTS.md`](/R:/Projects/WorldForge/.planning/REQUIREMENTS.md) - `UX-02` requirement mapping
- [`/.planning/v1.1-MILESTONE-AUDIT.md`](/R:/Projects/WorldForge/.planning/v1.1-MILESTONE-AUDIT.md) - confirmed defect statement and rationale for this gap-closure phase
- [`backend/src/routes/schemas.ts`](/R:/Projects/WorldForge/backend/src/routes/schemas.ts) - `scaffoldNpcSchema` / `saveEditsSchema` transform behavior for draft-backed NPC payloads
- [`backend/src/routes/worldgen.ts`](/R:/Projects/WorldForge/backend/src/routes/worldgen.ts) - `normalizeSavedScaffold()` and `/save-edits` persistence handoff
- [`backend/src/worldgen/scaffold-saver.ts`](/R:/Projects/WorldForge/backend/src/worldgen/scaffold-saver.ts) - `npc.draft`-preferred persistence and `characterRecord` projection
- [`backend/src/routes/campaigns.ts`](/R:/Projects/WorldForge/backend/src/routes/campaigns.ts) - `/campaigns/:id/world` hydration of `characterRecord`, `draft`, and compatibility `npc`
- [`frontend/lib/world-data-helpers.ts`](/R:/Projects/WorldForge/frontend/lib/world-data-helpers.ts) - reload path that prefers `draft` over legacy row fields
- [`frontend/lib/character-drafts.ts`](/R:/Projects/WorldForge/frontend/lib/character-drafts.ts) - current scaffold/draft adapter behavior and tag limitation
- [`frontend/components/world-review/npcs-section.tsx`](/R:/Projects/WorldForge/frontend/components/world-review/npcs-section.tsx) - visible editable NPC fields and additive inspector usage
- [`frontend/components/world-review/character-record-inspector.tsx`](/R:/Projects/WorldForge/frontend/components/world-review/character-record-inspector.tsx) - current inspector contract
- [`backend/src/routes/__tests__/worldgen.test.ts`](/R:/Projects/WorldForge/backend/src/routes/__tests__/worldgen.test.ts) - current save-edits coverage
- [`backend/src/routes/__tests__/campaigns.test.ts`](/R:/Projects/WorldForge/backend/src/routes/__tests__/campaigns.test.ts) - current world payload coverage
- [`backend/src/worldgen/__tests__/scaffold-saver.test.ts`](/R:/Projects/WorldForge/backend/src/worldgen/__tests__/scaffold-saver.test.ts) - persistence projection coverage
- [`frontend/lib/__tests__/world-data-helpers.test.ts`](/R:/Projects/WorldForge/frontend/lib/__tests__/world-data-helpers.test.ts) - draft-first reload precedence
- [`frontend/components/world-review/__tests__/npcs-section.test.tsx`](/R:/Projects/WorldForge/frontend/components/world-review/__tests__/npcs-section.test.tsx) - current UI card behavior coverage
- [`frontend/components/world-review/__tests__/character-record-inspector.test.tsx`](/R:/Projects/WorldForge/frontend/components/world-review/__tests__/character-record-inspector.test.tsx) - current inspector rendering coverage
- [`52-01-PLAN.md`](/R:/Projects/WorldForge/.planning/phases/52-advanced-character-inspector-and-full-record-visibility/52-01-PLAN.md) and [`52-VERIFICATION.md`](/R:/Projects/WorldForge/.planning/phases/52-advanced-character-inspector-and-full-record-visibility/52-VERIFICATION.md) - additive/read-only inspector scope
- [`49-VERIFICATION.md`](/R:/Projects/WorldForge/.planning/phases/49-search-grounding-and-in-game-research-semantics/49-VERIFICATION.md) - existing `save-edits` route-boundary normalization decision

### Secondary (MEDIUM confidence)

- `npm view hono version time --json` - latest package version `4.12.12`, published `2026-04-07`
- `npm view zod version time --json` - latest package version `4.3.6`, published `2026-01-22`
- `npm view drizzle-orm version time --json` - latest package version `0.45.2`, published `2026-03-27`
- `npm view next version time --json` - latest package version `16.2.3`, published `2026-04-08`
- `npm view react version time --json` - latest package version `19.2.5`, published `2026-04-08`
- `npm view vitest version time --json` - latest package version `4.1.4`, published `2026-04-09`

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - existing project stack is explicit in `CLAUDE.md`, package manifests, and npm registry checks
- Architecture: HIGH - local code, tests, and prior phase artifacts all point to the same single-lane convergence model
- Pitfalls: HIGH - milestone audit plus current test gaps make the failure modes concrete

**Research date:** 2026-04-13
**Valid until:** 2026-04-20

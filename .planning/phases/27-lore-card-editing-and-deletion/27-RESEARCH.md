# Phase 27: Lore card editing and deletion - Research

**Researched:** 2026-03-31
**Domain:** Per-card lore CRUD over LanceDB-backed semantic memory
**Confidence:** MEDIUM

## User Constraints (from CONTEXT.md)

### Locked Decisions
None explicitly recorded in `27-CONTEXT.md`.

### Claude's Discretion
None explicitly recorded in `27-CONTEXT.md`.

### Deferred Ideas (OUT OF SCOPE)
None explicitly recorded in `27-CONTEXT.md`.

## Project Constraints (from CLAUDE.md)

- Keep backend and frontend in TypeScript strict mode with ES modules.
- Use Zod for API payload validation.
- Route handlers should keep the existing project pattern: outer `try/catch`, `parseBody()` for JSON validation, and `getErrorStatus(error)` for status selection.
- Import shared types/constants from `@worldforge/shared` when they already exist; do not duplicate shared definitions.
- SQLite remains source of truth; LanceDB remains semantic memory.
- Do not introduce raw SQL for DB work; use existing data-layer patterns.
- Prefer existing project UI primitives and patterns over ad hoc controls.

## Summary

The existing lore surface is already split cleanly enough for Phase 27: the review page owns canonical lore state, `LoreSection` owns only local search/import UI, `frontend/lib/api.ts` is the single HTTP seam, `backend/src/routes/lore.ts` owns the route contract, and `backend/src/vectors/lore-cards.ts` owns LanceDB persistence. The main risk is not route shape, it is vector consistency and ID stability. Current bulk helpers regenerate UUIDs and recreate the whole table, which is acceptable for imports but unsafe for per-card edits because the edited card must keep its `id`.

LanceDB’s current TypeScript surface does support mutable table operations (`add`, `update`, `delete`, `countRows`), but this repo also has a historical no-vector table shape via `insertLoreCardsWithoutVectors`. Because of that, the safest edit architecture is not a direct per-row `update()` path. The safer path is a new vector helper that preserves existing IDs, rewrites the full lore set for edit operations, and re-embeds the rewritten set before recreating `lore_cards`. Delete-by-id can stay truly row-level because it does not need to refresh embeddings.

On the frontend, keep the parent page as source of truth and treat per-card edit/delete as server-authoritative mutations followed by refresh. Do not make lore editing participate in scaffold save/re-extraction, and do not try to keep both the base list and `results ?? initialCards` search overlay in sync optimistically. Clear search results after mutation, refresh from the backend, and show per-card pending/error state.

**Primary recommendation:** Add `PUT /api/campaigns/:id/lore/:cardId` and `DELETE /api/campaigns/:id/lore/:cardId`, backed by a stable-ID lore repository helper that rewrites-and-re-embeds on edit, plus a dialog/alert-driven world-review UI that refreshes from the server after success.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `hono` | `4.12.3` (repo) | Lore HTTP routes | Existing backend framework and error-handling pattern |
| `zod` | `4.3.6` (repo) | Edit payload validation | Already used for all route payloads |
| `@lancedb/lancedb` | `0.26.2` (repo) | Lore vector storage | Existing semantic lore store |
| `vitest` | `3.2.4` (repo) | Backend and frontend regression coverage | Existing test framework in both packages |
| `next` + `react` | `16.1.6` + `19.2.3` (repo) | World-review lore UI | Existing frontend stack |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Existing shadcn UI primitives | repo-local | Edit dialog, delete confirmation, buttons, inputs | Reuse for per-card actions instead of inventing new UI patterns |
| `lucide-react` | `0.576.0` (repo) | Per-card action icons | Keep consistent with current review UI |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `PUT /:id/lore/:cardId` with all fields required | `PATCH /:id/lore/:cardId` | `PATCH` adds partial-merge semantics and makes vector refresh rules more ambiguous |
| Stable-ID full-table rewrite on edit | Direct LanceDB `table.update()` | Faster, but brittle if the existing table was created without a `vector` column |
| Parent refresh after mutation | Optimistic local mutation | Faster-feeling UI, but easy to desynchronize `initialCards` and current search results |

**Installation:**
```bash
# No new packages required for Phase 27.
```

**Version verification:** Current npm registry checks on 2026-03-31:

- `hono`: latest `4.12.9`, published 2026-03-23; repo uses `4.12.3`
- `@lancedb/lancedb`: latest `0.27.1`, published 2026-03-20; repo uses `0.26.2`
- `zod`: latest `4.3.6`, published 2026-01-22; repo uses `4.3.6`
- `vitest`: latest `4.1.2`, published 2026-03-26; repo uses `3.2.4`
- `next`: latest `16.2.1`, published 2026-03-20; repo uses `16.1.6`
- `react`: latest `19.2.4`, published 2026-01-26; repo uses `19.2.3`

## Architecture Patterns

### Recommended Project Structure
```text
frontend/
├── components/world-review/lore-section.tsx      # Per-card review UX
├── components/world-review/__tests__/lore-section.test.tsx
└── lib/api.ts                                    # Lore item HTTP helpers

backend/
├── src/routes/lore.ts                            # Collection + item lore routes
├── src/routes/schemas.ts                         # Lore edit Zod schema
├── src/routes/__tests__/lore.test.ts             # Route regression coverage
├── src/vectors/lore-cards.ts                     # Stable-ID lore repository helpers
└── src/vectors/__tests__/lore-cards.test.ts      # Vector helper coverage
```

### Likely Code Seams

- `frontend/components/world-review/lore-section.tsx`
  Current seam is good: it already owns search state and import dialog state. It needs per-card action state, not parent-owned form state.
- `frontend/app/campaign/[id]/review/page.tsx`
  Already has `onRefresh` and parent-owned `loreCards`; keep this as the only canonical client cache.
- `frontend/lib/api.ts`
  Needs lore item helpers and likely a small `apiPut` primitive instead of inline `fetch`.
- `backend/src/routes/lore.ts`
  Natural home for item routes; keep collection routes unchanged.
- `backend/src/routes/schemas.ts`
  Best place for `loreCardUpdateSchema`, reusing `LORE_CATEGORIES`.
- `backend/src/vectors/lore-cards.ts`
  Current helpers are bulk-oriented and regenerate IDs. This file needs a stable-ID edit path.
- `backend/src/routes/__tests__/lore.test.ts`
  Existing seam is direct and fast, but current mocks use `title/content` instead of `term/definition`; fix that while adding new cases.

### Pattern 1: Full-Replace Item Update Route
**What:** Use `PUT /api/campaigns/:id/lore/:cardId` with all editable fields required: `term`, `definition`, `category`.

**When to use:** For any user-driven lore edit from world review.

**Why:** Full replacement matches the actual editable surface, keeps validation simple, and guarantees the backend can build the exact embedding payload from one authoritative body.

**Example:**
```ts
// Project route pattern: outer try/catch + parseBody + getErrorStatus
app.put("/:id/lore/:cardId", async (c) => {
  try {
    const campaignId = c.req.param("id");
    const cardId = c.req.param("cardId");
    assertSafeId(campaignId);
    assertSafeId(cardId);

    const result = await parseBody(c, loreCardUpdateSchema);
    if ("response" in result) return result.response;

    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const updated = await replaceLoreCard(
      cardId,
      result.data,
      resolveEmbedder(loadSettings()),
    );

    if (!updated) {
      return c.json({ error: "Lore card not found." }, 404);
    }

    return c.json({ card: updated });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to update lore card.") },
      getErrorStatus(error),
    );
  }
});
```

### Pattern 2: Stable-ID Rewrite Helper Owns Vector Freshness
**What:** Add a dedicated vector-layer helper for edit operations that:

1. reads the current lore set with IDs,
2. replaces the target card in memory,
3. re-embeds the rewritten set,
4. recreates `lore_cards` with the same IDs.

**When to use:** Edit only. Not for delete.

**Why:** This repo already has a no-vector fallback table shape. Rewriting the edited set is the lowest-risk way to guarantee a valid final schema and fresh embeddings without branching edit logic by legacy table shape.

**Example:**
```ts
export async function replaceLoreCard(
  cardId: string,
  patch: { term: string; definition: string; category: LoreCategory },
  embedderResult: ResolveResult,
): Promise<{ id: string; term: string; definition: string; category: LoreCategory } | null> {
  if (!("resolved" in embedderResult)) {
    throw new Error("Embedder not configured. Lore edits require fresh embeddings.");
  }

  const current = await getAllLoreCardsWithIds();
  const index = current.findIndex((card) => card.id === cardId);
  if (index === -1) return null;

  const next = [...current];
  next[index] = { id: cardId, ...patch };

  await replaceLoreCardsPreservingIds(next, embedderResult);
  return next[index];
}
```

### Pattern 3: Dialog-Driven Edit, Alert-Driven Delete, Refresh-After-Success
**What:** Add edit and delete controls per card in `LoreSection`, with one-card-at-a-time pending state.

**When to use:** World review only. Keep in-game lore panel out of scope.

**Why:** The repo already uses `Dialog` and `AlertDialog`, and the review page already exposes `onRefresh`. Reuse those patterns rather than building local cache reconciliation.

**Recommended UI behavior:**

- Edit opens a small dialog prefilled with `term`, `definition`, `category`.
- Save disables only that card’s action controls.
- Delete uses `AlertDialog` confirmation.
- After success: `setResults(null)` and call `onRefresh?.()`.
- After failure: keep dialog open for edit, surface inline or toast error.

### Anti-Patterns to Avoid

- **Calling `storeLoreCards()` from the edit route:** it regenerates IDs and is designed for imports/bulk generation, not stable per-card edits.
- **Reusing `/api/worldgen/save-edits` for lore admin:** that path re-extracts lore from scaffold and would overwrite manual card changes.
- **Direct optimistic mutation of `displayCards`:** `displayCards` is derived from `results ?? initialCards`; local mutation here will drift from parent state and search state.
- **`PATCH` with optional fields:** extra conditional logic for omitted fields adds surface area without any benefit in this phase.
- **Returning `200 OK` on missing card delete/update:** Phase 27 explicitly requires not-found handling.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Edit payload validation | Inline string checks in the route | Zod schema in `backend/src/routes/schemas.ts` | Keeps route behavior aligned with the rest of the backend |
| Route-level fetch boilerplate | Ad hoc `fetch` calls inside components | Small helpers in `frontend/lib/api.ts` | Keeps world-review components UI-only |
| Delete confirmation | Custom inline confirmation widgets | Existing `AlertDialog` primitive | Already used elsewhere; lower UI risk |
| Vector freshness policy | Ad hoc re-embed logic inside routes | Dedicated helper in `backend/src/vectors/lore-cards.ts` | Keeps semantic-memory invariants in one place |
| Search/list synchronization | Client-side hand-maintained dual caches | Server refresh via existing `onRefresh` seam | Avoids stale `results` vs `initialCards` bugs |

**Key insight:** The dangerous complexity here is not CRUD, it is preserving semantic-search correctness while keeping stable lore IDs. Centralize that once in the vector module and keep everything else thin.

## Common Pitfalls

### Pitfall 1: ID Churn on Edit
**What goes wrong:** The edited card comes back with a new `id`, or all cards get new IDs.

**Why it happens:** `storeLoreCards()` generates UUIDs every time it stores cards.

**How to avoid:** Add a stable-ID rewrite helper specifically for existing cards. Keep `storeLoreCards()` bulk-only.

**Warning signs:** UI action buttons target one card before save and a different card after refresh; not-found tests become flaky.

### Pitfall 2: Manual Edits Get Overwritten by World Save
**What goes wrong:** A user edits a lore card, then later saves the world review and loses that manual edit.

**Why it happens:** `/api/worldgen/save-edits` currently deletes all lore and re-extracts it from scaffold.

**How to avoid:** Treat Phase 27 lore edits as an independent admin surface. Do not route them through scaffold save or lore extraction.

**Warning signs:** Edited text disappears after unrelated world-review saves.

### Pitfall 3: Stale Search Overlay After Mutation
**What goes wrong:** The card list refreshes, but the visible search results still show the old term/definition or a deleted card.

**Why it happens:** `LoreSection` renders `results ?? initialCards`, and `results` survives until explicitly cleared.

**How to avoid:** On successful edit/delete, clear `results` before refreshing parent lore state.

**Warning signs:** Search mode shows different data than the non-search list immediately after mutation.

### Pitfall 4: Weak Route Tests Miss Payload-Shape Regressions
**What goes wrong:** Tests pass while real UI payloads break.

**Why it happens:** Existing lore route tests mock cards with `title/content` instead of `term/definition`.

**How to avoid:** Normalize existing lore route tests to real card shape before or while adding new cases.

**Warning signs:** Backend tests pass but frontend integration fails on renamed fields.

### Pitfall 5: Frontend Test Command Fails From Repo Root
**What goes wrong:** The lore-section test fails to resolve `@/` imports even though the test is healthy.

**Why it happens:** Frontend Vitest config assumes frontend working directory.

**How to avoid:** Run frontend tests from `frontend/`.

**Warning signs:** Import-resolution failures for `@/components/...` with “does the file exist?” messages.

## Code Examples

Verified patterns from official docs and the current codebase:

### Per-Card Delete With Explicit Not-Found
```ts
export async function deleteLoreCardById(cardId: string): Promise<boolean> {
  const db = getVectorDb();
  const tableNames = await db.tableNames();
  if (!tableNames.includes(TABLE_NAME)) return false;

  const table = await db.openTable(TABLE_NAME);
  const existing = await table.countRows(`id = '${cardId}'`);
  if (existing === 0) return false;

  await table.delete(`id = '${cardId}'`);
  return true;
}
```

### Frontend Mutation Flow
```ts
const handleDelete = async (cardId: string) => {
  setDeletingCardId(cardId);
  try {
    await deleteLoreCard(campaignId, cardId);
    setResults(null);
    await onRefresh?.();
  } finally {
    setDeletingCardId(null);
  }
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Bulk `dropTable` + recreate for all lore writes | Stable-ID rewrite helper for edit, targeted delete for delete | Needed for Phase 27 item-level CRUD | Preserves IDs and keeps vectors aligned |
| Collection-only lore admin | Item routes under the same lore router | Needed for Phase 27 | Clean separation between list/search and item mutation |
| Loosely typed lore route tests | Real `term/definition/category` route assertions | Should change in this phase | Catches actual payload regressions |

**Deprecated/outdated:**

- Using `storeLoreCards()` for per-card edits
- Using worldgen lore re-extraction as a substitute for manual lore admin
- Treating frontend search results as a safe local cache after mutation

## Recommended Plan Split

### Split 1: Backend contract and vector safety

- Add `loreCardUpdateSchema` in `backend/src/routes/schemas.ts`
- Add `PUT /:id/lore/:cardId` and `DELETE /:id/lore/:cardId` in `backend/src/routes/lore.ts`
- Add stable-ID lore helpers in `backend/src/vectors/lore-cards.ts`
- Preserve existing collection routes unchanged

### Split 2: World-review UI and client helpers

- Add `updateLoreCard()` and `deleteLoreCardById()` helpers in `frontend/lib/api.ts`
- Add per-card action buttons in `frontend/components/world-review/lore-section.tsx`
- Use `Dialog` for edit and `AlertDialog` for delete
- Keep parent `onRefresh` as the authoritative refresh seam

### Split 3: Regression coverage and verification

- Extend `backend/src/routes/__tests__/lore.test.ts`
- Extend `backend/src/vectors/__tests__/lore-cards.test.ts`
- Extend `frontend/components/world-review/__tests__/lore-section.test.tsx`
- Manual smoke: edit in review, search updated term, delete card, refresh page, confirm persistence

## Open Questions

1. **Should edit be disabled when no embedder is configured?**
   - What we know: Phase 27 requires vector freshness, and current search already depends on embeddings.
   - What's unclear: Whether the UI should proactively hide/disable edit or simply surface backend failure.
   - Recommendation: Keep Phase 27 minimal and enforce this on the backend with a clear error; optional proactive UI gating can come later.

2. **Should the edit UI be inline or dialog-based?**
   - What we know: The repo already has stable `Dialog` and `AlertDialog` patterns.
   - What's unclear: Whether inline editing would fit well across the card grid on mobile.
   - Recommendation: Use a dialog for edit and keep the card grid read-first.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `3.2.4` |
| Config file | `backend/vitest.config.ts`, `frontend/vitest.config.ts` |
| Quick run command | `npm --prefix backend test -- src/routes/__tests__/lore.test.ts` |
| Full suite command | `npm --prefix backend test` |

Frontend note: run frontend Vitest commands from `frontend/`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P27-1 | Edit one lore card by id | backend route | `npm --prefix backend test -- src/routes/__tests__/lore.test.ts` | ✅ |
| P27-2 | Delete one lore card by id | backend route | `npm --prefix backend test -- src/routes/__tests__/lore.test.ts` | ✅ |
| P27-3 | Reject invalid `term` / `definition` / `category` | backend route | `npm --prefix backend test -- src/routes/__tests__/lore.test.ts` | ✅ |
| P27-4 | Return 404 for missing lore card | backend route | `npm --prefix backend test -- src/routes/__tests__/lore.test.ts` | ✅ |
| P27-5 | Re-embed rewritten lore set on edit | vector helper | `npm --prefix backend test -- src/vectors/__tests__/lore-cards.test.ts` | ✅ |
| P27-6 | World-review edit/delete UI shows pending and refreshes correctly | frontend component | `npx vitest run components/world-review/__tests__/lore-section.test.tsx` (workdir `frontend/`) | ✅ |

### Sampling Rate

- **Per task commit:** targeted backend or frontend test for the file being changed
- **Per wave merge:** backend lore route tests + vector helper tests + frontend lore-section tests
- **Phase gate:** full backend suite green, plus targeted frontend lore-section test green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] Extend `backend/src/routes/__tests__/lore.test.ts` to use real lore card shape (`term`, `definition`, `category`) before adding new item-route cases
- [ ] Add edit/delete-specific coverage to `backend/src/vectors/__tests__/lore-cards.test.ts`
- [ ] Extend `frontend/components/world-review/__tests__/lore-section.test.tsx` for edit dialog, delete confirmation, pending state, and refresh clearing
- [ ] Document frontend test workdir requirement in the plan so verification does not run from repo root

## Sources

### Primary (HIGH confidence)

- Local code: `frontend/components/world-review/lore-section.tsx`, `frontend/app/campaign/[id]/review/page.tsx`, `frontend/lib/api.ts`, `backend/src/routes/lore.ts`, `backend/src/routes/schemas.ts`, `backend/src/vectors/lore-cards.ts`, `backend/src/routes/__tests__/lore.test.ts`
- LanceDB docs: https://docs.lancedb.com/tables
- Installed LanceDB typings: `node_modules/@lancedb/lancedb/dist/table.d.ts`
- Hono validation docs: https://hono.dev/docs/guides/validation
- npm registry metadata via `npm view`

### Secondary (MEDIUM confidence)

- None needed beyond the official docs and local code

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - verified from repo manifests and current npm registry metadata
- Architecture: MEDIUM - route/UI seams are clear, but the exact edit helper shape is a recommendation based on current repo constraints rather than existing implementation
- Pitfalls: HIGH - directly observed from current code and verified test commands

**Research date:** 2026-03-31
**Valid until:** 2026-04-30

# Phase 26: Reusable multi-worldbook library for campaign creation - Research

**Researched:** 2026-03-31
**Domain:** Reusable worldbook storage, multi-source composition, campaign-creation contract design
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Campaign Creation UX
- The existing single-upload WorldBook flow becomes a subset of a broader multi-source flow, not a separate path.
- Step 1 of campaign creation must support both selecting previously processed worldbooks from a local library and uploading additional new worldbooks in the same session.
- The UI should keep the current “create world” mental model intact: users still enter campaign concept once, but the knowledge source becomes a selectable set instead of one transient file.

### Library Persistence
- Processed worldbooks must live outside any single campaign so they can be reused across future campaign creation sessions.
- Library storage should persist classified entries plus metadata needed to identify, display, and reuse a worldbook without re-running classification.
- Selected library items should still be recorded on the created campaign so downstream generation/review can trace which sources were used.

### Merge Strategy
- Merge should happen from classified entries into one combined generation knowledge set, because the current pipeline already accepts classified entries and converts them into `IpResearchContext`.
- The combined context must preserve source provenance well enough for future debugging and conflict handling, even if the first UI only exposes a simple merged experience.
- Duplicate/conflicting names should be normalized deterministically rather than relying on upload order luck.

### Compatibility and Scope
- Existing `suggest-seeds` and `generate` entry points should continue to work for single-worldbook and no-worldbook campaigns.
- Phase 26 should focus on reusable multi-worldbook selection/storage/composition in campaign creation, not on editing lore cards after generation.
- The library should remain local-first and file-backed, matching the project's existing campaign storage model.

### the agent's Discretion
- Exact on-disk library layout, file identity strategy, and provenance metadata schema are at the agent's discretion as long as reuse, deduplication, and campaign traceability are preserved.
- The planner may split backend storage, merge logic, and frontend selection UX into separate plans/waves if that improves safety.

### Deferred Ideas (OUT OF SCOPE)
- Rich conflict-resolution UI for duplicate entities across worldbooks can be deferred if Phase 26 ships a deterministic merge plus clear provenance metadata.
- Advanced library management features beyond selection/reuse during campaign creation are deferred unless they are required to make the basic library usable.
</user_constraints>

## Summary

Phase 26 should not introduce a new database or service. The repo already uses file-backed local persistence for mutable user data (`campaigns/{id}/config.json`, `settings.json`), and the worldbook pipeline already works from classified entries into `IpResearchContext`. The safest plan is to add an immutable reusable worldbook library under the ignored user-data root, store processed classified entries once, and let the backend own all selection-to-composition logic.

The current risk is not parsing or classification. Those seams already exist in [`backend/src/worldgen/worldbook-importer.ts`](R:\Projects\WorldForge\backend\src\worldgen\worldbook-importer.ts), [`backend/src/routes/worldgen.ts`](R:\Projects\WorldForge\backend\src\routes\worldgen.ts), and [`frontend/components/title/use-new-campaign-wizard.ts`](R:\Projects\WorldForge\frontend\components\title\use-new-campaign-wizard.ts). The real risk is scope leakage: if the frontend merges sources, if the library is modeled as a fake campaign, or if campaigns store only a merged blob without source IDs and hashes, Phase 26 will become hard to debug and hard to extend.

The implementation should therefore be split into three concerns: immutable reusable storage, deterministic server-side composition with provenance, and wizard-state/UI refactor from a single transient upload to a source collection. Keep `generate` backward-compatible by continuing to consume `ipContext`, but move the multi-worldbook contract earlier, into campaign creation and `suggest-seeds`.

**Primary recommendation:** Store immutable processed worldbooks under `campaigns/_worldbook-library/`, compose selected sources on the backend into `IpResearchContext`, and persist a `worldbookSelection` snapshot on each campaign beside `ipContext`.

## Project Constraints (from CLAUDE.md)

- User communication is in Russian.
- TypeScript strict mode and ES modules remain the project standard.
- Use Drizzle query builder, not raw SQL.
- Use Zod schemas for all AI tool definitions and API payloads.
- Prefer `ai` SDK functions over raw fetch to LLM APIs.
- Route handlers should keep the established outer `try/catch` + `parseBody()` + `getErrorStatus()` pattern.
- Shared types and constants belong in `@worldforge/shared`; do not duplicate them across backend/frontend.
- Local-first architecture is already established: SQLite is source of truth, LanceDB is embedded vector storage, campaigns are file-backed under `campaigns/`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `fs`/`path`/`crypto` | Built-in (`node v23.11.0` available) | File-backed library records, hashing, path management | Matches existing campaign/settings persistence model with zero new runtime dependency |
| `zod` | `4.3.6` (repo-pinned; registry latest still `4.3.6`, published 2026-01-22 UTC) | Request payload and persisted-record schema validation | Already used across routes and shared contracts |
| `hono` | `4.12.3` (repo-pinned; registry latest `4.12.9`, published 2026-03-23 UTC) | Backend route extension for library listing/import/selection contract | Existing HTTP layer; no reason to add another server abstraction |
| `react` / `next` | `19.2.3` / `16.1.6` (repo-pinned; registry latest `19.2.4` and `16.2.1`) | Wizard state and library-selection UI | Existing frontend runtime and state model already own the campaign-creation flow |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | `3.2.4` (repo-pinned; registry latest `4.1.2`) | Unit and route regression coverage | Use for composition, route schema, wizard-state, and compatibility tests |
| `@worldforge/shared` | workspace | Shared type surface for `IpResearchContext` and new selection metadata | Use for any contract shared between backend routes and frontend wizard |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `campaigns/_worldbook-library/` JSON files | New SQLite/global table | Overkill for immutable reusable records; adds migration surface for no real benefit |
| Backend-owned composition | Frontend pre-merge into one entry array | Loses provenance authority and duplicates merge logic across client/server |
| Content-hash identity | Filename-based identity | Filename dedupe breaks on renamed files and fails to detect identical content with different names |

**Installation:**
```bash
# No new packages required for Phase 26.
```

**Version verification:** Registry-checked on 2026-03-31 with `npm view`. Newer releases exist for `next`, `react`, `hono`, and `vitest`; do not mix a dependency upgrade into this phase.

## Architecture Patterns

### Recommended Project Structure
```text
backend/
├── src/worldbook-library/     # file-backed reusable library manager + schemas + paths
├── src/worldgen/              # composition and WorldBook->IpResearchContext helpers
├── src/routes/                # library routes + campaign/worldgen contract changes
└── src/campaign/              # persist selected worldbook metadata on campaigns

frontend/
├── components/title/          # wizard UI and source-collection state
└── lib/                       # API client types for library items and selection payload
```

### Pattern 1: Immutable Library Record + Mutable Index
**What:** Store each processed worldbook as its own immutable JSON record file keyed by content hash, with a lightweight `index.json` for listing metadata.
**When to use:** Always, for reusable processed worldbooks.
**Example:**
```typescript
// Pattern derived from backend/src/campaign/manager.ts and backend/src/settings/manager.ts
type StoredWorldbookRecord = {
  id: string; // sha256(normalized parsed entries)
  displayName: string;
  originalFileName: string;
  normalizedSourceHash: string;
  createdAt: number;
  updatedAt: number;
  classificationVersion: 1;
  entryCount: number;
  entries: ClassifiedEntry[];
};
```

### Pattern 2: Backend-Owned Composition
**What:** Send selected source descriptors to the backend, load library records there, then compose one merged context plus source snapshot.
**When to use:** `suggest-seeds`, campaign creation, and any later worldgen re-entry.
**Example:**
```typescript
// Pattern based on backend/src/routes/worldgen.ts + backend/src/routes/schemas.ts
type SelectedWorldbookSource =
  | { kind: "library"; id: string }
  | { kind: "uploaded"; tempId: string; displayName: string; entries: ClassifiedEntry[] };
```

### Pattern 3: Campaign Snapshot, Not Campaign Ownership
**What:** Campaign config stores which library records were selected, but the reusable records remain outside the campaign.
**When to use:** On campaign creation and for downstream review/debug surfaces.
**Example:**
```typescript
type CampaignWorldbookSelection = {
  id: string;
  displayName: string;
  normalizedSourceHash: string;
  entryCount: number;
};
```

### Anti-Patterns to Avoid
- **Fake campaign as library container:** Reusing the campaign directory shape for reusable worldbooks couples unrelated concerns and invites accidental listing/loading bugs.
- **Filename dedupe:** Two files with identical content but different names should resolve to one reusable record.
- **Client-only merge logic:** The browser should collect selections, not own the canonical composition algorithm.
- **Store only merged `ipContext`:** That loses exact source traceability and blocks future conflict tooling.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reusable processed storage | New DB schema/service | File-backed manager under `campaigns/_worldbook-library/` | Matches repo conventions and avoids migrations |
| Merge orchestration | Ad hoc array concatenation in the wizard | Deterministic backend composer with normalized keys | Prevents upload-order bugs and keeps provenance authoritative |
| Source identity | Filename or user label matching | SHA-256 of normalized parsed entries | Stable dedupe across re-uploads and renames |
| Campaign traceability | Free-form text note on config | Structured `worldbookSelection[]` snapshot | Enables later debugging and re-composition |

**Key insight:** Phase 26 already has the expensive part, classification. The phase succeeds or fails on identity, provenance, and contract placement, not on parsing.

## Common Pitfalls

### Pitfall 1: Upload-Order-Dependent Merge
**What goes wrong:** The same two worldbooks produce different merged contexts depending on which one was selected or uploaded first.
**Why it happens:** Naive concatenation and first-win duplicate handling.
**How to avoid:** Sort sources and grouped entities deterministically by normalized display name, source ID, type, and normalized entity key before deriving `keyFacts` and `canonicalNames`.
**Warning signs:** Tests pass only with one source order; duplicate names appear/disappear between sessions.

### Pitfall 2: Provenance Lost at Campaign Save Time
**What goes wrong:** A campaign only stores merged `ipContext`, so nobody can tell which reusable worldbooks were used.
**Why it happens:** Reusing the Phase 25 `ipContext` cache field without adding source metadata.
**How to avoid:** Persist `worldbookSelection[]` on campaign config beside `ipContext` and `premiseDivergence`.
**Warning signs:** Review/debug surfaces can show lore facts but not source records.

### Pitfall 3: Frontend/Backend Logic Drift
**What goes wrong:** The wizard and backend each implement different merge or identity rules.
**Why it happens:** Extending the current client-side `worldbookToIpContext()` shortcut instead of centralizing composition.
**How to avoid:** Keep client-side upload classification, but move reusable-storage lookup and multi-source composition to backend-only code.
**Warning signs:** `suggest-seeds` behavior differs from `create campaign` or `generate`.

### Pitfall 4: Library Path Pollutes Campaign Listing
**What goes wrong:** The UI starts seeing a library directory as a malformed campaign.
**Why it happens:** A reusable library is placed under `campaigns/` without a guard in listing code.
**How to avoid:** Put the library under a reserved underscored directory and explicitly ignore underscored directories in `listCampaigns()`.
**Warning signs:** Campaign list logs or tests start touching `_worldbook-library`.

## Code Examples

Verified patterns from repo sources:

### File-backed local manager
```typescript
// Source: backend/src/campaign/manager.ts
function writeJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}
```

### Route schema extension for multi-source selection
```typescript
// Source pattern: backend/src/routes/schemas.ts
const selectedWorldbookSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("library"), id: z.string().min(1) }),
  z.object({
    kind: z.literal("uploaded"),
    tempId: z.string().min(1),
    displayName: z.string().min(1),
    entries: z.array(z.object({
      name: z.string(),
      type: z.enum(["character", "location", "faction", "bestiary", "lore_general"]),
      summary: z.string(),
    })),
  }),
]);
```

### Deterministic multi-worldbook composition
```typescript
// Source pattern: backend/src/worldgen/worldbook-importer.ts
function normalizeEntityKey(type: string, name: string): string {
  return `${type}:${name.trim().toLowerCase()}`;
}

function sortStable(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| One transient uploaded worldbook in wizard state | Reusable immutable library records + source collection state | Planned for Phase 26 | Enables reuse and mixed selection without reclassification |
| Client sends flat `worldbookEntries[]` | Client sends selected source descriptors; backend composes | Planned for Phase 26 | Keeps provenance and merge semantics in one place |
| Campaign stores only merged `ipContext` | Campaign stores `ipContext` plus `worldbookSelection[]` snapshot | Planned for Phase 26 | Downstream review/debug can trace exact sources |

**Deprecated/outdated:**
- Single-file-only wizard state (`worldbookFile`, `worldbookEntries`, `worldbookStatus`) should be treated as a temporary compatibility shape, not extended further.

## Open Questions

1. **Should the library store raw uploaded JSON or only processed classified entries?**
   - What we know: Phase 26 only needs reuse, dedupe, and composition.
   - What's unclear: Future edit/delete workflows in Phase 27 may benefit from raw source retention.
   - Recommendation: Store processed classified entries now; add raw source retention only if Phase 27 requires record rehydration.

2. **Should franchise research and selected worldbooks combine in the same request?**
   - What we know: today `suggest-seeds` already treats `worldbookEntries` as higher priority than franchise research.
   - What's unclear: mixed franchise+worldbook composition semantics were not requested in Phase 26.
   - Recommendation: Keep current precedence: if any worldbook sources are selected, skip franchise research for that request.

3. **Does Phase 26 need library management actions beyond selection/import?**
   - What we know: context explicitly defers advanced management.
   - What's unclear: users may want rename/delete quickly once the library exists.
   - Recommendation: expose list + import + select only. Defer rename/delete/edit UI.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `3.2.4` in backend/frontend/shared |
| Config file | `backend/vitest.config.ts`, `frontend/vitest.config.ts`, `shared/vitest.config.ts` |
| Quick run command | `npm --prefix backend run test -- worldbook-importer worldgen campaigns` |
| Full suite command | `npm --prefix backend run test && npm --prefix frontend exec vitest run && npm --prefix shared exec vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P26-01 | Reusable processed worldbooks persist outside campaigns with stable identity | unit | `npm --prefix backend run test -- src/worldbook-library/__tests__/manager.test.ts` | ❌ Wave 0 |
| P26-02 | Multiple selected/uploaded worldbooks compose deterministically with provenance | unit | `npm --prefix backend run test -- src/worldgen/__tests__/worldbook-composition.test.ts` | ❌ Wave 0 |
| P26-03 | Campaign creation records selected worldbooks while keeping single/no-worldbook compatibility | route | `npm --prefix backend run test -- src/routes/__tests__/campaigns.test.ts src/routes/__tests__/worldgen.test.ts` | ✅ extend |
| P26-04 | Wizard Step 1 supports selecting library items plus uploading new files in one session | component | `npm --prefix frontend exec vitest run components/title/__tests__/new-campaign-dialog.test.tsx` | ✅ extend |
| P26-05 | `suggest-seeds` and later generation use the same composed source set | integration-style route/unit | `npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts src/worldgen/__tests__/seed-suggester.test.ts` | ✅ extend |

### Sampling Rate
- **Per task commit:** `npm --prefix backend run test -- src/worldgen/__tests__/worldbook-importer.test.ts src/routes/__tests__/worldgen.test.ts`
- **Per wave merge:** `npm --prefix backend run test && npm --prefix frontend exec vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/worldbook-library/__tests__/manager.test.ts` — reusable library storage and dedupe
- [ ] `backend/src/worldgen/__tests__/worldbook-composition.test.ts` — multi-source merge determinism and provenance
- [ ] `frontend/components/title/__tests__/use-new-campaign-wizard.test.tsx` or equivalent — collection-state refactor coverage
- [ ] Extend `backend/src/campaign/__tests__/manager.test.ts` — `worldbookSelection[]` persistence

## Safe Plan Decomposition

### Wave 1: Backend storage foundation
- Add `worldbook-library` paths/manager/types under backend.
- Use `campaigns/_worldbook-library/{index.json,records/*.json}`.
- Add content-hash identity, index maintenance, and unit tests.

### Wave 2: Composition and contract integration
- Add backend composition helper that accepts library IDs plus uploaded transient entries.
- Extend shared/backend/frontend schemas with `selectedWorldbooks` and campaign `worldbookSelection[]`.
- Keep `generate` compatible by still saving/loading merged `ipContext`.

### Wave 3: Wizard/library UX refactor
- Replace single-file wizard state with a source collection.
- Fetch reusable library on dialog open.
- Support selecting existing items and uploading new files in the same Step 1 surface.

### Wave 4: Compatibility and polish
- Verify no-worldbook, single-worldbook, and mixed-worldbook flows.
- Add explicit campaign-list ignore for underscored directories.
- Tighten regression tests around `suggest-seeds`, campaign creation, and generate/review handoff.

## Sources

### Primary (HIGH confidence)
- [`R:\Projects\WorldForge\backend\src\worldgen\worldbook-importer.ts`](R:\Projects\WorldForge\backend\src\worldgen\worldbook-importer.ts) - current parse/classify/import/`worldbookToIpContext` seam
- [`R:\Projects\WorldForge\backend\src\routes\worldgen.ts`](R:\Projects\WorldForge\backend\src\routes\worldgen.ts) - current request flow for `suggest-seeds`, `generate`, and worldbook import
- [`R:\Projects\WorldForge\backend\src\routes\schemas.ts`](R:\Projects\WorldForge\backend\src\routes\schemas.ts) - current API contract surface
- [`R:\Projects\WorldForge\backend\src\campaign\manager.ts`](R:\Projects\WorldForge\backend\src\campaign\manager.ts) - campaign config persistence pattern
- [`R:\Projects\WorldForge\frontend\components\title\use-new-campaign-wizard.ts`](R:\Projects\WorldForge\frontend\components\title\use-new-campaign-wizard.ts) - current single-worldbook wizard state
- [`R:\Projects\WorldForge\frontend\components\title\new-campaign-dialog.tsx`](R:\Projects\WorldForge\frontend\components\title\new-campaign-dialog.tsx) - Step 1 UX seam
- [`R:\Projects\WorldForge\.gitignore`](R:\Projects\WorldForge\.gitignore) - ignored local data roots
- `npm view next`, `npm view react`, `npm view hono`, `npm view zod`, `npm view vitest` - registry version/publish-date verification on 2026-03-31

### Secondary (MEDIUM confidence)
- [`R:\Projects\WorldForge\docs\tech_stack.md`](R:\Projects\WorldForge\docs\tech_stack.md) - existing local-first architecture intent
- [`R:\Projects\WorldForge\backend\src\worldgen\seed-suggester.ts`](R:\Projects\WorldForge\backend\src\worldgen\seed-suggester.ts) - downstream assumptions about `ipContext`
- [`R:\Projects\WorldForge\backend\src\worldgen\scaffold-steps\prompt-utils.ts`](R:\Projects\WorldForge\backend\src\worldgen\scaffold-steps\prompt-utils.ts) - prompt contract implications

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified against repo manifests and npm registry on 2026-03-31
- Architecture: HIGH - based on existing repo seams and established persistence patterns
- Pitfalls: HIGH - directly derived from current single-source implementation limits and campaign persistence model

**Research date:** 2026-03-31
**Valid until:** 2026-04-30

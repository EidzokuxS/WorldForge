# Phase 38: Authoritative Inventory & Equipment State - Research

**Researched:** 2026-04-12
**Domain:** Inventory/equipment runtime authority in SQLite-backed gameplay state
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Runtime Authority
- **D-01:** After campaign creation completes, `items` is the only runtime source of truth for inventory and equipment state for both players and NPCs.
- **D-02:** `characterRecord.loadout` remains a creation/provenance snapshot only. It may seed initial runtime items, but it must not remain a live authority once the campaign starts.
- **D-03:** Legacy `equippedItems` columns become compatibility projection only during migration/deprecation. They must not remain a read authority for live gameplay, prompts, checkpoints, or UI.

### Equipment Semantics
- **D-04:** Equipped-vs-carried state must live on authoritative item rows, not as a second list on the owning character row.
- **D-05:** Equip-state should use structured item metadata rather than free-form prompt tags. The exact schema shape is planner discretion, but the invariant is: possession and equip-state are resolved from the same authoritative row model.
- **D-06:** The same item row model must work for both player and NPC equipment. This phase should not invent separate player-only and NPC-only authority paths.

### Read / Write Contract
- **D-07:** Gameplay tool execution, prompt assembly, world payloads, checkpoints, retry/undo restore, and frontend inventory/equipment surfaces must read runtime state from authoritative item rows only.
- **D-08:** Runtime item mutations must update the authoritative item model directly. Any remaining legacy projections are one-way compatibility outputs, not parallel writes that future readers depend on.
- **D-09:** Fallback logic that reconstructs runtime inventory or equipment from `characterRecord` or `equippedItems` after campaign start is a bug and should be removed or isolated to explicit legacy import/migration paths.

### Migration / Compatibility
- **D-10:** Phase 38 must include a legacy-campaign migration/backfill path so pre-phase campaigns can reconstruct authoritative runtime inventory/equipment from existing seeded data instead of silently loading partial state.
- **D-11:** If temporary compatibility projections are needed for existing APIs or rows, they must be mechanically derived from authoritative items and clearly marked as transitional.
- **D-12:** Planner/executor should bias toward a fail-closed migration path over a silent best-effort path when legacy inventory state is contradictory.

### Scope / Non-Goals
- **D-13:** Keep Phase 38 bounded to inventory/equipment authority. Do not expand it into broader item-balance, shop/economy, or equipment-effect redesign work.
- **D-14:** Tightening obvious backend checks that now depend on authoritative item truth is acceptable if required to preserve authority semantics, but a broader "all inventory narrative validation" program is not the phase goal.

### Self-Critique
- **D-15:** Making `items` authoritative is the cleanest fit with live runtime because gameplay already mutates item rows, but it means legacy creation-era projections must be demoted aggressively or they will keep re-entering through fallback adapters.
- **D-16:** Keeping `characterRecord.loadout` as provenance rather than deleting it preserves auditability and character-creation traceability, but only if all runtime readers stop treating it as live equipment state.
- **D-17:** Encoding equip-state on item rows keeps authority unified, but the schema must stay explicit enough that prompts, UI, and rollback code can query it without heuristics.

### Claude's Discretion
- Exact item-row schema for equipped state.
- Exact deprecation timing for legacy `equippedItems` columns.
- Exact migration mechanics and compatibility projection shape.

### Deferred Ideas (OUT OF SCOPE)
No `## Deferred Ideas` section exists in `38-CONTEXT.md`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RINT-04 | Inventory and equipment have one authoritative persistence model that gameplay, prompts, checkpoints, and UI all read and mutate consistently. | Use `items` as the only live authority, add explicit equip-state on item rows, migrate legacy campaigns on load/restore, derive compatibility projections one-way, and add regression coverage for prompt/world/retry/checkpoint/UI reads. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Use TypeScript strict mode and ES modules.
- Use Drizzle query builder, not raw SQL.
- Use Zod for tool schemas and API payloads.
- Route handlers should keep outer `try/catch`, `parseBody()`, and `getErrorStatus(error)`.
- Shared types/constants belong in `@worldforge/shared`.
- SQLite remains the source of truth; do not introduce an alternative authority store for this phase.

## Summary

The good news: the runtime already writes live item ownership to `items`. `save-character` seeds startup gear into `items`, `spawn_item` writes new rows, and `transfer_item` moves rows by `ownerId` / `locationId`. Checkpoints and retry/undo now restore whole campaign bundles, so an `items`-first model automatically benefits from restore fidelity once all readers converge on the same source.

The problem is almost entirely read-side drift. Prompt assembly still falls back to `characterRecord.loadout.inventorySeed` when owned item rows are missing, record adapters still hydrate loadout fields from legacy `equippedItems`, frontend world parsing still exposes `player.equippedItems` from the player row, and the character panel renders that legacy array while carried inventory comes from `world.items`. Legacy campaigns, checkpoints, and `.turn-boundaries` bundles can therefore reopen a split-brain state even if fresh campaigns look correct.

**Primary recommendation:** plan Phase 38 around one shared backend inventory/equipment resolver backed only by authoritative item rows, plus an idempotent legacy backfill that runs on campaign open and bundle restore before any prompt/world/UI read happens.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | `12.6.2` in repo, `12.8.0` current (2026-03-14) | Embedded authoritative runtime DB | The campaign state is already file-local SQLite, and checkpoints/retry/undo restore `state.db` directly. |
| `drizzle-orm` | `0.45.1` in repo, `0.45.2` current (2026-03-27) | Typed schema, queries, migrations | Existing schema and route code already depend on Drizzle; this phase should extend that layer, not bypass it. |
| `zod` | `4.3.6` in repo and current (2026-01-22) | API/tool payload validation | Existing route and tool contracts already standardize on Zod. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `hono` | `4.12.3` in repo, `4.12.12` current (2026-04-07) | Route layer for world/load/save flows | Use if migration/backfill needs a new load hook or response shape change. |
| `vitest` | `3.2.4` in repo, `4.1.4` current (2026-04-09) | Regression tests | Use existing backend and frontend harnesses; do not turn this phase into a test-framework upgrade. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `items` row authority with explicit equip metadata | Separate `character_equipment` join table | Adds a second live authority seam immediately; only worth it if slot logic becomes much more complex later. |
| One-way compatibility projection | Keep reading `players.equippedItems` / `characterRecord.loadout` | Violates locked decisions and preserves prompt/UI drift. |
| Explicit migration/backfill on load/restore | Silent fallback reconstruction at read time | Hides contradictory legacy state and keeps reload-dependent bugs alive. |

**Installation:**

No new packages are recommended for this phase. Use the existing workspace dependencies.

**Version verification:** Verified with `npm view <package> version time` on 2026-04-12.

## Architecture Patterns

### Recommended Project Structure

```text
backend/src/
├── db/                  # schema + migration for authoritative item equip-state
├── inventory/           # new shared resolver + legacy backfill/migration helpers
├── character/           # provenance + compatibility projections only
├── engine/              # prompt/tool flows call shared inventory authority
└── routes/              # world/save/load responses consume derived projections
frontend/
├── app/game/            # carried/equipped reads from authoritative payload shape
└── lib/                 # API parsers/types stop treating legacy arrays as truth
```

### Pattern 1: Central Authoritative Inventory Resolver

**What:** One backend module should load owned item rows, derive carried/equipped/signature views from explicit item-row metadata, and emit any temporary compatibility projection from that result.

**When to use:** Prompt assembly, world payload serialization, player/NPC read helpers, restore verification, and any route returning inventory/equipment surfaces.

**Example:**

```typescript
// Source: repo pattern from backend/src/routes/character.ts,
// backend/src/engine/prompt-assembler.ts, backend/src/routes/campaigns.ts
type AuthoritativeInventoryView = {
  carried: RuntimeItem[];
  equipped: RuntimeItem[];
  compatibilityEquippedNames: string[];
};

function loadAuthoritativeInventory(
  db: Db,
  campaignId: string,
  ownerId: string,
): AuthoritativeInventoryView {
  const ownedItems = db.select().from(items)
    .where(and(eq(items.campaignId, campaignId), eq(items.ownerId, ownerId)))
    .all();

  return deriveInventoryViewFromItemRows(ownedItems);
}
```

### Pattern 2: Idempotent Backfill On Campaign Open And Restore

**What:** Legacy campaigns should be upgraded exactly once per reopened bundle. If authoritative item rows are absent or contradictory, backfill from legacy seed data or fail closed.

**When to use:** `loadCampaign()`, checkpoint restore, retry/undo restore, and any other bundle-reopen path.

**Example:**

```typescript
// Source: repo pattern from backend/src/campaign/restore-bundle.ts
async function ensureInventoryAuthority(campaignId: string) {
  const legacyState = inspectLegacyInventorySources(campaignId);
  const runtimeState = inspectAuthoritativeItems(campaignId);

  if (runtimeState.isAuthoritative) return;
  if (legacyState.isContradictory) throw new Error("Inventory migration failed closed.");

  materializeAuthoritativeItems(campaignId, legacyState);
  rewriteCompatibilityProjections(campaignId);
}
```

### Pattern 3: Save-Time Provenance, Runtime-Time Authority

**What:** `characterRecord.loadout` should keep authored provenance, but startup gear must still be materialized into authoritative item rows at creation time and never reread as live truth after that.

**When to use:** Character creation and any future worldgen/bootstrap flow that seeds items.

### Anti-Patterns to Avoid

- **Mixed read model:** carried items from `items`, equipped items from `players.equippedItems`, and prompt fallback from `inventorySeed`.
- **Prompt-tag authority:** treating `items.tags` like `"equipped"` or `"signature"` as final truth. D-05 requires structured metadata, not free-form tags.
- **Dual-write dependency:** updating both item rows and legacy projections, then letting future readers depend on either one.
- **Fresh-campaign bias:** proving only the new-character path while legacy campaigns, checkpoints, and retry bundles still drift.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Equipment authority | A second `players.equippedItems`/`npcs.*` live list | Explicit equip-state on authoritative item rows | Possession and equip-state must resolve from the same row model. |
| Legacy compatibility | Silent on-read fallback from `loadout` or `equippedItems` | Idempotent migration/backfill plus one-way projection | Silent fallback keeps contradictory state alive and breaks reload trust. |
| Frontend truth | Client-side merge of `world.items` plus `player.equippedItems` | Backend-derived authoritative projection in `/world` | The UI should not decide which source wins. |

**Key insight:** current write paths are already close to correct; the expensive bug surface is every place that reconstructs inventory/equipment from legacy projections after gameplay has begun.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `campaigns/{id}/state.db` contains `players.equippedItems`, `players.characterRecord`, `npcs.characterRecord`, and `items` rows; pre-phase campaigns may have seeded loadout data without authoritative equip-state. Checkpoint bundles and `.turn-boundaries/*` bundles also store old `state.db` snapshots. | **Data migration + code edit**: add idempotent backfill for live DBs and rerun it after checkpoint/retry/undo restore before gameplay resumes. |
| Live service config | None found. This is a local singleplayer app; no remote inventory/equipment config surface was found in repo docs or routes. | None — verified by repo architecture. |
| OS-registered state | None found. No inventory/equipment authority is stored in systemd, Task Scheduler, launchd, or similar OS registrations. | None. |
| Secrets/env vars | None found that key inventory/equipment behavior by exact field name. | None. |
| Build artifacts | No inventory-specific installed artifact stores runtime item truth. Generated Drizzle migrations are repo artifacts, not runtime state. | Code edit only; regenerate migration artifacts if schema changes. |

## Common Pitfalls

### Pitfall 1: Restore-Bundle Blind Spot

**What goes wrong:** Migration fixes the currently loaded DB, but retry/undo or checkpoint restore reloads an older bundle that still carries legacy-only inventory state.

**Why it happens:** Restore now copies whole campaign bundles, including old `state.db`, before reopening the campaign.

**How to avoid:** Run the inventory authority backfill after every bundle restore, not only on initial app startup.

**Warning signs:** Fresh campaigns work, but retry/undo or checkpoint restore reintroduces missing equipment or prompt-only fallback items.

### Pitfall 2: Carried And Equipped Split-Brain

**What goes wrong:** The player sees carried items from `world.items`, but equipment from `player.equippedItems` or `characterRecord.loadout`.

**Why it happens:** The frontend already trusts two different payload branches, and prompt assembly does something similar.

**How to avoid:** Derive both carried and equipped views from the same authoritative item-row resolver, then expose that result everywhere.

**Warning signs:** UI inventory looks right while equipment, prompt context, or reload state differs.

### Pitfall 3: Structured-Metadata Decision Regresses Into Tags

**What goes wrong:** Equip-state gets shoved into free-form item tags because the table already has a `tags` column.

**Why it happens:** It is the fastest local patch, but it violates D-05 and makes future queries heuristic-heavy.

**How to avoid:** Add explicit structured fields for equip-state even if the first version is small.

**Warning signs:** Code starts checking `item.tags.includes("equipped")` or inferring equipment from name/slot heuristics.

### Pitfall 4: Silent Legacy Merge

**What goes wrong:** Contradictory legacy state gets merged "best effort" and produces plausible but wrong inventory after reload.

**Why it happens:** It is tempting to preserve playability at all costs.

**How to avoid:** Detect contradictions and fail closed with a repairable error path.

**Warning signs:** Different readers choose different winners between `items`, `loadout`, and `equippedItems`.

## Code Examples

Verified repo patterns worth reusing:

### Save-Time Authoritative Seeding

```typescript
// Source: backend/src/routes/character.ts
const canonicalLoadout = deriveCanonicalLoadout(draft);
db.insert(players).values({ id: playerId, campaignId, ...projection }).run();

db.insert(items).values(
  canonicalLoadout.items.map((item) => ({
    id: crypto.randomUUID(),
    campaignId,
    name: item.name,
    tags: JSON.stringify(item.tags),
    ownerId: playerId,
    locationId: null,
  })),
).run();
```

### Runtime Item Mutation Already Uses `items`

```typescript
// Source: backend/src/engine/tool-executor.ts
db.update(items)
  .set({ ownerId: character.id, locationId: null })
  .where(eq(items.id, item.id))
  .run();
```

### Restore Bundles Already Carry The Right Files

```typescript
// Source: backend/src/campaign/restore-bundle.ts
await getSqliteConnection().backup(dbPath);
fs.copyFileSync(campaignConfigPath, configPath);
fs.copyFileSync(campaignChatPath, chatPath);
```

This is why `items`-first authority is the correct seam: once readers converge, restore fidelity comes along automatically because `state.db` is already part of the authoritative bundle.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Live reads split across `equippedItems`, `characterRecord.loadout`, and `items` | Target Phase 38 model: all gameplay/prompt/UI/restore reads derive from authoritative item rows | Planned in Phase 38 | Removes drift between carried, equipped, prompts, and reloads. |
| Prompt fallback to `inventorySeed` after campaign start | Explicit legacy import/backfill only; no post-start fallback authority | Planned in Phase 38 | Prevents fallback-only items from reappearing in narration. |
| Frontend equipment from `player.equippedItems` | Backend-derived equipment projection from authoritative item rows | Planned in Phase 38 | Player-facing equipment matches runtime truth. |

**Deprecated/outdated:**

- Treating `players.equippedItems` as a live post-start authority.
- Treating `characterRecord.loadout` as anything other than provenance/seed data after campaign bootstrap.
- Using free-form item tags as the final equip-state schema.

## Open Questions

1. **What exact equip-state shape should item rows use?**
   - What we know: `items` currently only has `id`, `campaignId`, `name`, `tags`, `ownerId`, and `locationId`.
   - What's unclear: whether to add discrete columns, a JSON text metadata column, or both.
   - Recommendation: keep possession in `ownerId`/`locationId`, add explicit structured equip fields, and keep the first schema small but queryable without heuristics.

2. **Where should migration be triggered?**
   - What we know: `loadCampaign()`, checkpoint restore, and retry/undo restore are all stable reopen seams.
   - What's unclear: whether a single load-time migration is enough for existing stale bundles.
   - Recommendation: run the migration idempotently on campaign load and immediately after bundle restore; do not rely on a one-off script alone.

3. **How long should legacy projections survive?**
   - What we know: some payloads and frontend types still expose `equippedItems`.
   - What's unclear: whether the planner should remove those fields inside Phase 38 or keep them for one more phase.
   - Recommendation: keep them only as mechanically derived outputs until all readers are switched and tested green, then remove them in the same phase if the blast radius stays contained.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend/frontend scripts, Vitest, migrations | ✓ | `23.11.0` | — |
| npm | Workspace installs and package scripts | ✓ | `11.12.1` | — |
| SQLite server | Not required; runtime uses embedded `better-sqlite3` | ✓ | embedded | — |

**Missing dependencies with no fallback:**

None.

**Missing dependencies with fallback:**

None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (`3.2.4` in repo; current registry `4.1.4`) |
| Config file | `backend/vitest.config.ts`; `frontend/vitest.config.ts` |
| Quick run command | `npm --prefix backend run test -- src/engine/__tests__/prompt-assembler.test.ts src/routes/__tests__/character.test.ts src/routes/__tests__/campaigns.test.ts src/engine/__tests__/tool-executor.test.ts` |
| Full suite command | `npm --prefix backend run test` and `cd frontend && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RINT-04 | Save-time loadout seeding writes authoritative item rows | integration | `npm --prefix backend run test -- src/routes/__tests__/character.test.ts` | ✅ partial |
| RINT-04 | Prompt assembly reads authoritative inventory/equipment without post-start fallback drift | unit/integration | `npm --prefix backend run test -- src/engine/__tests__/prompt-assembler.test.ts` | ✅ partial |
| RINT-04 | Runtime item mutations update shared item authority | unit | `npm --prefix backend run test -- src/engine/__tests__/tool-executor.test.ts` | ✅ partial |
| RINT-04 | `/world` returns player/world views from the same authority seam | integration | `npm --prefix backend run test -- src/routes/__tests__/campaigns.test.ts` | ✅ partial |
| RINT-04 | `/game` and character panel show the same carried/equipped truth after reload | frontend integration/component | `cd frontend && npx vitest run app/game/__tests__/page.test.tsx components/game/__tests__/character-panel.test.tsx` | ✅ partial |
| RINT-04 | Legacy campaign load plus retry/undo/checkpoint restore preserve authoritative inventory/equipment | integration | `npm --prefix backend run test -- src/engine/__tests__/state-snapshot.test.ts src/routes/__tests__/chat.inventory-authority.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm --prefix backend run test -- src/engine/__tests__/prompt-assembler.test.ts src/routes/__tests__/character.test.ts src/routes/__tests__/campaigns.test.ts src/engine/__tests__/tool-executor.test.ts`
- **Per wave merge:** `npm --prefix backend run test` and `cd frontend && npx vitest run`
- **Phase gate:** Backend full suite green, targeted frontend inventory/equipment tests green, and one legacy-campaign reload smoke proving no fallback-only item appears after restore

### Wave 0 Gaps

- [ ] `backend/src/inventory/__tests__/inventory-authority.test.ts` — shared authoritative resolver and compatibility projection coverage
- [ ] `backend/src/routes/__tests__/chat.inventory-authority.test.ts` — legacy migration survives retry/undo restore
- [ ] `backend/src/routes/__tests__/campaigns.inventory-authority.test.ts` — `/world` payload stays consistent after migrated legacy load
- [ ] `backend/src/engine/__tests__/prompt-assembler.inventory-authority.test.ts` — prompt never rehydrates post-start inventory from legacy snapshots
- [ ] `frontend/lib/__tests__/api.inventory-authority.test.ts` — world parsing/equipment projection if payload shape changes

## Sources

### Primary (HIGH confidence)

- `.planning/phases/38-authoritative-inventory-equipment-state/38-CONTEXT.md` - locked decisions, scope, and canonical refs
- `.planning/REQUIREMENTS.md` - `RINT-04` requirement text
- `.planning/STATE.md` - current milestone/phase status
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-HANDOFF.md` - Group A `A5` authority seam
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-RUNTIME-MATRIX.md` - prior evidence for the split authority seam
- `.planning/phases/44-gameplay-docs-baseline-alignment/44-CLAIM-RESOLUTION.md` - current docs intentionally keep Phase 38 as bounded pending work
- `backend/src/db/schema.ts` - overlapping player legacy fields vs `items`
- `backend/src/character/record-adapters.ts` - legacy hydration/fallback behavior
- `backend/src/routes/character.ts` - authoritative save-time item seeding
- `backend/src/engine/prompt-assembler.ts` - current mixed inventory/equipment read path
- `backend/src/engine/tool-executor.ts` - current live item mutation path
- `backend/src/routes/campaigns.ts` - world payload/UI read path
- `backend/src/campaign/restore-bundle.ts` - restore bundle contract
- `backend/src/routes/chat.ts` and `backend/src/engine/state-snapshot.ts` - retry/undo snapshot restore path
- `docs/mechanics.md` and `docs/memory.md` - current truthful docs boundary for pending inventory authority
- `npm view drizzle-orm version time`, `npm view better-sqlite3 version time`, `npm view hono version time`, `npm view zod version time`, `npm view vitest version time` - current package versions and publish dates

### Secondary (MEDIUM confidence)

- `backend/src/routes/__tests__/character.test.ts` - existing save-character coverage
- `backend/src/engine/__tests__/prompt-assembler.test.ts` - existing prompt contract coverage
- `backend/src/routes/__tests__/campaigns.test.ts` - existing `/world` payload coverage
- `backend/src/engine/__tests__/tool-executor.test.ts` - existing item mutation coverage
- `frontend/components/game/__tests__/character-panel.test.tsx` and `frontend/app/game/__tests__/page.test.tsx` - existing player-facing coverage

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - existing repo stack plus registry-verified current versions
- Architecture: MEDIUM - authority direction is locked, but exact equip-state schema is still planner discretion
- Pitfalls: HIGH - drift points and restore seams are directly evidenced in repo code

**Research date:** 2026-04-12
**Valid until:** 2026-04-26

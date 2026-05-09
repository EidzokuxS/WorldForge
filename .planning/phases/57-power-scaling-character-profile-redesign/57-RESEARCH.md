# Phase 57: Power Scaling & Character Profile Redesign - Research

**Researched:** 2026-04-15
**Domain:** Character modeling, power scaling systems, type system redesign, schema migration
**Confidence:** HIGH

## Summary

Phase 57 replaces the entire grounding/power/continuity subsystem (built by phases 48-49) with a VS Battles Wiki-based power scaling system. The old system uses decorative text-based power descriptions, academic metadata dumps (SourceBundle), and identity inertia policies (ContinuityPolicy) that add tokens without actionable value. The new system uses structured tier+rank power axes that the engine can compare programmatically, plus compact hax abilities with bypass semantics.

The blast radius is significant but well-bounded: 3 shared types removed, 1 shared type rewritten, ~20 files affected across backend (character pipeline, engine consumers, routes, tests) and frontend (inspector, draft normalizer). The DB schema itself does not change (characterRecord is a JSON text blob), but the JSON shape inside those blobs changes, requiring a runtime migration adapter for existing campaign data.

**Primary recommendation:** Define new types in shared (PowerStats, HaxAbility, Vulnerability), remove old types (CharacterGroundingProfile, SourceBundle, ContinuityPolicy, PowerProfile), rewrite grounded-lookup.ts for tier comparison, strip continuity from all prompt assembly paths, and add a runtime migration adapter in record-adapters.ts that converts old records on read.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use VS Battles Wiki tier system as the standard (fan community standard, most comprehensive)
- 5 axes: Attack Potency, Speed, Durability, Intelligence, Hax
- Format: Condensed tier name + rank 1-10 within tier (e.g., "City 7", "Continental 3")
- AP/Durability tiers: Human -> Street -> Wall -> Building -> City Block -> Town -> City -> Mountain -> Island -> Country -> Continental -> Moon -> Planet -> Star -> Solar System -> Galaxy -> Universal -> Multiversal+
- Speed tiers (own scale): Human -> Superhuman -> Subsonic -> Supersonic -> Hypersonic -> Massively Hypersonic -> Sub-Relativistic -> Relativistic -> FTL -> MFTL -> Infinite
- Intelligence tiers (qualitative): Average -> Above Average -> Gifted -> Genius -> Extraordinary Genius -> Supergenius
- Hax: structured list per character, NOT tiered. Each ability has name, type, bypassTier, limitations
- Vulnerabilities: separate list per character, concrete and actionable
- Character Essence: compact but complete (personality, appearance, speech patterns, behavior under stress). No duplication. 2-4k tokens fine if all useful.
- REMOVE: CharacterGroundingProfile entirely, PowerProfile (old text strings), SourceBundle (canonSources, secondarySources, synthesis metadata), ContinuityPolicy (identityInertia, protectedCore, mutableSurface, changePressureNotes)
- Counterweight System: NOT IN THIS PHASE
- Global Character Database: NOT IN THIS PHASE

### Claude's Discretion
- Exact TypeScript type shapes for new PowerStats, HaxAbility, Vulnerability types
- How to migrate existing character records (schema migration vs runtime adapter)
- Frontend Advanced tab layout and visual spider/radar chart implementation
- Prompt format for injecting power stats into LLM context
- How grounded-lookup.ts handles cross-tier comparisons programmatically

### Deferred Ideas (OUT OF SCOPE)
- Global canonical character database (cross-campaign character reuse)
- Counterweight/balance system (WorldForge as meta-universal entity)
- Judge role rework for identity drift validation
- Visual radar/spider chart component (can be plain table initially)
</user_constraints>

## Architecture Patterns

### Recommended Type Design

```typescript
// --- New types (shared/src/types.ts) ---

export const AP_DURABILITY_TIERS = [
  "Human", "Street", "Wall", "Building", "City Block", "Town",
  "City", "Mountain", "Island", "Country", "Continental",
  "Moon", "Planet", "Star", "Solar System", "Galaxy",
  "Universal", "Multiversal+",
] as const;

export type ApDurabilityTier = (typeof AP_DURABILITY_TIERS)[number];

export const SPEED_TIERS = [
  "Human", "Superhuman", "Subsonic", "Supersonic", "Hypersonic",
  "Massively Hypersonic", "Sub-Relativistic", "Relativistic",
  "FTL", "MFTL", "Infinite",
] as const;

export type SpeedTier = (typeof SPEED_TIERS)[number];

export const INTELLIGENCE_TIERS = [
  "Average", "Above Average", "Gifted", "Genius",
  "Extraordinary Genius", "Supergenius",
] as const;

export type IntelligenceTier = (typeof INTELLIGENCE_TIERS)[number];

export interface TierRank<T extends string = string> {
  tier: T;
  rank: number; // 1-10 within tier
}

export interface HaxAbility {
  name: string;
  type: string; // e.g., "Spatial Manipulation", "Soul Manipulation"
  bypassTier: ApDurabilityTier | null; // what durability tier this ignores
  limitations: string[];
}

export interface CharacterVulnerability {
  description: string;
  severity: "minor" | "major" | "critical";
}

export interface PowerStats {
  attackPotency: TierRank<ApDurabilityTier>;
  speed: TierRank<SpeedTier>;
  durability: TierRank<ApDurabilityTier>;
  intelligence: TierRank<IntelligenceTier>;
  hax: HaxAbility[];
  vulnerabilities: CharacterVulnerability[];
}
```

**Confidence: HIGH** -- Directly derived from locked user decisions. Rank 1-10 gives fine-grained ordering within tiers. Const arrays enable both type safety and programmatic comparison via `indexOf`.

### Programmatic Tier Comparison

The engine needs to compare characters for power lookups and Oracle evaluations. Using array index as ordinal:

```typescript
// shared/src/power-tiers.ts

export function compareTiers<T extends string>(
  tierList: readonly T[],
  a: TierRank<T>,
  b: TierRank<T>,
): number {
  const indexA = tierList.indexOf(a.tier);
  const indexB = tierList.indexOf(b.tier);
  if (indexA !== indexB) return indexA - indexB;
  return a.rank - b.rank;
}

// Returns negative if a < b, 0 if equal, positive if a > b

export function tierDistance<T extends string>(
  tierList: readonly T[],
  a: TierRank<T>,
  b: TierRank<T>,
): { tiers: number; total: number } {
  const indexA = tierList.indexOf(a.tier);
  const indexB = tierList.indexOf(b.tier);
  const tierDiff = indexA - indexB;
  const totalSteps = tierDiff * 10 + (a.rank - b.rank);
  return { tiers: tierDiff, total: totalSteps };
}

export function canHaxBypass(
  hax: HaxAbility,
  targetDurability: TierRank<ApDurabilityTier>,
): boolean {
  if (!hax.bypassTier) return false;
  const bypassIndex = AP_DURABILITY_TIERS.indexOf(hax.bypassTier);
  const targetIndex = AP_DURABILITY_TIERS.indexOf(targetDurability.tier);
  return bypassIndex >= targetIndex;
}
```

**Confidence: HIGH** -- Array indexOf is the standard pattern for ordinal comparison on string union tiers. Const arrays are already used elsewhere in the codebase (e.g., `LOCATION_KINDS`, `CHARACTER_WEALTH_TIERS`).

### CharacterRecord Changes

Replace three optional fields on `CharacterDraft` and `CharacterRecord`:

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `grounding?: CharacterGroundingProfile` | `powerStats?: PowerStats` | Structured tier+rank instead of text strings |
| `sourceBundle?: CharacterSourceBundle` | *(removed)* | Research data is one-time-use, not persisted |
| `continuity?: CharacterContinuityPolicy` | *(removed)* | Judge handles identity drift naturally |

`CharacterDraftPatch` loses `sourceBundle` and `continuity` partial fields. Gains `powerStats?: Partial<PowerStats>`.

### Migration Pattern: Runtime Adapter

**Recommendation: Runtime migration adapter (not schema migration)**

Rationale:
1. `characterRecord` is a JSON text blob in SQLite -- there is no column-level schema to migrate
2. Existing campaign data may have old-format records with `grounding`, `sourceBundle`, `continuity`
3. The project already uses `record-adapters.ts` with normalization functions that handle missing/malformed data
4. A runtime adapter that strips old fields and optionally converts old grounding to stub powerStats is the cleanest approach

```typescript
// In record-adapters.ts -- extend existing normalizeCharacterRecord()
function migrateGroundingToPowerStats(
  oldGrounding?: CharacterGroundingProfile,
): PowerStats | undefined {
  if (!oldGrounding) return undefined;
  // Old records get baseline Human stats -- better than losing the data
  return {
    attackPotency: { tier: "Human", rank: 5 },
    speed: { tier: "Human", rank: 5 },
    durability: { tier: "Human", rank: 5 },
    intelligence: { tier: "Average", rank: 5 },
    hax: [],
    vulnerabilities: (oldGrounding.vulnerabilities ?? []).map(desc => ({
      description: desc,
      severity: "major" as const,
    })),
  };
}
```

**Confidence: HIGH** -- This is how every prior schema evolution in this codebase was handled (e.g., Phase 48 identity layers, Phase 38 inventory migration).

### Prompt Format for Power Stats

Current format in prompt-assembler.ts uses `buildRuntimeIdentityLines()` which injects continuity. New format should inject power stats compactly:

```
Power: AP=City 7 | Speed=Hypersonic 4 | Dur=City 3 | Int=Genius 8
Hax: Infinity (Spatial Manipulation, bypasses Universal durability, disabled by Domain Expansion)
Vulnerabilities: Domain Expansion disables Infinity (critical); concentration-dependent abilities (major)
```

This replaces the old decorative strings like "Grounded around Cursed Energy Manipulation and Domain Expansion." with engine-actionable data.

**Confidence: MEDIUM** -- Format is my recommendation; user has discretion over exact prompt shape.

### Anti-Patterns to Avoid
- **Keeping SourceBundle "just in case"**: User explicitly said research results are one-time-use. Persisting them wastes tokens in every prompt that serializes the record.
- **Text-based power descriptions**: The entire point is to move from "Grounded around X" strings to `{tier: "City", rank: 7}` structs.
- **Keeping ContinuityPolicy as a hidden field**: It must be removed from types, not just hidden from UI. The Judge role and personality description handle identity drift.
- **Nullable tiers instead of optional powerStats**: If a character has no power assessment, `powerStats` should be `undefined`, not `{tier: null, rank: null}` on each axis.

## Blast Radius: Complete File Inventory

### Shared Package (shared/)

| File | Lines Affected | Change Type |
|------|---------------|-------------|
| `shared/src/types.ts` | L292-333, L451-453, L466-468, L484-487 | Remove old types, add new types |
| `shared/src/index.ts` | L39-43 | Update exports (remove old, add new) |

### Backend - Character Pipeline (backend/src/character/)

| File | Change Type | Details |
|------|-------------|---------|
| `grounded-character-profile.ts` | **DELETE entirely** | Synthesizes old CharacterGroundingProfile from draft fields. Replaced by new power stats generation. |
| `canonical-source-bundle.ts` | **DELETE entirely** | Normalizes SourceBundle and ContinuityPolicy. Both removed. |
| `known-ip-worldgen-research.ts` | **REWRITE enrichment** | Currently builds sourceBundle + continuity + old grounding. Must produce PowerStats instead. Lines 406-475, 562-563. |
| `archetype-researcher.ts` | **ADAPT** | `synthesizeArchetypeGrounding()` returns CharacterGroundingProfile. Must return PowerStats or undefined. |
| `generator.ts` | **ADAPT** | `buildFlatOutputStrategy({ includeSourceBundleGuidance: true })` references removed. L82, L91, L239. |
| `npc-generator.ts` | **ADAPT** | `buildNpcFlatOutputStrategy({ includeSourceBundleGuidance: true })`, `buildImportedNpcSourceBundle()`. L50, L59, L175, L322, L366. |
| `record-adapters.ts` | **ADAPT** | Remove `normalizeGrounding()`, `normalizePowerProfile()`, `normalizeSourceBundle()`, `normalizeContinuity()` calls. Add `migrateGroundingToPowerStats()`. L3-13, L22, L155-188, L725-731. |
| `persona-templates.ts` | **ADAPT** | Remove `mergeSourceBundle()`. L65, L115. |

### Backend - Engine (backend/src/engine/)

| File | Change Type | Details |
|------|-------------|---------|
| `grounded-lookup.ts` | **REWRITE** | Currently reads `grounding.powerProfile` (text strings) for comparison. Must use new `PowerStats` with tier comparison functions. Lines 2-5, 36-38, 151-210, 250-261. |
| `prompt-assembler.ts` | **ADAPT** | Remove continuity injection from `buildRuntimeIdentityLines()`. Add power stats line. Lines 470-474, 786-791, 1334, 1369-1381. |
| `npc-agent.ts` | **ADAPT** | Remove continuity from NPC prompt construction. Lines 126-127, 408-461. |
| `reflection-agent.ts` | **ADAPT** | Remove continuity from reflection prompts. Lines 126-127. |
| `reflection-tools.ts` | **ADAPT** | Remove `minimumEvidenceForPromotion()` inertia-based thresholds. Line 231-234. Change to flat threshold since inertia field is gone. |

### Backend - Routes (backend/src/routes/)

| File | Change Type | Details |
|------|-------------|---------|
| `schemas.ts` | **REWRITE schemas** | Remove `powerProfileSchema`, `characterGroundingSchema`, `characterSourceBundleSchema`, `characterContinuitySchema`. Add `powerStatsSchema`, `haxAbilitySchema`, `vulnerabilitySchema`. Lines 7, 12, 430-469, 488-497, 595-597, 915. |
| `character.ts` | **ADAPT** | Replace `synthesizeGroundedCharacterProfile()` calls with new power stats synthesis. Replace `attachGroundingSafely()` to attach powerStats. Lines 111-329. |

### Backend - Tests (backend/src/**/__tests__/)

| File | Change Type |
|------|-------------|
| `routes/__tests__/schemas.test.ts` | Rewrite grounding/sourceBundle/continuity test fixtures |
| `character/__tests__/known-ip-worldgen-research.test.ts` | Rewrite enrichment assertions |
| `character/__tests__/record-adapters.test.ts` | Rewrite normalization tests, add migration tests |
| `character/__tests__/record-adapters.identity.test.ts` | Update fixtures |
| `character/__tests__/archetype-researcher.test.ts` | Update grounding assertions |
| `character/__tests__/generator.test.ts` | Remove sourceBundle guidance assertions |
| `character/__tests__/npc-generator.test.ts` | Remove sourceBundle/imported source assertions |
| `character/__tests__/persona-templates.test.ts` | Remove sourceBundle merge assertions |
| `engine/__tests__/prompt-assembler.character-identity.test.ts` | Remove continuity injection assertions |
| `engine/__tests__/reflection-agent.identity-boundaries.test.ts` | Remove inertia-based assertions |
| `engine/__tests__/npc-agent.test.ts` | Remove continuity prompt assertions |
| `engine/__tests__/npc-offscreen.test.ts` | Update record fixtures |

### Frontend

| File | Change Type | Details |
|------|-------------|---------|
| `components/world-review/character-record-inspector.tsx` | **REDESIGN** | Remove Grounding, Power Profile, Continuity, Sources sections. Add Power Stats table, Hax list, Vulnerabilities list. Lines 143-145, 183-220, 334-371, 395-452. |
| `components/world-review/npcs-section.tsx` | **ADAPT** | If NPC cards reference grounding data |
| `lib/character-drafts.ts` | **ADAPT** | Remove `normalizeSourceBundle()` and `normalizeContinuity()`. Lines 68-107, 220-221. |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tier ordering | Manual if-else chains | Const array indexOf | Single source of truth, O(1) comparison, type-safe |
| Power comparison | Text parsing of old strings | Structured TierRank comparison | Engine needs numeric ordering, not prose |
| Migration of old records | Drizzle migration | Runtime adapter in record-adapters.ts | characterRecord is JSON blob, not typed columns |
| Spider/radar chart | Custom SVG drawing | Plain HTML table (defer chart) | User explicitly deferred visual chart to future |

## Common Pitfalls

### Pitfall 1: Forgetting to strip old fields from CharacterDraftPatch
**What goes wrong:** Persona template patches still reference `sourceBundle` and `continuity` partial schemas, causing type errors or ghost data.
**How to avoid:** Remove `sourceBundle` and `continuity` from `CharacterDraftPatch` type and `personaTemplatePatchSchema` Zod schema.
**Warning signs:** TypeScript errors in persona-templates.ts, or old data surviving on template-applied drafts.

### Pitfall 2: Breaking existing campaigns with old data
**What goes wrong:** Loading a campaign with old-format characterRecord blows up because `record.powerStats` is undefined and code assumes it exists.
**How to avoid:** The runtime adapter must handle BOTH old-format (with grounding/sourceBundle/continuity) and new-format (with powerStats) gracefully. PowerStats should always be optional.
**Warning signs:** Crash on campaign load for any pre-Phase-57 campaign.

### Pitfall 3: Leaving continuity in reflection-tools.ts
**What goes wrong:** `minimumEvidenceForPromotion()` reads `record.continuity?.identityInertia` which no longer exists. Identity changes would use default threshold and may become too easy or too hard.
**How to avoid:** Replace with a flat threshold based on character tier (key characters need more evidence, temporary characters less).
**Warning signs:** NPC identity changes happening too freely or never happening.

### Pitfall 4: Prompt token budget explosion
**What goes wrong:** New power stats format, if verbose, could exceed the old format in tokens.
**How to avoid:** Use the compact `AP=City 7 | Speed=Hypersonic 4` format. Only include hax and vulnerabilities for characters that have them.
**Warning signs:** Token budget warnings in prompt assembly, truncated context.

### Pitfall 5: Test fixtures referencing removed types
**What goes wrong:** 12+ test files contain fixtures with `grounding`, `sourceBundle`, `continuity` fields. Updating types without updating fixtures causes mass test failures.
**How to avoid:** Update all test fixtures in the same plan wave as the type changes. Use a shared test helper for creating mock PowerStats.
**Warning signs:** `npm test` failures across character and engine test suites.

### Pitfall 6: known-ip-worldgen-research.ts LLM prompt still asks for old schema
**What goes wrong:** The `enrichKnownIpWorldgenNpcDraft` function sends an LLM prompt asking for `powerProfile`, `constraints`, `protectedCore`, `mutableSurface`, `changePressureNotes`. The Zod schema `knownIpCharacterProfileSchema` validates this old shape.
**How to avoid:** Rewrite the LLM prompt to request VS Battles tier+rank for each axis, hax abilities, and vulnerabilities. Rewrite the Zod schema to match.
**Warning signs:** LLM returns old-format data that fails new schema validation.

## Code Examples

### New PowerStats on CharacterDraft/CharacterRecord

```typescript
// shared/src/types.ts (after changes)
export interface CharacterDraft {
  identity: CharacterIdentityDraft;
  profile: CharacterProfile;
  socialContext: CharacterSocialContext;
  motivations: CharacterMotivations;
  capabilities: CharacterCapabilities;
  state: CharacterState;
  loadout: CharacterLoadout;
  startConditions: CharacterStartConditions;
  provenance: CharacterProvenance;
  powerStats?: PowerStats;  // NEW -- replaces grounding, sourceBundle, continuity
}
```

### Power stats in prompt-assembler.ts

```typescript
function buildPowerStatsLine(record: CharacterRecord): string | null {
  const ps = record.powerStats;
  if (!ps) return null;

  const axes = [
    `AP=${ps.attackPotency.tier} ${ps.attackPotency.rank}`,
    `Speed=${ps.speed.tier} ${ps.speed.rank}`,
    `Dur=${ps.durability.tier} ${ps.durability.rank}`,
    `Int=${ps.intelligence.tier} ${ps.intelligence.rank}`,
  ].join(" | ");

  const parts = [`Power: ${axes}`];

  if (ps.hax.length > 0) {
    const haxLine = ps.hax.map(h => {
      const bypass = h.bypassTier ? `, bypasses ${h.bypassTier}` : "";
      const limits = h.limitations.length > 0
        ? `, limits: ${h.limitations.join("; ")}`
        : "";
      return `${h.name} (${h.type}${bypass}${limits})`;
    }).join("; ");
    parts.push(`Hax: ${haxLine}`);
  }

  if (ps.vulnerabilities.length > 0) {
    const vulns = ps.vulnerabilities
      .map(v => `${v.description} (${v.severity})`)
      .join("; ");
    parts.push(`Vulnerabilities: ${vulns}`);
  }

  return parts.join("\n");
}
```

### Rewritten grounded-lookup.ts power comparison

```typescript
function buildPowerProfileResult(
  request: GroundedLookupRequest,
  characterEntries: CharacterLookupEntry[],
  ipContext: IpResearchContext | null,
): GroundedLookupResult {
  const primary = findCharacterEntry(characterEntries, request.subject);
  const secondary = request.compareAgainst
    ? findCharacterEntry(characterEntries, request.compareAgainst)
    : null;

  const primaryStats = primary?.powerStats;
  if (!primaryStats) {
    return noStoredPowerResult(request, ipContext);
  }

  const secondaryStats = secondary?.powerStats;
  if (!secondaryStats) {
    return singleCharacterPowerResult(request, primaryStats, ipContext);
  }

  // Structured comparison
  const apComp = compareTiers(AP_DURABILITY_TIERS, primaryStats.attackPotency, secondaryStats.attackPotency);
  const speedComp = compareTiers(SPEED_TIERS, primaryStats.speed, secondaryStats.speed);
  const durComp = compareTiers(AP_DURABILITY_TIERS, primaryStats.durability, secondaryStats.durability);

  const bypassingHax = primaryStats.hax.filter(h => canHaxBypass(h, secondaryStats.durability));

  // Build structured answer
  const answer = [
    `${request.subject}: AP=${primaryStats.attackPotency.tier} ${primaryStats.attackPotency.rank}, Speed=${primaryStats.speed.tier} ${primaryStats.speed.rank}, Dur=${primaryStats.durability.tier} ${primaryStats.durability.rank}`,
    `${request.compareAgainst}: AP=${secondaryStats.attackPotency.tier} ${secondaryStats.attackPotency.rank}, Speed=${secondaryStats.speed.tier} ${secondaryStats.speed.rank}, Dur=${secondaryStats.durability.tier} ${secondaryStats.durability.rank}`,
    apComp > 0 ? `${request.subject} has higher attack potency.` : apComp < 0 ? `${request.compareAgainst} has higher attack potency.` : "Attack potency is comparable.",
    bypassingHax.length > 0 ? `${request.subject} has hax (${bypassingHax.map(h => h.name).join(", ")}) that bypass ${request.compareAgainst}'s durability.` : "",
  ].filter(Boolean).join(" ");

  return {
    lookupKind: request.lookupKind,
    subject: request.subject,
    answer,
    citations: [],
    uncertaintyNotes: [],
    sceneImpact: LOOKUP_SCENE_IMPACT,
  };
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via vitest.config.ts in backend/, shared/, frontend/, root) |
| Config file | `backend/vitest.config.ts` |
| Quick run command | `cd backend && npx vitest run --reporter=verbose` |
| Full suite command | `cd backend && npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PS-01 | New PowerStats types validate via Zod | unit | `cd backend && npx vitest run src/routes/__tests__/schemas.test.ts -x` | Exists (needs rewrite) |
| PS-02 | Tier comparison returns correct ordinals | unit | `cd shared && npx vitest run src/__tests__/power-tiers.test.ts -x` | Wave 0 |
| PS-03 | Hax bypass logic correct | unit | `cd shared && npx vitest run src/__tests__/power-tiers.test.ts -x` | Wave 0 |
| PS-04 | Old records migrate gracefully | unit | `cd backend && npx vitest run src/character/__tests__/record-adapters.test.ts -x` | Exists (needs migration test) |
| PS-05 | Power stats injected into prompts | unit | `cd backend && npx vitest run src/engine/__tests__/prompt-assembler.character-identity.test.ts -x` | Exists (needs rewrite) |
| PS-06 | Continuity removed from all prompts | unit | `cd backend && npx vitest run src/engine/__tests__/prompt-assembler.character-identity.test.ts -x` | Exists (needs rewrite) |
| PS-07 | Grounded lookup compares tiers programmatically | unit | `cd backend && npx vitest run src/engine/__tests__/grounded-lookup.test.ts -x` | Wave 0 |
| PS-08 | Reflection tools use flat threshold | unit | `cd backend && npx vitest run src/engine/__tests__/reflection-progression.test.ts -x` | Exists (needs rewrite) |
| PS-09 | Known-IP enrichment produces PowerStats | unit | `cd backend && npx vitest run src/character/__tests__/known-ip-worldgen-research.test.ts -x` | Exists (needs rewrite) |
| PS-10 | Frontend inspector renders PowerStats table | manual | Visual inspection | N/A |

### Sampling Rate
- **Per task commit:** `cd backend && npx vitest run --reporter=verbose`
- **Per wave merge:** Full suite across backend + shared + frontend
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `shared/src/__tests__/power-tiers.test.ts` -- covers PS-02, PS-03 (tier comparison + hax bypass)
- [ ] `backend/src/engine/__tests__/grounded-lookup.test.ts` -- covers PS-07 (structured power comparison)
- [ ] Add migration test case in `backend/src/character/__tests__/record-adapters.test.ts` -- covers PS-04

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** -- Direct file reads of all 20+ affected files
- `shared/src/types.ts` -- Current type definitions (CharacterGroundingProfile L322-333, PowerProfile L311-320, SourceBundle L292-300, ContinuityPolicy L304-309)
- `backend/src/engine/grounded-lookup.ts` -- Current power comparison logic (text-based, L151-210)
- `backend/src/engine/prompt-assembler.ts` -- Continuity injection (L1369-1381), identity lines (L1323-1384)
- `backend/src/character/grounded-character-profile.ts` -- Full file, to be deleted
- `backend/src/character/canonical-source-bundle.ts` -- Full file, to be deleted

### Secondary (MEDIUM confidence)
- VS Battles Wiki tier system -- User researched and confirmed as the standard for fan power scaling

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new libraries needed; this is a type system + logic rewrite within existing stack
- Architecture: HIGH -- Pattern follows existing codebase conventions (const arrays for enums, runtime adapters, JSON blob migration)
- Pitfalls: HIGH -- All identified from direct code analysis of current consumers
- Blast radius: HIGH -- Exhaustive grep across entire codebase for all 4 removed types

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (stable -- internal refactor, no external dependencies)

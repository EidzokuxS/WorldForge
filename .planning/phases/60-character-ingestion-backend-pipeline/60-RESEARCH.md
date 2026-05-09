# Phase 60: Character Ingestion Backend Pipeline — Research

**Researched:** 2026-04-16
**Domain:** Character ingestion pipeline unification (backend), V2/V3 card handling, priority merge, PowerStats enrichment
**Confidence:** HIGH (direct code inspection of current seams)

## Summary

Phase 60 converges seven character-creation routes (`parse-character`, `generate-character`, `research-character`, `import-v2-card`, plus `parse-npc`/`generate-npc`/`import-npc` which are currently served by the same shared routes with `role: "player" | "key"`) onto one unified backend ingestion pipeline. The current code already has *some* unification (role-switch inside each route), but:

1. **V2 card import currently does a 1:1 LLM field-map** via `mapV2CardToCharacter` / `mapV2CardToNpc` in `backend/src/character/generator.ts:212` and `backend/src/character/npc-generator.ts:214`. Card content is fed directly into a single `generateObject` call that produces the flat draft. There is **no research step**, **no override channel**, **no PowerStats enrichment** on the player side, and **no merge-priority logic**.
2. **Only worldgen key NPCs get PowerStats**, via `enrichKnownIpWorldgenNpcDraft` (`backend/src/character/known-ip-worldgen-research.ts:261`), and only when triggered from `generateNpcsStep` with a known-IP `ipContext`. The character-creation routes never invoke it.
3. **No override text field** exists anywhere — not in Zod schemas, not in character functions, not in frontend.
4. **Archetype research** (`archetype-researcher.ts`) returns free text only; `synthesizeArchetypePowerStats` explicitly returns `undefined` (fail-closed) because text research cannot produce structured VS Battles tiers.

The unified pipeline must become a single `ingestCharacter({role, campaignId, freeText?, overrideText?, v2Card?, archetype?, mode?}) → CharacterDraft` function with clearly ordered stages (extract → research → merge → enrich powers → finalize). Endpoints become thin dispatchers to this function. Priority merge happens at the **LLM prompt layer** (single merge call with hierarchical instructions), not as deterministic field-by-field code.

**Primary recommendation:** Build one `character/ingestion-pipeline.ts` with `ingestCharacterDraft()` exposing 4 stages (source extraction → canon research → priority-merged draft synthesis → PowerStats assessment). All seven existing routes become 10-line dispatchers to that function. V2 import stops being a direct map — it becomes another source feeding the same pipeline. Add `overrideText` to all route schemas. Add `assessOriginalCharacterPowerStats()` alongside the existing `enrichKnownIpWorldgenNpcDraft()` so every successful ingest emits `powerStats` (or fails loudly with a typed pipeline error — never undefined for characters that should have powers).

---

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| P60-R1 | Unified backend pipeline feeds all 7 ingestion endpoints (parse/generate/research/import for player + key NPC) | Current routes already share `setupCharacterEndpoint` helper and `role: "player"|"key"` switch; extraction to a single `ingestCharacterDraft()` function is mechanical |
| P60-R2 | V2/V3 card is INPUT to pipeline, not a direct field map | `mapV2CardToCharacter` / `mapV2CardToNpc` currently do direct 1:1 map via `generateObject` — must be refactored to produce a `SourceBundle` then merged |
| P60-R3 | Explicit `overrideText` field flows through every route | No current schema contains it; must add to `characterRoleFields` in `schemas.ts` and thread through all functions |
| P60-R4 | Priority merge: override > card > research > LLM inference | Merge performed in the synthesis LLM call (single call with hierarchical priority framing in prompt), not deterministic field overrides |
| P60-R5 | Canon characters run archetype research + VS Battles PowerStats | `enrichKnownIpWorldgenNpcDraft` already exists but is only invoked from worldgen — must be reused in the ingestion pipeline when `canonicalStatus` resolves to canonical |
| P60-R6 | Original characters infer PowerStats from card or persona | New `assessOriginalCharacterPowerStats` function required — follows same structured schema as known-IP but has different prompt (no search, uses card text + persona) |
| P60-R7 | Complete `CharacterRecord` with full `PowerStats` | `CharacterDraft.powerStats` already optional in `shared/src/types.ts:434`; pipeline must emit it non-optionally and route responses expose it on every ingest |
| P60-R8 | No fallbacks — fail loudly or retry | `feedback_no_fallbacks_v2.md`: silent placeholder = bug. Retry with exponential backoff inside pipeline; if unrecoverable throw typed `IngestionPipelineError` |
| P60-R9 | Delivered to Phase 61 frontend via consistent response shape | `createDraftResponse` in `routes/character.ts:70` is the current response envelope — extend to carry `powerStats`, `provenance.overrideText`, and pipeline stage audit |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **TypeScript strict mode, ES modules** — pipeline file uses `.js` extensions in imports
- **Zod for all AI tool definitions and API payloads** — all schema changes go in `backend/src/routes/schemas.ts`
- **Drizzle query builder, not raw SQL** — only `save-character` writes to DB; `players` and `items` tables untouched by pipeline changes
- **Vercel AI SDK `ai` v6 (`streamText`/`generateText`/`generateObject`)** — pipeline orchestrates multiple `generateObject` calls, not raw fetch
- **Route handlers: outer try/catch, `parseBody()` for validation, `getErrorStatus(error)` for status** — applies to every refactored endpoint
- **Shared types in `@worldforge/shared`** — any new ingestion-source or pipeline-stage types that leak to frontend belong there; internal-only types stay in `backend/src/character/`
- **Language:** Planning comments/commits in English; user-facing assistant messages in Russian
- **LLM is narrator only** — not applicable here (ingestion is Generator role only)
- **GitNexus `impact` before editing any symbol** — applies to `mapV2CardToCharacter`, `mapV2CardToNpc`, `enrichKnownIpWorldgenNpcDraft`, `parseCharacterDescription`, `generateCharacter`, `setupCharacterEndpoint` (all d=1 callers listed below)

## Phase 57 PowerStats Baseline

From `shared/src/types.ts:517-564` (confirmed by read):

```typescript
export const AP_DURABILITY_TIERS = ["Human","Street","Wall","Building","City Block","Town",
  "City","Mountain","Island","Country","Continental","Moon","Planet","Star",
  "Solar System","Galaxy","Universal","Multiversal+"] as const;
export const SPEED_TIERS = ["Human","Superhuman","Subsonic","Supersonic","Hypersonic",
  "Massively Hypersonic","Sub-Relativistic","Relativistic","FTL","MFTL","Infinite"] as const;
export const INTELLIGENCE_TIERS = ["Average","Above Average","Gifted","Genius",
  "Extraordinary Genius","Supergenius"] as const;

export interface TierRank<T extends string = string> { tier: T; rank: number; } // rank 1-10
export interface HaxAbility { name, type, bypassTier: ApDurabilityTier|null, limitations: string[] }
export interface CharacterVulnerability { description, severity: "minor"|"major"|"critical" }
export interface PowerStats {
  attackPotency: TierRank<ApDurabilityTier>;
  speed: TierRank<SpeedTier>;
  durability: TierRank<ApDurabilityTier>;
  intelligence: TierRank<IntelligenceTier>;
  hax: HaxAbility[];
  vulnerabilities: CharacterVulnerability[];
}
```

`CharacterDraft.powerStats` (`shared/src/types.ts:434`) is `PowerStats | undefined`. This is what the pipeline must fill.

The `normalizeLlmPowerStats` + `repairPowerStats` pattern already exists in `backend/src/character/known-ip-worldgen-research.ts:161` and `:192` (3-attempt repair loop). **Reuse this as-is** — it is the canonical mechanism for coercing loose LLM output into the structured `PowerStats` schema.

## Current Endpoint Flow Map

All 7 "endpoints" are actually 4 routes with `role: "player" | "key"` switch. Serving them from `backend/src/routes/character.ts`:

| Route (path) | File:Line | role=player path | role=key path |
|---|---|---|---|
| POST `/parse-character` | `character.ts:109` | `parseCharacterDescription` (`generator.ts:151`) | `parseNpcDescription` (`npc-generator.ts:163`) |
| POST `/generate-character` | `character.ts:137` | `generateCharacter` (`generator.ts:286`) | `generateNpcFromArchetype({archetype:"a compelling..."})` (`npc-generator.ts:281`) |
| POST `/research-character` | `character.ts:167` | `researchArchetype` → `generateCharacterFromArchetype` (`generator.ts:346`) | `researchArchetype` → `generateNpcFromArchetype` |
| POST `/import-v2-card` | `character.ts:200` | `mapV2CardToCharacter` (`generator.ts:212`) | `mapV2CardToNpc` (`npc-generator.ts:214`) |
| POST `/save-character` | `character.ts:230` | Persists draft → DB (player only) | n/a |
| POST `/resolve-starting-location` | `character.ts:370` | helper, not part of ingestion | n/a |

**All 4 creation routes share:**
- `setupCharacterEndpoint(c, campaignId, role, bodyLoc, bodyFac)` — returns `{gen, campaign, names, settings}` (resolves campaign, generator role, location/faction lists from DB or body)
- `parseBody(c, schema)` — Zod validation
- `createDraftResponse(campaignId, draft)` — unified response envelope

**Every player path ultimately emits `CharacterDraft` with `powerStats: undefined`.** **No player route invokes `enrichKnownIpWorldgenNpcDraft`.** This is the central gap to close.

## Standard Stack (Phase 60 uses existing stack — no new deps)

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | v6+ | `generateObject` for structured LLM output | Already the project standard |
| `zod` | (pinned) | Schema validation + Zod→JSON Schema for `generateObject` | Project standard; `loosePowerStatsSchema` + `powerStatsLlmSchema` + coerced schemas already exist |
| `@worldforge/shared` | workspace | `CharacterDraft`, `PowerStats`, `CharacterCanonicalStatus` | Types already defined, just consume |
| `hono` | (pinned) | Route handlers | No changes needed |

### Supporting (existing functions to compose)
| Function | File:Line | Purpose |
|---|---|---|
| `enrichKnownIpWorldgenNpcDraft` | `backend/src/character/known-ip-worldgen-research.ts:261` | Canon research + VS Battles PowerStats assessment (REUSE) |
| `normalizeLlmPowerStats` | `known-ip-worldgen-research.ts:161` | Coerce loose LLM output into `PowerStats` (REUSE) |
| `repairPowerStats` | `known-ip-worldgen-research.ts:192` | 3-attempt repair loop for malformed PowerStats (REUSE) |
| `webSearch` | `backend/src/lib/web-search.ts` | Provider-agnostic web search (used by known-IP already) |
| `researchArchetype` | `backend/src/character/archetype-researcher.ts:10` | MCP-driven archetype research returning free text (REUSE, but now always runs for `known_ip_*`) |
| `buildCharacterPromptContract` | `backend/src/character/prompt-contract.ts` | Shared prompt fragment for draft contract |
| `buildV2CardSections` | `backend/src/character/v2-sections.ts:2` | Format V2 fields into LLM prompt block |
| `buildImportModeGuidance`, `normalizeImportedTags` | `backend/src/character/import-utils.ts` | V2 import helpers |
| `fromRichParsedCharacter`, `fromLegacyScaffoldNpc`, `createCharacterRecordFromDraft` | `backend/src/character/record-adapters.ts:220+` | Draft materialization |
| `safeGenerateObject` | `backend/src/ai/generate-object-safe.ts` | Project-wide wrapper for `generateObject` with retry hooks |
| `clampTokens` | `backend/src/lib/clamp.ts` | Token-cap clamping |

### New functions (to be created)
| Function | Purpose |
|---|---|
| `ingestCharacterDraft()` | Unified pipeline entry point |
| `assessOriginalCharacterPowerStats()` | LLM-infer PowerStats from draft+card text (no web search, for `original`/`imported` status) |
| `synthesizeDraftFromSources()` | Single LLM call that performs priority-merge synthesis |
| `classifyCanonicalStatus()` | Determine `original` / `imported` / `known_ip_canonical` / `known_ip_diverged` from inputs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|---|---|---|
| Priority merge via single LLM synthesis call | Deterministic field-level merge (`{...research, ...card, ...override}`) | Rejected: override is free text ("her eyes are red not blue"), not structured — LLM must interpret. Deterministic merge only works if override is structured, which the UX spec explicitly rules out |
| Separate ingestion endpoints | Keep 4 routes as dispatchers to 1 pipeline | Keep existing 4 routes. Reasons: (a) frontend already segregates by source (parse/generate/research/import) so UX is already discriminated; (b) each route's Zod input is genuinely different (concept text vs archetype vs card JSON); (c) preserves backward compatibility |
| Replace `mapV2CardToCharacter` with structured extraction | Keep as a "source-extractor" that returns a `SourceBundle` instead of a final draft | Adopt: same file, refactored purpose — output is intermediate not final |
| Canonical-status detection via explicit flag from frontend | LLM classification + IP research frame presence in campaign config | Use the IP research frame already persisted by Phase 51 (`worldgen research frame`). If frame is set and character name matches `ipContext.canonicalNames.characters`, treat as `known_ip_canonical`. Else `original` (or `imported` if V2) |

**Installation:** No new dependencies.

**Version verification:** Not applicable — only existing pinned deps. Confirmed `ai` v6 already in use (Phase 02 note in STATE.md).

## Architecture Patterns

### Unified Pipeline Flow

```
┌──────────────────────────────────────────────────────────────────┐
│  ingestCharacterDraft(input: IngestionInput): CharacterDraft     │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
   ┌────────────── Stage 1: Source Extraction ───────────────┐
   │  Inputs:                                                │
   │  - freeText (parse/generate modes)                      │
   │  - archetype (research mode)                            │
   │  - v2Card (import mode)                                 │
   │  - overrideText (any mode)                              │
   │  Output: SourceBundle { freeText, card, overrideText,   │
   │                          archetype }                    │
   └─────────────────────────────────────────────────────────┘
                                │
                                ▼
   ┌──────── Stage 2: Canonical Classification + Research ───┐
   │  Inputs: campaign IP context, source bundle             │
   │  Logic:                                                 │
   │   a) If archetype + canon match → known_ip_canonical    │
   │   b) If V2 name ∈ ipContext.canonicalNames.characters   │
   │         → known_ip_canonical (+ webSearch canon)        │
   │   c) If V2 + no canon match → imported                  │
   │   d) Else → original                                    │
   │  Canon status triggers: researchArchetype OR webSearch  │
   │  Output: { canonicalStatus, researchDigest? }           │
   └─────────────────────────────────────────────────────────┘
                                │
                                ▼
   ┌──────── Stage 3: Priority-Merged Draft Synthesis ───────┐
   │  Single generateObject call with prompt that            │
   │  explicitly ranks sources:                              │
   │    1. USER OVERRIDE (highest — must win conflicts)      │
   │    2. SOURCE CARD (second — preserve card facts)        │
   │    3. CANON RESEARCH (third — fill gaps)                │
   │    4. LLM INFERENCE (last — only when above silent)     │
   │  Schema: richCharacterSchema (existing)                 │
   │  Output: CharacterDraft (no powerStats yet)             │
   └─────────────────────────────────────────────────────────┘
                                │
                                ▼
   ┌──────── Stage 4: PowerStats Assessment ─────────────────┐
   │  Branch on canonicalStatus:                             │
   │  - known_ip_canonical/diverged:                         │
   │       enrichKnownIpWorldgenNpcDraft() [web search +     │
   │       VS Battles assessment]                            │
   │  - original/imported:                                   │
   │       assessOriginalCharacterPowerStats() [LLM infers   │
   │       from draft + card text, no web search]            │
   │  Both paths use normalizeLlmPowerStats +                │
   │  repairPowerStats (3-attempt repair loop).              │
   │  Output: CharacterDraft with powerStats                 │
   └─────────────────────────────────────────────────────────┘
                                │
                                ▼
                       Validated CharacterDraft
```

### Recommended File Layout

```
backend/src/character/
├── ingestion/                      ← NEW SUBDIR
│   ├── index.ts                    ← exports ingestCharacterDraft
│   ├── pipeline.ts                 ← orchestration (Stages 1-4)
│   ├── source-extraction.ts        ← Stage 1
│   ├── canon-classification.ts     ← Stage 2
│   ├── synthesis.ts                ← Stage 3 (priority-merge LLM call)
│   ├── power-assessment.ts         ← Stage 4 dispatcher
│   ├── assess-original.ts          ← NEW — LLM PowerStats for original chars
│   ├── types.ts                    ← IngestionInput, SourceBundle, PipelineError
│   └── __tests__/
│       └── pipeline.test.ts
├── generator.ts                    ← ADAPT: split mapV2CardToCharacter into
│                                     extractV2Card + synthesizeDraft
├── npc-generator.ts                ← ADAPT: similar split
├── known-ip-worldgen-research.ts   ← KEEP: enrichKnownIpWorldgenNpcDraft
│                                     reused by Stage 4 canon path
└── archetype-researcher.ts         ← KEEP: researchArchetype reused
```

### Pattern 1: Single-call Priority-Merge Synthesis

**What:** One `generateObject` call with a prompt that hierarchically frames all sources and instructs the LLM to merge with explicit priority.

**When to use:** Stage 3 of every ingestion.

**Example prompt skeleton:**
```typescript
// Source: backend/src/character/ingestion/synthesis.ts (NEW)
const prompt = `You are synthesizing a WorldForge character draft from multiple sources with strict priority.

${buildCharacterPromptContract({ roleEmphasis: "Synthesize from multiple ranked sources. Higher priority sources win conflicts." })}

PRIORITY 1 (HIGHEST — must win any conflict with lower sources):
USER OVERRIDE INSTRUCTIONS:
${bundle.overrideText || "(none provided — ignore this section)"}

PRIORITY 2 — SOURCE CARD (only if a V2 card was imported):
${bundle.card ? buildV2CardSections(bundle.card) : "(none provided)"}

PRIORITY 3 — CANON RESEARCH (only for known-IP canonical characters):
${canonDigest || "(not a canonical character — ignore)"}

PRIORITY 4 — FREE-TEXT CONCEPT OR ARCHETYPE:
${bundle.freeText || bundle.archetype || "(none — infer from higher priorities)"}

WORLD PREMISE:
${premise}

KNOWN LOCATIONS (pick one as locationName):
${locationNames.map(n => "- " + n).join("\n")}
${factionNames ? "\nKNOWN FACTIONS:\n" + factionNames.map(n => "- " + n).join("\n") : ""}

MERGE RULES:
- When a higher priority source contradicts a lower one, ALWAYS use the higher source's value verbatim.
- When a higher source is silent on a field, fall to the next source.
- User override is interpreted LITERALLY — "eyes are red not blue" means appearance MUST contain red eyes even if card said blue.
- Preserve card facts verbatim unless overridden.
- Canon research fills gaps (e.g. known tier, canonical traits) for known-IP characters, never contradicts card or override.
- Never invent facts that no source supports — leave fields empty instead.

${buildFlatOutputStrategy({ preservePlayerAgency: role === "player" && bundle.source === "freeText" })}`;
```

**Key detail:** The priority-merge happens inside the LLM call. This is a design trade-off — deterministic merging cannot interpret natural-language overrides like "she is weaker than canon" which must re-weight PowerStats in Stage 4.

### Pattern 2: Fail-Loud Retry (No Fallbacks)

```typescript
// Source: pattern derived from known-ip-worldgen-research.ts:192 (repairPowerStats)
export class IngestionPipelineError extends Error {
  constructor(
    public stage: "extraction" | "classification" | "synthesis" | "power_assessment",
    public cause: unknown,
    message: string,
  ) { super(message); }
}

async function withPipelineRetry<T>(
  stage: IngestionPipelineError["stage"],
  fn: () => Promise<T>,
  { maxAttempts = 3 }: { maxAttempts?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) break;
      await new Promise(r => setTimeout(r, 500 * 2 ** (attempt - 1)));
    }
  }
  throw new IngestionPipelineError(
    stage,
    lastError,
    `Ingestion stage "${stage}" failed after ${maxAttempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
```

Route handler surfaces this as a 502-class error with `stage` and `cause` in body. **No silent `undefined` returns.** Empty `powerStats` is only valid for characters that genuinely have no powers (e.g. ordinary civilian NPC) — and that must be an explicit LLM decision in Stage 4, not a swallowed exception.

### Pattern 3: Canonical Classification via IP Context

```typescript
// Source: reading ipContext usage in backend/src/worldgen/ip-researcher.ts
function classifyCanonicalStatus(opts: {
  displayName: string;
  hasV2Card: boolean;
  ipContext: IpResearchContext | null;
  archetypeIsCanonName: boolean;
}): CharacterCanonicalStatus {
  const canonicalNames = opts.ipContext?.canonicalNames?.characters ?? [];
  const nameMatch = canonicalNames.some(
    n => n.toLowerCase() === opts.displayName.toLowerCase(),
  );
  if (nameMatch || opts.archetypeIsCanonName) {
    // Diverged means: canonical name but context says divergence is in play
    // (check for excludedCharacters and changedCanonFacts)
    return opts.ipContext?.excludedCharacters?.includes(opts.displayName)
      ? "known_ip_diverged"
      : "known_ip_canonical";
  }
  return opts.hasV2Card ? "imported" : "original";
}
```

### Anti-Patterns to Avoid

- **Direct V2 field map:** Current `mapV2CardToCharacter` treats V2 as final truth. Must be gutted — V2 becomes a source, not a destination.
- **Silent `powerStats: undefined`:** `synthesizeArchetypePowerStats` returns undefined with a comment "fail-closed". That's correct for Phase 57 (archetype research alone can't produce structured tiers) but **incorrect for Phase 60** — Phase 60 runs a dedicated LLM assessment call, so undefined means the pipeline is broken, not that data is absent.
- **Deterministic merge on top of LLM output:** The LLM must receive all sources and do the merge. Post-hoc field substitution produces frankenstein drafts where fields disagree (e.g. override says "red eyes" but `appearance` field still has "blue eyes" because code only overwrote `identity.baseFacts`).
- **Hand-rolled priority field dictionary:** Listing every field and its priority source code-side. Fragile, duplicates LLM judgment, breaks on new fields.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| V2/V3 card parsing | Custom PNG chunk reader | `frontend/lib/v2-card-parser.ts:15` (`parseV2CardFile`) | Already handles PNG tEXt chunks, V2+V3 JSON, base64. Frontend calls it before `/import-v2-card`. Keep backend receiving parsed payload only |
| PowerStats coercion/repair | Manual normalization | `normalizeLlmPowerStats` + `repairPowerStats` in `known-ip-worldgen-research.ts` | Already battle-tested, 3-attempt repair, handles loose LLM output |
| Web search for canon | Raw HTTP or new SDK | `backend/src/lib/web-search.ts` (`webSearch`) | Provider-agnostic (brave/duckduckgo/zai), used by known-IP already |
| MCP client lifecycle | Raw MCP spawn | `withMcpClient` / `withSearchMcp` from `backend/src/lib/` | Handles MCP server spawn/teardown, Windows `npx.cmd` quirk |
| Tag normalization | Custom dedupe | `normalizeImportedTags` in `import-utils.ts` | Strips `[]`, dedupes case-insensitively, clamps length |
| V2 card prompt formatting | String concat | `buildV2CardSections` in `v2-sections.ts` | Filters empty fields, consistent format |
| Draft → DB projection | Manual field mapping | `projectPlayerRecord` / `projectNpcRecord` in `record-adapters.ts` | Already computes derived tags, inventory projections |
| Campaign/generator/settings loading | Per-route boilerplate | `setupCharacterEndpoint` in `routes/helpers.ts` | Already returns `{gen, campaign, names, settings}` |

**Key insight:** Phase 60 is almost entirely composition of existing primitives. The ONE new LLM capability is "infer PowerStats from a character draft without web search" (for original/imported characters). That is one function, not a new subsystem.

## Runtime State Inventory

This is a refactor phase with *some* data contract changes (new `overrideText` field). Walking through each category:

| Category | Items Found | Action Required |
|---|---|---|
| **Stored data** | `players.characterRecord` and `npcs.characterRecord` JSON blobs — existing records lack `powerStats` for players (never generated before Phase 60). `provenance.overrideText` field is new. | **Code-only:** draft hydrators (`hydrateStoredPlayerRecord`, `hydrateStoredNpcRecord` in `record-adapters.ts`) already tolerate missing fields. Old records continue to work with `powerStats: undefined` but UI already displays "No power assessment" via Phase 57. New saves carry full data. No migration needed. |
| **Live service config** | None — no external service stores character data | None — verified by inspection of settings/manager.ts, ipContext, worldbook library; all character data is campaign-local |
| **OS-registered state** | None | None — verified |
| **Secrets and env vars** | `settings.research.braveApiKey` / `zaiApiKey` already used by `enrichKnownIpWorldgenNpcDraft` via `buildSearchConfig` (`known-ip-worldgen-research.ts:125`). No new secrets. | None — reuse existing research settings |
| **Build artifacts / installed packages** | None — pure TS code edits | None — `npm --prefix backend run typecheck` suffices |

**After every file in the repo is updated, what runtime systems still have the old string/schema cached?** Nothing. The change is purely in the backend character/routes layer. Database schema untouched (characterRecord is JSON, tolerant of new fields). Frontend awaits Phase 61. No third-party services involved.

## Common Pitfalls

### Pitfall 1: Treating V2 description as persona ground truth
**What goes wrong:** V2 `description` field often contains fan-written lore mixed with canon contradictions. Current `mapV2CardToCharacter` feeds it into the LLM as authoritative.
**Why it happens:** Historical 1:1 mapping assumption.
**How to avoid:** In Stage 3, frame V2 card as "secondary source — character author's interpretation; may diverge from canon". Allow canon research to correct factual errors while preserving persona voice.
**Warning signs:** Pipeline produces a Gojo with "blue eyes" when card says "blue eyes" even though canon + user override say "blue eyes that hide Six Eyes technique" — lost the canon nuance.

### Pitfall 2: Running web search for every ingestion
**What goes wrong:** Latency explosion and unnecessary web calls for original characters who don't need canon lookup.
**Why it happens:** Pipeline thinks "all characters need research".
**How to avoid:** Stage 2 classification gates Stage 2b research. Only `known_ip_canonical` / `known_ip_diverged` triggers web search. Original + imported use archetype-text research only if an archetype was provided, else no research.
**Warning signs:** Ingestion takes >30s for a hand-typed original character. Expected: <10s for original, 15-30s for canon.

### Pitfall 3: Override text feeding into canon research query
**What goes wrong:** User writes "she is weaker than canon" in override. Code concatenates this into the Google query. Search returns junk.
**Why it happens:** Lazy query construction.
**How to avoid:** Research query derives from `displayName + franchise`, NOT from override. Override is applied ONLY in Stage 3 synthesis and Stage 4 power assessment. Pattern: `query = ${franchise} ${name} abilities powers` (matches existing `known-ip-worldgen-research.ts:275`).
**Warning signs:** Web search digest contains user's exact override text reflected back.

### Pitfall 4: PowerStats assessment ignoring override
**What goes wrong:** Stage 4 calls `enrichKnownIpWorldgenNpcDraft` which only knows about the draft — doesn't know user said "she is weaker than canon". Canon tier still emitted.
**Why it happens:** `enrichKnownIpWorldgenNpcDraft` signature has no override parameter.
**How to avoid:** Extend signature: `enrichKnownIpWorldgenNpcDraft({..., overrideText?: string})`. Prompt explicitly instructs: "If the user override asks to adjust power level, honor it by adjusting tier/rank accordingly. Document the adjustment in vulnerabilities or limitations if it materially weakens the character."
**Warning signs:** Gojo ingested with override "nerfed to City tier" emerges with `Universal 10` anyway.

### Pitfall 5: Zod `.or()` schema for `saveCharacter` masks override loss
**What goes wrong:** `saveCharacterSchema` at `schemas.ts:859` accepts either `{character: legacyCharacterSchema}` OR `{draft: characterDraftSchema}`. If frontend sends a fully-enriched draft but the client code accidentally routes through the legacy branch, all PowerStats + provenance lose.
**Why it happens:** Two-shape schema is clever but silent-lossy.
**How to avoid:** Add fail-loud check: if client sends `character` branch but the stored-draft path was expected, log warning. Long-term: deprecate `legacyCharacterSchema` branch from `saveCharacterSchema` once Phase 61 migrates.
**Warning signs:** Saved player has `powerStats: undefined` after ingestion pipeline promised full stats.

### Pitfall 6: `synthesizeArchetypePowerStats` dead-path
**What goes wrong:** `archetype-researcher.ts:45` returns `undefined`. Any Phase 60 code that still calls it silently kills PowerStats.
**Why it happens:** Stub left from Phase 57 as fail-closed placeholder.
**How to avoid:** Either delete `synthesizeArchetypePowerStats` in Phase 60, or replace its body with a call to the new `assessOriginalCharacterPowerStats`. Do not leave the stub.
**Warning signs:** gitnexus_query for `synthesizeArchetypePowerStats` returns callers after Phase 60 ships.

### Pitfall 7: Direct-call from frontend bypasses pipeline
**What goes wrong:** Phase 61 frontend adds Power Stats editor that calls `/save-character` directly with a hand-crafted draft, skipping pipeline enrichment.
**Why it happens:** Save endpoint accepts any valid draft.
**How to avoid:** This is intentional — users can hand-edit. But `save-character` must NOT re-run the pipeline. Clear doc comment: "save-character persists as-is. Enrichment happens in /parse-character, /generate-character, /research-character, /import-v2-card. Frontend must call one of those first to get an enriched draft."

## Code Examples

Verified patterns from existing code:

### Existing: Known-IP enrichment (reuse in Stage 4 canon path)
```typescript
// Source: backend/src/character/known-ip-worldgen-research.ts:261
export async function enrichKnownIpWorldgenNpcDraft(opts: {
  draft: CharacterDraft;
  franchise: string;
  role: ResolvedRole;
  research: ResearchConfig | undefined;
  premise: string;
  premiseDivergence?: PremiseDivergence | null;
}): Promise<CharacterDraft> {
  // search → generateObject loose schema → normalizeLlmPowerStats
  // → repairPowerStats (3 attempts if invalid) → return {...draft, powerStats}
}
```

### New: Assess original character PowerStats (Stage 4 original path)
```typescript
// Source: to be created — backend/src/character/ingestion/assess-original.ts
// Mirrors enrichKnownIpWorldgenNpcDraft structure, but:
//   - No webSearch step
//   - Prompt feeds draft.profile + card text instead of search digest
//   - Otherwise identical: loosePowerStatsSchema + normalizeLlmPowerStats + repairPowerStats
export async function assessOriginalCharacterPowerStats(opts: {
  draft: CharacterDraft;
  cardText?: string;         // full V2 description+personality+scenario when available
  overrideText?: string;     // user priority-1 instructions
  role: ResolvedRole;
  premise: string;
}): Promise<CharacterDraft> {
  const prompt = `Assess PowerStats for this character using VS Battles Wiki conventions.
The character is ORIGINAL (not a canonical IP character), so ground the assessment in:
  - The character draft (persona, tags, backgroundSummary)
  - The source card text if present (may contain ability descriptions)
  - The user override text (highest priority — may specify power level directly)

${overrideText ? "USER OVERRIDE (HIGHEST PRIORITY):\n" + overrideText + "\n\n" : ""}
${cardText ? "SOURCE CARD:\n" + cardText + "\n\n" : ""}

CHARACTER DRAFT:
Name: ${draft.identity.displayName}
Background: ${draft.profile.backgroundSummary}
Persona: ${draft.profile.personaSummary}
Tags: ${draft.capabilities.traits.join(", ")}
Skills: ${draft.capabilities.skills.map(s => s.tier + " " + s.name).join(", ")}

Tiers:
  AP/Durability: ${AP_DURABILITY_TIERS.join(", ")}
  Speed: ${SPEED_TIERS.join(", ")}
  Intelligence: ${INTELLIGENCE_TIERS.join(", ")}

Return structured PowerStats JSON. Most original characters are Human or Street tier.
Only assign higher tiers if abilities explicitly support it.
If the character has no supernatural powers, hax=[] is correct and expected.`;
  // … reuse normalizeLlmPowerStats + repairPowerStats loop
}
```

### New: Ingestion pipeline entry
```typescript
// Source: to be created — backend/src/character/ingestion/pipeline.ts
export type IngestionInput =
  | { mode: "parse"; campaignId: string; role: "player"|"key"; freeText: string; overrideText?: string }
  | { mode: "generate"; campaignId: string; role: "player"|"key"; overrideText?: string }
  | { mode: "research"; campaignId: string; role: "player"|"key"; archetype: string; overrideText?: string }
  | { mode: "import"; campaignId: string; role: "player"|"key"; v2Card: V2ImportPayload; importMode: CharacterImportMode; overrideText?: string };

export async function ingestCharacterDraft(
  input: IngestionInput,
  ctx: { gen: ResolvedRole; campaign: CampaignMeta; settings: Settings; locationNames: string[]; factionNames: string[] },
): Promise<CharacterDraft> {
  const bundle = extractSources(input);
  const classification = await classifyCanonicalStatus({ bundle, ipContext: ctx.campaign.ipContext });
  const researchDigest = await runCanonResearchIfNeeded(classification, ctx);
  const draft = await synthesizeDraftFromSources({ bundle, classification, researchDigest, ctx });
  const enriched = await assessPowerStats({ draft, bundle, classification, researchDigest, ctx });
  return enriched;
}
```

### Existing: Schema pattern for `characterRoleFields` (to extend with `overrideText`)
```typescript
// Source: backend/src/routes/schemas.ts:890
const characterRoleFields = {
  role: roleField,
  locationNames: z.array(z.string()).optional(),
  factionNames: z.array(z.string()).optional(),
  // ADD:
  overrideText: z.string().trim().max(2000).optional(),
} as const;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| V2 card → 1:1 field map via `mapV2CardToCharacter` | V2 card as a ranked source in priority merge | Phase 60 (this phase) | V2 imports gain canon context + override support + PowerStats |
| PowerStats only for worldgen key NPCs | PowerStats for every ingested player + NPC | Phase 60 | Phase 61 UI can show power stats uniformly across all character entry points |
| No override channel | Explicit `overrideText` in every creation route | Phase 60 | Users can surgically correct canon/card without restarting ingestion |
| `synthesizeArchetypePowerStats` returns `undefined` (Phase 57 fail-closed stub) | `assessOriginalCharacterPowerStats` returns structured stats or retries/throws | Phase 60 | Closes the original-character PowerStats gap |

**Deprecated/outdated:**
- `synthesizeArchetypePowerStats` (`archetype-researcher.ts:45`) — replace body or remove entirely
- `mapV2CardToCharacter` in current form — refactor into source-extractor + downstream synthesis
- `mapV2CardToNpc` — same refactor
- Direct `generateCharacter`/`parseCharacterDescription` single-call pattern — becomes one stage of pipeline, not the whole pipeline

## Open Questions

1. **How does the pipeline know the franchise for known-IP player characters at creation time?**
   - What we know: Campaign already persists `ipContext` (`IpResearchContext` in `shared/src/types.ts:112`) and `premiseDivergence`. `enrichKnownIpWorldgenNpcDraft` currently receives `franchise` from caller.
   - What's unclear: Is `ipContext` always populated before character creation? For "original world" campaigns it is null.
   - Recommendation: Read `ipContext` from campaign config. If absent → treat all characters as `original` (skip canon research, use `assessOriginalCharacterPowerStats`). Document this clearly.

2. **Does `known_ip_diverged` require different canon handling than `known_ip_canonical`?**
   - What we know: `premiseDivergence` already exists and `enrichKnownIpWorldgenNpcDraft` accepts it. Phase 25 established divergence interpretation.
   - What's unclear: Should diverged characters still run full web search, or substitute `changedCanonFacts` verbatim?
   - Recommendation: Run web search as normal (canon grounding) AND pass `premiseDivergence` to the LLM which already knows how to reconcile. No new logic needed — this is how existing worldgen behaves.

3. **Can the `save-character` route remain legacy-compatible?**
   - What we know: `saveCharacterSchema` accepts two shapes (legacy `character` or rich `draft`).
   - What's unclear: Does the legacy branch still need to exist after Phase 60? Does anyone serialize a `character` payload any more?
   - Recommendation: Keep legacy branch through Phase 61 launch. Add deprecation log when it's hit. Remove in a post-60 cleanup phase once Phase 61 frontend is 100% draft-based.

4. **Archetype research for original characters — keep?**
   - What we know: `researchArchetype` returns free text via MCP search.
   - What's unclear: For `original` characters with an archetype, should pipeline run text research?
   - Recommendation: YES. Archetype research is Stage 2 optional input when `mode === "research"`. Output feeds Stage 3 synthesis as a "source" (priority 4). Does NOT produce PowerStats (per the fail-closed comment in Phase 57, which remains correct for text-only research).

5. **What happens if `generateObject` timeout occurs mid-pipeline?**
   - What we know: `safeGenerateObject` exists as a retry wrapper.
   - What's unclear: Does it retry with exponential backoff?
   - Recommendation: Investigate `backend/src/ai/generate-object-safe.ts` before planning. If it already retries, the pipeline needs only outer-level stage retry. If not, add retry at pipeline stage level per Pattern 2.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| `ai` SDK | All `generateObject` calls | ✓ | v6+ (per STATE.md Phase 02) | — |
| MCP search provider (brave/duckduckgo/zai) | Canon research (Stage 2b) | Depends on `settings.research` | — | If research disabled → known-IP characters fail ingestion loudly (already the behavior in `enrichKnownIpWorldgenNpcDraft:269`) |
| GLM/OpenRouter provider | Generator role LLM calls | ✓ (per MEMORY.md "GLM is default provider") | — | No fallback — per `feedback_openrouter_embargo` only Embedder may use OpenRouter |
| Campaign SQLite | `save-character`, `setupCharacterEndpoint` | ✓ | WAL mode | — |
| LanceDB vectors | Not used in ingestion pipeline | n/a | — | — |

**Missing dependencies with no fallback:** None for Phase 60. All required primitives ship in the current backend.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Vitest (inferred from existing test file naming `.test.ts`) |
| Config file | `backend/vitest.config.ts` (present — verified by existing tests) |
| Quick run command | `npm --prefix backend test -- ingestion/pipeline.test.ts` |
| Full suite command | `npm --prefix backend test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| P60-R1 | All 4 routes delegate to `ingestCharacterDraft` | integration | `npm --prefix backend test -- routes/__tests__/character.test.ts` | ✅ existing (update) |
| P60-R2 | V2 card runs through pipeline, not direct map | unit | `npm --prefix backend test -- ingestion/pipeline.test.ts -t "v2 card as source"` | ❌ Wave 0 |
| P60-R3 | `overrideText` accepted by all 4 create routes | schema/unit | `npm --prefix backend test -- routes/__tests__/schemas.test.ts -t "overrideText"` | ❌ Wave 0 |
| P60-R4 | Priority merge honors override > card > research | unit (mocked LLM) | `npm --prefix backend test -- ingestion/pipeline.test.ts -t "priority merge"` | ❌ Wave 0 |
| P60-R5 | Known-IP path runs `enrichKnownIpWorldgenNpcDraft` | unit | `npm --prefix backend test -- ingestion/power-assessment.test.ts -t "canon path"` | ❌ Wave 0 |
| P60-R6 | Original path runs `assessOriginalCharacterPowerStats` | unit | `npm --prefix backend test -- ingestion/assess-original.test.ts` | ❌ Wave 0 |
| P60-R7 | Every successful ingest emits non-undefined `powerStats` | unit | `npm --prefix backend test -- ingestion/pipeline.test.ts -t "powerStats always present"` | ❌ Wave 0 |
| P60-R8 | Pipeline failure throws `IngestionPipelineError`, does not return `undefined` | unit | `npm --prefix backend test -- ingestion/pipeline.test.ts -t "fail loudly"` | ❌ Wave 0 |
| P60-R9 | Response envelope includes `powerStats` for Phase 61 consumption | integration | `npm --prefix backend test -- routes/__tests__/character.test.ts -t "response includes powerStats"` | ❌ update existing |

### Sampling Rate
- **Per task commit:** `npm --prefix backend test -- ingestion/` (unit tests for modified pipeline stage)
- **Per wave merge:** `npm --prefix backend test -- routes/__tests__/character.test.ts routes/__tests__/schemas.test.ts ingestion/` plus `npm --prefix backend run typecheck`
- **Phase gate:** `npm --prefix backend test` full suite green; `npm --prefix backend run typecheck` exits 0 (note: Phase 59 inherited TS errors in `routes/character.ts:246/271/359` and `routes/schemas.ts:635/804/807` and `routes/worldgen.ts:108` — Phase 60 must either fix or not regress these)

### Wave 0 Gaps
- [ ] `backend/src/character/ingestion/__tests__/pipeline.test.ts` — covers P60-R1, R2, R4, R7, R8 (end-to-end with mocked LLM)
- [ ] `backend/src/character/ingestion/__tests__/assess-original.test.ts` — covers P60-R6
- [ ] `backend/src/character/ingestion/__tests__/power-assessment.test.ts` — covers P60-R5 (dispatcher branches)
- [ ] `backend/src/character/ingestion/__tests__/source-extraction.test.ts` — V2 card + override extraction snapshot fixtures
- [ ] `backend/src/routes/__tests__/schemas.test.ts` — ADD `overrideText` schema tests (file exists; extend)
- [ ] `backend/src/routes/__tests__/character.test.ts` — ADD integration tests asserting response envelope carries `powerStats` + delegation to pipeline (file exists; extend)
- [ ] Fixtures directory: `backend/src/character/ingestion/__tests__/fixtures/` — include pure-card, card+override, pure-freeText, freeText+override, canon-archetype, original-with-card JSON samples

Framework install command: none — Vitest already present.

## Sources

### Primary (HIGH confidence — direct code inspection)
- `shared/src/types.ts:517-564` — PowerStats type definitions (Phase 57)
- `shared/src/types.ts:424-448` — `CharacterDraft` and `CharacterRecord` shapes
- `backend/src/routes/character.ts:109-228` — all 4 creation endpoints
- `backend/src/routes/character.ts:230-348` — save-character route
- `backend/src/routes/schemas.ts:859-928` — `saveCharacterSchema`, `parseCharacterSchema`, `generateCharacterSchema`, `researchCharacterSchema`, `importV2CardSchema`, `characterRoleFields`
- `backend/src/character/generator.ts:151-410` — `parseCharacterDescription`, `mapV2CardToCharacter`, `generateCharacter`, `generateCharacterFromArchetype`
- `backend/src/character/npc-generator.ts:163-339` — `parseNpcDescription`, `mapV2CardToNpc`, `generateNpcFromArchetype`
- `backend/src/character/archetype-researcher.ts:10-54` — `researchArchetype` + `synthesizeArchetypePowerStats` (currently returns `undefined`)
- `backend/src/character/known-ip-worldgen-research.ts:161-366` — `normalizeLlmPowerStats`, `repairPowerStats`, `enrichKnownIpWorldgenNpcDraft`
- `backend/src/character/record-adapters.ts:220-432` — record materialization functions
- `backend/src/worldgen/scaffold-steps/npcs-step.ts:564-573` — only current caller of `enrichKnownIpWorldgenNpcDraft`
- `backend/src/character/v2-sections.ts` — V2 card prompt formatter
- `backend/src/character/index.ts` — public export surface
- `frontend/lib/v2-card-parser.ts` — V2/V3 PNG + JSON parser (client-side)
- `frontend/components/character-creation/character-form.tsx` — current 3-mode player UI
- `frontend/components/world-review/npcs-section.tsx:141-233` — current 3-mode NPC UI (delegates to `parseCharacter`, `importV2Card`, `researchCharacter` API helpers)

### Primary (HIGH confidence — design memory)
- `~/.claude/projects/R--Projects-WorldForge/memory/project_v2_import_pipeline.md` — canonical design for V2 as INPUT + priority merge
- `~/.claude/projects/R--Projects-WorldForge/memory/feedback_no_fallbacks_v2.md` — no silent degradation rule

### Primary (HIGH confidence — phase history)
- `.planning/phases/57-power-scaling-character-profile-redesign/57-CONTEXT.md` — PowerStats design (VS Battles tiers, 5 axes)
- `.planning/ROADMAP.md` Phase 57 success criteria — PowerStats requirement
- `.planning/ROADMAP.md` Phase 60 goal block — this phase's scope
- `.planning/ROADMAP.md` Phase 61 — downstream consumer

### Secondary (MEDIUM confidence)
- `.planning/phases/59-game-shell-and-layout-fix/typecheck-before.txt` — reveals pre-existing TS errors in character routes/schemas that Phase 60 must not regress
- `.planning/STATE.md` Phase 34 decision — "Per-entity NPC detail loop replaces batch-of-5" (implies per-character ingestion pipeline is already the direction)
- `.planning/STATE.md` Phase 24 decision — "IP context block inverted: use REAL canonical names" (relevant to canon classification)

### Tertiary (LOW confidence)
- None — no WebSearch findings required for this phase; it is purely internal refactoring on existing primitives.

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all reused primitives verified by read
- Architecture: HIGH — pattern matches existing `enrichKnownIpWorldgenNpcDraft` structure
- Pitfalls: HIGH — derived from actual code quirks (Zod `.or()`, `synthesizeArchetypePowerStats` stub, route legacy branches)
- Runtime State: HIGH — verified each category explicitly
- Environment: HIGH — no external dependencies beyond existing stack

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (stable domain — character pipeline internals; refreshes only on Phase 57 or Phase 61 change)

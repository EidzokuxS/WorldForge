# Fix Lorebook Over-Influence in Worldgen - Research

**Researched:** 2026-04-04
**Domain:** Worldgen pipeline — worldbook-to-ipContext composition
**Confidence:** HIGH

## Summary

The root cause is clear: when multiple worldbooks are composed into an `IpResearchContext`, every classified entry becomes a `keyFact` with equal weight. A 67-entry SCP worldbook produces 67 keyFacts; a 15-entry VotV worldbook produces 15. The premise says "mainly VotV, small SCP elements" but the LLM sees 4.5x more SCP context in its prompt, so it generates an SCP-dominated world.

The imbalance happens at two levels: (1) `worldbookToIpContext()` converts ALL entries into keyFacts with no source tagging or budget, and (2) `buildIpContextBlock()` dumps all keyFacts into a flat list with no source grouping or priority signal.

**Primary recommendation:** Tag keyFacts by source, group them in the prompt with explicit priority labels derived from premise analysis, and cap secondary-source entries to prevent context flooding.

## Where the Imbalance Happens

### 1. `worldbookToIpContext()` — `backend/src/worldgen/worldbook-importer.ts:396-428`

Converts classified entries into `IpResearchContext`. Every entry becomes a keyFact:

```typescript
const keyFacts = sortedEntries.map((e) =>
  `${normalizeEntryText(e.name)}: ${normalizeEntryText(e.summary)}`
);
```

No source tagging. No entry budget. 67 SCP entries = 67 keyFacts. 15 VotV entries = 15 keyFacts. Franchise name is just `"SCP + VotV"` (concatenated display names).

### 2. `composeWorldbookLibraryRecords()` — `backend/src/worldbook-library/composition.ts:93-176`

Merges entries from multiple worldbooks by entity key (deduplication), then calls `worldbookToIpContext()` on the merged flat list. Source provenance is tracked in `groups[].contributions` but **never passed** to `worldbookToIpContext()` or downstream.

### 3. `buildIpContextBlock()` — `backend/src/worldgen/scaffold-steps/prompt-utils.ts:22-56`

Dumps all keyFacts as a flat bullet list:

```
Key facts -- treat as ground truth:
  - SCP entry 1: ...
  - SCP entry 2: ...
  ... (67 SCP entries)
  - VotV entry 1: ...
  ... (15 VotV entries)
```

No grouping by source. No priority signal. The "CANONICAL FIDELITY RULES" tell the LLM to use everything as ground truth.

### 4. `interpretPremiseDivergence()` — `backend/src/worldgen/premise-divergence.ts:63-156`

Receives ipContext (already flat-merged) and premise. It interprets divergence from a single "franchise" — it has no concept of primary vs secondary sources. The premise "mainly VotV, small SCP" has no structured way to express source weighting.

## What Does NOT Exist

- No `source` field on keyFacts or canonicalNames entries
- No per-source token budget or entry limit
- No "primary" vs "supplementary" source distinction in `CampaignWorldbookSelection`
- No premise-aware weighting in `composeSelectedWorldbooks()`
- `PremiseDivergence` does not track source priority — it only distinguishes canonical vs changed facts

## Fix Approaches

### Approach A: Source-Grouped Prompt with Priority Labels (RECOMMENDED)

**Minimal code change, high impact.**

1. **In `worldbookToIpContext()`** or a new variant: accept an optional `sourcePriority: 'primary' | 'supplementary'` per source. Or better: accept multiple sources with labels.

2. **In `composeWorldbookLibraryRecords()`**: Instead of merging into a single flat `worldbookToIpContext()` call, produce a structured result with per-source entry lists.

3. **In `buildIpContextBlock()`**: Group facts by source with explicit priority headers:

```
PRIMARY SOURCE REFERENCE (Voices of the Void — 15 entries):
  These facts define the core world. Use ALL of them as ground truth.
  - VotV entry 1: ...
  - VotV entry 2: ...

SUPPLEMENTARY REFERENCE (SCP Foundation — top 10 of 67 entries):
  Background material. Include elements ONLY when they fit the premise naturally.
  Do NOT let supplementary content dominate or override the primary source.
  - SCP entry 1: ...
  - SCP entry 2: ...
```

4. **Entry cap for supplementary sources**: Sample top-N entries (e.g., 10-15) from supplementary sources to prevent context flooding. Selection criteria: prefer entries that match premise keywords.

### Approach B: Premise-Aware Source Weighting via LLM

Add an LLM pre-step that reads the premise + source names + entry counts, then outputs:
- Which source is primary (highest premise alignment)
- Entry budget per source
- Which specific entries to include

Higher quality but adds another LLM call to an already long pipeline (5+ calls).

### Approach C: UI-Level Primary/Secondary Designation

Let user mark sources as "primary" or "supplementary" during worldbook selection. Clearest user intent, but requires frontend changes.

**Recommendation: Start with Approach A (backend-only, no UI changes). The premise text already contains the priority signal ("mainly VotV, small SCP") — we just need to parse it and apply it during composition.**

## Implementation Targets

| File | Change |
|------|--------|
| `backend/src/worldbook-library/composition.ts` | Track per-source entries separately, pass to new composition function |
| `backend/src/worldgen/worldbook-importer.ts` | Add `worldbooksToIpContext()` variant that accepts source-tagged entries with priority |
| `backend/src/worldgen/scaffold-steps/prompt-utils.ts` | New `buildMultiSourceIpContextBlock()` that groups by source with priority headers |
| `backend/src/worldgen/types.ts` or `shared/src/types.ts` | Extend `IpResearchContext` with optional `sourcePriority` metadata |
| `backend/src/worldgen/scaffold-generator.ts` | Pass premise to composition step for automatic priority detection |

## Common Pitfalls

### Pitfall 1: Prompt Bloat
Adding source headers + priority instructions to every scaffold step increases token usage. Mitigate by capping supplementary entries aggressively (10 max).

### Pitfall 2: Premise Parsing Fragility
User premise may not explicitly say "mainly X, some Y". The priority detection needs a robust fallback — if unclear, treat all sources equally (current behavior) or use entry count inverse as proxy.

### Pitfall 3: Breaking Single-Worldbook Path
Many campaigns use a single worldbook. The fix must be backward-compatible — single-source campaigns should work exactly as before.

### Pitfall 4: PremiseDivergence Confusion
`interpretPremiseDivergence()` currently receives a single-franchise ipContext. With multi-source, it needs to understand which franchise is primary for divergence interpretation.

## Sources

### Primary (HIGH confidence)
- `backend/src/worldgen/worldbook-importer.ts` — worldbookToIpContext() implementation
- `backend/src/worldbook-library/composition.ts` — composeWorldbookLibraryRecords() implementation  
- `backend/src/worldgen/scaffold-steps/prompt-utils.ts` — buildIpContextBlock() prompt construction
- `backend/src/worldgen/premise-divergence.ts` — interpretPremiseDivergence() single-franchise assumption
- `backend/src/routes/worldgen.ts` — generate route wiring

## Metadata

**Confidence breakdown:**
- Root cause identification: HIGH — code path is clear and deterministic
- Fix approach: HIGH — prompt engineering + entry budgeting is well-understood
- Implementation scope: MEDIUM — need to verify no other callers depend on flat ipContext shape

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable codebase, no external deps)

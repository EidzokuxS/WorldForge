# Quick Task: Fix Character Parsing Rich Fields + Page Lag — Research

**Researched:** 2026-04-03
**Domain:** Character generation pipeline + React rendering
**Confidence:** HIGH

## Summary

Two distinct bugs with different root causes. Bug 1 is a schema-hint generation issue where `generateSchemaExample()` drops field descriptions for array-typed fields and shows misleading defaults for numbers, causing GLM to return minimal/wrong values. Bug 2 has no infinite loop — the page structure is clean, but the CharacterForm `Textarea` (shadcn) still uses `field-sizing-content` in full mode.

## Bug 1: Rich Fields Empty / HP Wrong / Age Rewritten

### Root Cause: `generateSchemaExample()` loses array descriptions and shows wrong number defaults

**Confidence:** HIGH — traced through code with full evidence.

The `safeGenerateObject` function in `backend/src/ai/generate-object-safe.ts` builds a JSON schema hint via `generateSchemaExample()` and appends it to the system prompt. This hint is the PRIMARY guidance GLM uses to understand what fields to fill and what format to use. The function has two critical flaws:

#### Flaw 1: Array field descriptions are silently dropped

`generateSchemaExample()` (line 115-121) handles `ZodArray` by recursing into the element schema only. It **never reads `def.description`** for array types. Compare with ZodString (line 124-126) which returns `desc || "string value"`.

Result for `richCharacterSchema`:

```json
{
  "drives": ["string value"],
  "frictions": ["string value"],
  "shortTermGoals": ["string value"],
  "longTermGoals": ["string value"],
  "equippedItems": ["string value"],
  "tags": ["string value"]
}
```

The descriptions "REQUIRED. 1-3 core drives: what motivates this character fundamentally. Never empty." etc. are **completely absent** from the hint. GLM only sees generic `"string value"` placeholders and has no guidance on what content to generate for these fields.

The `tags` field is further affected: it's wrapped in `ZodEffects` (from `.transform()`) which `generateSchemaExample` does handle (line 166-169) — but it unwraps to the inner ZodArray, which then also drops the description.

#### Flaw 2: `hp` default shows 0 instead of 5

`hp: z.number().int().min(1).max(5).default(5)` — the outermost wrapper is `ZodDefault`. `generateSchemaExample` (line 142-146) unwraps ZodDefault to the inner `ZodNumber`, which returns `0` (line 128-129). The hint shows:

```json
"hp": 0
```

This actively misleads GLM. The prompt text says "Default to 5" but the JSON example shows 0. GLM may pick any value (like 4) rather than defaulting to 5.

**Fix for hp:** The ZodDefault handler should return `def.defaultValue?.()` directly (the actual default value 5) instead of unwrapping to the inner type and generating an example.

#### Flaw 3: `age` rewrite ("25" -> "Young adult")

This is a prompt compliance issue, not a code bug. The schema description says "Preserve explicit numeric ages exactly" but the `PLAYER_DRAFT_CONTRACT` (from `buildCharacterPromptContract`) talks about CharacterDraft's grouped structure (identity, profile, socialContext...) while the actual output schema is flat. This conflicting context may cause GLM to reinterpret fields rather than copying them verbatim.

Additionally, the contract includes `EXPLICIT_USER_FACTS_RULE`: "Copy authored names, ages, species, appearance..." — but this rule is abstract and competes with the grouped-structure vocabulary that doesn't mention the flat output fields at all.

### Secondary Finding: Prompt contract mismatch

`PLAYER_DRAFT_CONTRACT` talks about "identity, profile, socialContext, motivations, capabilities, state, loadout, startConditions, provenance" — these are CharacterDraft's NESTED field groups. But the LLM must output FLAT JSON matching `richCharacterSchema` (name, race, age, backgroundSummary, drives, etc.). GLM has to mentally map between two different structures with no explicit mapping table.

The `PLAYER_COMPATIBILITY_OUTPUT_RULES` constant (line 89-95 in generator.ts) provides such a mapping — but it's only included in `mapV2CardToCharacter`, NOT in `parseCharacterDescription` or `generateCharacter`.

### Verification via console.log

Line 196-203 of `generator.ts` already logs the rich fields after LLM response. Check backend logs during parsing to see actual GLM output values. If fields are present but empty/minimal, the schema hint is the root cause. If fields are absent, GLM is ignoring the schema entirely.

### Files Involved

| File | Issue |
|------|-------|
| `backend/src/ai/generate-object-safe.ts` L115-121 | `generateSchemaExample` drops descriptions for ZodArray |
| `backend/src/ai/generate-object-safe.ts` L142-146 | ZodDefault handler unwraps instead of using default value |
| `backend/src/ai/generate-object-safe.ts` L128-129 | ZodNumber returns 0 (misleading for hp) |
| `backend/src/character/generator.ts` L84-88 | `PLAYER_DRAFT_CONTRACT` creates structure mismatch |
| `backend/src/character/generator.ts` L89-95 | `PLAYER_COMPATIBILITY_OUTPUT_RULES` exists but unused in parse/generate |

---

## Bug 2: Page Lag During/After Character Generation

### Root Cause: Likely shadcn Textarea `field-sizing-content` in full-mode CharacterForm

**Confidence:** MEDIUM — no infinite loop found, `field-sizing-content` is known perf issue.

#### What was NOT found (eliminated causes):

1. **No infinite re-render loop** — `handleResolveStartingLocation` uses `characterDraft` in deps but is only called on button click, never in a useEffect. No useEffect depends on `characterDraft` except the initial `loadData` which depends only on `campaignId`.

2. **No cascading state updates** — `onChange={setCharacterDraft}` on CharacterCard does cause the entire page to re-render on every keystroke, but this is expected React behavior for controlled forms. The component tree is not deep enough to cause visible lag from re-renders alone.

3. **No toast-caused loops** — toasts are fire-and-forget, don't trigger state updates.

#### What WAS found:

**CharacterForm full-mode Textarea (line 105-110 in character-form.tsx):**

```tsx
<Textarea
  value={description}
  onChange={(e) => setDescription(e.target.value)}
  rows={12}
  className="min-h-[clamp(200px,20vh,360px)] resize-none bg-zinc-800/50 ..."
/>
```

This uses the shadcn `Textarea` component which applies `field-sizing-content` CSS. This property causes the browser to continuously recalculate the textarea height based on content, which is known to cause layout thrashing — especially during rapid content changes or when the page has many clamp() calculations.

**However:** The full-mode form is only shown when `characterDraft === null` (before parsing). After parsing, only the compact mode is rendered (no textarea). So this can't explain lag AFTER generation.

**CharacterCard CompactTextarea components:**

The card uses native `<textarea>` elements (line 56-80 of character-card.tsx) without `field-sizing-content`, plus native `<textarea>` elements for start conditions (line 400-405, 429-433). These are clean.

**Remaining suspect — excessive clamp() calculations:**

The CharacterCard has ~30+ CSS properties using `clamp()`. Each re-render (on every keystroke) forces the browser to recalculate all of these. Combined with the large component tree (TagEditor, StringListEditor, Select components, etc.), this could cause perceptible layout calculation lag.

**`onChange={setCharacterDraft}` re-renders the entire page:**

Every keystroke in any field calls `patch()` -> `update()` -> `onChange(next)` -> `setCharacterDraft(next)` on the page component. This re-renders:
- CharacterForm (compact mode)
- CharacterCard (full card with all sections)
- All TagEditor/StringListEditor instances
- Footer with save button

This is a lot of React reconciliation per keystroke. No memoization is used on any subcomponent.

#### CompactTextarea has unused `minH` prop

Lines 182 and 189 of character-card.tsx pass `minH="120px"` to `CompactTextarea`, but the component doesn't accept or use this prop. Not a bug per se, but the textareas are shorter than intended (72px instead of 120px).

### Files Involved

| File | Issue |
|------|-------|
| `frontend/components/character-creation/character-form.tsx` L105-110 | Shadcn Textarea with field-sizing-content (pre-parse only) |
| `frontend/components/character-creation/character-card.tsx` L104-106 | `update()` triggers full page re-render per keystroke |
| `frontend/components/character-creation/character-card.tsx` L56-80 | CompactTextarea ignores `minH` prop |
| `frontend/app/(non-game)/campaign/[id]/character/page.tsx` L313 | `onChange={setCharacterDraft}` — no memoization boundary |

## Common Pitfalls

### Pitfall 1: Zod wrapper introspection is fragile
**What goes wrong:** `generateSchemaExample` must handle every Zod wrapper type (Default, Effects, Pipeline, Nullable). Missing one means field descriptions/defaults are silently dropped.
**How to avoid:** Test `generateSchemaExample` output against actual schemas used in the codebase. Log the hint string during development.

### Pitfall 2: Prompt contract vs output schema mismatch
**What goes wrong:** The LLM receives vocabulary about one data structure (CharacterDraft groups) but must output another (flat richCharacterSchema). GLM models are particularly sensitive to this.
**How to avoid:** The prompt contract should reference the EXACT field names the LLM must output, not an internal data model's structure.

### Pitfall 3: Controlled form re-renders without memoization
**What goes wrong:** Lifting state to page level means every keystroke re-renders the entire component tree.
**How to avoid:** Either use `React.memo` on heavy subcomponents, or keep local state in CharacterCard and only propagate on blur/submit.

## Open Questions

1. **What does GLM actually return?** Check backend console output from the `console.log` on generator.ts:196-203 during a real parse call. This will confirm whether GLM returns empty fields or if fields are lost in transit.
2. **Is the lag during generation or during editing?** If during generation (while awaiting API response), it could be a long-running microtask blocking the main thread. If during editing (keystroke lag), it's the re-render issue.

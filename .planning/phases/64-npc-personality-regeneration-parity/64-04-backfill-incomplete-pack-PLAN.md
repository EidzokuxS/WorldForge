---
phase: 64-npc-personality-regeneration-parity
plan: 04
slug: backfill-incomplete-pack
type: execute
wave: 3
status: draft
depends_on: [64-02]
files_modified:
  - backend/src/scripts/backfill-personality.ts
  - backend/src/scripts/__tests__/backfill-personality.test.ts
autonomous: true
requirements: [P64-R6]
must_haves:
  truths:
    - "backfill-personality.ts accepts new CLI flag --mode=<default|incomplete-pack>; default remains the Phase 63 behavior (skip when personality.summary non-empty)"
    - "When --mode=incomplete-pack, the skip predicate uses the TIGHTENED legacy-summary-only signature: include the record if summary.trim() !== \"\" AND voice.trim() === \"\" AND decisionStyle.trim() === \"\" AND worldview.trim() === \"\" AND personalMythology.trim() === \"\". This is the exact pre-Phase-64 worldgen NPC signature. sampleLines and internalContradictions are DELIBERATELY EXCLUDED from the predicate (D-08 compliance: sampleLines may legitimately be empty for non-dialog NPCs; internalContradictions may be empty for simple supporting characters)."
    - "summary-empty records (personality.summary.trim() === \"\") are INCLUDED in both default and incomplete-pack modes — they have never been backfilled at all."
    - "Default mode predicate unchanged: skip if personality.summary.trim() non-empty. Phase 63 behavior preserved by default."
    - "All existing REVIEWS fixes remain intact: mandatory backup-before-write, side-effect-free dry-run, re-read-before-write safeguard, withPipelineRetry wrap, per-record error isolation, GLM-only provider (no OpenRouter fallback), config.json sentinel personalityBackfillComplete after clean full-campaign run, runWithTurnContext wrap for Phase 58 log correlation"
    - "parseArgs extended to recognize --mode with validation: allowed values {\"default\", \"incomplete-pack\"}; unknown value throws; default value (when flag absent) is \"default\""
    - "New test case: record has summary='X' + voice='' + decisionStyle='' + worldview='' + personalMythology='' (classic Phase-63-era worldgen NPC signature) → --mode=incomplete-pack INCLUDES it"
    - "New test case: record has summary='X' + voice='Y' + decisionStyle='Z' + worldview='W' + personalMythology='M' BUT sampleLines=[] → --mode=incomplete-pack SKIPS it (sampleLines not in predicate — D-08 compliance)"
    - "New test case: record has summary='X' + voice='Y' + decisionStyle='Z' + worldview='W' + personalMythology='M' BUT internalContradictions=[] → --mode=incomplete-pack SKIPS it (internalContradictions not in predicate)"
    - "New test case: record has fully-populated personality (all 4 core fields + sampleLines + internalContradictions populated) → --mode=incomplete-pack SKIPS it"
    - "New test case: record has empty summary → --mode=incomplete-pack INCLUDES it (summary-empty path always runs)"
    - "New test case: --mode=default unchanged — existing Phase 63 tests still pass (regression guard)"
    - "New test case: invalid --mode value (e.g. --mode=bogus) throws with a clear error"
    - "npm --prefix backend test -- run \"backfill-personality\" exits 0"
    - "npm --prefix backend run typecheck exits 0"
  artifacts:
    - path: backend/src/scripts/backfill-personality.ts
      provides: "Extended backfill script with tightened --mode=incomplete-pack predicate matching only the legacy summary-only signature (D-08 compliant)"
      contains: "incomplete-pack"
    - path: backend/src/scripts/__tests__/backfill-personality.test.ts
      provides: "Extended coverage: incomplete-pack include on legacy signature + SKIP on sampleLines-empty + SKIP on contradictions-empty + SKIP on full pack + include on summary-empty + invalid mode error + default-mode regression"
      contains: "incomplete-pack"
  key_links:
    - from: backend/src/scripts/backfill-personality.ts
      to: backend/src/scripts/backfill-personality.ts (internal)
      via: "shouldSkipRecord(record, mode) → uses hasLegacySummaryOnlyPack for incomplete-pack mode"
      pattern: "hasLegacySummaryOnlyPack"
    - from: backend/src/scripts/__tests__/backfill-personality.test.ts
      to: backend/src/scripts/backfill-personality.ts
      via: "runBackfill({ mode: 'incomplete-pack' }) drives new test cases"
      pattern: "incomplete-pack"
---

<objective>
Extend `backend/src/scripts/backfill-personality.ts` to accept `--mode=incomplete-pack` which targets records with the EXACT legacy summary-only signature: `summary` populated, but all 4 core prose sub-fields (`voice`, `decisionStyle`, `worldview`, `personalMythology`) empty. Deliberately excludes `sampleLines` and `internalContradictions` from the predicate per D-08 (sampleLines may be legitimately empty for non-dialog NPCs; contradictions may be empty for simple characters).

Purpose: Production campaigns created between Phase 63 merge and Phase 64 merge contain NPCs whose personality has only `summary` populated; the rest is empty. Default backfill skips these (they have a summary → Phase 63 considers them "done"). Without `--mode=incomplete-pack`, operator cannot repair them. Phase 64 Plan 02 fixes future worldgen; this plan fixes already-persisted gaps via the operator tool.

Codex B4 / B5 / B6 review resolution: the predicate is narrowed to the EXACT legacy signature. Records with a full pack except empty sampleLines (valid for silent/non-dialog NPCs) are NOT touched. Records with a full pack except empty contradictions (valid for simple characters) are NOT touched. Only the classic summary-only NPCs are repaired.

Output:
- Extended CLI parser (`--mode` flag + validation)
- Mode-aware skip predicate with tightened legacy-signature detection
- Extended test coverage (6+ new cases including 2 exclusion regressions)
- All Phase 63 REVIEWS safety properties preserved
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/64-npc-personality-regeneration-parity/64-CONTEXT.md
@.planning/phases/64-npc-personality-regeneration-parity/64-RESEARCH.md
@.planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md
@.planning/phases/64-npc-personality-regeneration-parity/64-REVIEWS.md
@.planning/phases/63-personality-interiority-model/63-05-backfill-PLAN.md
@CLAUDE.md
@backend/src/scripts/backfill-personality.ts
@backend/src/scripts/__tests__/backfill-personality.test.ts
@backend/src/character/ingestion/retry.ts
@backend/src/lib/logger-context.ts
@shared/src/types.ts

<interfaces>
<!-- Existing BackfillArgs (backfill-personality.ts:68-72) — EXTEND with mode field -->
```ts
export interface BackfillArgs {
  campaignFilter?: string;
  dryRun: boolean;
  batchSize: number;
  mode?: "default" | "incomplete-pack";  // <-- D-10 / D-11 addition
}
```

<!-- Existing hasExistingPersonality (backfill-personality.ts:114-116) — REPLACE with mode-aware gate -->
```ts
function hasExistingPersonality(record: CharacterRecord): boolean {
  return (record.identity.personality?.summary ?? "").trim().length > 0;
}
```

<!-- NEW predicate (B4 tightened): match ONLY the exact legacy summary-only signature. -->
<!-- D-08 compliance: sampleLines and internalContradictions are EXCLUDED from the predicate -->
<!-- because they can be legitimately empty for valid NPC types (non-dialog NPCs, simple characters). -->
```ts
/** Return true if the record carries the pre-Phase-64 legacy summary-only
 * personality signature: summary populated but ALL four core prose sub-fields
 * (voice, decisionStyle, worldview, personalMythology) empty.
 *
 * Deliberately does NOT check sampleLines.length === 0 (D-08: non-dialog NPCs
 * may legitimately have empty sampleLines) or internalContradictions.length === 0
 * (simple supporting NPCs may have no contradictions). Targeting those arrays
 * would falsely sweep in valid records.
 */
function hasLegacySummaryOnlyPack(record: CharacterRecord): boolean {
  const p = record.identity.personality;
  if (!p) return false;
  const hasSummary = (p.summary ?? "").trim() !== "";
  if (!hasSummary) return false;  // summary-empty is the default path's job
  return (
    (p.voice ?? "").trim() === "" &&
    (p.decisionStyle ?? "").trim() === "" &&
    (p.worldview ?? "").trim() === "" &&
    (p.personalMythology ?? "").trim() === ""
  );
}
```

<!-- Mode-aware gate: -->
```ts
function shouldSkipRecord(record: CharacterRecord, mode: "default" | "incomplete-pack"): boolean {
  const summary = (record.identity.personality?.summary ?? "").trim();
  if (mode === "incomplete-pack") {
    if (summary === "") return false;                          // summary-empty → always include
    if (hasLegacySummaryOnlyPack(record)) return false;        // legacy signature → include
    return true;                                                // anything else (full pack, partial-with-some-prose, etc.) → skip
  }
  // Default (Phase 63 behavior): skip only when summary is non-empty.
  return summary.length > 0;
}
```

<!-- CLI flag shape: -->
```
--mode default               # explicit default (Phase 63 behavior)
--mode incomplete-pack       # Phase 64 B4-tightened predicate
(absent)                     # defaults to "default"
```

<!-- Invalid flag handling: -->
```ts
if (current === "--mode") {
  const value = argv[index + 1];
  if (value !== "default" && value !== "incomplete-pack") {
    throw new Error(`Invalid --mode value: ${value}. Allowed: default, incomplete-pack`);
  }
  args.mode = value;
  index += 1;
  continue;
}
```
</interfaces>

<project_conventions>
- Preserve all Phase 63 REVIEWS fixes (#2, #4, #6, #7, #10, #11, #13) — do not regress
- GLM-only provider policy (feedback_openrouter_embargo.md NO EXCEPTIONS)
- Use Drizzle query builder
- `better-sqlite3` sync DB calls
- Tests colocated under `backend/src/scripts/__tests__/`
- Mode must flow through `runBackfill()` → `processCampaign()` → `processRow()` via the `BackfillArgs` carrier object so downstream logic reads `args.mode` consistently
</project_conventions>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pre-edit GitNexus impact analysis</name>
  <files>(no edits — impact analysis only)</files>
  <read_first>
    - backend/src/scripts/backfill-personality.ts (current shape)
    - .planning/phases/64-npc-personality-regeneration-parity/64-REVIEWS.md (Q1: pre-edit impact requirement for backfill predicate surface)
  </read_first>
  <action>
Run GitNexus impact analysis BEFORE implementation (per CLAUDE.md "MUST run impact analysis before editing any symbol" + Codex Q1):

1. `gitnexus_impact({target: "hasExistingPersonality", direction: "upstream"})` — expect local-only usage inside `backfill-personality.ts`. This predicate is internal to the script.

2. `gitnexus_impact({target: "processRow", direction: "upstream"})` — expect local-only usage inside `backfill-personality.ts`. Confirm no external callers.

3. `gitnexus_impact({target: "parseArgs", direction: "upstream"})` — same. Internal-only.

4. `gitnexus_impact({target: "runBackfill", direction: "upstream"})` — expect: main() entry in the same file + the existing test file. That's the public API for the script.

5. Report summary:
   - d=1 (WILL BREAK) list for each target — all should be local-only.
   - Risk level: MUST be LOW or MEDIUM.

If any symbol has unexpected external callers (e.g. `hasExistingPersonality` somehow exported and consumed elsewhere), halt for user review. Expected blast radius is entirely inside the script.
  </action>
  <verify>
    <automated>echo "impact analysis is evidence-only; no automated gate"</automated>
  </verify>
  <acceptance_criteria>
    - gitnexus_impact run for hasExistingPersonality, processRow, parseArgs, runBackfill — output captured
    - All targets return LOW or MEDIUM risk with local-only or test-only callers
    - Any HIGH/CRITICAL finding halts the plan for user review
  </acceptance_criteria>
  <done>Pre-edit impact analysis complete; blast radius bounded to script + its test; executor ready to implement.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add failing test cases for --mode=incomplete-pack with tightened predicate (RED)</name>
  <files>backend/src/scripts/__tests__/backfill-personality.test.ts</files>
  <read_first>
    - backend/src/scripts/__tests__/backfill-personality.test.ts (FULL — understand existing harness, mocks, and seed fixtures from Phase 63 Plan 05)
    - backend/src/scripts/backfill-personality.ts (FULL — know the existing `hasExistingPersonality` location and parseArgs shape)
    - .planning/phases/64-npc-personality-regeneration-parity/64-CONTEXT.md (D-10, D-11 — exact predicate)
    - .planning/phases/64-npc-personality-regeneration-parity/64-REVIEWS.md (B4 tightened predicate, D-08 exclusion of sampleLines)
    - .planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md (Wave 0 §backfill)
    - .planning/phases/63-personality-interiority-model/63-05-backfill-PLAN.md (Phase 63 test harness pattern)
  </read_first>
  <behavior>
    Seven new test cases added to the existing describe block. Existing tests must continue to pass.

    - Test I (B4 legacy signature INCLUDE): Seed a record with legacy summary-only signature — `personality = { summary: "Some summary", voice: "", decisionStyle: "", worldview: "", personalMythology: "", internalContradictions: [], sampleLines: [] }`. Run `runBackfill({ mode: "incomplete-pack", dryRun: false, batchSize: 5 })`. Assert: record is WRITTEN (predicate matches).

    - Test II (D-08 SKIP on sampleLines-only-empty): Seed a record with FULL prose but empty sampleLines — `personality = { summary: "X", voice: "Y", decisionStyle: "Z", worldview: "W", personalMythology: "M", internalContradictions: ["C1"], sampleLines: [] }`. Run `runBackfill({ mode: "incomplete-pack", ... })`. Assert: record is SKIPPED (empty sampleLines does NOT trigger incomplete-pack in tightened predicate — non-dialog NPC is valid).

    - Test III (D-08 SKIP on contradictions-only-empty): Seed a record with FULL prose + populated sampleLines but empty contradictions — `personality = { summary: "X", voice: "Y", decisionStyle: "Z", worldview: "W", personalMythology: "M", internalContradictions: [], sampleLines: ["L1", "L2"] }`. Run `runBackfill({ mode: "incomplete-pack", ... })`. Assert: record is SKIPPED (empty contradictions does NOT trigger — simple character is valid).

    - Test IV (SKIP on fully-populated pack): Seed with everything populated — all 4 prose fields + contradictions + sampleLines. Assert: record is SKIPPED.

    - Test V (summary-empty still included): Seed with empty summary. Run `runBackfill({ mode: "incomplete-pack", ... })`. Assert: record is WRITTEN (summary-empty path always runs).

    - Test VI (default mode regression): Seed the legacy summary-only record (same as Test I) + omit mode. Assert: record is SKIPPED (default mode = Phase 63 behavior).

    - Test VII (parseArgs invalid mode throws): Call `parseArgs(["node", "script", "--mode", "bogus"])`. Assert: throws with /Invalid --mode value/i.

    All seven tests FAIL before Task 3 implementation (Test VI may pass trivially but becomes a regression guard).
  </behavior>
  <action>
Extend `backend/src/scripts/__tests__/backfill-personality.test.ts` with a new `describe("--mode=incomplete-pack")` block adjacent to the existing Phase 63 describe block. Use the same test harness (mocks, seed helpers, in-memory SQLite or mocked db boundary — whichever the Phase 63 test uses).

Fixture helpers to add:

```ts
function recordWithLegacySummaryOnly(id: string, name: string): CharacterRecord {
  return {
    identity: {
      id,
      displayName: name,
      role: "Character",
      canonicalStatus: "original",
      baseFacts: { biography: "Short bio.", socialRole: [], hardConstraints: [] },
      personality: {
        summary: "A brief summary only, nothing else populated.",
        voice: "",
        decisionStyle: "",
        worldview: "",
        personalMythology: "",
        internalContradictions: [],
        sampleLines: [],
      },
      behavioralCore: { motives: [], pressureResponses: [], taboos: [], attachments: [], selfImage: "" },
      liveDynamics: { attachments: [], activeGoals: [], beliefDrift: [], currentStrains: [], earnedChanges: [] },
    },
    // ... other required CharacterRecord fields
  } as CharacterRecord;
}

function recordWithProseButEmptySampleLines(id: string, name: string): CharacterRecord {
  // Full prose fields + contradictions populated but sampleLines=[]
  // (D-08: valid shape for non-dialog NPCs)
}

function recordWithProseButEmptyContradictions(id: string, name: string): CharacterRecord {
  // Full prose + sampleLines populated but internalContradictions=[]
  // (Simple character with no internal conflict)
}

function recordWithFullPack(id: string, name: string): CharacterRecord {
  // Everything populated — all 4 prose fields + 1+ contradictions + 2+ sampleLines
}

function recordWithEmptySummary(id: string, name: string): CharacterRecord {
  // summary === ""
}
```

Read the existing test file to identify the shape of fixture helpers already present and the mock-generateObject pattern. Re-use them rather than duplicating.

Test skeleton for Test I (B4 INCLUDE):

```ts
describe("--mode=incomplete-pack (Phase 64 P64-R6)", () => {
  beforeEach(() => {
    // reset DB seed + mocks — reuse existing beforeEach if one exists
  });

  it("includes records with legacy summary-only signature (B4)", async () => {
    const recordId = "npc-legacy-1";
    await seedNpcRecord({
      campaignId: "test-campaign",
      id: recordId,
      name: "Legacy",
      characterRecord: recordWithLegacySummaryOnly(recordId, "Legacy"),
    });

    mockGenerateObject.mockResolvedValueOnce({
      object: {
        summary: "Populated summary",
        voice: "Populated voice description over fifteen chars.",
        decisionStyle: "Deliberative",
        worldview: "Order prevails",
        internalContradictions: ["Believes X, but acts Y because Z"],
        personalMythology: "The keeper of quiet truths",
        sampleLines: [
          "I told you the truth once and that must suffice.",
          "I will speak when the moment asks for it.",
        ],
      },
    });

    const result = await runBackfill({
      campaignFilter: "test-campaign",
      dryRun: false,
      batchSize: 5,
      mode: "incomplete-pack",
    });

    expect(result.written).toBe(1);
    expect(result.skipped).toBe(0);

    const updated = await readRecordFromTestDb("test-campaign", recordId);
    expect(updated.identity.personality.voice.length).toBeGreaterThan(0);
    expect(updated.identity.personality.sampleLines).toHaveLength(2);
  });
```

Test II (D-08 SKIP on sampleLines-only-empty — CRITICAL B4 fix):

```ts
  it("SKIPS records with full prose but empty sampleLines (D-08 compliance)", async () => {
    const recordId = "npc-silent-1";
    await seedNpcRecord({
      campaignId: "test-campaign",
      id: recordId,
      name: "Silent Shrinekeeper",
      characterRecord: recordWithProseButEmptySampleLines(recordId, "Silent Shrinekeeper"),
    });

    const result = await runBackfill({
      campaignFilter: "test-campaign",
      dryRun: false,
      batchSize: 5,
      mode: "incomplete-pack",
    });

    expect(result.skipped).toBe(1);
    expect(result.written).toBe(0);
    expect(mockGenerateObject).not.toHaveBeenCalled();  // predicate prevented the LLM call
  });
```

Test III (SKIP on contradictions-only-empty):

```ts
  it("SKIPS records with full prose but empty internalContradictions", async () => {
    const recordId = "npc-simple-1";
    await seedNpcRecord({
      campaignId: "test-campaign",
      id: recordId,
      name: "Simple Guard",
      characterRecord: recordWithProseButEmptyContradictions(recordId, "Simple Guard"),
    });

    const result = await runBackfill({
      campaignFilter: "test-campaign",
      dryRun: false,
      batchSize: 5,
      mode: "incomplete-pack",
    });

    expect(result.skipped).toBe(1);
    expect(result.written).toBe(0);
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });
```

Tests IV-VII follow similar patterns. See behavior block above for exact expectations.

**parseArgs export:** `parseArgs` is currently not exported. Test VII requires either making `parseArgs` an exported function (preferred — minor additive API change) OR invoking the CLI path via a subprocess (heavy, slow, avoid). Task 3 will add `export function parseArgs(...)`.

If `seedNpcRecord` / `readRecordFromTestDb` helpers don't already exist in the Phase 63 test file, add minimal ones that match the existing harness pattern.

Run the test. Tests I, II, III, IV, V, VII FAIL (mode arg not supported yet). Test VI may pass depending on current harness.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run "backfill-personality" 2>&1 | grep -Ec "(FAIL|failed|Invalid --mode)"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "incomplete-pack" backend/src/scripts/__tests__/backfill-personality.test.ts` returns ≥ 7 (7 new test cases reference the string)
    - `grep -c "recordWithLegacySummaryOnly\|recordWithProseButEmptySampleLines\|recordWithProseButEmptyContradictions\|recordWithFullPack\|recordWithEmptySummary" backend/src/scripts/__tests__/backfill-personality.test.ts` returns ≥ 5 (5 fixture helpers referenced)
    - `grep -n "SKIPS records with full prose but empty sampleLines" backend/src/scripts/__tests__/backfill-personality.test.ts` matches ≥ 1 (D-08 compliance test present)
    - `grep -n "SKIPS records with full prose but empty internalContradictions" backend/src/scripts/__tests__/backfill-personality.test.ts` matches ≥ 1
    - `grep -n "it(.*incomplete-pack\|legacy summary-only signature" backend/src/scripts/__tests__/backfill-personality.test.ts` returns ≥ 5 new `it()` blocks
    - `grep -n "parseArgs" backend/src/scripts/__tests__/backfill-personality.test.ts` returns ≥ 1 (Test VII uses it)
    - Running the test shows the 7 new tests FAILING (because `mode` is not yet a recognized arg — RED confirmed)
  </acceptance_criteria>
  <done>7 new test cases added including 2 D-08 exclusion regressions; RED confirmed; existing Phase 63 tests still pass unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Extend backfill-personality.ts with --mode flag + tightened legacy-signature predicate (GREEN)</name>
  <files>backend/src/scripts/backfill-personality.ts</files>
  <read_first>
    - backend/src/scripts/backfill-personality.ts (FULL — understand parseArgs, BackfillArgs, processRow, hasExistingPersonality flow)
    - backend/src/scripts/__tests__/backfill-personality.test.ts (just-updated — drives the implementation)
    - .planning/phases/64-npc-personality-regeneration-parity/64-CONTEXT.md (D-10, D-11, D-12)
    - .planning/phases/64-npc-personality-regeneration-parity/64-REVIEWS.md (B4 tightened predicate specification)
  </read_first>
  <action>
**Step A — Extend BackfillArgs (`:68-72`):**

```ts
export interface BackfillArgs {
  campaignFilter?: string;
  dryRun: boolean;
  batchSize: number;
  mode?: "default" | "incomplete-pack";   // Phase 64 B4
}
```

**Step B — Extend `parseArgs` (`:78-112`) + export it (for Test VII):**

Change `function parseArgs(...)` to `export function parseArgs(...)`.

Add the `--mode` branch:

```ts
if (current === "--mode") {
  const value = argv[index + 1];
  if (value !== "default" && value !== "incomplete-pack") {
    throw new Error(`Invalid --mode value: ${value}. Allowed: default, incomplete-pack`);
  }
  args.mode = value;
  index += 1;
  continue;
}
```

Place alongside the existing `--dry-run` / `--campaign` / `--batch-size` branches. Default for `args.mode` remains `undefined` — the gate function treats undefined as "default" (explicit in the gate).

**Step C — Replace `hasExistingPersonality` with tightened legacy-signature predicate + mode-aware gate:**

Delete:
```ts
function hasExistingPersonality(record: CharacterRecord): boolean {
  return (record.identity.personality?.summary ?? "").trim().length > 0;
}
```

Replace with the TIGHTENED predicate (B4):

```ts
/** Match ONLY the legacy summary-only signature (pre-Phase-64 worldgen NPCs):
 * summary populated, ALL 4 core prose sub-fields empty. Excludes sampleLines
 * and internalContradictions from the predicate because those arrays can be
 * legitimately empty for non-dialog NPCs (D-08) or simple supporting
 * characters with no internal conflict. */
function hasLegacySummaryOnlyPack(record: CharacterRecord): boolean {
  const p = record.identity.personality;
  if (!p) return false;
  const hasSummary = (p.summary ?? "").trim() !== "";
  if (!hasSummary) return false;
  return (
    (p.voice ?? "").trim() === "" &&
    (p.decisionStyle ?? "").trim() === "" &&
    (p.worldview ?? "").trim() === "" &&
    (p.personalMythology ?? "").trim() === ""
  );
}

function shouldSkipRecord(
  record: CharacterRecord,
  mode: "default" | "incomplete-pack" = "default",
): boolean {
  const summary = (record.identity.personality?.summary ?? "").trim();
  if (mode === "incomplete-pack") {
    if (summary.length === 0) return false;                          // summary-empty → always include
    if (hasLegacySummaryOnlyPack(record)) return false;              // legacy signature → include
    return true;                                                      // anything else (full pack, partial-with-some-prose) → skip
  }
  // default (Phase 63 behavior)
  return summary.length > 0;
}
```

**Step D — Wire mode into `processRow` + thread from `processCampaign` / `runBackfill`:**

In `processRow` signature, add a `mode` param:

```ts
async function processRow(
  campaignId: string,
  row: CharacterRow,
  model: ReturnType<typeof createModel>,
  temperature: number,
  maxOutputTokens: number,
  dryRun: boolean,
  mode: "default" | "incomplete-pack" = "default",
): Promise<RowResult> {
  const rawSnapshot = row.characterRecord;
  const parsedRecord = JSON.parse(rawSnapshot) as CharacterRecord;

  if (shouldSkipRecord(parsedRecord, mode)) {
    log.event("backfill.skip", {
      campaignId,
      recordId: row.id,
      kind: row.kind,
      reason: mode === "incomplete-pack" ? "not_legacy_signature" : "personality_present",
      mode,
    });
    return { status: "skipped" };
  }
  // ... existing body unchanged
}
```

In `processCampaign`, thread `args.mode` through:

```ts
processRow(
  campaignId,
  row,
  model,
  temperature,
  maxOutputTokens,
  args.dryRun,
  args.mode ?? "default",   // <-- thread mode
),
```

**Step E — Log mode at campaign_start (observability):**

```ts
log.event("backfill.campaign_start", {
  campaignId,
  totalRecords: rows.length,
  dryRun: args.dryRun,
  batchSize: args.batchSize,
  mode: args.mode ?? "default",   // <-- new
});
```

**Step F — Update any lingering references to `hasExistingPersonality`:**

Grep: `grep -n "hasExistingPersonality" backend/src/scripts/backfill-personality.ts`. Expected: 0 matches after rename. If any stragglers exist, update them to `shouldSkipRecord(record, args.mode ?? "default")` or to `hasLegacySummaryOnlyPack` depending on context.

**Step G — Verify REVIEWS safety scaffolding intact:**

No changes to:
- `withPipelineRetry("backfill", ...)` wrapper
- `writeBackupFile` call path (real-run only, backup before update)
- `latestRow.characterRecord !== rawSnapshot` re-read-before-write guard
- `appendBacklogEntry` on failure
- `writeCompletionSentinel` at clean campaign completion
- `runWithTurnContext` wrapping
- GLM-only provider resolution

The ONLY semantic changes are:
1. `mode` field added to `BackfillArgs`
2. `--mode` branch added to `parseArgs`
3. `parseArgs` export added
4. `hasExistingPersonality` renamed/refactored into `hasLegacySummaryOnlyPack` + `shouldSkipRecord`
5. `processRow` signature gets a `mode` param; gate uses `shouldSkipRecord`
6. `processCampaign` threads `args.mode` to `processRow`
7. One additional field in `backfill.campaign_start` log event
8. Comment/docstring additions referencing B4 / D-10 / D-11 / Phase 64

Everything else is UNCHANGED.

**Step H — Update the doc-comment header:**

At the top of `backfill-personality.ts`, add to the usage comment:

```
 * Usage:
 *   npx tsx backend/src/scripts/backfill-personality.ts [--campaign <id>] [--dry-run] [--batch-size N] [--mode default|incomplete-pack]
 *   --mode default (default): Phase 63 behavior. Skip when personality.summary is non-empty.
 *   --mode incomplete-pack (Phase 64 B4): Target records with the exact legacy summary-only
 *     signature — summary populated but voice/decisionStyle/worldview/personalMythology ALL empty.
 *     sampleLines and internalContradictions are NOT part of the predicate (D-08: non-dialog NPCs
 *     may legitimately have empty sampleLines; simple characters may have no contradictions).
```

**Verify:**
```
npm --prefix backend test -- run "backfill-personality"
```
All existing Phase 63 tests PLUS the 7 new Phase 64 tests pass.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run "backfill-personality" && npm --prefix backend run typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "incomplete-pack" backend/src/scripts/backfill-personality.ts` returns ≥ 6 (BackfillArgs type, parseArgs branch, predicate function, shouldSkipRecord, doc-comment, log field)
    - `grep -c "hasLegacySummaryOnlyPack" backend/src/scripts/backfill-personality.ts` returns ≥ 2 (definition + use)
    - `grep -c "shouldSkipRecord" backend/src/scripts/backfill-personality.ts` returns ≥ 2
    - `grep "export function parseArgs" backend/src/scripts/backfill-personality.ts` matches 1 line
    - Predicate verbatim: `grep -c "personalMythology" backend/src/scripts/backfill-personality.ts` ≥ 1 inside the predicate function body
    - Predicate EXCLUDES sampleLines + contradictions: `grep -A 20 "function hasLegacySummaryOnlyPack" backend/src/scripts/backfill-personality.ts | grep -c "sampleLines\|internalContradictions"` returns 0 (those words do NOT appear inside the predicate body — D-08 compliance check)
    - `grep -n "withPipelineRetry" backend/src/scripts/backfill-personality.ts` still returns ≥ 1 (REVIEWS fix preserved)
    - `grep -n "writeBackupFile" backend/src/scripts/backfill-personality.ts` still returns ≥ 2 (REVIEWS fix preserved)
    - `grep -n "writeCompletionSentinel\|personalityBackfillComplete" backend/src/scripts/backfill-personality.ts` still returns ≥ 2
    - `grep -n "runWithTurnContext" backend/src/scripts/backfill-personality.ts` still returns ≥ 1
    - `grep -n "appendBacklogEntry\|BACKLOG" backend/src/scripts/backfill-personality.ts` still returns ≥ 2
    - `grep -ic "openrouter" backend/src/scripts/backfill-personality.ts` returns 0 (GLM-only preserved)
    - `npm --prefix backend test -- run "backfill-personality"` exits 0 — all existing Phase 63 tests + 7 new Phase 64 tests green
    - `npm --prefix backend run typecheck` exits 0
  </acceptance_criteria>
  <done>--mode flag wired; TIGHTENED legacy-signature predicate active (excludes sampleLines + contradictions per D-08); all Phase 63 REVIEWS safety intact; 7 new tests green; regression suite green.</done>
</task>

<task type="auto">
  <name>Task 4: Post-implementation verification + scope check</name>
  <files>(no edits — verification only)</files>
  <read_first>
    - backend/src/scripts/backfill-personality.ts (just-extended)
    - backend/src/scripts/__tests__/backfill-personality.test.ts (just-extended)
  </read_first>
  <action>
1. Run full backfill test suite:
   ```
   npm --prefix backend test -- run "backfill-personality"
   ```
   Expect: all Phase 63 tests + 7 new Phase 64 tests pass.

2. Run full backend suite to catch cross-test collisions:
   ```
   npm --prefix backend test -- run
   ```

3. Typecheck:
   ```
   npm --prefix backend run typecheck
   ```

4. Run `gitnexus_detect_changes({scope: "all"})` — confirm only 2 files changed matching `files_modified`.

5. Scope verification:
   - `git diff backend/src/scripts/backfill-personality.ts` — review diff. Confirm: no change to retry wrapping, backup file logic, sentinel logic, runWithTurnContext, BACKLOG write, provider resolution.
   - `grep -c "OpenRouter" backend/src/scripts/backfill-personality.ts` returns 0 (no fallback path introduced).
   - `grep -A 20 "function hasLegacySummaryOnlyPack" backend/src/scripts/backfill-personality.ts | grep -c "sampleLines\|internalContradictions"` returns 0 (D-08 exclusion verified by structure).
  </action>
  <verify>
    <automated>npm --prefix backend test -- run && npm --prefix backend run typecheck</automated>
  </verify>
  <acceptance_criteria>
    - Full backend suite exits 0
    - Typecheck exits 0
    - gitnexus_detect_changes shows exactly 2 files changed
    - No Phase 63 REVIEWS-fix assertion was weakened (retry, backup, re-read, sentinel, BACKLOG, runWithTurnContext, GLM-only, side-effect-free dry-run)
    - `grep -ic "openrouter" backend/src/scripts/backfill-personality.ts` returns 0
    - Predicate body excludes sampleLines and internalContradictions (D-08 compliance structural check)
  </acceptance_criteria>
  <done>Extension lands without regression; full suite green; Phase 63 safety scaffolding intact; D-08 compliance structurally verified; P64-R6 covered.</done>
</task>

</tasks>

<verification>
- `npm --prefix backend test -- run "backfill-personality"` exits 0 — all existing tests + 7 new incomplete-pack tests pass.
- `npm --prefix backend test -- run` exits 0 — full backend suite green.
- `npm --prefix backend run typecheck` exits 0.
- `backend/src/scripts/backfill-personality.ts` accepts `--mode default|incomplete-pack`; unknown values throw.
- `shouldSkipRecord` is mode-aware; `hasLegacySummaryOnlyPack` implements the TIGHTENED B4 predicate verbatim (summary non-empty AND ALL 4 prose fields empty — sampleLines and contradictions EXCLUDED).
- All Phase 63 REVIEWS fixes intact.
- No OpenRouter fallback introduced anywhere.
</verification>

<success_criteria>
- Operator can run `npm --prefix backend run backfill:personality -- --mode incomplete-pack --campaign <id> --dry-run` to preview legacy-signature repair.
- Valid non-dialog NPCs (prose fields populated + empty sampleLines) are NOT swept up by backfill — D-08 compliance.
- Valid simple characters (prose fields populated + empty contradictions) are NOT swept up — same rationale.
- Default mode unchanged; prior operator workflows continue to work.
- P64-R6 covered.
</success_criteria>

<requirement_coverage>
- **P64-R6** — `backfill-personality.ts --mode=incomplete-pack` implements the B4-tightened legacy-signature predicate (D-10 + D-11 opt-in + D-12 mandatory backup carry-over + idempotency). 7 new tests cover: INCLUDE on legacy signature, SKIP on sampleLines-only-empty (D-08), SKIP on contradictions-only-empty, SKIP on full pack, INCLUDE on summary-empty, default-mode regression, invalid-mode error. Existing Phase 63 tests still green.
</requirement_coverage>

<estimates>
- Effort: ~45-50 min Claude execution (impact analysis + tightened predicate extract + arg plumbing + 7 tests + regression audit).
- Test runtime: < 15s for full backfill suite.
- Execution: Wave 3, depends on Plan 02 (Plan 02 must land so worldgen stops emitting new legacy signatures).
</estimates>

<risks>
- **R1 — Inadvertent weakening of Phase 63 REVIEWS safety.** Any edit to the script could regress backup/retry/re-read/sentinel/BACKLOG/runWithTurnContext flow. **Mitigation:** Task 4 runs grep/diff checks for each safety property.
- **R2 — parseArgs export breaks internal usage.** Exporting `parseArgs` changes it from internal to public API. **Mitigation:** internal callers (main()) stay identical; export is additive.
- **R3 — Test harness doesn't support mode field in BackfillArgs.** Phase 63 test harness may have defined a local BackfillArgs type. **Mitigation:** read the test file first and audit. Update test harness types if needed.
- **R4 — D-12 mandatory backup.** Backup is ALREADY mandatory in Phase 63 path; `writeBackupFile` is called before every `updateRecordRow`. The incomplete-pack path shares the same write path, so backup is automatic.
- **R5 — Predicate false-negative risk.** If a user's production database contains records where ONE of the 4 core prose fields is populated but the other 3 are empty (partial backfill?), the tightened predicate SKIPS them (they are not the legacy signature). This is the correct behavior — we only repair the exact legacy signature. Operator can use default mode or manual SQL for edge cases.
</risks>

<output>
After completion, create `.planning/phases/64-npc-personality-regeneration-parity/64-04-SUMMARY.md` with:
- Tasks completed (impact analysis → RED → GREEN → verify)
- Files modified (2)
- Diff summary highlighting: BackfillArgs extension, parseArgs export + mode branch, hasLegacySummaryOnlyPack + shouldSkipRecord, processRow threading
- B4 tightened predicate evidence: predicate body excludes sampleLines + internalContradictions (grep proof)
- D-08 compliance evidence: Tests II and III prove the predicate correctly skips sampleLines-empty and contradictions-empty records
- Phase 63 REVIEWS safety preservation checklist (each property name + grep evidence)
- Test output (Phase 63 tests + 7 new tests green)
- gitnexus_detect_changes digest (2 files)
- Operator runbook addition: `npm --prefix backend run backfill:personality -- --mode incomplete-pack --campaign <id> --dry-run`
</output>
</content>
</invoke>

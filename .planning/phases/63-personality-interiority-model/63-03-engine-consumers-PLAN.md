---
phase: 63-personality-interiority-model
plan: 03
slug: engine-consumers
type: execute
wave: 3
status: draft
depends_on: [63-01, 63-02]
files_modified:
  - backend/src/engine/prompt-assembler.ts
  - backend/src/engine/npc-agent.ts
  - backend/src/engine/npc-offscreen.ts
  - backend/src/engine/reflection-agent.ts
  - backend/src/engine/reflection-tools.ts
  - shared/src/types.ts
  - backend/src/routes/schemas.ts
  - backend/src/character/record-adapters.ts
  - backend/src/character/__tests__/record-adapters.attachments-bridge.test.ts
  - backend/src/engine/__tests__/prompt-assembler.personality.test.ts
  - backend/src/engine/__tests__/npc-agent.personality.test.ts
  - backend/src/engine/__tests__/npc-offscreen.personality.test.ts
  - backend/src/engine/__tests__/reflection-agent.personality.test.ts
  - backend/src/engine/__tests__/npc-agent.test.ts
  - backend/src/engine/__tests__/npc-offscreen.test.ts
autonomous: true
requirements: [P63-R2, P63-R8]
must_haves:
  truths:
    - "buildRuntimeIdentityLines emits a Personality: block (summary/voice/decision-style/worldview/internal-contradictions/personal-mythology/sample-lines) and no longer emits motives/pressure/taboos"
    - "attachments line in the Personality block reads from liveDynamics.attachments (not behavioralCore.attachments)"
    - "npc-agent.ts:425-442, npc-offscreen.ts:79-93, reflection-agent.ts:137,151 all consume personality.* (not behavioralCore.{motives,pressureResponses,taboos})"
    - "promote_identity_change reflection tool writes to identity.personality.* and liveDynamics.attachments"
    - "Legacy records (no identity.personality) cause the Personality: block to be omitted entirely (per RESEARCH §11 default)"
    - "liveDynamics gains attachments: string[] in shared types + Zod"
  artifacts:
    - path: backend/src/engine/prompt-assembler.ts
      provides: "buildPersonalityLines helper + Personality: section in formatted runtime identity output"
      contains: "Personality"
    - path: backend/src/engine/npc-agent.ts
      provides: "Personality lines replace motives/pressure/taboos"
    - path: backend/src/engine/npc-offscreen.ts
      provides: "Same personality replacement"
    - path: backend/src/engine/reflection-agent.ts
      provides: "Reflection prompt + promote_identity_change hint reference personality"
    - path: backend/src/engine/reflection-tools.ts
      provides: "promote_identity_change writes personality + liveDynamics.attachments"
    - path: shared/src/types.ts
      provides: "CharacterIdentityLiveDynamics.attachments: string[]"
      contains: "attachments"
    - path: backend/src/engine/__tests__/prompt-assembler.personality.test.ts
      provides: "Snapshot/assertion: Personality block emitted; behavioralCore Behavioral Core line absent"
  key_links:
    - from: backend/src/engine/prompt-assembler.ts
      to: shared/src/types.ts
      via: "buildRuntimeIdentityLines reads identity.personality + liveDynamics.attachments"
      pattern: "personality"
    - from: backend/src/engine/reflection-tools.ts
      to: shared/src/types.ts
      via: "promote_identity_change tool input schema accepts personality + attachments patches"
      pattern: "promote_identity_change"
---

<objective>
Switch every runtime engine consumer from `behavioralCore.{motives,pressureResponses,taboos}` to `identity.personality.*`.

Purpose: After 63-02, every newly-ingested character has a populated `personality` block, but the engine still reads the legacy fields. Until this plan ships, NPC turns + reflection produce blank prompts on personality-only records (and the player prompt still shows the old Behavioral Core block instead of the new Personality block). This is the load-bearing substitution: 4 prompt-emitting files + 1 reflection write-tool, plus snapshot tests that pin the new shape.

Per RESEARCH §11 default, legacy records (no `identity.personality`) cause the `Personality:` block to be omitted entirely (rendering nothing rather than a misleading partial block). The backfill script in 63-05 closes the gap for pre-existing characters.

`attachments` migrates from `behavioralCore.attachments` to `liveDynamics.attachments` (RESEARCH §2.5 + §11 question 2 default = "shadow for one phase"). The Personality block reads `liveDynamics.attachments`; legacy `normalizeBehavioralCore` continues to populate `behavioralCore.attachments` from `liveDynamics.attachments ?? behavioralCore.attachments` so any unconverted legacy reader keeps working until cleanup.

Output:
- `prompt-assembler.ts` emits `Personality:` block; `Behavioral Core:` block removed; `attachments` reads from `liveDynamics`
- `npc-agent.ts`, `npc-offscreen.ts`, `reflection-agent.ts`, `reflection-tools.ts` all switched
- Reflection tool `promote_identity_change` writes personality + `liveDynamics.attachments`
- `liveDynamics.attachments: string[]` added to shared types + Zod
- Snapshot tests pin the new shape (4 new files + 2 updated)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/63-personality-interiority-model/63-CONTEXT.md
@.planning/phases/63-personality-interiority-model/63-RESEARCH.md
@.planning/phases/63-personality-interiority-model/63-VALIDATION.md
@.planning/phases/63-personality-interiority-model/63-01-foundation-PLAN.md
@.planning/phases/63-personality-interiority-model/63-02-ingestion-pipeline-PLAN.md
@CLAUDE.md
@backend/src/engine/prompt-assembler.ts
@backend/src/engine/npc-agent.ts
@backend/src/engine/npc-offscreen.ts
@backend/src/engine/reflection-agent.ts
@backend/src/engine/reflection-tools.ts

<interfaces>
<!-- Prompt-assembler change (RESEARCH §3.1): -->
```ts
// backend/src/engine/prompt-assembler.ts:1394-1402 (current Behavioral Core block) — REPLACED with:
function buildPersonalityLines(personality?: CharacterPersonality, attachments?: string[]): string {
  if (!personality) return "";
  const parts = [
    personality.summary ? `summary="${personality.summary}"` : null,
    personality.voice ? `voice="${personality.voice}"` : null,
    personality.decisionStyle ? `decision-style="${personality.decisionStyle}"` : null,
    personality.worldview ? `worldview="${personality.worldview}"` : null,
    personality.internalContradictions?.length ? `internal-contradictions=[${personality.internalContradictions.map(s => `"${s}"`).join(",")}]` : null,
    personality.personalMythology ? `personal-mythology="${personality.personalMythology}"` : null,
    personality.sampleLines?.length ? `sample-lines=[${personality.sampleLines.map(s => `"${s}"`).join(",")}]` : null,
    attachments?.length ? `attachments=[${attachments.map(s => `"${s}"`).join(",")}]` : null,
  ].filter(Boolean);
  return parts.join("; ");
}

// In buildRuntimeIdentityLines (~line 1413-1418), the formatted block:
const personalityLine = buildPersonalityLines(identity.personality, liveDynamics?.attachments);
const formatted = [
  baseFactsLine ? `${indent}Base Facts: ${baseFactsLine}` : null,
  personalityLine ? `${indent}Personality: ${personalityLine}` : null,
  selfImage ? `${indent}self-image="${selfImage}"` : null,                    // promoted from old behavioralCore
  hardConstraints?.length ? `${indent}hard-constraints=[${...}]` : null,
  liveDynamicsLine ? `${indent}Live Dynamics: ${liveDynamicsLine}` : null,
].filter(Boolean).join("\n");
// Note: per RESEARCH §11 default, when personality is undefined the section is OMITTED — no degraded fallback.
```

<!-- npc-agent.ts:425-442 substitution (RESEARCH §3.4): -->
```ts
// CURRENT (replace):
formatNpcIdentityList("Enduring motives", behavioralCore?.motives ?? []),
formatNpcIdentityList("Pressure responses", behavioralCore?.pressureResponses ?? []),
formatNpcIdentityList("Taboos", behavioralCore?.taboos ?? []),

// REPLACEMENT:
formatNpcIdentityList("Personality summary", personality?.summary ? [personality.summary] : []),
formatNpcIdentityList("Voice", personality?.voice ? [personality.voice] : []),
formatNpcIdentityList("Internal contradictions", personality?.internalContradictions ?? []),
formatNpcIdentityList("Sample lines", personality?.sampleLines ?? []),
// Keep self-image line as-is (still on behavioralCore.selfImage).
```

<!-- liveDynamics.attachments migration (RESEARCH §2.5): -->
```ts
// shared/src/types.ts CharacterIdentityLiveDynamics — add:
attachments: string[];

// backend/src/routes/schemas.ts characterIdentityLiveDynamicsSchema — add:
attachments: z.array(z.string()).default([]),

// backend/src/character/record-adapters.ts normalizeBehavioralCore (legacy fallback):
attachments: liveDynamics?.attachments ?? behavioralCore?.attachments ?? [],
// (preserves legacy reader behavior during migration window)
```

<!-- reflection-tools.ts promote_identity_change (RESEARCH §3.4 last bullet): -->
```ts
// Tool input schema — switch from behavioralCore.{motives,pressureResponses,taboos,attachments,selfImage}
// to: personality (Partial<CharacterPersonality>), liveDynamicsAttachments (string[]),
//     selfImage (kept on behavioralCore.selfImage), hardConstraints (kept on baseFacts.hardConstraints).
// Write path: identity.personality = mergeDefined(identity.personality ?? blankPersonality(), patch.personality);
//             identity.liveDynamics.attachments = patch.liveDynamicsAttachments ?? identity.liveDynamics.attachments;
```
</interfaces>

<project_conventions>
- All AI tool input schemas via Zod (CLAUDE.md).
- Snapshot tests via Vitest's built-in `expect(output).toMatchInlineSnapshot()` or string-equal assertions — RESEARCH §9.1 doesn't mandate inline snapshots; assertion-based is fine and easier to review in PRs.
- Per RESEARCH §11 question 1 default: legacy records emit NO Personality block (skip entirely). Do NOT emit a degraded "(legacy — see behavioralCore)" placeholder. Skipping makes the gap visible to the user, who then knows to run backfill.
- `liveDynamics.attachments` is the single source of truth; `behavioralCore.attachments` is read-only shadow during the migration window via `normalizeBehavioralCore` (already in place from 63-01).
- Prompt assembler call sites at lines 503 (player) and 814 (NPC) auto-pick up the change via the helper — no extra edits there.
</project_conventions>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pre-task gitnexus impact analysis</name>
  <files>(no edits — analysis only)</files>
  <action>
Per CLAUDE.md, before any edits:
- `gitnexus_impact({target: "buildRuntimeIdentityLines", direction: "upstream"})`
- `gitnexus_impact({target: "promote_identity_change", direction: "upstream"})`
- `gitnexus_context({name: "buildRuntimeIdentityLines"})`
- `gitnexus_context({name: "formatNpcIdentityList"})` (used by npc-agent + npc-offscreen)
- `gitnexus_impact({target: "CharacterIdentityLiveDynamics", direction: "upstream"})` — for the `attachments` migration

Capture all d=1 readers. Confirm against RESEARCH §3.4 + §8.1. HIGH risk acknowledged — runtime hot path.

If any tool reports stale index → `npx gitnexus analyze` first.
  </action>
  <verify>
    <automated>node -e "console.log('gitnexus impact captured for: buildRuntimeIdentityLines, promote_identity_change, formatNpcIdentityList, CharacterIdentityLiveDynamics')"</automated>
  </verify>
  <done>Reader sets captured; HIGH risk acknowledged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: liveDynamics.attachments — types + Zod + read-time fallback bridge (REVIEWS fix #2)</name>
  <files>
shared/src/types.ts
backend/src/routes/schemas.ts
backend/src/character/record-adapters.ts
  </files>
  <action>
**REVIEWS consensus blocker #2 (Codex HIGH):** The original plan shadowed `behavioralCore.attachments` FROM `liveDynamics.attachments` (one-way, WRONG direction). New consumers READ `liveDynamics.attachments` but LEGACY records only have `behavioralCore.attachments` → legacy records would lose attachments in new prompt output.

**Fix:** Bridge direction is `liveDynamics.attachments ← behavioralCore.attachments` (new reads ← old data) during normalization. Durable carry-forward for legacy records happens in 63-05 backfill.

**NEW: Add test file `backend/src/character/__tests__/record-adapters.attachments-bridge.test.ts`** with 4 cases locking the bridge invariant:
- Legacy record with only `behavioralCore.attachments = ["X","Y"]` → normalized `liveDynamics.attachments === ["X","Y"]`.
- Record with both → `liveDynamics.attachments` wins (`["B"]`).
- Record with neither → `[]`.
- New-shape record (only `liveDynamics.attachments`) → unchanged.

Per RESEARCH §2.5 + §11 question 2 default ("shadow for one phase"):

1. `shared/src/types.ts`:
   - In `CharacterIdentityLiveDynamics` (~line 302-307), add `attachments: string[];` (REQUIRED — Zod default `[]` provides safe deserialization).

2. `backend/src/routes/schemas.ts`:
   - In `characterIdentityLiveDynamicsSchema` (~line 396-401), add `attachments: z.array(z.string()).default([])`.

3. `backend/src/character/record-adapters.ts` — **load-bearing bridge fix (REVIEWS #2):**
   - In `normalizeCharacterDraftRecord` where `liveDynamics` is assembled, use the read-time fallback so NEW consumers see legacy data:
     ```ts
     liveDynamics: {
       ...normalizeLiveDynamics(record),
       attachments: record?.identity?.liveDynamics?.attachments
                 ?? record?.identity?.behavioralCore?.attachments
                 ?? [],
     }
     ```
     LOAD-BEARING: prompt-assembler (Task 3) and reflection-tools (Task 6) both read from `liveDynamics.attachments`; legacy records only have `behavioralCore.attachments`. Without this fallback, legacy records render blank attachments in every new prompt.
   - In `normalizeBehavioralCore` (~line 154 area), also update the `attachments` line to the same fallback expression:
     ```ts
     attachments: liveDynamics?.attachments ?? behavioralCore?.attachments ?? [],
     ```
   - Both normalizers share precedence: `liveDynamics.attachments` wins when present; `behavioralCore.attachments` is the legacy fallback.

4. Create `backend/src/character/__tests__/record-adapters.attachments-bridge.test.ts` per the behavior cases above.

**Note on 63-05 carry-forward:** 63-05 Task 2 includes a dedicated step to write `liveDynamics.attachments = behavioralCore.attachments` alongside the personality backfill so legacy records get PERMANENT migration (not just read-time fallback). This plan only handles the normalizer bridge; 63-05 handles the durable DB update.

This task lands FIRST so subsequent tasks (prompt-assembler reading `liveDynamics.attachments`, reflection-tools writing it) compile cleanly AND legacy records render correctly.
  </action>
  <verify>
    <automated>npm --prefix backend run typecheck && npm --prefix backend test -- run "record-adapters.attachments-bridge"</automated>
  </verify>
  <done>Backend typecheck green; `liveDynamics.attachments` typed end-to-end; legacy `behavioralCore.attachments` flows into new path via read-time fallback; REVIEWS fix #2 test suite green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: prompt-assembler Personality block + snapshot test (P63-R2)</name>
  <files>
backend/src/engine/prompt-assembler.ts
backend/src/engine/__tests__/prompt-assembler.personality.test.ts
  </files>
  <behavior>
Test cases (per RESEARCH §3.3 + §9.1):
- Given a record with populated `identity.personality`, `buildRuntimeIdentityLines()` output contains a line starting with `Personality: summary="..."` and contains `voice=`, `decision-style=`, `worldview=`, `internal-contradictions=`, `personal-mythology=`, `sample-lines=`.
- The output does NOT contain `Behavioral Core:` or `motives=` or `pressure=` or `taboos=`.
- Given a record where `identity.personality` is undefined, the output omits the `Personality:` line entirely (RESEARCH §11 default).
- `attachments=[...]` line reads from `liveDynamics.attachments` not `behavioralCore.attachments` (assert by setting only `liveDynamics.attachments`).
- **REVIEWS fix #2 bridge coverage:** Given a legacy record with only `behavioralCore.attachments = ["legacy-link"]` (no `liveDynamics.attachments`), after normalization the prompt output still contains `attachments=["legacy-link"]` — proves the read-time fallback flows legacy data into the new prompt path.
- `self-image` still emits when `behavioralCore.selfImage` is set, even when personality is empty.
- `hard-constraints` still emits from `baseFacts.hardConstraints`.
  </behavior>
  <action>
1. Edit `backend/src/engine/prompt-assembler.ts`:
   - Add `buildPersonalityLines(personality, attachments)` helper per the interface contract above. Place it adjacent to existing `formatIdentityField` and `buildRuntimeIdentityLines` helpers.
   - Modify `buildRuntimeIdentityLines()` (lines 1375-1420 region):
     - Remove the current `behavioralCore` block at lines 1394-1402 (the 5-line array of `formatIdentityField("motives", ...)`, `formatIdentityField("pressure", ...)`, etc.).
     - Replace with a call to `buildPersonalityLines(identity.personality, identity.liveDynamics?.attachments)`.
     - Update the `formatted` block at lines 1413-1418 to emit `Personality: …` instead of `Behavioral Core: …`. Use the structure shown in the interface contract above.
     - Keep the `Base Facts:` line at index 0.
     - `self-image` and `hard-constraints` continue to render — relocate them outside the Personality block as their own lines (or inline at the end of Personality — match RESEARCH §3.1 layout: Personality section, then `self-image:` line, then `attachments:` line, then `hard-constraints:` line).
   - When `buildPersonalityLines` returns empty (legacy record), DO NOT emit a `Personality:` line — skip entirely.
2. Confirm call sites at lines 503 (player) and 814 (NPC) keep working — no signature change to the public helper, only the internal block.
3. Create `backend/src/engine/__tests__/prompt-assembler.personality.test.ts`. Build a `makeRecord(overrides)` factory that produces a minimal valid record; assert each behavior bullet via string matchers.
  </action>
  <verify>
    <automated>npm --prefix backend run typecheck && npm --prefix backend test -- run "prompt-assembler.personality"</automated>
  </verify>
  <done>Backend typecheck green; new Vitest passes; P63-R2 covered.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: npc-agent personality switch + snapshot test (P63-R8 part 1)</name>
  <files>
backend/src/engine/npc-agent.ts
backend/src/engine/__tests__/npc-agent.personality.test.ts
backend/src/engine/__tests__/npc-agent.test.ts
  </files>
  <behavior>
Test cases for `npc-agent.personality.test.ts`:
- Given an NPC record with `identity.personality.summary = "A scout..."`, the prompt produced by the NPC-agent build helper contains `Personality summary: A scout...` (or analogous label per implementation) and `Voice:` / `Internal contradictions:` / `Sample lines:` lines when those fields are set.
- The prompt does NOT contain `Enduring motives:` or `Pressure responses:` or `Taboos:`.
- Given an NPC with empty personality but populated `behavioralCore.selfImage`, the `self-image` line still renders.
  </behavior>
  <action>
1. Edit `backend/src/engine/npc-agent.ts:425-442`:
   - Replace the 3 `formatNpcIdentityList("Enduring motives" | "Pressure responses" | "Taboos", behavioralCore?.{...})` calls with the 4 personality-driven calls per the interface contract above.
   - Keep `formatNpcIdentityList("Self-image", behavioralCore?.selfImage ? [behavioralCore.selfImage] : [])` (or whatever the existing line for selfImage looks like).
   - Read `personality` from the record per the type signature already added in 63-01 (`identity.personality?.*`).

2. Create `backend/src/engine/__tests__/npc-agent.personality.test.ts` per the behavior cases. Mirror the harness pattern from existing `npc-agent.test.ts`.

3. Update `backend/src/engine/__tests__/npc-agent.test.ts:676` per RESEARCH §9.2: the existing fixture sets `behavioralCore.{motives,...}` — replace with `identity.personality.{summary,voice,...}` so the existing test still passes against the new prompt shape. Do NOT delete the test; update it.
  </action>
  <verify>
    <automated>npm --prefix backend run typecheck && npm --prefix backend test -- run "npc-agent"</automated>
  </verify>
  <done>npc-agent + npc-agent.personality Vitest pass; P63-R8 partly covered.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 5: npc-offscreen personality switch + snapshot test (P63-R8 part 2)</name>
  <files>
backend/src/engine/npc-offscreen.ts
backend/src/engine/__tests__/npc-offscreen.personality.test.ts
backend/src/engine/__tests__/npc-offscreen.test.ts
  </files>
  <behavior>
Test cases mirror Task 4 but for the off-screen NPC simulation prompt builder. Off-screen prompt also stops emitting motives/pressure/taboos and starts emitting personality.summary/voice/contradictions/sample-lines.
  </behavior>
  <action>
1. Edit `backend/src/engine/npc-offscreen.ts:79-93`:
   - Same substitution pattern as npc-agent. The exact lines may differ (off-screen prompt typically has fewer fields per NPC for token economy) — preserve the field count balance: replace the 3 motives/pressure/taboos lines with 2-3 personality lines (suggest `summary`, `voice`, `internal-contradictions`).

2. Create `backend/src/engine/__tests__/npc-offscreen.personality.test.ts` mirroring the npc-agent test.

3. Update `backend/src/engine/__tests__/npc-offscreen.test.ts:309` per RESEARCH §9.2: replace `behavioralCore` fixture with `personality`.
  </action>
  <verify>
    <automated>npm --prefix backend run typecheck && npm --prefix backend test -- run "npc-offscreen"</automated>
  </verify>
  <done>npc-offscreen + npc-offscreen.personality Vitest pass; P63-R8 partly covered.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 6: reflection-agent + reflection-tools personality switch (P63-R8 part 3)</name>
  <files>
backend/src/engine/reflection-agent.ts
backend/src/engine/reflection-tools.ts
backend/src/engine/__tests__/reflection-agent.personality.test.ts
  </files>
  <behavior>
Test cases for `reflection-agent.personality.test.ts`:
- Reflection prompt (output of the reflection prompt builder) contains `Current personality:` (or analogous label) with `summary=`, `voice=`, `contradictions=`, `self-image=` fragments — NOT `Current behavioral core:` with `motives=` / `pressure=`.
- The `promote_identity_change` hint references `personality or baseFacts` — NOT `behavioralCore or baseFacts`.

Also exercise `reflection-tools.ts` `promote_identity_change` tool:
- Tool input schema accepts `personality: Partial<CharacterPersonality>` payload and `liveDynamicsAttachments: string[]` payload.
- Tool execution writes those into `identity.personality` (deep-merge) and `identity.liveDynamics.attachments` (replace).
- Tool no longer accepts (or accepts as `.optional()` for backward compat) `behavioralCore.{motives,pressureResponses,taboos,attachments}` — preferred: schema rejects writes to those legacy fields with a clear error message ("Use personality.* instead — Phase 63").
  </behavior>
  <action>
1. Edit `backend/src/engine/reflection-agent.ts:137`:
   - Replace `Current behavioral core: motives=[...]; pressure=[...]; self-image=...` with `Current personality: summary=...; voice=...; contradictions=[...]; self-image=...` (RESEARCH §3.4 line 137).

2. Edit `backend/src/engine/reflection-agent.ts:151`:
   - In the `promote_identity_change` hint, change "behavioralCore or baseFacts" to "personality or baseFacts" (RESEARCH §3.4 line 151).

3. Edit `backend/src/engine/reflection-tools.ts:295-328`:
   - The `promote_identity_change` tool currently writes `behavioralCore.{motives, pressureResponses, taboos, attachments, selfImage}`. Rewrite per the interface contract above:
     - Tool input schema (Zod) — replace the 5-field shape with `{ personality?: characterPersonalitySchema.partial(), liveDynamicsAttachments?: z.array(z.string()), selfImage?: z.string(), hardConstraints?: z.array(z.string()) }`.
     - Write path:
       - `identity.personality = mergeDefined(identity.personality ?? blankPersonality(), input.personality)` — partial merge.
         **Note (REVIEWS Claude LOW #3):** `blankPersonality()` is the sentinel factory that must be imported from `../character/record-adapters.js` (same module where `normalizePersonality` landed in 63-01). If the helper isn't exported yet, add `export function blankPersonality(): CharacterPersonality { return { summary: "", voice: "", decisionStyle: "", worldview: "", internalContradictions: [], personalMythology: "", sampleLines: [] }; }` to record-adapters in this task.
       - `identity.liveDynamics.attachments = input.liveDynamicsAttachments ?? identity.liveDynamics.attachments` — replace.
       - `identity.behavioralCore.selfImage = input.selfImage ?? identity.behavioralCore.selfImage` — kept on behavioralCore.
       - `identity.baseFacts.hardConstraints = input.hardConstraints ?? identity.baseFacts.hardConstraints` — kept on baseFacts.
     - Helper `blankPersonality()` returns the same sentinel as `normalizePersonality` from 63-01.

4. Create `backend/src/engine/__tests__/reflection-agent.personality.test.ts` per the behavior cases. Test the prompt-build function output (string assertions) and the `promote_identity_change` tool execute callback (call with sample input, assert mutated record).
  </action>
  <verify>
    <automated>npm --prefix backend run typecheck && npm --prefix backend test -- run "reflection-agent|reflection-tools"</automated>
  </verify>
  <done>Reflection prompt references personality; promote_identity_change writes personality + liveDynamics.attachments; tests pass; P63-R8 fully covered.</done>
</task>

<task type="auto">
  <name>Task 7: Post-task gitnexus_detect_changes + full engine suite</name>
  <files>(no edits — verification only)</files>
  <action>
1. `gitnexus_detect_changes({scope: "all"})` — confirm changed files match `files_modified` exactly. Halt and reconcile any unexpected edits.

2. Run the full engine Vitest suite to catch any indirect breakage from the assembler / npc-agent / reflection rewrites:
   ```
   npm --prefix backend test -- run "engine"
   ```
   All tests should be green. Investigate any red — likely candidates: existing prompt-assembler tests that incidentally string-match on "Behavioral Core:" or any pre-existing reflection test that asserts on the old promote_identity_change input shape.

3. Run `gitnexus_impact({target: "promote_identity_change", direction: "upstream"})` again post-edit to confirm no orphaned readers. Reflection workflow callers in `engine/reflection.ts` (or similar — the orchestrator that invokes the tool) must be reviewed: if any caller constructs a manual tool-input payload with the old shape, fix it.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run engine</automated>
  </verify>
  <done>Full engine suite green; gitnexus_detect_changes scope matches; no orphaned callers of promote_identity_change.</done>
</task>

</tasks>

<verification>
- `npm --prefix backend run typecheck` exits 0.
- `npm --prefix backend test -- run "engine"` exits 0 (full engine suite).
- `prompt-assembler.ts` no longer contains the string `"Behavioral Core:"` (replaced with `"Personality:"`).
- `npc-agent.ts` + `npc-offscreen.ts` no longer contain `formatNpcIdentityList("Enduring motives"...)` / `"Pressure responses"` / `"Taboos"` lines.
- `reflection-agent.ts` no longer contains `"Current behavioral core:"`; contains `"Current personality:"`.
- `reflection-tools.ts` `promote_identity_change` tool input schema uses `personality` + `liveDynamicsAttachments`.
- 4 new test files exist under `backend/src/engine/__tests__/` (prompt-assembler.personality, npc-agent.personality, npc-offscreen.personality, reflection-agent.personality).
- gitnexus_detect_changes captured.
</verification>

<success_criteria>
- All 4 runtime engine prompt surfaces (prompt-assembler, npc-agent, npc-offscreen, reflection-agent) read `identity.personality.*` instead of `behavioralCore.{motives,pressureResponses,taboos}`.
- `attachments` reads from `liveDynamics.attachments` in the new prompt block; legacy `behavioralCore.attachments` continues to work via the read-only shadow in `normalizeBehavioralCore`.
- `promote_identity_change` writes personality + liveDynamics.attachments; no longer writes legacy behavioralCore fields.
- Legacy records (no `identity.personality`) cause the `Personality:` block to be omitted entirely (no degraded fallback).
- Snapshot tests (4 new files, 2 updated) pin the contract.
- Full engine Vitest suite green.
- P63-R2 + P63-R8 fully covered.
</success_criteria>

<requirement_coverage>
- **P63-R2** — `prompt-assembler.personality.test.ts` proves the runtime identity block emits `Personality:` with all 7 fields, drops motives/pressure/taboos, reads attachments from `liveDynamics`.
- **P63-R8** — `npc-agent.personality.test.ts`, `npc-offscreen.personality.test.ts`, `reflection-agent.personality.test.ts` prove the 3 NPC + reflection runtime prompt surfaces consume personality.
</requirement_coverage>

<estimates>
- **Effort:** ~50 min Claude execution time (7 tasks; reflection-tools rewrite is the heaviest because it changes the tool contract that reflection orchestrator consumes).
- **LLM token cost:** ~0 (all `generateObject` calls in tests are mocked).
- **Test runtime:** ~30s for full engine Vitest suite.
</estimates>

<risks>
- **R1 — Reflection orchestrator coupling.** `reflection-tools.ts` `promote_identity_change` is invoked by the reflection workflow with a manually-constructed input payload. Changing the input schema breaks the caller. **Mitigation:** Task 7 explicitly verifies orphaned callers via `gitnexus_impact`; any caller in `engine/reflection.ts` is updated as part of the same task (file already in `files_modified` if discovered).
- **R2 — Snapshot brittleness.** String assertions on prompt output are sensitive to whitespace + label phrasing. **Mitigation:** Use `toContain()` / regex matchers (not full-string `toBe`); pin only the load-bearing fragments.
- **R3 — Legacy record handling.** Per RESEARCH §11 default, legacy records skip the `Personality:` block entirely. NPCs created before backfill will have weaker prompts until 63-05 runs. **Mitigation:** documented; user is expected to run backfill (via `npm run backfill-personality` from 63-05) before resuming play on legacy campaigns.
- **R4 — Attachments shadow drift.** If any code path mutates `behavioralCore.attachments` directly (not through `promote_identity_change`), the shadow in `normalizeBehavioralCore` will mask the divergence. **Mitigation:** gitnexus_impact in Task 1 catches direct readers; reflection-tools is the only writer in the engine layer.
- **R5 — Full engine suite scope.** Running `engine` filter may surface tangential breakage. **Mitigation:** Task 7 explicitly inspects red tests rather than narrowing the filter.
</risks>

<output>
After completion, create `.planning/phases/63-personality-interiority-model/63-03-SUMMARY.md` with:
- Tasks completed
- Files modified
- gitnexus impact + detect_changes digests
- Test commands + pass/fail evidence
- Notes on any orphaned callers discovered + fixed
- Deviations + rationale
</output>

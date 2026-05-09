---
phase: 63-personality-interiority-model
plan: 02
subsystem: character
tags: [personality, ingestion, zod, vitest, gitnexus, v2-card]
requires:
  - phase: 63-01
    provides: shared CharacterPersonality typing, mes_example parser, and migration-safe schema defaults
provides:
  - personality flat-key ingestion across parse, generate, research, import, npc, and worldgen paths
  - mesExample transport and SAMPLE LINES prompt wiring for V2/V3 imports
  - prompt-contract wording aligned atomically with the rich personality schema
  - targeted backend regression coverage for synthesizer, pipeline, persona templates, npc generation, and worldgen NPCs
affects: [63-03-engine-consumers, 63-04-ui, 63-05-backfill, 63-06-verification]
tech-stack:
  added: []
  patterns:
    - flat personality keys lifted into identity.personality only at adapter boundaries
    - mes_example quotes preserved as canonical voice via SAMPLE LINES prompt sections
    - pinned prompt-contract tests import rule constants instead of matching raw literals
key-files:
  created:
    - backend/src/character/ingestion/__tests__/synthesizer.personality.test.ts
    - backend/src/character/ingestion/__tests__/pipeline.personality-e2e.test.ts
  modified:
    - backend/src/character/generator.ts
    - backend/src/character/record-adapters.ts
    - frontend/lib/v2-card-parser.ts
    - backend/src/routes/character.ts
    - backend/src/character/ingestion/synthesizer.ts
    - backend/src/character/prompt-contract.ts
    - backend/src/character/npc-generator.ts
    - backend/src/worldgen/scaffold-steps/npcs-step.ts
key-decisions:
  - "Kept personalitySampleLines at .min(0).max(3).default([]) and enforced the 2+ quote expectation in prompt text rather than Zod."
  - "Extended npc-generator's dedicated npcSchema with personality fields because it does not actually share richCharacterSchema with player ingestion."
  - "Verified backend-only Vitest suites from backend/ to avoid false failures from parallel .claude/worktrees."
patterns-established:
  - "V2/V3 import transport: frontend parser emits mesExample, route schema defaults it to '', and synthesizer extracts canonical sample lines before the LLM call."
  - "NPC/worldgen parity: NPC-specific generators and scaffold steps now populate identity.personality even when legacy behavioralCore compatibility remains in place."
requirements-completed: [P63-R1, P63-R3]
duration: 14m
completed: 2026-04-18
---

# Phase 63 Plan 02: Ingestion Pipeline Summary

**Character ingestion now emits structured personality interiority across player, NPC, and V2/V3 card flows, with mes_example quotes preserved as canonical voice and prompt-contract wording aligned to the new schema**

## Performance

- **Duration:** 14m
- **Started:** 2026-04-18T15:58:55Z
- **Completed:** 2026-04-18T16:12:51Z
- **Tasks:** 10
- **Files modified:** 21

## Accomplishments
- Extended rich and NPC ingestion schemas so personality summary, voice, decision style, worldview, contradictions, mythology, and sample lines now flow into `identity.personality`.
- Threaded `mesExample` end-to-end from the frontend V2/V3 parser through the import route into synthesizer prompt assembly, including a `SAMPLE LINES` block that preserves extracted card quotes verbatim.
- Aligned prompt-contract rule strings, persona-template merges, NPC/worldgen adapters, and backend regression suites so the new personality contract lands consistently instead of only at one entry point.

## GitNexus Impact Digest

- Initial mandatory GitNexus calls hit a transient `.gitnexus/lbug` lock conflict under parallel executor contention. Static fallback audit was used immediately, then GitNexus was retried successfully before edits/verification.
- Static reader audit recorded `behavioralCore?.` = `56` and direct `behavioralCore.` = `10` outside tests, confirming the Phase 63 review decision that wrapper objects must remain defaulted.
- `toCharacterDraftFromRich` impact/context showed direct callers `parseCharacterDescription`, `generateCharacter`, `generateCharacterFromArchetype`, and `synthesizeDraftFromSources`.
- `parseV2Json` impact reported 2 direct callers (`parseV2CardFile`, `parseV2Png`) and downstream flows into `CharacterCreationPage` and `NpcsSection` with `LOW` risk.
- `buildV2CardSections` context confirmed a single live caller: `formatCardSection` inside `synthesizer.ts`.
- `researchArchetype` and `ingestCharacterDraft` impacts under-reported as `LOW/0`, so the plan relied on file-level static audit as the authoritative scope check for this execution.
- `gitnexus_detect_changes({scope:\"all\"})` returned `changed_files: 13`, `risk_level: low`, `changed_symbols: 0`; the symbol list was incomplete, so commit-range file inspection stayed authoritative.

## Verification

- `npm --prefix backend run typecheck` ✅
- `backend: npx vitest run src/character/ingestion/__tests__/synthesizer.personality.test.ts src/character/ingestion/__tests__/pipeline.personality-e2e.test.ts src/character/__tests__/persona-templates.test.ts src/worldgen/__tests__/npcs-step.test.ts src/character/__tests__/npc-generator.test.ts src/character/__tests__/record-adapters.identity.test.ts src/character/__tests__/v2-sections.test.ts src/character/__tests__/archetype-researcher.test.ts src/character/__tests__/generator.test.ts src/character/ingestion/__tests__/synthesizer.test.ts` ✅ (`48` tests)
- `frontend: npx eslint lib/v2-card-parser.ts` ✅
- `npm --prefix frontend run lint` ⚠️ blocked by pre-existing unrelated errors in `frontend/components/world-review/personality-section.tsx`; recorded in `deferred-items.md`
- `gitnexus_detect_changes({scope:"all"})` ✅
- `gitnexus_impact({target:"ingestCharacterDraft", direction:"upstream"})` ✅

## Task Commits

Each task was committed atomically:

1. **Task 1: Pre-task gitnexus impact analysis** - `04e213a` (`chore`)
2. **Task 2: richCharacterSchema personality flat-keys + adapter lift + synthesizer test** - `dac2f92` (`test`), `588c096` (`feat`)
3. **Task 3: V2/V3 mes_example threading — frontend parser + types + route** - `22aba00` (`feat`)
4. **Task 4: Synthesizer wiring — extractSampleLinesFromMesExample + buildV2CardSections SAMPLE LINES** - `14f429f` (`feat`)
5. **Task 5: Archetype researcher prompt extension** - `ef93e78` (`feat`)
6. **Task 6: Persona templates personality merge** - `2609468` (`feat`)
7. **Task 7: prompt-contract rule strings + pinned generator/npc-generator tests** - `7ed715b` (`feat`)
8. **Task 8: Worldgen NPC scaffold step + npc-generator personality lift** - `b0eca97` (`feat`)
9. **Task 9: End-to-end pipeline integration test (all 4 modes)** - `4f6fe6a` (`test`)
10. **Task 10: Post-task gitnexus_detect_changes verification** - `17a447e` (`chore`)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `backend/src/character/generator.ts` - Adds personality flat keys to `richCharacterSchema`, extends flat-output instructions, and updates parse/generate prompts.
- `backend/src/character/record-adapters.ts` - Extends `RichParsedCharacter` and lifts flat personality keys into `identity.personality`.
- `backend/src/character/ingestion/__tests__/synthesizer.personality.test.ts` - Locks the flat-to-nested personality lift and the `.min(0)` `personalitySampleLines` schema guard.
- `frontend/lib/v2-card-parser.ts` - Extracts `mesExample` from V2 and nested V3 card payloads.
- `backend/src/character/ingestion/types.ts` - Adds required `mesExample` transport to `V2CardPayload`.
- `backend/src/routes/schemas.ts` - Accepts `mesExample` on `/import-v2-card`.
- `backend/src/routes/character.ts` - Threads `mesExample` into the import ingestion payload.
- `backend/src/character/ingestion/synthesizer.ts` - Parses `mesExample`, injects `SAMPLE LINES`, and tells the LLM to preserve them in `personalitySampleLines`.
- `backend/src/character/v2-sections.ts` - Renders a `SAMPLE LINES (direct quotes from source)` block when extracted quotes exist.
- `backend/src/character/archetype-researcher.ts` - Requests voice samples, worldview, contradictions, and mythology in archetype research output.
- `backend/src/character/persona-templates.ts` - Deep-merges `identity.personality` patches with the existing persona-template semantics.
- `backend/src/character/__tests__/persona-templates.test.ts` - Covers personality override, no-op, and sampleLines replacement behavior.
- `backend/src/character/prompt-contract.ts` - Rewrites richer identity, flat-output, and deterministic-mapping rule strings around `personality`.
- `backend/src/character/__tests__/generator.test.ts` - Pins prompt wording via imported prompt-contract constants.
- `backend/src/character/__tests__/npc-generator.test.ts` - Verifies NPC drafts now carry `identity.personality`.
- `backend/src/character/npc-generator.ts` - Adds NPC-side personality flat fields and maps them into `identity.personality` instead of deriving motives.
- `backend/src/worldgen/scaffold-steps/npcs-step.ts` - Carries worldgen persona text into `identity.personality.summary`.
- `backend/src/worldgen/__tests__/npcs-step.test.ts` - Requires worldgen NPC drafts to include personality summaries.
- `backend/src/character/__tests__/record-adapters.identity.test.ts` - Pins empty-personality sentinel hydration on legacy records.
- `backend/src/character/ingestion/__tests__/pipeline.personality-e2e.test.ts` - Exercises parse, generate, research, and import through `ingestCharacterDraft`.
- `.planning/phases/63-personality-interiority-model/deferred-items.md` - Records the unrelated frontend lint blocker encountered during Task 3 verification.

## Decisions Made

- Kept the personality quote requirement soft in prompts instead of hard in Zod because `.default([])` must remain valid at parse time.
- Treated the player generator and NPC generator as separate ingestion contracts once code inspection showed `npc-generator.ts` owns its own schema.
- Used backend-scoped Vitest invocations for final verification to avoid unrelated `.claude/worktrees/*` tests contaminating the result.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `/import-v2-card` handler transport wiring omitted from plan frontmatter**
- **Found during:** Task 3 (V2/V3 mes_example threading — frontend parser + types + route)
- **Issue:** The plan required `mesExample` to reach the synthesizer, but `backend/src/routes/character.ts` was missing from `files_modified` despite being the route-layer transport seam.
- **Fix:** Updated the route handler to accept `mesExample` from parsed request data and include it in the `v2Card` ingestion payload.
- **Files modified:** `backend/src/routes/character.ts`
- **Verification:** `npm --prefix backend run typecheck`; targeted frontend parser lint; end-to-end import pipeline test
- **Committed in:** `22aba00`

**2. [Rule 2 - Missing Critical] Extended npc-generator's dedicated schema with personality fields**
- **Found during:** Task 8 (Worldgen NPC scaffold step + npc-generator personality lift)
- **Issue:** The plan narrative assumed NPC generation inherited the player-side rich schema, but `backend/src/character/npc-generator.ts` defines its own flat `npcSchema`. Without updating it, NPC drafts would still emit empty personality.
- **Fix:** Added NPC-side `personality*` flat fields, updated flat-output guidance, mapped them into `identity.personality`, and stopped deriving behavioralCore motives from NPC flat output.
- **Files modified:** `backend/src/character/npc-generator.ts`, `backend/src/character/__tests__/npc-generator.test.ts`
- **Verification:** `npm run typecheck`; targeted `npc-generator`, `npcs-step`, and `record-adapters` Vitest suites
- **Committed in:** `b0eca97`

**3. [Rule 1 - Bug] Corrected the import e2e fixture to satisfy the mes_example parser's own length contract**
- **Found during:** Task 9 (End-to-end pipeline integration test)
- **Issue:** The original example quote from the plan (`"Move out, on me."`) is shorter than the Phase 63 parser's `>=20` character filter, so the test fixture contradicted the real parser contract.
- **Fix:** Replaced the fixture with a longer in-character quote while preserving the same verification goal: proving that parsed `mesExample` dialogue returns through `personality.sampleLines`.
- **Files modified:** `backend/src/character/ingestion/__tests__/pipeline.personality-e2e.test.ts`
- **Verification:** `npx vitest run src/character/ingestion/__tests__/pipeline.personality-e2e.test.ts`
- **Committed in:** `4f6fe6a`

---

**Total deviations:** 3 auto-fixed (2 missing critical, 1 bug)
**Impact on plan:** All deviations were required for correctness of the ingestion contract. No architectural scope change and no user-visible feature creep beyond the intended plan outcome.

## Issues Encountered

- GitNexus MCP initially failed on a repository lock file (`.gitnexus/lbug`) under parallel executor contention. Static `rg` audits were used immediately, then GitNexus calls were retried successfully before final verification.
- `npm --prefix frontend run lint` fails in an unrelated pre-existing file, `frontend/components/world-review/personality-section.tsx`, due unused variable and unescaped quote errors. This was logged to `deferred-items.md` and not modified under the scope boundary.
- Root-level Vitest commands picked up `.claude/worktrees/*` test files from other agents. Final verification ran from `backend/` to isolate the current workspace.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 63-03 can now switch runtime consumers to `identity.personality` knowing ingestion, NPC generation, and worldgen scaffolding already populate the block.
- Phase 63-04 UI work can render `summary`, `voice`, and `sampleLines` from real draft data instead of placeholders.
- Remaining concern: full frontend lint is still blocked by the unrelated `personality-section.tsx` worktree errors captured in `deferred-items.md`.

---
*Phase: 63-personality-interiority-model*
*Completed: 2026-04-18*

## Self-Check: PASSED

- FOUND: `.planning/phases/63-personality-interiority-model/63-02-SUMMARY.md`
- FOUND: `04e213a`
- FOUND: `dac2f92`
- FOUND: `588c096`
- FOUND: `22aba00`
- FOUND: `14f429f`
- FOUND: `ef93e78`
- FOUND: `2609468`
- FOUND: `7ed715b`
- FOUND: `b0eca97`
- FOUND: `4f6fe6a`
- FOUND: `17a447e`

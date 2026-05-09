---
phase: 63-personality-interiority-model
plan: 06
slug: verification
type: execute
wave: 5
status: draft
depends_on: [63-01, 63-02, 63-03, 63-04, 63-05]
files_modified:
  - .planning/phases/63-personality-interiority-model/63-VERIFICATION.md
  - .planning/phases/63-personality-interiority-model/63-VALIDATION.md
  - .planning/phases/63-personality-interiority-model/evidence/ingestion-real-run.json
  - .planning/REQUIREMENTS.md
autonomous: false
requirements: [P63-R1, P63-R2, P63-R3, P63-R4, P63-R5, P63-R6, P63-R7, P63-R8]
must_haves:
  truths:
    - "Full backend Vitest suite green"
    - "Full frontend Vitest suite green"
    - "Backend typecheck + frontend lint exit 0"
    - "PinchTab smoke: load a real campaign → world review → NPC card renders PERSONALITY collapsible with summary + voice + expandable details"
    - "Backfill script run on a real dev campaign produces non-empty personality.summary on every NPC + player; backup files exist; no failed records"
    - "63-VERIFICATION.md evidence bundle captures all of the above with raw command outputs + screenshot paths"
    - "63-VALIDATION.md frontmatter flipped: nyquist_compliant: true, wave_0_complete: true"
    - "REQUIREMENTS.md traceability table flipped: P63-R1..R8 status Planned → Complete; P62-R2 marked superseded"
    - "gitnexus_detect_changes report attached confirming Phase 63 changes match files_modified across all 6 plans"
  artifacts:
    - path: .planning/phases/63-personality-interiority-model/63-VERIFICATION.md
      provides: "Evidence bundle: test outputs, PinchTab screenshots, backfill log samples, gitnexus report"
      min_lines: 80
      contains: "PinchTab"
    - path: .planning/phases/63-personality-interiority-model/63-VALIDATION.md
      provides: "Updated frontmatter (nyquist_compliant: true) + per-task status flipped to green"
      contains: "nyquist_compliant: true"
    - path: .planning/REQUIREMENTS.md
      provides: "P63-R1..R8 status flipped to Complete; P62-R2 superseded note added"
      contains: "P63-R1 | Phase 63 | Complete"
  key_links:
    - from: .planning/phases/63-personality-interiority-model/63-VERIFICATION.md
      to: .planning/phases/63-personality-interiority-model/63-VALIDATION.md
      via: "Verification evidence backs the validation sign-off"
      pattern: "63-VALIDATION"
---

<objective>
Validate the entire Phase 63 implementation end-to-end, run the backfill on a real campaign, and produce the sign-off evidence bundle.

Purpose: Plans 63-01 through 63-05 ship code + tests. This plan proves the system actually works in a real-browser, real-LLM scenario, runs the migration on a real dataset (the load-bearing operator action of this phase), and pins the requirement traceability + Nyquist compliance for the GSD workflow. It also handles the cross-phase contract change: P62-R2 locked the inspector at 10 sections, and 63-04 reduces it to 9 — REQUIREMENTS.md traceability needs the supersession note.

This plan has ONE checkpoint (PinchTab smoke verification) — the rest is automated.

Output:
- Full test suite + lint + typecheck green
- PinchTab smoke captured (screenshot + accessibility-tree dump for the NPC card PERSONALITY section)
- Backfill script run on at least one real dev campaign with documented output
- `63-VERIFICATION.md` evidence bundle written
- `63-VALIDATION.md` flipped to compliant
- `REQUIREMENTS.md` traceability flipped + P62-R2 supersession note
- `gitnexus_detect_changes` final report
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/63-personality-interiority-model/63-CONTEXT.md
@.planning/phases/63-personality-interiority-model/63-RESEARCH.md
@.planning/phases/63-personality-interiority-model/63-VALIDATION.md
@.planning/phases/63-personality-interiority-model/63-01-foundation-PLAN.md
@.planning/phases/63-personality-interiority-model/63-02-ingestion-pipeline-PLAN.md
@.planning/phases/63-personality-interiority-model/63-03-engine-consumers-PLAN.md
@.planning/phases/63-personality-interiority-model/63-04-ui-PLAN.md
@.planning/phases/63-personality-interiority-model/63-05-backfill-PLAN.md
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Full test suite + typecheck + lint sweep</name>
  <files>(no edits — verification only)</files>
  <action>
Run the full validation grid. Capture raw stdout/stderr for the evidence bundle.

1. Backend typecheck:
   ```
   npm --prefix backend run typecheck
   ```

2. Backend full Vitest:
   ```
   npm --prefix backend test -- run
   ```

3. Frontend lint:
   ```
   npm --prefix frontend run lint
   ```

4. Frontend full Vitest:
   ```
   npm --prefix frontend test -- run
   ```

5. Investigate and fix ANY red. Common candidates:
   - Existing prompt-assembler tests that incidentally string-match on `Behavioral Core` (63-03 should have caught these but full-suite may surface something tangential).
   - Existing inspector tests that assert on the dropped Provenance section header text.
   - Existing character-card tests that assert on motives/traits/flaws fields.

If a fix is required, classify it:
   - **In-scope** (Phase 63 contract): fix in this task; document in 63-VERIFICATION.md.
   - **Pre-existing flake** (unrelated to Phase 63): document in 63-VERIFICATION.md as a known non-blocking issue, do NOT fix here.
   - **Out-of-scope regression** (Phase 63 broke something genuinely unrelated): STOP, file as a follow-up task, halt verification.

Capture raw output (last 50 lines per command) to be embedded in 63-VERIFICATION.md by Task 5.
  </action>
  <verify>
    <automated>npm --prefix backend run typecheck && npm --prefix backend test -- run && npm --prefix frontend run lint && npm --prefix frontend test -- run</automated>
  </verify>
  <done>All 4 commands exit 0; raw outputs captured.</done>
</task>

<task type="auto">
  <name>Task 2: Backfill script — real-campaign manual run</name>
  <files>(no source edits — operational task; produces logs + backup files in campaigns/)</files>
  <action>
Per RESEARCH §11 question 4 default + the deferred 63-05 manual-run task:

1. Choose a target campaign. Preference order:
   a. An existing dev campaign with ≥3 NPCs and at least one player (per Phase 13/Phase 33 STATE notes there are several "Voices of the Void" / known-IP test campaigns).
   b. If no suitable campaign exists, create one via the standard `/campaign/new` flow (with at least 1 player + 3 NPCs from worldgen). Document the choice.
   c. List candidate campaigns by reading `campaigns/{uuid}/config.json` files; pick one labeled as a dev/test target.

2. **Pre-run snapshot:**
   - Stop the backend dev server if running (RESEARCH §11 risk #3 — DB singleton concurrency).
   - Read each player + NPC `characterRecord.identity.personality.summary` field; confirm at least one is empty (otherwise the script will skip everything and the test is meaningless).

3. **Dry-run pass:**
   ```
   npm --prefix backend run backfill:personality -- --dry-run --campaign <id>
   ```
   - Confirm exit 0.
   - Capture stdout (final `backfill.finished` log line + counts).
   - Confirm backup files written under `campaigns/<id>/logs/backfill-backup-*.json`.
   - Confirm DB unchanged (re-read characterRecord, compare).

4. **Real run:**
   ```
   npm --prefix backend run backfill:personality -- --campaign <id>
   ```
   - Confirm exit 0.
   - Capture stdout (final counts).
   - Confirm backup files for THIS run also written (separate timestamps from dry-run).
   - Re-read each updated record's `identity.personality` — assert all 7 fields populated, sampleLines length ≥ 2.

5. **Idempotency pass:**
   ```
   npm --prefix backend run backfill:personality -- --campaign <id>
   ```
   - Confirm exit 0.
   - Confirm counts: `written: 0, skipped: <N>, failed: 0`.
   - Confirm no new backup files written (script skips before backup step).

6. **Spot-check log structure:**
   - Open `campaigns/<id>/logs/<latest>.jsonl` (Phase 58 destination).
   - Find events with `turnId: "backfill-<recordId>"`. Confirm the chain: `backfill.synthesize` → `backfill.backup` → `backfill.write` → `backfill.batch_complete`.
   - Confirm `apiKey` / `Authorization` are NOT leaked in any payload (Phase 58 redaction must hold).

Capture all command outputs + a sample backed-up vs. populated record diff for Task 5 evidence.
  </action>
  <verify>
    <automated>node -e "console.log('manual backfill run captured: dry-run + real + idempotency + log structure spot-check')"</automated>
  </verify>
  <done>Backfill ran end-to-end on a real campaign; idempotency proven; logs + backups inspected; no failures.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: PinchTab smoke — basic NPC card PERSONALITY rendering</name>
  <what-built>
After plans 63-01..63-05, every NPC + player record on the chosen test campaign now has `identity.personality` populated. The basic NPC card in world-review should render a PERSONALITY section between Tags and Power Stats with always-visible summary + voice and a collapsible details block (sampleLines, decision style, worldview, contradictions, mythology). The advanced inspector should NO longer render motives/pressure/taboos/traits/flaws/legacyTags or the Provenance section.
  </what-built>
  <how-to-verify>
1. Start servers (if not running):
   ```
   cd backend && npm run dev &
   cd frontend && npm run dev &
   ```

2. Ensure PinchTab is running (per project conventions — `BRIDGE_HEADLESS=true pinchtab &` if not already).

3. Navigate PinchTab to `http://localhost:3000`, load the campaign that was backfilled in Task 2.

4. Open World Review → NPCs tab.

5. **PERSONALITY section visibility check:**
   - Pick 2 NPCs to inspect.
   - For each: confirm a section labeled PERSONALITY (or similar — match the actual rendered text) appears BETWEEN the Tags block and the Power Stats block.
   - Confirm `summary` text is visible without expanding.
   - Confirm `Voice:` line is visible without expanding (font-mono uppercase).
   - Click the chevron toggle: confirm `Sample lines` (italic blockquotes), `Decision style:`, `Worldview:`, `Contradictions:`, `Mythology:` reveal.
   - Click again: confirm collapse.

6. **Advanced inspector cleanup check:**
   - Open the Advanced inspector for one of the inspected NPCs.
   - Confirm NO section labeled `Motives`, `Pressure responses`, `Taboos`, `Attachments` (in Identity Core), `Traits`, `Flaws` (in Capabilities), `Legacy tags`, or `Provenance` (the entire section) renders.
   - Count visible sections — should be 9 (was 10 in Phase 62): Overview, Identity Core, Profile, Live Dynamics, Capabilities, Runtime & State, Loadout, Starting Conditions, Raw JSON.

7. **Player CharacterCard check:**
   - Navigate to the player character (e.g. via the campaign's character page or wherever the player CharacterCard is rendered).
   - Confirm PERSONALITY section renders with the same shape as on the NPC card.

8. **Capture evidence:**
   - PinchTab `/screenshot` for: (a) NPC card with PERSONALITY collapsed, (b) NPC card with PERSONALITY expanded, (c) Advanced inspector showing 9-section layout (no Provenance).
   - PinchTab `/accessibility-tree` snapshot for one NPC card to prove the structure matches.
   - Save under `.planning/phases/63-personality-interiority-model/evidence/`.

Per `feedback_real_testing.md`: NO mocks, NO fake screenshots. Real campaign, real LLM-backfilled data, real browser.

Per PinchTab workarounds documented in MEMORY: ref-clicks may not work on React buttons with lucide icons; use `/evaluate` with JS programmatic click for the collapsible toggle if needed.
  </how-to-verify>
  <resume-signal>Type "approved" with screenshot paths captured, OR describe what failed (e.g. "NPC card not showing PERSONALITY section — looks like 63-04 Task 3 didn't wire PersonalitySection into npcs-section.tsx render"), OR "http-fallback" if PinchTab localhost is blocked (triggers Task 3b).</resume-signal>
</task>

<task type="auto">
  <name>Task 3b: HTTP fallback verification (REVIEWS fix #9 — for PinchTab-blocked checkpoint)</name>
  <files>(no edits — evidence capture only)</files>
  <action>
**Invoke ONLY if Task 3 checkpoint resumed with "http-fallback".** STATE.md notes Phase 33 has a known PinchTab localhost transport issue. If PinchTab cannot reach `http://localhost:3000/`, this fallback provides equivalent closure evidence per `feedback_real_testing.md` (real test, just different transport).

1. Confirm backend + frontend dev servers are running locally.

2. **Backend API verification — personality block present on every NPC + player:**
   ```bash
   curl -s http://localhost:3001/api/campaigns/<campaign-id>/world | \
     node -e "
       let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
         const w = JSON.parse(d);
         const npcs = w.npcs || [];
         const report = npcs.map(n => ({
           name: n.displayName ?? n.id,
           hasPersonality: Boolean(n.characterRecord?.identity?.personality?.summary?.trim()),
           sampleLinesCount: (n.characterRecord?.identity?.personality?.sampleLines ?? []).length,
         }));
         const missing = report.filter(r => !r.hasPersonality);
         console.log('NPCs total:', npcs.length, 'missing personality:', missing.length);
         if (missing.length > 0) { console.error('MISSING:', JSON.stringify(missing, null, 2)); process.exit(1); }
         console.log(JSON.stringify(report, null, 2));
       });
     "
   ```
   Assert every NPC has `hasPersonality: true` and `sampleLinesCount >= 2`. Save output to `evidence/http-api-npcs.txt`.

3. **Frontend HTML verification — PERSONALITY region rendered:**
   ```bash
   curl -s http://localhost:3000/campaign/<campaign-id>/review > /tmp/review.html
   grep -c 'data-shell-region="personality"' /tmp/review.html
   ```
   Assert count ≥ N (where N is the number of NPCs in the campaign, since each NPC card has its own section). Save `/tmp/review.html` to `evidence/review-page.html`.

4. **Advanced inspector — 9 sections not 10:**
   ```bash
   curl -s http://localhost:3000/campaign/<campaign-id>/review > /tmp/review-full.html
   grep -c 'data-inspector-section=' /tmp/review-full.html || grep -o 'Provenance' /tmp/review-full.html | wc -l
   ```
   Assert Provenance header does NOT appear as a section in the inspector body (it may still appear as an Overview badge — that's fine).

5. **Player CharacterCard PERSONALITY:**
   ```bash
   curl -s http://localhost:3000/campaign/<campaign-id>/character > /tmp/character.html
   grep 'data-shell-region="personality"' /tmp/character.html
   ```
   Assert at least one match.

Capture all curl outputs + saved HTML snapshots in `.planning/phases/63-personality-interiority-model/evidence/`. Document in 63-VERIFICATION.md that HTTP fallback was used (not PinchTab) due to the Phase 33 localhost transport blocker — per Phase 33 precedent, record the blocker rather than substitute another transport for the primary path.
  </action>
  <verify>
    <automated>node -e "console.log('HTTP fallback evidence captured if Task 3 checkpoint requested')"</automated>
  </verify>
  <done>HTTP fallback evidence bundle complete; documented as equivalent closure per `feedback_real_testing.md`.</done>
</task>

<task type="auto">
  <name>Task 8: Real-path verification for all 4 ingestion modes (REVIEWS fix #8)</name>
  <files>
.planning/phases/63-personality-interiority-model/evidence/ingestion-real-run.json
  </files>
  <action>
**REVIEWS fix #8 (Claude + Codex MEDIUM):** Mocked tests (63-02) prove schema/wiring, NOT product behavior. This task runs ONE real LLM call per ingestion path + ≥3 real V2 imports with messy mes_example. Proves Phase 63 actually migrated ingestion behavior, not just test compliance.

Token cost estimate: ~1000-1500 tokens per ingestion × 4 modes + 3 V2 imports = ~10K tokens on GLM-5 ≈ $0.01. Negligible.

1. **Real parse-character:**
   ```bash
   curl -s -X POST http://localhost:3001/api/worldgen/parse-character \
     -H 'Content-Type: application/json' \
     -d '{"role":"key","description":"A weather-beaten desert scout named Kael, sworn to the dawn watch of Dunespire Hold. Curt, cynical about the regime.","campaignId":"<campaign-id>"}' \
     > evidence/ingest-parse.json
   node -e "const r=require('./evidence/ingest-parse.json'); const p=r.draft?.identity?.personality; if(!p?.summary?.trim()) throw new Error('no summary'); if(!p?.voice?.trim()) throw new Error('no voice'); console.log('parse OK:', {summary: p.summary.slice(0,60), voice: p.voice.slice(0,60), sampleLines: p.sampleLines?.length});"
   ```

2. **Real generate-character:**
   ```bash
   curl -s -X POST http://localhost:3001/api/worldgen/generate-character \
     -H 'Content-Type: application/json' \
     -d '{"role":"key","premise":"Post-apocalyptic desert wasteland, survivors of a fallen empire","campaignId":"<campaign-id>"}' \
     > evidence/ingest-generate.json
   node -e "const r=require('./evidence/ingest-generate.json'); const p=r.draft?.identity?.personality; if(!p?.summary?.trim()) throw new Error('no summary'); if(!p?.voice?.trim()) throw new Error('no voice'); console.log('generate OK');"
   ```

3. **Real research-character (public-domain archetype, no IP violations):**
   ```bash
   curl -s -X POST http://localhost:3001/api/worldgen/research-character \
     -H 'Content-Type: application/json' \
     -d '{"role":"key","archetype":"Sherlock Holmes","campaignId":"<campaign-id>"}' \
     > evidence/ingest-research.json
   node -e "const r=require('./evidence/ingest-research.json'); const p=r.draft?.identity?.personality; if(!p?.summary?.trim()) throw new Error('no summary'); if((p?.sampleLines?.length ?? 0) < 1) throw new Error('no sampleLines'); console.log('research OK, sampleLines:', p.sampleLines.length);"
   ```

4. **Real V2 imports — 3 cards with varied mes_example formats:**
   - Card A: well-formed with `<START>` + multiple `{{char}}:` turns.
   - Card B: no `<START>` markers, turns alternate directly.
   - Card C: heavy action-only emotes (`*smiles*`), few actual quotes — tests parser graceful fallback.

   For each card:
   ```bash
   curl -s -X POST http://localhost:3001/api/worldgen/import-v2-card \
     -H 'Content-Type: application/json' \
     -d @fixtures/v2-card-<A|B|C>.json \
     > evidence/ingest-v2-<A|B|C>.json
   node -e "const r=require('./evidence/ingest-v2-A.json'); const p=r.draft?.identity?.personality; console.log('V2-A sampleLines:', p?.sampleLines);"
   ```
   Assertion for each: either `sampleLines.length >= 1` (parser extracted) OR logged LLM-synthesized-fallback entry in the run logs (parser returned [] and synthesizer filled from description/personality). Document which path each card took.

5. **Aggregate results into `evidence/ingestion-real-run.json`:**
   ```json
   {
     "parse": {"personality_summary_populated": true, "voice_populated": true, "sampleLines": 2},
     "generate": {"personality_summary_populated": true, "voice_populated": true, "sampleLines": 3},
     "research": {"personality_summary_populated": true, "sampleLines": 2, "archetype": "Sherlock Holmes"},
     "v2_A_parser_hit": true,
     "v2_B_parser_hit": true,
     "v2_C_fallback_used": true,
     "token_cost_estimate_usd": 0.01
   }
   ```

6. If any path fails: structured error log captured in the main 63-06 verification bundle. Classify:
   - **In-scope regression** (Phase 63 broke it): STOP, file as blocker.
   - **LLM underfill** (prompt needs tuning): log as known issue in 63-VERIFICATION.md; does NOT block phase closeout unless failure rate >25%.
   - **Pre-existing issue** (not caused by Phase 63): documented and moved to BACKLOG.
  </action>
  <verify>
    <automated>node -e "const r=require('./.planning/phases/63-personality-interiority-model/evidence/ingestion-real-run.json'); const required=['parse','generate','research']; for (const k of required) { if (!r[k]?.personality_summary_populated) throw new Error('missing '+k); } console.log('real-path verification OK');"</automated>
  </verify>
  <done>Real LLM calls made against all 4 ingestion modes; personality block populated on every returned draft; V2 parser behavior documented across 3 card formats; token cost recorded (≈$0.01).</done>
</task>

<task type="auto">
  <name>Task 4: Phase 62 P62-R2 section-order test refresh + REQUIREMENTS.md supersession</name>
  <files>
.planning/REQUIREMENTS.md
  </files>
  <action>
NOTE: The actual `character-record-inspector.test.tsx` 10 → 9 section change was landed by 63-04 Task 5. This task ONLY handles the REQUIREMENTS.md bookkeeping — flipping P63-R* to Complete and adding a supersession note to P62-R2.

Edit `.planning/REQUIREMENTS.md`:

1. In the Traceability table, flip the 8 P63-R* rows from `Planned` to `Complete`:
   ```
   | P63-R1 | Phase 63 | Complete |
   | P63-R2 | Phase 63 | Complete |
   | P63-R3 | Phase 63 | Complete |
   | P63-R4 | Phase 63 | Complete |
   | P63-R5 | Phase 63 | Complete |
   | P63-R6 | Phase 63 | Complete |
   | P63-R7 | Phase 63 | Complete |
   | P63-R8 | Phase 63 | Complete |
   ```

2. In the Phase 62 traceability rows, add a supersession note to P62-R2 specifically:
   ```
   | P62-R2 | Phase 62 | Complete (Phase 63 supersedes section count: 10 → 9, Provenance dropped) |
   ```
   Leave P62-R1, P62-R3, P62-R4, P62-R5 unchanged — they are still valid contracts.

3. Update the trailing footer:
   ```
   *Last updated: <today's date> after Phase 63 verification*
   ```

4. In the Phase 63 requirements section (the `### Phase 63 — Personality Interiority Model` block added by 63-01), flip every checkbox from `- [ ]` to `- [x]` for P63-R1 through P63-R8.

DO NOT edit any other Phase row's status.
  </action>
  <verify>
    <automated>node -e "const t=require('fs').readFileSync('.planning/REQUIREMENTS.md','utf8'); for(const id of ['P63-R1','P63-R2','P63-R3','P63-R4','P63-R5','P63-R6','P63-R7','P63-R8']){ const re=new RegExp('\\\\| '+id+' \\\\| Phase 63 \\\\| Complete'); if(!re.test(t)) throw new Error('Not Complete: '+id); } if(!/P62-R2.*supersedes/.test(t)) throw new Error('P62-R2 supersession note missing'); console.log('REQUIREMENTS.md flipped + P62-R2 supersession noted');"</automated>
  </verify>
  <done>P63-R1..R8 marked Complete; P62-R2 supersession note added.</done>
</task>

<task type="auto">
  <name>Task 5: 63-VERIFICATION.md evidence bundle</name>
  <files>
.planning/phases/63-personality-interiority-model/63-VERIFICATION.md
  </files>
  <action>
Create `63-VERIFICATION.md` with the full Phase 63 closeout evidence bundle. Structure:

```markdown
# Phase 63 — Verification Bundle

**Date:** <ISO date>
**Verdict:** GO

## Test Suite Evidence

### Backend typecheck
```
$ npm --prefix backend run typecheck
<paste last 30 lines, including the exit-0 confirmation>
```

### Backend Vitest (full)
```
$ npm --prefix backend test -- run
<paste summary line: "Test Files X passed, Y total" + duration>
```

### Frontend lint
```
$ npm --prefix frontend run lint
<paste last 10 lines>
```

### Frontend Vitest (full)
```
$ npm --prefix frontend test -- run
<paste summary line>
```

## Per-Requirement Closure

| Req | Test File | Verification Status |
|-----|-----------|---------------------|
| P63-R1 | backend/src/character/ingestion/__tests__/synthesizer.personality.test.ts + pipeline.personality-e2e.test.ts | GREEN |
| P63-R2 | backend/src/engine/__tests__/prompt-assembler.personality.test.ts | GREEN |
| P63-R3 | backend/src/character/ingestion/__tests__/mes-example-parser.test.ts | GREEN |
| P63-R4 | frontend/components/world-review/__tests__/personality-section.test.tsx | GREEN |
| P63-R5 | frontend/components/world-review/__tests__/character-record-inspector.test.tsx | GREEN |
| P63-R6 | backend/src/scripts/__tests__/backfill-personality.test.ts + manual real-campaign run | GREEN + manual evidence below |
| P63-R7 | backend/src/routes/__tests__/schemas.personality.test.ts | GREEN |
| P63-R8 | backend/src/engine/__tests__/{npc-agent,npc-offscreen,reflection-agent}.personality.test.ts | GREEN |

## Backfill Manual Run

**Campaign:** <campaign-name + uuid>
**Pre-run state:** N players + M NPCs; <K> records had empty personality.summary.

### Dry-run
```
$ npm --prefix backend run backfill:personality -- --dry-run --campaign <id>
<paste backfill.start log line>
<paste backfill.finished log line with counts>
```

### Real run
```
$ npm --prefix backend run backfill:personality -- --campaign <id>
<paste backfill.finished line>
```

### Idempotency re-run
```
$ npm --prefix backend run backfill:personality -- --campaign <id>
<paste backfill.finished — should show written: 0, skipped: K, failed: 0>
```

### Sample backup vs. populated record diff
**Backup file:** `campaigns/<id>/logs/backfill-backup-<recordId>-<ISO>.json`

Pre-update `identity.personality`:
```json
<paste — likely undefined or {summary: ""}>
```

Post-update `identity.personality`:
```json
<paste full populated block from the live characterRecord>
```

### Log structure spot-check
Sample line from `campaigns/<id>/logs/<file>.jsonl`:
```json
<paste a line with turnId: "backfill-<id>" and event: "backfill.write">
```
Phase 58 redaction confirmed: no `apiKey` or `Authorization` in any backfill log line.

## PinchTab Smoke Evidence

**Screenshots saved under:** `.planning/phases/63-personality-interiority-model/evidence/`

| File | Description |
|------|-------------|
| `npc-card-collapsed.png` | NPC card with PERSONALITY section collapsed: summary + Voice line visible. |
| `npc-card-expanded.png` | NPC card expanded: sample lines + decision style + worldview + contradictions + mythology revealed. |
| `inspector-9-sections.png` | Advanced inspector showing 9 sections (Provenance dropped). |
| `player-card-personality.png` | Player CharacterCard rendering PersonalitySection. |
| `npc-accessibility-tree.txt` | PinchTab accessibility-tree dump for one NPC card. |

## GitNexus Diff Scope

```
$ gitnexus_detect_changes({scope: "all"})
<paste output>
```
Confirmed: changes match the union of `files_modified` from plans 63-01..63-06.

## Cross-Phase Contract Note

Phase 62 P62-R2 locked the advanced inspector at exactly 10 sections. Phase 63 supersedes that lock:
- Section count: 10 → 9 (Provenance dropped per 63-CONTEXT.md UI decision)
- Provenance metadata still available via Raw JSON tab (P62-R3 unchanged: empty-state fallback "No additional data" still works)
- REQUIREMENTS.md row updated with supersession note.

## Known Non-Blocking Issues

<list any pre-existing flakes that surfaced during full-suite run, OR write "None">

## Verdict

**Phase 63 — GO.** All 8 P63-R* requirements verified. Backfill executed end-to-end on a real campaign with full data + log evidence. PinchTab smoke confirms basic NPC card + player CharacterCard + advanced inspector all render the new contract.
```

Fill the `<paste ...>` placeholders with the actual command outputs captured in Tasks 1, 2, 3.
  </action>
  <verify>
    <automated>node -e "const t=require('fs').readFileSync('.planning/phases/63-personality-interiority-model/63-VERIFICATION.md','utf8'); if(!t.includes('Verdict')) throw new Error('missing Verdict'); for(const id of ['P63-R1','P63-R2','P63-R3','P63-R4','P63-R5','P63-R6','P63-R7','P63-R8']){ if(!t.includes(id)) throw new Error('missing '+id); } if(!t.includes('PinchTab')) throw new Error('missing PinchTab evidence'); console.log('63-VERIFICATION.md OK');"</automated>
  </verify>
  <done>63-VERIFICATION.md exists with full evidence bundle including test outputs, backfill manual-run log, PinchTab screenshot index, and GO verdict.</done>
</task>

<task type="auto">
  <name>Task 6: Flip 63-VALIDATION.md to compliant</name>
  <files>
.planning/phases/63-personality-interiority-model/63-VALIDATION.md
  </files>
  <action>
Edit `.planning/phases/63-personality-interiority-model/63-VALIDATION.md`:

1. Flip frontmatter:
   ```yaml
   nyquist_compliant: true
   wave_0_complete: true
   ```

2. In the Per-Task Verification Map, flip every row's Status from `⬜ pending` to `✅ green`.

3. In the Wave 0 Requirements section, flip every `- [ ]` to `- [x]`.

4. In Validation Sign-Off section, flip every `- [ ]` to `- [x]`.

5. Change the trailing `**Approval:** pending` line to `**Approval:** approved (<ISO date>)`.

This is the GSD workflow's contract that the phase is closed.
  </action>
  <verify>
    <automated>node -e "const t=require('fs').readFileSync('.planning/phases/63-personality-interiority-model/63-VALIDATION.md','utf8'); if(!t.includes('nyquist_compliant: true')) throw new Error('not flipped'); if(!t.includes('wave_0_complete: true')) throw new Error('wave 0 not flipped'); if(t.includes('**Approval:** pending')) throw new Error('approval still pending'); console.log('63-VALIDATION.md flipped');"</automated>
  </verify>
  <done>63-VALIDATION.md frontmatter compliant; all checklists ticked; Approval flipped.</done>
</task>

<task type="auto">
  <name>Task 7: Final gitnexus_detect_changes + index refresh</name>
  <files>(no edits — verification only)</files>
  <action>
1. Final `gitnexus_detect_changes({scope: "all"})` — capture full report. Confirm changes across all 6 plans match the union of their `files_modified` frontmatter (modulo planning files for this verification plan).

2. After commit, refresh the GitNexus index per CLAUDE.md ("Keeping the Index Fresh"):
   ```
   npx gitnexus analyze
   ```
   (Or `npx gitnexus analyze --embeddings` if `.gitnexus/meta.json` shows `stats.embeddings > 0`.)

3. The PostToolUse hook may have already handled this on commit — verify by checking `.gitnexus/meta.json` `lastAnalyzedAt` is recent.

4. Capture the final `gitnexus_detect_changes` output for the 63-VERIFICATION.md "GitNexus Diff Scope" section (already has placeholder from Task 5 — if the bundle was written before this task, retrofit the actual output).
  </action>
  <verify>
    <automated>node -e "console.log('Final gitnexus diff scope captured; index refreshed if needed')"</automated>
  </verify>
  <done>GitNexus diff scope final report captured; index up to date.</done>
</task>

</tasks>

<verification>
- All 4 quality-gate commands exit 0:
  - `npm --prefix backend run typecheck`
  - `npm --prefix backend test -- run`
  - `npm --prefix frontend run lint`
  - `npm --prefix frontend test -- run`
- Backfill script ran end-to-end on a real campaign (dry-run + real + idempotency).
- PinchTab smoke confirmed by user (Task 3 checkpoint approved).
- `.planning/phases/63-personality-interiority-model/63-VERIFICATION.md` exists with full evidence bundle.
- `.planning/phases/63-personality-interiority-model/63-VALIDATION.md` frontmatter shows `nyquist_compliant: true` + `wave_0_complete: true`.
- `.planning/REQUIREMENTS.md` shows P63-R1..R8 status `Complete` and P62-R2 supersession note.
- gitnexus_detect_changes scope matches the union of all 6 plans' files_modified.
</verification>

<success_criteria>
- Full backend + frontend test suites green.
- Backfill executed on a real dev campaign with documented before/after diff + structured log evidence.
- PinchTab smoke captured (4 screenshots + 1 accessibility-tree dump).
- 63-VERIFICATION.md evidence bundle complete with GO verdict.
- 63-VALIDATION.md flipped to compliant.
- REQUIREMENTS.md traceability flipped (P63-R*) + P62-R2 supersession note added.
- gitnexus_detect_changes final report captured.
- Phase 63 ready for /gsd:complete-phase ROADMAP closeout.
</success_criteria>

<requirement_coverage>
- **All 8 requirements (P63-R1..R8)** — final verification + traceability flip.
- **P62-R2 supersession** — bookkeeping for the 10 → 9 inspector section count change introduced by 63-04.
</requirement_coverage>

<estimates>
- **Effort:** ~50 min Claude execution time (4 automated tasks + 1 checkpoint + 2 doc tasks; the manual backfill run takes the most wall-clock at ~5 min for a 20-NPC campaign).
- **LLM token cost:** Backfill real run on a ~20-NPC campaign ≈ $0.04 on GLM (per RESEARCH §7.3 estimate). Negligible.
- **Test runtime:** ~4 min combined backend + frontend full suites (per VALIDATION.md).
- **PinchTab checkpoint wall-clock:** ~10 min user-attended (navigate, click, screenshot, approve).
</estimates>

<risks>
- **R1 — Backfill real-run failures.** GLM may underfill / reject the strict schema on some records (RESEARCH §11 risk #2). **Mitigation (REVIEWS fix #6 LOCKED):** Per-record error isolation (63-05 Task 2 Test 5) means partial success is recoverable. Failed records are logged in `.planning/BACKLOG.md` with full context. Document each failure in 63-VERIFICATION.md. **Do NOT switch to OpenRouter** — `feedback_openrouter_embargo.md` is NON-NEGOTIABLE (NO EXCEPTIONS). Retry strategy for persistent failures: investigate prompt issues, adjust GLM model version via settings, retry. If a record ultimately cannot be backfilled, leave it unbackfilled and document the gap; it will render an empty Personality section in the UI (RESEARCH §11 default — intentional gap visibility).
- **R2 — PinchTab localhost regression.** STATE.md notes Phase 33 had repeated PinchTab localhost transport issues. **Mitigation:** If PinchTab can't reach localhost:3000, document the specific blocker in 63-VERIFICATION.md (per Phase 33 precedent — record the blocker, do not substitute another transport per `feedback_real_testing.md`). The checkpoint becomes a known external blocker rather than a Phase 63 regression.
- **R3 — Pre-existing flakes surface during full-suite.** **Mitigation:** Task 1 explicitly classifies findings as in-scope / pre-existing-flake / out-of-scope-regression; only out-of-scope-regression halts the phase.
- **R4 — Backup file path collisions.** If two records get the same ISO timestamp (sub-millisecond batch), backup files could collide. **Mitigation:** Backfill script (63-05) uses `id-<recordId>-<timestamp>` so the recordId disambiguates; no collision risk in practice.
- **R5 — Phase 62 P62-R2 contract change ripple.** Other phases may have asserted P62-R2 indirectly. **Mitigation:** Task 4 grep-search REQUIREMENTS.md for "P62-R2" references; the supersession note is the only canonical change required.
</risks>

<output>
After completion, create `.planning/phases/63-personality-interiority-model/63-06-SUMMARY.md` with:
- Tasks completed (1-7)
- All 4 quality-gate command outputs (last lines)
- Backfill manual run summary
- PinchTab evidence file paths
- 63-VERIFICATION.md location
- 63-VALIDATION.md flip confirmation
- REQUIREMENTS.md flip confirmation
- gitnexus_detect_changes final report
- Note: Phase 63 ready for /gsd:complete-phase

Then update `.planning/STATE.md` Current Position to mark Phase 63 complete (per GSD workflow), and update Phase 63 ROADMAP entry to flip all 6 plan checkboxes from `- [ ]` to `- [x]`.
</output>

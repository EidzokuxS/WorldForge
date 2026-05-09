# Phase 76: Full Historical Phase Promise Audit and De-Jure/De-Facto Gap Closure - Pattern Map

**Mapped:** 2026-04-30  
**Files analyzed:** 13 planned/affected artifacts  
**Analogs found:** 13 / 13  
**Scope:** Planning/audit artifacts only. No source-code edits are part of this pattern map.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `76-HISTORICAL-PROMISE-AUDIT.md` | audit artifact | batch, traceability | `36-CLAIMS.md`, `36-RUNTIME-MATRIX.md`, `75-REGRESSION-MATRIX.md` | exact |
| `76-GAP-LEDGER.md` | gap ledger | batch triage, routing | `36-HANDOFF.md`, `75-REGRESSION-MATRIX.md`, `.planning/BACKLOG.md` | exact |
| `76-VALIDATION.md` | validation artifact | batch, file-I/O, static coverage | `36-VERIFICATION.md`, `75-VALIDATION.md`, `55-VERIFICATION.md` | exact |
| `76-01-PLAN.md` | execution plan | batch audit | archive README, `v1.0-MILESTONE-AUDIT.md` | role-match |
| `76-02-PLAN.md` | execution plan | batch audit | `v1.1-MILESTONE-AUDIT.md`, `55-VERIFICATION.md` | role-match |
| `76-03-PLAN.md` | execution plan | batch audit | `74-VERIFICATION-MATRIX.md`, `75-PROMISE-AUDIT.md` | role-match |
| `76-04-PLAN.md` | execution plan | batch audit, closeout review | `75-REGRESSION-MATRIX.md`, `75-VERIFICATION.md`, `74-VERIFICATION-MATRIX.md` | exact |
| `76-05-PLAN.md` | execution plan | batch audit, recent phases | `75-REGRESSION-MATRIX.md`, `75-VERIFICATION.md`, `74-VERIFICATION-MATRIX.md` | exact |
| `76-06-PLAN.md` | execution plan | synthesis, docs reconciliation | `36-HANDOFF.md`, `55-VERIFICATION.md`, `75-VERIFICATION.md` | exact |
| `.planning/ROADMAP.md` | planning state | traceability reconciliation | `75-07-SUMMARY.md`, `55-02-SUMMARY.md` | role-match |
| `.planning/REQUIREMENTS.md` | requirement traceability | traceability reconciliation | `75-VERIFICATION.md`, `36-VERIFICATION.md` | exact |
| `.planning/STATE.md` | planning state | closeout reconciliation | `75-VERIFICATION.md`, `55-VERIFICATION.md` | role-match |
| `.planning/BACKLOG.md` | backlog ledger | routing, deferred work | `36-HANDOFF.md`, current `.planning/BACKLOG.md` entries | exact |

## Pattern Assignments

### `76-HISTORICAL-PROMISE-AUDIT.md` (audit artifact, batch traceability)

**Analog:** `36-CLAIMS.md`, `36-RUNTIME-MATRIX.md`, `75-REGRESSION-MATRIX.md`

**Scope and row contract** (`76-CONTEXT.md` lines 18-32):
```markdown
- Every phase from 0/1 through 75 must have at least one row in the audit matrix.
- A phase is not covered by mentioning its milestone or a nearby newer phase; it needs its own status and evidence.
- The matrix must include: phase number, phase title, promised behavior, current evidence checked, classification, risk, owner/fix decision, and whether code/tests/docs need changes.

- Use these statuses consistently: `verified-current`, `stale-unwired`, `partial`, `superseded`, `deprecated`, `follow-up`, `not-applicable`, `needs-human-UAT`.
- `verified-current` requires evidence from live code/tests/runtime-facing artifacts, not just a completed checkbox.
```

**Claim register pattern** (`36-CLAIMS.md` lines 11-25):
```markdown
- One row = one testable gameplay behavior or runtime contract.
- `runtime_status` is intentionally left as `pending_36_02` in this plan.
- Plan 36-02 must replace `pending_36_02` with exactly one of:
  - `implemented_and_wired`
  - `implemented_but_partial`
  - `documented_but_missing`
  - `outdated_or_contradicted`
- `claim_type` is one of: `behavioral_rule`, `data_contract`, `ui_expectation`, `architectural_constraint`.
- Ambiguities and contradictions are preserved in the `Notes` column instead of being silently resolved here.
```

**Classification matrix pattern** (`36-RUNTIME-MATRIX.md` lines 5-20):
```markdown
| Classification | Count |
| --- | ---: |
| `implemented_and_wired` | 75 |
| `implemented_but_partial` | 48 |
| `documented_but_missing` | 7 |
| `outdated_or_contradicted` | 6 |
| Total claims | 136 |

- `implemented_and_wired`: the full documented behavior executes in a real runtime path without dead seams.
- `implemented_but_partial`: some runtime path exists, but a documented trigger, consequence, or integrity boundary is missing or unreliable.
- `documented_but_missing`: no live runtime path satisfies the claim; dormant scaffolding alone does not qualify.
- `outdated_or_contradicted`: the docs claim no longer matches the live architecture or later implemented design.
```

**Completed-promise evidence rule** (`75-REGRESSION-MATRIX.md` lines 3-18):
```markdown
Closeout rule: a completed-phase promise is not implemented from schema, helper, route, or prompt-contract existence alone. A row becomes implemented only when evidence proves source data reaches player-visible behavior, or when the promise is explicitly deprecated or moved to a follow-up.

| Source | Material promise | Current evidence | Classification | Owner plan | P75 requirements |
|---|---|---|---|---|---|
```

**Copy shape for Phase 76:**
```markdown
| Audit Key | Phase Source | Phase # | Title | Material Promise | Evidence Checked | Classification | Risk | Disposition | Code/Tests/Docs Change |
|---|---|---:|---|---|---|---|---|---|---|
```

Use `Phase Source` to distinguish active `17-unit-test-coverage...` from archived legacy `17-world-generation-pipeline-e2e`.

**Revised parser contract from cross-AI reviews:**

- Row granularity is minimum one row per expected phase key. Use multiple rows for the same phase when separate material promises require separate evidence or classifications.
- `Audit Key` is globally unique; duplicate keys are invalid even when rows come from different slices.
- Column order is fixed exactly as shown. Literal pipes inside cells must be escaped as `\|`; unescaped pipes that change column count are invalid.
- Each slice/final audit must include a `## Structured Audit Rows` appendix with a fenced `jsonl` block, one JSON object per audit row. Validator parses JSONL as canonical and checks Markdown table key parity.
- Path-like evidence marker values must exist where feasible when they start with `.planning/`, `backend/`, `frontend/`, `shared/`, `docs/`, or `tasks/`, or contain a slash/backslash. Route prose such as `route:POST /api/chat` is exempt.

### `76-GAP-LEDGER.md` (gap ledger, batch triage)

**Analog:** `36-HANDOFF.md`, `75-REGRESSION-MATRIX.md`, `.planning/BACKLOG.md`

**Not-safe baseline pattern** (`36-HANDOFF.md` lines 23-32):
```markdown
### Not Safe To Treat As Solved

These areas exist in code but are not trustworthy enough to treat as "done":

- Reflection/progression loop
- Rollback and checkpoint fidelity
- Inventory/equipment state authority
- Gameplay transport/session coupling
- Player-visible turn atomicity vs deferred post-turn simulation
```

**Priority ledger pattern** (`36-HANDOFF.md` lines 34-48):
```markdown
## Priority Groups

Priority groups are execution guidance for the next milestone. They are not hard phase promises.

| ID | Handoff Item | Source claim IDs | Matrix source | Rationale | Dependency constraints |
| --- | --- | --- | --- | --- | --- |
```

**Candidate ledger pattern** (`75-REGRESSION-MATRIX.md` lines 72-81):
```markdown
## Phase 76 Candidate Ledger

| Candidate | Reason | Not Phase 75 primary | Evidence source |
|---|---|---|---|
| Active role-model live conformance release gate | Phase 74 still records active provider conformance as release-blocking due timeout/failure. | Phase 75 can close deterministic scaffold/presence data without waiting for live provider stability. | `.planning/STATE.md`, `75-PROMISE-AUDIT.md` |
```

**Backlog routing pattern** (`.planning/BACKLOG.md` lines 39-54):
```markdown
## 999.4: ScenePlan Nested Action-Input Repair and Bounded Fallback Latency

**Idea:** Harden the normal `/action` ScenePlan path against nested tool-input shape failures after `safeGenerateObject` already returns success.

**Observed failure:** route `/action`, outcome `restored`.

**Scope to investigate:**
- Add regression fixture for nested `plannedActions[].input.actions[]` missing `action` but containing recoverable aliases/shape.
```

**Copy shape for Phase 76:**
```markdown
| Gap ID | Audit Key | Source Phase(s) | Material Promise | Classification | Severity | Evidence | Slice Candidate Provenance | Recommended Routing | Owner Recommendation | Blocking? | Backlog Link |
|---|---|---|---|---|---|---|---|---|---|---|---|
```

Allowed routing values should be: `immediate-docs-state-fix`, `future-implementation-phase`, `backlog`, `deprecate`, `needs-human-UAT`, `not-applicable`.

Backlog-routed rows must be bidirectional: the ledger row names the backlog item in `Backlog Link`, and the backlog entry names `Source Audit Row: <Audit Key>` plus `Source Ledger Gap: <Gap ID>`.

### `76-VALIDATION.md` (validation artifact, file-I/O/static coverage)

**Analog:** `36-VERIFICATION.md`, `75-VALIDATION.md`, `55-VERIFICATION.md`, Phase 74 static audit tests.

**Artifact checklist pattern** (`36-VERIFICATION.md` lines 14-21):
```markdown
| Artifact | Expected | Result | Notes |
| --- | --- | --- | --- |
| `36-CLAIMS.md` | One normalized gameplay claim register with provenance across the in-scope docs surface | passed | Register exists and contains 136 claim rows with stable IDs. |
| `36-RUNTIME-MATRIX.md` | Every claim classified as wired, partial, missing, or outdated | passed | Matrix exists and classifies all 136 claims. |
```

**Coverage count proof pattern** (`36-VERIFICATION.md` lines 52-55):
```markdown
Verification result:
- Claim register count: 136
- Matrix classified count: 136
- Missing or extra claim IDs between register and matrix: none
```

**Requirement validation matrix pattern** (`75-VALIDATION.md` lines 11-24):
```markdown
| Validation ID | Requirement(s) | Acceptance Signal | Evidence Artifact |
|---------------|----------------|-------------------|-------------------|
| P75-V01 | P75-R1, P75-R2 | Completed phase promises are audited against current code and prioritized by user-visible gameplay impact. | `75-PROMISE-AUDIT.md`, `75-01-SUMMARY.md` |
```

**Behavioral spot-check pattern** (`55-VERIFICATION.md` lines 40-46):
```markdown
| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Save-character route proof | `npm --prefix backend exec vitest run src/routes/__tests__/character.test.ts` | `1 file passed, 19 tests passed` | PASS |
| Opening-scene smoke artifact coverage | `rg -n "opening-scene|opening scene|opening prose" ...` | Opening-scene coverage found in all three target artifacts. | PASS |
```

**Executable static audit pattern** (`backend/src/ai/__tests__/structured-prompt-contract-audit.test.ts` lines 1-20, 220-291):
```typescript
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type RequiredAuditRow = {
  source: string;
  priority: "P0" | "P1" | "P2";
  planOwner: string;
  markers: string[];
  requiredText?: string[];
};

function readAudit(): string {
  return fs.readFileSync(AUDIT_PATH, "utf8");
}

function findProductionChecklistRow(audit: string, source: string): string | undefined {
  return audit
    .split(/\r?\n/)
    .find((line) => line.includes(`\`${source}\``) && line.includes("Plan owner:"));
}

expect(failures).toEqual([]);
```

**Filesystem inventory pattern** (`backend/src/ai/__tests__/structured-output-boundary.test.ts` lines 51-99):
```typescript
function collectStructuredOutputBoundaryFiles(): string[] {
  const srcRoot = path.resolve(process.cwd(), "src");
  return collectSourceFiles(srcRoot)
    .filter((filePath) => {
      const source = readSource(filePath);
      const safeGenerateObjectImport =
        /from\s*["'][^"']*generate-object-safe\.js["']/.test(source);
      const directTextImport =
        /import\s*\{[^}]*\b(?:generateText|streamText)\b[^}]*\}\s*from\s*["']ai["']/s.test(source);
      const directTextCall = /\b(?:generateText|streamText)\s*\(/.test(source);
      return safeGenerateObjectImport || (directTextImport && directTextCall);
    })
    .map(toInventoryPath)
    .sort();
}

expect(missing).toEqual([]);
```

**Phase 76 validation target:** `76-RESEARCH.md` lines 64-79 confirms two required counters:

- integer phase coverage `1-75 = 75/75`;
- archived-extra coverage for `17-legacy` and `19.1 = 2/2`.

The validator must derive these from the filesystem, preserve decimal IDs, namespace archived duplicate IDs, parse `## Structured Audit Rows` JSONL plus the Markdown mirror in `76-HISTORICAL-PROMISE-AUDIT.md`, fail on missing expected rows, fail on duplicate `Audit Key`, fail when any non-`verified-current` row lacks a disposition, and fail when path-like evidence references do not exist where feasible.

Plan 76-01 must also create `tools/fixtures/76-audit-parser-fixtures.md` and a `--self-test` mode proving:
- valid fixture passes;
- duplicate audit key fixture fails;
- non-verified row without disposition fixture fails;
- missing path-like evidence fixture fails.

### `76-01-PLAN.md` through `76-06-PLAN.md` (execution plans, bounded audit slices)

**Analog:** Phase 76 context, archive README, v1.0/v1.1 milestone audits.

**Required slicing pattern** (`76-CONTEXT.md` lines 81-83):
```markdown
4. Execution plans
   - Split the audit into bounded slices small enough for agents to inspect without context overload.
   - Suggested slicing: archived v1.0, v1.1 early phases 37-55, v1.1 mid phases 56-69, recent phases 70-75, synthesis/gap-ledger/closeout.
```

**Archived source handling** (`archive/legacy-phases/.../README.md` lines 1-17):
```markdown
These phase directories were moved out of `.planning/phases/` on 2026-03-30 during planning hygiene cleanup.

Why they were moved:
- They belonged to an older active roadmap numbering scheme.
- They conflicted with the current active roadmap and created false GSD health warnings.
- The artifacts are preserved here for historical reference instead of being deleted.
```

**Milestone audit scorecard** (`v1.0-MILESTONE-AUDIT.md` lines 53-84):
```markdown
| Dimension | Score | Notes |
|---|---:|---|
| Requirements | 73/73 | Original v1 requirements remain fully mapped in [REQUIREMENTS.md](R:\Projects\WorldForge\.planning\REQUIREMENTS.md). |
| Phase Verification | 22/30 | 22 phases have `status: passed`, 1 remains `human_needed`, and 7 have no phase-level `VERIFICATION.md`. |
```

**Recent audit scorecard** (`v1.1-MILESTONE-AUDIT.md` lines 23-38):
```markdown
| Dimension | Score | Notes |
|---|---:|---|
| Requirements mapping | 22/22 | [REQUIREMENTS.md](R:\Projects\WorldForge\.planning\REQUIREMENTS.md) is still fully mapped. |
| Phase artifacts | 16/16 | Every v1.1 phase has planning/verification artifacts. |
| Confirmed implementation gaps | 4 | Four active gaps still affect real product behavior or trust boundaries. |
| Verification blind spots | 3 | Three additional gaps are verification/documentation coverage problems, not yet proven runtime failures. |
```

| Plan | Slice | Required output contribution |
|---|---|---|
| `76-01-PLAN.md` | corpus inventory, audit schema, validator | immutable expected-row ledger, classification rules, validator implementation |
| `76-02-PLAN.md` | v1.0 and archived legacy phases | rows for active early phases, archived `17-legacy`, `18`, `19`, `19.1`, `20`, `21`, `22`, duplicate active/legacy numbering handled |
| `76-03-PLAN.md` | active phases 37-55 | audit rows for active phase artifacts; use Phase 36/55 proof style |
| `76-04-PLAN.md` | phases 56-69 | audit rows for mid-v1.1 implementation and verification artifacts |
| `76-05-PLAN.md` | phases 70-75 and Phase 75 correction | audit rows for authority propagation, structured output, prompt contracts, and Phase 75 location-presence correction |
| `76-06-PLAN.md` | synthesis/ledger/validation/closeout | final coverage counter, cross-slice conflict/supersession merge notes, `76-GAP-LEDGER.md`, `76-VALIDATION.md`, deterministic planning truth reconciliation |

### `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/BACKLOG.md` (planning truth reconciliation)

**Analog:** `75-VERIFICATION.md`, `55-VERIFICATION.md`, current `BACKLOG.md`.

**P76 requirement source** (`REQUIREMENTS.md` lines 206-213):
```markdown
- [ ] **P76-R1**: Every prior phase from archived v1.0 through Phase 75 has an explicit audit matrix row with phase number, title, promised behavior, evidence checked, classification, risk, and disposition.
- [ ] **P76-R2**: The audit distinguishes `verified-current`, `stale-unwired`, `partial`, `superseded`, `deprecated`, `follow-up`, `not-applicable`, and `needs-human-UAT` without treating old summaries or checkboxes as sufficient evidence.
- [ ] **P76-R3**: Material stale/unwired/partial promises are collected into a gap ledger with severity, owner recommendation, and explicit routing to immediate fix, future phase, backlog, deprecation, or UAT.
- [ ] **P76-R4**: Automated coverage validation proves no expected phase number was skipped and that every non-verified row has a disposition.
- [ ] **P76-R5**: Planning truth is reconciled so Phase 75 is described as location-presence closure only, while Phase 76 owns the full historical audit.
- [ ] **P76-R6**: Phase 76 avoids silent product implementation scope creep; any large discovered gap becomes an explicit follow-up plan/phase unless it is a small deterministic docs/state repair.
```

**Final truth table pattern** (`75-VERIFICATION.md` lines 33-49):
```markdown
| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Promise audit and stale-claim classification exist | PASS | `75-PROMISE-AUDIT.md`, `75-REGRESSION-MATRIX.md`, `75-VALIDATION.md`; P75-R1..R8 complete in `.planning/REQUIREMENTS.md:197-204` and trace table `.planning/REQUIREMENTS.md:359-366`. |
```

**Remaining classified items pattern** (`75-VERIFICATION.md` lines 72-80):
```markdown
| Item | Classification | Why not Phase 75 gap |
|---|---|---|
| Active provider structured-output conformance | Gap closure required outside Phase 75 | Separate Phase 74 release gate; deterministic Phase 75 chain does not depend on live provider success. |
| Live generated-world gameplay/UAT | Follow-up gate | Deterministic source-to-visible code path is covered; subjective live play requires human/provider run. |
```

Apply planning truth edits only after the audit and gap ledger exist. Phase 75 must stay described as location-presence closure only; Phase 76 owns the full historical audit. Phase 76 planning-truth edits are capped to deterministic ROADMAP/STATE/REQUIREMENTS/BACKLOG deltas; broad product fixes, speculative rewrites, and cleanup beyond audit-row/backlog traceability become follow-up work.

## Shared Patterns

### Evidence Standard

**Source:** `76-CONTEXT.md` lines 29-32 and `75-REGRESSION-MATRIX.md` line 5  
**Apply to:** all audit rows, validation rows, and closeout wording.

Schema existence, helper existence, old SUMMARY claims, or roadmap checkboxes are insufficient by themselves. Each material promise needs current source, tests, route/runtime flow, frontend consumption, verification artifact, or explicit deprecation/supersession.

### No Silent Scope Narrowing

**Source:** `76-CONTEXT.md` lines 10-12 and `tasks/lessons.md` lines 3-10  
**Apply to:** plan slicing, audit closeout, final verification.

The output is not allowed to be a thematic sample. It must be a phase-by-phase coverage matrix, with gameplay promises proven from generated/input data to player-visible behavior or explicitly deprecated/followed up.

### Static Coverage Validation

**Source:** `structured-prompt-contract-audit.test.ts` lines 220-291 and `structured-output-boundary.test.ts` lines 51-99  
**Apply to:** `76-VALIDATION.md`; optional temporary or permanent test if planner wants executable enforcement.

Reuse the pattern of loading planning artifacts as text, building expected rows from filesystem inventory, parsing structured rows, checking Markdown mirror parity, and asserting missing/invalid lists equal `[]`.

### Live/Provider Gates Are Separate

**Source:** `74-VERIFICATION-MATRIX.md` lines 20-47 and `backend/src/scripts/structured-output-conformance.ts` lines 155-164  
**Apply to:** Phase 73/74 rows.

Record live provider/UAT gaps honestly, but do not block the documentary/source audit on live provider runs unless a specific phase promise requires live evidence.

## No Exact Analog Found

| File/Need | Role | Data Flow | Reason |
|---|---|---|---|
| Phase-76-specific historical coverage script | utility/test | file-I/O static coverage | No existing script counts every historical phase row. Closest analogs are Phase 74 static audit tests and Phase 36 count-proof verification. |

## Metadata

**Analog search scope:** `.planning/phases`, `.planning/archive/legacy-phases`, `.planning/milestones`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/BACKLOG.md`, `tasks/lessons.md`, `backend/src/ai/__tests__`, `backend/src/scripts`  
**Representative artifacts read:** `76-CONTEXT.md`; `76-RESEARCH.md`; Phase 75 context/audit/regression/validation/verification/review/research/summary; Phase 36 claims/runtime matrix/handoff/verification; Phase 55 verification/summaries; Phase 74 audit/verification matrix/source tests; v1.0/v1.1 milestone audits; legacy archive README  
**Pattern extraction date:** 2026-04-30  
**Source-code edit policy:** None. If Phase 76 later discovers a code fix, planner must create explicit execution scope and run GitNexus impact analysis before any symbol edit.

# Phase 76: Full Historical Phase Promise Audit and De-Jure/De-Facto Gap Closure - Research

**Researched:** 2026-04-30 [VERIFIED: environment current_date]
**Domain:** Corrective planning/source audit, historical promise reconciliation, evidence validation [VERIFIED: .planning/phases/76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap/76-CONTEXT.md]
**Confidence:** HIGH for audit method and corpus inventory; MEDIUM for exact future slice workload because the audit itself has not yet classified every phase row [VERIFIED: .planning/ROADMAP.md; .planning/archive/legacy-phases/2026-03-30-superseded-active-phase-dirs/README.md; .planning/STATE.md]

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

Source: `.planning/phases/76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap/76-CONTEXT.md` [VERIFIED: .planning/phases/76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap/76-CONTEXT.md]

#### Exhaustive Coverage
- Every phase from 0/1 through 75 must have at least one row in the audit matrix.
- A phase is not covered by mentioning its milestone or a nearby newer phase; it needs its own status and evidence.
- The matrix must include: phase number, phase title, promised behavior, current evidence checked, classification, risk, owner/fix decision, and whether code/tests/docs need changes.

#### Classification Vocabulary
- Use these statuses consistently: `verified-current`, `stale-unwired`, `partial`, `superseded`, `deprecated`, `follow-up`, `not-applicable`, `needs-human-UAT`.
- `verified-current` requires evidence from live code/tests/runtime-facing artifacts, not just a completed checkbox.
- `superseded` requires a newer phase or document that explicitly replaces the old promise.
- `follow-up` must name a concrete next phase/gap candidate or backlog item.

#### Evidence Standard
- Schema existence, helper existence, old SUMMARY claims, or roadmap checkboxes are insufficient by themselves.
- Each material promise must be checked against at least one of: current source code, current tests, route/runtime flow, frontend consumption, verification artifact, or explicit deprecation/supersession document.
- If evidence is too expensive to prove in Phase 76, classify as `needs-human-UAT` or `follow-up`; do not mark as verified.

#### Audit Scope
- Include archived v1.0 phases if they are still part of product truth, not only active v1.1 phases.
- Include planning/documentation drift when it can cause agents to make wrong implementation decisions.
- Prioritize user-visible gameplay/worldgen/runtime promises over cosmetic wording, but do not omit cosmetic/planning drift if it creates false active truth.

#### Fix Scope
- Phase 76 may make small deterministic documentation/state fixes discovered during the audit.
- Phase 76 should not silently implement large product fixes while auditing. Large stale/unwired areas should become explicit gap phases/plans unless they are tiny and safe.
- Any immediate code fix must have GitNexus impact analysis, tests, and review like normal GSD work.

#### Phase 75 Correction
- Phase 75 remains valid for the location-presence closure, but it must not be described as the full historical audit.
- Phase 76 exists because the original "audit all phases 0-75" requirement was not fulfilled.

### Claude's Discretion

No `## Claude's Discretion` section exists in `76-CONTEXT.md`; discretion is limited to implementation details that preserve the locked exhaustive audit boundary. [VERIFIED: .planning/phases/76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap/76-CONTEXT.md]

### Deferred Ideas (OUT OF SCOPE)

Source: `.planning/phases/76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap/76-CONTEXT.md` [VERIFIED: .planning/phases/76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap/76-CONTEXT.md]

- Large implementation gaps found by the audit should become explicit follow-up phases or backlog items unless they are tiny deterministic planning-state fixes.
- Full live gameplay/UAT remains separate from documentary/source audit unless a phase promise specifically requires live play evidence.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| P76-R1 | Every prior phase from archived v1.0 through Phase 75 has an explicit audit matrix row with phase number, title, promised behavior, evidence checked, classification, risk, and disposition. [VERIFIED: .planning/REQUIREMENTS.md] | Use the corpus inventory and validation gates in this research: active prior phase dirs count `70`, archived legacy dirs count `7`, unique integer coverage `1-75`, decimal archived `19.1`, and duplicate archived `17` requiring an extra legacy row. [VERIFIED: filesystem inventory; .planning/archive/legacy-phases/2026-03-30-superseded-active-phase-dirs/README.md] |
| P76-R2 | The audit distinguishes `verified-current`, `stale-unwired`, `partial`, `superseded`, `deprecated`, `follow-up`, `not-applicable`, and `needs-human-UAT` without treating old summaries or checkboxes as sufficient evidence. [VERIFIED: .planning/REQUIREMENTS.md] | Use the evidence ladder, classification rules, and anti-patterns sections below. [VERIFIED: .planning/phases/76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap/76-CONTEXT.md; .planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-REGRESSION-MATRIX.md] |
| P76-R3 | Material stale/unwired/partial promises are collected into a gap ledger with severity, owner recommendation, and explicit routing to immediate fix, future phase, backlog, deprecation, or UAT. [VERIFIED: .planning/REQUIREMENTS.md] | Use the `76-GAP-LEDGER.md` schema and routing table in Architecture Patterns. [VERIFIED: .planning/phases/76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap/76-CONTEXT.md; .planning/BACKLOG.md] |
| P76-R4 | Automated coverage validation proves no expected phase number was skipped and every non-verified row has a disposition. [VERIFIED: .planning/REQUIREMENTS.md] | Use the validation architecture and Node coverage examples below. [VERIFIED: filesystem inventory; package.json; backend/package.json; frontend/package.json] |
| P76-R5 | Planning truth is reconciled so Phase 75 is described as location-presence closure only, while Phase 76 owns the full historical audit. [VERIFIED: .planning/REQUIREMENTS.md] | Treat Phase 75 artifacts as evidence for one closed location-presence chain and as the correction trigger, not as full historical coverage. [VERIFIED: .planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-VERIFICATION.md; .planning/phases/76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap/76-CONTEXT.md] |
| P76-R6 | Phase 76 avoids silent product implementation scope creep; any large discovered gap becomes an explicit follow-up plan/phase unless it is a small deterministic docs/state repair. [VERIFIED: .planning/REQUIREMENTS.md] | Use the fix-scope guardrail, GitNexus pre-edit rule, and gap-ledger disposition rules below. [VERIFIED: CLAUDE.md; .planning/phases/76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap/76-CONTEXT.md] |

</phase_requirements>

## Summary

Phase 76 should be planned as an evidence-led audit pipeline, not as another thematic bug hunt. [VERIFIED: .planning/phases/76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap/76-CONTEXT.md] The prior Phase 75 artifacts are valid only for the dense generated-location and scoped-presence chain; Phase 75 explicitly does not claim live provider conformance or subjective live-play UAT. [VERIFIED: .planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-VERIFICATION.md]

The audit corpus is larger than the active `.planning/phases` directory. [VERIFIED: filesystem inventory] Active prior phase directories cover `70` phase numbers through Phase 75, while archived legacy phase directories add material rows for `18`, `19`, `19.1`, `20`, `21`, `22`, plus a superseded legacy `17` that conflicts by number with the active Phase 17. [VERIFIED: filesystem inventory; .planning/archive/legacy-phases/2026-03-30-superseded-active-phase-dirs/README.md] Therefore the planner should require two counters: integer phase coverage `1-75 = 75/75`, and archived-extra coverage for `17-legacy` plus `19.1 = 2/2`. [VERIFIED: filesystem inventory]

**Primary recommendation:** Plan Phase 76 as five bounded audit slices plus one synthesis/validation slice, with each slice producing rows in `76-HISTORICAL-PROMISE-AUDIT.md`, routed findings in `76-GAP-LEDGER.md`, and coverage proof in `76-VALIDATION.md`; block closeout if any integer `1-75`, archived duplicate, or decimal legacy phase lacks a row and disposition. [VERIFIED: .planning/phases/76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap/76-CONTEXT.md; filesystem inventory]

## Project Constraints (from CLAUDE.md)

| Directive | Planning Impact |
|---|---|
| WorldForge is a Node.js/TypeScript backend plus Next.js frontend project. [VERIFIED: CLAUDE.md; package.json; backend/package.json; frontend/package.json] | Audit evidence may need source/tests across backend, frontend, and shared packages. [VERIFIED: CLAUDE.md] |
| Core architecture rule: LLM is narrator only and deterministic backend code owns mechanical truth. [VERIFIED: CLAUDE.md] | Classify promises by authority owner; do not mark an LLM-prose claim verified if backend state/runtime evidence is absent. [VERIFIED: CLAUDE.md; .planning/REQUIREMENTS.md] |
| AI agents use structured tool calling and backend validates every tool call before execution. [VERIFIED: CLAUDE.md] | Structured-output and tool-call promises require validation/schema/executor evidence, not prompt wording alone. [VERIFIED: CLAUDE.md; .planning/STATE.md] |
| SQLite is source of truth and LanceDB is semantic memory. [VERIFIED: CLAUDE.md] | Persistence promises need SQLite/config/checkpoint evidence; LanceDB evidence is enough only for semantic-memory claims. [VERIFIED: CLAUDE.md] |
| Use Drizzle query builder, Zod schemas, and shared `@worldforge/shared` types for implementation work. [VERIFIED: CLAUDE.md] | If Phase 76 discovers tiny code fixes, planner must route them through existing conventions and GitNexus impact analysis. [VERIFIED: CLAUDE.md] |
| Commands include `npm --prefix backend run typecheck`, `npm --prefix frontend run lint`, and workspace build/test scripts. [VERIFIED: CLAUDE.md; package.json; backend/package.json; frontend/package.json] | Verification rows should prefer existing targeted tests/typechecks and should not invent new runners. [VERIFIED: package.json; backend/package.json; frontend/package.json] |
| GitNexus index must be used for code understanding and impact/scope checks before edits/commits. [VERIFIED: CLAUDE.md; gitnexus://repo/WorldForge/context] | Source-code changes are out of scope unless tiny and approved by audit disposition; any source edit needs GitNexus impact plus tests/review. [VERIFIED: CLAUDE.md; .planning/phases/76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap/76-CONTEXT.md] |
| Project-local skills include GitNexus and Desloppify; Desloppify should not trigger for general audit work unless code-health scanning is explicitly requested. [VERIFIED: .claude/skills/desloppify/SKILL.md; .claude/skills/gitnexus/gitnexus-exploring/SKILL.md] | Use GitNexus for runtime path exploration; do not turn Phase 76 into a Desloppify cleanup pass. [VERIFIED: .claude/skills/desloppify/SKILL.md; .claude/skills/gitnexus/gitnexus-exploring/SKILL.md] |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Phase corpus inventory and coverage validation | Planning / Static Analysis | Filesystem | Phase rows are discovered from `.planning/ROADMAP.md`, `.planning/milestones/`, `.planning/phases/`, and `.planning/archive/legacy-phases/`. [VERIFIED: .planning/ROADMAP.md; .planning/milestones/v1.0-ROADMAP.md; filesystem inventory] |
| Runtime promise evidence | Backend / API | Frontend / Tests | Material gameplay/worldgen promises require source, tests, route/runtime flow, frontend consumption, verification artifacts, or explicit deprecation. [VERIFIED: 76-CONTEXT.md; 75-REGRESSION-MATRIX.md] |
| User-visible behavior proof | Frontend / Browser-facing API | Backend / Test Fixtures | Phase 75 proved that source-to-visible chains must include route/runtime/frontend proof rather than schema-only proof. [VERIFIED: 75-REGRESSION-MATRIX.md; 75-VERIFICATION.md] |
| Gap routing | Planning | Backlog / Future Roadmap | Large discovered gaps become explicit follow-up phases/backlog items, while only tiny deterministic docs/state fixes can happen inside Phase 76. [VERIFIED: 76-CONTEXT.md; .planning/BACKLOG.md] |
| Source-edit safety | GitNexus / Backend-Frontend Codebase | Test Framework | CLAUDE.md requires GitNexus impact before source edits and detect-changes before commits. [VERIFIED: CLAUDE.md; gitnexus://repo/WorldForge/context] |

## Standard Stack

### Core

| Tool / Artifact | Version / Status | Purpose | Why Standard |
|---|---:|---|---|
| Markdown planning artifacts | Existing `.planning` corpus | Audit source of record and output format | Phase 76 deliverables are Markdown files in the phase directory. [VERIFIED: 76-CONTEXT.md] |
| Node.js | `v23.11.0` | Coverage validation scripts and JSON/table checks | Node is installed and the project is an npm workspace. [VERIFIED: node --version; package.json] |
| npm workspaces | `11.12.1` | Existing backend/frontend/shared commands | Root package declares `shared`, `frontend`, and `backend` workspaces. [VERIFIED: npm --version; package.json] |
| ripgrep | `14.1.0` | Fast TODO/follow-up/stale-term scans over planning and source files | `rg` is installed and faster than ad hoc recursive PowerShell matching for broad scans. [VERIFIED: rg --version] |
| GitNexus | Available; run `npx gitnexus status` before source-code audit/edit work | Code path discovery and scope/impact checks if code evidence or edits are needed | Project instructions require GitNexus for unfamiliar code exploration and edit impact analysis. [VERIFIED: npx gitnexus status; CLAUDE.md] |
| Vitest | `^3.2.4` in backend/frontend/shared | Existing targeted test runner for evidence validation | Backend, frontend, and shared packages already use Vitest configs. [VERIFIED: backend/package.json; frontend/package.json; shared/package.json; backend/vitest.config.ts; frontend/vitest.config.ts; shared/vitest.config.ts] |

### Supporting

| Tool / Artifact | Version / Status | Purpose | When to Use |
|---|---:|---|---|
| PowerShell | `7.5.5` | Local filesystem inventory and one-off extraction | Use for simple path and line-count probes in this Windows workspace. [VERIFIED: $PSVersionTable.PSVersion] |
| Git | `2.52.0.windows.1` | Diff/status and optional docs commit | Use after writing research and before optional docs commit. [VERIFIED: git --version] |
| OWASP ASVS | Stable version listed by OWASP as `5.0.0` | Security-domain category framing | Use only as audit/security taxonomy; Phase 76 does not add authentication/session/crypto features. [CITED: https://owasp.org/www-project-application-security-verification-standard/] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Node coverage validator | Manual spreadsheet count | Manual counting is the exact narrowing risk Phase 76 exists to avoid. [VERIFIED: 76-CONTEXT.md; tasks/lessons.md] |
| GitNexus path discovery | `rg` only | `rg` finds text, but GitNexus groups runtime execution flows and is required by project rules for code exploration. [VERIFIED: CLAUDE.md; .claude/skills/gitnexus/gitnexus-exploring/SKILL.md] |
| Phase 75 matrix reuse only | Fresh full corpus matrix | Phase 75 matrix covers one dense-location chain and cannot be treated as full 0-75 historical coverage. [VERIFIED: 75-PROMISE-AUDIT.md; 75-VERIFICATION.md; 76-CONTEXT.md] |

**Installation:** No new package installation is recommended. [VERIFIED: package.json; 76-CONTEXT.md]

**Version verification:** Runtime/tool versions were verified locally with `node --version`, `npm --version`, `rg --version`, `git --version`, `npx gitnexus status`, and package manifests; no `npm install` is needed. [VERIFIED: shell probes; package.json; backend/package.json; frontend/package.json; shared/package.json]

## Architecture Patterns

### System Architecture Diagram

```text
Inputs
  |
  |-- .planning/ROADMAP.md, REQUIREMENTS.md, STATE.md, BACKLOG.md [VERIFIED: 76-CONTEXT.md]
  |-- .planning/milestones/v1.0-* [VERIFIED: 76-CONTEXT.md]
  |-- .planning/archive/legacy-phases/... [VERIFIED: filesystem inventory]
  |-- .planning/phases/01..75 artifacts [VERIFIED: filesystem inventory]
  |-- current source/tests/runtime-facing artifacts when needed [VERIFIED: 76-CONTEXT.md]
  v
Corpus Inventory
  |
  |-- Normalize phase ids: active, archived, decimal, duplicate legacy [VERIFIED: filesystem inventory]
  |-- Validate integer coverage 1..75 plus archived-extra rows [VERIFIED: filesystem inventory]
  v
Per-Slice Audit Workers
  |
  |-- Extract material promises from roadmap/context/plans/summaries/verification [VERIFIED: 76-CONTEXT.md]
  |-- Check evidence ladder: code -> tests -> route/runtime -> frontend -> verification -> deprecation [VERIFIED: 76-CONTEXT.md]
  |-- Assign status vocabulary exactly [VERIFIED: 76-CONTEXT.md]
  v
Decision Point
  |
  |-- verified-current / superseded / deprecated / not-applicable -> record with source proof [VERIFIED: 76-CONTEXT.md]
  |-- stale-unwired / partial / needs-human-UAT / follow-up -> route to gap ledger [VERIFIED: 76-CONTEXT.md]
  v
Outputs
  |
  |-- 76-HISTORICAL-PROMISE-AUDIT.md [VERIFIED: 76-CONTEXT.md]
  |-- 76-GAP-LEDGER.md [VERIFIED: 76-CONTEXT.md]
  |-- 76-VALIDATION.md with automated coverage proof [VERIFIED: 76-CONTEXT.md]
  v
Closeout Gate
  |
  |-- Coverage validator green [VERIFIED: 76-CONTEXT.md]
  |-- Every non-verified row has disposition [VERIFIED: REQUIREMENTS.md]
  |-- Phase 75 correction reflected in planning truth [VERIFIED: REQUIREMENTS.md]
```

### Recommended Project Structure

```text
.planning/phases/76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap/
├── 76-CONTEXT.md                         # locked scope already exists [VERIFIED: filesystem inventory]
├── 76-RESEARCH.md                        # this research output [VERIFIED: user request]
├── 76-HISTORICAL-PROMISE-AUDIT.md        # exhaustive matrix deliverable [VERIFIED: 76-CONTEXT.md]
├── 76-GAP-LEDGER.md                      # grouped follow-up ledger [VERIFIED: 76-CONTEXT.md]
├── 76-VALIDATION.md                      # coverage and evidence validation proof [VERIFIED: 76-CONTEXT.md]
└── evidence/                             # optional slice scratch data, if planner chooses machine-readable intermediates [VERIFIED: P76-R4 in REQUIREMENTS.md]
```

### Pattern 1: Corpus-First Audit

**What:** Build the list of expected rows before reading individual phase claims. [VERIFIED: 76-CONTEXT.md; filesystem inventory]

**When to use:** Use at Wave 0 before any phase slice starts. [VERIFIED: REQUIREMENTS.md]

**Required inventory facts:**
- Active prior phase dirs through Phase 75: `70`. [VERIFIED: filesystem inventory]
- Archived legacy phase dirs: `7`. [VERIFIED: .planning/archive/legacy-phases/2026-03-30-superseded-active-phase-dirs/README.md]
- Unique integer coverage after merging active and archived dirs: `1-75`, missing `0` integer rows in that range. [VERIFIED: filesystem inventory]
- Archived-only rows include `18`, `19`, `19.1`, `20`, `21`, and `22`; archived duplicate `17` must not be lost behind active Phase 17. [VERIFIED: filesystem inventory; .planning/archive/legacy-phases/2026-03-30-superseded-active-phase-dirs/README.md]

**Example:**
```bash
# Source: local Node filesystem inventory [VERIFIED: filesystem inventory]
node -e "const fs=require('fs'); const d=fs.readdirSync('.planning/phases',{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name); console.log(d.filter(n=>/^\\d+/.test(n)).length)"
```

### Pattern 2: Evidence Ladder

**What:** A row can become `verified-current` only when the evidence reaches current code/tests/runtime-facing artifacts or explicit later supersession/deprecation. [VERIFIED: 76-CONTEXT.md]

**When to use:** Use for every material promise in every phase row. [VERIFIED: 76-CONTEXT.md]

**Evidence priority:**
1. Current source path and current test path for the exact behavior. [VERIFIED: 76-CONTEXT.md]
2. Route/runtime flow proof with GitNexus or source/test references. [VERIFIED: CLAUDE.md; gitnexus://repo/WorldForge/context]
3. Frontend consumption or browser-facing API proof for user-visible promises. [VERIFIED: 75-REGRESSION-MATRIX.md]
4. Verification artifact only when it cites current code/tests/runtime-facing evidence. [VERIFIED: 76-CONTEXT.md]
5. Explicit supersession/deprecation document when old behavior is no longer product truth. [VERIFIED: 76-CONTEXT.md]

### Pattern 3: Gap Ledger Routing

**What:** Every non-verified row needs a concrete disposition: immediate docs/state fix, future phase, backlog item, explicit deprecation, or UAT. [VERIFIED: REQUIREMENTS.md; 76-CONTEXT.md]

**When to use:** Use after each slice and again during synthesis. [VERIFIED: 76-CONTEXT.md]

**Disposition rules:**
- `stale-unwired` or `partial` with user-visible runtime impact becomes a follow-up phase candidate unless it is a tiny deterministic fix. [VERIFIED: 76-CONTEXT.md]
- `needs-human-UAT` must name the live scenario and why automated proof is too expensive or insufficient. [VERIFIED: 76-CONTEXT.md; .planning/v1.1-MILESTONE-CLOSEOUT-CHECKLIST.md]
- `superseded` must cite the replacing phase/document. [VERIFIED: 76-CONTEXT.md]
- `deprecated` must cite the deprecation/removal source. [VERIFIED: 76-CONTEXT.md]
- `not-applicable` must cite why the phase is not active product truth, especially for archived numbering conflicts. [VERIFIED: .planning/archive/legacy-phases/2026-03-30-superseded-active-phase-dirs/README.md]

### Pattern 4: Slice-Bounded Execution

**What:** Split audit work so each worker handles a bounded corpus and cannot collapse the phase into one visible bug. [VERIFIED: 76-CONTEXT.md; tasks/lessons.md]

**Recommended slices:**
| Slice | Corpus | Expected Output |
|---|---|---|
| Wave 0 | Corpus inventory, row schema, coverage validator, artifact index | Draft audit table headings and expected row list before classification. [VERIFIED: 76-CONTEXT.md; filesystem inventory] |
| Slice A | v1.0 active/archive: active `1-17`, archived `17-legacy`, `18`, `19`, `19.1`, `20`, `21`, `22`, active `23-36` | Rows for original engine/worldgen/creation/history promises and superseded legacy numbering. [VERIFIED: .planning/milestones/v1.0-ROADMAP.md; archive README] |
| Slice B | v1.1 early `37-55` | Rows for gameplay-integrity reconciliation and route-matrix work. [VERIFIED: .planning/ROADMAP.md; .planning/v1.1-MILESTONE-AUDIT.md] |
| Slice C | extension `56-69` | Rows for fail-closed, power/personality/combat/world-brain/hidden-pass work; watch Phase 59 and 63 bookkeeping drift. [VERIFIED: .planning/ROADMAP.md; .planning/STATE.md] |
| Slice D | recent `70-75` | Rows for ScenePlan, worldgen authority, structured-output, prompt-contract, and Phase 75 location-presence closure. [VERIFIED: .planning/ROADMAP.md; .planning/STATE.md; 75-VERIFICATION.md] |
| Slice E | Synthesis | Gap ledger, planning-truth reconciliation, automated validation, closeout proof. [VERIFIED: 76-CONTEXT.md; REQUIREMENTS.md] |

### Anti-Patterns to Avoid

- **Thematic sampling:** Mentioning "v1.0" or "worldgen phases" without one row per phase violates P76-R1. [VERIFIED: REQUIREMENTS.md; 76-CONTEXT.md]
- **Schema proof:** Existing schema/helper/resolver surfaces do not prove user-visible behavior. [VERIFIED: 76-CONTEXT.md; tasks/lessons.md; 75-REGRESSION-MATRIX.md]
- **Summary proof:** Old `SUMMARY.md` claims are insufficient unless paired with current source/test/runtime evidence. [VERIFIED: 76-CONTEXT.md]
- **Duplicate-number collapse:** Active Phase 17 and archived legacy Phase 17 have different titles/promises; the archived row must be represented separately. [VERIFIED: filesystem inventory; archive README]
- **Phase 75 overclaim:** Phase 75 should be cited as location-presence closure, not full historical audit. [VERIFIED: 75-VERIFICATION.md; 76-CONTEXT.md]
- **Silent product fix:** Large discovered behavior gaps must become explicit gap work, not hidden implementation inside audit. [VERIFIED: 76-CONTEXT.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Phase coverage counting | Manual eyeballing of roadmap headings | Node/PowerShell filesystem plus roadmap/archive validation | The corpus includes active dirs, milestone docs, archived legacy dirs, duplicate `17`, and decimal `19.1`. [VERIFIED: filesystem inventory; archive README] |
| Runtime path discovery | Grep-only guesses for "who consumes this" | GitNexus query/context plus source/test reads | Project instructions require GitNexus for unfamiliar code and impact analysis. [VERIFIED: CLAUDE.md; gitnexus://repo/WorldForge/context] |
| User-visible proof | Schema/table existence | Source-to-visible chain like Phase 75 regression matrix | Phase 75's own rule says implemented means source data reaches player-visible behavior or is explicitly deprecated/follow-up. [VERIFIED: 75-REGRESSION-MATRIX.md] |
| Gap tracking | Freeform notes | `76-GAP-LEDGER.md` with severity, owner, disposition, evidence | P76-R3 requires severity, owner recommendation, and routing. [VERIFIED: REQUIREMENTS.md] |
| Validation | A paragraph saying "covered all phases" | Automated row-count and disposition checks in `76-VALIDATION.md` | P76-R4 requires automated coverage validation. [VERIFIED: REQUIREMENTS.md] |

**Key insight:** The audit must treat planning artifacts as claims, not proof; proof comes from current runtime/code/test paths, explicit supersession, or explicit deprecation. [VERIFIED: 76-CONTEXT.md; 75-REGRESSION-MATRIX.md]

## Common Pitfalls

### Pitfall 1: Archived Phases Disappear

**What goes wrong:** Rows `18-22` look missing if the planner only scans `.planning/phases`. [VERIFIED: filesystem inventory]

**Why it happens:** Those rows live under `.planning/archive/legacy-phases/2026-03-30-superseded-active-phase-dirs/` after a 2026-03-30 planning hygiene cleanup. [VERIFIED: archive README]

**How to avoid:** Build corpus from active phases plus archived legacy dirs plus milestone roadmaps before slicing. [VERIFIED: archive README; .planning/milestones/v1.0-ROADMAP.md]

**Warning signs:** Coverage report says phases `18-22` are "missing" instead of "archived/superseded rows audited." [VERIFIED: filesystem inventory]

### Pitfall 2: Duplicate Phase 17 Collapse

**What goes wrong:** Active Phase 17 unit-test coverage and archived legacy Phase 17 world-generation E2E share a number but are different artifacts. [VERIFIED: filesystem inventory; archive README]

**Why it happens:** Legacy active phase dirs were moved out because they belonged to an older numbering scheme and conflicted with the current roadmap. [VERIFIED: archive README]

**How to avoid:** Use a stable row key such as `17-current` and `17-legacy-archived`; count `17-current` toward integer coverage and `17-legacy-archived` toward archived-extra coverage. [VERIFIED: filesystem inventory; archive README]

**Warning signs:** The audit has one Phase 17 row and no mention of `17-world-generation-pipeline-e2e`. [VERIFIED: archive README]

### Pitfall 3: Verification Artifact Absence Becomes False Runtime Failure

**What goes wrong:** Missing `*-VERIFICATION.md` is treated as broken product behavior. [VERIFIED: .planning/milestones/v1.0-MILESTONE-AUDIT.md]

**Why it happens:** v1.0 audit already distinguished product risks from documentary verification debt. [VERIFIED: .planning/milestones/v1.0-MILESTONE-AUDIT.md]

**How to avoid:** Classify artifact gaps separately from runtime gaps; require code/test/runtime evidence before calling behavior stale-unwired. [VERIFIED: 76-CONTEXT.md; v1.0-MILESTONE-AUDIT.md]

**Warning signs:** A row says "no VERIFICATION.md, therefore stale-unwired" without checking code/tests/current supersession. [VERIFIED: 76-CONTEXT.md]

### Pitfall 4: Phase 75 Scope Repeats

**What goes wrong:** The audit narrows again to the strongest current bug or latest chain. [VERIFIED: tasks/lessons.md; 76-CONTEXT.md]

**Why it happens:** Phase 75 did exactly that: it closed the location-presence chain but did not audit every prior phase. [VERIFIED: 76-CONTEXT.md; 75-VERIFICATION.md]

**How to avoid:** Make the first plan produce an immutable expected-row ledger and make later plans append statuses, not redefine scope. [VERIFIED: 76-CONTEXT.md; REQUIREMENTS.md]

**Warning signs:** The first implementation plan starts with a product fix instead of corpus inventory and row schema. [VERIFIED: 76-CONTEXT.md]

## Code Examples

Verified patterns from local sources:

### Corpus Coverage Validator

```javascript
// Source: local filesystem inventory pattern [VERIFIED: filesystem inventory]
const fs = require("fs");
const path = require("path");

function dirs(root) {
  return fs.existsSync(root)
    ? fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];
}

function phaseKey(name) {
  const match = name.match(/^\d+(?:\.\d+)?/);
  if (!match) return null;
  return match[0].includes(".") ? match[0].replace(/^0+/, "") : String(Number(match[0]));
}

const active = dirs(path.join(".planning", "phases"));
const archiveRoot = path.join(
  ".planning",
  "archive",
  "legacy-phases",
  "2026-03-30-superseded-active-phase-dirs"
);
const archived = dirs(archiveRoot);

const activePrior = active
  .map(phaseKey)
  .filter(Boolean)
  .filter((n) => !n.includes(".") && Number(n) >= 1 && Number(n) <= 75);
const archivedKeys = archived.map(phaseKey).filter(Boolean);

const integerCovered = new Set(
  [...activePrior, ...archivedKeys].filter((n) => !n.includes("."))
);
const missing = Array.from({ length: 75 }, (_, i) => String(i + 1)).filter(
  (n) => !integerCovered.has(n)
);

if (missing.length) throw new Error(`Missing phase rows: ${missing.join(", ")}`);
```

### Matrix Row Disposition Check

```javascript
// Source: P76-R4 requires every non-verified row to have a disposition [VERIFIED: .planning/REQUIREMENTS.md]
const allowed = new Set([
  "verified-current",
  "stale-unwired",
  "partial",
  "superseded",
  "deprecated",
  "follow-up",
  "not-applicable",
  "needs-human-UAT",
]);

function validateRow(row) {
  if (!allowed.has(row.classification)) {
    throw new Error(`Invalid classification for ${row.phase}: ${row.classification}`);
  }
  if (row.classification !== "verified-current" && !row.disposition) {
    throw new Error(`Missing disposition for ${row.phase}`);
  }
  if (!row.evidenceChecked || row.evidenceChecked.length === 0) {
    throw new Error(`Missing evidence for ${row.phase}`);
  }
}
```

### Evidence Scan Seeds

```bash
# Source: Phase 76 scope includes TODOs, cut corners, quick wins, unwired promises, stale/deprecated claims [VERIFIED: 76-CONTEXT.md]
rg -n "TODO|FIXME|cut corner|quick win|follow-up|gap|unwired|stale|deprecated|superseded|human_needed|needs-human" .planning/phases .planning/archive .planning/milestones docs backend frontend shared
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Roadmap checkbox or phase summary treated as closeout proof | Source-to-visible evidence chain or explicit supersession/deprecation | Reinforced by Phase 75 and Phase 76 correction on 2026-04-30 [VERIFIED: 75-REGRESSION-MATRIX.md; 76-CONTEXT.md] | Planner must require current evidence for every material promise. [VERIFIED: 76-CONTEXT.md] |
| Thematic/milestone-level audit rows | Phase-by-phase matrix with every phase number represented | Phase 76 locked scope on 2026-04-30 [VERIFIED: 76-CONTEXT.md] | Slices cannot satisfy the phase by only auditing high-risk areas. [VERIFIED: 76-CONTEXT.md] |
| Missing verification artifact treated as product failure | Separate documentary debt from runtime drift | v1.0 milestone audit cleanup on 2026-04-08 [VERIFIED: .planning/milestones/v1.0-MILESTONE-AUDIT.md] | Gap ledger needs type/severity, not one generic "broken" bucket. [VERIFIED: .planning/milestones/v1.0-MILESTONE-AUDIT.md; REQUIREMENTS.md] |
| Backend/source helper existence accepted as feature proof | Runtime path and frontend-visible consumption required for gameplay claims | Phase 75 dense-location closure on 2026-04-30 [VERIFIED: 75-REGRESSION-MATRIX.md; 75-VERIFICATION.md] | Verification must test data flow into player-visible behavior. [VERIFIED: 75-REGRESSION-MATRIX.md] |

**Deprecated/outdated:**
- Treating Phase 75 as the full historical audit is outdated; Phase 75 remains valid only as location-presence closure. [VERIFIED: 76-CONTEXT.md; 75-VERIFICATION.md]
- Treating active `.planning/phases` as the whole corpus is outdated; archived legacy dirs contain prior phase material for `17-22` plus `19.1`. [VERIFIED: archive README; filesystem inventory]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | No `[ASSUMED]` claims are used in this research. | All | All factual claims are tied to local artifacts, shell probes, GitNexus, or OWASP source citations. [VERIFIED: Sources section] |

## Open Questions (RESOLVED)

1. **Phase `0` handling.** [VERIFIED: 76-CONTEXT.md]
   - Decision: include an explicit `0 / pre-GSD baseline` row classified `not-applicable` unless a Phase 0 artifact is discovered during execution. This row is informational only and does not replace required integer `1-75` coverage. [VERIFIED: filesystem inventory; 76-CONTEXT.md]
2. **Live UAT boundary.** [VERIFIED: 76-CONTEXT.md]
   - Decision: Phase 76 records expensive or human-subjective checks as `needs-human-UAT` with scenario text and gap-ledger routing. Full live gameplay replay is required only when a specific phase promise cannot be classified without it. [VERIFIED: 76-CONTEXT.md; .planning/v1.1-MILESTONE-CLOSEOUT-CHECKLIST.md; .planning/milestones/v1.0-MILESTONE-AUDIT.md]
3. **Planning-state fixes during the audit.** [VERIFIED: 76-CONTEXT.md]
   - Decision: small deterministic docs/state corrections are allowed only after the relevant gap is recorded in the ledger. Product behavior gaps, broad rewires, or uncertain fixes are routed to future phases/backlog/UAT instead of being silently absorbed into Phase 76. [VERIFIED: 76-CONTEXT.md; REQUIREMENTS.md]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Coverage validation and helper scripts | yes | `v23.11.0` | PowerShell-only checks, lower maintainability. [VERIFIED: node --version] |
| npm | Existing workspace test/typecheck commands | yes | `11.12.1` | Direct `npx vitest` if package scripts fail. [VERIFIED: npm --version; package.json] |
| ripgrep | Broad text scans for TODO/follow-up/stale terms | yes | `14.1.0` | `Select-String`, slower and noisier. [VERIFIED: rg --version] |
| GitNexus | Code path exploration and impact/scope checks | yes | Available; status checked during research | `rg` plus source reads for docs-only audit, but source edits still need GitNexus per project rules. [VERIFIED: npx gitnexus status; CLAUDE.md] |
| Git | Status, diff, optional docs commit | yes | `2.52.0.windows.1` | none for repository state tracking. [VERIFIED: git --version] |
| PowerShell | Local Windows command shell | yes | `7.5.5` | Node scripts for cross-platform validation. [VERIFIED: $PSVersionTable.PSVersion] |
| Vitest | Existing backend/frontend/shared evidence checks | yes | `^3.2.4` | Manual source evidence only for docs-only rows; not enough for runtime verified-current claims. [VERIFIED: backend/package.json; frontend/package.json; shared/package.json] |

**Missing dependencies with no fallback:** None found for research/planning. [VERIFIED: shell probes]

**Missing dependencies with fallback:** None found for research/planning. [VERIFIED: shell probes]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^3.2.4` for backend/frontend/shared evidence checks. [VERIFIED: backend/package.json; frontend/package.json; shared/package.json] |
| Config file | `backend/vitest.config.ts`, `frontend/vitest.config.ts`, `shared/vitest.config.ts`, plus root `vitest.config.ts`. [VERIFIED: filesystem inventory; config files] |
| Quick run command | `node <phase-local-validator-or-inline-script>` for matrix coverage; targeted `npm --prefix backend run test -- <files>` only when a row needs source/test proof. [VERIFIED: REQUIREMENTS.md; backend/package.json] |
| Full suite command | Not required for docs-only audit closeout; if source changes happen, use impacted package suites and `npm run typecheck` / lint per existing commands. [VERIFIED: 76-CONTEXT.md; package.json; CLAUDE.md] |

### Phase Requirements To Validation Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| P76-R1 | Every prior phase has a matrix row. [VERIFIED: REQUIREMENTS.md] | Static coverage | `node <coverage-validator>` over `76-HISTORICAL-PROMISE-AUDIT.md` and corpus dirs. [VERIFIED: filesystem inventory] | no, Wave 0 |
| P76-R2 | Only allowed classifications are used and evidence is sufficient. [VERIFIED: REQUIREMENTS.md] | Static schema/content | `node <coverage-validator>` classification enum and evidence-column check. [VERIFIED: REQUIREMENTS.md] | no, Wave 0 |
| P76-R3 | Non-verified rows appear in gap ledger with severity and routing. [VERIFIED: REQUIREMENTS.md] | Static cross-file | `node <coverage-validator>` compare audit rows to `76-GAP-LEDGER.md`. [VERIFIED: REQUIREMENTS.md] | no, Wave 0 |
| P76-R4 | No phase number skipped; every non-verified row has disposition. [VERIFIED: REQUIREMENTS.md] | Static coverage | `node <coverage-validator>` fail on missing `1-75`, missing archived extras, missing disposition. [VERIFIED: filesystem inventory] | no, Wave 0 |
| P76-R5 | Phase 75 is described as location-presence closure only. [VERIFIED: REQUIREMENTS.md] | Text scan | `rg -n "full historical|all prior phases|0-75" .planning/phases/75-* .planning/ROADMAP.md .planning/STATE.md` plus manual reconciliation. [VERIFIED: 75-VERIFICATION.md; 76-CONTEXT.md] | no, Wave 0 |
| P76-R6 | Large gaps route to follow-up instead of silent implementation. [VERIFIED: REQUIREMENTS.md] | Ledger review | Validator checks every gap has disposition; code-edit tasks require GitNexus impact/test evidence. [VERIFIED: CLAUDE.md; 76-CONTEXT.md] | no, Wave 0 |

### Sampling Rate

- **Per audit slice:** Run coverage validator against the slice output and confirm expected row keys for that slice. [VERIFIED: 76-CONTEXT.md]
- **Per synthesis merge:** Run full coverage validator across `76-HISTORICAL-PROMISE-AUDIT.md`, `76-GAP-LEDGER.md`, and the corpus inventory. [VERIFIED: REQUIREMENTS.md]
- **Phase gate:** `76-VALIDATION.md` must record integer coverage, archived-extra coverage, classification enum check, evidence-column completeness, non-verified disposition completeness, and Phase 75 correction check. [VERIFIED: REQUIREMENTS.md; 76-CONTEXT.md]

### Wave 0 Gaps

- [ ] `76-HISTORICAL-PROMISE-AUDIT.md` row schema and expected-row ledger. [VERIFIED: 76-CONTEXT.md]
- [ ] `76-GAP-LEDGER.md` schema with severity/disposition enums. [VERIFIED: REQUIREMENTS.md]
- [ ] Coverage validator command or phase-local script. [VERIFIED: REQUIREMENTS.md]
- [ ] Corpus inventory includes active phases, milestones, archive legacy dirs, duplicate `17-legacy`, decimal `19.1`, and optional `0` not-applicable row. [VERIFIED: filesystem inventory; archive README; 76-CONTEXT.md]

## Security Domain

### Applicable ASVS Categories

OWASP lists ASVS categories including V2 Authentication, V3 Session Management, V4 Access Control, V5 Validation/Sanitization/Encoding, V6 Stored Cryptography, V7 Error Handling/Logging, V8 Data Protection, V13 API/Web Service, and V14 Configuration. [CITED: https://devguide.owasp.org/en/03-requirements/05-asvs/]

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no for Phase 76 docs-only audit | Do not add auth/session features. [VERIFIED: 76-CONTEXT.md] |
| V3 Session Management | no for Phase 76 docs-only audit | Route old session/reload promises to audit rows only. [VERIFIED: REQUIREMENTS.md; ROADMAP.md] |
| V4 Access Control | low | Keep generated audit artifacts under planning docs; do not expose secrets or campaign-private data. [VERIFIED: CLAUDE.md; .planning/STATE.md] |
| V5 Validation, Sanitization and Encoding | yes | Validate matrix classifications, row keys, evidence columns, and dispositions with scripts. [VERIFIED: REQUIREMENTS.md] |
| V6 Stored Cryptography | no | Do not modify secrets, keys, or cryptography. [VERIFIED: 76-CONTEXT.md] |
| V7 Error Handling and Logging | yes for audit process | Record unresolved evidence as `needs-human-UAT` or `follow-up` instead of hiding uncertainty. [VERIFIED: 76-CONTEXT.md] |
| V8 Data Protection | yes for artifacts | Avoid raw provider payloads, secrets, private campaign data, and oversized prompt dumps in audit evidence. [VERIFIED: .planning/STATE.md; CLAUDE.md] |
| V13 API and Web Service | yes when a promise concerns routes | Verify route/API claims with current route tests or GitNexus/source evidence before `verified-current`. [VERIFIED: 76-CONTEXT.md; CLAUDE.md] |
| V14 Configuration | yes when a promise concerns settings/provider behavior | Treat active provider conformance and settings drift as explicit rows/gaps, not silent release-ready claims. [VERIFIED: .planning/STATE.md; 75-VERIFICATION.md] |

### Known Threat Patterns for Phase 76

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| False assurance from stale planning artifacts | Tampering / Repudiation | Evidence ladder plus source tags on every row. [VERIFIED: 76-CONTEXT.md] |
| Scope narrowing from all phases to latest bug | Repudiation | Immutable expected-row ledger and automated coverage gate. [VERIFIED: tasks/lessons.md; REQUIREMENTS.md] |
| Leaking private prompts/provider data into audit docs | Information Disclosure | Cite sanitized artifacts and source paths; do not paste secrets or raw provider envelopes. [VERIFIED: .planning/STATE.md; CLAUDE.md] |
| Silent implementation scope creep during audit | Elevation of Privilege / Tampering | Route large gaps to gap ledger/future phases; any code edit needs GitNexus impact and tests. [VERIFIED: 76-CONTEXT.md; CLAUDE.md] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap/76-CONTEXT.md` - locked scope, deliverables, evidence standard, slicing, deferred items. [VERIFIED: file read]
- `.planning/REQUIREMENTS.md` - P76-R1 through P76-R6 and traceability table. [VERIFIED: file read]
- `.planning/ROADMAP.md` - active v1.1+ phase details through Phase 76 and known roadmap drift surfaces. [VERIFIED: file read]
- `.planning/STATE.md` - current focus, Phase 75/76 correction, known blockers, recent updates. [VERIFIED: file read]
- `.planning/BACKLOG.md` - parked follow-up candidates and ScenePlan nested action-input backlog item. [VERIFIED: file read]
- `.planning/milestones/v1.0-ROADMAP.md`, `.planning/milestones/v1.0-REQUIREMENTS.md`, `.planning/milestones/v1.0-MILESTONE-AUDIT.md` - archived v1.0 scope and audit debt. [VERIFIED: file read]
- `.planning/archive/legacy-phases/2026-03-30-superseded-active-phase-dirs/README.md` - archived legacy phase directories and supersession reason. [VERIFIED: file read]
- `.planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-PROMISE-AUDIT.md`, `75-REGRESSION-MATRIX.md`, `75-VALIDATION.md`, `75-VERIFICATION.md` - Phase 75 evidence model and correction boundary. [VERIFIED: file read]
- `CLAUDE.md` and project-local skill files under `.claude/skills/` / `.agents/skills/` - project constraints, GitNexus and Desloppify rules. [VERIFIED: file read]
- `gitnexus://repo/WorldForge/context` and `npx gitnexus status` - GitNexus availability and freshness. [VERIFIED: GitNexus MCP and CLI]

### Secondary (MEDIUM confidence)

- OWASP ASVS project and Developer Guide pages - security taxonomy for ASVS categories. [CITED: https://owasp.org/www-project-application-security-verification-standard/; https://devguide.owasp.org/en/03-requirements/05-asvs/]
- `.planning/codebase/TESTING.md`, `.planning/codebase/STACK.md`, `.planning/codebase/CONVENTIONS.md` - previously generated codebase intelligence; cross-checked with current package manifests and config files. [VERIFIED: file read; package.json; backend/package.json; frontend/package.json; shared/package.json]

### Tertiary (LOW confidence)

- None. [VERIFIED: source list above]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified by local commands, manifests, config files, and CLAUDE.md. [VERIFIED: shell probes; package.json; CLAUDE.md]
- Architecture: HIGH - scope and deliverables are locked in `76-CONTEXT.md`; corpus inventory was verified from filesystem and archive README. [VERIFIED: 76-CONTEXT.md; filesystem inventory; archive README]
- Pitfalls: HIGH - derived from Phase 75 correction, tasks lesson, v1.0/v1.1 audits, and current artifact layout. [VERIFIED: 75-VERIFICATION.md; tasks/lessons.md; v1.0-MILESTONE-AUDIT.md; v1.1-MILESTONE-AUDIT.md]
- Security domain: MEDIUM - ASVS category names verified from OWASP; exact category applicability is phase-specific judgment for this docs/audit phase. [CITED: https://devguide.owasp.org/en/03-requirements/05-asvs/; VERIFIED: 76-CONTEXT.md]

**Research date:** 2026-04-30 [VERIFIED: environment current_date]
**Valid until:** 2026-05-07 for corpus/status claims because active planning artifacts can change after Phase 76 planning/execution. [VERIFIED: .planning/STATE.md]

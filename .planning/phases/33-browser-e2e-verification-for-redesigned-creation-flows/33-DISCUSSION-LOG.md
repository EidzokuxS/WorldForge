# Phase 33: Browser E2E Verification for Redesigned Creation Flows - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 33-browser-e2e-verification-for-redesigned-creation-flows
**Areas discussed:** Test scope & flow priority, LLM dependency handling, Bug fix strategy, Legacy route cleanup

---

## Test Scope & Flow Priority

### Q1: Which creation flows are highest priority?

| Option | Description | Selected |
|--------|-------------|----------|
| Campaign creation + DNA | New campaign → premise → World DNA seeds → scaffold generation | ✓ |
| Character creation + persona | Persona selection, start conditions, canonical loadout, 3 creation modes | ✓ |
| World review editing | Review generated scaffold — edit locations, factions, NPCs, lore | ✓ |
| Library management | Worldbook library (new in Phase 32) — reusable worldbooks, import/export | |

**User's choice:** Campaign creation + DNA, Character creation + persona, World review editing
**Notes:** Library management excluded from E2E scope for this phase.

### Q2: Known-IP vs original-world coverage?

| Option | Description | Selected |
|--------|-------------|----------|
| Both flows | One known-IP + one original-world campaign | ✓ |
| Original-world only | Skip known-IP testing | |
| Known-IP only | Focus on harder path | |

**User's choice:** Both flows

### Q3: Error state testing depth?

| Option | Description | Selected |
|--------|-------------|----------|
| Happy path + critical errors | Full happy path + LLM failure + invalid inputs | |
| Happy path only | Just verify flows complete | |
| Comprehensive | Happy path + error states + edge cases | ✓ |

**User's choice:** Comprehensive

---

## LLM Dependency Handling

### Q4: How to handle LLM-dependent generation steps?

| Option | Description | Selected |
|--------|-------------|----------|
| Full real LLM calls | Real GLM calls every time. Slow but tests real system. | ✓ |
| Pre-seeded campaign + real LLM | Pre-create campaign, only creation flow uses real LLM | |
| Hybrid: real first, cache reruns | Cache generated data for faster iteration | |

**User's choice:** Full real LLM calls

### Q5: Tolerance for LLM flakiness?

| Option | Description | Selected |
|--------|-------------|----------|
| Retry once, then fail | One retry on failure | |
| Retry up to 3 times | More tolerant of transient failures | ✓ |
| No retry, fail immediately | Strictest approach | |

**User's choice:** Retry up to 3 times

---

## Bug Fix Strategy

### Q6: How to track and fix bugs?

| Option | Description | Selected |
|--------|-------------|----------|
| Fix inline, retest immediately | Find → fix → re-run affected test | ✓ |
| Collect first, batch fix later | Catalog all bugs then fix by severity | |
| Triage by severity | Blockers immediate, non-blockers batched | |

**User's choice:** Fix inline, retest immediately

### Q7: Done threshold?

| Option | Description | Selected |
|--------|-------------|----------|
| Zero blockers, zero major bugs | Critical and major fixed, minor cosmetic noted | |
| Zero blockers only | Only truly blocking issues must be fixed | |
| All bugs fixed | Every bug found must be resolved | ✓ |

**User's choice:** All bugs fixed

---

## Legacy Route Cleanup

### Q8: What to do with legacy routes?

| Option | Description | Selected |
|--------|-------------|----------|
| Verify redirects work | Test legacy URLs redirect to canonical routes | |
| Remove legacy routes entirely | Delete old route files. Clean break. | ✓ |
| Ignore legacy routes | Don't test or touch them | |

**User's choice:** Remove legacy routes entirely

### Q9: Shell verification approach?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, as part of flow tests | Verify shell elements during each flow test | ✓ |
| Dedicated shell test | Separate E2E test for shell components | |
| Skip shell testing | Trust Phase 32 unit tests | |

**User's choice:** As part of flow tests

---

## Claude's Discretion

- PinchTab test structure and organization
- Test execution order within each flow
- PinchTab workaround strategies
- Specific edge cases beyond enumerated ones

## Deferred Ideas

- Library management E2E testing — future phase
- Mobile/responsive testing — desktop-first project
- Performance benchmarking of generation pipeline — separate concern

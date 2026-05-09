# Phase 76: Full Historical Phase Promise Audit and De-Jure/De-Facto Gap Closure - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning
**Source:** Corrective user clarification after Phase 75 scope miss

<domain>
## Phase Boundary

Phase 76 is a corrective exhaustive audit. Phase 75 closed the location-presence chain, but it did not satisfy the user's original instruction to audit all prior phases. This phase must inspect every prior phase from archived v1.0 phases through active v1.1 Phase 75 and classify whether each phase's material promises are actually wired into current code, tests, runtime paths, planning truth, or have been explicitly superseded/deprecated.

The output is not allowed to be a thematic sample. It must be a phase-by-phase coverage matrix.
</domain>

<decisions>
## Locked Decisions

### Exhaustive Coverage
- Every phase from 0/1 through 75 must have at least one row in the audit matrix.
- A phase is not covered by mentioning its milestone or a nearby newer phase; it needs its own status and evidence.
- The matrix must include: phase number, phase title, promised behavior, current evidence checked, classification, risk, owner/fix decision, and whether code/tests/docs need changes.

### Classification Vocabulary
- Use these statuses consistently: `verified-current`, `stale-unwired`, `partial`, `superseded`, `deprecated`, `follow-up`, `not-applicable`, `needs-human-UAT`.
- `verified-current` requires evidence from live code/tests/runtime-facing artifacts, not just a completed checkbox.
- `superseded` requires a newer phase or document that explicitly replaces the old promise.
- `follow-up` must name a concrete next phase/gap candidate or backlog item.

### Evidence Standard
- Schema existence, helper existence, old SUMMARY claims, or roadmap checkboxes are insufficient by themselves.
- Each material promise must be checked against at least one of: current source code, current tests, route/runtime flow, frontend consumption, verification artifact, or explicit deprecation/supersession document.
- If evidence is too expensive to prove in Phase 76, classify as `needs-human-UAT` or `follow-up`; do not mark as verified.

### Audit Scope
- Include archived v1.0 phases if they are still part of product truth, not only active v1.1 phases.
- Include planning/documentation drift when it can cause agents to make wrong implementation decisions.
- Prioritize user-visible gameplay/worldgen/runtime promises over cosmetic wording, but do not omit cosmetic/planning drift if it creates false active truth.

### Fix Scope
- Phase 76 may make small deterministic documentation/state fixes discovered during the audit.
- Phase 76 should not silently implement large product fixes while auditing. Large stale/unwired areas should become explicit gap phases/plans unless they are tiny and safe.
- Any immediate code fix must have GitNexus impact analysis, tests, and review like normal GSD work.

### Phase 75 Correction
- Phase 75 remains valid for the location-presence closure, but it must not be described as the full historical audit.
- Phase 76 exists because the original "audit all phases 0-75" requirement was not fulfilled.
</decisions>

<canonical_refs>
## Canonical References

**Planning Truth**
- `.planning/ROADMAP.md` — active and historical phase list, plan counts, goals, dependencies.
- `.planning/REQUIREMENTS.md` — current requirement completion table and phase requirement mappings.
- `.planning/STATE.md` — current project state, recent updates, accumulated decisions, known blockers.
- `.planning/BACKLOG.md` — parked gap candidates that must not masquerade as active roadmap truth.
- `.planning/milestones/` — archived v1.0 milestone truth and prior phase archives.

**Recent Correction Evidence**
- `.planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-PROMISE-AUDIT.md` — targeted Phase 75 audit that is insufficient for full historical coverage.
- `.planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-REGRESSION-MATRIX.md` — evidence standard for source-to-visible-behavior proof.
- `.planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-VERIFICATION.md` — confirms Phase 75 location-presence scope only.
- `tasks/lessons.md` — includes the correction rule that "audit all phases" must not be narrowed without explicit approval.
</canonical_refs>

<specifics>
## Required Deliverables

1. `76-HISTORICAL-PROMISE-AUDIT.md`
   - Exhaustive phase-by-phase matrix covering every phase from archived v1.0 through Phase 75.
   - Must include a coverage counter proving no phase number was skipped.

2. `76-GAP-LEDGER.md`
   - All stale/unwired/partial/needs-UAT items grouped by severity and recommended disposition.
   - Must distinguish immediate small docs/state fixes from future implementation phases.

3. `76-VALIDATION.md`
   - Verification method and commands used to prove coverage completeness.
   - Must include automated checks that the matrix contains every expected phase number.

4. Execution plans
   - Split the audit into bounded slices small enough for agents to inspect without context overload.
   - Suggested slicing: archived v1.0, v1.1 early phases 37-55, v1.1 mid phases 56-69, recent phases 70-75, synthesis/gap-ledger/closeout.
</specifics>

<deferred>
## Deferred Ideas

- Large implementation gaps found by the audit should become explicit follow-up phases or backlog items unless they are tiny deterministic planning-state fixes.
- Full live gameplay/UAT remains separate from documentary/source audit unless a phase promise specifically requires live play evidence.
</deferred>

---

*Phase: 76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap*
*Context gathered: 2026-04-30*

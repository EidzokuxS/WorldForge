---
phase: 66
reviewers: [gemini, claude]
reviewed_at: 2026-04-19
plans_reviewed:
  - 66-01-combat-envelope-foundation-PLAN.md
  - 66-02-target-context-combat-snapshot-PLAN.md
  - 66-03-oracle-combat-envelope-contract-PLAN.md
  - 66-04-hostile-action-integration-and-verification-PLAN.md
---

# Cross-AI Plan Review — Phase 66

## Gemini Review

### Summary

Phase 66 is well-scoped and respects the backend-owned mechanics model. The four-plan split cleanly stages foundation, target enrichment, Oracle contract, and integration.

### Strengths

- Keeps combat reasoning in backend code instead of the Judge model.
- Avoids polluting `runtime-tags`.
- Reuses Phase 57/58 patterns and existing power helpers.
- Extends target context additively instead of rewriting it.

### Concerns

- **MEDIUM:** Vulnerability relevance may be hard to determine deterministically from freeform player text.
- **LOW:** Ensure player-as-target is handled the same as NPC-as-target.
- **LOW:** Clamp wording must not collapse creative weak-hit outcomes entirely.

### Suggestions

- Prefer surfacing all target vulnerabilities or a deterministic subset rather than inventing LLM-side relevance matching in the builder.
- Ensure NPC-vs-player and NPC-vs-NPC target flows are explicitly covered.
- Keep clamp qualitative and bounded.

### Overall Risk

LOW. The plan is additive and recoverable if verification covers the key seams.

---

## Claude Review

### Summary

The decomposition is coherent and aligned with the Oracle-only scope, but the initial plan bundle was missing requirement traceability and a few key pins around hostility gating, clamp threshold, and final verification breadth.

### Strengths

- Clean phase boundary and clear deferrals to Phase 67.
- Additive contracts on target-context and Oracle payload.
- Correct reuse of existing power primitives and observability patterns.
- Good separation between pure builder, data surface, contract, and integration layers.

### Concerns

- **HIGH:** `P66-R1..P66-R8` were not yet authored in `REQUIREMENTS.md`.
- **HIGH:** Initial plan bundle did not prove Oracle behavior meaningfully changes when envelope context exists.
- **HIGH:** Hostile/combat-relevant gating was underspecified.
- **MEDIUM:** Clamp threshold was not pinned.
- **MEDIUM:** Verification gate was too narrow and should use full backend suite + typecheck.
- **MEDIUM:** Observability event name needed to be pinned.
- **LOW:** Explicit no-frontend-change gate should be stated.

### Suggestions

- Add `P66-R1..P66-R8` before execution.
- Pin hostility gate as deterministic backend logic.
- Pin clamp threshold as `no bypass + durability gap >= 2`.
- Restore full backend suite in verification.
- Lock a single observability event name.
- Explicitly prove envelope omission on character targets without power data.

### Overall Risk

MEDIUM before patching, low-to-medium after patching the plan text.

---

## Consensus Summary

### Agreed Strengths

- Phase 66 should stay Oracle-only.
- `runtime-tags` should remain untouched.
- The four-plan decomposition is structurally sound.
- `CombatEnvelope` should be backend-owned, deterministic, and qualitative rather than hard combat math.

### Agreed Concerns

- Hostile/combat gating must be pinned, not improvised during execution.
- Oracle clamp semantics must be explicit and testable.
- NPC target flows must be covered, not only player target flows.
- Verification must prove no silent drift on out-of-scope surfaces.

### Changes Applied After Review

- Added `P66-R1..P66-R8` to `REQUIREMENTS.md`
- Updated Phase 66 roadmap entry with goal, requirements, and plan list
- Patched plan files to:
  - pin deterministic hostile-action gating
  - pin clamp threshold
  - require no-powerStats omission coverage
  - lock observability event name `combat.envelope`
  - restore full backend suite + typecheck in the verification gate
  - state explicit no-frontend-changes scope


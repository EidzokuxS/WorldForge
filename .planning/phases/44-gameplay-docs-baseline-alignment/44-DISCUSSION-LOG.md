# Phase 44: Gameplay Docs Baseline Alignment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 44-Gameplay Docs Baseline Alignment
**Areas discussed:** Docs authority model, Deprecation policy, Audience and depth, Gameplay docs boundary, Pending truth handling

---

## Docs Authority Model

| Option | Description | Selected |
|--------|-------------|----------|
| `concept` high-level, `mechanics` + `memory` normative, `tech_stack` reference | Clear document hierarchy: product/system contract in `concept`, gameplay/runtime truth in `mechanics` and `memory`, technical facts in `tech_stack` | ✓ |
| `concept` as the single normative baseline | One top-level doc owns all gameplay truth, other docs subordinate | |
| One new master gameplay-baseline doc | Consolidate runtime truth into a new central doc and demote existing docs | |

**User's choice:** Recommended option via delegation to the agent.
**Notes:** The user asked the agent to choose the best model as long as later planning would not get lost.

---

## Deprecation Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit deprecation/replacement notes | Old claims are marked as removed, replaced, or narrowed in-place where needed | ✓ |
| Silent rewrite | Old claims disappear into rewritten prose without explicit markers | |
| Separate appendix/changelog only | Keep main docs clean and move deprecations elsewhere | |

**User's choice:** Explicit deprecation/replacement notes.
**Notes:** Accepted directly to satisfy `DOCA-01` and preserve planning traceability.

---

## Audience And Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Planning-grade, runtime-honest baseline | Document guarantees, boundaries, shorthand layers, and implementation-significant truths without turning docs into a code dump | ✓ |
| Mostly product-facing abstraction | Keep docs high level and hide most implementation details | |
| Deep implementation reference | Make gameplay docs highly code-shaped and implementation heavy | |

**User's choice:** Planning-grade, runtime-honest baseline.
**Notes:** Accepted directly. Details like SSE, vector-only retrieval, and caller-supplied importance should be documented when they materially affect truth.

---

## Gameplay Docs Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Rewrite all gameplay-relevant contracts, including setup/handoff semantics that affect play | Includes turn loop, Oracle, memory, prompt assembly, start conditions, targeting, travel, location state, and gameplay-shaping setup contracts | ✓ |
| Narrow runtime-only rewrite | Only rewrite the live turn loop and immediate runtime mechanics | |
| Broad product-doc rewrite | Expand Phase 44 into general non-game UX and authoring documentation cleanup | |

**User's choice:** Accepted recommended boundary.
**Notes:** The user interrupted to ask how many phases are in the milestone, then agreed to continue to the next topic without objecting to the recommended scope. This was treated as acceptance of the recommended boundary.

---

## Pending / Unfinished Truth Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Only implemented behavior, explicit deprecations, and explicit pending notes | No optimistic wording for unresolved seams; partial contracts stay explicitly partial | ✓ |
| Document intended end state | Write toward the desired model even if implementation is not fully closed yet | |
| Hide unresolved seams behind abstraction | Keep docs clean by avoiding explicit partial/pending wording | |

**User's choice:** Only implemented behavior, explicit deprecations, and explicit pending notes.
**Notes:** This was explicitly accepted, with the open Phase 38 inventory/equipment seam as the key example for why optimistic wording is not allowed.

---

## the agent's Discretion

- Exact document structure and cross-linking strategy
- Exact placement/format of deprecation notes
- Exact level of implementation detail per document as long as the docs remain truthful and planning-grade

## Deferred Ideas

- Reusable multi-worldbook library documentation is not folded into Phase 44; it stays outside the gameplay-doc baseline rewrite.
- Broader non-game UX documentation cleanup remains out of scope.

# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Living Sandbox

**Shipped:** 2026-04-08  
**Phases:** 31 | **Plans:** 110 | **Sessions:** n/a

### What Was Built
- Deterministic gameplay runtime with Oracle, validated tools, typed SSE turns, and core mechanics.
- World generation stack for original and known-IP campaigns, including lore ingestion, divergence handling, and reusable worldbook sources.
- Character system overhaul with shared ontology, structured starts, canonical loadouts, and persona templates.
- Desktop non-game shell plus routed launcher, creation, review, and character workflows.
- Docs-to-runtime gameplay reconciliation baseline for the next milestone.

### What Worked
- Phase-based decomposition kept large architecture changes shippable.
- Retro-closeout work for old phases was cheaper once the live code had already stabilized.
- Browser-driven verification exposed workflow bugs that unit tests would not have caught.

### What Was Inefficient
- Planning artifacts lagged behind code multiple times and had to be retro-reconciled.
- Verification debt accumulated because later fixes were not folded back into older phase artifacts immediately.
- Some automation produced noisy milestone outputs that still needed manual editorial cleanup.

### Patterns Established
- Use reconciliation phases when docs, planning, and runtime drift apart.
- Keep worldgen/authoring features on shared contracts instead of parallel seams.
- Treat browser/UAT evidence as first-class closeout proof for workflow-heavy features.

### Key Lessons
1. Close verification artifacts while context is fresh, not weeks later.
2. Session-coupled runtime shortcuts become real product bugs once routed desktop workflows mature.
3. Broad feature delivery without a reconciliation pass hides gameplay integrity gaps until late.

### Cost Observations
- Model mix: mixed multi-agent GSD execution with heavy planner/reviewer usage
- Sessions: multi-session milestone
- Notable: the main cost sink was not first-pass implementation, but retroactive verification and planning cleanup

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | multi-session | 31 | Shifted from raw feature delivery to reconciliation-driven closeout |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | Large targeted backend/frontend suites plus browser QA | Mixed by subsystem | Many planning-only additions |

### Top Lessons (Verified Across Milestones)

1. Feature throughput is not the same thing as milestone closeout readiness.
2. Browser workflow regressions need dedicated proof, not just code-level confidence.

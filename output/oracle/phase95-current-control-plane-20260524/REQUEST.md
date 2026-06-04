# Oracle Request: Phase 95 Current Gameplay Control Plane

Repo: `R:\Projects\WorldForge`
Branch: `develop`
Current HEAD: `458d08c10002b566c18d1726fb3d87218bdb7e04`
Reset baseline: `f8d2b3b05cf6a6598208e170f414d171a44ccaf4`

You are reviewing the Phase 95 reset/rebuild architecture for a long-lived LLM-driven RPG gameplay loop. Do not treat earlier Phase 95 commits or prior Oracle answers as authority. Treat the attached architecture canvas and current source as the evidence for this HEAD.

Goal: determine whether the current control-plane architecture is complete enough to proceed cluster-by-cluster, and identify any P0/P1 blockers that must be closed before long-play acceptance. The product target is not "a few 60-turn greens"; it is a high-quality gameplay cycle that stays coherent at turn 1, turn 60, turn 600+, after clone/replay/rollback, and after partial failures.

Please review:

1. Full mapped cycle: UI action intake -> turn lease/snapshot -> due-world/scene frame/forecast -> GM Read -> GM Tool Loop -> executor -> receipts -> actor/world runtime -> time -> narrator packet -> final narration -> SSE/API/frontend -> clone/replay/rollback/vector -> observability.
2. State-class ownership: source of truth, one write owner, support-only surfaces, model-authored fields, validators, receipts, projections, recovery modes, tests.
3. In-game agents/tool-calling: GM Read, GM Tool Loop, executor, actor scheduler, actor agents, world-thread runtime, narrator, public projection, recovery services.
4. Ref/capability authority: scene aliases, tool result aliases, quick action capabilities, narration fact refs, public DTO handles.
5. Whether the current P0/P1 gap matrix is correct.

Specific questions:

- Is restore/rollback crash convergence correctly classified as P0?
- Should any listed P1 be promoted to P0 for architecture acceptance?
- Is the `factRefs -> backend prose expansion` narration design sufficient for creative play while preserving gameplay truth?
- Is deferred/advisory world forecast acceptable, or should Phase 95 wire forecast refresh into the player-turn loop?
- Is fail-closed replay-preserving clone acceptable while clean-start clone is the supported gameplay path?
- Is the split between store manifest ownership and gameplay lane ownership acceptable, or should it be unified before more implementation?
- Are any layers, invariants, state classes, or agent/tool roles missing from the canvas?

Please return:

1. Verdict: ARCHITECTURE GO / CONDITIONAL GO / NO-GO.
2. P0 blockers with exact evidence.
3. P1 blockers with exact evidence.
4. Missing architecture layers or invariants.
5. Implementation order if conditional.
6. Any assumptions you could not verify from the bundle.

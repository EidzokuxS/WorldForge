# Oracle Request: Phase 95 Architecture Review, Compact Bundle

Repo: `R:\Projects\WorldForge`
Branch: `develop`
HEAD: `458d08c10002b566c18d1726fb3d87218bdb7e04`
Reset baseline: `f8d2b3b05cf6a6598208e170f414d171a44ccaf4`

Context: a previous 30-file broad bundle produced only one short observation about restore crash convergence. Treat that as incomplete, not as a full review. This compact bundle contains the current architecture canvas plus representative source for the highest-risk contracts. Please answer all requested sections even if the verdict is blocked by one issue.

Review target: the Phase 95 gameplay control plane for a long-lived LLM-driven RPG. The target is high-quality play at turn 1/60/600+, not merely 60-turn smoke tests. Creative narration may vary, but gameplay truth must remain backend-owned through explicit refs, tool ownership, receipts, time, public projection, clone/replay/rollback/vector, and recovery contracts.

Required answer format:

1. Verdict: `ARCHITECTURE GO`, `CONDITIONAL GO`, or `NO-GO`.
2. P0 blockers. Use `none` if none beyond restore crash convergence.
3. P1 blockers. Promote any current P1 to P0 if it blocks architecture acceptance.
4. Missing layers/invariants/state classes/agent roles, if any.
5. Assessment of the current state-owner matrix and tool-calling architecture.
6. Assessment of final narration architecture (`factRefs` selected by model, backend expands prose).
7. Assessment of clone/replay/rollback/vector recovery.
8. Implementation order.
9. Unverified assumptions.

Specific questions:

- Is restore/rollback crash convergence correctly P0?
- Should `done` DTO blocklist projection, deferred forecast refresh, hidden-cause semantic leakage, missing positive player-turn `allowedWriteScopes`, actor-lifecycle effect parity, support/background `executeToolCall` callers, replay-preserving clone, lore-vector freshness, or log handle redaction be promoted to P0?
- Is fail-closed replay-preserving clone acceptable while clean-start clone is the supported gameplay path?
- Is the split between store manifest ownership and gameplay lane ownership acceptable?
- Does the current architecture cover all in-game agents and tool-calling roles: GM Read, GM Tool Loop, executor, actor scheduler, actor tools, world-thread runtime, narrator, projection, recovery?

Please ground the answer in the attached canvas/source. If you cannot verify something from the compact bundle, list it under `Unverified assumptions` rather than guessing.

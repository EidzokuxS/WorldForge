# Phase 95 Oracle Request: Full Gameplay-Cycle Architecture Review

Project: WorldForge
Branch: `develop`
Review HEAD: `881156cd191db83aedefab326854cc1b3bb5bc04`
Date: 2026-05-31

## Product Goal

WorldForge Phase 95 is not a quest for a few scripted 60-turn greens. The target is a high-quality, long-lived LLM-driven RPG gameplay loop that remains coherent and playable on turn 1, turn 60, turn 600, and beyond because the gameplay control plane has explicit owners and executable contracts.

The key product invariant is:

> Model proposes; backend owns validation, authority, mutation, receipts, time, persistence, clone/replay/rollback, public projection, recovery, and final-narration grounding.

The game must support creative, fun narration, but final narration must be grounded in accepted backend-visible facts. UI labels and quick-action prose are presentation; backend handles/capabilities carry authority.

## Review Question

Please review the attached Phase 95 architecture bundle as a full gameplay-cycle architecture gate.

Answer these questions:

1. Is the gameplay control plane architecturally coherent from UI action intake -> GM Read -> GM Tool Loop -> executor -> receipts -> actor/world runtime -> time -> narrator packet -> final narration -> SSE/API/frontend -> clone/replay/rollback/vector -> observability?
2. Are there any remaining P0/P1 architecture blockers before implementation continues?
3. Is the Wave E priority order correct, or should any item be promoted/demoted?
4. For each significant remaining decision, compare options instead of inheriting old Phase 95 answers.
5. Do the current P1s look like real gameplay architecture risks, not harness churn?
6. What should be the next two coherent commits?

## Current Local Verdict Before Oracle

Local 6+1 orchestration verdict:

- Conditional GO for GM Read -> GM Tool Loop -> executor authority.
- Conditional GO for API/SSE/frontend projection authority.
- Conditional GO for clone/replay/rollback/vector ownership, with one P1 interrupted-restore integrity gap.
- Conditional GO for narrator grounding architecture, with P1 playability gaps in backend-owned narratable facts.
- NO-GO for Phase 95 long-play acceptance until current-HEAD Browser evidence, Oracle review, fresh/cloned human-style 60-turn campaigns, and longer soak/replay coverage pass.

## Current P1s

1. State owner matrix:
   `assertRuntimeEffectStateOwnerParity()` covers runtime effect kind -> state lane, but every gameplay state lane does not yet have one executable matrix naming source of truth, write owner, validators, receipts, projections, recovery modes, and tests. `chronicle_entry` and `entity_tag_service` are the most important examples.

2. Narratable settled facts:
   Quiet/no-mutation direct turns can still lack a backend-owned citable scene/status beat. Movement plus time remains split into separate citable facts, so one grounded sentence cannot naturally say both "time passed" and "you arrived" without backend-provided combined fact.

3. Staged restore integrity:
   Interrupted pending restore journal repair checks staged file existence, but does not revalidate staged DB/config/chat/vector physical evidence hashes against the original bundle manifest before applying staged restore.

4. Current-HEAD Browser evidence:
   Existing Browser evidence is stale relative to `881156cd`; current-head in-app Browser proof is still needed for `/game`, freeform action, quick action handle, Ready state, and raw-ref leak checks.

## Output Format Requested

Please respond with:

- `Verdict`: GO / CONDITIONAL GO / NO-GO for architecture, separately from gameplay acceptance.
- `P0/P1 Findings`: each with evidence, why it matters to 1/60/600-turn play, and concrete fix/test.
- `P2/Debt`: only real acceptance risks.
- `Option Comparisons`: for state owner matrix, quiet scene facts, movement-time facts, staged restore revalidation, and Browser/acceptance evidence.
- `Recommended Next Commits`: two coherent implementation slices, with tests.
- `References Used`.
- `Unverified Assumptions`.

Do not treat old Phase 95 commits or agent answers as architectural authority. They are context only. Judge from first principles and the current bundle.

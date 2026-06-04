Verdict first: **CONDITIONAL ARCHITECTURE GO**.

Separate acceptance gate: **LONG-PLAY ACCEPTANCE NO-GO**.

I find no remaining **P0** architecture blocker in the attached R4 evidence. The R3 restore/rollback crash-convergence P0 appears closed at architecture level by the journaled staged-restore design. However, I would not grant unconditional architecture GO until two P1 conditions are either closed or explicitly waived: semantic classification of public NPC fields on `/world.npcs[]`, and proof that production executor callers cannot bypass strict authority through legacy/unscoped paths.

The project’s own R4 request correctly frames the target as a playable long-lived LLM RPG, not “several green 60-turn runs,” and asks for architecture and long-play acceptance to be judged separately. The architecture document also says the Browser smoke only proved a freeform action returned to `Ready`, while prose remained label-heavy and low quality; that is workability evidence, not acceptance.

## P0/P1 blockers

**P0: none found.**

The control-plane model is coherent: model proposals are separated from backend validation, authority, mutation, receipts, time, persistence, projection, recovery, and observability. That matches both the supplied harness rubric and the attached agent-harness best-practice stance that the harness, not the model, validates, authorizes, executes, records, summarizes, and returns observations.

**P1-A: `/world.npcs[]` semantic projection still needs explicit public/private classification.**

The R4 slice closes the specific legacy NPC-envelope leak: `characterRecord`, `draft`, and legacy `npc` are blocked on the backend world projection contract, and the frontend parser ignores stale legacy NPC envelopes. The projection contract’s private NPC field guard is explicit about those three keys.  The current `/world.npcs[]` payload, however, still returns `persona`, `goals`, and `beliefs` for NPC rows, along with public handles and location handles.

That may be acceptable only if those fields are intentionally public player-visible canon. If they are private actor/world-brain state, this is still a public DTO leak that can become player authority through UI display, model-facing replay context, or player decisions. The code evidence says “legacy envelope leak closed,” not “all semantic NPC privacy classified.” I would close this by either stripping/gating `persona/goals/beliefs` through scene awareness, or adding a projection contract that declares them public and tests why they are safe.

**P1-B: prove strict authority for all production executor callers; remove or quarantine legacy bypass.**

The GM tool loop itself is strong: active tools are derived from runtime requirements, incompatible tools are rejected, terminal receipt closure is enforced for dialogue/world-fact turns, state-bearing calls are wrapped in a mutation boundary/savepoint, and unaccepted authority-bearing results are blocked before commit.

The tool execution context also has the right architecture for actor/background authority: state-bearing background tools require a source entity and non-empty allowed write scopes, and write-scope coverage/conflict checks exist.

The remaining issue is not the GM path; it is caller graph assurance. The R4 document itself lists as an unverified assumption that non-GM executor callers remain covered by the same strict authority contract or are explicitly legacy/test-only.  For architecture GO without condition, I would require evidence that no production actor, due-world, test harness, debug route, or migration path can execute state-bearing tools with legacy/unscoped authority. If that proof already exists outside this bundle, cite it and downgrade this to P2.

## What is architecturally GO

The **full gameplay control plane** is present. The architecture map covers UI action intake, quick-action capabilities, turn lease and snapshot, due-world pre-frame, scene refs, GM Read, optional oracle/contest, GM tool loop, executor, actor and due-world runtime, time, settled packet, final narration, SSE/API/frontend projection, clone/replay/rollback/vector, and observability.

The **agent/tool authority boundary** is broadly correct. Player, GM Read, GM Tool Loop, actor brain, due-world/proposal, narrator, frontend, and playtester roles are separated; tool visibility is descriptor/runtime-derived; accepted mutations require receipts or authority traces; helper results cannot close terminal authority; actor/due-world work requires positive write scopes; every tool result/denial/error/rollback must return a structured observation.

The **restore journal closes the R3 P0 at architecture level**. Restore writes a journal atomically, stages bundle files, closes DB/vector handles, copies DB/config/chat/vector stores step by step, records phases, repairs pending restore before campaign load, finalizes after load, invalidates authority against the restored clock, clears pending committed events, and rebuilds episodic vectors when vectors were not restored.    The recovery matrix also explicitly covers restore-after-staging and vector reconcile behavior.

The **terminal `done` SSE hardening is architecturally sound**. R4 reports that terminal `done` moved from blocklist behavior to explicit allowlist, and the chat route implementation allows only clock boundary fields and a few booleans through the public `done` event.  Combined with public projection raw-ref guards, this closes the specific R3/R4 `done` boundary concern.

The **final narration architecture remains GO for creative play**, but not yet for product acceptance. The narration guard forces structured grounded sentence drafts, restricts evidence refs and backend fact refs, and prefers backend fact expansion over free legacy text.  That is the right architecture for truth stability. The observed label-heavy Browser prose is a product-quality risk: it may be prompt/style/fact-packet shaping rather than an authority failure. If long-play evidence shows the grounded packet only contains label-like facts that cannot support enjoyable prose, then this becomes a narrator-packet architecture issue, not just prompt polish.

The **clone position is acceptable for Phase 95 architecture**. Clean-start clone rewrites gameplay state and rejects/purges/rebuilds stores according to policy, while replay-preserving clone fails closed rather than pretending to support semantics it does not implement.  The architecture document explicitly chooses clean-start plus fail-closed replay-preserving clone to avoid overclaiming.

## P2/watch items

The most important P2 is **gameplay feel**. The Browser smoke proved the route can complete, not that the game is fun. The doc explicitly says broader Browser workability, fresh/cloned human-style campaigns, longer soak/replay, and evidence capture remain required.

Watch **forecast cadence and support context**. The architecture treats forecasts as advisory/support-only with hidden-leak tests, but also names cadence as a watch item. If long play shows stale pressure degrading agency or coherence, promote this.

Watch **public projection expansion**. The projection guard is good for known surfaces, but any new route or DTO must be added to the public projection contract before acceptance. The R4 document already calls that out.

Watch **rollback/vector parity under soak**. The restore policy is credible, but long-play runs should still verify no failed-turn vectors, stale quick actions, stale episodic rows, or stale authority traces survive undo/retry/checkpoint restore.

Watch **narration quality under grounded fact refs**. The architecture should not loosen grounding to improve prose. Instead, improve the narratable fact packet, style instructions, and fact-to-prose compiler so final text is grounded without sounding like internal labels.

## Direct answers to the nine R4 questions

1. **Complete gameplay control plane?** Yes, architecturally complete from UI intake through GM Read, tool loop, executor, receipts, actor/due-world runtime, time, narrator packet, final narration, projection, clone/rollback/vector, and observability. The caveat is that completeness of shape is not acceptance evidence.

2. **Missing state source of truth/write owner/validator/receipt/projection/recovery/test?** No broad missing class is evident. The state-class matrix and state-owner registry cover the major gameplay lanes. The conditional gaps are projection classification for NPC semantic fields and production caller proof for strict executor authority.

3. **Agent roles/tools/scopes/terminal receipts sufficient for long play?** Sufficient as an architecture direction. The GM tool loop’s runtime-requirement profiles, terminal closure, mutation boundary, receipt checks, write-scope checks, and structured observations are the right long-play control plane. The remaining P1 is ensuring every non-GM production caller is equally constrained.

4. **Did restore journal close R3 restore/rollback P0?** Yes at architecture level. The staged journal, phase tracking, pre-load repair, post-load finalization, authority invalidation, pending-event clearing, and vector rebuild/purge policy close the crash-convergence P0. I see no remaining restore P0/P1 from the attached evidence.

5. **Did public projection slice close terminal `done` and `/world.npcs[]` P1?** It closes terminal `done` and the legacy `/world.npcs[]` envelope leak. It does not fully settle semantic public/private NPC projection unless `persona/goals/beliefs` are intentionally public. Treat that as P1 until classified or gated.

6. **Final narration GO or deeper architecture problem?** Still architecture GO. Poor current Browser prose is a gameplay-quality risk, not yet proof of a broken architecture. It becomes architectural only if grounded fact packets cannot provide enough narratable, player-facing facts without leaking authority or private state.

7. **Clean-start clone plus fail-closed replay-preserving clone acceptable?** Yes for Phase 95 architecture and for resuming validation, provided acceptance is explicitly scoped to clean-start clone and fail-closed replay-preserving requests. Replay-preserving clone is not required before long-play validation, but it cannot be claimed as supported.

8. **Architecture gate:** **CONDITIONAL ARCHITECTURE GO.**

9. **Long-play acceptance gate:** **NO-GO.** Current evidence is harness/workability evidence, not human-style gameplay acceptance.

## Human-style fresh/cloned long-play validation

Human-style fresh and cloned long-play validation may resume **as validation, not acceptance**, once the two P1 conditions are closed or explicitly waived: classify/gate `/world.npcs[]` semantic fields, and prove no production executor caller can bypass strict authority. The validation should include fresh campaigns and clean-start clones, rollback/undo/retry/checkpoint restore, SSE disconnect/resume, pending narration recovery, vector reconcile, and at least one long soak aimed at turn-600-style coherence rather than scripted success.

Acceptance should remain blocked until evidence includes source campaign id, clone id where used, backend/frontend URLs, route, turn counts, terminal event counts, stop reason, artifact root, trace id where enabled, and qualitative review of whether the player-facing loop is actually coherent and fun. Green tests and scripted runs are necessary smoke evidence, not a product GO.

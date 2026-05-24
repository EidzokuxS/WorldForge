# Phase 95 Full-Cycle Architecture R4 Oracle Request

Date: 2026-05-24
Branch: `develop`
Implementation HEAD under review: `7ea2f46e7f85e6b485b1552df1ef090b7ba5c446`
Delivery intent: one browser-uploaded bundled file, not many inline files.

Review the current-head WorldForge Phase 95 gameplay-cycle architecture for a
long-lived LLM-driven RPG. The product goal is not "several green 60-turn
runs." The product goal is a high-quality playable loop that remains coherent
and fun at turn 1, turn 60, turn 600+, across clone/replay/rollback, recovery,
final narration, UI projection, and in-game agent/tool calling.

Important context:

- R3 Oracle returned `CONDITIONAL GO` for architecture direction and `NO-GO`
  for long-play acceptance.
- R3 named restore/rollback crash convergence as the confirmed P0.
- Since R3, `9ab76db0` added a crash-convergent restore journal and tests.
- Since R3, `7ea2f46e` hardened terminal `done` SSE and `/world.npcs[]` public
  projection boundaries.
- Current local tests/typechecks passed, GitNexus `detect_changes` was used,
  and the GitNexus index was refreshed with embeddings.
- In-app Browser smoke after the projection slice proved the game can complete
  a freeform action back to `Ready`, but the visible prose was still
  label-heavy and low quality. Treat this as a product/gameplay-feel risk, not
  acceptance.

Rubric:

- Model proposes; backend owns validation, authorization, mutation, receipts,
  time, persistence, clone/replay/rollback, public projection, recovery, and
  observability.
- Player/model-facing refs must be issued aliases or backend capabilities, not
  raw DB ids.
- UI labels and quick-action prose are presentation; authority is backend
  handles/capabilities.
- State classes need one write owner.
- Final narration must be grounded in accepted backend-visible facts while
  still supporting creative play.
- Do not optimize for harness churn. Judge the actual gameplay loop.

Questions:

1. Does current HEAD have a complete gameplay control plane from UI action
   intake through GM Read, GM Tool Loop, executor, receipts, actor/world
   runtime, time, narrator packet, final narration, SSE/API/frontend projection,
   clone/replay/rollback/vector, and observability?
2. Are any gameplay state classes missing a source of truth, single write
   owner, runtime validator, receipt, projection, recovery mode, or test?
3. Are in-game agent roles, tool availability, tool-call validation, permission
   scopes, terminal receipts, and backend authority boundaries sufficient for
   long play?
4. Did the R4 restore journal design close the R3 restore/rollback P0, or is
   there still a crash/recovery P0/P1?
5. Did the R4 public projection slice close the terminal `done` and
   `/world.npcs[]` projection P1, or are there still public DTO leaks that can
   become player authority?
6. Is the final narration architecture still a GO for creative play, or does
   the poor current Browser prose indicate a deeper architecture problem?
7. Is clean-start clone plus fail-closed replay-preserving clone acceptable for
   Phase 95 architecture, or does the product goal require replay-preserving
   clone before long-play validation?
8. Give a binary gate for architecture only: `ARCHITECTURE GO`,
   `CONDITIONAL ARCHITECTURE GO`, or `ARCHITECTURE NO-GO`.
9. Separately give a gate for long-play acceptance. Do not conflate architecture
   review with human-style gameplay acceptance.

Desired output:

- Verdict first.
- P0/P1 blockers if any, with file/function evidence.
- P2/watch items separately.
- Explicit answer on gameplay quality vs harness quality.
- Explicit answer on whether human-style fresh/cloned long-play validation may
  resume, and under what conditions.

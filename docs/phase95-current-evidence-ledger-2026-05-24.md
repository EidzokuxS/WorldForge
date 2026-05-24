# Phase 95 Current Evidence Ledger

Date: 2026-05-24
Branch: `develop`
Current pushed HEAD before this verifier slice:
`8fbc52c9866a58daba0984d74e167dd8101a62e8`

## Product Gate

Phase 95 is still **not accepted**. The target is a long-lived, coherent,
LLM-driven RPG loop, not a pile of green scripted runs. Current evidence proves
important control-plane contracts and one in-app workability smoke, but not
fresh/cloned 60-turn human-style campaigns or 600+ soak/replay behavior.

## Current Evidence

- Focused Oracle vector recheck:
  `phase95-vector-rollback-focused-recheck` returned `VECTOR P1 CLOSED`.
  The saved transcript matches the CLI answer.
- In-app Browser workability smoke:
  `output/phase95-browser-smoke-20260524-1705.md` records `/game` load, Saves
  drawer, one freeform action, return to `Ready`, cleared draft, updated scene
  beat, and zero console errors.
- Source-scope backend architecture pack:
  `15` files, `404` tests passed for gameplay control-plane contracts, tool
  contracts, GM Read, GM Tool Loop, actor plan execution, living-world
  authority, narrator packet/grounding/visible guard, world-brain/forecast,
  quick actions, chat route resilience, and observability stream safety.
- Due-world/proposal pack:
  `7` files, `60` tests passed for simulation write scopes, queue/lifecycle,
  proposal truth boundary, surface signals, proposal executor, and key actor due
  plans.
- Frontend projection/play-surface pack:
  `3` files, `26` tests passed for quick actions, narrative log, and narration
  dock; frontend typecheck passed.
- Adaptive-run verifier:
  `scripts/phase95-verify-adaptive-run.mjs` now validates adaptive evidence
  roots for clone lineage, required artifacts, turn/done boundaries, raw-ref
  and internal-contract leaks, quick-action capability authority, progress
  stops, repeated action/narration loops, and action-mode diversity. Its
  regression suite covers fresh and clone roots, clone-manifest/source-id
  residue, public world/history projection leaks, quick-action authority, and
  60-turn mode diversity; current run passed `6/6`.
- Issued-ref owner matrix:
  `backend/src/engine/gameplay-control-plane-contract.ts` now records issuer
  owner, resolver owner, validators, receipts, projections, recovery modes, and
  test evidence for every issued-ref namespace: scene aliases,
  tool-result aliases, quick-action capabilities, narration facts, and public
  DTO handles. Current targeted contract run passed `10/10`; backend typecheck
  passed.

## Independent Agent Evidence

Clone/replay/rollback audit verdict: **CONDITIONAL**.

No P0 was found. No code-level P1 was identified in clone/replay/rollback
contracts. The remaining P1 is an evidence gap: long-campaign clone/replay/
rollback behavior is not yet proven by fresh/cloned 60-turn and longer
soak/replay artifacts. The audit specifically recommends one bounded,
instrumented cloned-campaign replay/rollback scenario before broader
acceptance.

## Next Evidence Sequence

1. Run the adaptive verifier against a short fresh pilot root and a short clone
   pilot root before any 60-turn claim. Use
   `scripts/phase95-clone-adaptive-setup.ts` for clone setup so the baseline
   pool promise is awaited and clone provenance artifacts are written before
   verification.
2. Run one bounded cloned-campaign rollback/replay pilot: create clean clone,
   run several real turns, force or exercise rollback-critical recovery, verify
   DB/chat/history/public projection/vector evidence before and after retry.
3. Only after pilot evidence is clean, run fresh and cloned human-style
   60-turn campaigns.
4. Run longer soak/replay coverage last. Sixty turns remain smoke evidence; the
   product target is the quality and trustworthiness of the cycle at long
   horizon.

## Current Non-Blocking Debt

- Radix Dialog missing description warnings remain P2 UX/accessibility debt.
- The primary in-app Browser `node_repl` bridge failed to initialize during
  the latest smoke, so the Browser fallback page controls were used. This is a
  tooling note, not a gameplay failure.
- Existing `.planning` evidence jsonl files are dirty and unrelated to this
  slice; they were not touched.

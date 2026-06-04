# Phase 95 Current Evidence Ledger

Date: 2026-05-24
Branch: `develop`
Current pushed HEAD before this verifier slice:
`10f031ec17725298156b43185ed22b721a0fff39`

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
- Post-GM-Read-fix in-app Browser smoke:
  `phase95-browser-smoke-after-gmread-fix-20260524.md`,
  `phase95-browser-smoke-depth6-after-gmread-fix-20260524.md`, and
  `phase95-browser-smoke-after-gmread-fix-20260524.png` record `/game` loaded
  and ready after the clone pilot fix, with player Mara Venn at the Disaster
  Route Gatehouse, a usable action dock, zero console errors, and two known
  Radix Dialog description warnings.
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
- GM Read structural dialogue repair:
  live clone turn evidence found that a model could mark
  `dialogue_outcome.requiresStructuralEffect=true` without naming an
  `effectKind`. That case now reaches semantic GM Read validation as a
  repairable issue instead of failing native schema generation before repair.
  The repair prompt requires either explicit structural owner classes or
  `requiresStructuralEffect=false` for answer/refusal/warning/route-hint style
  dialogue. Focused GM Read tests pass `72/72`.
- Restore clock recovery:
  rollback/restore invalidation now restores `world_clocks.currentTick` from
  the snapshot/checkpoint clock, not from `worldTimeMinutes`. Clock ledger
  restore entries use the restored current tick as `uiTurnOrdinal` while
  preserving zero elapsed minutes. Focused restore/clock tests pass `33/33`,
  adjacent knowledge/integration tests pass `6/6`, and backend typecheck
  passes.
- Adaptive-run verifier:
  `scripts/phase95-verify-adaptive-run.mjs` now validates adaptive evidence
  roots for clone lineage, required artifacts, turn/done boundaries, raw-ref
  and internal-contract leaks, quick-action capability authority, progress
  stops, repeated action/narration loops, and action-mode diversity. Its
  regression suite covers fresh and clone roots, clone-manifest/source-id
  residue, public world/history projection leaks, quick-action authority, and
  60-turn mode diversity. The latest verifier boundary also allows normal
  hyphenated in-world prose such as `Route-Scout` while still rejecting
  machine-shaped ids such as `route-a1`; current run passed `7/7`.
- Clone pilot after the GM Read/restore fixes:
  `output/phase95-clone-pilot-human-20260524-1800` cloned source campaign
  `b876b838-0e49-44a4-9693-8cf23a2ba4a4` into
  `51064126-fdd6-465f-9d4f-f9ed7c39b599`, completed `3/3` adaptive turns, and
  passed `scripts/phase95-verify-adaptive-run.mjs` with
  `PHASE95_TARGET_TURNS=3`, `hardFailureCount=0`, and `warningCount=0`.
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

1. Run a short fresh pilot root through the adaptive verifier before any
   60-turn claim. The latest short clone pilot is clean, but the fresh pilot
   setup still needs a successful generated-world root after the earlier
   worldgen timeout.
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

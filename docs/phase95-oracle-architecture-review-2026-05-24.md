# Phase 95 Oracle Architecture Review - 2026-05-24

Session: `phase95-architectu-bundle-go`

Bundle:

- 20 files bundled into one browser attachment.
- Estimated input: about 175k tokens.
- Model evidence: requested Pro, resolved Extended Pro, verified by Oracle.
- Result: completed.

## Verdict

NO-GO for broad Phase 95 implementation.

GO only for a narrow architecture-hardening slice that freezes executable
contracts before gameplay feature work expands.

## Why

The architecture direction is correct:

- model proposes;
- backend owns validation, authority, mutation, receipts, time, persistence,
  clone/replay/rollback, public projection, and recovery;
- refs should be issued aliases/capabilities;
- narration should be grounded in accepted facts;
- clone/replay/rollback should be store-manifest driven.

But several high-risk boundaries are still design intent rather than executable
contracts. Those are the exact places that fail at turn 60, turn 600, clone,
replay, rollback, and resume.

## P0 Blockers

- Public projection is not a closed authority boundary yet.
- Clone/replay/rollback/vector lifecycle is not contract-closed.
- Clock authority is still split.
- Live final narration must not retain an authority-bearing `text` lane.
- Shared issued-ref/capability resolver is mandatory.

## P1 Blockers

- Actor/due-world fences need executable proof.
- State-owner lanes are still too coarse in places.
- World-brain/forecast/support-only text can become hidden-fact authority.
- Quick-action source digest semantics need tightening.
- Recovery needs one settled-turn resume contract.

## Required First Slice

Implement and test these contracts before broad feature work:

- turn authority lifecycle;
- store manifest;
- executable state-owner registry;
- issued refs/capabilities;
- public projection DTOs;
- turn clock ledger;
- fact-ref final narration contract.

## Key Option Decisions

- Durable quick-action offers are correct; signed tokens alone are insufficient.
- Shared issued-ref resolver is correct, but it must handle multiple lifetimes:
  prompt aliases, same-turn tool aliases, durable UI capabilities, narration
  fact refs, and public DTO handles.
- Turn clock ledger is correct, but `config.currentTick` must not remain a
  gameplay writer.
- Fact-ref-only live narration is correct; legacy text can exist only outside
  normal gameplay authority.
- Clean-start clone first is correct; replay-preserving clone should remain an
  explicit future mode that fails closed until id/saga/vector/packet rewrite is
  proven.

## Evidence Required For Turn-600 Stability

- Contract tests for owner registry and tool lanes.
- Ref/capability tests for raw ids, stale aliases, forged handles, expiry,
  consumption, clone invalidation, and replay behavior.
- Clock tests proving world time equals accepted ledger deltas.
- Receipt tests proving no mutation exists without accepted receipts.
- Actor/due-world tests proving player-owned fences.
- Narration tests proving structural claims are fact-ref grounded.
- Projection leak scans after every turn.
- Clone tests at turns 0, 10, 60, 300, and 600.
- Rollback/replay tests with state hashes.
- Crash-injection tests across every turn stage.
- Human-style fresh and cloned campaigns, with scripts used only as transport
  and evidence collection.

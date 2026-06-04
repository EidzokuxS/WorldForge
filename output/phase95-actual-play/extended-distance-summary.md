# Phase 95 Extended Distance Playthrough

## Scope

- Campaign: `6712d1bb-7bda-460f-b4df-dc9b88c16535`
- World: `Glass Tides of Moth-Court`
- Player: `Nyx Arlen`
- Transcript: `output/phase95-actual-play/transcript.md`
- Segment: turns 12-40 after the original 11-turn probe
- Result: 29 consecutive continuation turns completed with `status=done`
- Caveat: the full transcript is not a clean 40/40 run because the original probe contains historical turn 4-5 failures that were later fixed.
- Final state: tick 387, worldVersion 63, location `Flooded Stairwell Registry`

## What Was Tested

- Procedural play without revealing sealed-proof contents until an authorized office required it.
- Bad-paperwork shortcut using `Cheap Legal Stamp`.
- Dead-end handling when the player refuses to open sealed proof.
- Official unsealing/review flow through the Archive.
- Durable consequence pressure from a bridge warning rider.
- Time-gated movement through high tide / low tide.
- Unsafe off-path descent during high tide.
- Attempted progression toward `Moth-Lit Hearing Chamber`.

## Evidence Highlights

- Turn 16: `Cheap Legal Stamp` shortcut is rejected and logged as a formal warning.
- Turns 18-22: registry refuses sealed-document bypass and forces Court/Archive handling.
- Turn 23: rising water changes route urgency and audience-slot pressure.
- Turn 26: official archive review reveals docket `9-DRIFT-VEY`, next routing, and bridge-warning rider.
- Turn 27: archive clerk creates a durable review receipt in narration.
- Turn 30-34: high tide blocks Hearing Chamber crossing and unsafe descent is refused.
- Turns 35-37: waiting advances world time from 138 to 379 and low-water authorization becomes available.
- Turn 40: chamber entry is still blocked by missing red-ink validation, with four new options offered.

## Findings

### Working

- The world did generate new offices, routes, NPCs, and constraints as play continued.
- Edge-case pressure did not collapse into instant success: bad stamp, sealed-proof refusal, unsafe descent, and high-tide crossing all produced blockers.
- Consequences persisted narratively: the bridge warning was later referenced by registry/archive/watchpost actors.
- Time changed the world: waiting at the watchpost eventually shifted high tide into low water and unlocked authorization.

### Not Working Enough

- Durable documents are still too narrative-only. The docket receipt, warning rider, tide-crossing stamp, and archive review receipt were repeatedly described as carried documents, but final inventory still only lists initial items.
- `Anonymous Sealed Proof` remained named and summarized as the same initial item even after official unsealing/review.
- Route state lagged behind authorization: after the watchpost stamp, no direct `Moth-Lit Hearing Chamber` route appeared at the watchpost; travel dropped the player back to the registry first.
- NPC identity drift/duplication persists (`Archive Review Clerk` duplicated; bridge clerk labels vary).
- The player can still smuggle uncommitted document transitions by phrasing an action as already complete, as in turn 26's "After the official unsealing" before a typed unsealing transition existed.

## Oracle Cross-Review

- Oracle review file: `output/phase95-actual-play/oracle-extended-review.md`
- Delivery evidence: browser run reported `files=5`.
- Verdict: the continuation is meaningful distance evidence, but robust Phase 95 playability remains blocked by document/inventory typed-state gaps.

## Verdict

This is now a real distance playthrough continuation, not an 11-turn smoke run. It supports the claim that the live runtime can sustain procedural world change across locations and consequences. It also shows the next hard problem clearly: important game-state documents still need structured state, not just narration.

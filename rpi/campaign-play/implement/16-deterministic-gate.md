# Task 16A: deterministic integration and promotion gate

Status: packet 16A.1 complete; deterministic replay implementation in progress.

## Evidence contract

The Campaign Play evidence format now has strict schemas for run configuration, manifests, eligibility, opening and player-action counts, checkpoints, budgets, turn and mutation ledgers, scorecards, and SHA-256 inventory entries.

Opening uses `openingTurn: 0`. Completed gameplay counts use contiguous `playerActionNumber` values beginning at 1. The validator rejects records that mix the two counters.

The eligibility contract freezes the accepted snapshot and content hashes, reachable topology, one key actor, two support actors, one collective, pressure anchors, opening candidates, exposure paths, plans, and schedules before opening begins.

The scorecard derives promotion from measured coverage. Promotion requires the target number of completed player actions, full Rulebook receipt coverage, one runtime event per runtime revision, sanitized turn-event coverage for turn-owned changes, zero hard failures, and zero unresolved findings.

## Bundle validation

`validateCampaignPlayBundle` checks:

- every required file and directory from the canonical plan;
- strict JSON and JSONL record shapes;
- consistent run and campaign ownership;
- contiguous player-action numbers and unique turn and idempotency IDs;
- terminal state for every turn in a complete bundle;
- a continuous runtime revision and hash chain;
- absence of `/game`, `/api/chat/*`, and displaced worldgen-character requests;
- empty browser-console and network-error ledgers for complete runs;
- canonical file ordering, byte counts, and SHA-256 hashes for every bundle file except the inventory itself.

Strict public-evidence schemas reject extra protected payload fields. Later secrecy probes still own semantic leak detection; the validator records their result through the scorecard.

## Verification

- Campaign Play evidence tests: 3 files, 16 tests passed.
- Evidence TypeScript project: passed with no emit.
- `git diff --check`: passed.
- Existing production symbols changed: 0. Packet 16A.1 adds isolated evidence code and task notes only.
- Standalone smoke additions: 0.

Humanizer/deslop review found the contract note direct and evidence-bound. It contains no player-facing copy or model prompt changes.

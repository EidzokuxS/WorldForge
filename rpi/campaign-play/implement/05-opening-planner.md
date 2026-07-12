# Task 5: Campaign Play opening planner

Date: 2026-07-11  
Status: complete.

## Outcome

Campaign Play now owns a pure opening-planning boundary. It consumes one frozen accepted-world frame plus chosen or delegated starting conditions and returns an immutable proposal artifact. The artifact contains code-owned bootstrap commands, one typed plan and schedule per eligible actor, one earned-visibility seed, and the local facts permitted to reach narration.

Files:

- `backend/src/campaign-play/opening-prompts.ts`;
- `backend/src/campaign-play/opening-planner.ts`;
- `backend/src/campaign-play/opening-planner.test.ts`;
- exports in `backend/src/campaign-play/index.ts`.

The planner imports no database, repository, route, world writer, or old gameplay surface. Task 10B will persist and execute the returned artifact through the opening turn.

## Contracts proved

- Chosen starting conditions are copied exactly. Delegated conditions let the model select values from the accepted frame.
- The frame requires accepted provenance, matching campaign/version/hash, one canonical macro start, bounded unique player labels, unique world IDs, eligible actors, and a command batch within the shared limit.
- The proposed opening location must be reachable from the canonical directed start. The scene requires a present support person, a local pressure, and an outgoing route.
- Every key, support, and collective actor receives exactly one plan and schedule. Every active goal appears in its actor plan. Background actors receive no opening plan.
- Model targets must resolve to accepted entities and to at least one location reachable from the actor. Collectives use every base and influence placement.
- The hidden consequence belongs to an eligible non-local actor and active goal. It reaches earned visibility within five completed player actions through a validated route, witness, or local aftermath path. Local aftermath remains valid for the shortest directed travel duration.
- IDs, batch order, causal lineage, expected versions, scopes, preconditions, schedules, commands, canonical bytes, and hashes are code-owned. Opening command zero is rooted in the opening turn; each later command is rooted in its predecessor.
- Narrator facts contain the opening location, player role and arrival, present support person, local pressure, and visible route. They exclude the hidden actor, hidden goal, distant cast, and global state.
- Model execution permits one registered strict structured-output attempt. Repair, full retry, text fallback, provider switching, and strategy mismatch fail with sanitized evidence.
- Compiled artifacts and nested values are frozen without freezing caller-owned proposal data.

## Verification

```powershell
npm --prefix backend test -- src/campaign-play/opening-planner.test.ts
npm --prefix backend run typecheck
git diff --check -- backend/src/campaign-play/opening-planner.ts backend/src/campaign-play/opening-planner.test.ts backend/src/campaign-play/opening-prompts.ts backend/src/campaign-play/index.ts
```

Results:

- focused suite: 1 file, 23 tests passed;
- backend TypeScript check passed;
- diff check passed;
- persistence-boundary fixed-string scan passed;
- standalone smoke additions: 0.

The seeded world contains three directed locations, four eligible actors including one collective, one background actor, multiple goals, placements, relations, and pressures. Regressions cover chosen and delegated starts, unknown and unreachable targets, full active-goal coverage, strict model evidence, causal command chaining, expired aftermath, and collective multi-placement reachability.

## Reviews

The Terra mechanical verifier returned `PASS` after rerunning all 23 tests, backend typecheck, diff check, and the persistence-boundary scan.

The first Sol semantic review found three P1 defects: accepted-world causal roots on opening commands, aftermath expiry before discovery, and single-placement collective reachability. The implementation now uses turn/command causal chaining, validates aftermath lifetime against shortest directed travel minutes, and retains all base/influence placements. The same fresh verifier reran the review and returned `PASS` with zero P0, P1, or P2 findings.

Droid GLM produced no verdict after one substantive custom-model attempt. Its stderr recorded an MCP reload failure, and the process remained silent until stopped. The owner directed advisory tooling to stop blocking execution, so the failure is retained at `.codex/agent-logs/droid-campaign-play-opening-review-20260711-125736.err.log` and implementation proceeded on local proof plus independent Sol/Terra review. The review prompt remains at `.codex/droid-prompts/campaign-play-opening-planner.md`.

Humanizer and deslop criteria found the technical prompt direct and bounded. Task 5 adds no player-visible copy or production UI.

GitNexus could not resolve the untracked Task 5 symbols before editing. Final `detect_changes` reports the accumulated dirty worktree as critical across 45 tracked files; no indexed Task 5 symbol or execution flow appears. All pre-existing and concurrent changes remain preserved.

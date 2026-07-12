# Task 3A: Campaign Play state repository

Date: 2026-07-11  
Status: complete.

## Outcome

Campaign Play now has a mechanics-owned state repository and four deterministic projection domains over the accepted Campaign World and current play rows.

## Projection contract

- Accepted-topology eligibility is a pure canonical projection with typed unmet requirements, a deterministic opening location, reachable macro locations, active actor witnesses, distinct pressure anchors, and one feasible directed non-local exposure path.
- The eligibility SHA-256 is the protected payload commitment of runtime event sequence 1 and is included in runtime truth. Reload reconstructs the same bytes from immutable accepted provenance and rejects drift.
- Before character bootstrap, mechanical bytes reuse Campaign World canonical serialization and the mechanical hash equals the accepted content hash exactly.
- After bootstrap, mechanical truth includes the human actor ID and normalized CharacterRecord hash alongside live time, route, condition, pressure, placement, relation, and goal state.
- Runtime truth covers setup, the active turn, plans, schedules, pending jobs/proposals, knowledge, observations, narration status, worker epoch, and event cursors.
- Protected audit and player-public projections use separate domain tags and hashes. The public projection selects visible fields explicitly and excludes protected command/event payloads.

## Repository contract

- `createState` accepts one canonical accepted Campaign World, evaluates first-gate eligibility, stores mechanical/runtime authority, and inserts `play_state_created` in one SQLite transaction.
- Runtime event 1 moves revision 0 to 1, sequence 1 to the state cursor 2, binds the eligibility hash, and starts from a deterministic pre-state runtime hash.
- `loadState` validates accepted provenance, recomputes mechanical/runtime hashes, verifies the complete contiguous runtime event chain, and derives protected/public projections.
- `commitMechanical`, `commitRuntime`, `commitMechanicalAndRuntime`, and `commitLedger` give callbacks declared prior/target versions and event sequence while the repository retains authority over counters, hashes, and runtime-event insertion.
- A callback that changes an undeclared projection domain or repository-owned authority field rolls back completely.
- The repository compares current locations, routes, non-human actor definitions, pressure definitions, and pressure anchors with the frozen accepted foundation on create, load, and commit. Placements, relations, and goals remain live mechanical state.
- Full post-callback integrity validation runs inside the SQLite transaction. A future or malformed runtime event therefore rolls back the callback, repository event, and authority update together.
- Runtime-bearing commits allocate exactly one contiguous campaign runtime event. Ledger-only commits preserve both current-state hashes and counters.
- Public route state contains routes incident to the player's current location plus routes earned through that player's observations. Unobserved distant route state remains protected.

## Verification

| Command | Result |
|---|---|
| `npm --prefix backend test -- src/campaign-play/campaign-play-state-repository.test.ts src/campaign-play/campaign-play-projection.test.ts` | 24 tests passed |
| `npm --prefix backend run typecheck` | passed |
| `npm --prefix backend run db:generate` | no schema changes |
| `git diff --check` | passed; inherited line-ending warnings only |

Fixtures cover eligible and ineligible accepted worlds, unaccepted/corrupt rejection, exact event-one commitment, close/reopen byte stability, human CharacterRecord digest inclusion, all four transaction classes, class-mismatch rollback, contiguous event allocation, accepted-foundation drift, callback corruption rollback, numeric sequence ordering, multi-attempt model evidence, non-empty knowledge ordering, stored hash/revision drift, event gaps, and protected/public separation.

Independent verification first reproduced six P1 defects: incomplete accepted-foundation comparison, post-commit integrity rejection, textual ledger ordering, distant route-state disclosure, order-dependent knowledge hashing, and order-dependent model-attempt hashing. Each reproduction became a focused regression. Final Sol verdict: `ALIGNED`, P0/P1 `0`. Terra mechanical verdict: `PASS`.

Standalone smoke additions: 0.

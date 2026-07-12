# Campaign Play Task 10B — Opening Turn-Zero Runtime

Date: 2026-07-11  
Branch: `feat/revamp`

## Result

Task 10B connects an accepted Campaign World and a bootstrapped human player to one durable opening turn. The runtime admits either delegated or chosen starting conditions, accepts one strict opening-planner artifact, settles Rulebook bootstrap and exact actor plans/schedules, freezes the player-visible packet, accepts packet-bound narration, and publishes the completed opening together with `setup_phase=ready`.

This slice executes opening turn zero. Its gameplay depth is `0` completed player actions. Task 10C owns the first player action and the repeated game loop.

## Runtime chain

| Durable stage | Owner | Result |
| --- | --- | --- |
| pre-admission | opening runtime | validates phase, versions, topology, player, idempotency, and the accepted-world location handle before a turn row exists |
| `admitted` | opening planner | one strict structured attempt outside SQLite; accepted full artifact is stored under the fenced worker epoch |
| `planned` | Rulebook + actor scheduler | one transaction commits bootstrap commands, receipts, causal events, player placement, time/pressure state, exact plans/schedules, authority hashes/versions, and `primary_settled` |
| `primary_settled` | actor scheduler | validates every initialized plan/schedule and proves zero opening actor jobs, proposals, and actions |
| `actors_settled` | visibility service | derives observations and consequences, stores canonical packet bytes/hash, and creates one pending narration row |
| `visibility_projected` | narrator + turn repository | one strict packet-only narration attempt; one transaction publishes narration, phase `ready`, `opened_at`, completed turn/events, lock release, and runtime authority |

The Rulebook leaves the phase at `opening_required`. Terminal narration owns the transition to `ready`, which keeps the player surface from observing a playable campaign without its opening scene.

## Starting conditions and narrator boundary

- Delegated starts allow the opening planner to select the reachable scene.
- Chosen starts carry one opaque accepted-world location handle and bounded role, arrival-mode, and immediate-situation text.
- The location handle resolves against accepted topology before admission. The durable planner frame stores the resolved internal location ID.
- Opening role, arrival mode, and immediate situation enter narration only through typed `openingContext` in the canonical public packet.
- Narrator input is exactly the persisted `packet_json`. Narrator output proposes expressive beats, action handles, and effect positions; code owns narration/beat IDs, action labels, display text, and the pending narration timestamp.
- Packet handles, internal IDs, hidden cast/goals, and protected distant truth are rejected from prose or remain absent from narrator input.

## Recovery and failure behavior

- Planner and narrator transport or contract failures persist `interrupted` on the same ledger. Explicit resume creates a new worker epoch and attempt.
- Narrator resume reuses identical persisted packet bytes and executes zero Rulebook commands.
- A deterministic transaction failure before `primary_settled` produces one audited, zero-mutation failed opening. One later opening may name it through `supersedesTurnId`.
- After `primary_settled`, deterministic failure rolls back the current stage. Lease expiry lets a fresh worker continue the same active ledger; terminal failure is unavailable.
- Reopening the SQLite campaign after every committed stage produces one planner call, one narrator call, one plan/schedule set, one packet, and one terminal narration.

## Integration evidence

`opening-runtime.test.ts` uses freshly migrated campaign databases and the production Campaign World acceptance, Campaign Play state creation, character profile preparation, player bootstrap, Rulebook, actor scheduler, visibility, turn repository, and recovery services. Model boundaries are deterministic strict-object fixtures so the tests can assert exact ledgers and restart behavior.

The 9 integration cases prove:

- chosen and delegated starts complete independently and replay idempotently;
- a wrong chosen location handle creates zero turn/runtime mutation;
- planner and narrator interruptions require explicit resume on the same turn;
- a late completed resume changes zero runtime-event rows;
- narrator retry reuses byte-identical persisted `packet_json`;
- close/reopen after every durable stage repeats neither model calls nor ledger rows;
- injected actor-validation and visibility defects preserve the post-primary stage and recover after lease expiry;
- a pre-primary scheduler defect rolls back commands/schedules and creates an auditable failed ledger;
- one successor records the failed ledger in `supersedesTurnId`, while another concurrent successor is rejected.

The broader repository tests retain terminal atomic rollback, packet tamper detection, worker-epoch fencing, concurrency, and restart corruption checks.

## Verification

- `npm --prefix backend test -- src/campaign-play/opening-runtime.test.ts` — 1 file, 9/9 passed.
- `npm --prefix backend test -- src/campaign-play` — 18 files, 266/266 passed.
- `npm --prefix backend run typecheck` — passed.
- `npm --prefix shared run build` — passed.
- `git diff --check` — passed; only inherited line-ending warnings were emitted.
- GitNexus source impact cannot resolve the untracked Campaign Play symbols. Global change detection remains `CRITICAL` across 45 inherited tracked files and 22 indexed flows; no Task 10B symbol appears in that index.
- Independent Sol semantic review found one narration timestamp identity defect. Passing the pending narration row's durable timestamp into the accepted artifact repaired it; the advancing-clock real-SQLite fixture now passes.
- Droid GLM-5.2 was invoked with the verified configured alias for narrator prompt/copy review. The invocation completed with exit code 0 and returned only `Plan is up-to-date.`, so it supplied no substantive verdict. Humanizer/deslop inspection and independent Sol review found no prompt rewrite requirement; the advisory gap did not replace runtime verification.
- No standalone smoke suite, fallback, provider switch, compatibility adapter, schema migration, UI route, or player-action runtime was added.

## Scope note

The worktree contains inherited Campaign World, Campaign Play, frontend, and documentation changes. Task 10B changed only its execution packet surface and adjacent test fixtures required by the new packet and phase contracts. Nothing is staged or committed.

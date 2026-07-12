# Task 2B3: actor scheduling and visibility storage

Date: 2026-07-11  
Status: complete; independently verified.

## Outcome

Migration `0029_campaign_play_actors_visibility.sql` adds six Campaign Play tables: actor plans, schedules, jobs, proposals, actor knowledge, and player observations.

## Storage contracts

- Plans are versioned per actor, permit one active plan, bind goals to their owning agent actor, and keep definitions immutable while status moves once from active to completed or blocked.
- Schedules bind one current row to the same actor's active plan and retain monotonic last-act time, bounded priority, and agency debt.
- Jobs bind campaign, turn, actor, and plan; allow one actor job per turn and one pending job across turns; and follow queued -> claimed/deferred -> proposed/rejected/deferred -> settled/rejected transitions with worker epochs.
- Migration 0029 closes the deferred 0028 boundary: an `actor_job` command must match its proposed job, pending proposal, campaign, turn, actor, batch, order, kind, version, scopes, and exposure metadata.
- Proposals bind campaign/job/actor, frozen base version, expiry, exact actor-job causal parent, immutable command bytes/hash, and one pending-to-terminal result. Terminalization requires the owning proposed job; accepted receipt arrays are unique, positional, and bound to the exact stored command metadata. Acceptance requires an initialized world clock strictly before expiry.
- Job transitions preserve proposal identity, require pending/accepted/rejected proposal status for proposed/settled/rejected stages, and prevent pending proposals from becoming orphans through direct reject or defer paths.
- Knowledge and observations normalize channel/location/route/trigger/witness/perceived-actor provenance alongside protected source JSON/hash. Event, exposure, campaign, channel, anchor, aftermath expiry, route trigger, and witness knowledge are enforced before insert.
- Knowledge is idempotent by actor/event/channel/source. Observations are idempotent by human/event/exposure/channel/source and require the campaign's human player character plus matching durable knowledge.
- Knowledge and observation evidence is append-only. Public journal consequence handles must match their observation handle.

Canonical kind-specific protected payload hashes, complete Zod validation, batch `commandsHash` verification, runtime hash changes, and atomic visibility projection remain repository transaction obligations in later tasks. SQLite binds the common causal command metadata and rejects lifecycle bypasses; repository code owns canonical SHA-256 serialization.

## Verification

| Command | Result |
|---|---|
| `npm --prefix backend run db:generate` | repeat reported no schema changes |
| `npm --prefix backend test -- src/campaign-play/contracts.test.ts src/campaign-play/campaign-play-database.test.ts src/campaign-world/world-database.test.ts` | 48 tests passed |
| `npm --prefix backend run typecheck` | passed |

Fresh migration inventory contains twenty Campaign Play tables and passes SQLite integrity and foreign-key checks. Migration 0029 contains six tables, sixteen indexes, and nineteen triggers. Fixtures cover duplicate pending jobs, missing and wrong-stage actor-job parents, terminal-plan insertion, pending-proposal settlement, proposal-ID clearing, proposal orphaning through reject/defer, foreign-command acceptance, proposal lifecycle and immutability, duplicate knowledge/observations, source mismatch, and evidence deletion.

Independent Terra mechanical review returned `PASS`. Independent Sol semantic review reproduced the original lifecycle and foreign-command bypasses against disposable migrated campaigns, verified the repairs, and returned `ALIGNED` with zero remaining P0/P1 findings. The deferred P2 is canonical hashing of kind-specific protected command arguments in the repository layer.

Standalone smoke additions: 0.

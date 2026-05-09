# Wave 1 Rollback Proof

## Claim

Future-readable living-world artifacts cannot survive a restore as if they still belong to the active timeline.

## Implemented Boundary

- `world_clocks` stores the active campaign `world_version`, `world_time_minutes`, and compatibility `current_tick`.
- `simulation_jobs`, `simulation_proposals`, and `actor_process_states` store the version/time they depend on.
- `authority_traces` records backend-accepted state changes with source entity, base/result versions, world time, ToolResult id, event refs, and state delta refs.
- `restoreCampaignBundle` now asks the authority layer to reset the world clock and invalidate future rows after a snapshot restore.

## Tested Sequence

1. Create campaign clock at version `0`, world time `5`.
2. Queue an NPC simulation job for world time `8` at base version `0`.
3. Commit a player authority trace from version `0` to version `1`.
4. Record an NPC proposal based on version `1`, proposing version `2`.
5. Store actor process state at version `2`, wake time `9`.
6. Restore to version `0`, world time `5`.
7. Assert the future job is `canceled`, the proposal is `canceled`, the actor process is `disabled`, and the world clock is back at version `0`.

## Copy-Restore Note

For full SQLite snapshot restore, rows created after the snapshot are removed by the database copy itself. The explicit invalidation pass handles rows that are still visible after restore but point beyond the restored version/time. Wave 1 guarantees "no future-readable artifacts survive"; a separate out-of-band audit ledger for deleted future rows is intentionally left for later observability work.

## Verification

- `living-world-authority.test.ts`: `cancels future jobs/proposals and disables ahead-of-rollback actor process state`
- `living-world-authority.test.ts`: `keeps world-version linearity at the database level`
- `tool-executor-authority.test.ts`: stale authoritative tool calls are rejected before handler mutation.


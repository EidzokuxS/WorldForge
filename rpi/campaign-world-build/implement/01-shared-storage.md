# Task 1 Evidence: Shared Contract and Storage

## Delivered

- `shared/src/campaign-world.ts` defines the public source, world, actor, goal, relation, placement, pressure, build, event, review, state, and acceptance shapes.
- The contract imports `CampaignWorldDna` from `shared/src/types.ts`.
- `backend/src/db/schema.ts` adds 11 Campaign World tables while retaining `locations` and `location_edges` as the location graph.
- `backend/drizzle/0024_campaign_world.sql` and `0024_snapshot.json` contain the generated schema delta.

## Drizzle metadata recovery

The journal contained migrations `0012` through `0023`, while snapshots stopped at `0011`. A generation pass against the unchanged pre-Task-1 schema produced a 35-table current-schema snapshot. That snapshot is preserved as `0023_snapshot.json`; its `prevId` points to `0011_snapshot.json`. Task 1 generation then produced an `0024` snapshot with 46 tables and `prevId` equal to the recovered `0023` snapshot ID.

The resulting `0024_campaign_world.sql` has exactly 11 `CREATE TABLE` statements, no `ALTER TABLE`, and no declarations for the runtime tables from migrations `0012` through `0023`. A second generation pass reported `No schema changes, nothing to migrate`.

## Table and foreign-key inventory

| Table | Primary key | Foreign keys and principal constraints |
|---|---|---|
| `campaign_worlds` | `campaign_id` | campaign cascade; version >= 1; review/accepted timestamp consistency |
| `campaign_world_builds` | `id` | campaign cascade; one partial-unique running build per campaign |
| `campaign_world_build_events` | `id` | campaign/build cascades; positive sequence; unique build sequence |
| `campaign_world_build_stages` | `id` | campaign/build cascades; positive attempts; boolean strategy flags; unique build stage |
| `actors` | `id` | campaign cascade |
| `actor_goals` | `id` | campaign/actor cascades; priority 1 through 5 |
| `actor_relations` | `id` | campaign/source actor/target actor cascades; different endpoints; intensity 1 through 5 |
| `actor_placements` | `id` | campaign/actor/location cascades; unique actor/location/kind |
| `world_pressures` | `id` | campaign cascade; urgency 1 through 5 |
| `world_pressure_actors` | `id` | campaign/pressure/actor cascades; unique pressure/actor |
| `world_pressure_locations` | `id` | campaign/pressure/location cascades; unique pressure/location |

Every non-primary campaign key has an explicit campaign index. Route cost remains an application-level invariant on the reused `location_edges` table.

## Verification

- `npm --prefix shared run build`: passed.
- `npm --prefix backend run typecheck`: passed.
- `git diff --check`: passed.
- Fresh temporary SQLite migration through `0000` to `0024`: passed; all 11 Campaign World tables were present.
- Fixed-string searches found no `scaffold` or `faction` collection in `shared/src/campaign-world.ts`.
- No standalone smoke file was added; the temporary migration verifier was removed after the targeted check.

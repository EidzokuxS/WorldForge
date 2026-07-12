# Task 1B: player actor domain and handoff constraints

Date: 2026-07-10  
Plan: `docs/goals/campaign-play/PLAN.md`, Task 1B  
Verdict: implementation aligned; verification passed.

## Outcome

Campaign World now has a live player actor role with one valid identity tuple: `kind=person`, `controller=human`, `role=player`. Agent-controlled world actors use `person` or `collective` with `key`, `support`, or `background` roles.

The shared contract separates those surfaces:

- `WorldActor` represents stored live actors and includes the player role;
- `GeneratedWorldActor` fixes the controller to `agent` and the role to the generated cast domain;
- `CampaignWorld` and `CampaignWorldReview` expose `GeneratedWorldActor[]`, keeping accepted Review and generation output scoped to the generated cast.

This prepares the canonical `actors` table for the receipt-bearing player bootstrap in Task 6C while preserving World Review as accepted-world provenance.

## SQLite ownership

Migration `0026_campaign_world_player_actor.sql` adds two partial unique indexes:

- `actors_campaign_human_unique` permits one human-controlled actor per campaign;
- `actor_placements_actor_present_unique` permits one present placement per actor.

Two migration-owned SQLite triggers enforce the cross-column identity tuple on actor inserts and relevant updates:

- `actors_controller_kind_role_insert`;
- `actors_controller_kind_role_update`.

The migration preserves the existing `actors` table. This matters because goals, relations, placements, and pressure anchors reference actor rows with cascading foreign keys. Drizzle opens a transaction before executing migration statements, so a migration-local `PRAGMA foreign_keys=OFF` cannot safely support a parent-table rebuild. The trigger design adds the invariant without dropping referenced rows. The Drizzle schema records the role domain and partial indexes; a source comment identifies the migration-owned trigger boundary. Snapshot `0026_snapshot.json` therefore matches the schema-owned structure, and repeat generation stays empty.

## Backend and generation boundaries

`validateWorldActorControl` mirrors the SQLite trigger contract. It accepts the human player tuple and the three generated agent roles, then rejects invalid controller, kind, role, and unknown-role combinations.

Campaign World generation remains generated-only:

- the model-facing cast schema requires `controller=agent` and one of the three generated roles;
- deterministic draft validation rejects human and player cast members;
- the builder produces zero player actors;
- the accepted snapshot parser requires agent actors and generated roles;
- the repository reads live Review rows as generated actors.

The World Review actor section now consumes `GeneratedWorldActor[]`. Its visible grouping remains key, support, and background; Task 1B adds no player-facing UI state.

## Migration proof

The focused migration test applies the real journal through 0025, creates a populated Campaign World through the repository, and then applies 0026 through the same Drizzle migrator used by the application.

For an accepted world, the test proves exact equality before and after migration for:

- actor rows;
- actor goals;
- actor relations;
- actor placements;
- pressure-to-actor anchors;
- accepted Review object;
- raw `accepted_snapshot_json` bytes;
- snapshot SHA-256.

The accepted snapshot remains 4,277 bytes with SHA-256 `146e21381a48bd36907a219068586708949d6ed73c49f5ea7dadbf4cf9c1693c`. The migrated generated cast contains zero player actors. The accepted-provenance trigger and both actor tuple triggers remain installed. SQLite integrity returns `ok`, and the foreign-key check returns an empty result.

A second fixture migrates a review-stage world and reloads it from current entity rows. The Review projection and every actor-dependent row remain equal, proving that the migration preserves both frozen accepted reads and live Review reads.

Database fixtures also prove that insert and update guards reject false human, agent-player, unknown-controller, unknown-kind, and unknown-role combinations. Separate fixtures reject a second human in one campaign and a second present placement for one actor, while allowing a human in another campaign and a home placement alongside one present placement.

## Verification

| Command | Result |
|---|---|
| `npm --prefix shared run build` | passed |
| `npm --prefix backend test -- src/campaign-world` | 10 files, 125 tests passed |
| `npm --prefix frontend test -- --run components/world-review/actors-section.test.tsx` | 1 file, 1 test passed |
| `npm --prefix backend run typecheck` | passed |
| `npm --prefix backend run db:generate` | schema already current |
| `git diff --check` | passed; line-ending notices only |

Verification uses focused contract, migration, repository, generation, and Review tests. Smoke-suite additions: 0.

## Independent reviews

- Krypton POST first returned `REVISE`: the generated actors-table rebuild could cascade-delete actor-dependent world rows, and the migration proof only compared actors plus frozen Review. The migration now preserves the parent table, and the test compares every dependent row, raw accepted bytes and hash, and a live Review projection. Re-review returned `ALIGNED`.
- Krypton code review reported the same P1 migration hazard after tracing Drizzle's transaction boundary. Re-review confirmed that trigger-owned enforcement removes the rebuild and returned `ALIGNED`.
- Krypton maintainer review found one P1 contract drift: the backend validator accepted an unknown agent role that SQLite rejected. The validator now checks generated-role membership and has an unknown-role regression. A stale intermediate review then requested removal of a Drizzle check that had already been removed; re-opening the current schema and the empty generation result produced `ALIGNED`.
- Final goal-backward verification returned `PASS` with no missing handoff proof. Droid GLM-5.2 independently inspected the migration, schema boundary, generated contracts, validator, tests, and recorded command results, then returned `ALIGNED`.
- The GLM review applied the `humanizer` and `deslop` criteria and found the note direct, evidence-led, and free of generic filler. Scores: directness 9/10, rhythm 8/10, reader trust 9/10, authenticity 9/10, density 9/10.

## GitNexus scope

Pre-edit impacts for `validateCampaignWorldDraft`, `createWorldCastPacketSchema`, `createCampaignWorldBuilder`, `ActorsSection`, and `createCampaignWorldRepository` were LOW. The new untracked player-control helper and new Campaign World schema symbols were absent from the current index; file-target impact queries also returned no indexed target. Their scope is covered by focused tests and independent reviews.

`detect_changes(all)` reports CRITICAL across the inherited dirty worktree: 45 tracked files, 57 changed indexed symbols, and 22 affected processes accumulated during the Campaign World implementation. Task 1B changes only the actor domain, its migration and tests, generated/review type boundaries, and this evidence note.

Task 1B may now hand the frozen actor vocabulary to Task 2A's shared Campaign Play contract.

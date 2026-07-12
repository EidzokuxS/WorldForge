# Task 1A: immutable accepted-world snapshot

Date: 2026-07-10  
Plan: `docs/goals/campaign-play/PLAN.md`, Task 1A  
Verdict: implementation aligned; verification passed.

## Outcome

Campaign World acceptance now writes one frozen `CampaignWorldReview` projection into `campaign_worlds.accepted_snapshot_json`. The same compare-and-set transaction stores `accepted_at`, `accepted_world_version`, and `accepted_content_hash`. Accepted Review reads that snapshot. Review-stage worlds continue to read current entity rows and verify their current content hash.

This creates three distinct contracts for the later runtime:

- accepted provenance: `accepted_snapshot_json`, `accepted_world_version`, `accepted_content_hash`;
- current source provenance: `source_snapshot_json`, `source_digest`;
- later Campaign Play truth: mechanical `worldVersion/worldHash` and operational `runtimeRevision/runtimeHash`, owned by Tasks 2 and 3.

The accepted snapshot contains its own source projection and source digest. Reload recomputes the source digest from the frozen premise, DNA, research summary, and references, then recomputes the world content hash from the frozen source digest and entity projection. Current source columns and live entity rows can change without changing accepted Review bytes.

## Storage and migration

Migration `0025_campaign_world_acceptance_snapshot.sql` adds the three accepted fields and rebuilds `campaign_worlds` with one acceptance-state constraint:

- `review` rows carry null accepted fields and time;
- `accepted` rows carry all accepted fields, a positive accepted version equal to the build version, and a 64-character accepted content hash equal to the build content hash.

The migration preserves existing 0024 acceptance status, timestamp, version, and content hash. For accepted rows, SQLite JSON1 builds the canonical frozen Review projection from the source and entity tables. The migration uses the same key and collection order as the TypeScript canonical serializer. A focused migration fixture with populated DNA, research, deliberately ordered references, actors, goals, placements, relations, pressures, and anchors produces exactly the same bytes as `serializeAcceptedCampaignWorldReview` and loads through the current repository.

The `campaign_worlds_accepted_provenance_immutable` trigger rejects updates to accepted status, time, snapshot, version, or hash. Current source columns remain a separate provenance record. The accepted snapshot validates itself from its frozen source.

The generated `0025_snapshot.json` points at the existing `0024` snapshot. A repeat `npm --prefix backend run db:generate` reports `No schema changes, nothing to migrate`.

## Repository behavior

`acceptWorld` performs these operations inside one SQLite transaction:

1. Load and validate the current review projection.
2. Compare the submitted version and content hash.
3. Create the accepted projection with the committed acceptance time.
4. Canonically serialize the full public Review.
5. Update status, time, snapshot, accepted version, and accepted hash with the existing version/hash compare-and-set predicate.

`loadWorld` branches on stored status. The review branch reads live entity rows and recalculates their content hash. The accepted branch reads the frozen snapshot before any current source or entity query, validates exact canonical bytes and accepted metadata, recomputes the frozen source digest, and recalculates the frozen world content hash.

## Acceptance proof

The representative accepted fixture has:

- canonical snapshot length: 4,277 bytes;
- canonical snapshot SHA-256: `146e21381a48bd36907a219068586708949d6ed73c49f5ea7dadbf4cf9c1693c`;
- accepted content hash: `743014c37ca0c93cedb1ed455f3770022c23cac1f5742adb152eab0c2b54a3a5`.

The repository test captures the accepted bytes, IDs, version, and hash, then changes all of these live records:

- a present actor placement;
- relation summary and intensity;
- goal status;
- pressure trajectory;
- current source digest and source JSON.

The reloaded accepted Review remains byte-identical. Its snapshot SHA-256, IDs, accepted version, and accepted content hash remain the values above. The route integration test also changes a live actor row after acceptance and receives the same `/world/state` response.

Fail-closed fixtures cover malformed snapshot JSON, a canonically reserialized source premise with the old digest, acceptance rollback after an injected SQLite trigger failure, stale submitted version/hash, and an attempted accepted-provenance update. `PRAGMA integrity_check` returns `ok`; `PRAGMA foreign_key_check` returns an empty result.

## Verification

| Command | Result |
|---|---|
| `npm --prefix shared run build` | passed |
| `npm --prefix backend run typecheck` | passed |
| `npm --prefix backend test -- src/campaign-world src/routes/campaign-world.test.ts` | 10 files, 124 tests passed |
| `npm --prefix frontend test -- --run "app/(non-game)/campaign/[id]/review/page.test.tsx" lib/campaign-world-api.test.ts` | 2 files, 14 tests passed |
| `npm --prefix backend run db:generate` | schema already current |
| `git diff --check` | passed; line-ending notices only |

Verification scope is the focused Campaign World and Review contracts plus real SQLite migration/route integration. Smoke-suite additions: 0.

## Independent reviews

- Krypton POST initially returned `REVISE`: preserve existing accepted 0024 decisions and decouple accepted reads from current source columns. The migration now performs exact canonical backfill, and accepted load is self-contained. Re-review returned `ALIGNED`.
- Krypton code review found one P1: the frozen source projection needed digest recomputation. The parser now recomputes it, and canonical source corruption becomes `world_state_corrupt`. Re-review returned `ALIGNED`.
- Krypton maintainer review returned `ALIGNED`. It confirmed the boundary remains compatible with Task 1B player actors and later Campaign Play state. It also recorded SQLite JSON1 as an intentional state.db dependency and the exact-byte migration test as the guard for the SQL/TypeScript canonicalization boundary.
- Final Krypton verification returned `PASS`. Droid GLM-5.2 independently reran the evidence commands, recomputed the 4,277-byte snapshot SHA and content hash, and returned `ALIGNED`.
- The `humanizer` and `deslop` pass retained the technical structure and replaced two negative status descriptions. Final scores: directness 10/10, rhythm 8/10, reader trust 10/10, authenticity 9/10, density 9/10.

## GitNexus scope

Pre-edit impacts for `createCampaignWorldRepository`, `loadWorldInternal`, snapshot hashing, the Campaign World route, frontend acceptance client, and Review page were LOW. GitNexus exposes `campaignWorlds` through file text rather than a symbol node.

`detect_changes(all)` reports CRITICAL across the inherited dirty worktree: 45 tracked files, 57 changed indexed symbols, and 22 affected processes from the preceding Campaign World implementation. That report covers the accumulated uncommitted branch and omits complete mapping for untracked Campaign World files. Task 1A scope is bounded by the file inventory below, the LOW symbol impacts, the focused suites, and three independent reviews.

Task 1A files:

- `backend/src/db/schema.ts`
- `backend/drizzle/0025_campaign_world_acceptance_snapshot.sql`
- `backend/drizzle/meta/0025_snapshot.json`
- `backend/drizzle/meta/_journal.json`
- `backend/src/campaign-world/world-snapshot.ts`
- `backend/src/campaign-world/world-snapshot.test.ts`
- `backend/src/campaign-world/world-repository.ts`
- `backend/src/campaign-world/world-repository.test.ts`
- `backend/src/routes/campaign-world.test.ts`
- `frontend/app/(non-game)/campaign/[id]/review/page.test.tsx` (verification only; unchanged)

Task 1B may now add the live human/player actor domain while the accepted generated cast remains frozen.

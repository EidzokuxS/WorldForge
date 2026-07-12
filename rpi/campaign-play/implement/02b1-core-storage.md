# Task 2B1: Campaign Play core storage

Date: 2026-07-11  
Status: complete; independent mechanical and semantic reviews aligned.

## Outcome

Migration `0027_campaign_play_core.sql` adds the seven mechanics-owned Campaign Play tables:

1. `campaign_play_states`
2. `campaign_play_characters`
3. `campaign_play_runtime_events`
4. `campaign_play_turns`
5. `campaign_play_turn_events`
6. `campaign_play_model_stages`
7. `campaign_play_narrations`

The tables preserve accepted Campaign World provenance, keep mechanical and runtime versions separate, record protected campaign and turn ledgers, fence external model attempts by epoch, and retain one immutable narrator packet per turn.

## Enforced storage contracts

- Play state has one row per accepted campaign. Migration triggers verify accepted status and exact accepted version/hash, then keep that base immutable.
- Character storage accepts one normalized record for the same campaign's unique `person/human/player` actor.
- One partial unique index owns the active-turn lock, including interrupted turns. A second unique index owns the active or completed opening.
- Campaign/idempotency keys are unique. The same key resolves to one ledger row; a competing key collides with the active-turn index.
- A later opening must name its predecessor. The predecessor must be a same-campaign failed opening with an unowned lease and `final_world_version = base_world_version`. Each failed opening can be superseded once. A mutated failed opening blocks later opening admission.
- Campaign runtime events require positive unique campaign sequences, one-step runtime revisions, changed hashes, exact turn ownership, and explicit epochs for fenced mutations.
- Turn events require positive unique turn sequences, unique durable SSE cursors, public event types, and valid sanitized JSON.
- Model attempts use a stable invocation ID plus contiguous attempt number. Later attempts require a greater worker epoch, retain campaign/turn/kind identity, and stop after one accepted artifact.
- Narrator packets retain immutable bytes and hashes. Pending, complete, and invalid artifacts have disjoint field requirements.
- Same-campaign triggers close the cross-campaign gap left by independent campaign and entity foreign keys.
- Admitted turn IDs, intent/lineage/version evidence, character records, runtime events, turn events, accepted model evidence, terminal narration output, and narrator packet identity are immutable.
- `public_packet_hash` permits one `NULL -> hash` transition. Narration insertion requires the exact campaign, turn, and committed packet hash.
- A bound player actor cannot change campaign/controller/kind/role or be deleted while its Campaign Play character exists.

SQLite checks prove row-local facts. Repository transactions in Tasks 3A and 3B will prove sequence allocation, legal historical stage transitions, digest recomputation, runtime hash CAS, and atomic correspondence between state and ledger rows.

## Campaign database handle

`openCampaignPlayDatabase` adapts the existing campaign-bound Campaign World connection. It keeps the concrete `state.db` handle bound to its campaign while the process-global database changes, verifies all seven tables, requires an accepted world, preserves WAL and foreign-key enforcement, uses the five-second busy timeout, and closes idempotently.

GitNexus reported MEDIUM risk for `openCampaignWorldDatabase` with five direct test consumers and no indexed production process. Task 2B1 uses it without changing its implementation. New Campaign Play symbols were absent from the pre-change index.

## Migration evidence

- A fresh migrated database contains exactly the seven `campaign_play_%` tables and passes `integrity_check` plus `foreign_key_check`.
- An accepted Campaign World created through migrations 0–26 retains byte-identical accepted snapshot/version/hash and actor rows after migration 27.
- A second `npm --prefix backend run db:generate` reports `No schema changes, nothing to migrate`.
- Migration-owned triggers follow the established 0026 pattern and remain covered by behavior tests because Drizzle snapshots do not represent triggers.

## Verification

| Command | Result |
|---|---|
| `npm --prefix backend run db:generate` | generated `0027_campaign_play_core.sql`; repeat reported no schema changes |
| `npm --prefix backend test -- src/campaign-play/campaign-play-database.test.ts src/campaign-world/world-database.test.ts` | 2 files, 15 tests passed |
| `npm --prefix backend run typecheck` | passed |

The first database run exposed SQLite's nullable `CHECK` behavior for fenced worker epochs. The constraint now requires both `worker_epoch IS NOT NULL` and `worker_epoch > 0`; the regression passes.

The first semantic review returned `REVISE` for mutable update paths. Corrections now freeze admitted turn identity, append-only ledgers, terminal model/narration artifacts, character/actor binding, primary IDs, and write-once public packet hashes. Terra mechanical review and the final fresh Sol semantic review returned `ALIGNED`.

Migration inventory: 7 tables, 20 indexes, 31 migration-owned triggers.

Standalone smoke additions: 0.

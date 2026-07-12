# Task 2B2: Rulebook and mechanical-state storage

Date: 2026-07-11  
Status: complete; independent mechanical and semantic reviews aligned.

## Outcome

Migration `0028_campaign_play_rulebook.sql` adds seven Campaign Play tables:

1. `campaign_play_commands`
2. `campaign_play_receipts`
3. `campaign_play_events`
4. `campaign_play_event_exposures`
5. `campaign_play_route_states`
6. `campaign_play_actor_conditions`
7. `campaign_play_pressure_states`

The first four tables form the protected, append-only Rulebook evidence ledger. The final three own current receipt-bearing mechanical overrides and preserve cleared actor conditions as causal tombstones.

## Contract correction

Independent pre-implementation review found that the first `create_player_actor` command had no truthful causal parent: no turn, command, world event, or actor job exists before character bootstrap. The causal-parent union now includes `accepted_world`, containing the immutable campaign ID, accepted world version, and accepted content hash. Storage accepts that root only for a turnless `create_player_actor` command from `character_bootstrap`, and verifies it against `campaign_play_states`.

Later commands remain rooted in a turn, earlier command, world event, or actor job. Actor-job existence becomes enforceable when migration 0029 creates the scheduler tables.

## Enforced storage contracts

- Commands are ordered contiguously per campaign batch. Their expected version equals the current play-state version plus earlier mutating commands in that batch.
- Commands validate same-campaign turn and actor sources, typed system sources, and causal-parent ownership. Command payload, scopes, exposure policy, arguments hash, and protected payload hash are retained immutably.
- Each receipt belongs to exactly one matching command and preserves the command campaign, turn, kind, and expected prior version.
- `record_world_event` preserves world version/hash. Every other current command kind advances one logical version and changes the hash. Mutating result versions are unique per campaign.
- Receipt causal-event IDs are non-empty, bounded, typed, and unique. Each event must be named by its receipt and match its command, receipt, campaign, turn, source, world version, and command-to-event kind mapping.
- Event affected references are unique typed domain references and must resolve inside the same campaign. Event parents are pre-existing same-campaign events with no later version or world time.
- Protected event before/after JSON is stored separately. `payload_hash` is the digest of the canonical protected `{ before, after }` payload; the repository/executor will compute and verify the bytes when Task 6B lands.
- Exposures exist only for projectable commands. Channel rows enforce exact direct-perception, local-aftermath, route-state, or witness-report shape, same-campaign anchors, a four-row event limit, and unique valid route triggers.
- Route state insert/update requires a matching `set_route_state` receipt and target/state payload. Updates require a changed state, newer version, and new receipt.
- Actor-condition insert/update requires a matching target/condition/operation/summary receipt. Clear persists `present = 0`; identity is immutable and each transition moves forward.
- Pressure state starts through `initialize_pressure_state`, advances through `advance_pressure`, never decreases progress or world time, and never reactivates a resolved pressure.
- Commands, receipts, events, exposures, and current-state identities are protected by migration-owned immutability or forward-transition triggers.
- `openCampaignPlayDatabase` now requires all fourteen core plus Rulebook tables.

The receipt lists event IDs before the event rows can exist, while events reference the receipt. SQLite immediate foreign keys cannot express both directions of this cycle. Migration triggers prove event-to-receipt membership; the atomic Rulebook repository in Task 6B must validate exact set equality before transaction commit.

## Migration evidence

- Fresh migration inventory contains fourteen Campaign Play tables: seven from 0027 and seven from 0028.
- Migration 0028 contains 7 tables, 32 indexes, and 21 migration-owned triggers.
- Version and causal indexes cover expected command version, command causal-parent kind, receipt prior/result version, event world version, parent event, command, and receipt.
- Accepted Campaign World provenance and existing actors remain unchanged when the play migrations apply.
- SQLite `integrity_check` returns `ok`; `foreign_key_check` returns no rows.
- Repeat `npm --prefix backend run db:generate` reports `No schema changes, nothing to migrate`.

## Verification

| Command | Result |
|---|---|
| `npm --prefix backend run db:generate` | repeat reported no schema changes |
| `npm --prefix backend test -- src/campaign-play/contracts.test.ts src/campaign-play/campaign-play-database.test.ts src/campaign-world/world-database.test.ts` | 3 files, 47 tests passed |
| `npm --prefix backend run typecheck` | passed |

Focused negative fixtures reject invalid command causality and expected versions, exposures on protected events, duplicate route triggers, arbitrary ledger rewrites/deletes, no-op route updates, decreasing pressure state, and current-state deletion.

The first semantic review exposed SQLite NULL discriminator bypasses, exposure rows detached from declared predicates, unconstrained pressure deltas/time, and NULL-sensitive anchor uniqueness. The second review found two deeper NULL edges in accepted-root campaign identity and declared route-trigger sets. All findings now have adversarial regressions. Terra's final mechanical review returned `PASS`; Sol's final semantic re-review returned `ALIGNED` with no P0/P1 findings.

Standalone smoke additions: 0.

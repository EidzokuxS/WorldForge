# Task 4 evidence: atomic repository and durable build ledger

## Campaign-scoped database ownership

- `openCampaignWorldDatabase` opens the requested campaign's `state.db` through a dedicated SQLite connection and never changes the process-global database.
- The handle enables WAL, foreign keys, and a 5-second busy timeout, verifies all 11 Campaign World tables, and requires the matching campaign record.
- An unavailable file, an unmigrated schema, and a mismatched campaign record produce distinct stable error codes.
- Integration proof keeps campaign A open, switches the process-global connection to campaign B, completes A, and confirms that B receives no world or location rows.

## Build ledger and atomic persistence

- Build acquisition stores the normalized source snapshot and digest before model work and relies on the partial unique index for one running build per campaign.
- Stage transitions are ordered. The three model stages require sanitized evidence with a known provider primary strategy.
- Success inserts domain rows, the review record, completed build state, persistence-stage completion, and the terminal event in one transaction.
- Failure updates the build, releases the running lock, and appends one terminal failure event in one transaction. Repeated failure reporting returns the existing terminal event.
- A transaction interruption after all domain inserts rolls every domain row back. The service can then record one durable failure and start a new explicit build.

## Review projection and acceptance

- Review reads canonical entities from saved rows and source context only from `campaign_worlds.source_snapshot_json`.
- Persistent IDs and the canonical content hash survive a dedicated-handle close and reopen.
- Acceptance compares both expected version and expected content hash inside the update transaction.
- Engine-owned compatibility columns on locations and routes remain outside the canonical projection and content hash.
- Canonical row tampering is detected by recomputing the content hash during review reads.

## Clean campaign boundary

- Acquisition checks graph, player/item, world runtime, actor runtime, turn runtime, narrator/runtime, and partial Campaign World tables before taking the build lock.
- Representative rows from each state family return `campaign_recreation_required` and leave no build row.
- Failed builds may start a new explicit build because their terminal transaction releases the partial-index lock.

## Verification

- Focused database and repository suite: 2 files, 19 tests passed.
- Full Campaign World suite before the final Task 4 additions: 8 files, 99 tests passed.
- Backend typecheck: passed.
- SQLite `integrity_check`: `ok` after a complete persisted world.
- No standalone smoke suite was added.

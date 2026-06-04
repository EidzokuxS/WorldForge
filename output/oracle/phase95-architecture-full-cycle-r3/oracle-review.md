# Oracle Review: Phase 95 Full-Cycle Architecture R3

Session: `phase95-architectu-full-cycle-r3`
Model: `gpt-5.5-pro` browser mode, resolved as Extended Pro
Delivery: `Packed 13 files into 1 bundle`, `files=13`
Runtime: 5m42s

## Verdict

`CONDITIONAL GO` to continue Phase 95 implementation and cluster-by-cluster hardening.

`NO-GO` for long-run acceptance, 600-turn confidence, rollback/clone/replay parity, or "architecture accepted" language until P0 restore convergence is closed with crash-injection evidence.

Oracle judged the architecture direction sound: the model proposes intent, tool calls, facts, and style, while the backend owns authority, mutation, time, receipts, persistence, projection, recovery, and observability.

## P0

Restore/rollback crash convergence remains the only confirmed P0.

`restoreCampaignBundle` stages bundle files, closes DB/vector handles, then mutates live DB/config/chat/vector stores through a sequence of file operations. It copies staged DB, config, chat, removes/copies vectors for checkpoint restore, clears staging, reloads the campaign, and only then rebuilds episodic vectors for non-vector rollback. There is no durable roll-forward journal in that path, and staging is cleared in success and catch paths, so a crash between destructive steps can leave mixed live stores without a deterministic repair record.

Required closure:

- Write a durable restore journal after staging is complete and before any live mutation.
- Make restore idempotent and roll-forward from staging.
- Cover DB sidecars, DB/config/chat apply, vector restore or purge/rebuild, campaign reload, post-restore authority invalidation, and derived episodic vector rebuild.
- Make lazy `loadCampaign` detect stranded restore journals before opening live state and either complete repair or fail closed.
- Add crash-injection tests before DB copy, after DB copy, after config copy, after chat copy, after vector purge, after vector copy, after staging completion before reload, and during episodic rebuild.

## P1 Kept As P1

- Terminal `done` SSE projection is blocklist-based and should become a strict allowlist DTO.
- Player-turn positive `allowedWriteScopes` are not first-class everywhere.
- Terminal receipt parity is missing for `record_dialogue_outcome` and `record_world_fact`.
- Actor lifecycle owner parity is not executable yet.
- Non-GM `executeToolCall` callers need a closed caller-graph contract.
- Frontend post-done world-sync failure can strand playability.
- Forecast refresh should become cadence-based, not every-turn and not fully deferred.
- Replay-preserving clone is acceptable only as fail-closed if Phase 95 acceptance is scoped to clean-start clone.
- Lore vector freshness/hash proof remains a vector recovery P1.
- Observability/logging should redact or hash player input, quick-action handles, offer/action ids, and durable event ids in standard logs.

Oracle did not promote these P1s to P0 from the supplied evidence. It noted that public terminal DTO leaks or background caller bypasses could become P0 if found in production paths.

## Narration

Oracle gave final narration an architecture-level GO. The fact-ref architecture protects gameplay truth while preserving creative play: the model controls ordering, selection, pacing, and tone through selected fact/evidence refs; the backend expands selected citable facts and validates the result. Production final narration must continue to require fact refs.

## Store Manifest And Gameplay Ownership

Oracle recommended keeping store manifest ownership and gameplay lane ownership separate because they answer different questions:

- Store manifest: which physical stores exist and how they clone/rollback/replay.
- Gameplay lane ownership: who may mutate each kind of gameplay truth.

The required closure is a generated crosswalk from gameplay lanes to physical stores, rollback policy, replay policy, projection, and rebuild path.

## Final Gate

`CONDITIONAL GO`: continue implementation.

`NO-GO`: do not resume long-play acceptance or claim architecture accepted until restore/rollback crash convergence is implemented and proven.

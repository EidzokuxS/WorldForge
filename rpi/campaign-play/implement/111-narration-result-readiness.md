# Task 111: committed result readiness

Status: implementation, focused automated checks, and disposable rendered acceptance complete.

## Outcome

A player action now becomes complete when Rulebook settlement, actor settlement, and visibility projection have committed. That immutable visible result immediately supplies the next-action surface. Proper narration runs afterward as a separate receipt-keyed operation, so an invalid or timed-out Narrator attempt cannot undo the world result or send the turn through mechanics Resume.

Recovery keeps the original result identity, packet hash, narration identity, and Rulebook receipt identities. It creates a new narration attempt only. Judge, Game Master, Rulebook settlement, actor settlement, and visibility projection are not re-entered. Exact duplicate completion coalesces; stale completion fails closed; one current proper scene can be persisted for the operation.

## Boundaries

- Judge, Game Master, Rulebook, actor settlement, and visibility semantics are unchanged.
- The normal Narrator prompt, model selection, schema, and proper-scene validation contract are unchanged.
- Failed or invalid narration remains a failed proper-scene attempt. The concise result is derived only from the accepted visibility packet and is never stored or presented as a proper scene.
- Frozen r45, r46, and r47 campaigns and their evidence were not opened, resumed, retried, rebound, or changed.

## Player-facing copy review

The Narrator prompt and schema did not change. Humanizer review: the concise-result dock uses direct game language, states only what the visible packet establishes, and leaves the action controls available without describing internal recovery machinery. Deslop review: retain the short headings and recovery labels; they contain no inflated claim, synthetic contrast, debug vocabulary, or raw model output. Verdict: accepted as written.

## Evidence

- Focused backend contract, repository, runtime, application, route, state, and read-model tests cover one mechanics commit, invalid narration after settlement, exact recovery identity, duplicate and stale completion, expired-attempt reload recovery, at-most-one proper scene, and no mechanics rerun.
- Focused frontend API, page, and stage tests cover the concise result, usable action controls, exact recovery request, proper-scene replacement, and reload parsing.
- Focused backend checks passed: 138 contract/runtime/application/route/state/read-model/repository tests, plus 34 database/clone/store-manifest-executor tests after the narration tables were added to the campaign-store manifest.
- Focused frontend checks passed: 41 API/page/stage tests. Shared build, backend typecheck, frontend typecheck, targeted frontend lint, and `git diff --check` passed.
- Independent recovery-fencing review found and closed a path/body ordering defect: recovery now proves that the route turn owns the selected narration operation before creating a runtime or preparing an attempt. The N/N+1 regression completes N late, leaves N+1 as the current failed operation, reloads the application, submits old path N with exact operation N+1, and verifies `turn_not_resumable` plus an unchanged snapshot of authority, both turn rows, operation and attempt rows, result, packet, receipts, and aggregate counts. The runtime factory is not invoked.
- The broader store-manifest coverage check still reports the pre-existing omission of `campaign_play_actor_obligations` from the manifest. That table predates this slice and was left outside this task rather than folded into an unrelated cleanup.
- GitNexus `detect_changes` was attempted before handoff and remained unavailable because the existing MCP transport was closed. The final change-scope review therefore used the repository diff and affected tests.

## Acceptance route

Fresh disposable campaign `d1111111-1111-4111-8111-111111111111` was created from a freshly migrated accepted fixture world and exercised at `/campaign/d1111111-1111-4111-8111-111111111111/play`. It is not derived from, bound to, or shared with r45, r46, or r47.

Normal action `turn-player-action:ade47cb720ffc28742acdff53b649e506589bc07` admitted at `1785411230043`, committed its authoritative result and action-ready surface at `1785411261330`, and completed proper narration at `1785411295267`. Operation `narration-operation:553c469227f457006e90b88b30c57cf1bed26ab6` retained packet hash `57b9c9a5910796f332c5109f7601614a723f07e92fa841c3a2e79961a15d9010`, result `result:1d61594f5dcfce29da711cbbf5f43ed3da10a183`, two Rulebook receipts, one narration attempt, and one proper scene. The rendered UI first showed the exact concise result with enabled suggested and freeform actions, then replaced it with the proper scene while preserving the action surface.

Controlled failure action `turn-player-action:5c4cdc9e9de7910ea3fbc571d77983771d79d354` admitted at `1785411521797` and committed at `1785411559291`. Operation `narration-operation:b9199245e43bee081dd0400352e6970c53ebab3f` retained packet hash `ead5bd6f62bcc2d99a271939cd102b93d455159258bc1fe70c85111b3feac5f0`, result `result:39f9702d7209aa39f8d1afe6c2947d64b2a0925d`, and the same two receipt identities across recovery. Attempt `narration-attempt:c5ef48754abaa034cb5e7f5725a297cbd4506807` was failed as schema-invalid after `172 ms`; the UI showed the factually exact booth result, enabled actions, `The moment stands as shown.`, and `Restore the telling`. Recovery created attempt `narration-attempt:c82a1d0767a70f17e6f2c0c5951862edd5164a32`, accepted it after `24615 ms`, and persisted exactly one proper scene. Counts remained four campaign turns, two receipts for this action, one turn result, one narration operation, two narration attempts, and one proper scene. Reload preserved the recovered scene, result, action availability, and all four controls.

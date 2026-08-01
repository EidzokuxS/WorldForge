# Task 112 — Certified rendered move route

Status: implemented and product-validated on the disposable Campaign Play fixture.

## Outcome

An exact current rendered `Go to <destination>` choice can now enter the `certified_move` route and omit Judge. Code creates the certificate from the current admission frame, visible open route, canonical route cost, actor placement, permissions, handle bindings, source moment, campaign and turn identity, and world/runtime revisions. The Game Master, Rulebook preflight and execution, immutable result, receipts, visibility projection, concise action-ready state, and receipt-keyed Narrator operation are unchanged.

The same words submitted as freeform stay on `full_authority`. Any non-move, hidden or private-sensitive state, stale source, mismatched handle, target, parameter or revision, unavailable route, unauthorized reference, active actor condition, unsupported resolver case, or certificate disagreement also stays on the existing route or fails through its existing truthful boundary. No model assertion or label alone can certify a move, and no Judge-shaped artifact is synthesized.

## Runtime boundary

`resolveStageClaimRoute` has one additive admission branch: an admitted player action whose persisted, schema-valid selection is bound to a revalidated `certified_move` certificate claims Game Master directly. All existing full-authority stage, lease, epoch, resume, replay, and recovery cases remain in place.

The Planner remains necessary because this slice does not make settlement code-deterministic. Game Master still proposes resolver-ready effects, and the existing Rulebook owns authoritative settlement.

Telemetry now exposes `routeKind` and per-stage model call counts. A successful certified move records zero Judge calls and one Game Master call without adding player-facing debug text.

## Product evidence

- Entry point: `http://localhost:3000/campaign/d1111111-1111-4111-8111-111111111111/play`
- Initial representative state: North Harbor Docks, world version 14, runtime revision 133, current visible open route `Go to Glass Reef Quay`, cost 2.
- Turn: `turn-player-action:f8b641165e7ff8882f415adb4a28fb77b3a5cf84`
- Recorded route: `certified_move`; Judge calls: 0; Game Master calls: 1.
- Observed result: world advanced from 14 to 16, Mara moved to Glass Reef Quay, the committed result and next actions became available, and the receipt-keyed Narrator operation completed with a proper scene.
- Recovery proof: `turn-player-action:576f50953f95f83950047328e6b6b185a5bc4348` rejected one invalid Game Master proposal, resumed under a fresh worker epoch, retained zero Judge calls, completed settlement, and completed narration.
- Evidence: `output/playtests/campaign-play/task-112-certified-move/journey-evidence.json` and the screenshots beside it.

## Review note

No prompt or player-visible copy changed. Humanizer and deslop review found no prose rewrite needed outside this task note; the note was tightened to direct product language.

# Task 135: certified rendered observe route

## Outcome

An exact current rendered `Examine ...` choice can use `certified_observe` and proceed directly to Game Master without an external Judge call. The certificate is code-owned and binds the campaign, turn, source moment and packet, accepted/base world versions, runtime revision, player, choice, current visible location, authored detail, deterministic one-minute ruling, and certificate hash.

The route is fail-closed. It applies only to a suggested `observe` intent with one current-location target, an exact rendered choice binding, a three-to-eight-word detail, current player placement, no active player condition, and matching visible/authorized location authority. The same text submitted as freeform, a stale or mismatched choice, another target, hidden authority, changed placement, or changed revision stays on full authority or fails at the existing boundary.

Game Master, Rulebook settlement, Actor Replanner, receipts, visibility projection, Narrator, provider/model selection, deadlines, recovery, and visible copy are unchanged. Game Master still decides and commits the grounded observation; the certificate establishes only that the player can inspect the current visible location successfully.

## Evidence and risk

The frozen r74 action 11 selected `Examine the toll ledgers on their hooks` from the current proper scene. Its admitted frame bound the choice to the visible current location, but `routeKind=full_authority` caused two bypass Judge attempts to reach their separate 30-second deadlines without a provider result. No mechanics or proper scene was written. r74 remained frozen without Resume or replay.

Source review showed that extending timeout or reasoning options would not remove this unnecessary external dependency. The change instead follows the existing certified move/wait/contact architecture through admission, hash revalidation, Game Master artifact authority, repository replay/CAS, visibility projection, terminal result triggers, and migration 0051.

GitNexus was stale and returned `UNKNOWN` for the new local symbols. Source-confirmed blast radius is high because the route crosses runtime, repository, visibility, contract, and migration boundaries; the implementation is restricted to those existing certified-route seams.

Focused validation:

- `turn-runtime.test.ts`: 65/65 passed, including Judge 0 / Game Master 1, one completed result/receipt path, and same-text freeform through Judge.
- `campaign-play-database.test.ts`: 18/18 passed, including migration 0051 and the updated terminal-result trigger.
- `contracts.test.ts`: 36/36 passed.
- `campaign-play-turn-repository.test.ts`: 35/35 passed.
- `visibility-service.test.ts`: 7/7 passed.
- `campaign-play-application.test.ts`: 13/13 passed.
- Backend typecheck and backend/shared/frontend production builds passed.
- `git diff --check` passed. Staged GitNexus change detection reported the expected high-risk persistence surface: 9 files, 11 indexed symbols, and 38 affected flows. The stale index mapped several changed nested symbols to their enclosing repository/runtime declarations; source review and the focused replay/CAS/visibility/migration suites above are the acceptance authority.

No prompt, model instruction, narrative prose, or player-visible copy changed. Humanizer and deslop review are therefore not applicable.

## Product acceptance

A fresh r75 lane must prove one naturally rendered inspection records `certified_observe`, zero Judge attempts, one accepted Game Master stage, one durable settlement, one proper scene, and enabled controls within 120 seconds. Freeform behavior is covered by the focused counterexample and remains on full authority.

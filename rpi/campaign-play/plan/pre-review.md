# Campaign Play PRE review

Date: 2026-07-10

Status: aligned. Execution has not started.

## Reviewers

| Perspective | Model and effort | Final verdict | Gate |
|---|---|---|---|
| Architecture, ownership, transactions, recovery, cutover | GPT-5.6 Sol, xhigh | aligned in round 4 | zero blocker, major, or minor findings |
| Player experience, agency, autonomy, visibility | GPT-5.6 Terra, high | aligned in round 2 | public consequence handle correction applied |
| Playtest validity, telemetry, artifacts, turn counts | GPT-5.6 Terra, medium | aligned in round 3 | zero blocker, major, or minor findings |
| UI, copy, naming, plan clarity | Droid custom GLM-5.2 | architecture aligned; UI/copy corrections applied | no blocker or major finding in the usable review |

## Corrections applied

The architecture review changed the draft in these material ways:

- Split immutable accepted provenance from mechanical `worldVersion/worldHash` and operational `runtimeRevision/runtimeHash`.
- Added an internal bootstrap command union for player creation and opening initialization. Model schemas omit these commands.
- Added `role=player` and database constraints for one human person actor and one present placement.
- Made opening an idempotent `turnKind=opening` ledger with the same worker epoch, bootstrap/Rulebook, visibility, narration, and recovery boundaries as player actions.
- Added atomic worker lease claims that require an unowned lease, increment and return an epoch before external work, and reject late artifacts.
- Added campaign runtime events for every runtime revision. Turn-owned mutations also emit sanitized turn events.
- Allowed a new opening to supersede only a terminal pre-mutation failed opening. External opening failures remain interrupted and require explicit resume.
- Froze due actor IDs and order only. Each actor frame and proposal now uses the latest committed world version and settles before the next actor frame.
- Split schema, repository, scheduler, runtime, and UI tasks into smaller owner-specific units.

The gameplay review added:

- a bounded public consequence contract derived from earned observations;
- an opaque `observationHandle` instead of a canonical observation ID;
- one discoverable non-local consequence within the first five player actions;
- paired intervene versus leave/wait fixtures;
- a real first-playable-slice gate before longer campaigns;
- player-only causal explanation checks at turns 5, 10, and 20;
- explicit opening orientation and no-cast-dump evidence.

The evidence review added:

- a two-stage eligibility manifest before live play;
- browser action and network ledgers proving normal UI/API use;
- model-stage, budget, and runtime-event ledgers;
- `turnKind`, `openingTurn=0`, and contiguous `playerActionNumber` counting;
- at least 30 freeform actions in every 60-action lane;
- a named human who chooses and signs all 60 actions in each pristine lane;
- two fresh 60-action campaigns plus one zero-turn clone/provenance 60-action campaign;
- isolated deterministic replay at soak checkpoints 30, 60, 150, and 300.

The GLM review added or clarified:

- domain output path `output/playtests/campaign-play/`;
- visible actor projection fields without faction data;
- machine-readable versus player-visible error fields;
- code-owned Oracle randomness rather than a separate model stage;
- explicit UI Concept decisions for player card, sprites, tray actions, Continue, scene quote, toast, and Oracle presentation;
- a blocking UI contract checkpoint before backend and frontend implementation.

## GLM record

The usable GLM review is `rpi/campaign-play/plan/glm-review-custom.out.log`. It returned `aligned` for the plan and `partially aligned` for UI/copy, with minor corrections only. Those corrections are present in the final plan.

The first built-in GLM invocation failed before review with an MCP startup error. A later custom round returned only a completion acknowledgment to stdout, so it supplies no verdict and is excluded from the gate. The usable review and independent PRE audits provide the retained evidence.

## Final gate

All three independent Krypton PRE perspectives are aligned with zero blocker or major findings. Task 0 may begin only after the user approves execution of `docs/goals/campaign-play/PLAN.md`.

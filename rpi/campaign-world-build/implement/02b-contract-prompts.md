# Task 2B evidence: model contracts and prompts

## Delivered

- `world_frame` schema for summary, 3 to 10 persistent locations, and 2 to 30 directed routes.
- `world_cast` schema factory for 4 to 16 unified actors, 4 to 32 active goals, and 4 to 32 placements against an accepted frame.
- `world_connections` schema factory for 3 to 32 relations and 2 to 6 starting pressures against accepted frame and cast packets.
- Stage prompts with one owner, explicit allowed context, source-data handling, local-reference rules, and world-centered generation scope.
- Player-safe messages for source, build, model-contract, interruption, recreation, and stale-review errors.

## Strict contract properties

- Every object is strict. Missing fields, extra fields, invalid enums, invalid literals, and model-owned persistent IDs fail at the Zod boundary.
- Model strings fail on surrounding whitespace. Schemas apply no trimming, coercion, defaults, repair, or alternate parsing.
- Locations and actors use typed local references. Cross-stage references resolve by exact equality. Code assigns persistent IDs after all stages pass.
- Generated actors require `controller: "agent"`; generated goals require `status: "active"`.
- Frame validation enforces one starting macro location, parent semantics, unique directed routes, and reachability.
- Cast validation enforces role minimums, goal ownership/counts, placement compatibility, and distributed reachable presence.
- Connections validation enforces relation participation, distinct endpoints, resolved anchors, nonempty pressure anchors, and different anchor sets.
- The model contract contains one actor collection. Collective organizations use `kind: "collective"`.

## Prompt and copy gate

- `agent-prompt` supplied the one-owner, explicit-context, structured-output design.
- `humanizer` and `deslop` produced direct technical prose with no filler, promotional language, artificial suspense, vague authority, formulaic contrast, em dash, or en dash.
- Droid GLM-5.2 exited 0 and returned `Plan is up-to-date.`
- Review record: `rpi/campaign-world-build/plan/prompt-review.md`.
- Review log: `.codex/agent-logs/droid-campaign-world-model-contract-20260710-003213.out.log`.

## Verification

- Campaign World contract/source suite: 3 files, 47 tests passed.
- Contract tests alone: 27 tests passed.
- Backend typecheck: passed.
- Shared build: passed.
- `git diff --check`: passed.
- Fixed-string searches found no scaffold field, separate organization collection, regex parser, em dash, or en dash in the model contracts and prompts.
- No standalone smoke suite was added.

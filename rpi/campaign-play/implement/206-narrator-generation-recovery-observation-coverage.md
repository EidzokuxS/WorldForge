# Task 206: Narrator generation-recovery observation coverage

## Contract

When Narrator attempt 1 fails with the existing `narrator_generation_schema_mismatch` recovery diagnostic, the sole automatic attempt 2 receives one additional packet-derived `OBSERVATION_COVERAGE_REPAIR_FRAME`. The frame contains only `expectedObservationCount` and ordered `requiredObservationIndexes`, derived from `packet.newObservations`. It does not change schemas, validators, models, modes, deadlines, retry eligibility, operation identity, persistence, mechanics, UI, or player-visible copy.

The generation-recovery prompt retains the existing `ACTION_SELECTION_INDEX_FRAME` first, then appends this exact approved instruction and frame before `RECOVERY_DIAGNOSTIC`:

> Rebuild beat observationIndexes from OBSERVATION_COVERAGE_REPAIR_FRAME. Across all beats combined, include every requiredObservationIndex exactly once, include no other index, and produce exactly expectedObservationCount observationIndexes entries. Keep each listed observation grounded in that beat's visible narration.

Main semantic review verdict: prompt-craft found the instruction outcome-first and contract-complete; humanizer/deslop found no filler or artificial prose requiring a rewrite. The literal is retained unchanged.

## Impact and implementation

An exact-entry GitNexus shadow at `c5542f4993d4afdb3e6816e38934ab439989b316` reported `buildPrompt` as exact LOW (one direct caller, one affected process, one module; caller `narrate`). The enclosing `createCampaignPlayNarrator` mapping was the authorized enclosing HIGH (24 impacted symbols, five direct callers, four Campaign Play processes, Campaign-play and Engine modules). The implementation stays within the authorized private prompt/helper boundary and `narrator.test.ts`; no exported interface or additional production owner changed.

The implementation adds the private `buildObservationCoverageRepairFrame` helper and appends its canonical packet-derived JSON only in the existing generation-schema recovery block. Normal, packet-validation, and actor-scope recovery prompt branches remain unchanged.

## Static evidence

The focused Narrator suite passes (`41 tests`). The directly affected turn-runtime and Campaign Play application suites pass (`75` and `15` tests, `90` total). Backend typecheck and production build both pass, and `git diff --check` is clean. The added assertions cover one-, zero-, and two-observation frames, deterministic ordering, action-frame-before-coverage-frame ordering, coverage-frame-before-`RECOVERY_DIAGNOSTIC`, privacy exclusions, and absence from the ordinary and packet-validation recovery prompts. The implementation does not touch the validator, schema, runtime recovery, or any exported interface.

The staged exact-entry GitNexus detection and final commit/push evidence will be appended with the implementation commit before the live lane. Protected `AGENTS.md` and `CLAUDE.md` remain unstaged.

## Live r154 evidence

To be filled after the one fresh `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r154` lane. Natural Task 206 recovery coverage is unavailable unless the built lane produces the specified Narrator generation-schema boundary.

## Acceptance handoff

Static evidence must map the zero-, one-, and multi-observation frames; prompt isolation and ordering; frame privacy; unchanged validator/recovery identity; and the focused/build checks. Live evidence must separately report setup, Opening, action checkpoints, any natural recovery, persistence integrity/FK, same-page reload, or the first frozen defect. No unavailable live criterion is inferred from static tests.

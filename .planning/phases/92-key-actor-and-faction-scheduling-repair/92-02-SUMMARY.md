# 92-02 Summary: Key NPC Due Plan Steps And Consequences

Status: complete
Date: 2026-05-10

## Implemented

- Extended deterministic actor plan actions with explicit surface policy: `surfaceRoute`, `visibility`, `knowledgeRoute`, and `hiddenCauseTerms`.
- Updated actor plan execution so completed travel and record-event steps return surface metadata, write concrete event refs, and persist surface fields to `location_recent_events`.
- Kept `recordLocationRecentEvent` unchanged because GitNexus impact for that shared helper is CRITICAL and its existing fields already support the Phase 92 contract.
- Rewired due world work to load only selected actor processes and consume due durable wake rows only after successful deterministic completion.
- Added the `key-actor-due-plan` acceptance regression proving one due key NPC elsewhere can commit a discoverable consequence while 40 sleeper controls remain untouched.

## Proof

- `npm --prefix backend run test -- src/engine/__tests__/actor-plan-executor.test.ts src/engine/__tests__/offscreen-catchup.test.ts src/engine/__tests__/key-actor-due-plan.test.ts`
  - 3 files, 7 tests passed.
- `npm --prefix backend run test -- src/engine/__tests__/actor-wake-signals.test.ts src/engine/__tests__/actor-scheduler.test.ts src/engine/__tests__/actor-plan-executor.test.ts src/engine/__tests__/offscreen-catchup.test.ts src/engine/__tests__/key-actor-due-plan.test.ts`
  - 5 files, 17 tests passed.
- `npm --prefix backend run typecheck`
  - Passed.
- `git diff --check`
  - Passed with only LF-to-CRLF working-copy warnings.

## Requirement Mapping

- P92-R2: Durable wake rows are consumed after successful due actor completion, not while work is pending or failed.
- P92-R3: Due deterministic travel/record-event steps commit through authority traces, process updates, and source-backed location consequences.
- P92-R7: Offscreen key NPC consequences are discoverable through location recent events and SceneFrame recent-event proof without waking sleeper actors.

## GitNexus Impact

Pre-edit impact was LOW for `executeActorPlanStep`, `resolveDueWorldWorkForScope`, `normalizeDeterministicPlanAction`, and `updateActorProcessAfterDecision`.

`recordLocationRecentEvent` impact is CRITICAL, so this plan deliberately did not modify that shared helper. The implementation only uses its existing optional surface fields.

Staged `detect_changes(scope="staged")` was HIGH on actor-plan execution flows, expected because `executeTravel` now returns/persists surface metadata and due work consumes wake rows after commit. The focused due-plan and offscreen suites above cover the changed flow.

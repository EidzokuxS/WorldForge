# Phase 88 Wave 6 Verification

Date: 2026-05-07

## Scope

Wave 6 covers:

- `88-08`: faction command/report/resource network.
- `88-09`: durable world threads and safe diegetic surfacing.

## Implemented

- Added faction command nodes, faction reports, faction operations, faction resources, and resource ledger tables.
- Added `faction-command-network` helpers for command node creation, delayed report delivery, resource validation, operation proposal, and operation commit.
- Replaced periodic faction simulation queue proposals with command-node-routed proposal payloads.
- Added source-backed world threads and world thread events.
- Added due world thread resolution before SceneFrame/NarratorPacket assembly.
- Added `world_thread_signal` source routing through `location_recent_events`, SceneFrame, NarratorPacket, and PlayerFacingPacket.
- Added hidden-cause term checks so thread signals cannot leak private causes into player-facing summaries.
- Added rollback invalidation for faction reports, faction operations, and world threads.
- Updated structured-output inventory for the newer GM/actor/forecast LLM boundary files.

## Verification Commands

```powershell
npm --prefix backend run typecheck
```

Result: PASS.

```powershell
npm --prefix backend test -- src/engine/__tests__/faction-command-network.test.ts src/engine/__tests__/world-thread.test.ts src/engine/__tests__/simulation-queue.test.ts
```

Result: PASS, 3 files / 9 tests.

```powershell
npm --prefix backend test -- src/engine/__tests__/faction-command-network.test.ts src/engine/__tests__/world-thread.test.ts src/engine/__tests__/simulation-queue.test.ts src/engine/__tests__/offscreen-catchup.test.ts src/engine/__tests__/living-world-authority.test.ts src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/scene-assembly.test.ts src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/player-facing-packet.test.ts src/engine/__tests__/prompt-assembler.test.ts
```

Result: PASS, 10 files / 81 tests.

```powershell
npm --prefix backend test -- src/engine/__tests__/turn-processor.empty-narration.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/turn-processor.inventory-authority.test.ts
```

Result: PASS, 3 files / 67 tests.

```powershell
npm --prefix backend test -- src/ai/__tests__/structured-output-boundary.test.ts src/engine/__tests__/bug-fixes-verification.test.ts
```

Result: PASS, 2 files / 27 tests.

```powershell
npm --prefix backend test
```

Result: PASS, 176 files / 2133 tests / 30 todo.

```text
GitNexus detect_changes(scope=all)
```

Result: HIGH change-set risk, driven by `resolveDueWorldWorkForScope` and player-facing scene packet integration. Changed symbols: 21. Affected processes: 6 `ResolveDueWorldWorkForScope -> ...` flows. Follow-up `context(resolveDueWorldWorkForScope)` confirmed the touched seam fans into world clock, key actor scheduling, actor plan execution, deferred actor proposals, and local signal selection; this matches Wave 6 scope and is covered by the focused due-world, actor authority, scene-frame, narrator/player packet, typecheck, and full backend suite above.

## Notes

- A first full-suite run exposed stale unit-test contracts around the new due world work shape. The runtime was not changed; the `turn-processor` unit harness now mocks due-world-work and actor-tools at the orchestration seam, while Wave 5/6 focused tests cover the scheduler/thread integrations.
- The structured-output boundary inventory was updated because Phase 81/84 GM files are real LLM boundaries and must stay visible to the Phase 73 guard.
- The tool-description guard was updated to reflect the already-strengthened `log_event` wording for `sensory/non-durable` scene-local beats.

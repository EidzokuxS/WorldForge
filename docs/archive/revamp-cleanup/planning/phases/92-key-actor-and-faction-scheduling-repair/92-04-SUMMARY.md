# 92-04 Summary: Faction Command Node Scheduler And Agent

Status: complete
Date: 2026-05-10

## Implemented

- Added `scheduleFactionCommandNodes`, selecting active command nodes by arrived reports, standing orders, durable command-node wake rows, and resource retry operations.
- Added `runCommandNodeDecisionPass` with injectable command decisions and backend-only validation through `proposeFactionOperation` and `commitFactionOperation`.
- Updated `faction_command_updates` queue payloads to include command-node candidate IDs and routing snapshots instead of an abstract faction mutation permission.
- Kept legacy faction tools untouched for compatibility; scheduled Phase 92 faction work now routes through command-node candidates and operation validation preconditions.
- Added focused scheduler, agent, and queue tests for idle nodes, delayed reports, durable wakes, insufficient resources, report consumption, resource ledger writes, local signal surfacing, and no private hidden-cause leakage into local signals.

## Proof

- `npm --prefix backend run test -- src/engine/__tests__/faction-command-network.test.ts src/engine/__tests__/command-node-agent.test.ts src/engine/__tests__/faction-command-scheduler.test.ts src/engine/__tests__/simulation-queue.test.ts`
  - 4 files, 17 tests passed.
- `npm --prefix backend run typecheck`
  - Passed.
- `git diff --check`
  - Passed with only LF-to-CRLF working-copy warnings.

## Requirement Mapping

- P92-R2: Durable command-node wake rows can select faction command candidates without waking an omniscient faction mind.
- P92-R4: Command actions require reports or standing orders plus resource validation before commit.
- P92-R6: Command reports remain in command-node frames; committed operations surface only explicit local signals.
- P92-R7: Committed operations write authority, resource ledger, consumed report status, and optional location signal.

## GitNexus Impact

Pre-edit impact was LOW for `buildFactionCommandNodeFrame`, `proposeFactionOperation`, `commitFactionOperation`, `queuePostTurnSimulationProposals`, `tickFactions`, and `createFactionTools`.

`detect_changes(scope="all")` reported LOW risk on the queue routing snapshot path with no affected indexed processes. New scheduler/agent modules are not yet indexed until the post-commit analyze pass.

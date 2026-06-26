# 93-02 Parallel Frame Retrieval Evidence

Date: 2026-05-10

## Implemented

- `runFrameRetrievalJobs` accepts read-only frame retrieval jobs for `SceneFrame`, `OracleFrame`, `ActorFrame`, `FactionCommandFrame`, `NarratorPacket`, and `ReviewerPacket`.
- Frame retrieval jobs are scheduled through `runParallelSimulationJobs` with `writeScopes: []`, so independent read-only retrieval can share a parallel group.
- Retrieval result metadata preserves `frameType`, `viewerId`, `scopeRefs`, `criticality`, and `readOnly: true`.
- Retrieval failures remain `status: "failed"` and carry the error string; successful sibling jobs still complete.
- `runRequiredActorDecisionPass` now retrieves ActorFrame knowledge through the read-only frame runner before actor decision prep.
- Actor decision prep still uses normalized write scopes. Disjoint prep jobs can share a group; conflicting scopes serialize via `serializedAfterJobIds`.
- `processTurnScenePlan` records actor frame retrieval groups and actor prep groups in `TurnLatencyTrace.parallelGroups`.
- `resolveDueWorldWorkForScope` records `proposalPrepTrace` for deferred actor proposal prep. The trace is audit metadata only; it does not claim the deferred proposals have executed.

## Verification

```powershell
npm --prefix backend run test -- src/engine/__tests__/parallel-simulation-runner.test.ts src/engine/__tests__/frame-retrieval-runner.test.ts src/engine/__tests__/actor-frame.test.ts src/engine/__tests__/actor-tools.test.ts src/engine/__tests__/turn-processor.observability.test.ts src/engine/__tests__/offscreen-catchup.test.ts
npm --prefix backend run typecheck
git diff --check
```

Result:

- `frame-retrieval-runner.test.ts`: read-only jobs share a parallel group, and failed jobs stay failed without suppressing successful siblings.
- `parallel-simulation-runner.test.ts`: read-only jobs remain co-grouped while conflicting proposal writes serialize.
- `actor-tools.test.ts`: required actor pass reports separate read-only frame retrieval trace and write-scope-aware prep trace.
- `turn-processor.observability.test.ts`: emitted turn latency traces include ActorFrame retrieval and actor prep parallel groups.
- `offscreen-catchup.test.ts`: deferred non-deterministic due actor work reports proposal prep trace with actor and location write scopes.
- Backend typecheck passed.
- Diff check passed with CRLF normalization warnings only.

## Risk Notes

- The due-world trace is intentionally a proposal-prep audit, not a new executor. Deferred proposal execution remains guarded by existing proposal lifecycle and write-scope validation.
- No HIGH or CRITICAL GitNexus impact warning was returned for the modified indexed symbols during preflight.

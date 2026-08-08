# Task 168: Narrator actor-observation mismatch recovery

## Contract

When a Campaign Play Narrator proposal names a visible actor whose name is not
owned by the beat's `observationIndexes`, the proposal remains rejected as
`narration_invalid`. The existing automatic attempt-2 recovery receives only
the safe mismatch coordinates already emitted by the guard. The same immutable
packet, operation, result, narration, receipt, and shared automatic deadline
are reused; mechanics do not replay and no attempt 3 is introduced.

The safe check is exactly `visible_actor_observation_mismatch` and contains
`beatIndex`, `fieldPath`, `observationIndexes`, `matchedActor` (`canonicalId`,
`canonicalName`, `matchedAlias`), `allowedActors` (`canonicalId`,
`canonicalName`), and `sourceObservationPerformers` (`observationIndex`,
`canonicalId`, `canonicalName`). Rejected beat text, raw proposals/provider
responses, source-observation prose, secrets, and hidden state are excluded.
No schema, migration, persistence field, provider/model setting, prompt prose,
retry policy, deadline, mechanics, UI, or player-visible copy changes.

## Impact and semantic review

The refreshed GitNexus index is current at entry commit
`3eac444a655bd0685eaf790e065554b522463f69`; the index was refreshed with the
project runner's instruction-file-safe `--index-only --skip-agents-md
--skip-skills` mode. The nested `CampaignPlayNarratorPacketValidationFailure`
type and `assertProposalForPacket` function are not indexed as standalone
symbols. The exact file-level route for
`File:backend/src/campaign-play/narrator.ts` is MEDIUM (`impactedCount=18`,
`directCount=8`, depth 1 = 8, depth 2 = 8, depth 3 = 2, no affected
processes/modules). `CampaignPlayNarratorError` itself reports CRITICAL when
targeted, but that class was not edited; its high shared blast radius is
therefore not a target result for this bounded change. No other production
file was required.

No prose rewrite is needed. The current prompt already states the ownership
rule explicitly.

The change adds code-owned structured safe-check data only. No player-visible
copy or prompt instruction prose changes.

Humanizer/deslop verdict: retain the exact diagnostic literals and field
names; there is no natural-language text to rewrite.

## Implementation

`CampaignPlayNarratorPacketValidationFailure` now includes the one structured
`visible_actor_observation_mismatch` variant. The existing guard builds the
coordinates once, keeps the `narrator_visible_actor_observation_mismatch`
warning name and payload stable, and carries the same coordinates in
`CampaignPlayNarratorError("narration_invalid", null, { recoveryFeedback })`.
The existing NARRATOR_RECOVERY block, runtime forwarding, immutable operation,
stage-local deadline, and automatic attempt-2 path are unchanged.

Focused tests cover the stable warning and exact recovery feedback for the
r45-shaped split and false-attribution guards, sentinel/prose exclusion, the
canonical recovery prompt, and one receipt-keyed runtime recovery with the
same identities, one mechanics settlement, one proper scene, and no attempt 3.

## Automated evidence before the rendered lane

- `npx vitest run src/campaign-play/narrator.test.ts --pool=forks
  --maxWorkers=1 --minWorkers=1`: 29/29 passed.
- Focused turn-runtime recovery/terminal tests with the same command shape:
  3/3 passed (67 skipped in the 70-test file); the selected tests cover
  automatic actor-mismatch recovery, second-invalid terminal behavior, and
  attempt-2 timeout/no further recovery.
- `npx vitest run src/campaign-play/campaign-play-application.test.ts
  --pool=forks --maxWorkers=1 --minWorkers=1`: 13/13 passed.
- `npx vitest run src/campaign-play/campaign-play-database.test.ts
  --pool=forks --maxWorkers=1 --minWorkers=1`: 18/18 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `git diff --check`: passed; only the pre-existing AGENTS.md and CLAUDE.md
  changes remain outside the Task 168 scope.

## Rendered lane

To be appended after the fresh r117 lane. This section will record the exact
template/config/card hashes, setup/admission counts, per-action authoritative
turn/model/operation/attempt/scene/binding evidence, checkpoints, integrity and
foreign-key checks, any natural actor-mismatch recovery, same-page reload, and
task-owned runtime cleanup. A genuine product defect freezes the lane at its
first boundary without a replacement action.

## Acceptance handoff

Entry state is the current Task 167 source at
`3eac444a655bd0685eaf790e065554b522463f69`, with frozen r116 preserved and
only the pre-existing AGENTS.md/CLAUDE.md worktree edits unstaged. The source
and focused tests positively map the mismatch rejection, safe feedback,
prompt forwarding, identity/deadline reuse, single settlement, no mechanics
replay, no attempt 3, and privacy criteria. Rendered r117, its first genuine
boundary (or 60/60), reload, and cleanup remain pending at note creation.

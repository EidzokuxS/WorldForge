# Phase 81 Summary: GM Turn Orchestration Loop And Settled Tool Execution

## Status

Complete: 2026-05-04.

## Goal

Replace the fragmented GM Turn Decision / GM BeatPlan / ScenePlanner runtime center with an inspectable GM loop:

1. Build a compact GM Read from scene state, player action, and scoped forecast.
2. Skip planning/execution entirely for direct, continue, and clarification turns.
3. Use a bounded GM Action Checklist only when a turn needs mutation, roll-oracle resolution, or combat handling.
4. Execute each required mutation through small backend-validated tool steps.
5. Narrate only from settled post-execution truth.

## Completed Plans

- 81-00: Baseline preflight and cross-AI review incorporation.
- 81-01: GM Read contract and player-turn world-brain/decision consolidation.
- 81-02: Turn path gating for direct, continue, and clarification.
- 81-03: GM Action Checklist contract for mutating/combat turns.
- 81-04: Validated tool-step execution with done/skipped/revised statuses.
- 81-05: Settled narrator packet and narration handoff.
- 81-06: Integration verification and fresh-campaign live playability.

## What Exists Now

- `gm-read.v1` is the first GM-brain pass. It decides intent/path, immediate stakes, roll needs, and tool intent without concrete backend payloads.
- `gm-action-checklist.v1` is the mutating-turn checklist. It is bounded, sequential, and explicit about dependencies.
- `executeGmToolSteps` executes checklist steps one at a time with schema validation, allowed-tool enforcement, grounding checks, one bounded revision, skipped statuses, and settled results.
- `NarratorPacket` is packet-owned and no longer passes raw `SceneAssembly` effect prose into final narration on the packet path.
- `/game` exposes stage-aware loader copy instead of pretending every model turn should fit an arbitrary duration.

## Verification

See `81-VERIFICATION.md` and `81-06-SUMMARY.md`.

Fresh campaign `dcd3dd98-6bee-426e-ae49-a178c4b9082f` reached opening plus 13 player turns. The live gate found and fixed six real defects: GM Read invented evidence refs, tool-step revision exceptions, final narration accepting unsupported player possession claims, durable `log_event` persisting unsupported possession/access claims as committed world truth, player tags persisting impossible access claims, and GM Read rejecting typed aliases for known current-location refs.

## Remaining Risk

- Broader play quality still needs repeated live campaigns across different genres and starts.
- This phase corrected turn orchestration; it did not attempt to solve every worldgen, pacing, prose, or long-horizon campaign-memory issue.
- The 81 live campaign contains one pre-fix chat narration line with a false registry-token claim. The false committed event rows and `vault-unlocked` tag residue were removed from the test campaign stores and future turns use the new guards; a fresh campaign is still cleaner for manual UAT.

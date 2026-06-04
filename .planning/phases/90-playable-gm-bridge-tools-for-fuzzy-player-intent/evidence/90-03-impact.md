# Phase 90-03 Impact Preflight

Date: 2026-05-10

## Scope

Plan 90-03 adds compact fuzzy-intent bridge policy, a clarification reviewer, and turn-processor routing so backend-ish exact-ID clarification does not reach the player when bridge tools can resolve the intent.

## GitNexus Impact Results

| Symbol | Risk | Direct dependents | Affected processes / notes |
| --- | --- | ---: | --- |
| `buildGmReadPromptContract` | LOW | 2 | Direct: `buildGmReadPrompt`, `buildGmReadFrameRefRepairPrompt`; affected processes include `runGmRead` and GM Read prompt assembly. |
| `buildGmActionChecklistPromptContract` | LOW | 1 | Direct: `buildGmActionChecklistPrompt`; affected process: `runGmActionChecklist`. |
| `runGmRead` | LOW | 0 | No indexed upstream dependents. |
| `runGmActionChecklist` | LOW | 0 | No indexed upstream dependents. |
| `buildNoMutationScenePlan` | LOW | 0 | No indexed upstream dependents. |
| `processTurnScenePlan` | not indexed | n/a | GitNexus could not resolve this local generator symbol; cover with focused turn-processor tests. |
| `processTurn` | not indexed | n/a | GitNexus could not resolve exported generator symbol; cover through caller-facing turn-processor tests. |

## Risk Handling

- Keep prompt policy compact; do not add a second planner or large schema.
- Clarification reviewer may repair only parser-like clarification when bridge candidates/tools can resolve it.
- Valid clarification remains valid for materially different risk/cost, high-impact/irreversible actions, contradictory intent, and identity-critical ambiguity.
- Turn-processor wiring must not invent state; repaired paths still use GM/tool validation.

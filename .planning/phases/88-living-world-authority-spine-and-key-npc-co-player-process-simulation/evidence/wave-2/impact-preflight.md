# Wave 2 Impact Preflight

## Scope

Wave 2 locks POV and visibility boundaries before autonomous actor decisions are allowed to mutate or propose world state.

## GitNexus Impact

| Symbol | File | Risk | Notes |
| --- | --- | --- | --- |
| `buildSceneFrame` | `backend/src/engine/scene-frame.ts` | LOW | Current SceneFrame construction can remain untouched for Wave 2. |
| `buildNarratorPacket` | `backend/src/engine/narrator-packet.ts` | LOW | Existing narrator packet can remain the canonical visible-turn source. |
| `assertNarratorPacketPromptSafe` | `backend/src/engine/narrator-packet.ts` | LOW | Direct callers: `formatNarratorPacketForPrompt`, `assembleFinalNarrationPrompt`. Safe integration point for additional player-facing packet guard. |
| `formatNarratorPacketForPrompt` | `backend/src/engine/narrator-packet.ts` | LOW | Direct caller: `assembleFinalNarrationPrompt`. |
| `assembleFinalNarrationPrompt` | `backend/src/engine/prompt-assembler.ts` | LOW | Integration can remain localized to final-visible prompt construction. |
| `buildModelFacingScenePacket` | `backend/src/engine/model-facing-scene.ts` | CRITICAL | Directly affects GM Read, Tool Loop, Beat Plan, Forecast, Scene Planner, Action Checklist, and repair paths. Wave 2 must not rewrite this shared packet in-place. |
| `buildRuntimeToolInputContract` | `backend/src/engine/prompt-contracts.ts` | HIGH | Existing runtime tool contract feeds several hidden/tool planning prompts. Wave 2 should add new contract helpers without changing this function. |
| `validateVisibleNarrationAgainstPacket` | `backend/src/engine/visible-narration-output-guard.ts` | LOW | Direct caller: `runVisibleNarrationWithPacketGuard`. Safe to harden post-model output validation for `forbiddenPrivateTerms`. |

## Decision

Implement Wave 2 additively:

- Add `actor-frame.ts` for actor/command-node POV contracts and citation validation.
- Add `player-facing-packet.ts` as a named pre-narrator boundary derived from existing `NarratorPacket`.
- Integrate PlayerFacingPacket into final-visible prompt formatting only after packet safety passes.
- Leave `buildModelFacingScenePacket` behavior unchanged in this wave.
- Add focused tests before any future actor autonomy uses the new frame.

## Read-Only Audit Addendum

Independent read-only audit (`Dirac`) confirmed:

- `ActorFrame` and `PlayerFacingPacket` did not exist before this wave.
- `buildModelFacingScenePacket` remains the must-not-touch CRITICAL surface for this wave.
- `assembleFinalNarrationPrompt` and `visible-narration-output-guard.ts` are the safest low-risk integration points.
- Existing post-model visible narration guard checked forbidden actor names and fact markers but not `forbiddenPrivateTerms`; Wave 2 includes a focused guard fix and regression.

# Phase 79 External Review Prompt

You are reviewing WorldForge Phase 79: GM epistemic context and tool grounding.

Context:
- WorldForge is a solo RPG engine.
- The LLM is the GM: it interprets raw player prose, chooses whether to roll/use tools/continue, and proposes changes.
- The backend is the rulebook/world truth: deterministic state, IDs, legal refs, rolls, validation, persistence, rollback.
- The backend must not semantically interpret freeform prose as intent/target/hostility.
- The backend must validate concrete GM-selected refs/tools and reject impossible state mutations.

Observed failure:
- Player was in Shibuya.
- Campaign also had `Okutama Safe Zone - Forest Outpost`.
- A local Shibuya cafe/service beat caused GM to call:
  `{ "toolName": "spawn_npc", "input": { "name": "Outpost Cook", "locationName": "Okutama Safe Zone - Forest Outpost" } }`
- Backend accepted it because `spawn_npc.locationName` resolves against any campaign location.
- Later narration/local context leaked Forest Outpost into the Shibuya scene.

Review artifacts:
- `.planning/phases/79-gm-epistemic-context-and-tool-grounding/79-CONTEXT.md`
- `.planning/phases/79-gm-epistemic-context-and-tool-grounding/79-RESEARCH.md`
- `.planning/phases/79-gm-epistemic-context-and-tool-grounding/79-01-PLAN.md`
- `.planning/phases/79-gm-epistemic-context-and-tool-grounding/79-02-PLAN.md`
- `.planning/phases/79-gm-epistemic-context-and-tool-grounding/79-03-PLAN.md`
- `.planning/phases/79-gm-epistemic-context-and-tool-grounding/79-04-PLAN.md`

Key current-code facts:
- `runGmTurnDecision` serializes full `SceneFrame` into the prompt.
- `runScenePlanner` serializes full `SceneFrame` and prints active/support/background actors.
- `spawn_npc` currently takes free `locationName`.
- `handleSpawnNpc` resolves `locationName` against any campaign location.
- `log_event` is broadly described as "any noteworthy occurrence that should be searchable later."
- `scene-assembly.summarizeToolCall` can summarize `spawn_npc` as visibly present in the current scene.

Please review for:
1. Does Phase 79 actually fix root data-flow/context salience, not only validation symptoms?
2. Are the four plans ordered correctly and small enough to execute?
3. What concrete missing tests would catch future variants of the same bug?
4. Which tool contracts besides `spawn_npc` must be handled now to avoid another immediate leak?
5. Is there any risk the plan accidentally makes backend interpret prose again?
6. What should be amended before execution?

Return:
- BLOCKERS
- IMPORTANT AMENDMENTS
- NICE-TO-HAVE
- FINAL VERDICT: PASS / PASS WITH AMENDMENTS / BLOCK

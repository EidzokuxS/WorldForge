# Task 150: Game Master dialogue repetition guard

## Contract

A Game Master dialogue or interaction must answer the current player intent. It may not reuse an exact recent summary from the same actor's existing `ACTOR_CONTINUITY`. A necessary restatement must be a concise paraphrase that adds the current question-specific detail.

The guard is limited to dialogue and interaction records with a persisted actor. Actorless scenes, discoveries, mechanics, prompts for other roles, model selection, deadlines, recovery count, persistence, UI, and visible copy remain unchanged. Existing Game Master semantic recovery may regenerate one rejected proposal under its current identity and deadline contracts.

## Evidence

Fresh lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r90` reached sixteen proper player-action scenes. On action sixteen, the player asked Dren Vask about the red-dashed household names. The accepted Game Master consequence repeated the action-one runner-work reply exactly, despite that prior reply being present in Dren's `ACTOR_CONTINUITY.recentOwnActions`. Narrator faithfully rendered the repeated consequence, so the defect boundary is Game Master proposal compilation rather than narration.

Focused coverage freezes both halves of the contract: the exact recent summary is rejected with `model_contract_failed`, while a new dialogue summary still compiles.

Validation passed: Game Master and player-action runtime suites 114/114, backend typecheck, backend build, `git diff --check`, and GitNexus `detect_changes` (low risk, no affected process). Two consecutive-action fixtures now use their existing submitted-text-specific summaries so the tests continue to exercise distinct player intents instead of manufacturing the newly forbidden verbatim repeat.

Semantic review verdict: the instruction is technical, literal, and narrowly scoped to preventing verbatim actor-response reuse; it adds no narrative voice, player-visible copy, or filler.

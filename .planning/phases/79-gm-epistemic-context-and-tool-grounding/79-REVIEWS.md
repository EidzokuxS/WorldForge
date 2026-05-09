# Phase 79 Reviews: GM Epistemic Context And Tool Grounding

## Review Inputs

- Codex subagent plan audit.
- Codex subagent prompt/data-flow exploration.
- Codex subagent runtime tool grounding exploration.
- Gemini CLI review.
- OpenCode/Cursor/Claude external CLI reviews.

## Process Note

The first external review run used a 120 second timeout for several long-context CLI reviewers. That was too short for this phase. The reviews were rerun with a 600 second timeout before incorporation.

## Consensus

Reviewers agreed the phase direction is correct: the Forest Outpost failure is not a single bad tool call. It is a mixed data-flow/tool-contract problem where the GM sees too much backend truth and runtime tools accept too much ungrounded prose.

The accepted architecture is:

- backend keeps full truth internally;
- GM receives a scoped model-facing scene view;
- tool execution requires explicit turn grounding context;
- player-turn ScenePlans are prevalidated atomically before mutation;
- durable memory is opt-in, not a dumping ground for every direct beat;
- final narration cannot re-import remote/offscreen state through broad prompt assembly.

## Blocking Findings Incorporated

### B1: Add falsifiable phase spec

Resolved by adding `79-SPEC.md` with P79-R1 through P79-R7 acceptance criteria.

### B2: Whole-plan prevalidation must be atomic

Resolved in `79-02` and `79-04`: player-turn ScenePlan must validate all runtime tool inputs before any DB mutation. Mixed valid/invalid plans must commit nothing.

### B3: Execution context needs an explicit seam

Resolved in `79-02`: execution context is now a planned seam, likely `tool-execution-context.ts`, and player-turn execution cannot silently default to global campaign scope.

### B4: `spawn_npc` schema must be exact enough

Resolved in `79-SPEC` and `79-02`: `locationRef`, `locationId`, and legacy `locationName` behavior are locked. Prompt-facing examples must prefer `locationRef`.

### B5: `log_event` durability cannot remain vague

Resolved in `79-SPEC` and `79-03`: `durability: "durable" | "scene_local"` is selected. Default player-turn durability is `scene_local`; only `durable` enters episodic/location/pending/reflection persistence.

### B6: Final narration prompt can leak even if NarratorPacket is safe

Resolved in `79-03`: final-visible narration must use isolated NarratorPacket/local assembly or filter every broad prompt section.

### B7: Repair prompts are a second leak channel

Resolved in `79-01`: ScenePlanner repair prompt redacts/filters invalid candidate JSON and validation text through the same forbidden-term seam.

### B8: Tool registry must cover more than spawn

Resolved in `79-02`: registry covers `spawn_npc`, `reveal_location`, `move_to`, `spawn_item`, `transfer_item`, `set_relationship`, tag tools, and item/entity resolution.

### B9: Name refs need alias-aware legal sets

Resolved in `79-02`: legal refs include ids and display aliases only for exposed/current entities; ambiguous or remote matches are invalid.

### B10: File ownership overlap

Resolved by narrowing `79-01` ownership around model-facing view and repair prompt filtering, while `79-03` owns final narration prompt isolation. `prompt-assembler.ts` should not be edited by wave 1 unless explicitly handed off.

### B11: Tests must prove absence, not masking

Resolved in `79-01` and `79-03`: prompt tests assert offscreen content is absent from model-facing/final-visible prompts, not merely string-replaced.

### B12: Diagnostics must not leak

Resolved in `79-04`: logging uses counts and reason codes, not hidden names or full prompt dumps.

## Test Amendments Added

- Forest Outpost prompt absence across GM, ScenePlanner, repair, and final-visible narration.
- Positive hidden/background counts without labels/ids.
- Remote `spawn_npc` rejection before DB mutation.
- Mixed valid/invalid ScenePlan atomicity.
- Pending committed event drain on failed tick.
- `spawn_npc` result-location-based visibility summary.
- `log_event` `scene_local` vs `durable` persistence.
- `set_relationship` and `transfer_item` cross-scope rejection.
- `reveal_location` local anchor constraint.
- Non-player actor-turn grounding to that actor's local context.

## Deferred

Full long-horizon GM forecast and per-turn beat plan are Phase 80. Phase 79 only creates the clean data/tool substrate that forecast planning must consume.

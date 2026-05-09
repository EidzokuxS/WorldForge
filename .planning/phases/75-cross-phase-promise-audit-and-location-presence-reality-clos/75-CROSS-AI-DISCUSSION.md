# Phase 75 Cross-AI Discussion

## Inputs

- `75-CONTEXT.md`
- `75-CROSS-AI-PROMPT.md`
- Local GitNexus/code trace at HEAD `0a43970`
- Read-only internal explorer audit for prior phase promises
- Read-only internal explorer trace for location/presence worldgen bug
- Claude CLI advisory (`75-CLAUDE-ADVISORY.json`)
- Gemini CLI advisory (`75-GEMINI-ADVISORY.md`)

## External Reviewer Results

### Claude

Verdict: `READY-TO-PLAN`.

Claude confirmed the root-cause chain:

1. `ScaffoldLocation` lacks hierarchy fields.
2. `insertLocations` hardcodes every generated location as `macro`.
3. `insertNpcs` writes only `currentLocationId`, never `currentSceneLocationId`.
4. Player starting scene alignment must also be checked.

Claude's main risks:

- Optional hierarchy fields could silently disappear unless tests/warnings catch it.
- Name collisions need deterministic handling.
- Starting-location code may be inline, so the plan must trace the real route before editing.

Claude's mandatory tests:

- Dense scaffold saves `persistent_sublocation` rows with valid parents.
- NPCs assigned to sublocations get non-null scene scope.
- A player in sublocation A does not see NPCs in sublocation B under the same macro.

### Gemini

Verdict: `ready-to-plan`.

Gemini confirmed the same root cause: generated scaffolds are flat, so runtime correctly treats all same-macro actors as present in the same scene.

Gemini's main risks:

- Nested locations can break or isolate graph adjacency if macro/sub edges are not deterministic.
- Fixing NPC placement is insufficient if player creation still starts the player at the macro row.
- Prompt changes must avoid bloated or ambiguous hierarchy generation.

Gemini's recommended tasks:

- Extend scaffold location types with an optional parent reference.
- Update location prompt contracts to ask for containment only when it physically exists.
- Persist locations in two passes so parent ids resolve deterministically.
- Resolve sublocation NPC/player placement as `currentLocationId = parent macro`, `currentSceneLocationId = sublocation`.
- Add a secondary stale-promise audit for ephemeral scenes and NPC tiers.

## Tool Notes

Gemini CLI emitted user-agent validation noise for local GSD agent definitions and multiple `429 MODEL_CAPACITY_EXHAUSTED` retries for `gemini-3.1-pro-preview`, but it still produced a usable text advisory. This should be recorded as degraded reviewer reliability, not treated as a missing review.

Claude CLI returned a structured JSON result successfully through `claude -p --input-format text --output-format json --permission-mode plan`.

## Consensus

The location/presence bug is not primarily a model-output or scene-presence resolver failure. It is a data bridge failure:

```text
LLM/worldgen produces only flat location names
-> scaffold saver stores every location as macro
-> NPC saver stores broad currentLocationId only
-> player start aligns scene scope to broad location
-> scene presence receives null/fallback scene scopes
-> every same-macro actor becomes present
```

Phase 75 should therefore fix the generated-world data bridge before chasing runtime visibility code.

## Planning Implications

- The first implementation slice must create deterministic scaffold hierarchy support and persistence.
- The second implementation slice must align NPC and player placement to broad/scene ids.
- The third slice must prove runtime consumers use the resulting scope across SceneFrame, `/world`, prompt assembly, and UI if applicable.
- The audit artifact must explicitly separate Phase 75 fixes from Phase 76 follow-up candidates such as live provider readiness, old Phase 63/64 evidence cleanup, and richer ephemeral-scene playtest coverage.


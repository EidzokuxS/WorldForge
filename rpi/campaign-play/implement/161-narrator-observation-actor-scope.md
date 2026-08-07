# Task 161: keep narrated actor names inside observation scope

## Contract

The Campaign Play narrator must keep every actor name or unique name fragment in a beat within the actors permitted by that beat's `observationIndexes`. An unbound visible actor may be oriented only in a separate `observationIndexes: []` beat. The semantic compiler remains authoritative and must reject mismatches.

## Trigger evidence

Fresh pristine r102 reached 20 valid proper-scene actions. Action 21 selected the rendered contact choice `Talk to Kellin Marsh: ask whether Kellin has heard about the seizure runs`, with the API and rendered choice handle/binding matching exactly. The turn completed mechanically, but narration operation `narration-operation:8fce934754ad214ccaa183e3bfdbe26070cd799a3a` failed with `narration_invalid`; no proper scene was produced. Backend logs show beat 0 was bound to observations whose permitted actors were Kellin Marsh and Meshan Ollo, while the model wrote visible actor Pira Senn. Attempt 1 was a provider_unavailable transport recovery; attempt 2 returned native JSON that the semantic compiler correctly rejected at `assertProposalForPacket`.

This is a prompt-only repair within the established narrator seam. It does not change provider/model configuration, schema, state, authority, or compiler invariants. r102 is frozen and its evidence is preserved; no action was retried or replayed.

## Repair and review

`buildPrompt` now adds an operational final-check instruction: compare every actor name or unique fragment in each beat against that beat's union of permitted actors, remove unmatched references, and use a separate empty-index orientation beat when needed.

Humanizer verdict: direct, concrete, and scoped to the observed failure; no unnecessary framing or player-facing copy was introduced.

Deslop verdict: no filler, repetition, or status-label prose in the prompt instruction or task note.

GitNexus impact before edit: `buildPrompt`, exact/LOW; one direct `narrate` process/module impact.

## Acceptance

Run narrator focused tests, backend typecheck/build, `git diff --check`, and GitNexus `detect-changes` before commit. Start a fresh pristine lane on task-owned ports after the repair. Stop at the first genuine defect, or accept only after 60 unique completed bindings plus same-page reload, SQLite integrity, and foreign-key evidence.

# Task 166: Judge dependent-field recovery

## Contract

The Campaign Play Judge base prompt now states three existing dependent-field
invariants in literal field terms:

- deterministic judgments use the same non-no_effect result tier for
  `resultBounds.minimum` and `resultBounds.maximum`;
- uncertain judgments use different non-no_effect minimum and maximum tiers;
- `clarificationQuestion` is a non-empty question only for
  `clarification_required`, and is null otherwise.

When attempt 1 fails the final Judge ruling validation and safe issues exist,
attempt 2 receives one deterministic recovery section containing only ordered
`issueIndex`, Zod `code`, allowlisted schema path, and allowlisted
schema-owned message values. The section asks for a fresh ruling correcting
the listed invariant. It contains no proposal bytes, player prose, hidden
reasoning, names, or unsafe values. There is no feedback for transport,
parse/schema, or non-final failures without safe final issues, no feedback
after attempt 2, and no attempt 3.

Semantic-review verdict: "The prompt is technical, literal, field-named,
non-narrative, and free of filler; it changes instruction clarity only."

## Scope and graph review

The repair uses the existing Judge prompt, final-validation diagnostic, Judge
stage retry seam, and Campaign Play application driver. The transient recovery
carrier is an in-memory `WeakMap` keyed by the existing Judge error; it is not
persisted and does not alter the shared `CampaignPlayJudgeError` class.

GitNexus upstream impact was run before editing the indexed Judge method and
Judge-stage execute seams; both were LOW. The shared
`CampaignPlayJudgeError` class returned CRITICAL because it is used by 175
processes, so it was not edited. The local prompt and driver closures are not
indexed as executable symbols; source review confirmed the one Campaign Play
driver path and its existing one-retry gate. Main authorized this bounded
exception and no other provider, schema, persistence, mechanics, UI, or copy
change.

## Implementation

`judge.ts` keeps the existing final `campaignPlayJudgeRulingSchema.safeParse`
boundary and diagnostic allowlists, while carrying its sanitized issues through
the existing Judge error into the runtime catch. `turn-runtime.ts` forwards
feedback only for attempt 2 and captures it only from a final-validation Judge
failure. `campaign-play-application.ts` carries it across the existing single
automatic external-stage resume with the same turn, worker epoch observation,
deadline, and retry gate. Valid calls and transport/non-final failures do not
create feedback.

## Automated evidence

- Judge prompt/diagnostic/recovery suite: 44/44 passed.
- Focused Judge and runtime recovery/deadline suites: passed.
- Full Campaign Play turn-runtime suite: 70/70 tests passed; Vitest emitted
  one existing worker `onTaskUpdate` timeout after the completed file, so the
  runner exit was non-zero despite no test failure.
- Campaign Play application suite: 13/13 passed.
- Campaign Play turn-repository and database suites: 53/53 passed.
- Campaign Play Narrator and Game Master suites: 77/77 passed.
- Backend typecheck: passed.
- Backend build: passed.
- `git diff --check`: passed (only existing line-ending warnings).
- GitNexus `detect_changes --scope staged --repo WorldForge` reported a
  critical graph fan-out (841 indexed flows) through the shared
  `campaignPlayJudgeVisibleFactSchema`/file-symbol mapping. Source review
  found no non-Campaign-Play import or changed recovery/role path: all staged
  executable edits are confined to the Judge and Campaign Play turn/runtime
  application seams listed above. The shared `CampaignPlayJudgeError` class
  remains unedited.

## Rendered lane

Fresh lane evidence will be appended after commit and push as
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r115`. The lane must use the
canonical low-water template/card setup, one rendered choice and authoritative
readback per action, and stop at the first genuine defect. No frozen lane is
resumed or mutated.

## Acceptance handoff

Entry state is a fresh canonical Brina Campaign Play lane after this exact
repair commit. Positive proof must map to: clarified Judge prompt; one safe
attempt-1 final-validation issue set; attempt-2 same-turn identity and original
deadline; one settlement with no mechanics replay; no attempt 3 or late write;
then proper scene, enabled controls, durable binding, and same-page reload with
clean SQLite integrity and foreign keys if 60 actions are reached.

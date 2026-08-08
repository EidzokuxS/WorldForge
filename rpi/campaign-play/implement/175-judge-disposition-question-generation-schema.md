# Task 175: Judge disposition/question generation schema

## Contract

The Campaign Play Judge keeps its broad proposal schema, compiler, final ruling
validation, Task 166 safe diagnostics, and bounded automatic recovery unchanged.
Only the schema passed to the Judge `safeGenerateObject` request is tightened:
the top-level `disposition` discriminator now requires a bounded non-empty
`clarificationQuestion` for `clarification_required`, and requires an exact
`null` question for `deterministic`, `uncertain`, and `impossible`. No generated
value is normalized, discarded, rewritten, or inferred after parsing.

No product prompt or visible copy changed. No persisted schema, database,
packet, artifact, mechanics, deadline, identity, provider/model/mode/reasoning,
retry, UI, or public/domain schema changed.

## Graph and semantic review

Entry source was `f1daac00bba422b11ce0177995526e5b90f086b6` on `feat/revamp`,
matching `origin/feat/revamp`. The live GitNexus index was at `3eac444` and
reported 14 commits behind the entry source; its nested-symbol results were
therefore source-reviewed. A task-owned shadow clone was indexed at the exact
entry source plus this staged delta. Fresh upstream impact for the edited
`judgeProposalSchemaForFrame` owner was LOW (one direct caller, one
Campaign-play process). The first candidate that changed the
`createCampaignPlayJudge` callsite had HIGH impact (three direct callers), so
that callsite was left byte-for-byte unchanged and the generation union was
contained inside the existing frame-schema builder instead. Fresh staged
detect_changes reported MEDIUM risk, two Judge flows, and no unrelated
production flow. The exported `CampaignPlayJudgeError` impact is CRITICAL,
but its class and constructor were not edited.

The semantic review verdict is: this is a generation-only JSON-visible
disposition/question constraint. Existing prompt prose already states the same
rule and was not changed; the broad compile/final-validation path remains the
authority for all other invariants and Task 166 recovery feedback.
Humanizer/deslop review was not applicable to product prose because this task
does not add or change prompt text, player-visible copy, or narrative prose.

## Implementation

The existing `judgeProposalSchemaForFrame` builder retains its broad local
`frameSchema` and applies a generation-only top-level Zod discriminated union
before returning it to the unchanged Judge callsite. `safeGenerateObject`
therefore receives the union while `compile()` still parses the broad
`judgeProposalSchema`; final `campaignPlayJudgeRulingSchema` validation,
diagnostics, recovery feedback, and attempt limits remain unchanged.

Focused tests capture the actual generation schema, assert all four valid
disposition/question pairs, reject non-null questions for non-clarification,
reject null/empty/omitted questions for clarification, and assert the emitted
JSON Schema has four disposition branches. Existing frame-target, suggested
wait, final-validation, diagnostic, and recovery tests remain covered.

## Validation

Implementation validation before the live lane:

- `npx vitest run src/campaign-play/judge.test.ts --reporter=dot`: 45/45 passed.
- `npx vitest run src/campaign-play/turn-runtime.test.ts --reporter=dot`: 72/72 passed.
- `npx vitest run src/campaign-play/campaign-play-application.test.ts --reporter=dot`: 15/15 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `git diff --cached --check`: passed.
- Fresh shadow staged `detect_changes`: 3 files, 10 symbols, 2 Judge flows,
  MEDIUM risk, no unrelated production flow. The live stale-cache command
  reported LOW with incomplete symbols, so the fresh exact-source shadow result
  is the authoritative graph evidence.
- Local and origin both remained `f1daac00bba422b11ce0177995526e5b90f086b6`.

The implementation, focused tests, and this initial note are ready for the
bounded commit. Generated playtest evidence is not committed.

## r125 rendered evidence

Pending fresh lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r125`.

## Acceptance handoff

Pending final static checks, commit/push identity, rendered journey boundary,
SQLite evidence, and task-owned cleanup.

## Unknowns

The stale GitNexus graph cannot provide nested helper caller coverage until a
safe current-source index is available. No provider response or raw Judge
proposal from frozen r124 is retained; that evidence remains limited to the
safe final-validation issue coordinate.

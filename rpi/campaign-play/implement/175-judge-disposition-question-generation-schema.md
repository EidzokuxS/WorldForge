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

## r125 rendered evidence and boundary

The implementation was committed and pushed as `7527707e325b0e19fdcd879f89fe8f9a5ed1a2d4`
on `feat/revamp`, with local and `origin/feat/revamp` equal before the lane.
The fresh lane was materialized once from
`lowwater-ledger-pristine-93a09e46-20260719` using the required template state,
config, and canonical Brina card hashes. Setup completed the single import,
save, lower-wards / Local / Already here / Looking for work configuration, and
single Begin. The opening reached ready with a proper scene.

Actions 1-6 each settled one proper scene and one unique binding. Their Judge
stages completed normally through the built generation schema; the retained
mode trace records the expected auto -> native_json Narrator requests and no
Judge generation-schema failure. The lane froze at the first genuine defect
on action 7, turn
`turn-player-action:7e94d8bd977d18368cede4483d366e4835ae667f`.

Action 7 mechanics and Game Master settled once, with one applied mutation and
two receipts. Its Narrator operation
`narration-operation:9c0be64c5e0a95978e0b92df07564b4ab70d1290` reused one
immutable packet and reached exactly two attempts:
`narration-attempt:83c51e50ec8000580bbbbb3b88363b802de851bf` and
`narration-attempt:9bf65831b06a4adfa99862ddba21a1f3206aef58`.
Both attempts returned native_json/model success before semantic rejection,
then failed `narration_invalid`; no proper scene, binding, attempt 3, late
write, or mechanics replay followed. The first safe check was
`duplicate_selected_intent_indexes` with index `[5]`. The second safe check
was `narrator_visible_actor_observation_mismatch` at beat 0 /
`beats[0].text`, observation index `[0]`, matched actor `Vedris Kast`, and
allowed actor `Dren Vask`. These are the bounded coordinates retained by the
structured logs; raw rejected proposals and provider bodies were not retained.

Authoritative anchors are the generated
`output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r125.session/r125-terminal.json`,
its `db-current.json`, and the safe diagnostic region of
`backend.stdout.log` (approximately lines 1291-1379). At the boundary the
turn was completed with 7 admitted/completed turns but only 6 proper-scene
bindings, the Narrator operation remained failed with no proper scene, and
SQLite `integrity_check` was `ok` with an empty `foreign_key_check`. The
journey helper initially reported a pre-click count mismatch while action 7
was already settling; read-only reconciliation proved the product defect and
no replacement click was issued.

The lane was frozen immediately, so no same-page reload was attempted. The
task-owned page was closed, the recorded backend/frontend/Chrome roots and
descendants were stopped, ports 4110/4111/4112 and the CDP endpoint were
verified absent, the r125 browser profile was removed, and the temporary
GitNexus shadow clone was removed. The generated ownership registry records
the exact roots, descendants, helpers, page, profile, listeners, and final
absence checks. Generated r125 evidence remains uncommitted.

## Acceptance handoff

The generation-only schema contract is proven by the 45/45 Judge tests and
the built product's six normal Judge settlements. Existing broad compile and
final validation/recovery remain covered by the focused 45/45 Judge, 72/72
turn-runtime, and 15/15 application suites, with typecheck, build, diff check,
and fresh staged graph checks passing. The live acceptance lane is necessarily
`Needs attention`: it stops at action 7's first genuine Narrator semantic
defect after two attempts, before the 60-action and reload criteria. No Task
175 Judge failure occurred in the live lane, and no causal claim is made from
the unrelated Narrator boundary.

## Unknowns

The r125 raw Narrator proposals and provider response bodies are not retained,
so the precise model-side cause of the two safe Narrator mismatches is unknown.
The lane did not reach a same-page reload or the 60-action checkpoints because
the first genuine defect required an immediate freeze. The stale live graph
cannot provide nested helper caller coverage; the task-owned fresh shadow
graph supplied the authoritative LOW impact and MEDIUM staged-flow result.

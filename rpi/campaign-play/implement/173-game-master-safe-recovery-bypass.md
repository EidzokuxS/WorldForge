# Task 173: Game Master safe-recovery model routing

## Contract and fixed decision

Campaign Play Game Master attempt 2 keeps the existing bounded recovery, prompt,
compiler, authority, deadline, identity, persistence, and two-attempt fences. When
the existing safe `gameMasterRecoveryFeedback` is present for attempt 2, the
configured route `languageModel` is used again. Opaque `model_contract_invalid`
recovery without safe feedback keeps the existing `reasoningModel`; transport and
stage-timeout recovery keeps the existing language-model route and `auto`/`tool`
mode selection. Certified and full-authority Game Master paths are covered. Judge,
Narrator, Actor Replanner, mechanics, provider configuration, schemas, UI, and
player-visible copy are unchanged.

The experience contract is a player using the rendered Campaign Play surface. A
repeated-actor-dialogue rejection carries the existing safe coordinates into one
automatic attempt 2, which may settle the same turn exactly once without Judge or
mechanics replay, a third attempt, duplicate binding, or late acceptance.

## Impact and scope

Entry source was `31614ecbe8a60b255fc1b8b708c945e80f592435` on `feat/revamp`, equal
to `origin/feat/revamp`. The GitNexus index was stale (indexed `3eac444`, then
reported ten commits behind current HEAD). Current CLI impact for the indexed
owner `File:backend/src/campaign-play/turn-runtime.ts` was LOW: six impacted
files, three direct imports, no indexed processes or modules. The nested
`modelForExternalAttempt` and `createCampaignPlayTurnRuntime` targets were absent
from the stale index, so the file-level owner is the narrowest authoritative route.
Source review confirms the two edited Game Master call sites are the certified
`admitted` and full-authority `judged` execution paths; no generic selector or
other role is changed. The new local helper has no pre-edit callers.

## Semantic review

No prompt, recovery prose, visible copy, or model instruction changed. Humanizer
and deslop review is therefore not applicable to product prose. The repair is an
internal model-selection distinction only: safe semantic Game Master recovery
reuses the existing configured language model, while all other routes delegate to
the established selector unchanged.

## Exact implementation

`backend/src/campaign-play/turn-runtime.ts` adds the narrowly scoped
`modelForGameMasterAttempt` helper. It returns `model.languageModel` only when
`attempt === 2` and safe Game Master recovery feedback is present; otherwise it
delegates to `modelForExternalAttempt`. Both certified and full-authority Game
Master plans call this helper and still forward feedback only on attempt 2.

`backend/src/campaign-play/turn-runtime.test.ts` asserts that certified and
full-authority repeated-dialogue recovery use `[languageModel, languageModel]`,
while the existing opaque semantic recovery remains `[languageModel,
reasoningModel]` and transport recovery remains `[languageModel, languageModel]`
with `auto` then `tool` modes. Existing identity, deadline, one-resume,
no-replay, no-third-attempt, and settlement assertions remain in force.

## Initial validation

- `npm --prefix backend test -- --run src/campaign-play/turn-runtime.test.ts`:
  72/72 tests passed.
- `npm --prefix backend test -- --run src/campaign-play/campaign-play-application.test.ts src/campaign-play/game-master.test.ts`:
  66/66 tests passed (14 application, 52 Game Master).
- `npm --prefix backend run typecheck`: passed.
- `npm --prefix backend run build`: passed.
- `git diff --check`: passed; only expected line-ending warnings.
- No rendered r123 journey has started yet. No provider call is part of static
  validation.

## Fresh-lane evidence

To be appended after the fresh `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r123`
lane reaches 60 actions plus reload or freezes at its first genuine defect. The
appendix will separate rendered, runtime/log, and read-only SQLite evidence and
will record exact cleanup and note-only commit checks.

## Unknowns

Natural occurrence of repeated-dialogue recovery in r123 is not guaranteed. If it
does not occur, live affected-recovery evidence remains unavailable; focused tests
are the direct branch proof. No provider cause is inferred from prior frozen lanes.

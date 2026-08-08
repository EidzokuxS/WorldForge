# Task 170: Narrator recovery actor-scope recomputation clarification

## Contract

When a player-action Narrator proposal fails observation coverage or
`observationIndexes`, the existing automatic attempt 2 must regenerate from
the same immutable packet and recompute each beat's permitted visible actors
from the final indexes before rewriting beat text. A valid recovery may settle
one proper scene and binding; a second invalid proposal remains terminal under
the existing two-attempt rules.

Protected behavior is unchanged: the base Narrator prompt, packet-validation
and visible-actor guards, safe feedback shape and warning names, provider,
model, structured-output mode, reasoning, deadline, attempt count, recovery
eligibility, operation/packet/deadline identity, mechanics, persistence, UI,
and player-visible copy remain unchanged. No raw proposal, rejected prose,
provider response, or recovery feedback is persisted.

## Impact and semantic review

Entry source was `ca2e6e86d9158a64f8d19cc23dd4eeed802b7b75` on `feat/revamp`,
with origin equal. `AGENTS.md` and `CLAUDE.md` were pre-existing unstaged
changes and were not edited or staged. The current GitNexus index was five
commits behind. Current-source impact was run before editing:

- nested `buildPrompt` and `assertProposalForPacket` were not indexed;
  source-defined `buildPrompt` is the authoritative containing seam;
- indexed `CampaignPlayNarrator.narrate` had LOW upstream impact with one
  direct `narrator.test.ts` caller;
- indexed `createCampaignPlayNarrator.narrate` had LOW upstream impact with no
  upstream callers in the stale graph;
- no HIGH or CRITICAL result applied to the edited prompt seam.

The exact recovery sentence was reviewed by Main with humanizer and deslop.
Verdict: retain the code-owned field/frame literals; the wording is direct,
grammatical, and free of stylistic filler. The approved text is:

> If a failed check requires changing observation coverage or
> observationIndexes, recompute permittedActorNames for every beat from
> OBSERVATION_ACTOR_NAME_FRAME using its final observationIndexes. Then
> rewrite each beat so its text contains no forbidden visible actor name or
> unique name fragment.

## Implementation

`backend/src/campaign-play/narrator.ts` adds only the approved sentence inside
the existing recovery-only `NARRATOR_RECOVERY` block, after its existing
instruction paragraph and before `RECOVERY_DIAGNOSTIC`. Normal attempt 1 is
unchanged byte-for-byte; no runtime, guard, schema, transport, recovery, or
persistence code changed.

`backend/src/campaign-play/narrator.test.ts` updates the exact recovery-prompt
assertions for packet-coverage and visible-actor mismatch feedback, proving
the sentence appears once before the canonical diagnostic and that normal
prompts still omit `NARRATOR_RECOVERY`.

## Automated evidence

Pending until the bounded source/test change is validated:

- focused Narrator and directly affected Campaign Play recovery/terminal
  tests;
- backend typecheck and build;
- `git diff --check` and GitNexus `detect_changes`;
- exact staged-path review and commit/push with local HEAD equal to origin.

## Rendered lane

Pending fresh pristine run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r120`
from `lowwater-ledger-pristine-93a09e46-20260719`, with template state hash
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config
hash `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and
canonical Brina card hash
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60`.

## Acceptance handoff

The prompt-only delta is intended to prove normal prompt omission, exact
recovery clarification for both packet-coverage and actor-mismatch checks,
unchanged two-attempt identity/fencing, and one-settlement behavior through
the fresh rendered lane. A natural recovery is evidence; it must not be
manufactured. If the lane freezes at an unrelated or remaining genuine
defect, preserve the first boundary and report the exact Main decision.

## Unknowns

The rendered r120 result, any natural recovery, checkpoint progression, final
reload, and remaining provider/model behavior are unknown until the fresh
lane runs. Raw proposal/provider bytes remain intentionally unavailable.

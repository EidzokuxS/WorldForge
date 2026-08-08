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

The bounded change was committed as `3cbbbc0578903caadd88a4e4c88a9b8175ec7f8f`,
pushed to `origin/feat/revamp`, and verified equal locally. The focused checks
all passed: Narrator `29/29`, turn-runtime `72/72`, and
campaign-play-application `14/14`; backend typecheck and build passed; and
`git diff --check` passed with only the repository's existing line-ending
warnings. Staged-path review contained only the Narrator source and focused
test for the implementation commit. The stale GitNexus index reported
`No changes detected.` for staged `detect_changes`; the source-qualified LOW
impact results are recorded above and no unexpected flow was observed.

## Rendered lane

Fresh `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r120` was materialized
once from `lowwater-ledger-pristine-93a09e46-20260719` using the required state
SHA-256 `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`,
config SHA-256 `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`,
and canonical Brina card SHA-256
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60`.
The lane used backend/frontend/browser roots `25484/71908/71116` on isolated
ports `4060/4061/4062` and one task-owned page/profile. Setup imported once
(`setInputFiles` once; one parse POST 200 from 20:09:59.960 to 20:10:45.454),
saved once (one PUT 200), selected lower-wards / Local / Already here / Looking
for work, and began once (one opening POST 202). Opening reached a ready proper
scene. Initial player actions used the expected `auto` to `native_json`
Narrator path.

Actions 1-5 and 7-10 each completed with one unique proper-scene binding.
Action 6 naturally exercised recovery: Narrator attempt 1 was
`narration_invalid` and attempt 2 was accepted on the same operation
`narration-operation:584577f888231d473a32cbd7807a6a5c10ef00aa`, packet hash
`5a06db96e1ffc880ebab226f3492f41e6285e3aebfa7c51fbdd109ea00996a7c`, and
shared deadline `1786220200895`. The retained safe diagnostic at
`backend.stdout.log:1081-1097` contained only
`covered_observation_count` (actual 1, expected 2) and
`missing_expected_observation_indexes` ([1]); the operation completed with one
proper scene, one binding, and three receipts. Action 11 likewise had one
invalid then one accepted Narrator attempt on operation
`narration-operation:010fe428150cb6b95b4b7d3b88d9694fe9b537f1`, packet hash
`84e0c923f803b3525e0a0326334894a6f1ce4b58fed4e1c62043d5c406616c9c`, and
shared deadline `1786220411506`, with one scene/binding.

The first genuine defect was action 12, turn
`turn-player-action:1169842674e91283c0b29e462307b93693ce7c81`, operation
`narration-operation:9bcbc2eea663fd1feeda1fd629a0899705f87a5e`, result
`result:014fc244421228180739557a16589116e77a2b8d`, packet hash
`677e2e31d4e18b3d5a493ee334eb62537cdbb3b94f8161314117fb56b54db448`, and
shared deadline `1786220436761`. Both Narrator attempts failed
`narration_invalid` (no attempt 3); the retained warning at
`backend.stdout.log:2097-2127` and `2168-2198` repeated the safe
`visible_actor_observation_mismatch` coordinates (beat 0, `beats[0].text`,
observation index [0], matched Vedris Kast, allowed Dren Vask). No proper scene,
binding, Actor job, late write, or mechanics replay followed. The journey
harness reported a hard-deadline/poll category because no proper scene appeared;
authoritative runtime/SQLite state proves the terminal boundary was the
two-attempt semantic `narration_invalid`, not `stage_timeout` or a provider
transport failure. The lane stopped at 12 completed actions / 11 unique proper
scene bindings, before checkpoint 20 and before reload.

The retained logs contain safe coordinates only; raw rejected proposals, prompt
bytes, provider bodies, and source observation prose were not retained. The
exact approved sentence is statically present once in the recovery-only prompt,
but live prompt bytes are intentionally not claimed as retained evidence.

## Acceptance handoff

Normal prompt omission and the exact recovery-only sentence are proven by the
29/29 Narrator tests. The ready opening and eleven positive action settlements
prove the built surface, native_json mode, proper scenes, enabled controls, and
unique bindings. Natural recovery at actions 6 and 11 proves two-attempt
identity, safe feedback, shared deadline, one settlement, and no mechanics
replay. Action 12 is the preserved first genuine semantic Narrator boundary:
two identical safe visible-actor mismatches, no attempt 3, no proper scene, no
binding, no late write, and concise terminal state. Final read-only SQLite
checks were `integrity_check=ok` and `foreign_key_check=[]`; no reload was
authorized after the freeze.

## Cleanup and remaining unknowns

After evidence capture the r120 page target
`6028FDF6D589C963D8BEE87CFD251703` was closed. Roots `25484/71908/71116`, all
recorded descendants, and listeners on `4060/4061/4062` were independently
verified absent; the task-owned browser profile was removed. Cleanup is
recorded in the session `cleanup-verification.json`. The template and card
artifacts were preserved. Remaining unknowns are limited to the unretained raw
proposal/prompt/provider bytes and whether a future bounded repair will make a
similar visible-actor proposal valid; no causal claim beyond the retained
semantic warnings is made.

## Note-only evidence update

The r120 evidence and this note update are the only post-lane change. A
note-only `git diff --check` and staged GitNexus `detect_changes` were run
before the evidence-note commit; the stale index again reported
`No changes detected.`. Only this Task 170 note is staged for the evidence
commit, with AGENTS.md and CLAUDE.md still untouched and unstaged.

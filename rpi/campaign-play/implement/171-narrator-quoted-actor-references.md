# Task 171: Narrator quoted actor references

## Contract

When an accepted current observation attributes a visible action or speech to
one actor and that accepted observation quotes another visible actor, the
Narrator may preserve the second actor as a dialogue referent without treating
that actor as a participant. A proposal that describes the referenced actor
acting, or names an otherwise ungrounded visible actor, remains
`narration_invalid` under the existing visible-actor guard. The actorless
false-attribution guard, subject binding, place-name collision, alias
uniqueness, warning and recovery coordinates, two-attempt recovery, immutable
operation and packet, deadlines, mechanics, persistence, UI, provider, model,
mode, reasoning, schema, and player-visible copy remain unchanged.

## Entry and impact

Entry source was `9309069c63dbb05147a2c9b566d2fc093a00afc3` on `feat/revamp`,
with `origin/feat/revamp` equal. `AGENTS.md` and `CLAUDE.md` were pre-existing
unstaged changes and were not edited or staged. Frozen r120 remains immutable.

Main's current-source file-level GitNexus impact for
`backend/src/campaign-play/narrator.ts` was MEDIUM: 18 impacted files, eight
direct imports, no affected processes or modules. The index was seven commits
behind. Nested `buildPrompt` and `assertProposalForPacket` targets were absent
from the indexed graph; the indexed Narrator call candidates were LOW. Source
inspection is authoritative for those nested seams. No HIGH or CRITICAL result
applied to this bounded Narrator-only edit.

## Semantic review

Main reviewed the prompt change through humanizer and deslop. Verdict: retain
the code-owned literals; the prose is direct and makes the
participant/reference boundary explicit without stylistic filler. The exact
approved sentences are:

> OBSERVATION_ACTOR_NAME_FRAME separates visible actor names for each
> observation index into permittedActorNames, quotedReferenceActorNames, and
> forbiddenActorNames. permittedActorNames are the performer and bound
> subjects. quotedReferenceActorNames are visible actors named only inside
> accepted straight or curly double-quoted dialogue; they are referents, not
> participants.

> For each beat, union each name list from every frame entry named by its
> observationIndexes. A permittedActorName may be described acting in the
> beat. A quotedReferenceActorName may appear only inside straight or curly
> double-quoted dialogue that preserves a permitted speaker's accepted
> reference. It does not authorize a new claim about that actor, and the beat
> must not describe that actor speaking, moving, arriving, watching, or
> otherwise acting. Do not write a forbiddenActorName or a unique part of it
> anywhere in the beat.

> Before finalizing each beat, check every visible actor name or unique name
> fragment. Outside double-quoted dialogue, every name must belong to
> permittedActorNames. Inside double-quoted dialogue, every other visible
> actor name must belong to quotedReferenceActorNames. Remove any unmatched
> actor reference.

> If a failed check requires changing observation coverage or
> observationIndexes, recompute permittedActorNames, quotedReferenceActorNames,
> and forbiddenActorNames for every beat from OBSERVATION_ACTOR_NAME_FRAME
> using its final observationIndexes. Then rewrite each beat so every actor
> name follows the rules above.

## Implementation

`backend/src/campaign-play/narrator.ts` now derives the three-way
`OBSERVATION_ACTOR_NAME_FRAME` from each accepted `newObservation.text`. The
existing canonical-name, unique-alias, word-boundary, and visible-place
collision rules are reused. A visible actor becomes a
`quotedReferenceActorName` only when every matched canonical-name or unique
alias occurrence is inside a balanced straight or curly double-quoted span;
single quotes and unbalanced quotes provide no authority. The remaining names
are `forbiddenActorNames`.

The existing compiler guard now permits a grounded performer or subject
anywhere, permits a quoted reference only when all beat occurrences remain in
balanced double-quoted dialogue, and keeps every outside occurrence or
unreferenced quoted actor as the same safe
`visible_actor_observation_mismatch`. Warning name, payload, recovery shape,
privacy exclusions, and rejection code are unchanged. No runtime production
file, schema, migration, packet persistence, or retry path changed.

The focused Narrator tests cover the r120-shaped Dren/Vedris frame, accepted
straight and curly references, rejected unbalanced and single-quoted text,
outside-dialogue references, actor depiction outside dialogue, unreferenced
quoted names, actorless footsteps, subject binding, place and surname
collisions, stable safe warning coordinates, sentinel/prose exclusion, normal
prompt omission, and the exact recovery instructions.

## Automated evidence before the rendered lane

The focused checks passed:

- `npm --prefix backend test -- --run src/campaign-play/narrator.test.ts`: 33/33
- `npm --prefix backend test -- --run src/campaign-play/turn-runtime.test.ts`: 72/72
- `npm --prefix backend test -- --run src/campaign-play/campaign-play-application.test.ts`: 14/14
- `npm --prefix backend run typecheck`: passed
- `npm --prefix backend run build`: passed
- `git diff --check`: passed, with only the repository's existing line-ending
  warnings

Before the implementation commit, staged `GitNexus detect_changes` reported
three staged files, one changed symbol (`narrate`), two affected Narrator
execution flows (`Narrate -> PrefersJsonObjectMode` and `Narrate ->
CanonicalJson`), and MEDIUM risk. The exact staged paths were this note,
`backend/src/campaign-play/narrator.ts`, and
`backend/src/campaign-play/narrator.test.ts`; `AGENTS.md` and `CLAUDE.md`
remained unstaged. No unexpected non-Narrator flow was present. The bounded
implementation was committed and pushed as `829d70714ab8fca04531896c7a6296210f31c4ae`,
with local HEAD equal to `origin/feat/revamp`.

## Rendered r121 lane

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r121` used commit
`829d70714ab8fca04531896c7a6296210f31c4ae` and the required campaign. The
template state, template config, and canonical Brina card SHA-256 values were
respectively
`6CB291D11CE6578E3395A10D2C5D590070E3CCDD8B2B67451410869CE97897D2`,
`D8362B1AF976C00CB8F14C564C8196A2D1AB137743FF368EA83D762A4AD2E065`, and
`4B48DE7A32DF6A6BE5A91AB12F09BB87926B40D5940348C7581E298EAA12B60A`.
Materialization and setup were exactly once: one Import-card click and file
dispatch, one Save/Continue request, one lower-wards/Local/Already here/
Looking-for-work configuration, and one Begin request. The opening reached a
proper scene and the first eight rendered actions each produced one committed
proper scene and one unique binding; action 6 used the existing second
Narrator attempt and still settled once. All observed player-action requests
used the accepted built product, and no quoted-reference mismatch/recovery was
naturally exercised.

The first genuine defect was action 9, turn
`turn-player-action:6243bc58ffb172e2f8a41771554eccc1020ccaf8`, after exactly
one rendered choice (`choice_496a7015fca58e64a31affbe`). Game Master attempt 1
was a schema-invalid semantic compilation (`model_contract_invalid`); the
existing automatic attempt 2 then ended at the unchanged 45-second stage
boundary as `stage_timeout` (45,118 ms persisted duration). No accepted Game
Master artifact, Actor job, receipts, Narrator operation, proper scene, or
binding exists for action 9, and no attempt 3 or late write occurred. The
authoritative terminal counts were 9 completed player-action admissions, 8
proper-scene/unique-binding settlements, 33 commands/receipts, 5 actor jobs,
and 8 Narrator operations. SQLite `integrity_check` was `ok` and
`foreign_key_check` was empty. The terminal active turn remained
`interrupted` with `worldVersion` 20 and `runtimeRevision` 189. No reload was
attempted after this hard stop.

The task-owned runtime was isolated on API/UI/CDP ports 4070/4071/4072 with
backend root 53392 (descendants 67720, 75328), frontend root 70112
(descendants 51248, 73936), browser root 11332 (descendants 10132, 13088,
34928, 68404, 73744, 75748), page
`B33DFDE26A690AF88500A04156864264`, and the r121 browser profile. The page was
closed, all recorded roots and descendants were absent, all three listeners
were absent, CDP was closed, and the task-owned profile was removed. The
ownership and cleanup records are preserved under the r121 session directory.

## Acceptance handoff and remaining unknowns

Static evidence maps the participant/reference distinction to the source
derivation, compiler guard, exact prompt frame and tests above: the r120-shaped
frame, accepted straight/curly quoted references, outside-quote and actor
depiction rejection, ungrounded quoted names, actorless footsteps, stable safe
coordinates, privacy exclusions, and unchanged two-attempt runtime fences are
covered. The positive r121 opening and eight-action built journey proves setup,
normal rendering, authoritative readback, one-settlement bindings, and clean
SQLite/FK state. The lane hard-stop independently proves the existing
Game-Master terminal boundary and no duplicate mechanics; it does not provide
live quoted-reference recovery evidence or reload evidence because the first
defect occurred before 60 actions. No retained lane evidence was used to infer
quote placement or a Task 171 recovery outcome for action 9.

Remaining unknowns are limited to a natural built-product quoted-reference
recovery and the 60-action/reload boundary. The next Main decision is whether
to address the frozen r121 Game Master `model_contract_invalid` followed by
`stage_timeout` before starting another endurance lane; no Task 171 source
repair is selected here.

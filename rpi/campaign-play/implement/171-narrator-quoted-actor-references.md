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

`GitNexus detect_changes` and the exact staged-path review remain required
before the implementation commit. The implementation commit and fresh r121
evidence will be appended below.

## Rendered r121 lane

To be appended after the fresh built-product journey. The lane will use the
required pristine template, configuration, canonical card, one browser page
and profile, exactly-once setup, one rendered choice at a time, authoritative
state readback, hard-stop at the first genuine defect, and independent cleanup.

## Acceptance handoff and remaining unknowns

Static evidence maps the participant/reference distinction to the source
derivation, compiler guard, exact prompt frame and tests above. The rendered
lane must still prove the built opening and normal actions, any naturally
occurring recovery, one-to-one bindings, SQLite integrity and foreign keys,
and same-page reload if 60 actions complete. Raw provider responses, raw
proposals, prompt bytes, and quote placement in unretained live candidates
remain unknown by contract.

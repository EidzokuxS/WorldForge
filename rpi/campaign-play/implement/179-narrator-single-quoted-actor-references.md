# Task 179: Narrator single-quoted actor references

## Contract

The Campaign Play Narrator may treat a visible actor name as a quoted reference only when every matched occurrence in an accepted observation and generated beat is inside a completed balanced straight or curly single- or double-quoted dialogue span. The referenced actor remains forbidden to speak, move, arrive, watch, act, or otherwise participate. Straight and curly apostrophes between Unicode letters or numbers are apostrophes, not quote boundaries, so contractions remain inside an outer single-quoted span. Unbalanced, mismatched, or bare apostrophe text grants no reference authority. Existing permitted participants, actorless false-attribution protection, warning coordinates, recovery feedback, schemas, persistence, deadlines, attempts, mechanics, and UI remain unchanged.

## Entry and frozen evidence

Entry source was `e6948160880361303e377437d2f4026a95c19653` on `feat/revamp`, equal to `origin/feat/revamp`. AGENTS.md and CLAUDE.md had pre-existing unstaged edits and were preserved byte-for-byte. Frozen r128 remains immutable. Its action 8 accepted observation used balanced straight single-quoted dialogue and named Dren Vask only as Vedris Kast's addressee; both Narrator attempts nevertheless rejected Dren as a forbidden actor under the prior double-quote-only rule.

## Graph review

A task-owned shadow clone was materialized at the exact entry commit and indexed with GitNexus. The refreshed graph contained 14,775 nodes, 42,414 edges, 797 clusters, and 882 flows at commit `e6948160880361303e377437d2f4026a95c19653`. Upstream impact was LOW for `balancedDoubleQuoteSpans` (11 impacted, 2 direct, one `narrate` process), `occurrenceInsideDoubleQuoteSpan` (11, 2), `buildObservationActorNameFrame` (10, 2), `assertProposalForPacket` (13, 1), `buildPrompt` (1, 1), and `createActorNameMatcher` (11, 2). The renamed dialogue helpers are local replacements with no pre-edit callers. No HIGH or CRITICAL edit target was found; no production flow outside Campaign Play Narrator was authorized.

## Semantic and prose review

Main's semantic verdict: the prompt literals align the instruction with quote formats already emitted in accepted observations and do not broaden participant authority. Humanizer verdict: retain the direct technical contract. Deslop verdict: concise and free of filler. The exact approved literals are:

`OBSERVATION_ACTOR_NAME_FRAME separates visible actor names for each observation index into permittedActorNames, quotedReferenceActorNames, and forbiddenActorNames. permittedActorNames are the performer and bound subjects. quotedReferenceActorNames are visible actors named only inside accepted dialogue enclosed by balanced straight or curly single or double quotes; they are referents, not participants. Apostrophes inside words are not quote boundaries.`

`For each beat, union each name list from every frame entry named by its observationIndexes. A permittedActorName may be described acting in the beat. A quotedReferenceActorName may appear only inside dialogue enclosed by balanced straight or curly single or double quotes that preserves a permitted speaker's accepted reference. It does not authorize a new claim about that actor, and the beat must not describe that actor speaking, moving, arriving, watching, or otherwise acting. Do not write a forbiddenActorName or a unique part of it anywhere in the beat.`

`Before finalizing each beat, check every visible actor name or unique name fragment. Outside balanced quoted dialogue, every name must belong to permittedActorNames. Inside balanced quoted dialogue, every other visible actor name must belong to quotedReferenceActorNames. Remove any unmatched actor reference.`

## Implementation

`backend/src/campaign-play/narrator.ts` now uses one balanced dialogue-span derivation for source observation classification and proposal validation. It recognizes straight and curly double quotes plus straight and curly single quotes. A straight `'` or curly `’` between Unicode letters or numbers, and a curly `‘` in that same word position, is treated as an apostrophe. Only completed spans are returned. The existing actor matcher, permitted/forbidden sets, mismatch warning, `narration_invalid`, safe recovery payload, and all runtime/persistence fences are unchanged.

`backend/src/campaign-play/narrator.test.ts` covers straight and curly single-quoted references with contractions, unbalanced/mismatched/bare apostrophes, references outside dialogue, possessive text outside dialogue, stable mismatch coordinates, and the exact three prompt literals.

## Initial automated evidence

- Narrator focused suite: 35/35 passed.
- Campaign Play turn-runtime suite: 72/72 passed.
- Campaign Play application suite: 15/15 passed.
- Backend typecheck: passed.
- `git diff --check`: passed.
- Backend build, staged detect_changes, implementation commit/push, and the fresh r129 product lane remain pending at this initial note.

## Rendered r129

Pending. The fresh lane must use the canonical pristine template, config, and Brina card hashes from the task packet, one setup sequence, one rendered click per action, authoritative runtime/SQLite reconciliation, and a hard stop at the first genuine defect or 60 completed unique proper-scene bindings plus one same-page reload.

## Unknowns

The retained r128 evidence contains no rejected Narrator proposal bytes, so its exact candidate quote placement is unknown. Live r129 coverage of the single-quoted observation class remains unknown until the canonical journey runs.

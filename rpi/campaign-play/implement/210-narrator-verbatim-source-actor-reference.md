# Task 210: Narrator verbatim source-reference actor authority

## Contract and boundary

The Narrator may now retain a visible actor named in an accepted observation
outside balanced quoted dialogue only as a source reference. The reference is
allowed in a beat only inside an exact verbatim occurrence of the selected
observation text. Paraphrases, extra name occurrences, and invented actions
remain `visible_actor_observation_mismatch` with the existing safe coordinates
and `narration_invalid` behavior. Performer and bound-subject authority,
quoted-reference handling, forbidden names, packet coverage, generation and
provider recovery, deadlines, operation identity, persistence, mechanics, and
player-facing behavior remain unchanged.

Frozen r161 action 18 remains immutable. Its accepted observation text named
Dren outside dialogue while Vedris Kast was the performer, but the old frame
classified Dren as forbidden and both Narrator attempts stopped at the same
safe mismatch. This task repairs that authority conflict without retaining or
reconstructing rejected prose or provider bytes.

## Impact and implementation

The exact-entry GitNexus shadow was built at
`C:\Temp\worldforge-task210-shadow-0444644` because the registered index was
stale. Source-qualified upstream impact for the edited private helpers was:

- `buildObservationActorNameFrame`: LOW, 2 direct callers, 1 `narrate`
  process, 2 modules.
- `buildActorScopeRepairFrame`: LOW, 1 direct caller, 1 process.
- `assertProposalForPacket`: LOW, 1 direct caller, 1 process.
- `buildPrompt`: LOW, 1 direct caller, 1 process.

The enclosing `createCampaignPlayNarrator` mapping is the established HIGH
fan-out (5 direct callers, 4 Campaign Play processes: `drive`, `admitOpening`,
`admitTurn`, and `recoverNarration`, across Campaign Play and Engine). No
additional production owner, exported interface, or cross-module flow was
needed.

`ObservationActorNameFrameEntry` now carries deterministic
`sourceReferenceActorNames`. The frame derives source references from actor
name/usable-alias occurrences outside balanced dialogue; quoted references
remain quote-only, and forbidden names exclude permitted, quoted, and source
categories. The private actor-scope repair frame reports `source_reference`
and adds the approved recovery sentence only when that classification occurs.

Proposal validation computes exact source-text spans from the immutable packet
observations selected by the beat's final `observationIndexes`. Every
canonical-name or usable-alias occurrence for a source reference must fall
inside one of those exact spans; missing spans, paraphrases, extra occurrences,
and invented action remain the existing mismatch. No fuzzy matching, semantic
inference, persistence field, public schema, or diagnostic payload changed.

The approved prompt prose was reviewed by Main through humanizer and deslop:
it is direct, natural, and complete for the exact-source contract. The two
approved literals are preserved unchanged in the code-owned prompt/recovery
seams.

## Static evidence

The focused Narrator suite currently passes 44/44, including the r161-shaped
exact source acceptance, paraphrase/extra/invented-action rejection, canonical
and alias source-frame derivation, multi-observation ordering, privacy checks,
and `source_reference` recovery classification. Typecheck, production build,
directly affected runtime/application suites, staged `detect_changes`, and the
final diff review are recorded below after completion.

## Live r162 evidence

Pending the single fresh built lane
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r162` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66` on ports `4480/4481/4482`. The lane
must use the materializer's exact isolated `GSD_CAMPAIGNS_ROOT`, an external
run-config, and the sole pre-runtime `--live-phase prepare` before any runtime,
HTTP, browser, or database activity. Canonical pre-runtime hashes are state
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and
Brina `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

## Acceptance handoff

- Source-reference classification, exact-span authority, privacy, prompt
  isolation, and unchanged mismatch semantics: focused Narrator tests above.
- Existing performer, subject, quoted-reference, forbidden-name, coverage,
  recovery, deadline, CAS, persistence, mechanics, and no-attempt-3 behavior:
  directly affected existing suites and final static checks pending below.
- Built-product setup, checkpoints 10/20/30/40/50/60, natural source-reference
  recovery, 60 unique proper-scene bindings, same-page reload, and cleanup:
  unavailable until r162 completes or freezes at its first genuine defect.

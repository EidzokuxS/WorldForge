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

The single fresh built lane
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r162` was materialized once
for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`. The materializer returned
the isolated campaigns root
`R:\Projects\WorldForge\output\playtests\campaign-world-runs\pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r162\campaigns`,
which was exported as `GSD_CAMPAIGNS_ROOT`. The external run-config was kept
outside both evidence roots. The sole `--live-phase prepare` ran before any
runtime, HTTP, browser, or database inspection and succeeded, creating the
session root. Pre-runtime hashes matched exactly: state
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and
Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

Setup was one Brina import/file assignment, one Save/Continue, the exact
`lower-wards` / `Local` / `Already here` / `Looking for work` selections, and
one Begin. Opening reached ready with a proper `alderman-hallway` scene. The
first product action was submitted once; a runner decision probe later left a
harness-only pending-decision artifact, so subsequent actions were driven from
the rendered enabled controls with authoritative state readback. Action 1
naturally used the existing packet-coverage recovery and settled once; no
source-reference recovery occurred.

Actions 1 through 11 each settled once with one proper-scene binding. The
checkpoint at 10 had 10 completed/10 bound player actions, worldVersion 22,
runtimeRevision 201, 10 narration operations, 11 Narrator attempts, 37
commands/receipts, `integrity_check=ok`, and an empty foreign-key check.

Action 12 was submitted once and then frozen at the first genuine terminal
boundary. Its turn is
`turn-player-action:5a506ca92ad78ac2816a6b63a2c757b47423a278`; Game Master
stage `091060d2c8a5a093abd7d6f2e5e384b0b744df140641a2e77fd1c1a1ca4af6b1`
attempt 1 reached `stage_timeout` after 45,111 ms and attempt 2 ended
`model_contract_invalid` after 9,100 ms. The turn persisted
`stage=interrupted`, `interrupted_stage=admitted`, `resume_eligible=1`,
`worker_epoch=2`, with no final world version or turn result. The rendered page
showed the existing disabled choices and `Resume`; no Resume or later click was
performed. Counts at the frozen boundary were 13 turns (12 completed,
including Opening), 11 proper scenes/operations, 12 Narrator attempts, 39
commands/receipts, worldVersion 23, runtimeRevision 224,
`integrity_check=ok`, and an empty foreign-key check. The latest receipt and
proper scene still belong to action 11, proving no action-12 downstream
command, receipt, scene, or late write. Task 210's source-reference live
coverage is unavailable because this unrelated Game Master defect occurred
first; r162 is not a 60-action or reload acceptance run.

## Acceptance handoff

- Source-reference classification, exact-span authority, privacy, prompt
  isolation, and unchanged mismatch semantics: focused Narrator suite 44/44.
- Existing performer, subject, quoted-reference, forbidden-name, coverage,
  recovery, deadline, CAS, persistence, mechanics, and no-attempt-3 behavior:
  focused runtime/application suites 92/92; backend typecheck/build and
  `git diff --check` passed. The initial parallel Vitest run had only the known
  post-pass worker-shutdown timeout; the single-thread rerun exited 0.
- GitNexus exact-source reindex completed; staged `detect_changes` reported
  only the three owned paths, 20 private/test/note symbols, zero affected
  processes, and low risk. The exact shadow was removed afterward.
- Built-product setup and Opening: passed once as recorded above. Action
  checkpoints 20/30/40/50/60, natural source-reference recovery, 60 unique
  bindings, same-page reload, and post-reload persistence: unavailable because
  action 12 froze at the first genuine Game Master terminal defect.
- Task-owned r162 runtime/page/profile/helpers were cleaned after evidence;
  generated r162 session/world evidence remains uncommitted. AGENTS.md and
  CLAUDE.md remain pre-existing unstaged dirt.

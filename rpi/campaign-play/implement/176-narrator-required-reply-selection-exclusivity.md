# Task 176: Narrator required-reply selection exclusivity

## Contract

The Campaign Play Narrator generation schema now makes the required contact
reply index a literal first selection and excludes that same index from every
trailing selection. The change is generation-only and provider-visible through
the existing Zod JSON Schema conversion. The existing semantic duplicate guard
and its `duplicate_selected_intent_indexes` diagnostic remain authoritative for
all duplicates, including duplicates among non-required indexes.

When a packet has no required reply, the existing generation schema is returned
unchanged. When the required reply is the only expected action, the schema uses
a one-item tuple and does not construct an empty union. No prompt, recovery
feedback, provider/model/mode/reasoning, retry, deadline, persistence,
mechanics, UI, or player-visible copy behavior changed.

## Entry and frozen evidence

The entry source was `4a413b84550f2056d465b5e8a1ea82a88d9ff8d9` on
`feat/revamp`, matching `origin/feat/revamp`. The only pre-existing working
tree changes are `AGENTS.md` and `CLAUDE.md`; both remain untouched and
unstaged.

Frozen r125 is immutable. Its action 7 required reply index was 5. The first
Narrator candidate was rejected with safe
`duplicate_selected_intent_indexes [5]`; the bounded second attempt was
rejected by the existing visible-actor mismatch guard. No attempt 3, proper
scene, binding, late write, or mechanics replay followed. Raw rejected
proposals and provider bodies were not retained.

## Graph and semantic review

A task-owned shadow clone at the exact entry source was analyzed after copying
the repository GitNexus runner. The fresh graph contained 14,752 nodes,
42,371 edges, 806 clusters, and 882 flows. The nested symbols
`narratorProposalSchemaForPacket`, `requiredReplyIntentIndex`, and
`assertProposalForPacket` were absent from the index and were source-reviewed.
The indexed Narrator `narrate` candidates were LOW impact (one candidate had
one direct caller and one affected process; the other had zero upstream
impact). No edited target returned HIGH or CRITICAL impact.

No prompt or player-visible prose changed, so humanizer/deslop review was not
applicable. The implementation is limited to a private schema helper and the
existing per-packet generation-schema branch.

## Implementation

`trailingIntentIndexSchema` enumerates the packet's available intent indexes,
removes the required index, and emits either one literal or an explicit Zod
union of the remaining literals. `narratorProposalSchemaForPacket` uses that
schema for every trailing tuple position and returns a one-item tuple for the
single-intent boundary. The no-required branch is byte-for-byte unchanged.

Focused Narrator tests capture the provider-facing schema and prove the
r125-shaped `[5, 5, 0, 1]` selection is rejected while `[5, 6, 0, 1]` is
accepted, every trailing JSON-Schema position visibly excludes 5, the
one-intent tuple has no trailing `items`, the no-required branch keeps its
generic bounded index schema, and the existing semantic duplicate guard remains
covered by the surrounding suite.

## Static validation before the lane

- `npx vitest run backend/src/campaign-play/narrator.test.ts`: 35/35 passed.
- `npx vitest run backend/src/campaign-play/turn-runtime.test.ts`: first run
  reported 72/72 assertions passed but a Vitest worker `onTaskUpdate` timeout;
  the clean rerun reported 72/72 passed with no unhandled error.
- `npx vitest run backend/src/campaign-play/campaign-play-application.test.ts`:
  15/15 passed.
- `npm --prefix backend run typecheck`: passed.
- `npm --prefix backend run build`: passed.
- `git diff --check`: passed.

The implementation commit was `8d6a604300d61dad5c4beadbb1b80577c0db7dea`
(`fix(campaign-play): exclude required reply from narrator choices`).
`gitnexus detect_changes --scope staged --repo WorldForge --limit 200`
reported 3 staged files, one stale-index test symbol, zero affected
processes, and LOW risk. The exact staged paths were the Narrator source,
its focused test, and this note. Local `feat/revamp` matched
`origin/feat/revamp` at the lane entry.

## r126 rendered evidence and boundary

The fresh lane was materialized once as
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r126` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`, using task-owned ports 4120/4121/4122
and one task-owned browser page. The template state hash was
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, the
config hash was
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and
the canonical Brina card hash was
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
Setup used exactly one card import, one Save, one Begin, and the required
lower-wards / Local / Already here / Looking for work selections. The setup
request returned 200 and the opening request returned 202; these counts and
hashes are retained in `r126.session/setup.stdout.log`.

The first genuine product defect occurred before player action 1: the
Opening Narrator attempt used requested `auto` and actual `native_json`,
aborted locally at the 90,000 ms window (`latencyMs: 90052`), and left the
opening turn interrupted with `stage_timeout`. The rendered page showed
`The opening stopped before it finished.` and `Resume`, with no proper scene
or enabled action choices. The authoritative state was
`phase=narration_pending`, opening turn
`turn-opening:9c0c8bc1c90aa6b2ddf5b7ae64bc8b6ff3b9f332`, status `interrupted`,
`lastEventSequence=19`, `worldVersion=12`, and `runtimeRevision=21`.
Player-action counts were all zero: zero player turns, narration operations,
narration attempts, receipts, proper scenes, or bindings. Read-only SQLite
`integrity_check` was `ok` and `foreign_key_check` was empty. The retained
backend tail records the 90,052 ms local abort; provider status/body and any
candidate bytes are unknown.

The journey helper stalled after this boundary without submitting a player
action; it was classified as harness cleanup, not a second product action.
No Resume, retry, replay, replacement click, provider call, or later lane was
performed. Rendered body and screenshot are retained in
`r126.session/probes/opening-boundary-body.txt` and
`r126.session/probes/opening-boundary.png`; state, DB, authority, and backend
anchors are `probes/boundary-state.json`, `probes/boundary-db.txt`,
`probes/opening-authority.jsonl`, and `probes/boundary-backend-tail.log`.

Cleanup stopped roots 33876 (backend), 36048 (frontend), 74532 (Chrome),
the journey wrapper/helper 37488/47556, and all recorded descendants. The
task-owned page target was closed, ports 4120/4121/4122 had no listeners, the
CDP endpoint and page were absent, the validated r126 browser profile was
removed, and the task-owned GitNexus shadow clone was removed. Independent
verification is retained in `r126.session/probes/cleanup-verification.json`
and the complete pre-cleanup ownership registry is in
`r126.session/probes/ownership-precleanup.json`.

## Acceptance handoff

The generation-schema contract is covered by the focused Narrator assertions:
the required index is literal in position 0, absent from every trailing
provider-facing JSON-Schema position, the one-intent tuple has no empty union,
and the no-required branch remains unchanged. Existing semantic duplicate
diagnostics and runtime/application recovery contracts remain covered by
35/35 Narrator, 72/72 clean turn-runtime, and 15/15 application assertions,
plus typecheck/build and diff checks. The rendered acceptance boundary is
the Opening Narrator timeout before action 1, with no generated suggestion or
binding; read-only SQLite and cleanup verification are recorded above. The
note update itself is the only post-lane source change and is to be committed
separately; generated r126 evidence remains uncommitted.

## Unknowns

The frozen r125 and r126 rejected proposal/provider bytes are not retained, so
no provider-side cause is inferred. Because r126 stopped during Opening
Narrator, the required-reply schema was not naturally exercised in the live
lane, and no 60-action checkpoint or same-page reload evidence exists. The
opening timeout may be transient or environment-related; this lane does not
distinguish those causes.

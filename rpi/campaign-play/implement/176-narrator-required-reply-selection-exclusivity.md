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

The implementation commit and fresh r126 rendered evidence will be appended
after the lane boundary. Generated playtest evidence remains uncommitted.

## r126 rendered evidence and boundary

Pending the fresh lane.

## Acceptance handoff

The generation-schema contract is covered by the focused Narrator assertions,
with unchanged semantic duplicate diagnostics and runtime/application recovery
contracts covered by 35/35, 72/72, and 15/15 suites. The built-product result,
SQLite evidence, cleanup, and final acceptance status will be recorded after
r126.

## Unknowns

The frozen r125 rejected proposal bytes and provider response bodies are not
retained, so no provider-side cause is inferred. The fresh r126 lane is still
required to establish rendered behavior and any same-page reload evidence.

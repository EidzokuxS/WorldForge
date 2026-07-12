# Task 13: Campaign Play frontend state

Date: 2026-07-12
Route boundary: `/api/campaigns/:id/play/*`
Page boundary: `/campaign/[id]/play`
Status: complete

## Outcome

Task 13 connects the campaign-scoped Campaign Play API to one client controller. Durable state, turn results, narration, consequences, and journal entries come from the server. The browser owns transport status, the current input draft, focus and submission state, and the last accepted event sequence.

## Integration decisions

- The client validates every JSON response and SSE event against the public Campaign Play shape before returning it to React.
- The event stream uses an explicit numeric cursor. Exact repeated events are ignored; a sequence gap or conflicting duplicate causes an authoritative refetch before reconnection.
- A closed stream proves only that the HTTP stream ended. The client reads the exact durable turn and `/state` before it treats the turn as terminal or opens another connection.
- Accepted admission locks input immediately and records the returned turn identity. It clears the submitted draft only after the server returns `202`.
- Transport loss and durable interruption remain separate states. Transport recovery reconnects from the last accepted sequence. Resume is available only when the durable turn says it is eligible.
- Navigation state stores the campaign ID and last accepted sequence. A per-campaign draft remains local presentation state and contains no world fact.
- The new client imports no old game page, chat API, global active-campaign state, or legacy player-flow hook.

## UI boundary

This task renders a restrained semantic shell for loading, campaign eligibility, opening admission, progress, interruption, failure, and freeform admission. It follows the full-screen play frame and semantic order from `docs/UI Concept.html`. Task 14 owns the final scene composition, narration presentation, stage effects, suggestions, consequences, and Journal.

## Verification

- Focused API and page-state verification passes `26/26` tests. It covers exact JSON routes, strict public errors, UTF-8 state size, addressed campaign and turn identity, chunked SSE, duplicate and ordering rules, every server phase, reconnect, interruption, terminal failure, cross-campaign races, external admission, draft remount, and unmount.
- The complete frontend suite passes `66` files and `514/514` tests.
- Frontend typecheck and targeted lint pass. Targeted lint reports zero warnings.
- The production build passes for shared, frontend, and backend packages. Next reports the existing multiple-lockfile workspace-root warning.
- Fresh Sol semantic verification returned `PASS` with `0` P0 and `0` P1 findings after the campaign race, resume cursor, authority reconciliation, fixture, resource identity, and UTF-8 byte-limit corrections.
- Direct source audit found zero imports from `/game`, `/api/chat`, the old game component tree, or the old player draft hook.
- Humanizer and deslop review kept the approved public copy unchanged and found no filler, promotional phrasing, fake contrast, or unsupported claim in this note.
- `git diff --check` and final GitNexus change detection run at the commit boundary.

Standalone smoke-suite additions: `0`.

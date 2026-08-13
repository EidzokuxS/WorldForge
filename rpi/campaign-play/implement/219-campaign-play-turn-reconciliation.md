# Task 219 Campaign Play turn reconciliation

## Outcome contract

- Actor: a player using the rendered Campaign Play surface.
- Trigger: one enabled player action in the canonical Brina Hael journey.
- Observable result: a transient SSE close or authority read failure during the accepted turn does not stop the page; the same durable turn is reconciled and the current proper scene plus enabled control returns within 120,000 ms.
- Protected behavior: one admission per action, durable turn identity, authoritative mechanics and scene projection, existing event cursor and navigation guards, drafts, normal SSE completion, and the explicit Resume route for a durable interrupted turn.
- Forbidden: duplicate submission, automatic Resume, mechanics replay, stale-scene regression, global service-unavailable/Try again during a known accepted turn, prompt/provider/model/schema/UI-copy changes, or acceptance based only on tests.

## Implementation

- `frontend/components/campaign-play/CampaignPlayPage.tsx` keeps command errors separate from continuation transport health. Stream termination and failed authority reads only mark connection progress while the known turn remains followed.
- Authority refreshes carry a campaign-scoped generation and runtime revision. Older or lower-revision snapshots are ignored, so they cannot clear a newer followed turn, reintroduce a transient error, or regress the ready projection.
- Reconciliation chooses the exact followed turn first, also rehydrates a turn named by a pending narration operation, and releases the followed identity only after an interrupted/failed terminal or a matching current-turn narration is authoritative.
- `frontend/components/campaign-play/CampaignPlayPage.test.tsx` adds deterministic transport-loss, out-of-order authority, repeated-stream-failure, and narration-pending reload coverage. No API, backend, prompt, provider/model, schema, or player-visible copy changed.
- Humanizer/deslop review: not applicable; this patch changes no prompt, player-visible copy, or substantive prose.

## Static evidence

- Entry: `623313c75d4827c748b20f4821cf64632b22e8bf` on `feat/revamp`; pre-existing unstaged `AGENTS.md` and `CLAUDE.md` remain untouched and unstaged.
- Current-head exact-entry GitNexus shadow impact was run before editing. `CampaignPlayPage` and `refreshAuthority` are LOW risk inside the Campaign Play frontend path (direct callers are the play route/focused tests and local page reconciliation callbacks); no unrelated process or production owner was reached. The new local readiness helper is private to that same page and was not present in the stale authoritative index.
- Focused page/API tests: 2 files, 42 tests passed. Full frontend suite: 76 files, 506 tests passed.
- `npm --prefix frontend run typecheck`: passed. `npm --prefix frontend run build`: passed.
- `npm --prefix frontend run lint`: the only error remains the known pre-existing `react-hooks/set-state-in-effect` at `frontend/app/(non-game)/campaign/[id]/forge/page.tsx:105`; this patch adds no lint error or warning. The pre-existing forge exhaustive-deps warning remains as well.
- `git diff --check`: pending final diff check. GitNexus `detect_changes`: pending before commit.

## Live evidence

Pending the single fresh r176 lane. Required lane is `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r176`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, provider/model `zai-coding-plan/glm-5-turbo`, task ports `4610/4611/4612`. Frozen r175 evidence remains immutable.

The final update will record the one-time prepare/materializer hashes, rendered setup, actions 1-60 with maximum ready-control latency and checkpoint persistence, any recovered transport events, same-page reload equivalence, cleanup, implementation/evidence commits, and any first genuine stop boundary. Static evidence alone is not product acceptance.

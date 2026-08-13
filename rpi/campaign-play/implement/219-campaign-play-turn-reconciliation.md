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
- `git diff --check`: passed. GitNexus `detect_changes` on the staged implementation/note reported 3 files, 3 stale-index symbols, 0 affected processes, LOW risk; the exact-entry temporary shadow reported 3 files, 8 symbols, 0 affected processes, LOW risk. The stale authoritative index mapped line shifts to `PendingOperation`, `OpeningSelection`, and `CampaignOpeningSetupProps`; no unrelated process was reached.

## Live evidence

The single fresh lane was materialized and prepared once at `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r176.session`, using the isolated materializer campaigns root and an external run-config. The canonical pre-runtime hashes were verified: state `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. The task-owned backend/frontend/browser ran on ports `4610/4611/4612` from implementation commit `4ba2b17eb7c19503432037f77b346df73a6cb3af` with `zai-coding-plan/glm-5-turbo`. Rendered Brina import, Save/Continue, the four setup selections, Begin, and the Opening scene completed once.

The lane stopped at the first genuine rendered boundary on action 1; no later action, reload, Resume, replay, provider/model switch, or repair was attempted. The signed rendered decision was `Talk to Dren Vask: ask about the list of names`, choice handle `choice_9ed72fd8d696519057e9bb4c`, signed at `1786607135031`, and recorded once in `browser-actions.jsonl`. Exactly one POST admission returned `202`, producing durable turn `turn-player-action:d179d7ed2a94a9e63d37d52a160d823130d69b5e` (submitted `1786607135132`, completed `1786607168357`, runtime revision `43`, event sequence `22`). The authoritative state later reached `phase=ready`, `activeTurn=null`, `worldVersion=12`, `runtimeRevision=43`, with the current narration and a complete model-accepted Narrator operation (`narration-operation:b5f6be7f086f77c651ec81a931f65f0614d890b0`, attempt 2 `narration-attempt:9bda85d5fe0de446693cfd021c3d20126d80ec57`, proper scene `narration:75150dc71d326d3c2a0f7d03cd229ae0c2b0c114`). Persistence contained one player-action turn, no duplicate idempotency key, one proper scene for that turn, one Narrator operation with two attempts, three commands and three receipts for that turn; read-only SQLite reported `integrity_check=ok` and an empty `foreign_key_check`.

The rendered page did not apply that authoritative result: after more than 120,000 ms from the signed decision it still showed the prior Opening scene, `Action received`, and `Connection lost. The turn may still be running.`, with all choices/text input disabled. No global `service_unavailable` alert or `Try again` control was visible, but the page was not ready, so the 120-second control contract failed. Actions 2-60, checkpoint captures, same-page reload, and finalize are unavailable by the stop rule. Backend/model persistence was not the failure boundary; rendered reconciliation was.

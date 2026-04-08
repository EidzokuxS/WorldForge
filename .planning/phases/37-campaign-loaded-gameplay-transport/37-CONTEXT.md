# Phase 37: Campaign-Loaded Gameplay Transport - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove active-session coupling from the live gameplay transport layer so gameplay requests are resolved against an explicit campaign identity instead of whatever campaign happens to be active in backend memory.

This phase covers the gameplay transport seam only:
- gameplay history fetch
- action submission
- retry
- undo
- assistant-message edit
- the `/game` page wiring required to call those routes correctly after reload

This phase does **not** promise:
- persistent multi-step undo history
- snapshot/checkpoint fidelity across restart
- a full removal of `activeCampaign` from the entire backend
- checkpoint restore redesign
- a route-tree redesign for all gameplay pages

</domain>

<decisions>
## Implementation Decisions

### Gameplay API Contract
- **D-01:** Keep the existing gameplay endpoint family under `/api/chat/*` for Phase 37. Do not rename the transport surface to `/api/campaigns/:id/chat/*` in this phase.
- **D-02:** Make campaign identity explicit on every Phase 37 gameplay route. `history` should receive `campaignId` as a request parameter, and `action`, `retry`, `undo`, and `edit` should receive `campaignId` in the request body.
- **D-03:** Treat missing `campaignId` as invalid for the targeted first-party gameplay routes instead of silently falling back to the active in-memory campaign.

### Backend Loading Semantics
- **D-04:** Replace `getActiveCampaign()` / `requireActiveCampaign()` as the authoritative resolver for the targeted gameplay routes with `requireLoadedCampaign()` semantics.
- **D-05:** It is acceptable that `loadCampaign(campaignId)` still updates the module-level `activeCampaign` as a side effect. The invariant for this phase is narrower: route correctness must no longer depend on a campaign already being active before the request arrives.
- **D-06:** Convert `lastTurnSnapshot` from one global singleton into campaign-scoped in-memory state keyed by `campaignId`, so retry/undo cannot accidentally bind to the wrong loaded campaign once explicit campaign routing is introduced.

### Frontend Gameplay Entry
- **D-07:** Keep `/game` as the canonical gameplay page in Phase 37. Do not introduce `/campaign/[id]/game` in this phase.
- **D-08:** The `/game` page may still bootstrap by reading the active campaign first and falling back to the remembered campaign ID, but once a campaign is loaded all gameplay API calls must use that explicit `campaignId`.
- **D-09:** Frontend helpers for `history`, `action`, `retry`, `undo`, and `edit` must stop using hidden session assumptions. Their call signatures should require a campaign ID so the page cannot accidentally issue session-coupled gameplay requests.

### Phase Boundary / Non-Goals
- **D-10:** Do not pull checkpoint persistence, rollback fidelity, or post-turn atomicity fixes into Phase 37. Those remain Phase 39 / Phase 41 concerns even though they touch adjacent code.
- **D-11:** Leave the legacy plain-text `POST /api/chat` route out of scope unless touching it is necessary to preserve compile/runtime health. Phase 37 is about the live `/game` transport seam, not the deprecated legacy path.

### Self-Critique
- **D-12:** Keeping `/game` instead of moving to `/campaign/[id]/game` is the lower-risk transport split because it avoids route churn during an integrity milestone, but it deliberately leaves URL-level campaign identity unresolved. If deep-linkable gameplay becomes important, a later phase should revisit route identity explicitly.
- **D-13:** Keeping `loadCampaign()` as a side-effectful setter of `activeCampaign` is not architecturally pure. It is acceptable here because the phase goal is request correctness, not complete singleton removal. A later cleanup can decide whether the singleton should survive at all.
- **D-14:** A campaign-keyed in-memory snapshot map fixes wrong-campaign retry/undo behavior, but it still does not survive restart and still only supports shallow undo history. That limitation is intentional in this phase and should not be misreported as “undo solved.”

### Claude's Discretion
- Exact request shape for `campaignId` on `history` as long as it is explicit and testable.
- Whether targeted campaign routes outside `/api/chat/*` get opportunistic `requireLoadedCampaign()` upgrades if they are low-risk and directly exercised by `/game`.
- Exact internal storage shape for campaign-scoped last-turn snapshots.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone and requirement baseline
- `.planning/ROADMAP.md` — Phase 37 goal, requirement mapping, and success criteria.
- `.planning/REQUIREMENTS.md` — `RINT-01` defines the transport contract this phase must satisfy.
- `.planning/STATE.md` — current milestone position and integrity-first sequencing.

### Reconciliation baseline
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-HANDOFF.md` — Group A item `A2` is the direct source for this phase.
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-RUNTIME-MATRIX.md` — identifies the session-scoped gameplay transport seam as `implemented_but_partial`.
- `.planning/phases/36-gameplay-docs-to-runtime-reconciliation-audit/36-CONTEXT.md` — phase-level audit boundary and prior reconciliation decisions.

### Prior phase decisions that constrain this work
- `.planning/phases/30-start-conditions-canonical-loadouts-and-persona-templates/30-CONTEXT.md` — character/start-condition work already assumes existing route/page seams rather than fresh alternate frontend models.
- `.planning/phases/33-browser-e2e-verification-for-redesigned-creation-flows/33-CONTEXT.md` — browser verification context and canonical route assumptions for the routed creation/review/character flows.
- `.planning/phases/35-restore-npc-tier-visibility-and-manual-tier-control-in-world-review/35-VERIFICATION.md` — confirms the post-review handoff issue is separate from tier persistence and should not be conflated with Phase 37.

### Live transport and loading code
- `backend/src/routes/chat.ts` — current gameplay transport routes still bind to `getActiveCampaign()` and a global `lastTurnSnapshot`.
- `backend/src/routes/helpers.ts` — defines `requireActiveCampaign()` and `requireLoadedCampaign()`; this phase should move gameplay transport to the latter model.
- `backend/src/routes/schemas.ts` — gameplay route request schemas that currently omit `campaignId`.
- `backend/src/campaign/manager.ts` — `loadCampaign()` semantics and `activeCampaign` singleton behavior.
- `backend/src/campaign/checkpoints.ts` — adjacent persistence seam explicitly left out of scope for this phase.
- `frontend/app/game/page.tsx` — current gameplay page bootstraps from active/remembered campaign and issues session-coupled chat requests.
- `frontend/lib/api.ts` — current gameplay helpers omit `campaignId` for chat history, action, retry, undo, and edit.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/routes/helpers.ts`: `requireLoadedCampaign()` already exists and is used by worldgen, character, lore, and persona-template flows.
- `backend/src/campaign/manager.ts`: `loadCampaign(campaignId)` already reloads DB/vector state from disk and returns `CampaignMeta`.
- `frontend/lib/api.ts`: central place to change gameplay helper signatures without scattering fetch logic across components.
- `frontend/app/game/page.tsx`: already has an initialization seam that loads the campaign before first world fetch.

### Established Patterns
- Newer non-game flows use explicit `campaignId` plus `requireLoadedCampaign()` instead of assuming an already-active in-memory session.
- Backend route validation is centralized in `backend/src/routes/schemas.ts`.
- SSE gameplay transport is already concentrated in `/api/chat/action` and `/api/chat/retry`, so the transport contract can be tightened without redesigning the turn processor.

### Integration Points
- `GET /api/chat/history`
- `POST /api/chat/action`
- `POST /api/chat/retry`
- `POST /api/chat/undo`
- `POST /api/chat/edit`
- `/game` page initialization and its retry/undo/edit/action handlers

</code_context>

<specifics>
## Specific Ideas

- The right split for this phase is “make gameplay requests campaign-addressable” rather than “remove every singleton everywhere.”
- The most important hidden coupling is not just `getActiveCampaign()`, but also the fact that the current gameplay API contract does not carry campaign identity at all.
- There is a second-order bug hiding behind that contract: once gameplay requests become campaign-addressable, `lastTurnSnapshot` cannot stay as one process-global value without cross-campaign corruption risk.

</specifics>

<deferred>
## Deferred Ideas

- Move gameplay from `/game` to `/campaign/[id]/game` with URL-authored campaign identity.
- Remove or redesign the legacy plain-text `POST /api/chat` route.
- Persist retry/undo snapshots across restart or expand them into a real history stack.
- Fold checkpoint endpoints and broader gameplay-adjacent routes into the same `requireLoadedCampaign()` migration if Phase 41 proves that worthwhile.

### Reviewed Todos (not folded)
- `Add reusable multi-worldbook library` — matched only on generic `campaign/routes` keywords and is already completed in Phase 26; not relevant to Phase 37 scope.
- `Add lore card editing and deletion` — matched only on generic `routes` keywords and is already completed in Phase 27; not relevant to Phase 37 scope.

</deferred>

---

*Phase: 37-campaign-loaded-gameplay-transport*
*Context gathered: 2026-04-08*

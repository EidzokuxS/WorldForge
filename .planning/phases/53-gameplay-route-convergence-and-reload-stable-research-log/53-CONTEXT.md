# Phase 53: Gameplay Route Convergence & Reload-Stable Research Log - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning
**Source:** v1.1 milestone audit gap-closure context

<domain>
## Phase Boundary

Phase 53 closes the remaining live gameplay-route/runtime gaps that survived Phases 45, 47, and 49:

- the legacy plain-text `POST /api/chat` path still bypasses the authoritative scene-assembly and storyteller-quality seams;
- `/api/chat/lookup` and `/compare` results are visible in-session but do not survive reload/history;
- the gameplay route matrix for action, retry, opening, and lookup needs explicit stream-plus-reload proof once the convergence work lands.

This phase is not a generic UX pass and not a docs-only cleanup phase. It owns the remaining runtime contract gaps around gameplay chat routes and explicit research logging.
</domain>

<decisions>
## Implementation Decisions

### Locked Decisions

- `POST /api/chat` must no longer remain as a live alternate gameplay path that bypasses Phase 45 authoritative scene assembly and Phase 47 storyteller preset/guard logic.
- The product must have one truthful gameplay chat/runtime lane for visible narration behavior; alternate legacy behavior cannot stay live by accident.
- `/lookup` and `/compare` must behave like a real part of the game log, not a session-only transient overlay.
- Lookup persistence must preserve the distinction between factual lookup replies and ordinary narrated turns.
- Phase 53 must explicitly prove route behavior for `action`, `retry`, `opening`, and `lookup` across both streaming and reload/history boundaries.
- The phase must address `SCEN-01`, `WRIT-01`, and `RES-01` directly, not merely add manual UAT notes.

### the agent's Discretion

- Whether the legacy `POST /api/chat` route is removed entirely, hard-failed, or internally converged onto the authoritative path, as long as it can no longer bypass the repaired seams.
- The exact persisted representation for lookup/compare history, as long as reload-stable behavior is achieved without contaminating ordinary scene-turn semantics.
- The exact test split between route tests, engine tests, and frontend reload/history tests.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Audit and milestone truth
- `.planning/v1.1-MILESTONE-AUDIT.md` — source of the Phase 53 gap definition
- `.planning/ROADMAP.md` — Phase 53 goal, requirements, and success criteria
- `.planning/REQUIREMENTS.md` — reopened `SCEN-01`, `WRIT-01`, and `RES-01`
- `.planning/STATE.md` — current milestone state after gap planning

### Phase contracts being protected
- `.planning/phases/45-authoritative-scene-assembly-and-start-of-play-runtime/45-VERIFICATION.md` — authoritative scene-assembly contract
- `.planning/phases/47-storyteller-output-quality-and-anti-slop-prompting/47-VERIFICATION.md` — storyteller quality/preset contract
- `.planning/phases/49-search-grounding-and-in-game-research-semantics/49-VERIFICATION.md` — lookup/research semantics contract

### Runtime seams
- `backend/src/routes/chat.ts` — live chat routes, history, opening, action, retry, and lookup
- `backend/src/engine/turn-processor.ts` — authoritative turn assembly and reasoning/visible narration sequencing
- `backend/src/engine/prompt-assembler.ts` — final narration prompt assembly
- `backend/src/ai/storyteller.ts` — legacy storyteller path currently used by plain-text chat
- `backend/src/engine/grounded-lookup.ts` — dedicated lookup service
- `frontend/app/game/page.tsx` — restore flow, SSE parsing, and log hydration
- `frontend/lib/api.ts` — frontend transport and SSE event parsing

### Existing regression surfaces
- `backend/src/routes/__tests__/chat.test.ts`
- `backend/src/engine/__tests__/turn-processor.test.ts`
- `frontend/app/game/__tests__/page.test.tsx`
</canonical_refs>

<specifics>
## Specific Ideas

- Prefer converging or retiring the legacy route over papering it with docs; the audit identified it as a real implementation risk.
- Treat lookup history persistence as a route-integrity issue, not just a frontend convenience issue.
- Verification should include reloading the log after a lookup/compare interaction and proving the factual entry survives while ordinary scene-turn behavior remains separate.
</specifics>

<deferred>
## Deferred Ideas

- Phase 54 owns draft-backed NPC edit persistence/save-load convergence.
- Phase 55 owns save-character scene-scope verification, opening-scene smoke additions, and stale artifact cleanup.
</deferred>

---

*Phase: 53-gameplay-route-convergence-and-reload-stable-research-log*
*Context gathered: 2026-04-13 via milestone audit gap planning*

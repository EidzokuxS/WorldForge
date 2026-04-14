# Phase 53: Gameplay Route Convergence & Reload-Stable Research Log - Research

**Researched:** 2026-04-13
**Domain:** Gameplay chat route convergence, persisted research log semantics, reload-safe verification
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- `POST /api/chat` must no longer remain as a live alternate gameplay path that bypasses Phase 45 authoritative scene assembly and Phase 47 storyteller preset/guard logic.
- The product must have one truthful gameplay chat/runtime lane for visible narration behavior; alternate legacy behavior cannot stay live by accident.
- `/lookup` and `/compare` must behave like a real part of the game log, not a session-only transient overlay.
- Lookup persistence must preserve the distinction between factual lookup replies and ordinary narrated turns.
- Phase 53 must explicitly prove route behavior for `action`, `retry`, `opening`, and `lookup` across both streaming and reload/history boundaries.
- The phase must address `SCEN-01`, `WRIT-01`, and `RES-01` directly, not merely add manual UAT notes.

### Claude's Discretion

- Whether the legacy `POST /api/chat` route is removed entirely, hard-failed, or internally converged onto the authoritative path, as long as it can no longer bypass the repaired seams.
- The exact persisted representation for lookup/compare history, as long as reload-stable behavior is achieved without contaminating ordinary scene-turn semantics.
- The exact test split between route tests, engine tests, and frontend reload/history tests.

### Deferred Ideas (OUT OF SCOPE)

- Phase 54 owns draft-backed NPC edit persistence/save-load convergence.
- Phase 55 owns save-character scene-scope verification, opening-scene smoke additions, and stale artifact cleanup.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCEN-01 | Player-visible turn text is a single-pass scene assembled from authoritative runtime state, without repeated output blocks or raw-premise opening dumps. | Retire the legacy plain-text `/api/chat` lane so visible gameplay cannot bypass the Phase 45 action/opening seams. |
| WRIT-01 | Storyteller output quality is tuned for playable RP, with research-backed prompting/model settings that materially reduce purple prose and obvious AI smell. | Keep all live gameplay narration on the Phase 47 storyteller preset/guard path; do not allow `callStoryteller()` legacy direct streaming to remain reachable. |
| RES-01 | Search and research flows use explicit retrieval intent in both worldgen and live gameplay, producing focused, useful grounded context instead of vague blended queries. | Persist `/lookup` and `/compare` exchanges on the same reload-safe history lane that `/game` already hydrates from, while preserving factual-vs-narrated distinction. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Stay on the existing stack: Hono backend, Next.js App Router frontend, Vercel AI SDK, SQLite via Drizzle/better-sqlite3, Zod validation.
- Keep the LLM as narrator only; deterministic engine code remains the authority for game state.
- Use structured tool-calling patterns for AI behavior; do not move state mutation into freeform model output.
- Keep TypeScript strict and ES modules.
- Use Drizzle query builder rather than raw SQL.
- Use Zod for route payloads and AI tool schemas.
- Prefer AI SDK primitives such as `streamText`/`generateText` over raw provider fetches.
- Route handlers should keep the existing outer `try/catch` pattern, `parseBody()` validation, and `getErrorStatus(error)` error mapping.
- Shared types/constants should live in `@worldforge/shared`; do not duplicate message or route-contract types locally if a shared helper is warranted.

## Summary

Phase 53 is not a new-stack phase. The repo already has the right technical ingredients; the gap is that the live gameplay contract is split across two incompatible routes. The authoritative gameplay lane today is the campaign-addressed `/api/chat/action`, `/api/chat/opening`, `/api/chat/retry`, `/api/chat/lookup`, and `/api/chat/history` family. The remaining legacy `POST /api/chat` route still calls `callStoryteller()` directly with `worldPremise` plus raw chat history, so it bypasses both Phase 45 scene assembly and Phase 47 storyteller preset/guard logic.

Reload-stable research logging should stay on the existing `chat_history.json` lane, because `/game` already restores exclusively from `GET /api/chat/history`. The missing behavior is simple and local: `/api/chat/lookup` produces `lookup_result` over SSE, but never appends the user lookup command or the assistant factual reply to persisted history. Frontend lookup rendering is currently session-local and string-prefix-based, which means persistence and semantic distinction are the same contract boundary.

Planning should treat verification as a route matrix, not a loose smoke checklist. This phase needs explicit stream-plus-reload proof for `opening`, `action`, `retry`, and `lookup`, plus a retirement proof for the legacy `/api/chat` lane. Human prose judgment still exists for Phase 47 quality, but the bypass closure and reload-stable factual-log behavior are fully automatable.

**Primary recommendation:** Hard-fail or remove legacy `POST /api/chat`, persist lookup exchanges into the existing chat history using one shared lookup-message contract, and close the phase with backend-plus-frontend route-matrix tests for stream and reload behavior.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `hono` | repo `^4.12.3`; latest verified `4.12.12` (published 2026-04-07) | Backend route layer for `/api/chat/*` and SSE streaming | Already owns the gameplay route family; Phase 53 is a route-contract repair, not a framework change. |
| `ai` | repo `^6.0.106`; latest verified `6.0.158` (published 2026-04-10) | Storyteller/model streaming seam | The authoritative gameplay path already runs through AI SDK-based engine/storyteller flows; the fix is to keep all live narration on that lane. |
| `better-sqlite3` | repo `^12.6.2`; latest verified `12.9.0` (published 2026-04-12) | Local campaign authority and restore-safe runtime state | Existing authoritative persistence already depends on the local campaign bundle; Phase 53 should reuse it, not add another research store. |
| `next` | repo `^16.1.6`; latest verified `16.2.3` (published 2026-04-08) | `/game` reload hydration and gameplay log UI | Reload behavior is enforced in the existing Game page; the phase should extend that seam rather than introduce a new client surface. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | repo `^4.3.6`; latest verified `4.3.6` (published 2026-01-22) | Request validation for gameplay routes | Keep route retirement/convergence and lookup bodies on existing schema enforcement. |
| `vitest` | repo `^3.2.4`; latest verified `4.1.4` (published 2026-04-09) | Backend and frontend regression coverage | Use the existing test runner for the route-by-boundary matrix; do not add a second test framework. |
| `@testing-library/react` | repo `^16.3.2`; latest verified `16.3.2` (published 2026-01-19) | Frontend reload/hydration assertions in `/game` | Required for proving persisted lookup entries rehydrate correctly after reload. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hard-failing/removing legacy `POST /api/chat` | Internally converge it onto `/action` | Possible, but the legacy route has the wrong request/response contract: no `campaignId`, no authoritative SSE event model, and no explicit opening/lookup semantics. It is more work and easier to get subtly wrong. |
| Persisting lookup messages on the existing chat-history lane | A second research-log file or frontend-only local storage | A second store would split gameplay truth across reload paths and make `/game` hydration inconsistent by design. |
| Canonical text-prefix contract for factual lookup entries | Widen `ChatMessage` with explicit message metadata | Cleaner long term, but broader blast radius. For this gap-closure phase, shared prefix formatting/parsing is the minimal complete repair unless planning uncovers another consumer that truly needs structured message kind. |

**Installation:**

```bash
# No new packages are required for Phase 53.
# Use the existing workspace stack and test runners.
```

**Version verification:** Verified on 2026-04-13 with:

```bash
npm view hono version time.4.12.12
npm view ai version time.6.0.158
npm view better-sqlite3 version time.12.9.0
npm view zod version time.4.3.6
npm view next version time.16.2.3
npm view react version time.19.2.5
npm view vitest version time.4.1.4
npm view @testing-library/react version time.16.3.2
```

## Architecture Patterns

### Recommended Project Structure

```text
backend/
├── src/routes/chat.ts            # Authoritative gameplay route matrix
├── src/campaign/chat-history.ts  # Persisted gameplay log authority
├── src/engine/grounded-lookup.ts # Factual lookup generation
└── src/ai/storyteller.ts         # Legacy plain-text seam to retire or hard-fail
shared/
└── src/                         # Shared chat/log helper if lookup formatting is centralized
frontend/
├── app/game/page.tsx            # Reload restore + SSE orchestration
├── components/game/narrative-log.tsx
└── lib/gameplay-text.ts         # Lookup-vs-narration rendering rules
```

### Pattern 1: One Truthful Gameplay Lane

**What:** Treat `/api/chat/action`, `/api/chat/opening`, `/api/chat/retry`, `/api/chat/lookup`, and `/api/chat/history` as the only live gameplay contract. Remove or hard-fail the plain-text `POST /api/chat` route rather than teaching it new behavior.

**When to use:** Any player-visible gameplay request that can affect narration quality, scene authority, or reload semantics.

**Example:**

```ts
// Source: [chat.ts](/R:/Projects/WorldForge/backend/src/routes/chat.ts:403),
// [chat.ts](/R:/Projects/WorldForge/backend/src/routes/chat.ts:487),
// [chat.ts](/R:/Projects/WorldForge/backend/src/routes/chat.ts:622)
app.post("/", legacyHandler);        // retire or hard-fail
app.post("/action", authoritative);  // keep as live narrated turn lane
app.post("/lookup", factualLookup);  // keep as live factual lane
```

### Pattern 2: Persist Lookup on the Same History Lane

**What:** Persist explicit lookup/compare exchanges into `chat_history.json` using the same append/read path as ordinary messages, but preserve factual distinction through one canonical assistant-message contract.

**When to use:** `/lookup` and `/compare`, and any reload path that expects those results to survive page refresh.

**Example:**

```ts
// Source basis: [chat-history.ts](/R:/Projects/WorldForge/backend/src/campaign/chat-history.ts:28),
// [chat.ts](/R:/Projects/WorldForge/backend/src/routes/chat.ts:622),
// [page.tsx](/R:/Projects/WorldForge/frontend/app/game/page.tsx:210)
appendChatMessages(campaignId, [
  { role: "user", content: commandText },
  { role: "assistant", content: formatLookupLogEntry(result.lookupKind, result.answer) },
]);
```

### Pattern 3: Reload Hydration Stays Dumb

**What:** Keep `/game` reload logic simple: it should restore whatever `GET /api/chat/history` returns and classify rendering from the persisted message contract, not reconstruct missing lookup state from session memory.

**When to use:** Initial page load, remembered-campaign bootstrap, and any future reload or restore flow.

**Example:**

```ts
// Source: [page.tsx](/R:/Projects/WorldForge/frontend/app/game/page.tsx:300)
const history = await chatHistory(campaignId);
const safeMessages = history.messages.filter(isChatMessage);
setMessages(safeMessages.map((message) => ({ ...message, debugReasoning: null })));
```

### Anti-Patterns to Avoid

- **Legacy route "compatibility magic":** Do not keep `POST /api/chat` live and merely document it as legacy; if it still calls `callStoryteller()`, it is still a production bypass.
- **Frontend-only lookup persistence:** Do not stash lookup answers only in component state or local storage; reload truth already lives on `/api/chat/history`.
- **Duplicated lookup formatting rules:** Do not let backend persistence and frontend rendering invent separate `[Lookup: ...]` conventions.
- **New sidecar research store:** Do not create a second gameplay-log file just for lookups; Phase 53 is about convergence, not a parallel log system.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reload-stable research history | A second "research log" file, local storage cache, or overlay-only UI store | Existing `chat_history.json` via `appendChatMessages()` and `GET /api/chat/history` | `/game` already trusts this lane on reload; a second store would split truth. |
| Legacy route convergence | A translator that tries to make plain-text `POST /api/chat` imitate `/action` | Hard-fail/remove the route, or at most redirect internally after explicit contract normalization | The legacy input lacks `campaignId` and the output lacks authoritative SSE semantics. |
| Lookup semantics on reload | Ad hoc heuristics in `page.tsx` to guess whether an assistant message is factual | One shared lookup-message formatter/parser contract | The distinction must survive persistence and future readers, not just one component instance. |
| Verification coverage | One manual smoke pass with loose notes | Explicit route-by-boundary matrix in backend and frontend tests | The audit gap came from treating one good path as proof for all paths. |

**Key insight:** The cheapest correct solution is convergence onto the existing history lane plus route retirement, not invention of new storage or compatibility layers.

## Common Pitfalls

### Pitfall 1: Route Retirement in Name Only
**What goes wrong:** `POST /api/chat` remains callable and continues to stream narration through `callStoryteller()`.
**Why it happens:** The route already works mechanically, so it is tempting to leave it "for compatibility."
**How to avoid:** Add an explicit backend test that the legacy route no longer provides live gameplay narration, and search for all callers before deciding between removal and hard-fail.
**Warning signs:** `backend/src/routes/__tests__/chat.test.ts` still has a happy-path `"streams storyteller response"` case and no retirement assertion.

### Pitfall 2: Persisted Lookup Contract Drift
**What goes wrong:** Live lookup renders correctly, but reloaded lookup messages render as ordinary narration or raw text.
**Why it happens:** Backend persistence and frontend rendering use separate string conventions.
**How to avoid:** Move lookup log formatting/parsing into one shared helper or, at minimum, one canonical utility pair used by both sides.
**Warning signs:** `formatLookupAssistantMessage()` and `deriveGameMessageKind()` encode the contract separately in different files.

### Pitfall 3: Reload Proof Without Stream Proof
**What goes wrong:** Reloaded history looks right, but the live SSE path regresses by emitting narration/oracle events for lookup, or vice versa.
**Why it happens:** Tests cover only one boundary at a time.
**How to avoid:** For each route, prove both the stream contract and the reload contract.
**Warning signs:** A test asserts `lookup_result` exists but never checks `GET /history`, or a page test seeds history but never drives the route.

### Pitfall 4: Accidental Snapshot/Retry Coupling
**What goes wrong:** Lookup persistence accidentally changes retry/undo readiness or turns factual log entries into rollback-critical turns.
**Why it happens:** Lookup messages are appended without preserving the "not a turn" distinction.
**How to avoid:** Keep lookup outside `processTurn()`, keep `hasLiveTurnSnapshot` behavior unchanged after lookup, and add a regression for it.
**Warning signs:** Retry controls appear after a lookup-only interaction, or `lookup` starts emitting turn-only events like `oracle_result` or `quick_actions`.

## Code Examples

Verified patterns from current project seams:

### Shared Lookup Message Contract

```ts
// Source basis:
// [page.tsx](/R:/Projects/WorldForge/frontend/app/game/page.tsx:210)
// [gameplay-text.ts](/R:/Projects/WorldForge/frontend/lib/gameplay-text.ts:28)
export function formatLookupLogEntry(kind: LookupKind, answer: string): string {
  return `[Lookup: ${kind}] ${answer}`;
}

export function isLookupLogEntry(content: string): boolean {
  return /^\[Lookup:\s*[^\]]+\]\s+/i.test(content);
}
```

### Persist Lookup Through Existing History Authority

```ts
// Source basis:
// [chat.ts](/R:/Projects/WorldForge/backend/src/routes/chat.ts:622)
// [chat-history.ts](/R:/Projects/WorldForge/backend/src/campaign/chat-history.ts:28)
const lookup = await runGroundedLookup(request);
appendChatMessages(campaignId, [
  { role: "user", content: commandText },
  { role: "assistant", content: formatLookupLogEntry(lookup.lookupKind, lookup.answer) },
]);
```

### Keep Reload Hydration on `/history`

```ts
// Source: [page.tsx](/R:/Projects/WorldForge/frontend/app/game/page.tsx:300)
const [history, world] = await Promise.all([
  chatHistory(campaignId),
  getWorldData(campaignId),
]);

setMessages(history.messages.filter(isChatMessage).map((message) => ({
  ...message,
  debugReasoning: null,
})));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Plain-text `POST /api/chat` direct `callStoryteller()` streaming | Campaign-addressed `/api/chat/action` plus `/opening` and `/retry` SSE route family | Phases 37, 45, 47; bypass gap confirmed 2026-04-13 | Live gameplay quality/truth now depends on staying on the authoritative route family. |
| Session-only lookup rendering in `/game` | Persisted lookup exchanges on the same history lane as other chat messages | Needed for Phase 53 | Reload and history views become truthful instead of transient. |
| Implicit phase closeout by happy-path route tests | Route-by-route, boundary-by-boundary proof | Audit reopened gaps on 2026-04-13 | Phase 53 planning must include the full route matrix, not only one successful path. |

**Deprecated/outdated:**

- `POST /api/chat` as a live gameplay endpoint: outdated for Phase 53 because it bypasses Phase 45/47 seams and is no longer used by the frontend.
- Session-only lookup overlay semantics: outdated because Phase 53 requires lookup/compare to behave like a real part of the game log.

## Open Questions

1. **Should legacy `POST /api/chat` be removed or hard-failed?**
   - What we know: No current frontend helper calls `/api/chat`; all gameplay helpers target `/action`, `/lookup`, `/opening`, `/retry`, `/undo`, and `/edit`.
   - What's unclear: Whether any non-frontend dev scripts or manual tooling still rely on the legacy route.
   - Recommendation: Search callers first; if none exist, return `410 Gone` or remove the route. Prefer hard-fail over hidden internal convergence.

2. **Is prefix-based lookup persistence enough, or should `ChatMessage` gain metadata?**
   - What we know: The current persisted message model is only `{ role, content }`, and the frontend already classifies lookup vs narration from content prefix.
   - What's unclear: Whether other consumers beyond `/game` will soon need structured message-kind semantics.
   - Recommendation: For Phase 53, centralize the prefix contract in shared code. Widen `ChatMessage` only if planning finds a second consumer that genuinely needs typed message metadata now.

3. **Should lookup append both user and assistant messages, or only the assistant reply?**
   - What we know: In-session behavior currently shows both the slash command and the reply.
   - What's unclear: Whether product wants lookup commands preserved verbatim in long histories.
   - Recommendation: Persist both. It matches current visible behavior, keeps causality obvious on reload, and avoids a special hidden-input rule just for research.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend/frontend tests and TypeScript runtime scripts | ✓ | `v23.11.0` | — |
| npm | `npm --prefix ...` test execution and version verification | ✓ | `11.12.1` | — |

**Missing dependencies with no fallback:**

- None found.

**Missing dependencies with fallback:**

- None found.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (`backend` repo `^3.2.4`, `frontend` repo `^3.2.4`) |
| Config file | [backend/vitest.config.ts](/R:/Projects/WorldForge/backend/vitest.config.ts:1), [frontend/vitest.config.ts](/R:/Projects/WorldForge/frontend/vitest.config.ts:1) |
| Quick run command | `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts && npm --prefix frontend exec vitest run app/game/__tests__/page.test.tsx` |
| Full suite command | `npm --prefix shared exec vitest run src/__tests__/chat.test.ts && npm --prefix backend exec vitest run src/campaign/__tests__/chat-history.test.ts src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts && npm --prefix frontend exec vitest run app/game/__tests__/page.test.tsx components/game/__tests__/narrative-log.test.tsx lib/__tests__/api.test.ts` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCEN-01 | No live gameplay route can bypass the authoritative scene/opening lane; legacy `/chat` is retired or hard-failed. | backend route | `npm --prefix backend exec vitest run src/routes/__tests__/chat.test.ts` | ✅ |
| WRIT-01 | Live gameplay narration remains on the Phase 47 storyteller seam for both opening and action paths. | backend route + engine regression | `npm --prefix backend exec vitest run src/routes/__tests__/chat.test.ts src/engine/__tests__/turn-processor.test.ts` | ✅ |
| RES-01 | `/lookup` and `/compare` persist to history and rehydrate on reload as factual log entries, without entering normal turn semantics. | backend route + frontend reload integration | `npm --prefix backend exec vitest run src/routes/__tests__/chat.test.ts && npm --prefix frontend exec vitest run app/game/__tests__/page.test.tsx` | ✅ |

### Sampling Rate

- **Per task commit:** `npm --prefix backend exec vitest run src/routes/__tests__/chat.test.ts && npm --prefix frontend exec vitest run app/game/__tests__/page.test.tsx`
- **Per wave merge:** `npm --prefix backend exec vitest run src/routes/__tests__/chat.test.ts src/engine/__tests__/turn-processor.test.ts src/campaign/__tests__/chat-history.test.ts && npm --prefix frontend exec vitest run app/game/__tests__/page.test.tsx components/game/__tests__/narrative-log.test.tsx lib/__tests__/api.test.ts`
- **Phase gate:** Phase-focused backend + frontend suite green, with explicit assertions for legacy-route retirement and lookup reload persistence before `/gsd:verify-work`

### Wave 0 Gaps

These proof gaps are now fully owned by the Phase 53 planning package and task-local automated suites:

- [x] `backend/src/routes/__tests__/chat.test.ts` — explicit retirement/convergence proof for legacy `POST /chat`
- [x] `backend/src/routes/__tests__/chat.test.ts` — lookup persistence test that `GET /chat/history?campaignId=...` returns the lookup exchange after `/chat/lookup`
- [x] `backend/src/routes/__tests__/chat.test.ts` — regression proving lookup does not create or unlock `hasLiveTurnSnapshot`
- [x] `frontend/app/game/__tests__/page.test.tsx` — reload/hydration test seeded from persisted lookup history, not only in-session SSE rendering
- [x] `shared/src` helper test or equivalent indirect coverage — centralized lookup formatting/parsing consumed by backend and frontend

## Sources

### Primary (HIGH confidence)

- [53-CONTEXT.md](/R:/Projects/WorldForge/.planning/phases/53-gameplay-route-convergence-and-reload-stable-research-log/53-CONTEXT.md:1) - locked scope, route-matrix requirements, and canonical refs
- [ROADMAP.md](/R:/Projects/WorldForge/.planning/ROADMAP.md:263) - Phase 53 goal, dependencies, and success criteria
- [REQUIREMENTS.md](/R:/Projects/WorldForge/.planning/REQUIREMENTS.md:33) - exact `SCEN-01`, `WRIT-01`, and `RES-01` requirement text
- [v1.1-MILESTONE-AUDIT.md](/R:/Projects/WorldForge/.planning/v1.1-MILESTONE-AUDIT.md:42) - confirmed gap definitions for legacy `/api/chat` and non-persisted lookup/history
- [CLAUDE.md](/R:/Projects/WorldForge/CLAUDE.md:1) - project-specific implementation constraints
- [backend/src/routes/chat.ts](/R:/Projects/WorldForge/backend/src/routes/chat.ts:403) - live legacy route, authoritative action/opening/lookup/history/retry seams
- [backend/src/campaign/chat-history.ts](/R:/Projects/WorldForge/backend/src/campaign/chat-history.ts:11) - persisted history authority
- [backend/src/ai/storyteller.ts](/R:/Projects/WorldForge/backend/src/ai/storyteller.ts:18) - direct legacy bypass path through `callStoryteller()`
- [shared/src/types.ts](/R:/Projects/WorldForge/shared/src/types.ts:140) - current persisted `ChatMessage` shape
- [frontend/app/game/page.tsx](/R:/Projects/WorldForge/frontend/app/game/page.tsx:157) - lookup command parsing, in-session append behavior, reload hydration
- [frontend/lib/api.ts](/R:/Projects/WorldForge/frontend/lib/api.ts:95) - `/api/chat/history`, `/lookup`, and SSE event contract
- [frontend/lib/gameplay-text.ts](/R:/Projects/WorldForge/frontend/lib/gameplay-text.ts:28) - current lookup-vs-narration classification rule
- [frontend/components/game/narrative-log.tsx](/R:/Projects/WorldForge/frontend/components/game/narrative-log.tsx:100) - support-block rendering for lookup/compare entries
- [backend/src/routes/__tests__/chat.test.ts](/R:/Projects/WorldForge/backend/src/routes/__tests__/chat.test.ts:408) - existing route coverage and missing legacy-retirement coverage
- [frontend/app/game/__tests__/page.test.tsx](/R:/Projects/WorldForge/frontend/app/game/__tests__/page.test.tsx:707) - existing in-session lookup coverage and missing reload persistence coverage
- [45-VERIFICATION.md](/R:/Projects/WorldForge/.planning/phases/45-authoritative-scene-assembly-and-start-of-play-runtime/45-VERIFICATION.md:17) - authoritative scene assembly contract
- [47-VERIFICATION.md](/R:/Projects/WorldForge/.planning/phases/47-storyteller-output-quality-and-anti-slop-prompting/47-VERIFICATION.md:27) - storyteller quality seam and remaining human judgment scope
- [49-VERIFICATION.md](/R:/Projects/WorldForge/.planning/phases/49-search-grounding-and-in-game-research-semantics/49-VERIFICATION.md:34) - live lookup/compare contract established before the reload gap was found

### Secondary (MEDIUM confidence)

- `npm view` registry verification on 2026-04-13 for `hono`, `ai`, `better-sqlite3`, `zod`, `next`, `react`, `vitest`, and `@testing-library/react` - current package versions and publish dates used for stack currency

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - verified from live repo package manifests plus current npm registry queries
- Architecture: HIGH - based on direct source inspection of backend routes, shared message types, frontend reload flow, and phase verification artifacts
- Pitfalls: HIGH - each pitfall is grounded in the current audit findings or explicit code/test gaps

**Research date:** 2026-04-13
**Valid until:** 2026-04-27

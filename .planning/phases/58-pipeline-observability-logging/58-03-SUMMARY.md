---
phase: 58-pipeline-observability-logging
plan: 03
subsystem: observability
tags: [als, turn-context, route-instrumentation, sse-hash, stream-aggregator, prompt-dump, fail-loud, hono-test-harness]

# Dependency graph
requires:
  - phase: 58
    plan: 01
    provides: runWithTurnContext, getTurnContext, getObservabilityConfigSnapshot, rootPino, resetLoggerForTest
  - phase: 58
    plan: 02
    provides: 14 engine/vector/ai seams already emitting structured events; roles wired via withRole at every emission site
provides:
  - Route-level ALS wrap at /action, /retry, /opening so all downstream logs auto-carry turnId/campaignId/tick
  - turn.begin at handler entry, turn.end in finally block (outcome + durationMs)
  - sse.emit for non-delta SSE payloads (type + byteLength + sha256Prefix — no dataPreview on hot path)
  - sse.stream.aggregate for text-delta / delta / reasoning-delta streams (one record per stream end)
  - rootPino.flush() in finally — crash safety before SSE closes
  - Detached post-turn IIFEs re-enter ALS frame via getTurnContext() snapshot
  - backend/src/lib/sse-hash.ts — sha256Prefix, isDeltaType, StreamAggregator, getOrCreateAggregator, finalizeAggregators
  - backend/src/lib/prompt-dump.ts — writePromptSideCarIfEnabled (snapshot-cache read, fail-loud on write failure, NOT on lib/index.ts barrel)
  - Hono `app.request`-based route test harness for real-route correlation assertions
affects: [58-04, every observability-dependent future plan]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern: route-level ALS wrap — wrap streamSSE body in runWithTurnContext({turnId, campaignId, tick}) so every log record emitted by processTurn / prompt-assembler / tool-executor automatically carries turn correlation"
    - "Pattern: detached IIFE context re-entry — capture getTurnContext() synchronously, then runWithTurnContext(capturedCtx, asyncBody) so background embedder/image writes still emit under the same turnId"
    - "Pattern: hash-only SSE emission — for non-delta payloads log { type, byteLength, sha256Prefix } instead of copying data; delta streams aggregated via per-(turnId,type) StreamAggregator, one summary record at turn end"
    - "Pattern: fail-loud side-car — feature-enabled + write-failed → log.error + throw (NO silent no-op per CLAUDE.md)"
    - "Pattern: direct import off barrel for cycle prevention — prompt-dump.ts imported from ../lib/prompt-dump.js directly; not re-exported on lib/index.ts"
    - "Pattern: Hono app.request for route-level tests — assemble a minimal `new Hono().route('/api/chat', chatRoutes)` per test file, exercise via app.request; no processTurn direct calls"

key-files:
  created:
    - backend/src/lib/sse-hash.ts
    - backend/src/lib/prompt-dump.ts
    - backend/src/lib/__tests__/prompt-dump.test.ts
    - backend/src/routes/__tests__/chat-turn-context.test.ts
  modified:
    - backend/src/routes/chat.ts (imports + writeTurnEventSSE rewrite + /action /retry /opening ALS wraps + detached IIFE ctx re-entry in queueAuxiliaryPostTurnWork + reactive auto_checkpoint IIFE)
    - backend/src/engine/prompt-assembler.ts (direct import of writePromptSideCarIfEnabled + 2 call sites after existing prompt.assembled log.events)
    - backend/src/routes/__tests__/chat.test.ts (auto-fix: added readCampaignConfig stub + lib/index.js mock extended with runWithTurnContext/getTurnContext/withRole + logger-setup.js + sse-hash.js mocks)
    - backend/src/routes/__tests__/chat.inventory-authority.test.ts (same auto-fix pattern)

key-decisions:
  - "sse.emit hot-path: replaced dataPreview with { type, byteLength, sha256Prefix } per Codex review — a 16-char sha256 prefix lets operators correlate a JSONL line with captured SSE traffic without duplicating prose in the log file"
  - "Delta aggregation: text-delta/delta/reasoning-delta NEVER emit per-chunk; one sse.stream.aggregate record per (turnId, type) at turn end (before turn.end)"
  - "rootPino.flush() in finally: per Gemini suggestion, drain async transports before the streamSSE generator exits so a post-turn crash still leaves a complete JSONL record including turn.end"
  - "Detached ctx re-entry: queueAuxiliaryPostTurnWork and reactive auto_checkpoint capture turn context BEFORE launching their void IIFEs; inside the IIFE, runWithTurnContext({...capturedCtx, role: undefined}, body) so embedder.call / image generation / checkpoint writes still carry turnId"
  - "Side-car fail-loud: NO silent no-op when dumpFullPrompts=true and writeFileSync throws — log.error({event:'prompt.dump.failed', path, error}) followed by throw. Matches CLAUDE.md NO FALLBACKS rule"
  - "Cycle prevention: prompt-dump.ts imported directly from ../lib/prompt-dump.js; not on lib/index.ts barrel. Settings manager's configureObservability already uses the same pattern (direct import from logger-setup.js)"
  - "Route-level test via Hono app.request — the plan explicitly forbids calling processTurn directly in tests. Test mocks processTurn as a vi.mocked generator but exercises /api/chat/action end-to-end so turn.begin/turn.end/sse.emit fire through the real finally block"
  - "Concurrent-turn test: Promise.all two /action requests to different campaigns, assert distinct log files, assert neither file contains the other's turnId or campaignId (cross-contamination guard)"

patterns-established:
  - "Pattern: ALS wrap at streamSSE generator boundary — turn.begin / try { ... } finally { finalizeAggregators + turn.end + rootPino.flush } is the canonical SSE-route skeleton in this codebase"
  - "Pattern: auto-fix test mocks when source imports change — when chat.ts gained imports from ../lib/index.js, ../lib/logger-setup.js, ../lib/sse-hash.js, every test file that stubs those modules required matching pass-through fakes (runWithTurnContext/getTurnContext/withRole fallthrough, rootPino.child/flush stubs, sha256Prefix/isDeltaType/finalizeAggregators stubs)"

requirements-completed: [REQ-OBSERV-01]

# Metrics
duration: ~20min
completed: 2026-04-17
---

# Phase 58 Plan 03: Route-Level ALS Wrap + Route Seams + SSE Hash/Aggregate + Side-Car Prompt Dump Summary

**Wired AsyncLocalStorage turn context at the route boundary (/action, /retry, /opening) so every log record emitted during a turn auto-carries `turnId` / `campaignId` / `tick`. Instrumented the 4 route-owned seams Plan 58-02 deferred (`turn.begin`, `turn.end`, `sse.emit` non-delta, `sse.stream.aggregate` delta). Replaced the planned-but-risky `dataPreview` full-payload logging with `{type, byteLength, sha256Prefix}` per Codex review, and added per-(turnId, type) `StreamAggregator` so long storyteller streams produce ONE `sse.stream.aggregate` record instead of N-per-token flood. Added `rootPino.flush()` in the finally block per Gemini suggestion for crash safety. Detached post-turn IIFEs (auxiliary image/embedder work, reactive auto-checkpoint) re-enter the captured turn context so their log records stay correlated. Shipped `writePromptSideCarIfEnabled` — snapshot-cache read (no `loadSettings` on hot path), fail-loud on enabled-and-failed write (log.error + throw, per CLAUDE.md NO FALLBACKS), NOT re-exported from `lib/index.ts` barrel (cycle prevention). Wired into `prompt-assembler.ts` via DIRECT `../lib/prompt-dump.js` import at the two existing `log.event('prompt.assembled', ...)` emission points.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-04-17
- **Tasks:** 2 of 2 (Task 1 route wrap + SSE instrumentation + route test, Task 2 prompt-dump + wiring + unit tests)
- **Files created:** 4 (2 source, 2 test)
- **Files modified:** 4 (1 route, 1 engine, 2 test-mock hygiene)
- **New tests:** 7 (2 route-level + 5 prompt-dump)

## Accomplishments

1. **Route-level ALS wrap** at all 3 streaming routes (`/action`, `/retry`, `/opening`) — `runWithTurnContext({turnId: randomUUID(), campaignId, tick: readCampaignConfig(id).currentTick ?? 0}, async () => { ... })`. Every engine/vector/ai log record that Plan 58-02 already emits now inherits turnId automatically.
2. **4 route-owned seams instrumented**:
   - `turn.begin` — first structured event; includes `{route, campaignId, tick, playerAction?, intent?, method?, judgeProvider?: {id, model, baseUrl}, storytellerProvider: {id, model, baseUrl}}`. Never includes `apiKey`.
   - `turn.end` — last structured event; includes `{route, tick, durationMs, outcome}`. `outcome` is `"success" | "error" | "restored"` (the `/action` and `/retry` routes mark `restored` when snapshot rollback succeeded, `error` when even the rollback failed).
   - `sse.emit` — non-delta SSE payloads; emits `{type, byteLength, sha256Prefix}`. NO `dataPreview`.
   - `sse.stream.aggregate` — one record per (turnId, type) at turn end for delta streams; emits `{type, deltaCount, totalBytes, sha256OfConcatenated}`.
3. **SSE hash helper** (`backend/src/lib/sse-hash.ts`):
   - `sha256Prefix(data, prefixLen=16)` — 16-char hex prefix.
   - `isDeltaType(type)` — true for `text-delta`, `delta`, `reasoning-delta`.
   - `StreamAggregator` — records chunk counts, totalBytes, running sha256.
   - `getOrCreateAggregator(turnId, type)` — map-keyed `${turnId}:${type}`.
   - `finalizeAggregators(turnId)` — returns one summary per type for the turn, deletes entries.
   - `__resetStreamAggregatorsForTest()` — test-only clear.
4. **Crash-safety flush** — `rootPino.flush?.()` in the `finally` of every streaming route, AFTER `sse.stream.aggregate` + `turn.end` emit, BEFORE the generator exits. If the process dies between the last SSE byte and here, JSONL is already on disk; if it dies inside `flush`, the sync dispatch has already drained.
5. **Detached IIFE context re-entry** (3 sites: `/action`'s reactive `auto_checkpoint` IIFE, `/retry`'s same IIFE, `queueAuxiliaryPostTurnWork`):
   - Capture `const detachedCtx = getTurnContext()` synchronously before the detached call.
   - Inside the IIFE: `if (detachedCtx) { await runWithTurnContext({...detachedCtx, role: undefined}, body); } else { await body(); }`.
   - Role cleared because the detached work doesn't belong to any single LLM role frame.
6. **Side-car prompt dumper** (`backend/src/lib/prompt-dump.ts`):
   - `writePromptSideCarIfEnabled(label, formatted)` → writes `{logRoot}/campaigns/{id}/logs/turn-{tick}-{turnId8}-prompt-{label}.txt` when `dumpFullPrompts === true`.
   - Synchronous `getObservabilityConfigSnapshot()` read. NEVER `loadSettings()` on hot path (grep-verified: 0 matches).
   - Label sanitized to `[a-zA-Z0-9_-]` before joining into filename (path-traversal guard).
   - No-op when `dumpFullPrompts === false` OR when called outside `runWithTurnContext`.
   - **Fail-loud**: on write failure, emits `log.error("prompt.dump.failed", {event, path, error})` then `throw err`. NO silent no-op per CLAUDE.md.
   - **NOT on lib/index.ts barrel** — cycle prevention (Plan 58-01 convention).
7. **Prompt-assembler wiring** — direct import `from "../lib/prompt-dump.js"`. Two call sites:
   - After `log.event("prompt.assembled", ...)` inside `assemblePrompt` — label `hidden-tool-driving` (hidden pass) or `final-visible-base` (final-visible pass).
   - After `log.event("prompt.assembled", ...)` inside `assembleFinalNarrationPrompt` — label `final-narration`.
8. **Route-level correlation test** (`backend/src/routes/__tests__/chat-turn-context.test.ts`) — 2 cases:
   - **Single turn correlation**: seed a campaign, mock `processTurn` to yield `[scene-settling, text-delta×2, done]`, `app.request("/api/chat/action", ...)`, drain SSE body, read the JSONL. Asserts (a) `turn.begin` is first record, (b) `turn.end` is last record, (c) single `turnId`/`campaignId`/`tick=3` across all records, (d) zero per-text-delta `sse.emit` records, (e) exactly one `sse.stream.aggregate` with `deltaCount: 2`, (f) no `SECRET_KEY_PLACEHOLDER` leak.
   - **Concurrent isolation**: two `/action` requests to distinct campaigns via `Promise.all` — asserts separate JSONL files exist, turnIds differ, neither file contains the other's turnId or campaignId.
9. **Prompt-dump unit tests** (`backend/src/lib/__tests__/prompt-dump.test.ts`) — 5 cases:
   - Disabled no-op (dumpFullPrompts=false).
   - Enabled write creates `turn-3-abcdef12-prompt-hidden-tool-driving.txt` with the prompt verbatim.
   - Outside `runWithTurnContext` → no-op, no throw.
   - Fail-loud: `vi.doMock("node:fs", ... writeFileSync: throw "disk full")` — assert call throws `/disk full/`.
   - No `loadSettings` calls: `vi.spyOn(settings/manager, "loadSettings")`, 100 writes, spy never fires.

## Task Commits

1. **Task 1:** route wrap + 4 seams + SSE hash/aggregate + route-level test + auto-fixed sibling mocks → `782bb52` (feat)
2. **Task 2:** prompt-dump helper + prompt-assembler wiring + 5 unit tests → `284a004` (feat)

_Final plan metadata commit will follow this SUMMARY._

## Route Line-Number Map (Post-Instrumentation)

| Route    | `runWithTurnContext` entry | `turn.begin` | `turn.end` | `finalizeAggregators` | `rootPino.flush` | Detached IIFE ctx capture |
|----------|----------------------------|--------------|------------|------------------------|------------------|----------------------------|
| /opening | ~410 | ~412 | ~455 | ~445 | ~464 | — (no detached IIFE in /opening) |
| /action  | ~537 | ~538 | ~620 | ~613 | ~633 | ~570 (auto-checkpoint) + queueAuxiliaryPostTurnWork |
| /retry   | ~710 | ~712 | ~784 | ~775 | ~798 | ~735 (auto-checkpoint) |

_Line numbers approximate; exact positions shift slightly with future edits. Acceptance-criteria greps (see Verification) pin the shape._

## writeTurnEventSSE Rewrite

Before (Plan 58-02): special-cased `reasoning`; emitted raw JSON via `stream.writeSSE` with no observability.

After:
```typescript
const dataStr = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
const byteLength = Buffer.byteLength(dataStr, "utf8");
const ctx = getTurnContext();

if (ctx && isDeltaType(event.type)) {
  // Aggregate — do NOT log per delta.
  getOrCreateAggregator(ctx.turnId, event.type).record(dataStr);
} else {
  // Non-delta: lightweight emission.
  log.event("sse.emit", {
    type: event.type,
    byteLength,
    sha256Prefix: sha256Prefix(dataStr),
  });
}
await stream.writeSSE({ event: eventName, data: dataStr });
```

Delta types covered: `text-delta`, `delta`, `reasoning-delta`. Everything else (including `reasoning`, `narrative`, `scene-settling`, `tool-call`, `oracle_result`, `done`, `error`, `entity_update`, `campaign_update`) emits a single `sse.emit` record.

## Seam 5 Coverage (oracle_result)

Plan 58-02 intentionally deferred seam 5 (`sse.emit` for `oracle_result`) to Plan 58-03 because `writeTurnEventSSE` is the central fan-out. After this plan's writeTurnEventSSE rewrite, `oracle_result` is covered automatically — it's a non-delta SSE type, so it flows through the `log.event("sse.emit", ...)` branch. No dedicated instrumentation was needed in `turn-processor.ts:855`. Verified at runtime by reading the chat-turn-context.test.ts JSONL output: the `{type: "scene-settling", ...}` → `{type: "done", ...}` path emits two `sse.emit` records under the same turnId.

## rootPino.flush() — Crash-Safety Rationale

Per Gemini review: in the default multi-stream setup, one stream is the sync `TurnFileDispatch` (`appendFileSync` inside `_write`, durable), the other is pretty/stdout (async in production via pino-pretty worker). If the Node process crashes between the last `.writeSSE(...)` of a turn and the next event loop tick, the sync dispatch has already written everything, but the pretty stream might have buffered the last 1–2 records in the worker IPC.

Calling `rootPino.flush?.()` at the end of the `finally` (after `sse.stream.aggregate` + `turn.end`) drains both streams. `?.()` because pino's `Logger` exposes `flush` but the proxy-backed `rootPino` can return `undefined` for a prop that's not on the current instance. Wrapped in `try { ... } catch { /* best effort */ }` because a flush failure must not mask the real outcome.

## Cycle Prevention

Grep-verified invariants (post-instrumentation):
- `grep -c "prompt-dump" backend/src/lib/index.ts` → **0**
- `grep -cE 'from "\.\./lib/prompt-dump\.js"' backend/src/engine/prompt-assembler.ts` → **1** (direct import)
- `grep -c "loadSettings" backend/src/lib/prompt-dump.ts` → **0** (snapshot cache only)

Import graph (Wave 3):
```
routes/chat.ts ──▶ lib/index.js              (createLogger, runWithTurnContext, getTurnContext)
            ├──▶ lib/logger-setup.js         (rootPino — direct import, not via barrel)
            └──▶ lib/sse-hash.js             (sha256Prefix, isDeltaType, ...)

engine/prompt-assembler.ts ──▶ lib/index.js           (createLogger)
                           └──▶ lib/prompt-dump.js    (DIRECT — not via barrel)

lib/prompt-dump.js ──▶ lib/logger-setup.js    (getObservabilityConfigSnapshot, getLogRoot)
                  ├──▶ lib/logger-context.js (getTurnContext)
                  └──▶ lib/logger.js         (createLogger)
```

No cycles. `lib/index.ts` deliberately does NOT re-export `prompt-dump` or `sse-hash` (though sse-hash could be; keeping it direct-import for symmetry with the sibling hot-path modules).

## Fail-Loud Posture for Side-Car

| Condition | Behavior |
|---|---|
| `dumpFullPrompts === false` | Silent no-op — feature disabled, not a failure |
| No turn context (called outside runWithTurnContext) | Silent no-op — nothing to route the file to, not a failure |
| `dumpFullPrompts === true` AND write succeeds | File written at `campaigns/{id}/logs/turn-{tick}-{turnId8}-prompt-{label}.txt` |
| `dumpFullPrompts === true` AND `writeFileSync` throws | `log.error("prompt.dump.failed", {event, path, error: err.message})` then `throw err` |
| `dumpFullPrompts === true` AND `mkdirSync` throws | Same — logged and rethrown (mkdirSync is inside the same try/catch) |

Rationale: when an operator enabled prompt dumping specifically to debug an LLM issue, silently dropping the dump would be a second debugging problem on top of the first. Fail-loud surfaces permissions / disk-full / path-too-long (Windows quirk) issues immediately.

## Auto-Fixed Test-Mock Regressions

When chat.ts gained imports from `../lib/index.js`, `../lib/logger-setup.js`, and `../lib/sse-hash.js`, two existing test files broke because their `vi.mock(...)` factories didn't include the new identifiers. Per Rule 1 (broken test caused by my code change), auto-fixed:

**1. `backend/src/routes/__tests__/chat.test.ts`**
- Extended `vi.mock("../../campaign/index.js", ...)` — added `readCampaignConfig: vi.fn(() => ({name, premise, createdAt, currentTick: 0}))`.
- Extended `vi.mock("../../lib/index.js", ...)` — added `runWithTurnContext: <T,>(_ctx, fn) => fn()`, `getTurnContext: vi.fn(() => undefined)`, `withRole: <T,>(_role, fn) => fn()`, and `event` method on the `createLogger` return.
- Added `vi.mock("../../lib/logger-setup.js", ...)` — `rootPino` with `flush` + `child`, `shouldLogRole`, `getObservabilityConfigSnapshot`, `getLogRoot`.
- Added `vi.mock("../../lib/sse-hash.js", ...)` — `sha256Prefix`, `isDeltaType`, `getOrCreateAggregator`, `finalizeAggregators`.

**2. `backend/src/routes/__tests__/chat.inventory-authority.test.ts`** — same pattern.

Result: `chat.test.ts` → 28/28 pass; `chat.inventory-authority.test.ts` → 2/2 pass; baseline parity restored.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Test regression] `chat.test.ts` broke when chat.ts imports expanded**
- **Found during:** Task 1 verification (full route suite run after route wrap wiring).
- **Issue:** `vi.mock("../../campaign/index.js", ...)` and `vi.mock("../../lib/index.js", ...)` factories didn't include the new `readCampaignConfig` / `runWithTurnContext` / `getTurnContext` / `withRole` imports that chat.ts now consumes. Vitest threw `No "runWithTurnContext" export is defined on the "../../lib/index.js" mock` for every streaming-route test (11 failures).
- **Fix:** Extended both test files' mock factories with matching pass-through fakes. Also added the `logger-setup.js` and `sse-hash.js` module mocks so `rootPino.flush()` and `sha256Prefix` don't require a real logger setup.
- **Files modified:** `backend/src/routes/__tests__/chat.test.ts`, `backend/src/routes/__tests__/chat.inventory-authority.test.ts`
- **Commit:** `782bb52`

**2. [Rule 3 — Blocking test issue] `vi.resetModules` broke singleton state in `prompt-dump.test.ts`**
- **Found during:** Task 2 verification.
- **Issue:** Initially I called `configureObservability` in `beforeEach` BEFORE the dynamic import. After `vi.resetModules()`, the dynamic `import("../prompt-dump.js")` loaded a fresh `logger-setup.js` module whose `cachedConfig` was still the default (`dumpFullPrompts: false`), so the "enabled write" test didn't actually write.
- **Fix:** Moved `configureObservability` and `resetLoggerForTest` calls inside each test, immediately AFTER a dynamic `import("../logger-setup.js")` so they mutate the same module instance that prompt-dump will later import.
- **Files modified:** `backend/src/lib/__tests__/prompt-dump.test.ts`
- **Commit:** `284a004`

**3. [Rule 3 — Grep hygiene] Comment text tripped the acceptance-criteria grep for `loadSettings`**
- **Found during:** Task 2 acceptance-criteria verification.
- **Issue:** Two comments in `prompt-dump.ts` explicitly named `loadSettings` ("no `loadSettings()` call is allowed here", "NEVER loadSettings here"). The plan's acceptance criterion `grep -n "loadSettings" backend/src/lib/prompt-dump.ts` requires exactly 0 matches, so the comments tripped it.
- **Fix:** Rephrased both comments to describe the behavior ("no disk settings re-read is allowed here", "settings disk I/O is forbidden on this hot path") without naming the forbidden symbol.
- **Files modified:** `backend/src/lib/prompt-dump.ts`
- **Commit:** `284a004`

### Not deviations (informational)

- **vi.doMock("node:fs")** — for the fail-loud test, I had to register the mock BEFORE the dynamic `import("../prompt-dump.js")`. Because `beforeEach` clears modules via `vi.resetModules()`, registering `vi.doMock(...)` inside the test itself and then importing works correctly. Same-run ordering confirmed by the log output: `prompt.dump.failed` record with `path` + `error: "disk full"` appears before the test assertion succeeds.

### Pre-existing failures (baseline parity)

Full-route-suite run shows **3 failed, 373 passed**. Pre-58-03 baseline: **5 failed, 371 passed** (same files). The 3 remaining failures are all in deferred-items.md (`persona-templates.test.ts` ×2, `worldgen.test.ts` ×1 — Phase 57/34 gaps). My changes reduced the failure count by 2 (my new passing test file).

Full-engine-suite run shows **4 failed, 357 passed** — identical to pre-58-03 baseline (same 4 tests: npc-agent, npc-offscreen, reflection-agent.identity-boundaries, turn-processor.inventory-authority — all Phase 30/40/48 deferred).

Typecheck: `npx tsc --noEmit` → **38 errors**, identical to baseline (all Phase 57 pre-existing in routes/schemas, routes/worldgen, character/record-adapters, etc.).

## Authentication Gates

None — no auth-touching code paths were modified.

## Verification

**Acceptance criteria (Task 1):**

```
=== grep runWithTurnContext chat.ts ===              6 (>=2)
=== grep turn.begin ===                              3 (>=1)
=== grep turn.end ===                                3 (>=1)
=== grep sse.emit ===                                1 (==1, inside writeTurnEventSSE)
=== grep sse.stream.aggregate ===                    3 (>=1)
=== grep sha256Prefix ===                            2 (>=1)
=== grep dataPreview ===                             0 (==0 — hot-path hygiene)
=== grep rootPino.flush ===                          3 (>=1)
=== grep finalizeAggregators ===                     4 (>=1)
=== grep getTurnContext (detached IIFE) ===          4 (>=1)
=== grep app.request in test ===                     4 (>=1)
=== grep processTurn( in test ===                    0 (==0 — no direct calls)
=== grep resetLoggerForTest in test ===              2 (>=1)
```

**Acceptance criteria (Task 2):**

```
=== grep prompt-dump in lib/index.ts ===             0 (==0 — cycle prevention)
=== grep 'from "../lib/prompt-dump.js"' ===          1 (>=1 — direct import)
=== grep writePromptSideCarIfEnabled ===             3 (>=2 — 1 import + 2 calls)
=== grep getObservabilityConfigSnapshot ===          3 (>=1)
=== grep loadSettings in prompt-dump ===             0 (==0 — no hot-path disk I/O)
=== grep prompt.dump.failed ===                      3 (>=1)
=== grep 'throw err' in prompt-dump ===              1 (>=1 — fail-loud)
```

**Tests:**
- `backend/src/routes/__tests__/chat-turn-context.test.ts` → **2/2 pass** (165 ms)
- `backend/src/lib/__tests__/prompt-dump.test.ts` → **5/5 pass** (1.3 s)
- `backend/src/lib/__tests__/` (all 12 files) → **115/115 pass**
- `backend/src/routes/__tests__/chat.test.ts` → **28/28 pass** (no regressions from mock extension)
- `backend/src/routes/__tests__/chat.inventory-authority.test.ts` → **2/2 pass** (no regressions)

**Typecheck:** 38 errors — identical to baseline (all Phase 57 pre-existing).

## Real-Turn Smoke (Route-Level Test Output Excerpt)

From `chat-turn-context.test.ts` stdout, a single turn through `/action` produced this JSONL sequence:

```jsonl
{"event":"turn.begin","turnId":"61018ffe-...","campaignId":"ctx-alpha","tick":3,"payload":{"route":"/action","playerAction":"look around","intent":"look","method":"","judgeProvider":{"id":"p1","model":"judge-model","baseUrl":"http://localhost:1234"},"storytellerProvider":{"id":"p1","model":"st-model","baseUrl":"http://localhost:1234"}}}
{"event":"sse.emit","turnId":"61018ffe-...","campaignId":"ctx-alpha","tick":3,"payload":{"type":"scene-settling","byteLength":17,"sha256Prefix":"fc662a44837cca1e"}}
{"event":"sse.emit","turnId":"61018ffe-...","campaignId":"ctx-alpha","tick":3,"payload":{"type":"done","byteLength":10,"sha256Prefix":"8111c884f26abddc"}}
{"event":"sse.stream.aggregate","turnId":"61018ffe-...","campaignId":"ctx-alpha","tick":3,"payload":{"type":"text-delta","deltaCount":2,"totalBytes":11,"sha256OfConcatenated":"64ec88ca00b268e5..."}}
{"event":"turn.end","turnId":"61018ffe-...","campaignId":"ctx-alpha","tick":3,"payload":{"route":"/action","tick":3,"durationMs":7,"outcome":"success"}}
```

Shared turnId across every record, no API key leak, two text-delta chunks aggregated to one record, turn.end last.

## Self-Check: PASSED

- [x] File `backend/src/lib/sse-hash.ts` exists on disk
- [x] File `backend/src/lib/prompt-dump.ts` exists on disk
- [x] File `backend/src/lib/__tests__/prompt-dump.test.ts` exists on disk
- [x] File `backend/src/routes/__tests__/chat-turn-context.test.ts` exists on disk
- [x] Commit `782bb52` (Task 1) reachable via `git log`
- [x] Commit `284a004` (Task 2) reachable via `git log`
- [x] `grep -c "prompt-dump" backend/src/lib/index.ts` → 0
- [x] `grep -c "loadSettings" backend/src/lib/prompt-dump.ts` → 0
- [x] `grep -c "dataPreview" backend/src/routes/chat.ts` → 0
- [x] Route-level test uses `app.request(` (4 matches) and never calls `processTurn(` directly (0 matches)
- [x] Prompt-dump test exercises 5 distinct conditions (disabled, enabled-write, no-context, write-failure, no-loadSettings)
- [x] Route test assertions cover: single turnId per turn + turn.begin first + turn.end last + zero per-delta sse.emit + exactly one sse.stream.aggregate + concurrent campaign isolation

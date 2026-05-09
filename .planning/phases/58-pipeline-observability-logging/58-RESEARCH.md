# Phase 58: Pipeline Observability Logging — Research

**Researched:** 2026-04-16
**Domain:** Structured logging, observability, context propagation, stream instrumentation
**Confidence:** HIGH

## Summary

Phase 58 requires turning the current ad-hoc text-file logger (`backend/src/lib/logger.ts`) into a structured, per-turn JSONL pipeline that correlates every pipeline stage (Oracle, Judge, prompt assembly, Storyteller hidden + visible passes, NPC ticks, reflection, tool-executor state mutations, LanceDB embeddings, SSE events) under a single turn ID, while keeping the pretty console tail for humans and redacting secrets.

The current codebase uses **33 distinct `createLogger(tag)` call sites** in `backend/src/`, all routed through a single text-formatter + daily file append (`logs/YYYY-MM-DD.log`). There is no correlation ID, no structured payload, no per-campaign folder, no redaction, and the `ProviderConfig` object (which carries raw `apiKey`) is already passed through the entire turn pipeline as a function argument — so any naive "just log the function arg" will leak keys. This phase must:

1. Introduce `pino` (v10.3.1, verified via `npm view pino version` on 2026-04-16) as the structured logger, with `pino-pretty` (13.1.3) for the console tail and a plain `pino.destination` (or `pino/file` transport) writing JSONL to `campaigns/{id}/logs/turn-{tick}.jsonl`.
2. Use **Node.js `AsyncLocalStorage`** (stdlib — no dependency) to propagate a `TurnContext { turnId, campaignId, tick, role? }` across every `await` in the turn generator without threading a parameter through 30+ function signatures.
3. Replace `createLogger(tag)` in `backend/src/lib/logger.ts` with a pino-backed shim that returns the same `{ info, warn, error }` surface but enriches every record with `tag`, turn context (when present), and applies redaction for `apiKey`, `Authorization` headers, and any top-level `provider.apiKey` paths.
4. Add **per-role verbose toggles** to `Settings` (`shared/src/types.ts` → add `ObservabilityConfig`). Per-role means: `{judge, storyteller, oracle, npcAgent, reflection, embedder}`. A `false` toggle suppresses `debug`/`trace`-level records for that role; `info`/`warn`/`error` always flow.
5. Instrument the six pipeline seams listed below. These are narrow, additive edits — no refactoring of control flow. Emitting a log event is never allowed to swallow a pipeline error or change streaming output.

**Primary recommendation:** Use `pino@10` + `AsyncLocalStorage` + thin wrapper over the existing `createLogger(tag)` API. Do NOT hand-roll a JSONL serializer, correlation mechanism, or log rotation.

## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for this phase. Constraints are inherited from project CLAUDE.md and persistent memory:

### Locked Decisions (from global project rules)

- **TypeScript strict + ES modules** — all new files use `import`, `.js` extension suffixes on relative imports.
- **NO FALLBACKS** (`feedback_no_fallbacks.md`, `feedback_no_fallbacks_v2.md`) — if logging fails, it must fail loudly or silently no-op without corrupting the pipeline. Never "degrade into text mode" or swap formats mid-turn.
- **Zod for validation** — all new exported type surfaces that cross settings/boundary should have Zod schemas.
- **GLM default provider; OpenRouter embargo** — irrelevant to this phase (no LLM calls added), but must not be broken.
- **No `npm run build:watch` / no ad-hoc changes** — all edits through `/gsd:*` pipeline.
- **Russian response language** — applies to chat replies, not code or logs. Logs are English.
- **Use GitNexus before edits** — Phase 58 edits `turn-processor.ts`, `prompt-assembler.ts`, `oracle.ts`, `storyteller.ts`, `npc-agent.ts`, `reflection-agent.ts`, `tool-executor.ts`, `chat.ts`, `embeddings.ts`, `logger.ts`, `settings/manager.ts`. Each plan must run `gitnexus_impact` on the symbols it touches (hook enforced).
- **No console.log pattern** (global `coding-style.md`) — all logging through the shared logger.

### Claude's Discretion

- Choice of logger library (pino recommended — evidence below).
- Exact field schema for each log record (must satisfy downstream Claude consumption).
- Truncation threshold for oversized payloads (spec says 10KB; discretion on hash algorithm — SHA-256 recommended).
- Whether the JSONL file is written synchronously (safer, slower) or via pino worker thread (faster, might lose last record on crash). **Recommendation: synchronous `pino.destination({ sync: true })` per turn file — we want zero drop on crash during debugging.**
- Whether to ship a `pino-pretty` CLI watcher script as dev convenience.

### Deferred Ideas (OUT OF SCOPE)

- OpenTelemetry / OTLP export — not needed for single-user dev tool.
- Log shipping to external services (Datadog, Better Stack).
- Frontend-side logging (browser console is enough for now).
- Log rotation / retention / compression — per-turn files are self-cleaning (one file per turn, user deletes campaign to delete logs). Do not introduce `pino-roll`.
- Sampling — we log every turn fully.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OBS-01 (derived) | Foundation for all future debugging: every pipeline stage emits a correlated structured log. | Mapped to 6 seams in "Pipeline Instrumentation Map" below. |
| OBS-02 (derived) | Enables partial UAT item from Phase 57 Test 6 to be fully verified (PowerStats flow into prompt-assembler can be inspected without debugger). | Prompt-assembler seam #3 logs the assembled prompt (and PowerStats lines) before send. |
| OBS-03 (derived, from phase description) | Per-turn file at `campaigns/{id}/logs/turn-{tick}.jsonl` + pretty console tail. | `pino.multistream` pattern. |
| OBS-04 (derived) | Verbose toggle per role in Settings. | `Settings` type extension + `ObservabilityConfig` Zod schema. |
| OBS-05 (derived) | Truncate payloads > 10KB with hash reference. | Custom serializer; SHA-256 digest + inline preview. |
| OBS-06 (derived) | Never log secrets. | `pino.redact` with path list — `apiKey`, `*.apiKey`, `Authorization`, `braveApiKey`, `zaiApiKey`. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pino` | ^10.3.1 | Structured JSON/NDJSON logger | 5-8× faster than winston (222k ops/s vs 36k ops/s at 100k messages); default NDJSON output == the JSONL format this phase needs; built-in `redact` for secrets; non-blocking async writes; already the modern default for Node.js backend services in 2026. |
| `pino-pretty` | ^13.1.3 | Human-readable console formatter | Official sibling project; pipes NDJSON to colorized multi-line console output with level icons. Dev-only convenience. |
| `node:async_hooks` (`AsyncLocalStorage`) | stdlib (Node 22+) | Turn-ID context propagation | Already in runtime — no install. Designed for exactly this problem (request-scoped context across async boundaries). Propagates automatically through `await`, Promise chains, and generator yields. |
| `node:crypto` (`createHash`) | stdlib | SHA-256 for truncated payload references | Already imported in `oracle.ts` and `tool-executor.ts`. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pino.multistream` (built-in since pino 7) | — | Fan out one log record to multiple destinations (console + per-turn file) | Recommended over legacy `pino-multi-stream` package (deprecated). Used once during logger setup. |
| `pino.destination({ sync: true })` | built-in | Guarantee log lines flush before turn returns | Critical for debugging: if a turn crashes, we want the JSONL file to contain everything up to the crash, not have last N lines stuck in a worker thread buffer. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pino` | `winston` | Flexible transports, but 5× slower, JSON output requires configuration, redaction not built-in, no first-class async context pattern. **Rejected** — this is a hot path (fires 30-100 events per turn). |
| `pino` | `bunyan` | NDJSON native like pino, but unmaintained since ~2022. **Rejected.** |
| `pino` | Hand-rolled extension of current `logger.ts` | Zero deps, but reimplements redaction, multistream, serialization, hash-truncation. Violates "Don't Hand-Roll" below. **Rejected.** |
| `AsyncLocalStorage` | Explicit `turnCtx` parameter threaded through every function | No runtime overhead, but requires touching ~30 function signatures in `turn-processor.ts`, `prompt-assembler.ts`, `oracle.ts`, `npc-agent.ts`, `reflection-agent.ts`, `tool-executor.ts`, `embeddings.ts` — each one a potential bug. **Rejected** — AsyncLocalStorage exists exactly for this. |
| `AsyncLocalStorage` | Attach context to a closure in the route handler and pass a bound logger | Doesn't work: `processTurn` is an async generator and the logger is imported as a module-level singleton in each sub-file. Requires refactor. **Rejected.** |
| `pino-roll` for rotation | — | Spec says one file per turn (tick-indexed). No rotation needed. **Not used.** |

**Installation:**
```bash
cd backend && npm install pino@^10.3.1 pino-pretty@^13.1.3
```

**Version verification (2026-04-16):**
- `pino@10.3.1` — confirmed via `npm view pino version` → `10.3.1`.
- `pino-pretty@13.1.3` — confirmed via `npm view pino-pretty version` → `13.1.3`.
- `pino-roll@4.0.0` — available but unused (see Deferred Ideas).

## Architecture Patterns

### Recommended Project Structure

```
backend/src/lib/
├── logger.ts                 ← REWRITE: pino-backed, but export same createLogger() API
├── logger-context.ts         ← NEW: AsyncLocalStorage wrapper (runWithTurnContext, getTurnContext)
├── logger-serializers.ts     ← NEW: payload truncation + SHA-256 hash, redact helpers
├── logger-setup.ts           ← NEW: pino instance factory, multistream construction, file opener per turn
└── __tests__/
    ├── logger-redact.test.ts        ← NEW
    ├── logger-context.test.ts       ← NEW
    └── logger-truncate.test.ts      ← NEW

shared/src/types.ts           ← EDIT: add ObservabilityConfig to Settings
backend/src/settings/manager.ts ← EDIT: normalize ObservabilityConfig defaults
```

### Pattern 1: AsyncLocalStorage for Turn Context Propagation

**What:** A single `AsyncLocalStorage<TurnContext>` instance is populated at the route boundary (`backend/src/routes/chat.ts` inside `streamSSE`) and automatically visible inside every `await`, generator `yield`, and `Promise.then` downstream.

**When to use:** Any cross-cutting context that is request-scoped. Here: `turnId`, `campaignId`, `tick`, `role`.

**Example:**
```typescript
// backend/src/lib/logger-context.ts
// Source: https://blog.logrocket.com/logging-with-pino-and-asynclocalstorage-in-node-js/
import { AsyncLocalStorage } from "node:async_hooks";

export interface TurnContext {
  turnId: string;         // UUID generated at turn start
  campaignId: string;
  tick: number;
  role?: "oracle" | "judge" | "storyteller" | "npcAgent" | "reflection" | "embedder" | "tool" | "prompt";
  parentTurnId?: string;  // for nested reflection/npc ticks
}

const turnStorage = new AsyncLocalStorage<TurnContext>();

export function runWithTurnContext<T>(ctx: TurnContext, fn: () => T): T {
  return turnStorage.run(ctx, fn);
}

export function getTurnContext(): TurnContext | undefined {
  return turnStorage.getStore();
}

export function withRole<T>(role: TurnContext["role"], fn: () => T): T {
  const current = turnStorage.getStore();
  if (!current) return fn();
  return turnStorage.run({ ...current, role }, fn);
}
```

Route handler wraps the turn generator once:
```typescript
// backend/src/routes/chat.ts  (inside streamSSE callback, around line 506-544 of /action)
return streamSSE(c, async (stream) => {
  const turnId = crypto.randomUUID();
  const currentTick = readCampaignConfig(campaignId).currentTick ?? 0;
  await runWithTurnContext({ turnId, campaignId, tick: currentTick }, async () => {
    const turnGenerator = processTurn({ ... });
    for await (const event of turnGenerator) {
      await writeTurnEventSSE(stream, event);
    }
  });
});
```

Every `log.info(...)` call in `oracle.ts`, `prompt-assembler.ts`, etc. automatically picks up `turnId` via the pino child logger bound to `getTurnContext()`.

### Pattern 2: pino.multistream — Console + Per-Turn File

**What:** Fan one log event out to (a) pretty console and (b) the active turn's JSONL file.

**When to use:** Every log record during a turn. Per-turn file opens lazily when the first record for that turn/tick lands.

**Example:**
```typescript
// backend/src/lib/logger-setup.ts
// Source: https://github.com/pinojs/pino/blob/main/docs/api.md multistream
import pino from "pino";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getTurnContext } from "./logger-context.js";

const prettyStream = pino.transport({
  target: "pino-pretty",
  options: { colorize: true, ignore: "pid,hostname", translateTime: "SYS:HH:MM:ss.l" },
});

// Map of "campaignId:tick" -> open WriteStream
const turnFileStreams = new Map<string, NodeJS.WritableStream>();

function getOrOpenTurnStream(campaignId: string, tick: number): NodeJS.WritableStream {
  const key = `${campaignId}:${tick}`;
  let stream = turnFileStreams.get(key);
  if (!stream) {
    const dir = join(process.cwd(), "campaigns", campaignId, "logs");
    mkdirSync(dir, { recursive: true });
    stream = createWriteStream(join(dir, `turn-${tick}.jsonl`), { flags: "a" });
    turnFileStreams.set(key, stream);
  }
  return stream;
}

// A dynamic stream that routes each record to the correct per-turn file
const turnFileStream = {
  write(chunk: string) {
    // pino feeds us serialized JSON — we know turnId, tick, campaignId are in it
    try {
      const parsed = JSON.parse(chunk);
      if (parsed.campaignId && parsed.tick !== undefined) {
        getOrOpenTurnStream(parsed.campaignId, parsed.tick).write(chunk);
      }
    } catch { /* malformed record — skip file write, still goes to console */ }
  },
};

export const rootPino = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: [
        "apiKey", "*.apiKey", "provider.apiKey", "*.provider.apiKey",
        "judgeProvider.apiKey", "storytellerProvider.apiKey", "embedderProvider.apiKey",
        "Authorization", "headers.authorization",
        "braveApiKey", "zaiApiKey", "*.braveApiKey", "*.zaiApiKey",
      ],
      remove: false,   // leave "[Redacted]" marker so we can see a key WAS there
      censor: "[REDACTED]",
    },
    mixin() {
      const ctx = getTurnContext();
      return ctx ? { turnId: ctx.turnId, campaignId: ctx.campaignId, tick: ctx.tick, role: ctx.role } : {};
    },
  },
  pino.multistream([
    { stream: prettyStream },
    { stream: turnFileStream as NodeJS.WritableStream },
  ]),
);
```

### Pattern 3: Backward-Compatible createLogger Shim

**What:** `backend/src/lib/logger.ts` exports the same `createLogger(tag)` that returns `{ info, warn, error }` so all 33 existing call sites keep working untouched, but internally it's a pino child logger.

**When to use:** Always. Migrating every call site is out of scope and high-risk.

**Example:**
```typescript
// backend/src/lib/logger.ts (rewrite)
import { rootPino } from "./logger-setup.js";

export function createLogger(tag: string) {
  const child = rootPino.child({ tag });
  return {
    info: (message: string, data?: unknown) =>
      data !== undefined ? child.info(serializePayload(data), message) : child.info(message),
    warn: (message: string, data?: unknown) =>
      data !== undefined ? child.warn(serializePayload(data), message) : child.warn(message),
    error: (message: string, data?: unknown) =>
      data !== undefined ? child.error(serializePayload(data), message) : child.error(message),
    // NEW optional methods — only new call sites use them
    debug: (message: string, data?: unknown) =>
      data !== undefined ? child.debug(serializePayload(data), message) : child.debug(message),
    event: (eventName: string, data?: unknown) =>  // structured event, always emits
      child.info({ event: eventName, payload: serializePayload(data) }, eventName),
  };
}
```

### Pattern 4: Large-Payload Truncation with Hash Reference

**What:** Any serialized field > 10 KB gets replaced by `{ truncated: true, sha256: "...", previewHead: "...first 500 chars...", previewTail: "...last 200 chars...", originalLength: N }`.

**When to use:** Assembled prompts (routinely 50 KB+), full chat history, large tool-result blobs.

**Example:**
```typescript
// backend/src/lib/logger-serializers.ts
import { createHash } from "node:crypto";

const TRUNCATION_THRESHOLD = 10_240; // 10 KB

export function serializePayload(value: unknown): unknown {
  if (typeof value === "string") {
    return maybeTruncateString(value);
  }
  if (value && typeof value === "object") {
    // Shallow traversal — deep payloads get stringified then truncated as whole
    const asString = safeStringify(value);
    if (asString.length > TRUNCATION_THRESHOLD) {
      return truncatedReference(asString);
    }
    return value;
  }
  return value;
}

function maybeTruncateString(s: string) {
  if (s.length <= TRUNCATION_THRESHOLD) return s;
  return truncatedReference(s);
}

function truncatedReference(s: string) {
  return {
    truncated: true,
    sha256: createHash("sha256").update(s).digest("hex"),
    previewHead: s.slice(0, 500),
    previewTail: s.slice(-200),
    originalLength: s.length,
  };
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}
```

### Pipeline Instrumentation Map

These are the **exact file:line boundaries** where new `log.event(...)` calls land. No existing call is removed; new calls are pure additions.

| # | Stage | File | Location | Event Name | Payload |
|---|-------|------|----------|------------|---------|
| 1 | Turn begin | `backend/src/routes/chat.ts` | `POST /action` line ~446, inside `streamSSE` around line 506 (after `tryBeginTurn`) | `turn.begin` | `{ playerAction, intent, method, campaignId, tick, judgeProvider: {id, model}, storytellerProvider: {id, model} }` (apiKey redacted by `pino.redact`) |
| 2 | Movement detection | `backend/src/engine/turn-processor.ts` | `detectMovement` line 303-329 | `movement.detect` | `{ action, destination, isMovement }` |
| 3 | Target context | `backend/src/engine/turn-processor.ts` | Line 833 `resolveActionTargetContext` call result | `target.context` | `{ targetTags, targetEntity }` |
| 4 | Oracle call | `backend/src/engine/oracle.ts` | Wrap `executeOracleCall` line 110-128 — log INPUT (payload) before call, OUTPUT (`{chance, roll, outcome, reasoning}`) after | `oracle.call` | `{ input: OraclePayload, output: OracleResult, latencyMs }` |
| 5 | Oracle emit to stream | `backend/src/engine/turn-processor.ts` | Line 855 `yield { type: "oracle_result", ... }` | `sse.emit` (type=oracle_result) | `{ type, data }` |
| 6 | Hidden prompt assembled | `backend/src/engine/prompt-assembler.ts` | `assemblePrompt` exit (~line 900+; check via gitnexus_context) | `prompt.assembled` | `{ pass: "hidden-tool-driving", totalTokens, budgetUsed, sectionCount, formatted (truncated) }` |
| 7 | Hidden Storyteller stream | `backend/src/engine/turn-processor.ts` | `runHiddenPassWithModel` line 949-968 | `storyteller.hidden.stream` | `{ text-delta count, tool-call count, duration }` — stream parts aggregated, NOT one log per delta (would spam); log tool-call events individually |
| 8 | Each tool call | `backend/src/engine/turn-processor.ts` + `tool-executor.ts` | `processHiddenStreamPart` line 907-946 (capture) + `executeToolCall` line 1074 (execute) | `tool.call` | `{ toolName, args, result, latencyMs }` |
| 9 | State mutation (SQLite) | `backend/src/engine/tool-executor.ts` | Each handler (`handleAddTag`, `handleSpawnNpc`, etc.) — wrap DB writes | `db.write` | `{ table, op, rowId, rowName }` (no full row) |
| 10 | Local scene settlement (NPC tick) | `backend/src/engine/npc-agent.ts` | `tickNpcAgent` line 50-318, wrap `generateText` call line 290 | `npcAgent.tick` | `{ npcId, npcName, toolCallCount, duration }` — with `withRole("npcAgent", ...)` so per-role toggle applies |
| 11 | Final narration prompt | `backend/src/engine/prompt-assembler.ts` | `assembleFinalNarrationPrompt` exit | `prompt.assembled` | `{ pass: "final-narration", totalTokens, budgetUsed, formatted (truncated) }` |
| 12 | Visible Storyteller call | `backend/src/engine/turn-processor.ts` | `runVisibleNarrationWithGuard` line 573-648 | `storyteller.visible.call` | `{ label: "final"\|"opening", initialLen, retried, retryLen, failures, reasoningLen }` |
| 13 | Reflection | `backend/src/engine/reflection-agent.ts` | `runReflection` line 47+, wrap Judge call | `reflection.tick` | `{ npcId, npcName, toolCallCount, duration }` |
| 14 | Faction tick | `backend/src/engine/faction-tools.ts` | `tickFactions` entry/exit | `faction.tick` | `{ factionsProcessed, duration }` |
| 15 | Embedder call | `backend/src/vectors/embeddings.ts` | `embedTexts` line 9-43 | `embedder.call` | `{ batchCount, totalTexts, model, duration }` |
| 16 | LanceDB write | `backend/src/vectors/episodic-events.ts`, `lore-cards.ts` | Existing write paths | `vector.write` | `{ store: "episodic-events"\|"lore-cards", count }` |
| 17 | Each SSE event out | `backend/src/routes/chat.ts` | `writeTurnEventSSE` line 287-303 | `sse.emit` | `{ type, dataPreview (truncated) }` |
| 18 | Turn end | `backend/src/routes/chat.ts` | `/action` line 559-562 `finally` block | `turn.end` | `{ tick, durationMs, outcome: "success"\|"error"\|"restored" }` |

Total call sites added: **~20** (some seams produce multiple events, e.g., every tool call in seam #8).

### Anti-Patterns to Avoid

- **Logging the full `ProviderConfig` object** — it has raw `apiKey`. Always destructure to `{ id, model, baseUrl }` before logging OR rely on `pino.redact` to mask it. Prefer destructure (explicit, can't regress).
- **`console.log` inside the streaming loop** — bypasses redaction, bypasses per-turn file, corrupts stdout if the backend is piped. Project rule already forbids console.log.
- **Logging inside the SSE `writeSSE` body itself** — logging takes ~100 µs; SSE events need to flush promptly. Log before/after, not during.
- **Serializing the full `toolCallResults` array at end of turn** — it can contain 50+ items with prompts and results. Either log each call as it happens (preferred), or truncate the summary.
- **Forgetting `withRole()` wrapping for NPC ticks and reflection** — without it, the role toggle can't distinguish them. Each async call into `npc-agent`, `reflection-agent`, `oracle.ts` should be wrapped at the call site: `await withRole("oracle", () => callOracle(...))`.
- **Writing logs outside `AsyncLocalStorage` context** — e.g., inside `setTimeout` or `void (async () => ...)()` detached IIFEs (there are several in `chat.ts` for post-turn work around line 152-258, 529). Either wrap those with `runWithTurnContext` before detaching, or explicitly log `{ detached: true, parentTurnId }`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON-per-line file writing | Custom `appendFileSync(JSON.stringify(...))` | `pino.destination` | Atomic newline-terminated writes, crash-safe flushing, no partial records. |
| Secret redaction across nested paths | Regex scrubbing of serialized output | `pino.redact.paths` with wildcards | Based on `fast-redact`, ~2% overhead, proven correct; regex on post-serialized JSON misses e.g. `"apiKey"` followed by non-string. |
| Correlation ID propagation across `await` | `turnCtx` parameter threaded through 30+ functions | `AsyncLocalStorage` | Auto-propagates through `await`, `Promise.all`, generators. Purpose-built for this. |
| Human-readable dev console | Manual ANSI color escapes | `pino-pretty` | Colors by level, collapses nested JSON, timestamps. |
| Large payload truncation with reference | Truncate to N chars and hope | SHA-256 hash + preview head/tail | Lets you recover identity of truncated content (compare two runs). |
| Dual-write console + file | Two separate log writers | `pino.multistream` | One format, one redaction, one mixin — guaranteed consistency. |
| JSON serialization of circular/big objects | `JSON.stringify` with try/catch | `pino`'s built-in serializer (handles errors, big objects) + our truncation wrapper for payload field | pino handles Error objects natively (stack trace, message, code). |

**Key insight:** The entire stack for this problem is one library + one stdlib module. Writing any of the above by hand is a known failure mode — secrets leak, correlation breaks, sync writes block the event loop, or the file descriptors are never released. pino has solved these since 2016.

## Runtime State Inventory

This phase is **additive code**, not a rename/refactor. No existing runtime state needs migration. One small note:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no existing logs in SQLite or LanceDB get migrated. The old `backend/logs/YYYY-MM-DD.log` daily file continues to be written alongside new per-turn JSONL for a transition period, then can be removed. | No migration. |
| Live service config | None — `settings.json` gains a new `observability` section with sensible defaults. Existing `settings.json` files without this key must normalize to defaults on load (handled in `settings/manager.ts`). | Default-fill in normalizer — verified-by-test requirement. |
| OS-registered state | None. | None. |
| Secrets/env vars | `LOG_LEVEL` env var introduced (optional, defaults to `info`). No key rotation. | Document in README; no code action. |
| Build artifacts | `node_modules` gains `pino`, `pino-pretty`, and their transitive deps (pino has ~0 prod deps besides `sonic-boom`, `thread-stream`, `safe-stable-stringify`, `fast-redact`, `pino-std-serializers`, `quick-format-unescaped`, `atomic-sleep`, `process-warning`, `real-require`). All pinned by `package-lock.json` after `npm install`. | Commit updated `package-lock.json`. |

**Nothing found in categories 1, 3, 5 — verified by grep: no existing log file contains a campaign UUID (`grep -rln` on `backend/logs/*.log` returned only date-stamped daily files, not campaign-scoped), no systemd/Task Scheduler entries reference logging, no installed package currently owns the `logs/` path.**

## Common Pitfalls

### Pitfall 1: `AsyncLocalStorage` context lost across `setTimeout`/detached IIFE

**What goes wrong:** `chat.ts` line 529 uses `void (async () => { ... })()` to detach post-turn checkpoint work. Inside that IIFE, `getTurnContext()` still returns the outer context (AsyncLocalStorage DOES propagate into async IIFEs started synchronously inside the run block). BUT: if the IIFE uses `setTimeout` internally or is started from a *different* tick of the event loop, context can be lost.

**Why it happens:** AsyncLocalStorage is preserved through `await` and microtasks but can be lost through certain C++-bound callbacks.

**How to avoid:**
- All detached work must be started *synchronously* from inside `runWithTurnContext`.
- For `setTimeout`-delayed work, explicitly re-enter context: `const ctx = getTurnContext(); setTimeout(() => runWithTurnContext(ctx, fn), 0);`.

**Warning signs:** Log records missing `turnId` when they should have one. Mitigation: add a test that runs a turn and greps the JSONL file for records without `turnId`.

### Pitfall 2: `pino.redact` path syntax is strict

**What goes wrong:** `redact.paths: ["apiKey"]` only redacts top-level. `**.apiKey` does NOT work (pino uses limited glob — single-segment wildcards only). Must list every known nesting depth or use a recursive approach.

**Why it happens:** `fast-redact` trades flexibility for speed.

**How to avoid:**
- Enumerate paths explicitly: `apiKey`, `*.apiKey`, `*.*.apiKey`, `provider.apiKey`, `providers[*].apiKey`.
- Add a unit test `logger-redact.test.ts` that constructs a `Settings` + `ProviderConfig` + nested `{ config: { providers: [{ apiKey: "s" }] } }` and asserts `"s"` does not appear in serialized output.

**Warning signs:** Any log line contains `sk-or-v1-` or `sk-proj-` or `Bearer `. A dedicated test asserts this never appears.

### Pitfall 3: Per-turn file write race on concurrent turns

**What goes wrong:** If two campaigns are being played simultaneously (possible — backend supports it; `runtime-state.ts` has per-campaign locks), both turns are writing at the same tick across DIFFERENT files. Fine in isolation. But if the SAME campaign has overlapping opening + action (bug scenario), two streams could open for `turn-{tick}.jsonl` and race.

**Why it happens:** `tryBeginTurn` guards this at the route level, but a bug could let it slip.

**How to avoid:**
- Key file streams by `campaignId:turnId` (UUID), not `campaignId:tick`. Multiple turns at the same tick (e.g. after undo+retry) get separate turn IDs.
- Filename becomes `turn-{tick}-{turnIdShort}.jsonl` OR just `turn-{tick}.jsonl` with an append-only guarantee (every record is a complete JSON object on its own line — concurrent appends interleave lines but never corrupt records, because OS-level `O_APPEND` is atomic for sub-4KB writes).
- Test: concurrent turns in 2 campaigns → assert logs are in separate files.

### Pitfall 4: Streaming back-pressure blocks on sync destination

**What goes wrong:** `pino.destination({ sync: true })` writes via `fs.writeSync` — blocking. On a slow disk with 50 log events in a turn, that's ~5 ms. Acceptable.

BUT: if the JSONL file is on a network mount (user has campaigns on NAS), sync write can block for 100+ ms and starve the Storyteller stream.

**How to avoid:**
- Default to sync. Expose `LOG_SYNC=false` env var for users on network storage.
- `pino` worker-thread transport (async) is the fallback when `LOG_SYNC=false`.

**Warning signs:** Storyteller streaming feels laggy after Phase 58 lands; user reports. Diagnostic: `time` a turn with logging disabled vs enabled.

### Pitfall 5: Stream part logging spams disk

**What goes wrong:** `streamText` in `turn-processor.ts` line 964 yields one `text-delta` per token. A 300-token narration = 300 log events. If each is logged, the JSONL file explodes to MBs per turn.

**How to avoid:**
- At the stream-part level, **do NOT** log each `text-delta`. Aggregate: count deltas, accumulate text length, log once at stream end.
- `tool-result` parts DO get logged individually (there are only 2-5 per turn).

### Pitfall 6: Deleted campaign has no `logs/` dir yet

**What goes wrong:** First turn after campaign load tries to write to `campaigns/{id}/logs/turn-0.jsonl` — directory doesn't exist.

**How to avoid:**
- `mkdirSync(dir, { recursive: true })` in `getOrOpenTurnStream` (shown above). Standard pattern.
- Test: new campaign, first turn, assert file exists.

### Pitfall 7: Existing `generate-object-safe.ts` wraps `generateObject` with retries — log once or per-attempt?

**What goes wrong:** If Judge call retries internally, we may miss the retry signal in logs.

**How to avoid:**
- Instrument inside `generate-object-safe.ts` at attempt boundaries. Each attempt logs `llm.attempt { attemptNum, model, schema, result: success|failure, latencyMs }`.
- Caller-level log is just `oracle.call`, which spans all retries.

## Code Examples

Verified patterns from official sources:

### 1. pino + AsyncLocalStorage child logger
```typescript
// Source: https://blog.logrocket.com/logging-with-pino-and-asynclocalstorage-in-node-js/
import { AsyncLocalStorage } from "node:async_hooks";
import pino from "pino";

const als = new AsyncLocalStorage<{ requestId: string }>();

const logger = pino({
  mixin() {
    const ctx = als.getStore();
    return ctx ? { requestId: ctx.requestId } : {};
  },
});

// Usage
als.run({ requestId: "abc-123" }, async () => {
  logger.info("handling request");        // includes requestId automatically
  await someAsyncWork();
  logger.info("request complete");        // still includes requestId
});
```

### 2. pino.multistream for console + file
```typescript
// Source: https://github.com/pinojs/pino/blob/main/docs/api.md#multistream
import pino from "pino";
import { createWriteStream } from "node:fs";

const streams = [
  { stream: process.stdout, level: "debug" },
  { stream: createWriteStream("./app.jsonl"), level: "info" },
];
const logger = pino({ level: "debug" }, pino.multistream(streams));
```

### 3. Redaction with wildcard paths
```typescript
// Source: https://github.com/pinojs/pino/blob/main/docs/redaction.md
const logger = pino({
  redact: {
    paths: ["req.headers.authorization", "*.password", "users[*].apiKey"],
    censor: "[REDACTED]",
  },
});
```

### 4. Sync destination for crash safety
```typescript
// Source: https://github.com/pinojs/pino/blob/main/docs/api.md#destination
const dest = pino.destination({ dest: "./app.jsonl", sync: true });
const logger = pino(dest);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `console.log` + ad-hoc file writes | Structured loggers (pino) with transports | ~2020 | Zero-cost JSON parsing downstream, redaction, child loggers. |
| `cls-hooked` / `continuation-local-storage` for context | Node.js native `AsyncLocalStorage` | Node.js 13.10 (2020), stable in 16+ | No monkey-patching, no userland deps. |
| Winston as default Node.js logger | Pino (in 2026) | ~2022 onward | 5-8× perf; winston remains for teams needing 10+ transports. |
| `pino-multi-stream` npm package | Built-in `pino.multistream` | pino 7.0 (2021) | `pino-multi-stream` package is deprecated/no longer supported. |
| Worker thread transports mandatory for perf | Optional — sync destination adequate for most workloads | pino 7+ | Lets us get crash-safe sync writes while still using `pino.multistream`. |

**Deprecated/outdated:**
- `pino-multi-stream` package → use `pino.multistream` from core.
- `cls-hooked` → `AsyncLocalStorage`.
- `bunyan` — unmaintained since 2022.

## Open Questions

1. **Should `prompt-assembler.ts` log the FULL formatted prompt every turn, or only a structural summary?**
   - What we know: Full prompt can be 50KB+. Truncation with SHA-256 gives us identity-recoverability without bloat.
   - What's unclear: If Claude is asked to debug, does hash + preview head/tail (700 chars total) give enough signal, or does it need the whole thing?
   - Recommendation: Truncate to head+tail with hash. Additionally, write the full prompt to a side-car file `campaigns/{id}/logs/turn-{tick}-prompt-{pass}.txt` only when `observability.dumpFullPrompts === true` (off by default). User can toggle on when debugging.

2. **Should logs also capture raw LLM response text from `streamText`?**
   - What we know: Hidden pass accumulates into `hiddenNarrative` (`turn-processor.ts:912`). Final pass text is `finalNarration.text`. Both are available at turn summary.
   - What's unclear: Whether the raw stream deltas (pre-filter) should be logged separately from the post-`applyVisibleNarrationFilters` text.
   - Recommendation: Log both: `storyteller.visible.raw` (pre-filter) and `storyteller.visible.filtered` (post). Small cost, high debug value.

3. **Verbose toggle granularity — per-role boolean, or level per-role?**
   - What we know: Spec says "Verbose toggle per role". Boolean simplest.
   - What's unclear: Future need for log levels (info/debug/trace).
   - Recommendation: Start boolean: `observability.roles.judge = true|false`. If false, suppress events for that role below `warn`. Future: replace with per-role `level: "info"|"debug"|"trace"`.

4. **How should Claude consume these logs?**
   - What we know: Claude has `Read` tool for files + `Grep`.
   - What's unclear: Whether we ship a `/debug` CLI that slurps the last-turn file and pretty-prints it, or rely on `Read`.
   - Recommendation: `Read` works fine. Each turn file is small (<500 KB after truncation). No CLI needed in Phase 58; add later if workflow demands.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22+ | AsyncLocalStorage, pino 10 | ✓ (assumed — backend already runs on Node) | — | — |
| npm registry access | `npm install pino pino-pretty` | ✓ | — | — |
| `R:/Projects/WorldForge/campaigns/*/logs/` writable | Per-turn JSONL files | ✓ (same dir that writes `state.db`) | — | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest `^3.2.4` (backend) |
| Config file | `backend/vitest.config.ts` |
| Quick run command | `npm --prefix backend test -- --run src/lib/__tests__/logger-*.test.ts` |
| Full suite command | `npm --prefix backend test -- --run` |
| Phase gate | Full suite green + manual turn-file inspection before `/gsd:verify-work` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OBS-01 | Every pipeline stage emits a structured log correlated by turnId | integration | `npm --prefix backend test -- --run src/engine/__tests__/turn-processor.observability.test.ts` — runs a turn with mocked LLMs, asserts JSONL file contains events for stages 1-18 from Pipeline Instrumentation Map | ❌ Wave 0 (new file) |
| OBS-02 | PowerStats visible in assembled-prompt log | integration | Same as OBS-01, with additional assertion: `prompt.assembled` record contains `powerStats` section or preview contains `Tier:` | ❌ Wave 0 |
| OBS-03a | Per-turn file lands at `campaigns/{id}/logs/turn-{tick}.jsonl` | integration | `npm --prefix backend test -- --run src/lib/__tests__/logger-file-destination.test.ts` | ❌ Wave 0 |
| OBS-03b | Pretty console tail co-emits | unit | `npm --prefix backend test -- --run src/lib/__tests__/logger-multistream.test.ts` — mocks both streams, asserts both receive the record | ❌ Wave 0 |
| OBS-04 | Per-role toggle gates events | unit | `npm --prefix backend test -- --run src/lib/__tests__/logger-role-toggle.test.ts` — set `{judge:true, storyteller:false}`, emit mixed events, assert only judge appears | ❌ Wave 0 |
| OBS-05 | Payloads >10KB get SHA-256 + preview | unit | `npm --prefix backend test -- --run src/lib/__tests__/logger-truncate.test.ts` — log 20KB string, assert output has `truncated: true, sha256, previewHead, previewTail, originalLength` | ❌ Wave 0 |
| OBS-06a | Top-level apiKey redacted | unit | `npm --prefix backend test -- --run src/lib/__tests__/logger-redact.test.ts::apiKey-top-level` | ❌ Wave 0 |
| OBS-06b | Nested apiKey redacted (`judgeProvider.apiKey`, `settings.providers[0].apiKey`) | unit | Same file, multiple cases | ❌ Wave 0 |
| OBS-06c | Authorization header redacted | unit | Same file | ❌ Wave 0 |
| TURN-ID | `turnId` present in every record of a single turn | integration | OBS-01 test extension | ❌ Wave 0 |
| CONCURRENT | Two campaigns turn concurrently → logs never cross-contaminate | integration | `npm --prefix backend test -- --run src/engine/__tests__/turn-processor.observability-concurrency.test.ts` — run two turns with `Promise.all` in separate campaigns, assert each turn's JSONL only contains its own campaignId | ❌ Wave 0 |
| STREAM-SAFE | Logging doesn't corrupt Storyteller SSE stream | integration (real or mocked) | Extend existing `backend/e2e/` suite if present, or new `src/routes/__tests__/chat.observability.test.ts` — mock SSE, run turn, assert SSE event sequence is unchanged vs baseline | ❌ Wave 0 |
| GRACEFUL-FAIL | Log-write failure does NOT crash the turn | unit | `src/lib/__tests__/logger-failure.test.ts` — inject a stream that throws on write, emit events, assert turn-processor continues | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm --prefix backend test -- --run src/lib/__tests__/` (logger-specific tests, fast)
- **Per wave merge:** `npm --prefix backend test -- --run` (full backend suite)
- **Phase gate:** Full suite green + manual smoke: run one turn against real LLM, open `campaigns/{id}/logs/turn-{tick}.jsonl`, eyeball that all 18 instrumentation seams are present.

### Wave 0 Gaps

- [ ] `backend/src/lib/__tests__/logger-redact.test.ts` — covers OBS-06 a/b/c
- [ ] `backend/src/lib/__tests__/logger-truncate.test.ts` — covers OBS-05
- [ ] `backend/src/lib/__tests__/logger-context.test.ts` — AsyncLocalStorage propagation
- [ ] `backend/src/lib/__tests__/logger-multistream.test.ts` — OBS-03b
- [ ] `backend/src/lib/__tests__/logger-file-destination.test.ts` — OBS-03a
- [ ] `backend/src/lib/__tests__/logger-role-toggle.test.ts` — OBS-04
- [ ] `backend/src/lib/__tests__/logger-failure.test.ts` — GRACEFUL-FAIL
- [ ] `backend/src/engine/__tests__/turn-processor.observability.test.ts` — OBS-01, OBS-02, TURN-ID (with vi.mock for LLM)
- [ ] `backend/src/engine/__tests__/turn-processor.observability-concurrency.test.ts` — CONCURRENT
- [ ] `backend/src/routes/__tests__/chat.observability.test.ts` — STREAM-SAFE (may reuse existing chat test patterns)
- [ ] Package install: `npm --prefix backend install pino@^10.3.1 pino-pretty@^13.1.3`

## Sources

### Primary (HIGH confidence)
- `backend/src/lib/logger.ts` — current logger implementation (text-file daily).
- `backend/src/engine/turn-processor.ts` lines 1-1228 — full turn pipeline shape: `detectMovement`→ `resolveActionTargetContext` → `callOracle` → `assemblePrompt` → hidden `streamText` (with tools) → `tickPresentNpcs` (via `onBeforeVisibleNarration`) → `assembleAuthoritativeScene` → `assembleFinalNarrationPrompt` → `runVisibleNarrationWithGuard` → persist → `onPostTurn` (reflection + faction + offscreen NPC + embedder + images).
- `backend/src/routes/chat.ts` — SSE dispatcher for `/action` and `/opening`; `writeTurnEventSSE` maps TurnEvent types to SSE events.
- `backend/src/engine/oracle.ts` — Oracle payload and result types; `callOracle` → `executeOracleCall` → single LLM call at temperature 0.
- `backend/src/engine/prompt-assembler.ts` lines 1-55 — assembler imports and `createLogger("prompt-assembler")` usage.
- `backend/src/engine/npc-agent.ts` — NPC tick via `generateText` with `createNpcAgentTools`.
- `backend/src/engine/reflection-agent.ts` — reflection triggered from `checkAndTriggerReflections` in `runRollbackCriticalPostTurn`.
- `backend/src/engine/tool-executor.ts` — 11 tool handlers; entry point `executeToolCall` line 1074.
- `backend/src/vectors/embeddings.ts` — `embedTexts` with batched `embedMany`.
- `backend/src/ai/provider-registry.ts` lines 10-22 — `ProviderConfig` shape including raw `apiKey`.
- `shared/src/types.ts` lines 71-80 — `Settings` interface for extension point.
- `backend/package.json` — existing deps (pino not present).
- `npm registry` verified 2026-04-16 — `pino@10.3.1`, `pino-pretty@13.1.3`, `pino-roll@4.0.0`.
- Pino official docs: [api.md](https://github.com/pinojs/pino/blob/main/docs/api.md), [redaction.md](https://github.com/pinojs/pino/blob/main/docs/redaction.md), [transports.md](https://github.com/pinojs/pino/blob/main/docs/transports.md).
- Node.js AsyncLocalStorage stdlib docs (`node:async_hooks`) — stable since Node 16.

### Secondary (MEDIUM confidence)
- [LogRocket — Logging with Pino and AsyncLocalStorage](https://blog.logrocket.com/logging-with-pino-and-asynclocalstorage-in-node-js/) — verified against Pino docs.
- [Better Stack — Pino vs Winston](https://betterstack.com/community/guides/scaling-nodejs/pino-vs-winston/) — performance claims cross-referenced.
- [PkgPulse 2026 Benchmark](https://www.pkgpulse.com/blog/pino-vs-winston-2026) — 5-8× perf difference.
- [Dash0 — Contextual Logging](https://www.dash0.com/guides/contextual-logging-in-nodejs) — AsyncLocalStorage pattern reference.
- [SigNoz — Pino Logger Complete Guide 2026](https://signoz.io/guides/pino-logger/) — modern best practices including worker-thread transport note.

### Tertiary (LOW confidence)
- None relied upon. All claims backed by official docs or verified source code.

## Project Constraints (from CLAUDE.md)

Directives extracted from `R:/Projects/WorldForge/CLAUDE.md` that the planner must honor:

- **TypeScript strict mode, ES modules** — all new files `.ts`, use `import ... from "./x.js"` with `.js` suffix.
- **Drizzle query builder, not raw SQL** — irrelevant (no DB schema changes); noted in case plans touch `tool-executor`.
- **Zod schemas for all API payloads and AI tool definitions** — new `ObservabilityConfig` on `Settings` must have Zod schema alongside it.
- **Route handlers: outer try/catch, `parseBody()`, `getErrorStatus(error)`** — `chat.ts` already conforms; new logging must not alter flow.
- **Shared types/constants live in `@worldforge/shared`** — `ObservabilityConfig` TYPE goes in `shared/src/types.ts`; pino-specific helpers stay in `backend/src/lib/`.
- **GitNexus — MUST run `gitnexus_impact` before editing any symbol** — plans that modify `turn-processor.ts`, `prompt-assembler.ts`, `oracle.ts`, `storyteller.ts`, `npc-agent.ts`, `reflection-agent.ts`, `tool-executor.ts`, `chat.ts`, `embeddings.ts`, `logger.ts` each need this step in their VALIDATION.
- **GitNexus — MUST run `gitnexus_detect_changes()` before committing** — phase verify-work step.
- **NEVER rename symbols with find-and-replace; use `gitnexus_rename`** — `createLogger` signature stays stable, so no rename. Any internal refactor that renames must use the tool.
- **Russian for user-facing text** — NOT for logs (logs are English by convention).
- **NO FALLBACKS** (from memory): If `pino` init fails, the backend must fail loudly, not fall back to `console.log`. Add an explicit assertion.

## Metadata

**Confidence breakdown:**
- Standard stack (pino + AsyncLocalStorage): **HIGH** — both verified against official docs and npm registry on research date; pattern is industry-standard.
- Architecture patterns: **HIGH** — direct mappings from verified codebase locations (file:line cited throughout Pipeline Instrumentation Map).
- Pitfalls: **HIGH** for 1-5 (verified against pino issue tracker + AsyncLocalStorage docs); **MEDIUM** for 6-7 (inferred from codebase shape, not yet observed).
- Validation Architecture: **HIGH** — test framework is already vitest; patterns mirror existing `backend/src/engine/__tests__/` and `backend/src/lib/__tests__/` structure.

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (pino 10.x is in active maintenance; no breaking changes expected within 30 days)

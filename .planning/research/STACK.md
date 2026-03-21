# Technology Stack — Game Engine Milestone

**Project:** WorldForge
**Researched:** 2026-03-18
**Scope:** Additional libraries for game engine mechanics, NPC agents, image gen, memory, scraping, save system

## Existing Stack (Locked, Not Re-Researched)

Hono + Next.js + Drizzle/SQLite + LanceDB + Vercel AI SDK (`ai` v6) + Zod + `@ai-sdk/openai` + `@ai-sdk/anthropic`. All validated and shipping.

---

## New Stack Additions

### 1. Image Generation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@ai-sdk/fal` | ^2.0.25 | Primary image gen provider (FLUX, SD, Recraft) | First-party Vercel AI SDK provider. Uses stable `generateImage()` API. Fal hosts 100+ image models including FLUX.2, SD3.5, Recraft V3. Pay-per-use, no GPU needed. |
| `@ai-sdk/openai-compatible` | ^2.0.35 | Custom/self-hosted image providers (ComfyUI proxy, GLM, any OpenAI-compatible endpoint) | Allows custom `baseURL` for any service exposing `/v1/images/generations`. Covers DALL-E, GLM-4V, and OpenAI-compatible proxies without dedicated SDK packages. |

**Confidence:** HIGH. `generateImage()` is stable in AI SDK v6 (promoted from experimental). Both packages are first-party Vercel, actively maintained.

**Architecture decision:** Use AI SDK's `generateImage()` as the unified API. Do NOT use `fal-ai/client` directly or vendor-specific SDKs. The `@ai-sdk/fal` provider wraps fal.ai's full catalog. For self-hosted ComfyUI, wrap it behind an OpenAI-compatible proxy (e.g., `comfyui-api-proxy`) rather than using a ComfyUI TypeScript client directly, to keep the image pipeline provider-agnostic.

**What NOT to use:**
| Rejected | Why |
|----------|-----|
| `@stable-canvas/comfyui-client` | Adds ComfyUI-specific workflow API. Over-engineering when a thin OpenAI-compatible proxy in front of ComfyUI achieves the same result without coupling. |
| `fal-ai/client` (raw) | Bypasses AI SDK abstraction. `@ai-sdk/fal` wraps it properly. |
| `@ai-sdk/replicate` | Replicate's per-second billing is expensive for game use. Fal is cheaper and faster. |

### 2. Concurrent LLM Call Management

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `p-queue` | ^9.1.0 | Promise queue with concurrency control, priority, rate limiting | NPC agent ticks require multiple concurrent LLM calls (one per in-scene NPC + Oracle + Storyteller). `p-queue` handles concurrency limits, priority (Oracle > NPC > off-screen batch), pause/resume, and `intervalCap` for rate limiting. Battle-tested (sindresorhus), ESM, zero deps. |

**Confidence:** HIGH. `p-queue` is the standard for this use case. 50M+ weekly downloads. ESM native.

**Architecture decision:** Create a single `LlmQueue` wrapper around `p-queue` with:
- Concurrency = 3-5 (configurable per provider's rate limits)
- Priority levels: CRITICAL (Oracle) > HIGH (Storyteller) > NORMAL (NPC agents) > LOW (off-screen batch, image gen)
- Rate limiting via `intervalCap` + `interval` (e.g., 60 RPM for OpenRouter free tier)
- Error handling: retry with exponential backoff (2 retries), then fallback provider

**What NOT to use:**
| Rejected | Why |
|----------|-----|
| `p-limit` | Too minimal. No priority, no rate limiting, no events. We need queue features. |
| `p-ratelimit` | Last updated 2023. `p-queue` has built-in rate limiting via `intervalCap`. |
| `llm-throttle` | Niche, 20 GitHub stars. Not worth the dependency risk for marginal TPM tracking benefit. |

### 3. Multi-Step Agent Orchestration (AI SDK v6 Features)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `ai` (upgrade) | ^6.0.116 | `ToolLoopAgent` class, stable `generateImage()`, improved tool calling | Already in use at ^6.0.106. Upgrade to latest for `ToolLoopAgent` — the production-ready agent loop abstraction. Replaces manual `maxSteps` loops with a reusable agent class that handles tool execution, stop conditions, and lifecycle hooks. |

**Confidence:** HIGH. First-party Vercel. Already in the dependency tree.

**Key AI SDK v6 features to leverage:**

1. **`ToolLoopAgent`** — Define reusable agents (NPC Agent, Reflection Agent, World Engine Agent) as class instances with their own model, instructions, tools, and stop conditions. Default 20-step loop. Use `stopWhen: stepCountIs(N)` to limit NPC agent steps (3-5 is enough per tick).

2. **`generateImage()`** — Stable (no longer experimental). Provider-agnostic image gen with automatic batching.

3. **`prepareStep` hook** — Mutate step settings between iterations. Use this to inject updated game state into NPC agent context mid-loop.

4. **`experimental_repairToolCall`** — Automatic recovery when LLM returns malformed tool calls. Essential for cheaper models (Haiku, 8B) that sometimes botch JSON.

5. **Unified `generateText` + `generateObject`** — v6 unifies these for multi-step tool calling with structured output at the end. One call can do: tool calls (actions) then structured output (final NPC state update).

### 4. State Machine / Tick System

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| No library | — | Turn processing, tick counter, game state transitions | XState is overkill. The game engine has a simple linear flow: `input -> context -> Oracle -> roll -> narrate -> state update -> done`. No parallel states, no nested hierarchies, no visual editor needed. A plain TypeScript `enum` + `switch` or a simple `TurnProcessor` class with explicit methods is clearer and has zero dependencies. |

**Confidence:** HIGH. This is a design opinion backed by the domain analysis.

**Architecture decision:** Implement a `TurnProcessor` class with explicit phases:

```typescript
enum TurnPhase {
  IDLE,
  CONTEXT_ASSEMBLY,
  ORACLE_EVALUATION,
  DICE_ROLL,
  NARRATION,
  STATE_UPDATE,
  NPC_TICKS,
  COMPLETE
}
```

The tick counter is just `campaign.tickCount++` in SQLite. Macro-ticks (World Engine) trigger every N ticks via simple modulo check. No event bus, no pub/sub — direct function calls in sequence.

**What NOT to use:**
| Rejected | Why |
|----------|-----|
| XState v5 | 28kB, steep learning curve, actor model is for complex UI flows not game turns. Our turn pipeline is strictly sequential. Adding XState would mean every contributor needs to learn statecharts for a linear flow. |
| `tstate` | Newer, smaller community, solves XState's typing problems but we don't need any state machine library. |

### 5. Save / Checkpoint System

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `better-sqlite3` `.backup()` | (already installed) | Atomic SQLite database snapshots | Built-in method on `better-sqlite3`. Returns a Promise. Non-blocking — DB remains usable during backup. Creates a bit-wise identical copy. Zero new dependencies. |
| Node.js `fs.cp()` | (built-in) | Copy LanceDB vector directory | LanceDB stores data as Lance files in `campaigns/{id}/vectors/`. `fs.cp(src, dst, { recursive: true })` copies the directory. Must be done while LanceDB connection is closed or idle (no active writes). |

**Confidence:** HIGH. Both are built-in, no new dependencies.

**Architecture decision:** Checkpoint = `state.db backup` + `vectors/ directory copy` + `config.json copy` + `chat_history.json copy`. Store in `campaigns/{id}/checkpoints/{timestamp}/`. Limit to N checkpoints (configurable, default 5, oldest auto-deleted).

```typescript
async function createCheckpoint(campaignId: string): Promise<string> {
  const ts = Date.now().toString();
  const dir = `campaigns/${campaignId}/checkpoints/${ts}`;
  await fs.mkdir(dir, { recursive: true });
  await db.backup(path.join(dir, 'state.db'));
  await fs.cp(vectorsDir, path.join(dir, 'vectors'), { recursive: true });
  await fs.copyFile(configPath, path.join(dir, 'config.json'));
  await fs.copyFile(chatPath, path.join(dir, 'chat_history.json'));
  return ts;
}
```

**What NOT to use:**
| Rejected | Why |
|----------|-----|
| SQLite `.serialize()` / WAL checkpoint | `.backup()` is the correct API for point-in-time snapshots. WAL checkpoint only flushes the WAL to main DB, doesn't create a copy. |
| Third-party backup libraries | `better-sqlite3` has it built in. Adding a library would be pointless. |

### 6. Web Scraping / Lore Ingestion

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@crawlee/cheerio` | ^3.16.0 | Fandom/wiki web scraping | CheerioCrawler for HTML scraping at 500+ pages/min. Handles pagination, rate limiting, retries. Already in tech_stack.md as planned. |
| `chonkie` | ^0.3.0 | RAG text chunking for scraped content | Splits large wiki pages into lore-card-sized chunks. Token, Sentence, Recursive chunkers. TypeScript-native, lightweight. Already in tech_stack.md as planned. |

**Confidence:** MEDIUM. Both packages are relatively young. `chonkie` is at v0.3.0 — pre-1.0, API may shift. Crawlee is mature (v3.16) but we haven't used it yet.

**Fallback:** If `chonkie` proves unstable, implement a simple recursive text splitter (~50 lines) that splits on paragraphs then sentences to target chunk size. The core algorithm is trivial.

### 7. WorldBook Import

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| No new dependencies | — | SillyTavern WorldBook JSON parsing | WorldBook is plain JSON (array of entries with `keys`, `content`, `comment`, `extensions`). Parse with `JSON.parse()` + Zod schema validation. Entity separation (characters vs locations vs lore) done by LLM classification (Judge role). Cleaning (remove SillyTavern-specific fields, jailbreak prompts, formatting) is string processing. No library needed. |

**Confidence:** HIGH. V2 card parsing is already implemented client-side. WorldBook format is documented and stable.

---

## Full New Dependencies Summary

### Production Dependencies (backend)

```bash
npm install @ai-sdk/fal @ai-sdk/openai-compatible p-queue @crawlee/cheerio chonkie
```

| Package | Size | Weekly Downloads | Why Justified |
|---------|------|-----------------|---------------|
| `@ai-sdk/fal` | ~15kB | 30K+ | Image gen via AI SDK unified API |
| `@ai-sdk/openai-compatible` | ~20kB | 200K+ | Custom image/LLM providers |
| `p-queue` | ~10kB | 15M+ | Concurrent LLM call management |
| `@crawlee/cheerio` | ~50kB (+ deps) | 100K+ | Wiki scraping pipeline |
| `chonkie` | ~30kB | 5K+ | RAG text chunking |

### Already Installed (upgrade only)

```bash
npm install ai@latest
```

### No New Dependencies Needed For

- State machine / tick system (plain TypeScript)
- Save/checkpoint system (`better-sqlite3` `.backup()` + `fs.cp()`)
- WorldBook import (JSON.parse + Zod + LLM classification)
- Graph queries (SQL JOINs on existing `relationships` table)
- Context compression (prompt assembly logic, no library)
- Episodic memory (LanceDB already installed, schema exists)

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Image gen SDK | `@ai-sdk/fal` | Raw `fal-ai/client` | Bypasses AI SDK abstraction, vendor lock-in |
| Image gen SDK | `@ai-sdk/fal` | `@ai-sdk/replicate` | More expensive per-second billing |
| ComfyUI integration | OpenAI-compat proxy | `@stable-canvas/comfyui-client` | Couples to ComfyUI workflow API |
| Concurrency | `p-queue` | `p-limit` | No priority, no rate limiting |
| Concurrency | `p-queue` | Custom queue | p-queue is battle-tested, no reason to rewrite |
| State machine | Plain TypeScript | XState v5 | Overkill for sequential turn pipeline |
| Text chunking | `chonkie` | Custom splitter | Try library first, fallback to custom if unstable |
| Agent loops | AI SDK `ToolLoopAgent` | Manual `maxSteps` loop | ToolLoopAgent is reusable, has lifecycle hooks |
| DB backup | `better-sqlite3` `.backup()` | File copy of .db | `.backup()` is atomic, handles WAL correctly |

---

## Sources

- [AI SDK 6 announcement](https://vercel.com/blog/ai-sdk-6) — ToolLoopAgent, stable generateImage
- [AI SDK Image Generation docs](https://ai-sdk.dev/docs/ai-sdk-core/image-generation) — generateImage API, supported providers
- [AI SDK ToolLoopAgent reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent) — Agent class API
- [AI SDK Fal provider](https://ai-sdk.dev/providers/ai-sdk-providers/fal) — @ai-sdk/fal usage
- [@ai-sdk/fal on npm](https://www.npmjs.com/package/@ai-sdk/fal) — v2.0.25
- [AI SDK OpenAI-compatible providers](https://ai-sdk.dev/providers/openai-compatible-providers) — custom baseURL for image gen
- [p-queue on GitHub](https://github.com/sindresorhus/p-queue) — concurrency + rate limiting
- [better-sqlite3 API docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md) — .backup() method
- [Crawlee CheerioCrawler guide](https://crawlee.dev/js/docs/guides/cheerio-crawler-guide) — web scraping
- [Chonkie-TS on GitHub](https://github.com/chonkie-inc/chonkiejs) — TypeScript text chunking
- [fal.ai platform](https://fal.ai/) — image model catalog
- [ComfyUI TypeScript clients comparison](https://github.com/topics/comfyui-api?l=typescript) — evaluated and rejected

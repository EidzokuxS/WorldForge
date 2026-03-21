# Codebase Concerns

**Analysis Date:** 2026-03-19

---

## Tech Debt

**Duplicated `parseTags` / `parseGoals` helper functions:**
- Issue: `parseTags()` is copy-pasted in 6 separate engine files. `parseGoals()` is duplicated in 5 files with slightly diverging signatures (one returns `string[]`, others return `{ short_term, long_term }`).
- Files: `backend/src/engine/faction-tools.ts`, `backend/src/engine/npc-agent.ts`, `backend/src/engine/npc-tools.ts`, `backend/src/engine/reflection-agent.ts`, `backend/src/engine/reflection-tools.ts`, `backend/src/engine/tool-executor.ts`, `backend/src/engine/world-engine.ts`
- Impact: Bugs fixed in one copy silently remain in others. Already shows divergence: `parseGoals` return types differ per module.
- Fix approach: Extract `parseEntityTags(raw: string): string[]`, `parseNpcGoals(raw: string)`, etc. into `backend/src/engine/parse-helpers.ts` and import from there.

**Chat history stored as flat JSON file with read-modify-write pattern:**
- Issue: `appendChatMessages()` in `backend/src/campaign/chat-history.ts` reads entire file, pushes, writes entire file. No file lock. Two concurrent SSE streams (e.g., post-turn NPC tick + main turn write) can corrupt or silently lose messages.
- Files: `backend/src/campaign/chat-history.ts` (lines 28-36), `backend/src/engine/turn-processor.ts` (lines 241-298), `backend/src/routes/chat.ts` (lines 333-362)
- Impact: Chat history corruption. Acknowledged in project memory as "acceptable for single user" but actively triggered in the current post-turn pipeline where both the turn processor and the background post-turn hook both write.
- Fix approach: Migrate chat history into SQLite (already used for all other state), or add an async write queue / mutex around file operations.

**Module-level mutable singleton state:**
- Issue: Three modules hold process-global mutable state: `activeCampaign` in `backend/src/campaign/manager.ts:25`, `db` singleton in `backend/src/db/index.ts:5`, `connection` in `backend/src/vectors/connection.ts:5`, `lastTurnSnapshot` in `backend/src/routes/chat.ts:42`.
- Files: Listed above.
- Impact: Server restart clears `lastTurnSnapshot` (undo/retry breaks on reconnect). `activeCampaign` not request-scoped — if two clients exist simultaneously, one clobbers the other's campaign. Single-user assumption is load-bearing but undocumented.
- Fix approach: For `lastTurnSnapshot`, persist to disk alongside campaign state. For `activeCampaign`, document the single-session constraint explicitly and add a server-start check.

**`buildOnPostTurn` uses dynamic `import()` inside hot path:**
- Issue: In `backend/src/routes/chat.ts` (lines 121-123, 210-212, 411-413), modules `../db/index.js`, `../db/schema.js`, `drizzle-orm` are imported dynamically inside async callbacks that run on every turn. These resolve on first call and are cached, but the pattern is fragile and unusual.
- Files: `backend/src/routes/chat.ts`
- Impact: Minor performance overhead on first call. Bigger issue: hides dependencies and makes the post-turn callback harder to test.
- Fix approach: Hoist static imports to module top level.

**`chat.ts` file exceeds 800-line threshold:**
- Issue: `backend/src/routes/chat.ts` is 645 lines — close to the 800-line limit, and `buildOnPostTurn` alone is 180 lines of business logic sitting inside a route file.
- Files: `backend/src/routes/chat.ts`
- Impact: Difficult to follow the full turn lifecycle. The post-turn callback should be a separate orchestration module.
- Fix approach: Extract `buildOnPostTurn` to `backend/src/engine/post-turn-orchestrator.ts`.

**`prompt-assembler.ts` is 809 lines — over the limit:**
- Issue: `backend/src/engine/prompt-assembler.ts` is the largest file at 809 lines. It contains section builders, token budget logic, smart compression, and the main assembly loop.
- Files: `backend/src/engine/prompt-assembler.ts`
- Impact: Complex to modify. Token budget logic is interleaved with section building.
- Fix approach: The section-builder functions (one per data source) are already modular in structure — extract them into `backend/src/engine/prompt-sections/` sub-directory.

**`tool-executor.ts` is 637 lines with no sub-module extraction:**
- Issue: All tool implementations (spawn_npc, set_relationship, update_location, etc.) are in a single file.
- Files: `backend/src/engine/tool-executor.ts`
- Impact: Difficult to add or modify individual tool behaviors.
- Fix approach: Split by domain: `npc-tools-executor.ts`, `location-tools-executor.ts`, etc.

**Hardcoded default context window of 8192 tokens:**
- Issue: `processTurn` in `backend/src/engine/turn-processor.ts:100` and the debug endpoint in `backend/src/index.ts:41` default to `contextWindow: 8192`. Many modern models support 128k+. There is no way to configure this per-model.
- Files: `backend/src/engine/turn-processor.ts`, `backend/src/index.ts`
- Impact: Prompt budget is severely under-allocated for capable models, wasting most of the context window.
- Fix approach: Add `contextWindow` to `RoleConfig` in `@worldforge/shared`, defaulting to 32768. Pass from settings through to `processTurn`.

**Hardcoded 20-message legacy storyteller history window:**
- Issue: `backend/src/ai/storyteller.ts:34` and `backend/src/engine/turn-processor.ts:259` both use `.slice(-20)` to cap chat history. This is independent of the model's actual context window and not user-configurable.
- Files: `backend/src/ai/storyteller.ts`, `backend/src/engine/turn-processor.ts`
- Impact: Old important story context is silently dropped at turn 21 in legacy streaming mode. The `prompt-assembler` has smart compression, but the legacy `POST /api/chat` route does not use it.
- Fix approach: Remove the legacy `POST /api/chat` route (replace with `POST /api/chat/action` everywhere), or wire the legacy route through `assemblePrompt`.

---

## Known Bugs

**Single-step undo only:**
- Symptoms: After two consecutive turns, `/api/chat/undo` only reverts the last turn. There is no undo history stack — `lastTurnSnapshot` is overwritten each turn.
- Files: `backend/src/routes/chat.ts` (lines 42, 469, 563, 599)
- Trigger: Play two turns, try to undo twice.
- Workaround: Use checkpoints.

**Retry reuses player action as `intent` verbatim:**
- Symptoms: In `POST /api/chat/retry`, the code sets `intent: playerAction` (line 537). The original intent from the first attempt is lost; the Oracle receives the raw action text as intent instead of the parsed intent from the player's previous message.
- Files: `backend/src/routes/chat.ts:537`
- Trigger: Retry after any turn.
- Workaround: None at the moment.

**`runMigrations()` called on every `loadCampaign` and `createCampaign`:**
- Symptoms: `runMigrations()` runs synchronously each time a campaign is loaded or created. If migrations fail mid-run on a campaign that already had some migrations applied, the state is inconsistent.
- Files: `backend/src/campaign/manager.ts:122`, `backend/src/campaign/manager.ts:180`
- Trigger: Load any campaign.
- Workaround: Migrations are idempotent in Drizzle, so in practice this only causes minor overhead.

---

## Security Considerations

**No authentication on any API endpoint:**
- Risk: All `/api/*` routes are fully open. Anyone who can reach the server can read/write campaign data, trigger LLM calls using configured API keys, delete campaigns, or read settings (including provider API keys stored in `settings.json`).
- Files: `backend/src/index.ts` (CORS config), all route files under `backend/src/routes/`
- Current mitigation: CORS origin check via `process.env.CORS_ORIGIN ?? "http://localhost:3000"`. This prevents browser-based cross-origin requests but does not block direct curl/fetch from any origin.
- Recommendations: For single-user local deployment, bind server to `127.0.0.1` only (`hostname: "127.0.0.1"` in `serve()` options). For networked deployment, add a shared-secret middleware or session token check.

**Provider API keys exposed via `GET /api/settings`:**
- Risk: `GET /api/settings` returns the full `Settings` object, which includes plaintext API keys for all configured LLM providers. Any client that can reach the backend receives all keys.
- Files: `backend/src/routes/settings.ts:9-13`, `backend/src/settings/manager.ts`
- Current mitigation: None.
- Recommendations: Return redacted key values (`sk-...*****`) in GET response. Only accept full keys on POST for saving.

**LanceDB raw string interpolation in `embedAndUpdateEvent`:**
- Risk: `backend/src/vectors/episodic-events.ts:109` constructs a filter string as `` `id = '${eventId}'` `` and passes it to `.where()` and `.delete()`. `eventId` is a `crypto.randomUUID()` output internally, so in practice this is safe. However, the pattern is fragile — if `eventId` ever comes from user input or an LLM response, it enables filter injection.
- Files: `backend/src/vectors/episodic-events.ts` (lines 109, 120)
- Current mitigation: `eventId` is always a UUID generated server-side.
- Recommendations: Validate `eventId` against UUID regex before interpolation, or switch to LanceDB parameterized filter when the API supports it.

**`settings.json` stored alongside source code:**
- Risk: `SETTINGS_PATH` resolves to `backend/settings.json` (three directories up from `backend/src/settings/manager.ts`). If the repo root is ever served statically or checked into git, API keys are exposed.
- Files: `backend/src/settings/manager.ts:15-16`
- Current mitigation: `.gitignore` likely excludes `settings.json` (not verified).
- Recommendations: Verify `settings.json` is in `.gitignore`. Consider moving to `~/.worldforge/settings.json` or `process.env.SETTINGS_PATH`.

---

## Performance Bottlenecks

**Post-turn pipeline runs sequentially and blocks the turn response:**
- Problem: After every turn, the post-turn hook (in `buildOnPostTurn`) runs: embed events → tick present NPCs → simulate off-screen NPCs → trigger reflections → tick factions → generate images. These are await-chained. Total latency can be 5-20+ seconds depending on LLM calls.
- Files: `backend/src/routes/chat.ts:91-274`
- Cause: Awaits are sequential; the SSE stream is held open until `processTurn` generator completes, but the route function returns only after `onPostTurn` finishes (called inside the generator at `yield* completePostTurn()`).
- Improvement path: Run post-turn steps that don't produce SSE events (off-screen NPCs, reflections, image gen) as truly fire-and-forget via `void asyncFn()`, separate from the main turn generator.

**`prompt-assembler` performs N+1 DB queries for NPC relationship graph:**
- Problem: `getRelationshipGraph` in `backend/src/engine/graph-queries.ts` is called per turn and may issue multiple sequential queries to follow relationship chains.
- Files: `backend/src/engine/prompt-assembler.ts`, `backend/src/engine/graph-queries.ts`
- Cause: Graph traversal architecture.
- Improvement path: Cache the relationship graph in-memory per campaign tick; invalidate when `set_relationship` tool is called.

**`loadSettings()` reads `settings.json` from disk on every request:**
- Problem: Every route handler calls `loadSettings()` which calls `fs.readFileSync(SETTINGS_PATH)` and `JSON.parse()` on every invocation.
- Files: `backend/src/settings/manager.ts:271-292`
- Cause: No in-memory cache.
- Improvement path: Cache parsed settings in module scope; invalidate cache on `saveSettings()`.

---

## Fragile Areas

**`activeCampaign` singleton breaks multi-tab usage:**
- Files: `backend/src/campaign/manager.ts:25`
- Why fragile: The entire backend assumes exactly one active campaign at a time. Opening a second browser tab and loading a different campaign silently replaces the first. The `/api/campaigns/active` endpoint exposes this state to all clients.
- Safe modification: Before adding any multi-user or multi-tab features, replace the singleton with a request-scoped session mechanism.
- Test coverage: Not tested for concurrent access.

**`incrementTick` has a read-modify-write race on `config.json`:**
- Files: `backend/src/campaign/manager.ts:287-293`
- Why fragile: Reads the entire config, increments `currentTick`, writes it back. If two async callers (e.g., NPC tick + faction tick) run simultaneously, one increment can be lost.
- Safe modification: Protect with an in-memory tick counter that is flushed to disk; or migrate tick counter to SQLite with a transactional increment.
- Test coverage: No concurrency tests.

**`lastTurnSnapshot` reset on server restart:**
- Files: `backend/src/routes/chat.ts:42`
- Why fragile: This module-level variable is lost on any server restart, hot-reload, or process crash. The undo/retry UI shows available to the user but the server returns "Nothing to undo."
- Safe modification: Persist snapshot to `campaigns/{id}/last_snapshot.json` on write; restore on campaign load.
- Test coverage: Basic undo tests exist but no restart-recovery test.

**LanceDB connection is a module-level singleton with no reconnect logic:**
- Files: `backend/src/vectors/connection.ts`
- Why fragile: If LanceDB throws during a query (filesystem error, lock conflict), the connection is not re-established. The calling code catches and logs but does not attempt reconnect.
- Safe modification: Add reconnect logic in `getVectorDb()` that calls `openVectorDb()` if `connection` is null or if the previous call threw.
- Test coverage: Connection error scenarios untested.

**`config.json` is the source of truth for campaign metadata while SQLite has a copy:**
- Files: `backend/src/campaign/manager.ts`
- Why fragile: Campaign `name`, `premise`, `seeds`, `generationComplete`, and `currentTick` live in `config.json`. SQLite stores `name` and `premise` but they can drift (e.g., if `markGenerationComplete` updates `config.json` but the `campaigns` table row is stale).
- Safe modification: Make SQLite the single source of truth and eliminate `config.json` for all fields it duplicates.
- Test coverage: Drift scenario not tested.

---

## Test Coverage Gaps

**Image generation module has no tests:**
- What's not tested: All functions in `backend/src/images/` — `generate.ts`, `cache.ts`, `prompt-builder.ts`.
- Files: `backend/src/images/`
- Risk: Image generation errors are swallowed silently (non-blocking), so regressions would only appear as missing images with no error surface.
- Priority: Medium.

**`campaign/manager.ts` `createCampaign` and `loadCampaign` only tested at a unit level:**
- What's not tested: Concurrent load/create, failure rollback (partial campaign directory cleanup), `deleteCampaign` while stream is active.
- Files: `backend/src/campaign/__tests__/` (only `chat-history.test.ts` and `paths.test.ts` present)
- Risk: Campaign creation rollback silently fails if `fs.rmSync` throws.
- Priority: High.

**No frontend E2E tests for game page:**
- What's not tested: The full `/game` page SSE streaming, action bar submit, narrative log scroll, undo/retry UI.
- Files: `frontend/app/game/page.tsx`
- Risk: SSE parsing bugs or UI state regressions go undetected.
- Priority: High.

**`buildOnPostTurn` / post-turn orchestration has no integration test:**
- What's not tested: The sequence of embed → NPC tick → off-screen → reflection → faction tick → image gen, and their non-blocking failure isolation.
- Files: `backend/src/routes/chat.ts:91-274`
- Risk: A bug in one post-turn step silently skips all subsequent steps.
- Priority: Medium.

**`npc-offscreen` NPC batch simulation not tested under real DB conditions:**
- What's not tested: Applied location changes, goal updates written to SQLite after batch simulation.
- Files: `backend/src/engine/npc-offscreen.ts`
- Risk: Off-screen NPC state diverges from what the LLM describes.
- Priority: Medium.

---

## Scaling Limits

**SQLite per-campaign file — single writer limit:**
- Current capacity: Fine for a single-user desktop application.
- Limit: WAL mode allows concurrent reads but only one writer at a time. The NPC tick + faction tick + tool executor can all attempt writes simultaneously in the same post-turn batch.
- Scaling path: Not applicable for local single-player use; if cloud deployment is planned, migrate to PostgreSQL.

**LanceDB table grows unbounded per campaign:**
- Current capacity: Each `log_event` tool call adds a row to `episodic_events`. Long campaigns with high event frequency will accumulate thousands of rows.
- Limit: LanceDB vector search degrades with very large tables without an IVF index.
- Scaling path: Add periodic compaction that keeps only the top N events by importance + recency; or add an IVF index after table size crosses a threshold.

---

## Dependencies at Risk

**`@lancedb/lancedb` is an embedded vector DB with an unstable Node.js API:**
- Risk: The LanceDB Node.js API has changed significantly between versions (table filter API, update methods). The current code uses `.query().where(template)` and `.delete(template)` patterns that are not documented as stable.
- Impact: Upgrading `@lancedb/lancedb` may break `episodic-events.ts` and `lore-cards.ts`.
- Migration plan: Pin the version in `package.json` and add integration tests that run against a real LanceDB instance before upgrading.

**`@hono/node-ws` WebSocket upgrade — currently unused:**
- Risk: The WebSocket endpoint in `backend/src/index.ts` (lines 72-91) only handles `ping`/`pong`. No feature uses it. It adds a dependency and surface area for bugs.
- Impact: Low currently, but if Hono or `@hono/node-ws` changes its upgrade API, the dead code silently breaks.
- Migration plan: Remove the WebSocket route until it is needed, or document the intended feature.

---

## Missing Critical Features

**No request-level authentication:**
- Problem: Described in Security section. Any process that can reach port 3001 can read settings (including API keys), delete campaigns, or trigger unbounded LLM calls at the user's expense.
- Blocks: Networked or cloud deployment.

**Context window not configurable per model:**
- Problem: All models default to 8192 tokens. A 128k-context model wastes 94% of its window.
- Blocks: Effective use of larger models for long campaigns.

**No undo history beyond one step:**
- Problem: Only the most recent turn can be undone.
- Blocks: Exploring narrative branches.

---

*Concerns audit: 2026-03-19*

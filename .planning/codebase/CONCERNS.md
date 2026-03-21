# Codebase Concerns

**Analysis Date:** 2026-03-09

## Tech Debt

**Chat History Read-Modify-Write Race:**
- Issue: `appendChatMessages()` reads the entire JSON file, appends in-memory, then writes it back. The assistant message is persisted in `onFinish` callback, which fires asynchronously after streaming completes. If two requests overlap (unlikely in single-player but possible with rapid input), messages can be lost.
- Files: `backend/src/campaign/chat-history.ts` (lines 28-36)
- Impact: Lost chat messages in edge cases; corrupted history file under concurrent writes.
- Fix approach: Use a write queue (async mutex) or append-only log format (JSONL) instead of read-modify-write on a single JSON file.

**JSON-Serialized Arrays in SQLite Columns:**
- Issue: Tags, goals, assets, beliefs, equippedItems, and connectedTo are stored as JSON strings in SQLite `text` columns. Every read requires `JSON.parse()`, every write requires `JSON.stringify()`. The frontend has its own `parseJsonArray()` / `parseJsonObject()` helpers and the backend does `JSON.stringify()` at save time. No validation ensures the stored JSON is well-formed on read from DB.
- Files: `backend/src/db/schema.ts` (tags columns on every table), `backend/src/worldgen/scaffold-saver.ts` (lines 48, 105, 129), `frontend/lib/api.ts` (lines 150-170 `parseJsonArray`/`parseJsonObject`), `frontend/components/game/character-panel.tsx` (lines 11-20 `parseJsonStringArray`)
- Impact: Fragile serialization boundary. Type safety is lost between DB and application. Frontend `WorldData.player.tags` is typed as `string` (raw JSON) while `WorldData.npcs[].tags` is `string[]` (parsed) -- inconsistent API contract.
- Fix approach: Either (a) use Drizzle custom column types with built-in JSON parse/serialize, or (b) normalize into junction tables for tags. At minimum, parse player tags server-side before returning to frontend for consistency with how NPC/faction/location tags are already parsed.

**Duplicated Lore Card Embedding Logic:**
- Issue: The lore card embedding + insertion pipeline is copy-pasted in two places: the `/generate` endpoint (lines 186-207) and the `/save-edits` endpoint (lines 301-336). Both perform identical embedder resolution, embedding, and fallback-to-without-vectors logic.
- Files: `backend/src/routes/worldgen.ts` (lines 186-207, 301-336)
- Impact: Any bug fix or behavior change must be applied in two places. Easy to drift.
- Fix approach: Extract into a shared helper like `embedAndStoreLoreCards(cards, settings)` in `backend/src/vectors/` or `backend/src/routes/helpers.ts`.

**Module-Level Singleton State:**
- Issue: Three module-scoped `let` variables hold global state: `activeCampaign` in campaign manager, `db`/`sqliteConnection` in DB index, and `connection` in vectors/connection. This is fine for single-user desktop app but makes the codebase untestable without module mocking and impossible to scale to multi-user.
- Files: `backend/src/campaign/manager.ts` (line 24), `backend/src/db/index.ts` (lines 5-6), `backend/src/vectors/connection.ts` (line 5)
- Impact: Only one campaign can be active at a time (by design for now). Tests must carefully manage global state. Cannot support multiple simultaneous users.
- Fix approach: If multi-user is ever needed, wrap state in a `CampaignContext` class passed through request context. For now, document the single-user constraint explicitly.

**Worldgen Route File Size (606 lines):**
- Issue: `backend/src/routes/worldgen.ts` is the largest non-test source file at 606 lines. It contains 10+ route handlers with substantial inline logic (name resolution, DB queries, lore card processing). Many handlers share identical boilerplate: parse body, check active campaign, resolve generator, resolve names.
- Files: `backend/src/routes/worldgen.ts`
- Impact: Hard to navigate, easy to introduce inconsistencies between similar handlers.
- Fix approach: Extract repeated patterns into middleware or helper functions. Consider splitting into sub-route files (e.g., `routes/worldgen/character.ts`, `routes/worldgen/scaffold.ts`).

## Known Bugs

**Player Tags Not Parsed in WorldData Response:**
- Symptoms: `WorldData.player.tags` is typed as `string` (raw JSON string from DB), while all other entity tags (`locations`, `npcs`, `factions`, `relationships`) are parsed into `string[]` by `parseWorldData()` in the frontend API layer.
- Files: `frontend/lib/api.ts` (lines 135-148 `WorldData.player` definition, line 195 `parseWorldData` skips player parsing), `frontend/components/game/character-panel.tsx` (lines 11-20 works around it with `parseJsonStringArray`)
- Trigger: Load game page with a player character that has tags.
- Workaround: `character-panel.tsx` has its own `parseJsonStringArray()` to compensate. Works but is inconsistent with the rest of the API layer.

## Security Considerations

**API Keys Stored in Plaintext JSON:**
- Risk: All LLM provider API keys are stored in `settings.json` as plaintext strings. The file lives at `backend/settings.json` (project root level).
- Files: `backend/src/settings/manager.ts` (line 15 `SETTINGS_PATH`, line 262 `writeSettingsFile`)
- Current mitigation: `settings.json` is gitignored (or should be). Single-user desktop app reduces exposure.
- Recommendations: For any future multi-user or hosted deployment, encrypt API keys at rest or use OS keychain. Ensure `settings.json` is in `.gitignore`.

**No Authentication on Any Endpoint:**
- Risk: All API endpoints are open -- no auth tokens, no session management, no CSRF protection. Any process on the local machine can call the API.
- Files: `backend/src/index.ts` (CORS configured for localhost:3000 only)
- Current mitigation: CORS restricts browser-based cross-origin requests. Intended as single-user localhost app.
- Recommendations: If ever deployed to a network, add at minimum a shared secret header or session cookie. CORS alone does not protect against non-browser clients.

**CORS Origin is Configurable but Defaults to Wildcard Behavior:**
- Risk: `CORS_ORIGIN` env var controls allowed origins, defaulting to `http://localhost:3000`. If set to `*` or a broad pattern, any site could access the API (including reading API keys via settings endpoint).
- Files: `backend/src/index.ts` (line 19)
- Current mitigation: Default is restrictive enough for development.
- Recommendations: Document that CORS_ORIGIN must not be set to `*` in any networked deployment.

**No Input Length Limits on LLM Prompts:**
- Risk: User-provided premise, player actions, character descriptions, and additional instructions are passed directly into LLM prompts without length limits. A malicious or accidental very long input could cause expensive API calls.
- Files: `backend/src/routes/chat.ts` (line 41 `playerAction`), `backend/src/routes/worldgen.ts` (all character/generation endpoints), `backend/src/routes/schemas.ts` (Zod schemas may lack `.max()` constraints)
- Current mitigation: None. Zod schemas validate shape but not string length.
- Recommendations: Add `.max()` constraints to Zod string schemas for all user-facing text inputs.

## Performance Bottlenecks

**World Generation Pipeline is Sequential (5-6 LLM Calls):**
- Problem: `generateWorldScaffold()` makes 5-6 sequential `generateObject()` calls: research, premise, locations, factions, NPCs, lore extraction. Each waits for the previous to complete because later steps depend on earlier results.
- Files: `backend/src/worldgen/scaffold-generator.ts` (lines 286-338)
- Cause: Data dependency chain -- factions need location names, NPCs need both location and faction names. This is architecturally correct.
- Improvement path: Limited parallelization possible. Could potentially run lore extraction in parallel with NPC generation (lore only needs premise+locations+factions). Consider caching IP research results across regenerations of the same campaign.

**Chat History Loaded Entirely Into Memory:**
- Problem: `getChatHistory()` reads and parses the entire `chat_history.json` file on every chat request. As conversations grow, this becomes increasingly expensive.
- Files: `backend/src/campaign/chat-history.ts` (lines 11-26)
- Cause: JSON file is the storage format -- no streaming JSON parser, no pagination.
- Improvement path: Migrate to SQLite-backed chat storage (same campaign DB) with pagination. Or use JSONL format for append-only writes and tail-reads.

**LanceDB Table Drop/Recreate on Every Lore Update:**
- Problem: `insertLoreCards()` drops the entire `lore_cards` table and recreates it from scratch. This happens on initial generation AND on save-edits (which re-extracts all lore).
- Files: `backend/src/vectors/lore-cards.ts` (lines 45-49, 64-68)
- Cause: Simplest implementation -- no upsert logic.
- Improvement path: Use LanceDB's merge/upsert capabilities or at least diff the cards to avoid full rebuilds.

## Fragile Areas

**Frontend Type Definitions Duplicated from Shared:**
- Files: `frontend/lib/api.ts` (lines 417-423 `CampaignMeta`), `shared/src/types.ts` (also has `CampaignMeta`)
- Why fragile: `frontend/lib/api.ts` defines its own `CampaignMeta` interface with only 5 fields (`id`, `name`, `premise`, `createdAt`, `updatedAt`), while `@worldforge/shared` exports a `CampaignMeta` with additional fields (`seeds`, `generationComplete`). The game page imports from `@worldforge/shared`, but other places use the local definition. Adding a new field to one but not the other will cause silent type mismatches.
- Safe modification: Delete the local `CampaignMeta` in `frontend/lib/api.ts` and import from `@worldforge/shared` everywhere.
- Test coverage: No type-level tests verify alignment.

**Scaffold Save Deletes All Data Before Re-Inserting:**
- Files: `backend/src/worldgen/scaffold-saver.ts` (line 27-32 `clearExistingScaffold`)
- Why fragile: `saveScaffoldToDb()` deletes ALL locations, NPCs, factions, and relationships for the campaign, then re-inserts from the scaffold. Any data added outside the scaffold (e.g., runtime-created NPCs, player relationships) is permanently destroyed.
- Safe modification: When adding runtime game state that references these entities, either (a) skip scaffold-save for in-progress games, or (b) diff and merge instead of delete-all.
- Test coverage: No tests verify data preservation during re-save.

**SSE Parsing in Frontend generateWorld():**
- Files: `frontend/lib/api.ts` (lines 328-373)
- Why fragile: Hand-rolled SSE parser that splits on newlines and manually extracts `event:` and `data:` prefixes. Does not handle multi-line data fields, comments, or retry directives per the SSE spec. If the backend ever sends multi-line data or the network chunks data mid-line in unexpected ways, parsing will break silently.
- Safe modification: Use the `eventsource-parser` npm package or the native `EventSource` API instead of manual parsing.
- Test coverage: No tests for SSE parsing.

**WebSocket Connection is Unused:**
- Files: `backend/src/index.ts` (lines 32-51)
- Why fragile: WebSocket upgrade handler exists and responds to `ping` with `pong`, but no feature uses WebSocket communication. It is dead code that adds maintenance burden and a potential attack surface.
- Safe modification: Remove unless WebSocket features are planned for the next sprint.
- Test coverage: None.

## Scaling Limits

**Single Campaign Active at a Time:**
- Current capacity: One campaign loaded in memory (one SQLite DB, one LanceDB connection).
- Limit: Loading a new campaign closes the previous one. No way to run multiple campaigns.
- Scaling path: Wrap DB/vector connections in a campaign context object, keyed by campaign ID.

**Chat History as Single JSON File:**
- Current capacity: Works well for hundreds of messages.
- Limit: At thousands of messages, full-file read/parse/write becomes slow and memory-intensive.
- Scaling path: Migrate to SQLite `chronicle` table (schema already exists but unused for chat) or JSONL format.

**Embeddings Batch Size Fixed at 50:**
- Current capacity: Handles up to ~50 lore cards efficiently.
- Limit: If lore cards exceed 50, multiple sequential API calls are made. Each batch is awaited.
- Scaling path: `backend/src/vectors/embeddings.ts` (line 5 `BATCH_SIZE = 50`) -- could parallelize batches with `Promise.all()`.

## Dependencies at Risk

**@lancedb/lancedb (Embedded Vector DB):**
- Risk: Native binary dependency (Rust-based). Platform-specific builds can fail on unusual OS/arch combinations. The package is relatively young and API may change.
- Impact: Vector search (lore cards) breaks entirely if the native module fails to load.
- Migration plan: LanceDB data is campaign-scoped and expendable (can be regenerated). If needed, could migrate to SQLite FTS5 for keyword search or a pure-JS vector similarity implementation.

**@modelcontextprotocol/sdk (MCP for DuckDuckGo research):**
- Risk: Used for IP research via DuckDuckGo MCP server. Requires a running MCP server process. If the MCP protocol changes or the DDG server is unavailable, research falls back to LLM-only.
- Impact: Graceful degradation -- LLM fallback exists. But the fallback produces lower-quality research.
- Migration plan: Already has fallback. Could replace MCP with direct HTTP search API.

## Missing Critical Features

**No Context Window Management:**
- Problem: The Storyteller receives the full chat history plus world premise in every request. There is no token counting, no truncation, no summarization. As conversations grow, the prompt will exceed the model's context window.
- Blocks: Long gameplay sessions will eventually fail with token limit errors.
- Files: `backend/src/routes/chat.ts` (lines 56-58 loads full history), `backend/src/ai/storyteller.ts` (presumably passes all messages to LLM)

**No Game State Updates from Narrative:**
- Problem: The Storyteller generates prose but no mechanism exists to update game state (player location, HP, inventory, NPC status) based on narrative events. The Judge role is defined but not wired into the game loop.
- Blocks: Game state is static after creation. HP never changes, player never moves, items are never gained/lost.
- Files: All game state tables exist in `backend/src/db/schema.ts` but only the scaffold saver and character save write to them.

**Episodic Memory Not Implemented:**
- Problem: LanceDB schema supports episodic events but no code writes or reads them. The Storyteller has no access to semantic memory of past events.
- Blocks: Long-term narrative coherence. The LLM cannot recall events beyond the chat history window.
- Files: `backend/src/vectors/` -- only `lore-cards.ts` is implemented. No `episodic-events.ts` equivalent.

## Test Coverage Gaps

**No Integration Tests for Route Handlers:**
- What's not tested: All route handlers in `backend/src/routes/worldgen.ts`, `backend/src/routes/chat.ts`, `backend/src/routes/campaigns.ts` have zero integration tests. The only route test is `schemas.test.ts` which tests schema validation helpers.
- Files: `backend/src/routes/worldgen.ts`, `backend/src/routes/chat.ts`, `backend/src/routes/campaigns.ts`
- Risk: Route-level logic (campaign validation, name resolution, error handling branches) is completely untested.
- Priority: High -- these are the main entry points for all features.

**No Tests for Scaffold Saver:**
- What's not tested: `saveScaffoldToDb()` -- the function that writes the entire world scaffold to SQLite. Transaction logic, adjacency graph building, relationship insertion are all untested.
- Files: `backend/src/worldgen/scaffold-saver.ts`
- Risk: Data corruption on save. The delete-all-then-reinsert strategy is especially risky without tests.
- Priority: High -- data integrity depends on this function.

**No Frontend Tests:**
- What's not tested: Zero test files exist under `frontend/`. All React components, hooks, API helpers, and the SSE parser are untested.
- Files: `frontend/` (entire directory)
- Risk: UI regressions, broken API integration, SSE parsing bugs go undetected.
- Priority: Medium -- most frontend logic is thin wrappers, but `frontend/lib/api.ts` (568 lines with parsing logic) and `frontend/components/title/use-new-campaign-wizard.ts` (283 lines with complex state machine) are high-value test targets.

**No Tests for Vector/LanceDB Operations:**
- What's not tested: `insertLoreCards()`, `searchLoreCards()`, `getAllLoreCards()`, `deleteCampaignLore()`, `embedTexts()`.
- Files: `backend/src/vectors/lore-cards.ts`, `backend/src/vectors/embeddings.ts`
- Risk: Vector search returning wrong results, embedding failures, table schema changes breaking silently.
- Priority: Medium -- these functions have simple logic but depend on native binaries.

---

*Concerns audit: 2026-03-09*

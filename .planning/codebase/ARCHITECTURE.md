# Architecture

**Analysis Date:** 2026-03-19

## Pattern Overview

**Overall:** Deterministic Game Engine + LLM-as-Narrator

**Key Characteristics:**
- LLM never modifies game state directly. All state changes go through typed tool calls validated by the backend engine.
- 4 LLM roles with distinct responsibilities: Judge (probability), Storyteller (narrative), Generator (world gen), Embedder (vectors). Each resolved at runtime from provider settings.
- Dual storage: SQLite (source of truth for all game state) + LanceDB (semantic search over lore cards and episodic events).
- Single active campaign in server memory at a time. Campaign scoped data lives in `campaigns/{uuid}/`.
- Monorepo with three packages: `shared/` (types/constants), `backend/` (Hono API), `frontend/` (Next.js).

## Layers

**Shared Types (`shared/src/`):**
- Purpose: Cross-package type contracts
- Location: `shared/src/types.ts`, `shared/src/settings.ts`, `shared/src/chat.ts`
- Contains: `Settings`, `Provider`, `RoleConfig`, `CampaignMeta`, `WorldSeeds`, `ChatMessage`, `PlayerCharacter`
- Depends on: nothing (pure types + pure functions)
- Used by: both `backend/` and `frontend/`

**Route Layer (`backend/src/routes/`):**
- Purpose: HTTP entry points, request validation, response shaping
- Location: `backend/src/routes/`
- Contains: `campaigns.ts`, `chat.ts`, `worldgen.ts`, `character.ts`, `lore.ts`, `settings.ts`, `ai.ts`, `images.ts`
- Depends on: all service layers, `helpers.ts` (role resolver, `parseBody`, `requireActiveCampaign`)
- Used by: `backend/src/index.ts`
- Pattern: outer try/catch wrapping entire handler body; `parseBody(c, schema)` for Zod validation; `getErrorStatus(error)` for status codes

**Engine Layer (`backend/src/engine/`):**
- Purpose: Deterministic turn processing; Oracle probability system; prompt assembly; NPC agents; world simulation
- Location: `backend/src/engine/`
- Contains: `turn-processor.ts`, `oracle.ts`, `prompt-assembler.ts`, `tool-schemas.ts`, `tool-executor.ts`, `state-snapshot.ts`, `npc-agent.ts`, `npc-offscreen.ts`, `reflection-agent.ts`, `world-engine.ts`, `faction-tools.ts`, `token-budget.ts`, `graph-queries.ts`
- Depends on: `db/`, `campaign/`, `vectors/`, `ai/`
- Used by: `routes/chat.ts`

**AI Layer (`backend/src/ai/`):**
- Purpose: LLM provider abstraction; model creation; role resolution; storyteller streaming
- Location: `backend/src/ai/`
- Contains: `provider-registry.ts`, `resolve-role-model.ts`, `storyteller.ts`, `test-connection.ts`
- Depends on: `@ai-sdk/openai`, Vercel AI SDK `ai` package, `@worldforge/shared`
- Used by: engine layer, route helpers

**Campaign Layer (`backend/src/campaign/`):**
- Purpose: Campaign lifecycle management; chat history; checkpoints; tick counter
- Location: `backend/src/campaign/`
- Contains: `manager.ts`, `chat-history.ts`, `checkpoints.ts`, `paths.ts`, `index.ts`
- Depends on: `db/`, `vectors/`, `worldgen/`
- Used by: routes, engine

**World Generation Layer (`backend/src/worldgen/`):**
- Purpose: World scaffold generation pipeline; seed rolling; lore extraction; character generation; IP research; WorldBook import
- Location: `backend/src/worldgen/`
- Contains: `scaffold-generator.ts`, `seed-roller.ts`, `seed-suggester.ts`, `scaffold-saver.ts`, `lore-extractor.ts`, `ip-researcher.ts`, `starting-location.ts`, `worldbook-importer.ts`, `types.ts`
- Depends on: `ai/`, `db/`, `vectors/`
- Used by: `routes/worldgen.ts`, `routes/character.ts`

**Character Layer (`backend/src/character/`):**
- Purpose: Player and NPC character generation (parse/generate/research/import V2 card)
- Location: `backend/src/character/`
- Contains: `generator.ts`, `npc-generator.ts`, `archetype-researcher.ts`, `v2-sections.ts`, `index.ts`
- Depends on: `ai/`
- Used by: `routes/character.ts`

**Database Layer (`backend/src/db/`):**
- Purpose: SQLite schema definitions and connection management
- Location: `backend/src/db/`
- Contains: `schema.ts` (8 tables), `index.ts` (connection singleton), `migrate.ts`
- Depends on: `drizzle-orm`, `better-sqlite3`
- Used by: engine, worldgen, campaign layers

**Vector Layer (`backend/src/vectors/`):**
- Purpose: LanceDB embedded vector store for lore cards and episodic events; text embedding
- Location: `backend/src/vectors/`
- Contains: `connection.ts`, `embeddings.ts`, `lore-cards.ts`, `episodic-events.ts`, `index.ts`
- Depends on: `@lancedb/lancedb`, `ai/`
- Used by: engine (prompt assembler), worldgen (lore storage), routes (lore endpoints)

**Settings Layer (`backend/src/settings/`):**
- Purpose: Server-side settings persistence (`settings.json`)
- Location: `backend/src/settings/`
- Contains: `manager.ts`
- Used by: all route handlers via `loadSettings()`

**Frontend (`frontend/`):**
- Purpose: Next.js App Router UI — title screen, settings, world review, character creation, game
- Location: `frontend/app/`, `frontend/components/`, `frontend/lib/`
- Depends on: backend via REST at `http://localhost:3001`
- State: local React state only; no global state manager

## Data Flow

**Campaign Creation Flow:**

1. User submits name + premise on Title Screen (`frontend/app/page.tsx`)
2. `POST /api/campaigns` → `backend/src/routes/campaigns.ts` → `campaign/manager.ts` creates UUID directory, `state.db`, `config.json`, `chat_history.json`, `vectors/`
3. `POST /api/worldgen/generate` streams SSE progress events while pipeline runs: IP Research → Premise Refinement → Locations → Factions → NPCs → Lore Extraction
4. `saveScaffoldToDb()` writes entities to SQLite; `storeLoreCards()` embeds and stores in LanceDB
5. Frontend redirects to `/campaign/[id]/character`

**Turn Cycle Flow (Core Gameplay):**

1. Player submits action via `ActionBar` → `POST /api/chat/action` with `{ playerAction, intent, method }`
2. Route handler resolves Judge + Storyteller providers, captures `TurnSnapshot` for undo
3. `processTurn()` generator in `engine/turn-processor.ts`:
   - Queries player state + location from SQLite
   - Detects movement commands; applies location change if valid graph connection
   - Calls Oracle (`callOracle()` via Judge LLM `generateObject`) → yields `oracle_result` SSE event
   - `assemblePrompt()` gathers: system rules + world premise + scene context + player state + NPC states + lore search results + episodic memory + chat history (with smart compression) + Oracle outcome directive
   - Calls Storyteller (`streamText`) with tool definitions → streams narrative text + tool call results
   - Persists assistant message; increments tick; yields `done` SSE event
4. `onPostTurn` callback (non-blocking): embeds `log_event` calls to episodic vector store, ticks NPC agents, simulates off-screen NPCs, checks reflection thresholds, ticks factions, generates scene/location images

**Lore Search Flow:**

1. `assemblePrompt()` calls `searchLoreCards()` with player action as query
2. `embedTexts()` generates embedding via Embedder LLM role
3. LanceDB cosine similarity search returns top-N lore cards
4. Results injected into prompt as `[LORE CONTEXT]` section

**State Management:**
- Backend: single `activeCampaign` module-level variable in `campaign/manager.ts`; SQLite per-campaign `state.db`; `chat_history.json` on disk
- Frontend: local `useState` per page; no shared state, no global store
- Turn undo: in-memory `lastTurnSnapshot` in `routes/chat.ts` (module-level, single-step only)

## Key Abstractions

**LLM Role System:**
- Purpose: Decouple AI behavior from provider configuration
- Examples: `backend/src/ai/resolve-role-model.ts`, `backend/src/routes/helpers.ts`
- Pattern: `resolveJudge(settings)` / `resolveStoryteller(settings)` / `resolveGenerator(settings)` / `resolveEmbedder(settings)` return `ResolveResult = { resolved: ResolvedRole } | { error: string; status: 400 }`

**Oracle Probability System:**
- Purpose: Deterministic outcome resolution separate from narrative generation
- Examples: `backend/src/engine/oracle.ts`
- Pattern: Judge LLM returns `{ chance: 1-99 }` via `generateObject` → D100 roll → `strong_hit / weak_hit / miss` tier → instruction injected into Storyteller system prompt

**Tool Calling for State Mutations:**
- Purpose: Storyteller declares intent via tools; engine validates and executes
- Examples: `backend/src/engine/tool-schemas.ts`, `backend/src/engine/tool-executor.ts`
- Pattern: `createStorytellerTools(campaignId, tick)` returns Zod-validated tool definitions; each tool call is intercepted in `fullStream` and dispatched to `executeToolCall()`

**TurnSnapshot for Undo:**
- Purpose: Pre-turn game state capture for single-step rollback
- Examples: `backend/src/engine/state-snapshot.ts`
- Pattern: `captureSnapshot(campaignId)` records entity IDs before turn; `restoreSnapshot()` deletes spawned entities; `popLastMessages()` removes chat entries

**Tag System:**
- Purpose: All character/location/faction traits expressed as string tags, stored as JSON arrays in SQLite `text` columns
- Examples: `backend/src/db/schema.ts` columns `tags text NOT NULL DEFAULT '[]'`
- Pattern: tags are the universal trait carrier — skills, relationships, wealth, affiliations. Only numeric field: HP (1-5 integer).

**SSE Streaming:**
- Purpose: Long-running operations (turn processing, world generation) stream progress to frontend
- Examples: `backend/src/routes/chat.ts` (`streamSSE`), `backend/src/routes/worldgen.ts`
- Pattern: Hono `streamSSE()` writes typed events (`event: oracle_result`, `event: narrative`, `event: state_update`, `event: done`); frontend `parseTurnSSE()` in `frontend/lib/api.ts` dispatches to typed handler callbacks

## Entry Points

**Backend Server:**
- Location: `backend/src/index.ts`
- Triggers: `node` / `tsx` via `npm run dev`
- Responsibilities: Creates Hono app, registers all route modules, sets up WebSocket upgrade, starts `@hono/node-server` on port 3001, handles graceful shutdown

**Frontend App:**
- Location: `frontend/app/layout.tsx`, `frontend/app/page.tsx`
- Triggers: Next.js dev server on port 3000
- Responsibilities: Root layout (fonts, dark theme, Toaster); Title Screen as default route

**Campaign Setup Wizard:**
- Location: `frontend/components/title/use-new-campaign-wizard.ts`, `frontend/components/title/new-campaign-dialog.tsx`
- Triggers: "New Campaign" button on title screen
- Responsibilities: 2-step wizard (concept input → World DNA seeds → world generation with SSE progress overlay)

## Error Handling

**Strategy:** Structured error types propagated as JSON responses with consistent status codes

**Patterns:**
- `AppError` class in `backend/src/lib/errors.ts` carries an HTTP status code
- `getErrorStatus(error)` returns the status from `AppError`, or 500 for unknown errors
- `getErrorMessage(error, fallback)` extracts message from `Error` or `AppError`
- All route handlers wrap their body in a single outer `try/catch` that calls both helpers
- Frontend `readErrorMessage(response)` parses `{ error: string }` from API error responses
- Non-blocking post-turn operations (NPC ticks, image gen, embeddings) are individually try/caught and logged as warnings without failing the turn

## Cross-Cutting Concerns

**Logging:** Structured logger from `backend/src/lib/logger.ts`; `createLogger(module)` returns `{ info, warn, error, debug }`. Used throughout backend modules. Never `console.log` in production code.

**Validation:** All API request bodies validated with Zod schemas defined in `backend/src/routes/schemas.ts`. Shared types also defined in `shared/src/types.ts`. Frontend API calls are typed against `frontend/lib/api-types.ts`.

**Security:** `assertSafeId(id)` in `backend/src/campaign/paths.ts` validates campaign IDs against UUID regex to prevent path traversal. Applied before any file system access on user-supplied IDs.

**Authentication:** None. Single-user local application.

---

*Architecture analysis: 2026-03-19*

# Architecture

**Analysis Date:** 2026-03-09

## Pattern Overview

**Overall:** Client-Server with LLM Orchestration Layer

**Key Characteristics:**
- Separate Next.js frontend (port 3000) and Hono backend (port 3001) communicating via REST + SSE
- Backend orchestrates all LLM interactions through a role-based AI system (Judge, Storyteller, Generator, Embedder)
- LLM is narrator only -- the engine is deterministic. LLM never modifies game state directly.
- Campaign-scoped data isolation: each campaign gets its own SQLite DB file + LanceDB vector directory
- In-memory singleton pattern for active campaign state (one campaign loaded at a time)
- All AI tool calls use Vercel AI SDK (`generateObject`, `streamText`) with Zod schemas for structured output

## Layers

**Routes (HTTP API):**
- Purpose: Request handling, validation, response formatting
- Location: `backend/src/routes/`
- Contains: Hono route handlers for all API endpoints
- Key files: `campaigns.ts`, `worldgen.ts`, `chat.ts`, `ai.ts`, `settings.ts`, `lore.ts`
- Depends on: Schemas, Campaign Manager, AI layer, Settings, Worldgen, Vectors
- Used by: Frontend via `frontend/lib/api.ts`
- Pattern: Each route file creates a `new Hono()` instance, exported as default, mounted in `backend/src/index.ts`

**Schemas (Validation):**
- Purpose: Zod schemas for all request payloads, shared validation logic
- Location: `backend/src/routes/schemas.ts`
- Contains: All Zod schemas, `parseBody()` utility for request validation
- Depends on: Zod
- Used by: All route handlers via `parseBody(c, schema)`
- Pattern: Every POST endpoint calls `parseBody()` first; if validation fails, returns `{ response }` error immediately

**Route Helpers:**
- Purpose: Resolve LLM role configurations from settings into usable provider configs
- Location: `backend/src/routes/helpers.ts`
- Contains: `resolveGenerator()`, `resolveStoryteller()`, `resolveEmbedder()`
- Depends on: AI layer (`resolveRoleModel`), Settings
- Used by: Route handlers before any LLM call
- Pattern: Returns discriminated union `{ resolved: ResolvedRole } | { error: string; status: 400 }`

**AI Layer:**
- Purpose: LLM provider abstraction, model creation, role resolution
- Location: `backend/src/ai/`
- Contains: Provider registry, storyteller, role model resolver, connection tester
- Key files: `provider-registry.ts` (creates OpenAI-compatible models), `storyteller.ts` (streaming narrative), `resolve-role-model.ts`, `test-connection.ts`
- Depends on: Vercel AI SDK (`ai`, `@ai-sdk/openai`), Settings types
- Used by: Routes, Worldgen, Character generators
- Pattern: All providers use `createOpenAI()` with custom `baseURL` -- everything goes through OpenAI-compatible API

**Campaign Manager:**
- Purpose: Campaign lifecycle (create, load, delete), active campaign state
- Location: `backend/src/campaign/`
- Contains: Campaign CRUD, chat history persistence, path utilities
- Key files: `manager.ts` (CRUD + in-memory active campaign), `chat-history.ts` (JSON file read/write), `paths.ts` (path resolution + ID validation)
- Depends on: DB layer, Vector DB, filesystem
- Used by: Routes
- Pattern: Module-level `let activeCampaign` singleton. Loading a campaign connects its SQLite DB + opens its LanceDB directory.

**Database Layer:**
- Purpose: SQLite connection management, schema definitions
- Location: `backend/src/db/`
- Contains: Connection singleton, Drizzle schema, migrations
- Key files: `index.ts` (connect/get/close), `schema.ts` (8 tables), `migrate.ts`
- Depends on: `better-sqlite3`, `drizzle-orm`
- Used by: Campaign Manager, Routes, Worldgen scaffold saver
- Pattern: Global singleton `db` variable. Only one DB connected at a time (one campaign active). WAL mode + foreign keys enabled.

**Vectors Layer:**
- Purpose: LanceDB vector database for semantic search (lore cards)
- Location: `backend/src/vectors/`
- Contains: Embedding generation, lore card CRUD, vector DB connection
- Key files: `lore-cards.ts` (insert/search/delete), `embeddings.ts` (call embedder model), `connection.ts` / `index.ts`
- Depends on: `@lancedb/lancedb`, AI layer (for embeddings)
- Used by: Routes (lore endpoints, worldgen)
- Pattern: Campaign-scoped vector DB at `campaigns/{id}/vectors/`. Tables are dropped and recreated on each world generation.

**Worldgen Layer:**
- Purpose: World scaffold generation pipeline (premise, locations, factions, NPCs, lore)
- Location: `backend/src/worldgen/`
- Contains: Seed roller, seed suggester, scaffold generator (multi-step), scaffold saver, lore extractor, IP researcher
- Key files: `scaffold-generator.ts` (5-step pipeline), `scaffold-saver.ts` (DB writes), `seed-roller.ts`, `seed-suggester.ts`, `ip-researcher.ts`, `lore-extractor.ts`
- Depends on: AI layer, DB layer
- Used by: Worldgen routes
- Pattern: Pipeline with SSE progress reporting. Each step is a separate `generateObject` call. IP researcher uses DuckDuckGo MCP for known franchises.

**Character Layer:**
- Purpose: Player character and NPC generation/parsing
- Location: `backend/src/character/`
- Contains: Character generator (parse/generate/import), NPC generator, archetype researcher
- Key files: `generator.ts` (player characters), `npc-generator.ts` (key NPCs), `archetype-researcher.ts`
- Depends on: AI layer
- Used by: Worldgen routes
- Pattern: Each function takes a premise + role config, uses `generateObject` with Zod schemas to produce structured character data

**Settings Layer:**
- Purpose: Server-side settings persistence and normalization
- Location: `backend/src/settings/`
- Contains: Settings load/save, normalization, provider merging
- Key files: `manager.ts` (normalize, load, save, rebind)
- Depends on: `@worldforge/shared` (defaults, presets)
- Used by: Routes, all LLM-calling code
- Pattern: File-based (`settings.json` at project root). Auto-normalizes on load, merges builtin provider presets with user-saved data.

**Shared Package:**
- Purpose: Types, constants, defaults shared between frontend and backend
- Location: `shared/src/`
- Contains: TypeScript types, builtin provider presets, default settings factory, error utilities
- Key files: `types.ts` (Provider, Settings, ChatMessage, WorldSeeds, PlayerCharacter), `settings.ts` (defaults + presets), `errors.ts`, `chat.ts`
- Depends on: Nothing
- Used by: Backend and Frontend via `@worldforge/shared`

**Frontend API Client:**
- Purpose: Typed HTTP client for all backend endpoints
- Location: `frontend/lib/api.ts`
- Contains: Generic `apiGet`, `apiPost`, `apiDelete`, `apiStreamPost` helpers + typed endpoint functions
- Depends on: Frontend types
- Used by: All frontend pages and components
- Pattern: All functions call `API_BASE` (default `http://localhost:3001`). SSE parsing is manual (for world generation). JSON arrays stored as strings in DB are parsed client-side.

**Frontend Pages:**
- Purpose: Next.js App Router pages
- Location: `frontend/app/`
- Contains: Title screen, game page, settings, campaign character creation, campaign world review
- Key pages: `page.tsx` (title), `game/page.tsx`, `settings/page.tsx`, `campaign/[id]/character/page.tsx`, `campaign/[id]/review/page.tsx`
- Depends on: Components, API client, types
- Pattern: All pages are `"use client"`. No server components in use. State managed with React hooks (useState, useEffect).

**Frontend Components:**
- Purpose: Reusable UI components organized by feature
- Location: `frontend/components/`
- Contains: Game panels, title screen dialogs, character creation forms, world review sections, Shadcn UI primitives
- Key dirs: `game/` (5 panels), `title/` (dialogs + wizard hook), `character-creation/` (form + card), `world-review/` (5 sections + helpers), `ui/` (Shadcn)
- Depends on: API client, Shadcn UI, Tailwind CSS
- Used by: Pages

**Lib (Frontend Utilities):**
- Purpose: Shared frontend utilities
- Location: `frontend/lib/`
- Contains: API client, settings helpers, types, V2 card parser, general utils
- Key files: `api.ts`, `types.ts` (re-exports + frontend-specific types), `settings.ts`, `v2-card-parser.ts`, `use-settings.ts`

## Data Flow

**Campaign Creation Flow:**

1. User fills name + premise on title screen (`frontend/app/page.tsx` -> `NewCampaignDialog`)
2. Optional: World DNA step -- roll or AI-suggest seeds (`/api/worldgen/roll-seeds`, `/api/worldgen/suggest-seeds`)
3. `POST /api/campaigns` creates campaign directory, SQLite DB, config.json, vector DB
4. `POST /api/worldgen/generate` starts SSE-streamed 5-step pipeline:
   - Step 0: IP research (if enabled, via DuckDuckGo MCP)
   - Step 1: Refined premise (`generateObject`)
   - Step 2: Locations (`generateObject`)
   - Step 3: Factions (`generateObject`)
   - Step 4: NPCs (`generateObject`)
   - Step 5: Lore extraction + embedding
5. Scaffold saved to SQLite via `saveScaffoldToDb()`, lore cards saved to LanceDB
6. Redirect to world review page (`/campaign/[id]/review`)
7. User edits scaffold, saves via `POST /api/worldgen/save-edits`
8. User creates character on `/campaign/[id]/character`, saves via `POST /api/worldgen/save-character`
9. Redirect to game page (`/game`)

**Gameplay Chat Flow:**

1. Player types action in ActionBar (`frontend/components/game/action-bar.tsx`)
2. `POST /api/chat` with `{ playerAction }`
3. Backend loads chat history from `chat_history.json`, builds system prompt with world premise
4. `streamText()` via Vercel AI SDK sends to Storyteller LLM
5. Response streamed as plain text to frontend
6. `onFinish` callback persists assistant message to chat history file
7. Frontend displays streamed text in NarrativeLog

**State Management:**
- No global state manager (no Redux, Zustand, etc.)
- React `useState` + `useEffect` in each page
- Settings fetched from server on page load
- Campaign state is server-side (in-memory singleton + filesystem)
- Chat history persisted as JSON file per campaign

## Key Abstractions

**ResolvedRole:**
- Purpose: Fully resolved LLM configuration ready for API calls
- Examples: returned by `backend/src/routes/helpers.ts` functions
- Pattern: Discriminated union result type -- `{ resolved: ResolvedRole } | { error, status }`
- Contains: `provider` (baseUrl, apiKey, model), `temperature`, `maxTokens`

**Campaign Lifecycle:**
- Purpose: Represents the active campaign and its connected resources
- Examples: `backend/src/campaign/manager.ts`
- Pattern: Module-level singleton. Loading connects SQLite + LanceDB. Deleting disconnects + removes directory. Only one campaign active at a time.

**WorldScaffold:**
- Purpose: Complete generated world data before DB persistence
- Examples: returned by `backend/src/worldgen/scaffold-generator.ts`
- Pattern: Intermediate data structure with `refinedPremise`, `locations[]`, `factions[]`, `npcs[]`, `loreCards[]`. Passed to `saveScaffoldToDb()` for persistence.

**parseBody:**
- Purpose: Standardized request validation across all routes
- Examples: `backend/src/routes/schemas.ts`
- Pattern: Takes Hono context + Zod schema, returns `{ data }` or `{ response }` (error). Every POST handler starts with this call.

## Entry Points

**Backend Server:**
- Location: `backend/src/index.ts`
- Triggers: `npm run dev` (tsx watch)
- Responsibilities: Creates Hono app, mounts all route groups, sets up CORS, WebSocket, starts HTTP server on port 3001

**Frontend App:**
- Location: `frontend/app/layout.tsx` + `frontend/app/page.tsx`
- Triggers: `npm run dev` (Next.js dev server on port 3000)
- Responsibilities: Root layout with fonts + Toaster, title screen as home page

**Shared Package:**
- Location: `shared/src/index.ts`
- Triggers: Imported as `@worldforge/shared`
- Responsibilities: Re-exports all shared types, constants, utility functions

## Error Handling

**Strategy:** Outer try/catch in every route handler with typed error responses

**Patterns:**
- `AppError` class (`backend/src/lib/errors.ts`) with `statusCode` property for domain errors (400, 404, 500)
- `getErrorMessage(error, fallback)` extracts error message or returns fallback string (shared package)
- `getErrorStatus(error, fallback)` extracts status code from `AppError` or returns fallback (500)
- Every route handler wraps entire body in try/catch, returns `c.json({ error }, status)`
- `parseBody()` returns validation errors as `{ response }` instead of throwing
- Frontend `readErrorMessage()` extracts `{ error }` from response JSON or falls back to statusText

## Cross-Cutting Concerns

**Logging:** `console.log` / `console.error` only. No structured logging framework.

**Validation:** Zod schemas for all API payloads (`backend/src/routes/schemas.ts`). Settings normalized on load/save (`backend/src/settings/manager.ts`). Campaign IDs validated via `assertSafeId()` regex.

**Authentication:** None. Single-user local application. No auth middleware.

**Security:** `assertSafeId()` prevents path traversal via campaign IDs (`backend/src/campaign/paths.ts`). CORS restricted to frontend origin. API keys stored in `settings.json` (not environment variables).

**Streaming:** Two patterns -- SSE via `streamSSE()` for world generation progress, plain text streaming via `streamText().toTextStreamResponse()` for chat.

---

*Architecture analysis: 2026-03-09*

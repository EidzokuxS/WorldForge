# Codebase Structure

**Analysis Date:** 2026-03-19

## Directory Layout

```
worldforge/
├── shared/                          # @worldforge/shared — cross-package types and constants
│   └── src/
│       ├── types.ts                 # Settings, Provider, CampaignMeta, WorldSeeds, ChatMessage, PlayerCharacter
│       ├── settings.ts              # createDefaultSettings, BUILTIN_PROVIDER_PRESETS, firstProviderId
│       ├── chat.ts                  # isChatMessage type guard
│       ├── errors.ts                # getErrorMessage (shared with frontend)
│       └── index.ts                 # barrel export
├── backend/
│   ├── src/
│   │   ├── index.ts                 # Hono app entry point — route registration, server start, WebSocket
│   │   ├── ai/                      # LLM provider abstraction
│   │   │   ├── provider-registry.ts # createModel(ProviderConfig) → ai SDK model instance
│   │   │   ├── resolve-role-model.ts # resolveRoleModel(roleConfig, providers) → ResolvedRole
│   │   │   ├── storyteller.ts       # callStoryteller() — plain-text streaming (legacy endpoint)
│   │   │   └── test-connection.ts   # testProviderConnection()
│   │   ├── campaign/                # Campaign lifecycle and file-based persistence
│   │   │   ├── manager.ts           # createCampaign, loadCampaign, deleteCampaign, getActiveCampaign
│   │   │   ├── chat-history.ts      # getChatHistory, appendChatMessages, popLastMessages
│   │   │   ├── checkpoints.ts       # createCheckpoint, loadCheckpoint, pruneAutoCheckpoints
│   │   │   ├── paths.ts             # assertSafeId, CAMPAIGNS_DIR, getCampaignDir, getCampaignConfigPath
│   │   │   └── index.ts             # barrel export
│   │   ├── character/               # Character generation (player + NPC)
│   │   │   ├── generator.ts         # parseCharacterDescription, generateCharacter, mapV2CardToCharacter
│   │   │   ├── npc-generator.ts     # parseNpc, generateNpc, importNpcV2Card
│   │   │   ├── archetype-researcher.ts # researchArchetype (DuckDuckGo/ZAI + LLM)
│   │   │   └── v2-sections.ts       # V2 card section extraction helpers
│   │   ├── db/                      # SQLite schema and connection
│   │   │   ├── schema.ts            # 8 tables: campaigns, locations, players, npcs, items, factions, relationships, chronicle
│   │   │   ├── index.ts             # connectDb, getDb, closeDb (singleton)
│   │   │   └── migrate.ts           # runMigrations() — Drizzle migrate
│   │   ├── engine/                  # Deterministic game engine
│   │   │   ├── turn-processor.ts    # processTurn() async generator — Oracle → Storyteller pipeline
│   │   │   ├── oracle.ts            # callOracle, rollD100, resolveOutcome — probability system
│   │   │   ├── prompt-assembler.ts  # assemblePrompt() — gathers all context sections with token budgeting
│   │   │   ├── tool-schemas.ts      # createStorytellerTools() — Zod-validated Storyteller tool definitions
│   │   │   ├── tool-executor.ts     # executeToolCall() — dispatches tool calls to DB mutations
│   │   │   ├── state-snapshot.ts    # captureSnapshot, restoreSnapshot — turn undo support
│   │   │   ├── npc-agent.ts         # tickNpcAgent, tickPresentNpcs — per-NPC AI actions
│   │   │   ├── npc-offscreen.ts     # simulateOffscreenNpcs — batch off-screen NPC simulation
│   │   │   ├── npc-tools.ts         # createNpcAgentTools() — NPC tool definitions
│   │   │   ├── reflection-agent.ts  # runReflection, checkAndTriggerReflections — importance-triggered reflection
│   │   │   ├── reflection-tools.ts  # createReflectionTools() — reflection tool definitions
│   │   │   ├── world-engine.ts      # tickFactions() — periodic faction simulation
│   │   │   ├── faction-tools.ts     # createFactionTools() — faction agent tool definitions
│   │   │   ├── graph-queries.ts     # getRelationshipGraph() — multi-hop relationship traversal
│   │   │   ├── token-budget.ts      # estimateTokens, allocateBudgets, truncateToFit
│   │   │   └── index.ts             # barrel export
│   │   ├── images/                  # Image generation and caching
│   │   │   ├── index.ts             # generateImage, buildScenePrompt, buildLocationPrompt, cacheImage, imageExists
│   │   ├── lib/                     # Shared backend utilities
│   │   │   ├── errors.ts            # AppError class, getErrorMessage, getErrorStatus
│   │   │   ├── logger.ts            # createLogger(module) — structured logger
│   │   │   ├── type-guards.ts       # isRecord, isString, etc.
│   │   │   ├── clamp.ts             # clamp(value, min, max)
│   │   │   └── index.ts             # barrel export
│   │   ├── routes/                  # HTTP route handlers
│   │   │   ├── campaigns.ts         # GET/POST/DELETE /api/campaigns, POST /load, GET /world, GET /active
│   │   │   ├── chat.ts              # GET /history, POST / (legacy), POST /action, POST /retry, POST /undo, POST /edit
│   │   │   ├── worldgen.ts          # POST /roll-seeds, /generate, /regenerate-section, /save-edits, /parse-worldbook, /import-worldbook
│   │   │   ├── character.ts         # POST /parse-character, /generate-character, /research-character, /import-v2-card, /save-character, /resolve-starting-location
│   │   │   ├── lore.ts              # GET /lore, GET /lore/search, DELETE /lore
│   │   │   ├── settings.ts          # GET/POST /api/settings
│   │   │   ├── ai.ts                # POST /api/providers/test, POST /api/ai/test-role
│   │   │   ├── images.ts            # GET /api/images/:campaignId/:type/:filename
│   │   │   ├── helpers.ts           # parseBody, requireActiveCampaign, resolveJudge/Storyteller/Generator/Embedder
│   │   │   └── schemas.ts           # All Zod request body schemas
│   │   ├── settings/                # Server-side settings persistence
│   │   │   └── manager.ts           # loadSettings, saveSettings — reads/writes settings.json at project root
│   │   ├── vectors/                 # LanceDB vector store
│   │   │   ├── connection.ts        # openVectorDb, closeVectorDb, getVectorDb
│   │   │   ├── embeddings.ts        # embedTexts() — calls Embedder LLM role
│   │   │   ├── lore-cards.ts        # insertLoreCards, searchLoreCards, deleteCampaignLore, storeLoreCards
│   │   │   ├── episodic-events.ts   # insertEpisodicEvent, embedAndUpdateEvent, searchEpisodicEvents
│   │   │   └── index.ts             # barrel export
│   │   └── worldgen/                # World generation pipeline
│   │       ├── scaffold-generator.ts # generateWorldScaffold, generateRefinedPremiseStep, generateLocationsStep, generateFactionsStep, generateNpcsStep
│   │       ├── seed-roller.ts       # rollWorldSeeds, rollSeed — deterministic random seed selection
│   │       ├── seed-suggester.ts    # suggestWorldSeeds, suggestSingleSeed — AI-generated seeds
│   │       ├── scaffold-saver.ts    # saveScaffoldToDb() — writes WorldScaffold to all DB tables
│   │       ├── lore-extractor.ts    # extractLoreCards() — AI extracts lore from scaffold
│   │       ├── ip-researcher.ts     # researchKnownIP() — DuckDuckGo/ZAI MCP search + LLM fallback
│   │       ├── starting-location.ts # resolveStartingLocation() — determines player's starting location
│   │       ├── worldbook-importer.ts # parseWorldBook, classifyEntries, importClassifiedEntries
│   │       ├── types.ts             # WorldScaffold, ScaffoldLocation, ScaffoldNpc, ScaffoldFaction, LORE_CATEGORIES
│   │       └── index.ts             # barrel export
│   ├── drizzle/                     # Generated migration files
│   │   └── meta/                    # Migration metadata (_journal.json, snapshots)
│   └── package.json
├── frontend/
│   ├── app/                         # Next.js App Router pages
│   │   ├── layout.tsx               # Root layout: dark theme, fonts (Inter + Playfair Display), Toaster
│   │   ├── page.tsx                 # Title screen: New Campaign / Load Campaign / Settings
│   │   ├── game/
│   │   │   └── page.tsx             # Game page: NarrativeLog + ActionBar + panels (3-column CRPG layout)
│   │   ├── settings/
│   │   │   └── page.tsx             # Settings page: providers, roles, images, research
│   │   └── campaign/[id]/
│   │       ├── character/
│   │       │   └── page.tsx         # Character creation: parse/generate/import V2 card
│   │       └── review/
│   │           └── page.tsx         # World review: edit locations/factions/NPCs/lore before starting
│   ├── components/
│   │   ├── character-creation/
│   │   │   ├── character-form.tsx   # Multi-mode character input form
│   │   │   └── character-card.tsx   # Character preview card
│   │   ├── game/
│   │   │   ├── narrative-log.tsx    # Scrollable message history with streaming support
│   │   │   ├── action-bar.tsx       # Player input + submit + retry/undo controls
│   │   │   ├── oracle-panel.tsx     # Oracle result display (chance, roll, outcome)
│   │   │   ├── quick-actions.tsx    # Suggested action buttons from Storyteller
│   │   │   ├── character-panel.tsx  # Player stats, HP, tags
│   │   │   ├── location-panel.tsx   # Current location + connections
│   │   │   ├── lore-panel.tsx       # Lore card browser + semantic search
│   │   │   └── checkpoint-panel.tsx # Save/load checkpoint management
│   │   ├── settings/                # Settings form sections (providers, roles, etc.)
│   │   ├── title/
│   │   │   ├── new-campaign-dialog.tsx  # New campaign wizard dialog
│   │   │   ├── load-campaign-dialog.tsx # Campaign list + load/delete
│   │   │   └── use-new-campaign-wizard.ts # Wizard state machine hook
│   │   ├── world-review/
│   │   │   ├── premise-section.tsx
│   │   │   ├── locations-section.tsx
│   │   │   ├── factions-section.tsx
│   │   │   ├── npcs-section.tsx     # NPC list + 3 creation modes (describe/import/AI generate)
│   │   │   ├── regenerate-dialog.tsx
│   │   │   ├── string-list-editor.tsx
│   │   │   └── tag-editor.tsx
│   │   └── ui/                      # Shadcn UI primitives (button, dialog, input, etc.)
│   └── lib/
│       ├── api.ts                   # All backend API calls + SSE parsers (parseTurnSSE, parseSSEStream)
│       ├── api-types.ts             # Frontend-only API type definitions (WorldData, ScaffoldNpc, etc.)
│       ├── types.ts                 # Re-exports from @worldforge/shared for frontend use
│       ├── settings.ts              # createDefaultSettings, getErrorMessage (client-side)
│       ├── use-settings.ts          # useSettings() React hook
│       ├── v2-card-parser.ts        # Client-side SillyTavern V2/V3 card parser (JSON + PNG tEXt chunk)
│       ├── clamp.ts                 # clamp utility
│       └── utils.ts                 # cn() Tailwind class merger
├── campaigns/                       # Runtime user data (gitignored)
│   └── {uuid}/
│       ├── state.db                 # SQLite campaign database
│       ├── config.json              # Campaign name, premise, seeds, tick, generationComplete flag
│       ├── chat_history.json        # Array of ChatMessage objects
│       ├── vectors/
│       │   └── lore_cards.lance/    # LanceDB table files
│       └── checkpoints/             # Checkpoint snapshots (db + chat)
├── shared/dist/                     # Compiled shared package output
├── settings.json                    # Server-side settings (providers, roles) — at project root
├── docs/                            # Design documentation
│   ├── concept.md
│   ├── mechanics.md
│   ├── memory.md
│   ├── tech_stack.md
│   └── research.md
└── package.json                     # Root workspace (shared + backend + frontend scripts)
```

## Directory Purposes

**`shared/src/`:**
- Purpose: Single source of truth for types shared between backend and frontend
- Contains: TypeScript interfaces and pure utility functions only — no runtime dependencies
- Key files: `shared/src/types.ts` (Settings, CampaignMeta, WorldSeeds, PlayerCharacter)

**`backend/src/engine/`:**
- Purpose: Core game logic — the deterministic layer that the LLM narrates around
- Contains: Turn processor, Oracle, prompt assembler, NPC agents, world simulation, tool definitions
- Key files: `backend/src/engine/turn-processor.ts`, `backend/src/engine/oracle.ts`, `backend/src/engine/prompt-assembler.ts`

**`backend/src/routes/`:**
- Purpose: HTTP API surface; thin handlers that delegate to service layers
- Contains: One file per API domain; all Zod schemas centralized in `schemas.ts`
- Key files: `backend/src/routes/chat.ts`, `backend/src/routes/worldgen.ts`, `backend/src/routes/helpers.ts`

**`backend/src/campaign/`:**
- Purpose: Campaign state management; file I/O for per-campaign data
- Contains: CRUD for campaigns, chat history read/write, checkpoint management, path helpers
- Key files: `backend/src/campaign/manager.ts`, `backend/src/campaign/chat-history.ts`

**`backend/src/worldgen/`:**
- Purpose: Pre-game world construction pipeline — runs once before gameplay
- Contains: Multi-step scaffold generation, seed rolling/AI-suggestion, lore extraction, character generation helpers, WorldBook import
- Key files: `backend/src/worldgen/scaffold-generator.ts`, `backend/src/worldgen/types.ts`

**`frontend/app/`:**
- Purpose: Next.js App Router pages — one directory per route
- Contains: `page.tsx` per route; `layout.tsx` at root
- Key files: `frontend/app/page.tsx` (title), `frontend/app/game/page.tsx` (gameplay), `frontend/app/campaign/[id]/review/page.tsx`

**`frontend/lib/`:**
- Purpose: All communication with backend; shared frontend utilities
- Contains: `api.ts` is the single file for all backend calls; `api-types.ts` for response types
- Key files: `frontend/lib/api.ts`, `frontend/lib/v2-card-parser.ts`

## Key File Locations

**Entry Points:**
- `backend/src/index.ts`: Hono server startup
- `frontend/app/layout.tsx`: Next.js root layout
- `frontend/app/page.tsx`: Title screen (first page)

**Configuration:**
- `settings.json`: Server-side settings (at project root, written by `backend/src/settings/manager.ts`)
- `backend/drizzle/`: Migration files
- `shared/src/settings.ts`: Default settings factory and builtin provider presets

**Core Game Logic:**
- `backend/src/engine/turn-processor.ts`: Full turn cycle (Oracle + Storyteller + tools)
- `backend/src/engine/oracle.ts`: Probability system
- `backend/src/engine/prompt-assembler.ts`: Context assembly from all data sources

**Data Models:**
- `backend/src/db/schema.ts`: All 8 SQLite tables
- `shared/src/types.ts`: All shared TypeScript interfaces

**API Contract:**
- `backend/src/routes/schemas.ts`: All backend request body schemas
- `frontend/lib/api-types.ts`: All frontend response type definitions
- `frontend/lib/api.ts`: All frontend API call functions

**Testing:**
- `backend/src/*/___tests__/`: Co-located test files in each module
- `frontend/components/title/__tests__/`: Frontend component tests
- `frontend/lib/__tests__/`: Frontend utility tests

## Naming Conventions

**Files:**
- `kebab-case.ts` for all TypeScript files (e.g., `turn-processor.ts`, `prompt-assembler.ts`)
- `kebab-case.tsx` for React components (e.g., `narrative-log.tsx`, `action-bar.tsx`)
- `use-*.ts` or `use-*.tsx` for React hooks (e.g., `use-new-campaign-wizard.ts`, `use-settings.ts`)
- `index.ts` for barrel exports in every module directory

**Directories:**
- `kebab-case/` for all directories
- `__tests__/` subdirectory co-located with source files for tests

**TypeScript:**
- `PascalCase` for interfaces, types, and classes (e.g., `CampaignMeta`, `TurnSnapshot`, `AppError`)
- `camelCase` for functions and variables (e.g., `processTurn`, `loadSettings`, `resolveStoryteller`)
- `SCREAMING_SNAKE_CASE` for module-level constants (e.g., `CAMPAIGNS_DIR`, `LORE_CATEGORIES`, `REFLECTION_THRESHOLD`)

**React Components:**
- Default export named to match filename in PascalCase (e.g., file `narrative-log.tsx` exports `NarrativeLog`)

## Where to Add New Code

**New API Endpoint:**
- Add schema to `backend/src/routes/schemas.ts`
- Add handler in appropriate route file (or create new `backend/src/routes/{domain}.ts`)
- Register new Hono app via `app.route()` in `backend/src/index.ts`
- Add frontend API function in `frontend/lib/api.ts`
- Add response types to `frontend/lib/api-types.ts`

**New Game Engine Feature:**
- Add logic to `backend/src/engine/` (e.g., new agent file following pattern of `npc-agent.ts`)
- Export from `backend/src/engine/index.ts`
- If it needs new DB columns, add to `backend/src/db/schema.ts` and run `npm run db:generate`

**New Storyteller Tool:**
- Add schema + handler in `backend/src/engine/tool-schemas.ts` (createStorytellerTools)
- Add execution logic in `backend/src/engine/tool-executor.ts` (executeToolCall switch)
- If tool spawns entities, update `trackSpawnedEntity()` in `backend/src/routes/chat.ts` for undo support

**New Frontend Page:**
- Create `frontend/app/{route}/page.tsx` (Next.js App Router convention)
- Mark with `"use client"` if it uses React state or browser APIs
- Add any API calls to `frontend/lib/api.ts`

**New Shared Type:**
- Add to `shared/src/types.ts`
- Re-export from `shared/src/index.ts`
- Import in frontend via `@worldforge/shared` (mapped to shared package in tsconfig)

**New World Generation Step:**
- Add generator function to `backend/src/worldgen/scaffold-generator.ts`
- Export from `backend/src/worldgen/index.ts`
- Wire into pipeline in `backend/src/routes/worldgen.ts`

**Utilities:**
- Backend shared helpers: `backend/src/lib/` (export from `backend/src/lib/index.ts`)
- Frontend shared helpers: `frontend/lib/utils.ts` or `frontend/lib/settings.ts`

## Special Directories

**`campaigns/`:**
- Purpose: Runtime user data — one directory per campaign UUID
- Generated: Yes (at runtime when campaigns are created)
- Committed: No (gitignored)

**`shared/dist/`:**
- Purpose: Compiled output of shared package
- Generated: Yes (via `tsc` build of shared package)
- Committed: No (should not be committed)

**`backend/drizzle/`:**
- Purpose: Drizzle ORM migration files
- Generated: Via `npm run db:generate` from `backend/`
- Committed: Yes — migration files are part of the repo

**`frontend/.next/`:**
- Purpose: Next.js build cache and output
- Generated: Yes (by Next.js)
- Committed: No (gitignored)

**`.planning/`:**
- Purpose: GSD planning documents — phases, research, codebase maps
- Generated: By GSD planning commands
- Committed: Yes

---

*Structure analysis: 2026-03-19*

# Codebase Structure

**Analysis Date:** 2026-03-09

## Directory Layout

```
worldforge/
├── backend/                    # Hono backend (TypeScript, port 3001)
│   ├── drizzle/                # Generated Drizzle migrations
│   │   └── meta/               # Migration metadata/snapshots
│   ├── src/
│   │   ├── ai/                 # LLM provider abstraction
│   │   │   └── __tests__/
│   │   ├── campaign/           # Campaign lifecycle + chat history
│   │   │   └── __tests__/
│   │   ├── character/          # Player + NPC generation
│   │   ├── db/                 # SQLite connection + Drizzle schema
│   │   │   └── __tests__/
│   │   ├── lib/                # Shared utilities (errors, clamp, type-guards)
│   │   │   └── __tests__/
│   │   ├── routes/             # Hono route handlers
│   │   │   └── __tests__/
│   │   ├── settings/           # Settings normalization + persistence
│   │   │   └── __tests__/
│   │   ├── vectors/            # LanceDB integration
│   │   └── worldgen/           # World generation pipeline
│   │       └── __tests__/
│   └── index.ts                # Server entry point
├── frontend/                   # Next.js frontend (port 3000)
│   ├── app/                    # Next.js App Router pages
│   │   ├── campaign/
│   │   │   └── [id]/
│   │   │       ├── character/  # Character creation page
│   │   │       └── review/     # World review/edit page
│   │   ├── game/               # Main gameplay page
│   │   └── settings/           # Settings page
│   ├── components/
│   │   ├── character-creation/ # Character form + card preview
│   │   ├── game/               # Game UI panels (5 panels)
│   │   ├── settings/           # Settings tabs
│   │   ├── title/              # Title screen dialogs + wizard
│   │   ├── ui/                 # Shadcn UI primitives
│   │   └── world-review/       # World review section components
│   ├── lib/                    # API client, types, utilities
│   └── public/                 # Static assets
├── shared/                     # @worldforge/shared package
│   └── src/                    # Types, constants, defaults, utilities
├── campaigns/                  # User data (gitignored)
│   └── {uuid}/                 # One directory per campaign
│       ├── state.db            # SQLite database
│       ├── config.json         # Campaign metadata + seeds
│       ├── chat_history.json   # Chat messages array
│       └── vectors/            # LanceDB vector storage
├── docs/                       # Design documentation
│   └── plans/                  # Implementation plans
└── settings.json               # Server-side settings (gitignored)
```

## Directory Purposes

**`backend/src/ai/`:**
- Purpose: LLM provider abstraction and AI role system
- Contains: Provider registry, storyteller, role resolver, connection tester
- Key files: `provider-registry.ts`, `storyteller.ts`, `resolve-role-model.ts`, `test-connection.ts`, `index.ts` (barrel)

**`backend/src/campaign/`:**
- Purpose: Campaign CRUD, active campaign state, chat persistence
- Contains: Manager (create/load/delete), chat history (JSON file), path utilities
- Key files: `manager.ts`, `chat-history.ts`, `paths.ts`

**`backend/src/character/`:**
- Purpose: Player character and NPC generation via LLM
- Contains: Character generator (3 modes: parse, generate, import V2), NPC generator, archetype researcher
- Key files: `generator.ts`, `npc-generator.ts`, `archetype-researcher.ts`

**`backend/src/db/`:**
- Purpose: SQLite database connection and schema
- Contains: Connection singleton, Drizzle ORM schema (8 tables), migration runner
- Key files: `index.ts` (connectDb/getDb/closeDb), `schema.ts` (all table definitions), `migrate.ts`

**`backend/src/lib/`:**
- Purpose: Shared backend utilities
- Contains: Error classes/helpers, number clamping, type guards
- Key files: `errors.ts` (AppError class + getErrorStatus), `clamp.ts`, `type-guards.ts`

**`backend/src/routes/`:**
- Purpose: HTTP API endpoint handlers
- Contains: Route files per domain, Zod schemas, helper functions
- Key files: `campaigns.ts`, `worldgen.ts`, `chat.ts`, `ai.ts`, `settings.ts`, `lore.ts`, `schemas.ts` (all Zod schemas + parseBody), `helpers.ts` (resolveGenerator/Storyteller/Embedder)

**`backend/src/settings/`:**
- Purpose: Settings file management with normalization
- Contains: Load/save/normalize settings, builtin provider merging
- Key files: `manager.ts`, `index.ts` (re-exports)

**`backend/src/vectors/`:**
- Purpose: LanceDB vector database for semantic search
- Contains: Connection management, lore card CRUD, embedding generation
- Key files: `lore-cards.ts`, `embeddings.ts`, `connection.ts`, `index.ts`

**`backend/src/worldgen/`:**
- Purpose: Multi-step world generation pipeline
- Contains: Seed roller, seed suggester, scaffold generator, scaffold saver, lore extractor, IP researcher
- Key files: `scaffold-generator.ts`, `scaffold-saver.ts`, `seed-roller.ts`, `seed-suggester.ts`, `ip-researcher.ts`, `lore-extractor.ts`, `index.ts` (barrel)

**`frontend/app/`:**
- Purpose: Next.js App Router pages (all client-side rendered)
- Contains: Page components for each screen
- Key files: `page.tsx` (title screen), `layout.tsx` (root layout), `game/page.tsx`, `settings/page.tsx`, `campaign/[id]/character/page.tsx`, `campaign/[id]/review/page.tsx`

**`frontend/components/game/`:**
- Purpose: Main game screen UI panels
- Contains: 5 panels for the 3-column game layout
- Key files: `narrative-log.tsx`, `action-bar.tsx`, `character-panel.tsx`, `location-panel.tsx`, `lore-panel.tsx`

**`frontend/components/title/`:**
- Purpose: Title screen dialogs and campaign creation wizard
- Contains: New campaign dialog, load campaign dialog, wizard hook
- Key files: `new-campaign-dialog.tsx`, `load-campaign-dialog.tsx`, `use-new-campaign-wizard.ts`, `utils.ts`

**`frontend/components/character-creation/`:**
- Purpose: Character creation UI
- Contains: Input form with 3 creation modes + preview card
- Key files: `character-form.tsx`, `character-card.tsx`

**`frontend/components/world-review/`:**
- Purpose: World scaffold review and editing UI
- Contains: Section editors for each scaffold part + shared helpers
- Key files: `premise-section.tsx`, `locations-section.tsx`, `factions-section.tsx`, `npcs-section.tsx`, `lore-section.tsx`, `regenerate-dialog.tsx`, `tag-editor.tsx`, `string-list-editor.tsx`

**`frontend/components/ui/`:**
- Purpose: Shadcn UI component primitives
- Contains: Generated Shadcn components (button, dialog, input, card, etc.)
- Key files: Standard Shadcn component files

**`frontend/lib/`:**
- Purpose: Frontend shared utilities and API client
- Contains: Typed API functions, settings helpers, type definitions, V2 card parser
- Key files: `api.ts` (all API calls), `types.ts` (re-exports from shared + frontend types), `settings.ts` (default settings factory), `v2-card-parser.ts` (SillyTavern card import), `use-settings.ts` (React hook), `utils.ts` (cn helper)

**`shared/src/`:**
- Purpose: Code shared between frontend and backend
- Contains: TypeScript interfaces, constants, default factories, utility functions
- Key files: `types.ts` (Provider, Settings, ChatMessage, WorldSeeds, PlayerCharacter), `settings.ts` (BUILTIN_PROVIDER_PRESETS, createDefaultSettings), `errors.ts` (getErrorMessage), `chat.ts` (isChatMessage), `index.ts` (barrel)

**`campaigns/`:**
- Purpose: Runtime user data storage (gitignored)
- Contains: One UUID-named directory per campaign
- Generated: Yes (at runtime when campaigns are created)
- Committed: No (gitignored)

**`docs/`:**
- Purpose: Design documentation and plans
- Contains: Concept, mechanics, memory architecture, tech stack, research docs
- Key files: `concept.md`, `mechanics.md`, `memory.md`, `tech_stack.md`, `research.md`

## Key File Locations

**Entry Points:**
- `backend/src/index.ts`: Backend server entry -- creates Hono app, mounts routes, starts HTTP server
- `frontend/app/layout.tsx`: Root layout with fonts (Inter, Playfair Display) and Toaster
- `frontend/app/page.tsx`: Title screen (home page)
- `shared/src/index.ts`: Shared package barrel export

**Configuration:**
- `backend/tsconfig.json`: Backend TypeScript config (strict mode)
- `frontend/next.config.ts`: Next.js configuration
- `frontend/tailwind.config.ts`: Tailwind CSS configuration
- `backend/drizzle.config.ts`: Drizzle ORM migration config
- `settings.json`: Server-side settings file (runtime, gitignored)

**Core Logic:**
- `backend/src/routes/schemas.ts`: All Zod validation schemas + `parseBody()` utility
- `backend/src/routes/helpers.ts`: LLM role resolution helpers
- `backend/src/ai/provider-registry.ts`: Creates OpenAI-compatible model instances
- `backend/src/ai/storyteller.ts`: Storyteller LLM streaming call
- `backend/src/campaign/manager.ts`: Campaign CRUD + active campaign singleton
- `backend/src/worldgen/scaffold-generator.ts`: Multi-step world generation pipeline
- `backend/src/db/schema.ts`: All 8 Drizzle table definitions
- `frontend/lib/api.ts`: All frontend API call functions

**Testing:**
- `backend/src/routes/__tests__/`: Route handler tests
- `backend/src/settings/__tests__/`: Settings normalization tests
- `backend/src/ai/__tests__/`: AI layer tests
- `backend/src/campaign/__tests__/`: Campaign manager tests
- `backend/src/db/__tests__/`: Database tests
- `backend/src/lib/__tests__/`: Utility tests
- `backend/src/worldgen/__tests__/`: Worldgen tests
- `frontend/components/title/__tests__/`: Title component tests
- `frontend/lib/__tests__/`: Frontend utility tests

## Naming Conventions

**Files:**
- `kebab-case.ts` for all source files: `scaffold-generator.ts`, `chat-history.ts`, `provider-registry.ts`
- `kebab-case.tsx` for React components: `action-bar.tsx`, `character-card.tsx`, `narrative-log.tsx`
- `page.tsx` for Next.js pages (App Router convention)
- `*.test.ts` for test files, co-located in `__tests__/` directories
- `index.ts` for barrel exports in backend modules

**Directories:**
- `kebab-case` for all directories: `character-creation/`, `world-review/`, `ip-researcher/`
- `__tests__/` for test directories (co-located with source)
- `[id]` for Next.js dynamic route segments

**Exports:**
- Named exports for functions and types (no default exports except route modules)
- Route files export `default app` (Hono instance)
- Barrel files (`index.ts`) re-export from submodules

## Where to Add New Code

**New API Endpoint:**
- Create route handler in `backend/src/routes/{domain}.ts` or add to existing file
- Add Zod schema to `backend/src/routes/schemas.ts`
- Mount route in `backend/src/index.ts` via `app.route()`
- Add typed API function in `frontend/lib/api.ts`
- Add tests in `backend/src/routes/__tests__/`

**New Backend Service/Module:**
- Create directory at `backend/src/{module-name}/`
- Add `index.ts` barrel file for exports
- Add `__tests__/` directory for tests
- Import from routes or other modules as needed

**New Frontend Page:**
- Create `frontend/app/{path}/page.tsx` (always `"use client"`)
- Add components in `frontend/components/{feature-name}/`
- Use API functions from `frontend/lib/api.ts`

**New Frontend Component:**
- Place in `frontend/components/{feature-name}/{component-name}.tsx`
- Custom hooks: `use-{name}.ts` in the same directory or `frontend/lib/`
- Shadcn UI primitives: `frontend/components/ui/` (use `npx shadcn@latest add`)

**New Shared Type:**
- Add to `shared/src/types.ts`
- Export from `shared/src/index.ts`
- Import as `@worldforge/shared` in backend, `@/lib/types` in frontend (which re-exports shared types)

**New Database Table:**
- Add table definition to `backend/src/db/schema.ts`
- Run `npm run db:generate` from `backend/` to create migration
- Migration files auto-generated in `backend/drizzle/`

**New LLM Interaction:**
- Use `generateObject()` for structured output or `streamText()` for streaming
- Create model via `createModel(provider)` from `backend/src/ai/provider-registry.ts`
- Define Zod schema for expected output
- Resolve role config via `resolveGenerator/Storyteller/Embedder()` from `backend/src/routes/helpers.ts`

**Utilities:**
- Backend shared helpers: `backend/src/lib/`
- Frontend shared helpers: `frontend/lib/`
- Cross-stack helpers: `shared/src/`

## Special Directories

**`campaigns/`:**
- Purpose: Runtime campaign data (one UUID directory per campaign)
- Generated: Yes (created by `createCampaign()`)
- Committed: No (gitignored)
- Contains: `state.db` (SQLite), `config.json`, `chat_history.json`, `vectors/` (LanceDB)

**`backend/drizzle/`:**
- Purpose: Auto-generated Drizzle ORM migration SQL files
- Generated: Yes (via `npm run db:generate`)
- Committed: Yes
- Contains: SQL migration files + `meta/` with snapshots and journal

**`frontend/components/ui/`:**
- Purpose: Shadcn UI primitive components
- Generated: Yes (via `npx shadcn@latest add`)
- Committed: Yes
- Contains: Pre-built component files (button, dialog, input, etc.)

**`.planning/`:**
- Purpose: Planning and analysis documents
- Generated: By analysis tools
- Committed: Varies

---

*Structure analysis: 2026-03-09*

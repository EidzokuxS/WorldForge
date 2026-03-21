# WorldForge

AI-driven text RPG sandbox with LLM Game Master. Node.js/TypeScript backend, Next.js frontend.

## Documentation

- `docs/concept.md` — vision, gameplay loop, world generation
- `docs/mechanics.md` — tag system, Oracle, NPCs, factions, AI agent tools
- `docs/memory.md` — SQLite + LanceDB architecture, prompt assembly, save/load
- `docs/tech_stack.md` — full stack, npm packages, deployment
- `docs/research.md` — research findings, adopted/rejected decisions
- `docs/ui_concept_hybrid.html` — visual UI mockup (open in browser)

## Tech Stack

- **Backend:** Hono + @hono/node-ws (TypeScript strict)
- **Frontend:** Next.js (App Router) + Tailwind CSS + Shadcn UI
- **LLM:** Vercel AI SDK (`ai` v6+) — streaming, tool calling
- **Database:** Drizzle ORM + better-sqlite3 (SQLite)
- **Vectors:** LanceDB (@lancedb/lancedb) — embedded, no Python
- **Validation:** Zod for all schemas

## Architecture Principles

- LLM is narrator only. Engine is deterministic — LLM never modifies game state directly.
- All AI agents use structured tool calling. Backend validates every tool call before execution.
- Tag-based system for EVERYTHING: characters, factions, locations, items, relationships, wealth, skills. Only number: HP (1-5).
- 3 LLM roles: Judge (structured JSON) + Storyteller (creative prose) + Generator (world gen). Temperature is per-call.
- SQLite is source of truth. LanceDB is semantic memory (episodic events + lore cards).

## Code Style

- TypeScript strict mode, ES modules
- Use Drizzle query builder, not raw SQL
- Zod schemas for all AI tool definitions and API payloads
- Prefer `ai` SDK functions (streamText, generateText) over raw fetch to LLM APIs
- Route handlers: outer try/catch wrapping entire body, `parseBody()` for validation, `getErrorStatus(error)` for status codes
- Shared types/constants live in `@worldforge/shared` — import from there, not duplicate

## Project Structure

```
worldforge/
├── shared/                  ← @worldforge/shared — types, constants, defaults
├── frontend/                ← Next.js frontend
│   ├── app/                 ← Pages (game, settings)
│   ├── components/game/     ← NarrativeLog, ActionBar, panels
│   ├── components/title/    ← TitleScreen, WorldDnaPanel, utils
│   └── lib/                 ← api.ts, settings.ts, types.ts
├── backend/                 ← Hono backend
│   ├── src/ai/              ← provider-registry, storyteller, resolve-role-model, test-connection
│   ├── src/campaign/        ← manager.ts, chat-history.ts
│   ├── src/db/              ← schema.ts, index.ts, migrate.ts
│   ├── src/lib/             ← errors.ts, clamp.ts, type-guards.ts
│   ├── src/routes/          ← campaigns, chat, ai, worldgen, settings, schemas, helpers
│   ├── src/settings/        ← manager.ts (normalize, load, save)
│   └── src/worldgen/        ← scaffold-generator, seed-roller, suggest-seeds, scaffold-saver
├── campaigns/               ← User data (gitignored), one dir per campaign
│   └── {uuid}/              ← state.db, config.json, chat_history.json, vectors/
└── docs/                    ← Design documentation
```

## Commands

- `cd backend && npm run dev` — start backend on :3001
- `cd frontend && npm run dev` — start frontend on :3000
- `npm --prefix backend run typecheck` — backend type check
- `npm --prefix frontend run lint` — frontend lint
- `npm run db:generate` — regenerate Drizzle migrations (from backend/)

## API Endpoints

- `GET /api/health` — health check
- `GET/POST/DELETE /api/campaigns` — campaign CRUD
- `POST /api/campaigns/:id/load` — load campaign
- `GET /api/campaigns/active` — current campaign
- `GET /api/campaigns/:id/world` — world data (locations, NPCs, factions)
- `GET/POST /api/settings` — load/save settings
- `POST /api/providers/test` — test LLM provider connection
- `POST /api/ai/test-role` — test Judge/Storyteller/Generator with real LLM call
- `GET /api/chat/history` — chat history + premise
- `POST /api/chat` — send player action, stream Storyteller response
- `POST /api/worldgen/roll-seeds` — roll all random world seeds
- `POST /api/worldgen/roll-seed` — roll single seed category
- `POST /api/worldgen/suggest-seeds` — AI-generate world seeds from premise
- `POST /api/worldgen/suggest-seed` — AI-generate single seed category
- `POST /api/worldgen/generate` — generate world scaffold (locations, NPCs, factions)

## Language

User communicates in Russian. Respond in Russian.

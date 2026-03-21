# WorldForge — Project Overview

## Purpose
AI-driven text RPG sandbox with LLM Game Master. A CRPG-style experience where the LLM narrates and the backend engine is deterministic (LLM never modifies game state directly).

## Tech Stack
- **Runtime:** Node.js, TypeScript (strict mode), ES Modules
- **Backend:** Hono + @hono/node-ws, port 3001
- **Frontend:** Next.js (App Router) + React 19 + Tailwind CSS v4 + shadcn/ui, port 3000
- **LLM Integration:** Vercel AI SDK (`ai` v6+) — streaming, tool calling; `@ai-sdk/openai` + `@ai-sdk/anthropic`
- **Database:** Drizzle ORM + better-sqlite3 (SQLite), WAL mode
- **Vectors:** LanceDB (@lancedb/lancedb) — planned, not yet implemented
- **Validation:** Zod v4 for all schemas
- **Testing:** Vitest (backend + shared + frontend)
- **Package Manager:** npm workspaces (root + shared + frontend + backend)

## Architecture
- 3 LLM roles: Judge (structured JSON) + Storyteller (creative prose) + Generator (world gen)
- Tag-based system for everything (characters, factions, locations, items, relationships, wealth, skills)
- Only numeric value: HP (1-5)
- SQLite = source of truth; LanceDB = semantic memory (episodic events + lore cards)
- Shared package: `@worldforge/shared` — types, constants, defaults

## Project Structure
```
worldforge/
├── shared/           ← @worldforge/shared — types, constants
│   └── src/          ← chat.ts, errors.ts, settings.ts, types.ts
├── frontend/         ← Next.js frontend
│   ├── app/          ← Pages: / (title), /game, /settings
│   ├── components/   ← game/, settings/, title/, ui/ (shadcn)
│   └── lib/          ← api.ts, settings.ts, types.ts
├── backend/          ← Hono backend
│   ├── src/ai/       ← provider-registry, storyteller, resolve-role-model, test-connection
│   ├── src/campaign/ ← manager.ts, chat-history.ts, paths.ts
│   ├── src/db/       ← schema.ts, index.ts, migrate.ts
│   ├── src/lib/      ← errors.ts, clamp.ts, type-guards.ts
│   ├── src/routes/   ← campaigns, chat, ai, worldgen, settings, schemas, helpers
│   ├── src/settings/ ← manager.ts
│   └── src/worldgen/ ← scaffold-generator, seed-roller, seed-suggester, scaffold-saver
├── campaigns/        ← User data (gitignored), one dir per campaign UUID
└── docs/             ← Design documentation (concept, mechanics, memory, tech_stack, research)
```

## Current Status
- 8 tasks completed. World generation pipeline in progress (Task 9 next).
- Working: title screen, campaigns CRUD, settings, streaming chat, world DNA seeds, scaffold generation.

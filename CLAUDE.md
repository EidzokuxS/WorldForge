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
- Tag-based system for traits, factions, locations, items, relationships, wealth, skills. Characters also have free-text physical fields (race, gender, age, appearance). Only number: HP (1-5).
- 4 LLM roles: Judge (structured JSON) + Storyteller (creative prose) + Generator (world gen) + Embedder (vector embeddings). Temperature is per-call.
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
│   ├── app/                 ← Pages (title, game, settings, campaign/[id]/character, campaign/[id]/review)
│   ├── components/game/     ← NarrativeLog, ActionBar, panels
│   ├── components/title/    ← TitleScreen, WorldDnaPanel, utils
│   ├── components/character-creation/ ← CharacterForm, CharacterCard
│   ├── components/world-review/ ← PremiseSection, LocationsSection, FactionsSection, NpcsSection, LoreSection, helpers
│   └── lib/                 ← api.ts, settings.ts, types.ts, v2-card-parser.ts
├── backend/                 ← Hono backend
│   ├── src/ai/              ← provider-registry, storyteller, resolve-role-model, test-connection
│   ├── src/campaign/        ← manager.ts, chat-history.ts
│   ├── src/db/              ← schema.ts, index.ts, migrate.ts
│   ├── src/lib/             ← errors.ts, clamp.ts, type-guards.ts
│   ├── src/routes/          ← campaigns, chat, ai, worldgen, settings, schemas, helpers
│   ├── src/character/        ← generator.ts, npc-generator.ts, archetype-researcher.ts
│   ├── src/settings/        ← manager.ts (normalize, load, save)
│   ├── src/vectors/         ← embeddings.ts, lore-cards.ts (LanceDB integration)
│   └── src/worldgen/        ← scaffold-generator, seed-roller, suggest-seeds, scaffold-saver, ip-researcher
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
- `POST /api/worldgen/regenerate-section` — regenerate a single scaffold section
- `POST /api/worldgen/save-edits` — save user edits to scaffold
- `POST /api/worldgen/parse-character` — parse free-text into ParsedCharacter (role=player) or ScaffoldNpc (role=key)
- `POST /api/worldgen/generate-character` — AI-generate character (role=player|key)
- `POST /api/worldgen/research-character` — research archetype + generate character (role=player|key)
- `POST /api/worldgen/import-v2-card` — convert SillyTavern V2/V3 card (role=player|key)
- `POST /api/worldgen/save-character` — save player character to DB and start game
- `POST /api/worldgen/resolve-starting-location` — resolve starting location for player
- `GET /api/campaigns/:id/lore` — get lore cards
- `GET /api/campaigns/:id/lore/search?q=&limit=` — semantic lore search
- `DELETE /api/campaigns/:id/lore` — delete campaign lore

## Language

User communicates in Russian. Respond in Russian.

<!-- gitnexus:start -->
# GitNexus MCP

This project is indexed by GitNexus as **WorldForge** (525 symbols, 1263 relationships, 35 execution flows).

## Always Start Here

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `npx gitnexus analyze` in the terminal first.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

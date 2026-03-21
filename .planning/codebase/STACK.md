# Technology Stack

**Analysis Date:** 2026-03-09

## Languages

**Primary:**
- TypeScript (strict mode) - Used across all packages: backend, frontend, shared

**Secondary:**
- SQL (SQLite dialect) - Drizzle migrations in `backend/drizzle/`

## Runtime

**Environment:**
- Node.js (no `.nvmrc` or `.node-version` present; docs specify Node.js 20+)
- ES Modules (`"type": "module"` in backend and shared)

**Package Manager:**
- npm with workspaces
- Lockfile: `package-lock.json` (npm workspace monorepo)

**Workspaces (root `package.json`):**
- `shared/` - `@worldforge/shared`
- `frontend/`
- `backend/`

## Frameworks

**Core:**
- Hono `^4.12.3` - Backend HTTP framework (`backend/src/index.ts`)
- `@hono/node-server` `^1.19.9` - Node.js adapter for Hono
- `@hono/node-ws` `^1.3.0` - WebSocket support
- Next.js `^16.1.6` (App Router) - Frontend framework (`frontend/`)
- React `19.2.3` / React DOM `19.2.3` - UI library

**Testing:**
- Vitest `^3.2.4` - Test runner (present in all three packages)

**Build/Dev:**
- `tsx` `^4.21.0` - TypeScript execution for backend dev (`tsx watch src/index.ts`)
- TypeScript `^5.9.3` (backend), `^5` (frontend), `^5.7.0` (shared)
- `concurrently` `^9.2.1` - Runs frontend + backend dev servers in parallel
- `drizzle-kit` `^0.31.9` - Drizzle migration generation

## Key Dependencies

**Critical:**
- `ai` `^6.0.106` (Vercel AI SDK) - All LLM interactions: `streamText()`, `generateText()`, `generateObject()`, `embedMany()`
- `@ai-sdk/openai` `^3.0.37` - OpenAI-compatible provider adapter (used for ALL providers including OpenRouter, Ollama, custom)
- `@ai-sdk/anthropic` `^3.0.51` - Anthropic-compatible provider adapter
- `@ai-sdk/mcp` `^1.0.25` - MCP client for DuckDuckGo web search in IP researcher
- `drizzle-orm` `^0.45.1` - SQLite ORM, type-safe queries
- `better-sqlite3` `^12.6.2` - Synchronous SQLite driver
- `@lancedb/lancedb` `^0.26.2` - Embedded vector database (Rust-based, no Python)
- `zod` `^4.3.6` - Schema validation for API payloads and AI tool definitions

**Frontend UI:**
- `radix-ui` `^1.4.3` - Headless UI primitives (via Shadcn)
- `shadcn` `^3.8.5` (devDep) - Component generator CLI
- Tailwind CSS `^4` + `@tailwindcss/postcss` `^4` - Styling
- `tw-animate-css` `^1.4.0` - Tailwind animation utilities
- `lucide-react` `^0.576.0` - Icon library
- `class-variance-authority` `^0.7.1` - Variant-based component styling
- `clsx` `^2.1.1` + `tailwind-merge` `^3.5.0` - Class name utilities
- `sonner` `^2.0.7` - Toast notifications

**Infrastructure:**
- `@worldforge/shared` `*` - Shared types, constants, defaults (workspace link)

## Configuration

**TypeScript:**
- Backend: `backend/tsconfig.json` - target ES2022, module NodeNext, strict: true
- Frontend: `frontend/tsconfig.json` - target ES2017, module esnext, bundler resolution, strict: true
- Shared: compiles to `dist/` with type declarations
- Path alias: `@/*` maps to `./` in frontend

**Next.js:**
- `frontend/next.config.ts` - `transpilePackages: ["@worldforge/shared"]`
- Dev port: 3000

**Drizzle:**
- `backend/drizzle.config.ts` - schema at `./src/db/schema.ts`, output to `./drizzle`, dialect SQLite

**Environment Variables:**
- `PORT` - Backend port (default: 3001)
- `CORS_ORIGIN` - Allowed CORS origin (default: `http://localhost:3000`)
- `NEXT_PUBLIC_API_BASE` - Frontend API base URL (default: `http://localhost:3001`)
- No `.env` files detected in repo

**Settings:**
- `settings.json` at project root - Server-side settings file (LLM providers, role configs, research config)
- Managed by `backend/src/settings/manager.ts` - auto-created with defaults if missing

## Build & Dev Commands

**Development:**
```bash
npm run dev                    # Both frontend + backend (concurrently)
npm run dev:frontend           # Frontend only (port 3000)
npm run dev:backend            # Backend only (port 3001)
```

**Build:**
```bash
npm run build                  # Build frontend + backend
npm --prefix backend run typecheck  # Backend type check
npm --prefix frontend run lint      # Frontend ESLint
```

**Database:**
```bash
cd backend && npm run db:generate   # Regenerate Drizzle migrations
cd backend && npm run db:push       # Push schema to DB
```

**Testing:**
```bash
cd backend && npm test              # Run backend tests (vitest)
cd backend && npm run test:watch    # Watch mode
```

## Platform Requirements

**Development:**
- Node.js 20+
- No Python dependency - all components JS-native
- 8GB+ RAM recommended (LanceDB + SQLite for large campaigns)
- Windows, macOS, or Linux

**Production:**
- Localhost only - runs as a local Node.js server accessed via browser
- No cloud deployment target
- Campaign data stored in `campaigns/` directory (gitignored)

---

*Stack analysis: 2026-03-09*

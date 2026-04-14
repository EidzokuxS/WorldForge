# Technology Stack

**Analysis Date:** 2026-03-19

## Languages

**Primary:**
- TypeScript 5.x (strict mode) — all backend, frontend, and shared package code
  - Backend: `ES2022` target, `NodeNext` module resolution
  - Frontend: Next.js TypeScript config
  - Shared: compiled to `dist/` via `tsc`

**Secondary:**
- None

## Runtime

**Environment:**
- Node.js (no version pinned — no `.nvmrc` or `.node-version` file)
- ES Modules throughout (`"type": "module"` in backend and shared)

**Package Manager:**
- npm workspaces
- Root `package.json` declares workspaces: `["shared", "frontend", "backend"]`
- Lockfiles: `package-lock.json` present in root, frontend, and backend

## Frameworks

**Core:**
- `hono` ^4.12.3 — HTTP server framework for backend API
- `@hono/node-server` ^1.19.9 — Node.js adapter for Hono
- `@hono/node-ws` ^1.3.0 — WebSocket support via Hono
- `next` ^16.1.6 — Frontend React framework (App Router)
- `react` 19.2.3 — UI library
- `react-dom` 19.2.3 — DOM renderer

**AI/LLM:**
- `ai` ^6.0.106 — Vercel AI SDK (streaming, `streamText`, `generateText`, `generateObject`, `embedMany`)
- `@ai-sdk/openai` ^3.0.37 — OpenAI-compatible provider adapter
- `@ai-sdk/anthropic` ^3.0.51 — Anthropic-compatible provider adapter
- `@ai-sdk/mcp` ^1.0.25 — MCP (Model Context Protocol) client for tool calling

**Testing:**
- `vitest` ^3.2.4 — test runner (both backend and frontend)

**Build/Dev:**
- `tsx` ^4.21.0 — TypeScript execution / watch mode for backend dev server
- `drizzle-kit` ^0.31.9 — ORM migration generator and schema manager
- `concurrently` ^9.2.1 — runs frontend + backend in parallel during dev

## Key Dependencies

**Critical:**
- `drizzle-orm` ^0.45.1 — type-safe SQL query builder for SQLite
- `better-sqlite3` ^12.6.2 — synchronous SQLite bindings for Node.js
- `@lancedb/lancedb` ^0.26.2 — embedded vector database (no Python required)
- `zod` ^4.3.6 — runtime schema validation for all API payloads and AI tool definitions
- `@worldforge/shared` * — internal monorepo package for shared types, constants, and defaults

**UI:**
- `radix-ui` ^1.4.3 — headless accessible component primitives
- `tailwindcss` ^4 — utility-first CSS
- `shadcn` ^3.8.5 — component CLI (Shadcn UI components, config in `frontend/components.json`)
- `lucide-react` ^0.576.0 — icon library
- `class-variance-authority` ^0.7.1 — variant class management
- `tailwind-merge` ^3.5.0 — conditional class merging
- `sonner` ^2.0.7 — toast notifications

**Infrastructure:**
- `hono/cors` — CORS middleware (built-in Hono middleware)

## Configuration

**Environment Variables (no .env files detected):**
- `PORT` — backend HTTP port (default: `3001`)
- `CORS_ORIGIN` — allowed CORS origin (default: `http://localhost:3000`)
- LLM API keys are NOT environment variables — they are stored in `settings.json` (server-side)
- Campaign data stored at `campaigns/{uuid}/` relative to backend root

**Settings File:**
- `settings.json` — server-side persistent settings at backend root
  - Managed by `backend/src/settings/manager.ts`
  - Contains provider configs, role assignments, research settings, image settings
  - Auto-created with defaults on first boot

**Build:**
- Backend: `backend/tsconfig.json` — `rootDir: src`, `outDir: dist`
- Frontend: `frontend/tsconfig.json` — Next.js managed
- Shared: `shared/tsconfig.json` — outputs to `shared/dist/`
- Drizzle: `backend/drizzle.config.ts` — dialect sqlite, schema `./src/db/schema.ts`, migrations out `./drizzle`
- Frontend config: `frontend/next.config.ts` — transpiles `@worldforge/shared`

## Platform Requirements

**Development:**
- Node.js (ES2022 compatible)
- Backend dev: `cd backend && npm run dev` → `tsx watch src/index.ts` on port 3001
- Frontend dev: `cd frontend && npm run dev` → Next.js on port 3000
- Combined: root `npm run dev` via `concurrently`

**Production:**
- Backend: compiled to `dist/` via `tsc`, run with `node dist/index.js`
- Frontend: `next build` then `next start`
- No containerization config detected

---

*Stack analysis: 2026-03-19*

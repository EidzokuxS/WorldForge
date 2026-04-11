# WorldForge: Technical Stack Reference

> **Technical reference**
> This document describes implementation surfaces and repo structure. It is **not gameplay authority**. For live gameplay and runtime contracts, use `docs/mechanics.md` and `docs/memory.md`.

## Architecture Overview

WorldForge ships as a local-first TypeScript application with separate frontend and backend packages plus a shared package for common types and contracts.

```text
Browser / Next.js frontend
  -> REST + SSE gameplay transport
  -> REST setup, review, and settings routes

Hono backend
  -> gameplay engine
  -> world generation and setup routes
  -> persistence and campaign management
  -> AI integrations and image services

Storage
  -> SQLite for authoritative structured state
  -> LanceDB for vector-backed lore and episodic retrieval
```

## Repository Structure

This repo is a **monorepo**, not a flat single-package app.

Key packages and folders:

- `frontend/` — Next.js App Router client and UI surfaces
- `backend/` — Hono routes, engine code, worldgen, persistence, images
- `shared/` — `@worldforge/shared` types, schemas, defaults, and shared contracts
- `docs/` — planning-grade documentation
- `campaigns/` — local campaign data on disk

**Replaced wording:** older docs described a single-package layout with repeated shared interfaces. That is stale. Shared contracts now live in `@worldforge/shared` and are consumed across frontend and backend.

## Frontend

- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS
- **Component system:** shadcn/ui plus project-specific gameplay components
- **Runtime role:** renders setup, review, authoring, and `/game` surfaces

### Gameplay Transport

The live gameplay transport is **REST + SSE**, not WebSocket-driven turn streaming:

- targeted gameplay requests are issued through REST endpoints such as `/api/chat/action`
- turn narration and state events stream back through SSE parsing in `frontend/lib/api.ts`
- the `/game` page consumes those streamed events and treats authoritative completion as a backend-defined boundary

`@hono/node-ws` still exists as backend capability, but it is not the active turn-stream contract and should not be documented as gameplay truth.

## Backend

- **Runtime:** Node.js
- **Language:** TypeScript with strict mode
- **Framework:** Hono
- **Streaming/tooling:** Vercel AI SDK for model calls and streaming helpers

### Major Backend Areas

| Area | Responsibility |
|------|----------------|
| Gameplay engine | Oracle resolution, turn processing, tool execution, movement, simulation handoff |
| Routes | Campaign, gameplay, worldgen, character, settings, checkpoints, images |
| Character systems | Structured character drafts, canonical records, loadout derivation, setup handoff |
| World generation | Research-backed world setup, scaffold generation, lore extraction, reusable worldbook flows |
| Persistence | SQLite state, config-backed campaign metadata, LanceDB vector retrieval |

## Data Layer

### SQLite

- authoritative structured runtime state
- accessed through Drizzle ORM
- stores players, NPCs, locations, factions, items, relationships, chronicle, and related campaign state

### LanceDB

- vector-backed storage for lore cards and episodic events
- supports semantic retrieval used by prompt assembly
- complements SQLite instead of replacing it

## AI Integration

WorldForge uses provider-configurable model roles through the Vercel AI SDK.

Primary roles include:

- **Judge** — structured rulings and other constrained outputs
- **Storyteller** — narrative prose
- **Generator** — worldgen and setup generation

The exact gameplay contract for those roles belongs in downstream docs. This file only records the technical stack and role split.

## Setup And Import Tooling

The codebase includes setup-time tooling for:

- known-IP research grounding
- WorldBook parsing/import
- SillyTavern V2/V3 character-card parsing
- reusable worldbook-library flows

**Superseded product assumption:** earlier stack docs treated wiki scraping as an active gameplay-baseline promise. Today it should be understood only as tooling history or partial capability, not as a guaranteed player-facing setup path.

## Images And Local Runtime

- images are optional and degrade gracefully when not configured
- portrait and related image flows are driven from backend services
- the app is still designed around a local browser plus local backend workflow

## Key Technologies

| Technology | Role |
|------------|------|
| Next.js | Frontend application shell |
| Tailwind CSS | Styling |
| shadcn/ui | UI primitives |
| Hono | Backend HTTP layer |
| Vercel AI SDK | Model calls, structured outputs, streaming helpers |
| Drizzle ORM | SQLite access |
| better-sqlite3 | Embedded SQLite driver |
| LanceDB | Vector retrieval store |
| Zod | Shared validation and schema contracts |
| `@worldforge/shared` | Shared types and runtime-facing contracts |

## Deployment Shape

The project remains local-first:

- frontend served through the Next.js app
- backend served through the Hono app
- campaign state stored on local disk

Future packaging options such as desktop wrappers may exist later, but they are not required to understand the current technical baseline.

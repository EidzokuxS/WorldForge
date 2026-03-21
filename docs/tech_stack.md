# WorldForge: Technical Stack

## Architecture Overview

```
┌──────────────────────────────────────────────┐
│                  Browser                      │
│  Next.js + Tailwind CSS + Shadcn UI          │
│  (localhost:3000)                             │
├──────────────────────────────────────────────┤
│              Node.js Backend                  │
│  (TypeScript, same process)                  │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Game     │  │ AI       │  │ World     │  │
│  │ Engine   │  │ Router   │  │ Gen       │  │
│  │          │  │          │  │ Pipeline  │  │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘  │
│       │              │              │         │
│  ┌────┴──────────────┴──────────────┴──┐     │
│  │         Storage Layer               │     │
│  │   SQLite    │    LanceDB            │     │
│  └─────────────┴───────────────────────┘     │
├──────────────────────────────────────────────┤
│           External LLM APIs                   │
│  (OpenAI / Anthropic / Ollama / OpenRouter)  │
└──────────────────────────────────────────────┘
```

## Frontend

- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS
- **Components:** Shadcn UI — strict adherence, no custom CSS overhead
- **Communication:** WebSocket for real-time narrative streaming + REST for state queries

The frontend renders:
- Three-column "Solid Slate" layout (see `concept.md`)
- Narrative log with streamed text
- Player sheet with live tag/HP/inventory updates
- Location panel with entities and quick-action buttons
- Settings panel for AI provider configuration

**UI Reference:** `docs/ui_concept_hybrid.html` — interactive HTML mockup of the "Hybrid" visual direction. Deep charcoal/slate panels with subtle glassmorphism, bone-colored narrative text (Playfair Display serif), blood-orange accent for threats/danger, mystic-blue for allies/magic. Fonts: Inter (UI) + Playfair Display (narrative).

## Backend

- **Runtime:** Node.js
- **Language:** TypeScript (strict mode)
- **Framework:** Hono + `@hono/node-ws` — TypeScript-first, minimal overhead, native WebSocket support via Node.js adapter
- **LLM Transport:** Vercel AI SDK (`ai` package) — unified streaming, tool calling, 25+ provider adapters out of the box

### Core Modules

| Module | Responsibility |
|--------|---------------|
| **Game Engine** | Turn processing, tick management, mechanical state changes (HP, inventory, movement) |
| **AI Router** | Dispatches prompts to Judge or Storyteller LLM. Manages provider configs and retries |
| **World Gen Pipeline** | Agentic world generation (research, seed generation, scaffold, lore extraction) |
| **Storage** | SQLite + LanceDB access layer. Prompt assembly |
| **Campaign Manager** | Create, load, save, checkpoint, delete campaigns |

## Database

### SQLite (via Drizzle ORM + better-sqlite3)
- **ORM:** Drizzle (`drizzle-orm` + `drizzle-kit`) — 7.4kB, sync API, type-safe queries, JSON columns
- **Driver:** `better-sqlite3` — synchronous, fast, zero-config embedded SQLite
- All structured game state: players, NPCs, locations, items, factions, relationships, chronicle
- File-based, zero ops, embedded in the Node.js process
- JSON columns for flexible data (tags arrays, goals, beliefs)

### LanceDB (embedded)
- **Package:** `@lancedb/lancedb` — Rust-based vector DB with native JS bindings
- Zero external dependencies, no Python sidecar, no separate server
- Embedded in the Node.js process, persists to filesystem automatically
- Two tables: `episodic_events` and `lore_cards`
- Brute-force cosine similarity is sufficient for campaign-scale data (hundreds to low thousands of entries)

## AI Integration

### Provider-Agnostic Design (Vercel AI SDK)
All LLM calls go through the **Vercel AI SDK** (`ai` package, v6+). It provides:
- Unified streaming API with `streamText()` / `generateText()`
- Built-in tool calling with Zod schema validation
- 25+ provider adapters (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `ollama-ai-provider`, etc.)
- Automatic retries, abort signals, token usage tracking

Supported providers:
- **Cloud:** OpenAI, Anthropic, OpenRouter, TogetherAI
- **Local:** Ollama, LM Studio, vLLM

### Two LLM Roles

| Role | Purpose | Recommended Model | Temperature |
|------|---------|-------------------|-------------|
| **Judge** | Structured JSON: probability, NPC decisions, reflections, faction actions | GPT-4o-mini, Claude Haiku, Llama 3 8B | Per-call (0.0–0.5) |
| **Storyteller** | Creative prose: narration, dialogue | GPT-4o, Claude Sonnet, Llama 3 70B | 0.7–1.0 |
| **Generator** | World generation: DNA suggestions, scaffold (locations, NPCs, factions), lore | GPT-4o, Claude Sonnet | 0.7 |

Each role is configurable in the UI: provider, model, API key, temperature. Temperature can be overridden per-call for different contexts (e.g., 0.0 for Oracle, 0.3 for reflection).

### UI Settings Panel

The Settings panel exposes full control over all AI integrations. Users can add **custom API providers** — any service with an OpenAI-compatible chat completions endpoint.

**Provider Management:**
- Add/remove/edit providers (name, base URL, API key)
- Built-in presets: OpenAI, Anthropic, OpenRouter, Ollama (localhost)
- Custom providers: any URL + API key (for vLLM, LM Studio, TogetherAI, etc.)

**Role Assignment:**
For each LLM role (Judge, Storyteller, Generator):
- Select provider from configured list
- Select model (dropdown or free text)
- Set default temperature
- Set max tokens

The **Generator** role is used for world generation — creating World DNA suggestions, scaffold generation (locations, NPCs, factions), and lore extraction. It needs strong structured output capability (e.g., GPT-4o, Claude Sonnet). Temperature defaults to 0.7, max tokens to 4096.

**Image Gen Settings:**
- Provider: Stable Diffusion API, DALL-E, ComfyUI, custom URL
- Model/checkpoint selection
- Default style prompt
- Toggle image generation on/off per asset type (portraits, scenes, items, backgrounds)

**Fallback Settings:**
- Global fallback provider + model (used when primary fails)
- Global timeout setting
- Retry count

### Tool Calling
All LLM agents use structured **function calling** (tool use) to interact with the game engine. The backend validates every tool call before execution. See `mechanics.md` for the complete tool specification per agent.

### Error Handling & Fallbacks
- **Timeout:** If an LLM call exceeds the configured timeout, retry once. If it fails again, return a generic "the world pauses" message to the player.
- **Provider Fallback:** If the primary provider fails, the system tries the global fallback before erroring.
- **Malformed Output:** If the LLM returns invalid JSON or calls a nonexistent tool, the backend retries with a stricter prompt. After 2 failures, skip the action and log the error.

## Image Generation

Dynamic visual content to accompany the narrative. Same provider-agnostic pattern as LLM integration.

### Generated Assets
- **Character portraits** — generated on character creation from appearance tags. Cached.
- **Scene illustrations** — key moments (entering a new location, boss encounters, dramatic events). Not every turn — triggered by high-importance events.
- **Location backgrounds** — generated when a new location node is first visited. Cached for future visits.
- **Item icons** — generated on item creation. Simple, icon-style images.

### Provider Configuration
Configured in the UI Settings, separate from LLM settings:
- **Image Provider:** Dropdown (Stable Diffusion API, DALL-E, Midjourney, ComfyUI, local SD)
- **Base URL:** For self-hosted or proxy setups
- **API Key**
- **Model / Checkpoint:** e.g., `sd-xl-turbo`, `dall-e-3`
- **Default style prompt:** A persistent style suffix appended to all generation prompts (e.g., "dark fantasy art, matte painting style, muted colors")

### Prompt Construction
The backend builds image prompts from game state:
- Character appearance tags → portrait prompt
- Location structural tags + premise → scene prompt
- The World Premise's tone/setting anchors the visual style

### Caching & Fallbacks
- All generated images are cached locally in the campaign directory (`campaigns/{name}/images/`).
- If no image API is configured, the UI gracefully degrades — no broken images, just text-only mode.
- Images are optional — the game is fully playable without them.

## Web Scraping & Data Ingestion

For the World Generation Pipeline's wiki/lore ingestion:
- **Crawlee** + **Cheerio** — headless web scraping (500+ pages/min), used for Fandom wiki ingestion
- **Chonkie-TS** (`chonkie`) — RAG-focused text chunking for splitting scraped content into lore cards
- **png-chunks-extract** + **png-chunk-text** — extracting SillyTavern V2/V3 character card data from PNG metadata

## Key npm Packages

| Package | Purpose |
|---------|---------|
| `hono` + `@hono/node-server` + `@hono/node-ws` | Backend framework + WebSocket |
| `ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic` | Vercel AI SDK + provider adapters |
| `drizzle-orm` + `drizzle-kit` + `better-sqlite3` | SQLite ORM + driver |
| `@lancedb/lancedb` | Embedded vector database |
| `crawlee` + `cheerio` | Web scraping for lore ingestion |
| `chonkie` | RAG text chunking |
| `png-chunks-extract` + `png-chunk-text` | SillyTavern character card parsing |
| `zod` | Schema validation (AI tool definitions, API payloads) |

## Deployment

**Localhost only.** The game runs as a local Node.js server accessed via browser.

```bash
npm install
npm run dev     # development with hot reload
npm run start   # production build
# → opens http://localhost:3000
```

### System Requirements
- Node.js 20+
- 8GB+ RAM recommended (LLM calls are remote, but LanceDB and SQLite need memory for large campaigns)
- No Python dependency — all components are JS-native

### Future Considerations
- **Electron/Tauri wrapper:** Possible later for a standalone desktop app experience.
- **Docker:** A Dockerfile for easier setup/distribution.
- Neither is planned for the initial version.

## Project Structure (Proposed)

Flat structure — no monorepo, no shared packages. Shared types are duplicated (5-10 interfaces).

```
worldforge/
├── frontend/                ← Next.js frontend
│   ├── app/                 ← App Router pages
│   ├── components/          ← UI components (Shadcn)
│   └── lib/                 ← Client utilities
├── backend/                 ← Hono backend
│   ├── engine/              ← Game Engine (turns, ticks, mechanics)
│   ├── ai/                  ← AI Router (Judge, Storyteller)
│   ├── worldgen/            ← World Generation Pipeline
│   ├── storage/             ← SQLite + LanceDB access
│   ├── campaign/            ← Campaign manager (create, load, save)
│   └── ws/                  ← WebSocket handlers
├── campaigns/               ← User campaign data (gitignored)
├── docs/                    ← This documentation
└── package.json
```

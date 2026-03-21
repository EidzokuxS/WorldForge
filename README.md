# WorldForge

**AI-Driven Text RPG Sandbox with LLM Game Master**

A text-based RPG engine where an AI serves exclusively as the narrator while all mechanical outcomes (probability, inventory, movement, health) are processed by a deterministic backend engine. The player defines a universe — original or from a known franchise — and lives inside it as the sole protagonist.

No main quest. The world evolves independently: key characters pursue their own goals, factions clash, events ripple outward.

## Features

- **AI = narrator, engine = law.** The LLM generates prose. All mechanics — probabilities, dice rolls, inventory, HP — are handled by code
- **Probability Oracle.** Player actions are evaluated by a Judge model → D100 roll → 3-tier outcome (Strong Hit / Weak Hit / Miss)
- **Tag system.** Characters, NPCs, locations, factions, items — everything is described by semantic tags. Only numeric value: HP (1–5)
- **Soft-fail.** Nothing is blocked. A peasant can attempt to cast a fireball — they'll get a near-zero chance and the GM will narrate the humiliating failure
- **Living world.** Key NPCs act autonomously: speak, move, pursue goals. Factions run macro-ticks: seize territories, declare wars
- **World generation.** 5-step pipeline: IP research → World DNA → locations/factions/NPCs → lore cards → player character
- **Semantic memory.** LanceDB stores episodic events and lore cards. Context assembly respects token budgets
- **Character import.** Full SillyTavern V2/V3 card support (JSON and PNG)
- **25+ LLM providers.** OpenAI, Anthropic, OpenRouter, Ollama, LM Studio, vLLM, and more via Vercel AI SDK

## Quick Start

### Prerequisites

- **Node.js 20+**
- **npm**
- **LLM API key** (OpenAI, Anthropic, OpenRouter, Z.AI, or local Ollama/LM Studio)

### Installation

```bash
git clone <repository-url>
cd worldforge

npm install
cd shared && npm run build && cd ..
```

### Running

```bash
# Terminal 1 — backend (port 3001)
cd backend && npm run dev

# Terminal 2 — frontend (port 3000)
cd frontend && npm run dev
```

Open **http://localhost:3000** in your browser.

## Configuration

### LLM Providers

Configured via **Settings → Providers** in the UI.

| Provider | Endpoint | Example Model | Type |
|----------|----------|---------------|------|
| OpenAI | api.openai.com | gpt-4o, gpt-4o-mini | Cloud |
| Anthropic | api.anthropic.com | claude-sonnet, claude-haiku | Cloud |
| OpenRouter | openrouter.ai/api/v1 | any of 200+ models | Cloud (multi) |
| Z.AI (GLM) | api.minimax.io/anthropic | glm-4.7-flash | Cloud |
| Ollama | localhost:11434 | llama3, mistral | Local |
| LM Studio | localhost:1234 | any GGUF | Local |

### AI Roles

4 roles — each with its own provider and model:

| Role | Purpose | Recommended Temperature |
|------|---------|------------------------|
| **Judge** | Probability evaluation (structured JSON) | 0.0–0.5 |
| **Storyteller** | Narrative generation (prose) | 0.7–1.0 |
| **Generator** | World and character generation | 0.7 |
| **Embedder** | Vector embeddings | 0.0 |

Judge can run on cheap/fast models (gpt-4o-mini, Haiku). Storyteller needs a flagship model (gpt-4o, Sonnet, GLM-4.7).

## How It Works

### Turn Anatomy

```
Player enters action
    ↓
Context assembly (location, NPCs, lore, history)
    ↓
Judge evaluates probability (0–100%)
    ↓
Backend rolls D100
    ↓
Outcome: Strong Hit / Weak Hit / Miss
    ↓
Storyteller narrates result + calls tools
    ↓
Engine updates state (HP, tags, location, inventory)
    ↓
Display: narrative + Oracle panel + quick actions
```

### Tag System

All semantic attributes are tags:
- **Traits:** skills, flaws, magical abilities (`Skilled Negotiator`, `Arrogant`)
- **Status:** temporary conditions (`Poisoned`, `Inspired`)
- **Relationships:** social connections (`Trusted by Eldric`, `Enemy of the Gray Cult`)
- **Wealth:** economic tier (`Destitute` → `Wealthy` → `Obscenely Rich`)

### HP

- **1–5 scale** (not 0–100)
- HP = 0 → GM determines outcome (death is not automatic — depends on context)
- Auto-checkpoint before lethal encounters

### NPCs

3 tiers:
- **Key Characters** — full AI agents with goals, beliefs, reflection. Act autonomously each turn
- **Persistent** — tracked in DB with history, but don't act independently
- **Temporary** — extras, refreshed each turn

### Factions

Factions run macro-ticks every N in-game days: seize territories, generate world events, update the chronicle.

### World Generation

5-step pipeline with real-time SSE progress:

1. **Research** (optional) — for known IPs: DuckDuckGo MCP search + LLM fallback
2. **World DNA** (optional) — 6 uniqueness categories: geographic archetype, political structure, central conflict, cultural flavor, environment, wildcard element
3. **Scaffold** — AI generates locations, factions, NPCs constrained by DNA
4. **Lore cards** — 30–50 knowledge entries auto-extracted and stored in LanceDB
5. **Player character** — 3 modes: text description, AI generation, V2/V3 card import

### Memory & Context

- **Episodic memory** — each turn's events stored in LanceDB with embeddings. Composite scoring: similarity×0.4 + recency×0.3 + importance×0.3
- **Lore cards** — semantic search via LanceDB
- **Relationship graph** — 2-hop BFS traversal across SQLite for context enrichment
- **Context compression** — first messages + last N turns + anomalous events within token budget
- **Chat history** — persisted to disk, survives page reload

### Checkpoints

- **Manual save** — snapshot of state.db + vectors + chat_history
- **Auto-checkpoint** — before lethal encounters (HP ≤ 2)
- **Load** — rollback to saved state
- **Branching** — "what if" exploration of alternative paths

## Tech Stack

### Frontend

| Package | Version | Purpose |
|---------|---------|---------|
| Next.js | 16.1.6 | App Router, SSR |
| React | 19.2.3 | Component framework |
| Tailwind CSS | 4.x | Utility-first styling |
| shadcn/ui | 3.8.5 | UI components |
| Radix UI | 1.4.3 | Headless primitives |
| lucide-react | 0.576.0 | Icons |

### Backend

| Package | Version | Purpose |
|---------|---------|---------|
| Hono | 4.12.3 | Web framework |
| Drizzle ORM | 0.45.1 | Type-safe SQL |
| better-sqlite3 | 12.6.2 | SQLite driver |
| Zod | 4.3.6 | Schema validation |
| ai (Vercel) | 6.0.106 | Streaming, tool calling, 25+ providers |
| @lancedb/lancedb | 0.26.2 | Embedded vector DB |

## Project Structure

```
worldforge/
├── shared/                     ← @worldforge/shared — types, constants
├── frontend/                   ← Next.js frontend
│   ├── app/                    ← Pages (title, game, settings, character, review)
│   ├── components/
│   │   ├── game/               ← NarrativeLog, ActionBar, OraclePanel, CharacterPanel,
│   │   │                         LocationPanel, LorePanel, CheckpointPanel, QuickActions
│   │   ├── title/              ← TitleScreen, NewCampaignDialog
│   │   ├── character-creation/ ← CharacterForm, CharacterCard
│   │   └── world-review/       ← PremiseSection, LocationsSection, FactionsSection,
│   │                             NpcsSection, LoreSection
│   └── lib/                    ← api.ts, settings.ts, v2-card-parser.ts
│
├── backend/                    ← Hono backend
│   └── src/
│       ├── ai/                 ← provider-registry, storyteller, oracle, prompt-assembler
│       ├── engine/             ← npc-agent, world-engine, reflection-agent, turn-processor
│       ├── campaign/           ← manager, chat-history, checkpoints
│       ├── character/          ← generator, npc-generator, archetype-researcher
│       ├── worldgen/           ← scaffold-generator, seed-roller, ip-researcher
│       ├── vectors/            ← episodic-events, lore-cards, embeddings
│       ├── db/                 ← schema, index, migrate
│       ├── settings/           ← manager
│       ├── routes/             ← campaigns, chat, ai, worldgen, settings, images
│       └── lib/                ← errors, type-guards
│
├── campaigns/                  ← User data (gitignored)
│   └── {uuid}/                 ← state.db, config.json, chat_history.json, vectors/
│
└── docs/                       ← Design documentation
```

## Development Commands

```bash
# Backend
cd backend && npm run dev          # Dev server on :3001
npm --prefix backend run typecheck # Type check
npm --prefix backend run test      # Tests

# Frontend
cd frontend && npm run dev         # Dev server on :3000
npm --prefix frontend run lint     # Linting

# Database
npm --prefix backend run db:generate  # Drizzle migrations
npm --prefix backend run db:push      # Apply migrations
```

## Architecture

### Principles

1. **LLM = narrator.** All mechanical outcomes are backend code
2. **Structured tool calling.** All AI agent interactions use Zod-validated tool schemas
3. **SQLite = source of truth.** LanceDB is semantic memory only
4. **Tags, not numbers.** Only numeric value: HP (1–5)
5. **Soft-fail.** No blocked actions — only consequences

### Database

**SQLite** (8 tables): campaigns, players, npcs, locations, items, factions, relationships, chronicle

**LanceDB** (vector storage): episodic_events, lore_cards

### Streaming

- SSE for world generation progress and narrative streaming
- Typed events: `narrative`, `oracle_result`, `state_update`, `quick_actions`, `done`

## License

MIT

---

*[Русская версия](README.en.md)*

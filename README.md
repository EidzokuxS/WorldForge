# WorldForge

A text RPG sandbox where you create a campaign, play one character, and let the world keep state around you.

WorldForge turns a premise into a playable world: an original setting, a crossover, a changed version of a story you know, or something of your own.

You wake up inside that world and make choices.

You can chase the main disaster, pick a fight with someone stronger than you, become a courier, hide in a hotel, ask awkward questions, or waste an afternoon eating ice cream. The world keeps moving while you decide what matters. People have goals. Factions put pressure on places. Rumors spread. Consequences build offscreen and can reach you later.

The basic fantasy is a text RPG where the player and the world use the same rules.

![WorldForge launchpad](docs/assets/readme/launchpad-2560.png)

## Why this exists

Most AI roleplay tools handle conversation well, but the world often behaves like a stage set. NPCs appear when needed, forget what matters, and stop existing when the player leaves the room.

WorldForge is trying to build a different kind of RPG:

- The player is one person inside the world.
- Important NPCs can remember, plan, move, fail, and change things.
- Factions can act through resources, territory, orders, and reports.
- Hidden information stays hidden until the player has a real way to learn it.
- The AI can be creative, but durable changes go through game rules and saved state.

The game should improvise like a table GM and keep records like a campaign notebook. A good sentence can make the scene read better while staying inside saved reality.

## What you can do

Start with a sentence:

> Jujutsu Kaisen before Shibuya, but the Naruto chakra system exists too.

Or:

> A generation ship where the captain is dead, the cargo is awake, and mercy has become a law nobody understands anymore.

WorldForge can help turn that into:

- a playable premise;
- world DNA: the few rules that make this world itself;
- locations with relationships and movement logic;
- factions with goals and pressure;
- key NPCs with wants, memory, and private knowledge;
- lore cards and world facts;
- a player character;
- an opening scene you can actually play.

![World generation](docs/assets/readme/worldgen-2560.png)

## How it feels in play

You type what your character does.

The game master reads it like a human would: intent first, literal words second. If you bluff, it treats that as a bluff. If you claim something false, the world records that you claimed it, not that it became true. If you try to learn a secret, the game checks whether you actually have a path to know it.

Then the game changes the world through runtime actions:

- move a character;
- add an event;
- update a relationship;
- reveal a clue;
- create a rumor;
- wake an NPC or faction process;
- record a memory;
- change a location, item, injury, or threat.

Only after the world has been settled does the narrator write the final prose you see.

That separation matters. Hard facts stay owned by receipts: movement, route status, inventory, injuries, dialogue quotes, secrets, relationship changes, and world mutations all need accepted evidence. The narrator can spend a small soft prose budget on harmless visible texture, such as sound, wear, color, or ordinary surface detail. That texture makes the page read better. A later turn still has to prove it before the game treats it as saved world state.

![Play surface](docs/assets/readme/play-2560.png)

## The living world

WorldForge runs attention in layers instead of running a full expensive AI brain for every person on every turn. Full simulation would be slow, noisy, and expensive.

Instead, it gives the world layers:

- Key NPCs are the important people. They can have goals, private knowledge, plans, memories, and moments where they wake up and act.
- Persistent NPCs remain real and remembered, but they do not need a full independent decision every turn.
- Temporary NPCs can exist for a scene, support a location, then fade unless play makes them important.
- Factions act like organized forces with resources, reports, doctrine, territories, and operations.
- World threads track bigger changes: investigations, raids, shortages, rituals, disasters, political moves, and training arcs.

The target is simple to say and hard to build:

If you leave the room, the world should still be able to matter.

## What makes it different from a chatbot

The AI does more than write the next paragraph.

The active play path works like this:

1. Understand what the player is trying to do.
2. Look at the visible world state.
3. Decide what should happen and what needs to be checked.
4. Ask the backend to perform concrete runtime actions.
5. Let the backend save the real state through receipts.
6. Give the narrator only the truth the player is allowed to see.
7. Commit a player-facing turn record.
8. Continue from that saved world next turn.

The backend remembers where people are, what exists, what changed, what is private, and what has been committed. The AI handles meaning, judgment, and prose. They work together instead of pretending one side can do everything.

![World review](docs/assets/readme/review-2560.png)

## Current state

WorldForge is in active development.

The app already has:

- a local campaign app;
- campaign generation with optional source books and worldbooks;
- World DNA cards;
- generated locations, factions, NPCs, lore, placement, and relationships;
- player character creation and character-card import;
- a screen where you can play turns;
- provider settings for OpenAI-compatible and Anthropic-compatible endpoints;
- a dark editorial interface being migrated through the app;
- logic for key NPCs, factions, world threads, narrator-visible packets, receipt-backed hard facts, and safer saved turns.
- a clean gameplay runtime on `/chat/action`.

Active play uses `gameplay-cycle-runtime`. The old V1/V2 gameplay runtime paths are archived or removed from the active tree. Normal play needs no runtime-selection environment flags.

This is still an early project with sharp edges. The goal is a long-running RPG sandbox that can take strange player choices seriously.

## Quick start

### Requirements

- Node.js 20+
- npm
- at least one configured LLM provider

### Install

```bash
git clone https://github.com/EidzokuxS/WorldForge.git
cd WorldForge
npm install
```

### Run

```bash
# Backend on :3001 and frontend on :3000
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### First setup

1. Open Settings -> Providers and add an OpenAI-compatible or Anthropic-compatible endpoint.
2. Open Settings -> Roles and assign models for Judge, Storyteller, Generator, and Embedder.
3. Create a new campaign.
4. Review the generated world.
5. Create or import a player character.
6. Start playing.

No env flags are needed for gameplay. Once providers and roles are configured, `/chat/action` uses the clean runtime by default.

## Model roles

WorldForge uses a few model roles because different jobs need different prompts.

| Role | Plain meaning |
| --- | --- |
| Judge | The main game master brain. It understands the turn and decides what game actions are needed. |
| Storyteller | The prose writer. It turns already-decided events into readable fiction. |
| Generator | The world builder. It makes DNA, locations, factions, lore, and characters. |
| Embedder | The search helper. It helps find relevant memories and lore. |

For long games, the Judge model needs enough output and reasoning budget. WorldForge is built around quality turns, not tiny arbitrary response caps.

## Technical shape

```text
Player action
  -> bounded world frame
  -> clean GM read
  -> uncertainty / oracle check when needed
  -> concrete runtime action checklist
  -> receipt-backed backend state changes
  -> settled turn packet
  -> narrator view
  -> final prose
  -> player-facing turn record
```

Useful rules:

- A player lie becomes a claim.
- Private names and secrets need player-visible authority before narration can reveal them.
- Failed runtime actions stay out of narration.
- Soft prose can describe harmless visible texture. Receipts create hard facts.
- Background world work leaves returned turns intact.

## Data

Campaign data is local:

```text
campaigns/{campaignId}/
  config.json
  chat_history.json
  state.db
  vectors/
  checkpoints/
  logs/
```

- SQLite stores the authoritative world state.
- LanceDB stores semantic vectors for lore and episodic memory.
- JSON files store campaign metadata, role links, generated context, and chat.
- Campaign data is gitignored.

## Development commands

```bash
# Root
npm run dev                  # backend + frontend
npm run build                # shared + frontend + backend
npm run typecheck            # frontend lint + backend typecheck

# Backend
npm --prefix backend run dev
npm --prefix backend run dev:stable
npm --prefix backend run test
npm --prefix backend run typecheck
npm --prefix backend run structured-output:conformance
npm --prefix backend run db:generate
npm --prefix backend run db:push

# Frontend
npm --prefix frontend run dev
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run visual:v4
```

## Stack

| Area | Tools |
| --- | --- |
| Frontend | Next.js 16, React 19, Tailwind 4, shadcn, Radix UI, lucide-react |
| Backend | Hono, Drizzle ORM, better-sqlite3, Zod, AI SDK, LanceDB, pino |
| Storage | local campaign folders, SQLite, LanceDB vectors |

## Repo map

```text
WorldForge/
  shared/                  shared types and constants
  frontend/                Next.js app and game UI
  backend/                 API, campaign state, worldgen, GM runtime, tools
  campaigns/               local user data, gitignored
  docs/                    active mechanics, memory, research, playtest, and README assets
```

## License

AGPL-3.0. See [LICENSE](LICENSE).

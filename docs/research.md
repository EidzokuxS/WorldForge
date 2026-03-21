# WorldForge: Research Reference

Research conducted on analogous projects, academic papers, and JS/TS libraries relevant to the project.

---

## Analogous Projects & Papers

### LLM RPG Sandboxes

| Project | Key Takeaways |
|---------|---------------|
| **SillyTavern** | De-facto standard for LLM roleplay. WorldBook format is our import target. V2/V3 character cards use PNG metadata (`tEXt` chunk). |
| **AI Town** (a]6n) | Stanford Generative Agents in JS. Uses reflection + memory retrieval pattern similar to ours. Convex backend + Pinecone vectors. |
| **RPGBENCH** (paper) | Benchmarks LLMs as GMs. Confirms "LLMs produce engaging stories but struggle with consistent mechanics" — validates our deterministic engine + LLM narrator split. |
| **Static vs Agentic GM** (paper) | Multi-agent separation (Oracle / Storyteller / NPC) is empirically better than monolithic GM. Validates our 5-agent architecture. |
| **EdgeTales** | Small-model RPG system for edge devices. Uses structured prompts with game state injection — similar to our prompt assembly. |
| **AIDM** (Tsinghua, 2024) | AI Dungeon Master for D&D. Separates world simulation from narration. Confirms the pattern. |

### NPC & Memory Systems

| Concept | What We Learned |
|---------|----------------|
| **Stanford Generative Agents** | Reflection + importance scoring + retrieval by composite score. We adopt this pattern directly. |
| **Living Agents** (Microsoft) | LLM-driven NPCs with goals, beliefs, relationships. Similar to our Key Character tier. |
| **A-MEM Zettelkasten** | Agentic memory with bi-directional linking. **Rejected** — overengineering for our use case. Tags + beliefs + relationship scores are sufficient. |
| **Float personality drift** | Numerical personality axes (e.g., kindness 0.7 → 0.5). **Rejected** — contradicts our tag-based philosophy. No principled way to set initial values or determine drift magnitude. |

### Tag-Based Systems

| System | Insight |
|--------|---------|
| **Fate Core** | Aspects (tags) as narrative permissions. "If you have the tag, you can attempt it." Directly inspires our tag system. |
| **Disco Elysium** | Skills as personality voices, not just numbers. Tags can carry narrative weight beyond mechanical bonuses. |
| **Ironsworn / PbtA** | 3-tier outcomes (Strong Hit / Weak Hit / Miss). **Adopted** — more narrative than binary success/fail. |

---

## Tech Stack Decisions

### Adopted

| Technology | Package | Why |
|------------|---------|-----|
| **Hono** | `hono` + `@hono/node-ws` | TypeScript-first, minimal (14kB), native WebSocket via Node.js adapter. Faster than Express, simpler than Fastify. |
| **Vercel AI SDK** | `ai` (v6+) | Unified streaming + tool calling across 25+ LLM providers. Eliminates custom adapter code. |
| **Drizzle ORM** | `drizzle-orm` + `better-sqlite3` | 7.4kB, sync API, type-safe, JSON columns. Perfect for embedded SQLite. |
| **LanceDB** | `@lancedb/lancedb` | Embedded vector DB, Rust core, JS-native. No Python sidecar (unlike ChromaDB). Zero ops. |
| **Crawlee + Cheerio** | `crawlee` + `cheerio` | Web scraping for wiki lore ingestion. 500+ pages/min, handles pagination/rate-limiting. |
| **Chonkie-TS** | `chonkie` | RAG-focused text chunking. Splits scraped content into properly-sized lore cards. |
| **PNG character cards** | `png-chunks-extract` + `png-chunk-text` | Extract SillyTavern V2/V3 character data from PNG `tEXt` metadata chunks. |
| **3-Tier Outcomes** | (design pattern) | Strong Hit / Weak Hit / Miss instead of binary Success/Failure. Richer narrative possibilities. |
| **Reflection by importance** | (design pattern) | Trigger NPC reflection when cumulative event importance exceeds threshold, not on a fixed timer. More dramatic events = more frequent reflection. |

### Rejected

| Technology / Pattern | Why Rejected |
|---------------------|--------------|
| **ChromaDB** | Requires Python sidecar process. LanceDB is embedded, Rust-based, JS-native — strictly better for our use case. |
| **Mastra** | AI agent framework. Overkill — our "agents" are just different prompts + tool sets. Vercel AI SDK handles everything we need. |
| **Position & Effect** (Blades in the Dark) | Extra complexity axis on top of probability. One number (chance%) is cleaner. 3-tier outcomes add enough narrative depth. |
| **A-MEM Zettelkasten** | Bi-directional memory linking. Over-engineered. Tags + beliefs + relationship scores cover our needs. |
| **Float personality drift** | Numerical personality axes that shift over time. Contradicts tag-based philosophy. No principled way to set initial values or determine drift magnitude. Tags + beliefs are sufficient and inspectable. |
| **Neo4j / Graph DB** | Was in early docs for semantic memory. Replaced by storing beliefs/goals directly in SQLite as structured JSON. Simpler, no extra dependency. |

---

## Key Architectural Validations

1. **Deterministic engine + LLM narrator split** — confirmed by RPGBENCH paper. LLMs hallucinate mechanics; backend must be source of truth.
2. **Multi-agent separation** — confirmed by Static vs Agentic GM paper. Specialized agents outperform monolithic GM.
3. **Tag-based everything** — validated by Fate Core and Disco Elysium. Tags as narrative permissions scale better than stat dictionaries in open-ended sandboxes.
4. **Composite retrieval scoring** — adopted from Stanford Generative Agents. `similarity × 0.4 + recency × 0.3 + importance × 0.3` is the standard formula.
5. **Reflection as synthesis** — adopted from Stanford Generative Agents. Convert raw episodic memories into higher-level beliefs/goals stored in structured DB.

---

## Useful References

- **Azgaar's Fantasy Map Generator** — procedural map generation. Could inspire visual location graph rendering.
- **Ink (Inkle)** — narrative scripting engine. Not directly useful (we use free-form LLM), but its state-tracking patterns are relevant.
- **Inform 7** — natural-language IF authoring. Historical reference for text game design patterns.

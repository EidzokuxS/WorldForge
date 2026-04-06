
## 999.1: RAG-Inspired Improvements

**Idea:** Apply patterns from `production-agentic-rag-course` to WorldForge:
1. **Document grading for lore cards** — have an LLM score lore-card relevance before inclusion in Judge/Storyteller prompts
2. **Query rewriting for episodic memory** — if semantic retrieval misses, rewrite the search query and retry
3. **Hybrid search (BM25 + vector)** — add SQLite FTS5 keyword retrieval beside LanceDB cosine similarity and merge via reciprocal-rank fusion
4. **Input guardrails** — add a dedicated validation node before Judge for out-of-character, absurd, or meta-gaming inputs

**Why:** These are good forward-looking retrieval and safety upgrades, but they are not part of the active roadmap yet and should stay parked until a later worldgen/system-quality milestone.

**Source:** https://github.com/jamwithai/production-agentic-rag-course

**Trigger:** Promote via `/gsd:review-backlog` when retrieval quality or input-validation improvements become the focus.

## 999.2: Inspiration Research for Original Worlds

**Idea:** Run web search for original (non-IP) worlds too — search for similar settings, themes, tropes for inspiration. E.g. "dark fantasy on a space-whale" → search "space whale fiction", "living creature as world setting" → find similar works → feed as inspiration context to Generator alongside World DNA.

**Why:** Currently research only fires for known IPs. Original worlds miss out on the creative boost that comes from discovering similar existing works. The Generator would produce richer, more grounded worlds if it had reference material even for original concepts.

**Trigger:** Next milestone — world generation improvements.

## 999.3: Advanced World Generation Settings

**Idea:** Отдельная секция в Settings для тонкой настройки параметров генерации мира:
- Количество локаций, фракций, NPC (сейчас захардкожено в scaffold-steps)
- Лимиты массивов: max goals, assets, tags per entity (сейчас `.max(3)` в Zod-схемах)
- Количество lore cards per category
- Tier distribution (key vs supporting NPCs ratio)
- Validation rounds limit (сейчас `MAX_VALIDATION_ROUNDS = 3`)
- Включение/выключение validation passes целиком

**Why:** Сейчас все ограничения захардкожены в коде. Продвинутые пользователи хотят контролировать масштаб генерации — больше/меньше NPC, более подробные фракции и т.д.

**Trigger:** After core generation pipeline is stable and tested.

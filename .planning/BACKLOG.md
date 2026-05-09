
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
- Phase 63 personality backfill failed: campaign=test-campaign recordId=npc-b name=NPC-B kind=npc at=2026-04-18T17:09:26.190Z error=IngestionPipelineError: Ingestion stage "backfill" failed after 3 attempts: provider exhausted for NPC-B

## 999.4: ScenePlan Nested Action-Input Repair and Bounded Fallback Latency

**Idea:** Harden the normal `/action` ScenePlan path against nested tool-input shape failures after `safeGenerateObject` already returns success. The observed failed turn restored after 213s because `semanticScenePlanToStrictPlan` could not repair `plannedActions.1.input.actions[].action` missing inside a nested tool payload, even though top-level structured-output repair succeeded.

**Observed failure:** `turnId=fb1d8ec2-7687-48a2-86c7-f54f4d9f47e7`, `campaignId=ca3a8035-40ef-4062-9457-78007e48a977`, route `/action`, outcome `restored`. Error: `ScenePlan repair failed after semantic-mapping-failed`; validation issues were missing nested `action` strings at `plannedActions.1.input.actions.0/1/2.action`.

**Scope to investigate:**
- Add regression fixture for nested `plannedActions[].input.actions[]` missing `action` but containing recoverable aliases/shape.
- Decide deterministic repair rules for nested tool payloads before strict `scenePlanSchema` validation.
- Cap or deterministically truncate `hiddenRationale` before expensive repair when only string length exceeds schema max.
- Revisit provider capability metadata for OpenCode/deepseek-v4-flash: native schema resolves first, but provider currently returns `response_format type is unavailable now`, forcing slow text fallback.
- Add latency budget assertions so repair loops cannot burn multiple minutes on shape-only failures.

**Why:** Phase 73 reduced top-level Zod failures, but this shows the remaining user-visible kill switch moved downstream into semantic mapping and nested tool-input validation. The player still experiences a long rollback instead of a playable turn.

**Trigger:** Promote before more live-play validation, or immediately if `/action` restores again on ScenePlan semantic mapping.

## 999.5: Phase 63 Personality Verification and Backfill Closeout

**Idea:** Close the remaining Phase 63 verification/backfill gate with full-suite evidence, real-campaign backfill proof, PinchTab/browser smoke, validation flip, and GitNexus scope report.

**Why:** Phase 76 found the runtime personality implementation current, but the Phase 63 final verification/backfill plan remains unresolved and an earlier real backfill attempt failed.

**Source Audit Row:** 63-current:verification-backfill-gate
**Source Ledger Gap:** G76-GAP-024
**Ledger:** .planning/phases/76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap/76-GAP-LEDGER.md

**Trigger:** Promote when Phase 63 evidence cleanup or release-readiness verification is in scope.

## 999.6: Scene-First Play Surface Inspired by Marinara GM Flow

**Idea:** Build a WorldForge presentation layer that turns authoritative runtime state into a visual-novel-like play surface: latest-turn beat reader, full-bleed scene background, present-actor strip, compact diegetic mechanics, ambient time/weather layer, character-focused dialogue beats, and choice cards at the control handoff.

**Why:** Marinara Engine's Game Mode feels better as a solo RPG because it presents play as a scene rather than a debug cockpit. WorldForge already has stronger consistency, presence, inventory, rollback, and lore authority; the missing layer is translating those truths into readable, paced, tactile game presentation.

**Source:** `.planning/research/marinara-gm-flow-reference.md` and https://github.com/Pasta-Devs/Marinara-Engine

**Trigger:** Promote when the next frontend/game-feel phase is planned, especially if live-play validation still feels like "chat log plus admin panels" instead of "playing a scene."

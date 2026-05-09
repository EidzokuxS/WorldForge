# Phase 63: Personality Interiority Model — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Source:** Direct user TZ (in-chat scope, replaces /gsd:discuss-phase)

<domain>
## Phase Boundary

Заменить плоский `behavioralCore` (motives/taboos/pressureResponses + traits/flaws/legacyTags) на глубинную модель личности **в стиле V2 SillyTavern карточек**, чтобы LLM **являлся** персонажем, а не разыгрывал сценарий по тегам.

**Проблема:** сейчас LLM получает биографию + setup + сухой список motives/taboos/pressure, но **внутрянку личности угадывает с нуля каждый ход**. Нет voice samples, нет decision pattern, нет worldview, нет противоречий.

**Решение:** новый `personality` блок с компонентами, аналогичными V2 cards (`personality`, `mes_example`, `description`):
- Что персонаж говорит (voice + sampleLines)
- Как мыслит (decisionStyle)
- Как видит мир (worldview)
- Внутренние противоречия (depth)
- Как себя позиционирует (personalMythology)

LLM выводит motives/taboos/pressure **ситуативно** из этого блока — больше не нужны как explicit поля.

</domain>

<decisions>
## Implementation Decisions

### Schema (shared/src/types.ts)

**Добавить:** `personality: CharacterPersonality` block в `CharacterIdentityDraft`
```ts
interface CharacterPersonality {
  summary: string;                   // 1-2 sentences essence (мигрирует из profile.personaSummary)
  voice: string;                     // vocab register, ритм, метафоры, что избегает
  decisionStyle: string;             // impulsive/analytical, intuitive/planned
  worldview: string;                 // cynic/idealist/pragmatist/mystic — как видит мир
  internalContradictions: string[];  // противоречия — даёт глубину
  personalMythology: string;         // как себя видит ("я последний хранитель")
  sampleLines: string[];             // 2-3 actual фразы в голосе (V2 mes_example аналог)
}
```

**Удалить из `behavioralCore`:** `motives`, `pressureResponses`, `taboos`
**Оставить в `behavioralCore`:** `selfImage`, `attachments`, `hardConstraints` (но `attachments` сделать **mutable** — изменяется в геймплее через `updates`/`liveDynamics` поток).

**Удалить из `capabilities`:** `traits`, `flaws` (дубль basic Tags)
**Удалить совсем:** `legacyTags` (Phase 30 артефакт, чисто визуальный шум).

**Оставить как есть** (без изменений):
- `selfImage`, `hardConstraints`, `biography`
- `liveDynamics`: `beliefDrift`, `currentStrains`, `earnedChanges`
- `profile`: species, gender, age, appearance
- `starting`: `sourcePrompt`, `immediateSituation`, `entryPressure`, `companions`
- `runtime`, `loadout`, `socialStatus`
- `capabilities` (только `skills`, `specialties`, `wealthTier` остаются)
- `motivations`: `beliefs`, `drives`, `frictions`

### Ingestion Pipeline (Phase 60 extension)

Все 4 entry-point должны заполнять `personality`:

1. **V2/V3 import** (`backend/src/character/v2-card-mapper`):
   - `personality` field карточки → `personality.summary`
   - `mes_example` → парсить реплики персонажа → `personality.sampleLines` (2-3 штуки)
   - LLM-pass для derivation: `voice`, `decisionStyle`, `worldview`, `internalContradictions`, `personalMythology` из `description` + `personality` + `mes_example`

2. **Parse description** (free-text → character):
   - LLM генерирует полный `personality` блок в одном проходе с базовыми полями

3. **AI generate** (`generateCharacter`):
   - `personality` включён в `outputSchema` Zod
   - prompt инструктирует генерировать voice + sampleLines в **жанре/тоне мира**

4. **Archetype research** (`ip-researcher`):
   - После сбора фактов из веба — LLM-синтез `personality` блока (voice = как канон-персонаж говорит, sampleLines = реальные цитаты если найдены, иначе LLM-имитация)

### Prompt Assembly (`backend/src/engine/prompt-assembler.ts:1383-1410`)

**Заменить** текущий `behavioralCore` блок (motives/pressure/taboos/attachments/selfImage) на:

```
personality:
  summary: "{personality.summary}"
  voice: "{personality.voice}"
  decision-style: "{personality.decisionStyle}"
  worldview: "{personality.worldview}"
  internal-contradictions: [{...}]
  personal-mythology: "{personality.personalMythology}"
  sample-lines: ["...", "..."]
self-image: "{behavioralCore.selfImage}"
attachments: [{behavioralCore.attachments}]   // mutable runtime field
hard-constraints: [{baseFacts.hardConstraints}]
```

**Принцип:** LLM выводит motives/taboos/pressure ситуативно из personality + worldview + contradictions. Больше не явные поля.

### UI

**Basic NPC card** (`frontend/components/world-review/NpcCard` или эквивалент):
- Новая секция **PERSONALITY** между Tags и Power Stats
- Всегда видно: `summary` + `voice` (1 строка)
- Collapsible: `sampleLines`, `decisionStyle`, `worldview`, `internalContradictions`, `personalMythology`

**Advanced inspector** (Phase 62 cleanup):
- Identity Core: убрать `motives`, `taboos`, `pressureResponses` блоки
- Capabilities: убрать `traits`, `flaws`, `legacyTags`
- Provenance section: убрать целиком (метаданные → доступны только через Raw JSON tab)

### Migration

**Старые NPCs** с пустым `personality` → backfill **пакетно через LLM**:
- Источник: `biography` + старый `behavioralCore` + `selfImage` + `motivations` + `socialRole` → синтез `personality` блока
- Запуск: одноразовый migration script (`backend/src/scripts/backfill-personality.ts`)
- Идемпотентность: пропускать NPCs с уже заполненным `personality.summary`
- Batching: чанки по 5-10 NPCs параллельно через `generateObject`
- Логирование: per-NPC лог в structured format (Phase 58 pattern)

**Drizzle migration**: добавить `personality` JSON column в `npcs`/`players` таблицы (или extend существующий identity JSON, в зависимости от текущей структуры — research уточнит).

**Schema deprecation strategy**: `motives`/`taboos`/`pressureResponses`/`traits`/`flaws`/`legacyTags` в Zod schema помечаются `.optional()` для backward read compatibility во время migration window, затем удаляются в follow-up cleanup phase. Запись новых данных в эти поля **прекращается** на старте Phase 63.

### Claude's Discretion

- Точная Zod schema validation (min/max length для строк, max items для массивов)
- Внутренний формат хранения в SQLite (JSON column vs. denormalized)
- Migration script: error handling, retry logic, progress reporting
- Frontend: точные shadcn компоненты для PERSONALITY card section
- Тесты: unit для prompt assembly, integration для pipeline, snapshot для migration output

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema & Types
- `shared/src/types.ts` — `CharacterIdentityDraft`, `CharacterIdentityBehavioralCore`, `CharacterIdentityLiveDynamics` (lines ~280-460)

### Prompt Assembly (replacement target)
- `backend/src/engine/prompt-assembler.ts:1383-1410` — текущий behavioralCore блок
- `backend/src/engine/__tests__/prompt-assembler.character-identity.test.ts` — golden tests (нужно обновить)

### Ingestion Pipeline (Phase 60 — extend)
- `backend/src/character/generator.ts` — `parseCharacterDescription`, `generateCharacter`, `mapV2CardToCharacter`
- `backend/src/character/archetype-researcher.ts` — IP research → character synthesis
- `frontend/lib/v2-card-parser.ts` — V2/V3 card parsing (client-side)
- `backend/src/routes/worldgen/parse-character.ts`, `generate-character.ts`, `import-v2-card.ts`, `research-character.ts`

### UI (Phase 61 + Phase 62 cleanup targets)
- `frontend/components/world-review/npcs-section.tsx` — basic NPC card target
- Phase 62 inspector компоненты (advanced cleanup target — locate via /gsd:plan-phase research)

### Database
- `backend/src/db/schema.ts` — `npcs`, `players` таблицы

### Logging convention
- Phase 58 structured logging — Pipeline observability (используем тот же pattern для migration script)

</canonical_refs>

<specifics>
## Specific Ideas

- **V2 carmes_example parsing**: SillyTavern формат — `<START>` + dialog turns. Извлекать только реплики `{{char}}`, лимит 3 sample lines, prefer самые показательные (длиннее 20 chars, без OOC маркеров).
- **Voice field**: примеры формата — "Краткие отрывистые фразы; военный жаргон; редкие метафоры из охоты; избегает эмоций" (не bullet list, а проза).
- **InternalContradictions**: 2-3 пункта, формат — "Believes X, but acts as Y because Z". Пример: "Считает себя пацифистом, но первым тянется к оружию когда страшно".
- **PersonalMythology**: 1 sentence в первом лице или нарратив — "Я последний хранитель древней клятвы" / "Просто наблюдатель, оказавшийся не в том месте".
- **SampleLines**: actual quotes в голосе, не описания — `"А ты думал, что только ты тут с ножом?"` а не `"Говорит угрожающе"`.

</specifics>

<deferred>
## Deferred Ideas

- **Voice consistency tracking** в runtime: проверка что storyteller responses совпадают с personality.voice — отдельная фаза observability (post-Phase 63).
- **Personality drift mechanic**: связь `personality.internalContradictions` ↔ `liveDynamics.beliefDrift` для эволюции персонажа в долгой кампании — отдельная фаза design.
- **Global character DB** (cross-campaign personality reuse) — упомянут в `project_power_profile_redesign.md`, отдельная phase.
- **Cleanup phase**: финальное удаление `motives`/`taboos`/`pressureResponses`/`traits`/`flaws`/`legacyTags` из Zod schema после migration window (follow-up phase 64+).

</deferred>

---

*Phase: 63-personality-interiority-model*
*Context gathered: 2026-04-18 via Direct user TZ (skipped formal /gsd:discuss-phase)*

# WorldForge

**AI-управляемая текстовая RPG-песочница с ИИ Гейм-Мастером**

WorldForge — это текстовый RPG-движок, в котором ИИ выступает исключительно рассказчиком, а все механические результаты (вероятности, инвентарь, перемещение, здоровье) обрабатываются детерминированным бэкенд-движком. Игрок определяет вселенную — оригинальную или из известной франшизы — и живёт в ней как единственный протагонист.

Нет главного квеста. Мир эволюционирует самостоятельно: ключевые персонажи преследуют свои цели, фракции конфликтуют, события расходятся волнами.

## Возможности

- **ИИ = рассказчик, движок = закон.** LLM генерирует прозу. Все механики — вероятности, броски, инвентарь, HP — обрабатываются кодом
- **Оракул вероятностей.** Действия игрока оцениваются Judge-моделью → бросок D100 → 3 исхода (Сильный Успех / Слабый Успех / Промах)
- **Система тегов.** Персонажи, NPC, локации, фракции, предметы — всё описывается семантическими тегами. Единственная цифра — HP (1–5)
- **Soft-Fail.** Ничто не заблокировано. Крестьянин может попытаться метнуть фаерболл — получит околонулевой шанс и GM красочно опишет провал
- **Живой мир.** Ключевые NPC действуют автономно: говорят, перемещаются, преследуют цели. Фракции ведут макро-тики: захватывают территории, объявляют войны
- **Генерация мира.** 5-шаговый пайплайн: исследование IP → World DNA → локации/фракции/NPC → лор-карточки → персонаж игрока
- **Семантическая память.** LanceDB хранит эпизодические события и лор-карточки. Контекст сборки учитывает token-бюджеты
- **Импорт персонажей.** Полная поддержка SillyTavern V2/V3 карточек (JSON и PNG)
- **25+ LLM-провайдеров.** OpenAI, Anthropic, OpenRouter, Ollama, LM Studio, vLLM и другие через Vercel AI SDK

## Быстрый старт

### Требования

- **Node.js 20+**
- **npm**
- **API-ключ LLM-провайдера** (OpenAI, Anthropic, OpenRouter, Z.AI или локальный Ollama/LM Studio)

### Установка

```bash
git clone https://github.com/EidzokuxS/WorldForge.git
cd WorldForge

npm install    # устанавливает все зависимости + автоматически собирает shared-пакет
```

### Запуск

```bash
# Оба сервера сразу (бэкенд :3001 + фронтенд :3000)
npm run dev

# Или отдельно в двух терминалах:
npm run dev:backend
npm run dev:frontend
```

Открыть **http://localhost:3000** в браузере.

### Первый запуск

1. Зайти в **Settings** → **Providers** → добавить LLM-провайдер (API-ключ + эндпоинт)
2. Зайти в **Settings** → **Roles** → назначить модели для Judge, Storyteller, Generator, Embedder
3. Вернуться на титульный экран → **New Campaign** → ввести концепцию → играть

## Настройка

### Провайдеры LLM

Настраиваются через **Settings → Providers** в интерфейсе.

| Провайдер | Эндпоинт | Пример модели | Тип |
|-----------|----------|---------------|-----|
| OpenAI | api.openai.com | gpt-4o, gpt-4o-mini | Облако |
| Anthropic | api.anthropic.com | claude-sonnet, claude-haiku | Облако |
| OpenRouter | openrouter.ai/api/v1 | любая из 200+ моделей | Облако (мульти) |
| Z.AI (GLM) | api.minimax.io/anthropic | glm-4.7-flash | Облако |
| Ollama | localhost:11434 | llama3, mistral | Локальный |
| LM Studio | localhost:1234 | любая GGUF | Локальный |

### Роли ИИ

4 роли — каждая с отдельным провайдером и моделью:

| Роль | Назначение | Рекомендуемая температура |
|------|-----------|--------------------------|
| **Judge** | Оценка вероятности (структурированный JSON) | 0.0–0.5 |
| **Storyteller** | Нарративная генерация (проза) | 0.7–1.0 |
| **Generator** | Генерация мира и персонажей | 0.7 |
| **Embedder** | Векторные эмбеддинги | 0.0 |

Judge может работать на дешёвой/быстрой модели (gpt-4o-mini, Haiku). Storyteller — на флагмане (gpt-4o, Sonnet, GLM-4.7).

## Как это работает

### Анатомия хода

```
Игрок вводит действие
    ↓
Сборка контекста (локация, NPC, лор, история)
    ↓
Judge оценивает вероятность (0–100%)
    ↓
Бэкенд бросает D100
    ↓
Результат: Strong Hit / Weak Hit / Miss
    ↓
Storyteller описывает результат + вызывает инструменты
    ↓
Движок обновляет состояние (HP, теги, локация, инвентарь)
    ↓
Отображение: нарратив + Oracle-панель + быстрые действия
```

### Система тегов

Все семантические атрибуты — теги:
- **Черты:** навыки, недостатки, магические способности (`Skilled Negotiator`, `Arrogant`)
- **Статусы:** временные состояния (`Poisoned`, `Inspired`)
- **Отношения:** социальные связи (`Trusted by Eldric`, `Enemy of the Gray Cult`)
- **Богатство:** экономический уровень (`Destitute` → `Wealthy` → `Obscenely Rich`)

### HP

- Шкала **1–5** (не 0–100)
- HP = 0 → GM определяет исход (смерть не автоматическая — зависит от контекста)
- Авто-чекпоинт перед смертельными столкновениями

### NPC

3 уровня:
- **Key Characters** — полноценные ИИ-агенты с целями, убеждениями, рефлексией. Действуют автономно каждый ход
- **Persistent** — отслеживаются в БД, имеют историю, но не действуют самостоятельно
- **Temporary** — массовка, обновляется каждый ход

### Фракции

Фракции ведут макро-тики каждые N игровых дней: захватывают территории, генерируют мировые события, обновляют хронику.

### Генерация мира

5-шаговый пайплайн с SSE-прогрессом в реальном времени:

1. **Исследование** (опционально) — для известных IP: поиск через DuckDuckGo MCP + LLM-fallback
2. **World DNA** (опционально) — 6 категорий уникальности: географический архетип, политическая структура, центральный конфликт, культурный колорит, окружающая среда, wildcard-элемент
3. **Скаффолд** — ИИ генерирует локации, фракции, NPC на основе ограничений DNA
4. **Лор-карточки** — 30–50 знаний автоматически извлекаются и сохраняются в LanceDB
5. **Персонаж игрока** — 3 режима: описание текстом, ИИ-генерация, импорт V2/V3 карточки

### Память и контекст

- **Эпизодическая память** — события каждого хода сохраняются в LanceDB с эмбеддингами. Композитный скоринг: similarity×0.4 + recency×0.3 + importance×0.3
- **Лор-карточки** — семантический поиск по LanceDB
- **Граф отношений** — 2-hop BFS обход по SQLite для обогащения контекста
- **Сжатие контекста** — первые сообщения + последние N ходов + аномальные события в token-бюджете
- **История чата** — персистится на диск, переживает перезагрузку страницы

### Чекпоинты

- **Ручное сохранение** — снимок state.db + vectors + chat_history
- **Авто-чекпоинт** — перед смертельными столкновениями (HP ≤ 2)
- **Загрузка** — откат к сохранённому состоянию
- **Ветвление** — «что если» исследование альтернативных путей

## Технологический стек

### Фронтенд

| Пакет | Версия | Назначение |
|-------|--------|-----------|
| Next.js | 16.1.6 | App Router, SSR |
| React | 19.2.3 | Компонентный фреймворк |
| Tailwind CSS | 4.x | Utility-first стилизация |
| shadcn/ui | 3.8.5 | UI-компоненты |
| Radix UI | 1.4.3 | Headless-примитивы |
| lucide-react | 0.576.0 | Иконки |

### Бэкенд

| Пакет | Версия | Назначение |
|-------|--------|-----------|
| Hono | 4.12.3 | Веб-фреймворк |
| Drizzle ORM | 0.45.1 | Type-safe SQL |
| better-sqlite3 | 12.6.2 | SQLite-драйвер |
| Zod | 4.3.6 | Валидация схем |
| ai (Vercel) | 6.0.106 | Стриминг, tool calling, 25+ провайдеров |
| @lancedb/lancedb | 0.26.2 | Встроенная векторная БД |

### ИИ-провайдеры

| Пакет | Назначение |
|-------|-----------|
| @ai-sdk/openai | OpenAI-совместимые API |
| @ai-sdk/anthropic | Anthropic API |
| @ai-sdk/mcp | MCP-инструменты (веб-поиск) |

## Структура проекта

```
worldforge/
├── shared/                     ← @worldforge/shared — типы, константы
├── frontend/                   ← Next.js фронтенд
│   ├── app/                    ← Страницы (title, game, settings, character, review)
│   ├── components/
│   │   ├── game/               ← NarrativeLog, ActionBar, OraclePanel, CharacterPanel,
│   │   │                         LocationPanel, LorePanel, CheckpointPanel, QuickActions
│   │   ├── title/              ← TitleScreen, NewCampaignDialog
│   │   ├── character-creation/ ← CharacterForm, CharacterCard
│   │   └── world-review/       ← PremiseSection, LocationsSection, FactionsSection,
│   │                             NpcsSection, LoreSection
│   └── lib/                    ← api.ts, settings.ts, v2-card-parser.ts
│
├── backend/                    ← Hono бэкенд
│   └── src/
│       ├── ai/                 ← provider-registry, storyteller, oracle, prompt-assembler,
│       │                         with-model-fallback, generate-object-safe
│       ├── engine/             ← npc-agent, world-engine, reflection-agent, oracle,
│       │                         turn-processor, tool-executor
│       ├── campaign/           ← manager, chat-history, checkpoints
│       ├── character/          ← generator, npc-generator, archetype-researcher
│       ├── worldgen/           ← scaffold-generator, seed-roller, suggest-seeds,
│       │                         scaffold-saver, ip-researcher, lore-extractor
│       ├── vectors/            ← episodic-events, lore-cards, embeddings
│       ├── db/                 ← schema, index, migrate
│       ├── settings/           ← manager (normalize, load, save)
│       ├── routes/             ← campaigns, chat, ai, worldgen, settings, images, character
│       └── lib/                ← errors, clamp, type-guards
│
├── campaigns/                  ← Данные пользователя (gitignored)
│   └── {uuid}/                 ← state.db, config.json, chat_history.json, vectors/
│
└── docs/                       ← Дизайн-документация
    ├── concept.md              ← Видение, геймплей-луп
    ├── mechanics.md            ← Тег-система, Oracle, NPC
    ├── memory.md               ← SQLite + LanceDB архитектура
    ├── tech_stack.md           ← Полный стек
    └── research.md             ← Исследования и решения
```

## API-эндпоинты

### Кампании

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/campaigns` | Список кампаний |
| POST | `/api/campaigns` | Создать кампанию |
| DELETE | `/api/campaigns/:id` | Удалить кампанию |
| POST | `/api/campaigns/:id/load` | Загрузить кампанию |
| GET | `/api/campaigns/active` | Активная кампания |
| GET | `/api/campaigns/:id/world` | Данные мира (NPC, локации, фракции) |

### Геймплей

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/chat/history` | История чата + premise |
| POST | `/api/chat` | Отправить действие, стрим ответа Storyteller |

### Генерация мира

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/worldgen/roll-seeds` | Бросить все случайные сиды |
| POST | `/api/worldgen/suggest-seeds` | ИИ-генерация сидов из premise |
| POST | `/api/worldgen/generate` | Генерация скаффолда (SSE) |
| POST | `/api/worldgen/regenerate-section` | Перегенерировать секцию |
| POST | `/api/worldgen/save-edits` | Сохранить правки скаффолда |

### Персонажи

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/worldgen/parse-character` | Парсинг описания в ParsedCharacter |
| POST | `/api/worldgen/generate-character` | ИИ-генерация персонажа |
| POST | `/api/worldgen/import-v2-card` | Импорт SillyTavern V2/V3 карточки |
| POST | `/api/worldgen/save-character` | Сохранить персонажа и начать игру |

### Лор и память

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/campaigns/:id/lore` | Лор-карточки |
| GET | `/api/campaigns/:id/lore/search?q=&limit=` | Семантический поиск лора |

### Настройки

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/settings` | Загрузить настройки |
| POST | `/api/settings` | Сохранить настройки |
| POST | `/api/providers/test` | Тест подключения провайдера |
| POST | `/api/ai/test-role` | Тест роли с реальным LLM-вызовом |

## Архитектура

### Принципы

1. **LLM = рассказчик.** Все механические исходы — код бэкенда
2. **Structured Tool Calling.** Все взаимодействия ИИ-агентов используют Zod-валидированные схемы инструментов
3. **SQLite = источник истины.** LanceDB — только семантическая память
4. **Теги, не цифры.** Единственное число — HP (1–5)
5. **Soft-fail.** Нет заблокированных действий — только последствия

### БД

**SQLite** (8 таблиц): campaigns, players, npcs, locations, items, factions, relationships, chronicle

**LanceDB** (векторное хранилище): episodic_events, lore_cards

### Стриминг

- SSE для прогресса генерации мира и нарративного стриминга
- Типизированные события: `narrative`, `oracle_result`, `state_update`, `quick_actions`, `done`

## Команды разработки

```bash
# Бэкенд
cd backend && npm run dev          # Dev-сервер на :3001
npm --prefix backend run typecheck # Проверка типов
npm --prefix backend run test      # Тесты

# Фронтенд
cd frontend && npm run dev         # Dev-сервер на :3000
npm --prefix frontend run lint     # Линтинг

# БД
npm --prefix backend run db:generate  # Миграции Drizzle
npm --prefix backend run db:push      # Применить миграции
```

## Лицензия

MIT

---

*[English version](README.md)*

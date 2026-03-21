# Research Agent (Known IPs) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Добавить Step 0 ("Research & Grounding") в пайплайн генерации мира, который для известных IP (Naruto, Star Wars, Cyberpunk 2077 и т.д.) собирает каноничную справочную информацию и передаёт её как контекст в scaffold generation.

**Architecture:** 2-фазный подход:
- **Фаза 1 (MVP)**: LLM-only research — Generator анализирует premise, определяет IP, генерирует structured reference material из собственных знаний. Никаких внешних API.
- **Фаза 2**: MCP Web Search — LLM автономно ищет каноничную информацию через DuckDuckGo MCP сервер. Без API ключей. LLM сам решает что искать, читает сниппеты, обогащает research. Fallback на Фазу 1 при ошибках MCP.

**Tech Stack:** TypeScript, Vercel AI SDK (`generateObject`, `generateText`), Zod, `@ai-sdk/mcp` (MCP клиент, Фаза 2), `duckduckgo-mcp-server` (MCP сервер, stdio)

---

## Контекст: Текущий пайплайн

```
POST /api/worldgen/generate
  ├─ resolveGenerator → ResolvedRole
  └─ generateWorldScaffold(req, onProgress)
       ├─ Step 1: Refine Premise    → refinedPremise
       ├─ Step 2: Build Locations   → locations[]
       ├─ Step 3: Forge Factions    → factions[]
       ├─ Step 4: Create NPCs       → npcs[]
       └─ Step 5: Extract Lore      → loreCards[]
```

Research Agent добавляет **Step 0** перед Step 1. Результат Step 0 (`researchContext: string`) инжектится в промпты **всех** последующих шагов как grounding material.

```
POST /api/worldgen/generate
  ├─ resolveGenerator → ResolvedRole
  └─ generateWorldScaffold(req, onProgress)
       ├─ Step 0: Research IP        → researchContext    ← NEW
       ├─ Step 1: Refine Premise    → refinedPremise     (+ researchContext)
       ├─ Step 2: Build Locations   → locations[]        (+ researchContext)
       ├─ Step 3: Forge Factions    → factions[]         (+ researchContext)
       ├─ Step 4: Create NPCs       → npcs[]             (+ researchContext)
       └─ Step 5: Extract Lore      → loreCards[]        (+ researchContext)
```

---

## Фаза 1: LLM-Only Research (MVP)

> Цель: Generator анализирует premise, определяет является ли мир "Known IP", и если да — генерирует structured reference material из собственных знаний. Без внешних API. Без изменений UI.

### Task 1.1: Research Analyzer Module

**Files:**
- Create: `backend/src/worldgen/research-analyzer.ts`
- Test: вручную через существующий endpoint

**Step 1: Создать Zod-схемы для research output**

```typescript
// backend/src/worldgen/research-analyzer.ts
import { z } from "zod";
import { generateObject } from "ai";
import { createModel } from "../ai/provider-registry.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";

// Результат анализа premise
const ipAnalysisSchema = z.object({
  isKnownIP: z.boolean(),
  ipName: z.string().nullable(),        // "Naruto", "Star Wars", null
  ipUniverse: z.string().nullable(),    // "Naruto Shippuden", "Star Wars: Old Republic"
  divergenceNote: z.string().nullable() // "Sasuke trained with Jiraiya instead"
});

// Structured reference material
const referenceEntrySchema = z.object({
  category: z.enum(["location", "character", "faction", "power_system", "technology", "lore", "event"]),
  name: z.string(),
  description: z.string(),              // 2-4 предложения, фактический стиль
  canonSource: z.string().optional()    // "Naruto manga ch.1", "Star Wars Episode IV"
});

const researchResultSchema = z.object({
  ipName: z.string(),
  setting: z.string(),                  // краткое описание вселенной (2-3 предложения)
  keyLocations: z.array(referenceEntrySchema).min(3).max(15),
  keyCharacters: z.array(referenceEntrySchema).min(3).max(15),
  factions: z.array(referenceEntrySchema).min(1).max(10),
  powerSystems: z.array(referenceEntrySchema).min(0).max(5),
  technologyLevel: z.string(),          // "Medieval fantasy", "Near-future cyberpunk", "Space opera"
  importantEvents: z.array(referenceEntrySchema).min(0).max(10),
  worldRules: z.array(z.string()).min(1).max(10) // "Chakra is the energy source for all jutsu"
});

export type IPAnalysis = z.infer<typeof ipAnalysisSchema>;
export type ResearchResult = z.infer<typeof researchResultSchema>;
```

**Step 2: Реализовать функцию `analyzeIP`**

```typescript
export async function analyzeIP(
  premise: string,
  role: ResolvedRole
): Promise<IPAnalysis> {
  const result = await generateObject({
    model: createModel(role.provider),
    schema: ipAnalysisSchema,
    prompt: `Analyze the following campaign premise and determine if it references a known intellectual property (IP) — a published franchise, anime, manga, game, book series, movie, TV show, etc.

PREMISE: "${premise}"

Rules:
- If the premise mentions or clearly references a known IP (by name or unmistakable description), set isKnownIP=true.
- Extract the IP name and specific universe/era if identifiable.
- If the premise describes a "what if" divergence from canon, note the divergence.
- If the premise is entirely original (no recognizable IP), set isKnownIP=false and all other fields to null.`,
    temperature: 0.3,  // low creativity for analysis
    maxOutputTokens: 512,
  });
  return result.object;
}
```

**Step 3: Реализовать функцию `researchKnownIP`**

```typescript
export async function researchKnownIP(
  premise: string,
  analysis: IPAnalysis,
  role: ResolvedRole
): Promise<ResearchResult> {
  const result = await generateObject({
    model: createModel(role.provider),
    schema: researchResultSchema,
    prompt: `You are a world-building research assistant. Generate a comprehensive reference document about the following intellectual property to be used as grounding material for an RPG world generator.

IP: ${analysis.ipName} (${analysis.ipUniverse ?? "main continuity"})
PREMISE: "${premise}"
${analysis.divergenceNote ? `DIVERGENCE FROM CANON: ${analysis.divergenceNote}` : ""}

Instructions:
- Provide CANONICAL information about this IP's world, characters, factions, locations, and rules.
- Focus on factual descriptions, not opinions or analysis.
- Each entry should be 2-4 sentences of dense, useful information.
- Include information relevant to the PREMISE — if the premise focuses on a specific era or region, prioritize that.
- For "what if" scenarios: provide the CANON version. The generator will handle the divergence.
- technologyLevel should be a brief label (e.g., "Medieval fantasy with magic", "Near-future cyberpunk").
- worldRules are fundamental laws/constraints of the universe (e.g., "The Force has a light side and dark side").

Generate 30-80 reference entries total across all categories.`,
    temperature: 0.5,
    maxOutputTokens: role.maxTokens,
  });
  return result.object;
}
```

**Step 4: Реализовать функцию `formatResearchContext`**

```typescript
export function formatResearchContext(research: ResearchResult): string {
  const sections: string[] = [];

  sections.push(`=== REFERENCE MATERIAL: ${research.ipName} ===`);
  sections.push(`Setting: ${research.setting}`);
  sections.push(`Technology Level: ${research.technologyLevel}`);

  if (research.worldRules.length > 0) {
    sections.push(`\nWorld Rules:\n${research.worldRules.map(r => `- ${r}`).join("\n")}`);
  }

  const formatEntries = (title: string, entries: z.infer<typeof referenceEntrySchema>[]) => {
    if (entries.length === 0) return;
    sections.push(`\n${title}:`);
    for (const e of entries) {
      sections.push(`- ${e.name}: ${e.description}`);
    }
  };

  formatEntries("Key Locations", research.keyLocations);
  formatEntries("Key Characters", research.keyCharacters);
  formatEntries("Factions & Organizations", research.factions);
  formatEntries("Power Systems & Magic", research.powerSystems);
  formatEntries("Important Events", research.importantEvents);

  sections.push(`\n=== END REFERENCE MATERIAL ===`);
  sections.push(`Use the above as grounding. Stay faithful to canon unless the premise specifies divergence.`);

  return sections.join("\n");
}
```

**Step 5: Экспортировать главную функцию-оркестратор**

```typescript
/**
 * Step 0 of the world generation pipeline.
 * Analyzes premise for known IPs and generates reference material.
 * Returns empty string for original worlds (no known IP detected).
 */
export async function performIPResearch(
  premise: string,
  role: ResolvedRole
): Promise<string> {
  const analysis = await analyzeIP(premise, role);

  if (!analysis.isKnownIP || !analysis.ipName) {
    return "";  // Original world — no research needed
  }

  const research = await researchKnownIP(premise, analysis, role);
  return formatResearchContext(research);
}
```

**Step 6: Запустить typecheck**

```bash
cd backend && npm run typecheck
```
Expected: PASS (0 errors)

**Step 7: Commit**

```bash
git add backend/src/worldgen/research-analyzer.ts
git commit -m "feat(worldgen): add IP research analyzer module (LLM-only, Step 0)"
```

---

### Task 1.2: Интеграция Research в Pipeline

**Files:**
- Modify: `backend/src/worldgen/scaffold-generator.ts`
- Modify: `backend/src/routes/worldgen.ts` (только SSE totalSteps)

**Step 1: Добавить `researchContext` в `WorldScaffold` и `GenerateScaffoldRequest`**

В `scaffold-generator.ts`:

```typescript
// В WorldScaffold добавить:
export interface WorldScaffold {
  researchContext: string;   // ← NEW: пустая строка для original worlds
  refinedPremise: string;
  locations: ...;
  factions: ...;
  npcs: ...;
  loreCards: ExtractedLoreCard[];
}
```

**Step 2: Добавить Step 0 в `generateWorldScaffold`**

В начало функции `generateWorldScaffold`, перед Step 1:

```typescript
// Step 0: Research Known IP
reportProgress(onProgress, 0, "Researching world source material");
const researchContext = await performIPResearch(req.premise, req.role);

// totalSteps теперь = 6 (0-5), но нумерация шагов в progress сдвигается:
// step 0 = Research, step 1 = Premise, step 2 = Locations, ...
```

Все `reportProgress` вызовы ниже сдвигаются на +1 (step 1→1 остаётся, т.к. Step 0 новый и вставляется ДО).

Альтернатива без сдвига: `totalSteps = 6`, шаги нумеруются 1-6, Step 0 репортится как `step=1`.

**Выбранный подход**: Нумерация 1-6, Research = step 1, Premise = step 2, и т.д.

```typescript
const TOTAL_STEPS = 6;

// Step 1/6: Research
reportProgress(onProgress, 1, "Researching world source material");
const researchContext = await performIPResearch(req.premise, req.role);

// Step 2/6: Refine Premise (бывший Step 1)
reportProgress(onProgress, 2, "Refining world premise");
// ... существующий код, но prompt дополняется researchContext

// Step 3/6: Build Locations (бывший Step 2)
reportProgress(onProgress, 3, "Building locations");

// Step 4/6: Forge Factions (бывший Step 3)
reportProgress(onProgress, 4, "Forging factions");

// Step 5/6: Create NPCs (бывший Step 4)
reportProgress(onProgress, 5, "Creating key NPCs");

// Step 6/6: Extract Lore (бывший Step 5)
reportProgress(onProgress, 6, "Extracting world lore");
```

**Step 3: Инжектировать `researchContext` в промпты шагов 2-6**

Создать helper:

```typescript
function buildResearchSection(researchContext: string): string {
  if (!researchContext) return "";
  return `\n\n${researchContext}\n\n`;
}
```

В каждом `generateObject` вызове (шаги 2-6) добавить `researchContext` в prompt:

```typescript
// Пример для Step 2 (Refine Premise):
const premisePrompt = `${buildResearchSection(researchContext)}You are a world-building AI. ...existing prompt...`;
```

Формат инъекции: researchContext вставляется **в начало** промпта, перед основной инструкцией. Если пустая строка — ничего не вставляется.

**Step 4: Обновить `WorldScaffold` return**

```typescript
return {
  researchContext,  // ← NEW
  refinedPremise,
  locations,
  factions,
  npcs,
  loreCards,
};
```

**Step 5: Обновить `worldgen.ts` route — SSE complete event**

В SSE `complete` event ничего менять не нужно — `researchContext` не отправляется клиенту. Но frontend может показывать "Researching..." как первый шаг — это уже обрабатывается автоматически через существующий SSE progress listener.

Проверить что frontend корректно обрабатывает `totalSteps=6` вместо `5`. Файл: `frontend/components/title/WorldGenOverlay.tsx` (или аналог).

**Step 6: Запустить typecheck**

```bash
cd backend && npm run typecheck
```
Expected: PASS

**Step 7: Commit**

```bash
git add backend/src/worldgen/scaffold-generator.ts backend/src/routes/worldgen.ts
git commit -m "feat(worldgen): integrate IP research as Step 1/6 in pipeline"
```

---

### Task 1.3: Frontend — обработка 6-шагового прогресса

**Files:**
- Modify: компонент отображения прогресса генерации (WorldGenOverlay или аналог)

**Step 1: Найти компонент прогресса генерации в frontend**

```bash
grep -r "totalSteps\|progress\|step.*label" frontend/
```

**Step 2: Убедиться что компонент корректно обрабатывает динамическое `totalSteps`**

Если прогресс-бар использует `step / totalSteps` — никаких изменений не нужно.
Если где-то хардкожено `5` — заменить на `totalSteps` из SSE-данных.

**Step 3: Опционально — добавить иконку/текст для шага "Researching"**

Если есть маппинг шагов на иконки/описания — добавить для "Researching world source material".

**Step 4: Запустить frontend lint**

```bash
cd frontend && npm run lint
```
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/
git commit -m "feat(ui): support 6-step world generation progress"
```

---

### Task 1.4: Manual Testing — Фаза 1

**Тест-кейсы:**

1. **Known IP**: Создать кампанию с premise "Naruto Shippuden, but Sasuke trained with Jiraiya"
   - Expected: Step 1 "Researching..." появляется, затем все 6 шагов проходят
   - Expected: Сгенерированные локации/NPC/фракции соответствуют вселенной Naruto
   - Expected: Lore cards содержат канонную информацию (chakra, Hidden Villages, etc.)

2. **Original world**: Создать кампанию с premise "A dark fantasy world on the back of a space-whale"
   - Expected: Step 1 "Researching..." проходит быстро (LLM определяет isKnownIP=false)
   - Expected: researchContext = "", шаги 2-6 работают как раньше
   - Expected: Scaffold не содержит информации из какого-либо IP

3. **Edge case — ambiguous**: Premise "A cyberpunk world inspired by Blade Runner"
   - Expected: LLM может определить как Known IP или нет — оба варианта приемлемы
   - Expected: Пайплайн завершается без ошибок в любом случае

**Commit после тестирования:**

```bash
git commit --allow-empty -m "test: manual verification of Phase 1 research agent"
```

---

## Фаза 2: MCP Web Search (DuckDuckGo)

> Цель: Для Known IPs — LLM автономно ищет каноничную информацию через DuckDuckGo MCP сервер. LLM сам решает что искать, сколько раз, какие запросы формировать. Без API ключей. Fallback на Фазу 1 (LLM-only) при ошибках MCP.

### Как это работает

Ключевая идея: мы **не хардкодим** поисковые запросы и не управляем процессом поиска из кода. Вместо этого:

1. Backend создаёт MCP-клиент (`@ai-sdk/mcp`) и поднимает DDG MCP сервер как subprocess (stdio transport)
2. MCP-клиент автоматически discover-ит tools DDG сервера (`duckduckgo_search`)
3. Эти tools передаются в `generateText` — LLM **сам** решает что искать
4. LLM вызывает `duckduckgo_search` столько раз, сколько считает нужным (ограничено `maxSteps`)
5. Результаты поиска (title + URL + snippet) возвращаются LLM, который компилирует итоговый research
6. MCP-клиент закрывается, subprocess DDG сервера завершается

LLM действует как **research agent** — формулирует запросы, анализирует сниппеты, решает нужно ли искать ещё.

**Важное ограничение DDG MCP**: возвращает только search snippets (title/URL/краткий текст), **не скрейпит** полные страницы. Этого достаточно для grounding — LLM комбинирует сниппеты со своими знаниями.

---

### Task 2.1: Research Settings

**Files:**
- Modify: `shared/src/types.ts` — добавить `ResearchConfig` в `Settings`
- Modify: `backend/src/routes/schemas.ts` — добавить в `settingsPayloadSchema`
- Modify: `backend/src/settings/manager.ts` — добавить defaults, нормализацию
- Modify: `frontend/` — добавить секцию Research в Settings UI

**Step 1: Добавить `ResearchConfig` в shared types**

В `shared/src/types.ts`:

```typescript
export interface ResearchConfig {
  enabled: boolean;       // глобальный toggle (включает MCP web search)
  maxSteps: number;       // лимит agentic tool-calling раундов (default: 8)
}

export interface Settings {
  // ...existing fields...
  research: ResearchConfig;  // ← NEW
}
```

> **Никаких API ключей** — DDG MCP сервер бесплатный и не требует аутентификации.

**Step 2: Обновить defaults в settings manager**

В `backend/src/settings/manager.ts`, в функции `normalizeSettings` добавить defaults:

```typescript
research: {
  enabled: true,
  maxSteps: 8,
}
```

**Step 3: Обновить Zod-схему в schemas.ts**

```typescript
const researchConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxSteps: z.number().int().min(1).max(20).default(8),
});

// В settingsPayloadSchema добавить:
research: researchConfigSchema,
```

**Step 4: Frontend — секция Research в Settings**

Добавить новый таб "Research" (или секцию внутри существующего таба) с полями:
- Toggle: "Enable web research for known IPs"
- Number: "Max search steps" (1-20, default 8) — сколько раундов tool-calling LLM может делать
- Info text: "When enabled, the Generator LLM will autonomously search DuckDuckGo for canonical information about known IPs. No API keys required."

**Step 5: Typecheck + lint**

```bash
cd backend && npm run typecheck
cd frontend && npm run lint
```

**Step 6: Commit**

```bash
git add shared/ backend/ frontend/
git commit -m "feat(settings): add Research config (MCP web search toggle, maxSteps)"
```

---

### Task 2.2: MCP Research Module

**Files:**
- Create: `backend/src/worldgen/mcp-research.ts`
- Modify: `backend/package.json` — добавить `@ai-sdk/mcp`

**Step 1: Установить `@ai-sdk/mcp`**

```bash
cd backend && npm install @ai-sdk/mcp
```

> `@ai-sdk/mcp` подтянет `@modelcontextprotocol/sdk` как transitive dependency. DDG MCP сервер (`duckduckgo-mcp-server`) **не устанавливается** в проект — он запускается через `npx -y` на лету.

**Step 2: Создать mcp-research.ts**

```typescript
// backend/src/worldgen/mcp-research.ts
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { generateText, stepCountIs } from "ai";
import { createModel } from "../ai/provider-registry.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import type { IPAnalysis } from "./research-analyzer.js";

/**
 * Запускает DDG MCP сервер, даёт LLM автономно искать информацию об IP,
 * возвращает скомпилированный research text.
 *
 * LLM сам формулирует поисковые запросы через MCP tool `duckduckgo_search`,
 * анализирует сниппеты, решает нужно ли искать ещё.
 */
export async function performMCPResearch(
  premise: string,
  analysis: IPAnalysis,
  role: ResolvedRole,
  maxSteps: number
): Promise<string> {
  const mcpClient = await createMCPClient({
    transport: new Experimental_StdioMCPTransport({
      command: "npx",
      args: ["-y", "duckduckgo-mcp-server"],
    }),
  });

  try {
    const tools = await mcpClient.tools();

    const result = await generateText({
      model: createModel(role.provider),
      tools,
      maxSteps,
      prompt: buildResearchPrompt(premise, analysis),
      temperature: 0.3,
      maxTokens: role.maxTokens,
    });

    return result.text;
  } finally {
    await mcpClient.close();
  }
}

function buildResearchPrompt(premise: string, analysis: IPAnalysis): string {
  return `You are a world-building research assistant. Your task is to gather canonical reference information about a known intellectual property (IP) to be used as grounding material for an RPG world generator.

IP: ${analysis.ipName} (${analysis.ipUniverse ?? "main continuity"})
PREMISE: "${premise}"
${analysis.divergenceNote ? `DIVERGENCE FROM CANON: ${analysis.divergenceNote}` : ""}

You have access to a DuckDuckGo search tool. Use it to find canonical information about this IP from fan wikis, official sources, and reference sites.

RESEARCH STRATEGY:
1. Search for the main setting/world overview
2. Search for key characters relevant to the premise
3. Search for factions/organizations
4. Search for locations/geography
5. Search for power systems, magic, or technology
6. If the premise mentions specific elements, search for those specifically

For each search, read the snippets carefully and extract factual information.

OUTPUT FORMAT:
After completing your research, compile a structured reference document with these sections:

=== REFERENCE MATERIAL: ${analysis.ipName} ===
Setting: [2-3 sentences about the world]
Technology Level: [brief label]

World Rules:
- [fundamental laws/constraints of the universe]

Key Locations:
- [Name]: [2-4 sentence factual description]

Key Characters:
- [Name]: [2-4 sentence factual description]

Factions & Organizations:
- [Name]: [2-4 sentence factual description]

Power Systems & Magic:
- [Name]: [2-4 sentence factual description]

Important Events:
- [Name]: [2-4 sentence factual description]

=== END REFERENCE MATERIAL ===
Use the above as grounding. Stay faithful to canon unless the premise specifies divergence.

IMPORTANT:
- Provide CANONICAL information, not opinions or analysis
- Focus on information relevant to the PREMISE
- For "what if" scenarios: provide the CANON version
- Aim for 30-80 reference entries total across all categories
- Each entry: 2-4 sentences of dense, useful information`;
}
```

**Step 3: Typecheck**

```bash
cd backend && npm run typecheck
```

**Step 4: Commit**

```bash
git add backend/src/worldgen/mcp-research.ts backend/package.json backend/package-lock.json
git commit -m "feat(worldgen): add MCP research module (DDG search via @ai-sdk/mcp)"
```

---

### Task 2.3: Интеграция MCP Research в Pipeline

**Files:**
- Modify: `backend/src/worldgen/research-analyzer.ts`
- Modify: `backend/src/worldgen/scaffold-generator.ts`

**Step 1: Обновить `performIPResearch` — добавить MCP web search**

```typescript
import { performMCPResearch } from "./mcp-research.js";

export interface ResearchOptions {
  mcpEnabled: boolean;
  maxSteps: number;
}

export async function performIPResearch(
  premise: string,
  role: ResolvedRole,
  options?: ResearchOptions
): Promise<string> {
  const analysis = await analyzeIP(premise, role);

  if (!analysis.isKnownIP || !analysis.ipName) {
    return "";  // Original world — no research needed
  }

  // Phase 2: MCP web search (if enabled)
  if (options?.mcpEnabled) {
    try {
      const mcpResult = await performMCPResearch(
        premise,
        analysis,
        role,
        options.maxSteps
      );
      if (mcpResult.trim()) {
        return mcpResult;  // MCP research successful — use it directly
      }
    } catch (error) {
      // MCP failed — fallback to LLM-only
      console.warn("MCP research failed, falling back to LLM-only:", error);
    }
  }

  // Phase 1 fallback: LLM-only research
  const research = await researchKnownIP(premise, analysis, role);
  return formatResearchContext(research);
}
```

**Step 2: Обновить вызов в scaffold-generator.ts**

В `generateWorldScaffold`:

```typescript
import { loadSettings } from "../settings/manager.js";

// Step 1/6: Research
reportProgress(onProgress, 1, "Researching world source material");
const settings = loadSettings();
const researchContext = await performIPResearch(
  req.premise,
  req.role,
  {
    mcpEnabled: settings.research.enabled,
    maxSteps: settings.research.maxSteps,
  }
);
```

**Step 3: Typecheck**

```bash
cd backend && npm run typecheck
```

**Step 4: Commit**

```bash
git add backend/src/worldgen/research-analyzer.ts backend/src/worldgen/scaffold-generator.ts
git commit -m "feat(worldgen): integrate MCP web search into IP research pipeline"
```

---

### Task 2.4: Manual Testing — Фаза 2

**Тест-кейсы:**

1. **MCP enabled (happy path)**: Research enabled в Settings → создать кампанию "Naruto Shippuden, but Sasuke trained with Jiraiya"
   - Expected: DDG MCP сервер стартует, LLM выполняет несколько поисковых запросов
   - Expected: Research содержит каноничные детали из поисковых сниппетов (Hidden Villages, chakra types, etc.)
   - Expected: Scaffold generation использует research как grounding
   - Expected: Лог показывает MCP tool calls (duckduckgo_search)

2. **MCP disabled**: Toggle "Enable web research" = off → создать кампанию "Star Wars: Old Republic"
   - Expected: Fallback на LLM-only research (Фаза 1 поведение)
   - Expected: Никаких subprocess-ов DDG MCP сервера
   - Expected: Пайплайн завершается нормально

3. **Original world (MCP enabled)**: Research enabled → создать кампанию "A dark fantasy world on the back of a space-whale"
   - Expected: `analyzeIP` определяет isKnownIP=false
   - Expected: MCP сервер **не** запускается (skip before MCP)
   - Expected: researchContext = ""

4. **MCP server failure**: Сымитировать ошибку (например, нет npx в PATH или нет интернета)
   - Expected: MCP research throws → catch → fallback на LLM-only research
   - Expected: console.warn с ошибкой, пайплайн завершается без краша

5. **maxSteps limit**: Установить maxSteps=2 → создать кампанию для Known IP
   - Expected: LLM делает максимум 2 раунда tool-calling, затем компилирует результат
   - Expected: Research менее подробный, но корректный

---

## Зависимости и риски

| Риск | Митигация |
|------|-----------|
| DDG MCP сервер не стартует (npx fail, нет интернета) | Graceful fallback на Фазу 1 (LLM-only); try/catch + console.warn |
| LLM hallucinations в research | Web search сниппеты как grounding; worldRules как constraints |
| Большой researchContext забивает LLM контекст | `maxSteps` лимит ограничивает объём; LLM компилирует итог сам |
| DDG rate limiting при частых запросах | `maxSteps` ограничивает количество; DDG не имеет строгих лимитов для обычного поиска |
| Ненужный research для оригинальных миров | `analyzeIP` с low temperature отсекает false positives; MCP не стартует вообще |
| `npx -y duckduckgo-mcp-server` медленный первый запуск | Первый раз качает пакет (~5-10 сек), последующие — из кеша npx |
| DDG сниппеты слишком короткие для глубокого research | LLM комбинирует сниппеты с собственными знаниями; множественные запросы покрывают разные аспекты |

## Порядок выполнения

```
Task 1.1 → Task 1.2 → Task 1.3 → Task 1.4 (MVP complete — LLM-only)
                                      ↓
Task 2.1 → Task 2.2 → Task 2.3 → Task 2.4 (MCP Web Search complete)
```

**Estimated scope:**
- Фаза 1: 4 tasks, ~2 часа агентной работы
- Фаза 2: 4 tasks, ~2 часа агентной работы

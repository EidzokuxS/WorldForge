---
phase: 64
reviewers: [gemini, codex]
reviewed_at: 2026-04-19
plans_reviewed:
  - 64-01-personality-schema-foundation-PLAN.md
  - 64-02-worldgen-npcs-step-fix-PLAN.md
  - 64-03-regenerate-integration-test-PLAN.md
  - 64-04-backfill-incomplete-pack-PLAN.md
  - 64-05-verification-gate-PLAN.md
skipped: [claude]
skip_reason: "Current runtime is claude-code CLI; skipped for independence."
---

# Cross-AI Plan Review — Phase 64

## Gemini Review

### Summary
Общее качество планирования — **высокое**. Стратегия перехода от дублирования схем к единому источнику истины (`personality-schema.ts`) является наиболее надежным способом решения проблемы паритета. Включение эвристики повторных попыток (retry) для `sampleLines` — это прагматичное решение для контроля качества без избыточных затрат токенов. Планы полностью соответствуют проектным соглашениям (CLAUDE.md) и зафиксированным решениям (CONTEXT.md).

### Strengths
- **Единый источник истины (D-02):** Вынос `personalityFieldSchema` в отдельный модуль предотвращает будущий рассинхрон между генератором NPC и пайплайном worldgen.
- **Контроль качества диалогов (D-09, P64-R4):** Эвристика детекции «пустых» или «клишированных» реплик (длина < 15, "I am...", "Hello") значительно повышает качество генерируемого контента.
- **Безопасность миграции (D-10..D-12):** Расширение скрипта бэкфилла сохраняет все защитные механизмы Фазы 63 (бэкапы, re-read-before-write, dry-run).
- **Сквозное тестирование:** Requirements P64-R1..R8 покрыты тестами на трех уровнях: Unit (steps), Integration (routes) и Script (backfill).
- **Соблюдение порядка вызовов (P64-R3):** План 02 явно учитывает специфику работы `fromLegacyScaffoldNpc`.

### Concerns
- **Бюджет токенов при повторных попытках (LOW):** В худшем случае (15 NPC × retry) расход токенов +30-50%. Контрмера: жесткий лимит 1 retry на NPC.
- **Обновление моков в тестах (MEDIUM):** Масштабное обновление `npcs-step.test.ts` в Плане 02. Ошибка может привести к «зеленым» тестам без фактической проверки новых полей. Контрмера: аудит каждого `mockResolvedValueOnce`.
- **Пути импортов (LOW):** Относительные пути `../../character/personality-schema.js`. Контрмера: обязательный `npm run typecheck`.

### Suggestions
- Логировать причину retry (empty/too_short/generic/identical) для будущего тюнинга эвристики.
- Явно подтвердить в Плане 04, что sentinel `personalityBackfillComplete: true` закрывает оба режима миграции.
- В retry-промпте 64-02 добавить инструкцию "The previous attempt was too generic; do not repeat it" чтобы LLM не «зациклился».

### Risk Assessment
**LOW.** Фаза аддитивна; критическая логика движка (`prompt-assembler.ts`) не затронута. VALIDATION.md + GitNexus impact минимизируют регрессию.

**Verdict: APPROVED**

---

## Codex Review

### Summary
В целом замысел фазы хороший: root-cause найден правильно, fix-surface узкий, 64-01/64-02 идут по верному пути. Но набор планов пока **не execution-clean**. Ключевая проблема не в сложности реализации, а в противоречиях между планами: mapper order описан по-разному, `regenerate` "integration" тест на деле мокает критический слой, backfill расширен шире зафиксированного scope, verification gate допускает выполнение требования без реального выполнения требования. Перед запуском нужно править 64-02, 64-03, 64-04 и 64-05.

### Strengths
- Правильный anti-drift ход: сначала вынести shared helper, потом переиспользовать его в worldgen и `npc-generator` (64-01).
- Основной fix привязан к реальному write-path в `npcs-step.ts` (64-02:56, 64-02:465).
- D-07 соблюдён: known-IP enrichment явно оставлен вне scope (64-02:506).
- Backfill-план старается сохранить safety scaffolding из Phase 63 (64-04:504).
- 64-05 включает evidence bundle и traceability, не просто "тесты зелёные".

### Concerns
- **HIGH — Order-of-operations contradiction в 64-02.** В `must_haves` сказано "mapper runs BEFORE `fromLegacyScaffoldNpc`" (64-02:20), но в Task 2 описан путь AFTER `fromLegacyScaffoldNpc` с overwrite `draft.identity.personality` (64-02:130, 64-02:473). Не косметика — разный implementation path.
- **HIGH — 64-03 не доказывает P64-R5.** Это не integration test реального поведения, а route-transparency test, потому что `generateNpcsStep` полностью замокан (64-03:36, 64-03:206). P64-R5 может "пройти" даже при сломанном runtime fix в 64-02.
- **HIGH — В 64-03 вредный must-have:** negative assertion где тест "всё ещё проходит" если `generateNpcsStep` вернул неполный personality pack (64-03:18). Закрепляет broken behavior внутри фазы, которая должна его закрыть.
- **HIGH — 64-04 раздувает `incomplete-pack` шире scope.** Вместо "summary-only legacy NPCs" план делает include при `summary` + **любой** пустой sub-field (64-04:17, 64-04:97, 64-05:425). Уже не narrow repair.
- **HIGH — D-08 допускает `sampleLines: []` для non-dialog NPCs** (64-02:365), а 64-04 считает пустой `sampleLines` признаком incomplete-pack (64-04:109). Backfill может трогать валидные записи.
- **HIGH — `files_modified` в 64-05 неверен.** В metadata указаны только `64-VALIDATION.md` и `64-SUMMARY.md` (64-05:9), но Task 4 редактирует `.planning/ROADMAP.md` и `.planning/REQUIREMENTS.md` (64-05:360).
- **HIGH — P64-R7 размыт до бессмысленности.** 64-05 формулирует gate как full backend+frontend green (64-05:16, 64-05:108), но acceptance criteria разрешают frontend failures если они "pre-existing" (64-05:143). Требование либо не выполнено, либо сформулировано неверно.
- **MEDIUM — GitNexus impact стоит слишком поздно.** Research требует pre-edit impact для `generateNpcsStep` и `npcDetailSingleSchema`, но 64-02 запускает `gitnexus_impact` только после implementation в Task 3 (64-02:595). 64-04 вообще не содержит pre-edit impact шага.
- **MEDIUM — D-06 обещает parity для всех tiers**, но тест-дизайн не покрывает явно key-tier + supporting-tier и path через `ipContext`/`enrichKnownIpWorldgenNpcDraft` (64-02:17, 64-02:506).
- **MEDIUM — P64-R4 покрыт не полностью.** В predicate ветка `all-identical` (64-02:384), но отдельного теста на identical lines нет (64-02:172).
- **MEDIUM — Не покрыт retry-failure fallback branch.** Новая ветка `catch` с возвратом первичного detail есть (64-02:457), но теста на неё нет.
- **MEDIUM — 64-02 перегружен.** В один plan сложены schema change, prompt growth, retry logic, test churn и миграция `npc-generator.ts` (64-02:57, 64-02:524). Лишний blast radius в самом рискованном плане.
- **MEDIUM — 64-05 пишет в REQUIREMENTS несуществующий regression target** `npc-agent.personality.test.ts` (64-05:427). В repo есть `prompt-assembler.personality`, `npc-offscreen.personality`, `reflection-agent.personality`, но не этот файл.
- **LOW — 64-05 тащит устаревший risk note про frontend test script** (64-05:504), хотя `frontend/package.json` уже содержит `"test": "vitest"`.

### Suggestions
- Выпрямить P64-R3 во всех артефактах до одной формулировки: personality map делается **после** `fromLegacyScaffoldNpc` через overwrite в текущем merge-site.
- Переписать 64-03 в один из двух честных вариантов: либо реальный integration test с настоящим `generateNpcsStep` и mocked LLM seam, либо rename в "route transparency test" и не использовать как единственное доказательство P64-R5.
- Удалить negative assertion из 64-03.
- Сузить `--mode=incomplete-pack` до точного legacy signature: `summary` present + остальные поля pack-а effectively empty. Не считать `sampleLines.length === 0` единственным триггером.
- Добавить 4 теста: `all-identical` retry, retry failure fallback, key-tier known-IP personality preservation, incomplete-pack dry-run/backup behavior.
- Вынести migration `npc-generator.ts` из 64-02 в 64-01 или отдельный micro-plan.
- Добавить pre-edit `gitnexus_impact` шаги для `generateNpcsStep`, `npcDetailSingleSchema`, `toNpcDraft` и backfill predicate surface.
- Сделать P64-R7 бинарным. Если frontend green не обязателен — переписать requirement. Если обязателен — не разрешать "documented failure" как pass.
- Исправить 64-05 metadata и expected change-set, чтобы `files_modified` и final `detect_changes` соответствовали факту.

### Risk Assessment
**HIGH.**

Не потому, что реализация сложная, а потому что план-сет допускает ложноположительное "phase complete". Самые опасные вещи:
1. Противоречие по mapper order.
2. Mock-based "integration" coverage для runtime requirement.
3. Overly broad backfill predicate.
4. Verification gate, который может закрыть P64-R7 без реального выполнения критерия.

После правки этих четырёх точек риск быстро падает до `MEDIUM`.

*Note: Локальный `glm-collaborator` proxy на `localhost:3847` недоступен — это single-model codex review, не полноценный cross-AI.*

---

## Consensus Summary

Два reviewer-а дают **сильно расходящуюся оценку**. Gemini — LOW risk / APPROVED; Codex — HIGH risk / requires fixes. Это классический сигнал что Gemini принял frame планов на веру, а Codex вычитал их adversarially.

### Agreed Strengths
- Shared helper extraction (64-01) — anti-drift foundation правильная.
- D-07 (known-IP enrichment) корректно оставлен untouched.
- Phase 63 safety scaffolding (backfill backup/idempotency) сохранён.
- Call-order constraint P64-R3 осознан обоими (хотя Codex увидел противоречие в формулировках).

### Agreed Concerns
- **Test mock fidelity (MEDIUM+):** обновление `mockResolvedValueOnce` в `npcs-step.test.ts` требует аудита — иначе green tests без реальной проверки (Gemini MEDIUM, Codex implicit).
- **Retry heuristic coverage (MEDIUM):** retry logic сложна, branch coverage неполон — особенно `all-identical` и fallback on retry-failure.

### Divergent Views (Codex HIGH / Gemini missed)
1. **Order-of-operations contradiction в 64-02** (mapper BEFORE vs AFTER `fromLegacyScaffoldNpc`) — Plan-checker тоже поймал как warning, Gemini пропустил, Codex флажит как HIGH.
2. **64-03 не real integration test** — мокает `generateNpcsStep` полностью. Это route-transparency test, который НЕ доказывает P64-R5 runtime fix.
3. **64-04 backfill predicate слишком широк** — `sampleLines: []` валидный для non-dialog NPC (D-08), но 64-04 триггерит backfill на нём.
4. **64-05 P64-R7 self-contradictory** — full green required, но "pre-existing frontend failures" allowed.
5. **64-05 files_modified metadata несогласован** с Task 4 (пишет в ROADMAP/REQUIREMENTS, но не в metadata).
6. **Несуществующий regression target** `npc-agent.personality.test.ts` в 64-05 (factual error — файл не существует в repo).

### Severity-Ranked Action List for `/gsd:plan-phase 64 --reviews`

Blocker fixes (MUST address before execution):
1. Выровнять P64-R3 formulation в 64-02 must_haves + action + interface consistency.
2. Решить 64-03: real integration test (unmock `generateNpcsStep`) OR rename requirement и добавить separate coverage для runtime P64-R5.
3. Удалить negative assertion из 64-03.
4. Сузить 64-04 incomplete-pack predicate — исключить `sampleLines: []` как единственный триггер (D-08 compliance).
5. 64-05: привести metadata `files_modified` в соответствие с Task 4 actual writes (ROADMAP + REQUIREMENTS).
6. 64-05: исправить regression target name (grep real filenames: `prompt-assembler.personality`, `npc-offscreen.personality`, `reflection-agent.personality`).
7. 64-05: сделать P64-R7 бинарным — либо frontend green required без исключений, либо скоупировать requirement до backend-only.

Quality fixes (should address):
8. Добавить тесты на retry `all-identical` + retry-failure fallback branches.
9. Добавить pre-edit `gitnexus_impact` шаги в Tasks до implementation (не после).
10. Логировать retry trigger reason в npcs-step для observability.

Scope re-evaluation (reviewer disagreement):
11. Вынесение `npc-generator.ts` migration из 64-02 в 64-01 — Codex рекомендует; Gemini не видит проблемы. Реальный risk assessment: migration включает только swap schema fragment + mapper use, blast radius small → можно оставить в 64-02 но с изолированной Task.

---

*Generated: 2026-04-19 · Reviewers: gemini + codex · Skipped: claude (runtime self)*

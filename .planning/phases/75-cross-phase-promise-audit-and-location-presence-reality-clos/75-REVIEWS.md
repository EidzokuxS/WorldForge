---
phase: 75
reviewers: [claude, gemini, cursor-agent, codex, opencode]
reviewed_at: 2026-04-30T15:11:11
plans_reviewed: [75-01-PLAN.md, 75-02-PLAN.md, 75-03-PLAN.md, 75-04-PLAN.md, 75-05-PLAN.md, 75-06-PLAN.md, 75-07-PLAN.md]
---

# Cross-AI Plan Review - Phase 75

## Claude Review

Обзор готов в план-файле. Два HIGH-приоритетных риска:

1. **`resolveDraftLocation` не обновлён** — `character.ts:59-81` принимает `allLocations` без `kind`/`parentLocationId`, поэтому save-character через name-matching по-прежнему коллапсирует sublocation в macro id, даже после исправления `resolveStartingLocation`.

2. **`validateLocation` получает только macro names** — `npcs-step.ts:validateLocation` не увидит sublocation-имена, поэтому `sceneLocationName` провалит валидацию или упадёт в fallback `locationNames[0]`.

Оба фиксируются внутри существующего scope планов 75-03 и 75-05 без структурных изменений.


---

## Gemini Review

## Summary
The 7-plan sequence provides a comprehensive, well-structured, end-to-end fix for the dense-location collapse bug. It successfully isolates the problem to the worldgen-to-persistence bridge—specifically where generated locations were flattened to macros and NPCs lacked scene-scope IDs. The sequence repairs this without creating a duplicate presence resolver or violating the backend semantic authority boundary. The plans correctly sequence schema expansion, prompt instructions, persistence adjustments, API payload exposure, and runtime consumption. Stale completed-phase promises identified by the audit are cleanly triaged to a Phase 76/gap ledger, preventing them from lingering as active truth.

## Strengths
- **Authority Boundary Preservation:** Excellent discipline across all plans (especially 75-02 and 75-03) to ensure backend code only maps explicit fields (`kind`, `parentLocationName`, `sceneLocationName`). The plans explicitly forbid source/franchise/canon name inference (e.g., treating "Shibuya" as a macro just because of its name).
- **Thorough End-to-End Coverage:** The sequence correctly identifies that fixing persistence is useless if `buildSceneSection`, `/world.currentScene`, and the frontend People Here roster don't read the new `currentSceneLocationId`. Plans 75-05, 75-06, and 75-07 ensure all downstream consumers actually use the scoped data.
- **Fail-Closed Guardrails:** Plan 75-04 explicitly dictates failing on an invalid explicit `sceneLocationName` rather than silently collapsing to a macro, which would silently recreate the exact bug being fixed.
- **Bounded Output Caps:** Plan 75-03 safely expands the location generation limits (5-12 total, max 6 macro, max 6 sub, max 3 sub per macro) to avoid prompt bloat or LLM timeout while still allowing dense hierarchy.

## Concerns
- **MEDIUM - NPC `locationName` vs `sceneLocationName` Consistency (`backend/src/worldgen/scaffold-saver.ts`)**: In Plan 75-04 Task 2, the instructions state: *"When `sceneLocationName` resolves to a persistent sublocation, set broad id to that sublocation parent macro id and scene id to the sublocation id."* This silently overwrites the LLM's intended `locationName` if it disagrees with the sublocation's parent. If the LLM generates `locationName: "Shinjuku"` but `sceneLocationName: "Shibuya Platform 7"`, silently taking Shibuya as the broad ID masks an LLM hallucination. 
- **LOW - `draft.socialContext.currentLocationName` Ambiguity (`backend/src/routes/character.ts`)**: In Plan 75-05 Task 1, it says to *"Keep the existing `draft.socialContext.currentLocationName` and start-condition compatibility coherent with the matched location name."* If the player selects a sublocation, it's slightly ambiguous whether `draft.socialContext.currentLocationName` should store the sublocation name or the broad macro name. 

## Suggestions
- **Validate NPC Location Consistency:** In Plan 75-04 Task 2, add an explicit validation step: "If `sceneLocationName` resolves to a persistent sublocation, assert that its `parentLocationId` matches the resolved `locationName` macro. If they conflict, fail validation or explicitly prioritize one with a logged warning, rather than silently overwriting the broad ID."
- **Clarify Draft Location Field:** In Plan 75-05 Task 1, explicitly dictate which name gets stored: "If a persistent sublocation is selected, `draft.socialContext.currentLocationName` should store the broad macro name to remain compatible with legacy broad-location semantic expectations, while the database columns store both." (Or explicitly state it stores the sublocation name, depending on what downstream logic expects).
- **Frontend Fallback Affirmation:** In Plan 75-07, ensure tests explicitly assert that the `getFallbackSceneNpcs` path *does not execute* when `currentScene` data is provided, preventing the fallback from silently masking a regression.

## Risk Assessment
Overall **LOW**. The execution plans are highly defensive, well-ordered, and rely entirely on explicit schema fields. The risk of breaking legacy worlds is minimized because omitted fields cleanly fall back to `macro` and broad-only behavior. The only minor risks are edge-case inconsistencies between the newly added LLM-generated fields (macro location vs scene location), which can easily be mitigated with strict validation during the scaffold save step.


---

## Cursor Agent Review

Ниже — ревью только по прочитанным артефактам и spot-check кода.

## Summary

Цепочка планов **75-01 → 75-07** согласована с диагнозом из `75-RESEARCH.md`, `75-LOCATION-PRESENCE-TRACE.md` и `75-PROMISE-AUDIT.md`: корень бага — **worldgen → persistence** (все локации как `macro`, NPC без `currentSceneLocationId`), а не `resolveScenePresence`. После реализации **типы + save-edits**, **промпты**, **saver (два прохода + broad/scene для NPC)**, **старт игрока + `/world`**, **SceneFrame + prompt-assembler**, **фронт People Here** цепочка действительно доводит исправление до поведения «не все в одной комнате». Текущий код это подтверждает: `backend/src/worldgen/scaffold-saver.ts` пишет только `kind: "macro"` и не задаёт `currentSceneLocationId` при вставке NPC; `backend/src/routes/character.ts` выставляет игроку `currentSceneLocationId` равным одному и тому же id, что и matched location; `buildSceneSection` в `backend/src/engine/prompt-assembler.ts` фильтрует NPC по `currentLocationId === locationId`, что ломается для сублокации при broad = macro — это уже явно заложено в **75-06**.

Граница «движок опирается на явные поля скaffold/артефакта» в планах соблюдена (валидация ссылок, без эвристик по именам). **P75-R8 / Phase 76** проработаны в аудите, `75-VALIDATION.md` и финальном **75-07**; отдельно в репозитории всё ещё есть **устаревшая таблица трейсабилити** (например P72 в `.planning/REQUIREMENTS.md`), что **75-07** должен поправить при сверке правды.

## Strengths

- **Чёткий end-to-end контракт**: `75-VALIDATION.md` (P75-V01–V08) и **75-01** с матрицей регрессий закрывают типичную ловушку «закрыли фазу по схеме».
- **Соответствие коду**: диагноз совпадает с `scaffold-saver.ts` (`insertLocations` / `insertNpcs`), `types.ts`, `normalizeSavedScaffold` в `worldgen.ts` (у NPC поля явно собираются без новых ключей), `scene-presence.ts` и `campaigns.ts` (`buildWorldCurrentScene`).
- **Учтён реальный вторичный баг**: **75-06** про `buildSceneSection` и шире — про утечку «все NPC макрорегиона» в контекст сцены; это совпадает с фрагментом в `prompt-assembler.ts:652-657`.
- **Разумный порядок**: сначала контракт и RED-фикстура (**75-01/02**), затем генерация (**03**) и persistence (**04**), затем API/игрок (**05**), рантайм (**06**), фронт и closeout (**07**). Зависимости **75-07** от **75-05/06** покрывают транзитивно **75-04**.
- **Явные guardrails** против семантического вывода по строкам (матрица, контракты промптов, fail-closed для явных иерархий в **75-04**).

## Concerns

- **[MEDIUM]** **Сложная ветка `scaffoldNpcSchema` в `backend/src/routes/schemas.ts`** (transform для draft-backed NPC): при добавлении `sceneLocationName` легко потерять поле в одном из путей merge; план **75-02** это затрагивает, но стоит явно проверить обе ветки union/transform, не только «плоский» NPC.
- **[MEDIUM]** **`/regenerate-section` с `section=npcs`**: в схемах передаётся `locationNames: z.array(z.string())` (`backend/src/routes/schemas.ts`); после иерархии нужно гарантировать, что в этот список попадают **все** допустимые имена сцен (макро + сублокации), иначе модель не сможет легально заполнить `sceneLocationName`. В **75-03** это не названо отдельной задачей для маршрута регенерации.
- **[MEDIUM]** **Коллизии имён локаций**: `locationIds` в `scaffold-saver.ts` — `Map` по имени; дубликаты имён перезапишут id. Планы упоминают риск в исследовании, но в **75-04** нет явного требования «глобально уникальные имена или квалифицированные имена / детерминированная ошибка» — при LLM-сбоях возможны тихие некорректные привязки.
- **[LOW]** **`scaffold-generator.ts`** не в списке изменяемых файлов планов: на практике `locationNames = locations.map((l) => l.name)` после шага локаций, скорее всего, уже включает сублокации; если какой-то промежуточный шаг отдаёт только «макро-имена», понадобится доработка генератора — стоит зафиксировать проверку в матрице **75-01**.
- **[LOW]** **Согласованность планирования**: `.planning/STATE.md` указывает фокус на Phase 999.4, тогда как `ROADMAP.md` уже содержит Phase 75 — не баг планов Phase 75, но **75-07** должен выровнять STATE/ROADMAP, иначе останется «двойная правда».
- **[LOW]** **Overengineering / объём контеймент-рёбер**: добавление рёбер macro↔sublocation плюс капы 5–12 / ≤3 сублокаций на макро — разумно; риск — вспомогательная логика travel, если рёбра начинают дублировать `connectedTo`; план это осознаёт (эквивалентная достижимость), но интеграционные тесты на «можно ли дойти» желательно не откладывать за Phase 76 без записи в gap ledger.

## Suggestions

1. В **75-02** или **75-07** добавить явную строку в регрессионную матрицу: **«regenerate-section npcs получает полный список имён локаций (включая `persistent_sublocation`)»** и тест на уровне маршрута или оркестратора.
2. В **75-04** зафиксировать политику **дубликатов имён локаций** в скaffold: жёсткая ошибка транзакции или детерминированный отказ — чтобы не полагаться на порядок вставки в `Map`.
3. При правке **`scaffoldNpcSchema`**: отдельный тест, что `sceneLocationName` сохраняется для **draft-backed** и **legacy** NPC после transform (зеркало к уже существующей сложности в `backend/src/routes/schemas.ts`).
4. В **75-07** при классификации Phase 76 явно занести **полную иерархию в UI World Review** (если save-edits только сохраняет поля, но авторинг остаётся неудобным) — как в `75-RESEARCH.md` Phase 76 candidates.
5. Для **P75-R1**: при закрытии фазы пройтись по **таблице traceability в `.planning/REQUIREMENTS.md`** (например строки P72 «Planned» при завершённом Phase 72) — это прямой пример «stale truth», который P75-R8 обещает убрать.

## Risk Assessment

**Overall: MEDIUM.**

**Почему не LOW:** затрагиваются центральные пути persistence, маршруты save-edits/character/campaigns и сложный Zod-пайплайн для NPC; регрессии при неполном списке имён при регенерации или при потере поля в transform реалистичны.

**Почему не HIGH:** корневая причина локализована, рантайм-резолвер и `/world` уже готовы к scoped-данным; планы явно закрывают известный разрыв в `prompt-assembler.ts` и задают сильные автоматические ворота (включая фронт). При дисциплине RED/GREEN и финальном бандле тестов из **75-07** риск доводится до контролируемого уровня.


---

## Codex Review

## Summary
The 7-plan sequence is pointed at the real bug. The current root cause is exactly what the phase research says: worldgen emits flat locations/NPC placement, `scaffold-saver.ts` persists every location as `macro`, and runtime consumers only see broad scope. Plans `75-02` through `75-06` cover the necessary backend path from scaffold contract to persistence to `/world.currentScene` to `SceneFrame` and prompt assembly.

The plan is not fully closed yet, though. The biggest remaining gap is the World Review client path: today it still flattens scaffold data back to name-only shapes, so Phase 75 can fix generation/runtime and still lose hierarchy on review/save. There is also a validation-ownership gap for malformed `parentLocationName` / `sceneLocationName` references.

## Strengths
- The sequence matches the real failure chain in current code: flat scaffold types in `backend/src/worldgen/types.ts`, flat location prompting in `backend/src/worldgen/scaffold-steps/locations-step.ts`, broad-only NPC planning in `backend/src/worldgen/scaffold-steps/npcs-step.ts`, macro-only persistence in `backend/src/worldgen/scaffold-saver.ts`, then scene-aware runtime consumers in `backend/src/engine/scene-presence.ts`, `backend/src/engine/scene-frame.ts`, and `backend/src/routes/campaigns.ts`.
- The authority boundary is mostly preserved. The plans consistently keep hierarchy/placement as explicit scaffold fields and do not ask backend code to infer canon/franchise meaning from names. That is aligned with Phase 71/72/74 decisions.
- End-to-end coverage is mostly there: starting location and player save in `backend/src/worldgen/starting-location.ts` and `backend/src/routes/character.ts`, world API in `backend/src/routes/campaigns.ts`, runtime scene consumers in `backend/src/engine/scene-frame.ts` and `backend/src/engine/prompt-assembler.ts`, and final People Here proof in `frontend/app/game/page.tsx`.
- The promise-audit and Phase 76 ledger are a good inclusion. They reduce the risk of silently leaving stale claims active.

## Concerns
- HIGH: The plan does not own the World Review client flattening path in `frontend/lib/api-types.ts`, `frontend/lib/world-data-helpers.ts`, `frontend/components/world-review/locations-section.tsx`, and `frontend/components/world-review/npcs-section.tsx`. Current client scaffold types are flat (`ScaffoldLocation` has only `name/description/tags/isStarting/connectedTo`; `ScaffoldNpc` has only `locationName`), `toEditableScaffold()` rebuilds locations without `locationKind/parentLocationId` and NPCs without scene scope, and the review UI only edits `locationName`. If Phase 75 lands only on backend, opening a generated world in review and saving it can still re-flatten hierarchy.
- MEDIUM: Invalid hierarchy-reference handling is underspecified across `backend/src/worldgen/scaffold-steps/locations-step.ts`, `backend/src/worldgen/scaffold-steps/npcs-step.ts`, `backend/src/routes/worldgen.ts`, and `backend/src/worldgen/scaffold-saver.ts`. The plans say bad explicit refs should fail deterministically, but there is no clearly assigned pre-save validation/repair owner for bad `parentLocationName` or `sceneLocationName`. Right now `generate` goes straight into `saveScaffoldToDb`; without an earlier guard, one malformed model reference can fail the whole generation late.
- LOW: `75-05` and `75-06` are correct, but `backend/src/engine/prompt-assembler.ts` has a very specific existing bug at `buildSceneSection`: it queries NPC equipment with `npcs.currentLocationId == sceneId`. The plan should call that exact seam out more explicitly so it does not get treated as “runtime already passes” and skipped.

## Suggestions
- Extend Phase 75 with explicit frontend review ownership. At minimum add/update:
  - `frontend/lib/api-types.ts`
  - `frontend/lib/world-data-helpers.ts`
  - `frontend/components/world-review/locations-section.tsx`
  - `frontend/components/world-review/npcs-section.tsx`
  - their related tests
  So review load, regenerate, edit, and save can preserve `kind`, `parentLocationName`, and `sceneLocationName`.
- Add one round-trip test for `getWorldData -> toEditableScaffold -> saveWorldEdits` proving hierarchy survives review/save without collapsing back to macro-only data.
- Assign exact-reference validation ownership before persistence. Either:
  - validate/repair `parentLocationName` in `locations-step.ts` and `sceneLocationName` in `npcs-step.ts`, or
  - add a dedicated scaffold validation seam before `saveScaffoldToDb`.
  Do not leave this as an implicit saver crash.
- Make `75-06` explicitly name the `buildSceneSection` equipment query bug in `backend/src/engine/prompt-assembler.ts` and require a test where player scene is a sublocation, NPC broad location is macro, and NPC scene location is the same sublocation.

## Risk Assessment
MEDIUM. The backend plan is strong enough to plausibly fix the dense-world “everyone is in one macro room” bug, but the client review/save flattening gap is serious and can reintroduce the problem through a normal authoring workflow. The remaining validation gap is more about brittleness than wrong architecture, but it should be closed before execution.

---

## OpenCode Review

OpenCode review did not complete because the local OpenCode startup failed while parsing a user-level Claude skill frontmatter file, before it could read the Phase 75 prompt.

`	ext
19 | 
20 |     try {
21 |       const md = matter(template)
22 |       return md
23 |     } catch (err) {
24 |       throw new FrontmatterError(
                 ^
ConfigFrontmatterError: ConfigFrontmatterError
 data: {
  path: "C:\\Users\\robra\\.claude\\skills\\poker-software-architect\\SKILL.md",
  message: "Failed to parse YAML frontmatter: incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line at line 3, column 287:\n     ... s, or tutoring tools. Trigger on: \"build poker software\", \"poker ... \n                                         ^",
},

      at parse8 (src/config/markdown.ts:24:13)

Error: Unexpected error, check log file at C:\Users\robra\.local\share\opencode\log\2026-04-30T120950.log for more details
JSON Parse error: Unexpected EOF


`

---

## Consensus Summary

### Agreed Strengths

- Reviewers agreed the root-cause diagnosis is correct: the current failure is the worldgen-to-persistence bridge, not the existing resolveScenePresence resolver.
- Reviewers agreed the planned backend chain is directionally right: scaffold contract, prompt/schema contract, saver persistence, player start, /world.currentScene, SceneFrame, prompt assembler, and frontend People Here all need proof.
- Reviewers agreed the authority boundary is essential: backend must persist and validate explicit scaffold/artifact fields, not infer source/canon/franchise meaning from names.

### Agreed Concerns

- HIGH: World Review and save-edits frontend paths can re-flatten hierarchy unless Phase 75 owns frontend/lib/api-types.ts, frontend/lib/world-data-helpers.ts, review page/components, and tests.
- HIGH: resolveDraftLocation / save-character must be updated with kind and parentLocationId; otherwise selected sublocations can still collapse at player start.
- MEDIUM: NPC sceneLocationName validation must use the full location namespace and must not silently fall back to a macro or first location.
- MEDIUM: explicit locationName and sceneLocationName must be validated for consistency when scene points to a sublocation whose parent disagrees with the broad location.
- MEDIUM: scaffoldNpcSchema draft-backed transforms and /regenerate-section must preserve/pass the new scene field, not only the simplest save-edits path.
- MEDIUM: duplicate scaffold location names need a deterministic fail-closed policy before using Map by location name.
- LOW: buildSceneSection should call out and test the exact current bug where equipment lookup treats scene id as broad currentLocationId.
- LOW: final closeout must reconcile stale .planning/REQUIREMENTS.md / .planning/STATE.md truth rather than merely adding new Phase 75 rows.

### Required Planning Changes Before Execution

1. Expand Plan 75-02 to include frontend World Review scaffold types/helpers/components/page/tests so review/save round-trips preserve kind, parentLocationName, and sceneLocationName.
2. Strengthen Plan 75-02 around scaffoldNpcSchema transform preservation for draft-backed and legacy NPC branches.
3. Strengthen Plan 75-03 around NPC validateLocation / sceneLocationName validation using full known-location names, plus regenerate-section NPC inputs.
4. Strengthen Plan 75-04 around duplicate location names and broad/scene consistency checks.
5. Strengthen Plan 75-05 around resolveDraftLocation receiving/storing kind and parentLocationId.
6. Strengthen Plan 75-06 by naming the exact buildSceneSection equipment-query bug.
7. Strengthen Plan 75-07 around World Review round-trip tests and planning-state reconciliation.

### Divergent Views

- Gemini rated overall plan risk LOW after small validation clarifications; Cursor and Codex rated it MEDIUM because World Review/save-edits and schema-transform paths can reintroduce the bug through normal authoring flows.
- Reviewers differed on whether draft.socialContext.currentLocationName should store broad macro or selected sublocation. Phase 75-05 resolves this by keeping the exact matched stored location name in the draft while durable DB broad/scene columns remain authoritative.

# Lessons Learned

## 2026-05-07: UI blockers do not mean gameplay is verified

**Контекст**: During Phase 87 I was fixing `/game` visual overflow as a blocker before the final rerun, and the user asked the sharper question: "а с геймплеем-то что".

**Ошибка**: It is easy to let visible UI burn-down dominate the update stream and make gameplay work sound implicitly done because code-side tests passed. For this project, gameplay is not proven until a live route shows GM behavior, tool calls, narration, pressure, and world-state mutation working together.

**Правило**: Keep gameplay status separate from UI status. Say "code-fixed/rerun-pending" until live playtest artifacts prove the behavior under the target model, and prioritize final reruns once UI blockers for `/game` are removed.

## 2026-05-06: DNA suggestion loading is a workflow state, not footer chrome

**Контекст**: Пользователь поймал, что preparing World DNA still displayed as the old concept form with a tiny bottom spinner, even after world generation had a full V4 surface.

**Ошибка**: I treated seed suggestion as a button-level wait instead of a route-level forge stage. That preserved the old UX exactly at the moment the player expects the system to visibly start building the world.

**Правило**: When a backend call changes the phase of the forge flow, render a dedicated phase surface even if the backend endpoint has coarse progress. Footer loaders are only for small local actions, not for DNA/world creation.

## 2026-05-06: Loading states need their own reference surface

**Контекст**: World generation still looked like the old Concept/DNA form with a tiny footer spinner, even though the V4 mock defines a dedicated worldgen screen with stages, progress, current engine work, and artifact panels.

**Ошибка**: I migrated idle/editing routes but let the active generation state inherit the old form layout. That made the most dramatic state in the flow feel untouched.

**Правило**: For V4 parity, every important state needs its own screenshot contract: idle, editing, loading/generating, error, and completed. Do not hide major workflow states inside footer loaders when the reference gives them a full surface.

## 2026-05-06: CSS cascade must be tested on computed styles

**Контекст**: Forge Research Mode still looked wrong after a visual fix because the element carried both `wf-research-row` and `wf-set-row`; a later shared `.wf-set-row` rule overrode the row's padding and made the reference-backed block drift again.

**Ошибка**: I trusted source-order intent instead of checking computed styles. The CSS looked like it had `padding: 14px 16px` and a full border, but the browser actually computed `18px 0`, and then `:last-child` ate the bottom border.

**Правило**: For visual parity fixes, assert computed layout values for the actual rendered element, especially when utility/shared classes are combined. If a reference block depends on exact padding/height/border, the smoke test must read all four relevant sides directly, not just top/left.

## 2026-05-06: Visual smoke must not preserve the bug it should catch

**Контекст**: Пользователь снова поймал V4 forge page drift: bottom CTA looked like an old sticky dock, the page had extra glow under form blocks, button layout differed from the mock, and Research Mode/right rail were only partially migrated.

**Ошибка**: I had encoded earlier approximations into `visual-v4-smoke.mjs`, so the test expected the old dark CTA backplate and oversized forge title instead of the current V4 reference contract. That made green smoke capable of protecting the wrong UI.

**Правило**: After every visual correction, update the automated visual assertions to match the user-approved reference behavior, not yesterday's implementation. Smoke checks must fail on known visual regressions: wrong CTA ownership, extra page glow, clipped rails, missing CTA icons, incorrect title scale, and stale mock/status text.

## 2026-05-06: Prose prompts need positive technique, not only bans

**Контекст**: Пользователь уточнил Phase 85 scope: final Narrator needs anti-slop prose quality, but the fix must not be just a banned-phrase wall. The model must be taught how to write correctly.

**Ошибка**: Ban-only prompt patches can make prose timid or synonym-swapped without improving scene craft. A narrator that only sees "do not write X" may still produce generic LLM prose in a different shape.

**Правило**: For prose quality, pair every high-value ban with a positive replacement technique: concrete action, local object, actor-performable gesture, scene-changing background detail, action before interpretation, readable rhythm, and mundane-specific pressure. Keep this in the final Narrator layer only; do not bloat GM Read or tool prompts with style training.

## 2026-05-05: Native tool loops should not get a second always-on planner

**Контекст**: Phase 84 research showed that the corrected hot path already uses GM Read -> optional Oracle -> native runtime tools -> NarratorPacket -> final narration. External and internal reviewers all warned that adding an always-on GM Action Checklist on top of native tool calls would recreate the same schema bloat the user objected to.

**Ошибка**: It is tempting to treat "more explicit planning" as safer, but in this architecture another JSON checklist before native tools would make the model plan twice, spend more context on shape, and drift away from being a playable GM.

**Правило**: Keep normal player turns on one compact GM Read plus observed native tool execution. Use checklist-like artifacts only when explicitly selected for a narrow repair/audit job. The runtime invariant is one tool call, observation, then next decision; final narration sees settled backend truth, not planner scratchpads.

## 2026-05-05: Do not leave reference sections in legacy sidebars

**Контекст**: On the V4 forge screen, Sources were still rendered as a right-rail card while the reference places them as step `iv.` in the main form. Research Mode used a generic card/Switch, DNA showed duplicate progress, and global glow made every form block look lit separately.

**Ошибка**: I copied some V4 typography and colors but kept legacy information architecture. That made the page look superficially themed while the actual flow, controls, and visual hierarchy contradicted the supplied mock.

**Правило**: For reference-backed flow pages, migrate section ownership first: if the mock puts a real product section in the main checklist, move it there. Side rails should contain only the reference rail role. Loader ownership must be single-source, and shared effects like glow must be page-level, not accidental backplates under every control.

## 2026-05-05: Exact mock values beat approximation

**Контекст**: The V4 `index.html` already contains the exact review CSS values, but I still approximated dimensions and then had to be corrected again.

**Ошибка**: I treated known mock CSS as inspiration instead of source-of-truth. That wastes review cycles and creates visible drift.

**Правило**: When `docs/WorldForge-v4/index.html` has a selector for the target screen, copy its numeric CSS contract first. Only map real data into the structure; do not invent spacing, font sizes, panel widths, or tab rhythm.

## 2026-05-05: Visual smoke metrics are not visual parity

**Контекст**: After the user showed the World Review reference, I changed the page to a centered 2K lane with green smoke checks, but kept a giant hero-like title, no overview stats, and the wrong review composition. The page was technically centered, but still did not match the mock.

**Ошибка**: I used measurable layout checks as a substitute for visual comparison against the reference. That let a non-reference layout pass because the assertions tested overflow/centering instead of actual composition.

**Правило**: For a reference-backed UI page, first reproduce the reference composition and scale. Visual smoke checks must encode reference-specific facts: title size, tab labels/order, overview stats, action placement, panel widths, and first-screen structure. Generic "centered and no overflow" is not enough.

## 2026-05-05: V4 migration means layout migration, not old page restyling

**Контекст**: World Review still used the old left-biased content layout with V4 colors applied. On a 2K monitor the useful content sat on the left while the center/right stayed empty, and the page-level glow was stronger than the reference.

**Ошибка**: I treated a styled legacy page as acceptable V4 migration. That preserves old UX geometry and makes the user inspect the wrong part of the monitor.

**Правило**: For each V4 page, migrate the actual composition: viewport ownership, centered/wide content lane, tabs/body/footer placement, and reference-level lighting. Styling an old layout is not migration.

## 2026-05-05: Do not hand-tune reference glow values

**Контекст**: On the V4 home hero, I made the ember glow brighter/larger than `docs/WorldForge-v4/index.html` and added a vertical texture overlay. The result exposed faint vertical bands and made the screen warmer than the mock.

**Ошибка**: I treated glow as subjective polish even though the reference CSS had exact radial-gradient parameters.

**Правило**: For reference-backed visual effects, copy the exact CSS contract first: gradient shape, position, opacity/color token, layer count, and pseudo-element usage. Only change it after a deliberate design decision.

## 2026-05-05: Visual parity requires measured reference values, not approximate translation

**Контекст**: Пользователь показал, что V4 launcher всё ещё не совпадает с `docs/WorldForge-v4/index.html`: неверное свечение, мелкий rail, неправильные borders карточек, не тот font stack, and incorrect hero rule/kicker above the campaign title.

**Ошибка**: I visually approximated the reference after removing mock-only data instead of extracting the actual CSS numbers and applying them to the real app. This made the screen "close-ish" but not a full transfer.

**Правило**: When the task is exact visual transfer, first read the reference CSS and copy the numeric contract for shared tokens, rail, headings, cards, page spacing, glow, and interaction states. Only adapt content/data, not proportions. Verify at the user's target resolution before claiming parity, and audit sibling pages using the same shared visual system.

## 2026-05-05: Full visual migration means reference-as-contract, not themed polish

**Контекст**: Phase 83 was initially implemented as a restrained restyle of the existing WorldForge UI, but the supplied `docs/WorldForge-v4/index.html` reference called for a full visual migration: composition, scale, typography, interaction rhythm, transitions, and route-to-route continuity on real data.

**Ошибка**: I treated the reference as a moodboard and rejected older/mock-only prototype content instead of preserving the current reference's visual structure with honest real data. Passing build/tests/overflow checks did not prove that the product looked or felt like the target.

**Правило**: For full visual migration, use the current reference file/screenshots as the visual contract. Do not invent or copy obsolete fake metrics/statuses, but do preserve layout, hierarchy, motion, density, and screen drama by mapping real product data into the reference structure. Closeout must include side-by-side 2K visual QA plus UX flow QA for navigation, modals, return paths, and state continuity.

## 2026-05-05: Phase closeout must be reopened when live evidence contradicts the PASS

**Контекст**: Phase 82 was recorded as verified, but later live turns exposed forecast schema failures, first-call tool grounding misses, frontend rollback desync risk, and a remaining finalization duration ceiling.

**Ошибка**: Treating an earlier PASS as the governing truth after new contrary evidence creates fake closure. The worktree then looks busy, but the product requirement "works well and correctly" is not actually satisfied.

**Правило**: When fresh live evidence contradicts a phase verification claim, immediately reopen the phase in GSD artifacts, create a concrete gap register, mark previous verification as historical, and close it only after the new deterministic tests plus fresh live play evidence pass. Do not hide mechanics by disabling tools, adding fallbacks, or relying on old green runs.

## 2026-05-05: Read the user's supplied architecture references before implementing

**Контекст**: Пользователь несколько раз дал конкретные Claude Code / agent harness references for tool-call architecture and later corrected me because I started implementation after general docs + agents, but before reading those exact links.

**Ошибка**: Adjacent research is not enough when the user supplied named references. Even if the implementation direction is likely correct, skipping the concrete refs makes the work look like guesswork and can miss the intended industry pattern.

**Правило**: When the user provides specific architecture links/templates/repos, open and synthesize those exact sources before locking implementation. Treat them as acceptance context: extract the relevant pattern, state the implementation implication, then code.

## 2026-05-05: Autonomous execution means ship the work, not queue more phases

**Контекст**: Пользователь попросил автономно выполнить GM/prompt/playtest work, а я после части фактической работы снова начал фиксировать следующие GSD phases/docs as if that were the deliverable.

**Ошибка**: Для автономного GSD фаза/план/документ является служебной опорой, а не конечным результатом. Если пользователь говорит "сделать автономно", stopping at phase capture reads as evasion and leaves the actual playable system unfixed.

**Правило**: При explicit autonomous/GSD-do requests immediately move from context to execution loop: research/agents only as inputs, then code changes, tests, external review, live playtests, and commit. Do not present queued phases as progress unless they are accompanied by implemented, verified product changes.

## 2026-05-05: Commit stable phase baselines before starting the next GSD phase

**Контекст**: После Phase 79-81 дерево содержало runtime-код, GSD-артефакты, Playwright evidence, WorldForge-v4 screenshots, live handoff docs, and local Codex config. Я начал исследование следующей фазы, пока всё это ещё не было зафиксировано в git.

**Ошибка**: Даже если следующая задача срочная, начинать новую GSD-фазу поверх огромного dirty worktree превращает дальнейшую работу в кашу: непонятно, что уже закрыто, что ещё черновик, и где нормальная точка отката.

**Правило**: Перед стартом новой нетривиальной GSD-фазы сначала стабилизировать git baseline: `git status`, secret/size sanity check for new files, required typechecks, GitNexus `detect_changes`, `git add -A`, `git diff --cached --check`, commit, then verify clean tree. Only after that plan or implement the next phase.

## 2026-05-05: Gameplay prompt work needs branchy player-feel playtests

**Контекст**: После добавления Phase 84 пользователь уточнил, что после завершения prompt/location/character work нужно тестировать это не одной линией, а несколькими ветками, разными действиями и с позицией реального игрока: ощущается ли игра интересной, живой и продолжабельной.

**Ошибка**: Одна длинная successful live run доказывает, что pipeline может пройти, но не доказывает, что игра выдерживает разные стили игрока, side routes, probing, branching from checkpoints, bad assumptions, or dynamic NPC/location opportunities. Для prompt quality это особенно опасно: prompts могут пройти happy path и развалиться при первом нестандартном ходе.

**Правило**: Для gameplay/prompt phases closeout должен включать branchy exploratory playtests: несколько кампаний или сохранённых развилок, разные player postures, divergence/retry/checkpoint branches, consistency probes, and subjective "would I keep playing?" notes. Code green plus one route is not enough for playability.

## 2026-05-05: RP prompt quality is not the same as schema prompt contracts

**Контекст**: Пользователь поставил отдельную задачу на prompt architecture после GM/location/support-NPC work: изучить активные RP presets, Marinara/RP/VN references, and current WorldForge prompts, then rebuild model-facing GM/storyteller prompts so the game plays like an RPG rather than like a backend form.

**Ошибка**: Есть риск считать Phase 74 structured-output prompt contracts уже достаточным "prompt fix". Это неверно. Phase 74 помогает моделям попадать в JSON shape; она не гарантирует, что GM понимает сцену, держит персонажей, ведёт темп, использует tools естественно и пишет playable RP prose.

**Правило**: Для RP prompt work сначала исследовать actual active prompt corpus and current model-facing tasks. В SillyTavern-style JSON читать только enabled prompts through `prompt_order`, not every stored prompt block. Проектировать prompts by job: GM interpretation, optional planning pressure, sequential tool use, and final narration from settled truth. Keep backend as rulebook; improve model task clarity and play feel, not just schema strictness.

## 2026-05-03: GM planning is not the same as separate advisory fragments

**Контекст**: Пользователь уточнил целевую игру: LLM-гейммастер должен из состояния мира, персонажей, локаций, текущей сцены и прогноза "если никто не вмешается" собрать понятный план хода: о чём этот ход, какие действия/мутации нужны, какие tools вызвать, и как ответить игроку. Backend при этом остаётся rules/validation/persistence authority.

**Ошибка**: Я смешал эту цель с текущими раздельными поверхностями `world-forecast-builder`, `gm-turn-decision`, `scene-planner` и `gm-beat-plan`. В результате "план ГМа" оказался размазан по стадиям, а `gm-beat-plan` стал строгой advisory-схемой текущего бита вместо единого практического GM turn plan.

**Правило**: Для WorldForge целевой GM loop должен иметь явную модель: forecast pressure -> GM turn plan -> validated tool/state execution -> narration from settled truth. Если план разбит на несколько LLM calls, каждая стадия должна иметь уникальную обязанность и не дублировать соседнюю; пользовательская проверка должна видеть именно playable GM behavior, а не набор passing schemas.

## 2026-05-03: GM turn plan must be a sequential tool checklist, not one giant schema

**Контекст**: Пользователь уточнил, что целевой GM loop не должен превращаться в один огромный structured-output запрос, где модель за раз планирует, решает, мутирует и нарративит всё. Нужен план действий/чек-лист, а выполнение должно идти пошагово: модель выбирает следующий шаг, backend tool валидирует/применяет мутацию, шаг помечается выполненным, затем следующий шаг.

**Ошибка**: Есть риск попытаться исправить отсутствие GM Turn Plan добавлением ещё большей схемы, которая снова заставит модель выплюнуть 10 tool calls и все рассуждения за один проход. Это повторит ту же проблему: длинный JSON, тяжелая валидация, плохая repairability и rollback всего хода из-за одного malformed шага.

**Правило**: Проектировать GM orchestration как короткий plan + sequential execution loop: plan items are small, typed, and inspectable; each mutating item is executed through one backend-validated tool step; results feed back into the next step; incomplete/illegal steps are explicitly skipped or revised. Avoid monolithic all-in-one GM schemas.

## 2026-05-03: UI polish must be proven on the real route with real data

**Контекст**: Play screen looked acceptable in isolated prototype screenshots, but the real `/game` route exposed duplicate labels, fake prototype fields, floating side cards overlapping the reader/input lane, and wide-screen geometry issues.

**Ошибка**: I treated visual direction as enough before fully validating the implemented route with a loaded campaign, real backend data, wide viewports, and user-facing labels checked against the actual product model.

**Правило**: For WorldForge UI polish, verify the real route against real campaign data before claiming completion. Use Playwright screenshots at current user-class desktop widths, audit every visible label/status/control against real frontend/backend state, remove prototype-only copy, and check overlap geometry for reader, controls, drawers, rails, and stage overlays.

## 2026-05-03: External reviews need patient timeouts

**Контекст**: На Phase 79 я запустил OpenCode, Cursor и Claude review с 120-секундным timeout и интерпретировал отсутствие ответа как недоступность результата.

**Ошибка**: Для внешних reviewer CLI на длинных GSD-планах 120 секунд недостаточно. Timeout в таком режиме чаще означает мою нетерпеливость или неверный запуск, а не отсутствие полезного review.

**Правило**: Для cross-AI GSD review давать reviewer CLI нормальное окно ожидания: минимум 8-15 минут на сложные планы, либо запускать как управляемый background job и ждать завершения. Не считать timeout review failure без повторного запуска с адекватным timeout и проверки команды.

## 2026-05-03: Split architecture phases into agents before editing

**Контекст**: На Phase 79 пользователь справедливо спросил, почему я не использую агентов для разных стадий, когда задача явно состоит из независимых срезов: prompt/data-flow, tool grounding, event durability, review/audit.

**Ошибка**: Я сначала восстановил GSD-документы и локально собрал контекст, но не сразу разнёс независимые архитектурные вопросы по subagents. Для такого класса работы это замедляет discovery и повышает риск пропустить боковой канал.

**Правило**: Для нетривиальных GSD/architecture фаз после первичного контекста сразу запускать read-only subagents по disjoint slices: plan audit, data-flow/prompt surface, runtime/tool validation, tests/verification. Основной поток затем синтезирует результаты и вносит их в планы перед execute.

## 2026-05-02: Design prototypes must not invent product state to fill space

**Контекст**: WorldForge-v4 visually improved, but the prototype still showed fake campaign lifecycle statuses (`Active`, `Paused`, `Retired`, `Bleeding`), imprecise `Worlds in Progress`, a standalone import page, short DNA tagline cards, and invented role/status copy that does not match the real generation/review/player-character flow.

**Ошибка**: I let visual composition pressure create product concepts that were not backed by current frontend/backend state. This makes a mockup look polished while quietly drifting away from what the user can actually do.

**Правило**: Every visible prototype control, status, route, and label must map to `REAL`, `TARGET-UI`, `NEEDS-BACKEND`, or `MOCK-COPY` before implementation planning. If it is not real, either remove it, explicitly mark it as target work, or add a phase requirement. Do not use invented statuses just to balance a layout.

## 2026-05-02: VN play controls belong in one reading/action lane

**Контекст**: The Play screen had a strong scene stage, but narration text stayed left-biased, `Continue` lived far to the right, `chunk 1/3` exposed irrelevant implementation state, and `Speak` created an unnecessary separate mode.

**Ошибка**: I optimized the scene picture before fully optimizing the reading loop. In a VN-like RPG, the user should not chase prose, controls, and input across a wide monitor.

**Правило**: Live Play must keep the last beat, `Next`/`Auto`/`Log`, `Continue`, and freeform input in a centered, local interaction lane. Hide chunk counters. Remove separate `Speak` mode unless it becomes a real optional address selector. Floating scene messages persist until `Next`.

## 2026-05-02: Backend must not pre-interpret freeform play

**Контекст**: Пользователь уточнил целевую архитектуру turn flow: backend не должен понимать пользовательскую прозу, выбирать intent/target/hostility/combat mode или решать, нужен ли roll. Это работа GM/LLM. Backend должен заниматься воспроизводимыми вещами: state, IDs, candidates, validation, tools, random rolls on request, persistence, rollback.

**Ошибка**: В Phase 77 и runtime-research всё ещё просачивалась старая модель: `Act/Speak/Observe` modes, `intent/method` как продуктовая семантика, backend target/hostile pre-pass, Oracle как почти обязательный шаг.

**Правило**: Treat `playerAction` as raw fiction text. Backend may gather neutral scene evidence and expose deterministic tools; GM/LLM decides meaning, target, hostility/combat/social framing, and whether uncertainty needs a roll. Legacy `intent`/`method` mirroring is route compatibility only, not product semantics.

## 2026-05-02: GM-first is not LLM-trusted

**Контекст**: Пользователь уточнил, что Marinara нужна как inspiration для GM flow, но WorldForge не должен становиться копией Marinara или отдавать LLM мир на доверии. Backend остаётся DM rulebook-ом: время, статы, инвентарь, условия, ресурсы, отношения, локации, clocks и persisted facts должны держаться backend-ом.

**Ошибка**: Формулировка "GM-first" может быть неправильно прочитана как "LLM ведёт всё". Это опасно: LLM может забыть время, не пересчитать condition, потерять widget/state, сдвинуть сцену или выдать красивую, но нелегальную мутацию.

**Правило**: WorldForge architecture = GM interprets and proposes, backend validates and persists. LLM owns scene meaning, pacing, target intent, and legal tool selection; backend owns rulebook invariants, deterministic consequences, rolls, state transitions, rollback, and final world truth. Storyteller renders settled backend truth, not unconstrained LLM memory.

## 2026-05-01: Для дизайн-стратегии не выбирать слабее модель молча

**Контекст**: При запуске Open Design прототипа WorldForge я выбрал Claude `sonnet`, потому что это надёжный alias для проверки Windows/Open Design pipeline, хотя пользователь ожидал самый сильный доступный Claude/Opus проход для важной дизайн-задачи.

**Ошибка**: Я оптимизировал первый полноценный запуск под совместимость и скорость, не проговорив tradeoff и не проверив документацию/CLI model options заранее. Для стратегического дизайна это выглядит как недооценка задачи и ломает доверие к автономному режиму.

**Правило**: Для high-stakes design/research/planning задач сначала читать relevant docs/CLI help/model list и выбирать strongest available model/agent (`opus` для Claude CLI, если доступен). "Безопасный smoke" допустим только если пользователь явно попросил проверить pipeline; иначе нельзя молча запускать более слабую модель на основной результат.

## 2026-05-01: Перед визуальным прототипом нужна карта экранов и переходов

**Контекст**: Я запустил Open Design на высокоуровневый запрос "сделай WorldForge play surface", не подготовив screen topology: какие экраны существуют, как пользователь между ними ходит, какие drawers/modal states открываются поверх, что сохраняется между вкладками/страницами, а что является ephemeral turn state.

**Ошибка**: Визуальный агент получил эстетическое направление, но не получил продуктовую карту. Это толкает его к одному красивому экрану вместо целостной игровой оболочки с понятным входом, возвратами, persistence rules и информационной архитектурой.

**Правило**: Перед любым серьёзным UI/design-agent прогоном сначала создать IA/screen-flow contract: screens, nested states, navigation graph, entry/exit paths, persist/ephemeral state, player verbs, debug/inspect disclosure, save/restore behavior. Visual prototype prompt должен ссылаться на этот контракт, а не изобретать структуру на лету.

## 2026-05-01: Красивый reader не равен игровой поверхности

**Контекст**: Первый Open Design прототип WorldForge получился визуально похожим на газету/editorial reader: кремовый фон, текстовая колонка, маленькие pills и почти нет ощущения сцены, визуального пространства или VN/RPG игры.

**Ошибка**: Я смешал "литературно и читаемо" с "документно/газетно". Для игры первичный визуальный сигнал должен быть "я нахожусь в сцене", а не "я читаю статью о сцене".

**Правило**: Для WorldForge live-play visual direction обязателен game/VN surface contract: scene backdrop or illustrated ambient layer, foreground narration/input box, visible actor presence, overlay drawers, cinematic mood/time/weather, and clear separation from document/editorial layouts. Warm typography допустима только если она встроена в игровую сцену, а не превращает экран в страницу.

## 2026-05-01: Marinara reference is interaction cadence, not just background art

**Контекст**: Пользователь уточнил, что в Marinara важны не только фон и приятный UI, а VN/game presentation loop: `Next`, autoplay, log, bottom narration box, party portraits, map/inventory/journal widgets, GM/party address modes, choices/QTE/dice beats, text glitch/color effects, fades/flashes/time-skip transitions.

**Ошибка**: Я слишком редуцировал Marinara reference до "scene-first shell with background", хотя погружение там создаётся presentation runtime-ом, который порционирует текст и превращает системные события в игровые визуальные биты.

**Правило**: При переносе Marinara-like feel в WorldForge проектировать отдельный presentation-event layer: beat segmentation, Next/Auto/Log, inventory/journal/map widgets, party/GM addressing, choices/QTE/dice display, text/screen effects. Backend остаётся authority; presentation layer отвечает за ощущение игры.

## 2026-05-01: Reference features need a why, not a copy-paste

**Контекст**: Пользователь уточнил, что Marinara визуально посредственна и не должна копироваться целиком. Нужны только те элементы, которые реально улучшают WorldForge, и нужно понимать зачем каждый элемент берётся.

**Ошибка**: Есть риск после удачного reference example броситься копировать все widgets/controls вместо того, чтобы отфильтровать их через player questions, наши данные и product surfaces.

**Правило**: Любой reference-derived UI element должен иметь явную функцию: какую player question он отвечает, какую WorldForge механику/данные обслуживает, где он живёт, когда скрывается, и почему он лучше текущего решения. Если "зачем" не сформулировано, элемент не попадает в план.

## 2026-05-01: Дизайн WorldForge охватывает весь продукт, не только `/game`

**Контекст**: Пользователь напомнил, что кроме game screen есть main menu, settings, generation/DNA/worldgen, world review, character add/import cards, post-generation character cards, in-game character sheets, inventory/journal/log/map surfaces.

**Ошибка**: Фокус на красивом live-play screen может оставить остальные ключевые маршруты в старом debug/admin языке, и продукт снова будет ощущаться разрозненно.

**Правило**: UI/design фазы должны иметь surface inventory и явно покрывать: launcher, campaign seed/DNA/worldgen, review, character import/cards, live play, in-play character/inventory/log/journal/map, settings/debug. Для каждого surface свой desired feel и acceptance test; нельзя считать redesign завершённым по одному `/game`.

## 2026-04-30: Schema/resolver existence is not runtime behavior

**Контекст**: Phase 43/46 already had location hierarchy schema and scene presence resolver design, but live worldgen still placed dense-world NPCs into one macro location because scaffold persistence and NPC placement never fed scoped sublocations into runtime.

**Ошибка**: I treated planned design surfaces and supporting code as if they proved the user-visible behavior, without a phase-level evidence matrix showing that generation, persistence, runtime selection, and opening/turn scenes all consume the same data.

**Правило**: For gameplay promises, closeout must prove the full path from generated/input data to player-visible behavior. "Schema exists", "resolver exists", or "docs say it" is not enough; every completed promise needs runtime wiring evidence, regression coverage, or explicit deprecation/follow-up.

## 2026-04-28: Structured-output failures are a class problem, not the last stack frame

**Контекст**: После очередного live `/action` restore я начал сужать работу до `scene-planner`, хотя пользователь прямо указал, что проблема шире: во всех structured-output местах модель должна получать ясный контракт того, что от неё ожидается, а не угадывать форму по Zod-ошибкам.

**Ошибка**: Я пошёл за последним упавшим модулем вместо GSD-level аудита всех LLM structured-output prompts, schema/tool contracts и repair boundaries.

**Правило**: Если один и тот же класс Zod/semantic-mapping failures повторяется в разных моделях и местах, заводить фазу/план на системную инвентаризацию и prompt-contract hardening по всем structured-output surfaces. Точечный фикс допустим только как часть этой фазы, с инвентарём, regression matrix и проверкой, что модель получает shape/example/constraints до генерации.

## 2026-04-28: Malformed optional UI tools must not roll back the turn

**Контекст**: После переключения OpenCode/deepseek-v4-flash на `native_json` live `/action` всё равно откатился: ScenePlan semantic mapping упал на `offer_quick_actions.input.actions` missing, то есть модель выбрала UI-only quick action tool без исполнимого массива кнопок.

**Ошибка**: Я продолжал относиться к malformed `offer_quick_actions` как к strict tool failure, хотя quick actions не являются world-state mutation и не должны быть player-visible kill switch для всего хода.

**Правило**: Optional UI-only tool outputs (`offer_quick_actions`) нужно либо детерминированно нормализовать из уже имеющегося массива, либо отбросить до strict ScenePlan parse. Backend не придумывает новые quick actions из воздуха, но отсутствие recoverable quick actions не должно откатывать сцену.

## 2026-04-28: OpenAI-compatible не значит `json_schema`-compatible

**Контекст**: В Phase 73 `OpenCode/deepseek-v4-flash` был классифицирован как `native_schema`, но live `/action` показал provider error: `response_format type is unavailable now`. Пользователь справедливо указал, что у разных провайдеров могут быть свои имена/варианты response format.

**Ошибка**: Я смешал OpenAI-compatible chat-completions транспорт с поддержкой OpenAI Structured Outputs `json_schema`. Для DeepSeek-подобных chat-completions endpoint-ов часто доступен только JSON mode `response_format: {"type":"json_object"}`, а schema enforcement остаётся на клиентском Zod/repair слое.

**Правило**: Capability registry должен выбирать provider-specific structured mode: `json_schema` только для реально поддерживающих endpoints/models, `json_object`/`native_json` для schema-free JSON mode, tool mode для tool-capable моделей. Нельзя считать successful JSON conformance доказательством `json_schema` support, если trace ушёл через fallback или repair.

## 2026-04-27: Если пользователь требует продолжать через GSD, не выпадать в ручной фикс

**Контекст**: Во время Phase 73 пользователь прямо поправил: "через GSD работай", когда работа по structured output начала уходить в ручное закрытие warning-ов вокруг GSD-гейтов.

**Ошибка**: Даже когда точечная правка очевидна, нельзя подменять активный GSD execution свободным ручным циклом без возврата в review/verification gates.

**Правило**: После коррекции "работай через GSD" держать основной поток в GSD-рамке: фикс допустим только как часть закрытия review finding, затем обязательны targeted verification, повторный GSD review/verifier gate, state reconciliation и phase completion через GSD.

## 2026-04-22: Не включать `claude --bare`, если нужна обычная headless OAuth-auth сессия

**Контекст**: Во время внешнего review я заявил, что Claude CLI "не залогинен", потому что вызов вернул `Not logged in · Please run /login`, хотя у пользователя рабочая Claude Code сессия была активна.

**Ошибка**: Я сам сломал auth mode, запустив `claude` с `--bare`. В этом режиме CLI отключает обычный OAuth/keychain путь и ждёт явный API-key auth. Это не признак того, что пользователь реально не залогинен.

**Правило**: Если нужен обычный headless вызов Claude CLI, сначала пробовать `claude -p` без `--bare`. Ошибку auth после `--bare` нельзя интерпретировать как реальное состояние пользовательского логина.

## 2026-04-08: Если пользователь запускает GSD execution — оркестратор не исполняет планы руками

**Контекст**: Во время GSD workflow по Phase 37 часть шагов была сделана вручную в основном потоке вместо чистого запуска/ожидания GSD-агентов.

**Ошибка**: Оркестратор подменил `gsd-execute-phase` своим ручным исполнением вместо того, чтобы остаться координирующим слоем. Это ломает ожидаемый pipeline и раздражает пользователя, особенно когда он явно просит агентное исполнение.

**Правило**: Если пользователь запускает `$gsd-execute-phase`, основной поток делает только workflow orchestration: init, state sync, grouping by waves, spawn agents, wait, aggregate, verify. Не исполнять плановые задачи руками, пока workflow не требует fallback из-за явной технической невозможности агентного шага.

## 2026-04-08: Не путать transport success с доступностью retry/undo

**Контекст**: После Phase 37 `action` и `edit` работали, но `retry/undo` возвращали `400 Nothing to retry/undo` после reload в `/game`.

**Ошибка**: Был риск трактовать это как общий transport-баг, хотя проблема уже уже: backend держит retry/undo snapshot только как live in-memory state, а UI может показать кнопки на историческом последнем assistant message.

**Правило**: При отладке gameplay transport разделять: 1) route availability, 2) campaign loading, 3) per-turn live snapshot availability. Если feature зависит от ephemeral backend state, UI должен получать явный readiness signal от backend, а не гадать по форме данных.

## 2026-03-08: E2E тестирование — проверяй РЕЗУЛЬТАТ, а не ШАГИ

**Контекст**: Task 13 (Player Character). E2E тесты прошли "успешно", но персонаж не отображался на странице игры.

**Ошибка**: Тесты проверяли что каждый шаг (parse → render → save → redirect) выполняется без ошибок. После redirect на `/game` тест остановился — не проверил что персонаж реально виден на целевой странице.

**Правило**: E2E тест задачи считается пройденным ТОЛЬКО если конечный результат виден пользователю. "Redirect произошёл" ≠ "фича работает". После каждого redirect/navigation — snapshot целевой страницы и проверка что данные отображаются.

**Общий принцип**: "Полный e2e" = тест с точки зрения пользователя от начала до конца. Если пользователь не видит результат — тест провален, неважно сколько промежуточных шагов прошло.

## 2026-04-09: Не подменять `gsd-discuss-phase` assumptions-режимом без явного основания

**Контекст**: Во время `Phase 40` я собрал `CONTEXT.md` по сути через assumption-driven synthesis, не проведя нормальный discuss loop с выбором gray areas со стороны пользователя.

**Ошибка**: Я решил, что раз технические решения в основном очевидны, а пользователь раньше делегировал техничку, то можно срезать интерактивный discuss-phase. Это нарушает сам смысл `gsd-discuss-phase`: зафиксировать именно пользовательские продуктовые решения по оставшимся gray areas.

**Правило**: Если пользователь запускает `$gsd-discuss-phase`, нужно либо:
1. честно пройти discuss workflow с выбором gray areas и коротким диалогом,
2. либо явно переключиться в assumptions-mode только если это подтверждено конфигом/аргументом или пользователь сам этого хочет.

Без этого нельзя выдавать assumptions-based `CONTEXT.md` как будто discuss уже состоялся.

## 2026-04-11: Когда пользователь жалуется на деградацию текста, проверять reasoning config и runtime path, а не только промпт

**Контекст**: Во время gameplay smoke пользователь получил повторяющиеся абзацы в одном ходе и отдельно указал, что у активных моделей, вероятно, отключён thinking/reasoning.

**Ошибка**: Есть риск смотреть только на prompt или на случайный model glitch и пропустить два системных класса проблем: 1) reasoning/thinking вообще не включён или не контролируется, 2) runtime сам дублирует или пере-подкармливает модель контекстом/шагами.

**Правило**: Если пользователь указывает на тупой/повторяющийся LLM output, надо проверять минимум три слоя: provider/model reasoning config, prompt/context assembly, и streaming/runtime accumulation path. Не сводить это автоматически к "модель затупила".

## 2026-04-11: Не ставить дорогой exploratory gameplay-UAT как mid-phase blocking gate, если его логичнее закрывать синтетикой или milestone playtest

**Контекст**: Для `Phase 43` я попросил ручную проверку revisit/local-history и ephemeral-scene retention как обязательный phase gate, хотя пользователь справедливо указал, что такие проверки дорогие по времени и естественнее делаются синтетически или уже скопом ближе к milestone closeout.

**Ошибка**: Я дал слишком тяжёлый human smoke checklist для фазы, где только часть поведения реально удобно проверить вручную прямо сейчас. Это создаёт лишнее friction и смешивает быстрый seam-smoke с долгим gameplay playtest.

**Правило**: Для `human_needed` в mid-milestone фазах разделять:
1. быстрый live smoke на 1-2 критичных seam,
2. synthetic/integration verification для дорогих сценариев,
3. milestone-level exploratory playtest для длинных gameplay loops.

Не просить у пользователя долгий ручной цикл, если его можно честно отложить или закрыть синтетикой позже.

## 2026-04-11: Если пользователь запускает GSD-команду, не выпадать из workflow в ручной режим или соседнюю команду

**Контекст**: Во время цепочки по Phase 43 пользователь явно остановил попытку уйти из вызванного GSD workflow и потребовал доводить именно запущенную команду до конца внутри GSD.

**Ошибка**: Есть риск начать импровизировать вокруг команды: давать ручные обходы, перескакивать на соседний workflow или преждевременно выносить рассуждение вне GSD-рамки, хотя пользователь явно просил оставаться в pipeline.

**Правило**: Если пользователь вызывает `$gsd-*`, основной поток остаётся внутри этого workflow до естественного checkpoint/результата. Не уходить в ручной режим, не подменять следующую команду своей, и не разрывать GSD-цепочку без явного запроса пользователя.

## 2026-04-12: Не закрывать milestone по инерции, если пользователь явно считает gameplay baseline ещё неудовлетворительным

**Контекст**: После формального завершения исходного набора фаз `v1.1` пользователь явно сказал, что найден ещё набор существенных gameplay/system quality проблем и что milestone должен продолжаться, пока базовый gameplay feel его не устроит.

**Ошибка**: Был риск трактовать "все запланированные фазы завершены" как сигнал к closeout, хотя живой продуктовый бар по факту ещё не достигнут и пользователь явно это проговорил.

**Правило**: Если пользователь говорит, что milestone продолжается до достижения gameplay-quality baseline, это становится planning truth. Нужно расширять roadmap/requirements и переводить milestone обратно в active planning, а не пушить closeout по старому плану.

## 2026-04-12: Не тащить в продукт awkward jargon, если пользователь его не хочет

**Контекст**: В phase-45 discuss я использовал термин `popadanets` как product-facing label для outsider characters, и пользователь прямо попросил убрать его.

**Ошибка**: Я подменил нейтральную продуктовую терминологию fandom-жаргоном, который в UI и planning артефактах выглядит инородно и раздражает пользователя.

**Правило**: Для user-facing labels, prompt contracts и active planning использовать нейтральные и понятные термины (`outsider`, `native resident` и т.п.). Если пользователь отвергает термин, сразу вычищать его из живых surfaces и не продолжать тащить его в обсуждение.

## 2026-04-12: Большие prompts для внешних CLI сразу отправлять через файл или stdin, не через аргумент командной строки

**Контекст**: Во время `$gsd-review --phase 45 --all` я сначала попытался передать огромный review prompt в `gemini`/`claude` как строковый аргумент командной строки.

**Ошибка**: Для длинных prompts это ломает invocation path: можно упереться в лимиты длины командной строки, экранирование и нестабильный parsing. Это лишняя ошибка, когда prompt уже собран в файл.

**Правило**: Если prompt заметно длиннее тривиального запроса, сразу использовать file/stdin-based invocation для внешних CLI. Не пробовать сначала `-p "<огромный текст>"`; сначала писать prompt в файл и передавать его через stdin или иной file-based path.

## 2026-04-12: `claude -p` для длинного review prompt не скипать после пустого stdout — сначала переключить invocation mode

**Контекст**: Во время `$gsd-review --phase 47 --all` я преждевременно решил, что `Claude` review недоступен, потому что вызов с `-p` и pipe дал пустой stdout, хотя пользователь прямо указал не скипать `Claude`.

**Ошибка**: Я слишком быстро классифицировал это как "нет usable output", вместо того чтобы добить корректный headless path. У `Claude` CLI для такого случая нужно явно подать prompt через stdin с `--input-format text` или забирать `result` через `--output-format json/stream-json`, а не бросать reviewer.

**Правило**: Если `Claude` CLI нужен для `gsd-review`, не скипать его после первого неудачного text-mode вызова. Для длинных prompts использовать `stdin + --input-format text`; если text output пустой, сразу снимать `--output-format json` и читать поле `result` перед тем, как объявлять review unusable.

## 2026-04-12: В discuss-phase и продуктовых разговорах говорить человеческим языком, а не внутренними терминами

**Контекст**: Во время обсуждения `Phase 46` я начал объяснять дизайн через внутренние термины вроде `encounter pocket`, `sublocation anchor`, `currentLocationId`, хотя пользователь прямо не работает с кодом и просит обсуждать продуктовое поведение.

**Ошибка**: Я описал решение через абстракции реализации вместо наблюдаемого поведения. Это делает обсуждение хуже, потому что пользователь вынужден сначала расшифровывать мою модель, а уже потом отвечать по сути.

**Правило**: Если разговор идёт о продукте, UX, геймплейной логике или фазовом решении, сначала объяснять на языке наблюдаемого поведения: кто где находится, кто кого видит, кто что знает, что происходит на экране. Внутренние термины и названия полей использовать только если пользователь сам просит говорить на языке реализации.

## 2026-04-12: Если пользователь хочет оценивать игру целиком, ручные gameplay-проверки нужно агрегировать в milestone closeout

**Контекст**: После `Phase 46` пользователь прямо сказал, что хочет один цельный play pass после последней доступной фазы, а не разрозненные ручные проверки по деталям на каждой фазе.

**Ошибка**: Я оставил фазу в локальном `human_needed` как будто ручная проверка должна решаться сразу, хотя для этого проекта и milestone логичнее собирать такие проверки в один общий closeout.

**Правило**: Если пользователь хочет оценивать игру целиком, фазовые `human_needed` проверки становятся входом для milestone closeout checklist. Не навязывать их как немедленный blocking gate, если можно честно отложить их до общего live gameplay pass.

## 2026-04-12: Не предлагать заранее складировать мировой канон, если он уже добывается по мере worldgen

**Контекст**: Во время discuss по `Phase 49` я предложил заранее предзагружать канонические факты по миру до старта кампании, хотя пользователь уточнил, что мировой канон уже разумно добывается во время формирования мира и не должен заранее засорять систему лишними фактами.

**Ошибка**: Я смешал два разных слоя: мировой канон, который нужен по мере worldgen и должен переиспользоваться из уже собранного lore, и персональные/power-профили, которые действительно стоит готовить заранее и хранить структурированно.

**Правило**: Для world/IP facts сначала проверять, не добываются ли они уже во время worldgen. Если да, не предлагать отдельную предзагрузку "на всякий случай"; вместо этого говорить о переиспользовании, дедупликации и нормальном хранении уже найденного знания. Предварительно подготавливать только те данные, которые реально нужны до старта кампании: профили персонажей, силы, ограничения и другие runtime-critical summaries.

## 2026-04-12: В GSD-цикле не подменять агентный шаг собственной импровизацией, пока агент не завершился

**Контекст**: Во время `$gsd-plan-phase 49` planner/researcher шли через GSD-агентов, но я начал самостоятельно дорисовывать артефакты до завершения агентного шага, хотя пользователь много раз требовал не отрываться от цикла GSD.

**Ошибка**: Я нарушил рабочий контракт процесса: вместо того чтобы дождаться агентного результата и продолжить через checker/iteration loop, я начал смешивать агентный и ручной путь. Это ломает предсказуемость workflow и раздражает пользователя.

**Правило**: Если пользователь работает через GSD, основной путь — только через соответствующий GSD workflow. После запуска researcher/planner/checker нужно дождаться их результата или корректно зафиксировать, что агент завис/не дал артефакт, и только потом принимать процессуальное решение. Нельзя заранее “дорисовывать” результаты руками, если агент ещё не завершился и пользователь не просил выйти из GSD-цикла.

## 2026-04-13: В продуктовый UI не вставлять объясняющий текст по умолчанию, если достаточно компактного control

**Контекст**: Для advanced NPC inspector я добавил в интерфейс explanatory copy вроде `Advanced Record` и `Full structured character data...`, хотя пользователю нужен чистый, собранный UI без лишнего текста и сам факт наличия advanced-кнопки уже очевиден.

**Ошибка**: Я принёс в продуктовый интерфейс внутреннее объяснение фичи вместо нормального UI-решения. Это засоряет экран, ухудшает UX и выглядит как неуверенный интерфейс, который оправдывает сам себя текстом.

**Правило**: В продуктовых UI-сценариях по умолчанию не добавлять descriptive/explanatory copy для toggles, disclosures и secondary actions. Сначала делать компактный, понятный control (`Advanced`, `Details`, и т.п.) и добавлять поясняющий текст только если без него реально ломается понимание или сценарий подтверждён дизайном/требованием пользователя.

## 2026-04-13: Не закрывать фазу по локальному seam-pass, если продуктовый outcome проходит через несколько entry paths

**Контекст**: Я закрыл фазу про richer character identity как завершённую, хотя `grounding/powerProfile` реально работали только на import/research routes и не сходились на worldgen NPC path, который пользователь тоже видит.

**Ошибка**: Я проверил наличие механизма и часть маршрутов, но не проверил полный matrix всех user-visible путей. В итоге phase closeout оказался ложноположительным: seam есть, а outcome не сходится end-to-end.

**Правило**: Если фича затрагивает несколько путей входа (`worldgen`, `import`, `research`, `manual edit`, `save/load`, `UI readback`), фазу нельзя закрывать, пока не существует явная route matrix и хотя бы по одному verify/check на каждый путь. Нельзя считать фазу завершённой по одному “правильному” маршруту, если другие рабочие entry paths дают неполный результат.

## 2026-04-13: На GSD execution не раздувать число параллельных агентов и node-процессов без реальной необходимости

**Контекст**: Во время исполнения gap-фаз пользователь поймал всплеск памяти на десятки фоновых node/agent процессов, порождённых избыточной execution-оркестрацией.

**Ошибка**: Я пошёл в heavy parallelism там, где для текущего объёма работы хватало inline execution или одного-двух агентов. Это создало лишнюю нагрузку на память и ухудшило predictability среды.

**Правило**: Для `$gsd-execute-phase` сначала оценивать фактический объём workset и memory pressure. Если фаза небольшая или workspace уже тяжёлый, исполнять inline или держать максимум 1-2 активных агентов одновременно. Не разгонять fan-out по привычке; parallelism должен быть оправдан, а не автоматическим.

## 2026-04-13: Не подменять intended behavior synthetic grounding или surrogate content fallback'ом

**Контекст**: После Phase 48/52 выяснилось, что worldgen и character routes могли синтезировать `grounding/powerProfile` из одного draft-а без реального research/import evidence. В UI это выглядело как будто система "знает" канон персонажа, хотя это был просто красиво оформленный заполнитель.

**Ошибка**: Я закрыл продуктовую дыру семантическим фоллбеком вместо честного fail-closed поведения. Это маскирует отсутствие настоящих данных и создаёт ложное доверие к системе.

**Правило**: Если feature обещает grounded/canonical/researched truth, нельзя синтезировать substitute из draft-only данных только ради заполненного UI или "непустого" payload. Либо есть реальное evidence/source lane, либо поле отсутствует. Допустимы только честные retries и явные error/empty states, а не суррогатный смысловой контент.

## 2026-04-14: После удаления fallback нельзя считать replacement path исправленным, пока он не wired и не компилируется на реальном entry path

**Контекст**: Для `known_ip key NPC` worldgen supposed-to-be replacement path уже существовал в отдельном helper, но он был битым по синтаксису и не был подтверждён end-to-end на реальном `generateNpcsStep` path. В результате после удаления synthetic fallback пользователю достались пустые grounding/power данные и дублированные identity поля.

**Ошибка**: Я остановился на уровне архитектурного намерения: "helper есть, fallback убран". Это не считается рабочим состоянием, если helper не компилируется или не проверен в том entry path, где пользователь реально получает данные.

**Правило**: Если убирается fallback и вводится intended replacement seam, нужно отдельно доказать три вещи: путь реально вызывается из user-facing entry path, helper/adapter компилируется, и один end-to-end verify/test показывает реальный полезный payload. Пока это не выполнено, feature не считается исправленной.

## 2026-04-14: Не ставить root-cause диагноз по памяти, пока не открыт текущий код entry path

**Контекст**: Я сходу сформулировал проблему как "worldgen key NPC path вообще не запускает grounding", хотя в актуальном `npcs-step.ts` такой hook уже был и проблема была уже уже: существующий research lane был слишком слабым и не давал нужный outcome пользователю.

**Ошибка**: Я диагностировал по старой модели системы, не сверив сперва текущий entry path в коде. Это дало неверное объяснение и трату времени на исправление не той формулировки проблемы.

**Правило**: При bug triage сначала открыть фактический current entry path и проверить, существует ли claimed missing hook/branch. Только после этого формулировать root cause. Нельзя говорить "ветки нет", пока не открыт живой файл, через который пользователь реально пришёл к симптому.

## 2026-04-14: Не вводить token caps в generation path без явного согласия пользователя

**Контекст**: При hardening worldgen NPC detail path я локально ограничил maxOutputTokens, чтобы уменьшить риск truncated JSON, но пользователь прямо не хотел таких лимитов.

**Ошибка**: Я выбрал один технический рычаг контроля поведения модели без согласования, хотя для этого проекта пользователь ожидает fail-safe retries и prompt hardening, а не скрытые продуктовые caps на генерацию.

**Правило**: В generation/runtime paths не вводить новые token caps без явного согласия пользователя. Сначала использовать prompt simplification, bounded retries, context reduction и другие structural fixes. Если cap всё-таки кажется нужен, сначала явно проговорить это как tradeoff, а не молча зашивать в код.

## 2026-04-25: Для architecture-critical gameplay flow не отдавать быстрый summary вместо настоящего research cycle

**Контекст**: Пользователь уточнил, что Phase 70 world-simulation direction нельзя закрывать быстрым пересказом handoff. Нужно использовать Claude CLI, Gemini CLI, интернет-источники, GitNexus и время на полноценный консилиум, потому что результат определяет, как весь WorldForge будет превращать ввод игрока в интересный финальный текст.

**Ошибка**: Первый ответ дал полезную навигацию по документам, но не запустил глубокий research/planning цикл, хотя пользовательский запрос уже подразумевал именно его.

**Правило**: Если пользователь просит продумать фундаментальный gameplay/runtime architecture слой, сначала запускать полноценный research cycle: кодовый аудит, внешние reviewers, источники, synthesis document, verification. Не подменять это коротким "что дальше" summary.

## 2026-04-14: Поздние runtime hardening-фиксы надо сразу отражать в phase artifacts, а не оставлять только в чате

**Контекст**: После первичного closeout `Phase 56` пришлось дожимать реальный known-IP worldgen replacement path и вычищать magic-number token caps из live runtime. Код уже ушёл вперёд, а planning truth ещё нет, из-за чего полный контекст жил только в переписке.

**Ошибка**: Я довёл runtime до рабочего состояния, но не синхронизировал `SUMMARY` / `VERIFICATION` / `STATE`, поэтому история фазы оставалась неполной и вводила в заблуждение о том, что именно реально было добито после closeout.

**Правило**: Любой поздний hardening или gap-fix, который меняет реальный runtime outcome уже закрытой фазы, в тот же проход синхронизировать минимум в `phase SUMMARY`, `phase VERIFICATION` и `STATE.md`. Контекст не должен зависеть от того, прочитал ли кто-то чат.

## 2026-04-18: Не объявлять human-checkpoint failed по неполному визуальному evidence

**Контекст**: На Phase 63 я поспешно трактовал скрины как провал `PERSONALITY` details/Advanced checkpoint, хотя expanded state просто не был открыт на первом скрине, а sparse `Advanced` output оказался ожидаемым для конкретного record shape по текущему complement-only контракту.

**Ошибка**: Я слишком рано превратил неполное evidence в root-cause вывод и начал двигать фазу назад в fix-mode до того, как сверил реальное состояние UI с кодом и тестовым контрактом.

**Правило**: Если human verification даёт частичный визуальный evidence, сначала классифицировать его как `not yet proven`, а не как `failed`, пока не сверены: (1) фактическое состояние UI, (2) текущий код рендера, (3) действующий test contract. Нельзя приписывать баг тому, что может оказаться просто неполной демонстрацией.

## 2026-04-18: Если уже подняты агенты на разбор, основной поток ждёт их вывода до собственной интерпретации

**Контекст**: Во время `Phase 63` я снова начал локально дорисовывать выводы по checkpoint/debug path, пока ещё шли выделенные агенты на `Advanced inspector` и `Continue to Character` crash, хотя пользователь уже многократно требовал не лезть вперёд основного агентного цикла.

**Ошибка**: Я потратил основной поток на промежуточную интерпретацию до завершения агентного шага. Это создало лишний шум, риск противоречивых выводов и снова нарушило ожидаемый режим orchestration-first.

**Правило**: Если по задаче уже запущены профильные агенты, основной поток не делает конкурирующий diagnosis/решение до их ответа, кроме минимального status-check и лог-сбора для unblock. Сначала дождаться агентных findings, потом принимать решение и только затем продолжать workflow.

## 2026-04-19: После завершения своей работы не оставлять локальные dev-серверы висеть

**Контекст**: После Phase 64 backend watcher остался висеть на `3001` и при следующем рестарте дал `EADDRINUSE`, потому что я не закрыл свои процессы после завершения работы.

**Ошибка**: Я оставил локальные dev-серверы и watcher-процессы жить после завершения фазы, хотя они больше не были нужны и начали мешать следующему запуску.

**Правило**: Если я сам поднимал локальные dev-серверы, в конце задачи или verification-прохода я обязан их остановить, если пользователь прямо не просил оставить их включёнными. Перед финальным ответом или handoff нужно проверить, что рабочие порты свободны и мои watcher-процессы не висят.

## 2026-04-22: Если провайдер считает reasoning tokens, нельзя считать `result.reasoningText` единственным источником правды

**Контекст**: При диагностике Z.AI reasoning я решил, что провайдер “не отдаёт” reasoning text, потому что в runtime логах было `reasoningLen=0`, хотя endpoint фактически возвращал `choices[0].message.reasoning_content`.

**Ошибка**: Я слишком доверился тому, как `@ai-sdk/openai` заполнил `result.reasoningText`, и не проверил сырой `response.body`. В OpenAI-compatible chat paths SDK может считать reasoning tokens, но не поднимать провайдерское reasoning поле в стандартный `reasoningText`.

**Правило**: Если у провайдера есть `reasoningTokens`, но `reasoningText` пустой, нужно сразу проверять сырой response payload и провайдер-специфичные поля (`reasoning_content` и т.п.). Для совместимых endpoint'ов нельзя считать SDK-normalized `reasoningText` единственным источником истины.

## 2026-04-22: Не подменять quality-critical generation blind truncation'ом

**Контекст**: В `world-brain` bounded-field overflow (`situationSummary`, `sceneQuestion`, `narrationGuardrails`) я сначала закрыл через тупую обрезку строк до schema-лимитов.

**Ошибка**: Такая обрезка лишь убирает crash, но не гарантирует осмысленный runtime output. Для gameplay-critical seams это подмена рабочего поведения аварийным предохранителем.

**Правило**: Если generation path формирует смысловой runtime input для игры, blind truncation нельзя использовать как основную стратегию repair. Сначала нужны prompt hardening, validation-aware retries и semantic compaction/regeneration; жёсткий `slice()` допустим только как самый последний crash guard, а не как intended behavior.

## 2026-04-20: Для внешнего second opinion использовать те CLI, которые пользователь уже закрепил в процессе

**Контекст**: При разговоре о следующем направлении после Phases 66-67 я попытался дернуть `GLM`, хотя пользователь уже явно строил workflow вокруг `Claude` и `Gemini` CLI.

**Ошибка**: Я выбрал другой внешний канал без необходимости и пошёл против уже установленного рабочего паттерна проекта.

**Правило**: Если пользователь уже зафиксировал конкретные внешние review/discuss инструменты для проекта (`Claude`, `Gemini`), использовать сначала их. Не переключаться самовольно на `GLM`, если пользователь этого не просил.

## 2026-04-19: Стартовое состояние персонажа нельзя отдавать на творческое решение модели

**Контекст**: В import ingestion я позволил LLM выбирать `hp`, а потом пытался чинить шум через эвристику "fresh vs wounded". Пользователь справедливо указал, что `hp` — это системный стартовый стейт, а не лор персонажа.

**Ошибка**: Я смешал creative synthesis с deterministic runtime defaults. Из-за этого модель случайно выдавала `4/5`, и потом приходилось латать поведение пост-нормализацией.

**Правило**: Поля стартового состояния (`hp`, аналогичные gauges/charges/uses) по умолчанию задаются системой детерминированно и редактируются отдельно. Их нельзя просить у LLM как часть character synthesis, если только пользователь явно не задаёт стартовое повреждение/истощение через отдельный state layer.

## 2026-04-19: Если phase blocker вызван моим же локальным хвостом, я обязан его разобрать, а не изображать "чужую" грязь

**Контекст**: На closeout Phase 65 я остановил фазу из-за `backend/src/character/record-adapters.ts`, хотя этот diff был моим же непроведённым совместимым фиксом, а не внешним вмешательством пользователя.

**Ошибка**: Я слишком формально трактовал dirty worktree и превратил собственный хвост в искусственный блокер вместо того, чтобы быстро проверить его, решить keep/revert и привести состояние в консистентный вид.

**Правило**: Если blocker упирается в dirty файл, который с высокой вероятностью оставил я сам, сначала проверить diff, парные тесты и blast radius. После этого немедленно принять решение: либо удалить хвост, либо валидировать и поглотить его. Нельзя останавливать GSD-цикл на собственном неразобранном хвосте под видом "неизвестной внешней грязи".

## 2026-04-20: Когда пользователь жалуется на "игра читается как хуйня", сначала разбирать локальную сцену и причинность, а не уходить в latency/infra-диагноз

**Контекст**: По первым ходам новой кампании я начал ставить акцент на `latency`, `state hygiene`, `chronicle` и observability split, хотя пользовательский pain был в другом: текст сцены сам по себе плохо читается, локальная постановка не имеет ясной причины, NPC как будто не видят друг друга и реплики теряют адресата.

**Ошибка**: Я подменил player-facing literary/directorial failure внутренним системным диагнозом. Даже если infra issues реальны, сначала нужно ответить на главный вопрос пользователя: почему конкретная сцена ощущается бессвязной и глупой.

**Правило**: Если пользователь жалуется на gameplay feel и качество текста сцены, первым делом разбирать: (1) кто где находится, (2) почему они там, (3) что вызвало текущее действие, (4) кто на кого реагирует, (5) читается ли последовательность как единое событие. Только после этого поднимать latency, logging, reflection budget и прочую внутреннюю механику как вторичный слой.

## 2026-04-26: Backend не должен владеть смысловой интерпретацией premise

**Контекст**: В worldgen research path premise `JJK world with Naruto power system` превратился в backend-persisted `Canonical subject: Naruto and Jujutsu Kaisen`, после чего генерация импортировала Naruto-географию, фракции и персонажей вместо JJK-мира с Naruto power-system overlay.

**Ошибка**: Я допустил архитектуру, где backend принимает LLM-строку о franchise/canon как детерминированный управляющий факт. Это нарушает границу: backend не понимает смысл слов, primary/overlay/canon и не должен нормализовать такие вещи как reproducible truth.

**Правило**: Семантическую интерпретацию пользовательского premise, выбор источников, primary-vs-overlay смысл и research intent должна формировать LLM как отдельный artifact с provenance. Backend может валидировать форму, хранить raw premise/artifacts, запускать search/tools и передавать approved/generated context дальше, но не должен превращать смысловые LLM-выводы в backend-owned canonical truth.

## 2026-04-26: Не называть dirty worktree "чужими изменениями", если проект веду только я

**Контекст**: После `$gsd-execute-phase 71 --gaps-only` я несколько раз написал, что оставил "чужие dirty-файлы" нетронутыми. Пользователь уточнил, что с проектом работает только Codex, значит эти файлы не чужие.

**Ошибка**: Я применил общий safety-шаблон про user-owned dirty worktree без сверки с реальной операционной моделью этого проекта. Это скрыло факт, что dirty state является моим собственным хвостом или результатом предыдущих агентных проходов.

**Правило**: В WorldForge не называть dirty-файлы "чужими" по умолчанию. Если worktree грязный, считать это Codex/GSD хвостом, инвентаризировать scope, отделять текущий plan scope от накопленного хвоста и либо валидировать/коммитить, либо явно разобрать позже. Не прятать собственную незавершённую работу за формулировкой "user changes".

## 2026-04-26: Для Codex-subagent runner не брать первый совместимый старый fallback

**Контекст**: Во время Desloppify review runner старый npm Codex CLI отказался запускать `gpt-5.5`, и я выбрал `gpt-5.2` как первый быстро проверенный совместимый вариант.

**Ошибка**: Я не проверил сначала более подходящие для кодовой работы модели (`gpt-5.3-codex`, затем `gpt-5.4`) и тем самым самовольно понизил качество runner-а сильнее, чем требовала проблема совместимости.

**Правило**: Если текущий Codex runner не принимает модель из основного контекста, сначала тестировать ближайшие качественные coding/work модели (`gpt-5.3-codex`, `gpt-5.4`) и только потом падать ниже. Быстрый compatibility fallback не должен становиться default без проверки более сильных вариантов.

## 2026-04-26: Zod не должен быть player-visible kill switch для долгого worldgen

**Контекст**: `suggest-seeds` падал после 3 дорогих LLM-попыток, потому что модели вроде Kimi/Mimo стабильно возвращали `generatedContext.citations` строкой вместо массива citation objects и `canonicalNames` строкой вместо объекта.

**Ошибка**: Повторный full retry не меняет задачу: если модель один раз неверно поняла форму поля, она часто приносит тот же структурный мусор ещё два раза, сжигая минуты и токены. Пользователь не должен видеть Zod как причину падения worldgen.

**Правило**: Для structured-output failures сначала делать validation-aware repair-pass над уже полученным JSON: передать Zod issues, schema example и сырой output, просить исправить только форму без нового lore. Full regeneration допустим только если cheap repair не смог восстановить валидный объект.

## 2026-04-26: Zod-boundary включает внешние tool-data, не только LLM-output

**Контекст**: После hardening `safeGenerateObject` worldgen всё равно упал на `parseWorldgenResearchArtifact`: Brave/search result `description` оказался длиннее 700 символов, а artifact schema отвергла уже backend-assembled объект.

**Ошибка**: Я сказал "везде", но фактически закрыл только LLM structured-output boundary. Внешние tool-data (`webSearch`, provider snippets, URLs, titles) тоже являются недоверенным входом и не должны валить пользовательский pipeline из-за contract caps.

**Правило**: Перед сохранением/парсингом artifact любые внешние tool-data должны проходить deterministic sanitization под schema caps, включая длину строк и размер metadata-коллекций. Для search snippets допустимо capped trim/truncate, потому что это provenance/context metadata, а не creative generation result. Zod должен проверять уже санитизированные границы, а не падать на сырой provider noise.

## 2026-04-26: Artifact-backed canon NPC не должен падать в original power-assessment

**Контекст**: В worldgen artifact path `Satoru Gojo` был создан как NPC Jujutsu Kaisen, но получил `canonicalStatus: "original"` и PowerStats уровня `Wall`, потому что legacy `ipContext` отключён, а NPC enrichment классифицировал весь artifact-backed path как original.

**Ошибка**: Я сохранил artifact source rules для planning/detail prompts, но не протащил их в downstream power-assessment classification. В итоге canonical character из artifact прошёл через prompt для original персонажей, где модель специально занижает tier при слабых evidence.

**Правило**: Если backend использует LLM-produced research artifact вместо legacy `ipContext`, downstream classifiers тоже должны читать этот artifact как data. Для NPC power-assessment canonical known-IP ветка включается только детерминированно: имя NPC совпало с `generatedContext.canonicalNames.characters`, а sourceUsageRule разрешает `npcs/characters` или `world_basis`. Backend не выводит meaning сам, но обязан не терять уже утверждённый artifact signal.

## 2026-04-26: Cursor Agent CLI вызывается как `cursor-agent`, не `cursor agent`

**Контекст**: При `$gsd-review --phase 72 --all` я попытался вызвать Cursor review командой `cursor agent -p --mode ask --trust`, а пользователь поправил, что локальный CLI называется через дефис: `cursor-agent`.

**Ошибка**: Я доверился generic workflow примеру и не проверил фактический installed command name перед выводом, что Cursor agent недоступен.

**Правило**: Для Cursor reviewer в WorldForge сначала проверять `Get-Command cursor-agent` и вызывать именно `cursor-agent`, а не `cursor agent`. Если workflow пример расходится с локальной установкой, приоритет у реально установленной команды.

## 2026-04-27: GSD phase worktree нельзя считать закрытым, пока branch не интегрирован в mainline

**Контекст**: Phase 70 была выполнена в отдельном worktree `R:\Projects\WorldForge-phase70-execute` на branch `codex/phase-70-execute`, но я продолжил Phase 71/72 из основного `R:\Projects\WorldForge` на `develop`, не интегрировав Phase 70 commits обратно в mainline.

**Ошибка**: Я принял "phase execution complete" внутри isolated worktree за "phase landed in active project line". Это оставило важную фазу в боковой ветке: работа не потеряна, но выпала из текущей истории `develop`.

**Правило**: После любой GSD phase execution в worktree обязательны три проверки перед следующей фазой или финальным "готово": `git worktree list --porcelain`, `git branch --show-current`, `git rev-list --count develop..HEAD` / `git rev-list --count HEAD..develop`. Если phase branch содержит уникальные commits, нельзя продолжать следующую фазу из `develop`; сначала интегрировать branch через merge/cherry-pick, прогнать tests/typecheck/GitNexus, затем удалять worktree только через `git worktree remove`.

## 2026-04-27: ScenePlan loose schema не должен быть strict Zod kill switch для normal turn

**Контекст**: После Phase 70 normal visible turn упал на judge ScenePlan: модель вернула `plannedActions` с `payload` вместо `input`, без `actorId` на action и с неканоничным/выдуманным `toolName`; `safeGenerateObject` не пропустил объект через Zod и весь ход откатился после 80+ секунд.

**Ошибка**: Я назвал schema `scenePlanLooseSchema`, но оставил внутри `plannedActions` strict discriminated union. В итоге repairable model-shaped output умирал до `sanitizeScenePlanCandidate`, хотя именно sanitizer должен нормализовать форму и только потом отдавать объект в strict schema/validator.

**Правило**: Для LLM-authored intermediate plans loose schema должна принимать распространённые структурные отклонения (`payload`/`args` aliases, missing repeated actorId, camelCase tool aliases, unsupported invented tool names) и детерминированно нормализовать или отбросить неисполняемые actions перед strict parse. Strict schema и backend validator остаются финальным authority; loose schema не должна быть user-visible failure boundary.

## 2026-04-27: Restore без исходной ошибки недопустим

**Контекст**: После первого ScenePlan hardening `/action` показал два `llm.attempt success: true`, а затем только `Snapshot restored` и `turn.end outcome=restored`; исходная ошибка в серверный лог не попала.

**Ошибка**: Я закрыл один Zod boundary, но оставил route-level rollback как чёрный ящик. Когда последующий strict parse/validation/execution падает, пользователь видит сам факт отката, а не причину, и следующий дебаг начинается с гадания.

**Правило**: Любой rollback/restore path обязан логировать исходный exception до восстановления snapshot. Для LLM-structured intermediate objects нельзя считать `safeGenerateObject success` достаточным: нужно покрывать downstream strict parse/semantic validation/execution и иметь regression на каждый repairable shape, который раньше доходил до restore.

## 2026-04-25: После запуска GSD-агента не прерывать его и не закрывать активный агентный шаг

**Контекст**: Во время `$gsd-execute-phase 70` пользователь прямо поправил: "Агентов прерывать запрещено. Дал им задачу - жди завершения."

**Ошибка**: Есть риск трактовать долгий агентный шаг как повод вмешаться, закрыть агента или переключиться на конкурирующее ручное исполнение. Это ломает контракт GSD execution, где оркестратор координирует, а executor завершает выданный план.

**Правило**: После `spawn_agent` для GSD execution основной поток не использует interrupt и не закрывает активного агента. Разрешены только `wait_agent`, короткие status updates и filesystem/git spot-check после completion signal или явной потери сигнала. Следующий план запускается только после завершения текущего агентного шага.

## 2026-04-28: GSD closeout helpers нельзя принимать без ручной сверки planning-state

**Контекст**: После Phase 73 `gsd-tools phase complete 73` записал в roadmap `6/5 plans complete`, оставил `STATE.md` как "ready for verification" и выдал ложный warning `needs human verification`, потому что regex зацепил historical `previous_status: human_needed` в уже passed verification report.

**Ошибка**: Я позволил helper-у изменить project state и не остановился сразу на reconciliation pass, хотя GSD tooling уже раньше давал drift в completed_plans и phase-state полях.

**Правило**: После каждого `gsd-tools phase complete` в WorldForge обязательно читать diff `.planning/ROADMAP.md`, `.planning/STATE.md`, phase verification/review files и сверять: plan count, phase status, last activity, human-needed warnings, completed_plans. Если helper ошибся, вручную исправить planning-state до коммита и не заявлять closeout, пока artifacts не совпадают с фактической verification evidence.

## 2026-04-28: ScenePlan repair должен рекурсивно закрывать nested tool inputs

**Контекст**: После Phase 73 live `/action` снова откатился: `safeGenerateObject` и repair завершились success, но `runScenePlanner` упал на `semantic-mapping-failed`, потому что во вложенном payload `plannedActions.1.input.actions[]` отсутствовали строки `action`.

**Ошибка**: Я закрыл top-level structured-output shape (`payload`/`input`, missing IDs/toolName), но не доказал, что semantic ScenePlan mapper и repair проходят все nested tool-input schemas до strict validation. В результате Zod-видимая проблема сместилась глубже и всё равно стала player-visible restore после нескольких минут.

**Правило**: Для LLM-authored ScenePlan нужно проверять и чинить shape рекурсивно: top-level plannedActions, tool input object, nested arrays, common aliases, string caps. Если единственная ошибка cap вроде `hiddenRationale <= 280`, сначала применять deterministic trim/coerce, а не дорогой LLM repair. Нельзя считать `safeGenerateObject success` завершённой защитой, пока strict `scenePlanSchema` и downstream mapper не покрыты fixtures на вложенные payload failures.

## 2026-04-30: Transient account/subscription failure не равен unsupported model

**Контекст**: Во время Phase 74 verifier default model сначала упал с сообщением, что модель недоступна для текущего ChatGPT/Codex account. Пользователь позже поправил: доступность моделей восстановлена, проблема была в подписке/аккаунте, а не в том, что модель реально unsupported.

**Ошибка**: Я закрепил временный account-gate как модельное ограничение и стал явно форсить более старую модель, хотя после восстановления доступа нужно вернуться к default workflow model.

**Правило**: Если Codex/GSD модель падает из-за account/subscription/access gate, считать это transient environment state. После пользовательской поправки о восстановленном доступе не продолжать принудительный downgrade; использовать default model, а fallback указывать только при повторном текущем failure с тем же evidence.

## 2026-04-30: "Аудит всех фаз" нельзя сужать до самого явного бага

**Контекст**: Пользователь прямо попросил Phase 75 GSD как аудит всех предыдущих фаз 0-75 на предмет de jure/de facto расхождений, TODO, cut corners, quick wins и unwired promises. Я вместо этого выполнил targeted audit вокруг критичного location/presence бага Phase 43/46 и классифицировал только adjacent material risks.

**Ошибка**: Я подменил масштаб запроса. Даже если один баг очевидно release-blocking, это не даёт права превращать "все фазы" в "самая болезненная цепочка плюс соседние кандидаты". В результате Phase 75 названа cross-phase promise audit, но не является полным аудитом 0-75.

**Правило**: Если пользователь просит "все фазы", "весь проект", "0-N", нужно явно построить exhaustive coverage matrix по каждому phase id и закрывать каждую строку статусом: verified, stale/unwired, deprecated, superseded, follow-up, not applicable. Нельзя заявлять audit complete, пока каждая фаза не имеет evidence row или пользователь явно не согласовал сокращение scope.

## 2026-05-01: Dense-location closure must validate generated topology, not only resolver behavior

**Контекст**: Пользователь дал кампанию `ed3046d2-cd7c-4397-a18b-85cbd6fe67fe`, где Shibuya не получила persistent sublocations, игрок и несколько NPC были scoped к macro Shibuya, и стартовая сцена снова собрала всех в одну кучу.

**Ошибка**: Я принял Phase 75 "если sublocations существуют, resolver их уважает" за достаточное закрытие. Но live worldgen всё ещё мог создать macro-локацию без дочерней playable scene, после чего NPC-step и saver не имели валидного места, куда развести персонажей.

**Правило**: Для generated worlds нужно валидировать topology до NPC placement: каждый macro location обязан иметь explicit persistent_sublocation child, а player start должен попадать в concrete sublocation, не в broad macro. Тесты должны покрывать реальные generated-topology failure shapes, а не только hand-authored dense fixtures.

## 2026-05-01: Не роутить любой GSD-регресс в новую фазу

**Контекст**: После live-регресса Phase 75 я начал оформлять проблему как новую roadmap phase, хотя пользователь напомнил, что в GSD есть не только phase lifecycle, но и debug, quick, verify-work, audit-fix, validate-phase, todo/backlog и другие инструменты.

**Ошибка**: Я выбрал самый тяжёлый GSD-маршрут по привычке, не изучив локальную поверхность команд и не применив `$gsd-do` routing table. Для live bug/regression корректный первый кандидат — `$gsd-debug`; для небольшого исправления с планом и проверками — `$gsd-quick --validate`; для UAT-провала — `$gsd-verify-work` / `--gaps`.

**Правило**: Перед добавлением новой фазы в WorldForge сначала сверить intent с GSD tool surface: bug -> debug, small scoped fix -> quick, completed-feature validation -> verify-work/validate-phase, milestone gap -> audit/plan-gaps, roadmap-scale architecture -> add/insert phase. Новая фаза допустима только если scope реально roadmap-scale или пользователь явно просит фазу.

## 2026-05-01: Worldgen placement должен быть cast-driven, а не location-quota driven

**Контекст**: После фикса "каждый macro должен иметь sublocation" пользователь указал, что это всё ещё неверная модель: Shibuya огромная, персонажей нужно логично вплетать в разные районы/сцены/сюжетные позиции, создавая persistent или runtime locations по необходимости.

**Ошибка**: Я лечил topology quota, а не генеративную причину. Подход "сначала фиксированный список локаций, потом распределить NPC" снова может дать искусственный маленький набор сцен и нелогичную толпу, просто чуть менее очевидную.

**Правило**: В generated world pipeline NPC placement обязан иметь отдельный cast-driven expansion step после NPC generation и до persistence: LLM решает семантическое размещение и какие сцены нужны под роли персонажей; backend только проверяет существование ссылок, parent/scene consistency, capacity/overcrowding heuristics и fail-closed repair. Нельзя считать "N persistent sublocations exists" достаточным доказательством живого мира.

## 2026-05-01: Location scope не равен perceptual reach

**Контекст**: После проверки последней кампании пользователь уточнил, что проблема не только в "все рядом": даже persistent location может быть большой зоной, и нахождение в одной зоне не означает, что акторы видят друг друга или стоят на расстоянии вытянутой руки.

**Ошибка**: Я всё ещё думал в терминах location membership: broad/persistent scope как proxy для immediate scene. В коде это проявлялось как `currentSceneLocationId ?? currentLocationId`, из-за чего отсутствие локальной сцены превращалось в уверенную co-presence.

**Правило**: Presence/awareness/target candidates/NPC ticking должны использовать только explicit local scene scope. Broad location и macro fallback допустимы для display, movement graph, recent context и storage compatibility, но не для clear actors или direct interaction. Если данных о локальной сцене нет, backend обязан fail-closed: игрок остаётся в локации, NPC в той же зоне остаются background/offscreen, пока tool/worldgen/scene planner явно не вводит их в локальную сцену.

## 2026-05-01: Не подменять запрошенную внешнюю модель видимым fallback без явной пометки

**Контекст**: В research pass по runtime dramaturgy пользователь уточнил, что в OpenCode Go нужно использовать `mimo-v2.5-pro`. Я до этого использовал видимую CLI-модель `opencode/gpt-5-nano`, потому что `mimo-v2.5-pro` не отображалась в `opencode models`.

**Ошибка**: Fallback-модель может дать полезный шум, но её нельзя выдавать за полноценный OpenCode/Mimo council pass. Если пользователь называет конкретную модель или provider tier, нужно либо запустить именно её, либо явно пометить блок как unavailable и не учитывать fallback как равнозначный review.

**Правило**: Для cross-AI review/research фиксировать фактический `provider/model` и статус запуска. Если требуемая модель не находится (`provider/model not found`, пустой auth, нет в model list), сначала проверить provider/model syntax и доступный список, затем записать "blocked/unavailable" в артефакт. Не заменять на другую модель без явного согласия пользователя или явной маркировки как secondary/non-decisive.

## 2026-05-01: Архитектурные оценки требуют evidence matrix, а не ощущения по UX

**Контекст**: Runtime-dramaturgy research сначала правильно заметил, что игра ощущается как cockpit, но из этого сделал слишком широкий вывод, будто backend director layer почти отсутствует. OpenCode Go / Mimo показал, что Phase 70/74/75 уже дали `SceneFrame`, `NarratorPacket`, ScenePlan/Judge authority, prompt contracts, location hierarchy and scoped presence.

**Ошибка**: Я смешал три разные оценки: структурно реализовано, player-visible реализовано, live-provider validated. Плохой UX был прочитан как отсутствие backend architecture, что ведёт к переоценке нового backend scope; обратная ошибка тоже возможна — считать backend packet достаточным доказательством хорошей игры.

**Правило**: Перед roadmap-scale GSD planning по архитектуре/UX обязательно делать evidence matrix с колонками: `claim`, `code/planning/live evidence`, `status: implemented/partial/missing/live-risk/unknown`, `planning consequence`. Нельзя планировать rewrite существующего слоя, пока не доказано, что adapter/enrichment недостаточен. Нельзя закрывать game-feel как done, пока player-visible UX и live play rubric не пройдены отдельно от структурных тестов.

## 2026-05-01: Называть точный источник setup-инструкций, особенно если README расходится с QUICKSTART

**Контекст**: При установке Open Design я сказал, что WSL2 указан как safer baseline, но пользователь проверил README GitHub и его встроенный Quickstart-блок: там поиска по WSL нет. WSL2 действительно упоминается в отдельном файле `QUICKSTART.md`, на который README ссылается для дополнительных деталей, а не в README/README Quickstart.

**Ошибка**: Я сослался на документацию обобщённо, не назвав файл. Это выглядело как выдуманная README-инструкция, хотя источник был другой документ того же репозитория.

**Правило**: Когда setup-решение основано не на README, явно говорить `Источник: QUICKSTART.md`, `docs/...` или конкретный файл/строку. Если пользователь показывает README без нужной строки, сначала признать, что README не содержит утверждение, и только потом приводить другой источник.

## 2026-05-01: Visual design needs visual approval before GSD implementation planning

**Контекст**: Для Phase 77 я принял Open Design Sonnet/Opus artifacts как достаточно полезные для GSD planning после текстовой/структурной оценки, хотя визуально они оба ушли в один и тот же document/newspaper style. Пользователь указал, что `docs/ui_concept_hybrid.html` был только старым концептом/reference, который нужно доводить до ума, а не объявлять каноном или автоматически тащить в phase execution.

**Ошибка**: Я перепутал topology reference с approved visual direction. Я не сделал визуальную проверку screenshot/viewport перед запуском GSD planning и слишком рано начал формализовывать Phase 77 как будто дизайн уже принят. Слово "канон" было неверным: reference/concept не становится обязательной целью без явного approval.

**Правило**: Для UI/UX-фазы сначала должен быть visual approval gate: открыть/снять screenshot всех candidate references, явно классифицировать `approved`, `rejected`, `reference only`, `needs refinement`, и получить пользовательское подтверждение перед cross-AI review, replan или execute. Open Design/agent output нельзя принимать по source/topology-only чтению; если визуал похож на уже отклонённый стиль, он считается rejected. Старый concept file можно использовать только как reference input, пока пользователь не утвердит refined direction.

## 2026-05-01: Live play UI must not invent command modes or freeze dialogue outside the scene

**Контекст**: При обсуждении WorldForge live play я предложил focused dialogue mode, `Act/Say/OOC` modes и fallback verbs. Пользователь уточнил: диалог не должен превращаться в отдельный frozen mode; companions остаются автономными NPC; ввод игрока свободный narrative; `Say` не нужен отдельно от `Act`; OOC не требует toggle; quick actions не должны иметь fallback fiction verbs.

**Ошибка**: Я начал проектировать интерфейс от привычных RPG/chat affordances вместо реального desired flow: игрок пишет естественный текст, GM понимает действие/речь/OOC из содержания, а UI не навязывает искусственные категории.

**Правило**: В WorldForge live play dialogue is a presentation beat inside the current scene, not a world-pausing route. NPC/party members remain GM-controlled autonomous actors. Input dock supports freeform narrative plus `Continue`; `Ask GM` can be a separate prompt lane only for direct meta/question interaction, but no `Act/Say/OOC` command taxonomy. Quick actions are GM-authored per beat only; no predefined/fallback in-fiction verbs.

## 2026-05-01: When forwarding collaborator questions, produce one complete paste-ready answer

**Контекст**: Пользователь пересылает вопросы/выводы от Opus/Open Design, чтобы я помог сформировать следующий полноценный ответ в дизайн-сессии. Я несколько раз отвечал короткими correction snippets и отдельными "important rule" блоками вместо единого ответа на весь набор вопросов.

**Ошибка**: Fragmented snippets force the user to manually stitch the answer and slow the design loop. The user's intent is not "give me a micro-patch"; it is "compose the next coherent reply that covers the collaborator's curiosity and includes my corrections."

**Правило**: Когда пользователь пересылает collaborator output/questions, отвечать одним цельным paste-ready блоком, покрывающим все relevant questions and corrections. Не отправлять incremental correction snippets unless explicitly asked. If a new correction changes prior content, integrate it into the full answer instead of appending another patch.

## 2026-05-01: Product/design briefs should use positive framing, not obvious negative lists

**Контекст**: В design-session ответах я многократно формулировал WorldForge через "не чат, не документ, не dashboard, не debug cockpit", хотя пользователь уже зафиксировал, что это immersive solo RPG.

**Ошибка**: Negative framing wastes tokens and attention, repeats obvious exclusions, and keeps anchoring the design discussion to rejected forms instead of the target experience.

**Правило**: В WorldForge UI/product prompts формулировать через positive target: immersive solo RPG, staged scene playback, GM-led beats, freeform response, autonomous NPCs, hidden system layers. Avoid repeated "not X" lists unless the user explicitly asks for anti-goals or a blocker checklist.

## 2026-05-02: Visual fixes require local screenshot ownership

**Контекст**: Open Design / Opus без vision-loop продолжил возвращать частичные HTML/CSS правки, а пользователь был вынужден вручную присылать скриншоты каждого регресса.

**Ошибка**: Для визуальной работы я слишком долго лечил дизайн текстовыми указаниями внешнему агенту вместо того, чтобы самому открыть прототип, снять baseline, поправить CSS/DOM и переснять viewport screenshots.

**Правило**: Когда пользователь просит UI/design fixes, сначала строить локальный visual QA loop: Playwright/browser screenshots по ключевым экранам и размерам, затем прямые scoped edits, затем повторные screenshots. Не возвращать пользователю fragment fixes без собственного визуального подтверждения.

## 2026-05-02: Persistent shell context should not be duplicated inside Home hero

**Контекст**: В WorldForge-v4 Home одновременно показывал `WorldForge` в rail и в верхнем header, активную кампанию в rail и снова огромной hero-обложкой в центре. Пользователь отметил, что это бессмысленный дубль.

**Ошибка**: Я оставил Home в режиме маркетинговой/обложечной страницы, хотя persistent rail уже несёт бренд и active campaign context. Центральный экран повторял идентичность вместо того, чтобы отвечать на вопрос "что мне делать дальше?".

**Правило**: Для app shell с постоянным rail не дублировать бренд, active campaign title и basic campaign meta в основном Home. Rail = постоянный контекст; Home = next playable step, current scene affordances, campaign list/launcher. Дубли допустимы только если элемент выполняет другую задачу, например campaign row inside all-campaigns list.

## 2026-05-02: Visual rows need measured columns, not full-width table stretching

**Контекст**: Campaign switcher в WorldForge-v4 растягивал строки на почти всю ширину stage. Tarot-карта была шире первой grid-колонки, title касался аватара, а quote/stat улетали слишком далеко вправо.

**Ошибка**: Я смотрел на ряд как на responsive table, но для game UI это должен быть читаемый campaign card row с ограниченной рабочей шириной и колонками, измеренными по фактическому размеру children.

**Правило**: Для карточных списков в WorldForge задавать `max-width` контейнера и grid-колонки от реальных размеров элементов. Нельзя делать первый column меньше avatar/card визуала. На широких экранах увеличивать воздух вокруг списка, а не расстояние между смысловыми частями одной карточки.

## 2026-05-02: Settings must expose management before assignment

**Контекст**: WorldForge-v4 Settings показывал role routing для `Narration`, `Oracle`, `Research`, `Fallback`, но не имел visible entry point для добавления/подключения provider.

**Ошибка**: Я спроектировал второй шаг workflow первым: назначение моделей на роли без управления самими provider connections. Это делает UI магическим и ломает реальный пользовательский сценарий настройки LLM endpoint.

**Правило**: В настройках провайдеров сначала показывать configured providers и `Add provider`, затем role routing. Любой экран assignment должен иметь nearby management path для создания/редактирования source objects, иначе это не product UI, а мок таблицы.

## 2026-05-02: Prototype UI must carry a reality status for every visible control

**Контекст**: В WorldForge-v4 прототип попали красивые, но несуществующие продуктовые controls: `Tone` при создании кампании, `Player seat`, импорт-роли `Flashback voice/Ghost`, fake confidence/tokens, и settings без real provider management.

**Ошибка**: Я принял дизайн-макет как свободную композицию и не провёл contract audit против текущего frontend/shared/backend состояния до визуальной полировки. Из-за этого UI начал обещать функциональность, которой нет, и скрывать функциональность, которая реально есть.

**Правило**: Перед тем как считать design prototype полезным для следующей фазы, каждый видимый control/status должен быть классифицирован как `REAL`, `TARGET-UI`, `NEEDS-BACKEND` или `MOCK-COPY` с evidence source. Всё, что не классифицируется, удаляется из видимого UI или явно помечается как target, чтобы дизайн не расходился с реальностью.

## 2026-05-02: Do not duplicate persistent shell context inside the active page

**Контекст**: После reality-audit Home всё ещё показывал `Home` в верхнем breadcrumb при уже выбранном `Home` в rail, а model/provider strip сверху дублировал нижний rig status.

**Ошибка**: Я убрал крупные фейковые controls, но не прошёлся по информационной архитектуре на уровне "кто уже сказал эту информацию". Из-за этого экран оставался перегруженным одинаковым shell/status контекстом.

**Правило**: В app shell каждый persistent факт должен иметь одного владельца. Rail владеет текущим разделом, active campaign и primary nav; Settings владеет provider/model routing; Home владеет next playable step and campaign launch. Если элемент не добавляет нового решения или действия на текущем экране, это дубль и его нужно убрать.

## 2026-05-02: Wide-screen UI needs readable lanes and distinct nav hierarchy

**Контекст**: В WorldForge-v4 Settings одновременно показывал app rail и второй вертикальный Settings rail, из-за чего два соседних блока читались как конкурирующие site menus. На 2K Play и Worldgen смысловые элементы разъезжались к краям экрана, а stage layer выглядел как пустой тёмный прямоугольник поверх фона.

**Ошибка**: Я оценивал макет на уровне отдельных компонентов, но не проверил композицию на широком пользовательском viewport. Вертикальная локальная навигация рядом с глобальной навигацией без другой визуальной роли создаёт ощущение слепленных панелей, а не иерархии.

**Правило**: Для WorldForge wide-screen layouts держать рабочие области в centered readable lanes. Глобальный rail и локальная навигация должны иметь разный визуальный язык: rail для приложения, tabs/subnav для текущего экрана. Stage/background области не должны быть пустыми декоративными блоками; если слой видим, он должен явно играть роль сцены, props, sprites, signal или atmosphere.

## 2026-05-02: Process state is not a third app rail

**Контекст**: В Worldgen прототипе `Stages` стоял отдельной вертикальной колонкой между глобальным rail и контентом. Пользователь справедливо назвал это всратым отростком: визуально это выглядело как третий сайдбар, хотя по смыслу это progress текущего forge-run.

**Ошибка**: Я оформил временное состояние процесса как навигационную структуру. Это конкурирует с app rail, ломает композицию и делает страницу собранной из боковых панелей, а не из одного рабочего surface.

**Правило**: Pipeline/progress state должен жить внутри surface, к которому относится: header strip, timeline band, inline stepper или compact status module. Нельзя ставить process state отдельным vertical rail рядом с global navigation, если это не самостоятельный режим навигации по продукту.

## 2026-05-03: Phase plans must encode review corrections before execute

**Контекст**: После Phase 77 design review несколько внешних ревьюеров нашли одни и те же риски: монолитный `GamePage`, неполный stage overlay contract, Playwright/PinchTab mismatch, fake UI states, and wide-screen empty space. Пользователь отдельно подчеркнул, что фиксы нельзя возвращать кусками и нельзя тащить в execute неутвержденные или выдуманные UI contracts.

**Ошибка**: Если оставить review notes отдельными артефактами, execution agents могут прочитать старые планы и снова реализовать уже найденные ошибки. Это превращает review в декоративный этап.

**Правило**: Перед `execute` по UI/GSD фазе все blocking review findings должны быть внесены прямо в `PLAN.md`, `UI-SPEC.md`, `VALIDATION.md` и phase context. Review summary alone is not enough. Любой visible UI control/status в плане должен быть либо real/current, либо явно target with implementation owner; otherwise remove it from the execution contract.

## 2026-05-03: Backend is the rulebook, not the GM

**Контекст**: При разборе turn orchestration пользователь уточнил архитектурную границу: WorldForge вдохновляется GM-flow Marinara, но не копирует его. LLM/GM должен понимать raw player prose, выбирать честный путь хода и просить backend о конкретных инструментах/rolls. Backend остаётся deterministic rulebook/world truth: state, IDs, legal actions, random roll service, validation, persistence, rollback, invariants.

**Ошибка**: Ранее в runtime появились backend seams, которые пытались заранее вывести `intent`, target, hostility/combat context или action category из пользовательского текста. Это выглядит надёжно, но на деле превращает regex/heuristics в плохого GM и ломает живую интерпретацию.

**Правило**: В gameplay turn path backend не должен семантически трактовать произвольный player prose. Он собирает нейтральный scene packet и предоставляет валидные affordances; GM/Judge интерпретирует действие и выбирает path (`direct`, `continue`, `clarification`, `roll_oracle`, `tool_plan`, `combat_transition`). Backend исполняет только конкретные GM-selected refs/tools/roll requests и обязан reject/rollback всё, что нарушает rulebook.

## 2026-05-03: Strange tool calls are context failures before validation failures

**Контекст**: В кампании `0ca0dc4e-cc7e-44e3-8099-0820d3b9494b` GM заспавнил service NPC для Shibuya kissaten в `Okutama Safe Zone - Forest Outpost`. Backend должен был отклонить невозможную географию, но пользователь справедливо указал, что главный вопрос глубже: почему модель вообще решила, что такой tool-call уместен.

**Ошибка**: Я сначала сформулировал проблему как backend-validation gap. Это неполно: если модель выбирает чужую локацию, нужно проверять data flow, salience, prompt contract, allowed candidates, tool argument shape, and local-vs-background context boundaries. Guardrails чинят последствия; хороший context packet предотвращает большую часть странных вызовов.

**Правило**: При расследовании плохого GM/tool behavior начинать с "что модель видела и почему этот выбор стал вероятным": local scene packet, recent events, background simulation leaks, candidate lists, tool schema, prompt examples, and naming collisions. Backend validation остаётся обязательной, но план фикса должен включать context/prompt/tool-contract correction, not only reject/repair.

## 2026-05-03: External agent silence at 120s is not failure

**Контекст**: Во время фазового GSD/agent workflow я трактовал короткое ожидание ответа от внешнего агента/CLI как достаточный сигнал, что он завис или не вернул полезный результат.

**Ошибка**: Для Claude Code, Gemini, Cursor Agent, OpenCode и внутренних subagents 120 секунд часто меньше нормального времени глубокого ревью или исполнения. Делать вывод по такому окну значит либо быть нетерпеливым, либо неправильно запустить/наблюдать процесс.

**Правило**: Если агенту или внешнему AI CLI выдана фазовая задача, не объявлять провал по 120 секундам. Проверить, что команда запущена корректно, затем ждать полноценного завершения или явного terminal/provider error. Не прерывать агентов, если пользователь не попросил остановить.

## 2026-05-03: Do not cap turn duration to fix waiting UI

**Контекст**: В live playtest `/game` я увидел долгий `Settling` и добавил 60/90s timeout ceilings вокруг GM planning stages, хотя пользователь не просил ограничивать длительность хода. Для WorldForge один ход может легитимно занимать несколько минут, потому что он проходит через forecast, GM decision, beat plan, tools, validation, narration and persistence.

**Ошибка**: Я спутал UX-проблему ожидания с backend-проблемой длительности reasoning. Таймауты ухудшают качество и могут обрывать нормальный глубокий ход. Факт долгого ожидания сам по себе не равен зависанию, пока нет provider/terminal error или доказательства, что pipeline перестал прогрессировать.

**Правило**: Не добавлять duration caps на gameplay turn thinking без явного product decision от пользователя. Если UI выглядит застывшим, чинить visibility: stage-aware loader/progress events, logs, cancel/retry semantics, and clear “still thinking” state. От длительности хода отстать; quality-first turns are allowed to be slow.

## 2026-05-03: Safety must come from clear GM tasks and backend rulebook boundaries

**Контекст**: После попыток исправить Forest Outpost/context leaks runtime начал перегружать модель большими structured contracts вроде `gm-beat-plan`: много advisory полей, enum-ов и nested shapes, которые валили ход, хотя модель понимала сцену и пыталась вести её как GM.

**Ошибка**: Я принял "затянуть схему" за настоящее исправление. Но если модель получает перегруженную, плохо объяснённую задачу и вынуждена заполнять бюрократический JSON для неисполняемых advisory вещей, это не делает её лучшим GM. Это маскирует плохой prompt/data-flow и переносит хрупкость в Zod validation.

**Правило**: WorldForge turn architecture должна держать простую границу: модель является GM и получает ясную последовательную задачу с достаточным, релевантным world state; backend является rulebook/API и исполняет только конкретные tool requests через validation, invariants, persistence and rollback. Строгие схемы нужны на executable boundaries: tool calls, refs, rolls, state mutations. Advisory planning/narration должны быть короткими, понятными, tolerant, or split into smaller sequential calls. Не заставлять GM писать огромные портянки полей, которые backend может вывести сам.

## 2026-05-03: Marinara is inspiration, not the target architecture

**Контекст**: Пользователь уточнил, что WorldForge не должен становиться клоном Marinara. Цель не в полном доверии LLM, а в играбельной системе, где LLM получает свободу вести сцену, а backend умнее и строже защищает world truth.

**Ошибка**: Сравнение с Marinara легко уводит в ложную бинарность: либо agentic freedom, либо deterministic backend. Для WorldForge правильная цель третья: playable GM freedom inside a controlled rulebook.

**Правило**: Не копировать чужой engine-flow как архитектурный ответ. Использовать Marinara только как напоминание, что игра должна играться; сохранять WorldForge boundary: LLM interprets/GM-plans/narrates, backend validates executable refs/tools/state and preserves invariants.

## 2026-05-04: Player action text is a request, not settled truth

**Контекст**: В Phase 81 live gate игрок написал, что берёт registry token and moves on, хотя предыдущий ход не выдал token и inventory его не содержал. Финальная narration приняла claim из raw player action как уже случившийся факт.

**Ошибка**: Даже если backend держит inventory correctly, final narrator can still corrupt perceived canon if the prompt treats player prose as authoritative. This is especially dangerous for possessions, consent, access, location, damage, and item acquisition.

**Правило**: В final narration prompt raw player action must be framed as attempted request only. Narrate possession/access/acquisition/consent/completed movement only when committed events, settled packet effects, tool results, or DB state confirm it. Add live negative tests for "I take/use X from my pocket" claims after any GM/narrator handoff change.

## 2026-05-04: Committed event logs are world truth, not harmless prose

**Контекст**: Phase 81 live verifier found that narration correctly denied a fake Registry Vault master key, but `log_event` had still persisted "Iria uses the Registry Vault master key..." into `location_recent_events` and LanceDB episodic memory.

**Ошибка**: I treated final narration grounding as sufficient. It was not. A false durable event is just as dangerous as false visible narration because future prompts ingest it as settled local/world memory.

**Правило**: Any player-turn durable memory or tag writer must be validated like a state mutation. If it claims possession, access, item use, transfer, location entry, or completed movement, it needs concrete backend tool/state evidence or must stay scene-local/attempted/failed. Live verification must scan DB/vector committed event stores, tags, and turn-boundary snapshots, not only chat text and inventory.

## 2026-05-05: Narrator packets must be coherent and concrete, not just validated

**Контекст**: Phase 82 live gate had `/world` showing `Gondolier` at `Lantern-Lit Gondola Pier`, but the model-facing `SceneFrame` saw only the player. After fixing that, final narration still received a contradictory `[PRESENT ACTORS] No other present actors...` block and later a concrete `log_event` was collapsed into `Committed log_event result <uuid>`.

**Ошибка**: I checked individual components as valid, but not whether the full model-facing packet told one coherent playable truth. A prompt can be schema-valid while still saying "NPC exists" in one section and "no NPC exists" in another, or preserving a world fact in DB while starving the visible narrator of the actual fact text.

**Правило**: For gameplay fixes, verify the complete model-facing prompt/packet after live tool execution. UI presence, SceneFrame, NarratorPacket visible actors, `[PRESENT ACTORS]`, settled effects, and chat history must agree. Successful player-facing tool results need concrete summaries in the narrator packet; UUID/action-result filler is not playable evidence.

## 2026-05-05: Autonomous work still needs visible GSD state

**Контекст**: После Phase 82 пользователь ожидал автономное выполнение следующих gameplay/AI/tooling задач, но увидел в основном аварийные фиксы и playtest-логи без понятного GSD progress trail. Это создало ощущение, что фазы записываются или обходятся, а не реально исполняются.

**Ошибка**: I treated emergency stabilization as enough forward motion and stopped making the GSD engine visible: what scope is active, what is intentionally deferred, what verification proves, and what remains unimplemented. Autonomous does not mean invisible or phase-less.

**Правило**: For any non-trivial autonomous gameplay work, keep a short explicit GSD state in artifacts and user updates: active scope, not-in-scope, implementation completed, verification running, remaining concrete work. If switching to emergency stabilization, say so and do not imply the larger phase is complete.

## 2026-05-05: Fallbacks are not gameplay fixes

**Контекст**: During live GM turn stabilization I proposed letting a failed GM Action Checklist or forecast stage continue as a no-mutation narration fallback. Пользователь correctly compared this to disabling shooting in a shooter when ammo mechanics fail.

**Ошибка**: A fallback that bypasses a core gameplay mechanic can make the request "not crash", but it also hides that the intended mechanic is broken. For WorldForge, GM forecast, decision, checklist, and tool execution are gameplay, not optional decoration.

**Правило**: Do not replace broken core gameplay stages with silent fallback paths. Fix the schema, prompt, tool contract, parser, or state packet so the intended stage succeeds. If a core stage cannot run, fail visibly during verification and keep working on the root cause.

## 2026-05-05: Do not disable GM tools to hide misuse

**Контекст**: После live gate я временно убрал `spawn_item` from default player-turn tools, because the GM could create items too freely. Пользователь справедливо указал, что "GM спавнит предметы как попало" требует анализа и фикса, а не выключения инструмента.

**Ошибка**: Disabling a core GM affordance reduces visible bad behavior but also removes the tool the GM needs for legitimate playable outcomes. It treats symptom frequency as correctness.

**Правило**: If a GM tool is misused, keep the tool available and fix the agentic contract: prompt order, tool schema descriptions, grounded refs, backend validation, runtime observations, semantic budgets, and regression tests. Only remove a tool from allowedTools when the game design explicitly says the player-turn GM must not have that capability.

## 2026-05-05: Guards are not substitutes for GM intent

**Контекст**: A false-key live branch showed the GM asking Oracle whether a claimed master key existed and then using access/item tools to make that success real. I added a runtime guard against unconfirmed access claims, but the user correctly pointed out that the deeper bug is the GM choosing the wrong interpretation in the first place.

**Ошибка**: A backend guard can reject illegal consequences, but it does not teach the GM what kind of scene beat it is handling. If the model treats "I claim I already have X" as an existence test instead of a bluff/social/access challenge, the system is still aiming the GM at the wrong job.

**Правило**: Fix root intent before outcome guards. For false possession/access claims, GM Read should classify the action as claim/bluff/request/attempt, Oracle should evaluate social credibility or visible physical attempt only, and tool planning should mutate only confirmed state. Backend guards remain as rulebook invariants, not the main playability fix.

## 2026-05-05: Full visual migration requires page-by-page 2K parity checks

**Контекст**: During the WorldForge V4 migration I improved the launcher enough that it no longer looked like the first flat dashboard screenshot, but the user pointed out that it was still far from the reference at 2K scale and that other pages could have the same issue.

**Ошибка**: I treated the most visible page as representative and let automated no-overflow/no-mock checks stand in for a full visual comparison. That misses composition problems: scale, glow, theatrical spacing, panel placement, and whether every route carries the same reference language.

**Правило**: For "full visual migration", run a page-by-page 2K visual pass before closeout. Compare every real route against the reference's design function: scale, light, hierarchy, density, transitions, and real-flow continuity. Automated checks prove usability, not visual completeness.

## 2026-05-05: Visual parity needs semantic UI assertions, not user screenshot triage

**Контекст**: Пользователь несколько раз ловил глазами, что home still showed campaign-dashboard semantics, weak glow, wrong buttons, and generic bottom cards, even after code/tests were green.

**Ошибка**: I verified route render and screenshots after the fact, but did not encode the expected visual/semantic contract into tests. That forced the user to become the visual regression system.

**Правило**: When a UI reference is the target, add focused assertions for the reference's functional design language: route state labels, real-data hero source, CTA placement, sticky rails, key classes, and absence of known mock-only/status placeholders. Then run Playwright 2K screenshots and inspect them before asking for user review.

## 2026-05-05: Restyling old layouts is not a visual migration

**Контекст**: On World Review I kept the old scaffold editor layout visible and only applied V4 typography, glow, centering, and tabs. The user correctly called this out as the old frontend wearing new styles, not a transfer from `docs/WorldForge-v4/index.html`.

**Ошибка**: I treated CSS parity as enough while the page structure still contradicted the reference. A full visual transfer means the visible layout, density, tab content, panel composition, and interaction path must come from the mock, then be bound to real data.

**Правило**: For reference-driven UI work, first copy the reference structure and exact numeric CSS values for every visible state. Only after the visible page matches the mock should legacy editors/forms be placed behind explicit edit actions or redesigned to the same structure.

## 2026-05-05: Component library defaults can silently break reference spacing

**Контекст**: The review tabs used V4 numeric padding, but the shared `TabsTrigger` still contributed its own `gap-1.5`, active `after:inset-x-0`, and line styling. This made label/count spacing, underline length, and underline weight differ from the mock even though the page CSS looked close.

**Ошибка**: I compared only my added `.wf-review-*` rules and missed inherited utility classes from the reusable component. Reference parity needs computed styles, not just source CSS.

**Правило**: When binding a reference design onto shared UI primitives, inspect computed styles for the actual rendered element and override inherited primitive utilities explicitly. Visual tests must assert the computed gap, underline right inset, opacity/color/height, and absence of extra labels.

## 2026-05-05: Reference separators and scroll containers need explicit geometry checks

**Контекст**: After fixing review tab typography, the user caught two layout regressions by eye: the tab separator line was clipped left/right because the border lived on a padded tablist, and a stray scrollbar appeared around the button/tab area.

**Ошибка**: I asserted tab width and page overflow, but not where the separator line starts, whether content padding is applied to the line or to the buttons, or whether the route has nested scroll containers.

**Правило**: For V4 parity, check separator geometry separately from content gutters. Full-width rules stay on unpadded rails; text/buttons get their own inset. On fixed-height app screens, assert the intended scroll owner and fail tests when a parent scroll container appears.

## 2026-05-05: Mock-only review concepts must not ship without backend data

**Контекст**: The V4 mock had `issues` as a future review concept, so I wired a frontend-only issue detector into World Review. The user correctly pointed out that this creates fake product surface because issues do not currently exist as backend data.

**Ошибка**: I treated a prototype affordance as a real feature instead of checking whether the app has a persisted backend source for it. That made the UI imply a system capability the product does not actually have.

**Правило**: During visual migration, copy layout and style, not fake domain entities. If a mock element has no real backend route/state, remove it from visible UI or gate it behind the real feature implementation. Visual tests should assert absence of known mock-only labels until the backend source exists.

## 2026-05-05: Access-claim wording is broader than "I claim"

**Контекст**: Phase 84 live gate failed when the player wrote "I use the Registry Vault master key I definitely have..." because the old detector only treated explicit verbs like `claim`/`bluff` as unconfirmed access-proof claims. GM Read then invented `location:restricted-canal-office` as a target ref and the turn errored.

**Ошибка**: I fixed the obvious "I claim I have X" form but missed natural player phrasing where the claimed proof appears as confident possession in the middle of an attempted access action.

**Правило**: For possession/access proof claims, detect the semantic pattern, not only the word `claim`: claimed key/permit/pass/credential/authority + restricted access attempt + confident or restricted-context wording. Then prompt and repair the GM toward visible challenge/social pressure using listed refs only.

## 2026-05-06: Separate hypotheses from verified worldgen causes

**Контекст**: While investigating Naruto x JJK generation drift, I stated that the no-DNA route was using a different backend research brain before proving it from the actual prompt/log path.

**Ошибка**: I promoted a plausible code-path hypothesis into an explanation too early. For AI generation bugs, code shape is only suspicion until matched against persisted campaign config, route payload, prompt dumps/logs, and generated artifacts.

**Правило**: For worldgen/LLM behavior regressions, label unverified route theories as hypotheses. Verify with persisted config, request payload, prompt/log evidence, and generation output before proposing a fix.

## 2026-05-06: Fresh draft resets must not erase reusable library data

**Контекст**: The New Campaign route sometimes showed only `Open Library` and `Import worldbook JSON` even though the backend library endpoint returned saved reusable worldbooks.

**Ошибка**: `resetFlow()` treated the reusable worldbook shelf as draft state. A fresh-start event could clear the loaded frontend list while the route stayed mounted, and the library reload only happened on the initial open/mount path.

**Правило**: Separate persistent app/library state from per-draft selections. Fresh-start/reset handlers should clear selected sources and campaign fields, but keep or explicitly reload reusable shelves that come from disk/backend.

## 2026-05-06: Generated DNA is a forge artifact, not a restyled form

**Контекст**: The ready World DNA route looked better than the old UI, but it was still structurally the old six-textarea form with V4 colors and non-reference toggle widgets.

**Ошибка**: I preserved the legacy page skeleton after the DNA had already become a generated artifact in the flow. That makes the result feel like a reskin instead of a V4 step between concept and world generation.

**Правило**: When a generated intermediate artifact becomes visible, render it with the same structural language as the reference pipeline: stage rail, artifact cards, real context panel, and lane-aligned actions. Keep edit controls, but integrate them into the artifact card instead of importing unrelated form/toggle patterns.

## 2026-05-06: Live generation progress needs one visible owner

**Контекст**: The worldgen screen repeated the same backend progress in the headline, top stage rail, a generation-stage card grid, the engine panel, and engine trace. Long dynamic substep text also wrapped inside the top rail and made the page jump.

**Ошибка**: I treated every progress surface as a place for live backend detail. That made the UI noisy and fragile: one route could say "generating factions" while another card still implied "characters", and dynamic text controlled layout height.

**Правило**: For generation/loading orchestration screens, separate stable structure from live detail. The rail shows fixed macro stages; the active engine panel owns the current backend substep; diagnostics stay collapsed by default. Visual smoke must assert stable rail height, fixed progress geometry, and absence of duplicated progress sections.

## 2026-05-06: Review surfaces must expose real inspection and creation paths

**Контекст**: World Review cast visually resembled the V4 mock, but selecting an NPC only showed a thin summary and the Cast tab lacked the existing Create NPC/editor flow. Locations also looked like inert rows that reacted as if clickable.

**Ошибка**: I optimized the first-screen look and missed the user's actual review job: inspect generated world entities, understand a selected character deeply, and add/fix missing cast without leaving the flow.

**Правило**: For review/inspection pages, every major entity tab needs enough real data for decisions plus a visible route to the real edit/create workflow. If a row is not interactive, do not give it a hover affordance unless it has an action.

## 2026-05-06: Tab state bugs live in the first frame after click

**Контекст**: World Review tabs looked correct after settling, but the active underline briefly stayed on the previous tab or vanished on Cast/Locations/Factions because the shared tab primitive still animated pseudo-element opacity.

**Ошибка**: I trusted the settled screenshot and missed the transition frame the user actually sees while switching tabs. A 120ms fade is enough to make the navigation feel broken when the reference expects a crisp editorial rule.

**Правило**: For tab/navigation parity, test the immediate post-click computed state, not only the final screenshot. Active/inactive pseudo-elements must assert opacity, transition, height, color, and inset right after interaction.

## 2026-05-07: Do not confuse monitor cleanup with process control

**Контекст**: During Phase 86 overnight playtesting I deleted the heartbeat automation because it had become a cron pinging this thread, while the real PowerShell playtest process was still running. The user immediately worried that I may have stopped the active run.

**Ошибка**: I performed cleanup on the monitor mechanism without first clearly separating it from the worker process. Even when the underlying action is safe, ambiguity around a long-running run creates unnecessary anxiety and can look like I killed work in progress.

**Правило**: Before changing monitoring/automation around a long-running job, explicitly state what will and will not be touched. Verify the worker PID before and after cleanup, and record that distinction in the task ledger.

## 2026-05-07: Do not turn GM path failures into hidden backend path choices

**Контекст**: A live Phase 87 rerun showed GM Read repair still returning `direct` with future-relevant pressure. I started adding backend auto-promotion from no-mutation paths into `tool_plan`.

**Ошибка**: That fixed the symptom by letting backend choose for the GM after the model failed the semantic task. It risks hiding bad prompting and makes the system feel like backend gameplay glue instead of an agentic GM bounded by rules.

**Правило**: Backend guards may reject, diagnose, and fail closed, but they must not secretly author GM intent unless the rule is purely deterministic. For prompt/schema failures, fix the model-facing contract and repair instructions first, then prove the model chooses the correct path or fails loudly.

## 2026-05-07: Exhaustive playtests need focused rerun profiles before marathon scope

**Контекст**: Phase 86 overnight testing tried to cover too much at once and stopped after a backend `ECONNREFUSED`. The user asked to narrow scope to the parts still under repair and make the harness resilient.

**Ошибка**: I treated "exhaustive" as one huge matrix instead of separating smoke, focused defect rerun, and deep overnight confidence passes. That made infrastructure noise expensive and slowed gameplay feedback.

**Правило**: Long playtest matrices must have named profiles. Smoke proves the harness and servers, focused rerun covers accepted defect surfaces, and deep/full runs happen only after smoke/focused pass. A single route connection failure should be logged as an infrastructure finding and the remaining selected matrix should continue.

## 2026-05-07: Code prose heuristics are smoke signals only

**Контекст**: During Phase 87 playtest scoring, I described soft prose findings as if the code harness could judge writing quality. The user correctly pointed out that code can mostly catch empty text, leaks, formatting breaks, and obvious stock phrases like repeated "most people" or "ozone".

**Ошибка**: I let a mechanical score sound like an aesthetic verdict. Pattern checks can flag suspicious symptoms, but they cannot decide whether the narration is vivid, playable, in-character, or satisfying.

**Правило**: Treat code-based prose checks as smoke signals and routing aids. Real prose/playfeel review needs LLM or human read-through with examples, setting fit, agency, causality, and style adherence called out explicitly.

## 2026-05-07: Do not silently clip GM reasoning fields

**Контекст**: A Phase 87 smoke failure had real GM Read reasoning and useful JSON, but Zod rejected overlong advisory fields. I first patched the schema preprocessor to clip text and arrays before validation.

**Ошибка**: Silent clipping can amputate the model's intent and hide schema pressure. It is especially unsafe for refs, actors, and target arrays because dropping entries changes the GM decision without telling anyone.

**Правило**: For LLM contract overrun failures, inspect reasoning/output usage and validation paths first. Prefer right-sized schema caps, clearer repair instructions, or explicit post-parse presentation trimming over silent semantic clipping. Never silently drop refs or actors.

## 2026-05-07: Continue the worker, not the monitor

**Контекст**: After Phase 86 heartbeat pings and Phase 87 rerun setup, the user had to ask why work stopped while gameplay fixes were still open.

**Ошибка**: I let status/monitor handling become the visible activity and did not immediately carry the next actionable failure through to implementation and rerun proof.

**Правило**: When a run produces actionable failures, proceed from evidence to root fix to rerun in the same work loop. Status summaries are checkpoints, not stopping points.

## 2026-05-07: Full architecture phases cannot shrink into MVP scope

**Контекст**: During Phase 88 planning the user explicitly reminded that the result must be a full living-world implementation, even if it takes several phases, not a half-step.

**Ошибка**: The risk on large architecture work is to silently reduce the target into "first useful slice" and then present the slice as the product goal.

**Правило**: For architecture phases marked full-scope, keep the product target and acceptance gates intact. If the work is too large, split scheduling into follow-up phases, but never downgrade the promised behavior, tests, or invariants.

## 2026-05-07: Session-owned code does not need theatrical preservation

**Контекст**: During Phase 88 execution I kept treating dirty working-tree code as potentially foreign, even though the user clarified that all code changes currently in the repo were made by this agent workstream.

**Ошибка**: Over-preserving "maybe чужое" code in a fully agent-owned session can slow cleanup and make integration look more fragile than it is.

**Правило**: Still inspect diffs before staging, but when the user explicitly says the current code changes are ours, own the tree: fix, integrate, stage, and commit the coherent set instead of narrating around imaginary foreign edits.

## 2026-05-08: Prove live servers are running the current tree

**Контекст**: During the Phase 88 live e2e gate I reused listeners on ports 3000/3001 and later found both frontend and backend were still processes from 2026-05-07. The run could not prove today's code.

**Ошибка**: I treated "port responds" as "fresh code is running". For backend TypeScript dev servers especially, an old node process can keep serving stale implementation while verification looks legitimate.

**Правило**: Before any live/e2e verification claim, record listener PIDs, command lines, and creation times, or restart the servers from the current workspace and then verify those fields. If a live test uses stale listeners, invalidate that run.

## 2026-05-08: Separate model thinking from action submission failure

**Контекст**: A Phase 88 live smoke sat for more than 2600 seconds with `submitted=false`, `assistant=false`, and `spinner=false`. The UI was idle and the action never reached chat history, but the harness kept logging it as a running turn.

**Ошибка**: I let the harness collapse "model may still be thinking" and "the player action was never submitted" into the same wait loop. That creates fake long model latency and hides the actionable failure.

**Правило**: Live playtest harnesses must fail fast on non-submission once the UI is idle, while preserving unbounded waits only for real submitted model turns. Logs must show `submitted`, assistant presence, and spinner state so this distinction remains obvious.

## 2026-05-08: Names are source-scoped facts, not globally safe strings

**Контекст**: While replacing final-narration private-term word bans with source-boundary validation, I almost framed actor/location names as inherently public when the real rule is contextual.

**Ошибка**: A name can itself be private if it comes from an offscreen conversation, NPC-only knowledge, hidden faction plan, or any source the player cannot perceive. Conversely, the same string can be allowed as a raw player claim without becoming authoritative truth.

**Правило**: Never whitelist names globally. Validate source visibility: player-supplied text is a claim, player-visible sources are context, private/offscreen/NPC-only sources remain blocked. Backend guards source access; LLM handles meaning inside the source-bounded packet.

## 2026-05-08: Player-claim echoes need provenance, not name whitelists

**Контекст**: A live false-claim turn failed after the player named a private/canon authority. The GM correctly treated it as a claim, but a later action-result effect repeated the name and the packet guard saw it as authoritative private text.

**Ошибка**: Letting any player-mentioned name through would leak private facts. Blocking every later echo would make normal spoken claims impossible. The missing concept was "this text is still a report of the player's claim", not "this name is safe".

**Правило**: Permit exact private-name echoes only when they are source-chained to the raw player action and explicitly remain claim/report/bluff text. Keep hard failures for the same name in ordinary effects, hidden/offscreen sources, actor labels, guardrails, scene facts, or any text that asserts the name as real state.

## 2026-05-08: Live playtests must not silently reuse old campaigns

**Контекст**: The Phase 88 live smoke still targeted old fixed campaign ids after the user asked for fresh campaigns and varied playtest data.

**Ошибка**: Reusing seeded campaigns makes live evidence look stable, but it can hide generation-route regressions and stale world state. It also makes "fresh code, fresh gameplay" claims weaker than they sound.

**Правило**: Live/e2e playtest harnesses should provision fresh campaigns by default and write the new ids into artifacts. Old ids are allowed only for deterministic fixtures or explicit `REUSE_EXISTING` regression runs, and the artifact must say which path was used.

## 2026-05-08: Character-source claims need artifact proof

**Контекст**: The user allowed pulling characters from `X:\Models\Chars` while asking to recreate old playtest campaigns.

**Ошибка**: Passing a character directory env var is not the same thing as proving the run imported a real card. A smoke can still use `playerSource: parse-concept` while the env is present.

**Правило**: When a playtest claims external character-card coverage, record the exact card path and artifact `playerSource`. If the run only supplied the directory but did not import a card, say that explicitly and leave card-import coverage as a follow-up gate.

## 2026-05-08: Do not let adjacent import coverage block gameplay gates

**Контекст**: During Phase 88 final verification I started treating external character-card import as an open blocker after the user clarified the actual scope is long-distance gameplay and living-world behavior.

**Ошибка**: Adjacent coverage can be useful, but pulling it into a phase gate dilutes the proof. The user asked whether the game plays normally over time, not whether every optional source/import path is covered.

**Правило**: Phase closeout gates must match the stated product risk. If the user de-scopes an adjacent concern, move it to follow-up notes and finish the core gameplay proof first.

## 2026-05-08: Validate the harness before overnight live runs

**Контекст**: Before an overnight Phase 88 live run, the user explicitly asked to check the whole harness so it would not fall over every half hour.

**Ошибка**: Launching long live tests without first proving route definitions, retry behavior, artifact writing, and idle-submit detection makes failures ambiguous: a red run might be gameplay, provider, UI, or harness.

**Правило**: Before any long unattended live playtest, run deterministic deep preflight, verify current server health, confirm artifact writing, and add explicit guards for non-model runner failures. Preserve unbounded waits only for real submitted model turns.

## 2026-05-09: Do not over-poll live model turns

**Контекст**: During Phase 88 focused live verification I started checking the background run too frequently right after launch.

**Ошибка**: Fast polling makes a healthy long-running LLM turn look suspicious and tempts premature intervention. Once action submission is proven and the model is actually working, the correct move is to let it run.

**Правило**: After live harness/server preflight, poll at meaningful intervals. Use short checks only for submit/idleness failures; once a real model turn is in progress, give it at least several minutes before inspecting again unless the process exits.

## 2026-05-09: Do not pay worldgen cost when testing gameplay distance

**Контекст**: During Phase 88 live verification, the user pointed out that the gate is testing turn quality, living-world mutation, privacy boundaries, and narrator behavior, not campaign generation itself.

**Ошибка**: Recreating fresh worlds for every rerun makes tests slower, more expensive, and noisier. It also turns a gameplay regression run into a mixed worldgen+gameplay run.

**Правило**: For gameplay-distance reruns, generate or choose a few fresh baseline campaigns once, then clone their campaign DB/directories into an isolated pool and run routes against untouched clones. Reserve fresh worldgen for worldgen-specific gates.

## 2026-05-09: README is a showcase before it is a technical inventory

**Контекст**: After refreshing the README, the user called out that it read like a technical sheet explaining internal ideas instead of a repository showcase.

**Ошибка**: I led with runtime vocabulary and architectural internals. That may be accurate, but it fails readers who first need to understand the fantasy, the product, and why the project is interesting.

**Правило**: Public README updates must start with the human pitch, screenshots, what the app feels like, and plain-language explanations. Put GM/runtime/provider details below the showcase layer, and explain unavoidable jargon the first time it appears.

## 2026-05-09: Public README must not expose internal process machinery

**Контекст**: After the showcase rewrite, the user clarified that references to Phase 88, GSD, proof gates, internal test counts, and workflow process do not belong in a public README.

**Ошибка**: I treated internal confidence evidence as useful public credibility. For outside readers, it reads like project plumbing and distracts from the product.

**Правило**: Keep public README content audience-facing: product, screenshots, capabilities, setup, broad architecture. Omit phase numbers, GSD workflow, internal proof gates, local evidence paths, squash policy, and detailed verification ledgers unless the user explicitly asks for contributor/process docs.

## 2026-05-09: GitHub Wiki audience is not automatically technical

**Контекст**: The user asked for a GitHub wiki that people can open and read to understand WorldForge, then corrected that it should be for non-power users.

**Ошибка**: I defaulted to an implementation map: routes, files, storage layers, symbols, and developer workflows. That is useful for contributors, but wrong for a general product wiki.

**Правило**: Before writing public wiki/docs, identify the reader. For non-power users, lead with what the app is, how to start, what choices mean, what the world will/won't do, and gentle troubleshooting. Keep file paths, internals, and architecture out unless clearly requested.

## 2026-05-09: Plain-language internals are still internals

**Контекст**: After I swung the wiki toward a beginner player guide, the user clarified they wanted a capability map and under-the-hood explanation, just not written for power users.

**Ошибка**: I treated "not technical" as "avoid inner workings." The real target was "explain inner workings in ordinary language": world creation, player turn processing, memory, factions, NPCs, and consequences.

**Правило**: For public product wiki requests, separate "developer implementation detail" from "user-facing mental model." Include how systems work conceptually, but avoid file paths, route names, symbols, test harnesses, and contributor workflow unless explicitly requested.

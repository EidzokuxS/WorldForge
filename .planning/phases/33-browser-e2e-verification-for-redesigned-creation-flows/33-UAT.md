---
status: diagnosed
phase: 33-browser-e2e-verification-for-redesigned-creation-flows
source:
  - 33-01-SUMMARY.md
  - 33-02-SUMMARY.md
  - 33-03-SUMMARY.md
  - 33-04-SUMMARY.md
started: 2026-04-01T18:40:00Z
updated: 2026-04-01T19:02:00Z
---

## Current Test

[testing paused — 4 items outstanding]

## Tests

### 1. Launcher Shell And Canonical Navigation
expected: Opening the app at `/` should show the redesigned non-game shell, with the launcher inside it and working navigation to `/campaign/new`, `/settings`, and `/library`. The old `/character-creation` and `/world-review` routes should no longer open the old pages.
result: issue
reported: "Это даже почти хорошо, но почему так всрато визуально...? Скругления разные, левый сайдбар квадратный, цвета перемешаны, всё невпопад."
severity: cosmetic

### 2. Original-World Campaign Creation Flow
expected: Creating an original-world campaign through the redesigned creation flow should carry you from concept to DNA to world generation and then into world review without broken states or dead buttons.
result: issue
reported: "Можно нажать на World Review и Character до выбора\\генерации мира. Переход из вкладк во вкладку стирает то, что я ввел на вкладке New Campaign. Копанию сейчас загружает нажатие на любую часть карточки, а не только load. Я ввел название, франшизу и описание того, что хочу получить, нажал \"продолжить\". Меня перекинуло в World DNA. Лоадера нет. Пишет \"Предложения по DNA еще не готовы\". Лоадера нет, переход на любую другую страницу, а затем возвращение в New Campaign - у тебя снова поле ввода названия, описания и прочего. То бишь цикл с самого начала. Снизу везде зачем-то есть этот \"creation flow\" с кнопкой который дублирует переход на вкладку новой компании. Я даже не уверен, что запрос на генерацию DNA вообще отправляется. Нажатие Generate New World вместо Continue to DNA отправляет запрос generate как будто, но я не вижу никакого уведомления о прогрессе или чем либо еще. Короче получилась полная хуйня. Я требую нормальной реализации с нормальным тестированием UI и UX, дальше тестировать невозможно, потому что базовый воркфлоу в говне."
severity: blocker

### 3. Known-IP Campaign Review Flow
expected: Creating a known-IP campaign should generate a populated review workspace where premise, locations, factions, NPCs, and lore all appear coherently inside the redesigned shell.
result: blocked
blocked_by: prior-phase
reason: "User reported that further testing is impossible until the base campaign creation workflow is fixed."

### 4. World Review Editing Persistence
expected: Editing world-review content such as a location, faction, NPC, or lore-related field should persist after save and still be there after reload.
result: blocked
blocked_by: prior-phase
reason: "User reported that further testing is impossible until the base campaign creation workflow is fixed."

### 5. Character Creation Parse And Game Handoff
expected: From review, the character creation workspace should let you parse a described character, edit the draft, save it, and then hand off cleanly into `/game` without the non-game shell wrapping the game page.
result: blocked
blocked_by: prior-phase
reason: "User reported that further testing is impossible until the base campaign creation workflow is fixed."

### 6. Character Modes And Start Conditions
expected: The redesigned character workspace should expose all intended creation modes and the Phase 30 seams such as persona/start-condition handling without obviously broken UI states.
result: blocked
blocked_by: prior-phase
reason: "User reported that further testing is impossible until the base campaign creation workflow is fixed."

## Summary

total: 6
passed: 0
issues: 2
pending: 0
skipped: 0
blocked: 4

## Gaps

- truth: "Opening the app at `/` should show the redesigned non-game shell, with the launcher inside it and working navigation to `/campaign/new`, `/settings`, and `/library`. The old `/character-creation` and `/world-review` routes should no longer open the old pages."
  status: failed
  reason: "User reported: Это даже почти хорошо, но почему так всрато визуально...? Скругления разные, левый сайдбар квадратный, цвета перемешаны, всё невпопад."
  severity: cosmetic
  test: 1
  root_cause: "The non-game shell was built from mismatched visual primitives instead of one shared shell token/primitives layer, so sidebar, cards, shell frame, and page panels all use conflicting radius and surface rules."
  artifacts:
    - path: "frontend/components/non-game-shell/app-shell.tsx"
      issue: "Hard-coded shell gradient and one-sided rounded-r-[32px] create asymmetry with the square left rail."
    - path: "frontend/components/ui/sidebar.tsx"
      issue: "Generic shadcn sidebar container provides a square outer rail with its own surface treatment."
    - path: "frontend/components/non-game-shell/app-sidebar.tsx"
      issue: "Inner sidebar card uses different radii/surface conventions from the outer shell."
    - path: "frontend/components/ui/card.tsx"
      issue: "Default card radius/surface diverges from shell-specific framing."
    - path: "frontend/app/(non-game)/page.tsx"
      issue: "Launcher composes ad hoc rounded panels rather than shared shell/workspace primitives."
    - path: "frontend/app/globals.css"
      issue: "Only generic theme tokens exist; there is no dedicated shell token contract for geometry/surfaces."
  missing:
    - "Introduce one non-game shell token/primitives layer for shell frame, sidebar, workspace cards, and inspector panels."
    - "Unify radius decisions across shell surfaces instead of mixing rounded-xl, rounded-2xl, rounded-3xl, and one-off pixel radii."
    - "Define dedicated shell surface/background tokens so sidebar and workspace cards do not mix unrelated color buckets."
  debug_session: ".planning/debug/phase-33-uat-gap-1-shell-visuals.md"

- truth: "Creating an original-world campaign through the redesigned creation flow should carry you from concept to DNA to world generation and then into world review without broken states or dead buttons."
  status: failed
  reason: "User reported: Можно нажать на World Review и Character до выбора\\генерации мира. Переход из вкладк во вкладку стирает то, что я ввел на вкладке New Campaign. Копанию сейчас загружает нажатие на любую часть карточки, а не только load. Я ввел название, франшизу и описание того, что хочу получить, нажал \"продолжить\". Меня перекинуло в World DNA. Лоадера нет. Пишет \"Предложения по DNA еще не готовы\". Лоадера нет, переход на любую другую страницу, а затем возвращение в New Campaign - у тебя снова поле ввода названия, описания и прочего. То бишь цикл с самого начала. Снизу везде зачем-то есть этот \"creation flow\" с кнопкой который дублирует переход на вкладку новой компании. Я даже не уверен, что запрос на генерацию DNA вообще отправляется. Нажатие Generate New World вместо Continue to DNA отправляет запрос generate как будто, но я не вижу никакого уведомления о прогрессе или чем либо еще. Короче получилась полная хуйня. Я требую нормальной реализации с нормальным тестированием UI и UX, дальше тестировать невозможно, потому что базовый воркфлоу в говне."
  severity: blocker
  test: 2
  root_cause: "The routed Phase 33 creation pages were split away from the original wizard orchestration, but they do not reuse its guarded handlers or persistence/readiness logic. Concept state lives only in route-local React state, Continue bypasses DNA suggestion startup, review/character routes are exposed without generationComplete gating, load cards bind load to the whole card, and generation progress is tracked but never rendered."
  artifacts:
    - path: "frontend/app/(non-game)/campaign/new/page.tsx"
      issue: "Continue uses a bare route push instead of the wizard DNA preload handler."
    - path: "frontend/components/campaign-new/flow-provider.tsx"
      issue: "Creation flow state is route-local useState with no durable persistence outside the subtree."
    - path: "frontend/components/campaign-new/concept-workspace.tsx"
      issue: "Concept UI exposes create/continue CTAs without rendering active generation progress."
    - path: "frontend/components/campaign-new/dna-workspace.tsx"
      issue: "DNA page falls into a dead 'suggestions are not ready yet' state when dnaState was never populated and does not surface world-generation progress."
    - path: "frontend/components/non-game-shell/app-sidebar.tsx"
      issue: "Review and Character links are exposed from URL shape rather than actual campaign readiness."
    - path: "frontend/components/non-game-shell/app-shell.tsx"
      issue: "Default sticky CTA redundantly routes back to /campaign/new as 'Open Creation Flow'."
    - path: "frontend/components/title/load-campaign-dialog.tsx"
      issue: "Whole-card click loads campaign instead of restricting load to the button."
    - path: "frontend/app/(non-game)/campaign/[id]/review/page.tsx"
      issue: "No generated-world readiness guard before loading review workspace."
    - path: "frontend/app/(non-game)/campaign/[id]/character/page.tsx"
      issue: "No generated-world readiness guard before loading character workspace."
    - path: "backend/src/routes/helpers.ts"
      issue: "Backend campaign guards only enforce active/loaded campaign, not generated-world readiness."
    - path: "backend/src/routes/campaigns.ts"
      issue: "World payload route serves loadable campaigns even when no real world has been generated yet."
  missing:
    - "Re-center the routed concept/DNA pages on the wizard's guarded handlers instead of raw route pushes."
    - "Persist creation flow state outside the /campaign/new subtree so leaving and returning does not wipe inputs."
    - "Gate review/character/sidebar navigation on generationComplete or actual world readiness."
    - "Restrict saved campaign loading to the explicit Load button."
    - "Render the existing DNA/world generation progress state in the routed UI."
    - "Remove redundant shell-level 'Open Creation Flow' CTA when sidebar already owns that navigation."
  debug_session: ".planning/debug/phase-33-uat-gap-2.md"

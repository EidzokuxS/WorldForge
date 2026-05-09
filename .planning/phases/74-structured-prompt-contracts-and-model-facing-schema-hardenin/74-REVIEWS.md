---
phase: 74
reviewers:
  - gemini
  - claude
  - opencode
  - cursor
reviewed_at: 2026-04-28T16:41:56Z
plans_reviewed:
  - 74-01-PLAN.md
  - 74-02-PLAN.md
  - 74-03-PLAN.md
  - 74-04-PLAN.md
  - 74-05-PLAN.md
  - 74-06-PLAN.md
  - 74-07-PLAN.md
notes:
  codex: skipped because the active runtime is Codex and GSD review requires independent reviewers
  coderabbit: missing from PATH
  qwen: missing from PATH
  gemini: default model capacity failed; review used gemini-2.5-flash fallback
  opencode: normal home failed on a broken global skill frontmatter; review used temporary HOME with opencode/big-pickle
---

# Cross-AI Plan Review - Phase 74

## Consensus Summary

Phase 74 is directionally correct: the reviewers agree that the plan targets the root issue, not a single ScenePlanner symptom. The strongest parts are the audit-first inventory, explicit model-facing contract blocks, backend authority boundaries, fixture/conformance direction, and the final distinction between primary prompt-contract success and repair-assisted success.

The shared risk is that the current plans can still go green while leaving meaningful structured-output seams uncovered or weakly tested. Reviewers repeatedly called out missing or under-owned P1/P2 surfaces, marker-only tests that do not prove semantic adequacy, optional live provider gates, and insufficient use of real failure fixtures from Kimi/Mimo/DeepSeek/GLM-style outputs.

### Agreed Strengths

- Audit-first execution in 74-01 is the right guard against fixing only the latest broken callsite.
- Explicit prompt-contract helpers and stable `STRUCTURED_OUTPUT_CONTRACT` markers are a good maintainability pattern.
- Runtime/backend authority remains in backend code: IDs, tool names, state mutation, validation, and repair policy stay deterministic.
- 74-07's primary-vs-repair reporting is necessary; repair success must not masquerade as model stability.
- The wave order is mostly sound: inventory first, contract hardening next, conformance/reporting last.

### Agreed Concerns

- **HIGH - Coverage gaps remain.** Claude and Cursor both flagged that the plan may miss structured-output surfaces outside the obvious files. Specific candidates include `seed-suggester.ts`, `lore-extractor.ts`, `starting-location.ts`, `premise-divergence.ts`, `premise-step.ts`, `scaffold-steps/validation.ts`, `npc-offscreen.ts`, and `prompt-assembler.compressContext`. Plan 74-01 needs to force source-level ownership, not just audit-table ownership.
- **HIGH - Tests may prove markers, not contracts.** Multiple reviewers warned that `prompt.includes("STRUCTURED_OUTPUT_CONTRACT")` style tests do not prove required examples, caps, nullable rules, nested shapes, invalid cases, or minimal valid outputs are present.
- **HIGH - Provider-specific failures are not hard-gated.** The plans mention conformance, but live/provider coverage can still be skipped. Active judge/generator/worldgen models should have explicit primary-success evidence or a documented release-blocking exception.
- **MEDIUM - Real failure fixtures need to be mandatory.** 74-07 should consume log-derived fixtures for citations-as-string, canonicalNames-as-string, missing nested `actions[].action`, payload-vs-input aliasing, overlong rationale, unsupported tool names, and lazy/underspecified power stats.
- **MEDIUM - Repair policy remains fragmented.** Generic repair, ScenePlan semantic mapping, and domain-specific power-stat repair need a documented boundary: what repair may coerce, what it may never invent, and when the turn/worldgen path must fail closed.
- **MEDIUM - Contract text can drift from schemas.** Manual examples for nested schemas and tool inputs can desynchronize from Zod/runtime schemas unless either derived programmatically or guarded by stricter tests.

### Divergent Views

- Gemini and OpenCode considered the plan broadly ready with refinements; Claude rated it medium-high risk until coverage and provider gates are tightened; Cursor rated it medium but focused on provider/invalid-example gaps.
- Gemini suggested more programmatic example generation from schemas; the Phase 74 research intentionally avoids a generic Zod-to-contract system. A narrower helper for runtime tool input examples may be the practical compromise.
- Cursor questioned wave parallelism because 74-04/05/06 can drift before 74-02 establishes the canonical block style. Claude accepted the wave order but still wants source-level static enforcement.

## Gemini Review

Summary: The Phase 74 implementation plans present a comprehensive and systematic approach to hardening structured prompt contracts across the WorldForge backend. The plans prioritize auditing all relevant model-facing structured output seams, then iteratively apply explicit contract definitions, reusable helpers, and robust testing to critical gameplay, worldgen, character, and administrative script components. The final plan focuses on enhancing conformance reporting to distinguish true model stability from repair-dependent success, aligning with the phase's core objective of making prompt contracts explicit and verifiable.

Strengths:
*   **Holistic Coverage:** Begins with a project-wide audit (Plan 74-01) to identify all structured-output seams, ensuring no critical area is overlooked.
*   **Clarity of Contract Definition:** Consistently emphasizes defining explicit model-facing contracts that include required fields, nested shapes, enums, caps, nullability rules, and compact examples (P74-R2).
*   **Robust Testing Strategy:** Incorporates static analysis, prompt marker tests, and regression fixtures for observed failure classes across various domains (P74-R3, P74-R4).
*   **Preservation of Backend Authority:** Explicitly reinforces that backend remains the deterministic authority for validation, ID generation, and execution, preventing the LLM from inventing semantic facts (P74-R5).
*   **Reusable Components:** Promotes the creation of centralized `prompt-contract.ts` files and shared utility functions for building contract snippets, reducing duplication and prompt drift (P74-R3).
*   **Actionable Conformance Reporting:** The final plan directly addresses the need to differentiate primary prompt-contract success from fallback/repair success (P74-R6), providing a more accurate measure of model stability.

Concerns:
*   **MEDIUM - Dynamic Generation of Tool Input Examples (Plan 74-02):** The reliance on manually curated examples for nested tool inputs, especially for complex tools like `offer_quick_actions`, introduces a risk of prompt drift if the `runtimeToolInputSchemas` change. While the plan suggests deriving from schemas, a clear, programmatic way to generate these examples dynamically from Zod schemas is not explicitly detailed, potentially leading to maintenance overhead (P74-R3).
*   **MEDIUM - Granularity of Complex Schema Contract Builders (Plan 74-03, 74-04, 74-05):** For deeply nested or extensive schemas (e.g., `worldBrainSceneDirectionSchema`, `richCharacterSchema`), manual curation of contract text in prompt builders could become cumbersome and error-prone. The potential for schema changes to desynchronize with manually written prompt contracts is a concern, despite the intent to keep text concise (P74-R3).
*   **LOW - Export Strategy for Private Prompt Builders (Plan 74-04):** The plan notes that `buildGeneratedContextPrompt` is not exported, which impacts testability. While the plan implies addressing this, the specific solution (exporting, or testing via a public seam) should be explicitly stated to ensure it's not overlooked.
*   **LOW - Circular Dependency Risk for Power Stat Contracts (Plan 74-05):** The suggestion to place power-stat contract helpers in `backend/src/character/prompt-contract.ts` or a narrow local module raises a potential for circular dependencies if `known-ip-worldgen-research.ts` (which defines power stat schemas) also needs to import the main `prompt-contract.ts`.

Suggestions:
*   **Standardize Programmatic Example Generation:** For Plans 74-02, 74-03, and 74-05, explore extending (or creating a new) utility to programmatically generate minimal, yet accurate, JSON examples from Zod schemas (similar to the private `generateSchemaExample` in `generate-object-safe.ts`). This would ensure consistency and reduce manual maintenance for nested tool inputs and complex objects. If not fully programmatic, document a strict convention for manual updates.
*   **Explicit Test for Private Prompt Builders:** For Plan 74-04, explicitly outline the strategy for testing `buildGeneratedContextPrompt` (e.g., export it for testing, or create a thin, test-only wrapper function within the same module) to ensure all generated context prompts are verifiable.
*   **Proactive Circular Dependency Mitigation:** In Plan 74-05, for power-stat contract helpers, prioritize placing them in a module that definitively avoids circular dependencies. If `known-ip-worldgen-research.ts` is the most logical home, ensure its dependencies are inverted or refactored as needed, or clearly document why a separate, local helper is used.
*   **Add `primaryFailureReason` to Conformance Results:** For Plan 74-07, augment `StructuredOutputConformanceResult` with an optional `primaryFailureReason: string` field. This would provide more granular diagnostics when `primaryPromptContractSuccess` is false, indicating *why* the primary contract was not met (e.g., "strategy_mismatch", "schema_drift", "semantic_invention").

Risk Assessment: MEDIUM. The overall plan is well-conceived and comprehensive. The primary risks stem from the inherent complexity of managing numerous structured outputs and the potential for subtle drift between schemas and their human-readable prompt contracts. However, the strong emphasis on automated testing, clear separation of concerns, and phased implementation significantly mitigates these risks. The identified concerns are addressable with minor refinements to the implementation details, rather than requiring a fundamental change in strategy.


---

## Claude Review

# Cross-AI Plan Review — Phase 74

## Summary

Plans cover P0 gameplay seams (ScenePlanner, hidden-adjudication, world-brain, oracle, target, movement) and worldgen research artifact + named character/power/worldbook breadth. Audit-driven static lock plus per-domain marker tests sound. Но coverage breadth incomplete vs Phase 73 inventory: несколько production `safeGenerateObject` callsites вообще не получают plan owner. Marker tests check string presence, not contract correctness — provider/model-specific failure modes (Kimi/Mimo/GLM/DeepSeek) tested only через generic conformance harness, not log-extracted fixtures. Repair pipeline остаётся single-shot text-repair, не унифицирован между доменами. Risk: новый restore все ещё возможен на untouched seam.

## Strengths

- Audit-first lock (74-01) с static test + plan-owner column блокирует scope drift between waves.
- Wave layering чистый: 74-01 wave 1 → 74-02..06 wave 2/3 parallel-safe (separate files) → 74-07 wave 4 closeout.
- 74-02 reuses Phase 73 semantic ScenePlan/backend-IDs invariant и tool name derivation из `runtimeToolInputSchemas` — no enum drift.
- 74-07 explicit `primaryPromptContractSuccess` separated from final `success` — direct fix for "repair masks instability" concern in CONTEXT.md.
- 74-06 включает `backfill-personality.ts` явно вместо implicit exclusion.
- Threat models per-plan указывают backend-no-invention boundary (T74-04-02, T74-05-02).

## Concerns

- **HIGH — incomplete P1 worldgen coverage (74-04).** 73-STRUCTURED-OUTPUT-INVENTORY rows для `seed-suggester.ts` (4 sites), `lore-extractor.ts` (2 sites), `starting-location.ts`, `premise-divergence.ts`, `premise-step.ts` (refinePremise + text fallback), и `scaffold-steps/validation.ts` (`validateAndFixStage`, `validateCrossStage`) НЕ в `files_modified` плана 74-04. Audit table в 74-STRUCTURED-PROMPT-AUDIT.md row "Worldgen scaffold/regeneration" перечисляет эти файлы, но plan 74-04 трогает только `prompt-utils.ts`, `locations-step.ts`, `factions-step.ts`, `npcs-step.ts`, `regen-helpers.ts`. Static audit test в 74-01 не enforce marker в самих source files — только в audit md. Регрессия типа "seed-suggester citations drift" пройдёт незамеченной.
- **HIGH — `npc-offscreen.ts` и `prompt-assembler.compressContext` без owner.** 73 inventory классифицирует обоих как `native_schema`. Research помечает `npc-offscreen.ts` P1 ("Produces structured background simulation updates ... can persist wrong summaries/locations"), `compressContext` P2. Ни в одном плане 74-02..06 нет file path. Validation matrix 74-VALIDATION.md тоже их не упоминает. `npc-offscreen` пишет state — invented fields = silent corruption.
- **HIGH — marker tests check string literal, not semantic adequacy.** Plans 74-02..06 assert `expect(prompt).toContain("STRUCTURED_OUTPUT_CONTRACT: scene-planner.v1")` плюс несколько keywords. Это не ловит: пустой/неправильный nested example, отсутствие cap для конкретного nested array, missing nullable rule. Conformance harness (74-07) tests SEMANTIC validation per provider, но representative cases не приходят из реальных production failure logs (Kimi `citations: string`, Mimo `canonicalNames: string`, OpenCode DeepSeek nested ScenePlan action). 74-07 Task 2 говорит "Use schemas and contract examples from prior Phase 74 plans where possible" — это synthetic, не log-driven.
- **HIGH — repair path не унифицирован.** `generate-object-safe.ts attemptRepair` один общий text repair. Per-domain repair (`known-ip-worldgen-research.ts repairPowerStats`) custom. ScenePlan repair (74-02) использует semantic mapper retry. Worldgen artifact repair — generic. Никакой план не консолидирует repair contract: что разрешено coerce, что failed-closed. Riск: future surface добавляется, использует generic repair, который molча invents.
- **MEDIUM — provider/model family blind spots.** Memory + STATE.md mention production GLM, MiniMax, OpenRouter (embedder), и недавние Kimi/Mimo/OpenCode DeepSeek failures. Conformance harness (`structured-output-conformance.ts`) provider-keyed но default cases не вшивают provider-specific fixtures. 74-07 Task 2 не добавляет per-provider failure-mode case (e.g. "GLM tool_mode payload-not-input", "Kimi citations as joined string"). Live conformance gated by env, поэтому CI default skipped — primary-vs-repair regression provider-specific не enforced.
- **MEDIUM — 74-04 scope guard formal но broad.** Plan modifies 8+ files, добавляет prompt contracts to 5 scaffold-step files PLUS new `prompt-contracts.ts`. Scope guard в success_criteria уточняет "stop and re-plan if extra production seams discovered" — но executor имеет incentive расширить inline вместо stop. Single-plan fan-out увеличивает review surface.
- **MEDIUM — Wave 0 export-for-test strategy unresolved.** 74-VALIDATION.md Wave 0 list "Decide export-for-test strategy for private prompt builders such as `buildGeneratedContextPrompt`". 74-04 Task 2 не специфицирует — `buildGeneratedContextPrompt` is private function в `ip-researcher.ts`. Tests assert `vi.mocked(safeGenerateObject).mock.calls[1]?.[0]?.prompt` — это работает, но если builder rewritten в helper, тест test breaks. Не решено в plan.
- **MEDIUM — 74-07 не gate primary-success per active role model.** P74-R6 wording: "reports prompt-contract case failures for active role models before long-running flows are called stable". Plan adds `primaryPromptContractSuccess` field и runs CLI but не fail closeout if active judge/generator model has primaryPromptContractSuccess=false для P0 case. Verification matrix Task 3 lists targeted tests + `npm structured-output:conformance` — последняя по умолчанию skipped без `WORLDFORGE_LIVE_PROVIDER_CONFORMANCE=1`. Closeout зелёный без живой проверки.
- **MEDIUM — `oracle.test.ts` mocks `generateText` напрямую.** Существующий тест (см. line 22) `vi.mocked(generateText).mockResolvedValue(...)` — это работает потому что `safeGenerateObject` под капотом вызывает `generateText`. Plan 74-03 Task 3 добавляет marker assertion to system prompt. OK, но если 74-07 переключит oracle case в conformance с `requestedMode: tool` или `native_schema`, mock pattern не покрывает — pre-existing test architecture может обойти проверку primary-success при live providers.
- **LOW — audit static test (74-01 Task 2) парсит markdown.** Если row format меняется (e.g. extra column added), regex/string match ломается без test author intent. Минорный maintenance debt.
- **LOW — 74-02 prompt-contracts.ts и 74-03 prompt-contracts.ts один и тот же файл.** 74-02 wave 2, 74-03 wave 3, sequential. OK by wave but if executed parallel by accident → conflict. depends_on declaration верное (74-03 depends 74-02), this is enforced.
- **LOW — backlog item Phase 999.4 (ScenePlan nested action-input repair latency 213s) не addressed.** Plan 74-02 reduces probability of repair, но не bounds latency budget. Если структурный repair fails, fallback may still take minutes. Out of phase scope per CONTEXT non-goals, но worth flagging.

## Suggestions

- **74-01 Task 2:** extend static test to assert marker presence в SOURCE files for каждого audit row, not just audit md. Список required source files = audit P0/P1 rows. Single regression guard вместо per-domain marker tests.
- **74-04:** split into 74-04a (ip-researcher + research-artifact + generatedContext, P0) и 74-04b (full P1 scaffold breadth: locations/factions/npcs/regen + seed-suggester + lore-extractor + starting-location + premise-step + premise-divergence + validation.ts). Add file paths to `files_modified` explicitly. Currently P1 worldgen covered ~50%.
- **Add Plan 74-04c (or extend 74-03) для `npc-offscreen.ts` и `prompt-assembler.compressContext`.** State-mutating P1 не должно быть unowned.
- **74-07 Task 2:** require log-extracted fixtures. Add files like `backend/src/ai/__tests__/fixtures/kimi-citations-string.json`, `mimo-canonical-names-string.json`, `deepseek-scene-plan-payload-not-input.json`. Conformance cases consume фикстуры через mock provider returning ровно эти shapes — tests fail when primary contract doesn't prevent regression.
- **74-07 Task 3:** add explicit closeout gate "P0 conformance cases must show `primaryPromptContractSuccess: true` for each active role model in settings.json, или phase fails". Не just reuse Phase 73 skipped-when-no-creds. Document per-model evidence rows in verification matrix.
- **Add new task in 74-07 (or new plan 74-08): consolidate repair contract.** Document в `generate-object-safe.ts` JSDoc + add static test enforcing: repair may NOT add new array elements, may NOT fill empty `note`/`description` fields, may NOT generate UUIDs. Per-domain repair (power-stats) explicitly opts out via marker.
- **74-04 Task 2:** specify test access strategy. Either export `buildGeneratedContextPrompt` (preferred) или add `_test` namespace export. Lock в Wave 0.
- **74-PATTERNS.md "No Analog Found" generic Zod-schema-to-contract helper:** Research Open Question 3 already RESOLVED to "do not build". Confirm в plan 74-02 или 74-04 explicitly to prevent executor improvisation.
- **74-06 Task 2:** assert no circular import между `scripts/backfill-personality.ts` and `character/prompt-contract.ts`. Add typecheck step.

## Risk Assessment

**MEDIUM-HIGH.** Plans solve the obvious gameplay-critical seam (ScenePlanner, hidden adjudication, world-brain, oracle, generated context) — primary user-visible restore vector closed. Однако P1 worldgen breadth недокрыт (~5 files без owner), `npc-offscreen.ts` без owner вообще, marker tests structural не semantic, conformance fixtures synthetic не log-driven, repair path не унифицирован. Probability: следующий live failure случится на одном из untouched seams (seed-suggester, lore-extractor, validation.ts, npc-offscreen) или на provider-specific edge case (Kimi/Mimo) который generic conformance не воспроизводит. Closeout primary-success gate по умолчанию skipped без live creds → green Phase 74 не доказывает stability на active models. Recommend address HIGH concerns (split 74-04, add npc-offscreen owner, log-extracted fixtures, mandatory primary-success gate for active models) before execute.


---

## OpenCode Review



# Phase 74 Plan Review Findings

## Executive Summary

**Verdict:** The Phase 74 plan is well-grounded and addresses the correct root cause (prompt-contract gaps vs. transport issues). The wave-based implementation strategy is sound. Six findings require attention before approval.

---

## Requirement Coverage

| Req | Plan Coverage | Gap |
|----|----------------|-----|
| P74-R1 | 74-01 (audit) | Coverage: ✓ Maps 1:1 |
| P74-R2 | 74-02, 74-03, 74-04, 74-05, 74-06 | Coverage: ✓ Maps to each plan |
| P74-R3 | 74-01, 74-07 | Coverage: + Requires explicit test policy |
| P74-R4 | 74-07 | Coverage: ✓ Regression fixtures in conformance |
| P74-R5 | Across all plans | Coverage: ✓ Repair policy preserved |
| P74-R6 | 74-07 | Coverage: + Requires conformance schema change |

---

## Findings

### Finding 1: Conformance Schema Modification Required

**Severity:** Medium

**P74-R6** requires `structured-output-conformance.ts` to distinguish primary prompt-contract success from fallback/repair success. The current `StructuredOutputConformanceResult` likely tracks `repairUsed` and `success`, but not primary-only success.

**Recommendation:** Extend conformance result type in 74-07 (or 73 follow-up) before starting 74-07. Confirm current schema supports explicit primary/repair split before plan execution.

---

### Finding 2: Test-Gate Policy Ambiguity for P74-R3

**Severity:** Low-Medium

P74-R3 requires "automated tests fail when high-risk structured-output callers omit the required contract marker." The plan assigns marker tests to 74-01 and conformance in 74-07, but does not specify:
- Which callers are HIGH-RISK (P0 only? P1? P2?)
- Whether tests WARN or FAIL
- What marker format to enforce

**Recommendation:** Clarify scope (P0/P1 mandated, P2 warning), enforcement level, and marker format in plan text before 74-01 execution.

---

### Finding 3: Backfill Personality Script (backfill-personality.ts) Scope Decision

**Severity:** Low

The audit lists `scripts/backfill-personality.ts` as needing contract inclusion in 74-06. The plan assigns 74-06, but does not confirm whether this script is:
- A production runtime seam (requires full contract + marker tests)
- A one-time migration tool (can be excluded with documented rationale)

**Recommendation:** Document explicit inclusion/exclusion decision in 74-06 plan text with rationale.

---

### Finding 4: Contract Helper Duplication Risk

**Severity:** Low

The plan recommends colocating contract builders near schemas. This is correct, but multiple P0/P1 builders (ScenePlanner, hidden adjudication, world-brain, oracle, target-context) may produce similar contract snippets for runtime tool inputs.

**Recommendation:** Consider extracting a shared `buildToolInputContract()` helper used by multiple prompt builders rather than duplicating tool-input contract text across files.

---

### Finding 5: Regression Fixture Scope Complete

**Severity:** None (Confirming)

P74-R4 requirement covers all observed failure classes: `citations` string/array, `canonicalNames` string/object, overlong fields, missing nested `input.actions[].action`, `payload`/`input` aliasing, unsupported tool names, malformed optional quick actions, underspecified power stats.

**Assessment:** Fixture matrix in 74-07 covers the requirement. No gap identified.

---

### Finding 6: Wave Sequencing Sounds

**Severity:** None (Confirming)

The recommended wave approach (audit → P0 gameplay → P1/P2 breadth → conformance) maintains correct dependency order:
- 74-01 must precede contract additions (provides inventory + markers)
- 74-02/74-03 must precede 74-04/74-05 (proven P0 patterns)
- 74-07 must be last (requires all contracts in place)

**Assessment:** Sequencing is sound.

---

## Additional Observations

1. **Phase 73 dependency:** Plan 74-01 begins with "Depends on: Phase 73" but 73 is complete. Verify Phase 73 audit outputs are accessible in `.planning/phases/73-structured-output-stability-and-provider-conformance/`.

2. **Tool-schema source:** Plans reference `runtimeToolInputSchemas` from `backend/src/engine/tool-schemas.ts`. Confirm this module exports appropriate helper functions before starting 74-02.

3. **Marker format:** The research shows `STRUCTURED_OUTPUT_CONTRACT: scene-planner.v1` pattern. Confirm this marker format is stable or allow flexibility in 74-01 test design.

---

## Summary

| Severity | Count |
|----------|-------|
| High | 0 |
| Medium | 1 |
| Low | 2 |
| None/Confirming | 3 |

The plan is ready for execution pending:
- Confirmation that `structured-output-conformance.ts` can represent primary-only success (Finding 1)
- Clarification of marker-test severity policy (Finding 2)
- Explicit backfill script scope decision (Finding 3)


---

## Cursor Review

Ниже обзор строго по инструкциям из файла (раздел «Review Instructions»).

## 1. Summary

Пакет планов **74-01–74-07** в целом нацелен на корневую причину из контекста фазы: недостаточно явные модельные контракты перед `safeGenerateObject`/ремонтом, плюс необходимость не путать «прошло после repair» с «модель с первого раза выдала нужную форму». Аудит с статической привязкой к файлам (**74-01**), вынос контрактов в колокейтед-хелперы с маркерами (**74-02–74-06**) и разделение primary vs repair в conformance (**74-07**) логично закрывают **P74-R1–R6** для заявленных швов. При этом планы слабо и явно не закрывают проверку **стратегии провайдера** и **мульти-провайдерной** устойчивости (DeepSeek, GLM, Mimo, Kimi), почти нигде не требуют **негативных/антимодельных** примеров в промпте, и **параллельные волны** (например **74-04**/**74-05**/**74-06** при **74-02** ещё в работе) повышают риск расхождения маркеров/паттернов до того, как «эталонный» engine-хелпер из **74-02** стабилизируется.

## 2. Strengths

- **74-01** задаёт источник истины (аудит + статический тест по P0/P1 файлам и владельцам планов), что снижает риск «починили только ScenePlanner».
- **74-02** жёстко связывает текст контракта с **`runtimeToolInputSchemas`** и требует nested shape для `offer_quick_actions` — это бьёт в реальные классы сбоев (nested `actions[].action`, `toolName`).
- **74-03** добивает оставшиеся P0 gameplay-классификаторы тем же паттерном маркеров и тестов на промпт.
- **74-04** явно таргетирует **citations / canonicalNames** (string vs array/object) и scaffold/regen с scope guard «не раздувать архитектуру».
- **74-05** опирается на существующий **`character/prompt-contract.ts`** и эталонный стиль **known-ip-worldgen-research** для power stats.
- **74-06** закрывает пробел чекера по **`backfill-personality.ts`** вместо немого исключения script-seams.
- **74-07** адресует **P74-R6**: отдельные поля primary vs fallback/repair и финальная матрица верификации по аудиту.

## 3. Concerns

- **[HIGH] Покрытие не-OpenAI провайдеров и «не та стратегия провайдера».** В фокусе инструкции явно перечислены OpenCode DeepSeek, GLM, Mimo, Kimi; в **74-07** и остальных планах live conformance остаётся **env-gated** и **опциональным**, без обязательной матрицы «минимум N провайдеров / ролей» или зафиксированных ожиданий по primary success по провайдеру. Риск: фаза формально закрыта по тестам, а продолжатся сбои на конкретной стратегии JSON/native. *Планы: в первую очередь **74-07** (verification matrix + conformance cases), вторично **74-01** (аудит: колонка про provider/strategy если применимо).*

- **[MEDIUM] Нет явного требования «invalid / minimal» примеров в модельном контракте.** **P74-R2** и планы **74-02–74-06** сильны на **компактном валидном примере** и капах; инструкция ревью просит также **invalid examples** и **minimal valid outputs** — это почти нигде не зафиксировано как must-have тестом или текстом промпта. *Планы: **74-02**, **74-04**, **74-05** (самые нетривиальные схемы).*

- **[MEDIUM] Зависимости волн и расхождение паттернов.** **74-04**, **74-05**, **74-06** (wave 2) зависят только от **74-01**, пока **74-02** (nested tool contracts) ещё не обязателен; это ускоряет параллельность, но повышает шанс, что worldgen/character/worldbook введут слегка разные соглашения о маркерах/формате блока контракта до стабилизации **engine/prompt-contracts.ts**. *Планы: **74-01** (строка в аудите: «canonical block format»), опционально явная зависимость **74-04/05/06** от **74-02** только для единообразия — спорный tradeoff.*

- **[MEDIUM] `generateText` с JSON/tool-подобным выводом.** **74-01** обещает включить такие швы в аудит; дочерние планы в основном перечисляют `safeGenerateObject`-файлы. Если инвентарь Phase 73 содержит значимые **generateText** JSON seams, они могут остаться с слабым плановым владельцем после **74-01**, если исполнитель не добавит строки в **74-STRUCTURED-PROMPT-AUDIT.md**. *План: **74-01** + выборочная проверка в **74-07** матрицей.*

- **[MEDIUM] Поведение при repair: пользователь vs «тихо приняли битое».** Планы хорошо запрещают семантическое изобретение в backend (**P74-R5**), но слабее описывают **продуктовый** исход: видимый ли fail closed для игрока/мира при исчерпании repair, или повтор с другим промптом. *Планы: **74-02/74-03** (runtime paths) + **74-07** (конформанс-отчёт не заменяет UX-политику).*

- **[LOW] Маркеры worldbook в **74-06** заданы как общий `STRUCTURED_OUTPUT_CONTRACT` без версии в артефактах.** Для composition/import это может ослабить **74-01** static check «contract marker per row» если тест требует строгий `:<name>.v1`. *Планы: **74-06**, **74-01** (согласовать формат маркера).*

- **[LOW] Курируемый список файлов в **74-01** может отстать от Phase 73 inventory (~40 сайтов).** Если новый вызов появится вне списка, тест не упадёт до ручного обновления curated list. *План: **74-01**.*

## 4. Suggestions

- **74-07 / Task 2–3:** Добавить в **74-VERIFICATION-MATRIX.md** явную таблицу: провайдер (или env profile) × роль × ожидание **`primaryPromptContractSuccess`** для 2–4 представителей (например DeepSeek, GLM, Mimo, Kimi) или зафиксировать «не блокирует closeout, но обязателен для release gate» — иначе пункт из инструкции ревью остаётся формально не закрытым планами.
- **74-02 и 74-04:** В задачи на промпт вставить **1–2 строки anti-patterns** («не возвращай citations строкой», «не вкладывай canonicalNames в одну строку») и **минимальный valid object** рядом — как отдельный подпункт acceptance в тестах (snapshot подстрок или regex).
- **74-01:** В аудит добавить колонки **«generateText JSON?»** и **«repair path / fail closed»** для строки шва, чтобы **74-07** мог доказать покрытие не только `safeGenerateObject`.
- **74-05:** Явно потребовать **фикстуры из реальных логов** (обезличенные) для «lazy power scaling» и **underspecified power stats** в **known-ip-worldgen-research** / ingestion — сейчас сказано «malformed fixtures where available», лучше сделать обязательным артефактом в summary.
- **74-03 Task 3:** Уточнить в acceptance, что **oracle `reasoning`** проверяется на **cap по длине** в промпте (симметрично схеме), чтобы закрыть класс «overlong rationale» из инструкции ревью.
- **74-06:** Заменить голый маркер worldbook на версионированные идентификаторы (`worldbook-composition.v1`, `worldbook-import.v1`) для симметрии с **74-02/74-03** и более строгих marker tests.

## 5. Risk Assessment

**MEDIUM.** Обоснование: архитектура фазы (аудит → контрактные хелперы → маркер-тесты → conformance с primary vs repair) напрямую бьёт в описанную корневую проблему и покрывает основные классы сбоев из контекста (nested tools, citations/canonicalNames, power stats). Риск повышается тем, что **мульти-провайдерная** проверка и **явные негативные примеры** в промптах почти не зафиксированы как обязательные ворота; параллельные wave-2 планы без зависимости от **74-02** могут дать **дрейф стиля контрактов** до интеграции; без явной политики **fail closed** после repair остаётся зазор между «конформанс зелёный» и «игрок не видит тихо испорченного состояния». Это не выглядит как полный блокер методологии фазы, но требует доработки **74-07** и точечного ужесточения **74-01/74-02/74-04/74-05**, чтобы инструкции ревью (провайдеры, invalid/minimal примеры, overlong rationale) были выполнимыми и проверяемыми.


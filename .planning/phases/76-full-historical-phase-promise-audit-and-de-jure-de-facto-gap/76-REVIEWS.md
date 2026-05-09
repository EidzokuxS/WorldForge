---
phase: 76
reviewers: [gemini, claude, cursor]
failed_reviewers: [opencode]
skipped_reviewers: [codex-self, qwen-missing, coderabbit-missing]
reviewed_at: 2026-04-30T19:51:03.1714400+03:00
plans_reviewed: [76-01-PLAN.md, 76-02-PLAN.md, 76-03-PLAN.md, 76-04-PLAN.md, 76-05-PLAN.md, 76-06-PLAN.md]
---

# Cross-AI Plan Review - Phase 76

## Review Run Notes

- Gemini, Claude, and Cursor Agent produced substantive reviews.
- OpenCode was attempted twice and failed before reaching the model because its startup parsed C:\Users\robra\.claude\skills\poker-software-architect\SKILL.md and hit a YAML frontmatter error.
- Qwen and CodeRabbit were not installed.
- Codex CLI was skipped as self-review to preserve reviewer independence.

## Consensus Summary

All successful reviewers agree that the corrected Phase 76 plan now addresses the user's actual request: an exhaustive historical audit rather than another thematic location/presence slice. The strongest shared positives are the inventory-first design, the validator-before-slices dependency, explicit handling for `17-legacy`, `19.1`, and optional `0 / pre-GSD baseline`, and the prohibition on silently implementing broad product fixes during an audit.

### Agreed Strengths

- Wave 1 creates the corpus inventory and validator before any audit slice can classify rows.
- Plans 76-02 through 76-05 partition the prior phase corpus instead of sampling by theme.
- The audit rejects old summaries, roadmap checkboxes, and schema existence as sufficient `verified-current` proof.
- The gap ledger and final validation gate make non-verified rows actionable instead of invisible.
- Phase 75 is explicitly corrected to location-presence closure only, while Phase 76 owns the full historical audit.

### Agreed Concerns

- The 76-02 slice is the largest and carries the highest skim risk; it needs an explicit cap/guard or split if execution proves too broad.
- `verified-current` evidence must be more than lexical markers; validator behavior should check referenced paths/artifacts where possible.
- The audit row/table parser contract must be pinned early so slice agents cannot emit incompatible Markdown that the final validator misreads.
- Cross-slice merge needs explicit conflict handling where an older phase promise was later superseded or completed by another phase.
- The review prompt itself was large and duplicated some requirements; execution artifacts should keep the canonical schema compact and unambiguous.

### Required Planning Revisions Before Execution

1. Strengthen Plan 76-01 so 76-AUDIT-SCHEMA.md pins audit row granularity, column order, escape rules, row key uniqueness, and structured parser expectations.
2. Strengthen Plan 76-01 validator requirements to check audit-key uniqueness and verify path existence for path-like evidence markers where feasible.
3. Strengthen Plan 76-02 with an explicit anti-skim checkpoint for its large slice, including phase-count accounting and the option to split/stop if the row load exceeds executor context.
4. Strengthen Plan 76-04 read scope to include v1.1 milestone audit/closeout artifacts so phases 56-69 do not miss UAT or milestone-level gaps.
5. Strengthen Plan 76-06 merge rules for cross-slice conflicts, supersession, slice gap candidate provenance, and final validator failure remediation.
6. Cap Phase 76 planning-truth edits to deterministic ROADMAP/STATE/REQUIREMENTS/BACKLOG deltas; broad product fixes remain follow-up work.

### Divergent Views

- Gemini assessed overall risk as LOW, while Claude and Cursor assessed MEDIUM due to operational execution risks. The synthesis treats MEDIUM as the actionable review result because the remaining risks are concrete and cheap to address in the plan.
- Gemini was satisfied with the current slice split, while Claude flagged 76-02 as too large. The safer route is to keep the plan but add an explicit split/checkpoint rule before execution.

## Gemini Review

### Summary

The execution plans for Phase 76 successfully translate the requirement of an exhaustive, phase-by-phase historical audit into a highly structured, defensively designed pipeline. By forcing the creation of an immutable expected-row inventory and a strict automated validator in Wave 1 (Plan 01) before any audit work begins, the plans structurally prevent the "scope narrowing" and "thematic sampling" anti-patterns observed in Phase 75. The parallelized slice plans (02 through 05) cover exactly the required non-overlapping phase ranges (including edge cases like `17-legacy` and `19.1`), and the final synthesis plan (06) cleanly aggregates the results into an actionable gap ledger and updates planning truth without allowing silent product implementation.

### Strengths

- **Immutable Coverage Guarantee:** Plan 01 mandates the creation of `76-corpus-inventory.json` and a validator script *first*, mechanically enforcing that no integer phase 1-75 or archived decimal/legacy phase is skipped.
- **Parallel but Non-Overlapping Slices:** The division of labor across Plans 02, 03, 04, and 05 ensures complete coverage (1-36+archived, 37-55, 56-69, 70-75) without overlapping phase boundaries, preventing duplicate work and reducing context window bloat for the executing agents.
- **Strict Evidence Standards:** The plans consistently reinforce the rule that `SUMMARY` files or roadmap checkboxes are insufficient for a `verified-current` classification, requiring actual source, test, or runtime proof.
- **Zero Scope Creep Tolerance:** Every plan explicitly forbids product source code edits, ensuring Phase 76 remains a pure audit and documentation phase, routing all material fixes to the `76-GAP-LEDGER.md` or `BACKLOG.md`.
- **Handling of Edge Cases:** Archived duplicate `17-legacy`, decimal `19.1`, and the optional `0-pre-gsd-baseline` are explicitly accounted for in the inventory and Slice 1 (Plan 02).

### Concerns

- **Slice Boundary Overlap Risk on Cross-Phase Features (LOW):** While the phase numbers are strictly partitioned, some features span multiple phases (e.g., Phase 63/64 personality parity). Slices might independently mark related claims as `partial` without realizing a later phase in a different slice resolved it. Plan 06 requires resolving duplicates/conflicts, but an LLM agent might struggle to reconcile cross-slice context during the final merge.
- **Inline Script Escaping (LOW):** The inline Node.js verification scripts (e.g., in Plan 01 Task 1) are dense and rely on stringified JavaScript inside markdown XML blocks. While functional, they are brittle to formatting errors or quotes being stripped by the agent executing them.

### Suggestions

- **Add Cross-Slice Conflict Resolution Guidance to 76-06:** In Plan 06 Task 1, explicitly instruct the agent that if a feature was marked `partial` in an early slice (e.g., v1.0) but `verified-current` in a later slice (e.g., v1.1), the final audit row for the *older* phase should be marked `superseded` or updated to cite the newer phase's evidence, rather than keeping contradictory statuses in the final matrix.
- **Extract Validator Logic to Separate Files:** Instead of relying heavily on `node -e` one-liners in the `<verify>` blocks, consider having Plan 01 create tiny utility scripts (e.g., `verify-inventory.mjs`) that the subsequent plans can just execute via `node .planning/.../verify-inventory.mjs`. (The plans already do this well with `validate-phase-76-audit.mjs`, but rely on `node -e` for the inventory generation verification).
- **Explicit Backlog Parsing Rules:** In Plan 06 Task 2, instruct the agent to ensure that any new `.planning/BACKLOG.md` entries include a direct reference to the Phase 76 audit row that spawned them to maintain bidirectional traceability.

### Risk Assessment

**LOW**

The planning architecture is exceptionally robust. It directly addresses the failure modes of previous audits by relying on static file generation, automated row-counting scripts, and hard boundaries for evidence types. The dependency graph (01 -> [02, 03, 04, 05] -> 06) is correct and safe, and the explicit prohibition on modifying source code effectively neutralizes the risk of silent implementation scope creep. This plan is highly likely to produce the exact exhaustive gap analysis the user requested.


---

## Claude Review

# Phase 76 Plan Review

## Summary

Plan set corrects Phase 75 narrowing by freezing inventory + validator before slice work, then fanning out four parallel evidence slices and synthesizing in wave 3. Foundation-first ordering and dependency-free Node validator are the right call. Main residual risks: slice 76-02 carries asymmetric load (≈34 rows incl. archived extras), `verified-current` is gated on string markers rather than file-existence proof, and the validator parses an implicit Markdown table shape that the schema artifact only invents at runtime. Recoverable with small additions; structurally sound.

## Strengths

- **Inventory-first design.** 76-01 produces immutable expected-row ledger before any slice can classify. Directly counters the Phase 75 narrowing pattern called out in `tasks/lessons.md`.
- **Closed-set classification + evidence marker vocabulary.** Eight statuses + nine markers, validator rejects unknown values. Hard to game by drift.
- **Archived duplicate + decimal preserved.** `17-current` vs `17-legacy` separation and `19.1` extra are explicit in inventory contract and slice 76-02 acceptance criteria.
- **Source-edit prohibition repeated per plan + STRIDE Elevation row.** P76-R6 enforced both by plan text and validator scope.
- **Cross-file gap-ledger inclusion check.** Validator rule that `stale-unwired/partial/follow-up/needs-human-UAT` rows must appear in `76-GAP-LEDGER.md` blocks silent-skip.
- **Phase 75 correction has dedicated section in 76-05 plus planning-truth reconciliation in 76-06.** Two-layer guard against re-narrowing.
- **Wave-2 slice parallelism with single shared validator.** Reduces wall-clock and forces consistency.
- **Pre-GSD baseline kept optional and explicitly cannot substitute.** Resolved Open Question 1 cleanly.

## Concerns

### HIGH

- **76-02 slice load asymmetric and largest.** Covers active 1-17, active 23-36, archived 17-legacy/18/19/19.1/20/21/22, plus optional 0 → ~34 audit rows requiring per-phase artifact reads. Phase 75 failed precisely at this size class. No per-slice phase-count cap. Risk of agent skimming → false `verified-current`.
- **`verified-current` proof is marker-only, not file-existence.** Validator checks for `source:` / `test:` / `route:` / `runtime:` / `frontend:` substrings. Auditor can write `source: backend/src/nonexistent.ts` and pass. Phase 75 rule was source-data-reaches-visible-behavior; Phase 76 weakens to lexical marker presence.
- **Validator parses Markdown table shape that doesn't yet exist.** 76-01 Task 2 says "Parse audit rows from the table shape in `76-AUDIT-SCHEMA.md`" — schema artifact is created in same plan but column ordering, separator escaping, and pipe-in-cell handling are unspecified. Slice files written by different agents may diverge. Brittle parser → silent under-count or over-count.

### MEDIUM

- **No Audit Key uniqueness check.** Validator failure list does not include duplicate Audit Key detection. Two slice agents could both emit `Phase 17` rows under different keys and merge silently.
- **Single archive path hardcoded.** Inventory and slice 02 reference `.planning/archive/legacy-phases/2026-03-30-superseded-active-phase-dirs/` only. If `.planning/archive/legacy-phases/` has or grows other dated subdirectories, inventory misses them. No discovery scan.
- **Slice gap candidates → final ledger handoff is lossy.** Plan 06 Task 2 rebuilds ledger "from all final audit rows classified..." rather than from slice gap sections. Recommended-routing values written by slice authors (who know the local context) get discarded; Plan 06 author re-derives routing from the row alone. Severity/owner judgments lose provenance.
- **No review checkpoint between Wave 1 and Wave 2.** If 76-01 validator has a parser bug, all four wave-2 slices burn agent time then re-fail. Adding a brief read-only review on validator output before fanning out would cap rework.
- **v1.1 closeout-checklist read sparse for 76-04.** 76-03 reads `v1.1-MILESTONE-AUDIT.md` and `v1.1-MILESTONE-CLOSEOUT-CHECKLIST.md`; 76-04 (phases 56-69) reads neither despite mid-v1.1 UAT items belonging there. Risk of orphaned `needs-human-UAT` items.
- **76-06 doc edits to ROADMAP/REQUIREMENTS/STATE/BACKLOG have no size cap.** "Small deterministic docs/state fix" boundary not numerically defined. Could grow into a planning rewrite under audit cover.
- **Phase 0 handling under-specified.** Inventory marks it optional but no plan task explicitly grep-confirms absence; auditor may skip without recording the negative result.

### LOW

- **Validator commands shown in PowerShell only in `<verification>` blocks.** Cross-shell drift cosmetic but inconsistent with bash environment in this session.
- **Coverage counter `Integer phases: 75/75` likely string-grepped from final audit.** Format-fragile; reformatting markdown could pass empty file.
- **Inventory has no snapshot timestamp.** New phase added mid-execution → silent inventory staleness.
- **`SUMMARY.md`/checkbox/roadmap rejection rule is text-pattern based.** Auditor wording around "summary" can either trigger false rejection or be paraphrased to bypass.

## Suggestions

1. **Cap slice phase count.** Split 76-02 into 02a (archived legacy + 1-17) and 02b (23-36). Brings each slice to ≤20 rows. Restores Plan-75-anti-pattern guard.
2. **Add path-existence check to validator.** For every evidence marker referencing a path (`source:`/`test:`/`route:`/`frontend:`), `fs.statSync` the path and fail on miss. Promotes marker from lexical to physical proof.
3. **Specify the audit table parser contract in 76-AUDIT-SCHEMA.md before validator writes.** Pin column order, escape rules for pipes, blank-cell sentinel. Add a parser unit test in `tools/` that round-trips a fixture.
4. **Add Audit Key uniqueness validator rule.** Fail when same `Audit Key` appears twice across slices or final audit.
5. **Discover archive roots dynamically.** Scan `.planning/archive/legacy-phases/*/README.md` instead of hardcoding the dated subdir.
6. **Persist slice gap candidate routing in Plan 06.** Plan 06 Task 2 should merge slice `## Slice Gap Candidates` sections and treat slice routing as authoritative unless conflict; only re-derive when slice didn't propose one.
7. **Insert lightweight review gate after 76-01.** Read-only check that validator runs against a synthetic fixture before parallel slices launch.
8. **Add `v1.1-MILESTONE-CLOSEOUT-CHECKLIST.md` to 76-04 read_first.** Same for v1.1-MILESTONE-AUDIT remaining gaps relevant to phases 56-69.
9. **Cap 76-06 planning-truth edits.** Constrain to listed delta patterns: (a) Phase 75 wording change, (b) requirement-table P76-R* status flips, (c) STATE.md "Phase 76 complete" line. Anything else routes to follow-up.
10. **Make Phase 0 negative result explicit.** Require 76-02 to record `rg` command + null output in slice file when no Phase 0 artifact found.
11. **Add slice-output schema (JSONL or YAML appendix) alongside Markdown table.** Validator parses structured form first, table is human-readable mirror. Eliminates table-shape brittleness.
12. **Validator `--final` should diff the planned ledger row set against rebuilt set and fail on mismatch** (not just check ledger-includes-row). Catches accidental row drops in Plan 06 merge.

## Risk Assessment

**MEDIUM.** Plan structure correctly addresses the corrective intent (P76-R5) and the foundation-first ordering blocks the most likely repeat of Phase 75's narrowing failure. However, three weak links remain: oversized 76-02 slice, lexical-only `verified-current` proof, and an underspecified table parser contract between schema and validator. Each is independently survivable but jointly raise the probability that the audit passes with skimmed or fabricated `verified-current` rows. Adding the slice cap, path-existence check, and parser contract (suggestions 1-3) drops the risk to LOW. Source-edit prohibition is well-enforced, so even a flawed audit cannot silently mutate product code; the failure mode is documentary, not behavioral.


---

## Cursor Agent Review

## Summary

Файл `76-REVIEW-PROMPT.tmp.md` — это очень объёмный «пакет» для кросс-AI-ревью фазы 76: контекст продукта, зафиксированные требования P76-R1–R6, выдержки из CONTEXT/RESEARCH, стратегия валидации (Nyquist), карта паттернов, шесть планов (76-01–76-06) и в конце XML-подобные задачи для 76-06. По сути заложена сильная модель: корпус сначала, затем нарезка по эпохам, «лестница доказательств», отдельный gap-ledger, автоматическая проверка покрытия фаз 1–75 и явные строки для архивных особых случаев (`17-legacy`, `19.1`), плюс разграничение с фазой 75. При этом документ сильно раздувается повторами и служебными артефактами, а местами даёт противоречивые сигналы о гранулярности строк матрицы.

## Strengths

- Чёткая цель: не «тематический сэмплинг», а фаза-за-фазой, с запретом считать саммари/чекбоксы доказательством.
- Хорошо проработаны **краевые случаи корпуса**: архив legacy, коллизия номера 17, десятичная `19.1`, опциональная строка для «0 / pre-GSD».
- **Лестница доказательств** и отсылка к Phase 75 (source → player-visible) снижают риск ложных `verified-current`.
- Разумное **разбиение на слайсы** и Wave 0 (инвентарь, схема, валидатор) под ограничения контекста агентов.
- Явные **антипаттерны** (схема как доказательство, схлопывание дубликата 17, повторное сужение как в Phase 75).
- **Закрытие по валидатору** (`--inventory` / `--slice` / `--final`) и синхронизация ROADMAP/STATE/REQUIREMENTS для P76-R5.
- **P76-R6**: запрет тихого широкого имплемента внутри аудита согласован с задачами 76-06 (без правок продуктового кода).

## Concerns (с серьёзностью)

| Серьёзность | Проблема |
|-------------|-----------|
| **MEDIUM** | Секция **Requirements Addressed** и смежная таблица (около строк 106–140) **содержит многократные дубликаты** пунктов P76-R1–R6 и выглядит как повреждённая/слиянная разметка — снижает ясность для ревьюера и повышает риск пропуска единственного канонического списка требований. |
| **MEDIUM** | **Размер файла (~149k символов)** и повтор CONTEXT/Research/Pattern Map в одном промпте могут размыть фокус; ключевые инструкции легко «потеряться» у модели. |
| **MEDIUM** | **Напряжение спецификации**: с одной стороны «каждая фаза ≥ одна строка», с другой — «каждое материальное обещание» должно быть проверено по лестнице доказательств. Без явного правила (одна строка с агрегированными промисами vs много строк на фазу) агенты могут **недоаудировать** насыщенные фазы или, наоборот, не уложиться в формат. |
| **LOW** | В тексте много **жёстко прошитых версий окружения** (Node, npm, rg, PowerShell) — устареют; уже указан короткий TTL исследования, но для «review prompt» это шум. |
| **LOW** | **ASVS/STRIDE-блоки** полезны как дисциплина, но для чисто planning/audit фазы добавляют объём с ограниченной отдачей для ревью планов. |
| **LOW** | Вставки с **абсолютными путями** `R:\...` в цитатах ухудшают переносимость при внешнем ревью. |
| **LOW** | Пример фрагмента валидатора на Node (строки ~559–600) **может не совпадать** с финальной логикой учёта `19.1` / archived-extra в виде отдельных счётчиков — риск того, что документ обещает одно, а скрипт реализуют иначе (проверка синхронизации спеки и кода — на исполнителе). |

## Suggestions

- **Сжать верх документа**: один канонический блок с P76-R1–R6 без повторов; починить/удалить дублирующуюся таблицу статусов.
- **Явно зафиксировать гранулярность матрицы**: например, «минимум одна строка на фазу; при нескольких материальных промисах — несколько строк с одним `phase` и разными `promise_id`» (или эквивалент).
- Вынести **длинный RESEARCH/PATTERNS** в отсылку к отдельным файлам, а в `.tmp`-промпте оставить оглавление + критические инварианты и ссылки.
- Для валидатора: в спеке **явно перечислить ожидаемые ключи** (`17-legacy`, `19.1`, опционально `0`) и то, как они отличны от integer 1–75.
- Согласовать формулировки слайсов (76-02 **«v1.0 + legacy»** vs детальная таблица Wave/Slices с `23–36`), чтобы ревьюеры не трактовали корпус по-разному.
- В инструкции merge (76-06) добавить явное правило: **если финальный валидатор не проходит, допускается правка классификаций/строк** при фиксации в Merge Notes (не только при «конфликте дубликатов»).

## Risk Assessment

**Уровень: MEDIUM.**

Обоснование: методология и стражи (корпус, валидатор, gap-ledger, запрет широких правок кода) хорошо адресуют главный риск фазы — **снова сузить аудит до одной цепочки**. Риски **MEDIUM** в основном операционные: шум и дубликаты в самом промпте, двусмысленность «одна строка на фазу» vs «каждое обещание», и зависимость от качества будущего `validate-phase-76-audit.mjs`. При устранении дублирования и уточнении гранулярности строк реальный риск срыва закрытия можно снизить ближе к **LOW–MEDIUM**.


---

## OpenCode Attempt

OpenCode review failed or returned insufficient output. Exit code: 1

Output:


Errors:
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

Error: Unexpected error, check log file at C:\Users\robra\.local\share\opencode\log\2026-04-30T164918.log for more details
JSON Parse error: Unexpected EOF





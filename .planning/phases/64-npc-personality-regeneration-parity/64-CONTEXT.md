# Phase 64: NPC Personality Regeneration Parity — Context

**Gathered:** 2026-04-19
**Status:** Ready for planning
**Source:** Discuss-phase with codex advisor (user delegated technical decisions)

<domain>
## Phase Boundary

Закрыть parity-gap оставшийся от Phase 63: worldgen-пайплайн (`scaffold-steps/npcs-step.ts`) и переиспользующий его `/api/worldgen/regenerate-section` (section=`npcs`) populate-ят только `identity.personality.summary`, оставляя `voice`, `decisionStyle`, `worldview`, `internalContradictions`, `personalMythology`, `sampleLines` пустыми. В результате часть NPC (созданных через worldgen или regenerate) идёт в prompt-assembler и UI без структурированной personality, а LLM теряет `voice`/sampleLines/contradictions — основной Phase 63 контракт.

**Scope:**
- Worldgen batch NPC generation (`generateNpcsStep`) — per-NPC detail call уже существует → расширить Zod schema + prompt до полного блока personality.
- `/api/worldgen/regenerate-section section="npcs"` — fix автоматически благодаря reuse `generateNpcsStep`.
- Narrow backfill для NPC с summary-only personality (NPC созданные worldgen в окне между merge Phase 63 и merge Phase 64).
- Tests: unit on `generateNpcsStep`, integration on `/api/worldgen/regenerate-section`.

**Out of scope:**
- Расширение `known-ip-worldgen-research.ts` enrichment (оно пишет `powerStats`, не personality).
- Новый API контракт для preserve-edits на regenerate (текущий UI — full section replace, сохраняем).
- Любое изменение `npc-generator.ts` (`/api/worldgen/generate-npc` already полный).
- UI изменения — `personality-section.tsx` уже читает все поля.

</domain>

<decisions>
## Implementation Decisions

### GA-1: Schema Extension Surface — **Option A (inline in existing detail call)**
- **D-01:** Расширить Zod `outputSchema` per-NPC detail call в `backend/src/worldgen/scaffold-steps/npcs-step.ts` добавив flat personality-поля (`personalitySummary`, `personalityVoice`, `personalityDecisionStyle`, `personalityWorldview`, `personalityContradictions[]`, `personalityMythology`, `personalitySampleLines[]`) — точный mirror `npc-generator.ts:29-35`.
- **D-02:** Извлечь общий helper (личный Zod-fragment + mapper `flat → CharacterPersonality`) в shared модуль, переиспользуемый `npc-generator.ts` и `scaffold-steps/npcs-step.ts`. Предотвращает drift.
- **D-03:** Mapper пишет в `draft.identity.personality` все 7 sub-полей (не только summary). Заменяет текущий блок `npcs-step.ts:554-564`.
- **Не делаем:** отдельный post-scaffold enrichment pass (doubles calls), loop `npc-generator.ts` per NPC (high cost, duplicates logic).

### GA-2: Regenerate-section Behavior — **Option A (full replace)**
- **D-04:** `/api/worldgen/regenerate-section section="npcs"` остаётся full-section replace. Не добавляем merge semantics для personality.
- **D-05:** Клиентская preserve-edits логика отложена как явный feature — требует нового API контракта (передача current NPC drafts в request body). Deferred.
- **Причина:** `backend/src/routes/schemas.ts:regenerateSectionSchema` не отправляет existing NPC drafts. Silent merge по name — brittle. Текущий UI `review/page.tsx` заменяет `scaffold.npcs` целиком. Menять контракт без явного product decision — scope creep.

### GA-3: Known-IP Enrichment Interaction — **Option A (base step generates, IP enrichment later refines)**
- **D-06:** Base `generateNpcsStep` пишет полный personality для всех NPC (tier=key и tier=extra), используя existing known-IP/divergence prompt rules из `npcs-step.ts`.
- **D-07:** `enrichKnownIpWorldgenNpcDraft()` НЕ трогаем в Phase 64 (сейчас пишет `powerStats`, не personality). Если в будущем expand — может refine personality поверх базовых, но это отдельная фаза.
- **Причина:** current `known-ip-worldgen-research.ts:358` не пишет `identity.personality`. Base step обязан emit полный блок чтобы гарантировать parity для ВСЕХ worldgen NPC.

### GA-4: Sample Lines Quality — **Option A + B (inline with retry fallback)**
- **D-08:** `sampleLines` генерируются в том же per-NPC detail call. Prompt требует `2-3 actual phrases in the NPC's voice, not narrator commentary`. Schema: `z.array(z.string().max(300)).min(0).max(3)` (min 0 разрешает пустой массив для non-dialog NPC, но prompt пушит к минимум 2).
- **D-09:** Lightweight retry/repair: если после первой попытки `sampleLines.length === 0` или все строки generic placeholders (эвристика — детект "I am", "Hello", длина < 15), запускать ОДИН дополнительный targeted LLM-call с фокусом только на voice + sampleLines. Max 1 retry per NPC.
- **Причина:** `npcs-step.ts` уже делает per-NPC calls (не massive batch). Качество sample lines achievable inline. Retry покрывает edge-кейсы без doubling cost в common path.

### GA-5: Backfill Scope — **Option A (narrow backfill)**
- **D-10:** Расширить `backend/src/scripts/backfill-personality.ts` добавив режим "incomplete-personality-pack": target NPC where `personality.summary` present AND (`voice === ""` OR все остальные sub-поля пусты).
- **D-11:** Существующий skip-условие (skip если summary present) менять не требуется — добавить новый путь (flag `--mode=incomplete-pack` или автоматический detect). Opt-in, explicit.
- **D-12:** Backfill mandatory backup (per Phase 63 Plan 05 pattern): per-record JSON в campaign logs перед update. Idempotent.
- **Причина:** current backfill (Phase 63 Plan 05) skip-ает NPC с непустым `summary` — именно gap-NPC попадают под skip и остаются broken. Без narrow backfill prod-кампании с worldgen NPC останутся с silent drift.

### GA-6: Validation/Tests — **Options A + B required, C optional**
- **D-13:** **Unit test** на `generateNpcsStep` — asserts personality non-empty sub-fields (summary, voice, decisionStyle, worldview, contradictions[].length > 0, personalMythology, sampleLines[].length >= 2). Mock LLM return полного flat schema. Лежит в `backend/src/worldgen/__tests__/npcs-step.test.ts`.
- **D-14:** **Integration test** на `/api/worldgen/regenerate-section` (section=`npcs`) — проверяет что возвращаемый `scaffold.npcs[*].draft.identity.personality` имеет все sub-поля non-empty. Лежит в `backend/src/routes/__tests__/worldgen.test.ts`.
- **D-15:** **Unit test** на backfill script в incomplete-pack mode — verifies detect-predicate + enrichment logic.
- **D-16:** PinchTab E2E — optional, не блокирует phase exit. Слабый oracle для backend contract.

### Claude's Discretion
- Имя shared helper-модуля (например `backend/src/character/personality-schema.ts`).
- Точная структура retry-эвристики (D-09) — regex vs простая length-проверка.
- Formatting повторного prompt в retry.
- Prompt-engineering wording для D-08 (сколько конкретных instructions добавить).
- Decision — нужен ли `--dry-run` для backfill mode или reuse existing flag.

### Folded Todos
None — нет pending todos cross-referenced с Phase 64 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Artifacts (State & Prior Context)
- `.planning/ROADMAP.md` — Phase 64 section + Phase 63 success criteria
- `.planning/STATE.md` — текущий project state
- `.planning/REQUIREMENTS.md` — acceptance constraints
- `.planning/phases/63-personality-interiority-model/63-CONTEXT.md` — Phase 63 locked decisions (personality schema)
- `.planning/phases/63-personality-interiority-model/63-RESEARCH.md` — Phase 63 research findings
- `.planning/phases/63-personality-interiority-model/63-VALIDATION.md` — Phase 63 Nyquist validation strategy
- `.planning/phases/63-personality-interiority-model/63-05-backfill-PLAN.md` — backfill pattern reference

### Worldgen Pipeline (Core Fix Surface)
- `backend/src/worldgen/scaffold-steps/npcs-step.ts` — per-NPC detail call (GA-1 primary fix)
- `backend/src/worldgen/scaffold-generator.ts` — orchestration
- `backend/src/worldgen/__tests__/npcs-step.test.ts` — add unit test (GA-6 D-13)
- `backend/src/character/known-ip-worldgen-research.ts` — IP enrichment (Out-of-scope for personality per D-07)

### Character Schema & Adapters
- `backend/src/character/npc-generator.ts` — reference implementation (flat personality fields lines 29-35, mapping 111-118)
- `backend/src/character/record-adapters.ts` — `normalizePersonality`, `blankPersonality`, `fromLegacyScaffoldNpc`
- `shared/src/types.ts` — `CharacterPersonality` type (Phase 63 schema)

### Routes & Contracts
- `backend/src/routes/worldgen.ts:519-607` — `/regenerate-section` endpoint
- `backend/src/routes/schemas.ts:regenerateSectionSchema` — request shape (no existing-NPC data per GA-2 rationale)
- `backend/src/routes/__tests__/worldgen.test.ts` — add integration test (GA-6 D-14)

### Backfill (GA-5)
- `backend/src/scripts/backfill-personality.ts` — extend with incomplete-pack mode

### UI (Read-only reference)
- `frontend/components/world-review/personality-section.tsx` — consumer, shows all 7 sub-fields
- `frontend/components/world-review/npcs-section.tsx` — NPC tab UI
- `frontend/app/(non-game)/campaign/[id]/review/page.tsx:117` — full-replace regenerate behavior (GA-2 rationale)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `npc-generator.ts` schema (`generateNpcInputSchema` lines 29-35 flat + 111-118 mapping) — extract shared helper.
- `record-adapters.ts` `normalizePersonality()` + `blankPersonality()` — already handle missing sub-fields gracefully.
- `backfill-personality.ts` — mandatory-backup/idempotent pattern from Phase 63 Plan 05.

### Established Patterns
- Zod validation on every LLM tool-call.
- Per-entity detail call в `npcs-step.ts` (не bulk batch) → schema changes не добавляют token pressure catastrophically.
- Script-based backfill с dry-run + mandatory per-record backup.
- Error-handling: outer try/catch, `parseBody()`, `getErrorStatus()`.

### Integration Points
- `generateNpcsStep` called by: (a) initial scaffold generation pipeline (`scaffold-generator.ts`); (b) `/api/worldgen/regenerate-section` (worldgen.ts:594). Один fix закрывает оба entry-points.
- Prompt-assembler (`backend/src/engine/prompt-assembler.ts`) читает `identity.personality.*` — требует полный блок для runtime identity lines.
- `fromLegacyScaffoldNpc` preserves existing `draft.identity.personality` если присутствует — mapper из flat→nested должен запускаться ДО вызова этого helper.

</code_context>

<specifics>
## Specific Ideas

- **D-02 shared helper shape:** экспортировать `personalityFieldSchema` (Zod object fragment) + `mapFlatPersonalityToNested(flat): CharacterPersonality` из нового модуля. `npc-generator.ts` и `npcs-step.ts` импортируют обе.
- **D-09 retry heuristic:** detect "generic" sample line эвристикой — `line.length < 15` OR `/^(I am|I'm|Hello|Greetings|My name)/i.test(line)` OR все 2-3 строки идентичны по smart-dedupe. Trigger retry если triggered.
- **D-10 backfill predicate:** TypeScript-literal — `p.summary && p.summary.trim() !== "" && (!p.voice || p.voice.trim() === "") && (!p.decisionStyle || ...)`. Фактически "summary but rest empty".
- **Test assertions point references:** Phase 63 63-VALIDATION.md содержит Nyquist validation strategy — унаследовать формат для Phase 64.

</specifics>

<deferred>
## Deferred Ideas

- **Preserve-edits-on-regenerate (GA-2 Option C):** требует нового API контракта (отправлять current NPC drafts в body, merge by _uid). Отдельный phase если появится product need.
- **Known-IP personality refinement expansion (GA-3 Option B):** расширить `enrichKnownIpWorldgenNpcDraft()` чтобы refine personality поверх base (использовать canon voice samples из IP research). Отдельная фаза если LLM quality insufficient.
- **E2E PinchTab coverage (GA-6 Option C):** weak oracle для backend contract; можно запустить при regression concerns, но не blocker.

### Reviewed Todos (not folded)
None — discussion stayed within phase scope.

</deferred>

---

*Phase: 64-npc-personality-regeneration-parity*
*Context gathered: 2026-04-19 via discuss-phase with codex advisor*

# Phase 64: NPC Personality Regeneration Parity — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 64-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 64-npc-personality-regeneration-parity
**Areas discussed:** GA-1 Schema Extension Surface, GA-2 Regenerate Behavior, GA-3 Known-IP Interaction, GA-4 Sample Lines Quality, GA-5 Backfill Scope, GA-6 Validation/Tests
**Advisor:** codex CLI (user delegated technical analysis — "Я в технической части не разбираюсь, иди с кодексом подискутируй")

---

## GA-1: Schema Extension Surface

**Question:** Как worldgen начнёт emit полный personality блок?

| Option | Description | Selected |
|--------|-------------|----------|
| A. Extend `npcs-step.ts` detail Zod schema + prompt с flat personality полями | One existing per-NPC pass; lowest churn; closes worldgen + regenerate together; slight prompt/token growth | ✓ |
| B. Post-scaffold personality enrichment pass (second LLM call per NPC) | Clear separation; parallelizable; doubles calls; merge complexity; latency/cost | |
| C. Loop `npc-generator.ts` per worldgen NPC | Reuses route shape; highest cost; duplicates logic; wrong abstraction | |

**Codex rationale:** `npcs-step.ts:398` уже делает per-entity detail calls — это не "big batch quality" проблема. Extract shared personality fragment из `npc-generator.ts:29` чтобы prevent drift.

---

## GA-2: Regenerate-section Behavior

**Question:** `regenerate-section section=npcs` — full replace или preserve user-edited personality?

| Option | Description | Selected |
|--------|-------------|----------|
| A. Full replace (current behavior) | Matches route/UI contract; deterministic; overwrites unsaved edits | ✓ |
| B. Implicit merge/preserve existing personality | Protects edits; needs current NPC payload + brittle name-matching | |
| C. Explicit preserve flag (future) | Flexible; new API/product surface; deferred | |

**Codex rationale:** `routes/schemas.ts:743` не отправляет existing NPC drafts. `review/page.tsx:117` replaces `scaffold.npcs` wholesale. "Preserve edits" без нового контракта — hidden brittle behavior.

---

## GA-3: Known-IP Enrichment Interaction

**Question:** Где генерировать personality для tier=key known-IP NPC?

| Option | Description | Selected |
|--------|-------------|----------|
| A. Base step generates full personality; IP enrichment refines later (if expanded) | Guarantees parity для всех NPC; canon nuance approximate until enrichment expands | ✓ |
| B. Defer known-IP personality entirely to IP enrichment | Potential canon lift; current helper НЕ пишет personality | |
| C. Branch by tier/status | Fine-grained; more drift/branching risk | |

**Codex rationale:** `known-ip-worldgen-research.ts:358` пишет `powerStats`, НЕ `identity.personality`. Base generation обязан emit full block используя уже present known-IP/divergence prompt rules в `npcs-step.ts`.

---

## GA-4: Sample Lines Quality

**Question:** Как обеспечить качественные `2-3 actual phrases` в batch worldgen?

| Option | Description | Selected |
|--------|-------------|----------|
| A. Inline `sampleLines` в existing per-NPC detail call, enforce `2-3 actual phrases` | Cheap; per-NPC quality viable; stricter schema может увеличить retries | ✓ |
| B. Retry/repair только когда lines empty/generic | Low extra cost; small fallback complexity | ✓ (paired with A) |
| C. Separate lines-only pass | Best isolation; overkill | |

**Codex rationale:** `npcs-step.ts` уже делает per-NPC calls — voiced lines achievable inline. Tighten prompt/schema + lightweight retry на invalid outputs.

---

## GA-5: Backfill Scope

**Question:** Нужен ли отдельный backfill для NPC с summary-only personality от Phase 63-64 window?

| Option | Description | Selected |
|--------|-------------|----------|
| A. Narrow Phase 64 backfill для "incomplete personality pack" NPC | Fixes real bad records; low blast radius; needs new predicate | ✓ |
| B. Re-run Phase 63 backfill unchanged | Operationally easy; misses bugged records (skip предикат exclude-ит их) | |
| C. Skip backfill | Zero work; leaves silent prompt/UI drift | |

**Codex rationale:** `backfill-personality.ts:114` skip-ает любой record с non-empty `summary`. Gap-records имеют именно summary-only personality → Phase 63 backfill as-is НЕ repair-ит Phase 64 window. Добавить narrow NPC-only "incomplete pack" mode.

---

## GA-6: Validation/Tests

**Question:** Что proves parity?

| Option | Description | Selected |
|--------|-------------|----------|
| A. Unit test на `generateNpcsStep` personality completeness | Direct seam coverage; cheap; doesn't prove route wiring | ✓ (required) |
| B. Integration test на `/api/worldgen/regenerate-section section=npcs` | Proves second entry path; broader setup | ✓ (required) |
| C. PinchTab/E2E smoke | Catches UI regressions; weak oracle для backend parity | (optional) |

**Codex rationale:** Bug — backend contract drift, не UI. Required proof: step-level + route-level.

---

## Claude's Discretion
- Shared helper модуль имя (например `backend/src/character/personality-schema.ts`).
- Точная retry-эвристика (regex patterns, length thresholds).
- Retry prompt wording.
- Prompt-engineering для sample lines quality (instructions count).
- Backfill dry-run flag reuse vs новый.

## Deferred Ideas
- Preserve-edits-on-regenerate (GA-2 Option C) — требует новый API контракт.
- Known-IP personality refinement expansion (GA-3 Option B) — separate phase.
- E2E PinchTab (GA-6 Option C) — optional regression smoke.

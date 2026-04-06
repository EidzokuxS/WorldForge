# Phase 34: Worldgen Pipeline Rework — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 34-worldgen-pipeline-rework-1-entity-per-llm-call-with-inter-stage-validation
**Areas discussed:** Entity granularity, Validation passes, Context per call, Progress & SSE

---

## Entity Granularity

### Plan call granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Batch plan, single detail | Plan returns all names, each entity gets own detail call | ✓ |
| Batch plan, small detail | Plan returns all names, detail in batches of 2 | |
| Full single-entity | Even plans generate 1 name at a time | |

**User's choice:** Batch plan, single detail
**Notes:** Natural split — plans need holistic view, details benefit from focused attention.

### NPC plan structure

| Option | Description | Selected |
|--------|-------------|----------|
| Keep two plans | Key NPCs first, then supporting referencing key names | ✓ |
| Merge into one plan | Single plan call with tier field | |

**User's choice:** Keep two plans

### Execution order

| Option | Description | Selected |
|--------|-------------|----------|
| Parallel within stage | All detail calls fire simultaneously | |
| Sequential within stage | Each call sees all previously detailed entities | ✓ |
| Parallel with summary | Parallel + validation/enrichment pass | |

**User's choice:** Sequential within stage

### Prior entity context in sequential calls

| Option | Description | Selected |
|--------|-------------|----------|
| Brief summary | Name + truncated description (80 chars) | |
| Full detail | All fields (description, tags, connections) | ✓ |
| Structured summary | Name + tags + connections only | |

**User's choice:** Full detail

### Lore extraction

| Option | Description | Selected |
|--------|-------------|----------|
| Keep batch lore | One call extracts all cards | |
| Per-category lore | Split by category: location, faction, NPC, concept lore | ✓ |
| Per-entity lore | Each entity detail also produces lore inline | |

**User's choice:** Per-category lore

---

## Validation Passes

### Validation approach

| Option | Description | Selected |
|--------|-------------|----------|
| Code-only validation | Pure TypeScript checks, no LLM | |
| LLM validation pass | LLM reviews all entities for consistency | |
| Code + LLM hybrid | Code fixes mechanical, LLM for anomalies | |

**User's choice:** Other — "Сначала LLM, потом код. Мы не доверяем коду ничего, кроме самого простого."
**Notes:** User explicitly stated code is "тупой" and cannot detect anomalies. LLM is primary validator.

### Validation output format

| Option | Description | Selected |
|--------|-------------|----------|
| Return fixed entities | LLM returns corrected array | |
| Return issues list | LLM returns structured issue list, we re-gen broken entities | ✓ |
| Return patch instructions | LLM returns specific patches to apply | |

**User's choice:** Return issues list

### Validation rounds

| Option | Description | Selected |
|--------|-------------|----------|
| One round | Single validation + fix cycle | |
| Two rounds max | Two cycles then accept | |
| Until clean | Loop until LLM says "all ok", hard limit needed | ✓ |

**User's choice:** Until clean (with hard limit)

### Hard limit

| Option | Description | Selected |
|--------|-------------|----------|
| 3 rounds | Max ~9 additional calls per stage | ��� |
| 2 rounds | More predictable generation time | |

**User's choice:** 3 rounds

### Validation scope

| Option | Description | Selected |
|--------|-------------|----------|
| After each stage | 3 validations (locations, factions, NPCs) | |
| One final | 1 validation after all stages | |
| After each + final | 3 per-stage + 1 cross-stage | ✓ |

**User's choice:** After each + final

---

## Context Per Call

### Context overhead

| Option | Description | Selected |
|--------|-------------|----------|
| Full context always | Every call gets everything (~3k tokens overhead) | ✓ |
| Minimal + relevant | Only premise + names + relevant canonical names | |
| Tiered context | Full for plan/validation, minimal for detail | |

**User's choice:** Other — "Да и пофиг. Мы в основном в скорость LLM упираемся. Можно быструю модель для проверки."
**Notes:** User doesn't care about token overhead (GLM subscription). Suggested using fast model for validation.

### Validation model

| Option | Description | Selected |
|--------|-------------|----------|
| New Validator role | 5th role in Settings | |
| Hardcode fallback | Use existing fallback role | |
| Generator with override | Generator + model override in campaign config | |

**User's choice:** Other — "Используем judge, там уже стоит быстрая модель"
**Notes:** Judge role already has fast model configured. No settings changes needed.

---

## Progress & SSE

### Progress granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Stage-level progress | 5-7 coarse steps like current | |
| Entity-level progress | Each entity is a separate SSE event | |
| Two-tier progress | Stage-level main bar + entity sub-progress | ✓ |

**User's choice:** Two-tier progress

### SSE protocol

| Option | Description | Selected |
|--------|-------------|----------|
| Extend protocol | Add subStep/subTotal/subLabel to GenerationProgress | ✓ |
| Inline in label | Encode sub-progress in label text | |

**User's choice:** Extend protocol

---

## Claude's Discretion

- Zod schemas for validation issue lists
- Re-generation prompt structure for fixing flagged entities
- Logging/metrics for validation rounds
- Exact progress stage count and labels

## Deferred Ideas

None.

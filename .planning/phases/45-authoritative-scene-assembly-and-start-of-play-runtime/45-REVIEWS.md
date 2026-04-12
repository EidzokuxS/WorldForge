---
phase: 45
reviewers: [gemini, claude]
reviewed_at: 2026-04-12T10:16:12.7792202+03:00
plans_reviewed: [45-01-PLAN.md, 45-02-PLAN.md, 45-03-PLAN.md]
---

# Cross-AI Plan Review — Phase 45

## Gemini Review

# Phase 45: Authoritative Scene Assembly & Start-of-Play Runtime — Plan Review

## 1. Summary
The proposed plans provide a robust, TDD-driven approach to resolving the "narrative racing" and "premise-dump" issues that have degraded v1.1 gameplay. By introducing a clean two-stage Storyteller model (hidden action resolution followed by authoritative scene assembly and final narration), the architecture moves away from speculative streaming toward grounded, settled truth. The shift from a frontend lore-fallback to a neutral waiting state, combined with a dedicated backend `scene-assembly` seam, ensures that the player's first and subsequent impressions are always derived from the authoritative world state.

---

## 2. Strengths
- **Rigorous TDD (Plan 01):** Starting with failing regressions for both backend sequencing and frontend "premise-as-opening" behavior ensures that the implementation remains focused on the specific gameplay failures reported.
- **Authoritative Settlement (Plan 02):** Moving `tickPresentNpcs` before visible narration (D-01) is a critical correction. It ensures NPCs are part of the scene being described rather than "afterthoughts" that might contradict the narration the player just read.
- **Seam Separation:** The introduction of `scene-assembly.ts` provides a clear boundary for gathering player-perceivable facts. This prevents the Storyteller from having to hallucinate local consequences from raw state, aligning with D-04.
- **Frontend Neutrality (Plan 03):** Removing the premise fallback in `NarrativeLog` is the most direct fix for the "premise dump" bug, forcing the UI to wait for the actual runtime opening scene.

---

## 3. Concerns
- **Latency & Token Cost (MEDIUM):** The two-stage Storyteller model (Hidden Pass + Final Narration Pass) effectively doubles the Storyteller LLM calls per turn. Combined with the Oracle call and individual NPC ticks, a single turn could involve 4+ sequential LLM calls. In a streaming-first UI, this might lead to a noticeable "hang" before any text appears.
- **Context Drift between Passes (LOW):** The hidden pass might generate internal "reasoning" or "flavor" that justifies its tool calls. If the final pass only sees the *results* (e.g., "Item X was dropped") and the scene facts, it might lose some of the specific narrative justification generated in the first pass. 
- **Duplicate Suppression Logic (LOW):** Plan 02 mentions suppressing/collapsing duplicate output blocks. If this is a simple string comparison, it may be too brittle for LLM output (which often varies slightly in punctuation or phrasing). If it's prompt-based, it adds more weight to the final pass.

---

## 4. Suggestions
- **Optimize Hidden Pass:** To mitigate latency, consider if the "Hidden Pass" can be a faster/smaller model or a specialized prompt that focuses strictly on tool-use and logic, leaving all "narrative weight" to the final pass.
- **Consolidate Scene Facts:** Ensure `scene-assembly.ts` explicitly captures *why* a tool was used (e.g., the Oracle's reasoning) so the final Storyteller can narrate the "how" and "why" of the mechanical outcome without re-inventing the intent.
- **Streaming UI Feedback:** Since the player will no longer see "text-deltas" from the first pass, ensure the frontend `turnPhase === "streaming"` state provides enough visual feedback to keep the user engaged during the increased backend processing time.
- **Prose Cleanup Pattern:** For the "duplicate blocks" requirement, consider a "Sliding Window Duplicate Detection" or a simple post-processing utility that looks for large repeated paragraph chunks which sometimes occur in recursive model completions.

---

## 5. Risk Assessment
**Risk Level: MEDIUM**

**Justification:**
While the architectural change is technically sound and directly addresses the requirements, the **latency increase** is a material risk to the "feel" of a live text RPG. The transition from one visible stream to a "wait, then stream" model is a significant change in user experience. However, this risk is outweighed by the gain in **narrative integrity** (no more racing state) and **correctness** (no more premise dumps), which are the primary goals of v1.1. The TDD approach in Plan 01 significantly reduces the risk of implementation drift.


---

## Claude Review

Review написан. Коротко по ключевым находкам:

**Планы хорошие** — исследование эмпирически подтверждено (все три seam'а реальные), TDD-first подход правильный, scope чётко ограничен от Phase 46/47/50.

**Два критических пробела (HIGH):**

1. **Латентность удвоится** — два вызова LLM на ход вместо одного, а ни в одном плане нет ни бюджета по задержке, ни SSE-сигнала для скрытой фазы. Игрок увидит замороженный экран ~10-16с. Решение: `generateText` вместо `streamText` для скрытого прохода + SSE-событие `scene-settling`.

2. **Нет триггера генерации открывающей сцены** — убрали premise-fallback, но не описали кто и когда вызывает генерацию первого сообщения. Без этого игрок увидит пустой экран вместо premise. Нужен автоматический `POST /api/chat/opening` при загрузке `/game` с 0 сообщений.

Остальные concerns (обработка ошибок скрытого прохода, отсутствие типа `SceneEffects`, нет E2E smoke-теста) средней тяжести и решаемы добавлением задач в существующие планы.


---

## Consensus Summary

Both reviewers agree the phase is directionally correct: the reported seams are real, the TDD-first split is appropriate, and the clean separation between hidden resolution, authoritative scene settlement, and final visible narration is the right architectural direction for SCEN-01.

### Agreed Strengths
- The plans are grounded in real runtime seams rather than vague prose complaints.
- Starting with explicit failing regressions is the right way to keep the implementation from collapsing into a prompt-only fix.
- Splitting authoritative local settlement from final visible narration is the correct causal contract for Phase 45.
- Removing premise-as-opening behavior on /game is a necessary and correctly scoped frontend fix.

### Agreed Concerns
- HIGH: Two-pass narration increases latency materially, but the plans do not yet lock a UX/runtime contract for the hidden pass. Without an explicit progress signal or budget, /game can appear frozen while the hidden pass and local settlement complete.
- MEDIUM: The final narration pass risks losing intent/context from the hidden tool-driving pass unless scene assembly carries enough authoritative explanation, not just state deltas.

### Reviewer-Specific Concerns
- Claude: The plans do not yet specify who triggers the very first opening-scene generation after removing the premise fallback. Without an explicit opening-generation path, /game can degrade from a premise dump to an empty screen.
- Claude: Hidden-pass failure handling, stronger typed SceneEffects, and an E2E smoke for the new opening flow are not spelled out yet.
- Gemini: Duplicate-block suppression can become brittle if it is implemented as naive string comparison rather than paragraph/block-aware normalization.

### Divergent Views
- Gemini treats the second-pass narrative context-loss risk as low if scene assembly is strong.
- Claude focuses more on missing control-flow detail than on the prose-generation risks themselves, especially for opening-scene creation and hidden-pass failure behavior.
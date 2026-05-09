---
phase: 58
slug: pipeline-observability-logging
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-16
completed: 2026-04-16
---

# Phase 58 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Entered Task 58-04-02 as a draft template; rewritten wholesale on plan
> completion with the full test map, EXPECTED_18_SEAMS reference, and
> `nyquist_compliant: true` promoted (checker WARNING 3 resolution).

---

## Test Infrastructure

| Property                  | Value                                                                                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**             | vitest ^3.2.4 (backend)                                                                                                                                                                                                                            |
| **Config file**           | `backend/vitest.config.ts`                                                                                                                                                                                                                         |
| **Quick run command**     | `npm --prefix backend test -- --run src/lib/__tests__/ src/settings/__tests__/manager-observability.test.ts`                                                                                                                                        |
| **Full suite command**    | `npm --prefix backend test -- --run`                                                                                                                                                                                                                |
| **Wave-4 acceptance run** | `cd backend && npx vitest run src/engine/__tests__/turn-processor.observability.test.ts src/engine/__tests__/turn-processor.observability-concurrency.test.ts src/routes/__tests__/chat.observability-stream-safety.test.ts` |
| **Estimated runtime**     | Full backend suite ~50 s; wave-4 acceptance subset ~1.5 s                                                                                                                                                                                            |

---

## EXPECTED_18_SEAMS

Canonical 18-seam matrix. Source of truth lives at
`backend/src/engine/__tests__/fixtures/expected-seams.ts` (exported as the
`EXPECTED_18_SEAMS` constant). A single mocked turn through the REAL
chat route (`app.request("/api/chat/action", ...)`) MUST leave a JSONL
file whose unique event names cover every item in this list:

```
 1. turn.begin
 2. movement.detect
 3. target.context
 4. oracle.call
 5. sse.emit                    (seam 5 = oracle_result specifically; seam 17 = generic)
 6. prompt.assembled            (fires twice: hidden-tool-driving + final-narration)
 7. storyteller.hidden.stream
 8. tool.call
 9. db.write
10. npcAgent.tick
11. storyteller.visible.call
12. reflection.tick
13. faction.tick
14. embedder.call
15. vector.write
16. turn.end
17. llm.attempt
18. sse.stream.aggregate
```

Acceptance assertion:

```typescript
const actualSeams = collectSeamsFromJsonl(logsRoot, campaignId);
const missing = EXPECTED_18_SEAMS.filter((s) => !actualSeams.has(s));
expect(missing).toEqual([]);
```

Seam 5 (`sse.emit` for `oracle_result`) shares its event NAME with
seam 17 (`sse.emit` generic). Seam 5 is proved specifically by
`events.some(e => e.event === "sse.emit" && e.payload?.type === "oracle_result")`.

---

## Sampling Rate

- **After every task commit:** quick run (logger unit tests, ~8 s)
- **After every plan wave:** full backend suite (~50 s)
- **Before `/gsd:verify-work`:** full suite must be green + manual turn smoke
- **Max feedback latency:** 50 s (well under the 58 s Nyquist bound)

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement   | Test Type                 | Automated Command                                                                                                                                                                                                      | File Exists | Status |
| -------- | ---- | ---- | ------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ |
| 58-01-01 | 01   | 1    | REQ-OBSERV-01 | unit                      | `npx vitest run shared/src/__tests__/settings.test.ts backend/src/routes/__tests__/schemas.test.ts`                                                                                                                    | ✅           | ✅ green |
| 58-01-02 | 01   | 1    | REQ-OBSERV-01 | unit ×8                   | `npx vitest run backend/src/lib/__tests__/ backend/src/settings/__tests__/manager-observability.test.ts`                                                                                                               | ✅           | ✅ green |
| 58-02-01 | 02   | 2    | REQ-OBSERV-01 | integration               | `npx vitest run backend/src/engine/__tests__/turn-processor.test.ts backend/src/engine/__tests__/prompt-assembler.test.ts`                                                                                             | ✅           | ✅ green |
| 58-02-02 | 02   | 2    | REQ-OBSERV-01 | integration               | `npx vitest run backend/src/engine/__tests__/tool-executor.test.ts backend/src/engine/__tests__/oracle.test.ts`                                                                                                        | ✅           | ✅ green |
| 58-02-03 | 02   | 2    | REQ-OBSERV-01 | integration               | `npx vitest run backend/src/engine/__tests__/npc-agent.test.ts backend/src/engine/__tests__/reflection-agent.test.ts backend/src/vectors/__tests__/episodic-events.test.ts backend/src/vectors/__tests__/lore-cards.test.ts` | ✅           | ✅ green |
| 58-03-01 | 03   | 3    | REQ-OBSERV-01 | integration (real route)  | `npx vitest run backend/src/routes/__tests__/chat-turn-context.test.ts`                                                                                                                                                | ✅           | ✅ green |
| 58-03-02 | 03   | 3    | REQ-OBSERV-01 | unit                      | `npx vitest run backend/src/lib/__tests__/prompt-dump.test.ts`                                                                                                                                                         | ✅           | ✅ green |
| 58-04-01 | 04   | 4    | REQ-OBSERV-01 | integration (real route)  | `npx vitest run backend/src/engine/__tests__/turn-processor.observability.test.ts`                                                                                                                                     | ✅           | ✅ green |
| 58-04-02 | 04   | 4    | REQ-OBSERV-01 | integration (real route)  | `npx vitest run backend/src/engine/__tests__/turn-processor.observability-concurrency.test.ts backend/src/routes/__tests__/chat.observability-stream-safety.test.ts`                                                   | ✅           | ✅ green |

*Status legend: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All Wave 0 gaps are covered by Plan 58-01:

- `backend/src/lib/__tests__/` — 8 new logger unit test files (context,
  failure, file-destination, multistream, redact, role-toggle, truncate,
  plus rewritten `logger.test.ts` compat suite)
- `backend/src/settings/__tests__/manager-observability.test.ts` — 7
  normalize-and-apply cases
- `backend/src/routes/__tests__/schemas.test.ts` — 4 new observability
  Zod schema cases
- `shared/src/__tests__/settings.test.ts` — observability describe block
  (defaults + round-trip)

No additional Wave 0 work required for Plans 58-02 / 58-03 / 58-04.

---

## Manual-Only Verifications

| Behavior                                        | Requirement   | Why Manual                                        | Test Instructions                                                                                                                                                                     |
| ----------------------------------------------- | ------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pretty console tail readable in dev             | REQ-OBSERV-01 | Visual formatting (colors, timestamps, prefixes)  | `cd backend && npm run dev` → run a turn via the UI → eyeball the terminal output for pino-pretty formatted lines.                                                                    |
| `dumpFullPrompts` side-car files on disk        | REQ-OBSERV-01 | Binary integrity + filesystem permissions         | Toggle `Settings > Observability > Dump Full Prompts` → run one turn → open `campaigns/{id}/logs/turn-{tick}-{turnId8}-prompt-hidden-tool-driving.txt` and verify the full prompt verbatim. |
| Manual smoke confirms 18+ event names per turn  | REQ-OBSERV-01 | Requires a real LLM / real DB / real vector stack | Start backend + frontend, run one turn via the UI, then `jq -r '.event' campaigns/{id}/logs/turn-*-*.jsonl \| sort -u \| wc -l` → expect ≥ 18.                                         |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (every command uses `--run`)
- [x] Feedback latency < 58 s (full backend ~50 s; acceptance subset ~1.5 s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-16

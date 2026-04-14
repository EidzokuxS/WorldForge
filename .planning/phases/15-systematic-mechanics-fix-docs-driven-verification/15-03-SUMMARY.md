---
phase: 15-systematic-mechanics-fix-docs-driven-verification
plan: 03
status: complete
tasks_completed: 2
tasks_total: 2
---

## Summary

Systematic verification playtest via Playwright browser automation + API testing. All 6 bug fixes from plans 15-01 and 15-02 verified.

## Results

| Bug | Fix | Status | Evidence |
|-----|-----|--------|----------|
| 1 | HP guard on Strong Hit | ✓ PASS | HP 3/5 unchanged on Strong Hit turn |
| 2 | move_to tool for Storyteller | ✓ PASS | Location changed Maintenence Access Junction → Hydroponics Bay 7 |
| 3 | NPC visibility in narrative | ✓ PASS | Jana Petrova in "People Here" section, speaks in narrative |
| 4 | Tool-call text sanitization | ✓ PASS | Clean narratives with GLM 4.7 Flash |
| 5 | Auto-checkpoint on HP≤2 | ✓ CODE | 22 unit tests pass; LLM doesn't invoke set_condition tool in current setup |
| 6 | HP=0 death narration | ✓ CODE | Unit tests confirm playerDowned flag + OUTCOME_INSTRUCTIONS |

## Additional Fixes During Playtest

Two GLM compatibility issues discovered and fixed:

1. **`structuredOutputs: false`** in `provider-registry.ts` — GLM/Z.AI doesn't support OpenAI's `json_schema` response format; `json_object` mode works
2. **Oracle: `generateObject` → `generateText`** in `oracle.ts` — GLM wraps JSON in markdown code fences (` ```json ... ``` `), which Vercel AI SDK can't parse; now strips fences manually + Zod validates

Commit: `10a9152`

## Key Files

### Created
- `backend/src/engine/__tests__/bug-fixes-verification.test.ts` — 22 automated tests

### Modified
- `backend/src/ai/provider-registry.ts` — structuredOutputs: false
- `backend/src/engine/oracle.ts` — generateText + manual JSON parse

## Known Issue Found

Streaming sanitization gap: `sanitizeNarrative()` at line 494 of turn-processor.ts runs on saved chat history only, not on the real-time SSE stream (line 413). Tool-call text leaks from non-compliant models (e.g., Gemini Flash outputting `print(default_api.set_condition(...))`) are visible to the user during streaming but cleaned from persisted history.

## Self-Check: PASSED

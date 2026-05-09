# Phase 87 Plan 87-03 Summary

## Outcome

Completed the code-side burn-down for `P86-F001`: future-relevant concrete pressure should no longer enter the visible turn path as ungrounded prose.

The fix does not disable tools and does not add a generic persist-anything fallback. It tightens the GM pipeline at three seams:

- GM Read may still choose `direct`, `continue`, or `clarification` for local sensory color and ordinary conversation.
- If GM Read tries to put actors, props, obligations, routes, danger/posture changes, or combat aftermath into a no-mutation path, validation repairs it toward `tool_plan`, `roll_oracle`, or `combat_transition`.
- Tool-loop text and narrator packets now share the same principle: future-relevant pressure needs an accepted state-bearing backend observation, while failed or scene-local observations cannot become durable narrator truth.

## Changed Files

- `backend/src/engine/future-relevant-pressure.ts`
  - Added a shared detector for concrete pressure patterns found in Phase 86 evidence.
- `backend/src/engine/gm-turn-read.ts`
  - Validates no-mutation GM Read fields (`sceneQuestion`, guardrails, direct/continue/clarification text) against future-relevant concrete pressure.
  - Allows repair from bad no-mutation reads into tool-backed/oracle/combat paths.
- `backend/src/engine/prompt-contracts.ts`
  - Tightened the GM Read contract so `direct`/`continue`/`clarification` cannot carry durable pressure.
- `backend/src/engine/gm-tool-loop.ts`
  - Reused the shared pressure detector.
  - Reused the common successful-observation ref updater from `tool-execution-context`.
- `backend/src/engine/tool-execution-context.ts`
  - Provides the shared same-loop observation ref updater for accepted `reveal_location`, `move_to`, `spawn_npc`, and `spawn_item`.
- `backend/src/engine/narrator-packet.ts`
  - Keeps narrator action effects tied to successful tool results and accepted tool payload truth.
- Tests updated:
  - `backend/src/engine/__tests__/gm-turn-read.test.ts`
  - `backend/src/engine/__tests__/gm-tool-loop.test.ts`
  - `backend/src/engine/__tests__/tool-execution-context.test.ts`
  - `backend/src/engine/__tests__/narrator-packet.test.ts`

## Verification

- `npm --prefix backend exec vitest run src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/tool-execution-context.test.ts`
  - Passed: 4 files, 46 tests.
- `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.empty-narration.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts`
  - Passed: 2 files, 7 tests.
- `npm --prefix backend run typecheck`
  - Passed.
- `git diff --check -- ...`
  - Passed with only CRLF warnings.

## Live Evidence Note

The Phase 86 overnight worker finished while this plan was being verified. It exited with code `1` after the harness lost backend connectivity (`ECONNREFUSED`) during `drowned-observatory/social-pressure` turn 9. This is a separate Phase 86 closeout/infrastructure defect and does not invalidate the deterministic 87-03 regression tests.

`P86-F001` remains focused-rerun pending until a Phase 87 live rerun proves that mutation-heavy pressure now produces accepted backend observations or stays local/non-durable.

## Residual Risk

- The pressure detector is deliberately narrow and based on the Phase 86 evidence set. It catches the known failure modes without trying to classify every possible story sentence.
- A future rerun may reveal another pressure shape that needs to be added, but the architectural boundary is now in the right place: GM Read path choice, tool-loop grounding, and narrator packet truth all enforce the same rule.

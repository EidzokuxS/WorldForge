# Task 164: Initial player Narrator auto transport

## Contract

The initial Campaign Play player-action Narrator request now asks for `structuredOutputMode: "auto"`. For the existing `api.z.ai` capability this resolves to native JSON. The request keeps the storyteller role, `zai-coding-plan/glm-5-turbo`, bypass reasoning, strict local schema and semantic guards, operation/receipt identity, deadline, acceptance CAS, persistence, mechanics, UI, and visible copy unchanged. Opening Narrator and every other role remain unchanged. A `narration_invalid` result still uses the existing bounded `tool` recovery; provider/transport recovery still uses the existing `auto`/native-JSON path with its default-reasoning override.

Semantic-review verdict: "This changes one internal structured-output transport strategy. It changes no prompt, model instruction, player-visible copy, or narrative semantics; strict local validation remains authoritative."

## Repair and impact

The only production edit is the default argument of `runNarration` inside `createCampaignPlayTurnRuntime` in `backend/src/campaign-play/turn-runtime.ts`, changing `tool` to `auto`. The existing application call remains the initial attempt; recovery calls continue to pass their explicit modes. No Opening Narrator, Judge, Game Master, Actor Replanner, legacy storyteller, provider/model, prompt/schema/compiler, deadline, recovery, persistence, mechanics, or UI code changed.

Fresh current-source GitNexus impact for `createCampaignPlayTurnRuntime` was HIGH (14 upstream symbols, two direct callers, four affected processes: drive, resume, recoverNarration, and admitTurn). Direct callers were `createCampaignPlayApplication.createDefaultTurnRuntime` and the seeded replay fixture. This real blast-radius warning was recorded before the bounded source-qualified edit; no other executable symbol was changed.

## Automated evidence

- `npm --prefix backend test -- --run src/campaign-play/turn-runtime.test.ts`: passed (68 tests). Initial player-action requests are asserted as `auto`; narration-invalid recovery is `tool`; provider/transport recovery remains `auto`; normal success remains one attempt with one proper scene; packet, receipt, operation, deadline, mechanics, and SQLite integrity/foreign-key assertions remain covered. The test fixture emits native JSON text when the selected test capability is not tool mode, preserving the existing scenario contracts.
- `npm --prefix backend test -- --run src/campaign-play/narrator.test.ts src/campaign-play/campaign-play-application.test.ts src/campaign-play/opening-runtime.test.ts src/ai/__tests__/structured-output-capabilities.test.ts src/ai/__tests__/generate-object-safe.test.ts`: passed (98 tests). This includes provider capability routing, strict output boundary behavior, application recovery, and unchanged Opening role coverage.
- Backend typecheck, build, GitNexus `detect_changes`, and the final diff/staged-path review are required before commit and will be recorded below.

## Fresh rendered journey

Pending the next unused fresh pristine lane after this commit. It must prove the exact lowwater-ledger setup, first action native JSON plus bypass reasoning, one proper scene and unique binding with no recovery, then continue to 60/60 unique bindings and same-page reload or freeze at the first genuine defect.

## Acceptance handoff

| Criterion | Evidence | Result |
| --- | --- | --- |
| Initial player Narrator requests auto and Z.AI resolves native JSON | Turn-runtime mode assertions and structured-output capability suite | Pass |
| Initial storyteller reasoning remains bypass; provider/model and strict local guards remain authoritative | Existing turn-runtime/application and Narrator suites | Pass |
| Opening and other role constructions remain unchanged | Opening runtime and application role-construction suites | Pass |
| Existing invalid/provider recovery, bounded attempts, identity, deadline, persistence, mechanics, CAS, and late-result fences remain unchanged | Turn-runtime/application recovery and fence suites | Pass |
| Fresh rendered action and 60/60 plus reload | Next pristine lane | Pending |

## Cleanup

Frozen r111 and r112 remain untouched. No implementation-time provider call, direct database/API write, replay, Resume, Restore, or retry was used. AGENTS.md and CLAUDE.md remain pre-existing unstaged changes and are not part of this repair.

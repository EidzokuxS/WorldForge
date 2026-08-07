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
- `npm --prefix backend run typecheck`: passed.
- `npm --prefix backend run build`: passed.
- `git diff --check`: passed (only existing line-ending warnings).
- GitNexus `detect_changes --repo WorldForge --scope staged`: low risk; three expected files/symbols (`createCampaignPlayTurnRuntime`, `runNarration`, and the test fixture `doGenerate`), zero affected processes, and no unrelated role or execution-flow change.
- Exact production commit `cf26da632e42e809f2450b8e7b544f55c8c88cca` was pushed to `origin/feat/revamp`; local and origin matched after push. Only `backend/src/campaign-play/turn-runtime.ts`, `backend/src/campaign-play/turn-runtime.test.ts`, and this note were staged. AGENTS.md and CLAUDE.md remained unstaged with their pre-existing hashes.

## Fresh rendered journey

Fresh lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r113` used only the exact materialized template `lowwater-ledger-pristine-93a09e46-20260719` (state SHA-256 `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`; config SHA-256 `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`) and canonical Brina card SHA-256 `4B48DE7A32DF6A6BE5A91AB12F09BB87926B40D5940348C7581E298EAA12B60A`. Setup was one import, one Save/Continue, lower-wards, Local, Already here, Looking for work, and one Begin.

The first rendered action selected `Talk to Dren Vask: ask why no visitors` once. It admitted one player turn and completed with one proper scene, one accepted Narrator attempt, three unique receipts, one settled actor job, enabled controls, and no Narrator recovery. The backend `llm.attempt` record at `13:53:30.817` proves `requestedMode: "auto"`, `actualMode: "native_json"`, `model: "glm-5-turbo"`, `reasoningLen: 0`, `reasoningTokens: 0`, `finishReason: "stop"`, and one attempt. This is the live bypass-reasoning result; the persisted narration attempt keeps its canonical semantic `strict_object` label, as expected.

Action 2 selected the currently rendered `Talk to Dren Vask: press about the timing of the order` once and admitted one player turn. Its initial Narrator request also reached native JSON (`14:01:11.218`, `requestedMode: "auto"`, `actualMode: "native_json"`, one attempt, `reasoningLen: 0`), but the returned proposal failed the unchanged semantic guard: `narrator_visible_actor_observation_mismatch`, `beats[0].text`, the only allowed observed actor was Dren Vask, and the text named Vedris Kast. The existing bounded `narration_invalid` recovery then used `tool_mode`; at `14:01:12.774` Z.AI returned `Invalid API parameter, please check the documentation.` The operation ended `provider_unavailable` on attempt 2, with no accepted Narrator attempt and no proper scene. The lane froze immediately at this first genuine defect; no third action was submitted.

Live counts are therefore 2 completed player-action turns, 1 uniquely bound browser action, 1 proper scene, and 0 completed checkpoints. Read-only SQLite proof is `pragma integrity_check = ok` with an empty `pragma foreign_key_check`; the second turn has two unique receipts, a failed Narrator operation, and no proper-scene row. Full rendered/authority evidence is preserved under `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r113.session/`, including `r113-terminal.json`, `actions/action-001-evidence.json`, `actions/action-002-evidence.json`, `browser-actions.jsonl`, `backend.stdout.log`, the normalized `r113-mode-trace.md`, and the action screenshots.

## Acceptance handoff

| Criterion | Evidence | Result |
| --- | --- | --- |
| Initial player Narrator requests auto and Z.AI resolves native JSON | Turn-runtime mode assertions and structured-output capability suite | Pass |
| Initial storyteller reasoning remains bypass; provider/model and strict local guards remain authoritative | Existing turn-runtime/application and Narrator suites | Pass |
| Opening and other role constructions remain unchanged | Opening runtime and application role-construction suites | Pass |
| Existing invalid/provider recovery, bounded attempts, identity, deadline, persistence, mechanics, CAS, and late-result fences remain unchanged | Turn-runtime/application recovery and fence suites | Pass |
| Fresh rendered action and 60/60 plus reload | r113 first action: native JSON, bypass reasoning, proper scene, enabled controls, one binding; r113 action 2 froze at semantic guard failure followed by existing provider-unavailable recovery | First action pass; endurance blocked at 2/60 and 1/60 |

## Cleanup

Frozen r111 and r112 remain untouched. No implementation-time provider call, direct database/API write, replay, Resume, Restore, or retry was used. r113 owned roots were backend PID 34372, frontend PID 69404 (UI child 45472), Chrome/CDP PID 63080, with ports 4000/4001/4002 and the r113 browser profile; all descendants and listeners were stopped and independently verified absent. AGENTS.md and CLAUDE.md remain pre-existing unstaged changes and are not part of this repair.

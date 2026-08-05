# Task 121: Automatic external transport recovery

## Contract

- Base, origin/feat/revamp, and head before the change: `ce4604a83b4f43b38392faca6584259c8a81e806`.
- Actor/surface: a Campaign Play player submitting the existing Opening or player-action turn through the existing Campaign Play page.
- Trigger: the first authoritative external stage attempt returns persisted `provider_unavailable` with `explicit_resume_required` and attempt 1.
- Positive outcome: the same interrupted stage is resumed exactly once through the existing fresh-epoch `resumeInterruptedStage` path; a successful second attempt continues the existing state machine without mechanics or narration duplication.
- Negative outcome: a second `provider_unavailable` remains interrupted with Resume eligible; no automatic attempt 3.
- Forbidden: new actions, receipts, results, mechanics authority, visible copy, settings, provider fallback, prompt/schema/model changes, hidden replay, Task 120 narration recovery changes, or automatic recovery for non-provider interruption codes.

## Implementation

`backend/src/campaign-play/campaign-play-application.ts` now keeps the existing `drive` loop as the only automatic external-stage recovery driver. It schedules one pending resume only when the just-finished non-resume invocation returns `explicit_resume_required`, `errorCode = 'provider_unavailable'`, and `attempt = 1`. The returned interrupted stage and worker epoch are passed unchanged to `resumeInterruptedStage`; a local guard prevents a second automatic resume. All other recovery kinds and codes retain their existing return behavior.

`backend/src/campaign-play/campaign-play-application.test.ts` extends the existing Opening runtime fixture to persist an accepted retry or a second interruption and adds coverage for successful one-time recovery, second-failure stop, and the excluded `model_contract_invalid`, `stage_timeout`, and `stage_budget_exceeded` cases. Assertions cover retry inputs, attempt/epoch rows, turn identity, no mechanics receipts or Opening narration, and SQLite integrity.

## Review and evidence

- GitNexus broad `createCampaignPlayApplication` impact is the known stale-index CRITICAL overestimate (538 symbols/94 processes). Source-confirmed exact runtime resume interfaces were LOW risk (Opening runtime: one focused test caller; turn runtime: no indexed upstream callers); the local `drive` loop is the only edited product seam.
- Humanizer/deslop review: no rewrite needed; this note uses concrete evidence language and contains no prompt, model instruction, schema/compiler, or visible-copy change.
- Focused application suite: `npm --prefix backend test -- --run src/campaign-play/campaign-play-application.test.ts` — 1 file, 12 tests passed.
- Directly affected suites: the application, Opening runtime, turn repository, and turn runtime suites passed — 4 files, 122 tests passed. This includes existing explicit Resume, process recovery, replay, stale-epoch, and Task 120 narration-recovery coverage.
- Backend typecheck: `npm --prefix backend run typecheck` — passed.
- `git diff --check` — passed; only expected CRLF conversion warnings for the dirty checkout.
- GitNexus `detect_changes --scope all --repo WorldForge` — passed, low risk, 4 files/15 indexed symbols and 0 affected processes. The stale index omitted the edited application source and task note; source review confirms the product edit remains confined to the local `drive` loop.
- Rendered Campaign Play recovery/happy-path journey: unavailable. This packet has no callable browser surface and no supported task-safe provider fault-injection seam; no seam was invented, so no rendered behavior claim is made. Automated application-driver/storage evidence covers the recovery path.

## Scope and cleanup

No commit or push. Preserve pre-existing dirty `AGENTS.md` and `CLAUDE.md`. No task-owned process or disposable artifact remains.

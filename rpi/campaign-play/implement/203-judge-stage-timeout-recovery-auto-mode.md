# Task 203: Judge stage-timeout recovery auto mode

## Contract

When a player-action Judge attempt 1 persists `error_code="stage_timeout"` without Judge recovery feedback, the existing single automatic attempt 2 requests structured-output mode `auto` instead of `tool`. Attempt 1 remains `auto`; Judge attempt 2 with final-validation recovery feedback remains `auto`; Judge attempt 2 after every other no-feedback interruption remains `tool`. Model selection, prompts, schemas, deadlines, retry eligibility, attempt count, identity/CAS fencing, mechanics, persistence, UI, and player-visible copy remain unchanged.

## Experience contract

- Actor: Campaign Play player.
- Semantic layer/surface: internal Judge automatic recovery reached through the built Campaign Play UI.
- Trigger: a full-authority player action whose first Judge attempt reaches the local stage-timeout boundary without a final-validation feedback artifact.
- Observable outcome: one automatic attempt 2 keeps the same turn/stage/input/frame/world authority, uses the configured normal model, requests `auto`, and either accepts one Judge artifact once or reaches the existing terminal boundary without attempt 3 or downstream write.
- Forbidden surfaces: player-visible copy/UI, prompt text, Judge schema/compiler/final validation, Game Master, Actor Replanner, Narrator, provider/model selection, deadline arithmetic, retry count, persistence schema, mechanics, or routes.

## Impact and implementation

Entry was `d7650e79ec3f138d1c0ef9ad992b82d6947eb6bf` with local and origin equal. Protected `AGENTS.md` and `CLAUDE.md` dirt was preserved byte-for-byte and unstaged. Exact-current GitNexus impact for the edited private `structuredOutputModeForExternalAttempt` selector is LOW: two direct callers, two Campaign Play processes, and one module. The enclosing `createCampaignPlayTurnRuntime` reports HIGH transitive impact (14 impacted symbols, two direct callers, four processes: drive, resumeTurn, admitTurn, and recoverNarration; Campaign Play plus Engine modules). Main explicitly authorized that disclosed enclosing-owner fan-out only for this private selector conditional; no other HIGH/CRITICAL target or production owner was edited.

The implementation retains the existing feedback-bearing Judge attempt-2 `auto` branch, then reads only the previous persisted Judge model-stage `error_code` for a no-feedback attempt 2 and returns `auto` when it is exactly `stage_timeout`; all other no-feedback Judge branches remain `tool`. The Game Master selector, model selector, prompt/schema paths, deadline arithmetic, persistence, and runtime fences are unchanged.

Prompt/copy review is not applicable: no prompt, model instruction, player-visible copy, or substantial product prose changed. Humanizer/deslop are not applicable.

## Static evidence before live validation

- Focused `src/campaign-play/turn-runtime.test.ts`: all 75 assertions passed. The timeout/no-feedback Judge sequence is `auto`, `auto`; final-validation feedback remains `auto`, `auto`; model-contract-invalid and provider-unavailable no-feedback cases remain `auto`, `tool` with unchanged model selection; initial Judge and Game Master neighboring branches remain covered.
- The normal focused run and a one-fork, single-file rerun both reported the known post-pass Vitest worker-shutdown error `Timeout calling "onTaskUpdate"` after all assertions passed. No assertion failed; the clean rerun did not exit 0 because the same harness error persisted.
- Backend typecheck, production build, directly affected Campaign Play application and Judge suites, and `git diff --check` are required before the implementation commit and are recorded below after execution.
- Staged GitNexus `detect_changes` must show only this note, `turn-runtime.ts`, and its focused test, with the authorized private selector flow and no additional production owner or process. Protected files remain unstaged.

## Live r151 evidence

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r151` for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66` from the pushed implementation commit. Canonical template/config/card hashes and the one-time rendered setup, Opening, checkpoints, terminal boundary, authoritative runtime/SQLite evidence, cleanup, and any natural Task 203 recovery are appended here after the fresh lane. Generated session/world-run evidence remains uncommitted.

## Acceptance handoff

Static mode coverage maps every Judge and Game Master selector branch, unchanged model selection, shared identity/deadline, one automatic retry, and no-attempt-3 fencing to the focused runtime tests. The built r151 journey and any natural timeout recovery are unavailable until the pushed implementation is exercised; no live recovery, 60-action, checkpoint, or reload claim is made before that lane runs.

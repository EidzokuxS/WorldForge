# Actor Replanner step placement

## Contract

- Base: `feat/revamp` at `a4924d39a6a4cfbdcadaf6a3a4086bc958acb1a4`; no commit or push.
- Actor: Campaign Play player; semantic layer: private living-world actor planning after authoritative player-action settlement; surface: existing Campaign Play play page.
- Trigger: a due actor receives an Actor Replanner model call during a player turn.
- Observable outcome: the model is instructed to place `steps` only at proposal top level, while the existing strict schema, parser, compiler, grounding review, recovery, provider/model selection, persistence, player turn, narration, and visible world contracts remain unchanged.
- Forbidden: schema relaxation, unknown-field relocation or normalization, retry/fallback changes, semantic or UI changes, and hidden failed replans.

## Patch

- `backend/src/campaign-play/actor-replan-prompts.ts`: added one explicit nesting instruction immediately after the existing schema-return instruction. It names the five top-level fields, makes `steps` a top-level array, forbids `intent.steps`, and states the proposal-level and step-level field ownership.
- `backend/src/campaign-play/actor-replan-prompts.test.ts`: refreshed assertions for the current one-step/lazy-plan prompt contract and added regressions for prompt placement, strict rejection of `intent.steps`, and acceptance of an otherwise valid top-level `steps` proposal.
- No schema, parser, compiler, grounding-review, retry, model/provider, reasoning, persistence, or UI files changed.

## Reviews and static evidence

- GitNexus upstream impact for `buildCampaignPlayActorReplanPrompt`: exact target, LOW risk, two direct callers (`createCampaignPlayActorReplanner.replan` and the prompt test), zero process flows; index was one commit behind HEAD and the source call sites were confirmed directly before editing.
- Humanizer verdict: pass. The added instruction is concrete, direct, and preserves the existing contract without anthropomorphic or promotional wording.
- Deslop verdict: pass. The added instruction has no filler, no hidden fallback, and no unnecessary repetition beyond the explicit nesting/forbidden-field distinction required by the failure.
- Focused `npm --prefix backend test -- --run src/campaign-play/actor-replan-prompts.test.ts`: 11/11 passed.
- Focused `npm --prefix backend test -- --run src/campaign-play/actor-replan-prompts.test.ts src/campaign-play/actor-replanner.test.ts`: 16/16 passed.
- `npm --prefix backend run typecheck`: passed (exit 0).
- `git diff --check`: passed (exit 0; only Git's existing LF/CRLF warnings were emitted).
- Final GitNexus `detect-changes --scope unstaged --repo WorldForge --limit 100`: 4 files, 11 symbols, zero affected processes, LOW risk; the only task-owned source symbol is `buildCampaignPlayActorReplanPrompt`. The pre-existing `AGENTS.md` and `CLAUDE.md` edits remain preserved.

## Rendered acceptance and r62

- Required pristine lane template: `lowwater-ledger-pristine-93a09e46-20260719`; source campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`; card: `output/playtests/character-cards/brina-porter-v2.json`.
- Fresh lane: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r62`, isolated API/UI/CDP ports `3330/3331/3332`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, browser target `A16FED3DBE2EC84C413ADDC82FDDB8BA`, and opening turn `turn-opening:dff7c8e7a1450e1664f85db33a82e07242e5fcdc`.
- Materialization was from the required template and card. Card upload used Playwright `setInputFiles` exactly once after readonly reconciliation; one parse request returned 200. Brina Hael was saved once. Opening selections were lower-wards / Local / Already here / Looking for work; Begin was clicked once.
- First genuine blocker: the opening planner stage persisted `interrupted`, `error_code=stage_timeout`, `schema_outcome=transport_error`, `duration_ms=90025`, with the enclosing opening turn `interrupted`, `resume_eligible=1`, and rendered `Resume`. No opening `campaign_play_narrations` acceptance, rendered `THE MOMENT`, player action, Actor Replanner call, or ledger binding was reached. The lane stopped immediately and did not use Resume, Restore, retry, or a direct action/API/DB write.
- Final authoritative probe: `setup_phase=opening_required`, `world_version=6`, `runtime_revision=13`, one character, one opening turn, zero completed player actions, zero bound ledger rows, `integrity_check=ok`, and `foreign_key_check=[]`.
- Cleanup stopped only the task-owned backend/frontend/Chrome roots and descendants; ports `3330/3331/3332` have no remaining listeners. Evidence remains under `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r62.session` and its immutable campaign run.
- Acceptance handoff is not claimed: the prompt repair has static and focused regression evidence, but this fresh lane stopped before any Actor Replanner artifact could be rendered or durably inspected.

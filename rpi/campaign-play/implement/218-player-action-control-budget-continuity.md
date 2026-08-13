# Task 218 Player-action control-budget continuity

## Outcome contract

- Actor: a player using the rendered Campaign Play surface.
- Trigger: one enabled player action in the canonical Brina Hael journey.
- Observable result: within 120,000 ms of the durable signed decision, the player receives the normal reviewed scene or a truthful packet-grounded continuity scene and enabled control again, without Resume, replay, duplicate submission, or operator repair.
- Protected behavior: the existing provider, model, prompts, Grounding Reviewer, Judge, Game Master, Narrator schemas, normal prose path, mechanics, world state, two-attempt Actor Replanner cap, stale/late fences, and exactly-once settlement.
- Forbidden: prompt, provider/model, schema, frontend layout/copy, world-template, Opening, frozen r173/r174, or historical-row rewrites.

## Implementation

- `turn-runtime.ts`, `turn-service.ts`, and `campaign-play-application.ts` derive the durable player-action target at `submittedAt + 115,000` and hard public deadline at `submittedAt + 120,000`. External work is bounded by remaining turn budget; authority budget exhaustion closes through an explicit continuity path.
- Actor replanning receives the remaining optional budget, keeps the existing two-attempt/reviewer path, and atomically defers exhausted replans with `control_budget`; late provider results remain fenced.
- `campaign-play-turn-repository.ts` records a deterministic packet/source marker without claiming a model acceptance or applying mechanics. `narration-operation-repository.ts` records deterministic continuity as a separate source kind with truthful failed-attempt evidence and reload-safe operation identity.
- Migration `0054_campaign_play_control_budget_continuity.sql` adds only the continuity source marker and actor defer reason plus the corresponding SQLite integrity/transition guards. Historical Task 217 rows remain readable.
- `campaign-play-read-model.ts`, `campaign-play-state-repository.ts`, `visibility-service.ts`, `contracts.ts`, and `shared/src/campaign-play.ts` expose the audit marker without player-visible copy changes.
- Humanizer/deslop review: not applicable; no prompt, player-visible copy, or substantive prose changed.

## Static evidence

- Entry: `af73d11426d4edd038d5f2c02c6c7e286117a733` on `feat/revamp`; pre-existing unstaged `AGENTS.md` and `CLAUDE.md` are preserved byte-for-byte.
- Exact current-head impact was run before editing. Central Campaign Play runtime/repository/state/read paths were HIGH/CRITICAL and remained within the authorized Campaign Play control, actor, narration, persistence, and read-model processes; no unrelated product owner was required.
- Focused fake-clock, actor, repository, database, application, visibility, read-model, state, and runtime regressions are included in the implementation validation. Full command results and GitNexus detect evidence will be recorded with the live acceptance update.
- `npm --prefix backend run test -- src/campaign-play/campaign-play-turn-repository.test.ts src/campaign-play/campaign-play-database.test.ts src/campaign-play/campaign-play-application.test.ts src/campaign-play/visibility-service.test.ts src/campaign-play/actor-replanner.test.ts src/campaign-play/actor-scheduler.test.ts src/campaign-play/actor-proposal-service.test.ts src/campaign-play/turn-service.test.ts --pool=forks --maxWorkers=1 --minWorkers=1 --reporter=dot`: 8 files, 138 tests passed.
- `npm --prefix backend run test -- src/campaign-play/turn-runtime.test.ts --pool=forks --maxWorkers=1 --minWorkers=1 --reporter=dot`: 83 tests passed, including the fake-clock authority-to-actor boundary and deterministic continuity/late-fence cases. Backend typecheck and `npm run build` passed. Root `npm run typecheck` remains blocked only by the pre-existing frontend `react-hooks/set-state-in-effect` diagnostic in `frontend/app/(non-game)/campaign/[id]/forge/page.tsx:105`; no frontend file changed.
- `git diff --cached --check` passed. GitNexus exact-entry shadow detect over the implementation reported 45 affected Campaign Play flows at critical risk; the previously disclosed HIGH/CRITICAL owners are the authorized Campaign Play runtime, persistence, actor, narration, and read-model paths, with no unrelated production owner selected.

## Live evidence

Pending the one fresh pushed r175 lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r175` on `zai-coding-plan/glm-5-turbo`.

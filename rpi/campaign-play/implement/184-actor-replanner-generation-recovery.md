# Task 184: Actor Replanner generation recovery

## Contract

When Actor Replanner attempt 1 is contract-invalid before a usable proposal or safe rejection artifact exists, the existing bounded attempt 2 receives one explicit recovery-only instruction. The instruction states that no rejected proposal or Reviewer feedback is available, generates from the unchanged `ACTOR_FRAME`, prefers one grounded action performed only by the planning actor, and forbids unestablished participation or outcomes by other actors. The existing coordinate-specific recovery path remains unchanged when a rejection artifact exists.

The exact generation-recovery paragraph is:

> The first attempt did not produce a usable proposal, so no rejected proposal or reviewer feedback is available. Generate one fresh proposal from ACTOR_FRAME. Prefer one grounded step performed only by ACTOR_FRAME.actorHandle. Another actor may remain only as the target of contact or observation. Do not include any method, stakes, or observableTrace that states or requires another actor to respond, consent, assist, work, move, accept, pay, or complete anything. observableTrace must show only the planning actor's own attempt or a physical trace directly caused by that method; do not assert a requested, visible, or possible outcome. Satisfy every unchanged schema, compiler, and grounding-review rule.

No model, mode, deadline, escalation, Reviewer, mechanics, persistence, retry-count, or player-visible behavior changes.

## Impact and semantic review

Entry was `1a06944bfa53537587a2edc4ce5e8f93b65d453c` on `feat/revamp`, equal to origin. A task-owned fresh shadow was materialized at that commit. The GitNexus CLI's index-only runner refreshed the live current-source index instead of indexing the shadow; the shadow and its temporary registry entry were removed and verified absent. The current live index is up to date at the entry commit.

The nested `createCampaignPlayActorReplanner.replan` target was resolved by UID with exact LOW upstream impact (zero direct callers/processes/modules in the index). The prompt owner `actor-replan-prompts.ts` had LOW file impact (3 direct, 11 total indexed dependants); `actor-replanner.ts` had MEDIUM file impact (5 direct, 16 total). The new helper has no pre-edit callers. The indexed target-name lookups for nested helpers were absent, so the source-qualified owner and exact nested UID were used. No HIGH or CRITICAL edited target was found; the exported error/class APIs remain untouched.

Semantic review verdicts fixed by Main: prompt-craft is a branch-specific recovery text that states the absence of coordinates and does not fabricate feedback; humanizer finds direct technical wording appropriate and retains the literal unchanged; deslop finds no filler or repeated process narration beyond the actor-ownership boundary. No product-visible prose changed.

## Implementation and validation

The production delta is limited to `buildCampaignPlayActorReplanGenerationRecoveryPrompt` and the existing undefined-`rejectionArtifact` attempt-2 selector. The coordinate-specific `buildCampaignPlayActorReplanRecoveryPrompt` branch is unchanged. Focused tests prove the base prompt has no recovery block, the no-artifact prompt contains the exact paragraph once and no `SAFE_REJECTION_FEEDBACK`/raw error text, and the existing schema-invalid recovery keeps the same models, modes, job/frame/base-world/deadline identity, one accepted plan, and no duplicate settlement. A thrown `SafeGenerateError` instance is not constructible through the existing Actor Replanner test injection because the class is intentionally private; the production classifier remains covered by the existing safe-generation suite, while the no-artifact schema-invalid branch is directly exercised here.

## r132 journey

Pending the one fresh built lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r132` for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`. Required template/config/card hashes, setup, checkpoints, first genuine defect or 60/reload boundary, authoritative logs/SQLite, and exact cleanup will be appended after the lane boundary. Generated evidence remains uncommitted.

## Acceptance handoff

The source/test contract covers the no-artifact branch and preserves coordinate-specific recovery, bounded attempts, identity, and fencing. Live evidence is intentionally unavailable until r132; if no natural no-artifact Actor Replanner failure occurs, no live acceptance claim will be made for that branch.

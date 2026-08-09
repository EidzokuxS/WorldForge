# Task 192: Game Master record-event scope budget

## Contract

An otherwise schema-valid `record_world_event` proposal must not reach Rulebook preflight when the compiler-owned player or performer references would make its final `affectedRefs`/`readScope` exceed the unchanged limit of 16. The compiler rejects the proposal with `model_contract_failed` and carries only ordered, safe `record_world_event_scope_overflow` coordinates into the existing bounded Game Master recovery path. Valid final scopes remain unchanged.

Experience contract: a Campaign Play player submits a rendered action; the Game Master compiler is the semantic layer and the Play page is the surface. The trigger is a schema-valid record-world-event whose compiler-owned references overflow the final command scope. The observable outcome is a safe attempt-1 rejection and, when recovered, one normal settlement without truncation, Rulebook-limit changes, replay, or duplicate writes. No provider, model, mode, deadline, retry, persistence, mechanics, UI, or player-visible copy behavior is changed.

## Impact and scope review

Entry was `feat/revamp` at `516b25b2b3ae1c0e22dbba80c78b0aa13b772902`, equal to origin. The exact-entry GitNexus shadow was refreshed because the registered index was stale. Upstream impact for the edited lower-level `compile` owner was MEDIUM (16 impacted, 7 direct callers, Campaign Play `plan` process); `compileEffect` was LOW (11 impacted); `prompt` was LOW (1 impacted). The exported `createCampaignPlayGameMaster` factory was HIGH (18 impacted, 3 direct callers, `drive`/`recoverNarration`/`admitTurn` processes) and was deliberately not edited. No Rulebook, shared-limit, provider, runtime selector, persistence, frontend, or route production file is in scope.

The approved prompt literal was reviewed by Main: prompt-craft/humanizer/deslop found it precise, natural, and non-ornamental; it is retained exactly.

## Exact implementation

- `CampaignPlayGameMasterRecoveryCheck` has one additional discriminated variant carrying only `effectIndex`, the stable `effects[<index>].affectedHandles` path, authored count, compiler-owned append count, and the unchanged maximum.
- The existing compiler appends player and non-null performer references exactly as before, counts the resulting final scope, and records ordered safe checks before Rulebook preflight. It never truncates or silently drops handles.
- The exact recovery sentence is emitted only when this check is present; normal and unrelated recovery prompts retain their existing shape.

## Static evidence (initial)

- Game Master focused suite: 62/62 passed.
- Additional required typecheck, build, runtime/application suites, diff check, and staged GitNexus detection are pending before the implementation commit.

## Live r140 evidence

Pending the required single fresh lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r140` for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`. Required template/config/Brina hashes are recorded in the task packet and will be verified before setup. Generated session/run evidence remains uncommitted.

## Acceptance handoff and unknowns

The focused tests cover the overflow boundary, safe payload/privacy, ordered checks, performer counting, and recovery sentence isolation. Live recovery, 60-action endurance, same-page reload, and cleanup evidence remain unknown until r140. Any first genuine r140 defect will freeze that lane without retry or repair.

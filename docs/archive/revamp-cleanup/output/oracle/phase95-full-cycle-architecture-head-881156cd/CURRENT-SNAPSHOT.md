# Phase 95 Current Architecture Snapshot

Review HEAD: `881156cd191db83aedefab326854cc1b3bb5bc04`
Branch: `develop`
Local index: GitNexus reindexed with embeddings after this commit; 5,999 nodes, 17,048 edges, 300 flows, 4,730 embeddings. Reindex emitted Ladybug lock/vector warnings but ended `Repository indexed successfully`.

## Goal Restatement

The desired endpoint is a playable LLM-driven RPG whose gameplay loop stays coherent at turn 1, 60, 600, and beyond. The work is architecture-first because long-play quality depends on explicit ownership:

- Backend owns authority, validation, mutation, receipts, time, persistence, clone/replay/rollback, vector reconciliation, recovery, public projection, and final-narration grounding.
- Model outputs are proposals or prose drafts, not authority.
- UI text and quick-action labels are presentation; backend handles/capabilities carry authority.
- Model/player-facing refs use issued aliases or backend-owned capabilities, not raw DB ids.
- Every state class should have one write owner.
- Final narration must be grounded in accepted backend-visible facts while remaining fun to play.

## 6+1 Wave E Summary

Six agents audited independent layers; Codex integrated and closed each agent after result intake.

### E1: GM Read -> GM Tool Loop -> Executor

Verdict: conditional GO for source/test architecture.

Evidence:
- 444 focused backend tests passed.

Covered:
- GM Read is an intent classifier and rejects nested tool payloads/backend-owned fields.
- GM Tool Loop derives available tools from scene-frame allowed tools and typed runtime requirements.
- `ToolExecutionContext` + `executeToolCall` own validation, authority denial, stale world-version checks, write-scope conflicts, schema failures, and mutation.
- Tool descriptors/contracts separate terminal receipts, mutation tools, helper observations, UI suggestions, and legacy hidden tools.
- Model-authored proposal fields are constrained to typed proposal tools and proposal executor claims.
- Actor/NPC paths mostly delegate mutation through the same executor authority path.

Remaining debt:
- `authorityMode: "legacy_unscoped"` still exists; no production caller found, but zero-usage should be a direct regression.
- `log_event`, `spawn_npc`, and `move_to` remain legacy/hidden descriptors.
- NPC `update_own_goal` writes via an agent authority trace rather than `executeToolCall` / `ToolResult` receipt plane. Tests cover stale rejection and trace creation, so this is currently P2.

### E2: State Ownership / Validators / Receipts

Verdict: conditional GO for runtime-effect parity, but P1 for reverse owner matrix completeness.

Evidence:
- 243 focused backend tests passed.

P1:
- Current parity proves runtime effect kind -> state lane. It does not yet prove every `GameplayStateLane` -> source of truth / validator / receipt / projection / recovery / test in one executable contract.
- `chronicle_entry` is runtime-safe but contractually mixed. Player-turn paths reject direct chronicle use, while descriptors/contracts still make `add_chronicle_entry` look canonical/live.
- `entity_tag_service` is a named owner, but lacks one explicit service contract object for delegates, stores, validators, projections, recovery, and tests across entity types.

Recommended next slice:
- Add `assertGameplayStateOwnerContractCoverage()` or equivalent.
- Enrich every state lane with source of truth, runtime validators, receipts, projections, recovery modes, tests, and backing descriptor/service policy.
- Pin `chronicle_entry` as background-only or projection-from-receipts.
- Make `entity_tag_service` explicit.

### E3: Narration / Playability

Verdict: conditional GO for grounding architecture; P1 for backend-owned narratable settled facts.

Evidence:
- 200 focused backend tests passed.
- Typecheck passed.
- Current HEAD has committed A4 slice: observation atom summaries and public observation summaries normalize short labels/tool-ish phrases into playable backend-owned sentences. Examples: `Mira is visible here.`, `No obvious visible barriers are apparent from here.`, `The route to Archive Stair is reachable from here.`

Covered:
- Accepted lookup observations become citable playable facts.
- Current inventory/status has backend-owned citable summary facts.
- Dialogue precision facts attach from accepted `record_dialogue_outcome` receipts.
- Final narration requires accepted backend fact refs and fails closed.
- Pending narration preserves settled state and avoids rerunning paid resolution.

P1:
- Quiet/no-mutation direct turns without accepted lookup evidence or inventory can still have no legal final-narration fact refs.
- Movement + time are separate citable facts; because one grounded sentence has a one-fact-ref limit, natural "time passed and you arrived" prose requires a combined backend fact.

P2:
- Pending narration resume should repair older persisted observation atoms before citing them.
- Dialogue precision needs one end-to-end final narration regression.

Recommended next slice:
- Build backend-owned quiet `scene_status` facts from current visible public scene facts.
- Build combined movement-time facts when accepted movement and accepted time passage are in the same settled packet.
- Normalize stale persisted observation atoms during pending narration resume repair.

### E4: Clone / Replay / Rollback / Vector

Verdict: conditional GO for backend-owned recovery contracts; P1 interrupted-restore integrity gap.

Evidence:
- 143 focused tests passed across recovery/clone/vector, rollback/pending narration, and Phase 95 verifier.

Covered:
- Snapshot/restore is backend-owned physical state capture/restore, not UI/prose state.
- Clean-start clone is service-owned, manifest-driven, rejects active turns, rejects replay-preserving mode, rewrites ids, purges turn/chat/quick-action/saga artifacts, rebuilds vector stores, writes clone manifest, and removes partial clone dirs on failure.
- Replay-preserving clone fails closed when stores require regenerate/reject.
- Vector recovery is explicit: checkpoint exact restore, rollback purge/rebuild, episodic rebuild from authoritative `location_recent_events`.
- Final narration failures after settled state become pending narration instead of rolling back accepted state.

P1:
- Interrupted pending restore journal repair checks staged file existence but does not revalidate staged DB/config/chat/vector hashes against the original bundle manifest before applying staged restore.

P2:
- Clean-start clone has no production HTTP/operator route found.
- Verifier does not yet require restore journal phase, vector rebuild counts, rollback outcome receipts, or checkpoint recovery receipts.
- If route rollback restore fails, player-visible text can still say state was restored.

Recommended next slice:
- Revalidate staged restore physical evidence against original bundle manifest before `applyStagedRestore`.
- Add staged tamper regressions for DB/config/chat/vector evidence.

### E5: API / SSE / Frontend Projection

Verdict: conditional GO for authority; current-head Browser proof stale.

Evidence:
- 107 backend projection/API/quick-action tests passed.
- 129 frontend page/API/action-dock/quick-action tests passed.

Covered:
- Quick actions are backend-issued capabilities.
- `/api/chat/action` resolves `quickActionHandle` and ignores tampered browser prose.
- SSE allow-lists player-facing events, drops internal reasoning/state payloads, and buffers quick actions until `done`.
- Public world projection emits `pdto_*` handles and review-only semantic fields require `projection=review`.
- Frontend drops malformed/raw legacy ids and submits quick-action handles.

P1:
- In-app Browser workability evidence is stale after `881156cd`.

P2:
- Fail-closed projection can silently erase malformed/raw entities, harming player quality without a projection-health signal.
- Sanitized quick-action prose can surface `[hidden]`.
- Stale world refresh recovery needs Browser proof.

Recommended next slice:
- Run current-HEAD in-app Browser probe for `/game`, freeform route/status action, Ready, non-Continue quick action with handle, Ready, no raw refs in DOM/console/network.

### E6: Observability / Long-Play Evidence

Verdict: conditional for evidence design; Phase 95 acceptance remains NO-GO.

Covered:
- Observability tests cover turn seam logging, `turnId`, `campaignId`, tick correlation, compact payloads, secret redaction, latency trace, and SSE byte equivalence.
- Adaptive verifier covers required artifacts, clone provenance, clone manifest, source-id residue, projection leaks, done boundaries, repeated loops, and 60-turn mode diversity.

Gaps:
- Current artifacts prove route execution more than gameplay quality at turn 1/60/600.
- Fresh run metadata lacks consistent run id, frontend URL, route id, stop reason, trace/log root, and artifact policy summary.
- Per-turn artifacts store event types but not durable `turnId` joined to backend log filename/hash.
- Verifier does not gate clock ledger continuity, accepted receipt refs, due-world reasons, pending narration recovery, actor backlog, vector growth, terminal event counts, or sampled prose quality.

Recommended next slice:
- Add acceptance manifest/report only after gameplay P1s, tying HEAD, dirty summary, route, campaign/clone ids, artifact/log roots, turn ids, backend log hashes, accepted receipt counts, world clock/version, pending narration state, retry counts, and sampled human play notes.

## Current Priority Order

1. P1 state owner matrix: make every gameplay state lane executable-contract covered.
2. P1 narratable settled facts: quiet scene status, combined movement-time fact, stale observation resume repair.
3. P1 staged restore revalidation before interrupted journal replay.
4. Current-HEAD Browser proof for public projection and quick-action handles.
5. Oracle full-architecture review on frozen current tree.
6. Fresh/cloned human-style 60-turn campaigns and longer soak/replay coverage.

## Local Commits Already Pushed Since 6+1 Canvas

- `e85aaeb8 Add Phase 95 6+1 orchestration canvas`
- `7f0290b1 Ground inventory status narration facts`
- `9e6b28bf Add Browser inventory status smoke evidence`
- `7f3f2708 Close route quick-action handle evidence gap`
- `e6e70283 Aggregate inventory status narration facts`
- `881156cd Polish observation route narration facts`

## Current Verification

Executed locally on the latest gameplay wording slice:

- `npm.cmd --prefix backend test -- src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/narration-grounding-guard.test.ts src/engine/__tests__/player-facing-packet.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/bridge-candidate-tools.test.ts src/engine/__tests__/turn-processor.bridge-tools.test.ts`
  - 251 tests passed.
- `npm.cmd --prefix backend run typecheck`
  - passed.
- `git diff --check`
  - passed.
- GitNexus pre-change impacts for touched projection functions were LOW.
- GitNexus `detect_changes` on staged slice reported HIGH because narrator/player-facing prompt processes were affected; context review and focused tests covered the affected path before commit.

## Not Acceptance Yet

Do not call Phase 95 done from this bundle. Missing acceptance gates:

- Oracle review of this current bundle.
- Current-HEAD in-app Browser workability proof.
- Fresh human-style 60-turn campaign.
- Clean-start clone 60-turn campaign.
- Longer 600+ soak/replay/rollback evidence.
- Human review of actual prose quality and continuity samples, not only scripted metrics.

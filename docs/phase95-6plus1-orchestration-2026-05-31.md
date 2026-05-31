# Phase 95 6+1 Orchestration Canvas

Date: 2026-05-31
Branch: develop
Baseline HEAD: 7971dab544c5de212c8f1f3fa3a80bb2d7e2ba56
Current Integrated HEAD: 881156cd191db83aedefab326854cc1b3bb5bc04

## Product Goal

WorldForge Phase 95 target is a long-lived, high-quality LLM-driven RPG gameplay loop, not a pile of scripted green runs. The game must remain coherent and playable on turn 1, turn 60, and turn 600+ because authority, state ownership, refs, time, receipts, narration, projection, recovery, clone/replay/rollback, vector state, and observability have explicit owners and executable contracts.

60-turn runs are smoke evidence. They are not the success ceiling.

## Current Gate

R4 Oracle verdict: conditional architecture GO, long-play acceptance NO-GO.

Known R4 P1s closed in commit `7971dab5`:
- Default `/world` NPC projection no longer exposes semantic `persona/goals/beliefs`.
- Review/editor projection explicitly opts into `projection=review`.
- Public projection contract has separate `world_review` surface.
- Production `executeToolCall` caller graph is contract-tested against authority guards.

Still not acceptance:
- Browser/human-style gameplay quality needs fresh validation.
- Long-play 60/600+ coherence needs evidence.
- Agent/tool loop, narrator quality, world runtime, clone/replay/vector, and observability need final architecture sweep against live code and product goal.

## Wave E Full Architecture Sweep

Date: 2026-05-31
HEAD: `881156cd` (`Polish observation route narration facts`)
Mode: six live agents plus this shared canvas; Codex integrated/reviewed and closed each agent after result intake.

### E1 GM Read Tool Loop Executor

Verdict: conditional GO for GM Read -> GM Tool Loop -> executor source/test architecture; not long-play acceptance.

Executed evidence:
- 11 focused backend files, 444 tests passed.

Covered contracts:
- GM Read is a read/intent classifier, not a tool author.
- GM Tool Loop derives available tools from scene-frame allowed tools plus typed runtime requirements.
- `ToolExecutionContext` and `executeToolCall` own stale-version checks, write scopes, schema validation, authority denials, and mutation execution.
- Runtime descriptors and tool contracts separate terminal receipts, mutation tools, helper observations, UI suggestions, and legacy hidden tools.
- Model-authored proposal fields remain typed proposals; backend executes or rejects them.
- In-game actor/NPC tool paths mostly delegate mutation through the same executor authority path.

Open items:
- P2: assert zero production `authorityMode: "legacy_unscoped"` usage directly.
- P2: classify NPC `update_own_goal` as a deliberate separate `agent_authority_trace` lane or migrate later into descriptor/executor receipt plane.
- P2: keep legacy/hidden tools (`log_event`, `spawn_npc`, `move_to`) gated until replaced or explicitly documented.

### E2 State Ownership Validators Receipts

Verdict: conditional GO for current runtime-effect owner parity; P1 remains for reverse coverage of every gameplay state lane.

Executed evidence:
- 7 focused backend files, 243 tests passed.

P1 gaps:
- Reverse owner coverage is partial. `assertRuntimeEffectStateOwnerParity()` covers effect-kind -> state lane, but lanes represented through `terminalKind`, `legacy_scene_beat`, `time_effect`, service owners, or registry-only entries are not yet one executable owner matrix.
- `chronicle_entry` is runtime-safe but contractually mixed: GM Read excludes it and player-turn grounding rejects direct use, while descriptors/contracts still make `add_chronicle_entry` a canonical-looking state mutation.
- `entity_tag_service` is named as owner, but its delegates, stores, validators, projections, rollback/recovery, and tests are not yet one explicit service contract object.

Next slice:
- Extend `GAMEPLAY_STATE_OWNER_REGISTRY` or a companion contract with `sourceOfTruth`, `runtimeValidators`, `receipts`, `projections`, `recoveryModes`, `tests`, and descriptor backing for every lane.
- Pin `chronicle_entry` as `background_only` or `projection_from_receipts`.
- Add explicit `entity_tag_service` delegate/store contract for player/NPC/item/location/faction tags.

### E3 Narration Playability

Verdict: conditional for narrator/player-facing architecture; P1 remains in backend-owned narratable facts, not harness.

Executed evidence:
- 7 backend files, 200 tests passed.
- Backend typecheck passed.

Covered contracts:
- Accepted lookup observations now become citable playable facts.
- Inventory/status has backend-owned citable summary facts.
- Dialogue precision facts are attached from accepted `record_dialogue_outcome` receipts.
- Final narration requires accepted backend fact refs and fails closed.
- Pending narration preserves settled state and avoids rerunning paid resolution.

P1 gaps:
- Quiet/no-mutation direct turns without accepted lookup evidence or inventory can still have no legal final-narration fact refs.
- Movement plus time remains split into separate citable facts; with one fact-ref per grounded sentence, the narrator cannot naturally say "time passed and you arrived" unless backend provides a combined fact.

P2 gaps:
- Pending narration resume should normalize older persisted observation atoms before final narration can cite them.
- Dialogue precision needs one end-to-end final narration regression through real `factRefs`.

Next slice:
- Add backend-owned `scene_status`/quiet observation facts derived only from current visible public scene facts.
- Add combined movement-time precision facts when accepted movement and accepted time passage occur in the same settled packet.
- Repair stale persisted observation atom prose on pending narration resume.

### E4 Clone Replay Rollback Vector

Verdict: conditional GO for backend-owned clone/replay/rollback/vector contracts; acceptance NO-GO without long-play evidence.

Executed evidence:
- Recovery/clone/vector suites: 71 tests.
- Route rollback/pending narration suites: 65 tests.
- Phase 95 artifact verifier suite: 7 tests.
- Total: 143 tests passed.

Covered contracts:
- Snapshot/restore is backend-owned physical state, not UI/prose state.
- Clean-start clone is service-owned and manifest-driven.
- Replay-preserving clone fails closed when stores require regenerate/reject.
- Vector recovery is explicit: checkpoint exact restore, rollback purge/rebuild, episodic rebuild from authoritative `location_recent_events`.
- Final narration failure after settled state becomes pending narration instead of rolling back accepted state.

P1 gap:
- Interrupted staged restore repair replays `journal.stagedDir` after checking staged file existence, but does not revalidate staged DB/config/chat/vector hashes against the source manifest before `applyStagedRestore`.

P2 gaps:
- Clean-start clone has no production HTTP/operator route found; current Phase 95 validation imports service code.
- Verifier does not yet require restore journal phase, vector rebuild counts, rollback outcome receipts, or checkpoint recovery receipts.
- If `restoreSnapshot` fails during route rollback, route logs failure but player text can still say pre-turn state was restored.

Next slice:
- Revalidate staged restore physical evidence against original bundle manifest before applying pending journal repair.
- Add staged tamper regressions for `state.db`, `config.json`, `chat_history.json`, and checkpoint vectors.

### E5 Frontend API SSE Projection

Verdict: conditional GO for API/SSE/frontend authority; Browser evidence stale on current HEAD.

Executed evidence:
- Backend projection/quick-action/API suite: 107 tests passed.
- Frontend page/API/action-dock/quick-action suite: 129 tests passed.

Covered contracts:
- Quick actions are backend-issued capabilities; labels/prose are presentation.
- `/api/chat/action` resolves `quickActionHandle` before turn processing and ignores tampered browser prose.
- SSE projection allow-lists player-facing events and strips internal reasoning/state payloads.
- Public world projection emits `pdto_*` handles and keeps review-only semantic fields behind explicit `projection=review`.
- Frontend drops malformed/raw legacy ids and submits quick action handles from `ActionDock`.

P1 gap:
- Current-HEAD in-app Browser workability evidence is stale after `881156cd`.

P2 gaps:
- Fail-closed frontend projection can silently erase malformed/raw world entities; authority-safe but can degrade play quality without a projection-health signal.
- Sanitized quick-action prose can surface `[hidden]`; safe but ugly.
- Stale world-refresh recovery path needs Browser proof.

Next slice:
- Current-HEAD in-app Browser proof for `/game`: freeform route/status action, Ready, non-Continue quick action with handle, Ready, no raw refs in DOM/console/network.

### E6 Observability Long-Play Evidence

Verdict: conditional for evidence design; acceptance remains NO-GO.

Covered contracts:
- Observability route tests cover turn seam logging, `turnId`, `campaignId`, tick correlation, compact payloads, redaction, latency trace, and SSE byte-equivalence.
- Adaptive verifier covers core artifacts, clone provenance, clone manifest, source-id residue, projection leaks, done boundaries, repeated loops, and 60-turn mode diversity.

P1/P2 evidence gaps:
- Current artifacts still prove route execution more than player-quality coherence at turn 1/60/600.
- Fresh run metadata lacks consistent run id, frontend URL, route id, stop reason, trace/log root, artifact policy summary.
- Per-turn artifacts store event types but not a durable `turnId` to join artifacts to backend logs.
- Verifier does not yet gate clock ledger continuity, receipt refs, due-world reasons, pending narration recovery, actor backlog, vector growth, terminal events, or prose-quality samples.

Next slice:
- Add a small acceptance manifest/report layer only after gameplay P1s are closed. It should tie run id, HEAD, dirty summary, route, campaign/clone ids, artifact/log roots, turn ids, backend log hashes, accepted receipt counts, world clock/version, pending narration state, retry counts, and sampled human play notes together.

### Wave E Priority Order

1. P1 state owner matrix: make every gameplay state lane executable-contract covered.
2. P1 narratable settled facts: quiet scene status, combined movement-time fact, stale observation resume repair.
3. P1 staged restore revalidation before interrupted journal replay.
4. Current-HEAD Browser proof for public projection and quick-action handles.
5. Oracle full-architecture bundle review on frozen current tree.
6. Only after those: fresh/cloned human-style 60-turn campaigns and longer soak/replay coverage.

## Oracle Review On Wave E Bundle

Session: `phase95-full-cycle-arch-head-2`
Run date: 2026-05-31
Bundle commit: `cba3ea49`
Code review HEAD inside bundle: `881156cd`
Delivery: 4 compact inline bundle files, about 10.5k input tokens. First attempt with model picker failed because the separate Oracle Chrome profile had no matching Pro option/cookies; second run used `--browser-model-strategy ignore` and completed.

Oracle verdict:
- Architecture: CONDITIONAL GO.
- Gameplay acceptance: NO-GO.
- P0: none found in supplied bundle.
- Control-plane shape is coherent enough to continue targeted implementation.
- Do not use this as long-play acceptance; Browser, fresh/cloned 60-turn, 600+ soak/replay, and human prose continuity evidence are still required.

Oracle-confirmed P1s:
- Gameplay state owner matrix is incomplete: every state lane needs executable source-of-truth/write-owner/validator/receipt/projection/recovery/test coverage.
- Backend-owned narratable settled facts are insufficient for common play: quiet/no-mutation turns and movement+time need citable backend facts.
- Interrupted staged restore repair must revalidate staged physical evidence against the source manifest before applying staged restore.
- Current-HEAD Browser proof and long-play observability are acceptance gates, not substitutes for the code-level P1s.

Oracle option decisions:
- Use an executable global owner contract plus service-local subcontracts where needed; do not rely on docs-only owner tables.
- Build quiet `scene_status` facts from current public scene-visible state; do not make `model_guidance` citable.
- Build derived `movement_time_beat` facts with provenance to both movement and time receipts; do not merge time ownership into movement receipts.
- Revalidate staged restore evidence hashes/counts before applying; fall back to fail-closed restart from source bundle if manifest/source evidence is unavailable.
- Use layered evidence for acceptance: current-head Browser, fresh 60-turn, cloned 60-turn, 600+ soak/replay, and manifest fields tied to gameplay invariants.

Oracle recommended next commits:
1. Seal executable gameplay state owner contract, reconciling `chronicle_entry` and `entity_tag_service`.
2. Add backend-owned quiet scene status and movement-time narratable facts.
3. Then do staged restore manifest revalidation as a separate recovery commit.

### Owner Matrix Implementation Slice

Status: implementation in progress after Oracle.

Design decision:
- Keep this as a low-blast-radius contract/data slice inside `gameplay-control-plane-contract.ts` and its focused tests.
- Do not rewrite runtime descriptors, executor behavior, projection guards, or issued-ref matrix in this slice.
- Extend each `GAMEPLAY_STATE_OWNER_REGISTRY` lane with executable source-of-truth, validator, receipt, projection, recovery, test, and backing metadata.
- Add explicit service contracts for `entity_tag_service`, `turn_clock_ledger`, and `quick_action_offer_service`.
- Classify `chronicle_entry` as `background_only`, not `projection_from_receipts`, because current executable behavior inserts canonical chronicle rows through hidden/background authority and player-turn GM profiles reject it.

Executed local evidence:
- `npm.cmd --prefix backend test -- src/engine/__tests__/gameplay-control-plane-contract.test.ts src/engine/__tests__/tool-contracts.test.ts src/engine/__tests__/gm-turn-read.test.ts` passed 101 tests.
- `npm.cmd --prefix backend test -- src/engine/__tests__/tool-executor-authority.test.ts src/engine/__tests__/tool-execution-context.test.ts src/engine/__tests__/dialogue-state-receipt.test.ts` passed 57 tests.
- `npm.cmd --prefix backend run typecheck` passed.

## Dirty Tail Policy

The branch is owned by this Phase 95 Codex work. Do not call repo artifacts "someone else's".

Current out-of-scope working tail may include:
- `.planning/phases/92-key-actor-and-faction-scheduling-repair/evidence/*.jsonl`
- root `phase95-*.md/png` Browser snapshots

Agents must not revert or stage these unless explicitly assigned.

## Shared Rules

- Model proposes; backend owns validation, authority, mutation, receipts, time, persistence, clone/replay/rollback, and public projection.
- Every state class must have one write owner.
- Model/player-facing refs must use issued aliases or backend-owned capabilities, never raw DB ids.
- UI labels and quick-action prose are presentation; backend-owned handles carry authority.
- Final narration must be grounded in accepted backend-visible facts while staying fun to play.
- Primary gameplay contracts must be typed and runtime-validated.
- Regex/text normalization is allowed only behind named safe boundaries.
- Evidence claims must be labeled: executed, inspected, assumed.
- Agents return compact findings. Main orchestrator integrates and commits.

## Agent Slots

### A1 UI Intake And Projection
Agent: Mendel (`019e7ccd-5ad1-7021-b54c-43f4ccaf6288`)
Status: completed, result integrated
Scope: UI action intake, quick actions, capabilities, SSE/API public projection, frontend parsing, Browser workability.
Output: P0/P1/P2 findings, exact files/functions, tests to add/run, player-quality notes.

Integrated result:
- Verdict: CONDITIONAL for A1. UI intake, quick actions, SSE/API projection, and frontend parsing contracts look sound; focused tests passed; fresh current-HEAD Browser evidence still needed.
- P0: none found.
- P1: Browser workability evidence gap partially closed by `output/phase95-browser-smoke-inventory-status-20260531.md`: current-HEAD in-app Browser opened `/game`, freeform status/inventory action returned to `Ready`, final narration cited current inventory status, visible `Continue` quick action clicked and returned to `Ready`, console warnings/errors were `[]`.
- P1 route/target quick-action evidence gap closed by focused tests: backend route test now resolves a route quick-action handle while ignoring tampered browser prose containing raw/projection refs; frontend `GamePage` test now clicks a settled route quick action and asserts `chatAction(..., { quickActionHandle })` is sent from the active `ActionDock` path.
- Executed local evidence: `npm --prefix backend test -- src/routes/__tests__/chat.test.ts src/engine/__tests__/quick-action-offers.test.ts` passed 55 tests.
- Executed local evidence: `npm --prefix frontend test -- --run app/game/__tests__/page.test.tsx lib/__tests__/api.test.ts components/game/play-surface/__tests__/action-dock.test.tsx` passed 124 tests.
- P2: `parseWorldData` fail-closes malformed/raw public handles by dropping entities. Good for authority, but player quality may degrade into missing NPCs/locations without visible projection-health signal.
- P2: prior Browser/player-quality artifacts show occasional label-heavy prose. Improve narratable fact packets and quick-action wording without weakening projection or grounding.
- Executed evidence from agent: backend A1 focused tests, 15 passed; frontend A1 focused tests, 12 passed.
- Recommended next action: collect current-HEAD Browser evidence before A1 code patch.

### A2 GM Tool Loop And Executor
Agent: Schrodinger (`019e7ccd-709b-71f2-bc40-1ded714e2600`)
Status: completed, result integrated
Scope: GM Read, GM Tool Loop, `executeToolCall`, tool schemas, runtime validation, receipts, authority denials, all tool ownership.
Output: caller map risks, missing authority guards, receipt gaps, tests.

Integrated result:
- Verdict: GO for A2 architecture at `7971dab5`; not a long-play acceptance claim.
- P0/P1: none found.
- Caller map inspected/GitNexus: `executeToolCall` callers are `gm-tool-step`, `actor-tools`, `scene-plan-executor`, `hidden-adjudication`, `npc-tools`, `reflection-tools`, and `tool-schemas` AI SDK bridge. Current paths use strict context, grounding validation, background/NPC scopes, relationship scope, or reject state-bearing execution without context.
- Executed evidence from agent: `tool-executor-caller-contract`, `tool-executor-authority`, `tool-execution-context`, `gm-tool-loop` passed 138 tests; `tool-contracts`, `gameplay-control-plane-contract`, `turn-processor.scene-plan`, `turn-processor` passed 185 tests; `gm-turn-read`, `gm-tool-step` passed 97 tests.
- P2: `authorityMode: "legacy_unscoped"` still exists in `tool-executor.ts`, but no production caller was found. Keep/extend caller contract so future use fails loudly.
- P2: `log_event`, `spawn_npc`, and `move_to` retain legacy/hidden descriptor roles; current paths gate them with hidden-in-player-turn/profile/receipt rules. Watch debt, not current blocker.
- Optional patch: extend `backend/src/engine/__tests__/tool-executor-caller-contract.test.ts` to assert zero production `legacy_unscoped` usage and pin `turn-processor -> executeAdjudicationPlan -> createPlayerTurnToolExecutionContext`.
- Wave 2 confirmed this is P2 test-only hardening. No production edit warranted because `executeToolCall` blast radius is critical and no production `legacy_unscoped` caller was found.

### A3 Actor/World Runtime And Time
Agent: Poincare (`019e7ccd-8a3a-7bb0-a956-4d928d7e4cca`)
Status: completed, result integrated
Scope: actor runtime, NPC/background agents, due-world runtime, scheduling, time ledger, state write owners, recovery of pending work.
Output: owner parity matrix gaps, runtime ordering risks, long-turn coherence risks.

Integrated result:
- Verdict: CONDITIONAL for A3. One-write-owner parity is source-backed and focused-test-backed, but 60/600+ coherence remains unproven acceptance evidence.
- P0/P1: none found for one-write-owner parity.
- Executed evidence from agent: A3 authority/scope tests passed: actor scheduling, actor tools, actor plan executor, simulation proposal executor/lifecycle, executor caller contract, tool authority; 8 files, 94 tests. Turn/pending narration recovery tests passed: 3 files, 188 tests. World thread, wake signal, key actor due plan, faction scheduler tests passed: 4 files, 13 tests.
- P2: long-turn coherence evidence gap. Source shows ordered pre-frame due work, GM writes, actor reaction, pre-narrator due work, and ledgered time, but no 60/600-turn soak was run.
- P2: due-world surface breadth. `world-thread-runner` only advances due routes with scoped surface provenance and skips/defer otherwise. Fail-closed behavior is good; long-play must verify this does not starve offscreen pressure.
- Recommended validation: long-play artifact should record per-turn world time, world version, accepted state delta refs, due-world skipped/deferred reasons, pending narration state, and actor wake backlog growth across fresh and clean-start clone runs.
- Wave 2 evidence verdict: source architecture still has no P0/P1, but acceptance remains NO-GO until artifacts record A3 counters. Existing verifier does not require turn-clock ledger continuity, due-world reason distributions, actor wake backlog boundedness, settled-packet due refs, or pending narration recovery outcomes.
- Recommended A3 evidence patch: add a narrow dev/test coherence snapshot and extend actual-player artifacts/verifier to record `worldClock`, clock ledger tail, pending narration saga, settled packet tail, narrator attempt counts, pending wake counts, due wake counts, and world-thread status/due counts.

### A4 Narrator And Gameplay Quality
Agent: Einstein (`019e7ccd-a47c-79c2-822f-95952b0d3fc6`)
Status: completed, result integrated; P1 implementation slice landed locally
Scope: narrator packet, final narration, grounded fact refs, resume/fail-closed paths, player-facing prose quality.
Output: defects that make game feel mechanical/incoherent, grounding holes, tests and Browser probes.

Integrated result:
- Verdict: CONDITIONAL for A4. Grounding/fail-closed architecture is strong and focused tests pass. The status/inventory grounding P1 is closed, but wave 2 found a playfeel P1: grounded backend facts are still too receipt-like for long-play quality.
- P1: no-mutation/status packets can have zero legal final-narration fact refs. `turn-processor.ts` marks no-action primary responses as `model_guidance`; `narrator-packet.ts` drops model-guidance responses; current inventory facts are `summaryBackendFact: false`; final narration requires backend fact refs. Executed probe found `status_read` plus current inventory produced `allowedRefs: []`.
- Impact: "what am I carrying?", "wait quietly", and other low-mutation human-style turns can preserve authority but strand final narration as pending/mechanical, damaging 1/60/600-turn play.
- Implemented local slice: `current_inventory_status` evidence is now a backend-owned summary fact, while `narration-grounding-guard` still classifies citations as `inventory_status`, not `inventory_status_change`.
- Executed local evidence: added a live packet regression for a no-mutation `status_read` turn with current inventory; `getAllowedNarrationCitationEvidenceRefs` returns `current_inventory_status:*`, and `compileGroundedSentenceDraftToNarrationDraft` accepts grounded final narration as `inventory_status`.
- Executed local evidence: `npm --prefix backend test -- src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/narration-grounding-guard.test.ts` passed 95 tests.
- Executed local evidence: `npm --prefix backend test -- src/engine/__tests__/turn-processor.empty-narration.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts` passed 30 tests.
- Executed local evidence: `npm --prefix backend run typecheck` passed.
- P2: fact-ref expansion keeps truth stable, but prose quality depends on narratable backend fact phrasing. Human-style probes must include inventory/status, quiet observation, route choice, NPC answer, movement+time, and resume after failed narration.
- Wave 2 P1: final narration is structurally biased toward receipt prose because strict `factRefs` expand backend-owned strings verbatim. Browser smoke showed the symptom with inventory lines such as "chalk is ready to hand." Required gameplay-quality slice: polish backend-owned fact builders, not the grounding contract.
- Implemented A4 inventory/status slice: `current_inventory_status:current` is now the only citable backend-owned inventory summary fact for non-empty current inventory; per-item inventory rows remain support/projection context with `summaryBackendFact: false`. The shared formatter now gives narrator and player-facing packets the same playable prose shape instead of duplicating receipt-style per-item lines.
- Executed local evidence: `npm --prefix backend test -- src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/narration-grounding-guard.test.ts src/engine/__tests__/player-facing-packet.test.ts src/engine/__tests__/scene-turn-packet.test.ts` passed 116 tests.
- Executed local evidence: `npm --prefix backend run typecheck` passed.
- Browser evidence gap: attempted current-HEAD in-app Browser smoke after the patch, but Browser runtime blocked `http://localhost:3000` by enterprise policy. This is Browser-specific missing evidence, not a gameplay GO.
- Wave C agent findings: C1 confirmed backend fact-builder wording is the correct owner for inventory/status and flagged observation atoms as the next gap; C2 confirmed quiet/no-mutation direct turns need backend-owned scene observation facts rather than `model_guidance`; C3 confirmed movement/time should be aggregated as backend-owned narrator projection evidence, not by changing time receipts; C4 confirmed dialogue summaries may become citable only as backend-derived precision facts from accepted `record_dialogue_outcome` receipts; C5 produced a 7-action Browser playfeel plan; C6 produced a compact Oracle bundle layout for a full gameplay-cycle architecture review.
- Implemented A4 observation/route wording slice: `observation_result` atom summaries and observation-level public summaries now normalize short labels and tool-ish lookup phrases into backend-owned playable sentences before they become citable evidence or player-facing projection. Example: `Mira` becomes `Mira is visible here.`, barrier-ref absence becomes `No obvious visible barriers are apparent from here.`, and `routeStatus: "legal"` becomes `The route to <destination> is reachable from here.`. This changes narrator/public projection wording only; tool payloads, receipts, and grounding rules stay unchanged.
- Executed local evidence: `npm --prefix backend test -- src/engine/__tests__/narrator-packet.test.ts src/engine/__tests__/narration-grounding-guard.test.ts src/engine/__tests__/player-facing-packet.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/bridge-candidate-tools.test.ts src/engine/__tests__/turn-processor.bridge-tools.test.ts` passed 251 tests.
- Executed local evidence: `npm --prefix backend run typecheck` passed.
- Recommended next A4 patches: add citable scene/observation status for quiet no-mutation direct turns, expose safe dialogue summaries as narratable precision facts, and combine movement+time receipts into one playable beat.
- Executed evidence from agent: narration grounding, narrator packet, visible output guard, and empty narration tests passed; 124 tests.

### A5 Persistence Clone Replay Rollback Vector
Agent: Goodall (`019e7ccd-b899-7720-9be6-dca69deb6d66`)
Status: completed, result integrated
Scope: persistence, restore journal, clone modes, replay policy, rollback, vector rebuild/reconcile, checkpoint APIs.
Output: deterministic recovery risks, replay divergences, vector/state mismatch tests.

Integrated result:
- Verdict: GO for A5 architecture and focused regression contracts; not long-play acceptance.
- P0/P1: none found.
- Executed evidence from agent: restore, checkpoint, rollback-vector rebuild, replay-preserving clone rejection, clean-start clone, and checkpoint public-handle tests passed; 7 files, 108 tests.
- P2: pending restore repair validates staged file existence but does not revalidate staged DB/config/chat/vector evidence hashes before replaying a journal. Add staged tamper regression after journal creation.
- P2: clean-start clone is service-covered, but no production route caller for `cloneCampaignCleanStart` was found. If Phase 95 validation needs operator/player clone UX, add public API/e2e path with same manifest policy checks.
- Recommended patch if needed: staged-restore tamper tests in `backend/src/engine/__tests__/state-snapshot.test.ts` and `backend/src/campaign/__tests__/checkpoints.test.ts`; implementation scope inside `backend/src/campaign/restore-bundle.ts` and manifest evidence helpers.
- Wave 2 confirmed the staged-restore tamper gap as P2, not P1 under the normal remote/user API threat model. Smallest patch: let manifest verification read the source bundle manifest while verifying physical evidence from an optional staged directory, then call it before applying any staged restore copy.

### A6 Observability Long-Play Acceptance
Agent: Leibniz (`019e7ccd-ce2b-7df3-9514-41ebf1e7e2ac`)
Status: completed, result integrated
Scope: observability, evals, 60/600+ playtest plan, human-style evidence, clone-world campaigns, regression gates.
Output: acceptance matrix, minimal non-harness-heavy validation path, telemetry gaps.

Integrated result:
- Verdict: CONDITIONAL for validation readiness; long-play acceptance remains NO-GO.
- P1: acceptance evidence still open. Need fresh human-style 60-turn campaign, clean-start clone 60-turn campaign, and 600+ coherence soak before Phase 95 acceptance.
- P1: use existing artifact verifier as hard gate, not new giant harness. Required artifacts: `state.json`, transcript, per-turn JSON, progress JSONL, done boundaries, mode diversity, no projection leaks; clone run also needs clone provenance, baseline pool, clone manifest, and source-id residue check.
- P1: Browser screenshots are workability evidence only, not acceptance.
- P2: artifact writer may need trace id, terminal event count, stop reason, backend/frontend URL, route, source/clone ids, and artifact root metadata.
- Recommended patch if needed: extend Phase 95 run artifact metadata and verifier requirements in the run artifact writer plus `scripts/phase95-verify-adaptive-run.mjs`.
- Wave 2 Oracle bundle prep recommendation: create a current-HEAD review pack under `output/oracle/phase95-6plus1-wave2-b6-full-cycle-head-*/` with `REQUEST.md`, `BUNDLE-INDEX.md`, `CURRENT-SNAPSHOT.md`, `PRIOR-ORACLE-LESSONS.md`, `SOURCE-PACK-CORE.md`, `TEST-EVIDENCE-PACK.md`, and `FILES.txt`. Keep attachments as a small number of generated markdown artifacts, target roughly 120k-170k input tokens, dry-run exact attachment count/size/token budget, and treat Oracle as advisory until locally verified.

## Agent Output Format

Each agent returns:

```markdown
## Verdict
GO / CONDITIONAL / NO-GO for this cluster, with one sentence why.

## P0/P1 Findings
- Severity, file/function, evidence, concrete fix/test.

## P2/Debt
- Only real acceptance risks, not cosmetic debt.

## References Used
- Local files/docs/code/tests inspected.
- External/live docs if used.

## Unverified Assumptions
- Anything not executed or not inspectable.

## Recommended Next Patch
- Disjoint write scope if implementation is needed.
```

## Orchestrator Duties

- Keep exactly six useful agents alive while cluster sweep is active.
- Poll patiently; timeout is not failure.
- Close agents only after final result intake or supersession.
- Integrate findings into this canvas or follow-up architecture docs.
- Use GitNexus impact before symbol edits and detect_changes before commits.
- Commit/push coherent verified slices.

# Rebuild GM Turn Cycle

Rollback point: `45517081` on `codex/gameplay-loop-rebuild`.
Working branch/worktree: `codex/rebuild-gm-turn-cycle` in normal worktree `R:\Projects\WorldForge`.

Canonical architecture source: `docs/gm-turn-architecture-review-2026-05-03.md`.
Explicitly excluded as implementation guidance: `docs/WorldForge_runtime_problem_fixes_latency_memory_v5.md`.

## Current Session Focus 2026-06-05

User reminder accepted: final acceptance counts only as several different zero-turn campaigns/clones that each reach about 60 clean turns with zero failed, replayed, restored, or invalid player-facing turns. All shorter lanes below are diagnostic burn-ins only.

6+1 canvas for the next v2 slice:
- A1 Source/Request Lock — Status: complete. Scope: keep the runtime target on gameplay-cycle-v2, not v1 stabilization. Output: [inspected] `docs/gm-turn-architecture-review-2026-05-03.md` remains canonical; old v1/phase95 lanes are forensic lessons, not target architecture.
- A2 Current-State Map — Status: in_progress. Scope: map current v2 entrypoint-to-exitpoint gaps after commit `854371c6`. Output: [inspected] v2 runtime already has live `tool_plan` adapter, DB-backed handlers, pending narration packet store, explicit movement admission, and simple checklist compiler; next work must harden the remaining runtime primitive instead of adding prompt guards.
- A3 Reference/Oracle — Status: pending. Scope: use Oracle/GPT-5.5 Pro only for new ownership/schema/persistence decisions. Output: [inspected] accepted P17 ordering already covers simple live movement/checklist ownership; no new Oracle call is needed for continuing that already accepted slice unless the next primitive changes authority.
- A4 Architecture/Protocol — Status: pending. Scope: name the next primitive's authoritative input/output/downstream consumer/failure contract before edits.
- A5 Verification/Proof — Status: pending. Scope: contract tests first, then `/api/chat/action` diagnostic turns if the primitive reaches live runtime.
- A6 Cleanup/Migration/Risk — Status: pending. Scope: avoid legacy `turn_sagas`, old runtime tool schemas, old `ToolResult`, semantic regex patches, and v1 narrator guard piles.
- +1 Integration — Status: in_progress. Decision: continue P17 live v2 burn-in/gap closure until it can support 10-15 clean diagnostic turns, then move to the next missing primitive; do not start final 60-turn acceptance until diagnostics stop discovering contract failures.

P17 dialogue terminal receipt checkpoint:
- Oracle/GPT-5.5 Pro attempt `p17-dialogue-record-terminal`:
  - Dry-run succeeded with one bundled attachment, 13 files, about 91.6k tokens.
  - Real Oracle Chrome run failed before context delivery because the ChatGPT model selector was unavailable and no cookies were applied. This is invalid Oracle evidence.
  - Built-in browser reached a logged-in ChatGPT/Extended Pro composer, but ChatGPT upload opened a system file picker that Browser Plugin could not reliably drive or verify. No context bundle was delivered there either.
  - Local decision uses the already accepted P16/P17 ordering: after route/movement/scene-beat, add `dialogue.record.v2` as terminal non-mutating receipt; durable dialogue memory/world facts remain deferred to a later explicit capability.
- Implemented `dialogue.record.v2` live slice:
  - `dialogue_record` is now in the live v2 capability list.
  - GM Read prompt admits visible speaker answer/refusal/warning/redirect/silence as `requiredEffectKinds=["dialogue_outcome"]`.
  - Backend simple checklist compiler can compile one-step intent-only `dialogue_outcome` checklists without tool ids, payloads, receipts, or narration.
  - Tool request prompt allows only clean `dialogue.record.v2` and states it is terminal/non-mutating.
  - DB-backed handler resolves `speakerRef` through typed visible-actor registry, addressees through player/visible-actor refs, returns a terminal receipt, preserves worldVersion, and writes no authority trace or durable event.
  - Contract fix after live diagnostic: non-silence dialogue outcomes now require `quotedSpeech`; `silence` must omit it. This prevents accepted content-free dialogue receipts.
- Verification:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` passed with 104 tests.
  - `npm --prefix backend run typecheck` passed.
  - `npm --prefix backend test -- src/routes/__tests__/chat.test.ts` passed with 61 tests.
  - Source separation scan over `backend/src/engine/gameplay-cycle-v2` found only deliberate denylist strings, not old runtime imports.
- Live/manual diagnostic evidence:
  - Stable backend ran on `PORT=3199` with `WORLDFORGE_GAMEPLAY_CYCLE_V2=1`; stopped afterward, ports `3199/3001` clear.
  - Lane `f59ada43-e849-4c0c-880b-bf854ffff8c9` was already diagnostic with 4 clean v2 packets at `Transmission Basement`.
  - Turn 5 action to `Relay-Tech Dorin` reached `done`, but exposed a contract failure: accepted `dialogue.record.v2` receipt had no concrete response content, and narrator correctly said the answer content was not fixed. This lane is diagnostic-invalid and does not count.
  - Fix: `dialogue.record.v2` non-silence requests require `quotedSpeech`.
  - Turn 6 diagnostic follow-up reached `done` with accepted `dialogue.record.v2`, `evidenceAuthority=terminal_receipt`, `mutationApplied=false`, `baseWorldVersion=resultWorldVersion=2`, no failed/skipped steps, no legacy `settled_turn_packets`, `turn_sagas`, or `narrator_attempts`. Packet evidence stored Dorin's concrete quoted procedure/direction response.
  - Artifact files: `output/p17-dialogue-live/turn5.sse.txt`, `turn5.db.json`, `turn6.sse.txt`, `turn6.db.json`.

P18 entity tag mutation checkpoint:
- Oracle/GPT-5.5 Pro review `v2-entity-tag-boundary`:
  - Dry-run: 10 files, one bundle, about 97.8k tokens.
  - Real browser run completed with model selection verified as Extended Pro and one bundled attachment. Verdict: implement `entity.tag.v2` as a first-class DB-backed v2 handler, not a legacy `add_tag` adapter.
  - Accepted decision: v2 handler resolves model-safe refs through `gameplay-ref-registry.v2`, writes canonical tag arrays directly on allowed DB rows, advances world version only for actual mutations, writes `authority_traces`, and emits mutation receipts.
  - Deliberate deviation from Oracle: Oracle suggested accepted no-op final-state receipts. Current v2 executor invariant requires accepted mutation-capability receipts to actually mutate and advance worldVersion, so this slice rejects idempotent add/remove as no-op instead of broadening receipt semantics across all mutation tools.
- Implemented `entity.tag.v2` contract slice:
  - Added `entity_tag` to live v2 capabilities and simple checklist compiler.
  - Tool request schema now requires `entityScope` plus `entityRef`, `operation`, `tag`, and evidence refs.
  - Allowed scopes for this slice: `player_actor`, `visible_actor`, `current_location`, `current_scene`, `visible_item`, `visible_location`, and `inventory_item`.
  - DB handler is direct v2 authority: no old executor/tool schema adapter, no old model-facing `add_tag` surface.
  - Handler canonicalizes tag text syntactically only (`trim/lowercase`, whitespace to hyphen, `[a-z0-9_-]`), updates one row in one transaction, advances world clock, and writes `gameplay-cycle-v2.entity.tag.v2` authority trace.
- Verification so far:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` passed with 109 tests.
  - `npm --prefix backend run typecheck` passed.
  - `npm --prefix backend test -- src/routes/__tests__/chat.test.ts` passed with 61 tests.
  - Source scan: legacy names remain only denylist/test fixtures; runtime prompt no longer exposes concrete old tag tool names.
- Live/manual diagnostic evidence:
  - Used already diagnostic-invalid lane `f59ada43-e849-4c0c-880b-bf854ffff8c9` so this proof cannot be confused with final acceptance.
  - Pre-inspected actual state: current scene `Transmission Basement`, inventory `Sealed lacquer message tube` and `Courier satchel`; v2 packets already 6, so diagnostic only.
  - Started stable backend on `PORT=3199` with `WORLDFORGE_GAMEPLAY_CYCLE_V2=1`; stopped afterward, ports `3199/3001` clear.
  - First `/api/chat/action` attempt omitted `campaignId` and returned transport-only HTTP 400 `"campaignId is required."`; DB was not used as gameplay evidence.
  - Real action: `Я помечаю Sealed lacquer message tube короткой меткой suspicious для дальнейшей проверки.`
  - Result: HTTP 200, SSE reached `narrative` and `done`; narration: `Вы помечаете Sealed lacquer message tube меткой suspicious.`
  - Latest packet `v2packet-mq017zpo-436037d6ba94`: `gmRead.path="tool_plan"`, checklist required `entity_tag`, accepted receipt `receipt-step-1` with `toolId="entity.tag.v2"`, `evidenceAuthority="mutation_receipt"`, `mutationApplied=true`, `mutationAuthority="item"`, `baseWorldVersion=2`, `resultWorldVersion=3`, no skipped/failed steps.
  - DB grounding: `Sealed lacquer message tube` tags became `["starting-loadout","equipped","suspicious"]`; `world_clocks.world_version=3`; latest authority trace operation `gameplay-cycle-v2.entity.tag.v2`, source entity type `item`, metadata `entityScope="inventory_item"`, `operation="add"`, `tag="suspicious"`.
  - Artifacts: `output/p18-entity-tag-live/load.json`, `turn-entity-tag.sse.txt`, `turn-entity-tag.db.json`, `backend-3199.log`.

P19 support actor create checkpoint:
- Oracle/GPT-5.5 Pro review `p19-support-actor-create`:
  - Dry-run: browser mode, forced one bundled attachment via `--browser-bundle-files`, 17 files, about 126k tokens, one `attachments-bundle.txt`.
  - Real run completed on GPT-5.5 Pro / Extended Pro with one bundled attachment.
  - Recommendation accepted: implement `support_actor.create.v2` now as a first-class DB-backed mutation handler, but keep it deliberately narrow: temporary, visible, current-scene, reactive support NPCs only.
  - Accepted boundaries:
    - create one NPC row, advance world version, write v2 authority trace, then require SceneFrame refresh before narrator/dependent steps;
    - no actor lifecycle, private knowledge, factions, relationships, inventory, durable world facts, schedules, memory, location events, clock ledger, or persistent/key NPC promotion;
    - duplicate/existing same-scene temporary actor is rejected/no-op, not accepted observation/terminal receipt, because `support_actor_create` is mutation-receipt-required.
- Implementation target:
  - Tighten `support_actor.create.v2` schema with `anchorScope=current_scene`, bounded role kind/name/persona/tags/identity fields, and evidence refs.
  - Add `support_actor_create` to live GM Read/tool-request/checklist surfaces.
  - Add DB-backed handler transaction with rollback test hook and authority trace operation `gameplay-cycle-v2.support_actor.create.v2`.
  - Add focused tests for schema, checklist, handler mutation, duplicate rejection, rollback, and refreshed exposure to `visible_actor`.
- Implemented `support_actor.create.v2` live slice:
  - `support_actor_create` is now in live v2 capabilities, GM Read admission, simple checklist compiler, and clean tool-request prompt.
  - Tool request schema now requires `anchorScope="current_scene"`, `anchorRef`, bounded ordinary `roleKind`, `roleLabel`, optional `displayName`, public persona summary/cues, canonical tags, explicit temporary/current-scene/reactive identity bounds, `reason`, and evidence refs.
  - DB handler resolves `anchorRef` through the backend-only ref registry as `current_scene`, inserts one `npcs` row with `tier="temporary"`, advances world version, writes `gameplay-cycle-v2.support_actor.create.v2` authority trace, and writes no location events, clock ledger, actor lifecycle, faction, memory, relationship, inventory, or world-fact rows.
  - Exact duplicate same-scene temporary support actor create is rejected/no-op with no worldVersion advance and no authority trace.
- Verification:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` passed with 114 tests.
  - `npm --prefix backend run typecheck` passed.
  - `npm --prefix backend test -- src/routes/__tests__/chat.test.ts` passed with 61 tests.
- Live/manual diagnostic evidence:
  - Used zero-turn clone `7cec9dd4-8ac9-44b0-8280-f29cb7528417` at `Lowwater Bazaar` as P19 diagnostic smoke; after this one turn it is not acceptance evidence.
  - Two transport attempts with `message`/missing `intent` returned route schema error `"Invalid input: expected string, received undefined"` before gameplay settlement; DB remained clean with 0 v2 packets, 0 temporary NPCs, 0 authority traces, and worldVersion 0.
  - Real action sent with `campaignId`, `playerAction`, `intent`, and `method`: `Я оглядываюсь в Lowwater Bazaar и ищу рядом обычного временного рыночного носильщика, который сможет подсказать дорогу.`
  - Result: HTTP 200, SSE reached `narrative` and `done`; narration: `В Lowwater Bazaar вы замечаете Bazaar Porter — типичного временного рыночного носильщика.`
  - Latest packet `v2packet-mq02fr6j-23ecfef98dd2`: `gmRead.path="tool_plan"`, checklist effect `support_actor_create`, accepted receipt `receipt-step-1` with `toolId="support_actor.create.v2"`, `evidenceAuthority="mutation_receipt"`, `mutationApplied=true`, `mutationAuthority="actor"`, `baseWorldVersion=0`, `resultWorldVersion=1`, plus accepted post-refresh `scene_beat.record.v2` visibility receipt.
  - DB grounding: inserted temporary NPC `Bazaar Porter`; authority trace operation `gameplay-cycle-v2.support_actor.create.v2`, source entity type `npc`, state deltas `npc:<id>:created` and `scene:<id>:actors`; `world_clocks.world_version=1`, `world_time_minutes=0`.
  - Backend ran on stable `PORT=3199` with `WORLDFORGE_GAMEPLAY_CYCLE_V2=1`; stopped afterward, ports `3199/3001` clear.
  - Artifacts: `output/p19-support-actor-live/load-r5.json`, `turn-support-actor-r5.sse.txt`, `turn-support-actor-r5.db.json`.

## Clean-Slate Runtime Scope Update 2026-06-04

Goal changed: rewrite the whole gameplay-cycle runtime boundary, not only the central turn orchestrator.

Boundary:
- Entry: player message through `/api/chat/action`.
- Exit: settled player-facing narration/API response plus frozen world state for the next player input.
- Included: SceneFrame, scoped forecast, GM Read, uncertainty/Oracle, action planning, gameplay tools, tool schemas, validators, execution, mutation, receipts, settled packet, narrator evidence contract.
- Excluded except adapters: world creation, character loading, campaign/world authoring, frontend UI.

Current map:
- Transport entrypoint: `backend/src/routes/chat.ts` parses `chatActionBodySchema`, resolves campaign/providers/quick actions, captures pre-turn snapshot, opens SSE, calls `processTurn`, restores pre-turn state on pre-settlement failure, and preserves finalized state after done boundary.
- Current engine adapter: `backend/src/engine/turn-processor.ts` delegates `processTurn` to `processGameplayTurnCycleV1`.
- Current v1 runtime: `backend/src/engine/gameplay-turn-cycle-v1.ts` already names the target stages, but imports old schemas, descriptors, receipt matching, tool execution, lookup tools, actor consequence adapters, and narrator prompt hardening into one integration knot.
- Old tool contract surface: `runtime-tool-input-schemas.ts`, `runtime-tool-descriptors.ts`, `tool-contracts.ts`, `tool-result.ts`, `tool-schemas.ts`, `tool-executor.ts`, and `gm-tool-loop.ts`.
- Old narrator/evidence surface: `narrator-packet.ts`, `player-facing-packet.ts`, `visible-narration-output-guard.ts`, `narration-grounding-guard.ts`, and `settled-turn-packet-v1-store.ts`.

Runtime map refresh after handoff pause:
- `/api/chat/action` route remains a transport adapter, not gameplay authority. It owns request parsing, provider resolution, quick-action expansion, pre-turn snapshot capture, SSE streaming, terminal event detection, pre-settlement restore, pending narration recovery, done-boundary snapshot metadata, and post-done auxiliary work.
- `processTurn` is the current runtime switch. It uses `WORLDFORGE_GAMEPLAY_CYCLE_V2` only for `processGameplayTurnCycleV2NoMutation`; otherwise it delegates to the whole v1 loop. This means the branch still has no full live v2 path for mutating `tool_plan` turns.
- Existing v2 core files are clean primitive layers, but not yet a complete live adapter:
  - `runtime.ts`: live no-mutation/oracle adapter only. Builds `TurnStartEnvelopeV2`, `TurnAttemptContextV2`, `SceneFrameEnvelopeV2`, model packet, GM Read, no-receipt/oracle packet, narrator view, v2 packet store row, chat append, tick advance, and API projection.
  - `contracts.ts`: v2 schemas for transport envelope, SceneFrame envelope, model packet, GM Read, Oracle settlement, action checklist, tool request, runtime receipt, receipt ledger, local consequences, settled packet, narrator view, and API projection.
  - `projection.ts`: deterministic adapter from existing `SceneFrame` to model-facing v2 refs/capabilities.
  - `gm-read.ts`: validator/repair boundary for GM Read candidates, including no-mutation, oracle, and `tool_plan` contracts.
  - `action-checklist.ts`: validates checklist intent only; forbids executable payload fields and old tool names.
  - `tool-request-planner.ts`: validates exactly one v2 tool request for exactly one checklist step via clean dotted tool ids.
  - `runtime-executor.ts`: executes one v2 tool request through a v2 handler registry and emits a `GameplayRuntimeReceiptV2`; it does not import old executor/tool schemas.
  - `receipt-ledger.ts` and `evidence-normalizer.ts`: enforce source-aware receipt chain, evidence authority, exact pre-step packet evidence, skipped/failed audit, and accepted evidence normalization.
  - `frame-refresh.ts`: validates post-mutation SceneFrame refresh before dependent planning/narration.
  - `local-consequence-scheduler.ts` / `local-consequence-executor.ts`: source-aware local consequence scheduling/execution before packet when a visible local mutation needs actor response.
  - `mutating-composer.ts`: contract harness composing checklist requests, executor, refresh, local consequences, ledger, and settled packet. It still needs live model-generation adapter plus real DB mutation handlers.
  - `ref-registry.ts`: backend-only typed ref registry that maps model-safe labels/current aliases from `SceneFrame` to concrete backend ids and fails closed on missing/ambiguous refs.
  - `packet-store.ts`: separate `gameplay_cycle_v2_packets` table. It now preserves optional checklist and receipt-ledger audit artifacts alongside the settled packet/narrator/API projection, but it is not yet integrated with old `turn_sagas` pending-narration semantics.
- v1 runtime knots to replace:
  - `gameplay-turn-cycle-v1.ts` combines frame, GM Read, checklist prompt rules, old one-step tool request prompt, old executor, frame refresh, local actor reactions, v1 settled packet, and narration into one prompt-heavy loop.
  - `runtime-tool-input-schemas.ts` exposes old runtime tools (`check_route`, `move_actor`, `create_scene_extra`, `record_dialogue_outcome`, `record_world_fact`, `add_tag`, `log_event`, `move_to`, `transfer_item`, etc.) and their old semantics.
  - `runtime-tool-descriptors.ts` / `tool-contracts.ts` infer authority via old roles/effect ownership and receipt predicates.
  - `tool-schemas.ts` exposes old tool calls to model-facing tool loops and routes them through `executeRuntimeTool`.
  - `tool-executor.ts` owns old validation, grounding, write locks, world-version validation, handler dispatch, authority attachment, and legacy `ToolResult` receipts.
  - `actor-tools.ts` owns old local actor decisions through old tool payload/result semantics.
  - `narrator-packet.ts` and visible narration guards compensate for ambiguous old evidence by prompt/guard hardening.

Current replace-vs-adapter boundary:
- Keep as transport adapters: `/api/chat/action`, `/api/chat/retry`, `/api/chat/resume`, SSE writer/sanitizer, pre-turn snapshot capture/restore, pending narration transport recovery, last-turn boundary metadata, post-done auxiliary proposal queue. These must call the new runtime but not define gameplay truth.
- Keep as data-source adapters: `buildSceneFrame`, `loadWorldTrajectoryForecast`/`buildScopedForecastExcerpt`, `readWorldClock`/`syncWorldClockTurnBoundary`, campaign/chat history stores, DB connection/schema services, provider registry, and existing world/character loading. Their outputs must be normalized into v2 contracts before the model sees them.
- Keep as mutation implementation references only until replaced by v2 handlers: DB row update patterns inside `tool-executor.ts`, location graph helpers, event/knowledge/tag persistence helpers, and world-clock mutation helpers. Do not import old tool schemas, old `RuntimeToolName`, old `ToolResult`, or old receipt predicates into v2 core.
- Replace completely inside gameplay-cycle runtime: v1 GM Read shape, v1 checklist shape, old `plannedTools`/`toolName` payload surface, old runtime tool schema map, old `executeToolCall` as runtime authority, old actor consequence packet shape, old v1 settled packet as narrator authority, and old narrator guard pile as semantic authority.

Replacement plan by runtime layers:
- [x] P0-P6 no-mutation/oracle live spine: transport envelope, attempt context, SceneFrame envelope, projection, GM Read validator, no-receipt settled packet, Oracle settlement, narrator view/API response.
- [x] P7-P14 contract core: checklist, capability catalog, one-step tool request planner, runtime executor, evidence normalizer, source-aware receipt ledger, post-mutation frame refresh, local consequence schedule/execution, mutating composer harness.
- [ ] P15 live `tool_plan` model-generation adapter:
  - Inputs: latest `ModelFacingTurnPacketV2`, accepted `GmReadChecklistV2`, current capability catalog.
  - Outputs: accepted `GmActionChecklistV2`, one accepted/rejected v2 request candidate per executable step, optional local consequence request candidates.
  - Forbidden: old tool names, old schemas, old `ToolResult`, hidden backend refs, narrator prose, and direct DB writes.
  - Verification: prompt-contract tests for clean `tool_plan` generation, rejected legacy payloads, and failed checklist/request not becoming settled truth.
- [ ] P16 v2 DB-backed handler registry:
  - Start with minimal live mutating capabilities: `route.check.v2`, `actor.move.v2`, and `scene_beat.record.v2`; add `dialogue.record.v2` next only after movement/local beat is proven.
  - Inputs: accepted v2 request/effectBinding and pre-step packet.
  - Outputs: `GameplayToolHandlerOutcomeV2` only; executor wraps it into receipts.
  - Forbidden: importing old `runtimeToolInputSchemas`, old descriptors/contracts, old `executeToolCall`, or returning legacy `ToolResult`.
  - Contract decision before implementation: `scene_beat.record.v2` is currently `terminal_receipt_required`, so it must not write DB state or advance world version unless the capability/evidence authority is deliberately changed to mutation receipt with tests.
  - Verification: handler contract tests against real DB fixtures plus chain-head/world-version assertions.
- [ ] P17 live mutating runtime adapter:
  - Replace `processGameplayTurnCycleV2NoMutation` with a full `processGameplayTurnCycleV2` that routes GM Read paths: no-mutation, oracle, and `tool_plan`.
  - For `tool_plan`, generate checklist/requests, call `composeGameplayCycleMutatingTurnV2`, persist packet, render narrator from settled truth, append chat, advance tick, finalize API projection.
  - Failure behavior: before packet persistence, throw to route restore; after packet persistence, enter pending narration/finalized transport boundary, not silent fallback narration.
- [ ] P18 v2 persistence integration decision:
  - Decide whether `gameplay_cycle_v2_packets` remains the canonical v2 store or bridges into existing `turn_sagas`/`settled_turn_packets` for pending narration recovery.
  - Oracle required before this decision because it crosses persistence/recovery semantics.
- [ ] P19 live manual slice gate:
  - Use zero-turn clones only.
  - Inspect actual state, choose one action, send one `/api/chat/action`, inspect frozen API/world state, then choose next action.
  - First slice target: 10-15 turns covering direct/no-mutation, oracle, route check, movement, post-mutation frame refresh, required local consequence/no-visible-actor skip, and narration from accepted receipts only.

Replace vs adapter:
- Replace: `gameplay-turn-cycle-v1.ts`, current GM Read implementation shape, current runtime tool schema map, runtime tool descriptors, receipt-matching core, GM tool loop, old narrator prompt/evidence guard pile.
- Keep as transport adapters: `/api/chat/action` route shell, SSE writer/sanitizer, snapshot/restore handling, pending narration route behavior, existing frontend API call shape.
- Keep as data-source adapters: `buildSceneFrame`, forecast loading/scoping, world clock/authority stores, campaign/chat history stores, DB services, provider registry.
- Keep only behind a storage adapter: `settled-turn-packet-v1-store.ts`; new packet contract must own canonical shape.
- Forbid from new core as authority: `move_to`, hidden player-turn `spawn_npc`, durable `log_event` as catch-all, `add_chronicle_entry` in player turn, old `plannedTools`, old `createStorytellerTools` tool registry, old `executeToolCall` as semantic owner.

Oracle/GPT-5.5 Pro decision:
- Session: `gameplay-runtime-primitives`.
- Dry-run: 97,703 tokens, 10 attached files.
- Browser run completed on GPT-5.5 Pro / Extended Pro.
- Recommendation accepted: build a new primitive-owned core, not a v1 refactor.
- Core rule: every time a guard sentence, regex, fallback bypass, or narrator prohibition seems necessary, stop and assign the fact to the primitive that owns it.
- Current built-in Browser Plugin status: blocked before any browser action; `node_repl` browser runtime initialization reports `failed to write kernel assets: The system cannot find the path specified. (os error 3)`. Do not count prompt-only ChatGPT questions as Oracle evidence while this is unresolved.
- P10 retry of the built-in Browser Plugin repeated the same pre-execution blocker (`failed to write kernel assets: The system cannot find the path specified. (os error 3)`), so no GPT/Oracle architecture review was delivered for P10 in-browser.
- Post-correction Browser Plugin retry for the mutating composition harness repeated the same pre-execution blocker after a kernel reset; no tab opened and no context bundle was delivered. Continue local contract work only with this Oracle review marked unavailable, not satisfied.
- Oracle dry-run for the mutating composition harness succeeded with 9 intended files and about 51k tokens, but the real browser run with attachments failed before a ChatGPT conversation was created; the user closed the Chrome window to avoid a hang. This is not valid Oracle review evidence. Next Oracle attempt for this slice must avoid the attachment path and use a smaller inline/rendered bundle with visible `### File:` context.
- Next-slice Oracle dry-run after architecture map: slug `v2-live-mutating-next`, browser inline mode, 11 inline files, about 104.5k tokens. Preview explicitly reported `11 files pasted directly into the composer`. Question asks whether the next clean v2 slice should implement live model-generated checklist/tool requests plus minimal DB-backed handlers before bridging v2 into `turn_sagas`, or bridge persistence first. No real browser run has been started for this question yet.
- The `v2-live-mutating-next` real browser-inline run was invalid: Chrome closed before a ChatGPT conversation was created. Operator correction: huge inline content can hang; use one bundled attachment instead.
- Valid Oracle/GPT-5.5 Pro review:
  - Session: `v2-live-mutating-one-bundle`.
  - Dry-run: browser mode, forced upload, `--browser-bundle-files`, one `attachments-bundle.txt`, 11 files, 446.6 KB, about 104.6k tokens.
  - Browser run completed with GPT-5.5 Pro / Extended Pro, archived conversation, saved output to `output/v2-live-mutating-one-bundle.txt`.
  - Recommendation: implement the live mutating v2 adapter first, with minimal v2-native recovery/persistence rails; do not bridge v2 receipts into legacy `turn_sagas` first.
  - Rationale accepted: the core unknown is whether v2 can safely go from model intent to backend mutation to settled truth without falling back into old tool schemas, `ToolResult`, `executeToolCall`, scene-plan semantics, or guard piles. A legacy saga bridge first would tempt v2 receipts to look like legacy action results and move authority back into old persistence/narration semantics.
  - Accepted next ordering:
    1. Extend live v2 runtime from no-mutation/oracle into `tool_plan` admission.
    2. Generate and validate `gm-action-checklist.v2`.
    3. Generate exactly one `gameplay-tool-request.v2` per checklist step and execute minimal DB-backed v2 handlers for `route.check.v2`, `actor.move.v2`, and `scene_beat.record.v2`.
    4. Build receipt ledger and settled packet from actual receipts.
    5. Persist v2 packet plus checklist/ledger/narrator view before visible narration.
    6. Add `turn_sagas` bridge later as resumability/projection shell, not gameplay authority.
  - Required contracts accepted for implementation:
    - mutating GM Read admission without tool payloads;
    - backend-only typed ref registry mapping model-safe refs to DB records;
    - checklist validation remains intent-only;
    - one-step request validation remains selected-step-only;
    - handler outcomes use v2 receipt semantics only;
    - strict receipt ledger chain;
    - post-mutation frame refresh;
    - settled packet authority excludes checklist intent as truth;
    - v2 packet persistence must preserve checklist + ledger audit;
    - `/api/chat/action` remains transport-neutral.
  - Red flags to stop on: semantic label regex in handlers, narrator needing failed/skipped/checklist intent as truth, accepted mutation without receipt/world-version change, old `ToolResult` conversion, old executor/schema imports, narration string patches for private leaks, transport deciding mutation truth, and mutation-before-packet crash with no v2 recovery marker.

Current v2 live-mutating implementation checkpoint:
- Implemented a backend-only ref registry primitive and threaded optional `refRegistry` into the P10 executor, mutating composer, and local-consequence executor contracts. Handlers now resolve model-safe refs through backend-owned typed entries instead of semantic label parsing.
- Implemented v2 packet-store audit persistence for `checklist_json` and `receipt_ledger_json`; pending, rendering, and finalized status transitions preserve these audit artifacts when later calls omit them.
- Focused tests now cover backend-only ref resolution, ambiguous-ref failure, registry delivery to handlers/composer, and checklist/ledger preservation through packet-store lifecycle.
- Explorer subagent adapter findings accepted for the next P16 slice:
  - reuse `location-graph.ts` graph helpers, `ref-registry.ts`, character record adapters, `location-events.ts`, and world-clock/authority helpers as data/source adapters only;
  - do not import old tool schemas, old executor, or legacy `ToolResult` as authority;
  - be careful that `commitAuthorityTrace` currently touches old `ToolResultAuthority`, so either wrap/extract narrowly or avoid it until a v2-native authority adapter exists.
- Verification:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (77 tests).
  - `npm --prefix backend run typecheck`.
  - Source separation scan over `backend/src/engine/gameplay-cycle-v2` found only the deliberate forbidden-import denylist in `contracts.ts`, not old runtime imports.
  - `git diff --check` reported no whitespace errors, only LF/CRLF warnings on already modified tracked files.
  - GitNexus `detect_changes(scope=all)` reported low risk with no affected processes for tracked files; new untracked v2 files are not yet symbol-indexed, so symbol-level impact will require `npx gitnexus analyze --embeddings` after commit.
  - GitNexus impact on tracked adapter symbols was LOW: `normalizePlayerFacingEmittedEvent` had no upstream callers in the graph; `playerSafeDoneBoundary` and `playerSafeErrorBoundary` affect only route SSE event shaping through `toPlayerFacingTurnEvent`.
  - Backend ports `3199` and `3001` were not listening after verification.

P16 DB-backed handler decision and implementation:
- Oracle/GPT-5.5 Pro session: `v2-db-handlers-authority`.
  - Dry-run: browser mode, forced one bundled attachment via `--browser-bundle-files`, 13 files, about 56.7k tokens, one `attachments-bundle.txt`.
  - Real run completed on GPT-5.5 Pro / Extended Pro.
  - Recommendation accepted:
    - `route.check.v2` is observation-only and never advances world version.
    - `actor.move.v2` is the first DB-backed v2 mutation; actor row update, embedded character record projection, world clock advance, authority trace, and turn clock ledger must commit atomically.
    - `scene_beat.record.v2` stays terminal non-mutating in P16 and must not write `location_recent_events`; durable local memory needs a later explicit capability/contract.
    - Do not import legacy `ToolResultAuthority`; the DB column `tool_result_id` may be used only as an internal schema column populated with a v2 namespaced source key.
- Implemented `backend/src/engine/gameplay-cycle-v2/db-handlers.ts`.
  - Exports `createDbBackedGameplayToolHandlersV2()`.
  - Registers only `route.check.v2`, `actor.move.v2`, and `scene_beat.record.v2`.
  - Uses backend-only `GameplayRefRegistryV2` for actor/destination resolution; no semantic label regex or hidden backend refs are exposed to the model.
  - `actor.move.v2` uses one Drizzle transaction for player/NPC row update, character record projection, world clock update, `authority_traces` insert, and `turn_clock_ledger` insert.
  - `actor.move.v2` uses `gameplay-v2:{turnId}:{requestId}` as internal authority source key and does not return/import old `ToolResult`/`ToolResultAuthority`.
  - Movement receipts currently leave `durableEventIds=[]`; movement truth is the accepted runtime mutation receipt, not a generic location event.
- Focused P16 tests added:
  - connected `route.check.v2` accepted as `observation_only` with unchanged DB/world version;
  - player `actor.move.v2` updates row + `character_record`, advances world version, inserts v2 authority trace and clock ledger, and does not create `location_recent_events`;
  - NPC `actor.move.v2` updates NPC row and authority source without legacy `ToolResult`;
  - forced post-row/pre-authority failure rolls back actor row, world clock, authority traces, and ledger;
  - `scene_beat.record.v2` accepted as terminal receipt with no DB writes/world-version advance;
  - source-boundary test for `db-handlers.ts` forbids old runtime imports/executor/`ToolResultAuthority`.
- Verification:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (83 tests).
  - `npm --prefix backend run typecheck`.
  - Source separation scan over `backend/src/engine/gameplay-cycle-v2` found only the deliberate forbidden-import denylist in `contracts.ts`.
  - `git diff --check` reported no whitespace errors, only LF/CRLF warnings on already modified tracked files.
  - GitNexus `detect_changes(scope=all)` reported low risk and no affected processes for tracked files; new untracked v2 files remain unavailable to symbol-level GitNexus until `npx gitnexus analyze --embeddings` after commit.
  - Backend ports `3199` and `3001` were not listening after verification.

P17 live mutating adapter decision and implementation checkpoint:
- Develop branch maintenance:
  - User reported GitHub showing `develop` behind `main`.
  - Fixed by fast-forwarding `develop` from `45517081` to `b2335b58` and pushing `origin/develop`.
- Oracle/GPT-5.5 Pro session: `p17-live-mutating-adapter`.
  - Dry-run: browser mode, forced one bundled text attachment via `--browser-bundle-files`, 18 files, about 173.5k tokens.
  - Real run completed on GPT-5.5 Pro / Extended Pro with one `attachments-bundle.txt`.
  - Recommendation accepted:
    - Replace/rename the live no-mutation adapter into full `processGameplayTurnCycleV2()`.
    - Admit `tool_plan` as first-class GM Read path while keeping GM Read free of tool payloads, narration, and mutation.
    - Generate `gm-action-checklist.v2` from the accepted GM Read, then generate exactly one `gameplay-tool-request.v2` per executable step.
    - Do not pre-generate dependent requests against the initial packet; request generation must happen against the latest model-facing packet after any accepted mutation refresh.
    - Use `composeGameplayCycleMutatingTurnV2()` plus `createDbBackedGameplayToolHandlersV2()`.
    - Provide `buildGameplayRefRegistryV2()` from each current/refreshed SceneFrame.
    - Keep the legacy `turn_sagas` bridge out of this slice.
    - Fail closed before packet persistence for invalid checklist/request/composition/frame-refresh; after packet persistence, use v2 pending/rendering/finalized packet-store semantics.
  - Critical red flags accepted: old schemas/executor/`ToolResult`, semantic label parsing, stale dependent request packets, `route.check.v2` as movement, `scene_beat.record.v2` durable writes, and transport-owned mutation truth.
- Implemented so far:
  - `validateGmReadV2()` now admits `tool_plan` through the checklist validator.
  - `processGameplayTurnCycleV2()` is the live adapter; `processGameplayTurnCycleV2NoMutation` remains only as an alias.
  - Live SceneFrame envelopes now expose the minimal P17 live capability surface: `observe_visible`, `oracle_roll`, `route_options`, `route_check`, `movement`, and `scene_beat_record`.
  - Runtime added model-generation adapters for GM action checklist, selected-step tool requests, and required local consequence candidates.
  - Runtime routes `tool_plan` through `composeGameplayCycleMutatingTurnV2()` and `createDbBackedGameplayToolHandlersV2()`, persists checklist + receipt ledger audit with the v2 packet, and keeps old post-turn hooks out.
  - Runtime fails closed before packet persistence when composition contains failed or skipped required primary steps, so audit-only rejected requests cannot become player-facing settled truth.
  - Packet store now has a v2 narrator failed-pending-retry transition that preserves packet/checklist/ledger/narrator view and keeps API projection empty.
  - `GameplayCycleV2PendingNarrationError` now carries packet/campaign/turn ids after the v2 packet is persisted and narrator rendering fails.
  - `/api/chat/action` and `/api/chat/retry` catch that typed v2 pending error, emit a recoverable `pendingNarration` SSE error with `runtime=gameplay-cycle-v2`, and do not restore the pre-turn snapshot.
  - `/api/chat/resume` can now resume v2 pending narration from the preserved v2 packet using a v2 resume token, finalizing the packet/API projection after successful narrator output.
  - `composeGameplayCycleMutatingTurnV2()` now accepts request/local-consequence provider callbacks so dependent requests are generated against the latest refreshed packet instead of stale initial refs.
  - `turn-processor.ts` switches `WORLDFORGE_GAMEPLAY_CYCLE_V2` to full `processGameplayTurnCycleV2()`.
- Focused P17 tests added:
  - unified GM Read validator accepts clean `tool_plan` and rejects payload smuggling;
  - composer request provider receives baseWorldVersion `7` for step 1 and refreshed baseWorldVersion `8` for dependent step 2 after accepted movement;
  - runtime source-boundary test now expects full v2 adapter wiring and rejects legacy ownership imports/surfaces.
  - `/api/chat/action` route test proves a `GameplayCycleV2PendingNarrationError` emits v2 pending narration SSE and does not call legacy pending saga resume or `restoreSnapshot`.
  - `/api/chat/resume` route test proves v2 pending packets resume through the v2 runtime path instead of legacy saga replay.
- Verification:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (85 tests).
  - `npm --prefix backend test -- src/routes/__tests__/chat.test.ts` (60 tests).
  - `npm --prefix backend run typecheck`.
- Known P17 gap before live/manual acceptance:
  - v2 pending narration transport/resume is contract-tested, but no live `/api/chat/action` manual evidence has been counted for this slice yet.

P17 explicit movement / route-check / local consequence burn-in checkpoint:
- Oracle/GPT-5.5 Pro:
  - Existing valid P17 explicit movement review accepted the hybrid ownership rule: model owns open-ended interpretation; backend owns closed-world admission, checklist request construction, validation, mutation authority, receipts, and persistence.
  - New Oracle dry-run for deterministic simple checklist compiler succeeded with one bundled attachment (`p17-checklist-compiler`, 10 files, ~119k tokens), but the real browser run was invalid because the Oracle Chrome profile was not logged into ChatGPT and no context was delivered. Do not count it as review evidence.
  - Local decision from the accepted P17 invariant: for a GM Read that already validates as one simple live-slice effect (`route_check`, `movement`, `scene_beat`), backend may compile the intent-only `gm-action-checklist.v2`; it still must not emit tool requests, receipts, mutation, or narration.
- Fixes implemented after diagnostic lanes:
  - `compileSimpleGmActionChecklistV2()` now compiles one-step backend-owned checklists for simple accepted GM Read checklist requests. Runtime uses it before falling back to model-generated checklists for future multi-effect/open-ended cases.
  - Explicit movement completion now only repairs GM Read candidates whose structured `checklistRequest.requiredEffectKinds` includes `movement`; route checks are no longer rewritten into movement.
  - GM Read loose schema accepts empty/non-empty non-executable sidecars (`noMutationReason`, `clarificationPrompt`) and strips them before strict validation.
  - Local consequence scheduler no longer emits accepted evidence saying visible NPCs "may need response"; scheduled scene-beat receipts now record visibility only.
- Diagnostic evidence:
  - Lane-11/12: route-check text could be rewritten into movement; invalid.
  - Lane-13/14: sidecar/schema failures restored before settlement; invalid.
  - Lane-15: reached 5 clean turns, then turn 6 route-check to `Ground-Floor Barricade` exposed brittle model-generated checklist failure; invalid.
  - Same diagnostic campaign after compiler fix replayed the failing route-check successfully with a backend-compiled checklist and observation-only `route.check.v2` receipt.
  - Lane-16 fresh clone reached 4 turns, then narrator overstated local consequence evidence as NPC attention; invalid.
  - Lane-17 fresh clone `f59ada43-e849-4c0c-880b-bf854ffff8c9` reached 4 clean turns after both fixes: route-check, movement, route-check, movement into `Transmission Basement`. DB after turn 4: `gameplay_cycle_v2_packets=4`, legacy `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, `authority_traces=2`, `turn_clock_ledger=2`, `chat_history=8`, player scene `Transmission Basement`, `worldVersion=2`, `currentTick=4`.
  - Lane-17 local consequence evidence is visibility-only: Venn the Borrowed and Relay-Tech Dorin are present in Transmission Basement after movement; narration only states presence, not attention/reaction.
- Verification so far:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` passed with 101 tests after the compiler and visibility-only fixes.
- Not acceptance:
  - Lane-17 is a focused regression burn-in only. Final acceptance still requires several different zero-turn campaigns/clones at about 60 clean turns each with zero failed, replayed, restored, or invalid player-facing turns.

P17 live/manual diagnostic and Oracle follow-up:
- Live setup:
  - Started stable backend on `PORT=3199` with `WORLDFORGE_GAMEPLAY_CYCLE_V2=1`; stopped it after diagnostics. Ports `3199/3001` were empty before the Oracle run.
  - Clean source campaign `30e161da-db4b-4d8c-ab93-154fab7aa03f` verified with empty `chat_history`.
  - Diagnostic lane-1 clone `dc6b0d59-d809-45c1-ad89-715d0186ba00`; lane-2 clone `9dbfa40c-027d-49a5-961e-751186f0a8a3`; lane-3 clone `0bef1a0c-0c56-4f4c-b536-f6df01960398`; lane-4 clone `28819789-fc57-40fb-b7d3-10885fc667dd`.
- Evidence:
  - Lane-1 first valid action reached `done` with `runtime=gameplay-cycle-v2`, packet `v2packet-mpzt2sku-f7fbf63095d0`, and only `gameplay_cycle_v2_packets=1`; no legacy `turn_sagas`, `settled_turn_packets`, or `narrator_attempts`. It covered Oracle/no-mutation, not mutating tool-plan acceptance.
  - Lane-1 second action exposed a pre-fix failure: explicit connected movement to `Silt Warrens` finalized as fake clarification after GM Read generation failed validation. This lane is diagnostic only.
  - Fix applied: runtime no longer synthesizes player-facing clarification when GM Read generation fails; runtime now rejects non-accepted `validateGmReadV2()` results before settlement.
  - Lanes 2-4 replayed the explicit connected movement action and now fail closed with restored snapshot, no packet/chat/saga/narrator rows. This proves restore/no-fake-clarification, but not live mutating acceptance.
  - Additional fixes attempted: path-scoped loose GM Read candidate schema, exact `checklistRequest.turnPath` prompt contract, and structural discriminator normalization from checklist ownership. Focused tests pass, but live movement still fails because the model/repair path omits `checklistRequest`.
- Follow-up implementation/evidence after Oracle decision:
  - Added `explicitMovementAdmissionV2` as a backend-owned admission layer for exact visible connected movement. It emits no tool payload, state delta, receipt, narration, travel success, or safety claim; it only completes a backend-owned checklist request when the action exactly cites a unique connected movement option.
  - Runtime now fails closed on GM Read generation/validation failure before settlement instead of synthesizing fake clarification.
  - GM Read validation now uses path-scoped loose candidate parsing, strips non-executable sidecars, and rejects executable sidecars/payload smuggling.
  - Action checklist generation is constrained by GM Read `requiredEffectKinds` and derived capability ids; generated steps outside that contract are rejected.
  - Post-mutation frame refresh now uses the refreshed world clock/tick rather than the stale initial turn tick.
  - Local consequence request generation is deterministic and backend-owned for `scene_beat.record.v2`; no model call, no missing `summary`, no invalid `destinationRef`.
  - SceneFrame/model projection/ref-registry boundaries now keep the player only under canonical `Player`; player labels such as `Mira Voss` are not exposed as visible actor/target evidence.
  - Diagnostic lanes 5-10 exposed and drove fixes for checklist overreach, stale refreshed tick, local consequence schema, mixed Oracle-shaped GM Read admission, top-level GM Read evidence closure, and player-label actor/target leakage. These lanes do not count as acceptance.
  - Lane-11 clone `db6e13e1-f9f2-47ae-9237-e64637c972de` from zero-turn source `30e161da-db4b-4d8c-ab93-154fab7aa03f` reached `narrative` + `done` through real `/api/chat/action` with `runtime=gameplay-cycle-v2`.
  - Lane-11 player action: `Я выбираю Silt Warrens как менее открытый путь и иду туда, держа sealed lacquer message tube закрытой в courier satchel.`
  - Lane-11 DB proof: `gameplay_cycle_v2_packets=1`, legacy `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, `chat_history=2`, player location `Silt Warrens`, packet `v2packet-mpzwqym9-e7ce6532ba40` finalized with `gmRead.path=tool_plan`, accepted receipt `receipt-step-1`, no failed/skipped steps, and no `Mira Voss` in packet/narration.
  - Backend process on `3199` was stopped after lane-11 evidence.
- Verification after fixes:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (97 tests).
  - `npm --prefix backend test -- scene-frame.test.ts` (22 tests).
  - `npm --prefix backend test -- src/routes/__tests__/chat.test.ts` (61 tests).
  - `npm --prefix backend run typecheck`.
- Oracle/GPT-5.5 Pro session: `p17-explicit-movement-admission`.
  - Dry-run: browser mode, one bundled attachment planned, 10 files, about 118.2k tokens.
  - Real run completed on GPT-5.5 Pro / Extended Pro with `--browser-bundle-files`; saved to `output/oracle/p17-explicit-movement-admission/response.md`.
  - Recommendation accepted: hybrid. Keep GM Read as auditable turn-intent center, but add a backend-owned explicit movement admission layer for exact visible connected movement. The layer emits only a checklist/admission seed and passes through the same validators; it must not emit tools, payloads, receipts, state deltas, narration, travel success, safety claims, or NPC reactions.
  - Required invariant: model owns open-ended interpretation; backend owns closed-world admission, ref resolution, capability availability, mutation authority, and packet persistence.
  - Next implementation: `explicitMovementAdmissionV2` after SceneFrame/model packet creation, using only player action, movement candidates/citable refs/ref registry/capability surface; complete a missing/malformed movement `checklistRequest` only when an exact visible connected destination label is unambiguous and no executable/private/uncited/contradictory payload is present. Fail closed before persistence otherwise.

## Primitive Rewrite Cycle

Development loop for each primitive:
1. Treat `/api/chat/action` player input as the entrypoint and the frozen post-response world state/API response as the exitpoint for every runtime slice.
2. Break the runtime into primitive ownership layers: data needed, authoritative input, authoritative output, downstream consumer, failure behavior, and forbidden responsibilities.
3. Before major architecture choices, ask Oracle/GPT-5.5 Pro with a real context bundle; wait for completion, record dry-run/question/answer/decision, then implement.
4. Implement the primitive as a full layer, not a guard/fallback patch.
5. Add isolated contract tests that prove the primitive boundary before wiring it into the entry-to-exit path.
6. Integrate with already-proven primitives only after isolated tests pass, then test the combined path.
7. Run real `/api/chat/action` evidence on zero-turn world clones; one manually chosen action at a time after inspecting current state.
8. For a newly integrated primitive, run a focused manual slice of about 10-15 turns before moving to the next layer, unless the slice is too small to reach live play yet.
9. Record evidence and failures here before moving to the next primitive. Any contract failure turns that lane into diagnostic evidence only.

Per-primitive acceptance gate:
- [ ] Name the current primitive's entry data, output contract, downstream consumer, mutation authority, and non-goals.
- [ ] Prepare an Oracle/GPT-5.5 Pro dry-run bundle for any architectural choice that changes ownership, schemas, receipts, persistence, or model-facing behavior.
- [ ] Wait for Oracle/GPT-5.5 Pro completion even if the UI spends minutes finalizing; record the question, answer, accepted decision, and dissent/debt.
- [ ] Implement the primitive as a complete runtime layer, using subagents for focused exploration/implementation slices when useful.
- [ ] Run isolated contract tests for the primitive.
- [ ] Run composition tests with all already accepted primitives.
- [ ] Create or choose a zero-turn source world/clone and inspect its current state before the first manual action.
- [ ] Send exactly one manually chosen `/api/chat/action`, inspect the frozen post-response world/API state, then choose the next action from that observed state.
- [ ] For an integrated primitive that can affect live play, gather about 10-15 clean manual turns before advancing to the next primitive.
- [ ] If any turn fails, restores, replays, contradicts settled truth, or exposes invalid player-facing behavior, mark the lane diagnostic-only and fix the primitive boundary before using fresh zero-turn evidence.

Primitive order:
- [x] P0 Chat action transport boundary adapter contract.
- [x] P1 Turn attempt / settlement boundary contract.
- [x] P2 SceneFrame envelope contract.
- [x] P3 model-facing projection contract and builder.
- [x] P4 GM Read for direct / continue / clarification only.
- [x] P5 GM Read contract validator and safe fallback.
- [x] P15 no-receipt Settled Turn Packet.
- [x] P16 settled packet persistence-attempt contract.
- [x] P17 narrator view from settled packet only.
- [x] P18 API response projection.
- [x] P6 Oracle settlement.
- [ ] P7 Action Checklist.
- [x] P8 Runtime Capability Catalog.
- [ ] P9 one-step Tool Request Planner.
- [ ] P10 Runtime Executor / mutation authority.
- [ ] P11 Evidence Semantics Normalizer.
- [ ] P12 Receipt Ledger.
- [ ] P13 Frame refresh after accepted mutation.
- [ ] P14 Local consequence scheduler.
- [ ] Recovery matrix: forced failure at frame, GM Read, checklist, tool request, executor, packet persist, narrator, chat projection.
- [ ] Playability burn-in: 10-turn fresh clone gate before final 3x60 acceptance.

## Implementation Notes 2026-06-04: P9 One-Step Tool Request Planner Contract Slice

- Added `backend/src/engine/gameplay-cycle-v2/tool-request-planner.ts`.
- Added `GameplayToolRequestV2` / `gameplayToolRequestV2Schema` in `backend/src/engine/gameplay-cycle-v2/contracts.ts`.
- P9 accepts exactly one selected checklist step and one clean v2 `toolId`:
  - `route.check.v2`;
  - `actor.move.v2`;
  - `dialogue.record.v2`;
  - `world_fact.record.v2`;
  - `support_actor.create.v2`;
  - `entity.tag.v2`;
  - `item.transfer.v2`;
  - `actor.condition_set.v2`;
  - `time.advance.v2`;
  - `scene_beat.record.v2`;
  - `location.reveal.v2`;
  - `minor_poi.create.v2`.
- P9 deliberately uses `effectBinding`, not root `input`, so the planner does not recreate v1 `toolName/input` semantics before P10 owns executable translation.
- P9 rejects old runtime tool names and old executable payload fields (`toolName`, `toolInput`, `input`, `args`, `payload`, `candidateToolRequest`, `plannedTools`, state deltas, receipt/result fields).
- P9 validates:
  - request `stepId` matches the selected checklist step;
  - request `capabilityId` matches the step `requiredCapabilityId`;
  - step effect kind is owned by that capability;
  - capability is exposed in the model-facing packet;
  - catalog `plannerSurface` is `tool_request`;
  - `toolId` is the clean v2 tool id for that capability;
  - all refs in `effectBinding` are citable and belong to the selected step refs;
  - private guard terms do not leak into request fields.
- Excluded from P9:
  - `observe_visible` and `route_options` because their planner surface is `none`;
  - `oracle_roll` because its planner surface is `oracle`;
  - `quick_action_offer` because its planner surface is `ui`.
- Focused tests cover accept/reject behavior for clean movement binding, legacy tool surfaces, non-tool-request capability surfaces, capability/effect mismatch, uncited/private refs, and multi-step payload smuggling.
- Verified:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (42 tests).
  - `npm --prefix backend run typecheck`.
  - `git diff --check` (no whitespace errors; LF/CRLF warnings only on already modified tracked files).
  - GitNexus `detect_changes(scope=all)` reported low risk, `affected_count=0`, `affected_processes=[]`; untracked v2 files are not yet represented as changed symbols in the graph.
  - Backend ports `3199` and `3001` were not listening after verification.
- No live `/api/chat/action` gate yet: P9 is not wired to live runtime and has no executor/mutation/receipt authority until P10.

## Implementation Notes 2026-06-04: P10 Runtime Executor / Mutation Authority Contract Slice

- Added `backend/src/engine/gameplay-cycle-v2/runtime-executor.ts`.
- Added `GameplayRuntimeReceiptV2` / `gameplayRuntimeReceiptV2Schema` in `backend/src/engine/gameplay-cycle-v2/contracts.ts`.
- P10 executor boundary:
  - accepts one selected checklist `stepId`;
  - validates one clean `GameplayToolRequestV2` through P9 before any handler runs;
  - dispatches only to a v2 handler registry keyed by clean dotted `toolId`;
  - normalizes handler output into `gameplay-runtime-receipt.v2`;
  - never imports old `tool-executor`, old runtime schemas/descriptors, `gm-tool-loop`, `tool-contracts`, or v1 orchestrator.
- Runtime receipt statuses:
  - `accepted`: backend accepted the request; accepted mutation requires `mutationApplied=true`, `evidenceAuthority=mutation_receipt`, non-`none` `mutationAuthority`, and `resultWorldVersion > baseWorldVersion`.
  - `rejected`: request failed validation/authority before handler execution; no mutation and no world-version advance.
  - `failed`: handler was missing/threw/returned invalid outcome/violated authority; no mutation and no world-version advance.
- Evidence authority contract:
  - `route.check.v2` can return accepted `observation_only`, `mutationAuthority=none`, no version advance.
  - `actor.move.v2` must return accepted `mutation_receipt`, explicit mutation authority, and version advance.
  - terminal receipt capabilities are accepted as `terminal_receipt` without mutation unless a later layer splits durable mutation into its own receipt.
- P10 currently uses handler outcomes as backend authority adapters; it does not call old tools and does not write DB state itself in this contract slice.
- Focused tests cover:
  - accepted movement mutation receipt;
  - accepted route-check observation receipt;
  - rejected invalid/uncited request before handler invocation;
  - failed closed malformed handler mutation authority;
  - executor source separation from old runtime tool ownership imports and `ToolResult`.
- Browser/GPT review for P10 did not run because the built-in Browser Plugin repeated the pre-execution `failed to write kernel assets` blocker.
- Verified:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (47 tests).
  - `npm --prefix backend run typecheck`.
  - Forbidden old executor/import search over P9/P10 returned no matches.
  - `git diff --check` (no whitespace errors; LF/CRLF warnings only on already modified tracked files).
  - GitNexus `detect_changes(scope=all)` reported low risk, `affected_count=0`, `affected_processes=[]`; untracked v2 files are not yet represented as changed symbols in the graph.
  - Backend ports `3199` and `3001` were not listening after verification.
- No live `/api/chat/action` gate yet: P10 is not wired into live runtime. The next layer must turn accepted receipts into settled evidence/packet semantics before live mutating narration can be honest.

## Implementation Notes 2026-06-04: P11/P12 Evidence Normalizer And Receipt Ledger Contract Slice

- Added `backend/src/engine/gameplay-cycle-v2/evidence-normalizer.ts`.
- Added `backend/src/engine/gameplay-cycle-v2/receipt-ledger.ts`.
- Extended `gmReadV2Schema` to include accepted `tool_plan` GM Reads, so runtime-settled packets can carry the GM Read that caused the checklist. The runtime adapter still does not accept live `tool_plan` as no-mutation behavior.
- Added `GameplayRuntimeReceiptLedgerV2` / `gameplayRuntimeReceiptLedgerV2Schema` in `backend/src/engine/gameplay-cycle-v2/contracts.ts`.
- P11 `normalizeRuntimeReceiptEvidenceV2`:
  - accepts only `status=accepted` runtime receipts as potential settled evidence;
  - rejects rejected/failed receipts as narrator truth;
  - rejects evidence whose refs are not citable in the model-facing packet;
  - rejects private term leakage without repeating the private term in audit text;
  - emits tool-specific runtime evidence text, including route-check language that explicitly says route availability only, not movement or arrival.
- P12 `buildRuntimeReceiptLedgerV2` / `buildRuntimeSettledTurnPacketV2`:
  - records all runtime receipts in a v2 ledger;
  - creates accepted runtime evidence only from normalized accepted receipts;
  - populates `acceptedRuntimeReceiptIds` only for receipts that became settled runtime evidence;
  - carries accepted durable event ids from accepted receipts;
  - records rejected/failed receipts in `failedSteps`;
  - records checklist steps with no receipt in `skippedSteps`;
  - derives `resultWorldVersion` from accepted receipt outcomes, not from checklist intent.
- Focused tests cover:
  - route-check receipt evidence remains availability-only and cannot authorize movement/arrival;
  - accepted movement mutation receipt enters settled packet truth and narrator view;
  - rejected invalid request stays out of settled evidence and becomes failed-step audit;
  - accepted receipt with private leakage is blocked by the evidence normalizer and not counted as runtime truth;
  - skipped checklist steps become audit only and do not create accepted evidence;
  - receipt evidence layers remain free of old runtime tool imports and `ToolResult`.
- Verified:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (53 tests).
  - `npm --prefix backend run typecheck`.
  - `git diff --check` (no whitespace errors; LF/CRLF warnings only on already modified tracked files).
  - GitNexus `detect_changes(scope=all)` reported low risk, `affected_count=0`, `affected_processes=[]`; untracked v2 files are not yet represented as changed symbols in the graph.
  - Backend ports `3199` and `3001` were not listening after verification.
- No live `/api/chat/action` gate yet: P11/P12 are not wired into live runtime. Next needed layer is P13 frame refresh / composition after accepted mutation, then live mutating vertical slice can be considered.

## Implementation Notes 2026-06-04: P13 Frame Refresh After Accepted Mutation Contract Slice

- Added `backend/src/engine/gameplay-cycle-v2/frame-refresh.ts`.
- P13 `refreshFrameAfterAcceptedMutationV2` owns the post-mutation snapshot boundary:
  - accepted non-mutating receipts do not require refresh;
  - accepted mutating receipts require a refreshed `SceneFrameEnvelopeV2`;
  - stale/missing refreshed frames are rejected before dependent planning/narration can proceed;
  - refreshed frame must match the same campaign, turn, player action, and accepted mutation `resultWorldVersion`;
  - refreshed frame is projected into a new `ModelFacingTurnPacketV2` via the existing projection adapter.
- P13 does not build a SceneFrame from DB itself. The DB/world-state builder remains a data-source adapter; P13 validates the adapter's output and makes stale packets unusable after accepted mutation.
- Focused tests cover:
  - route-check/observation-only accepted receipt does not require refresh;
  - accepted movement mutation without refreshed frame is rejected;
  - accepted movement mutation plus refreshed post-mutation frame yields a new model-facing packet at `baseWorldVersion=8` with new current scene refs;
  - stale refreshed frame at the old world version is rejected;
  - frame refresh layer remains free of old runtime tool imports and `ToolResult`.
- Verified:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (57 tests).
  - `npm --prefix backend run typecheck`.
  - `git diff --check` (no whitespace errors; LF/CRLF warnings only on already modified tracked files).
  - GitNexus `detect_changes(scope=all)` reported low risk, `affected_count=0`, `affected_processes=[]`; untracked v2 files are not yet represented as changed symbols in the graph.
  - Backend ports `3199` and `3001` were not listening after verification.
- No live `/api/chat/action` gate yet: P13 is not wired into live runtime. Next layer is P14 local consequence scheduler or a narrow mutating vertical composition harness, depending on whether actor/local consequence ownership must be settled before first live tool-plan slice.

## Implementation Notes 2026-06-04: P14 Local Consequence Scheduler Contract Slice

- Added `backend/src/engine/gameplay-cycle-v2/local-consequence-scheduler.ts`.
- Added `LocalConsequenceScheduleV2` / `localConsequenceScheduleV2Schema` in `backend/src/engine/gameplay-cycle-v2/contracts.ts`.
- P14 scheduler boundary:
  - reads accepted runtime receipts from the P12 ledger;
  - considers only `status=accepted`, `mutationApplied=true`, non-world/non-ui local mutation receipts as triggers;
  - uses the current/refreshed `ModelFacingTurnPacketV2` as the only visible actor source;
  - schedules immediate visible non-player actor consequences as `required_before_packet`;
  - emits `route=none` for observation-only/no local mutation receipts;
  - emits `deferred_audit` when accepted local mutations exist but no visible non-player actor is in the refreshed packet;
  - does not execute actor tools, call old actor passes, create receipts, or create narrator evidence.
- Scheduled entries are obligations for later normal v2 execution:
  - currently represented as `scene_beat_record` / `scene_beat` requirements against visible actor refs;
  - trigger receipt id must be in the schedule trigger list;
  - schedule entries and skipped audit remain separate from settled truth until executed into accepted receipts.
- P14 deliberately avoids old v1 surfaces:
  - no `runRequiredActorDecisionPass`;
  - no `actor-tools`;
  - no old `tool-executor`, `runtime-tool-input-schemas`, `gm-tool-loop`, `ToolResult`, or `onPostTurn`.
- Focused tests cover:
  - accepted observation-only receipt produces `route=none`;
  - accepted movement/local-scene mutation plus visible actor produces a required schedule entry;
  - hidden/background actor labels do not enter schedule;
  - accepted local mutation with no visible non-player actors becomes `deferred_audit`;
  - stale scheduler packet relative to ledger is rejected;
  - scheduler source separation from old runtime/actor imports.
- Verified:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (61 tests).
  - `npm --prefix backend run typecheck`.
  - `git diff --check` (no whitespace errors; LF/CRLF warnings only on already modified tracked files).
  - GitNexus `detect_changes(scope=all)` reported low risk, `affected_count=0`, `affected_processes=[]`; untracked v2 files are not yet represented as changed symbols in the graph.
  - Backend ports `3199` and `3001` were not listening after verification.
- No live `/api/chat/action` gate yet: P14 is scheduler-only. Next needed work is a narrow mutating composition harness that links GM Read tool_plan -> checklist -> P9 request -> P10 receipt -> P13 refresh -> P14 schedule -> P12 packet before wiring live runtime.

## Implementation Notes 2026-06-04: Narrow Mutating Composition Harness Contract Slice

- Added `backend/src/engine/gameplay-cycle-v2/mutating-composer.ts`.
- Exported the composer through `backend/src/engine/gameplay-cycle-v2/index.ts`.
- Updated P12 ledger/settled-packet contract for honest post-mutation composition:
  - `GameplayRuntimeReceiptLedgerV2.baseWorldVersion` remains the initial turn base;
  - individual receipts now keep their own pre-step `baseWorldVersion`;
  - ledger validation now requires each receipt base to equal the current chain head; accepted mutations advance the chain, all other receipts keep it fixed;
  - accepted non-mutating receipts cannot advance `resultWorldVersion`;
  - rejected/failed receipts cannot carry accepted durable event ids;
  - ledger builder rejects checklist/packet mismatch, duplicate accepted receipts for a step, accepted dependent steps before accepted prerequisites, accepted capability/checklist mismatch, and stale world-version bases;
  - `buildRuntimeSettledTurnPacketV2` can receive `latestModelPacket` for final visible scene evidence and requires exact pre-step `receiptModelPackets` for every accepted receipt;
  - accepted receipt evidence normalization failure blocks settlement instead of downgrading the receipt to failed audit;
  - runtime receipt evidence carries `sourceReceiptId` for one-to-one receipt traceability;
  - settled packet private guard terms include initial, latest, and receipt model packets.
- Composer ownership:
  - accepts an already accepted initial `ModelFacingTurnPacketV2`, `GmReadChecklistV2`, and `GmActionChecklistV2`;
  - executes checklist steps sequentially through P10 `executeGameplayToolRequestV2`;
  - validates dependent step requests against the latest/refreshed packet, not stale initial refs;
  - requires P13 `refreshFrameAfterAcceptedMutationV2` after every accepted mutation before continuing or building settled truth;
  - builds the P12 receipt ledger and settled packet only from actual runtime receipts;
  - builds the P14 local consequence schedule from the latest packet and ledger;
  - returns `blocked` with no settled packet when accepted mutation lacks a valid refreshed frame, when accepted receipt evidence cannot be normalized, or when P14 emits `required_before_packet` local consequence obligations.
- Composer non-goals:
  - does not create GM Read, checklist, or tool request payloads;
  - does not call DB/world builders directly;
  - does not execute scheduled local consequences yet;
  - does not call old v1 tools, tool loop, actor pass, post-turn simulation, or narrator guard surfaces.
- Focused tests cover:
  - accepted movement request -> mutation receipt -> refreshed frame -> required local consequence schedule blocks before settled packet;
  - route-check observation settles without refresh and keeps evidence as route availability only, not movement/arrival;
  - rejected request skips handler execution, creates failed-step audit, and does not create runtime truth;
  - accepted mutation without refreshed frame blocks before settled truth;
  - dependent post-mutation request is validated against the refreshed packet and stale initial refs are rejected before handler execution;
  - stale receipt world-version bases are rejected by strict chain-head validation;
  - accepted non-mutating receipt version advances are rejected;
  - missing or mismatched pre-step receipt model packets block settlement;
  - accepted dependent receipts without earlier accepted prerequisites are rejected.
- Oracle/GPT-5.5 Pro status:
  - dry-run succeeded with 9 intended files and about 51k tokens;
  - real Oracle browser run with attachments failed before a ChatGPT conversation was created; the user closed Chrome to avoid a hang;
  - this is not valid Oracle review evidence;
  - retry used `--browser-inline-files` with 4 files and about 16.6k tokens, explicitly pasted inline with no attachment upload;
  - session `v2-composer-inline-small` completed on GPT-5.5 Pro / Extended Pro; output saved at `output/oracle-v2-composer-inline-small.txt`;
  - verdict: MODIFY. Accepted direction, but required strict chain-head lineage, exact mandatory pre-step receipt packets, no accepted non-mutating version advance, blocking accepted receipt normalization failures, dependency enforcement, runtime evidence traceability, and no `settled` result while local consequences are `required_before_packet`;
  - local decision: implement the MODIFY recommendations listed above before any live mutating `/api/chat/action` wiring.
- Verified:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (70 tests).
  - `npm --prefix backend run typecheck`.
  - Old runtime import scan over `backend/src/engine/gameplay-cycle-v2` found only the deliberate forbidden-import constant list in `contracts.ts`.
  - `git diff --check` (no whitespace errors; LF/CRLF warnings only on already modified tracked files).
  - GitNexus `detect_changes(scope=all)` reported low risk, `affected_count=0`, `affected_processes=[]`; untracked v2 files are not yet represented as changed symbols in the graph.
  - Backend ports `3199` and `3001` were not listening after verification.
- No live `/api/chat/action` gate yet: this is a local contract composition harness. Next work is a live mutating runtime adapter that feeds real GM Read tool_plan/checklist/tool-request generation into this harness, plus a local-consequence execution layer or explicit pre-packet block handling.

## Implementation Notes 2026-06-04: Pre-Packet Local Consequence Execution Contract Slice

- Oracle/GPT-5.5 Pro decision:
  - dry-run succeeded with 6 inline files and about 21k tokens;
  - session `v2-local-consequenc-exec` completed on GPT-5.5 Pro / Extended Pro;
  - output saved at `output/oracle-v2-local-consequence-exec.txt`;
  - verdict: MODIFY option A. Build a local consequence execution layer, but make receipt/ledger source-aware so local consequence receipts do not pretend to be original GM checklist steps.
- Added source-aware receipt contract:
  - `GameplayRuntimeReceiptV2.source.kind="gm_action_checklist"` for primary checklist receipts;
  - `GameplayRuntimeReceiptV2.source.kind="local_consequence_schedule"` for required local consequence receipts;
  - primary receipt source step id must match the receipt step id;
  - local consequence receipt source must name `scheduleId`, `consequenceId`, and `triggerReceiptId`.
- Updated `backend/src/engine/gameplay-cycle-v2/runtime-executor.ts`:
  - every primary receipt is stamped with a GM checklist source by default;
  - local layers can pass a source override while still using the same v2 request validation and handler execution path;
  - rejected invalid requests are attributed to the selected obligation, not a model-authored bad step id.
- Updated `backend/src/engine/gameplay-cycle-v2/receipt-ledger.ts`:
  - primary receipts still validate against the original `GmActionChecklistV2`;
  - local consequence receipts validate against a prior accepted local mutation trigger receipt;
  - duplicate accepted local consequence receipts for the same `scheduleId:consequenceId` are rejected;
  - ledger chain-head validation applies across primary and local receipts.
- Added `backend/src/engine/gameplay-cycle-v2/local-consequence-executor.ts`.
- Local consequence executor ownership:
  - consumes `LocalConsequenceScheduleV2`, latest refreshed `ModelFacingTurnPacketV2`, current source-aware ledger, and explicit local consequence request candidates;
  - validates candidate `consequenceId`, `triggerReceiptId`, required capability, and obligated actor against the schedule entry;
  - enforces that the scheduled actor is still visible in the latest packet before execution;
  - executes through P10 `executeGameplayToolRequestV2` with `source.kind="local_consequence_schedule"`;
  - appends accepted/rejected/failed local receipts to the same turn ledger without checklist impersonation;
  - refreshes after accepted mutating local receipts when such a capability eventually exists;
  - returns `blocked` when required candidates are missing/invalid/rejected/failed, or when a required actor is no longer visible.
- Updated `backend/src/engine/gameplay-cycle-v2/mutating-composer.ts`:
  - if P14 emits `required_before_packet` and local consequence candidates are supplied, composer executes them before packet construction;
  - composer merges primary and local `receiptModelPackets` before building settled truth;
  - composer still blocks when required local consequences exist but no valid local execution resolves them.
- Focused tests cover:
  - source-aware primary receipts and strict ledger chain-head invariants;
  - local consequence receipt without accepted local mutation trigger is rejected;
  - required local consequence schedule blocks when no candidates are supplied;
  - valid local `scene_beat.record.v2` candidate resolves the required schedule and lets composer build a settled packet;
  - local receipt source metadata, base/result world versions, accepted runtime evidence, and durable ids enter the settled packet;
  - mismatched local candidate actor blocks before handler execution and produces no settled truth.
- Verified:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (73 tests).
  - `npm --prefix backend run typecheck`.
  - Old runtime import scan over `backend/src/engine/gameplay-cycle-v2` found only the deliberate forbidden-import constant list in `contracts.ts`.
  - `git diff --check` (no whitespace errors; LF/CRLF warnings only on already modified tracked files).
  - GitNexus `detect_changes(scope=all)` reported low risk, `affected_count=0`, `affected_processes=[]`; untracked v2 files are not yet represented as changed symbols in the graph.
  - Backend ports `3199` and `3001` were not listening after verification.
- No live `/api/chat/action` gate yet: this is still a local contract composition layer. Next work is live mutating runtime adapter wiring: model/tool-request generation must feed primary and local consequence candidates into the composer, then run a first real single-turn mutating live proof on a zero-turn clone.

First vertical slice:
- No Oracle, no tools, no actor reactions, no quick actions, no post-turn simulation.
- Supports direct / continue / clarification only.
- Proves player action -> frame -> GM Read -> settled packet -> narrator -> SSE done.
- Live gate: three zero-turn clones, five no-mutation turns each, zero restores/errors/pending narration, no private refs, no world mutation except allowed chat/saga/projection state.

## Implementation Notes 2026-06-04: P0/P1/P2 Contracts

- Added `backend/src/engine/gameplay-cycle-v2/contracts.ts`.
- Added `backend/src/engine/gameplay-cycle-v2/index.ts`.
- Added `backend/src/engine/__tests__/gameplay-cycle-v2-contracts.test.ts`.
- P0 `TurnStartEnvelopeV2` owns route/transport metadata only and rejects legacy compatibility `intent` / `method` fields at the new core boundary.
- P1 `TurnAttemptContextV2` owns pre-settlement restore, pending narration, and finalized done terminal states.
- P2 `SceneFrameEnvelopeV2` wraps the old `SceneFrame` only as a data adapter and requires campaign/tick/worldVersion/playerAction to match the turn attempt.
- New capability ids are semantic gameplay capabilities, not old runtime tool names; tests reject `move_to`, `spawn_npc`, `log_event`, `add_chronicle_entry`, `plannedTools`, and `candidateToolRequest`.
- Model-facing frame refs reject backend-only typed refs and UUIDs.
- Verified:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts`
  - `npm --prefix backend run typecheck`
- No live `/api/chat/action` gate yet: contracts are not wired into runtime. Next slice is P3 model-facing projection plus a v2 no-mutation vertical-slice adapter plan.

## Implementation Notes 2026-06-04: P3 Model-Facing Projection

- Added `ModelFacingTurnPacketV2` contract in `backend/src/engine/gameplay-cycle-v2/contracts.ts`.
- Added `backend/src/engine/gameplay-cycle-v2/projection.ts`.
- P3 builds prompt-facing scene context from `SceneFrameEnvelopeV2` using labels/names only:
  - current location/scene labels;
  - visible actor labels;
  - movement option labels;
  - target candidate labels;
  - inventory item labels;
  - player-perceivable recent event summaries;
  - scoped forecast advisory entries.
- Runtime private guard terms stay internal on `runtimePrivateGuardTerms`; `formatModelFacingTurnPacketForPromptV2` omits them from the prompt payload.
- Projection tests prove backend ids from actors/routes/items/events do not appear in the packet and private terms do not appear in prompt payload.
- Contract rejects private-term leaks into public packet fields.
- Verified:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts`
  - `npm --prefix backend run typecheck`
- No live `/api/chat/action` gate yet: P3 is not wired into runtime. Next slice is P4/P5 GM Read direct/continue/clarification contract and validator.

## Implementation Notes 2026-06-04: P4/P5 GM Read No-Mutation Contract

- Added `GmReadNoMutationV2` contract in `backend/src/engine/gameplay-cycle-v2/contracts.ts`.
- Added `backend/src/engine/gameplay-cycle-v2/gm-read.ts`.
- P4 accepts only `direct`, `continue`, and `clarification` paths for the first vertical slice.
- P4 explicitly excludes Oracle, tool planning, combat transition, mutation, narration, and executable payloads.
- P5 validates GM Read against the `ModelFacingTurnPacketV2.citableRefs` boundary.
- P5 rejects executable payload fields including `candidateToolRequest`, `plannedTools`, `toolName`, `toolInput`, `input`, and `payload`.
- P5 falls back to a no-mutation clarification read when schema, payload, or uncited-ref validation fails.
- Focused tests cover:
  - grounded direct read accepted;
  - executable payload rejected;
  - hidden/uncited ref rejected;
  - `tool_plan` rejected in no-mutation slice.
- Verified:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts`
  - `npm --prefix backend run typecheck`
- No live `/api/chat/action` gate yet: P4/P5 are not wired into runtime. Next slice is P15/P16/P17 no-receipt packet/store/narrator contract so the first no-mutation vertical adapter can be wired and playtested.

## Implementation Notes 2026-06-04: P15/P16/P17 No-Receipt Packet And Narrator View

- Added settled packet, persistence-state, and narrator-view contracts in `backend/src/engine/gameplay-cycle-v2/contracts.ts`.
- Added `backend/src/engine/gameplay-cycle-v2/settled-packet.ts`.
- P15 `buildNoReceiptSettledTurnPacketV2` creates accepted evidence only from:
  - SceneFrame-derived visible scene/current actor/movement/target/inventory/recent-event facts;
  - accepted no-mutation GM Read direct/continue/clarification evidence.
- P15 result world version equals base world version because no runtime receipt is accepted in this slice.
- P15 rejects runtime receipt ids unless `runtime_receipt` evidence exists.
- P16 `SettledPacketPersistenceV2` models the storage boundary as `resolved_pending_narration` / `not_started` without importing the old v1 packet shape.
- P17 `NarratorViewV2` exposes accepted evidence plus strict narration limits:
  - cannot infer new facts;
  - cannot call tools;
  - cannot use failed/skipped steps as truth.
- P17 omits private guard terms from narrator view.
- Focused tests cover:
  - no-receipt direct packet;
  - clarification packet/narrator view;
  - private-term leak rejection;
  - rejected receipt id without runtime evidence.
- Verified:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts`
  - `npm --prefix backend run typecheck`
- No live `/api/chat/action` gate yet: P18/API projection and the first vertical adapter are not wired. Next slice is P18 API response projection and `processGameplayTurnCycleV2` no-mutation adapter behind a disabled/explicit switch for live clone testing.

## Implementation Notes 2026-06-04: P18 API Projection And No-Mutation Adapter

- Added `ApiResponseProjectionV2` contract in `backend/src/engine/gameplay-cycle-v2/contracts.ts`.
- Added `backend/src/engine/gameplay-cycle-v2/api-response.ts`.
- P18 projects settled truth into the route-compatible `narrative` and `done` event pair:
  - `narrative.data.text` must be non-empty player-facing text;
  - `done.data` carries tick, worldVersion, worldTimeMinutes, turnId, packetId, `opening=false`, and `runtime=gameplay-cycle-v2`;
  - done event turnId/packetId must match the projection root.
- Route API adapter now preserves safe `turnId`, `packetId`, and `runtime` on player-facing `done`.
- V2 runtime uses public-safe `v2turn-*` / `v2packet-*` handles instead of exposing raw UUID backend refs in the API projection.
- Added `backend/src/engine/gameplay-cycle-v2/runtime.ts` as a no-mutation v2 adapter, not yet wired to `processTurn`.
- Wired `processTurn` to the no-mutation adapter behind disabled-by-default env switch `WORLDFORGE_GAMEPLAY_CYCLE_V2=1`.
- Default behavior remains `processGameplayTurnCycleV1`.
- The adapter uses old modules only as data/source adapters:
  - campaign/chat/tick storage;
  - provider creation and LLM call wrappers;
  - `buildSceneFrame`;
  - world clock sync/read;
  - forecast load/scope.
- The adapter does not import old runtime tool schemas, descriptors, GM tool loop, tool contracts, receipt matcher, or storyteller tool registry.
- First adapter behavior:
  - player input -> `TurnStartEnvelopeV2`;
  - `TurnAttemptContextV2`;
  - `SceneFrameEnvelopeV2`;
  - `ModelFacingTurnPacketV2`;
  - no-mutation GM Read direct/continue/clarification only;
  - no-receipt settled packet;
  - narrator view from accepted evidence only;
  - route-compatible API projection.
- Focused tests cover:
  - API projection happy path;
  - empty narrative rejection;
  - no-mutation adapter old-tool import tripwire.
  - hidden/background actor labels stay out of model-facing refs and prompt payload.
- Verified:
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (21 tests)
  - `npm --prefix backend run typecheck`
  - `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts turn-processor.scene-plan.test.ts` (88 tests)
  - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts chat.test.ts chat.scene-plan.test.ts` (91 tests)
- GitNexus:
  - `impact(processTurn)` could not resolve the exported generator symbol even after `npx gitnexus analyze` reported the index up to date.
  - File-level `impact(turn-processor.ts, upstream)` returned LOW risk with zero direct impacted symbols/processes.
  - Route-file `api_impact(backend/src/routes/chat.ts)` returned LOW risk for `/action`.
  - `impact(playerSafeDoneBoundary, upstream)` returned LOW risk, direct caller `toPlayerFacingTurnEvent`.
  - `impact(buildDoneBoundaryData, upstream)` returned LOW risk; no edit needed because it already preserves base event fields.
  - Before wiring, `detect_changes(scope=all)` returned low risk, `changed_files=2`, because the new v2 runtime files were still untracked and not in the graph.
  - After wiring, `detect_changes(scope=all)` returned low risk with one tracked touched symbol, but attributed the `turn-processor.ts` diff to nearby indexed `normalizePlayerFacingEmittedEvent`; process-level impact remained empty.
  - Final `detect_changes(scope=all)` returned low risk, changed symbols `normalizePlayerFacingEmittedEvent`, `playerSafeDoneBoundary`, and nearby-attributed `playerSafeErrorBoundary`; affected processes empty.
- Live `/api/chat/action` evidence with `WORLDFORGE_GAMEPLAY_CYCLE_V2=1`:
  - Diagnostic clone `8d561d88-e8c6-4e4d-8d11-97b0c97056ce`: transport body missed legacy `intent`; HTTP 400 before turn boundary; state stayed clean.
  - Diagnostic clone `69b7c0cb-3b61-49ce-b1c0-c866126be5f3`: restored before settlement because route snapshot had extra `campaignId`; fixed by normalizing `preTurnSnapshot` at v2 adapter boundary.
  - Diagnostic clone `5aacc66b-fe0a-4c3d-85b2-cbdb8ef11104`: restored before settlement because hidden/background actor labels leaked into model-facing projection; fixed P3 projection to expose only `awareness=clear` actor labels.
  - Diagnostic clone `df1ae3f4-1e0e-4985-8289-430e75bda20f`: reached `narrative` and `done`, but route stripped v2 `turnId`/`packetId`/`runtime`; fixed done sanitizer.
  - Diagnostic clone `4ca71499-77df-4e65-92bf-a7c9e31e23c7`: reached `narrative` and `done`, `runtime` survived, but raw UUID `packetId`/`turnId` were filtered; fixed v2 runtime to use public-safe ids.
  - Clean live clone `540ab0e5-1a5c-41a8-9428-a6b597683136`: one manual action succeeded from zero-turn state.
    - Action: `Осматриваюсь на Lowwater Bazaar и проверяю, какие выходы видны, ничего не трогаю.`
    - Artifact: `output/gameplay-cycle-v2-live/turn-001-r6-sse.json`.
    - SSE: `scene-settling` frame, `scene-settling` GM Read, `scene-settling` narrator, `narrative`, `finalizing_turn`, `done`.
    - `done`: `tick=1`, `worldVersion=0`, `worldTimeMinutes=0`, `opening=false`, public `turnId=v2turn-*`, public `packetId=v2packet-*`, `runtime=gameplay-cycle-v2`.
    - DB/chat after turn: `chat_history=2`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, `simulation_proposals=0`, `world_clocks.current_tick=1`, `world_version=0`.
    - Backend stopped after evidence; ports `3199` and `3001` confirmed stopped.
- P16 durable packet-store evidence:
  - Added `backend/src/engine/gameplay-cycle-v2/packet-store.ts`.
  - Runtime persists a separate `gameplay_cycle_v2_packets` row before narrator rendering, marks narrator rendering as started, then finalizes the row after route-compatible API projection.
  - Focused verification passed:
    - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (22 tests).
    - `npm --prefix backend run typecheck`.
  - Clean live clone `5f49a745-cde9-4280-b2dd-63ceb6ef3f81`: one manual action succeeded from zero-turn state.
    - Pre-turn state: `chat_history=0`, legacy `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, `simulation_proposals=0`, no `gameplay_cycle_v2_packets` table yet, clock `current_tick=0`, `world_version=0`, `world_time_minutes=0`.
    - Action: `Осматриваюсь на Lowwater Bazaar и проверяю, какие выходы видны, ничего не трогаю.`
    - Artifact: `output/gameplay-cycle-v2-live/turn-001-p16-sse.json`.
    - SSE: `scene-settling`, `scene-settling`, `scene-settling`, `narrative`, `finalizing_turn`, `done`; no `error`.
    - `done`: `tick=1`, `worldVersion=0`, `worldTimeMinutes=0`, `opening=false`, public `turnId=v2turn-mpzh6d25-bd8cc4430214`, public `packetId=v2packet-mpzh6y2h-237e06590b3d`, `runtime=gameplay-cycle-v2`.
    - DB/chat after turn: `chat_history=2`, legacy `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, `simulation_proposals=0`, v2 packet count `1`, row `status=finalized`, `narrator_attempt_status=succeeded_projected`, `has_api_projection=1`, `has_narrator_view=1`, `world_clocks.current_tick=1`, `world_version=0`, `world_time_minutes=0`.
    - Stored packet ids match the player-facing `done` event.
    - Backend stopped after evidence; ports `3199` and `3001` confirmed stopped.
- P16 post-turn simulation boundary correction:
  - Diagnostic lane `5f49a745-cde9-4280-b2dd-63ceb6ef3f81` exposed a boundary leak during manual burn-in: after five successful v2 no-mutation turns, legacy `simulation_proposals=1` with pending `npc_offscreen_updates`.
  - Root cause: `processGameplayTurnCycleV2NoMutation` called legacy `options.onPostTurn(summary)`, and `/api/chat/action` route hooks used that callback to queue old post-turn simulation proposals.
  - GitNexus impact before considering route hook edits:
    - `npx gitnexus impact createPostTurnHooks --repo WorldForge --direction upstream --depth 3`: LOW, direct file impact only.
    - `npx gitnexus impact buildOnPostTurn --repo WorldForge --direction upstream --depth 3`: LOW, direct caller `createPostTurnHooks`.
    - `processGameplayTurnCycleV2NoMutation` was not indexed yet because v2 runtime files are new/untracked.
  - Decision applied locally: v2 no-mutation runtime no longer calls legacy `options.onPostTurn`; `finalizing_turn` remains a progress/UI event only for this slice.
  - Contract test added: v2 no-mutation runtime source must not contain `options.onPostTurn` or `buildNoMutationSummary`.
  - Focused verification after fix:
    - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (23 tests).
    - `npm --prefix backend run typecheck`.
  - Fresh clean clone `d0835220-ed5d-453d-aad2-9188708abaf7` proved the fix through tick 5.
    - Pre-turn state: `chat_history=0`, legacy `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, `simulation_proposals=0`, `simulation_jobs=0`, no `gameplay_cycle_v2_packets` table yet, clock `current_tick=0`, `world_version=0`, `world_time_minutes=0`.
    - Manual turn artifacts:
      - `output/gameplay-cycle-v2-live/turn-001-p16-postturnfix-sse.json`
      - `output/gameplay-cycle-v2-live/turn-002-p16-postturnfix-sse.json`
      - `output/gameplay-cycle-v2-live/turn-003-p16-postturnfix-sse.json`
      - `output/gameplay-cycle-v2-live/turn-004-p16-postturnfix-sse.json`
      - `output/gameplay-cycle-v2-live/turn-005-p16-postturnfix-sse.json`
    - Post-turn state at tick 5: `chat_history=10`, legacy `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, `simulation_proposals=0`, `simulation_jobs=0`, v2 packet count `5`, all rows `status=finalized`, `narrator_attempt_status=succeeded_projected`, world clock `current_tick=5`, `world_version=0`, `world_time_minutes=0`.
    - Backend stopped after evidence; ports `3199` and `3001` confirmed stopped.
  - GM Read optional-field contract cleanup:
    - Live logs on lane `d0835220-ed5d-453d-aad2-9188708abaf7` showed internal `safeGenerateObject` schema failures when direct GM Read emitted `clarificationPrompt: ""`.
    - Contract fix: optional empty strings normalize to absent for `clarificationPrompt`, while `path=clarification` still requires a non-empty clarification prompt.
    - Prompt fix: direct/continue must omit `clarificationPrompt`; clarification must include non-empty `clarificationPrompt`; optional fields must not be empty strings or null.
    - Focused verification after cleanup:
      - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (24 tests).
      - `npm --prefix backend run typecheck`.
  - Fresh clean clone `feb5ef79-9ead-4534-b27a-f6f157c27c2a` proved the post-turn and GM Read optional-field cleanup through tick 5.
    - Pre-turn state: `chat_history=0`, legacy `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, `simulation_proposals=0`, `simulation_jobs=0`, no `gameplay_cycle_v2_packets` table yet, clock `current_tick=0`, `world_version=0`, `world_time_minutes=0`.
    - Manual turn artifacts:
      - `output/gameplay-cycle-v2-live/turn-001-p16-gmreadclean-sse.json`
      - `output/gameplay-cycle-v2-live/turn-002-p16-gmreadclean-sse.json`
      - `output/gameplay-cycle-v2-live/turn-003-p16-gmreadclean-sse.json`
      - `output/gameplay-cycle-v2-live/turn-004-p16-gmreadclean-sse.json`
      - `output/gameplay-cycle-v2-live/turn-005-p16-gmreadclean-sse.json`
    - Post-turn state at tick 5: `chat_history=10`, legacy `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, `simulation_proposals=0`, `simulation_jobs=0`, v2 packet count `5`, all rows `status=finalized`, `narrator_attempt_status=succeeded_projected`, world clock `current_tick=5`, `world_version=0`, `world_time_minutes=0`.
    - Log search found no `safeGenerateObject failed`, no `simulation.proposals`, no restore, and no stderr output.
    - Backend stopped after evidence; ports `3199` and `3001` confirmed stopped.
    - Prose caveat: turns 3-4 switched to English despite Russian player actions. Settled truth remained grounded and no mutation/queue leak occurred, so this does not invalidate the P16 storage/post-turn proof, but it is not a final UX-clean burn-in lane.
  - Oracle/GPT-5.5 Pro note:
    - `v2-postturn-boundary` failed before answer because attachments did not upload.
    - `v2-postturn-boundary-login-smoke` is invalid evidence because it was a prompt-only smoke question without the required file bundle.
    - `v2-postturn-boundary-inline-files` dry-run showed 4 inline files / ~49,776 tokens, but the real browser run failed before submission with ChatGPT selector/cookie error.
    - Built-in browser control was attempted after user correction, but Browser Plugin Node-backed control failed before executing any JS with `failed to write kernel assets: The system cannot find the path specified`; no valid built-in-browser GPT review was obtained.
- P16 narrator language-contract cleanup:
  - Root cause: the no-mutation narrator view had truth limits but no explicit response-language contract, so Russian player actions could still render English ordinary prose while preserving English proper labels.
  - Contract fix: `narrator-view.v2` now carries `languageContract = { responseLanguage: "match_player_action", sourceField: "playerAction", preserveLabelsVerbatim: true }`.
  - Prompt fix: the narrator system prompt must follow `narratorView.languageContract`, write ordinary prose in the same language as `narratorView.playerAction`, and preserve accepted labels/proper nouns verbatim.
  - Focused verification after cleanup:
    - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (24 tests).
    - `npm --prefix backend run typecheck`.
  - Fresh clean clone `e6037647-d6aa-44ad-93eb-83dde0fa9eeb` proved the language contract in the live no-mutation path.
    - Pre-turn state: legacy `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, `simulation_proposals=0`, `simulation_jobs=0`, no `gameplay_cycle_v2_packets` table yet, clock `current_tick=0`, `world_version=0`, `world_time_minutes=0`.
    - Manual turn artifacts:
      - `output/gameplay-cycle-v2-live/turn-001-p16-language-sse.json`
      - `output/gameplay-cycle-v2-live/turn-002-p16-language-sse.json`
      - `output/gameplay-cycle-v2-live/turn-003-p16-language-sse.json`
    - Narration results stayed Russian ordinary prose while preserving labels such as `Lowwater Bazaar`, `Mira Voss`, and `The Copper Tap` verbatim.
    - Post-turn state at tick 3: `chat_history.json` has 6 items, legacy `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, `simulation_proposals=0`, `simulation_jobs=0`, v2 packet count `3`, all rows `status=finalized`, `narrator_attempt_status=succeeded_projected`, world clock `current_tick=3`, `world_version=0`, `world_time_minutes=0`.
    - Log search found no `safeGenerateObject failed`, no `simulation.proposals`, no restore/replay/rollback/error, and no stderr output. One first-turn `llm.repair` remained with `fallbackReason=null` because the GM Read candidate overfilled `targetRefs`; it was repaired before settled truth and did not affect the player-facing turn.
    - Backend stopped after evidence; ports `3199` and `3001` confirmed stopped.
- P6 Oracle settlement:
  - Added `GmReadOracleV2`, `OracleSettlementV2`, `oracle_roll` capability, and `gmReadV2Schema` in `backend/src/engine/gameplay-cycle-v2/contracts.ts`.
  - Added `backend/src/engine/gameplay-cycle-v2/oracle-settlement.ts`.
  - P6 ownership:
    - GM Read may select `roll_oracle` only for true uncertainty/risk;
    - Oracle request must define `question`, `stakes`, `outcomeMeanings.strong_hit/weak_hit/miss`, `uncertaintyKind`, actor/target/evidence refs;
    - old `callOracle` is used only as a probability/roll adapter;
    - Oracle settlement has `mutationAuthority="none"`;
    - settled packet must include `oracleSettlement` plus accepted `oracle_outcome` evidence for `roll_oracle`;
    - narrator sees the selected outcome meaning as settled evidence, not just a tier label.
  - Runtime integration:
    - v2 GM Read candidate generation now uses a permissive candidate shape with required `version/path`; final correctness is owned by `validateGmReadV2`.
    - Runtime emits sanitized `oracle_result` with outcome only, then persists the Oracle settlement in the v2 packet.
    - Narrator prompt says Oracle evidence is uncertainty outcome only and cannot become movement/discovery/item state/NPC knowledge/durable world change.
  - Focused verification:
    - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (30 tests).
    - `npm --prefix backend run typecheck`.
  - Diagnostic P6 live lanes, not acceptance:
    - `be558104-34c5-4766-8b97-5b18b3718d93`: GM Read chose clarification for visible-actor attention uncertainty. Prompt ownership was tightened to classify immediate visible-actor attention/resistance/reaction uncertainty as Oracle-eligible.
    - `f0a858b2-06a3-4f7b-be7f-729f4f1854d5`: reached `oracle_result`, but settlement exposed only `outcome=miss` without selected outcome semantics. Fixed by requiring pre-roll outcome meanings and exposing selected meaning in settlement evidence.
    - `ca1254d9-7990-412d-854a-472008652a72`: schema repair fell back before Oracle after the new required outcome meanings. Fixed by moving GM Read model output to a shape-guided loose candidate schema and keeping strict validation in `validateGmReadV2`.
    - `d629a6e1-4db0-4745-b430-37ac70158228`: loose candidate schema was too loose and produced a fallback clarification. Fixed by requiring candidate `version/path` while leaving path-specific validation to the validator.
  - Clean P6 live proof:
    - Fresh zero-turn clone `31939d1d-04d2-4a7b-aef9-cc99a7e8ad0e`.
    - Manual action: `Оставаясь на месте в Lowwater Bazaar, я рискованно пытаюсь незаметно проследить за Mira Voss и проверить, заметила ли она мой взгляд прямо сейчас.`
    - Artifact: `output/gameplay-cycle-v2-live/turn-001-p6-oracle-r5-sse.json`.
    - SSE event sequence: `scene-settling`, `scene-settling`, `scene-settling`, `oracle_result`, `scene-settling`, `narrative`, `finalizing_turn`, `done`.
    - Public `oracle_result`: `{ outcome: "miss" }`.
    - Stored packet: `gmRead.path=roll_oracle`, `oracleSettlement.result.outcome=miss`, selected meaning `Mira Voss notices the player watching her and makes eye contact or otherwise clearly registers the attention`.
    - Player-facing narration matched selected meaning: `Mira Voss замечает ваш взгляд...`.
    - Post-turn DB: `chat_history.json` has 2 items, legacy `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, `simulation_proposals=0`, `simulation_jobs=0`, v2 packet count `1`, row `status=finalized`, `narrator_attempt_status=succeeded_projected`, clock `current_tick=1`, `world_version=0`, `world_time_minutes=0`.
    - Log search found no `safeGenerateObject failed`, no `simulation.proposals`, no restore/replay/rollback/error, and no stderr output.
    - Backend stopped after evidence; ports `3199` and `3001` confirmed stopped.
- P7 Action Checklist contract slice:
  - Added `GmReadChecklistV2` / `checklistRequest` and `GmActionChecklistV2` contracts in `backend/src/engine/gameplay-cycle-v2/contracts.ts`.
  - Added `backend/src/engine/gameplay-cycle-v2/action-checklist.ts`.
  - P7 ownership:
    - GM Read `tool_plan` may request a checklist but still cannot carry tool names, inputs, payloads, deltas, or narration.
    - Checklist steps carry exactly one `intendedEffect` plus `requiredCapabilityId`, `actorRef`, `targetRefs`, `evidenceRefs`, `expectedVisibleEffect`, and earlier-step dependencies.
    - Checklist validation owns executable-payload rejection, citable-ref checks, exposed capability checks, effect-kind/capability mapping, private-term leak checks, packet id/version alignment, and GM Read request alignment.
    - Checklist is explicitly not execution and not a receipt; no live player-facing runtime path consumes it yet.
  - Focused verification:
    - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (34 tests).
    - `npm --prefix backend run typecheck`.
  - P7 live gate is intentionally still pending:
    - A real `/api/chat/action` mutating/procedural turn cannot honestly count until P8/P9/P10 exist: Runtime Capability Catalog, one-step Tool Request Planner, and Runtime Executor / mutation authority.
    - Do not narrate planned checklist effects as happened; checklist-only live turns would be fake gameplay evidence.
- P8 Runtime Capability Catalog:
  - Added `backend/src/engine/gameplay-cycle-v2/capability-catalog.ts`.
  - P8 ownership:
    - Every `RuntimeCapabilityIdV2` has one backend-owned definition with `purpose`, `evidenceAuthority`, `plannerSurface`, and owned checklist effect kinds.
    - Model-facing projection now gets capability purpose/evidence authority from the catalog instead of local `CAPABILITY_PURPOSES`.
    - Action checklist validation now gets effect-kind -> required capability mapping from the catalog instead of local `EFFECT_CAPABILITY`.
    - Catalog does not expose old runtime tool names, old planned tools, or executable payload surfaces.
  - Focused verification:
    - `npm --prefix backend test -- gameplay-cycle-v2-contracts.test.ts` (35 tests).
    - `npm --prefix backend run typecheck`.
  - Live gate:
    - P8 is a contract/source-of-truth layer; it changes model-facing capability metadata but does not by itself enable a new player-visible mutating path. Its live proof remains composition-gated on P9/P10.
- Known gap:
  - P16 durable packet persistence is proved for successful narration/API projection only. Narrator-failure and post-packet failure recovery still need a recovery-matrix layer; current route restore behavior may wipe or strand a v2 row if narration fails after packet persistence.
  - GM Read live calls sometimes require `safeGenerateObject` repair because the model emits empty optional `clarificationPrompt` or too many `targetRefs`; this is internal, not player-facing, but the prompt/schema ergonomics should be tightened before longer burn-in.
  - The post-turnfix fresh lane reached tick 5 without player-facing errors or legacy simulation leakage, but logs still show internal GM Read schema failures on empty optional `clarificationPrompt`. This was fixed and re-proved on `feb5ef79-9ead-4534-b27a-f6f157c27c2a`.
  - Oracle session `v2-postturn-boundary-login-smoke` is invalid as architecture evidence: it used a short prompt-only smoke question after attachment upload failed, so it did not deliver the required file/context bundle. Do not rely on that ChatGPT answer.

## Goal

Rewrite only the gameplay turn cycle from player message to player-facing narration/API response. Keep world creation, character loading, and UI intact except for minimal adapters. Build a clean staged GM turn pipeline without guard piles, fallback hacks, semantic regex routing, or special-case patches.

## Current State Map

- Entry path: `POST /chat/action` in `backend/src/routes/chat.ts` parses `chatActionBodySchema`, resolves quick actions, captures a pre-turn snapshot, streams SSE, and calls `processTurn`.
- Turn switch: `processTurn` in `backend/src/engine/turn-processor.ts` always uses `processTurnScenePlan` outside test-only `SCENE_PLAN_ENABLED=false`.
- Current scene-plan path already contains the desired concepts, but they are fused inside one large orchestrator:
  - deterministic state/context setup and pre-frame due-world work;
  - `buildSceneFrame`;
  - `buildScopedForecastExcerptForFrame`;
  - `runGmRead`;
  - optional `callOracle`;
  - direct no-mutation path or `runGmToolLoop`;
  - actor reaction pass;
  - pre-narrator due-world work;
  - canonical packet and `buildNarratorPacket`;
  - `persistSettledTurnPacket`;
  - final narration and SSE output.
- Existing modules worth preserving as inputs/surfaces, not as the new orchestration shape:
  - `scene-frame.ts` for backend-owned visible frame assembly;
  - `world-forecast.ts` for advisory forecast excerpts only;
  - `gm-turn-read.ts` as the read/classification contract candidate;
  - backend runtime tool schemas/executor surfaces as mutation authority;
  - `narrator-packet.ts` as settled truth packaging candidate.
- Existing modules/behaviors to avoid importing as architecture:
  - TurnSaga/recovery/rollback machinery as the driver of the new design;
  - broad narration grounding guard loops as a substitute for clean settled-packet ownership;
  - old `processTurnLegacy`;
  - any backend semantic regex/keyword routing as source of gameplay meaning.

## Target Pipeline

- [x] Stage 0: SceneFrame + scoped advisory Forecast Envelope.
- [x] Stage 1: GM Read only; no mutation, narration, or executable tool payloads.
- [x] Stage 2: Oracle only when GM Read selects genuine uncertainty.
- [x] Stage 3: GM Action Checklist for mutating/combat turns only, with no executable payload fields.
- [x] Stage 4: one-step-at-a-time backend Tool Step Execution Loop, first vertical slice only.
- [x] Stage 5: Settled Turn Packet from accepted results, Oracle result, visible facts, and skipped/failed reasons, durable v1.
- [x] Stage 6: Narrator from settled truth only for first vertical slice.

## Immediate Plan

- [x] Create rollback-aware branch from `develop` in the normal worktree.
- [x] Inspect canonical GM Turn Architecture Review.
- [x] Inspect current live `/chat/action` -> `processTurn` path.
- [x] Identify current fused responsibilities and reusable backend surfaces.
- [x] Prepare Oracle/GPT-5.5 Pro architecture review with dry-run first.
- [x] Record Oracle recommendation and decision.
- [x] Implement first isolated clean orchestrator shell behind an explicit boundary: `backend/src/engine/gameplay-turn-cycle-v1.ts`.
- [x] Add focused contract tests for Stage 0/1/3 boundaries.
- [x] Verify through the real chat/play path for observation turn smoke.
- [x] Add clean final narrator pass over `SettledTurnPacketV1` instead of deterministic fallback.
- [x] Add direct/clarification route live smoke.
- [x] Add Oracle route live smoke.
- [x] Add one successful state mutation live smoke.

## Verification Gates

- Per stage: focused contract tests plus live/manual gameplay through the real chat path.
- Final acceptance: 3 worlds or clean clones, about 60 turns each, no manual DB/code intervention.
- Required play coverage: direct turns, clarification, Oracle, single-tool mutation, multi-step mutation, failed/rejected tool step without narration leak, local/world/actor consequences, grounded narration.

## Open Architecture Questions For Oracle

- Should the new pipeline be a new orchestrator module called by `processTurn`, or a replacement `processTurn` path with old scene-plan code only used as a reference?
- Which existing modules are clean enough to reuse unchanged for v1, and which should be wrapped behind narrower contracts first?
- Should Stage 3 permit `candidateToolRequest` in checklist v1, or should executable tool input be delayed strictly until Stage 4?
- What is the minimal durable artifact model for v1 without importing the full v5 TurnSaga/recovery design?

## Oracle Decision 2026-06-01

Session: `rebuild-gm-turn-first-slice`.

- Add a new isolated orchestrator module, e.g. `backend/src/engine/gameplay-turn-cycle-v1.ts`, and call it from `processTurn`. Do not reshape `processTurnScenePlan` in place.
- Reuse `scene-frame.ts`, `world-forecast.ts`, `gm-turn-read.ts`, `oracle.ts`, backend tool schemas/execution surfaces, and `narrator-packet.ts` behind narrow stage adapters.
- Do not use `gm-action-checklist.ts` unchanged for the critical path because current `candidateToolRequest` collapses Stage 3 and Stage 4.
- Stage 3 v1 must not contain `toolName`, `input`, `payload`, `plannedTools`, or `candidateToolRequest`; executable requests are Stage 4 only.
- Keep `processTurnScenePlan`, `processTurnLegacy`, hidden adjudication, old semantic routing, actor reactions, due-world work, and TurnSaga recovery out of the first-slice critical path.
- Minimal durable artifact is `SettledTurnPacketV1`, not a saga-driven lifecycle. Before the packet exists, route snapshot can restore. After it exists, narration failure must not redefine accepted truth.
- First slice should prove route-compatible `/chat/action` flow with direct/no-mutation, clarification, Oracle-only uncertainty, and one backend-tool mutation step. Do not attempt actor/world due-work or multi-step planning yet.

## Oracle Decision 2026-06-01: Multi-Step Stage 4

Session: `gm-v1-multistep-loop-retry`.

- Do not make TurnSaga, ScenePlanner, or old saga recovery drive v1.
- Extend Stage 3 from one step to a bounded planning-only checklist, initially max 4 steps.
- Keep Stage 3 free of `toolName`, `input`, `payload`, `candidateToolRequest`, and planned executable payloads.
- Stage 4 should use a deterministic scheduler: pick the next dependency-ready backend step, propose one executable tool request, validate with a tool-specific schema, execute, record settlement, update a shared `ToolExecutionContext`, then repeat.
- Use explicit budgets: max 4 checklist steps, max 4 tool executions, one model repair attempt per tool step.
- Required backend step failure, dependency blockage, or budget exhaustion remains pre-packet failure: throw before `SettledTurnPacketV1` persistence and let route snapshot restore.
- Optional step failure can be audit-only if all required steps accepted; do not narrate optional failed expected effects.
- Feed later tool proposals only backend-accepted refs/receipts from previous successful steps, not checklist expected effects or failed/skipped plans.
- Keep durable packet store unchanged; it is already the right Stage 5/6 boundary.

## Oracle Decision 2026-06-01: Local/World/Actor Consequences

Session: `gm-v1-consequenc-slice`.

- Implement the next slice as a narrow `LocalConsequencePassV1` between accepted GM tool settlements and `SettledTurnPacketV1`.
- Use split architecture: visible immediate local actor consequences are accepted before packet/narration; nonlocal/offscreen/world progress stays as versioned post-turn simulation proposals.
- Reuse `runRequiredActorDecisionPass` through a v1 adapter with explicit route, legal tools, scene frame, player scope, and blocked write scopes. Do not call the old `processTurnScenePlan`, ScenePlanner, or TurnSaga recovery as v1 drivers.
- Refresh the `SceneFrame` after accepted GM mutations before local actor reactions, especially after movement.
- Do not create a second durable pre-narration packet yet. Embed accepted local consequence facts/result refs into `SettledTurnPacketV1`; the settled packet remains the single narration truth boundary.
- Required local-visible actor consequence failures abort before packet persistence and route restore handles rollback. Optional/deferred actor work is skipped or queued and must not enter narrator evidence.
- Keep `resolveDueWorldWorkForScopeWithProposalWatchdog` out of the synchronous v1 critical path for this slice.

## Implementation Notes 2026-06-01

- Added `backend/src/engine/gameplay-turn-cycle-v1.ts`.
- Switched `processTurn` to call the new v1 orchestrator.
- Added `backend/src/engine/__tests__/gameplay-turn-cycle-v1.test.ts`.
- Verified:
  - `npm --prefix backend run typecheck`
  - `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts turn-processor.scene-plan.test.ts`
  - real `/api/chat/action` smoke reached `narrative` and `done` through Stage 0/1/3/4/5.
  - real `/api/chat/action` smoke reached storyteller-written `narrative` and `done` through Stage 6.
  - real `/api/chat/action` smoke reached `roll_oracle`, emitted `oracle_result`, then storyteller narration and `done`.
- Live smoke exposed and fixed:
  - Stage 3 checklist old-shape drift (`checklistVersion`, `stage`, `action`) by tightening prompt and one-step schema.
  - Stage 3 `toolNeed` was too strict; made advisory string while keeping executable payload ban strict.
  - Stage 4 sent raw model input instead of schema-normalized input; fixed executor input ownership.
  - Stage 4 used runtime executor for bridge lookup tools; fixed dispatcher to call `executeBridgeCandidateTool`.
  - Stage 6 fallback leaked raw observation JSON; replaced with concise player-facing observation summary.
  - Stage 6 deterministic fallback was replaced by a storyteller pass over `SettledTurnPacketV1` plus output contract validation.
  - Direct/clarification smoke exposed legacy GM Read no-mutation admissibility repair converting no-mutation reads into `tool_plan`; Stage 1 now has explicit `stage1_contract` mode to skip that legacy secondary classifier while preserving default legacy strict mode.
  - Fresh direct smoke reached `turn_resolution {"kind":"direct"}` plus storyteller narration and `done`.
  - Fresh clarification smoke reached `turn_resolution {"kind":"clarification"}` plus clarification narration and `done`.
  - Movement mutation smoke exposed that the current SceneFrame has no legal `movementCandidates`; movement is therefore not accepted from this scene yet, even though an old DB edge exists.
  - Successful state mutation smoke: `/api/chat/action` added `urgent` to visible item `condition report — Cellar Store Bays Seven and Eight`, advanced tick, and increased worldVersion.
  - Stage 4 now filters tool request choices through runtime tool descriptors for known state-effect `toolNeed` values and records v1 checklist/tool-step diagnostics.
  - Durable `SettledTurnPacketV1` store persists canonical packet truth through a storage-only saga anchor, reads it back before narration, records narration attempt start/success/failure, finalizes only after projection, and does not import the old `turn-saga.ts` driver into the v1 critical path.
  - Fresh durable direct smoke on `/api/chat/action` reached `turn_resolution {"kind":"direct"}`, emitted `settled-packet` persisting/persisted phases, storyteller narration, and `done`.
  - Durable smoke DB check showed `turn_sagas`, `settled_turn_packets`, and `narrator_attempts` each increased by one; latest saga was `finalized`, latest narrator attempt was `succeeded`, no pending narration remained, and no `turn_saga_events` row was created for the v1 storage anchor.
  - Attempted durable mutating smoke was blocked before packet persistence by external judge provider connectivity (`safeGenerateObject` exhausted after TLS socket disconnects). Route restored the pre-turn snapshot; DB check showed no new packet/saga/attempt, no pending narration, and no latest v1 event ledger rows.
  - Mutating durable smoke then exposed a real contract bug: Stage 4 accepted `input: { value: "<json string>" }`, failed the required `add_tag` step, but still built a packet and narrator claimed the mark landed. Fixed by using tool-specific Stage 4 schemas and aborting required backend steps before packet persistence when no accepted receipt exists.
  - Fresh mutating durable smoke passed after the fix: `/api/chat/action` produced `tool_plan`, accepted one `add_tag` result, advanced `worldVersion` 130 -> 131, persisted/finalized the packet, left no pending narration, and created no `turn_saga_events` rows for the v1 storage anchor.
- All smoke-test backend listeners on ports 3101-3109 were stopped after use.

## Current Known Gaps

- Stage 2 Oracle path is implemented and live-smoke-proven on `/api/chat/action`.
- Clarification/direct paths are live-smoke-proven on `/api/chat/action`.
  - Stage 4 now supports a bounded deterministic multi-step checklist with shared accepted context. Latest live smoke proved pre-packet rollback on a required failed `create_scene_extra` step; current follow-up tightens Stage 4 tool-name narrowing and exact schema hints for `create_scene_extra` / `record_dialogue_outcome`.
  - Fresh multi-step dialogue smoke on clone `f510677b-61c2-45d2-9022-1c0b1cbbd14e` passed through real `/api/chat/action`: Stage 3 produced two planning-only required backend steps (`create_scene_extra`, `record_dialogue_outcome`), Stage 4 accepted both, Stage 5 persisted the packet, and Stage 6 returned grounded narration matching the accepted dialogue outcome.
  - The previous live smoke exposed a Stage 6 evidence packaging bug: object-shaped tool results such as `record_dialogue_outcome` were summarized as a generic accepted-result phrase, leaving the narrator without the concrete settled outcome. Fixed by feeding `payload.text` / `payload.summary` into acceptedEvidence before narration.
  - Failed-step live smoke on clone `37940a97-371a-4bea-88f6-50c40adc6ae3` passed through real `/api/chat/action`: Stage 3 planned `check_route` then `move_actor`, Stage 4 rejected required `check_route` with `route_not_visible_or_legal`, v1 aborted before packet persistence, SSE emitted `error` with no `narrative`, route snapshot restore succeeded, and DB showed no `settled_turn_packets`, `narrator_attempts`, or `turn_sagas` for the failed turn.
  - Failed-step smoke exposed a route restore idempotency bug outside the v1 packet boundary: repeated restore receipts conflicted on `turn_clock_ledger(campaign_id, source_receipt_ref)`. Fixed `invalidateAuthorityAfterRestore` to make restore ledger insertion idempotent against that actual unique boundary and added a regression test.
- Movement is live-smoke-proven on a clean movement-capable clone; stale/expired movement fixtures remain useful only as failed-route coverage.
- Movement success is live-smoke-proven on clean movement-capable clone `3a606353-5968-4174-936b-45d80056ac1f` cloned from `142cf3f0-e6da-4f6b-8467-5721da7d963f`: real `/api/chat/action` moved the player from `The Canal Market District` to `Flooded Auction House` via accepted `move_actor`, advanced tick/worldVersion, persisted/finalized `SettledTurnPacketV1`, and DB showed player current location/scene updated to `Flooded Auction House`.
- The earlier Ashfall/Gatehouse movement failure is now understood as a stale-source fixture issue, not proof that v1 movement is generally broken: source `1973fbeb-cd81-4556-8252-6aeccde5d5d8` has the player in an expired `Municipal Stores Front Counter`, with its only outgoing edge pointing to an archived/expired scene. Keep it as failed-route coverage, not as movement-success source.
- Durable `SettledTurnPacketV1` persistence is implemented and focused-test plus live-smoke proven for direct narration.
- Live smoke has proven observation/bridge tool execution, storyteller narration, durable direct packet persistence, and durable mutating packet persistence for one accepted `add_tag` state mutation.
- Local actor consequences are implemented as Stage 4.5 accepted packet truth and live-smoke-proven for an actor receipt before narration. Nonlocal/offscreen/world progress remains post-turn proposal work by design and still needs broader long-run validation.

## Implementation Notes 2026-06-01: Local Consequence Pass V1

- Added a narrow Stage 4.5 `LocalConsequencePassV1` inside `processGameplayTurnCycleV1`, after required GM tool settlements are accepted and before `SettledTurnPacketV1` is built.
- The pass skips direct/no-tool turns with a `route: "none"` artifact, and runs `runRequiredActorDecisionPass` only when accepted GM tool results exist.
- The pass refreshes `SceneFrame` after accepted GM mutations, passes explicit `presentActorReactionRoute: "required_before_done"`, legal tools, player scope, and blocked GM write scopes into actor execution.
- `SettledTurnPacketV1` now carries `localConsequenceResult` and `acceptedActorResults`; narrator evidence includes only accepted actor visible facts/results, while skipped/failed local consequence data remains audit-only.
- Deferred/offscreen skipped local consequences are audit-only and do not abort packet persistence; failed required local actor receipts still abort before packet.
- Durable packet persistence now records `acceptedActorResultRefs`, actor model-safe source refs, and actor durable event ids through the same settled packet boundary.
- Verified:
  - `npm --prefix backend run typecheck`
  - `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts settled-turn-packet-v1-store.test.ts actor-tools.test.ts`
  - `npm --prefix backend test -- chat.scene-plan.test.ts chat.test.ts gameplay-turn-cycle-v1.test.ts settled-turn-packet-v1-store.test.ts actor-tools.test.ts`
  - real `/api/chat/action` smoke on campaign `3a606353-5968-4174-936b-45d80056ac1f`: accepted `add_tag`, ran `local-consequences`, persisted/finalized packet, emitted grounded `narrative` and `done`; DB packet showed `localRoute=required_before_packet`, zero actor settlements because the campaign has no `actor_process_states`, accepted tool refs persisted, and no backend listener remained on `3109/3001`.
  - real `/api/chat/action` actor smoke on campaign `9c80976a-0b6f-4be2-b2c4-0173f90ac2ca`: GM path was `tool_plan`, `local-consequences` ran before packet, Silk Maren produced one accepted `log_event` actor receipt, `SettledTurnPacketV1` packet `1552b4e5-423c-421e-9e81-e34552d7fc8a` persisted `localRoute=required_before_packet`, one accepted actor settlement, concrete actor visible fact, and non-empty `acceptedActorResultRefs`.
  - The same actor smoke exposed and fixed a v1 adapter contract bug: an actor settlement with one accepted local reaction receipt plus one rejected extra actor tool was incorrectly treated as fatal. The contract is now: required local actor consequence fails only when no accepted runtime receipt exists for that actor; rejected extra tools after an accepted receipt are audit-only `skipped`.
  - Re-verified after the actor receipt fix:
    - `npm --prefix backend run typecheck`
    - `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts settled-turn-packet-v1-store.test.ts actor-tools.test.ts chat.scene-plan.test.ts chat.test.ts`

## Acceptance Lanes 2026-06-01

- Correction applied: final 3x60 acceptance clones must come from branches/campaigns where the first player turn has not been made yet. Do not use already-played smoke campaigns as 60-turn sources.
- Removed wrong acceptance clone `7bbd20d3-651c-4f93-bfcc-5c2ab451538d`, which had been cloned from an already-played Ashfall smoke source.
- Created and verified zero-turn acceptance clones:
  - Lane A / JJK movement-heavy: source `8d9f2423-c9ad-4f4d-ad96-8f0fc8e93dcc` -> clone `a4e06d79-3695-437e-bef2-b1ae64286e35`; `chat=0`, `settled_turn_packets=0`, player `Tanaka Kouta`, location `Shibuya Ward`, 8 movement options, inventory includes `Burner phone`, `Delivery manifest`, `Worn messenger bag`.
  - Lane B / Lacquer movement-heavy: source `30e161da-db4b-4d8c-ab93-154fab7aa03f` -> clone `ba788102-b970-43f2-8221-6f0f136e23f8`; `chat=0`, `settled_turn_packets=0`, player `Mira Voss`, location `Lowwater Bazaar`, 8 movement options, inventory includes `Courier satchel`, `Sealed lacquer message tube`.
  - Lane C / Ashfall NPC/documents: source `2badd884-f63a-456c-b832-e88439fb62b4` -> clone `b13e8cfd-468e-44ef-a464-62e13fd70a7a`; `chat=0`, `settled_turn_packets=0`, player `Mara Venn`, scene `Municipal Stores Front Counter`, active NPC `master clerk`, rich document inventory, no current movement options.
- Created fresh replacement zero-turn acceptance clones after the first set was consumed by live acceptance turns:
  - Lane A / JJK movement-heavy: source `8d9f2423-c9ad-4f4d-ad96-8f0fc8e93dcc` -> clone `711a16bb-cab4-4e2d-ad3f-b93ba81cdd93`; `chat=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, manifest source/target verified.
  - Lane B / Lacquer movement-heavy: source `30e161da-db4b-4d8c-ab93-154fab7aa03f` -> clone `139070ce-442a-4eea-88a0-0f735879ade5`; `chat=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, manifest source/target verified.
  - Lane C / Ashfall NPC/documents: source `2badd884-f63a-456c-b832-e88439fb62b4` -> clone `44d9d1e9-84d8-48f6-9ccf-708ad95b3cd3`; `chat=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, manifest source/target verified.
- Created reserve zero-turn clones before further first-turn acceptance work:
  - Lane A / JJK reserve: source `711a16bb-cab4-4e2d-ad3f-b93ba81cdd93` -> clone `6bc742b5-1f87-4ed3-ba99-ac8e8b3d1473`; `chat_history=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, manifest source/target verified.
  - Lane B / Lacquer reserve: source `139070ce-442a-4eea-88a0-0f735879ade5` -> clone `ce740a13-3b78-43a9-9bdc-6973be2ff7b9`; `chat_history=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, manifest source/target verified.
  - Lane C / Ashfall reserve: source `2badd884-f63a-456c-b832-e88439fb62b4` -> clone `b61eca3d-c71b-4521-81bd-2b636464844f`; `chat_history=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, manifest source/target verified.
- Created reserve-2 zero-turn clones after the reserve lanes began being consumed by live turns:
  - Lane A / JJK reserve 2: source `711a16bb-cab4-4e2d-ad3f-b93ba81cdd93` -> clone `ea9e1cc4-3829-43c8-9d8d-fafdc5d86c02`; `chat_history=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, player `Tanaka Kouta`, manifest source/target verified.
  - Lane B / Lacquer reserve 2: source `139070ce-442a-4eea-88a0-0f735879ade5` -> clone `deb08e55-a00a-432d-b276-fb9726f96d91`; `chat_history=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, player `Mira Voss`, manifest source/target verified.
  - Lane C / Ashfall reserve 2: source `2badd884-f63a-456c-b832-e88439fb62b4` -> clone `2fe891b4-537b-4d9d-b14f-59f4fd3cef7b`; `chat_history=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, player `Mara Venn`, manifest source/target verified.
- Created reserve-3 zero-turn clones after the reserve-2 lanes began being consumed by live turns:
  - Lane A / JJK reserve 3: source `711a16bb-cab4-4e2d-ad3f-b93ba81cdd93` -> clone `15595d32-85f2-4e2f-b69e-897f17a5f91a`; `chat_history=0`, `settled_turn_packets=0`, `turn_sagas=0`, `pending_sagas=0`, `narrator_attempts=0`, player `Tanaka Kouta`, scene `Shibuya Ward`, 8 movement options, manifest digest `516202cb14dbf643520dedd7b7ff7b1e78310e8d0d3bfbbefd0ebe327c334afa`.
  - Lane B / Lacquer reserve 3: source `139070ce-442a-4eea-88a0-0f735879ade5` -> clone `16edf584-2a43-4f2a-9a32-589befd42b51`; `chat_history=0`, `settled_turn_packets=0`, `turn_sagas=0`, `pending_sagas=0`, `narrator_attempts=0`, player `Mira Voss`, scene `Lowwater Bazaar`, 8 movement options, manifest digest `df6441f322cc024c3cd105bb9d78849678ea28b10a8e802f1a235058de132fb7`.
  - Lane C / Ashfall reserve 3: source `2badd884-f63a-456c-b832-e88439fb62b4` -> clone `bae4fcd9-00cc-4229-8dfd-a30c2d773bf5`; `chat_history=0`, `settled_turn_packets=0`, `turn_sagas=0`, `pending_sagas=0`, `narrator_attempts=0`, player `Mara Venn`, scene `Municipal Stores Front Counter`, 1 movement option, manifest digest `e94ce6b829f78f4f1c4f94da1fa6427cd9c8931c92bedcbd29337b02697f81f3`.
- Lane A reserve live acceptance:
  - Preflight verified clone `6bc742b5-1f87-4ed3-ba99-ac8e8b3d1473` loaded through `/api/campaigns/:id/load`; `chat_history=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`.
  - Turn 1 real `/api/chat/action`: `Я проверяю delivery manifest и burner phone, затем осматриваюсь на Shibuya Ward, чтобы выбрать самый безопасный следующий маршрут.`
  - Turn 1 reached `narrative` and `done`; DB showed `chat_history=2`, `settled_turn_packets=1`, `turn_sagas=1`, `narrator_attempts=1`; saga `5243f65d-0cb5-42b1-84b7-c9be6c79e9b3` finalized and narrator attempt `82c66cdb-7d8f-4ede-9067-423023036011` succeeded.
  - Packet `11d2357d-d411-4a2c-aca0-29bcfbadca90` had `gmRead.path="tool_plan"`, checklist steps `find_object_candidates` and `list_navigation_options`, and accepted both tools. `list_navigation_options` returned 6 connected routes including `East Exit Underground Passage`.
  - Narration quality smell: storyteller summarized the route assessment without naming the available routes. Packet truth is correct, but long-run polish should make route-list observation turns expose useful route names to the player.
  - Turn 2 real `/api/chat/action`: `Я выбираю East Exit Underground Passage как самый безопасный путь и иду туда, держа burner phone под рукой.`
  - Turn 2 reached `narrative` and `done`; DB showed `chat_history=4`, `settled_turn_packets=2`, `turn_sagas=2`, `narrator_attempts=2`, `pendingSagas=0`.
  - Packet `ade9551f-d72a-4682-84dd-be9960eb5ece` had `gmRead.path="tool_plan"`, one `move_actor` checklist step, accepted `move_actor` input with destination `East Exit Underground Passage`, path `["Shibuya Ward","East Exit Underground Passage"]`, and resultWorldVersion `1`.
  - Grounding check: player `Tanaka Kouta` current location and current scene both updated to `East Exit Underground Passage`.
- Lane A first-turn live acceptance:
  - First attempt exposed a Stage 4 prompt contract gap: `list_navigation_options` was proposed with `maxResults: 10` while the backend schema caps it at 8. Fixed `toolContractHint` for bridge lookup tools so prompt contracts expose `maxResults` bounds.
  - Second attempt exposed a real ownership mismatch: Stage 3/4 selected `inspect_known_fact` for visible inventory objects (`Delivery manifest`, `Burner phone`), and the bridge correctly rejected it with `no_player_visible_or_known_fact`.
  - Fixed by tightening Stage 3 guidance (`find_object_candidates` for visible/current/inventory objects; `inspect_known_fact` only for player-known facts/canon claims) and allowing one Stage 4 repair within bridge lookup tools, not across mutating tools.
  - Verified on real `/api/chat/action` against zero-turn clone `a4e06d79-3695-437e-bef2-b1ae64286e35` with action: `Я проверяю delivery manifest и burner phone, затем осматриваюсь на Shibuya Ward, чтобы выбрать самый безопасный следующий маршрут.`
  - Result: SSE reached `narrative` and `done`; DB showed `chat=2`, `settled_turn_packets=1`, `turn_sagas=1`, `narrator_attempts=1`, `pendingSagas=0`.
  - Latest saga `116483ab-a84a-4b77-9114-800646604263` finalized; packet `b5faf28d-afae-47aa-b42d-09915c54408e` persisted accepted tool refs `["step-1:find_object_candidates","step-2:list_navigation_options"]`; narrator attempt `3b74cb65-2afb-4bfd-951d-e132454fbcd5` succeeded.
  - Verification: `npm --prefix backend run typecheck`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts settled-turn-packet-v1-store.test.ts actor-tools.test.ts chat.scene-plan.test.ts chat.test.ts` passed with 113 tests.
- Lane A second-turn live acceptance:
  - Verified current SceneFrame after first turn: tick `1`, location/scene `Shibuya Ward`, 8 connected movement candidates, including `East Exit Underground Passage`.
  - Real `/api/chat/action` against `a4e06d79-3695-437e-bef2-b1ae64286e35`: `Я выбираю East Exit Underground Passage как самый безопасный путь и иду туда, держа burner phone под рукой.`
  - Result: SSE reached `narrative` and `done`; backend log showed accepted `move_actor` with destination `East Exit Underground Passage`, travelCost `1`, path `["Shibuya Ward","East Exit Underground Passage"]`.
  - DB showed `chat=4`, `settled_turn_packets=2`, `turn_sagas=2`, `narrator_attempts=2`, `pendingSagas=0`; player location and scene both updated to `East Exit Underground Passage`.
  - Packet `964773d1-a346-494a-bed0-337e614f5fd9` persisted resultWorldVersion `1` and accepted refs including `step-1:move_actor`.
- Lane B first-turn live acceptance:
  - Real `/api/chat/action` against zero-turn clone `ba788102-b970-43f2-8221-6f0f136e23f8`: `Я проверяю sealed lacquer message tube и courier satchel, затем осматриваю Lowwater Bazaar и выбираю самый безопасный дальнейший путь.`
  - Stage 3 checklist produced two backend steps with `toolNeed=["find_object_candidates","list_navigation_options"]`; Stage 4 accepted `find_object_candidates` and `list_navigation_options`.
  - DB showed `chat=2`, `settled_turn_packets=1`, `turn_sagas=1`, `narrator_attempts=1`, `pendingSagas=0`.
  - Packet `09b0044f-eec2-4c50-8c2e-2ac4b1e2a5df` persisted accepted refs `["inspect-items:find_object_candidates","assess-routes:list_navigation_options"]`; narrator attempt `c446f935-f8b9-40f8-ad7f-f84ce36716e6` succeeded.
  - Minor narration quality smell observed: one English word leaked into Russian prose (`reveals`). Not a settled-truth contract failure, but worth tracking before final polish.
- Lane B reserve first-turn route evidence replay:
  - Preflight verified clone `ce740a13-3b78-43a9-9bdc-6973be2ff7b9` was still zero-turn: `chat_history=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`.
  - Fixed Stage 6 accepted evidence packaging for bridge lookup observations: `find_object_candidates` and `list_navigation_options` now summarize `result.candidates` directly instead of falling through to generic `legalTargets` / `legalMovement` fields that those tools do not return.
  - Verification before live replay: `npm --prefix backend run typecheck`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts` passed with 27 tests.
  - Real `/api/chat/action`: `Я проверяю sealed lacquer message tube и courier satchel, затем осматриваю Lowwater Bazaar и выбираю самый безопасный дальнейший путь.`
  - Result reached `narrative` and `done`; DB showed `chat_history=2`, `settled_turn_packets=1`, `turn_sagas=1`, `narrator_attempts=1`, `pendingSagas=0`.
  - Packet `5cedbb52-9a6b-470d-b44a-0ea58a341eb3` had `gmRead.path="tool_plan"`, accepted `find_object_candidates` labels `Sealed lacquer message tube`, `Courier satchel`, and accepted `list_navigation_options` labels `Anchor Chain Pylon`, `Auditor Spire`, `Charter Gallery`, `Resonance Tower`, `Silt Warrens`, `Slip Twelve Berth`, `The Copper Tap`, `Upper Dam Ruins`.
  - Grounding check: narrator now exposed the actual route names to the player. Remaining quality smell: one English connective leaked into Russian prose (`nor`), so language purity still needs a later narrator polish pass rather than a regex patch.
- Lane B reserve second-turn movement and language-contract replay:
  - Tightened Stage 6 narrator language contract for Russian turns: ordinary prose words/connectors/articles/transitions must be Russian, while accepted proper nouns, item names, place names, and canon terms remain exact.
  - Verification before live replay: `npm --prefix backend run typecheck`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts` passed with 27 tests.
  - Real `/api/chat/action`: `Я выбираю Silt Warrens как путь с наименьшим количеством открытых линий обзора и иду туда, держа sealed lacquer message tube в satchel.`
  - Result reached `narrative` and `done`; DB showed `chat_history=4`, `settled_turn_packets=2`, `turn_sagas=2`, `narrator_attempts=2`, `pendingSagas=0`.
  - Packet `a51b4b35-954b-4866-96df-8a80ba5b1cdf` had `gmRead.path="tool_plan"`, one required `move_actor` checklist step, accepted destination `Silt Warrens`, path `["Lowwater Bazaar","Silt Warrens"]`, and resultWorldVersion `1`.
  - Grounding check: player current location/current scene updated to `Silt Warrens`; narrator preserved accepted item/place labels but did not contain the earlier common English leaks `and`, `or`, `nor`, `reveals`, or `openness`.
- Lane B second-turn live acceptance:
  - Verified current SceneFrame after first turn: tick `1`, location/scene `Lowwater Bazaar`, 8 connected movement candidates, including `Silt Warrens`.
  - Real `/api/chat/action` against `ba788102-b970-43f2-8221-6f0f136e23f8`: `Я выбираю Silt Warrens как путь с наименьшим количеством открытых линий обзора и иду туда, держа sealed lacquer message tube в satchel.`
  - Result: SSE reached `narrative` and `done`; backend log showed accepted `move_actor` with destination `Silt Warrens`, travelCost `1`, path `["Lowwater Bazaar","Silt Warrens"]`.
  - DB showed `chat=4`, `settled_turn_packets=2`, `turn_sagas=2`, `narrator_attempts=2`, `pendingSagas=0`; player location and scene both updated to `Silt Warrens`.
  - Packet `59f98d4f-bb71-4328-95dc-9b36b126df78` persisted resultWorldVersion `1` and accepted refs including `step-1:move_actor`.
  - Minor narration quality smell observed: one English word leaked into Russian prose (`openness`). This is language polish, not a settled-truth contract failure.
- Lane C first-turn live acceptance:
  - Real `/api/chat/action` against zero-turn clone `b13e8cfd-468e-44ef-a464-62e13fd70a7a`: `Я показываю master clerk requisition chit и спрашиваю, какие записи в municipal logs подтверждают выдачу supplies; затем сверяю это с ledger folio.`
  - Stage 3 checklist produced one backend step with `toolNeed=["record_dialogue_outcome"]`; Stage 4 accepted durable `record_dialogue_outcome`.
  - Backend accepted quote: `Log entry fifty-three, cycle nine, records issuance against this chit—eight sealed repair bars. Your ledger here shows twelve. The numbers don't match.`
  - DB showed `chat=2`, `settled_turn_packets=1`, `turn_sagas=1`, `narrator_attempts=1`, `pendingSagas=0`.
  - Packet `bde4dcf8-d5bf-4aaf-ba65-46c5fac5c401` persisted resultWorldVersion `132` and accepted refs including `step-1:record_dialogue_outcome`; narrator attempt `ce012543-8fa7-4869-85d1-e0624e13402e` succeeded.
  - Grounding check: narrator's 8-vs-12 discrepancy matches accepted `record_dialogue_outcome`, so this was not a narration leak.
- Lane C second-turn contract failure and replay:
  - Original second turn against `b13e8cfd-468e-44ef-a464-62e13fd70a7a`: `Я мелом помечаю в damaged field ledger строку с расхождением восемь против двенадцати как urgent discrepancy и прошу master clerk поставить рядом короткую отметку о сверке.`
  - Failure: Stage 3 folded the player-applied chalk annotation into a single `record_dialogue_outcome`. The narrator referenced the chalk mark, but `damaged field ledger` tags were unchanged. This was a missing accepted state receipt, not a narration-only polish issue.
  - Fix: Stage 3 checklist prompt now requires separate required backend steps for multiple backend-owned consequences; player-applied marks/tags/annotations on visible objects must use `toolNeed=entity_tag` before dependent dialogue/procedure steps and must not be folded into `record_dialogue_outcome`.
  - Focused verification: `npm --prefix backend run typecheck`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts` passed with 24 tests.
  - Live replay clone: source `2badd884-f63a-456c-b832-e88439fb62b4` -> clone `f2050c32-0308-4597-a0b8-7eac2aecf99a`.
  - Replay first turn reached `narrative` and `done`, persisted packet `89060968-c84b-4033-9f59-b5a032fae0d1` with accepted `step-1:record_dialogue_outcome`.
  - Replay second turn reached `narrative` and `done`; Stage 3 produced two required backend steps with `toolNeed=["entity_tag","record_dialogue_outcome"]`.
  - Stage 4 accepted `add_tag` on `damaged field ledger` with tag `urgent discrepancy`, then accepted durable `record_dialogue_outcome` for the clerk's refusal/redirect to a separate discrepancy form.
  - DB showed `chat=4`, `settled_turn_packets=2`, `turn_sagas=2`, `narrator_attempts=2`, `pendingSagas=0`; `damaged field ledger` tags now include `urgent discrepancy`; packet `39b585ed-3bee-4b21-9534-9ba860fd4615` persisted accepted refs including `step-1:add_tag` and `step-2:record_dialogue_outcome`.
- Lane C third-turn proof/document contract replay:
  - Failed pre-fix attempt had exposed a Stage 4 prompt contract gap: the `record_dialogue_outcome` generator used invalid `futureUseKind="proof"` and an empty `requestedRoleText`, so the turn restored pre-packet state.
  - Fix: Stage 4 tool request system prompt and `toolContractHint("record_dialogue_outcome")` now expose the exact `futureUseKind` enum, explicitly map proof/documentary later use to `evidence`, and require optional strings to be omitted instead of sent empty.
  - Verification: `npm --prefix backend run typecheck`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts settled-turn-packet-v1-store.test.ts actor-tools.test.ts chat.scene-plan.test.ts chat.test.ts` passed with 115 tests.
  - Real `/api/chat/action` replay against `f2050c32-0308-4597-a0b8-7eac2aecf99a`: `На petition-grade paper я аккуратно составляю discrepancy form: указываю damaged field ledger, requisition chit и расхождение urgent discrepancy; затем прошу master clerk поставить на форму штамп приёма.`
  - Result: SSE reached `narrative` and `done`; DB showed `chat=6`, `settled_turn_packets=3`, `turn_sagas=3`, `narrator_attempts=3`, `pendingSagas=0`; latest saga finalized and narrator attempt succeeded.
  - Packet `5fa60dea-34da-4b8e-aa5c-ec3cb787d76d` persisted accepted refs including `step-1:add_tag` and `step-2:record_dialogue_outcome`; `petition-grade paper and small ink vial` tags now include `discrepancy-form`.
  - Grounding check: accepted dialogue input used `topicKind="proof"`, valid `futureUseKind="evidence"`, no empty `requestedRoleText`, and the narrator's stamped-form/proof narration matches the accepted dialogue outcome and item tag.
- Lane C fresh replacement three-turn replay:
  - Verified clean clone `44d9d1e9-84d8-48f6-9ccf-708ad95b3cd3` from source `2badd884-f63a-456c-b832-e88439fb62b4`: `chat=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, `pendingSagas=0`; `damaged field ledger` and `petition-grade paper and small ink vial` were present.
  - Turn 1 real `/api/chat/action`: `Я показываю master clerk requisition chit и спрашиваю, какие записи в municipal logs подтверждают выдачу supplies; затем сверяю это с ledger folio.`
  - Turn 1 reached `narrative` and `done`; DB showed `chat=2`, `settled_turn_packets=1`, `turn_sagas=1`, `narrator_attempts=1`, `pendingSagas=0`; packet `40819eed-f4e6-44d0-8d99-353e69473bcf` accepted `step-1:record_dialogue_outcome` and `step-2:record_world_fact`, grounding partial confirmation plus quantity/date gap.
  - Turn 2 real `/api/chat/action`: `Я мелом помечаю в damaged field ledger размытые графы quantity и date как urgent discrepancy и прошу master clerk поставить рядом короткую отметку о том, что сверка дала только partial confirmation.`
  - Turn 2 reached `narrative` and `done`; DB showed `chat=4`, `settled_turn_packets=2`, `turn_sagas=2`, `narrator_attempts=2`, `pendingSagas=0`; packet `58fec692-6eda-46fe-b32c-7ca47bfb1293` accepted `step-1:add_tag` and `step-2:record_dialogue_outcome`; `damaged field ledger` tags include `urgent_discrepancy:quantity,date`.
  - Turn 3 first attempt correctly restored pre-packet after a schema failure in dependent `record_dialogue_outcome`: Stage 4 accepted `add_tag` on petition paper, then the dialogue request hallucinated malformed `stateEffects` without a backend-issued `stateReceipt`; rollback preserved `chat=4`, `settled_turn_packets=2`, `turn_sagas=2`, `narrator_attempts=2`, `pendingSagas=0`, and petition paper was not tagged.
  - Fix: v1 now attaches model-safe `state_receipt_N_M` aliases to accepted structural state-bearing tool results and exposes only those aliases through `acceptedContext.stateReceipts`; Stage 4 prompt and contract hint define when `record_dialogue_outcome.stateEffects.applied_now` may use them.
  - Verification after fix: `npm --prefix backend run typecheck`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts settled-turn-packet-v1-store.test.ts actor-tools.test.ts chat.scene-plan.test.ts chat.test.ts` passed with 116 tests.
  - Turn 3 retry real `/api/chat/action`: `На petition-grade paper я аккуратно составляю discrepancy form: указываю damaged field ledger, requisition chit, размытые quantity/date и пометку urgent_discrepancy; затем прошу master clerk поставить на форму штамп приёма.`
  - Turn 3 retry reached `narrative` and `done`; DB showed `chat=6`, `settled_turn_packets=3`, `turn_sagas=3`, `narrator_attempts=3`, `pendingSagas=0`; packet `e316446b-b66d-4a3e-8136-01b62503bcbb` accepted `step-1:add_tag`, `step-2:record_dialogue_outcome`, and `step-3:spawn_item`.
  - Grounding check: petition paper tags include `discrepancy-form`; spawned item `stamped discrepancy form — damaged field ledger` carries durable proof/document tags; accepted dialogue used valid `topicKind="proof"`, `futureUseKind="evidence"`, and no malformed `stateEffects`.
- Lane C current-HEAD strict language/ref replay:
  - First current-HEAD replay on clone `26acf741-77af-4760-8bc6-b9d20fcfc927` exposed a Stage 4 language gap: `record_dialogue_outcome.quote` and related prose could be generated in English even for Russian turns. Fixed Stage 4 tool request prompts to pass `responseLanguage` and `toolInputLanguageContract`, requiring model-authored tool input prose to match the player action language while preserving exact labels.
  - Same replay exposed a Stage 6 language gap: narrator could form mixed ordinary phrases like `requisite поля`. Fixed the Russian narrator contract so English is allowed only for exact accepted labels/names/canon terms, with non-label ordinary words translated.
  - Strict replay clone `0f24a9ca-d2d7-46fe-b9d7-63172af996cd` first restored cleanly after Stage 4 proposed backend-only `knowledge:*` in `record_world_fact.sourceRefs`; rollback preserved `chat_history=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, `pendingSagas=0`.
  - Fixed Stage 4 ref contract: tool input refs must use only model-safe visible labels/current aliases from scene or acceptedContext; never copy backend-only refs such as `knowledge:*`, backend ids, or UUIDs into `sourceRefs`, `subjectRefs`, `evidenceRefs`, actor/entity/destination refs. Added explicit `record_world_fact` hint for legal refs.
  - Replayed three real `/api/chat/action` turns on clone `0f24a9ca-d2d7-46fe-b9d7-63172af996cd` from zero-turn state. All three reached `narrative` and `done`; DB showed `chat_history=6`, `settled_turn_packets=3`, `turn_sagas=3`, `narrator_attempts=3`, `pendingSagas=0`.
  - Turn 1 accepted `record_dialogue_outcome`; Turn 2 accepted `add_tag` on `damaged field ledger` plus dependent `record_dialogue_outcome`; Turn 3 accepted `add_tag` on `petition-grade paper and small ink vial` plus dependent `record_dialogue_outcome` using backend-issued `state_receipt_1_1`.
  - Grounding check: `damaged field ledger` tags include `urgent discrepancy`; `petition-grade paper and small ink vial` tags include `discrepancy-form`; no failed/skipped packet steps; sampled narrator common-English leak scan found none for `and/or/nor/reveals/openness/dated/shows/disbursement/against/sealed/countersigned/requisite/fields/correctly/officially`.
  - Verification after fixes: `npm --prefix backend run typecheck`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts` passed with 29 tests.
- Lane B reserve-3 manual play slice:
  - Manual-play clone `16edf584-2a43-4f2a-9a32-589befd42b51`; transport only sent human-chosen actions and collected SSE/DB evidence. Artifact: `output/phase95-manual-play/lane-b-reserve3-manual.json`.
  - Played 8 real `/api/chat/action` turns from zero-turn state. All 8 returned `status=200`, `narrative`, and `done`; DB showed `chat_history=16`, `settled_turn_packets=8`, `turn_sagas=8`, `finalized=8`, `pending=0`, `narrator_attempts=8`.
  - Covered clarification/direct turns from invalid sibling-subscene targets (`Litha Corsen`, `Old Route Hand Sessik`), movement Lowwater Bazaar -> The Copper Tap, The Copper Tap -> Silt Warrens, Silt Warrens -> Transmission Basement, scene-extra creation for `Barkeep Drenn`, and visible NPC dialogue with `Relay-Tech Dorin` and `Venn the Borrowed`.
  - Packet refs confirmed accepted `move_actor`, `create_scene_extra`, `record_dialogue_outcome`, and `check_route` where appropriate; clarification turns had no accepted tool refs and did not mutate worldVersion.
  - Operator correction: earlier Lane A reserve-3 8-turn artifact was an automated action-generator smoke, not acceptable manual play evidence. Do not count it toward final 3x60 human/manual acceptance.
- Lane B reserve-3 manual continuation:
  - Continued artifact `output/phase95-manual-play/lane-b-reserve3-manual.json` from 8 to 16 rows; 15 accepted turns total and 1 failed-closed turn attempt.
  - Failed attempt: `убираю tube обратно в courier satchel` was incorrectly planned as `transfer_item`; Stage 4 proposed invalid `targetType=item`. Rollback preserved `chat=18`, `settled_turn_packets=9`, `turn_sagas=9`, `finalized=9`, `pending=0`.
  - Fix: Stage 3 now forbids transfer/item-state steps when the player only keeps, pockets, hides, carries, holds, readies, secures, or stows an already-held item; `toolContractHint("transfer_item")` exposes the legal `targetType` contract.
  - Retry and follow-up manual turns succeeded: Transmission Basement -> Resonance Tower, tower inspection, Ground-Floor Barricade approach, Rost document procedure, seal-only registration denial, retreat to Resonance Tower.
  - Final DB after chunk: `chat_history=30`, `settled_turn_packets=15`, `turn_sagas=15`, `narrator_attempts=15`, `finalized=15`, `pending=0`, scene `Resonance Tower`.
  - Verification: `npm --prefix backend run typecheck`; focused `gameplay-turn-cycle-v1.test.ts`; 5-file suite `gameplay-turn-cycle-v1.test.ts settled-turn-packet-v1-store.test.ts actor-tools.test.ts chat.scene-plan.test.ts chat.test.ts` passed with 121 tests.
  - Prose/language quality note, not a gameplay-cycle blocker: rows 11 and 21 contain model script artifacts (`dẫnёт`, `Litha等待`). Per operator correction, do not add deterministic language choke points for these quirks unless they corrupt settled truth/state/playability; final prose quality and target narration language are later polish work after gameplay is proven.
- Lane B reserve-3 manual continuation, rows 17-27:
  - Continued real `/api/chat/action` on clone `16edf584-2a43-4f2a-9a32-589befd42b51` with human-chosen actions only. Accepted rows: 17-22, 25-27. Failed-closed rows: 23-24.
  - Covered route inspection and movement `Resonance Tower -> Silt Warrens -> Slip Twelve Berth`, visible dialogue with `Litha Corsen`, route hint purchase, movement `Slip Twelve Berth -> The Copper Tap`, then visible dialogue with `Old Route Hand Sessik`.
  - First payment attempt exposed GM Read contract mismatch: concrete dialogue outcome was forced to require structural owner classes. Fix: `dialogue_outcome` may carry concrete but non-structural social/trade/procedure outcomes when no backend-owned item/location/relationship state changes; prompt now distinguishes structural state from paid answer/refusal/route hint.
  - Second payment attempt exposed Stage 3 checklist contract gap: unmodeled small currency was planned as `transfer_item`, then failed because `silver coins` were not visible/current/inventory item refs. Fix: Stage 3 and `transfer_item` hint forbid transfer steps for ordinary unmodeled currency/fees/tips/bribes/prices; paid answer/sold hint uses `record_dialogue_outcome`.
  - Retry succeeded: payment + Litha route hint settled with `record_dialogue_outcome`; following the hint moved to `The Copper Tap`; Sessik refusal/redirect settled with `record_dialogue_outcome`.
  - Final DB after row 27: `chat_history=48`, `settled_turn_packets=24`, `turn_sagas=24`, `narrator_attempts=24`, `finalized=24`, `pending=0`, scene `The Copper Tap`.
  - Verification: `npm --prefix backend run typecheck`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts gm-turn-read.test.ts` passed with 109 tests.
- Lane B reserve-3 manual continuation, rows 28-38:
  - Continued real `/api/chat/action` on clone `16edf584-2a43-4f2a-9a32-589befd42b51` with human-chosen actions only.
  - Rows 28-32 succeeded: Sessik route advice, movement `The Copper Tap -> Silt Warrens -> Resonance Tower`, tower route inspection, movement to `Transmission Basement`.
  - Row 33 initially exposed a root contract bug: Stage 3 created a temporary NPC named `Relay-Tech Dorin и Venn the Borrowed` even though both addressed NPCs were already visible.
  - Fix: GM Read now rejects `prose_role` when addressed targets include visible actor refs; Stage 3/4 prompts forbid composed responders for multiple visible actors; v1 checklist normalization removes invalid `create_scene_extra` helper steps when GM Read already binds a visible speaker.
  - Replayed row 33 from `.turn-boundaries/last-turn-boundary`; accepted only `record_dialogue_outcome`, no composite NPC remained in DB.
  - Rows 34-38 succeeded: Dorin route/procedure details, movement `Transmission Basement -> Resonance Tower`, navigation lookup proving no visible archive-window bypass, movement to `Ground-Floor Barricade`, Rost durable refusal.
  - Final DB after row 38: `chat_history=70`, `settled_turn_packets=35`, `turn_sagas=35`, `narrator_attempts=35`, `finalized=35`, `pending=0`, scene `Ground-Floor Barricade`.
  - Verification in this chunk: `npm --prefix backend run typecheck`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts gm-turn-read.test.ts` passed with 112 tests before live replay.
- Lane B reserve-3 manual continuation, rows 39-41:
  - Row 39 first failed closed on `record_dialogue_outcome.claims[].claimKind`; rollback preserved `chat=70`, `settled_turn_packets=35`, `turn_sagas=35`, `narrator_attempts=35`, `pending=0`.
  - Fix: Stage 4 prompt and `toolContractHint("record_dialogue_outcome")` now expose the exact `claimKind` enum and instruct the model to use `other` for procedure/document/authority/policy categories that do not exactly fit.
  - Row 39 replay succeeded with `record_dialogue_outcome`; DB advanced to `chat=72`, `settled_turn_packets=36`, `turn_sagas=36`, `narrator_attempts=36`, `pending=0`.
  - Row 40 initially exposed a truth-boundary issue: `find_object_candidates` returned only visible object candidates, but narration inferred absent registration/receiving marks. Replayed from `.turn-boundaries/last-turn-boundary`.
  - Fix: object candidate lookup results now declare label/tag-only detail authority, Stage 6 treats object lookup evidence as non-detail evidence, and Stage 3 is instructed to use `start_search` for specific unconfirmed object details such as marks, text, serial/registration numbers, addresses, hidden contents, or proof that lookup tools cannot return.
  - Row 40 replay reached `narrative` and `done`; accepted `inspect_known_fact` instead of unsupported object-detail inference, did not settle a false absence fact, and preserved clean counts `chat=74`, `settled_turn_packets=37`, `turn_sagas=37`, `narrator_attempts=37`, `pending=0`.
  - Row 41 succeeded with `record_dialogue_outcome`; Rost named Resonance Tower as the official direction for document handling. DB after row 41: `chat=76`, `settled_turn_packets=38`, `turn_sagas=38`, `narrator_attempts=38`, `finalized=38`, `pending=0`, scene `Ground-Floor Barricade`.
  - Verification: `npm --prefix backend run typecheck`; focused `gameplay-turn-cycle-v1.test.ts bridge-candidate-tools.test.ts`; broader `gameplay-turn-cycle-v1.test.ts gm-turn-read.test.ts settled-turn-packet-v1-store.test.ts actor-tools.test.ts chat.scene-plan.test.ts chat.test.ts bridge-candidate-tools.test.ts` passed with 217 tests.
- Lane B reserve-3 manual continuation, rows 42-63 / 60 finalized packets:
  - Continued real `/api/chat/action` on clone `16edf584-2a43-4f2a-9a32-589befd42b51`; every action was chosen manually, with the script only transporting the action and collecting SSE/DB evidence.
  - Rows 42-46 succeeded through Rost refusal/redirect, route inspection, and movement `Ground-Floor Barricade -> Resonance Tower -> Lowwater Bazaar`.
  - Row 47 exposed two observation grounding bugs: mixed person/sign/object lookups were satisfied with object-only candidate evidence, and `list_visible_affordances` exposed the player plus equipped satchel as if they were scene targets.
  - Fix: Stage 3 now requires `list_visible_affordances` or separate category-matched lookups for mixed visible-person/sign/object/POI requests; empty candidate evidence is summarized as category-scoped and non-absence proof; `list_visible_affordances` excludes the current player from social affordances and Stage 6 summarizes equipped items as carried.
  - Rows 48-53 succeeded through movement to `Anchor Chain Pylon`, visible affordance inspection, dialogue with `Undercurrent Courier Nisse`, `Dam-Speaker Yara`, and `Pike`, then paid route guidance from Pike without modeling untracked pocket change as an item transfer.
  - Rows 54-60 continued from `Anchor Chain Pylon -> Lowwater Bazaar -> Anchor Chain Pylon -> Upper Dam Ruins`; accepted tools included `move_actor`, `find_poi_candidates`, `create_scene_extra`, `record_dialogue_outcome`, `list_navigation_options`, and `list_visible_affordances`.
  - Rows 61-63 added three more accepted packets to reach the actual packet target, not just row count: `Upper Dam Ruins -> Lowwater Bazaar`, route inspection, then `Lowwater Bazaar -> Charter Gallery`.
  - Final DB after row 63: `chat_history=120`, `settled_turn_packets=60`, `turn_sagas=60`, `narrator_attempts=60`, `finalized=60`, `pending=0`, scene `Charter Gallery`, `worldVersion=43`, `currentTick=65`.
  - Artifact: `output/phase95-manual-play/lane-b-reserve3-manual.json`; raw SSE files under `output/phase95-manual-play/sse/`.
  - Residual non-blocking narrative quality notes: occasional phrasing/typos and overconfident route-name interpretation remain prose/GM judgment polish, not settled-packet corruption; per operator direction, do not add deterministic prose choke points until gameplay proof is stronger.
- Lane A reserve-2 diagnostic run, not acceptance:
  - Started zero-turn clone `ea9e1cc4-3829-43c8-9d8d-fafdc5d86c02` with player `Tanaka Kouta` in `Shibuya Ward`; artifact `output/phase95-manual-play/lane-a-reserve2-manual.json`.
  - Reached 46 finalized packets with `pending=0`, but the lane is not accepted: turn 46 moved state to `Shibuya Backstreet Collection Point` while narration said the choice was still pending.
  - Root cause: Stage 6 accepted evidence did not summarize `check_route` / `move_actor` concretely, so the narrator filled the gap with planning prose over an accepted movement receipt.
  - Fix in progress: Stage 6 now emits explicit route-check and movement-completed evidence, and narrator system prompt states completed movement evidence must be narrated as arrival, not pending choice.
  - Operator correction: final acceptance lanes count only when they run cleanly from 0 to about 60 without failed, replayed, restored, or invalid player-facing turns. This Lane A run is diagnostic only; after the fix, use a fresh zero-turn clone.
- Lane G/H Shibuya diagnostic, not acceptance:
  - Lane G clone `2142256e-b5b4-4eab-b595-df39514763dd` reached 13 accepted packets but is not accepted: Turn 13 narrator treated raw `playerAction` local posture as settled physical truth while only dialogue was accepted. Fix: playerAction is now request/framing, Stage 3 splits dialogue from local stance/possession posture, and diagnostic replay accepted `log_event + record_dialogue_outcome`.
  - Lane H clone `07383f64-1d73-4278-a90e-1541f76c4c2d` reached 8 accepted packets but is not accepted: Turn 8 mapped speaker directions to `Laundry King` onto unrelated `Shibuya Back-Alley Meeting Point` movement. Fix: speaker-asserted directions to unmodeled POI are local search/POI ownership until target is established; `move_actor` cannot substitute another connected route.
  - Oracle attempt for unknown-POI directions: dry-run succeeded with 3 attachments and about 47.7k tokens; browser run `unknown-poi-directions-owner` failed before delivery because the Oracle Chrome profile was not logged in / model selector unavailable. Local decision taken from first principles and verified with tests plus live diagnostic.
  - Oracle R3 `unknown-poi-directions-owner-r3` succeeded after logging into Oracle's private Chrome profile and forcing one bundled attachment. Verdict: MODIFY. Keep the false-arrival block, but replace negative route-substitution checks with a positive target-binding / eligible-movement contract; remove first-connected movement examples; apply same-target validation to `check_route`; do not let Oracle-only weak hits narrate walking progress, storefronts, signs, POI discovery/absence, or current-scene changes without accepted local/search/POI receipts.
  - Operator correction: the R3 ChatGPT UI did not visibly show an attachment. Reran Oracle as `unknown-poi-inline-r4` with `--browser-inline-files`; transcript contains `### File:` sections for all 3 files and Oracle explicitly confirmed it could see `gameplay-turn-cycle-v1.ts`, `gameplay-turn-cycle-v1.test.ts`, and `gm-turn-architecture-review-2026-05-03.md`. R4 verdict stayed MODIFY.
  - Implemented Oracle R4 target authority: checklist steps can now carry `targetBinding` with `movementAuthority`; Stage 3 prompt requires it for travel/route/local-navigation/search-place steps; normalization derives unresolved target binding from structured GM Read `targetRefs` when Stage 3 omits it; Stage 4 receives `targetBinding` and `eligibleMovementDestinations`; movement/route tools fail closed when no same-target movement authority exists; first-connected movement examples are no longer generated for unresolved POIs; narrator prompt forbids Oracle-only walking/sign/POI discovery/absence claims.
  - Verification: `npm --prefix backend run typecheck`; `npm --prefix backend test -- gameplay-turn-cycle-v1 narrator-packet gm-tool-loop --bail=1` passed with 211 tests.
  - Lane J post-target-binding diagnostic clone `2bb6bd6b-2f41-420d-97be-d3a310e11776`: Turn 1 succeeded from zero with `start_search + list_navigation_options`, grounded routes, scene `Shibuya District`, `packets=1`, `pending=0`. Turn 2 exact movement to `Shibuya Back-Alley Meeting Point` failed closed before packet persistence because Stage 3 chose a valid exact connected destination but emitted `targetBinding.sourceAuthority` outside the enum. Fix: add `player_explicit` as a first-class source authority for explicit player route choices and expose the exact enum in the Stage 3 prompt.
  - Verification after Lane J Turn 2 fix: `npm --prefix backend run typecheck`; `npm --prefix backend test -- gameplay-turn-cycle-v1 narrator-packet gm-tool-loop --bail=1` passed with 212 tests. Lane J remains diagnostic only because Turn 2 had a failed/restored attempt.
  - Lane K post-`player_explicit` diagnostic clone `10bf00c8-34ab-4ffa-b767-ccadf1d93fc8`: Turns 1-3 succeeded cleanly, including exact `move_actor` to `Shibuya Back-Alley Meeting Point` with `targetBinding.sourceAuthority=player_explicit` and visible NPC `record_dialogue_outcome` from Nishimura Koji giving a speaker-asserted Laundry King lead. Turn 4 correctly did not substitute the only connected route (`Shibuya District`) and kept scene at `Shibuya Back-Alley Meeting Point`, but it exposed a narration ownership bug: a single empty `find_poi_candidates` lookup was narrated as physical walking/search progress along the directions. Lane K is diagnostic only.
  - Fix after Lane K Turn 4: Stage 3 prompt now says unmodeled-POI direction following needs a scene-local `log_event` for the attempted local-navigation beat; candidate lookup alone does not own walking progress. Stage 6 narrator prompt now forbids turning `find_poi_candidates`/`find_location_candidates` lookup evidence into walking along directions, turns at landmarks, storefront/sign progress, or street traversal. Added focused narrator prompt coverage.
  - Verification after lookup-not-navigation fix: `npm --prefix backend run typecheck`; `npm --prefix backend test -- gameplay-turn-cycle-v1 narrator-packet gm-tool-loop --bail=1` passed with 213 tests.
  - Lane L post-lookup-not-navigation diagnostic clone `10f543a0-ffff-405f-aa4d-9c9167ca2f3b`: Turns 1-4 succeeded cleanly, including exact movement to `Shibuya Back-Alley Meeting Point` and Koji dialogue with no forced Laundry King lead. Turn 5 exposed a visual-search truth-boundary bug: accepted `start_search found=false` correctly meant the search target remained unconfirmed, but narration described blue Laundry King / yellow konbini / pointer signs as not visible or absent. Lane L is diagnostic only.
  - Fix after Lane L Turn 5: Stage 3 now requires `start_search` expected effects to say the search starts/continues and the concrete result remains unconfirmed; Stage 6 narrator prompt forbids turning any visual/object/person/route/document `start_search found=false` into absence, not-visible, not-present, not-found, missing, or unavailable claims without a separate accepted receipt proving that status.
  - Verification after visual-search absence fix: `npm --prefix backend run typecheck`; `npm --prefix backend test -- gameplay-turn-cycle-v1 narrator-packet gm-tool-loop --bail=1` passed with 214 tests.

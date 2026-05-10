---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Gameplay Fidelity
status: ready_to_plan
last_updated: "2026-05-10T09:34:40.105Z"
last_activity: 2026-05-10
progress:
  total_phases: 59
  completed_phases: 40
  total_plans: 260
  completed_plans: 212
  percent: 68
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-25)

**Core value:** The LLM is the narrator, never the engine. All mechanical outcomes are resolved by backend code.
**Current focus:** Phase 90 — Playable GM bridge tools for fuzzy player intent

## Current Position

Phase: 91
Plan: Not started
Status: Ready to plan

Last activity: 2026-05-10

Progress: [████████░░] 82%

## Current Snapshot

- Active roadmap phases: 43
- Completed roadmap phases: 41 after Phase 89 verification
- Phase 89 plan status: 5/5 complete and verified
- Pending closeout: Phase 90 through Phase 94 remain active execution/verification scope

## Open Work

- Phase 90 starts the playable GM bridge-tool work: observation-only candidate tools first, then constrained state-bearing tools, fuzzy intent policy, and a tourist/courier acceptance gate.
- Broader live gameplay validation is now active scope in Phase 86 rather than a vague follow-up.
- Phase 83 has fresh frontend deterministic and responsive browser evidence; remaining visual work is polish depth, not a blocker to Phase 84.
- Phase 72 is verified complete; automated evidence proves artifact authority propagation but not live subjective worldgen quality.
- Phase 70 runtime work was recovered from `codex/phase-70-execute` into `codex/integrate-phase70`; merge verification is tracked in `.planning/quick/260427-rh8-integrate-phase-70-worktree-branch-into-/PLAN.md`.
- Historical audit debt is now ledgered in Phase 76 artifacts; live/provider/UAT gates remain explicit follow-up work.
- Backlog items outside active execution order remain in `.planning/BACKLOG.md`.

## Notes

- Use `ROADMAP.md` plus the per-phase directories as the source of truth for current scope and verification evidence.
- Phase 68 introduced the bounded world-brain scene-direction seam.
- Phase 69 completed the ownership split by moving normal player-turn hidden adjudication to a judge-owned structured plan executed deterministically by backend code.
- Phase 70 replaced the normal visible-turn critical path with SceneFrame -> Oracle -> ScenePlan -> backend validation/execution -> NarratorPacket -> final prose, while keeping Oracle as bounded outcome authority.
- The primary runtime risk after Phase 70 is no longer hidden ownership ambiguity; it is live-play quality and possible drift between validated scene commitments and what final narration emphasizes.

## Recent Updates

- Phase 90 completed execution (2026-05-10): 90-04 added deterministic tourist/courier acceptance for `иду дальше по логичному маршруту и ищу чайную лавку`, proving parser-like GM Read clarification repair, route/POI/known-fact lookup, hidden fact denial without mutation/leak, `move_actor`, constrained `create_minor_poi`, `start_search`, and source-backed PlayerFacingPacket narration. Required focused tests, dry-run e2e artifacts in `output/phase-90/`, backend typecheck, diff check, and GitNexus scope checks passed. Live route mutation remains unclaimed and gated.
- Phase 88 verified complete (2026-05-09): `88-VERIFICATION.md`, `88-VERIFICATION-MATRIX.md`, and `evidence/wave-7/final-closeout.md` record green deterministic, integration, backend-suite, harness, and live clone-pool evidence. Final clone-pool proof passed 8 routes / 14 turns / 0 hard failures with no output clipping and no turn rollback events; external character-card import remains deferred out of the Phase 88 gate.
- Phase 89 verified complete (2026-05-10): route/runtime resilience tests passed, backend typecheck and shared build passed, deterministic harness wrote `output/playwright/phase-89-runtime-resilience/summary.json` with status `passed`, and the live local harness wrote `output/playwright/phase-89-runtime-resilience-live/summary.json` after a real `/api/chat/action` completed with HTTP 200 and `event: done`. The live harness contract now sends `campaignId`, `playerAction`, `intent`, and `method`.
- Phase 86 and Phase 87 added (2026-05-06): Phase 86 owns exhaustive overnight live playtesting across four settings, five route types per setting, and about twenty turns per route where feasible, with MIMO Pro 2.5 as the active role model target. Evidence must include GM Read/tool-loop behavior, narrator prose, world-state diffs, living-world pressure, movement/location graph coherence, combat/power-level handling, V4 UI effects/formatting/readability, screenshots/logs, and subjective play-feel scoring. Phase 87 is the follow-up burn-down phase generated from the Phase 86 findings ledger, with no fallback/hiding mechanics accepted as a fix.
- Historical Phase 88 planning (2026-05-07): Living-world authority spine and key NPC co-player process simulation. Scope came from `docs/WorldForge_Key_NPC_AI_players_latency_memory_budget_full_report_v3.md`: key NPCs as co-player processes, authoritative turn boundary, ActorFrame/PlayerFacingPacket split, versioned simulation queue/proposals, faction command networks, memory/context budgets, latency traces, and full deterministic plus live-play verification. Execution was explicitly sectional: build a layer, prove it, then attach the next layer.
- Historical Phase 88 external review update (2026-05-07): Cursor Agent, Codex CLI, OpenCode, and Gemini Flash reviewed the Phase 88 plan set. Applied review flags moved trace/write-scope contracts into early waves, kept old detached writers as proposal-only adapters, defined actor combat through authoritative ToolResults, added hybrid knowledge retrieval/persistence, specified failure/replan/forecast boundaries, added LLM/human judge calibration, and added fail-fast wave gates. Gemini Pro and Claude were unavailable by capacity/quota.
- Historical Phase 88 final planning status (2026-05-07): Final GSD re-review pass 4 returned FLAG with no blockers. Verification drift from pass 3 was fixed by aligning task-level automated checks to declared tests and adding deterministic/live Playwright plus judge-calibration gates to `88-11`. Remaining flags were execution discipline only: dense plans and intra-wave dependencies.
- Phase 86 86-01 completed (2026-05-06): added `e2e/86-exhaustive-playtest.ts`, dry-run manifest validation, and live pilot evidence. The pilot waited through a 396-second MIMO turn without duration failure and produced active/final screenshots plus findings. Calibration found that older Naruto x JJK campaigns `cffb7afd-b3da-4229-a670-a5482e9068e7` and `ad46d191-5b7e-4cc1-a897-1d36dff6f506` currently fail `/game` SceneFrame construction; `da183dd3-9e19-4ba3-ae72-c969af1ffe1d` is the usable high-power baseline for ongoing Phase 86 tests.

- Phase 83 verified complete (2026-05-05): WorldForge V4 visual migration is now applied to the real frontend rather than copied from prototype HTML. Global tokens, display/prose/mono font roles, low-radius surfaces, rail/stage shell, launcher workbench, campaign concept/DNA, library/settings/review/character foundations, `/game` stage/docks, effects/stage-signal styling, and player-facing progress copy were updated. Unsupported or fake prototype controls/statuses/counters were removed or kept out of active UI. Draft resume is now separate from destructive fresh campaign start, and failed worldgen retry reuses the already-created campaign instead of duplicating it. Verification: frontend full suite passed 64 files / 491 tests, frontend lint passed, frontend typecheck passed, production build passed, and Playwright final QA in `output/playwright/phase-83-v4-rework/final-matrix/` covered 24 route/viewport checks plus 7 interaction/state checks with active `/game` shell evidence and zero route/console/page/forbidden-text/overflow failures.

- Phase 82 closure verified after reopen (2026-05-05): `82-08-PHASE82-CLOSURE-GAP-REGISTER.md` now records fixes for forecast draft/schema drift, legal current scene/location labels for GM tools, frontend rollback-authoritative restore after action stream errors, finalization stage copy, removal of rollback-critical finalization duration ceilings, and the deeper GM/Oracle false-claim root cause. New `player-action-epistemics` prompt/validation contracts prevent unsupported player claims about keys/permits/passes/credentials/authority from becoming Oracle existence checks, while preserving social/visible Oracle use and keeping GM tools available. Fresh live evidence: false-claim focused run passed 2 turns with zero hard/gate failures; exploration rerun passed after the `Player` alias fix; full branchy run passed 3 branches / 6 turns with `hardFailureCount: 0`, `gateInvariantFailureCount: 0`, and average score 5. Residual note: transient dev-server connection reset/refused browser events were recorded during the long local Playwright run, but all turns completed and game-state gates stayed green.
- Phase 84 added (2026-05-05): queued a dedicated `RP prompt architecture and model-facing GM/storyteller optimization` phase. Scope is not Phase 74-style schema contract hardening; it is a playable RP/GM prompt architecture pass. Required research includes current WorldForge gameplay prompt surfaces, active SillyTavern-style preset prompts from `X:\Models\templates` using `prompt_order[].order[].enabled`, Marinara/RP/VN prompt references, Reddit/source research, and cross-AI review from available external CLI agents before implementation. The phase must preserve the LLM-as-GM/backend-as-rulebook boundary while avoiding one giant prompt and inactive-preset cargo culting. Closeout must include multi-branch Playwright playtests across different settings/player styles, with subjective player-feel notes on whether the game is coherent, responsive, and interesting enough to continue.
- Phase 84 verified (2026-05-05): implemented compact model-facing contracts for GM Read, GM Action Checklist, GM Tool Loop, Forecast Builder, and final narration. Added first-sentence/no-recap and concrete NPC beat rules, forecast-as-pressure wording, one-tool-per-step enforcement, and a bounded GM Read frame-ref repair for unconfirmed access claims. Focused backend suite passed 19 files / 321 tests and backend typecheck passed. Live branchy gate on campaign `0ed6bb3c-a528-4067-8f29-86ebdd8d0637` passed 3 branches / 6 turns with zero hard failures, zero browser errors, and average play-feel score 5/5; artifacts: `output/playwright/phase-84-rp-prompts/2026-05-05T21-59-54-057Z-post-ref-repair-branchy/`.
- Phase 85 verified (2026-05-06): added a final-visible-only Narrator prose technique contract based on AI-slop/cliche research and active RP prompt corpus patterns. The contract teaches concrete replacement behavior instead of only banning bad prose: actor/camera-observable details, action before interpretation, scene-changing background detail, mundane-specific tourist beats, readable rhythm, and dialogue through voice/omission. Existing slop retry guidance now also asks for local action/object/gesture/sound replacement. Focused backend prompt/turn tests and backend typecheck passed.
- Phase 82 verified complete (2026-05-05): all five plans are complete; `reveal_location` now creates anchored expiring `ephemeral_scene` rows, support NPCs spawn into parent broad/current-scene scope, `promote_npc` can preserve useful temporary NPCs, transient cleanup archives expired scenes and retires unpromoted support NPCs, dynamic tool calls have compact observations/progress/no-spam budgets, and frontend turn readiness waits for final world refresh rather than raw narration completion. Live campaign `0ed6bb3c-a528-4067-8f29-86ebdd8d0637` completed 15 Playwright UI turns with no duration caps and no stuck settling. The live gate found and fixed three player-visible truth bugs: model-facing SceneFrame/prompt broad-scope mismatch for persistent sublocations, stale `[PRESENT ACTORS]` contradicting NarratorPacket visible actors, and UUID filler replacing concrete successful `log_event` text in NarratorPacket effects. Backend focused suite passed 8 files / 120 tests, frontend game page suite passed 49 tests, backend/frontend typechecks passed, and live proof artifacts are in `output/playwright/phase-82-live-gate/`.
- Phase 82 planned (2026-05-05): added `GM dynamic scene expansion and agentic tool harness` with five plans covering baseline regressions, anchored ephemeral sublocation lifecycle, support NPC lifecycle and scene placement, agentic tool observations/budgets/progress, and fresh live play verification. Phase 83 was added as the follow-up full WorldForge V4 visual migration phase, intentionally deferred until Phase 82 stabilizes gameplay tool behavior.
- Phase 81 Plan 81-06 completed (2026-05-04): fresh campaign `dcd3dd98-6bee-426e-ae49-a178c4b9082f` reached opening plus 13 player turns through `/game`/SSE with direct, clarification, oracle, single-tool, multi-step, revised/skipped-step, and no-leak coverage. The live gate found and fixed six real issues: GM Read evidence-only ref typos now sanitize instead of killing turns, tool-step revision exceptions now skip the affected step instead of failing the turn, final narration now treats raw player action as an attempted request rather than proof of possessions/access/items, player-turn durable `log_event` now rejects unsupported possession/access/item-use claims instead of persisting them as committed world truth, player-turn tags now reject impossible access/possession claims such as `vault-unlocked`, and GM Read now accepts typed aliases for known current-location refs. Focused backend suites and backend typecheck are green; the live campaign has one pre-fix unsupported registry-token chat line recorded as evidence, while the false committed event rows/tag residue were removed and repeated master-key negative actions verified the guards.
- Phase 81 Plan 81-05 completed (2026-05-04): decoupled `NarratorPacket` from `ScenePlan`/`gm-beat-plan` projection types, removed raw `sceneAssembly.sceneEffects` and `playerPerceivableConsequences` from the NarratorPacket final-visible prompt path, added failed/skipped sentinel tests for packet and final-prompt leakage, and mapped Phase 81 GM loop stages to player-facing loader copy. Focused packet/prompt/visible-guard suite passed 6 files / 113 tests, focused turn/narrator suite passed 10 files / 263 tests, backend and frontend typechecks are green, and frontend stage-copy suite passed 2 files / 59 tests from the frontend package root.
- Phase 81 Plan 81-04 completed (2026-05-04): added `gm-tool-step.ts` and wired live mutating/roll-oracle/combat turns through `runGmActionChecklist` plus `executeGmToolSteps` instead of `runScenePlanner`/`validateScenePlan`/`executeScenePlan`. Tool steps validate schema, allowed tools, grounding, private terms, one bounded revision, dependency skips, executor failures, and candidate request budget before settled packet narration. Focused 81-04 suite passed 7 files / 167 tests, tool-executor boundary suite passed 4 files / 126 tests, and backend typecheck is green.
- Phase 81 Plan 81-03 completed (2026-05-03): added additive `gm-action-checklist.v1` with max 6 sequential steps, explicit dependency semantics, pending statuses, requiredAction kinds, optional schema-validated candidate tool requests, recursive executable-smuggling rejection, model-facing ref validation, and prompt contract. Focused checklist/GM Read tests passed 12/12 and backend typecheck is green.
- Phase 81 Plan 81-02 completed (2026-05-03): live ScenePlan turns now call `runGmRead` instead of `runGmTurnDecision`; direct, continue, and clarification GM Read paths skip `runScenePlanner`, `validateScenePlan`, and `executeScenePlan`; no-mutation paths build a temporary settled snapshot for narration without state mutation. Focused backend suite passed 199/199 and backend typecheck is green.
- Phase 81 Plan 81-01 completed (2026-05-03): added additive `gm-read.v1` for player-turn interpretation/path choice without live rewiring yet. GM Read forbids concrete tool payloads recursively, validates refs against the model-facing SceneFrame, redacts private/offscreen prompt context, and keeps `tool_plan` as intent-only for later checklist/tool-step stages. Focused GM Read/GM Turn Decision tests passed 16/16 and backend typecheck is green.
- Phase 80 verified complete (2026-05-03): all six plans are complete; normal turns now stage/commit advisory world forecasts, derive scoped forecast excerpts, require GM BeatPlan before ScenePlanner/final narration, redact private/offscreen forecast terms across GMDecision/BeatPlan/ScenePlanner/recent-conversation/clarification/final-narration paths, and feed NarratorPacket only player-facing beat guidance. Backend typecheck passed; focused Phase 80 suite passed 16 files / 346 tests; targeted regression suites passed 70 and 46 tests. GitNexus all-scope closeout returned HIGH around `runScenePlanner`, expected for this central turn-pipeline change and documented in `80-VERIFICATION.md`.
- Phase 79 verified complete (2026-05-03): all four plans are complete; local player turns now use model-facing scene packets, grounded runtime tool refs, whole-plan prevalidation, scene-local-by-default event persistence, isolated final NarratorPacket prompts, reason-coded grounding failures, and rollback cleanup. Focused Phase 79 backend suite passed 21 discovered files / 391 tests, and backend typecheck is green. Its planfulness gap is now addressed by Phase 80.
- Phase 77 verified complete (2026-05-03): all six plans are complete; `/game` now has a scene-first VN/RPG play shell with local `Next`/`Auto`/`Log`, route-backed `Send`/`Continue`, actor presence bands, drawers/widgets, hidden debug mechanics, browser screenshot QA across seven viewports, and deterministic 10-turn playtest evidence. Live provider prose quality remains outside this deterministic UI/play-surface gate.
- Phase 78 verified complete (2026-05-03): all six plans are complete; `/action` now follows GM-first orchestration where backend supplies neutral evidence/rulebook affordances, the GM chooses direct/no-roll, Oracle/roll, tool plan, combat transition, clarification, or Continue, and backend validates/persists only concrete legal state transitions. Full backend tests, backend typecheck, frontend tests, and frontend lint are green.
- Quick task 260501-a9z completed (2026-05-01): generated worldgen now runs a cast-driven NPC placement expansion step after NPC generation, adding/reusing concrete persistent sublocations before validation/save so dense macro casts do not collapse into one broad scene; focused worldgen tests and backend typecheck are green.
- Phase 76 Plan 76-06 completed (2026-04-30): final audit synthesis has 99 rows, integer coverage 75/75, archived-extra coverage 2/2, and a 28-row gap ledger with one backlog-routed Phase 63 verification/backfill item.
- Phase 76 Plan 76-02 completed (2026-04-30): v1-historical now has a validator-green slice with 38 JSONL-backed rows covering phases 1-36 plus archived extras `17-legacy` and `19.1`; anti-skim accounting, Phase 0 negative-search evidence, and local gap candidates are recorded for Plan 76-06 synthesis.
- Phase 76 Plan 76-04 completed (2026-04-30): active v1.1 phases 56-69 now have validator-green JSONL and Markdown audit rows; gap candidates are Phase 57 entry-path UAT, Phase 59 planning-state drift, Phase 61 live UI smoke, Phase 63 verification/backfill gate, Phase 67 live combat quality, and Phase 69 live causality quality, while Phase 68 hidden-pass deferral is superseded by Phase 69.
- Phase 76 Plan 76-05 completed (2026-04-30): recent phases 70-75 now have validator-green JSONL and Markdown audit rows; Phase 74 active provider conformance remains release-blocking, and the previous phase is classified as deterministic location-presence closure only.
- Phase 76 Plan 76-01 completed (2026-04-30): audit schema, corpus inventory, dependency-free validator, and parser fixtures now freeze integer `1-75` coverage, archived extras `17-legacy` and `19.1`, JSONL-first row parsing, Markdown key parity, evidence/disposition checks, and prior-phase overclaim detection.
- Phase 76 planned (2026-04-30): six execution plans now cover corpus inventory/validator setup, v1.0 and archived legacy phases, active phases 37-55, active phases 56-69, recent phases 70 through 75 plus the prior-phase correction, and final synthesis/gap-ledger/validation/roadmap reconciliation.
- Phase 75 verified complete (2026-04-30): all seven plans are complete; final verification proves the dense generated-world chain from scaffold, save-edits, persistence, player start, `/world.currentScene`, SceneFrame, prompt assembler, and frontend People Here; P75-R1 through P75-R8 are complete, while active provider structured-output conformance and live gameplay/UAT remain explicit follow-up gates.
- Phase 75 Plan 75-07 completed (2026-04-30): frontend API and `/game` tests prove authoritative `currentScene.clearNpcIds` drive People Here when present, same-broad sibling NPCs do not leak through broad fallback, legacy broad fallback only runs when `currentScene` is null, and final `75-VERIFICATION.md` reconciles requirements, roadmap, state, GitNexus scope, and Phase 76/gap candidates.
- Phase 75 Plan 75-06 completed (2026-04-30): SceneFrame dense sublocation tests now prove runtime rosters use stored broad/current-scene ids through `resolveScenePresence`; prompt assembly now sources `[SCENE]` NPC equipment from clear present same-scene encounter snapshots while preserving broad-only legacy fallback; focused SceneFrame/prompt assembler tests, backend typecheck, and GitNexus re-indexing are green.
- Phase 75 Plan 75-05 completed (2026-04-30): starting-location resolver candidates now carry `kind` and `parentLocationId`; save-character persists selected persistent sublocation starts as parent macro `currentLocationId` plus sublocation `currentSceneLocationId`; `/world.currentScene` dense route tests prove same-scene NPC inclusion, sibling-sublocation exclusion, and broad-only legacy compatibility; focused backend tests, backend typecheck, and GitNexus re-indexing are green.
- Phase 75 Plan 75-04 completed (2026-04-30): scaffold saver now validates duplicate location names, parent references, explicit scene references, and broad/scene consistency before destructive scaffold replacement; generated macro and persistent sublocation rows persist with parent ids and containment edges; generated NPCs persist broad `currentLocationId` plus scoped `currentSceneLocationId`; focused backend tests, backend typecheck, and GitNexus re-indexing are green.
- Phase 75 Plan 75-03 completed (2026-04-30): generated location prompts now request explicit macro and persistent sublocation rows with exact dense-location caps; NPC prompts now separate broad `locationName` from scoped `sceneLocationName`; invalid explicit scene placement fails closed instead of falling back; focused backend tests, backend typecheck, and GitNexus change detection are green.
- Phase 75 Plan 75-02 completed (2026-04-30): scaffold/save-edits/World Review contracts now carry explicit `kind`, `parentLocationName`, and `sceneLocationName`; legacy and draft-backed NPC save-edits preserve scene placement; World Review preserves hierarchy and passes full location names to NPC regeneration; backend route/schema tests, backend typecheck, frontend scoped tests, frontend lint, and GitNexus re-indexing are green.
- Phase 74 verified complete (2026-04-30): all 15 plans are complete, code review is clean, verifier passed 34/34 must-haves, full backend suite/typecheck/schema drift are green, and the matrix keeps active OpenCode role-model conformance release-blocking after the latest live rerun exceeded a 10-minute timeout.
- Phase 74 Plan 74-15 completed (2026-04-30): verification matrix and requirement traceability now cite 74-12/74-13/74-14 evidence, reconcile P74-R6 to Complete, and keep `release_ready: false` for live provider conformance.
- Phase 74 Plan 74-14 completed (2026-04-30): NPC offscreen schema validation now enforces prompt-contract caps for `npcName`, `newLocation`, `actionSummary`, and `goalProgress`; generated update batches are rejected when they exceed the listed offscreen NPC count before DB or episodic-memory writes; focused NPC offscreen tests and backend typecheck passed.
- Phase 74 Plan 74-13 completed (2026-04-30): strict power-stat rank parsing now rejects missing, non-numeric, NaN, and zero rank values before schema parse; valid ranks 1-10 including trimmed numeric strings still parse; focused known-IP/original power tests and backend typecheck passed.
- Phase 74 Plan 74-12 completed (2026-04-30): runtime tool prompt examples now respect `selectedToolNames`; `log_event`-only contracts no longer show `offer_quick_actions` valid or invalid examples; focused ScenePlanner/hidden adjudication tests and backend typecheck passed.
- Phase 74 Plan 74-11 completed (2026-04-28): conformance reports now separate primary prompt-contract success from final repaired/fallback success, default conformance cases consume the sanitized failure fixture corpus, and the final verification matrix records a release-blocking active OpenCode role-model conformance failure.
- Phase 74 Plan 74-10 completed (2026-04-28): added the Phase 74 repair-policy source of truth, wired bounded fail-closed repair text into generic and power-stat repair prompts, and created a sanitized seven-fixture malformed-output corpus with manifest provenance for Plan 74-11 conformance reuse.
- Phase 74 Plan 74-09 completed (2026-04-28): added marker-tested engine support prompt contracts for NPC offscreen updates and context-compression indexed selections, wired them before model-facing data, and guarded final-visible narration from compression-contract leakage.
- Phase 74 Plan 74-08 completed (2026-04-28): added marker-tested auxiliary worldgen prompt contracts for seed suggestion, lore extraction, starting location, premise divergence, premise refinement, and scaffold validation/fix prompts while preserving LLM semantic ownership and backend deterministic repair limits.
- Phase 74 Plan 74-07 completed (2026-04-28): added marker-tested scaffold-core, location, faction, NPC, and regeneration prompt contracts with exact shape snippets, caps, nullability, valid/minimal examples, invalid examples, and source-authority boundaries before premise/source data.
- Phase 74 Plan 74-03 completed (2026-04-28): added marker-tested P0 gameplay prompt contracts for world-brain, Oracle, target-context, and movement detection while keeping backend schemas, rolls, target hydration, and movement execution as final authority.
- Phase 74 Plan 74-06 completed (2026-04-28): added marker-tested worldbook composition, worldbook import, and backfill-personality script prompt contracts while keeping backend validators and script safeguards as final authority.
- Phase 74 Plan 74-05 completed (2026-04-28): added marker-parametrized character and power prompt contracts across player, NPC, known-IP research, original power assessment, and ingestion synthesis prompts while keeping backend validators as final authority.
- Phase 74 Plan 74-04 completed (2026-04-28): added pure worldgen research prompt-contract helpers, exported the generatedContext prompt builder for direct tests, and regression-locked citations/canonicalNames shapes, source-rule authority text, and artifact/generation contract markers before raw model payloads.
- Phase 74 Plan 74-02 completed (2026-04-28): added reusable runtime tool prompt-contract helpers, wired versioned ScenePlanner and hidden adjudication contracts before model calls, and regression-locked nested `toolName/input` shapes, quick-action caps, anti-pattern examples, and backend-owned validation boundaries.
- Phase 74 Plan 74-01 completed (2026-04-28): refreshed `74-STRUCTURED-PROMPT-AUDIT.md` into the locked source-level prompt-contract checklist and added a filesystem-only Vitest guard for concrete source rows, plan owners, versioned markers, and semantic adequacy metadata.
- Phase 74 review-replanned (2026-04-28): incorporated cross-AI review feedback into eleven execution plans. Additions cover source-level ownership for seed/lore/starting/premise/validation/npc-offscreen/compression seams, semantic prompt-contract tests beyond markers, repair policy, log-derived malformed fixtures, active role provider primary-success gating, and final conformance closeout.
- Phase 74 planned (2026-04-28): added requirements P74-R1 through P74-R6, context, research, prompt-contract audit, validation strategy, pattern map, and initial execution plans covering audit/static coverage, gameplay contracts, worldgen contracts, character/power contracts, worldbook/script seams, and conformance closeout.
- Phase 73 verified complete (2026-04-28): verifier passed 7/7 must-haves, live provider conformance passed 5/5 against the active OpenCode/deepseek-v4-flash structured role model, code review is clean, full backend suite/typecheck/schema drift are green, and GitNexus was re-indexed on the final code/review commits.
- Phase 73 Plan 73-05 completed (2026-04-27): worldgen regressions now lock overlong metadata caps, generated-context citations/canonicalNames schema safety, and artifact-backed Satoru Gojo known-IP dispatch; the final Phase 73 verification matrix and summary are recorded.
- Phase 73 Plan 73-04 completed (2026-04-27): added a non-mutating provider/model/schema conformance runner, mocked no-secret/no-mutation tests, and an opt-in live CLI gated by `WORLDFORGE_LIVE_PROVIDER_CONFORMANCE=1`.
- Phase 73 Plan 73-03 completed (2026-04-27): ScenePlan generation now uses semantic actor refs/tool intent, backend maps to strict ScenePlan with generated IDs and narrator refs, and targeted ScenePlan tests plus backend typecheck are green.
- Phase 73 Plan 73-02 completed (2026-04-27): `safeGenerateObject` now has native-first structured output, explicit fallback/repair traces, and focused AI boundary tests.
- Phase 73 Plan 73-01 completed (2026-04-27): structured-output inventory is enforced by static tests, provider/model/protocol/base-family/transport capability metadata is registered without secrets, and targeted backend tests plus typecheck are green.
- Phase 72 verified complete (2026-04-26): verifier passed 17/17 must-haves, code review is clean with 0 findings, P72-R1 through P72-R7 are accounted for, and GitNexus was current before verification.
- Phase 72 Plan 72-05 completed (2026-04-26): final verification matrix, negative scans, and GitNexus scope proof are recorded; focused/full backend verification, backend/frontend typechecks, mixed-premise proof, and staged-only docs scope proof are green.
- Phase 72 Plan 72-04 completed (2026-04-26): frontend API/wizard transport now preserves `_researchArtifact`; known-IP review identity is regression-locked; generic ingestion remains explicitly deferred with scan evidence.
- Phase 72 Plan 72-03 completed (2026-04-26): artifact-backed seed/scaffold/lore/NPC prompts are isolated from stale legacy context; Satoru Gojo routes as Jujutsu Kaisen known-IP canon while original supporting NPCs stay original.
- Phase 72 Plan 72-02 completed (2026-04-26): provider/search result `jobId`, `title`, `description`, and `url` are capped at provider ingress before prompt use; `/generate` now treats `researchArtifact: null` as omitted so stored campaign artifacts remain authoritative over stale legacy fields.
- Phase 72 Plan 72-01 completed (2026-04-26): authority inventory now maps every P72 requirement to INV-72 aliases and plan owners; shared JJK/Naruto fixture helpers now cover overlong search descriptions, prompt-injection-like snippets, canonical Gojo, and original supporting NPC expectations.
- Phase 72 planned (2026-04-26): research, validation strategy, pattern map, and five executable plans now cover artifact authority inventory, provider/schema hardening, route/frontend artifact transport, prompt/NPC dispatch invariants, and final verification scope proof.
- Phase 71 Plan 71-09 completed (2026-04-26): route handlers now keep artifact-backed worldgen requests out of legacy `ipContext`/`premiseDivergence`/`researchFrame` lanes, `/suggest-seed` accepts/passes artifacts, `/save-edits` loads stored artifacts first, and evidence-campaign SHA256 hashes stayed stable.
- Phase 71 Plan 71-08 completed (2026-04-26): focused/full backend regression, typecheck, forbidden prompt scan, GitNexus scope fallback, and evidence-campaign no-diff proof were green before verifier gap review found remaining route handoff issues.
- Phase 71 Plan 71-07 completed (2026-04-26): scaffold orchestration, validation, regeneration, lore extraction, and route save-back now consume and persist v2 research artifacts while legacy sufficiency remains gated to no-artifact compatibility.
- Phase 71 Plan 71-06 completed (2026-04-26): locations, factions, and NPC scaffold prompts now consume v2 research artifact source usage rules while legacy no-artifact canonical-IP prompt behavior remains compatibility-stable.
- Phase 71 Plan 71-05 completed (2026-04-26): seed and refined-premise prompts now consume v2 research artifact source usage rules while preserving legacy no-artifact canonical-IP snapshots.
- Phase 71 Plan 71-04 completed (2026-04-26): suggest/generate/regenerate routes now pass and persist v2 worldgen research artifacts through automatic known-IP flows without backend semantic normalization.
- Phase 71 Plan 71-03 completed (2026-04-26): automatic v2 research now starts from an LLM-authored artifact brief/source plan; backend executes capped source-specific searches and does not turn direct/certain franchise strings into canonical world truth.
- Phase 71 Plan 71-02 completed (2026-04-26): campaign config now persists optional v2 worldgen research artifacts beside legacy fields; regression tests prove legacy reads do not mutate saved configs.
- Phase 71 Plan 71-01 completed (2026-04-26): added the shared v2 worldgen research artifact contract, backend parser/formatter, mixed-premise fixture, and Wave 0 regression tests.
- Phase 68 completed (2026-04-20): world-brain scene direction now explains why a scene is happening before visible narration is written.
- Phase 69 completed (2026-04-20): storyteller hidden tool-driving is removed from the default normal player-turn path; the judge now plans hidden adjudication and backend code executes it.
- Phase 70 completed (2026-04-25): local Scene Planner of Record is now the canonical normal visible-turn bridge from scene frame and Oracle outcome to validated backend commits and narrator-only final prose.

## Accumulated Context

### Roadmap Evolution

- Phase 70 added: Reactive Scene Resolution and Canonical Event Flow, scoped to the Local Scene Planner of Record direction from `.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-WORLD-SIMULATION-DATA-FLOW-CONSENSUS.md`.
- Phase 71 added: Repair worldgen research authority boundary so LLM owns premise interpretation and backend only stores raw premise, source plan, search results, and approved/generated research artifacts.
- Phase 72 added: Worldgen authority propagation regression audit.
- Phase 73 added: Structured output stability and provider conformance.
- Phase 74 added: Structured prompt contracts and model-facing schema hardening across all structured outputs.
- Phase 75 planning originally surfaced a narrow location-presence promise audit; Phase 75 closure is deterministic generated-world location/presence only, and Phase 76 owns the exhaustive historical promise audit.
- Phase 75 planning decision: fresh implemented behavior and current requirements override stale older phase claims, but stale claims must be explicitly classified as implemented, deprecated, or follow-up work instead of left as implicit truth.
- Phase 75 planning decision: the Shibuya-style dense macro-location bug is release-blocking evidence; worldgen must feed location hierarchy and NPC presence into runtime rather than relying on a resolver that never receives scoped data.
- Phase 75 Plan 75-02 decision: scaffold hierarchy is represented only by explicit `kind`, `parentLocationName`, and `sceneLocationName` fields; backend/frontend code must not infer source, canon, or sublocation meaning from arbitrary names.
- Phase 75 Plan 75-02 decision: `locationName` remains broad/home compatibility while `sceneLocationName` carries optional current scene placement.
- Phase 75 Plan 75-02 decision: World Review NPC regeneration uses the full editable location namespace, including persistent sublocations.
- Phase 75 Plan 75-04 decision: scaffold location names and parent references are validated before clearing existing campaign scaffold rows, so invalid generated hierarchy cannot partially wipe a campaign.
- Phase 75 Plan 75-04 decision: omitted `sceneLocationName` remains legacy-compatible with broad `currentLocationId` and null `currentSceneLocationId`; explicit macro scene placement stores both ids as the macro id.
- Phase 75 Plan 75-04 decision: explicit `sceneLocationName` plus conflicting broad `locationName` fails instead of silently preferring either field.
- Phase 75 Plan 75-05 decision: selected persistent sublocation starts store player `currentLocationId` as the parent macro and `currentSceneLocationId` as the sublocation, while draft `currentLocationName` stays the exact selected stored location name.
- Phase 75 Plan 75-05 decision: `/world.currentScene` production code already consumes stored broad/scene ids through `resolveScenePresence`; dense route tests now lock same-scene inclusion and same-macro sibling exclusion.
- Phase 75 Plan 75-06 decision: SceneFrame production code stayed unchanged because focused dense-location tests prove it already consumes stored broad/current-scene ids through `resolveScenePresence`.
- Phase 75 Plan 75-06 decision: prompt scene equipment now prefers clear present same-scene actors from the encounter presence snapshot, with broad-only query fallback only when no encounter snapshot exists.
- Phase 75 Plan 75-07 decision: frontend People Here treats `/world.currentScene` as authoritative when present; broad-location fallback is legacy compatibility only for null `currentScene`.
- Phase 75 closeout decision: deterministic dense-location closure is complete, but release readiness remains false until active provider structured-output conformance and live gameplay/UAT are handled as follow-up work.
- Phase 76 added: Exhaustive historical phase promise audit and de-jure/de-facto gap closure. Corrective scope: audit the archived and active phase corpus for de jure/de facto drift, TODOs, cut corners, quick wins, unwired promises, stale claims, superseded claims, and explicit follow-up/gap candidates; no phase may be considered covered without a matrix row and evidence.
- Phase 76 Plan 76-06 decision: final synthesis treats Phase 75 as deterministic location-presence closure only; Phase 76 owns the historical promise audit correction.
- Phase 76 Plan 76-06 decision: only one material gap was backlog-routed; live/provider/play-quality rows remain UAT gates rather than implementation scope.
- Phase 77 added: Scene-first VN/RPG play surface and weekend playable UX slice. Scope is the `/game` player-facing presentation shell, `Next`/`Auto`/`Log` cadence, first-class `Continue`, drawers/widgets, hidden debug, and 10-turn playability gates from `.planning/research/worldforge-design-lab-results.md`.
- Phase 79 added: GM epistemic context and tool grounding. Corrective scope: investigate and fix why GM/tool planning saw offscreen/background locations as valid local scene targets; separate local scene truth, player-known facts, background simulation, and backend-approved tool refs.
- Phase 80 added: Forecast-led GM beat planning. Corrective scope: make GM turns planful through bounded world forecasts and per-turn beat plans before tool execution and final narration.
- Phase 81 added, reviewed, and amended: GM turn orchestration loop and settled tool execution. Corrective scope: replace the fragmented BeatPlan/Decision/ScenePlanner center with compact GM Read, conditional Action Checklist, backend-validated tool steps, settled narrator packet, and fresh-campaign playability gates. Seven plans now cover preflight/review incorporation, implementation waves, and verification closeout.
- Phase 82 added: GM dynamic scene expansion and agentic tool harness. Corrective scope: make local ephemeral sublocations and support NPCs a reliable optional GM tool, with lifecycle, current-scene placement, observations, semantic budgets, and live no-spam proof.
- Phase 83 added: WorldForge V4 full visual migration. Scope: migrate the real frontend to the approved `docs/WorldForge-v4` visual direction after gameplay scene/tool behavior stabilizes, preserving real product behavior and rejecting prototype-only fake states.
- Phase 84 added: RP prompt architecture and model-facing GM/storyteller optimization. Scope: research active RP preset prompts, Marinara/SillyTavern/Ren'Py references, and current WorldForge prompt surfaces, then rebuild compact GM/storyteller prompt contracts that improve playability without turning the GM into a backend form.
- Phase 85 added: Narrator prose quality and anti-slop style contract. Scope: research AI-slop prose failure modes plus active RP prompt solutions, then add a compact final-visible Narrator style contract that teaches concrete scene writing without bloating GM/tool prompts.
- Phase 74 Plan 74-01 decision: the prompt-contract audit is the source-level owner checklist for P0/P1 structured-output seams and explicit P2 worldbook/script/repair/conformance inclusions.
- Phase 74 Plan 74-01 decision: static audit coverage must prove plan owners, versioned markers, and semantic adequacy labels, not marker presence alone.
- Phase 74 Plan 74-02 decision: runtime tool names are sourced from `runtimeToolInputSchemas`, while curated snippets describe exact nested input shapes and caps.
- Phase 74 Plan 74-02 decision: ScenePlanner and hidden adjudication prompts request `input` as primary; `payload` is documented only as an anti-pattern/compatibility concern.
- Phase 74 Plan 74-02 decision: backend validation, ID generation, reference resolution, trimming, execution, and final authority remain in existing backend schemas and executors.
- Phase 74 Plan 74-04 decision: worldgen research contract text lives in pure `backend/src/worldgen/prompt-contracts.ts` helpers, while schemas and parsers remain backend authority.
- Phase 74 Plan 74-04 decision: `buildGeneratedContextPrompt` is a normal named pure export for direct contract reuse and tests, not a private `_test` namespace.
- Phase 74 Plan 74-04 decision: worldgen prompt contracts document shape, caps, examples, and source-rule authority; backend code does not infer canon/source roles from strings.
- Phase 74 Plan 74-05 decision: character prompt contracts are marker-parametrized in the shared helper instead of copied per caller.
- Phase 74 Plan 74-05 decision: power-stat prompt contracts live with the shared character prompt-contract helpers and validators remain the enforcement authority.
- Phase 74 Plan 74-05 decision: lazy power-stat prompts ask for exact semantic power-stat work while still forbidding backend invention of feats, tiers, source roles, or canon facts.
- Phase 74 Plan 74-06 decision: worldbook prompt contracts stay colocated in composition/import modules while validators remain final authority.
- Phase 74 Plan 74-06 decision: `backfill-personality.ts` is a supported structured-output seam with a local script contract, not a non-production exclusion.
- Phase 74 Plan 74-06 decision: `npm --prefix backend` verification uses backend package-relative Vitest filters, not repository-relative `backend/src/...` paths.
- Phase 74 Plan 74-07 decision: scaffold prompt contracts use handcrafted helper text instead of generic schema-to-contract generation.
- Phase 74 Plan 74-07 decision: location, faction, NPC, and regeneration contract blocks are inserted before `WORLD PREMISE`/source context.
- Phase 74 Plan 74-07 decision: invalid prompt examples stay source-neutral when artifact-backed leakage tests forbid excluded legacy-world structures from appearing in prompts.
- Phase 74 Plan 74-08 decision: auxiliary worldgen prompt contracts live in `prompt-contracts.ts` and are imported by source-level prompt owners.
- Phase 74 Plan 74-08 decision: auxiliary contracts are inserted before user, scaffold, source, and context data in model-facing prompts.
- Phase 74 Plan 74-08 decision: scaffold validation wraps prompts with contract text while preserving deterministic normalization and fail-closed repair matching.
- Phase 74 Plan 74-09 decision: NPC offscreen and context-compression contracts live in the shared engine prompt-contract helper file.
- Phase 74 Plan 74-09 decision: support contract text is inserted before model-facing data, while context-compression failures remain optional/fail-closed instead of rolling back user-facing turns.
- Phase 74 Plan 74-10 decision: repair may coerce syntax, shape, field names, known aliases, and caps only when the original payload already carries the same meaning.
- Phase 74 Plan 74-10 decision: repair must fail closed instead of inventing lore, actions, targets, actor intent, quick-action labels, source roles, canonical names, power facts, IDs, UUIDs, or missing-semantics array elements.
- Phase 74 Plan 74-10 decision: structured-output failure fixtures store minimal malformed objects with Phase 73/74 evidence provenance and omit raw prompts, raw provider envelopes, secrets, and campaign-private data.
- Phase 74 Plan 74-11 decision: conformance `success` remains final schema/semantic success, while `primaryPromptContractSuccess` reports primary strategy success without fallback or repair.
- Phase 74 Plan 74-11 decision: conformance reports carry sanitized fixture IDs from the Phase 74 malformed-output corpus instead of raw provider payloads.
- Phase 74 Plan 74-11 decision: active role provider conformance failures are release-blocking evidence, not auth failures or silent skips.
- Phase 74 Plan 74-12 decision: runtime tool compact and invalid examples are selected from `selectedToolNames` so filtered contracts do not demonstrate unsupported tools.
- Phase 74 Plan 74-12 decision: the quick-action missing `actions[].action` invalid example is shown only when `offer_quick_actions` is selected.
- Phase 74 Plan 74-12 decision: ScenePlanner and hidden adjudication keep caller-level minimal outputs while the runtime helper keeps nested tool input guidance and backend authority text.
- Phase 74 Plan 74-13 decision: power-stat normalization accepts only finite integer ranks from 1 through 10, including trimmed numeric strings.
- Phase 74 Plan 74-13 decision: missing or invalid required power ranks remain invalid so evidence-backed repair or fail-closed behavior owns malformed rank semantics.
- Phase 74 Plan 74-03 decision: P0 gameplay classifier contracts share the engine prompt-contract helper rather than duplicating per-prompt marker text.
- Phase 74 Plan 74-03 decision: model calls receive exact shape/cap/nullability examples, but backend validation and mechanics remain authoritative.
- Phase 74 Plan 74-03 decision: Oracle probability output is explicitly separated from backend-owned d100 rolls and outcome tier resolution.
- Phase 73 Plan 73-01 decision: capability metadata stores provider id/name, model, protocol, base URL host, transport, and capability key only; API keys, bearer tokens, headers, prompts, and raw settings are excluded.
- Phase 73 Plan 73-01 decision: reasoning-wrapped models inherit the same structured-output metadata as their base chat model without changing the public `createModel(config, options)` signature.
- Phase 73 Plan 73-01 decision: final narration, storyteller streaming, provider smoke tests, and other direct prose calls are inventoried as `unstructured_prose` or `text_fallback`, not structured output.
- Phase 73 Plan 73-03 decision: strict `scenePlanSchema` remains unchanged; semantic ScenePlan output is mapped before strict parse and validator authority.
- Phase 73 Plan 73-03 decision: semantic `actorRef` values resolve only through active actors and clear support actors; background/forbidden refs fail before execution.
- Phase 73 Plan 73-03 decision: `scenePlanLooseSchema` remains compatibility fallback only; `runScenePlanner` now uses `semanticScenePlanSchema` on the normal first pass.
- Phase 73 Plan 73-04 decision: conformance cases use representative local schemas/prompts and avoid runtime tool executor or campaign mutation imports.
- Phase 73 Plan 73-04 decision: live conformance reads existing `settings.json` directly only when `WORLDFORGE_LIVE_PROVIDER_CONFORMANCE=1`, avoiding settings manager writes.
- Phase 73 Plan 73-04 decision: conformance reports omit raw prompts and `apiKey` fields while retaining provider/model/schema/mode diagnostics.
- Phase 73 Plan 73-05 decision: observed worldgen failures are locked as regression tests without changing production worldgen behavior.
- Phase 73 Plan 73-05 decision: the missing structured-output conformance inventory row was treated as a Rule 3 blocking closeout fix.
- Phase 73 closeout decision: live structured-output conformance tests only active `judge`/`generator` role models, not provider defaults or prose/embedder roles.
- Phase 73 closeout decision: repair generation inherits caller timeout, so conformance time bounds apply to repair calls as well as primary/fallback calls.
- Phase 72 planning decision: artifact-backed frontend flows preserve and resend `_researchArtifact`; backend on-demand artifact research remains compatibility fallback, not the preferred browser boundary.
- Phase 72 planning decision: `/generate` treats `researchArtifact: null` as omitted when a stored campaign artifact exists; no clear-artifact API is introduced.
- Phase 72 planning decision: generic character ingestion is adjacency-gated and should not change unless trace evidence proves it is an artifact-backed worldgen path.
- Phase 72 planning decision: v2 artifact schema does not grow per-character source ownership unless tests prove aggregate `canonicalNames.characters` plus NPC-allowed source rules cannot satisfy Gojo/JJK behavior.
- Phase 72 Plan 72-01 decision: P72-R1 through P72-R7 are addressed by the inventory but not marked complete because 72-01 is foundation/traceability only; later invariant plans own final satisfaction.
- Phase 72 Plan 72-01 decision: GitNexus test-fixture helper symbols were not indexed, so fixture edits used rg reference fallback plus staged `gitnexus_detect_changes` scope proof.
- Phase 72 Plan 72-02 decision: provider search result strings are capped at ingress before generated-context or sufficiency prompts, keeping artifact schema semantics strict while preventing provider overflow.
- Phase 72 Plan 72-02 decision: `/generate` preserves non-null body artifact precedence but treats null body artifacts as omitted, loading stored artifacts before any legacy context lane.
- Phase 72 Plan 72-03 decision: artifact-present seed and NPC lanes null stale legacy `ipContext`/`premiseDivergence` before prompt assembly and power-stat dispatch.
- Phase 72 Plan 72-04 decision: frontend stores and resends `_researchArtifact`; backend on-demand artifact research remains compatibility fallback.
- Phase 72 Plan 72-04 decision: generic character ingestion remains deferred because scans show no artifact-backed worldgen caller reaches `ingestCharacterDraft`.
- Phase 72 Plan 72-05 decision: final closeout records automated evidence only and does not claim live subjective worldgen quality or model jailbreak immunity.
- Phase 71 Plan 71-01 decision: `WorldgenResearchUse` is a capped string instead of a backend enum; backend validates artifact shape and formatting without owning source meaning.
- Phase 71 Plan 71-02 decision: `worldgenResearchArtifact` is additive campaign config data, not a migration/replacement for legacy `ipContext` or `worldgenResearchFrame`.
- Phase 71 Plan 71-02 decision: `saveWorldgenResearchArtifact` parses/normalizes artifacts before writing, preserving mechanical caps without backend semantic interpretation.
- Phase 71 Plan 71-03 decision: `researchWorldgenArtifact` is the v2 automatic research entry point; source roles/search jobs come from LLM-authored artifacts, while `buildWorldgenResearchPlan` remains legacy-only for old single-source `IpResearchContext` flows.
- Phase 71 Plan 71-04 decision: automatic suggest/generate flows persist `worldgenResearchArtifact` first and only use legacy `IpResearchContext`/`WorldgenResearchFrame` paths when explicit or cached legacy context is present.
- Phase 71 Plan 71-05 decision: seed and refined-premise prompts use `WorldgenResearchArtifactV2` as the source authority when present and suppress legacy canonical-IP generation contracts, while no-artifact `ipContext` behavior remains snapshot-compatible.
- Phase 71 Plan 71-06 decision: scaffold entity prompts for locations, factions, and NPCs use `WorldgenResearchArtifactV2` source usage rules when present; legacy canonical lists/contracts are gated to no-artifact compatibility flow.
- Phase 71 Plan 71-07 decision: sufficiency, validation, regeneration, lore extraction, and route save-back prefer the single v2 `WorldgenResearchArtifactV2` lane whenever present; legacy research planning remains no-artifact compatibility only.
- Phase 71 Plan 71-08 decision: GitNexus `detect_changes` is unavailable in the local CLI, so closeout uses `71-PHASE-START.txt`, GitNexus impact/status/analyze, and path-limited git diffs as scope proof.
- Phase 71 Plan 71-08 decision: legacy no-artifact prompt labels now use neutral `LEGACY IP REFERENCE` / selected-source wording so production scans stay clean without adding silent repair.
- Phase 71 Plan 71-09 decision: artifact-backed route requests choose one research lane before downstream calls; v2 artifacts suppress legacy `ipContext`, `premiseDivergence`, and `researchFrame` for that request.
- Phase 71 Plan 71-09 decision: evidence campaign preservation must compare SHA256 hashes because `campaigns/` is gitignored and `git diff` is only supplemental proof.

## Blockers / Concerns

- Active OpenCode role-model conformance remains release-blocking for provider readiness; the latest live rerun exceeded a 10-minute timeout, and Phase 74 intentionally records that instead of claiming live provider stability.
- Phase 81 passed one fresh-campaign live playability gate, but broader play quality still needs more campaign starts, settings, and long-horizon UAT.
- Historical planning debt is tracked in the Phase 76 final audit and should not be confused with the now-green Phase 70 runtime path.

## Session Continuity

Resume from:

- `.planning/phases/73-structured-output-stability-and-provider-conformance/73-02-PLAN.md`
- `.planning/phases/73-structured-output-stability-and-provider-conformance/73-01-SUMMARY.md`
- `.planning/phases/73-structured-output-stability-and-provider-conformance/73-STRUCTURED-OUTPUT-INVENTORY.md`
- `.planning/phases/72-worldgen-authority-propagation-regression-audit/72-CONTEXT.md`
- `.planning/phases/72-worldgen-authority-propagation-regression-audit/72-RESEARCH.md`
- `.planning/phases/72-worldgen-authority-propagation-regression-audit/72-VALIDATION.md`
- `.planning/phases/72-worldgen-authority-propagation-regression-audit/72-PATTERNS.md`
- `.planning/phases/72-worldgen-authority-propagation-regression-audit/72-01-PLAN.md`
- `.planning/phases/72-worldgen-authority-propagation-regression-audit/72-02-PLAN.md`
- `.planning/phases/72-worldgen-authority-propagation-regression-audit/72-03-PLAN.md`
- `.planning/phases/72-worldgen-authority-propagation-regression-audit/72-04-PLAN.md`
- `.planning/phases/72-worldgen-authority-propagation-regression-audit/72-05-PLAN.md`
- `.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-01-SUMMARY.md`
- `.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-02-SUMMARY.md`
- `.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-03-SUMMARY.md`
- `.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-04-SUMMARY.md`
- `.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-05-SUMMARY.md`
- `.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-06-SUMMARY.md`
- `.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-07-SUMMARY.md`
- `.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-08-SUMMARY.md`
- `.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-SUMMARY.md`
- `.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-09-SUMMARY.md`
- `.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-VERIFICATION.md`
- `.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-08-SUMMARY.md`
- `.planning/quick/260427-rh8-integrate-phase-70-worktree-branch-into-/PLAN.md`

Completed 76-06-PLAN.md. Phase 76 is ready for verification from `.planning/phases/76-full-historical-phase-promise-audit-and-de-jure-de-facto-gap/76-VALIDATION.md`.

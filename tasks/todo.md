# 2026-05-09 GitHub Wiki System Map Todo

- [x] Inventory repository structure, package scripts, and existing architecture docs.
- [x] Read GitNexus repo context, modules, processes, and targeted flow queries.
- [x] Trace key backend/frontend files for gameplay, worldgen, storage, and API boundaries.
- [x] Capture correction in `tasks/lessons.md`: this wiki is for non-power users, not developers.
- [x] Rewrite first GitHub Wiki pass for ordinary readers.
- [x] Capture correction in `tasks/lessons.md`: user wants plain-language internals/capability map, not only a beginner guide.
- [x] Reshape wiki into capability map plus simple under-the-hood explanations.
- [x] Verify wiki links, Markdown shape, and changed-file scope.

Review:
- In progress. This is documentation-only work; no runtime symbols are being edited.
- Existing dirty files before this task: `README.md`, `README.ru.md`, and `tasks/lessons.md`.
- Correction applied: first draft was too implementation-focused; the wiki should explain the product, gameplay, setup, and troubleshooting in plain language.
- Second correction applied: include internal workings and detailed flows, but phrase them for non-power users.
- Result: `docs/github-wiki/` now contains GitHub Wiki-style pages for capabilities, world creation, turn processing, memory/hidden information, NPCs/factions/consequences, setup, character creation, play, settings, troubleshooting, and FAQ.
- Verification: local wiki links resolve; no old technical implementation pages remain in the wiki directory.

# Phase 74 Structured Prompt Contract Todo

# 2026-05-08 Phase 88 Wave 7 Final E2E Gate Todo

- [x] Run 88-11 impact/context preflight for checkpoint, restore, chat route, and final verification seams.
- [x] Write final preflight evidence inventory for Wave 1-7 artifacts.
- [x] Add deterministic Phase 88 integration tests for rollback/checkpoint residue, hidden truth, context-budget fail-closed behavior, stale proposals, actor/faction/thread evidence, and required reactions.
- [x] Add Phase 88 e2e playtest harness with deterministic/live profiles, artifact writing, route manifests, and calibrated soft review fixtures.
- [ ] Run targeted backend tests, backend typecheck, deterministic harness, live harness, judge calibration, GitNexus detect changes, commit, and re-index.
- [ ] Complete `88-VERIFICATION-MATRIX.md` and `evidence/wave-7/final-closeout.md`.

Review:
- In progress. 88-10 is committed as `cb0abc3` and GitNexus was re-indexed before starting this final gate.
- Scope correction: external character-card import from `X:\Models\Chars` is deferred out of the Phase 88 completion gate. The remaining blocker is long-distance gameplay proof that the living-world, GM/tool-loop, key NPC/faction, memory/source-boundary, rollback, combat, and latency systems work together on fresh campaigns.

# 2026-05-08 Phase 88 Wave 7 Latency Parallelism And Final Proof Todo

- [x] Run GitNexus impact/context preflight for turn processor, simulation proposal, logger, trace, context budget, and write-scope seams.
- [x] Audit runtime shortcuts: wall-clock aborts, output slicing, fake no-op success, hidden mechanic skips.
- [x] Implement/extend TurnLatencyTrace with serialized group, parallel group, retry, token, stage, actor, narrator, and proposal/cache accounting.
- [x] Implement/extend ContextBudgetTrace with hidden-truth, source coverage, full-history, source-free memory, summary-as-truth, and output-clipping guards.
- [x] Add parallel simulation runner that only parallelizes non-conflicting write scopes and serializes/rebases conflicts.
- [x] Write Wave 7 trace evidence and guard-scan artifacts.
- [x] Run 88-10 targeted tests, backend typecheck, relevant focused backend suite, GitNexus detect changes, commit, and re-index.
- [ ] Execute 88-11 final gate: deterministic integration, live harness/calibration, focused/deep artifacts, verification matrix, final closeout.

Review:
- In progress. Wave 7 is not a timeout/shortcut pass: long valid turns remain valid; traces diagnose latency/context shape without truncating model output or disabling mechanics.
- Wave 7 verification so far: focused backend suite passed 23 files / 231 tests, backend typecheck passed, `git diff --check` passed, and full backend suite passed 179 files / 2139 tests with 30 todo.

# 2026-05-07 Phase 88 Wave 6 Factions And World Threads Todo

- [x] Run GitNexus impact/context preflight for faction, simulation queue, location event, scene frame, player packet, and due-world-work seams.
- [x] Add faction command/report/resource network persistence and backend validation.
- [x] Replace faction ghost-mind proposal shape with command-node proposal routing.
- [x] Add durable world threads, staged clocks, safe diegetic surfacing, and due-world-work attachment.
- [x] Add forecast/thread invariants so advisory forecasts cannot become committed state without actor/faction/thread tool authority.
- [x] Run Wave 6 focused tests, typecheck, detect changes, evidence update, commit, and re-index.

Review:
- Wave 6 adds faction command nodes, delayed reports, resource ledgers, operations, and command-node-routed faction proposals so factions stop behaving like omniscient ghost minds.
- Wave 6 adds source-backed world threads with safe player-facing signal surfacing. Hidden cause terms are blocked from player packets, and due threads can settle before SceneFrame/NarratorPacket without becoming narrator-invented state.
- Verification so far: focused Wave 6 tests passed 3 files / 9 tests; related focused backend suite passed 10 files / 81 tests; backend typecheck passed; full backend suite passed 176 files / 2133 tests with 30 todo.
- GitNexus `detect_changes(scope=all)` flagged the expected high-risk central due-world seam; context review confirmed the affected flows match Wave 6 scope and the full backend suite is green before commit.

# 2026-05-07 Phase 88 Wave 5 Offscreen Catch-Up And Actor Knowledge Todo

- [x] Add deterministic key-actor plan executor for travel, wait, and record-event continuations.
- [x] Add due-world-work resolver for live turn boundaries: deterministic same-scope catch-up, proposal queue for non-deterministic work.
- [x] Integrate offscreen catch-up before SceneFrame and before NarratorPacket, including narrator-frame rebuild after deterministic state changes.
- [x] Add actor knowledge schema, migration, provenance routes, false-claim handling, and rollback invalidation.
- [x] Add knowledge retrieval into ActorFrame without full-history dumping.
- [x] Route reflection `set_belief` through the knowledge ledger while preserving legacy NPC beliefs.
- [x] Add memory policy tests for narration/flavor rejection and source-backed report/rumor/consequence acceptance.
- [x] Run focused backend tests, authority/snapshot regressions, backend typecheck, and GitNexus detect changes.
- [x] Stage, commit, and re-index Wave 5.

Review:
- Wave 5 makes due key-actor work visible at the live turn boundary instead of letting it mutate as hidden background backend work. Deterministic work can settle before the player sees the next frame; uncertain work becomes versioned proposals.
- Actor knowledge now has route/truth/provenance/version fields, so reports, rumors, beliefs, claims, and observations are not collapsed into omniscient truth.
- Reflection beliefs now write both the old NPC belief JSON and a source-backed knowledge row, giving later actor frames a real memory/provenance spine.
- Verification evidence lives under `.planning/phases/88-living-world-authority-spine-and-key-npc-co-player-process-simulation/evidence/wave-5/`.

# 2026-05-07 Phase 88 Wave 4A Key Actor Scheduler Todo

- [x] Run GitNexus impact/context preflight for actor process, present NPC, offscreen NPC, and ActorFrame seams.
- [x] Add durable key actor process parsing/backfill/update helpers over `actor_process_states`.
- [x] Add wake signals for due time, direct observation, exposed-scope catch-up, deadlines, interrupts, inbox, and agency debt.
- [x] Add actor write-scope conflict detection and serialization.
- [x] Add actor scheduler routing: sleeping, required-before-done, proposal-after-done, deterministic continuation.
- [x] Integrate due/proposal actor schedules into the post-turn proposal queue without reintroducing direct detached mutation.
- [x] Add scheduler/process tests for short dialogue, present actors, long waits, exposed-scope catch-up, persistent promotion, and conflicts.
- [x] Run final Wave 4A combined tests, GitNexus detect changes, commit, and re-index.

Review:
- Wave 4A establishes the missing "who wakes, why, and where does that work belong?" layer. Wave 4B/4C now adds present actor decisions/tools before narrator packet construction; combat/contested actor tools still remain for the next Wave 4 slice.
- Key NPCs are now durable process rows, persistent NPCs require explicit promotion, and temporary NPCs remain lightweight.
- Scheduler output is proposal-aware: distant/due actor work can become versioned proposals, while present actor work is identified as before-done work instead of being hidden as a detached backend tick.

# 2026-05-07 Phase 88 Wave 3 Authority Boundary Todo

- [x] Audit detached post-turn writers and classify them as proposal-after-done or auxiliary-only.
- [x] Add versioned post-turn simulation queue/proposal lifecycle for offscreen NPC, reflection, and faction work.
- [x] Move route `done` metadata to the current world clock and store undo snapshot before emitting `done`.
- [x] Remove direct detached `simulateOffscreenNpcs`, `checkAndTriggerReflections`, and `tickFactions` calls from `/chat/action`.
- [x] Preserve auxiliary embedding/image work as non-authoritative post-`done` work.
- [x] Add stale/conflict/expired proposal rejection tests and route boundary tests.
- [x] Update memory/mechanics docs for proposal-first detached simulation.
- [x] Run final GitNexus detect changes, stage, commit, and re-index.

Review:
- Wave 3 closes the immediate rollback-critical boundary hole: old detached NPC/reflection/faction writers no longer mutate state behind a delivered `done`.
- Existing world-simulation workers remain available as implementation references, but live chat routing now creates versioned proposals first. Later waves can reconnect actor/faction execution through commit validation instead of reusing hidden fire-and-forget writes.
- Verification: targeted Wave 3 tests passed 17/17, authority foundation regressions passed 8/8, route regressions passed 35/35, final combined backend run passed 8 files / 60 tests, and backend typecheck passed.

# 2026-05-07 Phase 87 Focused Rerun Harness Todo

- [x] Сузить Phase 86/87 rerun scope до диагностических профилей вместо многочасовой полной матрицы.
- [x] Добавить `phase87-smoke`: 2 кампании x 3 риск-маршрута x 1 ход.
- [x] Добавить `phase87-focused`: 2 кампании x 5 маршрутов x 3 хода.
- [x] Добавить `phase87-deep`: 3 кампании x 5 маршрутов x 5 ходов для ручного ночного прогона.
- [x] Сделать route/campaign failure ledger: один `ECONNREFUSED` теперь пишет `run-errors.jsonl` и `P86-INFRA-*`, а не валит весь выбранный прогон.
- [x] Добавить backend recovery probe после connection failure.
- [x] Привязать findings к новым turn log files, если они появились за ход.
- [x] Провести backend-as-GM audit по текущему turn pipeline.
- [x] Dry-run `phase87-focused` и `phase87-smoke`.
- [x] TypeScript check для `e2e/86-exhaustive-playtest.ts`.
- [x] Backend boundary tests: GM Read, GM tool loop, empty narration, visible narration packet guard.
- [x] Run `phase87-smoke` against live backend/frontend.
- [ ] Run `phase87-focused` if smoke is clean or only produces actionable gameplay findings.

Review:
- `e2e/86-exhaustive-playtest.ts` is ignored by git, but the local harness now supports `PHASE87_RERUN_PROFILE=phase87-smoke|phase87-focused|phase87-deep`.
- Dry evidence: `output/playwright/phase-87-rerun/dry-focused-profile` selected 2 campaigns x 5 routes x 3 turns; `output/playwright/phase-87-rerun/dry-smoke-profile` selected 2 campaigns x 3 routes x 1 turn.
- Boundary test evidence: `npm --prefix backend exec vitest run src/engine/__tests__/gm-turn-read.test.ts src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/turn-processor.empty-narration.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts` passed 4 files / 45 tests.
- Current audit read: backend may reject, repair through the model, execute accepted tools, assemble authoritative packets, and fail closed. It must not secretly change GM path or invent replacement prose. The current risky surface is prompt/model behavior plus live validation, not an intentional backend-as-GM fallback.
- Live smoke evidence: `output/playwright/phase-87-rerun/smoke-prompt-boundary-20260507-1118` completed 2 campaigns x 3 routes x 1 turn. Exploration and false-claim routes passed; combat-power findings exposed one real transport failure (`ERR_CONNECTION_RESET`) plus two harness over-claims.
- Harness correction: observation/inspection actions no longer require world hash mutation, and combat-state wording is only checked when the player actually engages, attacks, defends, retreats, or uses power. Asking who/what is dangerous is an assessment turn, not a forced combat turn.
- Harness retry correction: fetch retry now applies only to transport failures and retryable HTTP statuses (`408`, `429`, `5xx`). A `404`/contract failure is recorded immediately instead of being retried as infrastructure noise.
- Harness checkpoint correction: if backend restart drops the active campaign between campaign load and checkpoint restore, the harness reloads the same campaign once before restoring the same checkpoint.
- Storyteller transport correction: final visible narration now retries the same model/prompt once after transient provider/network errors. It still does not invent backend prose.
- Prose scoring correction: code-based prose checks are only smoke signals for empty text, leaks, formatting issues, and obvious stock phrases. Prose quality/playfeel must be reviewed by LLM or human read-through with concrete examples.

# 2026-05-06 V4 Generation Screen Fix Todo

- [x] Replace old inline forge-generation loader with a dedicated V4 generation surface.
- [x] Use real available data only: current progress event, DNA seeds, premise, selected sources, elapsed time.
- [x] Keep concept/DNA routes from duplicating footer spinner while generation is active.
- [x] Add tests and Playwright visual smoke for the generation state at 2K.

Review:
- Correction source: current generation view still rendered the old concept/DNA form with a bottom spinner, while `docs/WorldForge-v4/index.html` specifies a full `worldgen` surface with stage rail, active engine panel, progress bar, and artifact previews.
- Result: `/campaign/new` and `/campaign/new/dna` now switch to a shared V4 `GenerationWorkspace` during `isGenerating`. It shows the real progress event, current substep, elapsed time, DNA seeds or concept inputs, selected sources, stage cards, and trace text without mounting the old forge/DNA CTA footer.
- Verification: focused routed tests passed 10/10, frontend typecheck passed, frontend lint passed, and `WF_VISUAL_ONLY=campaign-new,campaign-generating npm --prefix frontend run visual:v4` passed at 2048 and 2560.

# 2026-05-05 Phase 84 RP Prompt Architecture Todo

- [x] Add Phase 84 roadmap/context placeholder for the RP prompt architecture pass.
- [x] Build an active-prompt extractor for SillyTavern preset JSON that reads only `prompt_order[].order[].enabled` prompts and ignores disabled prompt blocks.
- [x] Sample the latest non-duplicate active RP presets from `X:\Models\templates`, excluding Megumin variants and regex/script-only files.
- [x] Include the user-named corpus candidates: Stabs/GLM 5.1 directives, Freaky Frankenstein 4 MAX, Purrfect Logic, Marinara Spaghetti, NemoEngine Lite, Lucid Loom 3.3, Poppet/Puppets, and Celia 5.4.
- [x] Research Marinara Engine, SillyTavern prompt ordering, RP prompt patterns, Reddit discussions, and Ren'Py/VN dialogue pacing references.
- [x] Inventory current WorldForge GM/storyteller prompt surfaces and classify each by job: GM read, forecast/pressure, checklist/tool step, narrator packet, final narration, worldgen, character, and repair.
- [x] Run cross-AI review with available CLI/agent tools before implementation: AIT/Claude Code, Gemini, OpenCode, CloudCode-compatible references, and Cursor Agent where available.
- [x] Produce a prompt architecture spec that keeps prompts compact, role-specific, sequential where useful, and backed by deterministic backend tools/state.
- [x] Implement only after the spec is reviewed, with prompt snapshot tests, live provider checks, and Playwright play-quality gates.
- [x] Close with multi-branch Playwright playtests: at least three distinct campaigns or saved branches, different player styles, divergent choices, consistency probes, dynamic-location/support-NPC opportunities, and subjective "would I keep playing?" notes.

Review:
- Local preflight confirmed `X:\Models\templates` contains SillyTavern-style preset JSON. Active prompts must be resolved through `prompt_order[].order[].enabled`; reading raw `prompts` would mix active instructions with disabled junk.
- Recent local candidates excluding Megumin and non-prompt regex scripts include `Stabs-GLM5.1-Directives-v2.63.json`, `Freaky Frankenstein 4 MAX.json`, `FreaKy FranKIMstein - SwanSong.json`, `[🐱][🐾²] Purrfect Logic.json`, `Marinara's Spaghetti Recipe (1).json`, `NemoEngine Lite - Grand Update R3 - Claude.json`, `Lucid Loom v3.3.json`, `Poppet 1.9.2.json`, `RE (´｡• ᵕ •｡`) Celia V5.4.json`, and `🪞✧˖°. The H.T. Files - Paramnesia V.3 .°˖✧🪞.json`.
- Quick web preflight found relevant source lanes: SillyTavern prompt docs/prompt manager, Marinara Engine and Marinara LLM Hub, Ren'Py dialogue docs, and current Reddit RP prompt discussions. Full synthesis belongs in Phase 84 research, not this placeholder.
- Added closeout correction: Phase 84 must be tested like a player, not like a route smoke test. One linear successful path is not enough; final evidence must cover multiple branches and report whether the resulting play actually feels coherent, responsive, and interesting.
- Phase 84 implemented compact GM/storyteller prompt contracts and closed live verification. Focused backend suite passed 19 files / 321 tests, backend typecheck passed, and branchy Playwright live gate passed 3 branches / 6 turns with zero hard failures and average play-feel score 5/5 at `output/playwright/phase-84-rp-prompts/2026-05-05T21-59-54-057Z-post-ref-repair-branchy/`.

# 2026-05-05 Phase 82 GM Dynamic Scene Expansion Todo

- [x] Commit the accumulated Phase 79-81/runtime/play-surface tree before starting new work.
- [x] Spawn read-only agents for runtime dynamic scene/NPC mapping, visual migration mapping, and external tool-harness research.
- [x] Add Phase 82 roadmap/state entry.
- [x] Draft Phase 82 context, research, spec, patterns, validation, and five execution plans.
- [x] Run cross-AI review for Phase 82.
- [x] Incorporate review findings before implementation.
- [x] Execute 82-01 baseline RED tests and contract corrections.
- [x] Execute 82-02 anchored ephemeral sublocation lifecycle.
- [x] Execute 82-03 support NPC lifecycle and broad/current-scene placement.
- [x] Execute 82-04 tool observations, semantic budgets, and progress events.
- [x] Execute 82-05 fresh live play gate with dynamic scene/support NPC/no-spam/cleanup proof.

Review:
- Existing code already has `ephemeral_scene`, anchor/lifecycle columns, temporary NPC tier, and `reveal_location`/`spawn_npc`; the missing product work is lifecycle, correct placement, clear GM affordances, structured observations, and live proof.
- Tool harness research favors deterministic infrastructure around the model: small tools, validation, observations, progress callbacks, semantic loop budgets, context hygiene, and audit logs.
- Cross-AI review narrowed Phase 82 to anchored ephemeral sublocations and support NPCs; temporary props/items are deferred, cleanup/promotion hooks are explicit, repeated dynamic calls have a concrete per-turn key, and live no-spam is quantitative.
- Phase 82 executed and live-gated on campaign `0ed6bb3c-a528-4067-8f29-86ebdd8d0637`: support NPC spawn persisted broad/current-scene placement, `/world`, SceneFrame, NarratorPacket, and final narration now agree that `Gondolier` is visible at `Lantern-Lit Gondola Pier`. Follow-up fixes closed three live bugs: model-facing presence used sublocation id as broad id, final prompt contradicted NarratorPacket with stale `[PRESENT ACTORS]`, and successful `log_event` text was collapsed into UUID filler before visible narration.
- Live proof: 15 UI turns through Playwright, no duration caps, no stuck settling after the frontend final-refresh fix. Turn 13/14 answered the Gondolier route-marker question with `Three black bands`, `lantern hung below waist-height`, and hold-at-fork guidance. Turn 15 probed a tariff booth/alcove and correctly did not spawn a new location when the fiction did not support one; deterministic tests cover `reveal_location` creation/expiry.
- Verification: backend focused suite passed 8 files / 120 tests, backend typecheck passed, frontend game page suite passed 49 tests, frontend typecheck passed. Evidence lives under `output/playwright/phase-82-live-gate/`.

# 2026-05-05 Phase 83 WorldForge V4 Full Visual Migration Todo

- [x] Add Phase 83 roadmap placeholder and context.
- [x] Plan Phase 83 after Phase 82 closes.
- [x] Treat `docs/WorldForge-v4` as visual target and `REALITY-AUDIT.md` as product-truth guardrail.
- [x] Migrate real frontend routes fully, not as an isolated prototype copy.
- [x] Verify screenshot parity and interactions across real routes.

Review:
- Phase 83 was reworked after the 2K visual correction: home, campaign creation, DNA, library, settings, review, character, and `/game` now share the V4 rail/stage/grid/glow language while staying on real product data.
- Mock-only prototype claims were removed or avoided: fake turn/cast/time stats, fake BLEEDING/PLAYING/PAUSED 3D statuses, fake provider/statusbar strings, fake cost/latency/token counters, fake campaign covers/initials/tags, and nonexistent routes/actions.
- UX-state checks now cover delete modal cancel, draft resume through settings, guarded destructive New Campaign start, empty DNA manual recovery, and settings tab transitions.
- Verification: `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint`, `npm --prefix frontend run test -- run` (64 files / 491 tests), `npm --prefix frontend run build`, and Playwright QA in `output/playwright/phase-83-v4-rework/final-matrix/` (24 route/viewport checks + 7 interaction checks, 0 issues).
- Correction pass after 2K visual review: measured V4 values were reapplied to the real shell/home/settings surfaces instead of approximating from memory. Settings now uses the reference horizontal rail and centered 1160px content lane; provider/role/image/gameplay/research tabs use real data in V4 group/card/row structures. Current verification: `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint`, focused non-game/AppShell tests, `npm --prefix frontend run build`, and Playwright screenshots/overflow QA at 2048 and 2560 under `output/playwright/phase-83-v4-numeric-fix/routes-2048-verified/` and `output/playwright/phase-83-v4-numeric-fix/routes-2560-verified/`.

# 2026-05-03 GM Turn Architecture Todo

- [x] Treat sequential tool checklist as a hypothesis, not a user mandate.
- [x] Consult external LLM CLIs on the GM architecture split.
- [x] Synthesize reviewer disagreements into one justified target architecture.
- [x] Write the target architecture and GSD execution plan to `docs/gm-turn-architecture-review-2026-05-03.md`.
- [x] Promote the architecture into the next GSD phase/roadmap entry.
- [x] Plan execution waves with verification gates before editing turn runtime again.

Review:
- Gemini favored merging decision/planner into an agentic tool loop.
- Claude favored merging world-brain/decision, removing `plannedTools` from the decision stage, and keeping action planning conditional.
- OpenCode favored preserving safety boundaries while removing duplicated/dead surfaces.
- Chosen synthesis: one compact `GM Read`, conditional `GM Action Checklist`, small validated tool steps only for mutating/combat turns, and narration from settled truth.

# 2026-05-03 GM Loop Recovery Todo

- [x] Make live `/game` turn success the blocking acceptance gate, not artifact completion.
- [x] Remove advisory `gm-beat-plan` as a hard turn gate; keep strict validation only on executable tool/state boundaries.
- [x] Keep the model as GM: clear scene brief, path decision, optional tool requests, visible narration.
- [x] Add stage-aware waiting evidence without duration caps.
- [x] Run a fresh-campaign playtest with varied setting and 5-10 consecutive player turns.
- [x] Record exact pass/fail logs and remaining gameplay quality gaps.

Review:
- Fresh campaign `d5f5b7de-4055-4c3b-a7ca-cf1b92fc1ae2` (`Saffron Null Playtest 2026-05-03`) generated successfully: 14 locations, 11 NPCs, 5 factions, 54 lore cards, starting scene `The Fog Patrol Gate`.
- Live API playtest completed opening plus 7 player turns. Verified no Zod/schema rollback from `gm-beat-plan`; advisory BeatPlan is no longer in the live critical path.
- First SSE event for action turns now announces `phase: "gm-scene-plan"` before `runGmTurnDecision`, so UI can show GM thinking immediately without duration caps.
- Frontend narration dock now displays human stage copy such as `GM choosing path`, `Applying world changes`, and `Writing narration`.
- Playwright exposed a real abort hazard: killing a browser mid-SSE could leave active-turn lock stuck. `/opening`, `/action`, and `/retry` now clean the lock via request `AbortSignal`.
- Remaining gap: Playwright full UI submit was unstable in headless verification after aborted runs; API/live route evidence is strong, but a clean manual `/game` browser pass should still be done after dev servers are restarted fresh.

# 2026-05-03 Live Playtest Continuation Todo

- [ ] Start backend and frontend dev servers from a clean stopped state.
- [ ] Force-load campaign `0ca0dc4e-cc7e-44e3-8099-0820d3b9494b` for `/game`.
- [x] Smoke-test the real Play screen with live data and inspect logs for runtime/tool/context issues.
- [x] Fix only concrete regressions found during playtest, with GitNexus impact checks before symbol edits.
- [x] Record verification evidence and remaining gaps in this review section.

# Play Screen Visual Conversion Todo

- [x] Map the real `/game` play-surface components and data sources.
- [x] Replace the floating-island Play layout with one coherent scene-first frame.
- [x] Center the narration and input lane for wide displays without stretching controls away from the reader.
- [x] Replace duplicate/fake Play screen copy with real player, location, inventory, actor, and route context.
- [x] Keep stage overlay messages persistent until the current beat advances.
- [x] Run targeted component tests, typecheck, GitNexus change detection, and Playwright screenshots.

# Phase 79 GM Epistemic Context And Tool Grounding Todo

- [x] Inspect current GM turn logs and identify Forest Outpost leak root causes.
- [x] Add Phase 79 and Phase 80 to roadmap/state.
- [x] Capture the correction in `tasks/lessons.md`.
- [x] Draft Phase 79 context, research, and executable plans.
- [x] Run external review for Phase 79 and write `79-REVIEWS.md`.
- [x] Replan Phase 79 from review feedback.
- [x] Execute 79-01 model-facing scene view and prompt leak harness.
- [x] Execute 79-02 tool grounding and remote spawn rejection.
  - [x] Worker B: add explicit tool execution context seam for local player-turn grounding.
  - [x] Worker B: change `spawn_npc` schema/runtime contract to prefer `locationRef` and return authoritative location metadata.
  - [x] Worker B: prevalidate all ScenePlan runtime tool inputs against grounding context before first mutation.
  - [x] Worker B: add regressions for remote Forest Outpost spawn rejection and mixed-plan atomicity.
  - [x] Worker B: run targeted engine tests and GitNexus change detection.
- [x] Execute 79-03 durable event/narrator consequence isolation.
  - [x] Worker C: add RED tests for durable event discipline, result-location scene assembly filtering, and final-visible prompt isolation.
  - [x] Worker C: implement durable-only `log_event` persistence without changing unrelated tool executor behavior.
  - [x] Worker C: filter scene effects/recent context from authoritative successful local results only.
  - [x] Worker C: isolate final narration prompt from broad global memory when a NarratorPacket is available.
  - [x] Worker C: run targeted Phase 79 worker-C verification and GitNexus change detection.
- [x] Execute 79-04 turn-level guardrails and verification.
- [x] Write `79-SUMMARY.md` and `79-VERIFICATION.md`.

# Phase 80 Forecast-Led GM Beat Planning Todo

- [x] Plan Phase 80 after Phase 79 closes.
- [x] Run external review for Phase 80.
- [ ] Execute forecast/world trajectory layer.
- [ ] Execute per-turn beat planning layer before tools/narration.
- [ ] Verify GM turns cannot execute tools without an explicit beat plan.

# Phase 77 Scene-First VN/RPG Play Surface Todo

- [x] Reconcile Phase 77 visual prototype with real WorldForge flows and user corrections
- [x] Run external review round with OpenCode, Gemini, Claude, and cursor-agent
- [x] Patch Phase 77 plans/specs with accepted review findings
- [x] Write `77-REVIEWS.md` synthesis so review decisions are not lost
- [x] Execute Phase 77 plans through GSD
- [x] Verify visual QA with browser screenshots and record `77-VISUAL-QA.md`
- [x] Verify weekend playable flow and record `77-PLAYTEST.md`
- [x] Continue next unfinished GSD phases after Phase 77 closes

# Phase 78 GM-First Turn Orchestration Todo

- [x] Promote Phase 78 from candidate requirements into ROADMAP traceability
- [x] Create Phase 78 context that preserves the GM-first/backend-rulebook correction
- [x] Run GSD research and pattern mapping against the current `/action` turn flow
- [x] Generate Phase 78 executable plans with verification gates
- [x] Run first plan-check and patch blocking plan issues
- [x] Re-run plan-check after blocker fixes
- [x] Run external review with available CLIs, including `cursor-agent`
- [x] Incorporate review findings into revised Phase 78 plans
- [ ] Execute Phase 78 plans through GSD agents/waves
- [ ] Verify backend/runtime tests, frontend `/game` compatibility, and no backend semantic pre-pass regression

## Review

- 2026-05-03 live campaign `da183dd3-9e19-4ba3-ae72-c969af1ffe1d`: reproduced failed player turn from `/api/chat/action`. Root cause was not turn duration; backend rolled back because `gm-turn-decision` and `gm-beat-plan` strict schemas rejected near-miss advisory JSON from `mimo-v2.5-pro`. Added tolerant normalization for direct decision/BeatPlan shape while preserving fail-closed checks for backend-owned fields, executable payloads, unsupported tools, wrong tool posture, and private/offscreen refs. Verification: `npm --prefix backend exec vitest run src/engine/__tests__/gm-turn-decision.test.ts src/engine/__tests__/gm-beat-plan.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts` passed 3 files / 36 tests; `npm --prefix backend run typecheck` passed; live retry completed `scene-settling -> gm-scene-plan -> local-present-scene -> final-narration -> finalizing_turn -> done` with tick `1`. Remaining quality gap: generated Russian narration contained model wording artifacts (`приварам`, repeated `приятнение`), but the turn pipeline no longer rolls back.
- Phase 79 worker C: `log_event` now defaults to `scene_local`; only explicit `durable` events with `futureRelevance` persist to episodic memory, location recent events, pending committed facts, and reflection budget. Scene assembly now ignores failed tool calls, scene-local log events, remote `spawn_npc` results, and raw remote pending committed events. Final NarratorPacket narration now uses an isolated local packet path instead of broad world/chronicled/recent conversation prompt assembly. Verification: `npm --prefix backend exec vitest run src/engine/__tests__/scene-assembly.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/prompt-assembler.test.ts src/vectors/__tests__/episodic-events.test.ts` passed 13 discovered files / 290 tests; backend-scoped run passed 4 files / 99 tests. `npm --prefix backend run typecheck` is currently blocked by concurrent worker file `backend/src/engine/tool-execution-context.ts:324` (`readonly` used outside an array/tuple type). GitNexus `detect_changes({scope:"all"})` reported HIGH risk for the whole dirty concurrent Phase 79 worktree, including files outside worker C ownership.
- Output so far: Phase 77 design prototype and plans now align around a dark scene-first VN/RPG play surface, real WorldForge statuses/flows, PinchTab/browser screenshot QA, stage overlays, explicit Continue payload, and incremental drawer migration.
- Phase 77 execution complete: all six plans have summaries, `77-VISUAL-QA.md`, `77-PLAYTEST.md`, `77-VERIFICATION.md`, and seven browser screenshots. Targeted frontend tests, full frontend suite, lint, typecheck, and screenshot QA passed.
- Output now: Phase 78 is the next active GSD phase. The phase must move turn orchestration from backend-authored meaning toward GM-authored interpretation, while keeping backend as deterministic rulebook and world truth.

- [x] Route the user correction through GSD instead of another local ScenePlan patch
- [x] Add Phase 74 to the roadmap and state history
- [x] Capture the correction as a durable lesson
- [x] Inventory every model call that expects structured JSON or tool-shaped output
- [x] Compare each prompt against its Zod/schema/tool contract and mark where the model is forced to invent shape
- [x] Plan shared prompt-contract helpers, schema examples, and validation-aware repair policy
- [x] Run GSD planning/review gates before implementation
- [ ] Execute Phase 74 plans and add regressions that prove prompt/schema contracts are present before model generation and downstream strict parse

# Marinara GM Flow Reference Research Todo

- [x] Inspect Marinara Engine GM/RPG flow from the official repository
- [x] Identify how text presentation, character introduction, time-of-day, animation, and input cadence create the "visual novel solo RPG" feel
- [x] Compare those design functions against WorldForge's current play loop
- [x] Write a reusable reference-research note with concrete recommendations for WorldForge UX/game flow

# WorldForge Runtime Dramaturgy Research Todo

- [x] Define the core research questions for game feel, runtime direction, character placement, location spawning, and oracle probability
- [x] Collect external references for AI GM flow, drama managers, solo RPG play, VN presentation, and agentic NPC structures
- [x] Ask collaborator agents/CLIs for independent critique and synthesis
- [x] Compare reference patterns against WorldForge's current data/model/prompt surfaces
- [x] Write a research synthesis with design principles, proposed architecture, risks, and candidate next GSD phase

# Runtime Dramaturgy Calibration Revision Todo

- [x] Re-run OpenCode Go / Mimo review against the research artifact
- [x] Check GitNexus/code evidence for `SceneFrame`, `NarratorPacket`, `OraclePayload`, and current game UI
- [x] Cross-check latest roadmap/state/backlog evidence for Phases 66, 70, 74, 75, 76, and live gates
- [x] Add an evidence-backed calibration matrix to the research artifact
- [x] Record the rule that future GSD planning must separate structural completion, player-visible completion, and live-provider validation

## Phase 74-09 Execution

- [ ] Task 1 RED: add failing helper-contract tests for npc-offscreen and context-compression
- [ ] Task 1 GREEN: implement helper exports in `backend/src/engine/prompt-contracts.ts`
- [ ] Task 2 RED: add failing npc-offscreen prompt contract assertions
- [ ] Task 2 GREEN: insert `npc-offscreen.v1` before offscreen NPC/world data
- [ ] Task 3 RED: add failing context-compression prompt contract assertions
- [ ] Task 3 GREEN: insert `context-compression.v1` without marking final narration as structured output
- [ ] Final: run targeted verification, write `74-09-SUMMARY.md`, update GSD state, and commit metadata

## Review

- Output: Phase 74 added and planned as a systemic structured prompt-contract hardening phase, not a ScenePlanner-only patch.
- Artifacts: `74-CONTEXT.md`, `74-STRUCTURED-PROMPT-AUDIT.md`, `74-RESEARCH.md`, `74-PATTERNS.md`, `74-VALIDATION.md`, and `74-01-PLAN.md` through `74-07-PLAN.md`.
- Verification: first plan-checker pass found 4 blockers / 2 warnings; revision split the broad character/worldbook plan, resolved research questions, fixed validation mapping, and included `backfill-personality.ts`; second checker pass returned `VERIFICATION PASSED`.

# Structured Output Stability Audit Todo

- [x] Audit the current WorldForge structured-output boundary and provider setup
- [x] Cross-check the diagnosis against official structured-output/tool-use docs and Gemini CLI review
- [ ] Switch `safeGenerateObject` to native-first AI SDK structured output with compatible text fallback
- [ ] Add regressions that prove native structured output is used when available and fallback still repairs old Kimi/Mimo-style shapes
- [ ] Run targeted backend tests, backend typecheck, and GitNexus change detection
- [ ] Record the root-cause lesson so future fixes do not stop at Zod symptom patches

# ScenePlan Restore Hardening Todo

- [x] Identify why the latest `/action` log shows `success: true` judge calls followed by `outcome: restored`
- [x] Harden loose ScenePlan action parsing for missing `id/toolName` without another LLM repair loop
- [x] Log the original `/action` turn-processing exception before snapshot restore
- [x] Run targeted ScenePlan/chat route regressions and backend typecheck/full suite
- [x] Run GitNexus change detection and record final review

## Review

- Output: ScenePlan loose action parsing now tolerates missing action `id/toolName`; non-runtime actions are dropped, valid runtime tool aliases get deterministic structural UUIDs, and narrator action refs are rewritten.
- Output: `/action` now logs the original turn-processing error before restoring the pre-turn snapshot.
- Verification: targeted ScenePlan/chat tests passed 25/25; broader ScenePlan/chat tests passed 115/115; `npm run typecheck` passed; full backend `npm test` passed 135 files / 1749 tests.
- GitNexus: change detection reported low risk, 4 changed source/test files, no affected processes.

# Phase 70 Mainline Integration Todo

- [x] Record the worktree-leak lesson and recovery checklist
- [ ] Create an isolated integration branch from current `develop`
- [ ] Merge `codex/phase-70-execute` without dropping later Phase 71/72 work
- [ ] Resolve conflicts by preserving Phase 70 scene-flow code and current authority/Zod fixes
- [ ] Run targeted scene-flow tests, backend typecheck, and GitNexus change detection
- [ ] Move `develop` forward only after verified integration
- [ ] Leave `R:\Projects\WorldForge-phase70-execute` intact until integration is proven

# Structured Output Repair Todo

- [x] Reproduce the observed `citations`/`canonicalNames` Zod failure in `safeGenerateObject`
- [x] Add validation-aware repair pass before expensive full retries
- [x] Replace greedy JSON extraction with balanced parseable JSON extraction
- [x] Verify the affected backend AI/worldgen tests and typecheck
- [ ] Follow up: exclude `.claude/worktrees` from root Vitest discovery

## Review

- Output: `backend/src/ai/generate-object-safe.ts` now tries a cheap schema-aware repair pass before surfacing invalid JSON/Zod failures.
- Regression: `backend/src/ai/__tests__/generate-object-safe.test.ts` covers the Kimi/Mimo-style `citations` string plus `canonicalNames` string failure.
- Verification: from `backend/`, `npm exec vitest run src/ai/__tests__/generate-object-safe.test.ts src/worldgen/__tests__/research-artifact.test.ts src/worldgen/__tests__/ip-researcher.test.ts` passed 36 tests; `npm run typecheck` passed.
- Caveat: root-level Vitest commands still pick up `.claude/worktrees` and can report stale agent-worktree failures unrelated to this fix.

# Desloppify Code Health Todo

- [x] Install/upgrade `desloppify[full]`
- [x] Install Codex Desloppify workflow guide
- [x] Confirm `.desloppify/` is gitignored
- [x] Exclude obvious generated/vendor/local-state paths
- [x] Scan coherent TypeScript targets separately: `frontend`, `backend`, `shared`
- [ ] Run `desloppify next` against package states
- [ ] Fix queued quality issues with GitNexus impact checks before symbol edits
- [ ] Resolve fixed issues in Desloppify
- [ ] Rescan and record final strict scores

# Phase 71 Execution Todo

- [x] Task 0: initialize `$gsd-execute-phase 71` and verify preflight/GitNexus
- [ ] Task 1: begin Phase 71 execution state and record clean phase-start anchor
- [ ] Task 2: execute Wave 1 plans `71-01`, `71-02`, `71-03`
- [ ] Task 3: execute Waves 2-5 plans `71-04` through `71-07`
- [ ] Task 4: execute Wave 6 closeout plan `71-08`
- [ ] Task 5: run review/regression/schema/phase verification gates and close phase

# Phase 71 Reviews Replan Todo

- [x] Task 0: initialize `$gsd-plan-phase 71 --reviews` and validate review artifacts
- [x] Task 1: apply cross-AI review amendments to Phase 71 plans
- [x] Task 2: run plan checker and revise until verification passes
- [x] Task 3: record planning completion, commit updated plans, and refresh GitNexus
- [x] Task 4: summarize review-incorporated plan status and next command

## Phase 76 Corrective Full-Audit Todo

- [x] Capture correction: Phase 75 was location-presence scoped, not full 0-75 audit.
- [x] Add Phase 76 for exhaustive historical promise audit.
- [x] Write Phase 76 context and requirements that force every prior phase to have an evidence row.
- [ ] Plan Phase 76 with exhaustive slice coverage.
- [ ] Run cross-AI review and incorporate review feedback.
- [ ] Execute Phase 76 audit and gap ledger.
- [ ] Verify no phase number was skipped.

# Phase 77 Design Lab Todo

- [x] Task 1: install and verify Open Design on Windows with portable Node 22 and pinned pnpm
- [x] Task 2: inventory current WorldForge player-facing surfaces and classify debug-vs-play UI
- [x] Task 3: write screen-flow and visual-target contracts before further visual agent work
- [x] Task 4: wait for active Claude Opus screen-flow run without interrupting it
- [x] Task 5: run Codex 5.5 max-reasoning fallback/sidecar review without canceling Opus
- [x] Task 6: generate and synthesize scene-first VN/RPG prototype directions for the live game screen and key supporting pages
- [x] Task 7: visually inspect and refine `docs/ui_concept_hybrid.html` into an approved design direction before treating any Phase 77 plan as executable
- [x] Task 7b: revise Phase 77 GSD brief/plans only after visual approval; current Phase 77 plan is draft/frozen, not implementation authorization
- [x] Task 7c: capture GM-first orchestration correction and remove required `Act`/`Speak`/`Observe` action modes from Phase 77 planning contracts
- [ ] Task 7d: reframe next runtime architecture phase as GM-first turn orchestration with Oracle/rolls requested by GM, backend-as-rulebook invariants, and no backend semantic pre-pass
- [ ] Task 8: execute the Phase 77 plan, verify UI/prose/input improvements, and record review evidence

## Review

- Open Design is running locally at `http://127.0.0.1:5175` with daemon `http://127.0.0.1:7457`.
- The Sonnet and Opus Open Design prototypes both landed in the rejected newspaper/editorial-reader direction; keep them only as negative/topology references, not as visual targets.
- The next design direction must be refined visually from `docs/ui_concept_hybrid.html` plus Marinara-style interaction cadence: dark game surface, scene-first staging, bottom narration/input, Next/Auto/Log cadence, overlay drawers, party/map/inventory/journal widgets, dramatic visual effects, and hidden debug tools.
- Fallback/collaborator agents must use `.planning/research/worldforge-design-agent-brief.md` as their compact mission brief.
- Opus produced `R:\Projects\open-design\.od\projects\worldforge-screen-flow-opus-1777656631094\worldforge-screen-flow-v2.html`; keep its topology/state coverage, but do not copy its warm paper visual palette.
- Codex 5.5 xhigh review and Opus artifact are synthesized in `.planning/research/worldforge-design-lab-results.md`.
- Correction: Phase 77 planning was started too early. The visual direction is now inspected/refined in `docs/WorldForge-v4/index.html`, verified by `docs/WorldForge-v4/_shots/night2-*.png`, and Phase 77 planning contracts have been revised against that approved prototype direction.
- Correction: Phase 77 must not introduce `Act`/`Speak`/`Observe` as required input modes. Player input is raw scene text plus `Continue`; backend `intent`/`method` fields are legacy transport compatibility until the GM-first orchestration phase replaces backend semantic prework.
- Correction: GM-first is not LLM-trusted. Backend remains the rulebook/world truth for deterministic state and invariants; LLM can interpret and propose, but backend validates, applies, rejects, or rolls back.

## Review

- Output: Phase 71 plans and `71-VALIDATION.md` updated from `71-REVIEWS.md`.
- Verification: `gsd-plan-checker` passed with 0 blockers / 0 warnings after one targeted revision to `71-08` closeout verification.
- Commit: `eadef22 docs(71): incorporate review feedback into plans`.
- GitNexus: re-analyzed and up to date at `eadef22`.

# Phase 70 Planning Todo

- [x] Task 0: promote Phase 70 consensus and handoff into canonical GSD context
- [x] Task 1: run GSD research for Phase 70 against roadmap, context, and live runtime
- [x] Task 2: map existing runtime patterns that the plan should reuse
- [x] Task 3: generate executable Phase 70 implementation plans
- [x] Task 4: run plan checker and revise until verification passes
- [x] Task 5: verify planning artifacts and record review notes

# Phase 70 Research Todo

- [x] Task 1: audit current post-69 player-turn data flow with GitNexus and source reads
- [x] Task 2: gather external architecture references for simulation boundaries, LLM agents, and narrative causality
- [x] Task 3: run Claude CLI review against the Phase 70 handoff and live runtime architecture
- [x] Task 4: run Gemini CLI review against the Phase 70 handoff and live runtime architecture
- [x] Task 5: synthesize a maintainable engine-vs-LLM responsibility map
- [x] Task 6: write the consensus design document for World Simulation Data Flow and Minimal Runtime Authority
- [x] Task 7: verify the document against current code paths, reviewer critiques, and source citations

## Review

- Output: `.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-WORLD-SIMULATION-DATA-FLOW-CONSENSUS.md`
- Consensus: keep Oracle separate for Phase 70A; replace `WorldBrainSceneDirection + HiddenAdjudicationPlan + tickPresentNpcs` on the visible-turn critical path with one Scene Planner of Record.
- Verification: GitNexus status was up to date on commit `9e3cb4b`; Claude CLI and Gemini CLI both reviewed Phase 70 docs plus runtime files; document sections and key decisions were checked after write.
- Planning output: 8 PLAN files written under `.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/`.
- Planning verification: `frontmatter validate --schema plan` and `verify plan-structure` passed for all 8 plans; P70-R1..P70-R8 all appear in plan frontmatter; each task has `read_first`, `action`, `verify`, `acceptance_criteria`, and `done`.

# Phase 60 Todo

- [x] Task 0 docs housekeeping: requirements, roadmap, validation, and Phase 60 tracking
- [ ] Task 1 wave 1 foundation: ingestion scaffold, shared types, error class, retry helper
- [ ] Task 2 wave 1 extractor: V2/free-text source extraction, fixtures, unit tests
- [ ] Task 3 wave 1 classifier: canonical status logic, override schema plumbing, unit tests
- [ ] Task 4 wave 2 synthesizer: generator export promotion, priority-merge synthesis, mocked tests
- [ ] Task 5 wave 3 power assessment: known-IP export promotion, original assessor, dispatcher, tests
- [ ] Task 6 wave 4 orchestration: pipeline entry, route refactor, legacy deletion, integration tests
- [ ] Task 7 verification and docs: required test matrix, GitNexus change detection, phase summaries

# WorldForge-v4 Visual QA Todo

- [x] Night pass: align `docs/WorldForge-v4/index.html` with the real product flows from the latest user screenshots and notes.
- [x] Night pass: rework Play so the VN dock is a centered reading/action lane, with persistent scene signals, no `Speak`, no chunk counter, and useful side information instead of black void.
- [x] Night pass: remove invented campaign lifecycle/status/filter language and duplicate resume/home actions.
- [x] Night pass: reshape Worldgen/Review/Character surfaces around real data volume, reroll controls, actual 10-step generation, NPC import in review, and separate player creation.
- [x] Night pass: verify the refined HTML with Playwright screenshots at 1920 and 2560 widths before feeding it into GSD.
- [x] Capture baseline Playwright screenshots for Play, Home, Campaigns/New Campaign, Worldgen, Review, Import, Worldbook, Settings.
- [x] Replace empty Play stage with directed scene background, actor blocking, and prop silhouettes.
- [x] Reduce Play stage quote behavior so normal dialogue stays in the VN dock.
- [x] Tighten Home/Campaigns layout so cards do not crowd or overflow beside the rail.
- [x] Re-run Playwright screenshots at 1920, 2560, and 1366 widths.
- [x] Audit WorldForge-v4 visible controls against real frontend/backend contracts.
- [x] Remove or relabel speculative controls that are not implemented product behavior.
- [x] Record a reality matrix for future design passes.
- [x] Re-run Playwright screenshots after the reality-alignment pass.
- [x] Capture follow-up reality corrections from visual review: Play side widgets, centered VN dock, no chunk counter/Speak button, no invented campaign statuses, real ten-step generation, real NPC import/player-character flows, and character detail drill-in.
- [x] Fix worldgen scaffold relationship dedupe so duplicate generated membership/territory pairs do not crash campaign generation.
- [x] Re-run targeted scaffold-saver regression and relevant typecheck after the dedupe fix.

## Review

- `docs/WorldForge-v4/index.html` now has a directed Play stage layer with background architecture, actor blocking, prop silhouette, and debug-only gallery.
- Normal dialogue remains in the VN dock; stage text is reduced to a small signal strip for rare supernatural beats.
- Home campaign cards have a more stable responsive grid at 1920/2560 and a less broken 1366 fallback.
- Verification screenshots: `output/playwright/worldforge-v4-final/`.
- Reality audit: visible prototype controls were checked against current campaign creation, DNA, settings, character import, library, and shared type contracts.
- Night pass follow-up: `docs/WorldForge-v4/_shots/night2-*.png` verifies Play, Home, Campaigns, Worldgen, Review, Settings, and Player Character at 2560 and the key surfaces at 1920.
- Removed or corrected speculative controls: campaign `Tone` chips, `Player seat`, import `Flashback voice/Ghost`, fake confidence/tokens, and missing provider management.
- Removed duplicate Home shell/status chrome: page-level `Home`, top model strip, and rail provider status.
- Reality matrix: `docs/WorldForge-v4/REALITY-AUDIT.md`.
- Verification screenshots: `output/playwright/worldforge-v4-reality-audit/`.
- Wide-screen refinement: Settings local navigation is now a horizontal subnav, not a second vertical app menu beside the global rail.
- Wide-screen refinement: Settings, Play, and Worldgen use centered readable lanes at 1920/2560 widths instead of stretching meaning to the edges.
- Worldgen refinement: the `Stages` process rail is now an integrated horizontal forge-run strip instead of a third vertical sidebar between app nav and content.
- Play refinement: the stage background now reads as scene/actor/signal space, with persistent signal text until `Next`, rather than a hard empty rectangle above the VN dock.
- Verification screenshots for this pass: `output/playwright/worldforge-v4-reality-audit/settings-2560-wide-pass.png`, `output/playwright/worldforge-v4-reality-audit/play-2560-safearea-pass.png`, `output/playwright/worldforge-v4-reality-audit/worldgen-2560-stages-pass.png`.
- Follow-up visual reality notes are recorded in `.planning/research/worldforge-visual-target-contract.md`, `.planning/research/worldforge-screen-flow-contract.md`, and `docs/WorldForge-v4/REALITY-AUDIT.md`.

# GM Data Flow + Planning Autonomy Todo

- [x] Inspect current GSD roadmap/state and confirm next phase numbers.
- [x] Add Phase 79 for GM epistemic context, local/offscreen boundaries, and tool grounding.
- [x] Add Phase 80 for GM forecast + turn beat planning before execution/narration.
- [x] Plan Phase 79 with codebase research and external review inputs.
- [x] Replan Phase 79 from review feedback.
- [x] Execute Phase 79 and verify the Forest Outpost-style leak cannot recur.
- [x] Plan Phase 80 with codebase research and external review inputs.
- [x] Replan Phase 80 from review feedback.
- [ ] Execute Phase 80 and verify GM turns have a forecast/beat-plan before tools/narration.
- [ ] Write review summary with remaining gaps and next phase candidates if needed.

# Phase 57-07 Todo

- [x] Task 1 RED: add failing deterministic imported-tag cleanup tests
- [x] Task 1 GREEN: tighten `normalizeImportedTags` compact cleanup
- [x] Task 1 verify and commit
- [x] Task 2 RED: add failing player/NPC mapper tag-cap tests
- [x] Task 2 GREEN: apply compact import tag caps to player/NPC card mappers
- [x] Task 2 verify and commit
- [x] Create `57-07-SUMMARY.md`, update planning state, and commit docs

# Phase 43-03 Todo

- [x] Task 1 RED: add failing tests for authoritative `location_recent_events` write-through and anchored ephemeral spillover
- [x] Task 1 GREEN: implement `backend/src/engine/location-events.ts` and initial writer integration
- [x] Task 1 verify and commit
- [x] Task 2 RED: extend failing coverage for remaining runtime writers and checkpoint restore persistence
- [x] Task 2 GREEN: wire remaining writers through the shared location-history seam
- [x] Task 2 verify and commit
- [x] Create `43-03-SUMMARY.md`, update planning state, and commit docs

# Phase 38-02 Todo

- [x] Task 1 RED: add failing tests for authoritative `transfer_item` schema/runtime reachability and `spawn_item` defaults
- [x] Task 1 GREEN: implement authoritative item-row mutation semantics and live storyteller reachability
- [x] Task 1 verify and commit
- [x] Task 2 RED: add failing tests for prompt/world/compatibility authoritative reads
- [x] Task 2 GREEN: rewire prompt assembly, world payloads, and adapters to authoritative item rows
- [x] Task 2 verify and commit
- [x] Task 3 verify full convergence, write `38-02-SUMMARY.md`, update planning state, and commit docs

## Review

- `38-02` complete: backend writer and reader seams now share authoritative item-row carry/equip state through `transfer_item`, prompt assembly, `/world`, and transitional compatibility projections.
- Verification: `npm --prefix backend exec vitest run src/engine/__tests__/tool-schemas.inventory-authority.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/turn-processor.inventory-authority.test.ts src/character/__tests__/record-adapters.test.ts src/engine/__tests__/prompt-assembler.inventory-authority.test.ts src/routes/__tests__/campaigns.inventory-authority.test.ts`
- Commits: `7333e9e`, `66e6168`, `998825f`, `7db10ae`, `1776be2`

## Review

- `43-03` complete: location-local recent happenings now persist through one authoritative SQLite seam, with episodic traceability and anchored spillover for archived ephemeral scenes.
- Verification: `npm --prefix backend exec vitest run src/vectors/__tests__/episodic-events.test.ts src/engine/__tests__/tool-executor.test.ts src/campaign/__tests__/checkpoints.test.ts` and `npm --prefix backend exec vitest run src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/npc-offscreen.test.ts src/engine/__tests__/world-engine.test.ts src/campaign/__tests__/checkpoints.test.ts`
- Commits: `9afe672`, `8eb5ab4`, `e9dde66`, `c50badb`

# Phase 37-01 Todo

- [x] Task 1 RED: add failing tests for explicit `campaignId` validation on targeted gameplay routes
- [x] Task 1 GREEN: implement schemas and route validation for `history`, `action`, `retry`, `undo`, and `edit`
- [x] Task 1 verify and commit
- [x] Task 2 RED: add failing tests for loaded-campaign resolution and campaign-scoped snapshots
- [x] Task 2 GREEN: resolve targeted routes through `requireLoadedCampaign()` and key snapshots by `campaignId`
- [x] Task 2 verify and commit
- [ ] Create `37-01-SUMMARY.md`, update planning state, and commit docs

## Review

- `37-01` complete: backend gameplay transport is now campaign-addressed for history/action/retry/undo/edit.
- Verification: `npm --prefix backend exec vitest run "src/routes/__tests__/chat.test.ts"`
- Commits: `17f2a7b`, `1dbf38a`, `04d34ce`, `17a5b69`

# Phase 48-03 Todo

- [ ] Task 1 RED: add failing runtime identity tests for prompt assembly, NPC planning, and bounded off-screen identity slices
- [ ] Task 1 GREEN: rewire prompt/NPC/off-screen consumers to read richer identity truth first
- [ ] Task 1 verify and commit
- [ ] Task 2 RED: add failing reflection-boundary tests for live dynamics vs earned promotion
- [ ] Task 2 GREEN: enforce reflection writes to live dynamics first with guarded deeper promotion
- [ ] Task 2 verify and commit
- [ ] Create `48-03-SUMMARY.md`, update planning state, and commit docs

# Phase 56 Todo

- [x] Remove provider/model fallback config and runtime failover usage from gameplay/worldgen/settings
- [x] Remove synthetic worldgen grounding fallback and make inspector/rendering honest about absent grounding
- [x] Remove server-side surrogate gameplay content fallbacks that invent quick actions or substitute researched truth
- [x] Verify shared/backend/frontend fallout and update phase/milestone docs

# Phase 82 Corrective GSD Todo

- [x] Record the Phase 82 verification gap as `82-06-AGENTIC-TOOL-CALL-REMEDIATION.md`.
- [x] Replace the active player-turn checklist/tool-step runtime path with `runGmToolLoop`.
- [x] Filter AI SDK runtime tools to `SceneFrame.allowedTools`.
- [x] Serialize backend tool execution within one runtime tool set.
- [x] Add focused GM tool-loop tests for allowed tools, no-call failure, and failed-observation failure.
- [x] Update turn-processor/scene-plan tests so old checklist execution cannot satisfy Phase 82.
- [x] Run backend typecheck and focused engine tests.
- [x] Run GitNexus change detection before any commit.
- [x] Commit the verified corrective Phase 82 work.

# Phase 82-07 Spawn Grounding Follow-Up Todo

- [x] Analyze live gate gap: GM implied a back-room micro-location through `spawn_npc`/`log_event` instead of first making the location authoritative.
- [x] Re-enable `spawn_item` as a default player-turn GM tool instead of hiding misuse by allowlist removal.
- [x] Teach GM runtime loop reveal/move/spawn order for local sublocations and tangible item creation.
- [x] Extend runtime tool-loop observations so successful `reveal_location`, `move_to`, `spawn_npc`, and `spawn_item` update legal refs for later calls in the same loop.
- [x] Add semantic budget protection for repeated equivalent `spawn_item` creation.
- [x] Align `spawn_item` location-owner execution with observed refs by resolving location targets by name or id.
- [x] Add regression tests for runtime-observed sublocation refs, controlled item spawning, and hidden/remote item owner rejection.
- [x] Run backend typecheck and focused engine tests.

# Phase 82-08 Closure Gap Register Todo

- [x] Reopen Phase 82 closure truth instead of treating the previous PASS as sufficient.
- [x] Fix world forecast builder live-like draft output without weakening the final strict forecast schema.
- [x] Ground current scene/location display labels as legal local tool refs while keeping remote labels illegal.
- [x] Restore `/game` from authoritative history/world when an accepted action stream errors after narration.
- [x] Remove rollback-critical finalization duration ceilings; long legitimate model work must not fail by clock.
- [x] Surface `finalizing_turn` stage data in the player-facing loader.
- [x] Run the combined backend/frontend deterministic focus suites after this gap register.
- [x] Run fresh live Phase 82 gate for dynamic sublocation, item spawn, support NPC, forecast, finalization, and rollback-sync behavior.
- [x] Run branchy play-feel checks instead of one happy path before marking Phase 82 closed.
- [x] Run GitNexus change detection, reconcile Phase 82 verification/state docs, and commit the verified closure.

Review:
- Closure correction moved from symptom guards to GM intent: unsupported player claims about keys, permits, passes, credentials, authority, or route proof are now framed as claims/bluffs/visible attempts, not Oracle-backed existence checks.
- Oracle remains available for social/visible uncertainty, but cannot create or confirm missing inventory, credentials, authority, access routes, or world facts.
- Live false-claim branch now keeps the locked door shut without spawning a master key, office, access tag, or movement.
- Live exploration branch proves dynamic sublocation creation still works when fiction supports it: `Salt-Brick Service Passage` was created as an anchored expiring `ephemeral_scene`.
- Branchy live proof: `output/playwright/phase-82-closure-live-2026-05-05T12-03-56/root-cause-clean-live-current2/full-branchy-rerun` passed 3 branches / 6 turns with zero hard failures and zero gate invariant failures.
- GitNexus `detect_changes(scope: all)` reported `critical` because this touches the central turn pipeline and `/game` stream surface: 44 changed symbols, 37 changed files, 50 affected processes. Follow-up impact checks found `runGmRead`, `runGmActionChecklist`, `runGmToolLoop`, and `GamePage` low upstream risk in the index; `parseTurnSSE` is high risk because it directly feeds `submitAction`, `submitLookup`, `handleRetry`, `handleContinueAction`, and `handleMove`. The focused frontend stream tests and live branchy gate cover that blast radius.

# Phase 83-84 Autonomous Todo

- [x] Gather roadmap/context and close Phase 82 tree baseline.
- [x] Collect Phase 83 UI/frontend map from subagents.
- [x] Collect Phase 84 prompt inventory from subagent.
- [x] Write Phase 83 UI spec and execution plans.
- [x] Write Phase 84 execution plans.
- [x] Phase 83 implement V4 tokens, shell, launcher, non-game surfaces, and `/game` polish.
- [x] Phase 83 run focused tests, responsive screenshots, and UX/UI QA.
- [x] Phase 83 write verification and commit.
- [x] Phase 83 corrective V4 pass: home uses real scene state, forge CTA is form-column sticky, sidebar/buttons/glow/stat pins moved closer to reference.
- [x] Phase 83 corrective verification: unit assertions for scene-aware home and forge CTA placement plus `visual:v4` 2048/2560 Playwright gate/screenshots.
- [x] Phase 84 extract active RP preset corpus and research prompt/tool-call references.
- [x] Phase 84 implement compact role-specific prompt contracts.
- [x] Phase 84 run deterministic prompt suites and branchy playtests.
- [x] Phase 84 write verification and commit.

# Phase 86 Overnight Exhaustive Playtest Todo

- [x] Gather GSD context, latest roadmap state, and prior branchy playtest evidence.
- [x] Collect agent research for campaign matrix, existing harnesses, character/source candidates, and fake-coverage risks.
- [x] Add Phase 86 and Phase 87 to roadmap/state.
- [x] Write Phase 86 context, research, validation, review, matrix, plan, and findings ledger scaffolds.
- [x] Implement Phase 86 manifest-driven playtest harness.
- [x] Run pilot mode and verify artifacts are complete.
- [ ] Prepare four campaign baselines with MIMO Pro 2.5 role-model preflight.
- [ ] Execute route matrix and collect per-turn evidence. Partial run: `output/playwright/phase-86-overnight/full-20260506-234351/` exited code 1 after 228 turns due backend `ECONNREFUSED`.
- [ ] Triage findings and generate Phase 87 burn-down plan.
- [x] Execute Phase 87 87-01 accepted findings ledger and focused rerun controls.
- [x] Execute Phase 87 87-02 empty assistant-text backend/frontend fail-closed fix.
- [x] Execute Phase 87 87-03 state-bearing tool truth for mutation-heavy scene pressure.
- [x] Execute Phase 87 87-04 recent-context referent handling and invalid calibration fixture classification.
- [x] Execute Phase 87 87-05 combat route adjudication and deterministic session language contract.
- [ ] Execute Phase 87 fixes and final rerun after findings are accepted.

Monitor 2026-05-07 00:27 MSK:
- Background run still active under PID `79464`.
- Evidence recorded so far: `river-intrigue/tourist-observer` completed 20 turns; `river-intrigue/social-pressure` is in progress with more than 10 turns recorded.
- Preliminary hard findings were added to `86-FINDINGS.md`: persisted-state gaps for concrete scene pressure, one empty assistant-text turn, and recurring visible overflow candidates.
- `summary.json` is not written yet; `findings.json` is currently empty, so final Phase 87 triage waits for the harness closeout unless the live run hard-stops.

Monitor 2026-05-07 01:07 MSK:
- Background run still active under PID `79464`; `summary.json` still absent and `findings.json` still empty.
- Evidence recorded so far: `river-intrigue/tourist-observer` 20/20, `river-intrigue/social-pressure` 20/20, `river-intrigue/exploration-location-graph` at least 18 turns recorded and progressing.
- `86-FINDINGS.md` expanded with exploration-route defects: route/sublocation references sometimes turn into out-of-character clarification prompts, empty assistant text recurred on exploration turn 18, and mutation-heavy route/threshold descriptions still often do not persist state.

Monitor 2026-05-07 01:42 MSK:
- Background run still active under PID `79464`; `summary.json` still absent and `findings.json` still empty.
- Evidence recorded so far: `river-intrigue/tourist-observer` 20/20, `river-intrigue/social-pressure` 20/20, `river-intrigue/exploration-location-graph` 20/20, `river-intrigue/false-claim-boundary` at least 18 turns recorded and progressing.
- Added `P86-OK-001` preservation note: the false-claim boundary currently rejects unsupported keys/permits/access without spawning free authority, so Phase 87 must preserve that while fixing route/state/narration defects.

Monitor 2026-05-07 02:16 MSK:
- Background run still active under PID `79464`; `summary.json` still absent and `findings.json` still empty.
- First campaign block completed all five routes at 20/20: tourist, social, exploration, false-claim, and combat. `urban-occult-crossover` has started.
- `86-FINDINGS.md` expanded with `P86-F005`: combat/power testing often stays in liminal social tension, asks out-of-character specificity, lacks concrete combat-state language, and hit another empty assistant-text turn on combat turn 19.
- `P86-OK-001` updated to false-claim turns 1-20; no false key/pass/authority spawn observed in that route.

Monitor 2026-05-07 02:50 MSK:
- Background run still active under PID `79464`; `summary.json` still absent and `findings.json` still empty.
- Evidence recorded so far: `urban-occult-crossover/tourist-observer` completed 20/20 and `urban-occult-crossover/social-pressure` reached turn 4+.
- `86-FINDINGS.md` expanded with urban-route coverage: `P86-F001` now includes urban tourist turns 6/16/20 no-persist mutation-heavy failures, `P86-F002` now includes urban social turn 3 empty assistant text, and `P86-F004` now includes an urban context-drop turn where the GM said the player was alone after a nearby NPC conversation.
- Added `P86-F006`: urban narration sometimes switches into Russian despite English route actions and English campaign/test inputs; JSON confirms Cyrillic assistant text, so this is a real language-contract defect, not terminal mojibake.

Monitor 2026-05-07 03:29 MSK:
- Background run still active under PID `79464`; `summary.json` still absent and `findings.json` still empty.
- Evidence recorded so far: `urban-occult-crossover/social-pressure` and `urban-occult-crossover/exploration-location-graph` completed 20/20; `urban-occult-crossover/false-claim-boundary` started.
- `86-FINDINGS.md` expanded again: `P86-F001` now includes urban social turn 20 and urban exploration turns 1/2/4/9/12/16 no-persist mutation-heavy failures; `P86-F002` now includes urban exploration turns 4/16/18/19 empty narration; `P86-F004` now tracks repeated urban context drops around absent counterparties, ambiguous route refs, forgotten objectives, and tool/environment-target clarification.
- `P86-F006` now covers urban exploration turns 1-3 as additional Cyrillic narration output in an English route.

Monitor 2026-05-07 03:50 MSK:
- Automation heartbeat was deleted because it was only pinging this thread; the actual background playtest process was not stopped. PID `79464` is still alive.
- Evidence recorded so far: `urban-occult-crossover/false-claim-boundary` reached turn 14+; root `summary.json` and `exit-code.txt` are still absent, and `findings.json` is still empty.
- `86-FINDINGS.md` expanded with urban false-claim defects: `P86-F002` now includes turns 2 and 7 empty narration; `P86-F004` now includes turns 5/13/14 context drops; `P86-F006` now includes turns 1/3/4/6/9/11/12 Cyrillic narration.
- Important preservation note: the route still often preserves the access-claim boundary instead of granting a free pass/key/authority, so Phase 87 should fix narration/context/language without weakening false-claim rejection.

Monitor 2026-05-07 04:01 MSK:
- Background run still active under PID `79464`; this is the worker process, not the deleted heartbeat automation.
- Evidence recorded so far: `urban-occult-crossover/false-claim-boundary` completed 20/20 and `urban-occult-crossover/combat-power` has started. Current artifact coverage is 9 completed routes plus 1 active combat route, 200/400 planned turn rows.
- Root `summary.json` and `exit-code.txt` are still absent, and root `findings.json` is still the empty `[]` file, so Phase 86 remains open.
- Agent root-cause audit was added to `86-FINDINGS.md`: likely seams are empty SSE acceptance, no-mutation narration pressure, GM Read missing recent conversation before clarification, and missing deterministic language contract.
- Phase 87 plan set was drafted with agents under `.planning/phases/87-playtest-defect-burn-down-and-final-rerun/`: 87-01 accepted findings/rerun controls, 87-02 empty narration, 87-03 state-bearing pressure, 87-04 recent context, 87-05 combat/language, 87-06 overflow/final rerun.

Phase 87 87-01 complete:
- Added `87-ACCEPTED-FINDINGS.md` and `87-FINDING-RERUN-MATRIX.md`.
- Added additive harness controls to `e2e/86-exhaustive-playtest.ts`: `PHASE87_FINDING_FILTER`, `PHASE87_ASSERT_FIXED`, manifest trace, and fixed-finding assertion labels.
- Verification passed for required finding IDs and dry-run `P86-F002` selection using `npm --prefix backend exec tsx -- e2e/86-exhaustive-playtest.ts`.

Monitor 2026-05-07 04:24 MSK:
- Confirmed the actual overnight worker is still running under PID `79464`; only the heartbeat/thread monitor was deleted earlier, not the Playwright worker.
- Current artifact coverage: all five `river-intrigue` routes complete, four `urban-occult-crossover` routes complete, and `urban-occult-crossover/combat-power` is at 18/20.
- `summary.json` and `exit-code.txt` are still absent; root `findings.json` remains empty, so continue Phase 86 monitoring while Phase 87 fixes proceed from accepted current findings.

Monitor 2026-05-07 04:28 MSK:
- `urban-occult-crossover/combat-power` completed 20/20; `drowned-observatory/tourist-observer` started.
- `drowned-observatory/tourist-observer` turns 1-3 all recorded `assistantText: ""` and `hardFailures: ["empty assistant text"]`; turn 3 also exposed a `narrative network error self` stage.
- Added this as stronger `P86-F002` evidence while Phase 87 87-02 backend/frontend workers are active.

Phase 87 87-02 complete:
- Backend now asserts non-empty final visible narration before assistant append, tick advance, finalizing, `done`, or post-turn hooks in both scene-plan and legacy paths.
- Frontend `parseTurnSSE` now treats `finalizing_turn` followed by `done` without non-blank `narrative` as a recoverable error instead of successful empty completion; lookup-only streams remain valid.
- Verification passed: backend focused 7 tests, frontend API 36 tests, backend typecheck, frontend typecheck, and targeted `git diff --check`.
- `P86-F002` remains focused-rerun pending until Phase 87 live rerun evidence lands.

Monitor 2026-05-07 05:09 MSK:
- The actual Phase 86 worker PID `79464` exited on its own with `exit-code.txt = 1`; it was not killed by heartbeat cleanup.
- Failure mode: backend fetches began returning `ECONNREFUSED` during `drowned-observatory/social-pressure` turn 9 after five retries in `e2e/86-exhaustive-playtest.ts`.
- Artifact coverage before stop: 228 turn rows across `river-intrigue`, `urban-occult-crossover`, and `drowned-observatory`; 11 routes completed 20/20 and one route stopped at 8/20.
- Aggregates from `turns.jsonl`: 47 hard-failure turns, 228 soft-failure turns, 23 empty-assistant turns; hard failure types are `mutation-heavy route turn produced no detectable world hash change` (27) and `empty assistant text` (23).

Phase 87 87-03 complete:
- Added a shared future-relevant pressure detector and applied it at GM Read and GM tool-loop boundaries.
- GM Read now repairs or fails no-mutation paths that try to carry future-relevant concrete pressure; low-stakes sensory/direct responses remain valid.
- Narrator/tool truth remains tied to successful backend observations; failed or scene-local tool results do not become durable action effects.
- Verification passed: backend GM Read/tool-loop/narrator/tool-context suite (46 tests), turn-processor empty-narration suite (7 tests), backend typecheck, and targeted diff-check.
- `P86-F001` remains focused-rerun pending until Phase 87 live rerun evidence proves the new boundary under real MIMO turns.
- Correction 2026-05-07: removed backend auto-promotion of invalid no-mutation GM Read into `tool_plan`; path switching is now a GM/repair prompt responsibility, and backend fails closed if repair keeps the illegal path. Verified with focused GM Read suite (19 tests) and backend typecheck.

Phase 87 87-04 complete:
- Classified `P86-CAL-001` as invalid fixture data: failed calibration campaigns `cffb7afd-b3da-4229-a670-a5482e9068e7` and `ad46d191-5b7e-4cc1-a897-1d36dff6f506` have zero player rows, so `/game` cannot build a valid SceneFrame from them.
- `readPlayer` now surfaces `invalid-campaign missing player row` instead of a generic SceneFrame failure.
- `processTurnScenePlan` now passes bounded recent chat history into GM Read before path selection, and GM Read now has an explicit recent-referent resolution contract.
- Verification passed: focused GM Read, SceneFrame, turn-processor source wiring tests, and backend typecheck.
- `P86-F004` remains focused-rerun pending until real routes prove the GM stops asking the player to restate obvious recent context.

Phase 87 87-05 complete:
- Added a shared session response language helper and contract. Explicit player/campaign language wins; otherwise current player action language wins over unrelated recent chat/operator locale, then campaign text, then default English.
- GM Read and final-visible storyteller prompts now receive the same language contract, while keeping proper nouns/source terms/franchise terminology as written.
- Added a separate combat-pressure classifier for GM Read so defensive posture, threat probing, risky environmental moves, violence aftermath, and power-gap questions are treated as adjudication pressure without broadening the older NPC/internal hostile-combat helper.
- Verification passed: backend focused suite `session-language`, `combat-envelope`, `gm-turn-read`, `storyteller-contract`, `prompt-assembler` (5 files / 78 tests), backend typecheck, and targeted diff check.
- `P86-F005` and `P86-F006` are code-fixed/rerun-pending until Phase 87 focused live rerun evidence lands.

Gameplay status 2026-05-07:
- Removed the backend auto-promotion workaround for invalid no-mutation GM Read paths. The GM/repair prompt now owns path switching; backend rejects instead of secretly authoring a `tool_plan`.
- Focused live rerun `output/playwright/phase-87-rerun/gm-read-root-fix` no longer reproduced the old GM Read repair abort. It still reported 4 hard failures and 2 soft failures, so Phase 87 is not closed.
- Rechecked false-claim preservation in `output/playwright/phase-87-rerun/false-claim-harness-check-2`: 2 turns, zero hard failures, zero soft failures. The earlier false-claim red finding was a harness false positive around ambient "door opens" language, not a granted key/pass/authority.
- Remaining `P86-F001` needs split triage: some turns are probably over-strict detector hits for low-stakes/direct sensory play, while others show a real risk of direct narration introducing local affordances or hazards without a state/tool trace.
- Fixed the Phase 86/87 harness log lookup to read live logs from `backend/campaigns/...` and sort them by file time; future findings should include recent concrete turn-log paths instead of empty/stale `logs: []`.
- Focused split-check `output/playwright/phase-87-rerun/p86-f001-split-check` passed `river-intrigue/exploration-location-graph` for 3/3 turns with zero hard/soft failures: first two turns changed world state, third was valid direct inspection without forced mutation.

GM Read advisory-cap triage 2026-05-07:
- Confirmed the `false-claim-boundary` smoke failure was not caused by missing reasoning or a short output cap: `turn-50-0ab5a28c.jsonl` recorded `reasoningLen=3234`, `reasoningTokens=706`, `outputTokens=1671`; live settings report judge/storyteller `maxTokens=32000`.
- Root cause was old schema pressure on advisory text: `situationSummary` and `narrationGuardrails` were too short for a reasoned GM Read repair.
- Rejected silent clipping as a fix. Raised GM Read advisory validation caps and added prompt guidance telling the model to write compact fields up front.
- Verification passed: `gm-turn-read` focused suite (20 tests), backend GM Read/turn/narration subset (7 files / 163 tests), and backend typecheck.
- Focused live rerun `output/playwright/phase-87-rerun/gm-read-advisory-cap-20260507-1309` is inconclusive: selected one `false-claim-boundary` turn correctly, but shell timed out before any turn row; next rerun needs explicit runner logging/detached monitoring.
- Observed focused rerun `output/playwright/phase-87-rerun/gm-read-advisory-cap-observed-20260507-134351` completed `river-intrigue/false-claim-boundary` 1/1 with exit 0, zero hard/soft failures, and fresh turn log `turn-51-d9ae9442.jsonl`.
- The advisory schema failure did not recur. GM Read succeeded via `roll_oracle`, selected 3 evidence refs, used `outputTokens=841`, and the turn completed with world state changed and no free key/pass/authority granted.
- Reasoning check: successful GM Read returned `reasoningTokens=0` in this run, while GM tool loop returned `reasoningTokens=104` and final storyteller returned `reasoningLen=2259`. Treat this as provider/path behavior to keep watching, not as evidence of output starvation.

Phase 87 stable-runtime smoke 2026-05-07:
- Red smoke artifact `output/playwright/phase-87-rerun/phase87-smoke-observed-20260507-135518` exposed a runtime reset, not an LLM no-output root. The failed `false-claim-boundary` turn reached GM Read, oracle, and GM tool calls, then the backend watch process restarted before `storyteller.visible.call`/`turn.end`.
- Added stable playtest scripts: root `npm run dev:playtest`, root `npm run dev:backend:stable`, and backend `npm run dev:stable`. Normal `npm run dev` still uses watch mode for day-to-day development.
- Started stable smoke rerun: `output/playwright/phase-87-rerun/phase87-smoke-stable-20260507-142152`.

Phase 88 planning 2026-05-07:
- [x] Added Phase 88 to `.planning/ROADMAP.md` as full living-world authority spine and key NPC co-player process simulation.
- [x] Ran agent consil: research, implementation slicing, evaluation strategy, and risk review.
- [x] Added Phase 88 context, consil synthesis, validation matrix, and 11 gated plan files under `.planning/phases/88-living-world-authority-spine-and-key-npc-co-player-process-simulation/`.
- [x] Added `88-EXECUTION-WAVES.md` so execution happens in tested sections instead of one huge unverified batch.
- [x] Added P88-R1 through P88-R12 to `.planning/REQUIREMENTS.md`.
- [x] Ran final GSD plan review; first pass BLOCKED because plan files were briefs rather than executable plans.
- [x] Fixed review blockers: executable frontmatter/task blocks, resolved research decisions, rollback split, per-wave evidence paths, and GitNexus pre/post checks.
- [x] Ran external review loop through Cursor Agent, Codex CLI, OpenCode, and Gemini Flash; Claude/Gemini Pro were unavailable by quota/capacity.
- [x] Applied external review flags: early trace/write-scope contracts, proposal-only adapters, actor combat ToolResult contract, hybrid knowledge retrieval, failure/replan semantics, forecast boundary tests, LLM judge calibration, and fail-fast wave gates.
- [x] Ran final GSD re-review pass 3; fixed BLOCK by aligning `<automated>` commands to declared tests and adding deterministic/live Playwright gates to `88-11`.
- [x] Ran final GSD re-review pass 4; verdict FLAG with no blockers. Remaining flags are execution discipline only: dense four-task plans and intra-wave `depends_on` ordering.
- [x] Phase 88 planning is ready for user review / later execution. Runtime implementation remains paused until explicit go-ahead.

Phase 88 execution 2026-05-07:
- [x] Wave 1 authority spine implemented: world clocks, simulation jobs/proposals, actor process state, authority traces, ToolResult authority metadata, sequential tool base-version updates, stale-write rejection, and restore invalidation foundation.
- [x] Wave 1 evidence written under `.planning/phases/88-living-world-authority-spine-and-key-npc-co-player-process-simulation/evidence/wave-1/`.
- [x] Wave 1 verification passed: authority-focused tests, tool/path regression tests, backend typecheck, and GitNexus scope check.
- [x] Commit Wave 1 and re-run GitNexus analyze.
- [x] Start Wave 2 only after Wave 1 is committed cleanly.
- [x] Wave 2 preflight evidence written with GitNexus blast-radius notes and packet surface inventory.
- [x] Add ActorFrame and CommandNodeFrame contracts with source-routed facts and citation validation.
- [x] Add PlayerFacingPacket boundary and context-budget trace without clipping model output.
- [x] Harden visible narration output guard for `forbiddenPrivateTerms`.
- [x] Wave 2 focused tests and backend typecheck passed.
- [x] Run Wave 2 broader prompt/narrator regression suite.
- [x] GitNexus detect changes, commit Wave 2, and re-run GitNexus analyze.
- [x] Wave 3 proposal-first detached simulation boundary implemented, verified, committed, and indexed.
- [x] Wave 4A key actor scheduler/process foundation implemented with focused tests and typecheck.
- [x] Wave 4A final detect, commit, and re-index.
- [x] Wave 4B ActorDecisionPacket schema/runner and validated actor tool execution core implemented.
- [x] Wave 4C required-before-done actor pass wired into the turn boundary before narrator packet construction.
- [x] Wave 4B/4C focused verification passed: backend typecheck plus actor packet/tool/scheduler/turn-boundary authority suite.
- [x] Wave 4D combat/contested actor tool contract and broader backend proof.

Phase 88 boundary correction 2026-05-08:
- [x] Replace final-narration private-term word bans with source-boundary validation: backend guards source authority, not semantic truth.
- [x] Allow raw player-supplied claims to mention otherwise private actor/fact names as unconfirmed claims.
- [x] Keep hard failure when hidden/private facts leak through authoritative packet sections, scene state, effects, responses, actors, hints, or guardrails.
- [x] Add regressions for `Satoru Gojo`/hidden-actor claim text versus real hidden fact leak.
- [x] Restart fresh playtest servers and rerun Phase 88 live smoke after the fix.

Phase 88 fresh live smoke 2026-05-08:
- [x] Restarted backend/frontend from the current workspace instead of reusing stale listeners.
- [x] Ran live smoke with fresh campaign provisioning by default and `PHASE88_CHARS_DIR=X:\Models\Chars`.
- [x] Confirmed new campaigns in artifacts: Lacquer `142cf3f0-e6da-4f6b-8467-5721da7d963f`, JJK/chakra fault `99be2c59-85c7-4546-8da5-38af81fa4169`.
- [x] Confirmed smoke passed 2 routes / 2 turns / 0 hard failures.
- [x] Confirmed tourist-pressure now selects GM `tool_plan`, executes `log_event` + `add_tag`, and mutates state instead of returning a postcard response.
- [x] Confirmed false-claim boundary goes through `roll_oracle`, support NPC spawn, scene/durable events, and does not grant Gojo authorization as truth.
- [~] Deferred out of Phase 88 gate: wire an expanded card-import profile from `X:\Models\Chars`. Current Phase 88 completion proof is long-distance gameplay/living-world behavior, not optional external character import coverage.

Phase 88 final proof harness correction 2026-05-08:
- [x] Deterministic focused harness passed after submit/reaction-expectation correction: `output/playwright/phase-88-living-world/deterministic-focused-20260508-harness-fix`.
- [x] Deterministic deep harness passed across all 8 route specs / 14 turns: `output/playwright/phase-88-living-world/deterministic-deep-20260508-harness-fix`.
- [x] 88-11 targeted backend integration tests passed: `phase-88-integration.test.ts` + `chat.scene-plan.test.ts` (14 tests).
- [x] Backend typecheck passed.
- [x] Full backend suite passed: 180 files / 2146 tests, 30 todo.
- [x] `git diff --check` passed with only existing LF-to-CRLF working-copy warnings.
- [x] Treat offscreen follow-up observation as route-level living-world proof instead of forcing a new world write on every follow-up sentence.
- [x] Submit live actions through the actual game Send action control instead of relying on textarea Enter in every UI state.
- [x] Judge calibration anchor pack generated: `output/playwright/phase-88-living-world/judge-calibration.json`.
- [x] Added Phase 88 harness stall guard so lost action submission is not mistaken for a long model turn.
- [x] Deterministic deep harness passed after the stall guard: `output/playwright/phase-88-living-world/deterministic-deep-20260508-harness-stall-guard`.
- [x] Judge calibration dry-run passed: `output/playwright/phase-88-living-world/judge-calibration.json`.
- [~] Fresh live deep proof under intentional `glm-5-turbo` settings was superseded by the clone-pool rerun after the gameplay harness learned to reuse generated baselines instead of paying worldgen cost.

Phase 88 clone-pool rerun correction 2026-05-09:
- [x] Added DB/directory clone-pool provisioning to `e2e/88-living-world-playtest.ts` so gameplay-distance tests can reuse generated baseline campaigns without paying worldgen cost.
- [x] Deterministic focused clone preflight passed: `output/playwright/phase-88-living-world/deterministic-focused-clone-pool-preflight`.
- [x] Clone integrity verified on sampled campaign DBs: `campaigns.id` rewritten, `campaign_id` rows rewritten, `foreign_key_check = 0`, `chat_history.json = []`.
- [x] Live clone smoke passed: `output/playwright/phase-88-living-world/live-faction-report-clone-smoke-20260509-0845` (1 route / 2 turns / 0 hard failures).
- [x] Fixed smoke soft regression before widening: GM Read now keeps player-visible `localRecentEvents` even when a support NPC participant is no longer clear-visible, redacting the participant ref without losing the event's visible claim text.
- [x] Regression verified: `model-facing-scene.test.ts`, `gm-turn-read.test.ts`, and backend typecheck.
- [x] Run Phase 88 full live rerun with `PHASE88_CLONE_POOL_SIZE=30` from the fresh Lacquer/JJK baselines and use untouched route-specific clones for fixes/reruns: `output/playwright/phase-88-living-world/live-deep-clonepool-20260509-glm` passed 8 routes / 14 turns / 0 hard failures.
- [x] Post-run trace audit passed: all 14 turn latency traces reported `didClipModelOutput=false`; narrator packet guard passed without recovery; no turn rollback events were emitted; `glm-5-turbo` reasoning tokens were observed across the run.
- [x] Final backend suite passed after clone-pool proof: 180 passed / 1 skipped files; 2151 tests passed, 30 todo.
- [x] Final backend typecheck passed after clone-pool proof.
- [~] Residual follow-up: two structured LLM attempts returned invalid objects and were recovered by the existing retry/fallback path. They did not break gameplay, but remain useful prompt/schema tuning evidence.

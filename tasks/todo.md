# WorldForge Active Tasks

## Current Focus: Campaign Play Planning (2026-07-10)

Goal:
- Produce an execution-ready Krypton plan that connects an accepted Campaign World to character setup, grounded opening, multi-turn play, autonomous actor motion, visibility, narration, persistence, and real playtests.
- Restore the original living-world outcome instead of treating world generation as the end of playability.

Planning board:
- [x] Lock the original player promise and read the active planning, gameplay, playtest, and agent-harness guidance.
- [x] Map the current `/game`, `/api/chat/*`, character, Campaign World, and SQLite ownership seams.
- [x] Define the smallest genuine loop and the path from 20-turn proof to 60-turn acceptance and long-horizon soak.
- [x] Define deterministic, live diagnostic, pristine acceptance, and long-horizon evidence lanes.
- [x] Write `rpi/campaign-play/` research and the Krypton `PLAN.md` / `GOAL.md` package.
- [x] Pass Droid GLM and independent Krypton PRE review before execution.

Planning review:
- The accepted Campaign World and mounted `/game` use different actor, player, clock, turn, and persistence authorities. The plan creates a mechanics-owned `campaign-play` runtime over Campaign World entities and removes the old route/API from the active path.
- Accepted Review becomes immutable provenance. Mechanical world truth and operational runtime truth use separate version/hash contracts.
- Opening is turn zero under the same idempotency, worker fencing, bootstrap/Rulebook, visibility, narration, and recovery boundaries as player actions.
- The first playable gate proves one custom action, one peripheral wait/leave action, one sourced non-local consequence, and reload before longer runs.
- Promotion counts completed player actions only: 20-action causal proof, 30-action diagnosis, two fresh plus one zero-turn clone/provenance 60-action human-chosen campaigns, and a 300-action soak. A separate 600-action run gates sustained-longplay wording.
- Final PRE: Sol xhigh architecture aligned in round 4; Terra high gameplay aligned in round 2; Terra medium evidence aligned in round 3. Details: `rpi/campaign-play/plan/pre-review.md`.

## Current Execution: Campaign Play (2026-07-10)

Canonical plan: `docs/goals/campaign-play/PLAN.md`.

Execution board:
- [x] Task 0: execution preflight and blast radius.
- [x] Task 1A: immutable accepted-world snapshot.
- [x] Task 1B: player actor domain and handoff constraints.
- [x] Task 2A: shared Campaign Play contract.
- [x] Task 2B1: core play and fenced-turn storage.
- [x] Task 2B2: Rulebook and mechanical-state storage.
- [x] Task 2B3: actor scheduling and visibility storage.
- [x] Task 2B4: campaign store manifest and zero-turn provenance clone.
- [x] Task 3A: mechanical/runtime projection and state repository.
- [x] Task 3B: turn admission, events, artifacts, and worker fencing.
- [x] Task 4: campaign-owned character intake.
- [x] Task 5: pure opening planner and typed actor plans.
- [x] Task 6A: Rulebook preflight.
- [x] Task 6B: atomic Rulebook execution.
- [x] Task 6C: receipt-bearing player bootstrap.
- [x] Task 7: Judge, uncertainty, and GM planner.
- [x] Task 8A: deterministic actor due set and scoped frames.
- [x] Task 8B: sequential actor proposals and bounded replanning.
- [x] Task 9: visibility, actor knowledge, and public projection.
- [x] Task 10A: fenced turn worker and recovery service.
- [x] Task 10B: opening turn-zero runtime.
- [x] Task 10C: player action runtime and terminal narration.
- [x] Task 11: Campaign Play API and resumable delivery.
- [x] Task 12: UI and copy design gate.
- [x] Task 13: frontend client and durable page state.
- [x] Task 14A: scene and narration surface.
- [x] Task 14B: action, consequence, journal, and recovery surface.
- [x] Task 15: product handoff and hard cutover.
- [x] Task 16A: deterministic integration and promotion gate.
- [ ] Task 16B: first playable slice gate.
- [ ] Task 17: real opening, custom action, 20-turn proof, and 30-turn diagnosis.
- [ ] Task 18: two fresh and one clone/provenance pristine 60-turn campaigns.
- [ ] Task 19: 300-turn long-horizon soak.
- [ ] Task 20: documentation, independent audit, and handoff.

Task 14A execution packet:
- [x] Add the real `/campaign/[id]/play` route and compose the authoritative controller into the full-screen play layout.
- [x] Render opening choice, current location, visible presence, routes, pressures, narration beats, and public stage effects from `CampaignPlayState` only.
- [x] Preserve semantic order, 390px narrow behavior, 44px targets, contrast, and static reduced-motion effect meaning.
- [x] Cover the route, stage, scene, and narration surfaces with focused component regressions using a rich schema-valid public fixture.
- [x] Capture real-route opening, ready, narration, desktop, narrow, and reduced-motion evidence with zero console/network errors.
- [x] Pass focused/full frontend tests, scoped lint, typecheck, build, Krypton POST, correctness, maintainability, and fresh Sol scene review. Repository-wide lint retains the unrelated Forge baseline recorded in the evidence note.
- [x] Record Task 14A evidence, GitNexus change scope, checkpoint commit, refreshed index, and push.

Task 14A ownership amendment:
- `CampaignPlayPage.tsx` joins Task 14A as the existing authoritative state/admission integration seam required to render the planned scene components. Task 14B retains action, consequence, Journal, and recovery interaction ownership.

Task 0 review:
- Branch `feat/revamp` starts Campaign Play from commit `a1e4d5c` while preserving the existing Campaign World and planning worktree.
- GitNexus is current with 6,006 embeddings. Every named Task 1 function target reports LOW risk; the concrete `acceptWorld` UID and schema constants have documented graph-tool boundaries.
- The active handoff is mapped end to end: Review acceptance terminates at `World accepted`, character completion redirects to old `/game`, and that page consumes old `/api/chat/*` plus old gameplay stores.
- Campaign World baseline passed: backend 10 files and 117 tests; frontend 3 files and 21 tests.
- Droid GLM-5.2 returned `ALIGNED`; `humanizer` and `deslop` passed after direct-contract wording edits.
- Evidence: `rpi/campaign-play/implement/00-preflight.md`.

Task 1A review:
- Acceptance writes canonical Review bytes, accepted version, and accepted content hash in one version/hash compare-and-set transaction.
- Migration 0025 preserves existing accepted 0024 decisions and constructs byte-identical provenance through SQLite JSON1.
- Accepted reads validate the frozen source digest and world content hash before serving the snapshot; review reads continue through live rows.
- Placement, relation, goal, pressure, actor, and current-source mutations preserve accepted Review bytes. The fixture retains snapshot SHA-256 `146e21381a48bd36907a219068586708949d6ed73c49f5ea7dadbf4cf9c1693c`.
- Final verification passed: Campaign World 124 tests, Review/API 14 tests, shared build, backend typecheck, repeat schema generation, diff check, POST, code, maintainer, GLM, humanizer/deslop, and goal-backward verifier gates.
- Evidence: `rpi/campaign-play/implement/01a-accepted-snapshot.md`.

Task 1B review:
- Stored actors now admit exactly one live player tuple: `person/human/player`; generated cast and accepted Review remain agent-controlled key/support/background actors.
- Migration 0026 preserves the referenced actors table, enforces the tuple with INSERT/UPDATE triggers, and adds one-human-per-campaign and one-present-placement-per-actor partial indexes.
- The 0025-to-0026 proof preserves actors, goals, relations, placements, pressure anchors, live Review rows, and the 4,277-byte accepted snapshot with SHA-256 `146e21381a48bd36907a219068586708949d6ed73c49f5ea7dadbf4cf9c1693c`.
- Final verification passed: Campaign World 125 tests, Review actor UI 1 test, shared build, backend typecheck, repeat schema generation, diff check, POST, code, maintainer, GLM, humanizer/deslop, and goal-backward verifier gates.
- Evidence: `rpi/campaign-play/implement/01b-player-actor.md`.

Task 2A review:
- Shared public DTOs now cover character intake, admitted opening turn zero, settled play, active turns, narrator work, reload/resume, journal, SSE, and truthful errors. Backend-owned contracts cover Judge, Rulebook, causality, exposures, actor scheduling, epistemic state, worker fencing, and model evidence.
- `opening_active` represents in-flight opening work before a scene exists. Identified event exposures, actor knowledge, and observations preserve channel-specific provenance. Actor proposals bind job causality, actor source, exact scopes, versions, and one receipt per command.
- Public retry semantics, turn narration ownership, strict bounds, version separation, and protected-field rejection have explicit regressions. Raw turn stages stay backend-owned.
- Verification passed: shared build, 29 focused contract tests, backend typecheck, and diff check. Mechanical and architecture reviews returned `ALIGNED`; goal-backward verification returned `PASS`; Droid GLM-5.2 returned `ALIGNED`.
- Smoke-suite additions: 0. Evidence: `rpi/campaign-play/implement/02a-contract.md`.

Task 12 review:
- The `/campaign/[id]/play` design contract covers character-required, chosen or delegated opening setup, opening turn zero, settled play, active and narration-pending turns, interruption, failure, Journal, narrow layout, reduced motion, focus, live regions, and replay-safe effects.
- Every visible datum maps to a public Campaign Play owner or explicit local presentation state. The old speaker transcript becomes an observation-sourced Journal; special Continue, Oracle, factions, debug state, unsupported inventory/map data, turn ordinals, save claims, and attributed scene quotes stay outside the product surface.
- Droid GLM-5.2 returned `ALIGNED` with zero P0/P1 blockers. Its five P2 documentation corrections are applied. Humanizer/deslop review passed, and the final evidence list contains 14 named real-route states.
- Verification passed: shared build, 29 focused contract tests, backend typecheck, and diff check. Production Campaign Play UI changes: 0. Standalone smoke-suite additions: 0.
- Evidence: `rpi/campaign-play/implement/12-ui-plan.md` and `rpi/campaign-play/implement/12-glm-review.md`.

Task 2B1 review:
- Migration 0027 adds seven mechanics-owned core tables, 20 indexes, and 31 migration-owned triggers for accepted provenance, play state, character, turns, runtime/SSE ledgers, model attempts, and narrator artifacts.
- One active turn includes interruption. Opening supersession requires an explicit same-campaign failed predecessor with zero mechanical mutation and permits one successor. Mutated failed openings block the chain.
- Admitted identities, causal ledgers, character/actor binding, accepted model evidence, terminal narration, and committed public packet hashes resist adversarial update/delete paths.
- Fresh and accepted 0026→0027 migration fixtures preserve Campaign World provenance and actors. Campaign-bound A stays isolated while the global database switches to B.
- Verification passed: 15 focused storage/world database tests, backend typecheck, integrity/FK checks, diff check, and empty repeat schema generation. Terra mechanical and final fresh Sol semantic reviews returned `ALIGNED`.
- Standalone smoke additions: 0. Evidence: `rpi/campaign-play/implement/02b1-core-storage.md`.

Task 2B2 review:
- Migration 0028 adds seven Rulebook/mechanical tables, 32 indexes, and 21 migration-owned triggers for command, receipt, causal event, executable exposure, route state, actor condition, and pressure state ownership.
- Character bootstrap now has a truthful `accepted_world` causal root bound to the immutable campaign/version/hash provenance. Turn, command, world-event, and actor-job roots retain their later-stage roles.
- Commands, receipts, events, and exposures are append-only. Current route, condition, and pressure state moves forward only through a same-campaign matching receipt and protected target payload.
- Exposure rows match the exact declared predicate and use channel-specific anchor uniqueness. Pressure progress is derived from the command amount and its world time is bound to the causal event.
- Adversarial regressions cover SQLite NULL discriminator bypasses, missing accepted-root campaign identity, malformed route-trigger sets, undeclared/duplicate exposure anchors, pressure over-advance, fabricated time, and arbitrary ledger/current-state rewrites.
- Verification passed: 47 focused contract/storage/world tests, backend typecheck, integrity/FK checks, diff check, and empty repeat schema generation. Terra mechanical review returned `PASS`; final Sol semantic review returned `ALIGNED` with zero P0/P1 findings.
- Standalone smoke additions: 0. Evidence: `rpi/campaign-play/implement/02b2-rulebook-storage.md`.

Task 2B4 review:
- Registered all twenty Campaign Play tables in exact dependency order with clean-start purge policy and kept the runtime free of control-plane imports.
- Clean-start clone now requires one accepted pre-character campaign, writes five-field lineage, transfers accepted/current World provenance through typed ownership changes, and leaves every Campaign Play table globally empty.
- Independent review reproduced and closed three P1s: UUID substitution inside content, multi-campaign isolation leakage, and target-directory reservation/cleanup race. Final Sol verdict: `ALIGNED`, remaining P0/P1 `0`.
- Droid GLM-5.2 plus humanizer/deslop review returned `COPY_GATE: PASS` for both player-visible clone errors.
- Proof: focused suite `49 passed`; backend typecheck passed; repeat `db:generate` empty; diff check passed; standalone smoke additions `0`.
- Evidence: `rpi/campaign-play/implement/02b4-provenance-clone.md`.

Task 3A review:
- The state repository binds runtime creation to immutable accepted-world provenance, deterministic topology eligibility, exact initial Campaign World bytes, and runtime event sequence 1 in one transaction.
- Mechanical truth covers the accepted foundation plus live character, time, route, actor-condition, pressure, placement, relation, and goal state. Reload rejects drift in current locations, routes, non-human actor definitions, pressure definitions, anchors, hashes, revisions, and event continuity.
- Mechanical-only, runtime-only, combined, and ledger-only callbacks enforce their declared projection domains. Full integrity validation runs before commit, so injected future events and malformed callback writes roll back with the authority update.
- Runtime, protected-audit, and player-public projections use deterministic semantic ordering. Public route state is limited to locally perceivable and observation-earned routes, and journal sort metadata stays outside the player DTO.
- Final proof: focused suite `24 passed`; backend typecheck passed; repeat `db:generate` empty; diff check passed. Terra mechanical review returned `PASS`; adversarial Sol review reproduced six P1 defects across two rounds, all were repaired, and the final verdict was `ALIGNED` with P0/P1 `0`.
- Standalone smoke additions: `0`. Evidence: `rpi/campaign-play/implement/03a-state-repository.md`.

Task 8A review:
- The scheduler freezes due actors by due time, priority, and actor ID after primary settlement. Sealed decisions carry wake, defer, and skip policy; admitted jobs retain stable IDs and the durable reason each actor became due.
- Actor frames load the latest mechanical version with actor-owned goals, relations, conditions, local routes, anchored pressures, durable knowledge, and exact authorized references. People use present placement; collectives use base and influence placement.
- Cadence advances from settled clock. Deferred actors receive one terminal job, one debt increment, and one future due time. Exhausted plans return the typed `plan_exhausted` replan boundary.
- Seeded action-30/action-60 fixtures, repeated 30/60 cadence sequences, defer, stale seal, scoped frame, and restart regressions passed: 1 file, 11 tests. Backend typecheck and whitespace checks passed.
- Terra mechanical verification passed. Sol semantic review found and verified the plan-exhaustion repair, then accepted Task 8A as complete.
- Standalone smoke additions: `0`. Evidence: `rpi/campaign-play/implement/08a-actor-scheduler.md`.

## Previous Focus: Campaign World Build Execution (2026-07-09)

Goal:
- Execute `docs/goals/campaign-world-build/PLAN.md` through both live acceptance bundles.
- Preserve SQLite ownership, strict model contracts, actor unification, durable build evidence, and the planned cutover.

Execution board:
- [x] Task 0: verify branch/worktree, refresh GitNexus with embeddings, map blast radius, and record the task board.
- [x] Task 1: add shared Campaign World contracts and SQLite schema migration.
- [x] Task 2A: add the campaign source mutex, source normalization, DNA persistence, and digest tests.
- [x] Task 2B: add strict model schemas and pass prompts/copy through GLM, `humanizer`, and `deslop`.
- [x] Task 3: add staged generation, deterministic validation, canonical hashing, and sanitized model evidence.
- [x] Task 4: add the campaign-scoped database factory, atomic repository, durable events, and acceptance.
- [x] Task 5A: add the background build service and interrupted-process recovery.
- [x] Task 5B: mount the Campaign World API and resumable SSE contract.
- [x] Task 6: complete the Droid GLM UI and copy gate.
- [x] Task 7: cut Forge to the Campaign World client and build workspace.
- [x] Task 8A: replace World Review with the persisted actor/connection projection.
- [x] Task 8B: move shell status to Campaign World and remove displaced review helpers.
- [x] Task 9: remove old world writers and mounted Campaign Kernel DNA writers.
- [x] Task 10: run full regression, two pristine live runs, restart proof, and POST/reviewer/maintainer gates.
  - [x] Gate repair 1: register the Campaign World structured-output boundary and SQLite stores exposed by the full regression.
  - [x] Gate repair 1 verification: boundary, store-manifest, clone, full backend, and full frontend suites.
  - [x] Gate repair 2: make the live Connections numeric scales explicit after GLM-5.2 returned percentage-like relation intensities.
  - [x] Gate repair 2 verification: prompt contract, strict builder suite, GLM/humanizer/deslop review, then restart both pristine lanes with fresh campaigns.
  - [x] Gate repair 3: keep the visible current-stage activity synchronized with newer durable SSE events.
  - [x] Gate repair 3 verification: Droid GLM UI-plan review, stale-state event regression, Forge suite, and live ledger observation.
  - [x] Gate repair 4: state the macro and sublocation parent-reference contract after live GLM-5.2 emitted empty strings for macro parents.
  - [x] Gate repair 4 verification: strict reference fixture, prompt assertion, GLM/humanizer/deslop review, and a fresh premise-only campaign.
  - [x] Gate repair 5: present structured research as readable Review source context.
  - [x] Gate repair 5 verification: Droid GLM UI review, adjacent page contract test, frontend regression, and live Source inspection.
  - [x] Gate repair 6: recompute frozen source digests during build-context and world reads.
  - [x] Gate repair 6 verification: build/world tamper fixtures, stale-hash acceptance fixtures, full backend regression, and both accepted-world readbacks.
  - [x] Gate repair 7: remove the mounted campaign WorldBook writer while preserving reusable Library intake.
  - [x] Gate repair 7 verification: route 404 contract, fixed-string caller check, full regressions, campaign import 404, and Library 200.
  - [x] Gate repair 8: enforce exact generated-string whitespace and explicit cast/connections reference whitelists after live strict-contract failures.
  - [x] Gate repair 8 verification: strict prompt fixtures, fail-closed diagnostic runs with zero domain rows, and two accepted live lanes.
  - [x] Gate repair 9: finalize readable desktop, narrow, actor, relation, placement, and pressure evidence with human scorecards and SHA-256 inventories.
  - [x] Gate repair 9 verification: both artifact inventories report zero missing files, byte mismatches, or hash mismatches.
  - [x] Gate repair 10: align the background collective goal limit, retain shell campaign identity across World State errors, and share research presentation between Forge and Review.
  - [x] Gate repair 10 verification: validator 25 tests; research, Forge, shell, and Review 20 tests; full backend/frontend regression and builds.
  - [x] Gate repair 11: present selected-worldbook research context and keep committed acceptance distinct from shell refresh failure.
  - [x] Gate repair 11 verification: Droid GLM-5.2 plan review, humanizer/deslop copy review, 11 focused tests, 64-file frontend regression, typecheck, production build, and repeated maintainability audit.

Task 0 review:
- Branch is `feat/revamp`. Initial worktree contained only the approved planning package plus GitNexus count refreshes in `AGENTS.md` and `CLAUDE.md`.
- GitNexus refreshed from `bd762b7` to HEAD `a1e4d5c` with embeddings preserved (5729).
- Forge, Review, current world-build client, and DNA writer cutovers are LOW risk with explicit caller lists.
- `safeGenerateObject` is treated as HIGH risk because context found 28 direct production callers. Task 3 may add only a read-only trace accessor and must run the full AI boundary regression.
- GitNexus does not index the `locations` and `locationEdges` table variables. Their definitions stay unchanged; textual inventory found 129 and 16 backend files respectively.
- Detailed impact and task ownership record: `rpi/campaign-world-build/implement/00-impact.md`.

Task 1 review:
- Added one shared Campaign World contract with unified person/collective actors and the planned world/build/state/event shapes.
- Added 11 Campaign World tables with campaign-scoped indexes, cascade foreign keys, partial running-build uniqueness, and the planned SQLite checks.
- Recovered the missing `0023` Drizzle snapshot from the unchanged current schema before generating `0024`; the final migration contains only the 11 intended tables.
- Shared build, backend typecheck, diff check, repeat generation, and a fresh temporary SQLite migration all passed.
- Evidence: `rpi/campaign-world-build/implement/01-shared-storage.md`.

Task 2A review:
- Added a keyed Campaign World source mutex and strict source adapter without editing the HIGH-impact campaign config reader.
- Complete DNA round-trips through the existing `saveWorldSeeds` writer; malformed or partial stored DNA fails closed.
- Stable source digests cover premise, canonical DNA, research artifact or selected-worldbook context, and hash-bearing source references.
- Selected-worldbook context maps donor organization names to collectives and supplies build context when the premise is empty.
- Focused mutex/source tests passed: 2 files, 20 tests. Backend typecheck passed.
- Evidence: `rpi/campaign-world-build/implement/02a-source.md`.

Task 2B review:
- Added strict frame, cast, and connections Zod contracts with exact cross-stage references and the full product build envelope.
- Model packets require agent-controlled actors and active goals while keeping persistent IDs code-owned.
- Focused Campaign World contract/source tests passed: 3 files, 47 tests. Backend typecheck and shared build passed.
- `agent-prompt`, `humanizer`, and `deslop` gates passed. Droid GLM-5.2 returned `Plan is up-to-date.`
- Evidence: `rpi/campaign-world-build/implement/02b-contract-prompts.md`; review: `rpi/campaign-world-build/plan/prompt-review.md`.

Task 3 review:
- Added three ordered strict model stages, code-owned persistent IDs, whole-world validation, and canonical SHA-256 content hashing.
- Sanitized evidence rejects repair, retry, text fallback, strategy mismatch, and unavailable structured output.
- The CRITICAL shared AI helper received one additive read-only trace accessor; generation behavior remains unchanged.
- Focused builder/validator/snapshot plus full AI-boundary tests passed: 4 files, 70 tests. Backend typecheck passed.
- Evidence: `rpi/campaign-world-build/implement/03-builder-validation.md`.

Task 4 review:
- Added a dedicated campaign database handle that verifies migration `0024` without changing the process-global connection.
- Added strict build acquisition and stage transitions, sequenced durable events, sanitized model evidence, frozen source snapshots, and one-transaction success/failure terminals.
- Review reload recomputes the canonical hash from persisted rows; acceptance compares both version and hash.
- Campaign A completes correctly after the app-wide connection switches to B, interrupted persistence rolls back every domain row, and engine compatibility columns leave the hash unchanged.
- Focused Task 4 tests passed: 2 files, 19 tests. The complete Campaign World suite passed before the last two Task 4 proofs: 8 files, 99 tests. Backend typecheck and SQLite integrity check passed.
- Evidence: `rpi/campaign-world-build/implement/04-atomic-repository.md`.

Task 5 review:
- Added source-locked build acquisition, synchronous coordinator registration, background model work from the frozen build-row source, terminal handle cleanup, and one-time interrupted-process recovery.
- Added the mounted Campaign World source, DNA, build, event, state, and acceptance routes with stable errors and resumable persisted SSE sequence IDs.
- Real SQLite route integration proves live streaming, disconnect/resume deduplication, new-client restart replay, simultaneous-start exclusion, persisted completion, stale acceptance, matching acceptance, and provider failure cleanup.
- Campaign World service tests passed: 6 tests. Route tests passed: 4 tests. Combined Campaign World and route suite passed: 10 files, 111 tests. Backend typecheck and diff check passed.
- Humanizer/deslop review passed. Droid GLM-5.2 returned `Plan is up-to-date.` for player-safe route copy.
- Evidence: `rpi/campaign-world-build/implement/05-service-api.md`; copy review: `rpi/campaign-world-build/plan/prompt-review.md`.

Task 6 review:
- Added the Campaign World Forge, World Review, shell, narrow-viewport, accessibility, screenshot, and component-test design contract.
- The design exposes only persisted stage events and atomically committed world data; model reasoning, partial packets, error codes, and debug trace remain outside the player surface.
- People and collectives share one Actors surface. The review owns Overview, Locations, Actors, Connections, and Source, with every cross-link keyed by persistent ID.
- The first Droid GLM-5.2 review returned `REVISE`. The plan now specifies an opacity-only stage pulse, a global reduced-motion guard, AA-safe small-text tokens, five shell status labels, complete urgency/intensity encoding, failure-ledger boundaries, and draft-only DNA edits.
- The repeated Droid GLM-5.2 review returned `ALIGNED`. Humanizer/deslop guidance also passed for the added player-visible shell and interaction copy.
- Evidence: `rpi/campaign-world-build/implement/06-ui-design.md`; approved plan: `rpi/campaign-world-build/plan/ui-plan.md`.

Task 7 review:
- Added a strict Campaign World frontend client for source, DNA, build creation, resumable SSE, state, and acceptance. Current nested errors and exact SSE identity are validated; malformed, mismatched, incomplete, and prematurely closed responses fail closed.
- Replaced the Forge controller and product surface. A fresh page replays from sequence zero, a mounted reconnect resumes from the last synchronously applied sequence, duplicate events render once, and navigation waits for persisted `review` state.
- Removed Campaign Kernel, character cast, old world generation, factions, lore, and player setup ownership from the active Forge page.
- Forge supports premise-only source, optional draft DNA, save-before-build using the returned digest, durable stage ledger, safe terminal failure, separate build attempts, and accepted read-only deep links.
- Focused Task 7 tests passed: 3 files, 19 tests. Frontend typecheck, diff check, active-path fixed-string check, desktop/narrow visual checks, responsive overflow check, and browser console check passed.
- Evidence: `rpi/campaign-world-build/implement/07-forge-client.md`; screenshots: `output/playtests/campaign-world-build/task-7/forge-source-desktop.png` and `output/playtests/campaign-world-build/task-7/forge-source-narrow.png`.

Task 8 review:
- Replaced scaffold Review with the persisted Campaign World projection: Overview, Locations, Actors, Connections, and Source.
- People and collectives share the same actor cards, goals, placements, directed relations, and pressure anchors. All navigation uses persisted actor and location IDs.
- Acceptance submits the displayed version/hash, reloads accepted state, refreshes shell lifecycle on the same route, and handles stale conflicts by reloading current review without silently resubmitting.
- Campaign shell now reads lifecycle exclusively from `/world/state`, uses literal path segments, renders all five approved labels, and exposes Campaign Forge plus World Review only.
- Caller proof supported removal of the old Factions, NPCs, Lore, Premise, Regenerate, character inspector, worldbook import, and tag editor Review files and their tests. Shared character personality/string-list donors and `ReviewWorkspace` remain.
- Focused Task 8 tests passed: 7 files, 18 tests. Frontend typecheck, diff check, active-path checks, caller-proof import checks, and live localhost shell verification passed. Review/accepted screenshots are assigned to the final persisted live acceptance bundles in Task 10.
- Evidence: `rpi/campaign-world-build/implement/08-review-shell.md`.

Task 9 review:
- Removed the three mounted worldgen writers and the three mounted Campaign Kernel DNA writers; route contracts now prove all six return `404`.
- Removed their frontend clients, response/write DTOs, exclusive backend dependencies, and the final scaffold Review adapter.
- Worldgen route coverage now contains intake contracts and cutover assertions only. Campaign World source is the sole mounted post-creation `saveWorldSeeds` caller and imports no donor worldgen code.
- Focused verification passed: worldgen 13 tests, Campaign Kernel routes 16 tests, Campaign Kernel client 5 tests, backend/frontend typechecks, fixed-string ownership checks, and diff check.
- Evidence: `rpi/campaign-world-build/implement/09-active-cutover.md`.

Task 10 review:
- Premise-only campaign `6fa1f0f2-e35f-465a-bb09-addd610b16a1` and research/DNA campaign `cb95ab65-a792-4aff-b9a3-e9c1cdf47f1b` completed through the real Concept, Forge, Review, acceptance, backend restart, and reload path.
- Both builds used `custom-zai-coding` / `glm-5.2`. Every frame, cast, and connections stage used one native-JSON attempt with repair, retry, and text fallback flags false.
- Both accepted projections are byte identical before and after restart. A retains SHA-256 `912b59e4aa4e3e1f63e21479abf02d83d61c471f4b34b3e4c6ba747ac9c7316f`; B retains `1dc859d0cadcd094fff63df3c8a1df2198c29c3a4ea46b082fd87976becab308`.
- Full final verification: backend 249 files passed, 1 skipped, 3,548 tests passed, 30 todo; frontend 64 files and 488 tests passed; shared/backend/frontend builds and both typechecks passed; diff check passed.
- Focused repair verification passed: validator 25 tests; research, Forge, shell, and Review 22 tests. The final research/acceptance subset passed 11 tests.
- Successful bundles: `output/playtests/campaign-world-build/acceptance-a-premise-only-2026-07-10T05-58-19-726Z/` and `output/playtests/campaign-world-build/acceptance-b-research-dna-2026-07-10T06-18-49-336Z/`.
- Each bundle contains browser diagnostics, readable desktop/narrow Review screenshots, focused key/support/collective inspection, linked pressures, human scorecards, and a verified SHA-256 inventory.
- Final evidence: `rpi/campaign-world-build/implement/10-regression-playtests.md`.
- Repeated independent audits passed: Sol correctness `ALIGNED`, Terra maintainability `ALIGNED`, and Terra acceptance evidence `PASS`.

## Previous Focus: Campaign World Build Planning (2026-07-09)

Goal:
- Produce an execution-ready Krypton plan for the first mechanics-owned world construction slice.
- Make SQLite the built-world truth owner and prove the player path through live, persisted evidence.

Plan:
- [x] Map current Forge, worldgen, Review, storage, and Campaign Kernel ownership.
- [x] Define the Campaign World outcome contract, source boundary, actor model, and cutover.
- [x] Define exact implementation tasks, verification, live playtests, and kill criteria.
- [x] Create the Krypton goal package and RPI research map.
- [x] Complete Droid GLM-5.2 PRE review and apply required corrections.

Review:
- Canonical plan: `docs/goals/campaign-world-build/PLAN.md`.
- Execution handoff: `docs/goals/campaign-world-build/GOAL.md`.
- RPI request and architecture evidence: `rpi/campaign-world-build/`.
- Current domain names use Campaign World, actor, goal, relation, placement, pressure, build, review, and acceptance. Current names avoid workstream, version, age, and experiment labels.
- The plan adds no standalone smoke suite. Focused contract and transaction tests lead into two live Concept -> Forge -> Review acceptance runs.
- PRE review: ALIGNED. Droid GLM-5.2 and an independent Krypton peer found no remaining blocker or major issue. Review record: `rpi/campaign-world-build/plan/pre-review.md`. Release log: `.codex/agent-logs/droid-campaign-world-build-pre-release-20260709-234013.out.log`.

## Previous Focus: Reference and Playtest Architecture (2026-07-09)

Goal:
- Inspect TarotEngine and the five owner-supplied repositories for reusable world, actor, turn, persistence, and testing patterns.
- Define a development loop where real player-path evidence gates each WorldForge mechanics slice.

Plan:
- [x] Inventory TarotEngine and verify its source/version.
- [x] Review all five supplied repositories from primary GitHub sources.
- [x] Build a comparison matrix with applicability and copying risks.
- [x] Define playtest lanes, artifacts, failure policy, and promotion gates.
- [x] Record the recommendation and the first executable acceptance lane.

Review:
- TarotEngine means the local sibling at `R:\Projects\SillytavernUpgrade\TarotEngine\Marinara-Engine`. The inspected branch is `feature/memory-vault-router`; the fork identifies itself as TarotEngine in its README.
- TarotEngine contributes hard stage ownership, critical agent gates, temporary campaign isolation, live multi-turn runs, prompt regression, and saved agent/SSE/state evidence. WorldForge supplies the canonical world state, Rulebook receipts, actor scheduler, and visibility projection.
- [NarrativeEngine-P](https://github.com/Sagesheep/NarrativeEngine-P) contributes bounded goal scheduling, goal collision, timeskip budgets, archive fixtures, and `ambient | rumor | direct` surface levels. Its Story AI narrates before post-turn bookkeeping, so its runtime remains a mechanics donor.
- [AndreiNicu/World-Forge](https://github.com/AndreiNicu/World-Forge) contributes intake-time acceptance scenarios, collision and near-miss probes, independent audit roles, stable identifiers, and a persistent run ledger. Its SillyTavern prompt/lorebook pipeline remains a behavioural QA reference.
- [Yozakura](https://github.com/mistval/yozakura) contributes one character shape for human and AI actors, directed relationships, perspective join/leave windows, graph movement, schedules, active-turn restoration, and inspectable memory deltas. WorldForge uses a due-actor queue in place of its full cast sweep and stores sourced knowledge beside compressed memory.
- [Universal Immersion Engine](https://github.com/GetfroggyHoe/universal-immersion-engine) contributes staged action review, reversible regenerate/swipe UX, and useful RPG/VN surfaces. Rulebook results supply the UI projections.
- [Yuralume](https://github.com/Yuralume/yuralume-core) contributes schedule aftermath and a heuristic -> intention judge -> decider gate for proactive delivery. The public repository currently exposes product documentation and prebuilt images, so it remains a concept reference.
- License boundary: NarrativeEngine-P and AndreiNicu/World-Forge are MIT. Yozakura is AGPL-3.0. UIE and the published Yuralume tree provide no reusable source license. WorldForge will reimplement the selected ideas through its own contracts.
- Existing Phase 88/94 harnesses remain diagnostic regression tools. Pristine milestone acceptance owns playable-status promotion.
- Playtest lanes are: contract regression, seeded scenario replay, live adaptive diagnosis, pristine milestone acceptance, and long-horizon soak.
- A pristine lane starts a fresh campaign and keeps one build, provider, model configuration, and world history. A restore, action resubmission, hidden manual mutation, provider swap, or player-facing failed turn ends the lane. The repaired build starts a new campaign.
- A P0 finding stops promotion. P0 covers lost or duplicated input, missing terminal results, fallback ownership, partial commits, stale version acceptance, hidden fact leaks, player action seizure, narration that contradicts receipts, reload divergence, and required stage bypasses.
- Every fixed playtest failure becomes a deterministic regression fixture before the live lane is repeated.
- Each run bundle records commit and dirty status, run/campaign IDs, provider settings, player input, world versions, perception frame, Judge verdict, GM plan, commands, receipts, visibility projection, narration, action handles, invariant results, timings, token use, screenshots, console/network errors, transcript, and human notes.
- First executable gate: Campaign World Build through the real UI and live provider. A fresh premise-only campaign must generate reviewable locations, actors, relationships, goals, placements, and starting pressures; review data must equal the canonical database; save/reload must preserve the accepted world; actors, relationships, and events model collective organization.
- The following cumulative gates add Character Setup, Opening, one complete player turn, and one hidden off-screen actor action that reaches the player through a sourced information path. Milestone runs then expand through 10, 30, and two fresh 60-turn campaigns before 300/600-turn soak claims.
- Droid GLM-5.2 reviewed the reference and playtest architecture after the `humanizer` and `deslop` passes and returned `Plan is up-to-date.` Review log: `.codex/agent-logs/droid-reference-playtest-20260709-223616.out.log`.

## Previous Focus: Revamp Reanimation Audit (2026-07-09)

Goal:
- Restore the intended world-centered campaign flow from repository evidence before changing mechanics.
- Compare `feat/revamp` with `develop`, distinguish reusable reference material from current mechanics ownership, and locate the first broken vertical boundary.

Plan:
- [x] Capture branch state and review `tasks/lessons.md`.
- [x] Inventory revamp, RPI, planning, and architecture documents.
- [x] Compare `feat/revamp` with `develop` at system and flow level.
- [x] Trace campaign creation, world build, player setup, opening, and turn execution through current code.
- [x] Assess the implementation against the world-centered simulation contract described by the owner.
- [x] Produce a recommended reanimation sequence with explicit proof gates.

Review:
- Branch history shows `feat/revamp` is a sidecar rebuild on `develop`. It leaves the old world generator, gameplay engine, game UI, world review page, and character page unchanged.
- After `Create world`, Forge calls the old `/api/worldgen/generate`, then routes the player through the old review, character, and game routes.
- The accepted Campaign Kernel vertical ends at A6b. Location graph ingestion is export/test-only, production saves player cast only, and A7-A11 expose backend routes without frontend consumers.
- The phase labels carry two meanings. `world_ready` marks accepted DNA; product gating treats `generationComplete` as a built world.
- Current local campaign artifacts show the DNA and Forge shell: zero kernel graph nodes, zero cast members, zero turns, and `generationComplete: false`.
- The separate faction model conflicts with the owner's actor model and spans 199 backend source files plus 35 frontend files.
- The `gameplay-cycle-runtime` contains about 24k production lines. Its active planner compiles fixed interaction kinds; `runGmToolLoop`, `runGmActionChecklist`, and `runGmTurnDecision` have zero production callers.
- Focused tests passed on 2026-07-09: kernel backend, 15 files and 83 tests; Forge frontend, 2 files and 18 tests. These tests cover slices in isolation; the launch-to-turn route remains unexercised.
- Verdict: NO-GO on continuing A7-A12 or patching the old gameplay runtime. GO on a contract reset, followed by one vertical slice owned by the campaign mechanics path.
- First slice: build and persist a faction-free world with locations, actors, relationships, goals, and placements; review it; create or import the player; create starting setup; generate an opening; run one typed, receipt-backed turn; confirm one off-screen actor action stays hidden until an in-world information path exposes it.
- Architecture direction: one authoritative SQLite world state; an actor model shared by player-controlled and AI-controlled actors; a rulebook command/receipt boundary; a versioned turn transaction; and a visibility projection between settled outcomes and narration. `kernel.json` remains orchestration metadata only when every field has a named owner.
- Droid GLM-5.2 reviewed this note with the `humanizer` and `deslop` gates and returned `REVISE`; the revised technical wording is applied here. Review log: `.codex/agent-logs/droid-reanimation-audit-20260709-220834.out.log`.

## Previous Focus: Campaign Forge Accepted Scope A6b

Goal:
- Build and manually accept the Campaign Forge path through A6b only. A3 maps saved campaign data into `world_ready` DNA, A4 maps current location data into graph nodes and spatial edges, A5a maps cast inputs, A5b saves the player cast into `kernel.json`, A6 adds character nodes with placement edges, and A6b persists the composed graph through the Campaign Kernel API.
- Keep World DNA as an optional first-class player step. The forge may use saved DNA, but the accepted player flow must leave room for reviewing/editing DNA before graph composition.
- Treat A7-A11 as unaccepted exploratory backend work. Those files and tests exist, but they are outside the accepted scope until the owner explicitly scopes them and we prove the player path manually.

Source:
- `rpi/campaign-kernel/request.md`
- `rpi/campaign-kernel/architecture.md`
- `rpi/campaign-kernel/research/coverage-map.md`
- `rpi/campaign-kernel/implement/a3-dna.md`
- `rpi/campaign-kernel/implement/a4-locations.md`
- `rpi/campaign-kernel/implement/a5-cast.md`
- `rpi/campaign-kernel/implement/a5b-character.md`
- `rpi/campaign-kernel/implement/a6-graph.md`

Plan:
- [x] Lock A0 Campaign Kernel architecture contract.
- [x] A1 define Campaign Kernel contract and phase model.
- [x] A2 route `Create Campaign` into the campaign forge shell.
- [x] Prove A2 with a focused playtest: create campaign -> campaign forge shell -> visible draft kernel -> old full worldgen path stays outside this route.
- [x] A3 map current saved seeds and research artifact to the kernel DNA contract.
- [x] A3 implement a pure saved-seeds DNA adapter and kernel phase transition.
- [x] A3 prove draft -> world_ready without calling old full worldgen.
- [x] A4 map current `ScaffoldLocation[]` shape to Campaign Kernel world graph nodes and edges.
- [x] A4 implement a pure locations adapter without old generator imports.
- [x] A4 prove nodes, route edges, parent edges, and fail-closed invalid references.
- [x] A5a split Cast Registry adapter from campaign import/create character wiring.
- [x] A5a implement pure cast registry mapping without route/generator imports.
- [x] A5a prove player, imported NPC, generated NPC, role/importance defaults, placement notes, and fail-closed duplicate/empty names.
- [x] A5b add a campaign kernel API boundary under `/api/kernel`.
- [x] A5b persist player cast to `kernel.json` without writing the old `players` table.
- [x] A5b render a small player cast panel on `/campaign/:id/forge`.
- [x] A5b prove player parse/save uses campaign kernel helpers and stays off old frontend character helpers.
- [x] A6 implement pure WorldGraph composition from base graph plus cast registry.
- [x] A6 prove character nodes, placement edges, ordering, and fail-closed missing/collision cases.
- [x] A6b persist composed graph into `kernel.json` through the campaign kernel API boundary.
- [ ] A7-A11 acceptance is explicitly deferred. Existing backend code is not accepted product work and must not drive current planning until re-scoped and manually playtested.

6+1 Lanes:
- L1 Source Lock: keep attachment architecture, `REQUEST.md`, and coverage map as source hierarchy.
- L2 Current-State Map: identify the mechanics create-campaign data, optional World DNA review/edit seam, current location input shape, character draft/scaffold NPC input shape, player cast API seam, and cast-to-graph placement contract.
- L3 Reference Extraction: use old DNA seed and location shapes only as reference.
- L4 Kernel Protocol: write A3 and A5b kernel state to campaign `kernel.json`; keep A4/A5a/A6 as pure graph/cast outputs.
- L5 Proof Harness: prove draft -> world_ready, optional DNA review/edit behavior, location graph adaptation, cast registry adaptation, player cast persistence, and graph composition.
- L6 Risk Cleanup: inspect stale worldgen ownership assumptions without widening A3/A4/A5a/A5b/A6/A6b.
- +1 Integrator: choose the smallest vertical slice and reject scope creep.

Review:
- A0 created `rpi/campaign-kernel/architecture.md` from the supplied architecture.
- Droid GLM-5.2 Coding Plan reviewed A2 UI shell and returned: `Plan is up-to-date.`
- A1 added the typed Campaign Kernel draft contract in `shared`.
- A2 now sends `Create Campaign` to `/campaign/:id/forge`, loads a draft kernel shell, and keeps the old full worldgen call outside this route.
- A2 manual in-app browser proof on 2026-06-27: ran `npm run dev:playtest`, opened `http://localhost:3000`, clicked the main `New campaign` entry, filled `Campaign Name` and `Premise`, clicked `Create Campaign`, and landed on the draft kernel shell. The visible route is now `/campaign/:id/forge`.
- A2 observed campaign forge proof: nav showed the campaign as `Campaign draft`; main showed `Campaign Forge`, phase `draft`, `turn index` 0, `graph nodes` 0, `cast` 0, a draft Campaign Kernel payload, and the boundary note `Player cast writes to the Campaign Kernel. Full worldgen remains outside this Campaign Forge path.`
- A2 proof artifact: `output/playtests/campaign-forge-create-campaign-20260627.png`; browser console errors were empty, dev logs showed page GETs for `/`, `/campaign/new`, and the draft kernel shell only, and the playtest campaign was removed afterward through `DELETE /api/campaigns/15a389b0-4baa-42e5-ac3f-e268fb7f685d` -> `{ ok: true }`.
- Proof: `npm --prefix shared run build`; backend focused vitest `84 passed`; full backend vitest `3417 passed`; frontend focused vitest `33 passed`; full frontend vitest `536 passed`; `npm --prefix frontend run typecheck`; `npm --prefix backend run typecheck`.
- Cleanup: removed old campaign-new full-worldgen progress UI/state from the campaign forge entrypoint path.
- Cleanup: removed the unused frontend `generateWorld` API helper, its progress/result types, and the tests that kept the old generator hook visible.
- Cleanup: replaced stale `.planning` Phase 73/74 test dependencies with source-level structured-output contract checks.
- Project rule added: prompts, model instructions, visible copy, and substantial prose go through GLM review with `humanizer` and `deslop`.
- Latest focused proof after frontend generator API cleanup: `vitest lib/__tests__/api.test.ts components/title/__tests__/use-new-campaign-wizard.test.tsx` -> `66 passed`.
- GitNexus final scope: HIGH due campaign-new entrypoint flow changes; reviewed as expected for A2. Live source search confirms old frontend `generateWorld` symbols and progress markers are gone.
- A3 started with a 6+1 canvas. Scope is DNA mapping, kernel phase transition, persistence, and proof only.
- GLM-5.2 reviewed the A3 planning text and returned `Revise (light revise)`. Required fixes applied: L1-L6 lane names, explicit `kernel.json` persistence, explicit seed-to-DNA mapping, and clearer research-artifact wording.
- A3 added `backend/src/campaign-kernel/dna-adapter.ts` and `backend/src/campaign-kernel/index.ts`.
- A3 proof: focused vitest `src/campaign-kernel/__tests__/dna-adapter.test.ts` -> `5 passed`; `npm --prefix backend run typecheck` passed.
- A3 static checks: no frontend old-generator markers; A3 Campaign Kernel module does not import old worldgen route, scaffold generator, or `generateWorld`. GitNexus `detect_changes` remains HIGH from A2 campaign-new flow and does not list untracked A3 files before indexing.
- A4 added `backend/src/campaign-kernel/locations-adapter.ts` and focused tests.
- GLM-5.2 reviewed the A4 planning text and returned `Revise`. Required fixes applied: explicit `description`/`tags`/`isStarting` mapping, deterministic ID scheme, directed route semantics, type-only worldgen import boundary, and `located_at` containment note.
- A4 proof: mechanics focused vitest `src/campaign-kernel/__tests__/dna-adapter.test.ts src/campaign-kernel/__tests__/locations-adapter.test.ts` -> `10 passed`; `npm --prefix backend run typecheck` passed.
- A5 architecture split: `A5a Cast Registry adapter`; `A5b Campaign import/create character wiring`.
- A5a added `backend/src/campaign-kernel/cast-registry-adapter.ts` and focused tests.
- GLM-5.2 reviewed the A5a planning text and returned `Revise`. Required fixes applied: explicit A5a/A5b split, source tags stay caller-owned, `reconcileDraftBackedScaffoldNpc` vs `fromLegacyScaffoldNpc` branches, stable cast ID scheme, role/importance default rules, and `sceneLocationName` placement preservation.
- A5a proof: mechanics focused vitest `src/campaign-kernel/__tests__/dna-adapter.test.ts src/campaign-kernel/__tests__/locations-adapter.test.ts src/campaign-kernel/__tests__/cast-registry-adapter.test.ts` -> `16 passed`; `npm --prefix backend run typecheck` passed.
- Cleanup: shortened implementation doc filenames to `a3-dna.md`, `a4-locations.md`, `a5-cast.md`, `a5b-character.md`, and matching `*-glm.md` files.
- GLM-5.2 reviewed the A5b UX plan and returned `Plan is up-to-date.`
- A5b added `backend/src/campaign-kernel/cast-kernel.ts`, `backend/src/routes/campaign-kernel.ts`, `frontend/lib/campaign-kernel-api.ts`, and a player cast panel on the campaign forge page.
- GLM-5.2 reviewed A5b visible copy with humanizer/deslop rules and returned `Revise`; 3 replacement strings were applied.
- A5b backend proof: mechanics focused vitest `src/campaign-kernel/__tests__/dna-adapter.test.ts src/campaign-kernel/__tests__/locations-adapter.test.ts src/campaign-kernel/__tests__/cast-registry-adapter.test.ts src/campaign-kernel/__tests__/cast-kernel.test.ts src/routes/__tests__/campaign-kernel.test.ts` -> `26 passed`; `npm --prefix backend run typecheck` passed.
- A5b frontend proof: focused vitest `app/(non-game)/campaign/[id]/forge/__tests__/page.test.tsx lib/__tests__/campaign-kernel-api.test.ts` -> `6 passed`; `npm --prefix frontend run typecheck` passed.
- A5b static check: campaign forge page and `frontend/lib/campaign-kernel-api.ts` do not import old frontend `parseCharacter`, `generateCharacter`, `researchCharacter`, `importV2Card`, `saveCharacter`, or `/api/worldgen`.
- GLM-5.2 reviewed the A6 plan and returned `Revise`. Required fixes applied: character node id scheme, placement edge id scheme, shared `located_at` semantics, placement id rule, and stable emit order.
- A6 added `backend/src/campaign-kernel/world-graph-builder.ts` and focused tests.
- A6 proof: mechanics focused vitest `src/campaign-kernel/__tests__/dna-adapter.test.ts src/campaign-kernel/__tests__/locations-adapter.test.ts src/campaign-kernel/__tests__/cast-registry-adapter.test.ts src/campaign-kernel/__tests__/cast-kernel.test.ts src/campaign-kernel/__tests__/world-graph-builder.test.ts src/routes/__tests__/campaign-kernel.test.ts` -> `32 passed`; `npm --prefix backend run typecheck` passed.
- A6 static check: production `world-graph-builder.ts` has no old worldgen or character route imports.
- A6b added `backend/src/campaign-kernel/graph-kernel.ts` and `POST /api/kernel/campaigns/:id/graph/compose`.
- A6b proof: mechanics focused vitest `src/campaign-kernel/__tests__/dna-adapter.test.ts src/campaign-kernel/__tests__/locations-adapter.test.ts src/campaign-kernel/__tests__/cast-registry-adapter.test.ts src/campaign-kernel/__tests__/cast-kernel.test.ts src/campaign-kernel/__tests__/world-graph-builder.test.ts src/campaign-kernel/__tests__/graph-kernel.test.ts src/routes/__tests__/campaign-kernel.test.ts` -> `37 passed`; `npm --prefix backend run typecheck` passed.
- GitNexus final scope remains `HIGH` from the A2 create-campaign/wizard route changes; A3-A6b Campaign Kernel files remain outside the index until `npx gitnexus analyze` runs.
- A7 added `backend/src/campaign-kernel/starting-setup.ts`, `backend/src/campaign-kernel/setup-kernel.ts`, and `POST /api/kernel/campaigns/:id/setup/start`.
- GLM-5.2 reviewed the A7 setup plan and returned `Revise`. Required fixes applied: stable `presentCastIds`/`nearbyCastIds` graph-node ordering and a fail-closed non-location placement target case.
- A7 proof: mechanics focused vitest `src/campaign-kernel/__tests__/dna-adapter.test.ts src/campaign-kernel/__tests__/locations-adapter.test.ts src/campaign-kernel/__tests__/cast-registry-adapter.test.ts src/campaign-kernel/__tests__/cast-kernel.test.ts src/campaign-kernel/__tests__/world-graph-builder.test.ts src/campaign-kernel/__tests__/graph-kernel.test.ts src/campaign-kernel/__tests__/starting-setup.test.ts src/campaign-kernel/__tests__/setup-kernel.test.ts src/routes/__tests__/campaign-kernel.test.ts` -> `50 passed`; `npm --prefix backend run typecheck` passed.
- GLM-5.2 reviewed the A8 opening plan and returned `Plan is up-to-date.`
- A8 added `backend/src/campaign-kernel/opening-gm.ts`, `backend/src/campaign-kernel/opening-kernel.ts`, `CampaignOpeningResult`, and `POST /api/kernel/campaigns/:id/opening`.
- A8 proof: mechanics focused vitest `src/campaign-kernel/__tests__/dna-adapter.test.ts src/campaign-kernel/__tests__/locations-adapter.test.ts src/campaign-kernel/__tests__/cast-registry-adapter.test.ts src/campaign-kernel/__tests__/cast-kernel.test.ts src/campaign-kernel/__tests__/world-graph-builder.test.ts src/campaign-kernel/__tests__/graph-kernel.test.ts src/campaign-kernel/__tests__/starting-setup.test.ts src/campaign-kernel/__tests__/setup-kernel.test.ts src/campaign-kernel/__tests__/opening-gm.test.ts src/campaign-kernel/__tests__/opening-kernel.test.ts src/routes/__tests__/campaign-kernel.test.ts` -> `58 passed`; `npm --prefix shared run build` passed; `npm --prefix backend run typecheck` passed.
- Droid GLM-5.2 custom model alias verified with `droid exec --model custom:GLM-5.2-(Z.AI-Coding)-0 --list-tools`; the CLI listed tools for `GLM-5.2 (Z.AI Coding)`.
- Droid GLM-5.2 A9 review log `.codex/agent-logs/droid-a9-chat-loop-plan-20260627-095444.out.log` returned `Revise`: scene source field, soft state hint persistence, freeform copy, and Look copy multiline format. Current A9 code was checked against those items and already uses `runtimeState.currentSceneId`, persists `pendingSoftStateHints`, uses revised freeform copy, and formats Look output as separated scene/present/routes lines.
- A9 added `backend/src/campaign-kernel/chat-gm.ts`, `backend/src/campaign-kernel/chat-kernel.ts`, `CampaignGmResponse`, `CampaignSoftStateHint`, and `POST /api/kernel/campaigns/:id/chat/message`.
- A9 proof: mechanics focused vitest `src/campaign-kernel/__tests__/dna-adapter.test.ts src/campaign-kernel/__tests__/locations-adapter.test.ts src/campaign-kernel/__tests__/cast-registry-adapter.test.ts src/campaign-kernel/__tests__/cast-kernel.test.ts src/campaign-kernel/__tests__/world-graph-builder.test.ts src/campaign-kernel/__tests__/graph-kernel.test.ts src/campaign-kernel/__tests__/starting-setup.test.ts src/campaign-kernel/__tests__/setup-kernel.test.ts src/campaign-kernel/__tests__/opening-gm.test.ts src/campaign-kernel/__tests__/opening-kernel.test.ts src/campaign-kernel/__tests__/chat-gm.test.ts src/campaign-kernel/__tests__/chat-kernel.test.ts src/routes/__tests__/campaign-kernel.test.ts` -> `69 passed`; `npm --prefix shared run build` passed; `npm --prefix backend run typecheck` passed; `npm --prefix frontend run typecheck` passed.
- A10 added `chatSession.pendingSoftStateHints`, `backend/src/campaign-kernel/debug-snapshot.ts`, `CampaignDebugSnapshot`, and `GET /api/kernel/campaigns/:id/debug`.
- A10 proof: mechanics focused vitest `src/campaign-kernel/__tests__/dna-adapter.test.ts src/campaign-kernel/__tests__/locations-adapter.test.ts src/campaign-kernel/__tests__/cast-registry-adapter.test.ts src/campaign-kernel/__tests__/cast-kernel.test.ts src/campaign-kernel/__tests__/world-graph-builder.test.ts src/campaign-kernel/__tests__/graph-kernel.test.ts src/campaign-kernel/__tests__/starting-setup.test.ts src/campaign-kernel/__tests__/setup-kernel.test.ts src/campaign-kernel/__tests__/opening-gm.test.ts src/campaign-kernel/__tests__/opening-kernel.test.ts src/campaign-kernel/__tests__/chat-gm.test.ts src/campaign-kernel/__tests__/chat-kernel.test.ts src/campaign-kernel/__tests__/debug-snapshot.test.ts src/routes/__tests__/campaign-kernel.test.ts` -> `73 passed`; `npm --prefix shared run build` passed; `npm --prefix backend run typecheck` passed; `npm --prefix frontend run typecheck` passed.
- A11 added `runtimeState.currentSceneId`, `backend/src/campaign-kernel/state-writer.ts`, `CampaignStateWriterResult`, and `POST /api/kernel/campaigns/:id/state/apply`.
- A11 proof: mechanics focused vitest `src/campaign-kernel/__tests__/dna-adapter.test.ts src/campaign-kernel/__tests__/locations-adapter.test.ts src/campaign-kernel/__tests__/cast-registry-adapter.test.ts src/campaign-kernel/__tests__/cast-kernel.test.ts src/campaign-kernel/__tests__/world-graph-builder.test.ts src/campaign-kernel/__tests__/graph-kernel.test.ts src/campaign-kernel/__tests__/starting-setup.test.ts src/campaign-kernel/__tests__/setup-kernel.test.ts src/campaign-kernel/__tests__/opening-gm.test.ts src/campaign-kernel/__tests__/opening-kernel.test.ts src/campaign-kernel/__tests__/chat-gm.test.ts src/campaign-kernel/__tests__/chat-kernel.test.ts src/campaign-kernel/__tests__/debug-snapshot.test.ts src/campaign-kernel/__tests__/state-writer.test.ts src/routes/__tests__/campaign-kernel.test.ts` -> `78 passed`; `npm --prefix shared run build` passed; `npm --prefix backend run typecheck` passed; `npm --prefix frontend run typecheck` passed.
- Naming cleanup: Droid GLM-5.2 reviewed the AGENTS naming convention and returned `Revise`; applied domain-surface naming rules for files, symbols, URLs, API helpers, test titles, and visible copy.
- Naming cleanup: current mechanics surfaces now use `/campaign/:id/forge`, `/api/kernel`, `frontend/lib/campaign-kernel-api.ts`, `backend/src/campaign-kernel`, `Campaign*` shared types, and `rpi/campaign-kernel` with lowercase doc filenames.
- GLM-5.2 copy review with humanizer/deslop returned `Approved` for `Start draft` and `Player cast writes to the Campaign Kernel. Full worldgen remains outside this Campaign Forge path.`
- Naming proof: `rg -n -S "Revamp|revamp|/api/revamp|/revamp"` over current backend/shared/frontend mechanics files returned no matches; remaining matches are only the required branch name `feat/revamp` and the forbidden-word rule in AGENTS.
- Manual in-app browser proof on 2026-06-27: clicked main `New campaign`, filled `Campaign Name` and `Premise`, clicked `Create Campaign`, landed on `http://localhost:3000/campaign/fa8c1562-5c44-4ae9-bbc0-6352625487b8/forge`, saw `Campaign Forge`, `Start draft`, and the approved boundary note; browser error console was empty.
- Naming proof artifact: `output/playtests/campaign-forge-naming-proof-20260627.png`; dev logs showed GETs for `/`, `/campaign/new`, and `/campaign/fa8c1562-5c44-4ae9-bbc0-6352625487b8/forge`; playtest campaign cleanup returned `DELETE /api/campaigns/fa8c1562-5c44-4ae9-bbc0-6352625487b8` -> `{ ok: true }`.
- Naming verification: `npm --prefix shared run build`; campaign kernel backend vitest `78 passed`; focused frontend vitest `17 passed`; page-only frontend vitest `2 passed`; `npm --prefix backend run typecheck`; `npm --prefix frontend run typecheck`.
- Correction: preserved the existing `/campaign/new -> /campaign/new/dna -> create campaign` World DNA path. Forge now consumes saved DNA instead of adding a second DNA generator or blank DNA editor.
- Droid GLM-5.2 reviewed the corrected consume-saved-DNA plan via `.codex/droid-prompts/campaign-forge-consume-saved-dna.md` and returned `Verdict and constraints delivered. Plan is up-to-date.`
- A6b Forge saved-DNA proof: `GET /api/kernel/campaigns/:id/kernel` prepares a draft kernel from complete saved seeds into `world_ready`; parse/import player endpoints receive premise plus accepted World DNA context.
- Focused proof: backend vitest `src/routes/__tests__/campaign-kernel.test.ts src/campaign-kernel/__tests__/dna-adapter.test.ts src/campaign-kernel/__tests__/graph-kernel.test.ts` -> `23 passed`; frontend vitest `app/(non-game)/campaign/[id]/forge/__tests__/page.test.tsx lib/__tests__/campaign-kernel-api.test.ts` -> `10 passed`; `npm --prefix frontend run typecheck`; `npm --prefix backend run typecheck`.
- Manual in-app browser proof on 2026-06-27: created saved-seed campaign `46905668-e3c3-4c4d-a86e-3a00bd236b33`, opened `/campaign/46905668-e3c3-4c4d-a86e-3a00bd236b33/forge`, observed phase `world_ready`, saved DNA summary, no second DNA editor, no `Use World DNA` button, and no raw kernel JSON.
- Manual note: `/campaign/new -> Continue to DNA` click fired, but local app settings have an empty Generator API key, so the UI displayed `Configure Generator API key in Settings first.` This blocks live seed generation in this dev run, not the saved-DNA Forge handoff.
- Local provider repair: copied the Z.AI Coding endpoint/key from `C:\Users\robra\.claude-code-router\config.json` into ignored local `settings.json` as `custom-zai-coding` with base URL `https://api.z.ai/api/coding/paas/v4`, default model `glm-5.2`, and assigned judge/storyteller/generator to it. The key is local-only and not committed; pre-write backup is in `C:\tmp\WorldForge-local-settings-backup`.
- Live generation proof on 2026-06-27: `/api/providers/test` succeeded for `Z.AI Coding / glm-5.2` through the WorldForge provider registry.
- Manual in-app browser proof on 2026-06-27: filled `/campaign/new`, clicked `Continue to DNA`, waited through real source-context research plus Z.AI `glm-5.2` native-JSON calls, reached `/campaign/new/dna` with `6 of 6 seeds active`, clicked `Create Campaign`, and landed on `/campaign/064bba91-3d35-4a8d-bef2-d08340172f79/forge`.
- Live generation result: kernel API reports campaign `064bba91-3d35-4a8d-bef2-d08340172f79` in phase `world_ready` with saved `worldDna`; proof screenshot: `output/playtests/zai-dna-generation-forge-20260627.png`.
- Diagnostic note: the playtest reused stale draft `Franchise/IP` text (`JoJo before part 6`) as source context even after the visible field was cleared. Treat that as a campaign-new draft-state bug to fix in a separate focused pass.
- Droid GLM-5.2 reviewed the Forge saved-DNA display prompt via `.codex/droid-prompts/campaign-forge-dna-display.md` and returned `Plan is up-to-date.`
- Forge saved-DNA display now renders the accepted six-field World DNA as `D01-D06` structured cards instead of a dense label/value prose wall.
- Forge saved-DNA display proof: focused frontend vitest `app/(non-game)/campaign/[id]/forge/__tests__/page.test.tsx` -> `4 passed`; `npm --prefix frontend run typecheck` passed.
- Visual proof: in-app browser bridge timed out on tab reads during verification, so a local Edge headless screenshot captured the current localhost page instead: `output/playtests/campaign-forge-dna-cards-20260627.png`.
- Droid GLM-5.2 reviewed the Forge player-after-world and hide-graph prompt via `.codex/droid-prompts/forge-player-flow-hide-graph.md` and returned `Plan is up-to-date.`
- Forge player flow now requires accepted World DNA before player creation controls render. Campaigns without World DNA show a locked Player section instead.
- Forge no longer exposes Graph as a player-facing step: no `Graph` section, no node/edge metrics, no `Compose graph` button, and no graph rail item.
- Graph composition remains internal: after player save, Forge calls the existing compose helper when the saved kernel is `cast_ready` and lacks a character node.
- Forge player flow proof: focused frontend vitest `app/(non-game)/campaign/[id]/forge/__tests__/page.test.tsx` -> `4 passed`; `npm --prefix frontend run typecheck` passed.
- Manual in-app browser proof on 2026-06-27: reloaded `/campaign/064bba91-3d35-4a8d-bef2-d08340172f79/forge`; DOM reported `graphPanel=false`, `hasComposeGraphButton=false`, `hasGraphWord=false`, `worldDnaPanel=true`, `playerPanel=true`, `playerConcept=true`; screenshot: `output/playtests/campaign-forge-player-after-dna-no-graph-20260627.png`.
- Owner correction: accepted World DNA is the blueprint layer. Player setup waits for the created world signal, currently `campaign.generationComplete === true`.
- Droid GLM-5.2 reviewed the Forge player gate via `.codex/droid-prompts/forge-lock-player-until-world-built.md` and returned `Approved`: gate Player on `generationComplete`, keep DNA visible, hide all Player controls while the world is pending, keep Graph hidden, and use plain copy from the review.
- Forge player gate now hides character description, import, override, draft, save, Graph, and Compose Graph controls when accepted DNA exists but the world is pending. The screen shows accepted DNA plus the locked Player note `Create the world first`.
- Forge player gate proof: focused frontend vitest `app/(non-game)/campaign/[id]/forge/__tests__/page.test.tsx` -> `5 passed`; `npm --prefix frontend run typecheck` passed.
- Manual in-app browser proof on 2026-06-27: reloaded `/campaign/064bba91-3d35-4a8d-bef2-d08340172f79/forge`; DOM reported `kernelPhase=world_ready`, `worldDnaPanel=true`, `worldDnaStatus="World DNA accepted."`, `lockHeadingVisible=true`, `hasPlayerConcept=false`, `hasPlayerOverride=false`, `hasDescribeControl=false`, `hasImportCardControl=false`, `hasCreateDraftControl=false`, `hasChooseCardControl=false`, `hasSavePlayerControl=false`, `hasGraphPanel=false`, `hasComposeGraphControl=false`; browser console errors were empty. Screenshot: `output/playtests/campaign-forge-world-not-built-player-locked-20260627.png`.
- Owner correction: product UI must replace mechanical proof screens. DNA-only Forge must render the approved World generation product surface instead of a locked Player proof panel.
- Droid GLM-5.2 reviewed the product Forge world-generation prompt via `.codex/droid-prompts/forge-world-generation-product-surface.md` and returned `Plan is up-to-date.`
- Forge DNA-only state now renders the `wf-gen-*` World generation surface: Concept done, World DNA done, World generation active, World Review pending, Player character pending. Player and Graph controls stay hidden until their product step.
- Forge World generation now has a frontend SSE helper for the existing `/api/worldgen/generate` route. The helper streams progress, returns the completion payload, refreshes campaign/kernel state, and routes to `/campaign/:id/review` after completion.
- Verification: focused frontend vitest `app/(non-game)/campaign/[id]/forge/__tests__/page.test.tsx lib/__tests__/api.test.ts` -> `62 passed`; `npm --prefix frontend run typecheck` passed; `git diff --check` passed.
- Manual note: did not click live `Create world` in the browser during this pass to preserve provider quota. The in-app browser control timed out while inspecting the already-loaded localhost page; HTTP returned `200`, and the product state is covered by focused DOM tests.
- Owner correction: accepted World DNA still needs product editing and re-roll controls before world generation starts.
- Droid GLM-5.2 reviewed the Forge DNA edit/reroll prompt via `.codex/droid-prompts/forge-dna-edit-reroll-product-surface.md` and returned `GO`: remove locked copy, reuse `/campaign/new/dna` visual canon, test editable DNA, save-before-create, and keep debug internals hidden. Local code review corrected one GLM misread: existing `suggest-seed` has no `campaignId`, so campaign-scoped kernel reroll endpoints are required for single-field and all-field rerolls.
- Droid GLM-5.2 reviewed the visible copy with humanizer/deslop filters via `.codex/droid-prompts/forge-dna-edit-reroll-copy-humanizer-deslop.md` and returned `GO`.
- Forge pre-world surface now renders editable six-card World DNA, `Re-roll`, `Re-roll all six`, `Save DNA`, and `Create world`. Dirty `Create world` saves DNA through the kernel API before starting generation.
- Kernel API now provides campaign-scoped World DNA suggestion endpoints that read saved campaign source context and return only seed values.
- Verification: backend focused vitest `src/routes/__tests__/campaign-kernel.test.ts` -> `16 passed`; frontend focused vitest `app/(non-game)/campaign/[id]/forge/__tests__/page.test.tsx lib/__tests__/campaign-kernel-api.test.ts` -> `18 passed`; `npm --prefix frontend run typecheck`; `npm --prefix backend run typecheck`; `git diff --check`.
- Owner correction: pre-world Forge had noisy idle copy: footer note beside `Create world`, visible `queued` cards, and progress/status subtext before generation started.
- Droid GLM-5.2 reviewed the cleanup prompt via `.codex/droid-prompts/forge-worldgen-noise-cleanup.md` and returned `GO`: hide progress/think/build details until generation is running or complete, remove the footer note, remove visible `queued`, and keep internal state attributes only for styling.
- Forge pre-world idle now focuses on editable DNA plus primary actions. World generation progress, engine work, and build cards appear only during running/complete states.
- Verification: focused frontend vitest `app/(non-game)/campaign/[id]/forge/__tests__/page.test.tsx` -> `10 passed`; `npm --prefix frontend run typecheck` passed; `git diff --check` passed.
- Owner correction: World DNA is optional. A premise-only campaign created from `/campaign/new` must not land on a `World DNA required` blocker.
- Droid GLM-5.2 reviewed `.codex/droid-prompts/forge-optional-dna-premise-worldgen.md` and returned `GO`: split the Forge world-generation surface into DNA-present and premise-only modes, remove DNA from the player gate, keep `/api/worldgen/generate` as the world-build path, and prove backend missing-seed behavior.
- GLM copy review with `humanizer` and `deslop` reviewed `.codex/droid-prompts/forge-optional-dna-copy-humanizer-deslop.md` and returned `GO`; applied the one revision from `The world can still be created from the premise.` to `The world is created from the premise.`
- Forge now renders the product world-generation surface for premise-only campaigns. The screen shows the campaign premise as the world source, keeps `Create world` enabled, offers optional `Draft World DNA`, hides player controls until the world exists, and removes `World DNA required`/`Player creation locked`/`Accept World DNA first` copy.
- Player setup now unlocks from `campaign.generationComplete === true`, independent of whether the campaign used optional World DNA.
- Verification: focused Forge vitest `app/(non-game)/campaign/[id]/forge/__tests__/page.test.tsx` -> `11 passed`; backend worldgen vitest from `backend/` cwd `src/routes/__tests__/worldgen.test.ts` -> `68 passed`; `npm --prefix frontend run typecheck`; `npm --prefix backend run typecheck`; `git diff --check`.
- Owner correction: the idle editable DNA surface is World DNA, not World generation. World generation starts when the player clicks `Create world`; preparation headings also should not duplicate themselves with sublabels.
- Droid GLM-5.2 reviewed `.codex/droid-prompts/forge-dna-generation-state-labels.md` and returned `Plan is up-to-date.`
- Forge now marks the setup rail as `World DNA` active while editable DNA cards are on screen, keeps `World generation` pending until the build runs, and removes the redundant `World DNA - preparing suggestions` preparation sublabel.
- Verification: focused frontend vitest `app/(non-game)/campaign/[id]/forge/__tests__/page.test.tsx app/(non-game)/campaign/new/__tests__/page.test.tsx app/(non-game)/campaign/new/dna/__tests__/page.test.tsx` -> `22 passed`; `npm --prefix frontend run typecheck`; `git diff --check`.
- Owner correction: running world generation needs a visible timer, the idle DNA editor should not repeat `World DNA` across the rail/H1/section, and standalone `Save DNA` is redundant because `Create world` saves dirty seed edits before starting.
- Droid GLM-5.2 reviewed `.codex/droid-prompts/forge-dna-timer-action-noise.md` and returned `Approved for implementation`.
- GLM copy review with `humanizer` and `deslop` reviewed `.codex/droid-prompts/forge-dna-timer-copy-humanizer-deslop.md` and `.codex/droid-prompts/forge-dna-timer-extra-copy-humanizer-deslop.md`; both returned `GO`.
- Forge now uses `Tune the blueprint.` and `Seed cards` on the idle DNA edit surface, removes the standalone `Save DNA` action, keeps save-before-create in the `Create world` path, and shows elapsed time beside the running generation stage count.
- Verification: focused Forge vitest `app/(non-game)/campaign/[id]/forge/__tests__/page.test.tsx` -> `10 passed`; `npm --prefix frontend run typecheck`; `git diff --check`.

## Campaign Play Task 2B3 Review (2026-07-11)

- Added six actor-agency and visibility tables in exact migration `0029_campaign_play_actors_visibility.sql`; the fresh database now contains twenty Campaign Play tables.
- Closed proposal/job lifecycle bypasses: terminal jobs require terminal proposal status, proposal identity survives terminalization, pending proposals cannot be orphaned, and expiry uses an initialized world clock with an exclusive upper bound.
- Bound actor-job commands and accepted receipts to the proposed job's exact common causal metadata; canonical hashes for kind-specific protected payloads remain an explicit repository-layer obligation.
- Mechanical verifier: `PASS`. Semantic verifier: `ALIGNED`, remaining P0/P1 `0`.
- Proof: repeat `db:generate` empty; focused Campaign Play/Campaign World suite `48 passed`; backend typecheck passed; standalone smoke additions `0`.
- Owner correction: the idle DNA screen has only one content block, so the secondary `Seed cards` heading created a false hierarchy under `Tune the blueprint.`
- Droid GLM-5.2 reviewed `.codex/droid-prompts/forge-dna-remove-secondary-heading.md` and returned the implementation result: remove the redundant header row, keep H1/cards/actions/aria label, leave premise-only and running headings alone.
- Forge now renders the editable seed cards directly under the H1 in the idle DNA state.
- Verification: focused Forge vitest `app/(non-game)/campaign/[id]/forge/__tests__/page.test.tsx` -> `10 passed`; `npm --prefix frontend run typecheck`; `git diff --check`.

## Campaign Play Task 3B Review (2026-07-11)

- Added durable admission, idempotent replay, exact worker fencing, lease renewal, persisted model artifacts, explicit external interruption/resume, deterministic settlement, terminal failure, narrator completion, event replay, and restart recovery.
- Every mutation runs inside an outer immediate transaction whose final state and turn reload remain part of commit authority. Final-verification failure rolls back state revisions, both event ledgers, model attempts, turn fields, narration, and domain writes.
- Narrator packet authority uses `SHA-256(canonical({ domain: "campaign_play_narrator_packet", turnId, packet }))`; visibility and interrupted narration require pending storage, while completion changes narration and turn terminal state atomically.
- Real child-process tests prove same-key admission convergence, distinct-key exclusion, and single-winner lease claims. Multi-stage recovery proves Judge retry followed by Game Master interruption, reopen, exact recovery, and attempt-2 resume.
- Proof: lifecycle/recovery suite `55 passed`; contracts/migration suite `54 passed`; backend typecheck passed; repeat `db:generate` empty; diff check passed; Terra mechanical `PASS`; fresh Sol semantic `ALIGNED`, P0/P1 `0`; standalone smoke additions `0`.
- Evidence: `rpi/campaign-play/implement/03b-turn-repository.md`.

## Campaign Play Task 4 Planning Note (2026-07-11)

- Architecture verdict: `GO`; migration required: no. The exact V2 parser, accepted-world adapter, generic-ingestion projection, CharacterRecord materialization, fail-closed research boundary, and source/profile digest contracts are implementation-ready.
- GitNexus rates the reused ingestion donor LOW. The CharacterRecord adapter has HIGH blast radius, so Task 4 imports it unchanged and owns no donor edits.
- Required Droid GLM-5.2 review was attempted: custom runs created silent sessions after an MCP reload failure, and the built-in GLM run ended with `Exec failed`. The owner explicitly authorized forward progress; the failure remains in evidence and Task 4 uses local Sol semantic review plus humanizer/deslop checks.
- Review prompt: `.codex/droid-prompts/campaign-play-character-intake.md`. Evidence: `rpi/campaign-play/implement/04-character-intake.md`.

## Campaign Play Task 4 Review (2026-07-11)

- Added a pure Campaign Play service for exact Character Card V2 intake, generated and research-backed drafts, strict public profile validation, CharacterRecord materialization, and domain-separated source/profile digests.
- The accepted-world adapter passes canonical accepted context, sorted locations, and an empty faction list. Card instructions and excluded attachments stay outside model input; research exposes a truthful empty citation list.
- Source kind and import mode use one cross-field provenance invariant. Prepared records leave faction, placement, relationships, equipped items, goals, and starting conditions to their owning tasks.
- Verification passed: 3 files and 53 tests; backend typecheck; diff check; Terra mechanical `PASS`; fresh Sol semantic `PASS` with zero P0, P1, or P2 findings. Standalone smoke additions: 0.
- GLM/Droid remained unavailable after documented repair attempts. The owner authorized continuing, and the evidence retains that advisory failure.
- Evidence: `rpi/campaign-play/implement/04-character-intake.md`.

## Campaign Play Task 5 Review (2026-07-11)

- Added a pure opening planner that compiles a frozen accepted world and chosen/delegated start into immutable bootstrap commands, actor plans/schedules, an earned-visibility seed, and local narrator facts.
- Code owns IDs, hashes, scopes, preconditions, versions, schedules, and causal lineage. Every eligible key/support/collective actor receives one reachable plan covering all active goals; background actors remain outside the opening plan.
- Hidden consequences require a non-local source and a satisfiable exposure path within five player actions. Collective reachability uses every base/influence placement, and local aftermath remains live through the shortest directed trip.
- Verification passed: focused suite 23/23; backend typecheck; diff check; persistence-boundary scan; Terra mechanical `PASS`; fresh Sol semantic `PASS` with zero P0, P1, or P2 findings. Standalone smoke additions: 0.
- Droid GLM remained silent after an MCP reload failure and one substantive attempt. The owner authorized forward progress; local review plus independent Sol/Terra proof closes the task.
- Evidence: `rpi/campaign-play/implement/05-opening-planner.md`.

## Campaign Play Task 6A Review (2026-07-11)

- Added a pure Rulebook preflight over one frozen mechanical frame, one code-owned authority envelope, and the strict shared batch union.
- All twelve command kinds enforce availability, exact scopes, causal source/root, current references, transition preconditions, version order, grounded exposure, and whole-batch simulation before any writer exists.
- Character/opening bootstrap remains internal and phase-bound. Model-shaped bootstrap requests, hidden IDs, expanded scopes, scheduler impersonation, and invalid full plans return typed denials.
- People act from `present`; collectives act from `base` and `influence`. Frozen placement/relation/goal identity and phase/version lineage prevent tampered frames from becoming authority.
- Verification passed: focused suite 22/22; backend typecheck; all 12 kinds enumerated; purity and whitespace checks; Terra mechanical `PASS`; fresh Sol semantic `PASS` with zero P0, P1, or P2 findings. Standalone smoke additions: 0.
- Evidence: `rpi/campaign-play/implement/06a-rulebook-preflight.md`.

## Campaign Play Task 6B Review (2026-07-11)

- Added integrity-sealed execution of Task 6A batches inside the existing immediate state transaction and fenced deterministic turn boundary.
- Commands, receipts, causal events, exposures, live mutations, logical world versions, final mechanical hash, runtime revision/hash, runtime event, and opening stage transition commit together.
- Explicit batch version advance counts mutating commands while `record_world_event` preserves mechanical version/hash. Deterministic IDs bind campaign, turn, batch, and order.
- Verification covers all twelve persisted command kinds, first human plus CharacterRecord, opening placement/clock/pressures, ordinary mechanics, one projectable exposure, and the complete ledger row correspondence.
- Zero-write rejection evidence covers every opening command boundary, pre-commit, stale base, duplicate batch, forged accepted result, SQLite constraint failure, and real writer contention.
- Proof: 4 focused files and 90 tests passed; backend typecheck passed; Terra mechanical `PASS`; fresh Sol semantic `PASS`, P0/P1/P2 `0/0/0`; standalone smoke additions `0`.
- Evidence: `rpi/campaign-play/implement/06b-rulebook-execution.md`.

## Campaign Play Task 6C Review (2026-07-11)

- Added the single Campaign Play handoff from a code-sealed prepared CharacterRecord to one unique `person/human/player` actor.
- The actor, canonical profile/provenance, deterministic Rulebook command, receipt, causal event, mechanical advance, `opening_required` phase, runtime advance, and runtime event commit in one immediate transaction.
- Real Character Card V2 and generated-prompt fixtures each prove the exact one-actor/profile/command/receipt/event shape and stable close/reopen authority plus mechanical hash.
- Stale accepted version/hash, forged prepared profile, accepted actor-ID collision, and duplicate bootstrap preserve the full authority object and every relevant ledger count. Shared Task 6B evidence proves injected SQL constraint and writer-contention rollback.
- Verification: 3 focused files and 54 tests passed; backend typecheck passed; Terra mechanical `PASS`; fresh Sol semantic `PASS`, P0/P1/P2 `0/0/0`; standalone smoke additions `0`.
- Evidence: `rpi/campaign-play/implement/06c-player-bootstrap.md`.

## Campaign Play Task 7 Review (2026-07-11)

- Added one strict Judge call for freeform and suggested input, all four dispositions, visible-handle citations and targets, result/elapsed bounds, and typed clarification.
- Code preserves original player input authority and owns deterministic d20 resolution. The Game Master authenticates uncertain resolution from the admitted seed/modifier before generation and compilation; forged deterministic or rolled evidence stops before a model call.
- Game Master proposals contain ordinary effects only. Code owns canonical bindings, IDs, source, causal order, scopes, expected versions, exposure compilation, and mandatory Rulebook preflight.
- Judge and Game Master use one strict attempt with repair and text fallback disabled. Typed evidence covers transport, model contract, duration, token, and cost failures.
- Verification: 4 required files and 67 tests passed; backend typecheck and diff check passed; Terra mechanical `PASS`; fresh Sol semantic review found and then verified fixes for one P1 and one P2, final verdict `PASS`; standalone smoke additions `0`.
- Droid GLM-5.2 again stopped after an MCP reload failure and a silent timebox. The owner authorized advisory tooling to stop blocking; local humanizer/deslop prompt review and independent Sol/Terra proof close the task.
- Evidence: `rpi/campaign-play/implement/07-adjudication.md`.

## Campaign Play Task 8B Review (2026-07-11)

- Added serial latest-version actor proposal settlement, durable proposal lifecycle, true-stale rejection with one debt-bearing retry, and world-clock-preserving cadence updates.
- Added one-attempt actor-scoped replanning with opaque handles, code-owned canonical plans and schedules, exact job/model epoch fencing, and atomic old-plan transition plus schedule repointing.
- The integration campaign compiles and stores a production opening artifact, executes its exact Rulebook bootstrap commands, and carries its compiler-derived two-action `local_aftermath` exposure into actor settlement without creating observations or actor knowledge.
- Verification: 5 focused files and 57 tests passed; backend typecheck and diff check passed; standalone smoke additions `0`; fresh Sol semantic follow-up `PASS`, remaining P0/P1 `0`.
- Droid GLM-5.2 returned `ACCEPT WITH CHANGES`; all contract changes were applied to the production replan schema and prompt.
- Campaign fixture depth: opening turn zero and `0` completed player actions. Task 9 owns predicate execution; Tasks 17 and 18 own real multi-action and 60-turn playtests.
- Evidence: `rpi/campaign-play/implement/08b-actor-proposals.md`.

## Campaign Play Task 9 Review (2026-07-11)

- Added one fenced visibility boundary from `actors_settled` to `visibility_projected`, with executable direct-perception, local-aftermath, route-interaction, and informed-witness predicates over committed SQLite evidence.
- Actor knowledge precedes human observations. Earliest qualifying provenance survives multiple knowledge paths, observations and public consequences bind to exact opaque handles, and retry attempts preserve row counts.
- The pending narrator packet, its hash, knowledge, observations, turn transition, runtime revision/hash, runtime event, and sanitized turn event commit atomically while mechanical world version remains fixed.
- Public projection now uses strict packet and journal schemas, nested field whitelists, opaque entity handles, and authoritative `runtimeRevision` ordering. Twenty-three named probes find zero protected actor/location/route IDs, goals, relations, model metadata, provenance IDs, hidden summaries, or pressure trajectory.
- The real migrated and accepted campaign reaches opening turn zero through character bootstrap, opening planning, Rulebook execution, actor settlement, and production visibility. Fixture depth remains `0` completed player actions; Tasks 17–19 own multi-action and long-run playtests.
- Verification: all Campaign Play tests `239/239`; final four-file semantic suite `62/62`; backend typecheck and targeted diff check passed; GLM copy gate changes applied; fresh Sol semantic verdict `PASS`, remaining P0/P1 `0`; standalone smoke additions `0`.
- GitNexus still reports the inherited tracked dirty worktree as `CRITICAL` across 45 files and 22 indexed flows. The untracked Campaign Play tree remains outside that index, so source inspection, contract suites, and independent verification supply Task 9 evidence.
- Evidence: `rpi/campaign-play/implement/09-visibility.md`.

## Campaign Play Task 9 Execution Packet (2026-07-11)

Task: visibility, actor knowledge, and player-public projection.

Owner: main agent. Storage inventory and semantic review are read-only support packets.

Input: an exact `actors_settled` worker lease, accepted Campaign World provenance, committed Rulebook events/exposures, current mechanical truth, committed turn input, and prior durable knowledge/observations.

Files allowed:

- `backend/src/campaign-play/visibility-service.ts`
- `backend/src/campaign-play/visibility-service.test.ts`
- `backend/src/campaign-play/campaign-play-projection.ts`
- `backend/src/campaign-play/campaign-play-projection.test.ts`
- `backend/src/campaign-play/campaign-play-state-repository.ts`
- `backend/src/campaign-play/campaign-play-state-repository.test.ts`
- `backend/src/campaign-play/campaign-play-turn-repository.test.ts`
- `backend/src/campaign-play/index.ts`
- `rpi/campaign-play/implement/09-visibility.md`
- Task-local GLM review request and logs

Files forbidden: Task 10 orchestration, API/UI routes, legacy engine projections, schema migrations, fallback paths, and compatibility adapters.

Output: one deterministic visibility service that derives knowledge from executable predicates, inserts idempotent human observations, builds bounded consequences and one opaque narrator packet, stores the packet in the existing immutable pending narration row, and advances `visibility_projected` through the fenced turn repository transaction. The state repository replaces raw-ID public projection fields with a whitelisted opaque packet/public-entry shape and adds event exposures to protected audit truth.

Evidence:

- [x] Direct perception uses actor placement at the event's committed world version.
- [x] Local aftermath requires the same actor's later entry, current placement, and an unexpired predicate.
- [x] Route exposure requires a committed inspect, attempt, or traverse action on that route at or after exposure.
- [x] Witness exposure requires a co-located committed contact at or after exposure and durable witness knowledge earned by that boundary.
- [x] Knowledge precedes observation and repeated projection creates no duplicate provenance rows.
- [x] Every public consequence and fact cites one observation handle.
- [x] Protected and public projections stay separate; twenty-three hidden-information probes find zero protected facts.
- [x] One player-caused and one independent consequence are explainable from public fields alone.
- [x] Packet bytes, packet hash, knowledge, observations, turn transition, runtime revision/hash, runtime event, and sanitized turn event commit atomically under the exact lease epoch.
- [x] Focused tests, typecheck, diff check, GLM copy review, Krypton reviews, and independent semantic verification pass.

Depends on: Tasks 3A, 3B, 6B, and 8B complete.

Parallel safe: read-only review only. Main implementation remains sequential.

## Campaign Play Task 10A Execution Packet (2026-07-11)

Task: fenced turn worker and recovery service.

Owner: main agent. Repository and acceptance exploration plus final Krypton gates are read-only support packets.

Input: one campaign-scoped database handle, the active turn's durable recovery state, a unique worker owner, injected monotonic time and heartbeat scheduling, and stage executors supplied later by the opening/player runtimes.

Files allowed:

- `backend/src/campaign-play/turn-service.ts`
- `backend/src/campaign-play/turn-service.test.ts`
- `backend/src/campaign-play/campaign-play-turn-repository.ts`
- `backend/src/campaign-play/campaign-play-turn-repository.test.ts`
- `backend/src/campaign-play/index.ts`
- `rpi/campaign-play/implement/10a-turn-service.md`
- `tasks/todo.md`

Files forbidden: opening and player-action orchestration, narrator/Rulebook/actor/visibility behavior, API/UI routes, legacy gameplay, fallback/provider switching, hidden retries, compatibility adapters, and schema migration unless current storage proves insufficient for a required invariant.

Output: one mechanics-owned async worker service that interprets repository recovery states, claims unowned or expired deterministic stages, starts external attempts atomically with claims, runs external work outside SQLite transactions under same-epoch heartbeat renewal, interrupts expired/orphaned attempts without a provider call, requires explicit resume for external attempts, auto-continues deterministic committed work, rejects late epochs, exposes ledger-derived queue/stage telemetry, and discovers one campaign's active turn at startup.

Recovery decision:

- A worker with a live lease is authoritative until expiry. A killed process becomes safely recoverable at lease expiry; pre-expiry liveness guesses would risk interrupting a genuine provider call.
- Campaign enumeration remains an injected mechanics-owned startup concern for Task 11. Task 10A discovers the active turn inside its addressed campaign only.
- Existing 0027–0030 tables own attempts, epochs, leases, runtime events, sanitized turn events, and active-turn locking. Queue/stage measurements derive from their durable timestamps unless implementation proves a storage gap.

Evidence:

- [x] Two competing services produce one claim, one started attempt, one provider call, one accepted artifact, and one stage transition.
- [x] The provider call observes its started attempt committed and runs outside the claim transaction.
- [x] Same-owner/epoch heartbeat renewal advances runtime and turn event sequences without creating another provider call or attempt.
- [x] Startup discovery calls no provider for a live or expired external attempt; expiry becomes one interruption and retains the active-turn lock.
- [x] Explicit resume creates exactly one new epoch and attempt; discovery alone never resumes external work.
- [x] A late old-epoch completion changes zero artifacts, stages, versions, or event sequences.
- [x] A committed deterministic stage survives close/reopen and advances once with zero provider calls.
- [x] Queue and stage durations reconstruct identically from durable ledgers after reopen.
- [x] Focused tests, backend typecheck, diff check, GitNexus change detection, Krypton POST/correctness/maintainability reviews, and fresh semantic verification pass.

Depends on: Task 3B complete. Task 10B/10C consume this service after Task 10A closes.

Parallel safe: read-only exploration and review only. Main implementation remains sequential.

## Campaign Play Task 10A Review (2026-07-11)

- Added the campaign-scoped `CampaignPlayTurnService` with one-stage dispatch, atomic external claim/attempt start, same-epoch heartbeat renewal, explicit external resume, deterministic restart continuation, late-epoch fencing, and startup discovery.
- Added repository-owned accepted-artifact and durable worker-timing readers. Recovery reconstructs queue time and renewal count from the exact runtime/turn ledgers after close/reopen.
- External operational failures require `CampaignPlayExternalStageInterruption`; unexpected handler and repository defects propagate. Completion settlement is structurally synchronous and a renew-only handler raises `turn_stage_stalled`.
- Focused verification passed: 2 files, 42/42 tests. Backend typecheck passed. Full Campaign Play verification passed: 16 files, 250/250 tests. `git diff --check` passed with inherited CRLF warnings.
- Krypton POST review passed. The first maintainability/correctness passes found error-classification and settlement-boundary defects; repairs passed re-review. The fresh final verifier found durable recovery telemetry and same-epoch stall defects; both repairs passed final reverification with P0/P1 `0`.
- GitNexus still reports `CRITICAL` across 45 inherited tracked files and 22 existing flows. The untracked Campaign Play tree remains absent from its index, so source-level callers plus the full suite provide Task 10A blast-radius evidence.
- No schema migration, UI/copy/prompt change, fallback, compatibility path, or standalone smoke suite was added. Evidence: `rpi/campaign-play/implement/10a-turn-service.md`.
- Task 10B/10C integration must keep primary turn model artifacts separate from `actor_replanner` rows before actor settlement is wired through terminal turn reloads.

## Campaign Play Task 10B Execution Packet (2026-07-11)

Task: real opening turn-zero runtime and terminal narration.

Owner: main agent. Architecture inventory, acceptance inventory, and final Krypton gates are read-only support packets.

Input: one accepted and topology-eligible Campaign World, one bootstrapped human player in `opening_required`, one raw chosen or delegated start request, exact opening-planner and narrator model selections, the fenced turn worker, and the campaign-scoped SQLite handle.

Files allowed:

- `backend/src/campaign-play/opening-runtime.ts`
- `backend/src/campaign-play/opening-runtime.test.ts`
- `backend/src/campaign-play/narrator.ts`
- `backend/src/campaign-play/narrator.test.ts`
- `backend/src/campaign-play/opening-planner.ts`
- `backend/src/campaign-play/opening-planner.test.ts`
- `backend/src/campaign-play/contracts.ts`
- `backend/src/campaign-play/contracts.test.ts`
- `backend/src/campaign-play/rulebook.ts`
- `backend/src/campaign-play/rulebook.test.ts`
- `backend/src/campaign-play/actor-scheduler.ts`
- `backend/src/campaign-play/actor-scheduler.test.ts`
- `backend/src/campaign-play/campaign-play-state-repository.ts`
- `backend/src/campaign-play/campaign-play-state-repository.test.ts`
- `backend/src/campaign-play/campaign-play-turn-repository.ts`
- `backend/src/campaign-play/campaign-play-turn-repository.test.ts`
- `backend/src/campaign-play/visibility-service.ts`
- `backend/src/campaign-play/visibility-service.test.ts`
- `backend/src/campaign-play/index.ts`
- `shared/src/campaign-play.ts`
- `rpi/campaign-play/implement/10b-opening-runtime.md`
- Task-local prompt/copy review notes

Files forbidden: API/UI routes, player-action runtime, legacy game/chat paths, provider switching, compatibility adapters, fallback paths, schema migrations unless a proved persistence gap requires re-planning, and standalone smoke suites.

Output: one restartable `turnKind=opening` orchestration over the existing durable turn ledger. It validates before admission, accepts one strict opening artifact, atomically settles the exact Rulebook bootstrap plus actor plans/schedules, records zero opening actor actions, freezes the Task 9 public packet, accepts one packet-bound narration, and atomically publishes narration with `setup_phase=ready` and terminal completion.

Implementation boundaries:

- Opening admission reuses the repository idempotency, active-turn, supersession, expected-version, and topology fences. Chosen conditions carry one opaque accepted-world location handle plus bounded role, arrival-mode, and immediate-situation text; delegated conditions carry no chosen values. This replaces the unsupported detail-handle catalog with the Task 10B request contract and requires no compatibility shape. User-correctable start/role/phase/topology/idempotency errors create zero turn rows.
- External planner and narrator calls run outside SQLite transactions and use one strict structured attempt. Transport, timeout, and schema failures become durable `interrupted` stages requiring explicit resume on the same turn.
- The accepted opening artifact is reloaded from SQLite and fully parsed before settlement. Its exact bootstrap commands execute through Rulebook inside the `planned -> primary_settled` fenced transaction together with exact actor plan/schedule rows.
- Rulebook owns mechanical mutations and receipts. Opening runtime owns the phase boundary: mechanical bootstrap leaves `setup_phase=opening_required`; accepted terminal narration changes it to `ready` with `opened_at` in the completion transaction.
- `primary_settled -> actors_settled` validates stored plans/schedules and creates zero actor jobs, proposals, or actions for turn zero.
- Task 9 owns visibility derivation and immutable packet storage. For an opening turn, the packet includes a typed `openingContext` containing the already-public role, arrival mode, and immediate situation from the accepted opening artifact; those facts are covered by the same canonical bytes and `publicPacketHash`. Narrator receives only that packet and every suggested action/effect must satisfy the shared packet contract.
- Opening planner exports one strict full-artifact parser for restart reload. Actor scheduler owns the exact plan/schedule persistence-and-validation seam so opening runtime does not duplicate actor-table SQL.
- Terminal `failed` is available only before `primary_settled` with a zero-mutation audit. A successor opening must name that failed turn exactly once. From `primary_settled` onward, recovery continues the same ledger to completion.
- A deterministic defect or process stop after `primary_settled` commits zero partial stage rows. The exact lease expires, the same stage becomes automatically claimable, and the same active ledger continues. Deterministic stages do not use the external model-attempt `interrupted` state and cannot enter terminal `failed` after primary settlement.
- Narrator model output is an expressive proposal only. Code loads the pending narration row, assigns its deterministic `narrationId`, the exact `turnId`, beat IDs, action labels, display text, and worker-clock `createdAt`, then validates the shared narration schema and pending identity before acceptance.

Acceptance evidence:

- [x] Chosen and delegated starts complete one idempotent opening ledger each on real migrated SQLite campaigns.
- [x] Invalid start handle, role, idempotency, phase, and topology fail before admission with zero ledger/runtime mutation.
- [x] Planner and narrator transport, timeout, and schema failures persist `interrupted`; explicit resume completes the same ledger and late epochs change zero rows.
- [x] A zero-mutation failed opening is superseded exactly once by a successor that records `supersedesTurnId`; mutation-bearing or unnamed successors fail closed.
- [x] Bootstrap commands, receipts, causal events, placements, clock/pressures, actor plans/schedules, both authority hashes/versions, runtime event, and `primary_settled` commit atomically.
- [x] Opening actor settlement records zero actor actions while validating every initialized eligible actor plan/schedule.
- [x] Public packet canonical bytes/hash remain identical across restart and narrator retry; protected cast/goal/location truth stays absent.
- [x] Narration gives concrete orientation and actionable hooks without a cast dump; choices bind exactly to packet intents and effects bind to emitted beats.
- [x] Narration row, `setup_phase=ready`, `opened_at`, completed turn, lock release, terminal runtime/turn events, and runtime hash/revision commit atomically.
- [x] Process-stop fixtures after every durable stage resume without repeated model calls, commands, receipts, actor schedules, packet rows, or terminal events.
- [x] Injected actor-plan validation and visibility persistence failures after primary settlement leave their stage unchanged; expiry and a fresh worker complete the same ledger once.
- [x] Narrator input canonical bytes exactly equal the persisted `packet_json` bytes after restart, including chosen opening context and excluding protected cast, goals, and non-local locations.
- [x] Focused tests, all Campaign Play tests, backend typecheck, GitNexus change detection, GLM/humanizer/deslop prompt review, Krypton post-plan review, and fresh semantic verification pass.

Playtest depth for this task: opening turn zero and `0` completed player actions. Task 10C connects player actions; Tasks 17 and 18 own real multi-action and long-run playtests.

Depends on: Tasks 5, 6B, 6C, 9, and 10A complete.

Parallel safe: read-only inspection and verification only. Main implementation remains sequential because Rulebook phase ownership, turn transitions, and narrator completion share one transactional boundary.

## Campaign Play Task 10B Review (2026-07-11)

- Implemented one durable opening runtime from pre-admission validation through strict planning, atomic Rulebook and actor initialization, zero-action actor validation, visibility packet freeze, packet-bound narration, and atomic terminal readiness.
- Chosen and delegated starts both complete on freshly migrated SQLite campaigns built through Campaign World acceptance and production player bootstrap. Task depth is opening turn zero with `0` completed player actions.
- Added explicit planner/narrator interruption and same-ledger resume, late completed replay with zero new rows, restart after every committed stage, post-primary deterministic rollback plus lease-expiry recovery, and audited zero-mutation failed-opening supersession.
- Fresh Sol review found and repaired one durable timestamp identity mismatch between the pending narration row and accepted narrator artifact. Final independent Sol xhigh verification passed with P0/P1 `0`.
- Verification passed: opening integration 9/9; focused final gate 61/61; all Campaign Play 266/266; backend typecheck; shared build; `git diff --check` with inherited line-ending warnings only.
- GitNexus still reports global `CRITICAL` across 45 inherited tracked files and 22 indexed flows. Task 10B's untracked Campaign Play symbols remain absent from the index, so direct source trace plus executable SQLite tests provide the local proof.
- Droid GLM-5.2 completed with exit code 0 but returned only `Plan is up-to-date.`; it supplied no substantive prompt verdict. Humanizer/deslop inspection and two Sol semantic reviews found no required rewrite. No smoke suite, fallback, provider switch, compatibility path, schema migration, API/UI route, or player-action runtime was added.
- Durable evidence: `rpi/campaign-play/implement/10b-opening-runtime.md`.

## Campaign Play Task 10C Execution Packet (2026-07-11)

Goal: complete one real `player_action` ledger from a currently rendered public scene through Judge, deterministic uncertainty, GM planning or a code-owned no-effect result, primary Rulebook settlement, sequential living-world actor work, visibility, packet-bound narration, and atomic terminal completion.

Intent: make the first counted gameplay action genuinely playable and restartable. Opening remains turn zero; Task 10C acceptance counts exactly `1` completed player action on a real migrated campaign.

Truth owners:

- Campaign SQLite owns admission, frozen protected frames, model selections and price rates, attempts, artifacts, due sets, actor jobs, receipts, public packet bytes, narration, telemetry inputs, and terminal reason.
- Rulebook owns every mechanical mutation and receipt.
- Judge owns bounded action interpretation; code owns uncertainty resolution and the impossible/clarification branch.
- GM owns executable primary command planning for actionable rulings.
- Actor scheduler, proposal service, and replanner own living-world work after the primary batch.
- Visibility owns the public packet. Narrator receives only its exact persisted canonical bytes.

Cutover: `turn-runtime.ts` is the mechanics-owned player-action orchestrator. Legacy game/chat/worldgen flows remain reference-only and stay outside its import graph.

Kill criteria:

- A repeated provider call, command, receipt, actor job, due-set decision, packet row, narration row, or terminal event for the same accepted attempt fails acceptance.
- A late worker epoch or late actor replanner result that changes durable state fails acceptance.
- Protected IDs, hidden facts, Judge reasoning, GM bindings, or actor goals reaching the narrator packet fail acceptance.
- A completed turn lacking narration or a terminal reason fails acceptance.
- A process stop that strands a claimed actor job or requires an automatic provider retry fails acceptance.

### Task board

#### 10C.1 — Contract and storage seam

Owner: main agent.

Input: Tasks 3B, 7, 8B, 9, 10A, and 10B contracts plus the proven due-set and actor-replanner recovery gaps.

Files allowed:

- `shared/src/campaign-play.ts`
- `backend/src/campaign-play/contracts.ts`
- `backend/src/campaign-play/contracts.test.ts`
- `backend/src/campaign-play/campaign-play-turn-repository.ts`
- `backend/src/campaign-play/campaign-play-turn-repository.test.ts`
- `backend/src/campaign-play/campaign-play-database.ts`
- `backend/src/campaign-play/campaign-play-database.test.ts`
- `backend/src/campaign-play/actor-scheduler.ts`
- `backend/src/campaign-play/actor-scheduler.test.ts`
- `backend/src/campaign-play/actor-proposal-service.ts`
- `backend/src/campaign-play/actor-proposal-service.test.ts`
- `backend/src/campaign-play/actor-replanner.ts`
- `backend/src/campaign-play/visibility-service.ts`
- `backend/src/campaign-play/visibility-service.test.ts`
- `backend/src/campaign-play/campaign-play-state-repository.ts`
- `backend/src/campaign-play/campaign-play-state-repository.test.ts`
- `backend/src/campaign-play/opening-runtime.ts`
- `backend/src/campaign-play/opening-runtime.test.ts`
- `backend/src/db/schema.ts`
- `backend/drizzle/0031_campaign_play_turn_runtime.sql`
- `backend/drizzle/meta/0031_snapshot.json`
- `backend/drizzle/meta/_journal.json`

Files forbidden: API/UI routes, legacy gameplay, compatibility adapters, fallback/provider switching, hidden retries, and unrelated schema.

Output:

- A strict persisted Judge artifact containing the accepted ruling, code-owned uncertainty resolution, uncertainty authority, and public-safe action result fields.
- Player-action model selection freezes `judge`, `gameMaster`, `actorReplanner`, and `narrator`, including the exact price rates required to reconstruct estimated cost after restart.
- Judge artifact acceptance, disposition-specific stage advance, and creation of the code-owned zero-command plan commit in one SQLite transaction: actionable rulings advance `admitted -> judged`; `impossible` and `clarification_required` advance `admitted -> planned`. The no-effect branch creates zero `game_master` model-stage rows, attempts, usage records, artifacts, or provider evidence. Recovery routes exclusively from the persisted Judge disposition and performs zero GM provider calls.
- `CampaignPlayNarratorPacket` gains hash-covered `actionContext`: submitted public text, normalized public intent kind, disposition, public result, and optional clarification question. Opening packets carry `actionContext: null`; player-action packets carry `openingContext: null`.
- One immutable due-set row per player-action turn stores canonical decision bytes/hash plus base world version, runtime revision, and settled world time.
- Actor-job fencing records the owning main-turn worker epoch and supports an explicit durable `interrupted` state. A claimed replanner tied to an expired main-turn epoch transitions atomically to interrupted with its started model stage; explicit resume claims a fresh actor and turn epoch. Late results fail both fences.
- One terminal-result row per completed or failed turn stores an enumerated terminal reason in the same transaction as the terminal turn update. Migration backfills existing opening and terminal-failure ledgers before the invariant becomes active.
- Direct dependent edits in Visibility, opening, scheduler, proposal, replanner, and state-projection files are limited to the strict contract/storage handshake required to keep the tree green. Task 10C.3 retains actor orchestration and recovery policy; Task 10C.4 retains final packet derivation, narration, and telemetry aggregation.

Evidence:

- [x] Strict schemas reject mixed opening/action contexts, unpriced model selections, malformed Judge artifacts, corrupt due-set hashes, and invalid actor-job transitions.
- [x] Migration tests prove the exact final schema, constraints, triggers, and foreign keys on fresh migrated SQLite.
- [x] Repository tests prove the no-effect stage shortcut, immutable due-set identity, expired actor-replanner interruption, explicit resume, and late-epoch rejection.

Review (2026-07-11):

- Persisted contracts now freeze priced `judge`, `gameMaster`, `actorReplanner`, and `narrator` selections, enforce the disposition-specific Judge artifact, and carry one mutually exclusive public `actionContext`/`openingContext` into the narrator packet.
- The storage seam now persists canonical immutable due sets, fences actor work with both actor and owning-turn epochs, supports explicit durable replanner interruption/resume, and writes an enumerated terminal result atomically with terminal turn state.
- The impossible/clarification branch commits the code-owned zero-command plan directly to `planned`; tests prove it creates zero Game Master stages, attempts, artifacts, usage, or provider evidence and recovers from the stored Judge disposition.
- Final validation: shared build passed; backend typecheck passed; all Campaign Play tests passed (`18` files, `271` tests); Drizzle reported `No schema changes`; `git diff --check` passed. Standalone smoke additions: `0`.
- Two delegated final reviewers stalled after a focused status request and were stopped under the recorded non-blocking review rule. The main-agent gate rechecked the packet evidence, complete Campaign Play regression suite, schema drift, and diff hygiene; no in-scope P0/P1 defect remained.
- GitNexus `detect_changes(scope: all)` reports `CRITICAL` for the accumulated branch-wide tracked diff (`45` files, `22` affected processes). Campaign Play remains untracked/unindexed, so this result describes inherited branch scope rather than a mapped Task 10C.1 blast radius. No staging or commit was performed.
- Playtest depth remains opening turn zero and `0` completed player actions. Task 10C.2 is the next packet that makes the first counted action executable; real migrated-campaign playtest acceptance remains owned by the later Task 10C packets.

Depends on: Task 10B complete. Parallel safe: read-only review only.

#### 10C.2 — Admission, Judge, GM, and primary settlement

Owner: main agent.

Input: one `ready` campaign, latest completed public packet/narration, one freeform text or current suggested-action handle, exact version expectations, idempotency key, and frozen model selections/rates.

Files allowed:

- `backend/src/campaign-play/turn-runtime.ts`
- `backend/src/campaign-play/turn-runtime.test.ts`
- `backend/src/campaign-play/judge.ts`
- `backend/src/campaign-play/judge.test.ts`
- `backend/src/campaign-play/game-master.ts`
- `backend/src/campaign-play/game-master.test.ts`
- `backend/src/campaign-play/rulebook.ts`
- `backend/src/campaign-play/rulebook.test.ts`
- `backend/src/ai/generate-object-safe.ts` and its focused boundary tests only for direct abort/deadline propagation and Campaign Play strict-boundary registration required by the Judge/GM transport contract
- repository/contract files from 10C.1 when executable evidence requires a narrow correction
- `backend/src/db/schema.ts`, `backend/drizzle/0027_campaign_play_core.sql`, `backend/drizzle/0030_campaign_play_turn_recovery.sql`, and the 0030/0031 snapshots only for truthful interruption outcomes and precise budget/timeout diagnoses discovered during 10C.2 verification
- `backend/src/campaign-play/actor-scheduler.test.ts` only to replace its obsolete arbitrary GM fixture with the strict accepted GM artifact required by the 10C.2 hard cutover

Files forbidden: actor settlement, visibility/narrator behavior beyond typed inputs, API/UI routes, legacy imports, fallbacks, provider switching, and automatic external retries.

Output:

- Admission validates the current suggested handle or bounded freeform text before mutation, freezes the exact current public packet identity plus protected opaque-handle bindings, and derives a valid Judge frame without exposing server IDs.
- Judge executes one strict external attempt outside SQLite. Code deterministically resolves uncertainty from a frozen seed and persists the complete strict artifact.
- Actionable rulings execute one strict GM attempt outside SQLite, reload and validate its accepted command artifact, re-run Rulebook preflight, and commit the exact primary batch inside `planned -> primary_settled`.
- Impossible and clarification rulings execute zero GM calls, zero Rulebook commands, and commit `planned -> primary_settled` with world-version advance `0`.
- External transport, timeout, schema, and budget failures become durable `interrupted`; explicit resume continues the same ledger and late epochs change zero rows.
- A rendered suggested action freezes its exact intent kind and targets; Judge cannot reinterpret the selected handle. Actionable Judge results exclude `no_effect`.
- The persisted Game Master artifact carries the exact accepted Judge artifact hash, strict command batch, and exact batch hash. Repository acceptance validates it before `judged -> planned`.
- Interrupted model stages persist `transport_error` for transport/lease loss and `invalid` for schema/budget rejection; the error code remains the precise recovery diagnosis.

Evidence:

- [x] Real migrated campaigns complete freeform, current suggested, impossible, clarification, and uncertain action fixtures.
- [x] Invalid/stale suggested handles and invalid admission inputs create zero turn/runtime rows.
- [x] Process stops after admission, Judge acceptance, GM acceptance, and primary settlement reuse accepted artifacts and repeat zero provider calls or commands.
- [x] Primary settlement atomically commits commands, receipts, causal events, versions, runtime event, and turn event under the exact lease.

Review (2026-07-11):

- Implemented the hard-cutover Campaign Play path from admission through one strict Judge attempt, one strict Game Master attempt when actionable, and atomic primary Rulebook settlement. Impossible and clarification rulings settle with zero Game Master calls, zero commands, and zero world-version advance.
- The new runtime depends on Campaign Play contracts and storage. Its only shared seam is the model transport wrapper; the canonical wrapper now forwards abort signals directly. The path imports no legacy world-generation, chat, or gameplay flow and contains no compatibility branch, provider switching, repair attempt, text fallback, or hidden retry.
- Persisted evidence records the provider and concrete structured-output strategy observed at the transport boundary, verifies them against the frozen selection, and normalizes accepted attempts to the durable `strict_object` contract. Judge and Game Master deadlines abort transport and persist `transport_error` with the precise `stage_timeout` diagnosis.
- The repository validates the Game Master artifact's exact accepted Judge hash before `judged -> planned`. Primary settlement repeats Rulebook preflight and commits commands, receipts, causal/runtime/turn events, and versions in one transaction; injected mid-batch failure rolls the transaction back and resumes from the same accepted artifact.
- Real migrated SQLite fixtures cover 13 scenarios: freeform, current suggested action, deterministic and uncertain settlement, impossible and clarification no-effect, stale/invalid zero-write admission, restart after every completed stage, Judge and Game Master timeout/resume with epoch fencing, and atomic Rulebook failure recovery.
- Validation: Campaign Play plus structured-output boundary suite passed (`21` files, `327` tests); independent final verification passed (`8` files, `179` tests); backend typecheck passed; Drizzle reported `No schema changes`; `git diff --check` found no whitespace errors. Standalone smoke additions: `0`.
- The full backend suite reached `3,703` passing tests and reported inherited failures outside this packet: incomplete `AppError` mocks in five legacy suites, a campaign-store manifest mismatch for tables owned by later Campaign Play packets, and one repository race timeout under full-suite parallel load. The same Campaign Play repository suite passes in focused validation, so these results do not invalidate 10C.2.
- Fresh semantic verification verdict: PASS with `0` P0, `0` P1, and `0` P2 findings. Residual coverage opportunities are dedicated per-strategy abort assertions, a provider-mismatch regression, and a distinct narration-created/completed timestamp fixture; static and integration evidence already covers their implemented contracts.
- Final GitNexus `detect_changes(scope: all)` reports `CRITICAL` for the accumulated branch worktree (`45` tracked files, `76` indexed symbols, `23` affected processes). The result includes inherited work across the revamp branch; the new Campaign Play tree remains outside the current index. Shared transport changes received focused boundary tests, full Campaign Play regression, typecheck, and independent semantic verification. No staging or commit was performed.
- Playtest depth is one submitted player action per fresh migrated campaign through `primary_settled`. A fully completed player-visible action still counts as `0` because actor settlement belongs to 10C.3 and visibility/narration belong to 10C.4. No UI/manual playtest claim is made for this packet.

Depends on: 10C.1. Parallel safe: read-only verification only.

#### 10C.3 — Durable sequential actor settlement

Owner: main agent.

Input: exact `primary_settled` worker lease, committed post-primary authority, initialized actor plans/schedules, and frozen actor-replanner selection/rates.

Files allowed:

- `backend/src/campaign-play/turn-runtime.ts`
- `backend/src/campaign-play/turn-runtime.test.ts`
- `backend/src/campaign-play/actor-scheduler.ts`
- `backend/src/campaign-play/actor-scheduler.test.ts`
- `backend/src/campaign-play/actor-proposal-service.ts`
- `backend/src/campaign-play/actor-proposal-service.test.ts`
- `backend/src/campaign-play/actor-replanner.ts`
- `backend/src/campaign-play/actor-replanner.test.ts`
- `backend/src/campaign-play/campaign-play-turn-repository.ts`
- `backend/src/campaign-play/campaign-play-turn-repository.test.ts`
- `backend/src/campaign-play/contracts.ts` and its tests only when actor-owned model-attempt identity or recovery state requires a typed correction
- `backend/src/db/schema.ts`, `backend/drizzle/0031_campaign_play_turn_runtime.sql`, and the 0031 snapshot only when the canonical actor-job transition guard requires a direct hard-cutover correction

Files forbidden: parallel actor settlement, stale-version batch execution, implicit actor provider retry, actor omission as recovery, API/UI routes, and legacy imports.

Output:

- Freeze and persist the complete due set, admit its jobs, schedule changes, and same-stage runtime event atomically before any actor work.
- Process jobs in deterministic due order. Each proposal preflights and settles against the latest committed world version; conflicts become explicit rejected/deferred results with agency debt.
- Replan-required jobs use one externally visible, main-turn-epoch-fenced model attempt. Transport, timeout, schema, budget, persistence, process-death, and lease-loss failures produce a durable interrupted actor stage and pause the turn. Runtime discovery calls zero providers; its production explicit-resume seam claims a fresh main-turn epoch, then a fresh actor epoch/attempt, and rejects results fenced by either prior epoch. Provider completion is fenced by actual observed completion time and an abort deadline inside the same main lease.
- Actor-owned replanner rows use per-job stage identity and coexist with turn-owned Judge, Game Master, opening-planner, and narrator rows. Turn reload validates each owner separately and supports multiple accepted actor-replanner artifacts without treating them as one turn-stage artifact.
- Stops after deterministic actor claim or proposal persistence resume from the stored job/proposal without recompiling accepted bytes, duplicating commands, or losing due order. Proposal terminalization rechecks the live main-turn owner, epoch, expiry, and stage inside its commit transaction.
- Due order is a strict serial barrier: the earliest nonterminal decision settles, rejects, defers, replans, or interrupts before any later actor starts.
- Final `actors_settled` validates an exact wake/defer-to-job bijection plus skip-to-zero-job accounting, zero active jobs or model attempts, proposal/job/result agreement, current plan/schedule pairing, and the serial latest-version command/receipt chain.

Evidence:

- [x] Empty, skipped, deferred, proposed/settled, rejected, and replanned due sets survive close/reopen with identical decision bytes/hash.
- [x] Two due actors settle serially; the second batch cites the first batch's resulting world version.
- [x] Stop after due-set commit, job claim, replan provider return, proposal creation, and each actor receipt resumes without duplicate jobs, plans, proposals, commands, or receipts.
- [x] Expired replanner claim becomes interrupted once; discovery performs zero provider calls; explicit resume calls once; old completion changes zero rows.
- [x] Injected failure inside due-set admission rolls back the due set, jobs, defer schedule changes, runtime revision/event, and turn event together; successful retry commits all of them once.
- [x] `actors_settled` rejects every unaccounted decision and every queued, claimed, interrupted, or proposed job, then commits exactly once only after the validated terminal ledger and latest-version receipt chain are complete.
- [x] Turn reload accepts multiple job-owned actor-replanner stage IDs, validates each against its frozen actor-replanner selection and job epoch, and keeps singular turn-stage artifact loading scoped away from actor-owned attempts.
- [x] Proposal settlement under a replaced or expired main-turn lease changes zero proposal, job, schedule, command, receipt, event, mechanical version, or runtime revision rows.
- [x] A provider result arriving at or after the admitted main-lease deadline changes zero plan, schedule, job, model artifact, command, receipt, mechanical version, or runtime revision rows; recovery persists one interruption before any explicit resume.
- [x] When the first due actor requires replanning, actor two remains untouched until actor one becomes deferred/replanned or the turn pauses interrupted.
- [x] Transport, timeout, schema, budget, and persistence fixtures each produce one interrupted actor model row plus one interrupted job, pause before actor two, make zero provider calls during discovery, and create exactly one fresh attempt on explicit resume.

Validation:

```powershell
npm --prefix backend test -- src/campaign-play/turn-runtime.test.ts src/campaign-play/actor-scheduler.test.ts src/campaign-play/actor-proposal-service.test.ts src/campaign-play/actor-replanner.test.ts src/campaign-play/campaign-play-turn-repository.test.ts src/campaign-play/campaign-play-database.test.ts src/campaign-play/rulebook.test.ts
npm --prefix backend run typecheck
```

Review (2026-07-11):

- The production player-action runtime now owns one strict serial actor path from atomic due-set admission through durable `actors_settled`. It loads the immutable accepted opening exposure seed, processes one due actor per main-lease boundary, and validates the complete job/proposal/plan/schedule/receipt ledger again inside the final SQLite transaction.
- Actor proposals and replans use exact main-turn and actor epochs. Claim, proposal persistence, Rulebook settlement, rejection, replan acceptance/interruption, runtime event, and sanitized turn event changes commit atomically. Both proposal and replanner terminalization re-read the injected campaign clock immediately before the final lease fence.
- Process-stop evidence covers due-set admission, job claim, proposal persistence, replanner provider return, and actor receipt execution. Reopen preserves accepted bytes, discovery calls zero providers, explicit resume creates one fresh epoch/attempt, and late or deadline-crossing work changes no terminal state.
- The alternate bulk actor API was removed. `processNext` is the sole production executor; Campaign Play imports no legacy gameplay, chat, or world-generation path and enables no repair, text fallback, provider switching, implicit external retry, parallel actor settlement, or stale-version execution.
- Validation passed: the exact Task 10C.3 matrix passed (`7` files, `114` tests); all Campaign Play tests passed (`20` files, `301` tests); backend typecheck and `git diff --check` passed. Standalone smoke additions: `0`.
- Krypton POST, correctness, and maintainability reviews all passed with `0` P0, `0` P1, and no unsupported evidence item. The dedicated replanner contract test owns the strict accepted path; production runtime integration tests own failure, expiry, reopen, and explicit-resume policy.
- Final GitNexus `detect_changes(scope: all)` remains `CRITICAL` for the accumulated branch worktree (`45` tracked files, `76` indexed symbols, `23` affected processes). The new Campaign Play tree remains untracked/unindexed, so the report describes inherited branch scope rather than a mapped 10C.3 blast radius. No staging or commit was performed.
- The packet stops at durable `actors_settled`. Playtest depth remains opening turn zero and `0` completed player actions because Task 10C.4 still owns visibility, narration, terminal telemetry, and the first completed player-action claim.

Stop boundary: stop exactly at durable `actors_settled`. Task 10C.4 owns visibility, public-packet projection, narrator execution, and terminal telemetry aggregation. Compatibility paths, legacy imports, repair attempts, text fallback, provider switching, hidden retries, parallel actor settlement, and stale-version execution remain forbidden.

Depends on: 10C.2. Parallel safe: read-only verification only.

#### 10C.4 — Visibility, narration, terminal telemetry

Owner: main agent.

Input: exact `actors_settled` lease, committed public/protected provenance, strict Judge artifact, durable stage/model ledgers, and frozen narrator selection/rates.

Files allowed:

- `backend/src/campaign-play/turn-runtime.ts`
- `backend/src/campaign-play/turn-runtime.test.ts`
- `backend/src/campaign-play/visibility-service.ts`
- `backend/src/campaign-play/visibility-service.test.ts`
- `backend/src/campaign-play/narrator.ts`
- `backend/src/campaign-play/narrator.test.ts`
- `backend/src/campaign-play/turn-service.ts`
- `backend/src/campaign-play/turn-service.test.ts`
- contract/repository files from 10C.1 for the accepted packet and telemetry seams
- `rpi/campaign-play/implement/10c-player-turn-runtime.md`
- `tasks/todo.md`
- Task-local prompt/copy review notes

Files forbidden: API/UI routes, evidence exporter/playtest bundle work, legacy gameplay, fallbacks, provider switching, hidden retries, and standalone smoke suites.

Output:

- Visibility derives `actionContext.submittedText` from the frozen admission document. It derives normalized intent kind, disposition, public result, and clarification question from an explicit public projection of the accepted Judge artifact. Judge reasoning, cited protected facts, opaque bindings, uncertainty seed material, and internal identifiers stay outside the packet. The persisted packet schema verifies `actionContext` against both durable sources before freezing canonical bytes/hash once.
- Narrator receives exactly the persisted packet bytes and proposes expressive beats only; code owns narration/choice/effect IDs and validates all references.
- Narrator interruption and explicit resume reuse the same packet and execute zero mechanical commands.
- Narration, completed turn, active-lock release, terminal runtime/turn events, and terminal reason commit atomically.
- Durable telemetry reconstructs per-stage and total latency, queue time, tokens, estimated cost, and terminal reason from frozen rates plus committed ledgers identically before and after reopen. Integer price rates persist with currency, token unit, and rounding rule. Queue and stage latency derive from named durable claim/resume/completion timestamps; terminal latency derives from submitted and terminal timestamps. Aggregation covers every committed model attempt, including interrupted actor-replanner attempts. Attempts whose provider usage is unavailable retain null usage, set `costComplete: false`, and keep estimated cost nullable. The enumerated terminal reason persists inside the atomic terminal commit.

Evidence:

- [x] Packet bytes/hash remain identical through restart and narrator interruption; hidden-information probes find zero protected facts.
- [x] Actionable, no-effect, and clarification narration remain grounded in `actionContext` and current visible scene.
- [x] Stop after visibility and after narrator provider return produces one narration and one terminal event with zero command replay.
- [x] Reopened telemetry equals pre-close telemetry field-for-field and accounts for Judge, GM when present, actor replanner when present, narrator, queue, per-stage, total, and terminal reason.
- [x] Focused verification from PLAN, all Campaign Play tests, backend typecheck, shared build, diff check, GitNexus change detection, humanizer/deslop prompt review, Krypton post-plan review, correctness review, maintainability review, and fresh semantic verification pass.

Playtest depth: one opening plus exactly `1` completed player action on real migrated Campaign Play storage. Tasks 11–16 expose the player route/UI; Tasks 17–18 own real multi-action and long-run player playtests.

Depends on: 10C.3. Parallel safe: read-only review only.

## Campaign Play Task 10C Post-Plan Review (2026-07-11)

- Fresh Sol review returned `REVISE` with three P1 findings and zero P0 findings.
- The packet now makes Judge acceptance, disposition routing, and the zero-command plan one atomic transaction; the no-effect branch creates zero GM attempts or evidence.
- `actionContext` now joins submitted text from the frozen admission document with an explicit public projection of the accepted Judge artifact.
- Telemetry now defines durable timestamps, integer pricing units and rounding, nullable incomplete usage/cost, actor-replanner aggregation, and atomic terminal-reason persistence.
- Focused Sol re-review returned `PASS` with remaining P0/P1 findings `0`.
- Planning changed documentation only. No implementation, schema mutation, provider call, test suite, or smoke test ran at this boundary.

## Campaign Play Task 10C Review (2026-07-12)

- One real migrated Campaign Play campaign now completes opening turn zero and exactly one player action through Judge, Game Master or deterministic no-effect routing, Rulebook settlement, serial actor work, visibility, packet-bound narration, atomic terminal completion, and reopened telemetry.
- Restart and interruption proofs preserve canonical narrator bytes, execute zero replayed mechanical commands, fence stale epochs, and produce one accepted narration, one result, and one terminal event.
- Durable telemetry includes Judge, Game Master, actor replanner, and narrator attempts; incomplete provider usage keeps cost incomplete and nullable. Interrupted identity persists only when provider, model, and strategy are all observed.
- Final verification passed: selected suite `119/119`, all Campaign Play tests `312/312`, backend typecheck, shared build, and diff check. Diff hygiene reports inherited line-ending warnings only.
- Krypton POST, correctness, maintainability, and fresh Sol semantic verification all passed with remaining P0/P1 findings `0`. Prompt/copy review passed through direct Sol semantic review plus `humanizer` and `deslop`; GLM is outside the current delivery pipeline.
- GitNexus change detection reports the inherited dirty tracked scope as `CRITICAL`; current Campaign Play files remain outside its index. Direct source tracing, integration tests, and independent Sol reviews provide the local Task 10C evidence.
- Standalone smoke-suite additions: `0`. Evidence: `rpi/campaign-play/implement/10c-player-turn-runtime.md`.

## Campaign Play Task 11 Execution Packet (2026-07-12)

Goal: expose the durable Campaign Play runtime through one campaign-scoped HTTP and SSE boundary, then recover eligible work after process restart.

Plan path: `docs/goals/campaign-play/PLAN.md`, Task 11.

Truth owner: Campaign Play state, turn, narration, observation, and event ledgers.

Contract boundary: `/api/campaigns/:id/play/*` plus one startup recovery registration in `backend/src/index.ts`.

Cutover: Task 11 creates the mechanics-owned transport. Task 15 removes the active `/api/chat` and old character handoff.

Acceptance evidence: real migrated campaign storage, public-schema parsing, HTTP request and response assertions, durable SSE replay, process restart, explicit resume, terminal replay, and concurrent admission.

Kill criteria: any provider switch, second model attempt hidden behind one request, repeated committed command, protected payload in a response or log, optimistic world mutation, or recovery that resumes an interrupted external stage without a player request.

### 11A. Public contract corrections

Owner: main agent.

Input: the Task 2A public DTOs, Task 5 opening contract, Task 10C frozen model selection, and the approved Task 12 UI field inventory.

Files allowed:

- `shared/src/campaign-play.ts`
- `backend/src/campaign-play/contracts.ts`
- `backend/src/campaign-play/contracts.test.ts`
- `backend/src/campaign-play/opening-options.ts`
- `backend/src/campaign-play/opening-options.test.ts`
- `backend/src/campaign-play/opening-runtime.ts`
- `backend/src/campaign-play/opening-runtime.test.ts`
- model-evidence and telemetry files required for explicit unknown-pricing semantics
- `backend/src/campaign-play/index.ts`
- `tasks/todo.md`

Output:

- Chosen opening requests carry `locationHandle`, `roleHandle`, `arrivalModeHandle`, and `immediateSituationHandle`.
- One pure opening-options module derives bounded viable locations and code-owned detail handles from immutable accepted-world truth. The same module resolves handles for runtime admission.
- Public errors include `idempotency_conflict` and `invalid_event_cursor` with fixed status metadata.
- Resume requests carry version expectations. The service derives the interrupted stage and epoch from durable turn truth.
- Frozen model pricing records whether rates are known. Unknown rates produce nullable cost and `costComplete: false` while time and token budgets remain enforced.

Evidence:

- [x] Public schemas reject labels where a handle belongs and reject a detail handle from another location or option family.
- [x] A reachable viable chosen location resolves to exact internal labels and reaches the opening planner.
- [x] Same-key/different-input admission maps to `idempotency_conflict`.
- [x] Unknown pricing remains nullable before and after reopen.

Stop condition: public contracts, runtime admission, and telemetry agree. HTTP routes remain outside this packet.

### 11B. Public read model and campaign application service

Owner: main agent.

Input: stable repository read APIs, one addressed campaign database, current settings, frozen turn model selection, and an injected campaign enumerator.

Files allowed:

- `backend/src/campaign-play/campaign-play-read-model.ts`
- `backend/src/campaign-play/campaign-play-read-model.test.ts`
- `backend/src/campaign-play/campaign-play-application.ts`
- `backend/src/campaign-play/campaign-play-application.test.ts`
- `backend/src/campaign-play/index.ts`
- narrow supporting changes proved necessary by the packet
- `tasks/todo.md`

Files protected by default: `createCampaignPlayStateRepository` is CRITICAL and `createCampaignPlayTurnRepository` is HIGH in the current GitNexus graph. New modules consume their existing `loadState`, `loadActiveTurn`, `loadTurn`, and `listTurnEvents` surfaces.

Output:

- The read model assembles `CampaignPlayState`, exact turn reads, and cursor-based journal pages from public projections and durable rows.
- First state load creates the campaign play state exactly once after the accepted-world gate.
- Character intake and bootstrap bind to the addressed campaign and return public DTOs.
- Admission freezes current role selections: judge uses `judge`; opening planner, game master, and actor replanner use `generator`; narrator uses `storyteller`.
- Restart reconstructs each runtime from its frozen provider and model plus current credentials for that exact provider.
- A per-campaign driver advances one durable stage at a time, closes its database handle, and stops at interruption or terminal completion.
- Startup recovery continues deterministic and never-started work. A live foreign lease remains authoritative until expiry. Interrupted external work waits for explicit resume.

Evidence:

- [x] State phases cover character required, opening required, opening active, ready, turn active, and narration pending.
- [x] Concurrent state initialization produces one state and one creation event.
- [x] Concurrent same-key admission produces one turn and one driver.
- [x] Restart uses the frozen model identity and makes zero provider calls for an interrupted attempt.
- [x] Explicit resume creates one new epoch and one provider call.
- [x] Completed turn and journal reads remain byte-stable after reopen.

Stop condition: application tests prove persistence and recovery without an HTTP server.

### 11C. HTTP, SSE, and startup registration

Owner: main agent.

Input: the 11B application service and the stable public schemas.

Files allowed:

- `backend/src/routes/campaign-play.ts`
- `backend/src/routes/campaign-play.test.ts`
- `backend/src/campaign-play/index.ts`
- `backend/src/index.ts`
- `rpi/campaign-play/implement/11-api.md`
- `tasks/todo.md`

Output:

- Mount the complete `/api/campaigns/:id/play/*` route family.
- Admission and resume return `202` after durable validation and driver scheduling.
- SSE replays numeric event sequence through `Last-Event-ID` or `afterSequence`, reads SQLite only, and closes on interruption or terminal state.
- Backend startup enumerates campaigns and registers recovery after the server begins listening.
- Error responses contain only the strict `CampaignPlayErrorResponse` fields.

Evidence:

- [x] Route tests cover accepted-world gate, character setup, opening, player admission, typed stale and concurrency errors, disconnect/reconnect, terminal replay, and explicit resume.
- [x] Every response, SSE payload, and journal page parses through its public schema.
- [x] A real migrated campaign completes opening plus one player action through the mounted route family.
- [x] Backend typecheck, full Campaign Play tests, full backend tests, production build, diff check, GitNexus change detection, correctness review, and maintainability review pass.

Stop condition: the mounted API proves the Task 11 acceptance matrix. Frontend work remains in Tasks 13 and 14.

Plan prose review: main Sol reviewed the packet for direct technical language. `humanizer` and `deslop` found no filler, promotional language, fake contrasts, or unsupported claims after the final edit.

## Campaign Play Task 11 Review (2026-07-12)

- The campaign-scoped application and route family now cover character setup, opening, player actions, exact turn reads, journal paging, SSE replay, interruption, resume, startup recovery, and durable same-key replay.
- The mounted route playtest creates a migrated accepted campaign and completes player bootstrap, opening, one player action, public reads, ledger checks, and exact reopen comparisons. It exposed a missing durable narration timestamp in the state projection; the source projection was corrected and the same playtest passed.
- Verification passed: Campaign Play and route suite `322/322`, full backend suite `3886/3886`, backend typecheck, shared/frontend/backend production build, diff check, and GitNexus change detection at LOW risk with zero affected indexed processes.
- A first unconstrained backend run hit the five-second limit in one existing SQLite race test. The isolated race test passed, and the complete bounded-worker run passed all 3,886 tests.
- Fresh Sol semantic verification returned `PASS` with remaining P0/P1 findings `0`. Humanizer/deslop review found the Task 11 note and public copy direct and evidence-bound. GLM remains outside the delivery pipeline. Standalone smoke additions: `0`.
- Evidence: `rpi/campaign-play/implement/11-api.md`.

## Campaign Play Task 13 Execution Packet (2026-07-12)

Goal: connect the mounted Campaign Play API to one campaign-scoped client state machine that survives replay, reconnect, reload, interruption, and terminal completion without inventing local world state.

Truth owner: `CampaignPlayState`, exact durable turn reads, Campaign Play SSE, public errors, and journal pages.

Files:

- `frontend/lib/campaign-play-api.ts`
- `frontend/lib/campaign-play-api.test.ts`
- `frontend/app/(play)/layout.tsx`
- `frontend/components/campaign-play/CampaignPlayPage.tsx`
- `frontend/components/campaign-play/CampaignPlayPage.test.tsx`
- `rpi/campaign-play/implement/13-frontend-state.md`
- `tasks/todo.md`

Acceptance evidence:

- [x] Typed state, player, opening, turn, resume, event, and journal calls validate the public wire contract.
- [x] SSE parsing proves chunked LF/CRLF input, exact duplicate suppression, consecutive ordering, terminal delivery, and empty beyond-tail replay.
- [x] Reload renders every server phase from durable authority.
- [x] Admission locks input synchronously, preserves the draft before accepted `202`, and clears it only after accepted admission.
- [x] Disconnect refetches authority and reconnects from the last accepted sequence; durable interruption remains a separate Resume state.
- [x] Duplicate and out-of-order events never create a local scene, narration, consequence, or terminal claim.
- [x] Terminal completion refetches the exact turn and `/state`, then unlocks from refreshed authority.
- [x] Focused client and component tests, frontend typecheck, production build, diff check, GitNexus change detection, semantic review, correctness review, and maintainability review pass.

Stop boundary: stop at transport, durable page state, semantic status surfaces, and input control. Task 14 owns the final scene, narration, effects, suggestions, consequence, and journal presentation. Task 15 owns product handoff and removal of the old player route.

## Campaign Play Task 13 Review (2026-07-12)

- The new campaign-scoped client covers state, player intake, opening, turns, resume, events, and journal without importing the old player or chat path.
- The page controller keeps world and narration state on the server. It owns only transport, draft, admission, focus-ready status, and the accepted event cursor.
- Campaign navigation, unmount, late GET, late POST, external admission, stream disconnect, duplicate event, sequence gap, resume, terminal completion, and failed-turn paths have direct regression coverage.
- Verification passed: focused `26/26`, complete frontend `514/514`, frontend typecheck, warning-free targeted lint, monorepo production build, and diff check. Standalone smoke additions: `0`.
- Fresh Sol semantic verification returned `PASS` with remaining P0/P1 findings `0`. Humanizer/deslop review kept approved public copy intact and found the evidence direct and specific.
- Evidence: `rpi/campaign-play/implement/13-frontend-state.md`.

## Campaign Play Task 14A Review (2026-07-12)

- The real `/campaign/[id]/play` route now renders chosen or delegated opening setup, public character identity, current location, visible actors, routes, pressures, progressive narration, and beat-bound effects from `CampaignPlayState`.
- Effect regressions cover settled hydration suppression, accepted-artifact activation, bound beat timing, simultaneous effects, clearing on the next beat, same-kind retrigger, and a literal `artifact` beat ID distinct from a null artifact effect.
- Two persisted campaigns prove opening-required and ready states at 1440x900 and 390x844. The opening captures include all selectors and enabled Begin; reduced motion shows both beats, disabled Auto, and the narration's static `flash` treatment. Browser console errors, failed requests, bad responses, and private player text were empty.
- Verification passed: focused `29/29`, complete frontend `525/525`, frontend typecheck, warning-free scoped lint, monorepo production build, diff check, and GitNexus MEDIUM scope with no HIGH/CRITICAL risk.
- Krypton POST returned `ALIGNED`, correctness returned `PASS`, and maintainability returned `MAINTAINABLE`; remaining P0/P1/P2 findings are `0/0/0`. Humanizer/deslop retained direct product copy. Standalone smoke additions: `0`.
- Checkpoints: implementation `b322ed7e`; refreshed GitNexus contains 9,248 symbols, 25,815 relationships, 300 flows, and 7,386 embeddings.
- Evidence: `rpi/campaign-play/implement/14a-scene-narration.md`.

## Campaign Play Task 14B Execution Packet (2026-07-12)

Goal: complete the playable action loop surface around the authoritative Campaign Play state: opaque suggested choices, durable freeform admission, progress and recovery, bounded public consequences, and the earned-observation Journal.

Truth owners: `CampaignPlayState`, `CampaignPlayTurnReadResponse`, Campaign Play SSE, `CampaignPlayJournalPage`, and the existing public error union. Local UI state owns the draft, admission confirmation, reconnect status, Journal page cache/open state, and focus return only.

Files:

- `frontend/components/campaign-play/ActionDock.tsx` and its adjacent test
- `frontend/components/campaign-play/TurnProgress.tsx` and its adjacent test
- `frontend/components/campaign-play/ConsequenceCard.tsx` and its adjacent test
- `frontend/components/campaign-play/JournalDrawer.tsx` and its adjacent test
- `frontend/components/campaign-play/CampaignPlayPage.tsx` and its integration test
- `frontend/app/globals.css`
- `rpi/campaign-play/implement/14b-action-journal.md`
- `tasks/todo.md`

Implementation order:

- [x] Extract opening presentation from the page controller while preserving chosen/delegated admission.
- [x] Bind suggested actions by `choiceHandle` and freeform actions by text; keep the draft until admission returns `202`.
- [x] Move active, disconnected, interrupted, Resume, and terminal-unlock presentation into `TurnProgress` and `ActionDock` without creating optimistic world facts.
- [x] Render the exhaustive public consequence cue mapping and earned Journal pages with `nextCursor` pagination.
- [x] Prove keyboard submission, drawer Escape/focus return and narrow focus trap, polite progress announcements, completion focus, and input locking.
- [x] Capture real persisted campaign states for consequence, Journal, active turn, interruption, public error, and narrow action layout.
- [x] Run focused and complete frontend verification, typecheck, scoped lint, production build, GitNexus change detection, copy review, and fresh Sol semantic verification.

Stop boundary: Task 14B completes the action-and-observation presentation on `/campaign/[id]/play`. Task 15 owns navigation cutover, removal of displaced `/game` and legacy client/router paths, and capture-script productization. Standalone smoke additions remain zero unless verification exposes a named risk that component, integration, or browser evidence cannot cover.

## Campaign Play Task 14B Review (2026-07-12)

- The action surface now supports opaque suggested choices, durable freeform admission, explicit progress and recovery, public consequences, and the earned-observation Journal.
- The ready and opening campaigns prove the current consequence, Journal, accepted opening, Resume, public error, and narrow action layout. Resume advanced the public event sequence from interruption at 3 through a second attempt and interruption at 5.
- Four isolated persisted action lanes prove Judge-active, Narrator-pending, player-action interruption with the committed scene, and terminal failure through the real HTTP/SSE route. Every active/recovery state has 1440x900 and 390x844 evidence. The lane exposed and verified the dedicated non-resumable `turn_failed` contract; its temporary harness and campaign folders were removed after capture.
- Verification passed: focused Task 14B frontend/API 52/52, complete frontend 548/548, mounted route 1/1, focused terminal/runtime backend 114/114, Campaign Play backend 322/322, complete backend 3,886/3,886, both typechecks, scoped lint, production build, diff check, GitNexus MEDIUM scope across 17 indexed change entries (15 code symbols and two task sections) and five affected processes, and fresh Sol review with zero P0/P1 findings.
- The first parallel Campaign Play run hit the existing five-second Windows/SQLite race-test limit. Its isolated retry and the complete serial Campaign Play suite passed.
- Humanizer/deslop retained the direct product copy after normalizing `Open world review` and approved the terminal `turn_failed` copy and next action. GLM remains outside the provider list and delivery pipeline. Standalone smoke additions: `0`.
- Narrow-layout advisory for Task 15 polish: the fixed dock's translucent gaps can reveal scene text behind the controls at 390px; interaction remains usable and the navigation cutover can add a unified dock backdrop.
- Evidence: `rpi/campaign-play/implement/14b-action-journal.md` and `rpi/campaign-play/implement/evidence/task14b/`.

## Campaign Play Task 15 Execution Packet (2026-07-12)

Goal: make the accepted campaign flow enter the campaign-owned character and play surfaces exclusively, then remove the displaced `/game`, `/api/chat`, and worldgen-character path from the mounted product.

Authority and navigation:

- Campaign World state chooses Forge or Review until acceptance.
- Campaign Play state chooses Character while `character_required` and Play for opening or active play phases.
- Character owns parse, research, draft generation, card import, editing, and `PUT /player` only.
- `/campaign/[id]/play` owns chosen or delegated starting conditions and `POST /opening`.
- A campaign destination helper may read both authorities and returns one domain route; callers surface errors instead of guessing a destination.

Implementation packets:

- [x] Add phase-aware campaign navigation and connect Accept -> Character -> Play across Review, Character, home/load, and sidebar callers.
- [x] Replace the active Character page's worldgen APIs and old draft/loadout model with Campaign Play player intake and a campaign-owned editor/card reader.
- [x] Mount production API routes through one testable registration boundary; unmount `/api/chat` and the old character router while preserving Campaign World `/api/worldgen` ownership.
- [x] Remove the `/game` route/controller and active old chat/character client exports after their callers reach zero.
- [x] Replace `visual:v4` and its status-labeled script with a real-campaign Campaign Play capture command; add the unified narrow action-dock backdrop advisory from Task 14B.
- [x] Prove focused route/client/component contracts, displaced backend `404`, direct `/game` Next `404`, fixed-string caller inventories, and normal browser Accept -> Character -> Play with Campaign World/Play network traffic only.
- [x] Run full affected frontend/backend suites, typechecks, production build, diff check, GitNexus change detection, fresh Sol semantic review, then record the Task 15 evidence and checkpoint commit.

Test strategy: use adjacent unit/component tests for destination and character transformations, a mounted-router integration test for backend cutover, and one browser E2E acceptance journey for the critical product path. Create no standalone smoke suite.

Deletion boundary: unmounted donor modules may remain as reference where the production import graph is already zero. Task 15 removes active routes, controllers, exports, and callers; broader donor-source deletion belongs to a later cleanup only when it changes product correctness or build ownership.

Stop condition: normal product navigation reaches Character and Play through campaign-owned APIs, displaced routes prove `404`, and the production import graph has zero old player/chat runtime calls.

## Campaign Play Task 15 Review (2026-07-12)

- Accepted Review now hands off to Character, and every campaign entry point resolves its destination from Campaign World plus Campaign Play phase authority. Character creation, opening, actions, recovery, and Journal all stay on campaign-owned routes.
- The mounted backend keeps Campaign World and Campaign Play while the displaced chat and worldgen-character endpoints return `404`. The `/game` product route is gone and direct navigation renders the Next `404` page.
- A persisted campaign completed the browser handoff into a ready Play scene. Its network ledger contained Campaign World, Campaign Play, campaign metadata, and Next route requests; the displaced APIs were absent. Desktop and 390x844 captures prove the unified narrow action dock.
- Character save conflicts reload authoritative versions while preserving the draft, or continue to Play when another session has already established the character. Adjacent tests cover both concurrency outcomes.
- Verification passed: focused cutover tests, complete frontend `491/491`, complete backend including the new route-registration contract, both typechecks, production build, scoped lint, capture-script syntax, and diff check. Full frontend lint retains the pre-existing Forge hook error and dependency warning.
- Fresh Sol verification returned `PASS` with zero P0/P1 findings; both P2 advisories were resolved. GitNexus impact calls were unavailable through its Ladybug WAL assertion, while exact caller inventories and change detection bounded the cutover. Standalone smoke additions: `0`.
- Evidence: `rpi/campaign-play/implement/15-cutover.md` and `rpi/campaign-play/implement/evidence/task15/`.

## Campaign Play Task 16A Execution Packet (2026-07-12)

Goal: build the deterministic promotion gate and evidence format used by every later Campaign Play lane.

Success criteria:

- Seeded 10, 30, and 60-action runs produce identical canonical projections, receipt order, visibility, actor job state, event cursors, and replay hashes when repeated from the same accepted world and inputs.
- A paired run from one opening produces different durable outcomes for intervention and peripheral wait/leave play while preserving visibility rules.
- One integration lane covers accepted snapshot, player creation, opening turn zero, custom action, reload, process restart, and the next completed action.
- A clean-start child proves independent player, versions, turns, observations, and runtime identity while the parent accepted bytes remain unchanged.
- The bundle validator rejects missing terminals, partial commits, hidden-state leaks, duplicate inputs, stale execution, donor requests, inventory mismatches, and incomplete evidence.
- Task 16A adds focused deterministic and integration tests plus the reusable playtest runner. It adds no standalone smoke suite.

Packet 16A.1, evidence contracts and validator:

- [x] Define strict run configuration, manifest, eligibility, action count, checkpoint, scorecard, and SHA-256 inventory contracts in `e2e/campaign-play/contracts.ts`.
- [x] Implement read-only bundle probes and validation in `e2e/campaign-play/probes.ts` and `e2e/campaign-play/scorecard.ts`.
- [x] Prove complete bundles pass and missing, mismatched, duplicated, leaked, or displaced-path evidence fails through adjacent tests.

Packet 16A.2, deterministic replay:

- [x] Build a seeded Campaign Play fixture from accepted Campaign World through character and opening.
- [x] Execute 10, 30, and 60 completed player actions twice with fixed clock, IDs, model artifacts, RNG, and input scripts.
- [x] Compare canonical public/protected projections, runtime and mechanical versions, receipts, events, jobs, visibility, terminal rows, and replay hash.
- [x] Run paired intervention and peripheral scripts from the same opening and prove distinct durable outcomes with eligible observations only.

Packet 16A.3, restart and provenance integration:

- [x] Aggregate the existing transaction fault, concurrent idempotency, stage restart, narration resume, scheduler fairness, route direction, impossible action, hidden knowledge, and stale proposal proofs into one promotion report.
- [x] Extend the mounted full path through reload, application restart, and a second completed player action.
- [x] Clone an accepted zero-turn parent, bootstrap the child independently, and compare parent and child provenance plus Campaign Play tables.
- [x] Repeat accepted Review byte and hash comparison after real child mechanical and runtime mutations.

Packet 16A.4, runner and promotion gate:

- [x] Implement `e2e/campaign-play/playtest-runner.ts` for deterministic lanes, bundle validation, and later live-lane capture.
- [x] Implement `scripts/capture-campaign-play-state.mjs` as a read-only browser and network evidence collector.
- [x] Emit and validate the required manifest, eligibility, ledgers, checkpoints, probes, transcript, scorecard, screenshots, logs, and inventory.
- [x] Run the complete Task 16A verification matrix, fresh semantic review, GitNexus change detection, checkpoint commit, and push.

Dependencies: 16A.1 fixes the format consumed by 16A.2 through Task 20. Packet 16A.2 supplies replay snapshots to 16A.3. Packet 16A.4 integrates only after deterministic and provenance proofs pass.

Validation:

- `npm --prefix shared run build`
- `npm --prefix backend test -- src/campaign-play src/routes/campaign-play.test.ts src/routes/campaign-play.integration.test.ts src/campaign/__tests__/clone.test.ts`
- `npm --prefix frontend test -- --run`
- `npm --prefix backend run typecheck`
- `npm --prefix frontend run typecheck`
- `npm run build`
- `git diff --check`
- GitNexus impact before existing symbol edits and staged change detection before commit.

Stop condition: the deterministic report contains zero divergence, partial commit, missing terminal, hidden leak, duplicate input, stale execution, or active donor call, and every accepted live defect has a focused regression before Task 16B begins.

Prose review: main Sol applied the humanizer and deslop checks. The packet uses direct technical language, names concrete owners and failures, and contains no promotional or filler copy.

Manual playtest rule for Tasks 16B through 19: the main agent reads the rendered scene and chooses each action from current player-visible information. Automation may enter the chosen action and capture evidence. Deterministic scripts and generated batches do not count as evidence for prose quality, causal sense, reader interest, or living-world motion.

## Campaign Play Task 16B Execution Packet (2026-07-12)

Goal: prove the first genuinely playable real-provider slice through the rendered UI, including prose quality and one visible player-independent consequence.

- [x] Extract one read-only Campaign Play report owner shared by deterministic and live evidence.
- [x] Freeze accepted provenance and eligibility before character creation in a live session.
- [x] Sign each human decision before UI submission and bind it to the exact next durable turn afterward.
- [x] Capture exact CDP network methods, paths, statuses, and request hashes without choosing or submitting actions.
- [x] Merge live browser actions, network evidence, screenshots, reload probes, errors, and human notes into the standard bundle.
- [x] Prove the live session and bundle overlay through adjacent regressions; add no smoke suite.
- [x] Keep `service_unavailable` schema-valid when Campaign Play state itself cannot be loaded, without inventing version context.
- [x] Add strict metered or subscription billing authority and require the live run config to match resolved provider, model, credentials, and billing before character creation.
- [x] Configure and verify Z.AI Coding Plan Pro with `glm-5.2` for Generator, Judge, and Storyteller; freeze provider quota and subscription evidence before character creation.
- [x] Build and accept one fresh eligible Campaign World through normal UI navigation.
- [ ] Complete Character, Opening, one non-menu freeform action, and one peripheral wait/leave action manually.
- [ ] Reach and identify one sourced non-local actor consequence through the player-visible UI.
- [ ] Reload with identical public scene/version/time/observation state and answer the five player-review questions.
- [ ] Validate the complete first-playable bundle, repair accepted defects with focused regressions, then commit and push Task 16B.

Stop condition: Task 16B remains open until a real-provider bundle and manual prose/living-world review pass. Deterministic or scripted narration cannot close it.

## Campaign Play Task 16A Review (2026-07-12)

- Fixed the consecutive-action authority seam: choices now bind through the persisted public observation handle to its exact world event. Two real consecutive actions pass through the same campaign authority.
- Seeded 10-, 30-, and 60-action replays completed twice with identical canonical bytes. The 60-action replay recorded 126 receipts, 918 runtime events, 916 turn events, SQLite `ok`, and zero foreign-key violations.
- The restart lane reopens the application between actions without changing the public projection. The clean-start child completes opening and two actions while the accepted parent database, config, Review bytes, and empty Campaign Play tables remain unchanged.
- The run-config runner writes a strict evidence bundle and immediately validates it. The checked 10-action bundle is promotion-eligible with full receipt, runtime-event, and turn-event coverage; deliberate transcript tampering is rejected by the SHA-256 inventory.
- `scripts/capture-campaign-play-state.mjs` attaches to an already open browser page and only reads public DOM, screenshot, console, and resource timing data. It never selects or submits an action.
- Verification passed: evidence and replay tests `20/20`, focused Campaign Play/clone/routes `331/331`, frontend `491/491`, the complete backend suite, both typechecks, production build, script syntax, bundle validation, and diff check.
- GitNexus initially returned its Ladybug WAL `UNREACHABLE_CODE`; a post-commit index refresh recovered the graph. Final impact is LOW: two direct test callers for `runSeededCampaignPlayReplay`, one self-owned runner caller for `runCampaignPlayCommand`, and zero affected execution flows or production modules.
- Humanizer/deslop review kept the note factual and direct. Deterministic narration is explicitly excluded from prose and playability evidence. Standalone smoke additions: `0`.

## Campaign Play Task 17 Live Diagnosis (2026-07-13)

- [x] Complete one clean 20-action GLM 5.2 lane through the rendered Play UI with a signed decision before every submission.
- [x] Match full backend restart checkpoints after player actions 1, 5, 10, and 20.
- [x] Finalize and validate `causal-20-glm52-ashglass-reach-461289b1-r10`; machine invariants and artifact inventory pass.
- [x] Record the manual prose, causality, agency, continuity, autonomy, and pacing verdict in `rpi/campaign-play/implement/17-live-diagnosis.md`.
- [x] Complete the separate 30-action adaptive diagnostic before accepting fixes.
- [x] Reach action 10 in `diagnostic-30-glm52-ashglass-reach-d2dcc3f0-r01` and prove an exact full-backend restart checkpoint.
- [x] Continue the adaptive diagnostic through actions 11–20 from the restored action-10 state.
- [x] Complete actions 21–30 and the final restart checkpoint, then record the unsealed diagnostic verdict.
- [ ] Convert accepted findings into focused regressions, rerun Task 16A, then replace the failed 20-action promotion attempt only if the plan still requires a pristine pass.

Current verdict: automated invariant gate PASS, human promotion gate REVISE. Major findings are multi-minute turn cadence and three inert collective actors with zero plans, schedules, jobs, or proposals. The 30-action diagnosis also owns static opening prose, repeated NPC wording, unchosen follow-up narration, and unsupported vent acoustics.

Checkpoint 10/30: the new lane independently reproduces 84-event, roughly eight-minute movement while local inspection turns settle near 18–20 events. A one-hour wait produces useful autonomous motion from Keth and Paska, but the follow-up explanation contradicts the established lake pressure. Restart bytes match exactly.

Checkpoint 20/30: four- and two-unit travel settle at 64 and 59 events respectively, pointing to scheduler activation rather than distance as the main cadence cost. Paska repeats one refusal pattern after new evidence, while two quarter-hours at Thray-Hold reveal no council participant, schedule, office, or receiver for Torm's real work. Action 17 required one explicit Resume after a strict GLM 5.2 schema failure; no automatic retry or fallback ran. The correctly tagged action-20 restart matches exactly.

Final 30/30 verdict: FAIL. One-unit travel still costs 47 events; compound freeform travel can narrate arrival without settling canonical location; the council remains an empty pressure while person agents move; and the bounded Judge frame eventually denies and overwrites Mara's real actions 2–4. Action-30 restart matches. The bundle remains intentionally unsealed because action 10 used a generic reload evidence stem. Exact clarification prose equality was removed after three valid Narrator objects hit `narration_invalid`; focused verification passes 46/46 plus backend typecheck.

Root-fix progress:

- [x] Retrieve input-relevant, player-authored history from the current location into the frozen Judge authority without exceeding the existing observation budget.
- [x] Settle compound freeform movement before resolving the co-located action.
- [x] Replace inert collective actor shells with person/job/world-state behavior.
- [x] Bound serial actor work to three admitted opportunities and one accepted replan per player turn without hiding world mutation.
- [ ] Prove all four roots through a fresh manual UI campaign before promotion.

Person/job/world-state cutover:

- Campaign World now creates 6–16 concrete people only: at least one key, two support, and two background people. Every person owns one to three active goals, one present placement, at most one home placement, and participates in a directed relation.
- Institutions, crews, families, councils, movements, shortages, and conflicts are represented through pressure trajectories, person anchors, location anchors, relations, events, and actor jobs. They are not actor rows and receive no special scheduler path.
- Accepted snapshots, shared types, Review UI, Rulebook frames, opening plans, replanning, scheduling, visibility, and evidence v3 use the same person-only contract. Every accepted person must have a persisted plan and schedule in playtest eligibility evidence, including background people.
- Migration `0032_campaign_world_people.sql` rejects new collective actors and base/influence placements. Old collective snapshots are intentionally rejected by the current parser; there is no conversion, compatibility adapter, fallback, or hidden retry.
- Verification passes the broad Campaign World + Campaign Play backend selection, backend/frontend typechecks, 33 Campaign Play E2E tests, 14 World Review tests, scoped Review lint, and diff check. The fresh GLM 5.2 world and manual UI proof remain deferred until the scheduler root is fixed.

Scheduler cadence cutover:

- Each player turn admits at most three autonomous people. Other due people receive a durable `actor_capacity` defer, one agency-debt increment, and a future due time.
- At most one actor job may accept a new plan during the turn. Explicit Resume may continue that same interrupted attempt. A second job that needs replanning receives a durable `replan_capacity` defer and no provider call.
- An accepted replan replaces the admitted job's execution plan and runs its first step during the same player turn. The job retains `admittedPlanId` as due-set provenance while `planId` names the plan that actually executes.
- Proposals still settle serially against the latest committed world version. The runtime does not mutate the world in the background and adds no retry, repair, provider switch, parser fallback, or backend-authored narrative prose.
- Focused Campaign Play verification passes 101/101. The broad Campaign Play and mounted-route selection passes after updating the person-only opening fixture, and all 33 Campaign Play E2E tests plus backend, frontend, and E2E typechecks pass. Standalone smoke additions: `0`.
- The next formative manual run tests whether the cap improves waiting time while keeping autonomous consequences legible. One fresh UI campaign can expose mechanisms and prose defects; it cannot establish prevalence.

# Task 17: live causal and diagnostic lanes

## Current-build 20-action rehearsal contract

Decision: determine whether commit `3e609fb3` is ready to spend a newly generated Campaign World on the pristine Task 17 causal proof.

Method: one formative manual playtest on an isolated copy of the accepted Brass Orchard template. The main operator reads every rendered scene, chooses one action from player-visible information, signs it before submission, and reads every narration beat afterward. Browser control may enter the chosen action and capture evidence; it does not choose, rewrite, batch, or substitute actions. This single-world rehearsal can reveal failure mechanisms and prose defects, but it cannot establish population prevalence or satisfy Task 17's fresh-world requirement.

Evidence contract:

- Hypothesis: twenty completed player actions can preserve bounded perception, causal receipts, reload identity, and readable prose while autonomous people pursue goals that create discoverable change.
- Expected checkpoints: action 1 has a grounded local result; by action 5 the player has refused or left the opening hook and encountered a persisted consequence; by action 10 a distant actor mutation is learned through an eligible channel; by action 20 every agent-controlled person has progressed or revised a plan and the public UI supports one player-caused and one player-independent causal chain.
- Collection: signed action text and visible-state hash, completed turn and model-stage evidence, receipts, runtime and sanitized turn events, observations, actor jobs and plans, public narration read beat by beat, checkpoint hashes at actions 1, 5, 10, and 20, SQLite integrity and foreign keys, reload proof, quota evidence, and manual quality notes.
- Coding: record observation before interpretation. Classify each finding as prose, causality, player agency, actor agency, continuity, secrecy, persistence, recovery, or evidence integrity; assign blocking or non-blocking severity and name the smallest retest.
- Severe-failure rule: a hidden-state leak, hard contradiction, lost or duplicate input, stale acceptance, partial commit, unexplained teleport, checkpoint divergence, automatic retry, repair, provider switch, or contract interruption disqualifies the rehearsal as promotion evidence. A severe failure is preserved for diagnosis; it is not repaired inside the same accepted lane.
- Decision rule: retain the current build only if all twenty actions and four reload checkpoints complete cleanly and the manual review finds concrete autonomous motion. Otherwise revise the owning subsystem, add a focused regression for every accepted defect, rerun deterministic Task 16A coverage, and start another isolated rehearsal before generating the fresh Task 17 world.

Participant and data gates: one local project operator, no recruitment, no minors, no multiplayer or UGC, no participant recording, and no behavioral data beyond project state and operator notes. Accessibility is observed through the rendered controls but this rehearsal does not claim a representative accessibility evaluation. Privacy, monetization, mod-lifecycle, and causal-experiment gates are not applicable.

Humanizer/deslop review: the contract uses observable criteria and direct technical language. It contains no leading facilitator prompt, promotional conclusion, or softened failure rule.

## Checkpoint and reload evidence contract

- `causal-20` is pinned to exactly 20 completed player actions and declared reload checkpoints `[1, 5, 10, 20]`.
- A live checkpoint is captured only from `phase=ready`, with no unfinished player turn and with the requested completed-action count equal to SQLite truth.
- Each checkpoint compares the public API bytes, canonical replay hash, SQLite/public/protected authority hashes, integrity result, foreign keys, and runtime-event cursor before and after the browser reload.
- A matching reload writes `checkpoints/action-<n>.json` and `probes/reload-action-<n>-proof.json`. Divergent reloads retain their proof but cannot produce an accepted checkpoint.
- Bundle finalization copies and validates staged historical checkpoints. It refuses a staged final checkpoint whose authority differs from the final replay and requires every checkpoint declared by the live run config.
- Live run configs now reject `maximumOutputTokens < 32_768`; deterministic seeded evidence uses the same minimum.

## Verification

- `npx vitest run e2e/campaign-play/contracts.test.ts e2e/campaign-play/live-session.test.ts e2e/campaign-play/bundle-writer.test.ts e2e/campaign-play/probes.test.ts`
- `npm --prefix backend run typecheck`

### Actions 7-8 visibility finding

- Action 7 preserved the failed social boundary. Direct inspection exposed only observable blight structure and the already-public northward drift.
- Action 8 proved freeform movement to the visible Lower Greyfork route, but an actor event reached the player packet as `You witnessed a change nearby.` The narrator echoed the missing fact as `perceptible, immediate, unnamed`.
- SQLite showed the deeper cause: Senna Torres executed the event, but `actor-proposal-service` reused Tibbs Mallon's opening-consequence summary whenever any co-located actor received projectable exposure.
- Opening-consequence prose is now used only when actor ID, goal ID, and first settled step all match the frozen seed. Unrelated actor events keep their own plan summary.
- Directly perceived agent events no longer expose their protected summary or emit the abstract placeholder. Visibility renders a bounded surface from public actor names and event class, for example `Senna Torres is occupied with North Harbor Growers' Council.`
- Focused verification: `npx vitest run backend/src/campaign-play/actor-proposal-service.test.ts backend/src/campaign-play/visibility-service.test.ts` (9 passed), plus backend typecheck.

### Action 9 narrator continuity finding

- Senna rejected the player's question without leaking motive or hidden state. The prose then said she kept walking, was halfway gone, and left the player alone at an empty bend while the same public packet still kept Senna in `visibleActors` and offered another contact action.
- The narrator prompt already prohibited movement absent from the packet, so prompt wording alone was not an adequate contract.
- The prompt now states the visible-actor invariant directly. A semantic validator rejects departure or empty-scene language for any named visible actor unless `newObservations` contains the code-owned `<actor> moved` evidence.
- Local gestures remain valid when the prose explicitly keeps the actor present.
- Prompt-craft, humanizer, and deslop review: the added instruction is specific, non-repetitive, and uses plain technical language. It adds no narrative style steering beyond the mechanical continuity rule.
- Focused verification: `npx vitest run backend/src/campaign-play/narrator.test.ts` (10 passed), plus backend typecheck.

- Action 12 showed the first continuity guard overcorrecting in prose: `Maren has not moved from her spot.` The fact was mechanically correct but read like a debug assertion.
- The narrator must apply actor-presence continuity silently. The prompt and semantic validator now reject explicit `has not moved` / `remains present` compliance language while still allowing ordinary local gestures.
- Prompt-craft, humanizer, and deslop review: the silent-constraint sentence is direct and removes mechanical narration instead of adding stylistic filler. Narrator tests remain 10/10 with backend typecheck passing.
- `npm --prefix frontend run typecheck`
- The previously accepted clean-14 first-playable bundle remains valid and promotion-eligible under the updated validator.

The next execution step is a clone-based 20-action GLM 5.2 rehearsal. It is diagnostic preparation, not the fresh-campaign acceptance lane required by Task 17.

## Clone rehearsal: actions 1-6

- Run `causal-20-glm52-brass-orchard-rehearsal-01` uses isolated clone `brass-orchard-longroad-pristine-d59fa3a4`, GLM 5.2 through Z.AI Coding Plan, and the manual browser path.
- Reload checkpoints after actions 1 and 5 matched exactly. The action-5 checkpoint hash is `31b61f079cdc18b23d82e58c9d3c1f5a9d8f712aca1eafb64da022cc95a68455`.
- Actions 1-4 stayed peripheral. The prose remained grounded but repeatedly described a static yard; action 4 ended with the player-centred line that the junction waited for the player to act.
- Action 5 reached Windcleft and surfaced a persisted, off-screen aftermath from Day 1, 01:00: fresh-dug soil, grey-streaked roots, a half-filled seed sack, and a dated skull mark. This satisfies the by-action-5 causal-discovery condition.
- The manual player accidentally duplicated the name and profession of an existing background actor. SQLite confirms separate actor IDs for background `Maren` and human `Maren Tolven`; the run remains mechanically valid but its naming semantics are contaminated.
- Action 6 exposed a reproducible Game Master contract defect. Two GLM proposals for a dialogue were schema-valid but selected a location exposure outside the command grounding, so Rulebook correctly interrupted both with `invalid_exposure`.
- `record_world_event` no longer accepts model-authored exposure. Campaign Play derives one `direct_perception` predicate from the human player's durable `present` placement. The same interrupted turn completed after backend restart and explicit Resume.

Prompt review: prompt-craft identified redundant model authority over a code-owned location anchor. The revised instruction states the exact `record_world_event` fields and tells the model to omit exposure. Humanizer and deslop review found no ornamental framing, filler, duplicated rule, or ambiguous retry language; the technical register is intentionally direct.

Focused verification:

- `npx vitest run backend/src/campaign-play/game-master.test.ts` (19 passed)
- `npm --prefix backend run typecheck`

## Clone rehearsal: actions 7-20

- Reload checkpoints after actions 10 and 20 matched exactly. The action-20 public-state hash is `ad4b2c3f7ecf273ed3c4b21ab4f74596694dc4640b6df362fd2b8b39f6381af2`.
- Action 8 reached Lower Greyfork. The first projected NPC consequence was an unnamed placeholder caused by an unrelated actor reusing Tibbs Mallon's opening seed. Actor proposal and visibility projection now preserve the concrete public actor surface.
- Action 9 narrated Senna leaving while public state still placed her beside the player. The narrator now rejects unsupported departure and empty-scene prose for visible actors.
- Action 12 exposed a bad correction from that guard: `Maren has not moved from her spot.` Continuity checks now stay out of the prose.
- Actions 13-18 remained mechanically coherent but did not feel like a living world. Small player actions advanced the clock by hours while Halden and other scheduled actors mostly repeated public pressure or stood still. Action 16 also described `pre-dawn` and `first light` at 11:25.
- Action 19 was a deliberately small sensory action. The copper fruit and clean root line were concrete and readable, but the scene still treated Halden and the surplus conflict as static scenery.
- Action 20 waited for the first frost drop. The local event was clear and pleasant to read: frost formed, fruit fell in bell tones, and the sealed bins gave the sound narrative context. It did not prove autonomous actor motion. The event occurred only because the player selected a wait action, while Halden still did nothing.

Manual verdict: FAIL for living-world playability. The run proves persistence, reload integrity, bounded visibility, and mostly coherent local prose across 20 completed player actions. It does not prove that NPC goals advance into concrete, discoverable consequences without player prompting. The main defect is now pacing and scheduling, not basic turn persistence.

Evidence bundle: `output/playtests/campaign-play/causal-20-glm52-brass-orchard-rehearsal-01`. It contains all 20 signed browser actions, 65 accepted GLM 5.2 stages, and the four matching reload checkpoints. The run used 206,125 input tokens and 132,990 output tokens. Its frozen aggregate output budget was 100,000, so the validator correctly marks the bundle ineligible even though the mechanical scorecard itself has no hard failure. Future 20-action configs need an aggregate output budget of at least 200,000 while every individual model call retains the global 32k minimum.

Evidence-contract fix: accepted model-stage attempt numbers can exceed one after an explicit Resume. The bundle now records the accepted attempt and derives `retryUsed` from it. Budget overruns no longer prevent the artifact from being written; structural validation preserves the bundle and reports the overrun as an eligibility failure.

Humanizer and deslop review: the diagnosis uses direct observations, timestamps, and measured totals. It avoids promotional language, generic conclusions, and invented intent. The only quoted prose is copied from the rendered playtest.

### Movement exposure correction

- Action 14 exposed an ordering bug in the earlier code-owned player exposure fix. The movement command placed the player in North Harbor, but the following `record_world_event` still anchored direct perception to the pre-turn Greyfork Bend placement.
- Movement result events now bind to the canonical Judge destination. A move turn must put `move_actor` first, followed by any arrival event, so the exposure matches the post-command snapshot that earns it.
- Prompt-craft review: the Game Master instruction now states one ordering invariant next to the existing code-authoritative movement rule. Humanizer and deslop review found no repeated rule or narrative-style steering; `post-effect location` names the mechanical ownership boundary directly.
- Focused verification: `npx vitest run backend/src/campaign-play/game-master.test.ts` (20 passed), plus backend typecheck.

### Autonomous-person agency correction

- Opening planning, scheduling, actor-job authority, and topology eligibility now use one roster rule: every agent-controlled person participates regardless of `key`, `support`, or `background` role. Collectives remain world topology and narrative context, but they do not receive player-like plans or turns.
- Every opening and replanned actor step now carries a required `observableTrace`. Code persists that trace with an autonomous event and gives an offscreen non-movement action a 1,440-minute local-aftermath window. Directly perceived actions remain direct; offscreen movement remains protected until another grounded channel reveals it.
- Visibility no longer renders the generic `Something changed here before you arrived.` line for autonomous actor aftermath. It requires and publishes the persisted sensory trace; a missing trace is a projection error.
- The hidden opening consequence must copy its actor plan's first trace exactly. This binds what can later be discovered to the step that actually executes rather than to a second, independently generated sentence.
- Prompt-craft review: the opening and replan prompts state the trace field, sensory boundary, and actor roster once, next to the fields they govern. Humanizer and deslop review found no ornamental framing, synthetic enthusiasm, repeated conclusion, or player-facing style contamination; the terse technical register is intentional.
- Verification: backend typecheck passed; the Campaign Play suite passed 343 tests after fixture migration, followed by focused Rulebook/state/turn-repository verification (85 passed). New focused assertions prove finite offscreen aftermath and exact trace rendering (10 passed).
- Full backend verification reached 3,913 passing tests. Two cross-process SQLite race tests exceeded their five-second timeout under the full parallel suite and then hit Windows temp-directory cleanup locks; the same turn-repository file passed all 35 tests in isolation, so this is recorded as a suite-load limitation rather than a Campaign Play regression.

### Opening planner interruption correction

- The next clone rehearsal rebuilt the empty Campaign Play bootstrap against the current person-only actor roster and froze it as reusable template `brass-orchard-longroad-pristine-77932492`.
- Run `causal-20-glm52-brass-orchard-rehearsal-03` reached the real UI opening planner on GLM 5.2. The provider call remained in `started` for more than ten minutes while the worker correctly renewed its lease every ten seconds.
- An initial diagnostic patch imposed the application's 120-second stage duration. Run `causal-20-glm52-brass-orchard-rehearsal-04` proved that boundary twice with durable `stage_timeout` rows at 120,011 ms and 120,014 ms.
- Product direction superseded that patch: opening GLM work must be allowed to finish rather than be classified by wall-clock duration. The final planner forwards only the turn-service cancellation signal, so an actual worker/lease loss can still stop stale work, but it supplies no provider timeout of its own.
- No compatibility path, provider fallback, automatic retry, or model substitution was added. Resume remains an explicit user action after a real transport or worker interruption.
- Focused verification covers forwarding the exact worker signal and the absence of a provider `timeout`; the full Campaign Play and E2E selections are rerun after the bootstrap-scope revision below.
- The deterministic E2E replay fixture was also brought onto the already-accepted current contracts: it excludes collectives from actor plans, includes an `observableTrace` on every autonomous step, and omits model-authored exposure from `record_world_event`. Clone provenance and live-session evidence tests then passed all 6 cases.

### Opening bootstrap scope correction

- The first two run-04 attempts were cut off by the now-removed diagnostic deadline. Both calls used the same frozen GLM 5.2 selection; no fallback or model substitution occurred.
- Gameplay diagnosis: opening existed to establish each autonomous person's immediate agency, but asked the model for a strategic intent plus one to three precomputed steps. That duplicated the first intent in strict JSON and froze decisions that should be reconsidered after the world changes.
- Revised system rule: opening gives every agent-controlled person exactly one concrete next step with one sensory `observableTrace`. That step is also the active plan intent. After it settles, actor replanning owns the next decision against current world state.
- Intended dynamic: smaller turn-zero planning, earlier concrete NPC action, then frequent causal replanning instead of stale multi-step scripts. The failure mode to watch in the manual run is churn: actors must not replan into repetitive traces or dominate every player turn.
- Prompt-craft review: the prompt now states one cardinality rule and one ownership boundary; it no longer asks for both a strategic intent and repeated step intent. Humanizer review: the instruction is plain and readable in its technical register. Deslop review: no decorative framing, repeated conclusion, vague intensifier, or player-facing style instruction was introduced.
- Acceptance: all six people receive exactly one opening step; collectives receive none; hidden exposure still copies the chosen person's first trace; the planner runs until GLM finishes unless worker authority is lost; actor replanning supplies later plans.
- Final verification: backend typecheck passed; Campaign Play plus the mounted route passed 345 tests after the three migrated visibility fixtures passed their focused rerun; clone provenance and live-session E2E passed all 6 tests. The planner test proves the exact worker signal is forwarded and no provider `timeout` is supplied.

### Clone rehearsal 04: opening and actions 1-4

- The third GLM 5.2 opening attempt completed without a wall-clock deadline. Opening planning took 218,930 ms and produced a valid 14,032-token artifact; narration took 68,594 ms. The two earlier 120-second interruptions therefore cut off valid work.
- The opening was coherent and peripheral: Neris arrived as an unknown worker while the refusal, sealed forecasts, and blight already existed. Its four beats repeated scene facts more than they developed them.
- Action 1 asked Ordunn about the refusal. The result was mechanically sound but mostly restated public pressure text. Action 2 used freeform follow-up and produced a causal explanation plus a concrete watch-shift offer. Action 3 accepted the shift and preserved short-term continuity, but Rulebook stored only time advancement and a `record_world_event`; no durable player obligation represented the job.
- Action 4 advanced eight hours. Five autonomous actor jobs settled, one deferred, and one actor replan completed. The hidden actions and traces were concrete: Ordunn inspected the frozen coupling, Senna reviewed grove tallies, Halden walked Brassbell's windward edge, Tibbs salvaged seed, and Yalisa took new ridge readings.
- Neris shared Ordunn's location and watched the frozen car all night, yet the public packet reduced his directly perceived action to `Ordunn Voss is occupied nearby.` The actor proposal had already persisted the safe trace about grease-pencil coupling measurements, so the loss occurred in visibility projection.
- Directly perceived autonomous `record_world_event` observations now publish their required `observableTrace`. Missing or blank trace data raises `visibility_projection_invalid`; the former generic actor-activity fallback is gone. Offscreen events remain protected behind their existing aftermath, route, or witness predicates.
- No prompt or authored narrative copy changed. The fix exposes the already-reviewed public-safe trace field instead of synthesizing new prose in code.
- Focused verification: `npm --prefix backend test -- src/campaign-play/visibility-service.test.ts` (5 passed), plus backend typecheck.

### Clone rehearsal 04: actions 5-7 and model-stage deadlines

- The action-5 reload checkpoint matched byte-for-byte at public-state hash `b7b6ca5b885d745399438cdde3eb4b4af4393a1126325cf54f305edb548a02c0`.
- Action 6 advanced another full shift. Four actor replans completed in 74,110-113,053 ms each. Ordunn then moved autonomously to `weather-watch-ridge`; public state removed him from the player's location and exposed the grounded departure. This is the first run-04 result in which an NPC visibly changed the local situation without the player directing that NPC.
- Action 7 followed Ordunn toward the ridge. Judge accepted the action in 59,158 ms. Game Master attempt 1 returned after 78,997 ms but failed its strict contract. Explicit Resume started attempt 2, which the remaining 120-second Game Master deadline interrupted at 120,053 ms while the provider was still working.
- The opening-only correction was incomplete. Judge, Game Master, Narrator, and actor-replanner provider calls now have no application wall-clock timeout. Judge, Game Master, and Narrator receive the exact worker cancellation signal. Actor replanning remains bounded by actual job lease authority, not a separate model deadline.
- Token, cost, and output budgets remain enforced. No fallback provider, model substitution, or automatic retry was introduced. An interrupted durable turn still resumes only through the explicit Resume action.
- Prompt-craft, humanizer, and deslop review: this note distinguishes measured evidence from interpretation, keeps the worker-lease caveat explicit, and does not treat one successful autonomous movement as proof that the full 20-action playtest has passed.
- Verification: backend typecheck passed; focused Judge, Game Master, Narrator, opening, actor-replanner, and turn-runtime selection passed 121 tests. Provider-option assertions require the original worker signal and the absence of `timeout`.

### Clone rehearsal 04: actions 8-20

- Actions 8 and 9 deliberately left Neris silent on Weather-watch Ridge. Yalisa and Ordunn did not redirect their conflict toward the player, which preserved player peripherality, but an hour of waiting produced repetitive standoff prose before either schedule became due.
- Action 10 advanced fifteen minutes and settled Yalisa's scheduled work. SQLite and the private event proved that she cleared rime from instrument housings, but the direct public trace described only the rime and the narrator incorrectly said neither actor moved. Autonomous work executed mechanically while its visible agency disappeared from the prose.
- The manual operator reused a stale browser DOM node after React rerendered the narration controls. That submitted action 11 before the action-10 checkpoint could be bound. The strict evidence runner correctly rejected the checkpoint because two durable turns existed. The run remains useful diagnosis, but it is not promotion-eligible and no checkpoint was fabricated.
- Actions 12-16 tested contact, departure, and material inspection. Yalisa gave a guarded technical answer without sudden trust. Brassgrove's boot prints and sealed stores produced grounded physical evidence, but action 13 contradicted itself with `Nothing has changed` immediately before describing Halden's absence, and action 15 inferred repeated purposeful visits too confidently from one tread pattern.
- Actions 17-18 reached and inspected North Harbor. The quiet waterfront, maintained seals, and unattended resin stores were internally consistent, but repeated empty locations made the world feel authored around a sparse active cast. The narrator also repeated `carrying nothing` and `seals untouched` after those facts had stopped being narratively useful.
- Action 19 crossed to Greyfork Bend. During the five-unit journey, Maren autonomously left for Lower Greyfork while Senna stayed behind. The new scene exposed the departure, an older material aftermath in the storeroom, and Senna's continued presence. This was the strongest living-world result in the run because the local situation changed without the player directing either NPC.
- Action 20 asked Senna about Maren. Senna confirmed only what she could know: Maren left south with sealed parcels and did not explain her route or motive. The four-beat narration was coherent, restrained, and left the epistemic gap intact instead of turning the contact into an exposition dump.

At the declared lane boundary, before the separate post-fix action below, SQLite recorded exactly 20 completed player-action turns and 83 model-stage attempts: 74 accepted GLM 5.2 artifacts, 7 strict-contract interruptions, and 2 obsolete opening deadline interruptions. Total recorded use at that boundary was 278,512 input tokens and 204,984 output tokens; the slowest accepted call was the 218,930 ms opening planner. No accepted Campaign Play stage used repair, text fallback, provider fallback, or model substitution. Each contract failure stopped durably and required explicit Resume.

Manual verdict: PARTIAL PASS for the living-world direction, FAIL for promotion. The run now proves autonomous relocation that changes a later player scene, non-central player treatment, bounded NPC knowledge, coherent travel, and readable prose over 20 completed actions. It also exposes static sparsely populated locations, actor actions whose public trace loses the acting person, repetitive waiting prose, vague progress status, and several smaller continuity or inference defects. The missed action-10 checkpoint and accidental action-11 submission independently disqualify the run as pristine evidence.

### Code-owned player movement exposure

- Every strict Game Master failure at `effects.0.exposure.mode` occurred on a movement turn: actions 7, 17, and 19. `record_world_event` was not the source; its model-facing schema already omitted exposure.
- The actual contract conflict was `move_actor`. Route, player actor, endpoints, and destination are all canonical Judge/backend facts, but the schema still required GLM to author their visibility policy. The prompt could not make that redundant field reliable.
- The model-facing movement effect now contains only `{ kind: "move_actor" }`. Compilation attaches one code-owned `direct_perception` predicate at the canonical destination. A strict regression rejects any model-authored movement exposure instead of repairing or retrying it.
- Campaign Play already calls `safeGenerateObject` with `retries: 1`, `allowRepair: false`, and `allowTextFallback: false`, and rejects traces labeled repair, retry, or text fallback. The generic capability telemetry still names `text_fallback` as the library's available fallback strategy, but the gameplay call site disables it and the failure path confirms it is not executed.
- Prompt-craft review: the revised movement instruction names the only permitted field and the exact code-owned boundary once. Humanizer and deslop review: the sentence is plain technical language, contains no decorative framing, and does not add style steering or a disguised fallback path.

Post-fix manual proof used the rendered UI for one additional diagnostic movement from Greyfork Bend to Cage Junction Yards. This action is outside the declared 20-action lane and is not counted as acceptance evidence. Every GLM 5.2 stage succeeded on attempt 1: Judge in 25,357 ms, Game Master in 87,840 ms, two actor replans in 51,514 ms and 73,053 ms, and Narrator in 64,364 ms. The Game Master returned a schema-valid movement proposal without `exposure`; no Resume appeared.

The resulting scene also preserved autonomous motion. Senna arrived at the junction during the player's journey, Ordunn departed for Weather-watch Ridge, and Halden remained in the yard. The narrator described that placement change directly and did not invent motives. This proves the corrected movement contract on the real provider and player surface while adding no retry, repair, fallback, or model substitution.

Final verification for this correction:

- `npm --prefix backend run typecheck` — passed.
- `npm --prefix backend test -- --run src/campaign-play/game-master.test.ts` — 19/19 passed.
- Campaign Play plus both mounted route suites — 26 files, 345/345 passed.
- Clone provenance and live-session E2E — 6/6 passed.
- `git diff --check` — passed with only the existing Windows line-ending notices.

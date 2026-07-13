# Task 17: live causal and diagnostic lanes

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

### Opening planner deadline correction

- The next clone rehearsal rebuilt the empty Campaign Play bootstrap against the current person-only actor roster and froze it as reusable template `brass-orchard-longroad-pristine-77932492`.
- Run `causal-20-glm52-brass-orchard-rehearsal-03` reached the real UI opening planner on GLM 5.2. The provider call remained in `started` for more than ten minutes while the worker correctly renewed its lease every ten seconds.
- The defect was local to the opening planner: Judge, Game Master, actor replanning, and Narrator already passed an `AbortSignal` and per-stage duration into `safeGenerateObject`; the opening planner passed neither. The application-wide stage limit is 120 seconds, so the live call had exceeded its actual production contract by more than five times.
- The opening planner now combines the turn-service signal with its own stage deadline, passes both `timeout` and `abortSignal` to the provider call, and classifies the deadline as `stage_timeout`. The opening runtime persists that interruption explicitly and permits only the existing observed-epoch Resume path.
- No compatibility path, provider fallback, or automatic retry was added. No prompt or player-facing prose changed in this correction.
- Focused verification: opening planner and opening runtime suites passed 44 tests, including a never-resolving provider call and durable `stage_timeout` evidence; the full Campaign Play plus mounted-route selection passed 346 tests; backend typecheck passed.
- The deterministic E2E replay fixture was also brought onto the already-accepted current contracts: it excludes collectives from actor plans, includes an `observableTrace` on every autonomous step, and omits model-authored exposure from `record_world_event`. Clone provenance and live-session evidence tests then passed all 6 cases.

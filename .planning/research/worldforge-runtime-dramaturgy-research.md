# WorldForge Runtime Dramaturgy Research

## Status

Complete draft. Updated after OpenCode Go / Mimo review and 2026-05-02 GM-first orchestration correction.

## Goal

Define how WorldForge should turn imported/worldgen data into an actual playable solo RPG loop: scene setup, character entrance, location growth, probability adjudication, memory, prompt contracts, and presentation rhythm.

This research treats WorldForge's deterministic backend authority as valuable. The backend should own state, validation, tools, rolls, and persistence. It should not own freeform semantic interpretation. The missing layer is runtime dramaturgy: a GM/director that decides which facts matter now, why an actor is here, what pressure exists, whether a roll is needed, and how the result is presented as play.

## Core Questions

1. What should the player feel moment to moment?
   - Exploring a living place, not reading a database dump.
   - Meeting characters because their routines, agendas, or coincidences intersect with the scene, not because they share a macro-location row.
   - Seeing consequences and hints before major reveals.
   - Understanding risk and opportunity without staring at raw debug math.

2. What should the runtime director decide?
   - Which actors are clear, hinted, offscreen-relevant, or unavailable.
   - Which location scope the current beat happens in.
   - Whether to reuse, create, or merely imply a sublocation.
   - Which NPC agendas can push into the current scene.
   - Which unresolved thread, faction pressure, or environmental detail should surface now.

3. What should the backend decide deterministically?
   - IDs, persistence, writes, validated state transitions, time ticks, current known location scope, ownership, visibility scopes, duplicate prevention, and audit logs.
   - It should not semantically normalize "canon", choose the meaning of a premise, or creatively infer where Naruto/JJK concepts belong without LLM-owned interpretation.

4. What should the LLM decide?
   - Plausible fictional interpretation, target/intention from raw player text, whether a beat is hostile/social/exploratory, whether uncertainty matters, dramatic relevance, sensory framing, character intent, location texture, and which reference/lore facts matter to this user premise.
   - It should make choices within explicit contracts, candidate sets, budgets, and examples instead of inventing schemas.

5. What should be stored long-term?
   - Not every sentence. Store authored truth, scene facts, relationship deltas, character observations, unresolved threads, foreshadowing hooks, location recent events, and "known to whom" boundaries.

## Working Diagnosis

WorldForge currently has strong state and validation layers, but weak dramaturgical handoff. The runtime often knows many facts but lacks an explicit contract for why this fact should appear now. That makes the experience drift toward "narrative generated from data" rather than a game loop with discovery, pressure, timing, and meaningful uncertainty.

## 2026-05-02 GM-First Turn Correction

The next architecture correction is not "make backend understand better". It is the opposite:

- Backend gathers neutral evidence and exposes deterministic tools.
- GM/LLM interprets the raw player text.
- GM/LLM chooses target, hostility/combat framing, social/exploration framing, whether a roll is needed, and which tool to call.
- Backend validates the requested concrete IDs/tools, rolls when asked, executes mutations, persists, and can roll back.

The current `playerAction` / `intent` / `method` transport shape is legacy compatibility. Product semantics should move toward one raw player text field plus explicit GM-requested tools.

This is not a move to trusting the LLM. Backend remains the DM rulebook and world truth: time, location, stats, inventory, resources, relationships, conditions, clocks, persisted facts, and legal tool transitions must come from backend state and deterministic rules. The GM may propose scene meaning and consequences, but backend validates and persists the actual world result.

## Sources To Evaluate

- Marinara Engine GM/game flow.
- Aventura/Aventuras story workspace and lore/memory model.
- AI Dungeon Story Cards, Memory Bank, Plot Essentials, and context construction.
- Friends & Fables AI GM, lore, maps, tactical layer, travel system.
- Inworld NPC goal, knowledge, emotion, relationship, and conversation group concepts.
- Ironsworn oracle/move design.
- Ren'Py VN presentation and choice cadence.
- Facade drama manager and beat sequencing.
- Prom Week/Comme il Faut social physics.
- MDA mechanics/dynamics/aesthetics framework.
- Storylets and quality-based narrative design.

## Reference Notes

### Marinara Engine

Source: [Pasta-Devs/Marinara-Engine](https://github.com/Pasta-Devs/Marinara-Engine), plus prior local note `.planning/research/marinara-gm-flow-reference.md`.

Marinara is weaker than WorldForge as a state engine, but stronger as a play surface. Its GM mode reads as a visual-novel solo RPG because it presents a current scene first, segments the text into readable beats, lets party/character lines punctuate the flow, and uses time/weather/animation/input cadence as part of the game feeling instead of as side data.

What matters for WorldForge:

- Do not copy Marinara's simulation depth. Copy the presentation discipline.
- The first screen should answer "where am I, what do I perceive, who is currently relevant, what changed, what can I try?"
- The system should feel like a scene with current pressure, not a database browser with a chat box.

### Aventuras

Source: [AventurasTeam/Aventuras](https://github.com/AventurasTeam/Aventuras).

Aventuras is useful as a data/workspace reference. It separates adventure mode from creative writing mode, has a lorebook-like entity model, automatic chapter summarization, retrieval metadata, world-state deltas, suggested actions, checkpoints, and import paths for character/lore sources. Its prompt templates strongly constrain openings: they stage environment, NPCs, and situation while avoiding writing the protagonist's actions.

What matters for WorldForge:

- Keep mode boundaries explicit: play mode is not creative writing mode.
- Treat "what changed" as a first-class product object, not just prose.
- Store chapter/scene summaries with entities, locations, plot threads, emotional tone, and in-story time.
- Use opening-scene constraints to keep agency with the player.

### Left 4 Dead AI Director

Sources: [Valve AI Systems of Left 4 Dead PDF](https://valvearchive.com/Presentations/AIIDE%202009/ai_systems_of_l4d_mike_booth.pdf), [summary mirror](https://www.gameanim.com/2009/09/15/ai-systems-of-left-4-dead/).

Left 4 Dead's director is not "an AI that writes story"; it is a pacing controller. It tracks player intensity, alternates pressure and relief, and chooses threats/resources based on the current experience curve.

What matters for WorldForge:

- Runtime direction should manage tension, relief, discovery, and aftermath, not just whether JSON parses.
- Scene phases are needed: opening, exploration, tension, resolution, aftermath.
- A scene can be mechanically correct and still feel bad if every turn has the same pressure shape.

### RimWorld Storyteller

Source: [RimWorld official game page](https://rimworldgame.com/).

RimWorld frames its storyteller as a system that converts simulation into authored-feeling incidents. The important pattern is not the exact event system, but the contract: the game does not surface every simulated fact; it selects incidents that produce a readable colony story.

What matters for WorldForge:

- NPC offscreen activity should not be dumped. It should surface as rumors, visible changes, interruptions, discoveries, or later consequences.
- Director output should be event-shaped, not raw state-shaped.

### Ironsworn And Solo RPG Moves

Source: [Tomkin Press Ironsworn](https://tomkinpress.com/pages/ironsworn).

Ironsworn works because uncertainty is framed as moves with outcome bands and consequences. A miss is not a system failure; it changes the fictional position. Progress tracks and vows convert long arcs into visible pressure.

What matters for WorldForge:

- The Oracle should produce fictional position changes, not only chance/roll.
- Weak hit and miss must have consequence contracts.
- Long-term goals/threads should be progress-like objects, not prose-only memories.

### Ren'Py And Visual Novel Cadence

Sources: [Ren'Py dialogue docs](https://www.renpy.org/doc/html/dialogue.html), [Ren'Py screen docs](https://www.renpy.org/doc/html/screens.html), [Ren'Py menu docs](https://www.renpy.org/doc/html/menus.html).

Ren'Py's useful lesson is separation of concerns: dialogue, choice cadence, and screen presentation are distinct layers. WorldForge currently collapses too much into "chat messages plus panels".

What matters for WorldForge:

- Narrative beats should be segmentable.
- Choices/actions should be surfaced at intentional moments.
- Inspectors can exist, but they should not be the default play grammar.

### Facade And Drama Management

Source: [Mateas and Stern, Structuring Content in the Facade Interactive Drama Architecture](https://cs.uky.edu/~sgware/reading/papers/mateas2005structuring.pdf).

Facade is relevant because it treats the running experience as beat selection and drama management. It has authored content units, runtime sequencing, and pressure toward a dramatic arc.

What matters for WorldForge:

- The director needs a unit smaller than "turn" and larger than "raw fact": presentation beats.
- Actor entrances, interruptions, hints, reveals, and exits should be explicit events.

### AI Dungeon

Source: [AI Dungeon Story Cards](https://help.aidungeon.com/faq/story-cards).

AI Dungeon's story card pattern is useful as a retrieval mechanism: relevant lore is pulled into context based on triggers. It is not enough for WorldForge because WorldForge also needs authority, visibility, and state transitions.

What matters for WorldForge:

- Lore injection should be relevance-triggered.
- Retrieved lore must still be filtered through current scene visibility.
- Context should assist the narrator, not become a license to mention every known fact.

### Inworld / Agentic NPC References

Source: [Inworld documentation](https://docs.inworld.ai/).

Inworld-style character systems separate character knowledge, goals, scenes, and interaction context. The key pattern is that an NPC is not just a text blob; it has scoped knowledge, motivations, and scene participation rules.

What matters for WorldForge:

- Key NPCs need routines, agendas, encounter triggers, and knowledge boundaries.
- Support NPCs need local roles and limited agency.
- Background entities should be texture until promoted.

### MDA Framework

Source: [MDA: A Formal Approach to Game Design and Game Research](https://users.cs.northwestern.edu/~hunicke/MDA.pdf).

MDA is useful as a sanity check: mechanics, dynamics, and aesthetics must line up. WorldForge has many mechanics and data models, but the target aesthetic is not yet consistently encoded in runtime dynamics.

Target aesthetic for this project:

- Discovery of a living world.
- Fictional agency without chaos.
- Character fidelity and surprise.
- Risk that feels fair.
- A playable scene, not an authoring console.

## Collaborator Council Summary

Multiple independent passes converged on the same diagnosis.

- Claude CLI: WorldForge needs a deterministic Runtime Dramaturgy Layer between authoritative state and UI. It should emit `PresentationEvent[]` from existing scene/oracle/world-brain/narrator data before the frontend tries to present the turn.
- Gemini CLI: add a stage model with a stage budget, explicit entrance/exit semantics, persistent vs ephemeral location policy, and NPC agency tiers.
- Cursor Agent: current UI exposes telemetry instead of play intent. The loop should be risk -> consequence -> new situation, with raw oracle data secondary.
- OpenCode Go / Mimo (`opencode-go/mimo-v2.5-pro`): corrected the plan trajectory. It agreed with the original diagnosis but flagged that several backend parts already exist after Phases 68-76: `SceneFrame`, `NarratorPacket`, scene presence bands, ScenePlan/Judge authority, prompt-contract hardening, macro/persistent/ephemeral location kinds, and combat-oriented Oracle enrichment. Its recommendation: do not re-build the backend director first; make the existing backend dramaturgy visible through a scene-first play surface, then enrich non-combat Oracle, pacing, memory, and live play validation.
- Local explorer: the frontend is a three-column cockpit (`LocationPanel`, `OraclePanel`, `NarrativeLog`, `QuickActions`, `CharacterPanel`, `LorePanel`) while the backend already has richer presentation inputs in `NarratorPacket`.
- GLM collaborator was not included because the local Z.AI proxy was unavailable during this pass.

## WorldForge Fit Analysis

### What Is Already Good

WorldForge is not empty. The project already has several strong foundations:

- `backend/src/engine/narrator-packet.ts` has perceivable events/responses/effects, visible actors, hint signals, guardrails, allowed visible actor names, and forbidden fact markers.
- `backend/src/worldgen/scaffold-steps/placement-expansion-step.ts` already knows huge macros like Shibuya should not be treated as one room and can create/reuse persistent sublocations.
- `backend/src/engine/scene-planner.ts` is already positioned as a semantic planner of record, with backend-owned IDs and allowed tools.
- `backend/src/engine/scene-frame.ts` and scene presence work give the engine the vocabulary for clear/hinted/offscreen presence.
- The import/worldgen layers can produce rich character data: identity, personality, motives, capabilities, power stats, relationships, source provenance.

The gap is not "we need more generated lore". The gap is that rich data is not consistently converted into runtime dramaturgy.

### Main Failure Mode

The project often moves from:

`state + lore + prompt -> prose`

when it needs:

`state + lore + player action -> director interpretation -> scoped uncertainty -> committed world change -> presentation beats -> prose/UI`

Without the middle layer, every downstream system has to improvise its own answer to:

- Who is actually present?
- Who is only nearby?
- What does the player perceive?
- Why now?
- What changed?
- What is a fair consequence?
- What should the UI make legible?

That is why the game can have correct-ish data and still feel like "all characters are in the room" or "the Oracle is just a debug roll".

### OpenCode Go / Mimo Status Correction

The first version of this research overstated how much backend dramaturgy still needed to be invented. The missing layer is not a blank slate.

Already present or partially present:

- `NarratorPacket` already collects perceivable events, responses, effects, visible actors, hint signals, guardrails, allowed actor names, and forbidden facts.
- `SceneFrame` and presence resolution already provide the vocabulary for clear/hinted/offscreen/unavailable actor state.
- ScenePlan/Judge authority already separates semantic plan generation from backend-owned IDs and execution.
- Prompt-contract work from Phase 74 already closed many "model invents schema" failures.
- Worldgen/location work already has macro, persistent sublocation, and ephemeral scene concepts.
- Combat-oriented Oracle enrichment already exists through power stats and `CombatEnvelope`.

Still missing:

- the default frontend experience does not lead with those structures;
- non-combat Oracle calls are still too thin;
- pacing/tension is not yet a first-class runtime policy;
- memory retrieval is not yet scene-useful enough;
- live play validation is not yet systematic.

This changes the next-step recommendation. Phase 77 should not be a broad new backend `SceneDirector` rewrite. It should make the existing director-like data playable.

### Calibration Review: Preventing Overestimation And Underestimation

This section is the guardrail for future planning. It separates four questions that were previously blurred:

1. Does the code already have a structural artifact?
2. Is that artifact wired into the critical path?
3. Does the player-facing experience actually expose it?
4. Has live play proven the behavior under real providers and generated campaigns?

| Claim / system area | Current evidence | Calibration status | Planning consequence |
|---|---|---|---|
| SceneFrame exists as runtime scene context | `backend/src/engine/scene-frame.ts:117` defines `SceneFrame`; `.planning/STATE.md:56` records the Phase 70 critical path as `SceneFrame -> Oracle -> ScenePlan -> backend validation/execution -> NarratorPacket -> final prose`. | **Implemented structurally** | Do not plan a new SceneFrame/director foundation unless a specific missing field is proven. |
| Presence bands exist | `backend/src/engine/scene-frame.ts:40` tracks actor `awareness`; `scene-frame.ts:506` and `scene-frame.ts:512` split clear vs hinted actors; `.planning/STATE.md:70` records dense sublocation SceneFrame tests. | **Implemented structurally, live quality still needs validation** | Do not claim "all presence logic missing"; do test whether UI/narration uses it correctly. |
| NarratorPacket exists | `backend/src/engine/narrator-packet.ts:63` defines `NarratorPacket`; fields include `perceivableEvents`, `visibleActors`, `hintSignals`, `allowedVisibleActorNames`, and `forbiddenFactMarkers` at lines 69-78. | **Implemented structurally** | Do not invent a parallel `PresentationEvent` layer unless Phase 77 proves the current packet cannot support scene-first UI. Prefer adapter/reformatter over rewrite. |
| Player-facing scene-first presentation exists | `frontend/app/game/page.tsx:993`, `1012`, `1013`, `1032`, `1053`, and `1062` render `LocationPanel`, `OraclePanel`, `NarrativeLog`, `QuickActions`, `CharacterPanel`, and `LorePanel` as the default play surface. | **Missing / weak** | Phase 77 should focus here: scene-first reader over existing packets, debug panels behind mode. |
| Oracle has combat enrichment | `backend/src/engine/oracle.ts:32` accepts optional `combatEnvelope`; `scene-frame.ts:753` derives it; `.planning/ROADMAP.md:477` and `483` mark Phase 66 complete. | **Implemented for combat/hostile context** | Do not describe Oracle as purely tag-only. Say combat is enriched; non-combat remains thin. |
| Oracle has full fictional-position adjudication | `backend/src/engine/oracle.ts:25-32` still centers `intent`, `method`, `actorTags`, `targetTags`, `environmentTags`, `sceneContext`, plus optional combat envelope. Calibration bands at `oracle.ts:83` still bias around skill tags. | **Partial** | Phase 78 should target non-combat/social/exploration evidence bundles and no-roll fast path. |
| Structured prompt contracts exist | `.planning/ROADMAP.md:602-625` lists Phase 74 complete across prompt-contract audit, ScenePlanner, worldgen, character/power, NPC offscreen, repair/conformance. | **Mostly implemented** | Do not create a generic "all prompts are bad" phase. New prompt work must name the specific seam and evidence. |
| Provider conformance is fully solved | `.planning/ROADMAP.md:608` and `.planning/STATE.md:75-76` keep active OpenCode role-model conformance release-blocking / `release_ready: false`. | **Not fully solved** | Keep provider/live conformance as an explicit gate; do not mark prompt stability as fully player-safe from local deterministic tests alone. |
| Dense worldgen placement is structurally addressed | `.planning/STATE.md:61` records cast-driven NPC placement expansion; `.planning/quick/260501-a9z.../SUMMARY.md:13` records dense macro overcrowding, broad-only placement, invalid scene references, parent mismatch, and overcapacity detection. | **Implemented structurally after quick repair** | Do not plan "create sublocations" from scratch. Validate generated topology in live worlds and focus on dramaturgical entrances/routines. |
| Pacing/tension management exists | No comparable state artifact found for intensity tracking, relief/pressure alternation, or scene pacing policy. | **Missing** | Phase 79 should add pacing only after scene-first presentation exposes current state. |
| Scene-useful memory exists | Existing memory/retrieval is not audited in this research; `.planning/STATE.md:45-48` keeps live play quality/UAT gates open. | **Unknown/partial** | Phase 80 requires a separate memory audit before implementation scope is locked. |
| Live game quality is proven | `.planning/STATE.md:45`, `48`, `57`, and `68` all keep live play quality/UAT/provider gates explicit follow-up work. | **Not proven** | Phase 81 should be a real play validation gate, not another structural closeout. |

### Estimation Rules For Future GSD Planning

Use this gate before adding or planning any roadmap-scale phase in this area:

1. **No architecture claim without evidence row.** Every "missing", "done", or "partial" claim needs at least one code path, roadmap/state line, test, live log, or GitNexus result.
2. **Separate structural completion from player-visible completion.** Backend artifacts can be implemented while the game still feels wrong. UI failure does not automatically imply backend absence.
3. **Separate local deterministic validation from live provider validation.** A green unit suite does not prove GLM/Mimo/Kimi/DeepSeek stability unless the relevant live conformance gate ran or the scope explicitly excludes it.
4. **Prefer extend/adapt over rebuild.** If an artifact exists (`SceneFrame`, `NarratorPacket`, `ScenePlan`, `CombatEnvelope`), the default plan is adapter/reformatter/enrichment, not a parallel replacement.
5. **Name the non-goals.** Each next phase must explicitly list what it is not rebuilding, especially existing Phase 70/74/75 systems.
6. **Treat user live failures as demotion evidence.** A completed phase can be structurally complete and still be demoted to "live-risk" if a real campaign shows a bad outcome.
7. **Require before/after player-experience tests for UX phases.** For game-feel work, code correctness is not enough; the plan must include a playable scenario and a rubric.
8. **Use latest state precedence.** When old research, phase plans, and code disagree, order evidence by: live failure/log > current code > latest `STATE.md`/verification > roadmap summary > old research.

### Specific Current Mismatches

1. Scene presence exists, but presentation does not lead with scene presence.
   - The frontend still reads like inspector panels around a log.
   - `NarratorPacket` has presentational inputs, but they are not first-class UI events.

2. Placement expansion exists, but placement is not the same as dramaturgy.
   - Creating sublocations and assigning NPCs solves only the database crowding problem.
   - It does not solve why a character enters, whether the player notices them, or what scene pressure they exert.

3. Oracle is still thin outside combat.
   - `backend/src/engine/oracle.ts` currently centers `actorTags`, `targetTags`, `environmentTags`, and `sceneContext`.
   - Combat now has `CombatEnvelope`; the remaining gap is non-combat fictional position: established reputation, preparation, method specificity, current positioning, stakes, and fail-forward consequences.

4. Prompt contracts are much stronger, but future seams still need the same standard.
   - Phase 74 closed many structured-output prompt-contract gaps.
   - New model calls must not regress into "schema only"; each must still state the gameplay job, allowed candidates, and backend consumption path.

5. Memory is not yet game-shaped enough.
   - Useful memory is not "all text so far".
   - Useful memory is unresolved threads, known-to-whom observations, relationship deltas, location history, NPC agenda ticks, foreshadowing, and consequences.

## Proposed Direction

### 1. Formalize The Existing Runtime Dramaturgy Output

Do not start by introducing a parallel backend director. Phase 70 already built most of the runtime spine: `SceneFrame`, Oracle, ScenePlan validation/execution, and `NarratorPacket`.

The near-term job is to make that spine explicit as a player-facing presentation contract. If the frontend needs a narrower shape than `NarratorPacket`, build a small adapter/reformatter over existing artifacts before inventing new authority.

Existing or expected inputs:

- `SceneFrame` before the turn.
- Raw player action or `Continue` marker. Any legacy `intent`/`method` field is transport compatibility until refactor, not backend-authored meaning.
- Oracle result, if one was needed.
- ScenePlan and executed action results.
- Canonical turn packet.
- `NarratorPacket`.
- `SceneFrame` after execution, if needed and available.
- Recent location events, NPC agenda state, unresolved threads, ambience/time state.

Potential adapter output:

```ts
type PresentationEvent =
  | { type: "scene_opening"; locationId: string; phase: ScenePhase; textHints: string[] }
  | { type: "actor_clear"; actorId: string; reason: PresenceReason }
  | { type: "actor_hint"; actorId: string; signal: string }
  | { type: "oracle_cue"; tier: "clean" | "close" | "bad"; stakes: string; consequence: string }
  | { type: "world_change"; summary: string; affectedIds: string[] }
  | { type: "location_reveal"; locationId: string; persistence: "ephemeral" | "persistent" }
  | { type: "thread_tick"; threadId: string; visibleSignal: string }
  | { type: "control_return"; reason: string; suggestedVerbs: string[] };
```

The exact schema can change, and it may be unnecessary if the frontend can consume `NarratorPacket` directly. The architectural rule should not change: the UI should render a directed scene stream, not infer game feel from raw logs.

### 2. Use Stage Presence, Not Just Location Membership

Every actor in the same macro or persistent location should fall into one of four current scene bands:

- `clear`: player can directly perceive/interact now.
- `hint`: player has a sensory clue, rumor, sign, track, message, crowd reaction, or environmental evidence.
- `offscreen_relevant`: active in this location/thread but not currently perceivable.
- `unavailable`: not in the current practical scene.

This banding must drive:

- Narrator visibility.
- Quick/action suggestions.
- NPC initiative.
- Oracle target eligibility.
- UI display.

### 3. Treat Character Placement As Story Integration

Worldgen should not merely assign `Satoru Gojo -> Tokyo Jujutsu High`.

For each key/support NPC, worldgen or post-worldgen expansion should produce:

- broad location anchor
- practical scene anchor or routine set
- why they are there
- what they are doing if not interrupted
- what could make them enter the player's scene
- what signs might reveal them before direct appearance
- who they know or are avoiding
- what would move them elsewhere

This preserves the user's expectation: characters are logically woven into Shibuya/Tokyo/world context, not distributed across a fixed small set of rooms.

### 4. Make Location Spawning Demand-Driven But Stateful

Location policy:

- `macro`: city, district, school, region.
- `persistent_sublocation`: named place worth revisiting, anchoring an NPC/item/thread/service/history.
- `ephemeral_scene`: one-off camera/stage context for a beat.
- `promoted_location`: an ephemeral scene promoted because it gained state, recurrence, an item, a relationship, a fight, a secret, or user attention.

The director may use an ephemeral scene freely for staging, but backend should persist only when the place gains game value.

Locations should also carry affordances:

- what can be done here
- what pressures exist here
- what senses dominate here
- what local NPC roles exist
- what threads can surface here

### 5. Redesign Oracle Around Fictional Position

The Oracle should not primarily ask "do tags contain Skill X?"

It should receive an evidence bundle:

- actor capabilities: traits, skills, power stats, hax, vulnerabilities, loadout, reputation, self-image when relevant
- action method and specificity
- target resistance and awareness
- environment pressure
- current position and preparation
- stakes and failure mode
- established facts and recent consequences
- whether uncertainty is actually needed

LLM role:

- classify fictional difficulty/friction
- cite the decisive evidence
- propose hit/weak-hit/miss consequences

Backend role:

- map tier to percentage
- roll
- enforce caps/bounds
- persist outcome
- prevent impossible targets/actions

Default UI role:

- show the player "clean", "close", or "bad" with the fictional consequence.
- hide raw percentage/roll behind an expandable receipt.

### 6. Define When Not To Use Oracle

No roll should happen when:

- the action is pure conversation without resistance
- the action is guaranteed by current authority/state
- the player asks to inspect obvious local facts
- the result would only create dead air
- the system has no meaningful consequence for failure

In these cases the director should resolve directly or ask the narrator to present observation/dialogue.

### 7. Prompt Contracts Must State The Gameplay Job

For every structured model call, the prompt should include:

- the schema shape
- allowed candidates
- hard invalid examples
- output role in gameplay
- what the model must not decide
- what evidence it should use
- how the backend will consume the result

The missing piece is often not "JSON example"; it is "why this JSON exists in the game loop".

### 8. Memory Should Be Scene-Useful

Store and retrieve:

- authored facts
- current known location and scene scope
- known-to-whom observations
- unresolved threads and progress
- relationship deltas
- promises, threats, debts, injuries, items, clues
- location recent events
- NPC agenda ticks
- foreshadowing hooks and prior hints
- player style/preferences if explicitly learned

Do not treat full prose transcript as primary memory.

### 9. UI Should Become Scene-First

The default play screen should prioritize:

1. current scene title/ambience/time
2. latest narrated beat stream
3. perceivable actors and hints
4. consequences/changed facts
5. player input and scene verbs

Panels like Oracle, lore, character details, IDs, and raw world state should remain available, but as debug/inspection surfaces. They should not be the default grammar of play.

## Candidate GSD Work

### Phase 77: Scene-First Play Surface

Goal: Replace the cockpit default with a playable scene surface driven primarily by existing `NarratorPacket` / `SceneFrame` data.

Deliverables:

- Scene reader component with beat-segmented narration.
- Current place, ambience, visible actor strip, hint/perception strip, and changed-facts summary.
- Compact diegetic mechanics instead of always-open raw Oracle panel.
- Scene verbs instead of "Support Actions" framing.
- Debug panels behind explicit mode.
- Minimal backend presentation adapter only if the frontend cannot consume current `NarratorPacket` safely.

Why first: the backend already has useful dramaturgical truth, but the player still sees a cockpit.

### Phase 78: GM-First Turn Orchestration And Oracle-As-Requested Tool

Goal: Move freeform turn meaning out of backend pre-classification and into the GM/Judge. Oracle becomes a requested adjudication tool for meaningful uncertainty, not an automatic pre-pass for every action.

Deliverables:

- Neutral scene packet contract: candidates, visible/sensed/offscreen presence, current location scope, recent events, memory hints, and allowed tools without backend intent/hostility/target authority.
- Raw input contract: one player text/Continue input; legacy `intent`/`method` fields are treated as compatibility only.
- GM decision contract: no-roll direct resolution, requested Oracle/roll, tool call, combat transition, clarification, or scene-breathing continuation.
- Oracle evidence bundle when requested: preparation, position, method specificity, environment pressure, social/fictional leverage, reputation, established facts, stakes, and failure mode.
- Backend deterministic executor for GM-supplied tool calls/IDs, with validation, rollback, and receipts.
- UI presentation mapping from raw roll/tool receipt to diegetic outcome when a mechanic was actually used.

### Phase 79: Director Pacing And Tension Management

Goal: Add intensity and scene-phase policy so the game alternates opening, exploration, tension, resolution, aftermath, relief, and discovery instead of treating every turn as equal.

Deliverables:

- Per-scene intensity tracker.
- Phase-appropriate beat selection.
- NPC entrance/exit timing informed by pacing and state.
- Tension relief rules.
- Tests proving long play does not become constant pressure, constant quiet, or random NPC pop-ins.

### Phase 80: Scene-Useful Memory Contract

Goal: Make memory retrieval serve scenes rather than stuffing prose transcript back into context.

Deliverables:

- Structured post-turn memory writer.
- Known-to-whom visibility filter.
- Unresolved thread and foreshadowing hook lifecycle.
- Relationship/location/NPC agenda deltas.
- Retrieval policy that budgets context by scene relevance.

### Phase 81: Live Play Quality Validation Gate

Goal: Stop proving only structural correctness; play enough turns to measure whether the game feels good.

Deliverables:

- 10+ turn playtest scripts across dense known-IP, sparse original, and mixed-premise campaigns.
- Per-turn rubric: scene clarity, pacing, NPC believability, Oracle fairness, memory coherence, agency preservation.
- Issue triage into follow-up phases.
- Regression fixtures from bad live sessions.

## Verification Plan

Use these as acceptance checks for the next phases:

- Shibuya start test: a generated JJK/Naruto-style world has many characters in Shibuya/Tokyo but only a small perceivable scene cast; others are hinted/offscreen/unavailable with reasons.
- Parfait search test: searching for a pastry shop should not summon all nearby NPCs; it should resolve via observation/travel/environment, with Oracle only if uncertainty matters.
- Key NPC intro test: Gojo or another key character appears because of a routine, agenda, clue, or player-caused intersection, not because they share a location row.
- Location growth test: a new alley/shop/platform can be ephemeral for one beat and becomes persistent only after state attaches to it.
- Oracle fairness test: a powerful imported character's odds reflect capabilities beyond tags, while misses still produce playable consequences.
- UI language test: normal play contains no raw debug labels, no "support action" framing, and no unexplained backend jargon.
- Memory test: a clue introduced as hint can be recalled later without exposing hidden facts early.

## Immediate Recommendation

Do Phase 77 next, but define it as **Scene-First Play Surface over existing runtime packets**, not as a new backend director rewrite.

Reason: WorldForge already has enough backend state to drive better play. The player cannot feel it because the default UI still exposes logs, panels, and raw mechanics before it exposes the current scene. Phase 77 should make the existing `NarratorPacket` / `SceneFrame` path playable, then later phases can deepen Oracle, pacing, memory, and validation.

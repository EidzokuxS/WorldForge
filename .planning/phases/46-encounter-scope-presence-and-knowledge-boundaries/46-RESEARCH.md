# Phase 46: Encounter Scope, Presence & Knowledge Boundaries - Research

**Researched:** 2026-04-12
**Domain:** encounter-scoped scene participation, player awareness, and NPC knowledge boundaries
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Scene Participation
- **D-01:** A large location does **not** mean everyone there is in one shared scene.
- **D-02:** A scene should be local and concrete: the specific tunnel, platform, room, street corner, rooftop, or other immediate place where events are happening now.
- **D-03:** Characters are part of a scene because they are really there and can act in it, not because the player has already noticed them.
- **D-04:** The world must not be built around the player’s awareness. A character can be present in the scene before the player realizes it.

### Perception Model
- **D-05:** Player-facing text may include only what the player character could realistically notice in the moment.
- **D-06:** Perception is broader than direct sight. It can come through sound, vibration, pressure, smell, visible aftermath, shouted warnings, magical energy, cursed energy, aura, chakra, or other world-specific sensory channels.
- **D-07:** Perception must use a lightweight hidden-check / heuristic layer rather than a heavyweight simulation system.
- **D-08:** The target is an 80/20 result: believable perception rules without turning the game into a giant math monster.
- **D-09:** A character’s abilities, perks, instincts, and energy-sensing traits may let them notice things an ordinary person would miss, but this must not become omniscience.

### Knowledge Boundaries
- **D-10:** NPCs are not allowed to know about another actor just because both are somewhere inside the same large location.
- **D-11:** NPC knowledge must have a basis: direct contact, current perception, reputation, prior meeting, second-hand report, or a world-specific recognition method that makes sense.
- **D-12:** “Key NPC” status is not itself a valid reason for extra knowledge.
- **D-13:** Knowledge and presence are separate layers. Someone can be present in the scene without yet being known or recognized.

### Hidden Participants
- **D-14:** Hidden or unnoticed characters must still count as real participants in the current scene.
- **D-15:** They can listen, move, choose positions, prepare actions, and react before the player notices them.
- **D-16:** The player should only receive the amount of information their character could actually perceive: footsteps, a shadow, a pressure shift, a strange presence, a sudden interruption, and so on.
- **D-17:** The system should never “turn off” real scene participants just because they are not yet visible in the narration.

### Claude's Discretion
- Exact hidden-check representation and how much is explicit vs heuristic
- Exact thresholds or bands for ordinary senses versus supernatural/energy senses
- Exact data model for “present but unnoticed” actors
- Exact prompt/API/UI surfaces used to expose partial awareness without leaking hidden state

### Deferred Ideas (OUT OF SCOPE)
None. The discussion stayed inside Phase 46.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCEN-02 | Scene participation and knowledge follow encounter/perception scope, so large locations do not behave like one small room and NPCs do not over-know unseen actors. | The sections below identify the exact same-location leaks, the smallest viable three-layer model, the central perception seam, and the ordered plan split needed to implement it safely. |
</phase_requirements>

## Summary

The live bug is not a missing prompt instruction. It is a runtime contract problem: `currentLocationId` is still being used as broad place, immediate scene, and awareness boundary at the same time. That leaks through scene assembly, prompt assembly, present-NPC settlement, and off-screen routing.

**Primary recommendation:** add one shared encounter-scope resolver that separates `presence`, `awareness`, and `knowledge basis`, then make all four runtime seams consume that resolver instead of querying raw same-location membership.

## Standard Stack

### Core

| Library / Seam | Purpose | Why Standard |
|---------|---------|--------------|
| Existing SQLite + Drizzle actor/location state | authoritative runtime truth | Retry, undo, restore, and Phase 45 sequencing already depend on it. |
| `scene-assembly.ts` | authoritative scene read model | Phase 45 created this seam specifically so scene truth can be tightened without reopening the full turn pipeline. |
| `prompt-assembler.ts` | hidden-pass and final-pass prompt inputs | This is where location-wide presence currently leaks into both narrator and NPC-facing context. |
| `npc-agent.ts` + `npc-offscreen.ts` | local actor routing | These already divide "present now" from "off-screen later"; the bug is the routing criterion. |

### Supporting

| Seam | Purpose | When to Use |
|------|---------|-------------|
| `start-condition-runtime.ts` | lightweight visibility/pressure heuristics | Reuse for awareness bands instead of inventing a numeric stealth system. |
| `location-events.ts` | bounded local spillover | Use for audible/ambient/aftermath cues that should be perceivable without full reveal. |
| canonical character records + runtime tags | observer/target traits | Use for "can notice" and "can recognize" heuristics. |

**Installation:**
```bash
# No new packages recommended for Phase 46.
```

## Architecture Patterns

### Current Runtime Seams That Force Same-Location Co-Presence or Over-Knowledge

1. `backend/src/engine/scene-assembly.ts`
   - `buildPresentNpcNames()` selects all NPCs where `npcs.currentLocationId == currentScene.id`.
   - `summarizeCommittedEvent()` and most scene effects are marked `perceivable: true`.
   - `playerPerceivableConsequences` appends `"{name} is present in the current scene."` for every same-location NPC.

2. `backend/src/engine/prompt-assembler.ts`
   - `buildNpcStatesSection()` selects all NPCs at the player's `locationId`.
   - `buildSceneSection()` also exposes NPC equipment for all same-location NPCs.
   - runtime rules explicitly tell the model that `[NPC STATES]` means "present at the player's location" and that key NPCs there must react.

3. `backend/src/engine/npc-agent.ts`
   - `tickPresentNpcs()` selects present key NPCs by `playerLocationId`.
   - `tickNpcAgent()` builds `Nearby entities` from every player/NPC with the same `currentLocationId`.
   - result: same-location NPCs can over-know who is nearby before perception or recognition is established.

4. `backend/src/engine/npc-offscreen.ts` and `backend/src/routes/chat.ts`
   - off-screen currently means only `npcs.currentLocationId != playerLocationId`.
   - same large location but different local encounter pocket has no representation.

### Minimal Runtime Model

| Layer | Meaning | Minimal Authority | Consumers |
|------|---------|-------------------|-----------|
| Presence | Actor is physically part of the current local encounter and may act in it, even if unnoticed. | `sceneScopeId = currentSceneLocationId ?? currentLocationId` on actors, resolved centrally. | present-NPC settlement, scene assembly, off-screen routing |
| Awareness | What an observer can currently notice about a present actor. | Derived per observer: `none`, `hint`, `clear`. Use traits, visibility flags, local effects, and spillover events. | final narration, NPC prompts |
| Knowledge Basis | Why an observer may identify or reason about a noticed actor. | Derived reasons: `perceived_now`, `prior_relation`, `reputation`, `report`, `none`. | NPC prompts, reveal/recognition wording |

**Prescriptive shape:** keep the new durable data minimal. Persist local encounter scope only. Derive awareness and knowledge at read time.

### Where Lightweight Perception Checks Should Live

Create one new backend seam, for example `backend/src/engine/scene-presence.ts`, that returns a turn-local snapshot:

```ts
type AwarenessBand = "none" | "hint" | "clear";
type KnowledgeBasis = "none" | "perceived_now" | "prior_relation" | "reputation" | "report";

type PresenceSnapshot = {
  sceneScopeId: string | null;
  presentActorIds: string[];
  awarenessByObserver: Map<string, Map<string, AwarenessBand>>;
  knowledgeByObserver: Map<string, Map<string, KnowledgeBasis>>;
};
```

That seam should be the only place that answers:

- who is physically present in the current encounter
- what the player can notice right now
- what each NPC can notice or identify right now

It should then be consumed in four places:

1. `routes/chat.ts` / `tickPresentNpcs()` selection before pre-visible settlement.
2. `scene-assembly.ts` when building `presentNpcNames`, `sceneEffects`, and `playerPerceivableConsequences`.
3. `prompt-assembler.ts` when building `[SCENE]`, `[NPC STATES]`, and any visible/prompt hints.
4. `npc-offscreen.ts` when deciding who remains off-screen for batch simulation.

**Do not** scatter separate perception heuristics across `scene-assembly.ts`, `prompt-assembler.ts`, and `npc-agent.ts`. That would recreate the drift this phase is supposed to fix.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Encounter boundaries | full spatial/LOS simulator | one shared encounter-scope resolver with a nullable local scope field | This phase needs deterministic boundaries, not geometry simulation. |
| Hidden perception | stat-heavy stealth math | lightweight tag/event/visibility heuristics | Matches the 80/20 goal in the locked decisions. |
| NPC knowledge | persistent pairwise omniscience table | derived `knowledge basis` on prompt reads | Enough to stop same-location over-knowledge without a migration-heavy subsystem. |

## Common Pitfalls

### Risk 1: Fixing only final narration
`assembleFinalNarrationPrompt()` still starts from `assemblePrompt()`. If only the final scene block changes, the hidden pass and NPC prompts still over-know the same-location cast.

### Risk 2: Treating unnoticed actors as absent
That breaks D-03, D-14, and D-17. Hidden participants must stay in `presentActorIds` even when the player has only a `hint` or `none` awareness band.

### Risk 3: Keeping off-screen routing keyed only to `currentLocationId`
This preserves the "whole district is one room" bug even if narration gets better.

### Risk 4: Breaking compatibility for existing campaigns
If a new local scope field is added, old rows must load with `currentSceneLocationId ?? currentLocationId`. No backfill should be required for Phase 46.

### Risk 5: Prompt/docs/tests currently encode the old rule
`docs/memory.md`, `prompt-assembler.ts`, and existing tests still assume "NPCs at player location are present." Planner should expect contract and regression updates in the same phase.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `3.2.4` |
| Config file | `backend/vitest.config.ts` |
| Quick run command | `npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/npc-offscreen.test.ts src/routes/__tests__/chat.test.ts` |
| Full suite command | `npm --prefix backend run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCEN-02 | Same broad location does not imply present-scene membership | unit | `npm --prefix backend exec vitest run src/engine/__tests__/scene-presence.test.ts` | ❌ Wave 0 |
| SCEN-02 | Final-visible prompt excludes hidden or different-scope actors while preserving hints/perceivable spillover | integration | `npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts -t "encounter scope"` | ✅ extend |
| SCEN-02 | Acting NPC only receives perceivable or otherwise justified nearby actors | unit | `npm --prefix backend exec vitest run src/engine/__tests__/npc-agent.test.ts -t "encounter scope"` | ✅ extend |
| SCEN-02 | Off-screen simulation routes by encounter scope, not only broad location | unit | `npm --prefix backend exec vitest run src/engine/__tests__/npc-offscreen.test.ts -t "encounter scope"` | ✅ extend |
| SCEN-02 | Pre-visible settlement still runs before final narration after scope changes | integration | `npm --prefix backend exec vitest run src/routes/__tests__/chat.test.ts -t "scene scope"` | ✅ extend |

### Wave 0 Gaps

- [ ] `backend/src/engine/__tests__/scene-presence.test.ts` — new shared resolver coverage
- [ ] Extend `backend/src/engine/__tests__/prompt-assembler.test.ts`
- [ ] Extend `backend/src/engine/__tests__/npc-agent.test.ts`
- [ ] Extend `backend/src/engine/__tests__/npc-offscreen.test.ts`
- [ ] Extend `backend/src/routes/__tests__/chat.test.ts`

## Sources

### Primary (HIGH confidence)

- `backend/src/engine/scene-assembly.ts`
- `backend/src/engine/prompt-assembler.ts`
- `backend/src/engine/npc-agent.ts`
- `backend/src/engine/npc-offscreen.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/routes/chat.ts`
- `backend/src/engine/npc-tools.ts`
- `backend/src/db/schema.ts`
- `docs/mechanics.md`
- `docs/memory.md`
- `.planning/phases/46-encounter-scope-presence-and-knowledge-boundaries/46-CONTEXT.md`
- `.planning/phases/45-authoritative-scene-assembly-and-start-of-play-runtime/45-CONTEXT.md`
- `.planning/phases/45-authoritative-scene-assembly-and-start-of-play-runtime/45-VERIFICATION.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`

### Secondary (MEDIUM confidence)

- `backend/src/engine/__tests__/prompt-assembler.test.ts`
- `backend/src/engine/__tests__/npc-agent.test.ts`
- `backend/src/engine/__tests__/npc-offscreen.test.ts`
- `backend/src/routes/__tests__/chat.test.ts`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new library or platform decision is needed.
- Architecture: MEDIUM - the seam analysis is direct, but the exact storage shape for local encounter scope is still a planning choice.
- Pitfalls: HIGH - the current same-location assumptions are explicit in code, docs, and tests.

**Research date:** 2026-04-12
**Valid until:** 2026-05-12

## Recommended Plan Split

1. **Wave 0: Lock the contract with failing tests.**
   Add red coverage for encounter-scoped presence, hidden-but-present awareness hints, NPC nearby-entity filtering, and off-screen routing by local scope.

2. **Wave 1: Add the shared encounter-scope seam.**
   Introduce the nullable local scope field or equivalent resolver input, then build one `PresenceSnapshot` helper that separates `presence`, `awareness`, and `knowledge basis`.

3. **Wave 2: Rewire scene and prompt reads to the snapshot.**
   Update `scene-assembly.ts` and `prompt-assembler.ts` so both hidden and final-visible passes use the filtered actor set and awareness-driven consequences.

4. **Wave 3: Rewire actor routing and compatibility surfaces.**
   Update `tickPresentNpcs()`, `tickNpcAgent()`, `simulateOffscreenNpcs()`, prompt/docs language, and any regression expectations that still equate player location with immediate encounter scope.

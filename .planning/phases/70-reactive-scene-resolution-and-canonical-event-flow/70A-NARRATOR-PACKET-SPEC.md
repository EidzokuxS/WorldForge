# Phase 70A NarratorPacket Spec

Scene Planner of Record does not write final prose. The engine builds a CanonicalTurnPacket from committed ScenePlan execution results, then projects a NarratorPacket that the Storyteller may render.

## Decision Traceability

- D-01: Keep Oracle separate for Phase 70A.
- D-02: Replace WorldBrainSceneDirection, HiddenAdjudicationPlan, and tickPresentNpcs on the visible critical path with one ScenePlan.
- D-03: Backend owns validation, execution, state, rollback, visibility, and tick boundaries.
- D-04: LLM owns semantic local response selection and final prose inside bounded packets.
- D-05: Present NPC autonomy cannot run as an independent critical mini-round.
- D-06: Background drift does not block visible response.
- D-07: Storyteller receives only the player-perceivable committed packet.
- D-08: Migrate the existing pipeline, no rewrite.

## Engine-owned

NarratorPacket is Engine-owned. It includes player action, Oracle outcome, anchor event, perceivable events, perceivable responses, perceivable effects, visible actor labels, hint signals, guardrails, and controlReturnReason.

Hard rules:

- narratorFacts are reference-only backend refs, never free prose
- hidden actor names do not enter the packet prompt
- hint-band actor names go into backend-only forbiddenActorNames and forbiddenFactMarkers
- hint signals may appear in prompt text only as obfuscated signs, not identities
- forbiddenActorNames and forbiddenFactMarkers are scan metadata only and must not be formatted into prompt text
- final visible narration is non-streaming or buffered until runVisibleNarrationWithPacketGuard passes
- no narrative SSE or TurnEvent may be emitted before the output guard validates final prose

## LLM-owned

The Storyteller LLM owns only final prose over the packet. It may choose style, pacing, sensory emphasis, and sentence structure. It cannot invent new material events, reveal hidden names, quote backend markers, or narrate outside the committed packet.

## T70-09 Output Guard Coverage

T70-09 guard behavior:

- scan final generated prose after generation
- retry once with a generic guard addendum
- do not reveal forbidden terms in the retry addendum
- throw before appendChatMessages on the second violation
- route snapshot restore handles rollback after the throw

## Deferred

- Oracle and Scene Planner fusion
- full all-actor global simulation
- background faction/offscreen scheduler rewrite
- actor reflection architecture rewrite
- new UI work
- new persistence schema unless proven necessary
- generalized social/combat/romance/economy subsystem redesign

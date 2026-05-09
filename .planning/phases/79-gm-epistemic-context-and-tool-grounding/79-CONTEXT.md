# Phase 79 Context: GM Epistemic Context And Tool Grounding

## Problem

Phase 78 moved WorldForge toward a GM-first turn loop, but the GM still receives a noisy backend truth packet and overly free mutation tools. In campaign `0ca0dc4e-cc7e-44e3-8099-0820d3b9494b`, a local Shibuya cafe beat caused the GM to call `spawn_npc` with `locationName: "Okutama Safe Zone - Forest Outpost"`. The backend accepted it because the location existed anywhere in the campaign.

That failure is not only a backend validation bug. It is a data-flow bug:

- offscreen/background entities and locations are visible in model-facing prompts;
- `spawn_npc` takes a free-text location name instead of a backend-approved local ref;
- `log_event` is described broadly enough that transient local beats become durable searchable memory;
- scene assembly can summarize a wrong-location spawn as visibly present in the current scene;
- the GM does not get a clean distinction between local scene truth, player-known facts, legal tool affordances, and private/background simulation.

## Locked User Direction

- Backend is the rulebook and world truth, but it must not understand prose as meaning.
- LLM is the GM: it interprets fiction, chooses what matters, asks for rolls/tools, and writes the next beat.
- Backend does deterministic work: state reads, IDs, legal refs, schema validation, rolls, persistence, rollback, invariant enforcement.
- Do not copy Marinara. Use its GM feel as reference only.
- Do not patch only one tool. Fix the class of context/tool-grounding leaks.
- Do not make every direct action durable. Ask whether the fact must matter later.
- Background simulation may be slow or rich, but it must not pollute local narration unless surfaced to the player.

## Target Outcome

The GM sees a model-facing scene packet that behaves like a human GM's table notes:

- what is immediately present;
- what the player can perceive or infer;
- legal nearby targets and movement affordances;
- recent local context only;
- allowed backend tools with grounded arguments;
- counts or opaque summaries for hidden/background material, not names and locations.

The backend still keeps full truth internally. The model-facing packet is a view, not the database.

## Anti-Goals

- Do not remove backend validation.
- Do not let LLM directly write state.
- Do not give the GM remote/offscreen actors and locations "just in case".
- Do not require command modes like Act/Speak/Observe.
- Do not make a generic text classifier in backend decide whether something is combat, movement, shopping, or dialogue.
- Do not preserve old free-text tool arguments as the preferred contract for new GM-facing prompts.

## Regression Case

The phase must include an automated reproduction of the Forest Outpost leak:

1. Player is in `Shibuya District` / local Shibuya scene.
2. Campaign also contains `Okutama Safe Zone - Forest Outpost`.
3. Recent/offscreen/background data mentions Forest Outpost.
4. GM/tool planner tries to spawn or log a Shibuya service beat using Forest Outpost.
5. Expected result:
   - model-facing prompt does not contain Forest Outpost as a local target;
   - `spawn_npc` cannot use that remote location from a local turn;
   - invalid tool plan fails before DB mutation;
   - final narrator packet cannot claim a remote spawn is present locally.

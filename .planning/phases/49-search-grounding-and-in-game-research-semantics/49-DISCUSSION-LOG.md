# Phase 49 Discussion Log

**Date:** 2026-04-12
**Phase:** 49 — Search Grounding & In-Game Research Semantics

## Topics Covered

### 1. Why search exists at all
- Decision: search is a grounding layer for cases where model weights are unreliable.
- User direction: canon facts, character details, and event specifics should not be trusted to raw model memory when accuracy matters.

### 2. What should happen with world canon
- Decision: do not bulk-preload world canon before campaign start.
- User direction: world canon should be researched while the world is being formed; the real need is to retain and reuse that knowledge instead of throwing it away or redundantly re-searching it.

### 3. What should be prepared before live play
- Decision: prepare and store character-centered grounding ahead of play.
- User direction: character profiles should include identity-relevant facts, abilities, constraints, signature moves, and power-relevant summaries so they do not need to be looked up from scratch every time.

### 4. How to treat power-scaling sources
- Decision: use structured power-scaling sources as one input, not as unquestioned absolute truth.
- User direction: power-scaling wikis can help translate destructive scale and related traits into a structured profile, but WorldForge should still own the final model.

### 5. Whether this phase should also solve overpowered-character gameplay balance
- Decision: no, not fully.
- User direction: the game will eventually need countermeasures and consequences for overwhelming power, but this phase should first establish grounded truth, power profiles, and lookup rules rather than trying to solve the entire gameplay-balance problem at once.

### 6. How visible in-game research should be
- Decision: use a hybrid model.
- User direction: the system may use grounding silently where needed, but the player should also have an explicit way to ask for clarification, canon lookup, or comparison during play.

## Outcome

Phase 49 should be planned as a grounding and retrieval-truth phase. It should improve worldgen research reuse, create stronger character and power grounding, and define when live gameplay can perform explicit fact lookup without polluting ordinary scene narration.

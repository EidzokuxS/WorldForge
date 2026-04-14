---
phase: 8
reviewers: [claude, gemini]
reviewed_at: 2026-04-08T10:22:00+03:00
plans_reviewed: [08-01-PLAN.md, 08-02-PLAN.md]
---

# Cross-AI Plan Review — Phase 8

## Claude Review

# Phase 8: World Engine — Plan Review

## 08-01: Faction Tick System

### Summary
Solid, well-scoped plan that follows established codebase patterns (NPC agent ticks, reflection tools). The two-task split is clean: core logic + wiring. The interfaces block gives the executor everything needed without re-reading files. TDD approach is appropriate for the tool/orchestrator pattern.

### Strengths
- Reuses proven patterns: `npc-agent.ts` for sequential LLM calls, `reflection-tools.ts` for tool factories
- Interval gating (`tick % interval`) prevents unnecessary LLM calls — cost-conscious
- Per-faction try/catch isolation prevents one faction failure from blocking others
- Chronicle auto-entry on `faction_action` is a smart design — ensures events are always recorded
- Clean separation: tools in one file, orchestrator in another

### Concerns
- **LOW** — `faction_action.tagChanges` resolves entities by name, but faction/location names aren't unique-constrained in the schema. If two locations share a name (unlikely but possible), the wrong one could be mutated. The plan doesn't specify "first match" or "error on ambiguous" behavior.
- **LOW** — Loading "all other factions as neighbors" skips graph traversal. Fine for small worlds (10-20 factions), but the plan doesn't document a scaling note. Acceptable given CONTEXT.md decision.
- **LOW** — `update_faction_goal` max 10 goals cap is arbitrary but reasonable. No concern, just noting the magic number.

### Suggestions
- Consider adding a `factionName` field to the `faction_action` tool context (currently the LLM has to infer which faction it's acting as from the system prompt). This is implicit but could be explicit for clarity.
- The "neighboring factions" query (locations with connected locations owned by other factions) could be expensive with many locations. A comment noting this is O(factions × locations) would help future maintainers.

### Risk Assessment: **LOW**
Well-defined scope, follows established patterns, no architectural novelty. The executor has clear interfaces and the TDD approach will catch edge cases.

---

## 08-02: World Events + Information Flow

### Summary
Good plan that completes the phase with two clean additions: a world event tool and a WORLD STATE prompt section. The information flow design is elegant — no explicit propagation system, just prompt assembly that makes world context visible to the LLM. The decision to rely on LLM inference rather than explicit event routing is sound and matches CONTEXT.md.

### Strengths
- `declare_world_event` with typed `eventType` enum enables structured tagging (`"Plague-affected"`) rather than free-text chaos
- The `[WORLD EVENT]` prefix in chronicle entries enables future filtering/search
- WORLD STATE at priority 3 with `canTruncate: true` is the right priority level — important but expendable under token pressure
- Information flow via prompt composition (not explicit event propagation) is architecturally simple and maintainable
- The plan explicitly documents WHY no explicit propagation is needed, referencing the CONTEXT.md decision

### Concerns
- **MEDIUM** — The event tag format `"Plague-affected"` is applied via string concatenation (`eventType + "-affected"`?). The plan doesn't specify the exact tag format. If it's `"plague"` (lowercase eventType), that's different from the example `"Plague-affected"`. The executor might guess wrong. Should specify: `{EventType}-affected` (capitalized) matching the existing `"Controlled by {name}"` convention.
- **LOW** — `buildWorldStateSection` queries last 5 chronicle entries AND all factions on every prompt assembly. This runs every turn, not just every N ticks. For most games (< 50 chronicle entries, < 10 factions) this is trivial, but worth noting it's a per-turn cost.
- **LOW** — The plan says "Wire into assemblePrompt after scene section (step 4.5)" but doesn't specify the exact insertion point in the `allSections` array. The executor will need to read the file to find the right spot — which `read_first` covers, so this is fine.

### Suggestions
- Specify the exact location tag format for world events: `"{EventType}-affected"` (e.g., `"Plague-affected"`, `"Disaster-affected"`). This prevents ambiguity.
- Consider whether `affectedLocations` should fail silently or warn when a location name isn't found. The plan says "resolve by name+campaignId" but doesn't specify the not-found behavior. Recommend: skip unfound locations, return count of actually affected.
- The faction summary format (`[merchant, powerful], Goals: [control trade routes]`) could get verbose with many factions. Consider a `maxFactions` limit or truncation note for worlds with 15+ factions.

### Risk Assessment: **LOW**
The plan is well-scoped and the information flow design is sound. The only medium concern (tag format) is a minor ambiguity the executor can resolve by reading existing code patterns.

---

## Overall Phase Assessment

**Risk: LOW** — Both plans are well-structured, follow established patterns, and have clear TDD coverage. The phase achieves all 5 requirements (WRLD-01 through WRLD-05) across the two plans. The dependency ordering (01 → 02) is correct. No scope creep — the plans stay within the faction tick + information flow boundary defined in CONTEXT.md.

The only thing I'd flag for the broader project: the "Active Requirements" section in PROJECT.md still lists Oracle, turn processing, tools, etc. as unchecked despite being marked as validated above. This is a documentation inconsistency, not a plan issue.


---

## Gemini Review

# Structured Plan Review: Phase 8 - World Engine

This review covers **Plan 08-01 (Faction Tick System)** and **Plan 08-02 (World Events + Information Flow)**.

## 1. Summary
The plans for Phase 8 provide a robust, tag-driven macro-simulation of the world. By utilizing a sequential LLM evaluation for factions every N ticks, the system ensures the world evolves independently of player actions while remaining computationally manageable via non-blocking post-turn processing. The integration of world events into the existing tag-based engine and the "Information Flow" via a specialized `WORLD STATE` prompt section allows the AI to narrate a living world where knowledge is grounded in proximity and affiliation rather than global omniscience.

## 2. Strengths
- **Surgical Integration:** Wiring the World Engine into the `buildOnPostTurn` pipeline as a non-blocking step 5 ensures that macro-simulation doesn't add latency to the player's immediate narrative response.
- **Tag-Based Territory Control:** Using a simple string pattern (`Controlled by {factionName}`) for territory ownership is elegant and leverages the existing tag-based engine without requiring a complex spatial grid.
- **Structured Chaos:** The `declare_world_event` tool provides a controlled way for the LLM to inject narrative variety (plagues, anomalies) that has immediate mechanical impact on location tags.
- **Clean Information Flow:** The `WORLD STATE` prompt section in the `assemblePrompt` logic is a highly efficient way to implement "information flow" without complex event-bus state management; the LLM naturally connects faction events to affiliated NPCs via context.
- **Defensive Design:** Sequential faction processing avoids DB race conditions during territory shifts, and the goal-limit (max 10) prevents token bloat.

## 3. Concerns
- **Performance/Cost (MEDIUM):** While non-blocking, running sequential LLM calls for *every* faction every 10 ticks could be expensive and time-consuming in worlds with many factions (e.g., 10+ factions).
- **Information "Teleportation" (LOW):** Requirement WRLD-05 states "information does not teleport." However, if the `WORLD STATE` section (containing recent chronicle entries) is included in *every* prompt, an NPC in a remote village might "know" about a plague across the sea as soon as it enters the chronicle. 
- **Tag Collision (LOW):** Faction territory detection depends on a case-insensitive string match. If two factions have very similar names or if a location is tagged with "Controlled by {faction} but recently lost", the heuristic might fail.

## 4. Suggestions
- **Staggered Ticks:** Instead of ticking all factions on `tick % interval === 0`, consider staggering them (e.g., `(tick + factionIndex) % interval === 0`) to spread the LLM load and cost across multiple turns.
- **Chronicle Filtering for NPCs:** To strictly satisfy "information does not teleport," consider passing the `npcId` to the `buildWorldStateSection`. If an NPC is being evaluated, the section could filter chronicle entries to only those relevant to the NPC’s location, faction, or high-importance global events, while keeping the full list for the Storyteller.
- **Explicit Ownership IDs:** While names are usually stable in WorldForge, consider using `factionId` in hidden tags or metadata for territory ownership to prevent issues if a user renames a faction in a future "World Review" edit.

## 5. Risk Assessment: LOW
The risk is low because the World Engine is decoupled from the critical turn-processing path. Failures in the faction tick system are caught and logged without crashing the main chat loop. The reliance on tag-based mechanics ensures that even if the AI makes a "wrong" tool call, the deterministic engine (Drizzle/SQLite) acts as a strict validator.

**Justification:** The pattern established in Phases 1-7 is followed closely, and the new tools are narrow in scope. The biggest unknown is the qualitative quality of faction actions, which is mitigated by the Judge model's 0.0 temperature and the structured `faction_action` schema.


---

## Consensus Summary

Both reviewers consider Phase 8 low-risk and structurally sound. The plans are seen as cleanly scoped, aligned with the existing engine patterns, and likely to achieve the intended world-engine behavior without architectural novelty. The shared view is that the phase design is good enough to execute, but a few ambiguities should have been called out more explicitly.

### Agreed Strengths
- The phase is narrowly scoped and respects the existing post-turn orchestration model instead of introducing a parallel simulation system.
- Sequential faction processing is the right default because it avoids conflicting DB mutations during territory changes.
- The tag-based representation for territory control and world events fits the rest of WorldForge's mechanics instead of introducing numeric macro-sim state.
- Information flow through prompt context rather than an explicit propagation bus is a simple and coherent design choice for this codebase.
- The plans reuse established patterns from NPC and reflection systems, so implementation risk is low.

### Agreed Concerns
- LOW: A few contract details are underspecified, especially exact world-event tag format and edge-case behavior when named entities or locations cannot be resolved cleanly.
- LOW: Territory and ownership heuristics rely on name/tag conventions rather than stronger IDs, which is acceptable now but fragile if renames or ambiguous names become more common.
- MEDIUM: Macro-sim cost and scaling were not really discussed. Sequential faction LLM calls are safe, but expensive as faction counts grow.
- LOW/MEDIUM: The documentation claim that information "does not teleport" is only approximately satisfied; chronicle/world-state context can still over-inform remote NPCs if not filtered carefully.

### Divergent Views
- Claude treats the event-tag-format issue as the most concrete ambiguity in the plans and focuses on exact implementation wording.
- Gemini is more concerned with runtime behavior drift: faction tick cost over time and the possibility that chronicle-driven WORLD STATE gives NPCs more knowledge than the docs intend.
- Claude sees the current design as fully acceptable for small worlds; Gemini pushes more strongly toward future-proofing notes like staggered faction ticks or filtered chronicle context.

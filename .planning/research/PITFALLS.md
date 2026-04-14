# Domain Pitfalls

**Domain:** AI Text RPG / LLM Game Engine with Deterministic Mechanics
**Researched:** 2026-03-18

## Critical Pitfalls

Mistakes that cause rewrites, broken gameplay, or architectural dead ends.

### Pitfall 1: State Desynchronization (LLM Narrates What Isn't True)

**What goes wrong:** The Storyteller narrates events that contradict the database. "You draw your enchanted sword" when the player doesn't have one. "The guard lies dead" when HP wasn't reduced. "You arrive at the temple" when the player is in a different location. The LLM invents items, kills NPCs, moves the player, or changes relationships without going through tools — because it *can* generate any text.

**Why it happens:** The LLM receives game state in the prompt but has no hard constraint preventing it from generating text that contradicts that state. Longer sessions increase drift because the model attends more to recent conversation than to the state block injected at the top of the prompt. Additionally, if tool calls fail silently (Zod validation error, wrong arguments), the Storyteller may narrate as if the tool succeeded.

**Consequences:** Player loses trust in the game. Inventory appears/disappears. NPCs are alive in the DB but dead in the narrative. Cascading inconsistencies that are impossible to repair without a save reload.

**Prevention:**
1. **Post-narration state audit.** After Storyteller finishes, run a deterministic check: did it reference entities not present in the scene? Did it describe HP changes without a `set_condition` tool call? Flag contradictions and either inject a correction or warn the player.
2. **Grounding block priority.** Structure the system prompt so `[PLAYER STATE]`, `[SCENE]`, and `[ENTITIES PRESENT]` appear as close to the end as possible (recency bias helps). Repeat critical facts: "The player has NO sword. The player is at [Tavern]."
3. **Tool-call-only state changes.** The Storyteller MUST use tools to change state. If the narration mentions "you pick up the key" but no `spawn_item` or inventory transfer tool was called, the key doesn't exist. Document this rule in the system prompt with examples.
4. **Failed tool call recovery.** When a tool call fails validation, inject the error into the conversation and request the LLM to retry or narrate the failure instead of the success.

**Detection:** Compare entities/items mentioned in Storyteller output against the DB state after each turn. Log mismatches. A mismatch rate above 5% signals a prompt or tool design problem.

**Phase:** Turn Cycle / Storyteller Tool Calling. Must be addressed from the very first turn processing implementation.

**Confidence:** HIGH — confirmed by RPGBENCH ("LLMs struggle with consistent mechanics"), the "Thirteen Hours" paper (function calling needed to maintain state), and the Intra project (ground truth vs. narrative truth problem).

---

### Pitfall 2: Oracle Probability Inconsistency

**What goes wrong:** The Oracle (Judge LLM) returns different probabilities for semantically identical actions. "I attack the guard with my sword" gets 65%, but "I swing my blade at the soldier" gets 40%. Worse: the same action repeated on the next turn gets a wildly different chance. Players learn to rephrase actions to game the Oracle.

**Why it happens:** LLMs are not deterministic probability calculators. Even at temperature 0, different tokenizations of the same intent produce different logits. The Oracle has no memory of past rulings, so it can't self-calibrate. Tag-based evaluation helps but the LLM still interprets tags subjectively.

**Consequences:** Players feel the game is unfair or random. They optimize for prompt engineering rather than in-world strategy. Immersion breaks when identical situations produce contradictory rulings.

**Prevention:**
1. **Temperature 0 for Oracle.** Already planned — enforce strictly.
2. **Structured Oracle input.** Don't send free-text player action to Oracle. Parse intent + method + target first (backend does this), then send a normalized payload: `{ intent: "attack", method: "melee weapon", actor_tags: [...], target_tags: [...], env_tags: [...] }`. This reduces tokenization variance.
3. **Probability clamping.** After Oracle returns a chance, clamp to nearest 5% increment (0, 5, 10, ... 95, 100). Reduces perceived inconsistency.
4. **Ruling cache (optional).** Cache recent Oracle rulings keyed by normalized intent+tags. If the same action against the same target appears within N turns, reuse the cached probability instead of re-asking the LLM. TTL of ~5 turns.
5. **Reasoning transparency.** Show the Oracle's reasoning to the player (optionally, in a collapsed panel). If the reasoning is nonsensical, the player can flag it.

**Detection:** Log all Oracle calls with input hash + returned probability. Compute variance for similar inputs. High variance (>15% for near-identical inputs) signals a problem.

**Phase:** Probability Oracle implementation. Address immediately when building the Oracle.

**Confidence:** HIGH — well-documented LLM non-determinism even at temp 0. The "Thirteen Hours" paper found dice-roll deadlock when Oracle-like functions weren't properly constrained.

---

### Pitfall 3: Token Budget Explosion (Unbounded Prompt Growth)

**What goes wrong:** As the game progresses, the prompt assembly grows unbounded: more chat history, more lore cards retrieved, more NPC states, more episodic memories, more chronicle entries. Eventually the prompt exceeds the context window, or (worse) stays within limits but pushes critical instructions out of the model's effective attention span — the "lost in the middle" effect where models ignore information in the middle of long contexts.

**Why it happens:** Every subsystem adds context independently (lore retrieval adds 3-5 cards, memory retrieval adds 3-5 events, NPC states add N blocks, chronicle adds entries). Nobody budgets the total. Each subsystem optimizes locally ("just 500 more tokens won't hurt") but globally the prompt balloons to 8K+ tokens before the conversation even starts.

**Consequences:** LLM ignores system rules (they're at the top, far from the query). Quality degrades silently — the model still generates text, just worse text. Costs increase linearly with prompt size. Latency increases. With cheap/small models (Judge role), you may exceed their context window entirely and get hard failures.

**Prevention:**
1. **Token budget system.** Assign hard token limits per prompt section: System Rules (500), World Premise (200), Scene (300), Player State (200), NPC States (400), Lore (400), Memories (400), Recent Conversation (1500), Action Result (200). Total budget: ~4200 tokens + LLM response headroom. Enforce during prompt assembly.
2. **Conversation windowing.** Keep only the last 5-8 turns in the prompt. Earlier turns are summarized into episodic memory (already planned). Never grow the conversation section unboundedly.
3. **NPC state pruning.** Only include full NPC state for NPCs *present in the current scene*. Off-screen NPCs get zero prompt space. If 4+ NPCs are present, summarize the least relevant ones.
4. **Lore card budget.** Retrieve at most 2-3 lore cards per turn, not 5. Use the most relevant only.
5. **Chronicle pruning.** Include only the 3-5 most recent chronicle entries, plus any that are semantically relevant to the current action. Don't dump the entire chronicle.
6. **Different budgets per role.** Oracle gets a minimal prompt (intent + tags + env, ~800 tokens). Storyteller gets the full prompt (~4K). NPC Agent gets medium (~2K). Reflection gets recent memories only (~1.5K).

**Detection:** Log prompt token counts per section and total per LLM call. Alert when total exceeds 80% of the model's context window. Track average prompt size over time — it should be flat, not growing.

**Phase:** Prompt Assembly. This is foundational — build the budget system *before* building individual prompt sections. Retrofitting budgets onto an existing prompt assembly is painful.

**Confidence:** HIGH — universally documented problem. Redis blog on context overflow, Intra project notes on token bloat, and the fundamental math of context windows.

---

### Pitfall 4: Tool Calling Unreliability

**What goes wrong:** The Storyteller calls tools with invalid arguments (wrong types, missing required fields, hallucinated entity IDs). Or it calls tools that don't exist. Or it calls too many tools at once, creating incoherent state changes. Or it doesn't call tools when it should (narrates "you pick up the key" without calling any inventory tool).

**Why it happens:** Tool calling reliability varies dramatically by model. Smaller/cheaper models (used for Judge role) are worse. Complex schemas with many optional fields increase error rates. When the Storyteller has 10+ tools available, it sometimes picks the wrong one. The Vercel AI SDK will throw `InvalidToolArgumentsError` on Zod validation failure, which can crash streaming responses if not caught.

**Consequences:** Uncaught validation errors crash the turn. Silent tool failures leave state unchanged while narration assumes success. Wrong tool calls create nonsensical state (adding a tag to the wrong entity). Player experiences bugs that feel like game corruption.

**Prevention:**
1. **Minimal tool schemas.** Keep each tool's Zod schema as simple as possible. Fewer optional fields = fewer failure modes. Use enums instead of free-text where possible (e.g., `condition: z.enum(["damage_1", "damage_2", "heal_1", ...])` instead of `condition: z.string()`).
2. **Entity ID validation.** Tools that reference entities (NPCs, items, locations) must validate that the entity exists in the DB *before* execution. Return a clear error if not found.
3. **Tool call error recovery.** Wrap all tool executions in try/catch. On failure, return the error message to the LLM as a tool result so it can self-correct. The AI SDK supports `maxSteps` for automatic retry.
4. **Tool call logging.** Log every tool call (name, args, success/failure, result) for debugging. This is your audit trail for state changes.
5. **Tool budget per turn.** Cap tool calls at ~5 per Storyteller response. If the model tries to call 10+ tools, something is wrong with the prompt.
6. **Omission detection.** After Storyteller output, scan the text for keywords suggesting state changes (picked up, dropped, moved to, attacked, died, etc.) and compare against actual tool calls made. Log omissions as warnings.
7. **Strict mode where available.** Use `experimental_toToolCallStrict: true` in the AI SDK for providers that support it (OpenAI). This forces the provider to only generate valid tool call arguments matching your schema.

**Detection:** Track tool call success rate per model/provider. If a model fails >5% of tool calls, it's unreliable for that role. Track omission rate (state-changing narration without corresponding tool calls).

**Phase:** Storyteller Tool Calling. Must be rock-solid before NPC agents (which add more tool-calling complexity).

**Confidence:** HIGH — confirmed by Vercel AI SDK GitHub discussion (#1905) on invalid tool calls, the HuggingFace RPG agents blog (NPCs "try to break JSON parsing in every way possible"), and the "Thirteen Hours" paper (tool calling significantly improves state management but introduces new failure modes).

---

### Pitfall 5: NPC Agent Cascade Loops

**What goes wrong:** NPC A takes an action (attacks player). This triggers an event. NPC B (ally of player) reacts to the event. NPC B's action triggers another event. NPC C reacts. The chain continues until you hit a recursion limit or the system hangs. Alternatively: a single NPC gets stuck in a behavioral loop (go to market, buy food, go home, go to market, buy food...) consuming LLM calls endlessly.

**Why it happens:** Each NPC agent is an independent LLM call with its own goals. There's no global arbiter saying "enough actions this tick." If NPC actions trigger events that trigger other NPC reactions within the same tick, you get unbounded recursion. The Stanford Generative Agents paper solved this with strict turn ordering, but that's easy to forget when implementing.

**Consequences:** API cost explosion (each NPC action is an LLM call). Latency explosion (player waits while 5 NPCs resolve a chain). Infinite loops if not caught. Nonsensical narrative ("the merchant attacks the guard who alerts the captain who confronts the merchant who attacks the guard...").

**Prevention:**
1. **Strict tick ordering.** Process NPCs sequentially within a tick: Player action -> State update -> Each NPC gets *one* action -> State update -> Narration. No NPC reacts to another NPC's action within the same tick. Reactions happen on the *next* tick.
2. **Action budget per tick.** Each NPC gets exactly 1 action per tick. No chain reactions within a tick.
3. **Circuit breaker.** If more than N NPC actions occur in a single tick processing cycle, halt and log an error. N should be (number of NPCs in scene + 1).
4. **Deduplication.** Track NPC actions over the last 3 ticks. If an NPC repeats the exact same action 3 times, force a different action or skip their turn.
5. **Only process present NPCs.** Only NPCs in the player's current location get individual LLM calls. Off-screen NPCs are batch-processed every N ticks (already planned). This caps the per-tick LLM call count.
6. **Global NPC action timeout.** If all NPC processing for a tick takes >10 seconds, abort remaining NPCs and proceed to narration.

**Detection:** Log NPC action counts per tick. Alert if any tick has >2x the expected number of NPC actions. Log repeated actions per NPC.

**Phase:** NPC Agent System. Critical to get right from day one — a loop bug in NPC agents will burn API credits fast.

**Confidence:** HIGH — confirmed by HuggingFace RPG agents blog ("agents get stuck in loops"), the Intra project ("lunchtime conversations get out of hand when every NPC gets a turn"), and general multi-agent systems literature on cascade failures.

---

## Moderate Pitfalls

### Pitfall 6: NPC Personality Drift and Flattening

**What goes wrong:** After 20+ turns, NPCs start sounding the same. The gruff mercenary and the shy healer both speak in generic LLM prose. Worse: an NPC's personality shifts between turns because the Storyteller doesn't have enough context about that NPC's character to maintain consistency.

**Why it happens:** NPC persona descriptions get compressed or pruned from the prompt as the token budget fills up. The Storyteller sees tags and beliefs but not the NPC's voice, speech patterns, or detailed personality. Over long sessions, the model defaults to its trained "helpful assistant" tone for all characters.

**Prevention:**
1. **Persona in system prompt, not context.** Keep 1-2 sentence voice/speech-pattern notes per NPC in the scene as part of the system-level instructions, not the context section. System instructions get higher attention weight.
2. **Dialogue examples.** Include 1-2 example dialogue lines per NPC in their persona data. The Storyteller mimics these patterns.
3. **Reflection-driven belief updates.** When the Reflection Agent synthesizes beliefs, it also updates the NPC's "current emotional state" tag, which the Storyteller uses for tone.
4. **Per-NPC temperature.** Consider slightly varying the temperature for different NPCs' dialogue to create voice variety (cautious NPC at 0.5, chaotic NPC at 0.9).

**Detection:** Periodic player feedback or automated analysis: run a classifier on NPC dialogue to measure distinctiveness. If two NPCs' dialogue samples are >85% similar in embedding space, they're flattening.

**Phase:** NPC Agent System + Prompt Assembly. Needs attention when building NPC agent prompts.

**Confidence:** MEDIUM — confirmed by HuggingFace RPG agents blog ("agents feel rather dry"), Intra project ("over-responsiveness"). NPC voice maintenance is a known challenge but solutions are empirical, not proven.

---

### Pitfall 7: Image Generation Blocking Gameplay

**What goes wrong:** Player takes an action. The system generates a narrative response AND requests an image (portrait, scene, location art). The image API takes 5-30 seconds. The player stares at a loading spinner. If the image API fails (timeout, rate limit, content filter), the entire turn hangs or errors out.

**Why it happens:** Image generation is 10-100x slower than text generation. Treating it as a synchronous part of the turn cycle blocks everything. Different image providers have wildly different latencies (local SD: 3-15s, fal.ai: 2-5s, DALL-E: 10-30s, ComfyUI: variable). Rate limits (5 images/minute on free tiers) create cascading delays.

**Prevention:**
1. **Fully async image generation.** Never block the turn on image generation. Return the narrative immediately. Fire image generation as a background task. When the image arrives, push it to the frontend via WebSocket and inject it into the narrative retroactively.
2. **Placeholder UI.** Show a subtle loading skeleton where the image will appear. If the image fails, show nothing (not an error). The game must be fully playable without images.
3. **Image queue with priority.** Queue image requests. Portraits of new NPCs get high priority. Scene illustrations get low priority. Don't queue more than 3 images at once.
4. **Caching.** Cache generated images keyed by (entity ID + relevant tags). If the player revisits a location, reuse the cached image. NPC portraits are generated once and cached forever.
5. **Rate limit awareness.** Track provider rate limits. When approaching the limit, skip non-essential image generation silently.
6. **Graceful degradation as default.** Image generation is an enhancement, not a requirement. The game must work perfectly with zero images. Test without image generation enabled.

**Detection:** Log image generation latency per provider. Alert if average exceeds 10 seconds. Track failure rates per provider.

**Phase:** Image Generation. Must be designed as async from the start — retrofitting async onto a synchronous pipeline is a major refactor.

**Confidence:** HIGH — well-understood problem. OpenAI rate limit documentation, fal.ai queue/webhook pattern, and general API integration best practices.

---

### Pitfall 8: Episodic Memory Overhead and Retrieval Noise

**What goes wrong:** Embedding every turn's events into LanceDB adds latency to each turn (embedding API call + vector write). Over a long campaign (200+ turns), the vector table grows large, and retrieval returns increasingly irrelevant memories. The composite score (sim*0.4 + rec*0.3 + imp*0.3) still surfaces old, low-importance events that waste prompt tokens. Embedding costs accumulate.

**Why it happens:** Naively embedding every event treats all events equally. Trivial actions ("you walk to the door") get embedded alongside critical moments ("the king is assassinated"). The importance score helps but is itself an LLM call (cost + latency). Recency decay parameters need tuning — too aggressive and long-term memory is lost, too gentle and old noise dominates.

**Prevention:**
1. **Importance threshold for embedding.** Only embed events with importance >= 3. Trivial events (importance 1-2) are kept in the conversation window but not persisted to vector memory. This cuts embedding volume by ~50%.
2. **Batch importance scoring.** Don't call the LLM for importance on every event. Batch 3-5 events per scoring call. Or use a heuristic: events involving HP changes, NPC relationship changes, or chronicle entries are auto-scored 5+. Small talk is auto-scored 1.
3. **Retrieval result filtering.** After composite scoring, apply a minimum score threshold. Don't inject memories with a composite score below 0.3 into the prompt — they're noise.
4. **Embedding reuse.** If the Embedder role is OpenRouter/remote, batch embed multiple events in a single API call. Most embedding APIs support batch input.
5. **LanceDB compaction.** LanceDB uses Lance format which supports compaction. Run `table.compact_files()` periodically (every 50 turns) to maintain read performance.
6. **Recency decay tuning.** Implement recency as an exponential decay with a configurable half-life. Start with half-life = 20 turns. Too short and the game forgets. Too long and old memories crowd out recent ones.

**Detection:** Log embedding latency, retrieval latency, and number of results per query. Track memory table size over time. If retrieval latency exceeds 200ms, investigate.

**Phase:** Episodic Memory. Design the filtering/threshold system alongside the embedding pipeline, not after.

**Confidence:** MEDIUM — LanceDB itself handles scale well (confirmed: 25ms search latency even at large scale). The risk is in the ingestion overhead and retrieval quality, which are application-level concerns. Stanford Generative Agents paper provides the pattern but doesn't report scaling numbers for text RPGs specifically.

---

### Pitfall 9: WorldBook Import Pollution

**What goes wrong:** SillyTavern WorldBook/Lorebook files contain entries designed for a different system. Many entries are: (a) prompt-engineering instructions ("Always describe X in detail"), not lore; (b) character-specific behavioral rules irrelevant to our tag system; (c) duplicates of information already in character cards; (d) entries with activation triggers (regex/keywords) that have no equivalent in our retrieval system; (e) NSFW content the user doesn't want; (f) entries so vague they match everything in vector search, polluting every retrieval.

**Why it happens:** SillyTavern WorldBooks are designed for keyword-triggered injection into a chat prompt. They're not a clean knowledge base. Authors mix lore (facts about the world) with instructions (how the LLM should behave) with character notes (NPC dialogue patterns). Our system treats all lore cards equally in vector search, so bad cards pollute good retrieval.

**Prevention:**
1. **LLM-powered classification on import.** Run each WorldBook entry through the Generator LLM with a classification prompt: "Is this entry (a) world lore/fact, (b) character description, (c) behavioral instruction, (d) junk/duplicate? Return category and cleaned text." Only import (a) and (b). Discard (c) and (d).
2. **Entity type separation.** Route character entries to NPC creation, location entries to the location graph, faction entries to factions. Don't dump everything into lore cards.
3. **Preview before import.** Show the user a classified list: "Found 45 entries: 20 lore, 10 characters, 8 instructions (will be skipped), 7 junk (will be skipped)." Let the user review and deselect individual entries.
4. **Quality threshold.** After LLM classification, score each entry for relevance to the current world premise (0-10). Entries below 3 get flagged for review.
5. **Deduplication.** Before inserting, check vector similarity against existing lore cards. If a new entry is >0.9 similar to an existing one, skip it or let the user choose.

**Detection:** After import, run a test retrieval query with a generic prompt. If the same WorldBook entries appear in >50% of retrieval results, they're too vague and are polluting the search space.

**Phase:** WorldBook Import. The classification system must be built before the import feature, not bolted on after users complain about bad lore.

**Confidence:** MEDIUM — SillyTavern WorldBook format is documented but the quality/cleanliness of real-world WorldBooks varies wildly. The cleanup problem is confirmed by SillyTavern community discussions about lorebook management difficulties, but the specific solutions (LLM classification) are untested at scale.

---

### Pitfall 10: World Engine Faction Ticks Creating Invisible Chaos

**What goes wrong:** The World Engine runs faction macro-ticks every N days. Faction A conquers a location. Faction B loses territory. Location tags change. But the player is elsewhere and has no way to learn about these changes. When they arrive at the changed location, the narrative contradicts their expectations. Or worse: faction actions create logical impossibilities (Faction A controls a city that was destroyed 3 ticks ago).

**Why it happens:** Faction ticks run as batch LLM calls without full state validation. The LLM generates plausible-sounding faction actions that may contradict the actual game state (e.g., using resources it doesn't have, taking territory that's already claimed). Information flow to the player relies on NPCs/chronicle, but if the player hasn't checked those, they're blindsided.

**Prevention:**
1. **State validation after faction ticks.** After each faction action, validate the outcome against the DB: Does the faction actually control the claimed territory? Are the resources available? Reject invalid actions and re-prompt.
2. **Information delivery.** When the player enters a location affected by faction changes, inject a "you notice" block into the next narration: "The imperial banners that once flew here have been replaced with rebel colors." Don't assume the player reads the chronicle.
3. **Faction action constraints.** Only allow faction actions involving locations/resources the faction actually controls (per the DB). Inject this constraint into the World Engine prompt.
4. **Chronicle as notification.** Push new chronicle entries to the frontend as notifications (subtle, non-blocking). The player can choose to read them or not, but they're aware things are happening.
5. **Tick frequency limiting.** Don't run faction ticks too often. Every 10-20 in-game days is sufficient. More frequent ticks create too much world churn and too many LLM calls.

**Detection:** After each faction tick, run a consistency check: are all faction territory claims valid? Do location tags match faction ownership? Log inconsistencies.

**Phase:** World Engine. Must include state validation from the first implementation.

**Confidence:** MEDIUM — this is a design problem more than a technical one. No direct prior art found for LLM-driven faction simulation pitfalls specifically, but the general pattern of "batch AI updates creating inconsistencies" is well-understood in game development.

---

## Minor Pitfalls

### Pitfall 11: Checkpoint/Save System Complexity with Vector DB

**What goes wrong:** Saving a checkpoint requires snapshotting both SQLite (trivial — copy file) and LanceDB (non-trivial — it's a directory of Arrow/IPC files with internal state). If the snapshot is taken mid-write, the LanceDB copy may be corrupted. Loading a checkpoint requires replacing both databases atomically.

**Prevention:**
1. **Flush and compact LanceDB before snapshot.** Call `table.compact_files()` before copying the vectors directory.
2. **Copy-on-write snapshot.** Copy both `state.db` and `vectors/` directory to a timestamped subdirectory within the campaign folder. Use filesystem-level copy, not streaming.
3. **Atomic restore.** When loading a checkpoint, replace both files atomically (rename, not copy-then-delete). Close all connections first.
4. **Test restore on every save.** After creating a checkpoint, verify the saved files can be opened. A corrupt save is worse than no save.

**Phase:** Save/Load/Checkpoints.

**Confidence:** MEDIUM — LanceDB documentation mentions compaction but doesn't specifically address snapshot safety. SQLite checkpoint is well-understood.

---

### Pitfall 12: Multiple LLM Calls Per Turn Latency

**What goes wrong:** A single player turn requires: (1) Oracle call for probability, (2) Storyteller call for narration with tool calling (possibly multi-step), (3) NPC agent calls for present NPCs, (4) importance scoring for episodic memory, (5) possibly Reflection for NPCs over threshold. Total: 3-8 LLM calls per turn. At 1-3 seconds per call, the player waits 5-20 seconds for a single turn.

**Prevention:**
1. **Parallelize where possible.** After Oracle resolves, NPC decisions and importance scoring can run in parallel with Storyteller narration (Storyteller is streaming, so start other calls while it streams).
2. **Batch NPC processing.** If 3 NPCs are present, batch their decisions into a single LLM call with structured output for all three, rather than 3 separate calls.
3. **Defer non-critical calls.** Importance scoring and reflection can happen *after* the response is sent to the player. Queue them as background tasks.
4. **Show streaming progress.** The player sees the Storyteller's response streaming in real-time. Even if post-processing takes another 2 seconds, the perceived latency is just the Storyteller's first-token time.
5. **Use fast models for Judge role.** Oracle, NPC decisions, importance scoring, and reflection all use the Judge role — a fast/cheap model. Only the Storyteller needs a flagship model.

**Phase:** Turn Cycle / Game Engine. Design the parallel execution pipeline early.

**Confidence:** HIGH — this is straightforward performance engineering. The existing architecture (separate Judge/Storyteller roles) is already set up for this.

---

### Pitfall 13: LLM Information Leakage (Spoilers)

**What goes wrong:** The Storyteller reveals information the player shouldn't know yet. If the prompt contains NPC goals/beliefs (for the NPC to act on), the Storyteller may narrate those thoughts as exposition: "The merchant secretly plans to betray you." Or: the Oracle knows an item is in the next room (from lore cards) and hints at it in the reasoning.

**Prevention:**
1. **Separate NPC state from Storyteller prompt.** NPC goals/beliefs go into the NPC Agent prompt, not the Storyteller prompt. The Storyteller only gets: NPC name, visible tags, relationship to player, current dialogue/action (the NPC Agent's output).
2. **Oracle reasoning is internal.** Never show Oracle reasoning to the Storyteller. The Storyteller receives only the outcome tier (Strong Hit / Weak Hit / Miss), not the chance% or reasoning.
3. **Lore card scoping.** Only inject lore cards relevant to what the player has *encountered* or is *currently interacting with*. Don't inject "the ancient tomb contains a cursed amulet" if the player hasn't found the tomb yet.

**Phase:** Prompt Assembly. Must be considered when designing the prompt structure for each role.

**Confidence:** MEDIUM — confirmed by the Intra project as a real concern ("spoiler occurs when an LLM agent reveals information before it should be revealed"). Solutions are architectural, not deeply technical.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Probability Oracle | Inconsistent probabilities for same action (Pitfall 2) | Structured input, temp 0, clamping, ruling cache |
| Turn Cycle / Game Engine | Token budget explosion (Pitfall 3), multi-call latency (Pitfall 12) | Budget system first, parallel execution pipeline |
| Storyteller Tool Calling | Invalid args crash streaming (Pitfall 4), state desync (Pitfall 1) | Minimal schemas, error recovery, post-narration audit |
| NPC Agent System | Cascade loops (Pitfall 5), personality drift (Pitfall 6) | Strict tick ordering, action budget, persona in system prompt |
| Episodic Memory | Embedding overhead, retrieval noise (Pitfall 8) | Importance threshold, batch scoring, retrieval filtering |
| World Engine | Invisible chaos from faction ticks (Pitfall 10) | State validation, information delivery, action constraints |
| Image Generation | Blocking gameplay (Pitfall 7) | Fully async, placeholder UI, queue with priority |
| WorldBook Import | Lore pollution from junk entries (Pitfall 9) | LLM classification, preview UI, deduplication |
| Save/Checkpoints | LanceDB snapshot corruption (Pitfall 11) | Flush/compact before copy, atomic restore |
| Prompt Assembly | Information leakage/spoilers (Pitfall 13), token budget (Pitfall 3) | Role-scoped prompts, budget system |

## Sources

- [RPGBENCH: Evaluating LLMs as RPG Engines](https://arxiv.org/abs/2502.00595) — LLM consistency failures with game mechanics
- [You Have Thirteen Hours (Function Calling for AI GMs)](https://arxiv.org/html/2409.06949v1) — State desync, dice roll deadlock, excessive/insufficient tool calls
- [LLM RPG Agent Experiment (HuggingFace)](https://huggingface.co/blog/neph1/rpg-llm-agents) — NPC loops, personality flatness, tool calling failures
- [Intra: Design Notes on an LLM Text Adventure](https://ianbicking.org/blog/2025/07/intra-llm-text-adventure) — Ground truth vs. narrative, NPC over-responsiveness, info leakage
- [Vercel AI SDK: Invalid Tool Calls Discussion #1905](https://github.com/vercel/ai/discussions/1905) — Zod validation crashes in streaming
- [Context Window Overflow (Redis)](https://redis.io/blog/context-window-overflow/) — Token budget management strategies
- [LanceDB Benchmarks](https://docs.lancedb.com/enterprise/benchmark/benchmark) — Vector search performance at scale
- [SillyTavern World Info Docs](https://docs.sillytavern.app/usage/core-concepts/worldinfo/) — WorldBook format and activation system
